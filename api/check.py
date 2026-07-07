"""Type-check endpoint for the tysql playground.

POST /api/check  {"code": "<python source>"}  ->  diagnostics JSON
GET  /api/check                               ->  version / health JSON

Runs the PEP 827 mypy fork (mypy-typemap) in-process on the posted snippet,
with tysql importable from site-packages — the same check `tysql check` does.
mypy only *parses* the snippet, it never executes it, so no sandbox is needed
beyond the serverless isolation Vercel already provides.

`python api/check.py` serves the same handler on 127.0.0.1:5328 for local dev
(next.config.ts rewrites /api/* there under `next dev`).
"""

import json
import os
import re
import shutil
import tarfile
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from importlib.metadata import PackageNotFoundError, distribution, version
from importlib.util import find_spec
from pathlib import Path

from mypy import api as mypy_api

MAX_CODE_BYTES = 64 * 1024

# Persist the mypy cache across warm invocations; only /tmp is writable on Vercel.
_CACHE_DIR = Path(tempfile.gettempdir()) / "tysql-playground-mypy-cache"

# Every snippet is checked at this one fixed path (guarded by _MYPY_LOCK): mypy's
# cache records the path of the first run and replays it verbatim on cache hits,
# so per-request temp dirs would leak stale paths into the output.
_WORKDIR = Path(tempfile.gettempdir()) / "tysql-playground-work"
_SNIPPET = _WORKDIR / "main.py"

_MYPY_FLAGS = [
    "--show-error-codes",
    "--show-column-numbers",
    "--no-color-output",
    "--no-error-summary",
    "--hide-error-context",
    # Diagnostics inside tysql/typemap themselves are noise to a playground
    # user; keep the output scoped to the snippet.
    "--follow-imports",
    "silent",
    "--cache-dir",
    str(_CACHE_DIR),
]

# path[:line[:col]]: severity: message [code] — line/col/code may each be absent
# (file-level errors carry no position; notes carry no code).
_DIAG_RE = re.compile(
    r"^main\.py(?::(?P<line>\d+)(?::(?P<col>\d+))?)?: (?P<severity>error|warning|note): "
    r"(?P<message>.*?)(?:  \[(?P<code>[a-z0-9-]+)\])?$"
)

# Concurrent checks in one warm instance would race on the shared cache dir.
_MYPY_LOCK = threading.Lock()

# Marker file only the fork's bundled typeshed ships (same check as tysql.cli).
_FORK_MARKER = Path("typeshed", "stdlib", "_typeshed", "typemap.pyi")

# Vercel's Python bundler strips *.pyi from vendored dependencies
# (shouldStripVendorFile in vercel/vercel packages/python), which deletes the
# fork's entire typeshed and crashes mypy on startup. Workaround: ship typeshed
# as a tarball (not stripped — it isn't a .pyi) and extract it to /tmp on cold
# start, then run mypy with --custom-typeshed-dir. Regenerate after fork
# typeshed changes:  tar -czf api/typeshed.tar.gz \
#   -C .venv/lib/python3.14/site-packages/mypy typeshed
_VENDORED_TYPESHED = Path(__file__).parent / "typeshed.tar.gz"
_EXTRACTED_TYPESHED = Path(tempfile.gettempdir()) / "tysql-playground-typeshed"

# The same Vercel stripping removes py.typed from tysql/typemap/
# typemap_extensions, so mypy would ignore their inline types (PEP 561). Their
# .py files survive, though — mirror the packages to /tmp, restore py.typed,
# and serve them via MYPYPATH.
_DEPS_DIR = Path(tempfile.gettempdir()) / "tysql-playground-deps"
_TYPED_DEPS = ("tysql", "typemap", "typemap_extensions")

# typemap_extensions' entire typed interface is its __init__.pyi (stripped by
# Vercel along with the rest). It is a stable one-line re-export of the fork
# typeshed's _typeshed/typemap.pyi, so recreate it in the mirror.
_STRIPPED_STUBS = {
    "typemap_extensions": {"__init__.pyi": "from _typeshed.typemap import *\n"},
}

_typeshed_flags_cache: list[str] | None = None


def _mypy_dir() -> Path | None:
    spec = find_spec("mypy")
    if spec is None or spec.origin is None:
        return None
    return Path(spec.origin).parent


def _typeshed_flags() -> list[str]:
    """Extra mypy flags that restore typeshed when the installed one is gone."""
    global _typeshed_flags_cache
    if _typeshed_flags_cache is not None:
        return _typeshed_flags_cache
    flags: list[str] = []
    mypy_dir = _mypy_dir()
    installed_ok = mypy_dir is not None and (mypy_dir / _FORK_MARKER).is_file()
    if not installed_ok and _VENDORED_TYPESHED.is_file():
        root = _EXTRACTED_TYPESHED / "typeshed"
        if not (root / "stdlib" / "_typeshed" / "typemap.pyi").is_file():
            _EXTRACTED_TYPESHED.mkdir(parents=True, exist_ok=True)
            with tarfile.open(_VENDORED_TYPESHED) as tf:
                tf.extractall(_EXTRACTED_TYPESHED, filter="data")
        if (root / "stdlib" / "_typeshed" / "typemap.pyi").is_file():
            flags = ["--custom-typeshed-dir", str(root)]
    _restore_py_typed()
    _typeshed_flags_cache = flags
    return flags


def _restore_py_typed() -> None:
    """Mirror typed deps whose py.typed marker was stripped into MYPYPATH."""
    mirrored = False
    for pkg in _TYPED_DEPS:
        spec = find_spec(pkg)
        if spec is None or spec.origin is None:
            continue
        src = Path(spec.origin).parent
        if (src / "py.typed").is_file():
            continue  # intact install (local dev) — mypy can use it in place
        dst = _DEPS_DIR / pkg
        if not dst.is_dir():
            shutil.copytree(src, dst, ignore=shutil.ignore_patterns("__pycache__"))
        for stub_name, stub_source in _STRIPPED_STUBS.get(pkg, {}).items():
            stub = dst / stub_name
            if not stub.is_file():
                stub.write_text(stub_source, encoding="utf-8")
        (dst / "py.typed").touch()
        mirrored = True
    if mirrored:
        os.environ["MYPYPATH"] = str(_DEPS_DIR)


def _is_fork() -> bool:
    """True when the fork's typeshed is available — installed or vendored."""
    mypy_dir = _mypy_dir()
    if mypy_dir is not None and (mypy_dir / _FORK_MARKER).is_file():
        return True
    return bool(_typeshed_flags())


def _pkg_version(name: str) -> str | None:
    try:
        return version(name)
    except PackageNotFoundError:
        return None


def _pkg_commit(name: str) -> str | None:
    """Git commit pip resolved for a `pkg @ git+...` requirement, if any."""
    try:
        raw = distribution(name).read_text("direct_url.json")
    except PackageNotFoundError:
        return None
    if not raw:
        return None
    try:
        commit = json.loads(raw).get("vcs_info", {}).get("commit_id")
    except json.JSONDecodeError:
        return None
    return commit if isinstance(commit, str) else None


def _versions() -> dict[str, object]:
    return {
        "tysql": _pkg_version("tysql"),
        "tysql_commit": _pkg_commit("tysql"),
        "typemap": _pkg_version("python-typemap"),
        "mypy": _pkg_version("mypy"),
        "fork": _is_fork(),
    }


def run_check(code: str) -> dict[str, object]:
    started = time.monotonic()
    with _MYPY_LOCK:
        _WORKDIR.mkdir(parents=True, exist_ok=True)
        _SNIPPET.write_text(code, encoding="utf-8")
        stdout, stderr, exit_code = mypy_api.run(
            [*_MYPY_FLAGS, *_typeshed_flags(), str(_SNIPPET)]
        )
    duration_ms = int((time.monotonic() - started) * 1000)

    # mypy echoes the path it was given; report the snippet as plain `main.py`.
    stdout = stdout.replace(str(_SNIPPET), "main.py")
    stderr = stderr.replace(str(_SNIPPET), "main.py")

    n_lines = code.count("\n") + 1
    diagnostics = []
    for raw_line in stdout.splitlines():
        match = _DIAG_RE.match(raw_line)
        if match:
            line = int(match["line"]) if match["line"] else None
            col = int(match["col"]) if match["col"] else None
            # The fork sometimes attributes a combinator error to a position past
            # the end of the snippet; demote those to file-level diagnostics.
            if line is not None and line > n_lines:
                line = col = None
            diagnostics.append(
                {
                    "line": line,
                    "col": col,
                    "severity": match["severity"],
                    "message": match["message"],
                    "code": match["code"],
                }
            )

    # The fork can emit the same combinator error twice: once positioned, once
    # file-level. Keep the positioned one only.
    positioned = {
        (d["severity"], d["message"], d["code"]) for d in diagnostics if d["line"] is not None
    }
    diagnostics = [
        d
        for d in diagnostics
        if d["line"] is not None
        or (d["severity"], d["message"], d["code"]) not in positioned
    ]

    return {
        "exit_code": exit_code,
        "duration_ms": duration_ms,
        "stdout": stdout,
        "stderr": stderr,
        "diagnostics": diagnostics,
        "versions": _versions(),
    }


class handler(BaseHTTPRequestHandler):  # noqa: N801 — Vercel requires this name
    def _reply(self, status: int, payload: dict[str, object]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        payload: dict[str, object] = {"ok": True, "versions": _versions()}
        # /api/check?debug=1 — remote diagnosis of the deployed environment:
        # is the fork's typeshed actually on disk, and does a trivial check run?
        if "debug" in (self.path.partition("?")[2] or ""):
            mypy_dir = _mypy_dir()
            typeshed = mypy_dir / "typeshed" if mypy_dir else None
            payload["debug"] = {
                "mypy_dir": str(mypy_dir),
                "marker_path": str(mypy_dir / _FORK_MARKER) if mypy_dir else None,
                "marker_exists": bool(mypy_dir and (mypy_dir / _FORK_MARKER).is_file()),
                "typeshed_exists": bool(typeshed and typeshed.is_dir()),
                "typeshed_pyi_count": (
                    sum(1 for _ in typeshed.rglob("*.pyi"))
                    if typeshed and typeshed.is_dir()
                    else 0
                ),
                "vendored_tarball": _VENDORED_TYPESHED.is_file(),
                "typeshed_flags": _typeshed_flags(),
                "self_check": run_check("x: int = 1\nreveal_type(x)\n"),
            }
        self._reply(200, payload)

    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_CODE_BYTES:
            self._reply(413, {"error": f"snippet larger than {MAX_CODE_BYTES // 1024} KiB"})
            return
        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
            code = payload["code"]
            if not isinstance(code, str):
                raise TypeError
        except (json.JSONDecodeError, KeyError, TypeError):
            self._reply(400, {"error": 'expected JSON body {"code": "<python source>"}'})
            return
        if len(code.encode("utf-8")) > MAX_CODE_BYTES:
            self._reply(413, {"error": f"snippet larger than {MAX_CODE_BYTES // 1024} KiB"})
            return
        try:
            self._reply(200, run_check(code))
        except Exception as exc:  # surface unexpected failures as JSON, not a 502
            self._reply(500, {"error": f"{type(exc).__name__}: {exc}"})

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002
        pass  # keep function logs to actual errors


if __name__ == "__main__":
    print("tysql playground api: http://127.0.0.1:5328/api/check")
    ThreadingHTTPServer(("127.0.0.1", 5328), handler).serve_forever()

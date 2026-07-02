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
import re
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from importlib.metadata import PackageNotFoundError, version
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


def _is_fork() -> bool:
    spec = find_spec("mypy")
    if spec is None or spec.origin is None:
        return False
    return (Path(spec.origin).parent / _FORK_MARKER).is_file()


def _pkg_version(name: str) -> str | None:
    try:
        return version(name)
    except PackageNotFoundError:
        return None


def _versions() -> dict[str, object]:
    return {
        "tysql": _pkg_version("tysql"),
        "typemap": _pkg_version("python-typemap"),
        "mypy": _pkg_version("mypy"),
        "fork": _is_fork(),
    }


def run_check(code: str) -> dict[str, object]:
    started = time.monotonic()
    with _MYPY_LOCK:
        _WORKDIR.mkdir(parents=True, exist_ok=True)
        _SNIPPET.write_text(code, encoding="utf-8")
        stdout, stderr, exit_code = mypy_api.run([*_MYPY_FLAGS, str(_SNIPPET)])
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
        self._reply(200, {"ok": True, "versions": _versions()})

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

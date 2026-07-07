/* Executes playground snippets in Pyodide — real CPython 3.14 compiled to
 * WebAssembly — entirely inside this Web Worker. Nothing the snippet does can
 * reach the server; the page enforces a wall timeout by terminating the worker.
 *
 * Boot happens once per worker (≈20 MB download on first use, then HTTP-cached):
 * load Pyodide, micropip-install tysql (+ typing-extensions, which
 * python-typemap imports but does not declare yet), shim reveal_type.
 */

// Loaded as a module worker: some Chromium configurations reject synchronous
// cross-origin importScripts, while async import() is universally fine.
const PYODIDE_VERSION = "v314.0.2"; // CPython 3.14 — tysql requires >=3.14
const INDEX_URL = `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/`;

const SETUP = `
import builtins, typing
builtins.reveal_type = typing.reveal_type  # snippets call it bare, mypy-style


def _playground_cap(out):
    if len(out) > 64_000:
        out = out[:64_000] + "\\n… output truncated at 64 kB"
    return out


def _playground_run(code):
    import io, contextlib, traceback

    buf = io.StringIO()
    error = None
    with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
        try:
            exec(compile(code, "main.py", "exec"), {"__name__": "__main__"})
        except BaseException as e:
            tb = e.__traceback__
            if tb is not None and tb.tb_next is not None:
                tb = tb.tb_next  # drop this runner's own frame
            error = "".join(traceback.format_exception(type(e), e, tb))
    return _playground_cap(buf.getvalue()), error


_playground_pytest_seq = 0


def _playground_pytest(code):
    """Collect and run the snippet's test_* functions with pytest.

    A fresh directory per run sidesteps pytest's per-path import and
    assertion-rewrite caches; the module is un-imported afterwards so the
    next run re-collects fresh code.
    """
    import contextlib, io, os, sys

    import pytest

    global _playground_pytest_seq
    _playground_pytest_seq += 1
    root = f"/tmp/playground-tests/run{_playground_pytest_seq}"
    os.makedirs(root, exist_ok=True)
    path = os.path.join(root, "test_playground.py")
    with open(path, "w") as f:
        f.write(code)
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
        exit_code = pytest.main(["-q", "-p", "no:cacheprovider", "--rootdir", root, path])
    sys.modules.pop("test_playground", None)
    return _playground_cap(buf.getvalue()), int(exit_code)
`;

let bootPromise = null;

async function boot() {
  postMessage({ kind: "stage", stage: "download" });
  const { loadPyodide } = await import(`${INDEX_URL}pyodide.mjs`);
  const pyodide = await loadPyodide({ indexURL: INDEX_URL });
  postMessage({ kind: "stage", stage: "install" });
  await pyodide.loadPackage("micropip");
  const micropip = pyodide.pyimport("micropip");
  await micropip.install(["tysql", "typing-extensions", "pytest"]);
  micropip.destroy();
  pyodide.runPython(SETUP);
  return pyodide;
}

onmessage = async (event) => {
  const { id, code, mode } = event.data; // mode: "exec" | "pytest"
  try {
    bootPromise ??= boot();
    const pyodide = await bootPromise;
    postMessage({ kind: "stage", stage: "run" });
    const started = performance.now();
    const isPytest = mode === "pytest";
    const run = pyodide.globals.get(
      isPytest ? "_playground_pytest" : "_playground_run",
    );
    const proxy = run(code);
    const [output, second] = proxy.toJs();
    proxy.destroy();
    run.destroy();
    postMessage({
      kind: "result",
      id,
      output: output ?? "",
      // exec returns (output, traceback|None); pytest returns (output, exit code)
      error: isPytest ? null : (second ?? null),
      pytestExit: isPytest ? second : null,
      durationMs: Math.round(performance.now() - started),
    });
  } catch (err) {
    postMessage({
      kind: "fatal",
      id,
      message: err instanceof Error ? err.message : String(err),
    });
  }
};

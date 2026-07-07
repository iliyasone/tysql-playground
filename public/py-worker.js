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
    out = buf.getvalue()
    if len(out) > 64_000:
        out = out[:64_000] + "\\n… output truncated at 64 kB"
    return out, error
`;

let bootPromise = null;

async function boot() {
  postMessage({ kind: "stage", stage: "download" });
  const { loadPyodide } = await import(`${INDEX_URL}pyodide.mjs`);
  const pyodide = await loadPyodide({ indexURL: INDEX_URL });
  postMessage({ kind: "stage", stage: "install" });
  await pyodide.loadPackage("micropip");
  const micropip = pyodide.pyimport("micropip");
  await micropip.install(["tysql", "typing-extensions"]);
  micropip.destroy();
  pyodide.runPython(SETUP);
  return pyodide;
}

onmessage = async (event) => {
  const { id, code } = event.data;
  try {
    bootPromise ??= boot();
    const pyodide = await bootPromise;
    postMessage({ kind: "stage", stage: "run" });
    const started = performance.now();
    const run = pyodide.globals.get("_playground_run");
    const proxy = run(code);
    const [output, error] = proxy.toJs();
    proxy.destroy();
    run.destroy();
    postMessage({
      kind: "result",
      id,
      output: output ?? "",
      error: error ?? null, // Python None arrives as undefined
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

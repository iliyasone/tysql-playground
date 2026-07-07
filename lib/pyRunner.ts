"use client";

// Client for public/py-worker.js — snippets execute in Pyodide (CPython 3.14 →
// WebAssembly) inside a Web Worker, never on the server. The worker persists
// across runs so the ~20 MB runtime downloads once; a hung run is handled by
// terminating the worker (the only reliable way to stop synchronous Python).

export type ExecStage = "download" | "install" | "run";
export type ExecMode = "exec" | "pytest";

/** tysql / typemap resolved in the Pyodide runtime (PyPI), reported by the
 * worker after boot. Either field may be null if metadata lookup failed. */
export interface RuntimeVersions {
  tysql: string | null;
  typemap: string | null;
}

export interface ExecResult {
  output: string;
  /** Formatted traceback when the snippet raised; null on a clean run. */
  error: string | null;
  /** pytest exit code (0 = all passed) when run in pytest mode; else null. */
  pytestExit: number | null;
  /** Package versions from the browser runtime; null if unavailable. */
  versions: RuntimeVersions | null;
  durationMs: number;
}

const RUN_TIMEOUT_MS = 20_000;

let worker: Worker | null = null;
let nextId = 1;

export class PyRunError extends Error {}

export function runPython(
  code: string,
  onStage: (stage: ExecStage) => void,
  mode: ExecMode = "exec",
): Promise<ExecResult> {
  const id = nextId++;
  worker ??= new Worker("/py-worker.js", { type: "module" });
  const w = worker;

  return new Promise<ExecResult>((resolve, reject) => {
    let timeout: number | undefined;

    const cleanup = () => {
      window.clearTimeout(timeout);
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
    };

    const fail = (message: string, killWorker: boolean) => {
      cleanup();
      if (killWorker) {
        w.terminate();
        if (worker === w) worker = null; // next run boots a fresh worker
      }
      reject(new PyRunError(message));
    };

    const onMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.kind === "stage") {
        onStage(msg.stage);
        if (msg.stage === "run") {
          // The wall clock starts only once booted — downloads don't count.
          timeout = window.setTimeout(
            () =>
              fail(
                `Run exceeded ${RUN_TIMEOUT_MS / 1000}s and was stopped (the Python runtime was discarded).`,
                true,
              ),
            RUN_TIMEOUT_MS,
          );
        }
        return;
      }
      if (msg.id !== id) return;
      cleanup();
      if (msg.kind === "result") {
        resolve({
          output: msg.output,
          error: msg.error,
          pytestExit: msg.pytestExit ?? null,
          versions: msg.runtimeVersions ?? null,
          durationMs: msg.durationMs,
        });
      } else {
        fail(`Python runtime failed: ${msg.message}`, true);
      }
    };

    const onError = (event: ErrorEvent) => {
      fail(`Python worker crashed: ${event.message || "unknown error"}`, true);
    };

    w.addEventListener("message", onMessage);
    w.addEventListener("error", onError);
    w.postMessage({ id, code, mode });
  });
}

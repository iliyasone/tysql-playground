"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from "lz-string";
import { EXAMPLES, DEFAULT_EXAMPLE_ID, type Example } from "@/lib/examples";
import {
  checkCode,
  getHealth,
  type Diagnostic,
  type Versions,
} from "@/lib/api";
import Header from "@/components/Header";
import Editor, { type EditorHandle } from "@/components/Editor";
import ResultsPanel, { type RunState } from "@/components/ResultsPanel";
import StatusBar from "@/components/StatusBar";

const DEFAULT_EXAMPLE: Example =
  EXAMPLES.find((e) => e.id === DEFAULT_EXAMPLE_ID) ?? EXAMPLES[0];

function readHashCode(): string | null {
  if (typeof window === "undefined") return null;
  const match = window.location.hash.match(/(?:^#|&)code=([^&]+)/);
  if (!match) return null;
  try {
    return decompressFromEncodedURIComponent(match[1]) || null;
  } catch {
    return null;
  }
}

export default function Home() {
  // Deterministic first render (default example) → hash applied after mount,
  // so hydration never mismatches.
  const [code, setCode] = useState(DEFAULT_EXAMPLE.code);
  const [exampleId, setExampleId] = useState(DEFAULT_EXAMPLE.id);
  const [run, setRun] = useState<RunState>({ status: "idle" });
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [versions, setVersions] = useState<Versions | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [copied, setCopied] = useState(false);

  const editorRef = useRef<EditorHandle>(null);
  const inFlight = useRef<AbortController | null>(null);
  // Latest code, read inside the (stable) run handler without re-creating it.
  const codeRef = useRef(code);
  useEffect(() => {
    codeRef.current = code;
  }, [code]);

  const selectedExample = useMemo(
    () => EXAMPLES.find((e) => e.id === exampleId),
    [exampleId],
  );

  // Apply a shared snippet from the URL hash, if present. Reading the hash is
  // only possible after mount, so deriving state here is intentional.
  useEffect(() => {
    const shared = readHashCode();
    if (shared !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCode(shared);
      setExampleId("");
    }
  }, []);

  // Fetch versions once for the status bar.
  useEffect(() => {
    const ac = new AbortController();
    getHealth(ac.signal)
      .then((h) => setVersions(h.versions))
      .catch(() => {
        /* footer just stays in "connecting" state */
      });
    return () => ac.abort();
  }, []);

  // Elapsed timer while a check is in flight (reset happens in runCheck).
  useEffect(() => {
    if (run.status !== "loading") return;
    const started = Date.now();
    const id = window.setInterval(() => setElapsed(Date.now() - started), 100);
    return () => window.clearInterval(id);
  }, [run.status]);

  const runCheck = useCallback(async () => {
    inFlight.current?.abort();
    const ac = new AbortController();
    inFlight.current = ac;
    setElapsed(0);
    setRun({ status: "loading" });
    try {
      const result = await checkCode(codeRef.current, ac.signal);
      if (ac.signal.aborted) return;
      setRun({ status: "done", result });
      setDiagnostics(result.diagnostics);
    } catch (err) {
      if (ac.signal.aborted) return;
      if (err instanceof DOMException && err.name === "AbortError") return;
      const message = err instanceof Error ? err.message : "Unexpected error.";
      setRun({ status: "error", message });
    }
  }, []);

  // Cmd/Ctrl+Enter runs from anywhere on the page; events originating inside
  // the editor are skipped — the CodeMirror keymap handles those, and skipping
  // avoids double runs.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key !== "Enter") return;
      if (event.target instanceof Element && event.target.closest(".cm-editor"))
        return;
      event.preventDefault();
      runCheck();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [runCheck]);

  const handleSelectExample = useCallback((id: string) => {
    const ex = EXAMPLES.find((e) => e.id === id);
    if (!ex) return;
    setExampleId(id);
    setCode(ex.code);
    setDiagnostics([]);
    setRun({ status: "idle" });
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const handleShare = useCallback(async () => {
    const encoded = compressToEncodedURIComponent(code);
    const url = `${window.location.origin}${window.location.pathname}#code=${encoded}`;
    window.history.replaceState(null, "", `#code=${encoded}`);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* clipboard may be unavailable; the URL is still updated */
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }, [code]);

  const handleSelectDiagnostic = useCallback((line: number, col: number) => {
    editorRef.current?.focusLine(line, col);
  }, []);

  const loading = run.status === "loading";
  const elapsedLabel =
    elapsed >= 1000 ? `${(elapsed / 1000).toFixed(1)}s` : `${elapsed}ms`;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header />

      <div className="grid min-h-0 flex-1 grid-rows-2 md:grid-cols-[minmax(0,1fr)_minmax(0,0.82fr)] md:grid-rows-1">
        {/* Editor pane */}
        <section className="flex min-h-0 flex-col border-b border-border md:border-b-0 md:border-r">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-bg-panel px-3 py-2">
            <label className="sr-only" htmlFor="example-select">
              Example
            </label>
            <select
              id="example-select"
              value={exampleId}
              onChange={(e) => handleSelectExample(e.target.value)}
              className="max-w-[52%] truncate rounded-md border border-border bg-bg-elevated px-2.5 py-1.5 text-xs text-text outline-none transition-colors hover:border-border-strong focus:border-accent"
            >
              {exampleId === "" && (
                <option value="" disabled>
                  Shared snippet
                </option>
              )}
              {EXAMPLES.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.title}
                </option>
              ))}
            </select>

            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={handleShare}
                className="rounded-md border border-border bg-bg-elevated px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:border-border-strong hover:text-text"
              >
                {copied ? "Copied ✓" : "Share"}
              </button>
              <button
                type="button"
                onClick={runCheck}
                disabled={loading}
                className="flex min-w-[104px] items-center justify-center gap-2 rounded-md bg-accent px-3.5 py-1.5 text-xs font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-70"
                title="Run type-check (⌘/Ctrl + Enter)"
              >
                {loading ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent-fg/40 border-t-accent-fg" />
                    <span className="tabular-nums">{elapsedLabel}</span>
                  </>
                ) : (
                  <>
                    Run
                    <span className="font-normal opacity-70">⌘↵</span>
                  </>
                )}
              </button>
            </div>

            {selectedExample && (
              <p className="w-full text-[11px] leading-snug text-text-faint">
                {selectedExample.blurb}
              </p>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-hidden bg-bg">
            <Editor
              ref={editorRef}
              value={code}
              onChange={setCode}
              diagnostics={diagnostics}
              onRun={runCheck}
            />
          </div>
        </section>

        {/* Results pane */}
        <section className="flex min-h-0 flex-col bg-bg-panel">
          <ResultsPanel run={run} onSelectDiagnostic={handleSelectDiagnostic} />
        </section>
      </div>

      <StatusBar versions={versions} run={run} />
    </div>
  );
}

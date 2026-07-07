"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from "lz-string";
import { EXAMPLES, DEFAULT_EXAMPLE_ID, type Example } from "@/lib/examples";
import { checkCode, getHealth, type Diagnostic, type Versions } from "@/lib/api";
import { runPython, PyRunError, type ExecMode } from "@/lib/pyRunner";
import { useTheme } from "@/lib/theme";
import Header, { type PlaygroundMode } from "@/components/Header";
import Editor, { type EditorHandle } from "@/components/Editor";
import ResultsPanel, {
  type ExecState,
  type RunState,
} from "@/components/ResultsPanel";
import StatusBar from "@/components/StatusBar";

const DEFAULT_EXAMPLE: Example =
  EXAMPLES.find((e) => e.id === DEFAULT_EXAMPLE_ID) ?? EXAMPLES[0];

const IMPORTS_TYSQL = /^\s*(from\s+tysql\b|import\s+tysql\b)/m;

// Three independent, composable "blocks" the snippet can opt into. Whichever
// markers are present decide what the primary action (⌘/Ctrl+Enter) runs.

//   pytest    — a `test_*` function → run pytest in the browser.
const HAS_PYTEST = /^\s*(async\s+)?def\s+test_?\w*\s*\(/m;

//   mypy      — a type-level assertion → type-check with the PEP 827 fork.
const HAS_MYPY_FIXTURES = /\b(reveal_type|assert_type|TYPE_CHECKING)\b/;

//   runtime   — a `if __name__ == "__main__":` guard → execute the script.
const HAS_MAIN = /^if\s+__name__\s*==\s*(['"])__main__\1\s*:/m;

// The metatypes test convention: module-level test_* / mypy_test_* functions.
// A test suite type-checks with the strict test-suite mypy flags (mypy_test_*
// are static-only, so this is broader than HAS_PYTEST).
const LOOKS_LIKE_TESTS = /^(async\s+)?def\s+(mypy_)?test_\w+/m;

// Persistence key, shared by both stores below.
//   sessionStorage — per-tab, authoritative for THIS page; survives refresh and
//     stays isolated when several links/tabs are open at once.
//   localStorage   — the last edit from any tab; only a fallback used to seed a
//     freshly-opened tab (or a reopened one after close).
const STORAGE_KEY = "tysql-playground:session";

interface Session {
  code: string;
  exampleId: string;
}

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

function readSession(store: Storage): Session | null {
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { code?: unknown; exampleId?: unknown };
    if (typeof parsed.code !== "string") return null;
    return {
      code: parsed.code,
      exampleId: typeof parsed.exampleId === "string" ? parsed.exampleId : "",
    };
  } catch {
    return null;
  }
}

// The initial snippet for this page: a shared link wins (and is cached), then
// this tab's own session, then the last edit from any tab, then the default.
function resolveInitialSession(): Session {
  const shared = readHashCode();
  if (shared !== null) {
    const session = { code: shared, exampleId: "" };
    writeSession(session);
    // Redirect to the clean site — the snippet now lives in cache, not the URL.
    window.history.replaceState(null, "", window.location.pathname);
    return session;
  }
  return (
    readSession(window.sessionStorage) ??
    readSession(window.localStorage) ?? {
      code: DEFAULT_EXAMPLE.code,
      exampleId: DEFAULT_EXAMPLE.id,
    }
  );
}

function writeSession(session: Session): void {
  const raw = JSON.stringify(session);
  try {
    window.sessionStorage.setItem(STORAGE_KEY, raw);
  } catch {
    /* private mode / quota — non-fatal */
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, raw);
  } catch {
    /* private mode / quota — non-fatal */
  }
}

function PlayGlyph() {
  return (
    <svg
      viewBox="0 0 12 12"
      width="10"
      height="10"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M2.5 1.2a.5.5 0 0 1 .755-.43l7.2 4.37a.5.5 0 0 1 0 .855l-7.2 4.37a.5.5 0 0 1-.755-.43V1.2Z" />
    </svg>
  );
}

// One of the three tool buttons. "armed" (accent-blue) means the snippet
// carries the construction this tool needs — a live preview of what
// ⌘/Ctrl+Enter will run. Clicking runs just this tool.
function ToolButton({
  label,
  title,
  armed,
  running,
  disabled,
  play,
  onClick,
}: {
  label: string;
  title: string;
  armed: boolean;
  running: boolean;
  disabled: boolean;
  play?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || running}
      title={armed ? `${title} — runs on ⌘/Ctrl + Enter` : title}
      aria-pressed={armed}
      className={
        "flex min-w-[74px] items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed " +
        (armed
          ? "bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-80"
          : "border border-border bg-bg-elevated text-text-muted hover:border-border-strong hover:text-text disabled:opacity-45")
      }
    >
      {running ? (
        <span
          className={
            "h-3.5 w-3.5 animate-spin rounded-full border-2 " +
            (armed
              ? "border-accent-fg/40 border-t-accent-fg"
              : "border-border-strong border-t-accent")
          }
        />
      ) : (
        play && <PlayGlyph />
      )}
      {label}
    </button>
  );
}

export default function Home() {
  // Deterministic first render (default example) → hash applied after mount,
  // so hydration never mismatches.
  const [code, setCode] = useState(DEFAULT_EXAMPLE.code);
  const [exampleId, setExampleId] = useState(DEFAULT_EXAMPLE.id);
  // Three independent result blocks — mypy, pytest, runtime — since a snippet
  // can carry all three kinds of fixture at once and each is run separately.
  const [check, setCheck] = useState<RunState>({ status: "idle" });
  const [pytest, setPytest] = useState<ExecState>({ status: "idle" });
  const [runtime, setRuntime] = useState<ExecState>({ status: "idle" });
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [versions, setVersions] = useState<Versions | null>(null);
  const [copied, setCopied] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [mode, setMode] = useState<PlaygroundMode>("tysql");
  const [theme, toggleTheme] = useTheme();
  // The editor mounts only once the initial (possibly cached) snippet is known,
  // so its document starts as that snippet with a clean undo history — Ctrl+Z
  // never rewinds past what was loaded into the page.
  const [ready, setReady] = useState(false);

  const editorRef = useRef<EditorHandle>(null);
  const shareRef = useRef<HTMLDivElement>(null);
  const inFlight = useRef<AbortController | null>(null);
  // Latest code, read inside the (stable) run handlers without re-creating them.
  const codeRef = useRef(code);
  useEffect(() => {
    codeRef.current = code;
  }, [code]);

  // tysql ↔ PEP 827 morph, debounced so the title doesn't flicker mid-keystroke.
  useEffect(() => {
    const id = window.setTimeout(
      () => setMode(IMPORTS_TYSQL.test(code) ? "tysql" : "pep827"),
      400,
    );
    return () => window.clearTimeout(id);
  }, [code]);

  // Resolve the initial snippet after mount (hash / storage are client-only, so
  // the first render is deterministic and hydration never mismatches). A shared
  // link is cached and stripped from the URL here.
  useEffect(() => {
    const session = resolveInitialSession();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCode(session.code);
    setExampleId(session.exampleId);
    setReady(true);
  }, []);

  // Mirror the working snippet into storage on every edit, so a refresh or
  // reopen keeps it. Skipped until the initial snippet is resolved, so the
  // placeholder default is never written over a real saved session.
  useEffect(() => {
    if (!ready) return;
    writeSession({ code, exampleId });
  }, [ready, code, exampleId]);

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

  const runCheck = useCallback(async () => {
    inFlight.current?.abort();
    const ac = new AbortController();
    inFlight.current = ac;
    setCheck({ status: "loading" });
    try {
      const result = await checkCode(codeRef.current, {
        test: LOOKS_LIKE_TESTS.test(codeRef.current),
        signal: ac.signal,
      });
      if (ac.signal.aborted) return;
      setCheck({ status: "done", result });
      setDiagnostics(result.diagnostics);
    } catch (err) {
      if (ac.signal.aborted) return;
      if (err instanceof DOMException && err.name === "AbortError") return;
      const message = err instanceof Error ? err.message : "Unexpected error.";
      setCheck({ status: "error", message });
    }
  }, []);

  // pytest and runtime share the single Pyodide worker; both go through this.
  const runExec = useCallback(
    async (mode: ExecMode, setState: (s: ExecState) => void) => {
      setState({ status: "loading", stage: "run" });
      try {
        const result = await runPython(
          codeRef.current,
          (stage) => setState({ status: "loading", stage }),
          mode,
        );
        setState({ status: "done", result });
      } catch (err) {
        const message =
          err instanceof PyRunError ? err.message : "Unexpected error.";
        setState({ status: "error", message });
      }
    },
    [],
  );
  const runPytest = useCallback(
    () => runExec("pytest", setPytest),
    [runExec],
  );
  const runRuntime = useCallback(
    () => runExec("exec", setRuntime),
    [runExec],
  );

  // Which of the three blocks the snippet opts into. mypy also covers test
  // suites (strict flags); when nothing at all is detected it's the fallback,
  // so ⌘/Ctrl+Enter always does something sensible.
  const pytestDetected = HAS_PYTEST.test(code);
  const runtimeDetected = HAS_MAIN.test(code);
  const mypyDetected = HAS_MYPY_FIXTURES.test(code) || LOOKS_LIKE_TESTS.test(code);

  // ⌘/Ctrl+Enter: run every tool the snippet calls for. The two browser
  // executions are sequenced because Pyodide is single-threaded; mypy runs on
  // the server in parallel.
  const runDetected = useCallback(async () => {
    const c = codeRef.current;
    const pt = HAS_PYTEST.test(c);
    const rt = HAS_MAIN.test(c);
    const mypy = HAS_MYPY_FIXTURES.test(c) || LOOKS_LIKE_TESTS.test(c);
    if (mypy || (!pt && !rt)) runCheck();
    if (pt) await runPytest();
    if (rt) await runRuntime();
  }, [runCheck, runPytest, runRuntime]);

  // Cmd/Ctrl+Enter and Cmd/Ctrl+S both run the primary action from anywhere on
  // the page. Events originating inside the editor are handled by the
  // CodeMirror keymap instead (skipped here to avoid double runs) — except that
  // Ctrl+S always needs its browser "save page" default suppressed.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key !== "enter" && key !== "s") return;
      if (event.target instanceof Element && event.target.closest(".cm-editor")) {
        if (key === "s") event.preventDefault();
        return;
      }
      event.preventDefault();
      runDetected();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [runDetected]);

  const handleSelectExample = useCallback((id: string) => {
    const ex = EXAMPLES.find((e) => e.id === id);
    if (!ex) return;
    setExampleId(id);
    setCode(ex.code);
    setDiagnostics([]);
    setCheck({ status: "idle" });
    setPytest({ status: "idle" });
    setRuntime({ status: "idle" });
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  // Encode the current snippet into the URL hash and return the shareable link.
  const buildShareUrl = useCallback(() => {
    const encoded = compressToEncodedURIComponent(code);
    window.history.replaceState(null, "", `#code=${encoded}`);
    return `${window.location.origin}${window.location.pathname}#code=${encoded}`;
  }, [code]);

  const copyText = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard may be unavailable; the URL is still updated */
    }
    setShareOpen(false);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }, []);

  const handleShareLink = useCallback(() => {
    copyText(buildShareUrl());
  }, [buildShareUrl, copyText]);

  // Copy the snippet as a Markdown fenced block followed by a link back to it.
  const handleShareMarkdown = useCallback(() => {
    const url = buildShareUrl();
    const body = code.replace(/\s+$/, "");
    copyText(
      `\`\`\`python\n${body}\n\`\`\`\n\n[Open in tysql playground](${url})`,
    );
  }, [buildShareUrl, code, copyText]);

  // Close the share menu on outside click or Escape.
  useEffect(() => {
    if (!shareOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (!shareRef.current?.contains(event.target as Node)) setShareOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShareOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [shareOpen]);

  const handleSelectDiagnostic = useCallback((line: number, col: number) => {
    editorRef.current?.focusLine(line, col);
  }, []);

  const checking = check.status === "loading";
  const pytestRunning = pytest.status === "loading";
  const runtimeRunning = runtime.status === "loading";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header mode={mode} theme={theme} onToggleTheme={toggleTheme} />

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
              className="max-w-[40%] truncate rounded-md border border-border bg-bg-elevated px-2.5 py-1.5 text-xs text-text outline-none transition-colors hover:border-border-strong focus:border-accent"
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
              <div ref={shareRef} className="relative">
                <button
                  type="button"
                  onClick={() => setShareOpen((o) => !o)}
                  aria-haspopup="menu"
                  aria-expanded={shareOpen}
                  className="rounded-md px-2.5 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-bg-hover hover:text-text"
                >
                  {copied ? "Copied ✓" : "Share"}
                </button>
                {shareOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 z-10 mt-1 min-w-[11rem] overflow-hidden rounded-md border border-border bg-bg-elevated py-1 shadow-lg"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleShareLink}
                      className="block w-full px-3 py-1.5 text-left text-xs text-text-muted transition-colors hover:bg-bg-hover hover:text-text"
                    >
                      Copy link
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleShareMarkdown}
                      className="block w-full px-3 py-1.5 text-left text-xs text-text-muted transition-colors hover:bg-bg-hover hover:text-text"
                    >
                      Copy as Markdown
                    </button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <ToolButton
                  label="Check"
                  title="Type-check with the PEP 827 mypy fork"
                  armed={mypyDetected}
                  running={checking}
                  disabled={false}
                  onClick={runCheck}
                />
                <ToolButton
                  label="Test"
                  title={
                    pytestDetected
                      ? "Run the test_* functions with pytest in your browser"
                      : "Add a test_* function to enable pytest"
                  }
                  armed={pytestDetected}
                  running={pytestRunning}
                  disabled={!pytestDetected}
                  onClick={runPytest}
                />
                <ToolButton
                  label="Run"
                  title={
                    runtimeDetected
                      ? "Run the script with Python 3.14 in your browser"
                      : "Execute the snippet with Python 3.14 in your browser"
                  }
                  armed={runtimeDetected}
                  running={runtimeRunning}
                  disabled={false}
                  play
                  onClick={runRuntime}
                />
                <span
                  title="Enter runs every highlighted tool"
                  className="ml-0.5 select-none rounded border border-border bg-bg-elevated px-1.5 py-1 font-mono text-[11px] text-text-faint"
                >
                  ⌘↵
                </span>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden bg-bg">
            {ready && (
              <Editor
                ref={editorRef}
                value={code}
                onChange={setCode}
                diagnostics={diagnostics}
                onRun={runDetected}
                theme={theme}
              />
            )}
          </div>
        </section>

        {/* Results pane */}
        <section className="flex min-h-0 flex-col bg-bg-panel">
          <ResultsPanel
            check={check}
            pytest={pytest}
            runtime={runtime}
            mode={mode}
            versions={versions}
            mypyDetected={mypyDetected}
            pytestDetected={pytestDetected}
            runtimeDetected={runtimeDetected}
            onSelectDiagnostic={handleSelectDiagnostic}
          />
        </section>
      </div>

      <StatusBar versions={versions} />
    </div>
  );
}

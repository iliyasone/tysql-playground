"use client";

import { useEffect, useState } from "react";
import type { CheckResult, Diagnostic, Severity, Versions } from "@/lib/api";
import type { ExecResult, ExecStage, RuntimeVersions } from "@/lib/pyRunner";
import type { PlaygroundMode } from "@/components/Header";

export type RunState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; result: CheckResult }
  | { status: "error"; message: string };

export type ExecState =
  | { status: "idle" }
  | { status: "loading"; stage: ExecStage }
  | { status: "done"; result: ExecResult }
  | { status: "error"; message: string };

interface ResultsPanelProps {
  /** The three independent result blocks, in display order. */
  check: RunState;
  pytest: ExecState;
  runtime: ExecState;
  mode: PlaygroundMode;
  /** Tool versions from the server's Check (git main), for block headers. */
  versions: Versions | null;
  /** Which of the three blocks the current snippet opts into. */
  mypyDetected: boolean;
  pytestDetected: boolean;
  runtimeDetected: boolean;
  onSelectDiagnostic: (line: number, col: number) => void;
}

const MYPY_REPO = "https://github.com/iliyasone/mypy-typemap";
const TYPEMAP_REPO = "https://github.com/iliyasone/python-typemap";
const PYODIDE_URL = "https://pyodide.org/";

/** `1.20.0+dev.<40-char sha>` → `1.20.0+dev.<7-char sha>`, to keep headers short. */
function shortVersion(v: string): string {
  return v.replace(/(\+dev\.[0-9a-f]{7})[0-9a-f]{33}$/, "$1");
}

/** Inline, subtly-underlined external link, matching the footer's tool links. */
function ToolLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-text-muted decoration-border-strong underline-offset-2 transition-colors hover:text-text hover:underline"
    >
      {children}
    </a>
  );
}

const severityStyle: Record<Severity, { label: string; dot: string; text: string }> = {
  error: { label: "error", dot: "bg-error", text: "text-error" },
  warning: { label: "warning", dot: "bg-warning", text: "text-warning" },
  note: { label: "note", dot: "bg-note", text: "text-note" },
};

function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`;
}

function positionLabel(diag: Diagnostic): string {
  if (diag.line === null) return "file";
  if (diag.col === null) return `${diag.line}`;
  return `${diag.line}:${diag.col}`;
}

function DiagnosticRow({
  diag,
  onSelect,
}: {
  diag: Diagnostic;
  onSelect: (line: number, col: number) => void;
}) {
  const s = severityStyle[diag.severity];
  const canJump = diag.line !== null;
  return (
    <button
      type="button"
      disabled={!canJump}
      onClick={() => {
        if (diag.line !== null) onSelect(diag.line, diag.col ?? 1);
      }}
      className="group flex w-full gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors enabled:hover:bg-bg-hover disabled:cursor-default"
    >
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${s.dot}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-mono text-xs text-text-muted tabular-nums">
            {positionLabel(diag)}
          </span>
          <span className={`text-[11px] font-medium uppercase tracking-wide ${s.text}`}>
            {s.label}
          </span>
          {diag.code && (
            <span className="rounded border border-border-strong bg-bg-elevated px-1.5 py-px font-mono text-[11px] text-text-faint">
              {diag.code}
            </span>
          )}
        </div>
        <p className="mt-1 whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-text">
          {diag.message}
        </p>
      </div>
      {canJump && (
        <span className="mt-1 shrink-0 text-xs text-text-faint opacity-0 transition-opacity group-hover:opacity-100">
          jump →
        </span>
      )}
    </button>
  );
}

function Chevron({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      width="9"
      height="9"
      fill="currentColor"
      aria-hidden="true"
      className={`shrink-0 transition-transform ${collapsed ? "-rotate-90" : ""}`}
    >
      <path d="M2 4h8L6 9z" />
    </svg>
  );
}

/** A collapsible result block: a title (toggles), a qualifier that may hold
 * links, optional right-aligned controls, and a body hidden when collapsed. */
function Block({
  title,
  qualifier,
  right,
  children,
}: {
  title: string;
  qualifier: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <section>
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-bg-panel px-4 py-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-expanded={!collapsed}
            className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-text transition-colors hover:text-accent"
          >
            <Chevron collapsed={collapsed} />
            {title}
          </button>
          <span className="truncate text-xs text-text-faint">· {qualifier}</span>
        </div>
        {!collapsed && right}
      </div>
      {!collapsed && children}
    </section>
  );
}

/** Cold-start note appears only after the user has actually been waiting. */
function CheckLoading() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setSlow(true), 2500);
    return () => window.clearTimeout(id);
  }, []);
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-border-strong border-t-accent" />
      <p className="text-sm text-text-muted">Type-checking…</p>
      {slow && (
        <p className="max-w-xs text-xs text-text-faint">
          First check after idle can take ~10 s (server cold start).
        </p>
      )}
    </div>
  );
}

const EXEC_STAGE_LABEL: Record<ExecStage, string> = {
  download: "Downloading Python 3.14 (~20 MB, once per browser)…",
  install: "Installing tysql + typemap…",
  run: "Running…",
};

function CheckSection({
  check,
  strict,
  versions,
  onSelectDiagnostic,
}: {
  check: RunState;
  /** Test suite → strict flags (ignores act as negative assertions). */
  strict: boolean;
  versions: Versions | null;
  onSelectDiagnostic: (line: number, col: number) => void;
}) {
  const [raw, setRaw] = useState(false);
  // The exact fork + version doing the checking, linked like the footer.
  const forkVersion = versions ? shortVersion(versions.mypy) : null;
  const qualifier = (
    <>
      <ToolLink href={MYPY_REPO}>
        mypy fork{forkVersion ? ` ${forkVersion}` : ""}
      </ToolLink>
      {strict ? " · --warn-unused-ignores" : " · PEP 827"}
    </>
  );

  let right: React.ReactNode = null;
  let body: React.ReactNode;

  if (check.status === "loading") {
    body = <CheckLoading />;
  } else if (check.status === "error") {
    body = (
      <div className="px-4 py-4">
        <p className="text-sm font-medium text-error">Server error</p>
        <p className="mt-1 text-xs text-text-muted">{check.message}</p>
      </div>
    );
  } else if (check.status === "idle") {
    body = (
      <p className="px-4 py-4 text-xs text-text-faint">
        {strict ? "Type-checks the suite →" : "Type-checks the snippet →"}
      </p>
    );
  } else {
    const { diagnostics, exit_code, duration_ms, stdout, stderr } = check.result;
    const errorCount = diagnostics.filter((d) => d.severity === "error").length;
    const clean = exit_code === 0;
    // Exit codes other than 0/1 (or a non-zero exit with nothing parsed) mean
    // the checker itself failed — never dress that up as a result.
    const crashed =
      (exit_code !== 0 && exit_code !== 1) ||
      (!clean && diagnostics.length === 0);
    right = (
      <span className="flex items-center gap-2">
        <span className="text-xs text-text-muted tabular-nums">
          {formatDuration(duration_ms)}
        </span>
        <button
          type="button"
          onClick={() => setRaw((v) => !v)}
          className="rounded-md border border-border px-2 py-0.5 text-[11px] text-text-muted transition-colors hover:bg-bg-hover hover:text-text"
        >
          {raw ? "Diagnostics" : "Raw output"}
        </button>
      </span>
    );
    body = crashed ? (
      <div className="p-4">
        <p className="mb-2 text-xs text-text-muted">
          The type checker did not produce a result (exit code {exit_code}) —
          this is a playground problem, not an error in your snippet. Raw output:
        </p>
        <pre className="whitespace-pre-wrap break-words rounded-md border border-error/30 bg-error/5 p-3 font-mono text-xs leading-relaxed text-text">
          {stdout || "(stdout empty)"}
          {stderr ? `\n\n--- stderr ---\n${stderr}` : "\n\n(stderr empty)"}
        </pre>
      </div>
    ) : raw ? (
      <pre className="whitespace-pre-wrap break-words p-4 font-mono text-xs leading-relaxed text-text-muted">
        {stdout || "(stdout empty)"}
        {stderr ? `\n\n--- stderr ---\n${stderr}` : ""}
      </pre>
    ) : diagnostics.length === 0 ? (
      <div className="flex items-center gap-2 px-4 py-4">
        <span className="flex h-6 w-6 items-center justify-center rounded-full border border-success/40 bg-success/10 text-xs text-success">
          ✓
        </span>
        <p className="text-sm text-text">The snippet type-checks cleanly.</p>
      </div>
    ) : (
      <div>
        <p className="border-b border-border/60 px-4 py-2 text-xs font-medium text-text-muted">
          {errorCount === 0
            ? "No errors"
            : `${errorCount} ${errorCount === 1 ? "error" : "errors"}`}
        </p>
        {diagnostics.map((d, i) => (
          <DiagnosticRow
            key={`${d.line}:${d.col}:${i}`}
            diag={d}
            onSelect={onSelectDiagnostic}
          />
        ))}
      </div>
    );
  }

  return (
    <Block title="Type check" qualifier={qualifier} right={right}>
      {body}
    </Block>
  );
}

/** Runtime block header — the actual browser runtime + the typemap it resolved
 * (which can differ from the server's Check; that skew is the point of showing
 * it). Versions arrive only once a run completes. */
function runtimeQualifier(
  pytest: boolean,
  v: RuntimeVersions | null,
): React.ReactNode {
  const typemap = v?.typemap ? shortVersion(v.typemap) : null;
  return (
    <>
      {pytest && "pytest · "}
      <ToolLink href={PYODIDE_URL}>Python 3.14</ToolLink>
      {typemap ? (
        <>
          {" · "}
          <ToolLink href={TYPEMAP_REPO}>typemap {typemap}</ToolLink>
        </>
      ) : (
        " in your browser"
      )}
    </>
  );
}

function ExecSection({
  title,
  exec,
  pytest,
}: {
  title: string;
  exec: ExecState;
  pytest: boolean;
}) {
  // Prefer the run's own verdict for labelling once it exists.
  const isPytest =
    exec.status === "done" ? exec.result.pytestExit !== null : pytest;
  const runtimeVersions = exec.status === "done" ? exec.result.versions : null;
  const qualifier = runtimeQualifier(isPytest, runtimeVersions);

  let right: React.ReactNode = null;
  let body: React.ReactNode;

  if (exec.status === "idle") {
    body = (
      <p className="px-4 py-4 text-xs text-text-faint">
        {pytest
          ? "Runs the test_* functions with pytest →"
          : "Runs the snippet with Python 3.14 →"}
      </p>
    );
  } else if (exec.status === "loading") {
    body = (
      <div className="flex items-center gap-3 px-4 py-4">
        <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-border-strong border-t-accent" />
        <p className="text-xs text-text-muted">{EXEC_STAGE_LABEL[exec.stage]}</p>
      </div>
    );
  } else if (exec.status === "error") {
    body = (
      <div className="px-4 py-4">
        <p className="text-sm font-medium text-error">Runtime unavailable</p>
        <p className="mt-1 text-xs text-text-muted">{exec.message}</p>
      </div>
    );
  } else {
    const { output, error, durationMs } = exec.result;
    right = (
      <span className="text-xs text-text-muted tabular-nums">
        {formatDuration(durationMs)}
      </span>
    );
    body = (
      <div className="px-4 py-3">
        {output ? (
          <pre className="whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-text">
            {output}
          </pre>
        ) : !error ? (
          <p className="text-xs text-text-faint">(no output)</p>
        ) : null}
        {error && (
          <pre className="mt-2 whitespace-pre-wrap break-words rounded-md border border-error/30 bg-error/5 p-3 font-mono text-xs leading-relaxed text-text">
            {error}
          </pre>
        )}
      </div>
    );
  }

  return (
    <Block title={title} qualifier={qualifier} right={right}>
      {body}
    </Block>
  );
}

/** One line comparing the two verdicts — the point of having both. */
function AgreementStrip({ check, exec }: { check: CheckResult; exec: ExecResult }) {
  const pytest = exec.pytestExit !== null;
  const staticClean = check.exit_code === 0;
  const runtimeClean = pytest ? exec.pytestExit === 0 : !exec.error;
  let dot: string;
  let text: string;
  let message: string;
  if (staticClean && runtimeClean) {
    dot = "bg-success";
    text = "text-success";
    message = pytest
      ? "Both suites pass — mypy and pytest agree."
      : "Static and runtime agree — no issues.";
  } else if (!staticClean && !runtimeClean) {
    dot = "bg-success";
    text = "text-success";
    message = pytest
      ? "Both suites fail — mypy and pytest agree."
      : "Static and runtime agree — both reject this snippet.";
  } else if (!staticClean && runtimeClean) {
    dot = "bg-note";
    text = "text-note";
    message = pytest
      ? "mypy rejects what pytest lets through."
      : "The type checker catches what the runtime lets through.";
  } else {
    dot = "bg-warning";
    text = "text-warning";
    message = pytest
      ? "pytest fails where mypy is clean."
      : "Runtime failed where the static check was clean.";
  }
  return (
    <div className="sticky bottom-0 flex items-center gap-2 border-t border-border bg-bg-elevated px-4 py-2">
      <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
      <p className={`text-xs font-medium ${text}`}>{message}</p>
    </div>
  );
}

function IdleExplainer({ mode }: { mode: PlaygroundMode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-sm font-medium text-text">
        {mode === "tysql"
          ? "SQL statements as Python types"
          : "Type-level programs, checked and run"}
      </p>
      <p className="max-w-sm text-xs leading-relaxed text-text-muted">
        {mode === "tysql" ? (
          <>
            Write a SQL statement as a Python type.{" "}
            <span className="font-medium text-text">Check</span> type-checks it
            with the PEP 827 mypy fork — no database, nothing runs on a server.
          </>
        ) : (
          <>
            Write a PEP 827 type-level program.{" "}
            <span className="font-medium text-text">Check</span> evaluates it
            statically with the mypy fork.
          </>
        )}{" "}
        <span className="font-medium text-text">Run</span> executes the snippet
        with Python 3.14 in your browser, to compare the runtime behaviour.
      </p>
      <p className="text-xs text-text-faint">
        <kbd className="rounded border border-border-strong bg-bg-elevated px-1.5 py-0.5 font-mono text-[11px] text-text">
          ⌘↵
        </kbd>{" "}
        runs the highlighted tools.
      </p>
    </div>
  );
}

export default function ResultsPanel({
  check,
  pytest,
  runtime,
  mode,
  versions,
  mypyDetected,
  pytestDetected,
  runtimeDetected,
  onSelectDiagnostic,
}: ResultsPanelProps) {
  const allIdle =
    check.status === "idle" &&
    pytest.status === "idle" &&
    runtime.status === "idle";
  if (allIdle) {
    return <IdleExplainer mode={mode} />;
  }

  // Show a block if the snippet opts into it or it already carries a result.
  const showCheck = mypyDetected || check.status !== "idle";
  const showPytest = pytestDetected || pytest.status !== "idle";
  const showRuntime = runtimeDetected || runtime.status !== "idle";

  // Agreement compares the static check against the browser run — pytest is the
  // meaningful pairing when present, otherwise the plain runtime.
  const agreementExec =
    pytest.status === "done"
      ? pytest.result
      : runtime.status === "done"
        ? runtime.result
        : null;

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        {showCheck && (
          <CheckSection
            check={check}
            strict={pytestDetected}
            versions={versions}
            onSelectDiagnostic={onSelectDiagnostic}
          />
        )}
        {showPytest && <ExecSection title="Tests" exec={pytest} pytest />}
        {showRuntime && (
          <ExecSection title="Runtime" exec={runtime} pytest={false} />
        )}
      </div>
      {check.status === "done" && agreementExec && (
        <AgreementStrip check={check.result} exec={agreementExec} />
      )}
    </div>
  );
}

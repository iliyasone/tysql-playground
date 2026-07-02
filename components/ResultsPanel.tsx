"use client";

import { useState } from "react";
import type { CheckResult, Diagnostic, Severity } from "@/lib/api";

export type RunState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; result: CheckResult }
  | { status: "error"; message: string };

interface ResultsPanelProps {
  run: RunState;
  onSelectDiagnostic: (line: number, col: number) => void;
}

const severityStyle: Record<
  Severity,
  { label: string; dot: string; chip: string }
> = {
  error: {
    label: "error",
    dot: "bg-error",
    chip: "text-error border-error/40 bg-error/10",
  },
  warning: {
    label: "warning",
    dot: "bg-warning",
    chip: "text-warning border-warning/40 bg-warning/10",
  },
  note: {
    label: "note",
    dot: "bg-note",
    chip: "text-note border-note/40 bg-note/10",
  },
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
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
          <span className={`text-[11px] font-medium uppercase tracking-wide ${s.chip.split(" ")[0]}`}>
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

function CheckDone({
  result,
  onSelectDiagnostic,
}: {
  result: CheckResult;
  onSelectDiagnostic: (line: number, col: number) => void;
}) {
  const [raw, setRaw] = useState(false);
  const { diagnostics, exit_code, duration_ms, stdout, stderr } = result;
  const errorCount = diagnostics.filter((d) => d.severity === "error").length;
  const clean = exit_code === 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2">
        <div className="flex items-center gap-2 text-xs">
          {clean ? (
            <span className="font-medium text-success">No issues found</span>
          ) : exit_code === 1 ? (
            <span className="font-medium text-error">
              {errorCount} {errorCount === 1 ? "error" : "errors"}
            </span>
          ) : (
            <span className="font-medium text-warning">
              Checker exited with code {exit_code}
            </span>
          )}
          <span className="text-text-faint">·</span>
          <span className="text-text-muted tabular-nums">
            {formatDuration(duration_ms)}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setRaw((v) => !v)}
          className="rounded-md border border-border px-2 py-1 text-[11px] text-text-muted transition-colors hover:bg-bg-hover hover:text-text"
        >
          {raw ? "Diagnostics" : "Raw output"}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {raw ? (
          <pre className="whitespace-pre-wrap break-words p-4 font-mono text-xs leading-relaxed text-text-muted">
            {stdout || "(stdout empty)"}
            {stderr ? `\n\n--- stderr ---\n${stderr}` : ""}
          </pre>
        ) : diagnostics.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-success/40 bg-success/10 text-success">
              ✓
            </div>
            <p className="text-sm font-medium text-text">Success</p>
            <p className="max-w-xs text-xs text-text-muted">
              The statement type-checks cleanly — every projected column and
              inferred parameter lines up.
            </p>
          </div>
        ) : (
          <div>
            {diagnostics.map((d, i) => (
              <DiagnosticRow
                key={`${d.line}:${d.col}:${i}`}
                diag={d}
                onSelect={onSelectDiagnostic}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ResultsPanel({
  run,
  onSelectDiagnostic,
}: ResultsPanelProps) {
  if (run.status === "done") {
    return (
      <CheckDone result={run.result} onSelectDiagnostic={onSelectDiagnostic} />
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      {run.status === "idle" && (
        <>
          <p className="text-sm font-medium text-text">Ready when you are</p>
          <p className="max-w-xs text-xs text-text-muted">
            Press{" "}
            <kbd className="rounded border border-border-strong bg-bg-elevated px-1.5 py-0.5 font-mono text-[11px] text-text">
              Run
            </kbd>{" "}
            (or{" "}
            <kbd className="rounded border border-border-strong bg-bg-elevated px-1.5 py-0.5 font-mono text-[11px] text-text">
              ⌘/Ctrl + Enter
            </kbd>
            ) to type-check the snippet.
          </p>
        </>
      )}
      {run.status === "loading" && (
        <>
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-border-strong border-t-accent" />
          <p className="text-sm text-text-muted">Type-checking…</p>
          <p className="max-w-xs text-xs text-text-faint">
            First run after idle may take ~10 s (cold start).
          </p>
        </>
      )}
      {run.status === "error" && (
        <>
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-error/40 bg-error/10 text-error">
            !
          </div>
          <p className="text-sm font-medium text-error">Server error</p>
          <p className="max-w-sm text-xs text-text-muted">{run.message}</p>
        </>
      )}
    </div>
  );
}

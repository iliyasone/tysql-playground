"use client";

import type { Versions } from "@/lib/api";
import type { RunState } from "@/components/ResultsPanel";

interface StatusBarProps {
  versions: Versions | null;
  run: RunState;
}

function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`;
}

/** `1.20.0+dev.<40-char sha>` → `1.20.0+dev.<7-char sha>` — the full hash
 * wraps the footer onto three lines on mobile. */
function shortVersion(v: string | null): string {
  return v === null ? "?" : v.replace(/(\+dev\.[0-9a-f]{7})[0-9a-f]{33}$/, "$1");
}

export default function StatusBar({ versions, run }: StatusBarProps) {
  return (
    <footer className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-border bg-bg-panel px-4 py-1.5 font-mono text-[11px] text-text-faint">
      {versions ? (
        <span className="text-text-muted">
          tysql {versions.tysql}
          <span className="text-text-faint"> · </span>
          typemap {versions.typemap}
          <span className="text-text-faint"> · </span>
          mypy {versions.fork ? "fork ✓" : "(no fork!)"} {shortVersion(versions.mypy)}
        </span>
      ) : (
        <span>connecting to checker…</span>
      )}

      {run.status === "done" && (
        <>
          <span className="text-text-faint">·</span>
          <span className="text-text-muted">
            checked in {formatDuration(run.result.duration_ms)}
          </span>
        </>
      )}

      <span className="ml-auto hidden sm:inline">
        type-checked only, never executed · first run after idle may take ~10 s
        (cold start)
      </span>
    </footer>
  );
}

"use client";

import type { Versions } from "@/lib/api";

interface StatusBarProps {
  versions: Versions | null;
}

/** `1.20.0+dev.<40-char sha>` → `1.20.0+dev.<7-char sha>` — the full hash
 * wraps the footer onto three lines on mobile. */
function shortVersion(v: string | null): string {
  return v === null ? "?" : v.replace(/(\+dev\.[0-9a-f]{7})[0-9a-f]{33}$/, "$1");
}

function RepoLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-text-muted decoration-border-strong underline-offset-2 transition-colors hover:text-text hover:underline"
    >
      {children}
    </a>
  );
}

export default function StatusBar({ versions }: StatusBarProps) {
  return (
    <footer className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-border bg-bg-panel px-4 py-1.5 font-mono text-[11px] text-text-faint">
      {versions ? (
        <span>
          <RepoLink href="https://github.com/iliyasone/tysql">
            tysql {versions.tysql}
          </RepoLink>
          {" · "}
          <RepoLink href="https://github.com/iliyasone/python-typemap">
            typemap {versions.typemap}
          </RepoLink>
          {" · "}
          <RepoLink href="https://github.com/iliyasone/mypy-typemap">
            mypy {versions.fork ? "fork ✓" : "(no fork!)"} {shortVersion(versions.mypy)}
          </RepoLink>
        </span>
      ) : (
        <span>connecting to checker…</span>
      )}

      <a
        href="https://github.com/iliyasone/tysql-playground"
        target="_blank"
        rel="noopener noreferrer"
        title="tysql-playground on GitHub"
        className="ml-auto flex items-center gap-1.5 transition-colors hover:text-text"
      >
        <svg
          viewBox="0 0 16 16"
          width="14"
          height="14"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
        </svg>
        source
      </a>
    </footer>
  );
}

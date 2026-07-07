"use client";

import type { Theme } from "@/lib/theme";

export type PlaygroundMode = "tysql" | "pep827";

interface HeaderProps {
  mode: PlaygroundMode;
  theme: Theme;
  onToggleTheme: () => void;
}

function PaperIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M4 1.75C4 .784 4.784 0 5.75 0h5.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 14.25 16h-8.5A1.75 1.75 0 0 1 4 14.25V1.75Zm-2.5 3.5a.75.75 0 0 1 .75.75v8.25c0 .69.56 1.25 1.25 1.25h8.25a.75.75 0 0 1 0 1.5H3.5A2.75 2.75 0 0 1 .75 14.25V6a.75.75 0 0 1 .75-.75Zm10-3.75h-5.75a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25V5h-2.25A1.75 1.75 0 0 1 11.5 3.25V1.5Zm1.5.56v1.19c0 .138.112.25.25.25h1.19L13 2.06Z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 10.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm0 1.5a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm0-12a.75.75 0 0 1 .75.75v1a.75.75 0 0 1-1.5 0v-1A.75.75 0 0 1 8 0Zm0 13.5a.75.75 0 0 1 .75.75v1a.75.75 0 0 1-1.5 0v-1a.75.75 0 0 1 .75-.75ZM2.343 2.343a.75.75 0 0 1 1.061 0l.707.707A.75.75 0 0 1 3.05 4.11l-.707-.707a.75.75 0 0 1 0-1.06Zm9.546 9.546a.75.75 0 0 1 1.06 0l.708.707a.75.75 0 1 1-1.061 1.061l-.707-.707a.75.75 0 0 1 0-1.061ZM0 8a.75.75 0 0 1 .75-.75h1a.75.75 0 0 1 0 1.5h-1A.75.75 0 0 1 0 8Zm13.5 0a.75.75 0 0 1 .75-.75h1a.75.75 0 0 1 0 1.5h-1a.75.75 0 0 1-.75-.75ZM4.11 11.89a.75.75 0 0 1 0 1.06l-.707.708a.75.75 0 0 1-1.061-1.061l.707-.707a.75.75 0 0 1 1.061 0Zm9.546-9.546a.75.75 0 0 1 0 1.06l-.707.708a.75.75 0 0 1-1.061-1.061l.707-.707a.75.75 0 0 1 1.061 0Z" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M9.598 1.591a.75.75 0 0 1 .785-.175 7 7 0 1 1-8.967 8.967.75.75 0 0 1 .961-.96 5.5 5.5 0 0 0 7.046-7.046.75.75 0 0 1 .175-.786Zm1.616 1.945a7 7 0 0 1-7.678 7.678 5.5 5.5 0 1 0 7.678-7.678Z" />
    </svg>
  );
}

export default function Header({ mode, theme, onToggleTheme }: HeaderProps) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border bg-bg-panel px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element -- static 64px asset, no optimizer needed */}
        <img
          src="/logo.png"
          alt=""
          width={22}
          height={22}
          className="shrink-0 rounded-[5px]"
        />
        <h1 className="whitespace-nowrap font-mono text-sm font-semibold tracking-tight text-text">
        {mode === "tysql" ? (
          <a
            key="tysql"
            href="https://github.com/iliyasone/tysql"
            target="_blank"
            rel="noopener noreferrer"
            title="tysql on GitHub"
            className="title-word transition-colors hover:text-accent"
          >
            tysql
          </a>
        ) : (
          <a
            key="pep827"
            href="https://peps.python.org/pep-0827/"
            target="_blank"
            rel="noopener noreferrer"
            title="PEP 827 — Typemaps"
            className="title-word transition-colors hover:text-accent"
          >
            PEP 827
          </a>
        )}
        <span className="text-accent"> playground</span>
        </h1>
      </div>

      <nav className="flex shrink-0 items-center gap-1">
        <a
          href="https://peps.python.org/pep-0827/"
          target="_blank"
          rel="noopener noreferrer"
          title="PEP 827 — Typemaps: the foundation of everything here"
          className="rounded-md px-2 py-1.5 text-xs text-text-muted transition-colors hover:bg-bg-hover hover:text-text"
        >
          PEP 827
        </a>
        <a
          href="https://github.com/iliyasone/metatypes/blob/main/THESIS.pdf"
          target="_blank"
          rel="noopener noreferrer"
          title="The research behind this playground (THESIS.pdf)"
          className="flex items-center gap-1.5 rounded-md border border-border bg-bg-elevated px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:border-border-strong hover:text-text"
        >
          <PaperIcon />
          <span className="hidden sm:inline">Read paper</span>
        </a>
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={
            theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
          }
          className="rounded-md px-2 py-1.5 text-text-muted transition-colors hover:bg-bg-hover hover:text-text"
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
      </nav>
    </header>
  );
}

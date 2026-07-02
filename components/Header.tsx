"use client";

function GitHubIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="18"
      height="18"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

export default function Header() {
  return (
    <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border bg-bg-panel px-4 py-2.5">
      <div className="flex min-w-0 items-baseline gap-3">
        <h1 className="whitespace-nowrap font-mono text-sm font-semibold tracking-tight text-text">
          tysql<span className="text-accent"> playground</span>
        </h1>
        <p className="hidden truncate text-xs text-text-muted md:block">
          SQL statements as Python types — type-checked live by the PEP 827 mypy
          fork
        </p>
      </div>
      <nav className="flex shrink-0 items-center gap-1">
        <a
          href="https://github.com/iliyasone/metatypes/blob/main/THESIS.pdf"
          target="_blank"
          rel="noopener noreferrer"
          title="The research behind tysql: metatypes (THESIS.pdf)"
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-text-muted transition-colors hover:bg-bg-hover hover:text-text"
        >
          <svg
            viewBox="0 0 16 16"
            width="18"
            height="18"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M4 1.75C4 .784 4.784 0 5.75 0h5.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 14.25 16h-8.5A1.75 1.75 0 0 1 4 14.25V1.75Zm-2.5 3.5a.75.75 0 0 1 .75.75v8.25c0 .69.56 1.25 1.25 1.25h8.25a.75.75 0 0 1 0 1.5H3.5A2.75 2.75 0 0 1 .75 14.25V6a.75.75 0 0 1 .75-.75Zm10-3.75h-5.75a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25V5h-2.25A1.75 1.75 0 0 1 11.5 3.25V1.5Zm1.5.56v1.19c0 .138.112.25.25.25h1.19L13 2.06Z" />
          </svg>
          <span className="hidden text-xs sm:inline">thesis</span>
        </a>
        <a
          href="https://github.com/iliyasone/metatypes"
          target="_blank"
          rel="noopener noreferrer"
          title="metatypes — the research repo behind tysql"
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-text-muted transition-colors hover:bg-bg-hover hover:text-text"
        >
          <GitHubIcon />
          <span className="hidden text-xs sm:inline">metatypes</span>
        </a>
        <a
          href="https://github.com/iliyasone/tysql"
          target="_blank"
          rel="noopener noreferrer"
          title="tysql on GitHub"
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-text-muted transition-colors hover:bg-bg-hover hover:text-text"
        >
          <GitHubIcon />
          <span className="hidden text-xs sm:inline">tysql</span>
        </a>
        <a
          href="https://github.com/iliyasone/tysql-playground"
          target="_blank"
          rel="noopener noreferrer"
          title="tysql-playground on GitHub"
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-text-muted transition-colors hover:bg-bg-hover hover:text-text"
        >
          <GitHubIcon />
          <span className="hidden text-xs sm:inline">playground</span>
        </a>
      </nav>
    </header>
  );
}

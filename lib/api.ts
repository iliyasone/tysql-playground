// Typed client for the same-origin /api/check endpoint.

export type Severity = "error" | "warning" | "note";

export interface Diagnostic {
  // Both may be null: `line` null for file-level errors (no position);
  // `col` may be null even when `line` is set (marker spans the whole line).
  line: number | null;
  col: number | null;
  severity: Severity;
  message: string;
  code: string | null;
}

export interface Versions {
  tysql: string;
  typemap: string;
  mypy: string;
  fork: boolean;
}

export interface CheckResult {
  exit_code: number;
  duration_ms: number;
  stdout: string;
  stderr: string;
  diagnostics: Diagnostic[];
  versions: Versions;
}

export interface HealthResult {
  ok: true;
  versions: Versions;
}

interface ApiError {
  error: string;
}

/** Raised for non-2xx responses and network failures, with a UI-friendly message. */
export class CheckError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null) {
    super(message);
    this.name = "CheckError";
    this.status = status;
  }
}

function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { error?: unknown }).error === "string"
  );
}

export async function checkCode(
  code: string,
  signal?: AbortSignal,
): Promise<CheckResult> {
  let res: Response;
  try {
    res = await fetch("/api/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new CheckError(
      "Could not reach the type-check server. In local dev, make sure the Python server is running (python api/check.py).",
      null,
    );
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // fall through to status-based handling
  }

  if (!res.ok) {
    const message = isApiError(body)
      ? body.error
      : `Type-check server returned ${res.status}.`;
    throw new CheckError(message, res.status);
  }

  return body as CheckResult;
}

export async function getHealth(signal?: AbortSignal): Promise<HealthResult> {
  const res = await fetch("/api/check", { method: "GET", signal });
  if (!res.ok) throw new CheckError(`Health check failed (${res.status}).`, res.status);
  return (await res.json()) as HealthResult;
}

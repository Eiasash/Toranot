/**
 * Client-side error reporter — logs unhandled errors to Supabase.
 *
 * Captures:
 *   - window.onerror (syntax errors, runtime throws)
 *   - onunhandledrejection (promise rejections)
 *
 * Fire-and-forget POST to Supabase REST API. Never throws — error
 * reporting must never make the app worse.
 *
 * Rate-limited: max 5 reports per session to prevent flood.
 */

const MAX_REPORTS_PER_SESSION = 5;
let reportCount = 0;

function getSupabaseConfig(): { url: string; key: string } | null {
  try {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    return { url, key };
  } catch {
    return null;
  }
}

function sendError(level: "error" | "warn", source: string, message: string, payload?: Record<string, unknown>): void {
  if (reportCount >= MAX_REPORTS_PER_SESSION) return;
  reportCount++;

  const config = getSupabaseConfig();
  if (!config) return;

  const body = {
    level,
    source,
    message: message.slice(0, 500), // truncate long messages
    payload: payload ? JSON.stringify(payload).slice(0, 2000) : null,
    created_at: new Date().toISOString(),
  };

  // Fire-and-forget — don't await, don't catch
  fetch(`${config.url}/rest/v1/toranot_errors`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": config.key,
      "Authorization": `Bearer ${config.key}`,
      "Prefer": "return=minimal",
    },
    body: JSON.stringify(body),
  }).catch(() => {});
}

/**
 * Install global error handlers. Call once in main.tsx.
 * Idempotent — safe to call multiple times.
 */
export function installErrorReporter(): void {
  // Runtime errors
  window.addEventListener("error", (event) => {
    sendError("error", "window.onerror", event.message || "Unknown error", {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack?.slice(0, 500),
    });
  });

  // Unhandled promise rejections
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === "string"
          ? reason
          : "Unhandled promise rejection";

    sendError("error", "unhandledrejection", message, {
      stack: reason instanceof Error ? reason.stack?.slice(0, 500) : undefined,
    });
  });
}

/**
 * Manual error report — use for caught errors that should be logged.
 */
export function reportError(source: string, message: string, payload?: Record<string, unknown>): void {
  sendError("error", source, message, payload);
}

/**
 * Manual warning report.
 */
export function reportWarning(source: string, message: string, payload?: Record<string, unknown>): void {
  sendError("warn", source, message, payload);
}

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

// --- PHI scrub (mirrors ward-helper's src/debug/console.ts) ------------------
// These error reports are PERSISTED to Supabase (toranot_errors). In a patient-
// data app an error message or stack can echo a name / id, so scrub before the
// POST — never after. Keep code locations; redact the PHI shapes.

/** Redact the three highest-risk PHI shapes; keep English error text readable. */
export function scrubPhi(input: unknown): string {
  const s = input == null ? "" : String(input);
  return s
    .replace(/\d{4,}/g, "[#]") // teudat-zehut / MRN / phone / dates / big labs
    .replace(/"[^"]{0,400}"/g, '"[redacted]"') // quoted input echo
    .replace(/'[^']{0,400}'/g, "'[redacted]'")
    .replace(/[֐-׿]+(?:[\s.,:;()/\-]+[֐-׿]+)*/g, "[he]"); // any Hebrew run
}

/**
 * Keep only real stack frames, dropping the leading "Error: <message>" header —
 * that header echoes the RAW message, which the message-scrub alone would miss.
 * Frames (`at fn (file:line:col)`) carry no PHI, so line/col are preserved.
 */
export function cleanStack(stack: string): string {
  const lines = stack.split("\n");
  const start = lines.findIndex((l) => /^\s*at\s/.test(l) || /@.+:\d+/.test(l));
  return (start >= 0 ? lines.slice(start) : []).slice(0, 6).join("\n");
}

// Code-location fields are not PHI even when the number is large.
const LOCATION_KEYS = new Set(["lineno", "colno", "line", "col", "lineNumber", "columnNumber"]);

function scrubValue(key: string, v: unknown): unknown {
  if (typeof v === "string") return key === "stack" ? cleanStack(v) : scrubPhi(v);
  if (typeof v === "number") {
    if (LOCATION_KEYS.has(key)) return v; // code location, not PHI
    return Math.abs(v) >= 1000 ? "[#]" : v; // large numbers may be teudat-zehut / MRN / phone
  }
  if (Array.isArray(v)) return v.map((item) => scrubValue(key, item));
  if (v && typeof v === "object") return scrubObject(v as Record<string, unknown>);
  return v; // boolean / null / undefined
}

function scrubObject(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = scrubValue(k, v);
  return out;
}

/**
 * Scrub each field individually — NOT the serialized JSON (that would redact the keys too) —
 * recursing through nested objects/arrays so PHI inside `reportError`'s `Record<string, unknown>`
 * payload can't slip through. Strings -> scrubPhi (stack -> cleanStack); numbers >= 1000 -> [#]
 * except code-location fields (lineno/colno).
 */
export function scrubPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return scrubObject(payload);
}

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
    message: scrubPhi(message).slice(0, 500), // PHI-scrub, then truncate
    payload: payload ? JSON.stringify(scrubPayload(payload)).slice(0, 2000) : null,
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

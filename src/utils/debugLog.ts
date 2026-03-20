/**
 * Global error-log buffer + console interceptors.
 * Extracted from DebugConsole so main.tsx can install interceptors
 * without pulling the full React component into the main chunk.
 */

export interface LogEntry {
  level: "log" | "warn" | "error" | "info";
  timestamp: string;
  args: string;
}

export const ERROR_LOG: LogEntry[] = [];
const MAX_LOG_ENTRIES = 200;

const origConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  info: console.info.bind(console),
};

function serialize(args: unknown[]): string {
  return args
    .map((a) => {
      if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack ?? ""}`;
      if (typeof a === "object") {
        try { return JSON.stringify(a, null, 2); } catch { return String(a); }
      }
      return String(a);
    })
    .join(" ");
}

function pushEntry(level: LogEntry["level"], args: unknown[]) {
  const entry: LogEntry = {
    level,
    timestamp: new Date().toISOString(),
    args: serialize(args),
  };
  ERROR_LOG.push(entry);
  if (ERROR_LOG.length > MAX_LOG_ENTRIES) ERROR_LOG.splice(0, ERROR_LOG.length - MAX_LOG_ENTRIES);
}

let _patched = false;
export function installDebugInterceptors() {
  if (_patched) return;
  _patched = true;

  console.log = (...args: unknown[]) => { pushEntry("log", args); origConsole.log(...args); };
  console.warn = (...args: unknown[]) => { pushEntry("warn", args); origConsole.warn(...args); };
  console.error = (...args: unknown[]) => { pushEntry("error", args); origConsole.error(...args); };
  console.info = (...args: unknown[]) => { pushEntry("info", args); origConsole.info(...args); };

  window.addEventListener("error", (e) => {
    pushEntry("error", [`[Uncaught] ${e.message}`, e.filename ? `at ${e.filename}:${e.lineno}:${e.colno}` : ""]);
  });
  window.addEventListener("unhandledrejection", (e) => {
    pushEntry("error", [`[Unhandled Promise] ${e.reason}`]);
  });
}

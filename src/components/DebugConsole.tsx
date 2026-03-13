import { useState, useEffect, useRef, useCallback } from "react";

interface LogEntry {
  level: "log" | "warn" | "error" | "info";
  timestamp: string;
  args: string;
}

// Global error log buffer — captures console output + window errors
const ERROR_LOG: LogEntry[] = [];
const MAX_LOG_ENTRIES = 200;

// Intercept console methods once at module load
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

// Patch console globally (idempotent — only once)
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

const LEVEL_STYLE: Record<LogEntry["level"], string> = {
  error: "text-red-400 bg-red-900/20",
  warn: "text-amber-400 bg-amber-900/20",
  info: "text-blue-400 bg-blue-900/20",
  log: "text-slate-300 bg-transparent",
};

const LEVEL_LABEL: Record<LogEntry["level"], string> = {
  error: "ERR",
  warn: "WRN",
  info: "INF",
  log: "LOG",
};

type FilterLevel = "all" | "error" | "warn";

export function DebugConsole({ onClose }: { onClose: () => void }) {
  const [logs, setLogs] = useState<LogEntry[]>([...ERROR_LOG]);
  const [filter, setFilter] = useState<FilterLevel>("all");
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-refresh logs every second
  useEffect(() => {
    const id = setInterval(() => setLogs([...ERROR_LOG]), 1000);
    return () => clearInterval(id);
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [logs.length]);

  const filtered = filter === "all"
    ? logs
    : filter === "error"
      ? logs.filter((l) => l.level === "error")
      : logs.filter((l) => l.level === "error" || l.level === "warn");

  const handleExport = useCallback(() => {
    const text = filtered
      .map((l) => `[${l.timestamp}] [${LEVEL_LABEL[l.level]}] ${l.args}`)
      .join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `toranot-debug-${new Date().toISOString().slice(0, 16).replace(/:/g, "-")}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [filtered]);

  const handleCopy = useCallback(() => {
    const text = filtered
      .map((l) => `[${l.timestamp}] [${LEVEL_LABEL[l.level]}] ${l.args}`)
      .join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [filtered]);

  const handleClear = useCallback(() => {
    ERROR_LOG.length = 0;
    setLogs([]);
  }, []);

  const errorCount = logs.filter((l) => l.level === "error").length;
  const warnCount = logs.filter((l) => l.level === "warn").length;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-gray-900 w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-slate-800 text-white px-4 py-3 flex items-center justify-between rounded-t-2xl">
          <div>
            <h2 className="text-base font-bold flex items-center gap-2">
              🐛 יומן שגיאות
              {errorCount > 0 && <span className="text-xs bg-red-600 px-1.5 py-0.5 rounded-full">{errorCount}</span>}
              {warnCount > 0 && <span className="text-xs bg-amber-600 px-1.5 py-0.5 rounded-full">{warnCount}</span>}
            </h2>
            <p className="text-xs text-slate-400">{logs.length} רשומות</p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white text-xl px-2">✕</button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700 flex-wrap">
          {/* Filter chips */}
          {(
            [
              { key: "all" as FilterLevel, label: `הכל (${logs.length})` },
              { key: "error" as FilterLevel, label: `שגיאות (${errorCount})` },
              { key: "warn" as FilterLevel, label: `אזהרות+ (${errorCount + warnCount})` },
            ] as const
          ).map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                filter === f.key
                  ? "bg-blue-600 text-white border-blue-600"
                  : "text-gray-400 border-gray-600 active:bg-gray-700"
              }`}
            >
              {f.label}
            </button>
          ))}

          <div className="flex-1" />

          {/* Actions */}
          <button onClick={handleClear} className="text-xs text-red-400 px-2 py-1 rounded active:bg-red-900/30">
            נקה
          </button>
          <button onClick={handleCopy} className="text-xs text-blue-400 px-2 py-1 rounded active:bg-blue-900/30">
            {copied ? "✓ הועתק" : "העתק"}
          </button>
          <button onClick={handleExport} className="text-xs text-emerald-400 px-2 py-1 rounded active:bg-emerald-900/30 font-semibold">
            ייצוא .log
          </button>
        </div>

        {/* Log entries */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 space-y-0.5 font-mono text-[11px] min-h-[200px]">
          {filtered.length === 0 ? (
            <p className="text-center text-gray-500 py-12">אין רשומות {filter !== "all" && "בסינון זה"}</p>
          ) : (
            filtered.map((l, i) => (
              <div key={i} className={`px-2 py-1 rounded ${LEVEL_STYLE[l.level]} break-all`}>
                <span className="text-gray-500 text-[9px]">{l.timestamp.slice(11, 19)}</span>
                {" "}
                <span className="font-bold text-[10px]">[{LEVEL_LABEL[l.level]}]</span>
                {" "}
                <span className="whitespace-pre-wrap">{l.args}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

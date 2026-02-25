import { useState, useMemo } from "react";
import type { PatientEntry } from "../types";
import { matchIVProtocols, type IVProtocolMatch } from "../engine/ivProtocolMatch";

/**
 * Inline IV protocol alerts rendered inside PatientCard.
 * Scans patient data (diagnosis, tasks, status, flags, notes) and surfaces
 * relevant SZMC IV drug protocols with preparation/monitoring reminders.
 *
 * Renders nothing if no protocols match — zero overhead for most patients.
 */
export function IVProtocolAlerts({ patient }: { patient: PatientEntry }) {
  const matches = useMemo(() => matchIVProtocols(patient), [patient]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (matches.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {/* Compact header badges — always visible */}
      <div className="flex flex-wrap gap-1.5">
        {matches.map((m) => (
          <button
            key={m.protocolId}
            type="button"
            onClick={() =>
              setExpandedId((prev) => (prev === m.protocolId ? null : m.protocolId))
            }
            className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg border active:opacity-80 transition-colors ${
              m.highRisk
                ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300"
                : "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300"
            } ${expandedId === m.protocolId ? "ring-2 ring-blue-400" : ""}`}
            aria-expanded={expandedId === m.protocolId}
            aria-label={`IV protocol: ${m.drug}`}
          >
            <span>{m.icon}</span>
            <span>{m.drug}</span>
            <span className="opacity-60 text-[9px]">
              {expandedId === m.protocolId ? "▴" : "▾"}
            </span>
          </button>
        ))}
      </div>

      {/* Expanded protocol detail — one at a time */}
      {expandedId && (() => {
        const m = matches.find((x) => x.protocolId === expandedId);
        if (!m) return null;
        return <ProtocolDetail match={m} />;
      })()}
    </div>
  );
}

function ProtocolDetail({ match: m }: { match: IVProtocolMatch }) {
  return (
    <div
      className={`rounded-lg border p-2.5 space-y-1.5 text-[11px] leading-relaxed ${
        m.highRisk
          ? "bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-900/50"
          : "bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="font-bold text-xs text-slate-800 dark:text-slate-200">
          {m.icon} {m.drug} — {m.drugHe}
        </span>
        {m.highRisk && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-300 font-bold">
            ⚠️ בקרה כפולה
          </span>
        )}
      </div>

      {/* Trigger context */}
      <div className="text-[10px] text-slate-500 dark:text-slate-500">
        Matched: <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded">{m.trigger}</span>
      </div>

      {/* Action items */}
      <div className="space-y-0.5">
        {m.actions.map((a, i) => (
          <div
            key={i}
            className="text-slate-700 dark:text-slate-300 pr-2"
            dir="auto"
            style={{ unicodeBidi: "plaintext" }}
          >
            • {a}
          </div>
        ))}
      </div>
    </div>
  );
}

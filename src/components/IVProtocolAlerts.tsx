import { useState, useMemo } from "react";
import type { PatientEntry } from "../types";
import { matchIVProtocols, type IVProtocolMatch } from "../engine/ivProtocolMatch";

/**
 * Inline IV protocol alerts rendered inside PatientCard.
 *
 * Two visual tiers:
 * - ACTIVE: Drug explicitly on the toren → colored badge, tap to expand prep/dosing.
 * - SUGGEST: Diagnosis implies protocol may be relevant → muted collapsible hint,
 *            not an action item, not a task, just "FYI if needed".
 */
export function IVProtocolAlerts({ patient }: { patient: PatientEntry }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const matches = useMemo(() => matchIVProtocols(patient), [patient]);

  const active = useMemo(() => matches.filter((m) => m.tier === "active"), [matches]);
  const suggestions = useMemo(() => matches.filter((m) => m.tier === "suggest"), [matches]);

  if (matches.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {/* ── ACTIVE: Drug explicitly ordered for you ── */}
      {active.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-1.5">
            {active.map((m) => (
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

          {/* Expanded active detail */}
          {expandedId && (() => {
            const m = active.find((x) => x.protocolId === expandedId);
            if (!m) return null;
            return <ActiveDetail match={m} />;
          })()}
        </div>
      )}

      {/* ── SUGGEST: Diagnosis context — soft FYI ── */}
      {suggestions.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowSuggestions((v) => !v)}
            className="text-[10px] px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 active:bg-slate-100 dark:active:bg-slate-700"
            aria-expanded={showSuggestions}
          >
            📋 פרוטוקולים רלוונטיים ({suggestions.length}) {showSuggestions ? "▴" : "▾"}
          </button>

          {showSuggestions && (
            <div className="mt-1.5 space-y-1.5">
              {suggestions.map((m) => (
                <SuggestionCard
                  key={m.protocolId}
                  match={m}
                  isExpanded={expandedId === m.protocolId}
                  onToggle={() =>
                    setExpandedId((prev) => (prev === m.protocolId ? null : m.protocolId))
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Active tier: expanded prep/dosing/monitoring panel ──
function ActiveDetail({ match: m }: { match: IVProtocolMatch }) {
  return (
    <div
      className={`rounded-lg border p-2.5 space-y-1.5 text-[11px] leading-relaxed ${
        m.highRisk
          ? "bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-900/50"
          : "bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50"
      }`}
    >
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

// ── Suggestion tier: muted, collapsible, clearly not an action ──
function SuggestionCard({
  match: m,
  isExpanded,
  onToggle,
}: {
  match: IVProtocolMatch;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-800/30">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-right active:bg-slate-100 dark:active:bg-slate-700/50 rounded-lg"
      >
        <span className="text-sm opacity-50">{m.icon}</span>
        <div className="flex-1 min-w-0">
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            {m.drug}
          </span>
          <span className="text-[9px] text-slate-400 dark:text-slate-500 mr-1.5">
            — ייתכן שרלוונטי ({m.trigger})
          </span>
        </div>
        <span className={`text-slate-400 text-[9px] transition-transform ${isExpanded ? "rotate-180" : ""}`}>
          ▼
        </span>
      </button>

      {isExpanded && (
        <div className="px-2.5 pb-2 space-y-0.5 border-t border-slate-200/50 dark:border-slate-700/30 pt-1.5">
          <div className="text-[10px] text-slate-400 dark:text-slate-500 italic mb-1">
            לא משימה — לעיון בלבד אם תידרש
          </div>
          {m.actions.map((a, i) => (
            <div
              key={i}
              className="text-[10px] text-slate-500 dark:text-slate-400 pr-2"
              dir="auto"
              style={{ unicodeBidi: "plaintext" }}
            >
              · {a}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * PatientCardAlerts — all clinical safety badges + warnings for a patient.
 *
 * Extracted from PatientCard.tsx (Phase 6.2) to reduce the 1233-LOC monolith.
 * Owns its own showHints toggle state — no prop drilling needed.
 */

import { useState, useMemo, memo } from "react";
import type { PatientEntry } from "../types";
import { LabBadges, AddLabForm } from "./LabTracker";
import { DrugSafetyAlerts } from "./DrugSafetyAlerts";
import { IVProtocolAlerts } from "./IVProtocolAlerts";
import { MedFlagBadges } from "./MedFlags";
import { generateHints } from "../engine/hints";
import { calculateACB } from "../engine/anticholinergicBurden";
import { calculateFallsRisk } from "../engine/fallsRisk";
import { calculateLabTrends, type TrendArrow } from "../engine/labDelta";

// ── ACB badge ────────────────────────────────────────────────────────────────

function ACBBadge({ patient }: { patient: PatientEntry }) {
  const acb = useMemo(() => calculateACB(patient), [patient]);
  if (acb.totalScore === 0) return null;
  const colorClass =
    acb.severity === "high" ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-800" :
    acb.severity === "moderate" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800" :
    "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600";
  return (
    <span
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${colorClass}`}
      title={acb.message}
    >
      ACB {acb.totalScore}
    </span>
  );
}

// ── Falls risk badge ─────────────────────────────────────────────────────────

function FallsRiskBadge({ patient }: { patient: PatientEntry }) {
  const falls = useMemo(() => calculateFallsRisk(patient), [patient]);
  if (falls.severity === "low") return null;
  const colorClass =
    falls.severity === "high" ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-800" :
    "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800";
  return (
    <span
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${colorClass}`}
      title={falls.message}
    >
      {falls.severity === "high" ? "🔴" : "⚠️"} נפילה
    </span>
  );
}

// ── Lab trend arrows ─────────────────────────────────────────────────────────

const TREND_ARROW_COLOR: Record<TrendArrow, string> = {
  "↑↑": "text-red-500",
  "↑": "text-amber-500",
  "→": "text-gray-400",
  "↓": "text-teal-500",
  "↓↓": "text-teal-600",
};

function LabTrendArrows({ patient }: { patient: PatientEntry }) {
  const trends = useMemo(() => calculateLabTrends(patient), [patient]);
  if (trends.length === 0) return null;
  const active = trends.filter(t => t.arrow !== "→");
  if (active.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-0.5">
      {active.slice(0, 4).map(t => (
        <span
          key={t.label}
          className={`inline-flex items-center gap-0.5 text-[10px] font-mono ${TREND_ARROW_COLOR[t.arrow]}`}
          title={t.summary}
        >
          {t.label}{t.arrow}
        </span>
      ))}
    </div>
  );
}

// ── Clinical hints (expandable) ──────────────────────────────────────────────

function ClinicalHints({ patient }: { patient: PatientEntry }) {
  const [showHints, setShowHints] = useState(false);
  const hints = useMemo(() => generateHints(patient), [patient]);
  if (hints.length === 0) return null;
  return (
    <div>
      <button
        type="button"
        onClick={() => setShowHints((v) => !v)}
        className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 active:bg-gray-100"
        aria-expanded={showHints}
        aria-label="הנחיות רקע קליניות"
      >
        💡 הנחיות רקע ({hints.length}) {showHints ? "▴" : "▾"}
      </button>
      {showHints && (
        <div className="mt-2 space-y-2">
          {hints.map((h, i) => (
            <div
              key={i}
              className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5"
            >
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {h.emoji} {h.title}
              </div>
              <ul className="space-y-0.5">
                {h.tips.map((tip, j) => (
                  <li
                    key={j}
                    className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed pr-3"
                    dir="auto"
                    style={{ unicodeBidi: "plaintext" }}
                  >
                    • {tip}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Composite alerts block ───────────────────────────────────────────────────

interface PatientCardAlertsProps {
  patient: PatientEntry;
  showLabForm: boolean;
  onToggleLabForm: () => void;
}

function PatientCardAlertsBase({ patient, showLabForm, onToggleLabForm }: PatientCardAlertsProps) {
  return (
    <>
      {/* Lab sparklines */}
      <LabBadges patient={patient} />
      {/* Lab trend arrows (Δ/day) */}
      <LabTrendArrows patient={patient} />

      {/* Medication safety flags */}
      <MedFlagBadges patient={patient} />

      {/* Geriatric safety badges — ACB + Falls risk */}
      <div className="flex flex-wrap gap-1">
        <ACBBadge patient={patient} />
        <FallsRiskBadge patient={patient} />
      </div>

      {/* Drug interaction & renal dose warnings */}
      <DrugSafetyAlerts patient={patient} />

      {/* IV Protocol alerts */}
      <IVProtocolAlerts patient={patient} />

      {/* Clinical hints */}
      <ClinicalHints patient={patient} />

      {/* Inline lab entry form */}
      {showLabForm && (
        <AddLabForm patient={patient} onClose={onToggleLabForm} />
      )}
    </>
  );
}

export const PatientCardAlerts = memo(PatientCardAlertsBase);

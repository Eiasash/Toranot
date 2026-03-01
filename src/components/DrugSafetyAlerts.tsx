import { useMemo, useState } from "react";
import type { PatientEntry } from "../types";
import {
  checkDrugInteractions,
  checkRenalDoseWarnings,
  checkBeersCriteria,
  type DrugInteraction,
  type RenalWarning,
  type BeersCriteria,
} from "../engine/drugSafety";
import { calculateLabDeltas, type LabDelta } from "../engine/labDelta";

const SEVERITY_ICON = {
  critical: "🔴",
  major: "🟠",
  moderate: "🟡",
  warning: "⚠️",
};

export function DrugSafetyAlerts({ patient }: { patient: PatientEntry }) {
  const [expanded, setExpanded] = useState(false);

  const interactions = useMemo(() => checkDrugInteractions(patient), [patient]);
  const renalWarnings = useMemo(() => checkRenalDoseWarnings(patient), [patient]);
  const labDeltas = useMemo(() => calculateLabDeltas(patient), [patient]);
  const beers = useMemo(() => checkBeersCriteria(patient), [patient]);

  const totalAlerts = interactions.length + renalWarnings.length + labDeltas.length + beers.length;
  if (totalAlerts === 0) return null;

  const hasCritical =
    interactions.some((i) => i.severity === "critical") ||
    renalWarnings.some((w) => w.severity === "critical") ||
    labDeltas.some((d) => d.severity === "critical") ||
    beers.some((b) => b.severity === "avoid");

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={`text-xs px-2.5 py-1 rounded-lg border active:opacity-80 ${
          hasCritical
            ? "bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200 border-red-300 dark:border-red-700 animate-pulse"
            : "bg-amber-50 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700"
        }`}
        aria-expanded={expanded}
        aria-label="התראות בטיחות"
      >
        {hasCritical ? "🔴" : "⚠️"} התראות בטיחות ({totalAlerts}){" "}
        {expanded ? "▴" : "▾"}
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          {/* Drug interactions */}
          {interactions.map((ix, i) => (
            <InteractionCard key={`ix-${i}`} interaction={ix} />
          ))}

          {/* Renal warnings */}
          {renalWarnings.map((w, i) => (
            <RenalCard key={`rn-${i}`} warning={w} />
          ))}

          {/* Lab delta alerts */}
          {labDeltas.map((d, i) => (
            <LabDeltaCard key={`ld-${i}`} delta={d} />
          ))}

          {/* Beers Criteria — age-specific geriatric alerts */}
          {beers.length > 0 && (
            <div className="mt-1">
              <div className="text-[10px] font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider mb-1 px-0.5">
                Beers 2023 — ≥65 שנה
              </div>
              {beers.map((b, i) => (
                <BeersCard key={`br-${i}`} item={b} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InteractionCard({ interaction }: { interaction: DrugInteraction }) {
  const icon = SEVERITY_ICON[interaction.severity];
  const bg =
    interaction.severity === "critical"
      ? "border-red-300 dark:border-red-700 bg-red-50/70 dark:bg-red-900/30"
      : interaction.severity === "major"
      ? "border-orange-300 dark:border-orange-700 bg-orange-50/70 dark:bg-orange-900/30"
      : "border-yellow-300 dark:border-yellow-700 bg-yellow-50/70 dark:bg-yellow-900/30";

  return (
    <div className={`border rounded-lg p-2 text-xs space-y-0.5 ${bg}`}>
      <div className="font-bold dark:text-gray-100">
        {icon} {interaction.risk}
      </div>
      <div className="text-gray-700 dark:text-gray-300">{interaction.detail}</div>
    </div>
  );
}

function RenalCard({ warning }: { warning: RenalWarning }) {
  const icon = warning.severity === "critical" ? "🔴" : "⚠️";
  const bg =
    warning.severity === "critical"
      ? "border-red-300 dark:border-red-700 bg-red-50/70 dark:bg-red-900/30"
      : "border-amber-300 dark:border-amber-700 bg-amber-50/70 dark:bg-amber-900/30";

  return (
    <div className={`border rounded-lg p-2 text-xs space-y-0.5 ${bg}`}>
      <div className="font-bold dark:text-gray-100">
        {icon} {warning.drug} — CrCl {warning.crcl} mL/min
      </div>
      <div className="text-gray-700 dark:text-gray-300">{warning.adjustment}</div>
    </div>
  );
}

function LabDeltaCard({ delta }: { delta: LabDelta }) {
  const icon = delta.severity === "critical" ? "🔴" : "⚠️";
  const arrow = delta.direction === "up" ? "↑" : delta.direction === "down" ? "↓" : "→";
  const bg =
    delta.severity === "critical"
      ? "border-red-300 dark:border-red-700 bg-red-50/70 dark:bg-red-900/30"
      : "border-amber-300 dark:border-amber-700 bg-amber-50/70 dark:bg-amber-900/30";

  return (
    <div className={`border rounded-lg p-2 text-xs space-y-0.5 ${bg}`}>
      <div className="font-bold dark:text-gray-100">
        {icon} {delta.label}: {delta.baseline}{arrow}{delta.latest}{" "}
        <span className="font-mono">
          ({delta.change > 0 ? "+" : ""}{delta.change.toFixed(1)})
        </span>
      </div>
      {delta.message && (
        <div className="text-gray-700 dark:text-gray-300">{delta.message}</div>
      )}
    </div>
  );
}

function BeersCard({ item }: { item: BeersCriteria }) {
  const isAvoid = item.severity === "avoid";
  const bg = isAvoid
    ? "border-purple-300 dark:border-purple-700 bg-purple-50/70 dark:bg-purple-900/20"
    : "border-indigo-300 dark:border-indigo-700 bg-indigo-50/70 dark:bg-indigo-900/20";
  const icon = isAvoid ? "🚫" : "⚠️";

  return (
    <div className={`border rounded-lg p-2 text-xs space-y-0.5 mb-1.5 ${bg}`}>
      <div className="font-bold dark:text-gray-100 flex items-start gap-1">
        <span>{icon}</span>
        <span>{item.drug}</span>
        <span className="ml-auto font-normal text-[10px] text-purple-600 dark:text-purple-400 whitespace-nowrap">
          {item.category}
        </span>
      </div>
      <div className="text-gray-700 dark:text-gray-300">{item.concern}</div>
      <div className="text-purple-700 dark:text-purple-300 font-medium">{item.recommendation}</div>
    </div>
  );
}

import { useState, useMemo } from "react";
import { usePatientsDispatch } from "../context/PatientsContext";
import type { PatientEntry, LabEntry } from "../types";
import { generateId } from "../utils/id";

const COMMON_LABS = ["Cr", "K+", "Na", "WBC", "Hb", "PLT", "CRP", "Glucose", "INR", "Lactate"] as const;

// ── Critical value thresholds ──────────────────────────────
// Returns "critical" (red), "warning" (yellow), or "normal"
type LabSeverity = "critical" | "warning" | "normal";

function labSeverity(label: string, value: number): LabSeverity {
  const l = label.toLowerCase().replace(/[+\s]/g, "");
  switch (l) {
    case "k":
      if (value > 6.0 || value < 2.5) return "critical";
      if (value > 5.5 || value < 3.0) return "warning";
      return "normal";
    case "na":
      if (value < 120 || value > 160) return "critical";
      if (value < 125 || value > 150) return "warning";
      return "normal";
    case "cr":
      if (value > 4.0) return "critical";
      if (value > 2.0) return "warning";
      return "normal";
    case "hb":
      if (value < 7) return "critical";
      if (value < 8) return "warning";
      return "normal";
    case "plt":
      if (value < 20) return "critical";
      if (value < 50) return "warning";
      return "normal";
    case "wbc":
      if (value > 30 || value < 1) return "critical";
      if (value > 20 || value < 2) return "warning";
      return "normal";
    case "glucose":
      if (value < 50 || value > 500) return "critical";
      if (value < 70 || value > 400) return "warning";
      return "normal";
    case "inr":
      if (value > 5) return "critical";
      if (value > 3.5) return "warning";
      return "normal";
    case "lactate":
      if (value > 4) return "critical";
      if (value > 2) return "warning";
      return "normal";
    case "crp":
      if (value > 200) return "critical";
      if (value > 100) return "warning";
      return "normal";
    case "ph":
      if (value < 7.2 || value > 7.55) return "critical";
      if (value < 7.3 || value > 7.5) return "warning";
      return "normal";
    case "ca":
    case "calcium":
      if (value > 14 || value < 6.5) return "critical";
      if (value > 12 || value < 7.5) return "warning";
      return "normal";
    case "mg":
    case "magnesium":
      if (value < 1.0) return "critical";
      if (value < 1.5) return "warning";
      return "normal";
    case "phos":
    case "po4":
    case "phosphate":
      if (value < 1.0) return "critical";
      if (value < 1.5) return "warning";
      return "normal";
    default:
      return "normal";
  }
}

const SEVERITY_STYLE: Record<LabSeverity, string> = {
  critical: "bg-red-100 dark:bg-red-900/40 text-red-900 dark:text-red-200 border-red-400 dark:border-red-600 ring-1 ring-red-400 animate-pulse",
  warning: "bg-amber-50 dark:bg-amber-900/30 text-amber-900 dark:text-amber-200 border-amber-400 dark:border-amber-600",
  normal: "bg-purple-50 dark:bg-purple-900/30 text-purple-900 dark:text-purple-200 border-purple-200 dark:border-purple-700",
};

// ─── Critical value ranges for geriatric patients ───
type CritRange = { critical: [number, number]; warning: [number, number] };
const CRIT_RANGES: Record<string, CritRange> = {
  "K+":      { critical: [2.5, 6.0], warning: [3.0, 5.5] },
  "Na":      { critical: [120, 155], warning: [125, 150] },
  "Cr":      { critical: [-Infinity, 4.0], warning: [-Infinity, 2.0] },
  "Hb":      { critical: [6.0, 20], warning: [7.0, 18] },
  "PLT":     { critical: [20, 1000], warning: [50, 600] },
  "WBC":     { critical: [1.0, 30], warning: [2.0, 20] },
  "Glucose": { critical: [40, 500], warning: [60, 300] },
  "INR":     { critical: [-Infinity, 5.0], warning: [-Infinity, 3.5] },
  "Lactate": { critical: [-Infinity, 4.0], warning: [-Infinity, 2.0] },
  "CRP":     { critical: [-Infinity, Infinity], warning: [-Infinity, 100] },
};

function getLabSeverity(label: string, value: number): "critical" | "warning" | "normal" {
  const range = CRIT_RANGES[label];
  if (!range) return "normal";
  if (value < range.critical[0] || value > range.critical[1]) return "critical";
  if (value < range.warning[0] || value > range.warning[1]) return "warning";
  return "normal";
}

const SEVERITY_STYLES = {
  critical: "bg-red-100 dark:bg-red-900/60 text-red-900 dark:text-red-200 border-red-400 dark:border-red-600 animate-pulse",
  warning: "bg-amber-50 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200 border-amber-400 dark:border-amber-600",
  normal: "bg-purple-50 dark:bg-purple-900/30 text-purple-900 dark:text-purple-200 border-purple-200 dark:border-purple-700",
};

function MiniSparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const h = 20;
  const w = Math.min(values.length * 12, 60);

  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 2) - 1;
      return `${x},${y}`;
    })
    .join(" ");

  // Color: trending up = red (bad for Cr, K, WBC, CRP), trending down = green
  const trend = values[values.length - 1] - values[values.length - 2];
  const color = trend > 0 ? "#dc2626" : trend < 0 ? "#16a34a" : "#6b7280";

  return (
    <svg width={w} height={h} className="inline-block align-middle">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Last point dot */}
      {values.length > 0 && (
        <circle
          cx={(values.length - 1) / (values.length - 1) * w}
          cy={h - ((values[values.length - 1] - min) / range) * (h - 2) - 1}
          r={2}
          fill={color}
        />
      )}
    </svg>
  );
}

export function LabBadges({ patient }: { patient: PatientEntry }) {
  const labs = patient.labs ?? [];
  if (labs.length === 0) return null;

  // Group by label, sorted by time
  const grouped = useMemo(() => {
    const map = new Map<string, LabEntry[]>();
    for (const l of labs) {
      const arr = map.get(l.label) ?? [];
      arr.push(l);
      map.set(l.label, arr);
    }
    for (const [, arr] of map) {
      arr.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    }
    return map;
  }, [labs]);

  return (
    <div className="flex flex-wrap gap-1.5">
      {[...grouped].map(([label, entries]) => {
        const latest = entries[entries.length - 1];
        const values = entries.map((e) => e.value);
        const severity = getLabSeverity(label, latest.value);
        return (
          <span
            key={label}
            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border ${SEVERITY_STYLES[severity]}`}
            title={
              (severity === "critical" ? "⚠️ ערך קריטי!\n" : severity === "warning" ? "⚠ חריג\n" : "") +
              entries
              .map(
                (e) =>
                  `${new Date(e.time).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}: ${e.value}`,
              )
              .join("\n")
            }
          >
            {severity === "critical" && <span className="text-red-600 dark:text-red-400">🔴</span>}
            {severity === "warning" && <span className="text-amber-600 dark:text-amber-400">🟡</span>}
            <span className="font-semibold">{label}</span>
            <span className="tabular-nums">{latest.value}</span>
            <MiniSparkline values={values} />
          </span>
        );
      })}
    </div>
  );
}

export function AddLabForm({
  patient,
  onClose,
}: {
  patient: PatientEntry;
  onClose: () => void;
}) {
  const dispatch = usePatientsDispatch();
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");

  const add = () => {
    const v = parseFloat(value);
    if (!label.trim() || isNaN(v)) return;

    const lab: LabEntry = {
      id: generateId("lab-"),
      label: label.trim(),
      value: v,
      time: new Date().toISOString(),
    };

    dispatch({ type: "ADD_LAB", patientId: patient.id, lab });
    setValue("");
    // Keep label for rapid entry of same lab
  };

  return (
    <div className="space-y-2 pt-2">
      <div className="flex flex-wrap gap-1">
        {COMMON_LABS.map((l) => (
          <button
            key={l}
            onClick={() => setLabel(l)}
            className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
              label === l
                ? "bg-purple-600 text-white border-purple-600"
                : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600"
            }`}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Lab"
          dir="auto"
          className="w-20 px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
        />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="ערך"
          type="number"
          step="any"
          inputMode="decimal"
          className="w-24 px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 tabular-nums"
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
        />
        <button
          onClick={add}
          className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded-lg"
        >
          +
        </button>
        <button
          onClick={onClose}
          className="px-2 py-1.5 text-xs text-gray-500 border border-gray-200 dark:border-gray-600 rounded-lg"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

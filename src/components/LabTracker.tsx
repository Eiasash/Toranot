import { useState, useMemo, useRef, useEffect } from "react";
import { usePatientsDispatch } from "../context/PatientsContext";
import type { PatientEntry, LabEntry } from "../types";
import { generateId } from "../utils/id";
import { hapticWarning } from "../utils/haptics";

const COMMON_LABS = ["Cr", "K+", "Na", "WBC", "Hb", "PLT", "CRP", "Glucose", "INR", "Lactate"] as const;

// ── Critical value thresholds ──────────────────────────────

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

/** Inline quick entry input that appears when tapping a lab chip */
function InlineLabInput({
  label,
  patientId,
  onClose,
}: {
  label: string;
  patientId: string;
  onClose: () => void;
}) {
  const dispatch = usePatientsDispatch();
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = () => {
    const v = parseFloat(value);
    if (isNaN(v)) return;
    const lab: LabEntry = {
      id: generateId("lab-"),
      label,
      value: v,
      time: new Date().toISOString(),
    };
    dispatch({ type: "ADD_LAB", patientId, lab });
    const severity = getLabSeverity(label, v);
    if (severity === "critical" || severity === "warning") hapticWarning();
    onClose();
  };

  return (
    <div className="inline-flex items-center gap-1 mr-1">
      <span className="text-xs font-semibold text-purple-700 dark:text-purple-300">{label}:</span>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") onClose();
        }}
        onBlur={() => { if (!value.trim()) onClose(); }}
        type="number"
        step="any"
        inputMode="decimal"
        placeholder="ערך"
        className="w-16 px-1.5 py-0.5 text-xs border border-purple-300 dark:border-purple-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 tabular-nums"
      />
      <button
        onClick={submit}
        className="text-xs px-1.5 py-0.5 bg-purple-600 text-white rounded"
      >
        +
      </button>
    </div>
  );
}

export function LabBadges({ patient }: { patient: PatientEntry }) {
  const labs = patient.labs ?? [];
  const [editingLabel, setEditingLabel] = useState<string | null>(null);

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

  if (labs.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {[...grouped].map(([label, entries]) => {
        const latest = entries[entries.length - 1];
        const values = entries.map((e) => e.value);
        const severity = getLabSeverity(label, latest.value);

        if (editingLabel === label) {
          return (
            <InlineLabInput
              key={label}
              label={label}
              patientId={patient.id}
              onClose={() => setEditingLabel(null)}
            />
          );
        }

        return (
          <span
            key={label}
            onClick={() => setEditingLabel(label)}
            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border cursor-pointer active:opacity-70 ${SEVERITY_STYLES[severity]}`}
            title={
              (severity === "critical" ? "⚠️ ערך קריטי!\n" : severity === "warning" ? "⚠ חריג\n" : "") +
              entries
              .map(
                (e) =>
                  `${new Date(e.time).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}: ${e.value}`,
              )
              .join("\n") +
              "\nלחץ להוספת ערך חדש"
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

// ── Bulk lab parser ──
// Parses strings like "Cr 1.8, K 5.2, WBC 14, Hb 9.1" or "Na=138 K=4.5 Cr=1.2"
// Also handles "Cr: 1.8 | K+: 5.2 | WBC: 14"
const LAB_ALIASES: Record<string, string> = {
  cr: "Cr", creatinine: "Cr", creat: "Cr",
  k: "K+", "k+": "K+", potassium: "K+",
  na: "Na", sodium: "Na",
  wbc: "WBC", "white cells": "WBC", leukocytes: "WBC",
  hb: "Hb", hgb: "Hb", hemoglobin: "Hb",
  plt: "PLT", platelets: "PLT",
  crp: "CRP",
  glucose: "Glucose", glu: "Glucose", sugar: "Glucose", סוכר: "Glucose",
  inr: "INR",
  lactate: "Lactate", lac: "Lactate",
  albumin: "Albumin", alb: "Albumin",
  urea: "Urea", bun: "Urea",
  ast: "AST", got: "AST",
  alt: "ALT", gpt: "ALT",
  alp: "ALP",
  ggt: "GGT",
  bili: "Bili", bilirubin: "Bili", "total bili": "Bili",
  ldh: "LDH",
  tsh: "TSH",
  hba1c: "HbA1c", a1c: "HbA1c",
  phos: "Phos", phosphate: "Phos",
  mg: "Mg", magnesium: "Mg",
  ca: "Ca", calcium: "Ca",
  iron: "Iron", fe: "Iron",
  ferritin: "Ferritin",
  troponin: "Troponin", trop: "Troponin", "trop i": "Troponin", tnni: "Troponin",
  bnp: "BNP", "nt-probnp": "BNP", ntprobnp: "BNP",
  d_dimer: "D-Dimer", "d-dimer": "D-Dimer", ddimer: "D-Dimer",
  fibrinogen: "Fibrinogen", fib: "Fibrinogen",
  ptt: "PTT", aptt: "PTT",
  pt: "PT",
};

function parseBulkLabs(input: string): Array<{ label: string; value: number }> {
  const results: Array<{ label: string; value: number }> = [];
  // Split on common delimiters: comma, pipe, semicolon, newline, tab
  const segments = input.split(/[,|;\n\t]+/);

  for (const seg of segments) {
    const trimmed = seg.trim();
    if (!trimmed) continue;

    // Match patterns: "Cr 1.8", "Cr: 1.8", "Cr=1.8", "K+ 5.2"
    const match = trimmed.match(/^([a-zA-Zא-ת+\-\s/]+?)\s*[:=]?\s*(\d+\.?\d*)\s*$/);
    if (!match) continue;

    const rawLabel = match[1].trim().toLowerCase();
    const value = parseFloat(match[2]);
    if (isNaN(value)) continue;

    const normalizedLabel = LAB_ALIASES[rawLabel] ?? match[1].trim();
    results.push({ label: normalizedLabel, value });
  }

  return results;
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
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkPreview, setBulkPreview] = useState<Array<{ label: string; value: number }>>([]);

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

  const handleBulkChange = (text: string) => {
    setBulkText(text);
    setBulkPreview(parseBulkLabs(text));
  };

  const submitBulk = () => {
    const parsed = parseBulkLabs(bulkText);
    if (parsed.length === 0) return;
    const now = new Date().toISOString();
    for (const { label: l, value: v } of parsed) {
      dispatch({
        type: "ADD_LAB",
        patientId: patient.id,
        lab: { id: generateId("lab-"), label: l, value: v, time: now },
      });
      const severity = getLabSeverity(l, v);
      if (severity === "critical" || severity === "warning") hapticWarning();
    }
    setBulkText("");
    setBulkPreview([]);
    onClose();
  };

  if (bulkMode) {
    return (
      <div className="space-y-2 pt-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-purple-700 dark:text-purple-300">📋 הדבקת מעבדות</span>
          <button onClick={() => setBulkMode(false)} className="text-xs text-blue-600 dark:text-blue-400">חזרה לרגיל</button>
        </div>
        <textarea
          value={bulkText}
          onChange={(e) => handleBulkChange(e.target.value)}
          placeholder="הדבק: Cr 1.8, K 5.2, WBC 14, Hb 9.1&#10;או: Na=138 | K+=4.5 | Cr=1.2"
          dir="ltr"
          rows={3}
          className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono"
          autoFocus
        />
        {bulkPreview.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {bulkPreview.map((p, i) => {
              const sev = getLabSeverity(p.label, p.value);
              return (
                <span key={i} className={`text-xs px-1.5 py-0.5 rounded border ${SEVERITY_STYLES[sev]}`}>
                  {sev === "critical" ? "🔴 " : sev === "warning" ? "🟡 " : ""}{p.label} {p.value}
                </span>
              );
            })}
          </div>
        )}
        <div className="flex gap-2">
          <button
            onClick={submitBulk}
            disabled={bulkPreview.length === 0}
            className="flex-1 px-3 py-1.5 text-xs bg-purple-600 text-white rounded-lg disabled:opacity-40"
          >
            הוסף {bulkPreview.length} מעבדות
          </button>
          <button onClick={onClose} className="px-2 py-1.5 text-xs text-gray-500 border border-gray-200 dark:border-gray-600 rounded-lg">✕</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 pt-2">
      <div className="flex items-center justify-between">
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
        <button onClick={() => setBulkMode(true)} className="text-xs text-blue-600 dark:text-blue-400 whitespace-nowrap mr-1">📋 הדבק</button>
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

export { parseBulkLabs, LAB_ALIASES };

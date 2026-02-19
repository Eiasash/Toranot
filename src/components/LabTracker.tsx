import { useState, useMemo } from "react";
import { usePatientsDispatch } from "../context/PatientsContext";
import type { PatientEntry, LabEntry } from "../types";
import { generateId } from "../utils/id";

const COMMON_LABS = ["Cr", "K+", "Na", "WBC", "Hb", "PLT", "CRP", "Glucose", "INR", "Lactate"] as const;

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
        return (
          <span
            key={label}
            className="inline-flex items-center gap-1 text-xs bg-purple-50 dark:bg-purple-900/30 text-purple-900 dark:text-purple-200 px-2 py-0.5 rounded border border-purple-200 dark:border-purple-700"
            title={entries
              .map(
                (e) =>
                  `${new Date(e.time).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}: ${e.value}`,
              )
              .join("\n")}
          >
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

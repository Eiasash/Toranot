import { memo, useState, useMemo } from "react";
import type { PatientEntry, LabEntry } from "../types";

// ── Critical value thresholds (same as LabTracker) ──
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

const LAB_COLORS: Record<string, string> = {
  "K+": "#a855f7",    // purple
  "Na": "#3b82f6",    // blue
  "Cr": "#ef4444",    // red
  "Hb": "#dc2626",    // darker red
  "PLT": "#f59e0b",   // amber
  "WBC": "#22c55e",   // green
  "CRP": "#f97316",   // orange
  "Glucose": "#06b6d4", // cyan
  "INR": "#ec4899",   // pink
  "Lactate": "#8b5cf6", // violet
};

function getColor(label: string): string {
  return LAB_COLORS[label] ?? "#6b7280";
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function formatDateTime(iso: string): string {
  return `${formatDate(iso)} ${formatTime(iso)}`;
}

/** SVG chart for a single lab type */
function SingleLabChart({
  label,
  entries,
}: {
  label: string;
  entries: LabEntry[];
}) {
  const sorted = [...entries].sort(
    (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
  );

  const values = sorted.map((e) => e.value);
  if (values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = (max - min) * 0.15 || 1;
  const yMin = min - padding;
  const yMax = max + padding;

  const W = 300;
  const H = 120;
  const PX = 30; // left padding for y-axis labels
  const PR = 10;
  const PT = 10;
  const PB = 25; // bottom for x-axis labels

  const chartW = W - PX - PR;
  const chartH = H - PT - PB;

  const range = CRIT_RANGES[label];
  const color = getColor(label);

  // Map data to chart coords
  const timeMin = new Date(sorted[0].time).getTime();
  const timeMax = new Date(sorted[sorted.length - 1].time).getTime();
  const timeRange = timeMax - timeMin || 1;

  const points = sorted.map((e) => {
    const t = new Date(e.time).getTime();
    const x = PX + ((t - timeMin) / timeRange) * chartW;
    const y = PT + chartH - ((e.value - yMin) / (yMax - yMin)) * chartH;
    return { x, y, value: e.value, time: e.time };
  });

  const polyline = points.map((p) => `${p.x},${p.y}`).join(" ");

  // Warning/critical zone y positions
  const warningYs = range
    ? {
        lo: range.warning[0] > -Infinity ? PT + chartH - ((range.warning[0] - yMin) / (yMax - yMin)) * chartH : null,
        hi: range.warning[1] < Infinity ? PT + chartH - ((range.warning[1] - yMin) / (yMax - yMin)) * chartH : null,
      }
    : null;

  // Latest delta
  const latest = values[values.length - 1];
  const prev = values.length >= 2 ? values[values.length - 2] : null;
  const delta = prev !== null ? latest - prev : null;

  return (
    <div className="space-y-1">
      {/* Header with label, latest value, delta */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full inline-block"
            style={{ backgroundColor: color }}
          />
          <span className="text-sm font-bold dark:text-gray-100">{label}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="font-mono font-bold tabular-nums dark:text-gray-100">
            {latest}
          </span>
          {delta !== null && (
            <span
              className={`text-xs font-mono tabular-nums ${
                delta > 0 ? "text-red-500" : delta < 0 ? "text-green-500" : "text-gray-400"
              }`}
            >
              {delta > 0 ? "▲" : delta < 0 ? "▼" : "─"}{" "}
              {Math.abs(delta).toFixed(1)}
            </span>
          )}
        </div>
      </div>

      {/* SVG Chart */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ maxHeight: "140px" }}
      >
        {/* Warning zone band */}
        {warningYs && (warningYs.lo !== null || warningYs.hi !== null) && (
          <rect
            x={PX}
            y={warningYs.hi ?? PT}
            width={chartW}
            height={
              (warningYs.lo ?? PT + chartH) - (warningYs.hi ?? PT)
            }
            fill={color}
            opacity={0.06}
          />
        )}

        {/* Warning threshold lines */}
        {warningYs?.lo !== null && warningYs?.lo !== undefined && (
          <line
            x1={PX}
            y1={warningYs.lo}
            x2={PX + chartW}
            y2={warningYs.lo}
            stroke={color}
            strokeWidth={0.5}
            strokeDasharray="4 3"
            opacity={0.4}
          />
        )}
        {warningYs?.hi !== null && warningYs?.hi !== undefined && (
          <line
            x1={PX}
            y1={warningYs.hi}
            x2={PX + chartW}
            y2={warningYs.hi}
            stroke={color}
            strokeWidth={0.5}
            strokeDasharray="4 3"
            opacity={0.4}
          />
        )}

        {/* Data line */}
        <polyline
          points={polyline}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data points */}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={3.5} fill={color} />
            {/* Value label on each point */}
            <text
              x={p.x}
              y={p.y - 7}
              textAnchor="middle"
              fontSize={8}
              fontWeight={600}
              fontFamily="monospace"
              fill="currentColor"
              className="dark:fill-gray-300 fill-gray-600"
            >
              {p.value}
            </text>
          </g>
        ))}

        {/* X-axis time labels */}
        {points.map((p, i) => (
          <text
            key={`t-${i}`}
            x={p.x}
            y={H - 4}
            textAnchor="middle"
            fontSize={7}
            className="dark:fill-gray-500 fill-gray-400"
            fontFamily="monospace"
          >
            {sorted.length > 3 && i > 0 && i < sorted.length - 1
              ? formatTime(p.time)
              : formatDateTime(p.time)}
          </text>
        ))}

        {/* Y-axis: min and max */}
        <text
          x={PX - 4}
          y={PT + 8}
          textAnchor="end"
          fontSize={7}
          className="dark:fill-gray-500 fill-gray-400"
          fontFamily="monospace"
        >
          {yMax.toFixed(1)}
        </text>
        <text
          x={PX - 4}
          y={PT + chartH}
          textAnchor="end"
          fontSize={7}
          className="dark:fill-gray-500 fill-gray-400"
          fontFamily="monospace"
        >
          {yMin.toFixed(1)}
        </text>
      </svg>

      {/* Time-value table */}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 px-1 text-[10px] text-gray-500 dark:text-gray-400 font-mono">
        {sorted.map((e) => (
          <span key={e.id}>
            {formatTime(e.time)}: <span className="font-semibold">{e.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Full lab chart panel for a patient — shows all labs with ≥1 entry */
export const LabChart = memo(function LabChart({ patient }: { patient: PatientEntry }) {
  const labs = patient.labs ?? [];
  const [selectedLab, setSelectedLab] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, LabEntry[]>();
    for (const l of labs) {
      const arr = map.get(l.label) ?? [];
      arr.push(l);
      map.set(l.label, arr);
    }
    return map;
  }, [labs]);

  const labNames = [...grouped.keys()];

  if (labs.length === 0) return null;

  // If a specific lab is selected, show only that; otherwise show all with ≥2 values
  const chartsToShow = selectedLab
    ? [[selectedLab, grouped.get(selectedLab)!]] as [string, LabEntry[]][]
    : ([...grouped].filter(([, entries]) => entries.length >= 2) as [string, LabEntry[]][]);

  return (
    <div className="space-y-2">
      {/* Lab filter chips */}
      <div className="flex flex-wrap gap-1">
        <button
          onClick={() => setSelectedLab(null)}
          className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
            selectedLab === null
              ? "bg-purple-600 text-white border-purple-600"
              : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600"
          }`}
        >
          הכל
        </button>
        {labNames.map((name) => (
          <button
            key={name}
            onClick={() => setSelectedLab(selectedLab === name ? null : name)}
            className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
              selectedLab === name
                ? "text-white border-transparent"
                : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600"
            }`}
            style={
              selectedLab === name
                ? { backgroundColor: getColor(name), borderColor: getColor(name) }
                : undefined
            }
          >
            {name} ({grouped.get(name)!.length})
          </button>
        ))}
      </div>

      {/* Charts */}
      {chartsToShow.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-2">
          נדרשים לפחות 2 ערכים לתרשים. הוסף עוד בדיקות.
        </p>
      ) : (
        <div className="space-y-3">
          {chartsToShow.map(([label, entries]) => (
            <div
              key={label}
              className="border border-gray-200 dark:border-gray-700 rounded-xl p-2 bg-gray-50/50 dark:bg-gray-800/30"
            >
              <SingleLabChart label={label} entries={entries} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

/** Format labs for handoff text export */
export function formatLabsForHandoff(patient: PatientEntry): string {
  const labs = patient.labs ?? [];
  if (labs.length === 0) return "";

  const grouped = new Map<string, LabEntry[]>();
  for (const l of labs) {
    const arr = grouped.get(l.label) ?? [];
    arr.push(l);
    grouped.set(l.label, arr);
  }

  const parts: string[] = [];
  for (const [label, entries] of grouped) {
    const sorted = [...entries].sort(
      (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
    );
    const latest = sorted[sorted.length - 1];

    if (sorted.length === 1) {
      parts.push(`${label}: ${latest.value}`);
    } else {
      const prev = sorted[sorted.length - 2];
      const delta = latest.value - prev.value;
      const arrow = delta > 0 ? "↑" : delta < 0 ? "↓" : "→";
      // Show trend: prev → latest
      parts.push(
        `${label}: ${prev.value}${arrow}${latest.value}`
      );
    }
  }

  return parts.join(" | ");
}

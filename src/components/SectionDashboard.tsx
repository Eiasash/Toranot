import { useMemo } from "react";
import type { PatientEntry, PatientSection, Section } from "../types";
import { SECTION_LABEL, patientSectionLabel } from "../types";

interface SectionSummary {
  section: PatientSection;
  total: number;
  statTasks: number;
  urgentTasks: number;
  pendingTasks: number;
  criticalLabs: number;
  noDoneTasks: number;     // patients with 0 completed tasks
  flaggedPatients: number; // ISO, NPO, DNR
}

function getLabSeverity(label: string, value: number): "critical" | "warning" | "normal" {
  const CRIT: Record<string, [number, number]> = {
    "K+": [2.5, 6.0], "Na": [120, 155], "Cr": [-Infinity, 4.0],
    "Hb": [6.0, 20], "PLT": [20, 1000], "WBC": [1.0, 30],
    "Glucose": [40, 500], "INR": [-Infinity, 5.0], "Lactate": [-Infinity, 4.0],
  };
  const range = CRIT[label];
  if (!range) return "normal";
  if (value < range[0] || value > range[1]) return "critical";
  return "normal";
}

function summarizeSection(patients: PatientEntry[]): Omit<SectionSummary, "section"> {
  let statTasks = 0;
  let urgentTasks = 0;
  let pendingTasks = 0;
  let criticalLabs = 0;
  let noDoneTasks = 0;
  let flaggedPatients = 0;

  for (const p of patients) {
    const allTasks = [...p.tasks, ...p.generatedTasks.filter(t => !t.dismissed)];
    const pending = allTasks.filter((t) => !t.done);
    const done = allTasks.filter((t) => t.done);

    statTasks += pending.filter((t) => t.urgency === "stat").length;
    urgentTasks += pending.filter((t) => t.urgency === "urgent").length;
    pendingTasks += pending.length;

    if (allTasks.length > 0 && done.length === 0) noDoneTasks++;

    // Critical labs
    for (const lab of p.labs ?? []) {
      if (getLabSeverity(lab.label, lab.value) === "critical") {
        criticalLabs++;
        break; // count patient once
      }
    }

    // Flags
    if (p.flags.some((f) => /ISO|NPO|DNR|DNI|FALL/i.test(f))) {
      flaggedPatients++;
    }
  }

  return { total: patients.length, statTasks, urgentTasks, pendingTasks, criticalLabs, noDoneTasks, flaggedPatients };
}

export function SectionDashboard({
  patients,
  onSelectSection,
}: {
  patients: PatientEntry[];
  onSelectSection: (section: Section) => void;
}) {
  const summaries = useMemo(() => {
    const map = new Map<PatientSection, PatientEntry[]>();
    for (const p of patients) {
      const arr = map.get(p.section) ?? [];
      arr.push(p);
      map.set(p.section, arr);
    }

    const result: SectionSummary[] = [];
    for (const [section, pts] of map) {
      result.push({ section, ...summarizeSection(pts) });
    }

    // Sort by urgency: most stat tasks first
    return result.sort((a, b) => b.statTasks - a.statTasks || b.urgentTasks - a.urgentTasks);
  }, [patients]);

  const totalStats = summaries.reduce((s, a) => s + a.statTasks, 0);
  const totalPatients = summaries.reduce((s, a) => s + a.total, 0);
  const totalPending = summaries.reduce((s, a) => s + a.pendingTasks, 0);

  return (
    <div className="space-y-3">
      {/* Overall summary */}
      <div className="flex gap-3 text-center">
        <div className="flex-1 bg-gray-50 dark:bg-gray-800/50 rounded-xl p-2">
          <div className="text-xl font-bold dark:text-gray-100">{totalPatients}</div>
          <div className="text-[10px] text-gray-500 dark:text-gray-400">חולים</div>
        </div>
        <div className="flex-1 bg-red-50 dark:bg-red-900/30 rounded-xl p-2">
          <div className="text-xl font-bold text-red-600 dark:text-red-400">{totalStats}</div>
          <div className="text-[10px] text-red-600 dark:text-red-400">סטט</div>
        </div>
        <div className="flex-1 bg-amber-50 dark:bg-amber-900/30 rounded-xl p-2">
          <div className="text-xl font-bold text-amber-600 dark:text-amber-400">{totalPending}</div>
          <div className="text-[10px] text-amber-600 dark:text-amber-400">ממתינים</div>
        </div>
      </div>

      {/* Per-section cards */}
      {summaries.map((s) => (
        <button
          key={s.section}
          onClick={() => s.section !== "UNKNOWN_SECTION" && onSelectSection(s.section as Section)}
          className="w-full text-right border border-gray-200 dark:border-gray-700 rounded-xl p-3 bg-white dark:bg-gray-800/40 active:bg-gray-50 dark:active:bg-gray-700/40 space-y-1.5 transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold dark:text-gray-100">
              {patientSectionLabel(s.section)} ({s.total})
            </span>
            <div className="flex gap-1.5">
              {s.statTasks > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 font-bold">
                  🔴 {s.statTasks}
                </span>
              )}
              {s.urgentTasks > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 font-bold">
                  🟡 {s.urgentTasks}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-[10px] text-gray-500 dark:text-gray-400">
            <span>⏳ {s.pendingTasks} ממתינים</span>
            {s.criticalLabs > 0 && (
              <span className="text-red-600 dark:text-red-400 font-semibold">🔬 {s.criticalLabs} מעב. קריטי</span>
            )}
            {s.noDoneTasks > 0 && (
              <span className="text-orange-600 dark:text-orange-400">⚡ {s.noDoneTasks} ללא ביצוע</span>
            )}
            {s.flaggedPatients > 0 && (
              <span>🚩 {s.flaggedPatients} דגלים</span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}

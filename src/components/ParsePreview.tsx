/**
 * ParsePreview — shows what WILL be imported before committing to app state.
 *
 * Clinical rationale: Claude Vision OCR is very good but not infallible.
 * Common failure modes:
 *   - Room number misread (49/1 → 48/1)
 *   - Two patient rows merged
 *   - Hebrew name OCR error (שרה → שרח)
 *   - Wrong section assignment when the printed page title is ambiguous
 *
 * The preview gives the doctor one fast visual scan before tasks are
 * generated, rules fire, and the list becomes live. This is the same
 * principle as a medication double-check before administration.
 *
 * Design: quick to scan — room + name + age prominent, tasks count secondary.
 * One tap to confirm. One tap to go back and re-scan.
 */

import type { PatientEntry } from "../types";
import { SECTION_LABEL } from "../types";

interface ParsePreviewProps {
  patients: PatientEntry[];
  onConfirm: () => void;
  onCancel: () => void;
}

/** Group patients by section for a clean visual layout */
function groupBySection(patients: PatientEntry[]) {
  const map = new Map<string, PatientEntry[]>();
  for (const p of patients) {
    const label = SECTION_LABEL[p.section] ?? p.section;
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(p);
  }
  return map;
}

export function ParsePreview({ patients, onConfirm, onCancel }: ParsePreviewProps) {
  const sections = groupBySection(patients);
  const totalTasks = patients.reduce(
    (sum, p) => sum + p.tasks.length + p.generatedTasks.length,
    0,
  );
  const statCount = patients.reduce(
    (sum, p) =>
      sum +
      [...p.tasks, ...p.generatedTasks].filter(
        (t) => !t.done && t.urgency === "stat",
      ).length,
    0,
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="bg-slate-800 text-white px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <button
          onClick={onCancel}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-300 active:bg-slate-700"
          aria-label="חזור לסריקה"
        >
          ✕
        </button>
        <div className="flex-1">
          <h2 className="text-base font-bold">תצוגה מקדימה — {patients.length} חולים</h2>
          <p className="text-xs text-slate-400">
            {totalTasks} משימות
            {statCount > 0 && (
              <span className="text-red-400 mr-1"> · 🔴 {statCount} סטט</span>
            )}
            {" — בדוק לפני הייבוא"}
          </p>
        </div>
      </div>

      {/* Warning banner */}
      <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 px-4 py-2 text-xs text-amber-800 dark:text-amber-300 flex-shrink-0">
        <span className="font-semibold">⚠️ בדוק חדר ושם לכל חולה לפני אישור.</span>
        {" "}שגיאת OCR בחדר עלולה להוביל למשימות בחולה הלא נכון.
      </div>

      {/* Patient list */}
      <div className="flex-1 overflow-y-auto">
        {Array.from(sections.entries()).map(([sectionLabel, pts]) => (
          <div key={sectionLabel}>
            {/* Section header */}
            <div className="sticky top-0 bg-slate-100 dark:bg-slate-800 px-4 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 z-10">
              {sectionLabel} · {pts.length} חולים
            </div>

            {pts.map((p) => {
              const allTasks = [...p.tasks, ...p.generatedTasks];
              const pending = allTasks.filter((t) => !t.done);
              const statTasks = pending.filter((t) => t.urgency === "stat");
              const urgentTasks = pending.filter((t) => t.urgency === "urgent");
              const hasCritical = statTasks.length > 0;

              return (
                <div
                  key={p.id}
                  className={`px-4 py-3 border-b border-gray-100 dark:border-gray-800 ${
                    hasCritical
                      ? "bg-red-50/50 dark:bg-red-900/10"
                      : "bg-white dark:bg-gray-900"
                  }`}
                >
                  {/* Main row: room + name + age */}
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-sm font-bold text-blue-700 dark:text-blue-400 min-w-[3.5rem]">
                      {p.room ?? "?"}
                    </span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex-1">
                      {p.name ?? "?"}
                    </span>
                    {p.age != null && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {p.age}♦
                      </span>
                    )}
                  </div>

                  {/* Diagnosis */}
                  {p.diagnosis && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                      {p.diagnosis}
                    </div>
                  )}

                  {/* Flags + task summary */}
                  <div className="flex flex-wrap gap-1 mt-1">
                    {p.flags.map((f) => (
                      <span
                        key={f}
                        className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                          f === "DNR" || f === "DNI"
                            ? "bg-red-600 text-white"
                            : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                        }`}
                      >
                        {f}
                      </span>
                    ))}

                    {statTasks.length > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 font-semibold">
                        🔴 {statTasks.length} סטט
                      </span>
                    )}
                    {urgentTasks.length > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300 font-semibold">
                        🟡 {urgentTasks.length} דחוף
                      </span>
                    )}
                    {pending.length > 0 && statTasks.length === 0 && urgentTasks.length === 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                        {pending.length} משימות
                      </span>
                    )}
                  </div>

                  {/* First stat task text preview */}
                  {statTasks.length > 0 && (
                    <div className="mt-1 text-xs text-red-700 dark:text-red-300 truncate">
                      📋 {statTasks[0].text}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer CTA */}
      <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-900 space-y-2">
        <button
          onClick={onConfirm}
          className="w-full py-4 bg-blue-600 text-white rounded-xl text-lg font-bold active:bg-blue-700 active:scale-[0.98] transition-transform"
        >
          ✓ אשר ייבוא {patients.length} חולים
        </button>
        <button
          onClick={onCancel}
          className="w-full py-3 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-xl text-base font-medium active:bg-gray-200 dark:active:bg-gray-700"
        >
          חזור — סרוק שוב / ערוך
        </button>
      </div>
    </div>
  );
}

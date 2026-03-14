/**
 * ParsePreview — Enhanced with inline field editing + confidence indicators.
 *
 * NEW: Tap any field (room, name, age, diagnosis) to edit it in-place.
 * Low-confidence fields get a yellow border to draw attention.
 * Confidence is based on OCR confidence from the parser.
 *
 * Clinical safety: room number errors are the #1 cause of wrong-patient
 * task assignment. Yellow highlighting on low-confidence rooms ensures
 * the doctor checks before importing.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import type { PatientEntry } from "../types";
import { SECTION_LABEL, patientSectionLabel } from "../types";

interface ParsePreviewProps {
  patients: PatientEntry[];
  onConfirm: (editedPatients: PatientEntry[]) => void;
  onCancel: () => void;
}

function groupBySection(patients: PatientEntry[]) {
  const map = new Map<string, PatientEntry[]>();
  for (const p of patients) {
    const label = patientSectionLabel(p.section);
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(p);
  }
  return map;
}

// ── Inline editable field ──
function EditableField({
  value,
  onChange,
  placeholder,
  className,
  lowConfidence,
  mono,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
  lowConfidence?: boolean;
  mono?: boolean;
  type?: "text" | "number";
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = useCallback(() => {
    setEditing(false);
    if (draft !== value) onChange(draft);
  }, [draft, value, onChange]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        type={type}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") { setDraft(value); setEditing(false); }
        }}
        className={`px-1.5 py-0.5 rounded border-2 border-blue-400 bg-blue-50 dark:bg-blue-900/30 text-sm outline-none ${mono ? "font-mono" : ""} ${className ?? ""}`}
        dir="auto"
      />
    );
  }

  return (
    <button
      onClick={() => { setDraft(value); setEditing(true); }}
      className={`px-1.5 py-0.5 rounded text-sm transition-colors cursor-text text-right ${
        lowConfidence
          ? "border-2 border-amber-400 bg-amber-50 dark:bg-amber-900/20"
          : "border border-transparent hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800"
      } ${mono ? "font-mono" : ""} ${className ?? ""}`}
      title="לחץ לעריכה"
    >
      {value || <span className="text-gray-400 italic">{placeholder}</span>}
      {lowConfidence && <span className="mr-1 text-amber-500 text-[10px]">⚠️</span>}
    </button>
  );
}

// ── Delete patient button ──
function DeleteButton({ onDelete }: { onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="flex items-center gap-1">
        <button
          onClick={onDelete}
          className="text-[10px] px-2 py-1 bg-red-600 text-white rounded font-semibold"
        >
          מחק
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-[10px] px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="text-gray-400 hover:text-red-500 text-sm px-1"
      title="הסר חולה"
    >
      🗑️
    </button>
  );
}

export function ParsePreview({ patients: initialPatients, onConfirm, onCancel }: ParsePreviewProps) {
  const [patients, setPatients] = useState<PatientEntry[]>(initialPatients);

  const updatePatient = useCallback((id: string, update: Partial<PatientEntry>) => {
    setPatients((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...update } : p)),
    );
  }, []);

  const deletePatient = useCallback((id: string) => {
    setPatients((prev) => prev.filter((p) => p.id !== id));
  }, []);

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
  const lowConfCount = patients.filter((p) => p.confidence < 0.7).length;
  const unknownSectionCount = patients.filter((p) => p.section === "UNKNOWN_SECTION").length;

  // Import gate: block if >20% of rows are low-confidence OR any patient has UNKNOWN_SECTION.
  // UNKNOWN_SECTION means no section header was seen — silently importing would place patients
  // in the wrong ward. The doctor must assign sections in the preview before importing.
  const importBlocked =
    unknownSectionCount > 0 ||
    (patients.length > 0 && lowConfCount / patients.length > 0.2);

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
            {" — "}
            <span className="text-blue-300">לחץ על שדה לעריכה</span>
          </p>
        </div>
      </div>

      {/* Warning banners */}
      <div className="flex-shrink-0">
        <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 px-4 py-2 text-xs text-amber-800 dark:text-amber-300">
          <span className="font-semibold">⚠️ בדוק חדר ושם לכל חולה לפני אישור.</span>
          {" "}שגיאת OCR בחדר עלולה להוביל למשימות בחולה הלא נכון.
        </div>
        {lowConfCount > 0 && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 px-4 py-1.5 text-xs text-amber-700 dark:text-amber-400">
            🔍 <span className="font-semibold">{lowConfCount} שדות</span> עם ביטחון OCR נמוך — מסומנים בצהוב
          </div>
        )}
      </div>

      {/* Patient list with inline editing */}
      <div className="flex-1 overflow-y-auto">
        {Array.from(sections.entries()).map(([sectionLabel, pts]) => (
          <div key={sectionLabel}>
            <div className="sticky top-0 bg-slate-100 dark:bg-slate-800 px-4 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 z-10">
              {sectionLabel} · {pts.length} חולים
            </div>

            {pts.map((p) => {
              const allTasks = [...p.tasks, ...p.generatedTasks];
              const pending = allTasks.filter((t) => !t.done);
              const statTasks = pending.filter((t) => t.urgency === "stat");
              const urgentTasks = pending.filter((t) => t.urgency === "urgent");
              const hasCritical = statTasks.length > 0;
              const isLowConf = p.confidence < 0.8;

              return (
                <div
                  key={p.id}
                  className={`px-4 py-3 border-b border-gray-100 dark:border-gray-800 ${
                    hasCritical
                      ? "bg-red-50/50 dark:bg-red-900/10"
                      : isLowConf
                      ? "bg-amber-50/30 dark:bg-amber-900/5"
                      : "bg-white dark:bg-gray-900"
                  }`}
                >
                  {/* Editable row: room + name + age + delete */}
                  <div className="flex items-center gap-1.5">
                    <EditableField
                      value={p.room ?? ""}
                      onChange={(v) => updatePatient(p.id, { room: v || null })}
                      placeholder="חדר"
                      className="text-blue-700 dark:text-blue-400 font-bold min-w-[3rem] text-center"
                      lowConfidence={isLowConf}
                      mono
                    />
                    <EditableField
                      value={p.name ?? ""}
                      onChange={(v) => updatePatient(p.id, { name: v || null })}
                      placeholder="שם"
                      className="font-semibold text-gray-900 dark:text-gray-100 flex-1"
                      lowConfidence={isLowConf}
                    />
                    {p.age != null && (
                      <EditableField
                        value={String(p.age)}
                        onChange={(v) => updatePatient(p.id, { age: parseInt(v) || null })}
                        placeholder="גיל"
                        className="text-gray-500 dark:text-gray-400 w-10 text-center"
                        type="number"
                      />
                    )}
                    <DeleteButton onDelete={() => deletePatient(p.id)} />
                  </div>

                  {/* Editable diagnosis */}
                  {(p.diagnosis || isLowConf) && (
                    <div className="mt-0.5">
                      <EditableField
                        value={p.diagnosis ?? ""}
                        onChange={(v) => updatePatient(p.id, { diagnosis: v || null })}
                        placeholder="אבחנה"
                        className="text-xs text-gray-500 dark:text-gray-400 w-full"
                      />
                    </div>
                  )}

                  {/* Flags + task summary (read-only) */}
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

                    {/* Confidence badge */}
                    {isLowConf && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 font-semibold">
                        🔍 OCR {Math.round(p.confidence * 100)}%
                      </span>
                    )}
                  </div>

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

      {/* Footer */}
      <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-900 space-y-2">
        {importBlocked && (
          <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-xl px-3 py-2">
            <span className="text-amber-600 text-base mt-0.5">⚠</span>
            <p className="text-xs text-amber-800 dark:text-amber-300">
              {unknownSectionCount > 0
                ? `${unknownSectionCount} חולים ללא קטע — הגדר קטע לפני ייבוא`
                : `נמצאו שורות בעייתיות (${lowConfCount} מתוך ${patients.length}) — בדוק לפני ייבוא`}
            </p>
          </div>
        )}
        <button
          onClick={() => onConfirm(patients)}
          disabled={patients.length === 0 || importBlocked}
          className="w-full py-4 bg-blue-600 text-white rounded-xl text-lg font-bold active:bg-blue-700 active:scale-[0.98] transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {importBlocked ? "⚠ תקן שגיאות לפני ייבוא" : `✓ אשר ייבוא ${patients.length} חולים`}
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

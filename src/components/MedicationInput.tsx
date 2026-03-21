/**
 * MedicationInput — structured medication list for a patient.
 *
 * Paste the home medication list from תיק אשפוז. One drug per line.
 * Feeds directly into ACB, falls risk, drug interaction, Beers engines
 * for accurate scoring (instead of relying on regex over free-text handover notes).
 *
 * Supports:
 *   - Paste multi-line text (one drug per line)
 *   - Comma-separated input (auto-split)
 *   - Manual line-by-line entry
 *   - Quick clear all
 */

import { useState, useMemo } from "react";
import type { PatientEntry } from "../types";
import { usePatientsDispatch } from "../context/PatientsContext";
import { calculateACB } from "../engine/anticholinergicBurden";

interface MedicationInputProps {
  patient: PatientEntry;
  onClose: () => void;
}

function parseMedText(raw: string): string[] {
  // Split on newlines, commas, or semicolons. Trim each. Drop empties.
  return raw
    .split(/[\n,;]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

export function MedicationInput({ patient, onClose }: MedicationInputProps) {
  const dispatch = usePatientsDispatch();
  const existing = patient.medications ?? [];
  const [draft, setDraft] = useState(existing.join("\n"));
  const [mode, setMode] = useState<"view" | "edit">(existing.length > 0 ? "view" : "edit");

  const parsed = useMemo(() => parseMedText(draft), [draft]);

  // Live ACB preview from the draft
  const previewPatient = useMemo(
    () => ({ ...patient, medications: parsed }),
    [patient, parsed],
  );
  const acbPreview = useMemo(() => calculateACB(previewPatient), [previewPatient]);

  const save = () => {
    dispatch({
      type: "SET_MEDICATIONS",
      patientId: patient.id,
      medications: parsed,
    });
    setMode("view");
  };

  const clear = () => {
    dispatch({
      type: "SET_MEDICATIONS",
      patientId: patient.id,
      medications: [],
    });
    setDraft("");
    setMode("edit");
  };

  if (mode === "view" && existing.length > 0) {
    return (
      <div className="bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-lg p-2.5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wider">
            💊 תרופות ({existing.length})
          </span>
          <div className="flex gap-1.5">
            <button
              onClick={() => { setDraft(existing.join("\n")); setMode("edit"); }}
              className="text-[10px] text-violet-500 active:text-violet-700"
            >
              ✏️
            </button>
            <button onClick={onClose} className="text-[10px] text-gray-400">✕</button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {existing.map((med, i) => (
            <span
              key={i}
              className="text-[11px] bg-violet-100 dark:bg-violet-800/40 text-violet-800 dark:text-violet-200 px-1.5 py-0.5 rounded"
              dir="auto"
              style={{ unicodeBidi: "plaintext" }}
            >
              {med}
            </span>
          ))}
        </div>
        {acbPreview.totalScore > 0 && (
          <div className={`mt-1.5 text-[10px] font-medium ${
            acbPreview.severity === "high" ? "text-red-600 dark:text-red-400" :
            acbPreview.severity === "moderate" ? "text-amber-600 dark:text-amber-400" :
            "text-gray-500"
          }`}>
            ACB {acbPreview.totalScore} — {acbPreview.detectedDrugs.map(d => d.name).join(", ")}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-lg p-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wider">
          💊 הדבק רשימת תרופות
        </span>
        <button onClick={onClose} className="text-[10px] text-gray-400">✕</button>
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={"Omeprazole 20mg\nMetoprolol 50mg\nAmlodipine 5mg\n...או הדבק מתיק אשפוז"}
        dir="auto"
        rows={5}
        autoFocus
        className="w-full px-2.5 py-1.5 text-xs border border-violet-300 dark:border-violet-700 rounded-lg bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 resize-none placeholder:text-gray-400 dark:placeholder:text-gray-600 font-mono"
      />
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-[10px] text-gray-500">
          {parsed.length > 0 ? `${parsed.length} תרופות` : ""}
          {acbPreview.totalScore > 0 && ` · ACB ${acbPreview.totalScore}`}
        </span>
        <div className="flex gap-1.5">
          {existing.length > 0 && (
            <button onClick={clear} className="text-[10px] px-2 py-1 rounded border border-red-200 dark:border-red-800 text-red-500 active:bg-red-50">
              נקה
            </button>
          )}
          <button
            onClick={save}
            disabled={parsed.length === 0}
            className="text-[10px] px-2.5 py-1 rounded-lg bg-violet-600 text-white active:bg-violet-700 disabled:opacity-40"
          >
            שמור ({parsed.length})
          </button>
          <button onClick={onClose} className="text-[10px] px-2 py-1 rounded border border-gray-300 dark:border-gray-600 text-gray-500">
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}

/** Compact med count badge for PatientCard header — shows pill count */
export function MedCountBadge({ patient }: { patient: PatientEntry }) {
  const count = (patient.medications ?? []).length;
  if (count === 0) return null;
  return (
    <span
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 border border-violet-200 dark:border-violet-800"
      title={`${count} תרופות רשומות`}
    >
      💊 {count}
    </span>
  );
}

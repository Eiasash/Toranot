import { useState, lazy, Suspense } from "react";
import { usePatientsDispatch } from "../context/PatientsContext";
import { ParsePreview } from "./ParsePreview";
import { parsePatientList } from "../parser/parsePatientList";
// Lazy — Scanner pulls in camera API code; AddAdmissionModal pulls in AI extraction
const Scanner = lazy(() => import("./Scanner").then(m => ({ default: m.Scanner })));
const AddAdmissionModal = lazy(() => import("./AddAdmissionModal").then(m => ({ default: m.AddAdmissionModal })));
import type { PatientEntry } from "../types";

type InputMode = "closed" | "choose" | "scan" | "text" | "admission";

const PLACEHOLDER = `הדביקו רשימת חולים כאן. פורמט גמיש:

צד א
101 כהן יוסף 72 דלקת ריאות DNR | תורן: תרביות דם; צילום חזה | מחר: CT
102 לוי שרה 65 אי ספיקת לב NPO | תורן: א.ק.ג דחוף | סטורציה 88%
54/2 דוד מרים 80 COPD + סוכרת | תורן: גזים; BS q6h | תוכנית: BiPAP

כל מה שאחרי תורן: → משימות שלך
כל מה שאחרי מחר: → הערות לבוקר
כל השאר → רקע / מצב`;

export function InputArea() {
  const [mode, setMode] = useState<InputMode>("choose");
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<{ text: string; patients: PatientEntry[] } | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const dispatch = usePatientsDispatch();

  /** Parse text → show preview instead of committing immediately */
  function triggerPreview(importText?: string) {
    const t = (importText ?? text).trim();
    if (!t) return;

    setParseError(null);
    const parsed = parsePatientList(t);
    if (parsed.length === 0) {
      // Nothing parsed — show a clear error inline rather than importing empty
      setParseError("לא זוהו חולים בטקסט. פורמט מצופה: 101 כהן יוסף 72 דלקת ריאות");
      return;
    }

    // Show preview — don't commit to state yet
    setPreview({ text: t, patients: parsed });
  }

  /** User confirmed preview — now commit (with any inline edits) */
  function confirmImport(editedPatients?: PatientEntry[]) {
    if (!preview) return;
    if (editedPatients) {
      // Lossless path: pass PatientEntry[] directly to mergeScan via
      // MERGE_PATIENTS — no text round-trip, preserves tasks/notes/photos.
      dispatch({ type: "MERGE_PATIENTS", patients: editedPatients });
    } else {
      dispatch({ type: "IMPORT_TEXT", text: preview.text });
    }
    setPreview(null);
    setText("");
    setMode("closed");
  }

  /** User went back from preview */
  function cancelPreview() {
    setPreview(null);
    // Stay in current mode so they can edit/re-scan
  }

  // ── Parse preview fullscreen overlay ──
  if (preview) {
    return (
      <ParsePreview
        patients={preview.patients}
        onConfirm={confirmImport}
        onCancel={cancelPreview}
      />
    );
  }

  // ── Admission modal ──
  if (mode === "admission") {
    return (
      <Suspense fallback={null}>
      <AddAdmissionModal
        onClose={() => setMode("choose")}
        onSuccess={() => setMode("closed")}
      />
    </Suspense>
    );
  }

  // ── Collapsed bar ──
  if (mode === "closed") {
    return (
      <div className="flex gap-2 p-3">
        <button
          onClick={() => setMode("choose")}
          className="flex-1 py-3 bg-blue-600 text-white rounded-xl text-sm font-medium active:bg-blue-700 active:scale-[0.98] transition-transform"
        >
          + הוסף חולים
        </button>
      </div>
    );
  }

  // ── Choose mode: scan or type ──
  if (mode === "choose") {
    return (
      <div className="p-4 space-y-3">
        <p className="text-center text-gray-500 text-sm">איך להזין חולים?</p>
        <button
          onClick={() => setMode("scan")}
          className="flex items-center justify-center gap-3 w-full py-5 bg-emerald-600 text-white rounded-xl text-lg font-medium active:bg-emerald-700 active:scale-[0.98] transition-transform"
        >
          <CameraIcon />
          צלם דף תורן
        </button>
        <button
          onClick={() => setMode("text")}
          className="flex items-center justify-center gap-3 w-full py-4 bg-gray-100 text-gray-700 rounded-xl text-base font-medium active:bg-gray-200 active:scale-[0.98] transition-transform"
        >
          <TextIcon />
          הקלד / הדבק טקסט
        </button>
        <button
          onClick={() => setMode("admission")}
          className="flex items-center justify-center gap-3 w-full py-4 bg-blue-50 text-blue-700 rounded-xl text-base font-medium border border-blue-200 active:bg-blue-100 active:scale-[0.98] transition-transform"
        >
          🏥 הוסף קבלה חדשה
        </button>
      </div>
    );
  }

  // ── Scan mode ──
  if (mode === "scan") {
    return (
      <div className="p-4">
        <Suspense fallback={<div className="p-4 text-center text-sm text-gray-500 animate-pulse">טוען מצלמה...</div>}>
        <Scanner
          onTextExtracted={(t) => triggerPreview(t)}
          onCancel={() => setMode("choose")}
        />
      </Suspense>
      </div>
    );
  }

  // ── Text mode ──
  return (
    <div className="p-4 space-y-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={PLACEHOLDER}
        dir="auto"
        rows={8}
        autoFocus
        style={{ unicodeBidi: "plaintext" }}
        className="w-full p-3 border border-gray-300 rounded-xl bg-white text-gray-900 placeholder:text-gray-400 text-base leading-relaxed resize-y focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none whitespace-pre-wrap break-words"
      />
      {parseError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-700 text-right">
          ❌ {parseError}
        </div>
      )}
      <button
        onClick={() => { setParseError(null); triggerPreview(); }}
        disabled={!text.trim()}
        className="w-full py-4 bg-blue-600 text-white rounded-xl text-lg font-medium active:bg-blue-700 active:scale-[0.98] transition-transform disabled:opacity-40 disabled:pointer-events-none"
      >
        תצוגה מקדימה ←
      </button>
      <button
        onClick={() => setMode("choose")}
        className="w-full py-3 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium active:bg-gray-200"
      >
        חזור
      </button>
    </div>
  );
}

function CameraIcon() {
  return (
    <svg width={28} height={28} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

function TextIcon() {
  return (
    <svg width={22} height={22} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 113 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

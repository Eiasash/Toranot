import { useState, useRef, useEffect, useCallback } from "react";
import { usePatientsState, usePatientsDispatch } from "../context/PatientsContext";
import type { Urgency } from "../types";
import { generateId } from "../utils/id";

// Rule-based urgency detection — no AI
function detectUrgency(text: string): Urgency {
  const t = text.toLowerCase();
  const statKeywords = [
    /hypoten/i, /ל"ד נמוך/i, /bp.*[<\u003c].*8[0-9]/i, /חום.*[4-9][0-9]\.[0-9]/i, /fever/i,
    /desat/i, /סטורציה/i, /sat.*[<\u003c].*8[0-9]/i, /chest.?pain/i, /כאב בחזה/i,
    /puls.*les/i, /unrespons/i, /לחץ נמוך/i, /cardiac/i,
  ];
  const urgentKeywords = [
    /confus/i, /בלבול/i, /agitat/i, /fall/i, /נפילה/i, /bleed/i, /דימום/i,
    /pain/i, /כאב/i, /vomit/i, /הקא/i, /dyspn/i, /קוצר נשימה/i,
  ];
  if (statKeywords.some(r => r.test(t))) return "stat";
  if (urgentKeywords.some(r => r.test(t))) return "urgent";
  return "routine";
}

// Try to extract room from "52/1" "52-1" "חדר 52" "חד' 52" patterns
function extractRoom(text: string): string | null {
  // Prefer keeping bed when present, to avoid ambiguous matches.
  const m = text.match(
    /(?:חד[ר']?\s*'?(\d{2,3})(?:\s*[\/\-]\s*(\d))?|\b(\d{2,3})\s*[\/\-]\s*(\d)\b)/,
  );
  if (!m) return null;
  const room = m[1] ?? m[3];
  const bed = m[2] ?? m[4];
  if (!room) return null;
  return bed ? `${room}/${bed}` : room;
}

function normRoom(s: string): string {
  return s.replace(/\s+/g, "").replace(/-/g, "/");
}

export function QuickCaptureSheet({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { patients, activeSection } = usePatientsState();
  const dispatch = usePatientsDispatch();

  useEffect(() => { textareaRef.current?.focus(); }, []);

  // Escape to close
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const handlePaste = useCallback(async () => {
    try {
      const t = await navigator.clipboard.readText();
      setText(t);
    } catch {
      textareaRef.current?.focus();
    }
  }, []);

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const urgency = detectUrgency(trimmed);
    const room = extractRoom(trimmed);

    // Try to match a patient
    let matched: typeof patients[number] | null = null;
    if (room) {
      const needle = normRoom(room);
      const candidates = patients.filter((p) => !!p.room && normRoom(p.room).startsWith(needle));
      if (candidates.length === 1) matched = candidates[0];
    }

    // If no room match, try name substring (case-insensitive, RTL-safe)
    if (!matched) {
      const words = trimmed.split(/\s+/).filter(w => w.length > 2);
      const nameCandidates = patients.filter(
        (p) => p.name && words.some((w) => p.name!.includes(w)),
      );
      if (nameCandidates.length === 1) matched = nameCandidates[0];
    }

    if (matched) {
      dispatch({ type: "ADD_TASK", patientId: matched.id, text: trimmed, urgency });
      setResult(`✅ משימה נוספה ל${matched.name ?? matched.room ?? "מטופל"} [${urgency === "stat" ? "STAT" : urgency === "urgent" ? "דחוף" : "שגרה"}]`);
    } else {
      // Unassigned — log event only
      dispatch({ type: "ADD_UNASSIGNED_TASK", text: trimmed, urgency });
      // Also create a system-level task visible in morning report
      dispatch({
        type: "LOG_EVENT",
        event: {
          id: generateId("ev-"),
          type: "TASK_CREATED",
          at: new Date().toISOString(),
          text: trimmed,
          urgency,
        },
      });
      setResult(`⚠️ לא נמצא מטופל — נרשם כמשימה לא משוייכת [${urgency === "stat" ? "STAT" : urgency === "urgent" ? "דחוף" : "שגרה"}]`);
    }

    setTimeout(() => { setText(""); setResult(null); }, 2500);
  }, [text, patients, dispatch]);

  const urgencyPreview = text.trim() ? detectUrgency(text) : null;
  const roomPreview = text.trim() ? extractRoom(text) : null;

  return (
    <div className="fixed inset-0 z-[70] bg-black/60 flex flex-col items-center justify-end sm:justify-center px-4 pb-4 sm:pb-0" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-700"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-blue-50 dark:bg-blue-900/20">
          <div>
            <h2 className="font-bold text-gray-900 dark:text-gray-100 text-sm">📲 קליטה מהירה</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">הדבק מ-WhatsApp / הקלד קריאת אחות</p>
          </div>
          <button onClick={onClose} className="text-gray-400 text-xl min-w-[44px] min-h-[44px] flex items-center justify-center">×</button>
        </div>

        {/* Textarea */}
        <div className="px-4 pt-3 pb-2">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="הדבק הודעה מ-WhatsApp או הקלד פרטי קריאה... חד׳ 52 — כאב חזה, ל״ד 90/60"
            dir="auto"
            rows={4}
            className="w-full text-sm text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 resize-none placeholder:text-gray-400"
          />
        </div>

        {/* Live preview */}
        {text.trim() && (
          <div className="px-4 pb-2 flex gap-2 flex-wrap">
            {roomPreview && (
              <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-md font-mono">
                חדר {roomPreview}
              </span>
            )}
            {urgencyPreview && (
              <span className={`text-xs px-2 py-0.5 rounded-md font-semibold ${
                urgencyPreview === "stat" ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300" :
                urgencyPreview === "urgent" ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300" :
                "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
              }`}>
                {urgencyPreview === "stat" ? "🔴 STAT" : urgencyPreview === "urgent" ? "🟡 דחוף" : "⚪ שגרה"}
              </span>
            )}
          </div>
        )}

        {/* Result feedback */}
        {result && (
          <div className="mx-4 mb-2 px-3 py-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-xl text-xs text-green-800 dark:text-green-300">
            {result}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 px-4 pb-4 pt-1">
          <button
            onClick={handlePaste}
            className="flex-1 py-3 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm font-medium active:bg-gray-200 dark:active:bg-gray-700"
          >
            📋 הדבק
          </button>
          <button
            onClick={handleSubmit}
            disabled={!text.trim()}
            className="flex-[2] py-3 rounded-xl bg-blue-600 text-white text-sm font-bold active:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ➕ צור משימה
          </button>
        </div>

        {/* Section context note */}
        <div className="px-4 pb-3 text-center text-[10px] text-gray-400 dark:text-gray-500">
          מחפש מטופלים בכל הקטגוריות
        </div>
      </div>
    </div>
  );
}

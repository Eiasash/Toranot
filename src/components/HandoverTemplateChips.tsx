/**
 * HandoverTemplateChips — quick-insert snippets for handover notes.
 *
 * Row of tappable chips above the handover note textarea.
 * Auto-suggests chips based on patient flags (DNR → GOC chip, etc.)
 * Inserts text at cursor or appends to existing note.
 */

import { useMemo } from "react";
import type { PatientEntry } from "../types";

interface HandoverTemplateChipsProps {
  patient: PatientEntry;
  onInsert: (text: string) => void;
}

interface TemplateChip {
  label: string;         // Short display label
  insertText: string;    // Text to insert into handover note
  /** If present, chip only shows when this returns true */
  condition?: (patient: PatientEntry) => boolean;
  /** Priority: lower = shown first. Default chips = 10, contextual = 5 */
  priority?: number;
}

const COMFORT_PATTERN = /comfort|palliative|DNR|DNI|GOC|goals of care|טיפול תומך|נוחות|פליאטיבי/i;
const FEVER_PATTERN = /fever|חום|febrile|טמפרטורה/i;
const FALL_PATTERN = /fall|נפילה|נפל/i;
const DELIRIUM_PATTERN = /deliri|דליריום|בלבול|confusion|agitat/i;
const DISCHARGE_PATTERN = /discharge|שחרור|משתחרר/i;

const ALL_CHIPS: TemplateChip[] = [
  // ── Contextual chips (show when relevant) ──
  {
    label: "🎯 GOC discussed",
    insertText: "GOC discussed with family — ",
    condition: (p) => COMFORT_PATTERN.test(buildCorpus(p)),
    priority: 3,
  },
  {
    label: "🌡️ תוכנית חום",
    insertText: "חום — בדק/ה ד\"מ, שתן, צילום חזה. ",
    condition: (p) => FEVER_PATTERN.test(buildCorpus(p)),
    priority: 4,
  },
  {
    label: "⚠️ סיכון נפילה",
    insertText: "סיכון נפילה גבוה — ליווי, מעקות, ללא בנזו. ",
    condition: (p) => FALL_PATTERN.test(buildCorpus(p)),
    priority: 4,
  },
  {
    label: "🧠 דליריום",
    insertText: "דליריום — שקט/מעורב. הימנע הלופרידול אם QTc מוארך. ",
    condition: (p) => DELIRIUM_PATTERN.test(buildCorpus(p)),
    priority: 4,
  },
  {
    label: "🏠 לשחרור",
    insertText: "מוכן/ה לשחרור — ממתין/ה ל",
    condition: (p) => DISCHARGE_PATTERN.test(buildCorpus(p)),
    priority: 4,
  },

  // ── Default chips (always available) ──
  {
    label: "⏳ ממתין CT",
    insertText: "ממתין/ה ל-CT ",
    priority: 10,
  },
  {
    label: "👨‍👩‍👧 שיחה עם משפחה",
    insertText: "שיחה עם משפחה מחר — ",
    priority: 10,
  },
  {
    label: "🚫 אין לשחרר",
    insertText: "אין לשחרר לפני ",
    priority: 10,
  },
  {
    label: "💊 comfort only",
    insertText: "comfort measures only. ",
    priority: 10,
  },
  {
    label: "📋 המשך מעקב",
    insertText: "להמשיך מעקב — ",
    priority: 10,
  },
  {
    label: "🔬 ממתין תוצאות",
    insertText: "ממתין/ה לתוצאות ",
    priority: 10,
  },
  {
    label: "🩸 עירוי מחר",
    insertText: "לבצע עירוי מחר בבוקר. ",
    priority: 10,
  },
  {
    label: "💉 ABx IV",
    insertText: "ABx IV — יום ",
    priority: 10,
  },
];

function buildCorpus(patient: PatientEntry): string {
  const parts: string[] = [];
  if (patient.diagnosis) parts.push(patient.diagnosis);
  if (patient.handoverNote) parts.push(patient.handoverNote);
  for (const s of patient.status) parts.push(s);
  for (const f of patient.flags) parts.push(f);
  for (const t of patient.tasks) parts.push(t.text);
  for (const t of patient.generatedTasks) parts.push(t.text);
  return parts.join(" ");
}

export function HandoverTemplateChips({ patient, onInsert }: HandoverTemplateChipsProps) {
  const chips = useMemo(() => {
    const applicable = ALL_CHIPS.filter(
      (c) => !c.condition || c.condition(patient)
    );
    return applicable.sort((a, b) => (a.priority ?? 10) - (b.priority ?? 10));
  }, [patient]);

  if (chips.length === 0) return null;

  return (
    <div
      className="flex gap-1.5 overflow-x-auto scrollbar-hide py-1.5 px-1"
      dir="rtl"
    >
      {chips.map((chip) => (
        <button
          key={chip.label}
          onClick={() => onInsert(chip.insertText)}
          className="shrink-0 px-2 py-1.5 rounded-full bg-gray-800/60 text-gray-300 text-[10px] border border-gray-700/50 hover:bg-gray-700/60 active:bg-gray-600/60 whitespace-nowrap min-h-[32px]"
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}

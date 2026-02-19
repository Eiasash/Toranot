import { usePatientsState, usePatientsDispatch } from "../context/PatientsContext";
import type { PatientEntry } from "../types";
import { generateId } from "../utils/id";

const SCENARIOS = [
  { emoji: "🌡️", label: "חום", status: "חום", tasks: [
    { text: "העבר תרביות דם x2", urgency: "stat" as const, category: "labs" as const },
    { text: "בדיקת שתן + תרבית", urgency: "stat" as const, category: "labs" as const },
    { text: "CBC, CRP, Procalcitonin", urgency: "stat" as const, category: "labs" as const },
    { text: "צילום חזה", urgency: "urgent" as const, category: "imaging" as const },
  ]},
  { emoji: "💔", label: "כאב חזה", status: "כאב בחזה", tasks: [
    { text: "א.ק.ג 12 חיבורים", urgency: "stat" as const, category: "labs" as const },
    { text: "טרופונין T", urgency: "stat" as const, category: "labs" as const },
    { text: "ניטרוגליצרין SL אם SBP>100", urgency: "stat" as const, category: "meds" as const },
    { text: "אספירין 300mg PO אם לא נוטל", urgency: "stat" as const, category: "meds" as const },
  ]},
  { emoji: "🤕", label: "נפילה", status: "נפילה", tasks: [
    { text: "הערכה נוירולוגית + GCS", urgency: "stat" as const, category: "other" as const },
    { text: "בדוק INR/PT אם על נוגד קרישה", urgency: "urgent" as const, category: "labs" as const },
    { text: "CT ראש אם על נוגד קרישה/חבלת ראש", urgency: "urgent" as const, category: "imaging" as const },
    { text: "צילום אגן/ירך אם כאב", urgency: "urgent" as const, category: "imaging" as const },
    { text: "דיווח נפילה + תיעוד", urgency: "routine" as const, category: "other" as const },
  ]},
  { emoji: "🏥", label: "קבלה חדשה", status: "קבלה חדשה", tasks: [
    { text: "בדיקות קבלה: CBC, BMP, LFT, Coag", urgency: "stat" as const, category: "labs" as const },
    { text: "צילום חזה", urgency: "urgent" as const, category: "imaging" as const },
    { text: "א.ק.ג", urgency: "urgent" as const, category: "labs" as const },
    { text: "סקירת תרופות בית + פיוס תרופתי", urgency: "urgent" as const, category: "meds" as const },
    { text: "הערכת סיכון נפילות + פצעי לחץ", urgency: "morning" as const, category: "other" as const },
  ]},
  { emoji: "😵", label: "שינוי הכרה", status: "שינוי במצב ההכרה", tasks: [
    { text: "GCS + בדיקה נוירולוגית", urgency: "stat" as const, category: "other" as const },
    { text: "סוכר נימי", urgency: "stat" as const, category: "labs" as const },
    { text: "גזים + לקטט", urgency: "stat" as const, category: "labs" as const },
    { text: "CBC, BMP, Ca, NH3, TSH", urgency: "stat" as const, category: "labs" as const },
    { text: "בדיקת שתן", urgency: "urgent" as const, category: "labs" as const },
    { text: "CT ראש", urgency: "urgent" as const, category: "imaging" as const },
  ]},
  { emoji: "😰", label: "קוצר נשימה", status: "קוצר נשימה", tasks: [
    { text: "סטורציה + גזים עורקיים", urgency: "stat" as const, category: "labs" as const },
    { text: "צילום חזה", urgency: "stat" as const, category: "imaging" as const },
    { text: "א.ק.ג", urgency: "stat" as const, category: "labs" as const },
    { text: "BNP / NT-proBNP", urgency: "urgent" as const, category: "labs" as const },
    { text: "O2 לסט >92% (>88% COPD)", urgency: "stat" as const, category: "meds" as const },
  ]},
  { emoji: "🩸", label: "דימום GI", status: "דימום GI", tasks: [
    { text: "2x IV גדולים + NaCl 0.9%", urgency: "stat" as const, category: "meds" as const },
    { text: "CBC, Coag, Type & Screen, BMP", urgency: "stat" as const, category: "labs" as const },
    { text: "PPI IV — Omeprazole 80mg bolus", urgency: "stat" as const, category: "meds" as const },
    { text: "ייעוץ גסטרו", urgency: "urgent" as const, category: "consult" as const },
    { text: "NPO", urgency: "stat" as const, category: "other" as const },
  ]},
  { emoji: "💧", label: "AKI", status: "AKI", tasks: [
    { text: "BMP + Mg + Phos", urgency: "stat" as const, category: "labs" as const },
    { text: "בדיקת שתן + Na שתן + FENa", urgency: "stat" as const, category: "labs" as const },
    { text: "US כליות", urgency: "urgent" as const, category: "imaging" as const },
    { text: "סקירת תרופות נפרוטוקסיות — הפסק!", urgency: "stat" as const, category: "meds" as const },
    { text: "מאזן נוזלים + Foley אם צריך", urgency: "urgent" as const, category: "other" as const },
  ]},
] as const;

export function QuickScenario({
  patient,
  onClose,
}: {
  patient: PatientEntry;
  onClose: () => void;
}) {
  const dispatch = usePatientsDispatch();

  const apply = (scenario: (typeof SCENARIOS)[number]) => {
    for (const t of scenario.tasks) {
      dispatch({
        type: "ADD_TASK",
        patientId: patient.id,
        text: `${t.urgency === "stat" ? "סטט " : t.urgency === "urgent" ? "דחוף " : ""}${t.text}`,
      });
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 w-full rounded-t-2xl max-h-[60vh] overflow-y-auto pb-safe shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
              תרחיש מהיר — {patient.name ?? "מטופל"}
            </h3>
            <p className="text-xs text-gray-500">לחץ להוספת סט משימות</p>
          </div>
          <button onClick={onClose} className="text-gray-400 text-lg px-2">
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 p-4">
          {SCENARIOS.map((s) => (
            <button
              key={s.label}
              onClick={() => apply(s)}
              className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 active:bg-gray-50 dark:active:bg-gray-700 transition-colors text-right"
            >
              <span className="text-2xl">{s.emoji}</span>
              <div>
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {s.label}
                </div>
                <div className="text-xs text-gray-500">
                  {s.tasks.length} משימות
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

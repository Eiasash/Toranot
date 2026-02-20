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
  { emoji: "📉", label: "לחץ דם נמוך", status: "hypotension", tasks: [
    { text: "Trendelenburg + NS 500ml bolus", urgency: "stat" as const, category: "meds" as const },
    { text: "CBC, BMP, Lactate, Coag", urgency: "stat" as const, category: "labs" as const },
    { text: "תרביות דם x2 + שתן", urgency: "stat" as const, category: "labs" as const },
    { text: "ECG — שלול ACS / arrhythmia", urgency: "stat" as const, category: "labs" as const },
    { text: "אם לא מגיב לנוזלים → vasopressors → ICU", urgency: "stat" as const, category: "consult" as const },
  ]},
  { emoji: "💓", label: "טכיקרדיה", status: "טכיקרדיה", tasks: [
    { text: "ECG 12 leads — narrow vs wide QRS", urgency: "stat" as const, category: "labs" as const },
    { text: "בדוק: חום, כאב, היפוולמיה, PE, ספסיס", urgency: "stat" as const, category: "other" as const },
    { text: "SVT narrow → vagal maneuvers → Adenosine 6mg IV push", urgency: "stat" as const, category: "meds" as const },
    { text: "AF rapid → Metoprolol 5mg IV / Diltiazem 0.25mg/kg IV", urgency: "stat" as const, category: "meds" as const },
    { text: "Unstable → synchronized cardioversion!", urgency: "stat" as const, category: "other" as const },
  ]},
  { emoji: "😡", label: "אגיטציה", status: "אגיטציה", tasks: [
    { text: "בדוק סיבה: כאב, שימור שתן, עצירות, תרופות, דליריום", urgency: "stat" as const, category: "other" as const },
    { text: "הערכת דליריום (CAM / 4AT)", urgency: "stat" as const, category: "other" as const },
    { text: "De-escalation — verbal first!", urgency: "stat" as const, category: "other" as const },
    { text: "Haloperidol 0.5-1mg PO/IV (❌ לא בפרקינסון!)", urgency: "urgent" as const, category: "meds" as const },
    { text: "שקול Quetiapine 12.5-25mg PO אם פרקינסון/LBD", urgency: "urgent" as const, category: "meds" as const },
  ]},
  { emoji: "🔻", label: "היפוגליקמיה", status: "היפוגליקמיה", tasks: [
    { text: "סוכר נימי — אם <70 → טפל מיד", urgency: "stat" as const, category: "labs" as const },
    { text: "אם בהכרה → 15-20g גלוקוז PO (חצי כוס מיץ)", urgency: "stat" as const, category: "meds" as const },
    { text: "אם ללא הכרה → D50W 25ml IV (50% דקסטרוז)", urgency: "stat" as const, category: "meds" as const },
    { text: "בדוק מחדש סוכר אחרי 15 דקות", urgency: "stat" as const, category: "labs" as const },
    { text: "סקור סיבה: מינון אינסולין, ארוחה דילגה, כליות", urgency: "urgent" as const, category: "other" as const },
  ]},
  { emoji: "📈", label: "לחץ דם גבוה", status: "יתר לחץ דם", tasks: [
    { text: "בדוק end-organ: כאב ראש, ראיה, כאב חזה, קוצר נשימה", urgency: "stat" as const, category: "other" as const },
    { text: "ללא end-organ → Captopril 25mg PO / Amlodipine 5mg PO", urgency: "urgent" as const, category: "meds" as const },
    { text: "עם end-organ → IV labetalol 20mg → שקול ICU", urgency: "stat" as const, category: "meds" as const },
    { text: "BP חוזר כל 15-30 דקות", urgency: "stat" as const, category: "other" as const },
  ]},
  { emoji: "🚨", label: "אנפילקסיס", status: "אנפילקסיס", tasks: [
    { text: "🔴 Epinephrine 0.3mg IM ירך — חזור כל 5-15 דקות", urgency: "stat" as const, category: "meds" as const },
    { text: "NS 1L bolus IV", urgency: "stat" as const, category: "meds" as const },
    { text: "Diphenhydramine 50mg IV + Methylprednisolone 125mg IV", urgency: "stat" as const, category: "meds" as const },
    { text: "ניטור 6-24 שעות — biphasic reaction!", urgency: "stat" as const, category: "other" as const },
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
        text: t.text,
        urgency: "extra",
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

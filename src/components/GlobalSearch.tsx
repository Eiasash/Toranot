import { useState, useMemo, useEffect, useRef } from "react";
import { usePatientsState } from "../context/PatientsContext";
import { SECTION_LABEL } from "../types";

// ─── Searchable data sources ─────────────────────────────
// We inline the data references here to avoid circular imports.
// Each item has: category, title, subtitle, detail

type SearchItem = {
  cat: string;      // emoji + category label
  title: string;
  sub: string;       // secondary info
  detail?: string;   // tertiary / dosing
};

// On-call medications
const MEDS: SearchItem[] = [
  { cat: "💊 תרופות", title: "Paracetamol", sub: "חום / כאב", detail: "1g PO/IV q6h (מקס 3g/d בקשישים)" },
  { cat: "💊 תרופות", title: "Dipyrone (Optalgin)", sub: "כאב / חום", detail: "1g PO/IV q6h" },
  { cat: "💊 תרופות", title: "Morphine", sub: "כאב חזק", detail: "2-4mg IV q4h / 5-10mg PO (קשישים: 1-2mg IV)" },
  { cat: "💊 תרופות", title: "Ondansetron", sub: "בחילה / הקאות", detail: "4mg IV/PO q8h (≥75y: 4mg IV x1)" },
  { cat: "💊 תרופות", title: "Metoclopramide", sub: "בחילה / הקאות", detail: "10mg IV/PO q8h. C/I: פרקינסון, חסימה" },
  { cat: "💊 תרופות", title: "Omeprazole", sub: "דימום GI / PPI", detail: "40mg IV bolus → 8mg/h drip (GI bleed)" },
  { cat: "💊 תרופות", title: "Furosemide", sub: "עומס נוזלים / בצקת", detail: "20-40mg IV (כפול מנה PO)" },
  { cat: "💊 תרופות", title: "KCl", sub: "היפוקלמיה", detail: "10-20mEq/h IV, מקס 40 central" },
  { cat: "💊 תרופות", title: "MgSO4", sub: "היפומגנזמיה", detail: "2g IV over 1h" },
  { cat: "💊 תרופות", title: "Calcium Gluconate", sub: "היפרקלמיה / היפוקלצמיה", detail: "10ml 10% IV over 10min" },
  { cat: "💊 תרופות", title: "Insulin Regular + D50", sub: "היפרקלמיה", detail: "10U Regular + D50 25ml IV" },
  { cat: "💊 תרופות", title: "NaCl 0.9%", sub: "נוזלים / היפובולמיה", detail: "500ml-1L bolus" },
  { cat: "💊 תרופות", title: "Haloperidol", sub: "דליריום / אגיטציה", detail: "0.5-1mg PO/IV. C/I: פרקינסון, QTc>500" },
  { cat: "💊 תרופות", title: "Melatonin", sub: "שינה / מניעת דליריום", detail: "3-6mg PO HS" },
  { cat: "💊 תרופות", title: "Enoxaparin", sub: "DVT prophylaxis / טיפול", detail: "40mg SC (prophylaxis), 1mg/kg q12h (treatment)" },
  { cat: "💊 תרופות", title: "Naloxone", sub: "דיכוי נשימתי מאופיואידים", detail: "0.4mg IV/IM, חזור כל 2-3 דק'" },
  { cat: "💊 תרופות", title: "Adenosine", sub: "SVT (narrow complex)", detail: "6mg → 12mg → 12mg rapid IV push" },
  { cat: "💊 תרופות", title: "Atropine", sub: "ברדיקרדיה סימפטומטית", detail: "0.5mg IV q3-5min, מקס 3mg" },
  { cat: "💊 תרופות", title: "Captopril", sub: "יל\"ד דחוף", detail: "25mg PO, אפקט 15-30 דק'" },
  { cat: "💊 תרופות", title: "Amlodipine", sub: "יל\"ד", detail: "5-10mg PO" },
  { cat: "💊 תרופות", title: "Labetalol", sub: "יל\"ד חירום (end-organ)", detail: "20mg IV → 40mg → 80mg q10min" },
  { cat: "💊 תרופות", title: "Lorazepam", sub: "פרכוסים / אגיטציה / גמילה", detail: "1-2mg IV/IM/PO (קשישים: 0.5-1mg)" },
  { cat: "💊 תרופות", title: "D50W", sub: "היפוגליקמיה חמורה", detail: "25-50ml IV = 12.5-25g גלוקוז" },
  { cat: "💊 תרופות", title: "Lactulose", sub: "עצירות / אנצפלופתיה כבדית", detail: "15-30ml PO q8h" },
  { cat: "💊 תרופות", title: "Senna + Docusate", sub: "עצירות", detail: "2 tabs PO HS" },
  { cat: "💊 תרופות", title: "Epinephrine", sub: "אנפילקסיס", detail: "0.3mg IM ירך, חזור כל 5-15 דק'" },
  { cat: "💊 תרופות", title: "Metoprolol", sub: "AF rapid / tachycardia", detail: "5mg IV q5min x3" },
];

// Quick scenarios
const SCENARIOS: SearchItem[] = [
  { cat: "⚡ תרחישים", title: "חום", sub: "בירור חום בתורנות", detail: "דמ\"ש, תרביות x2, שתן, צילום חזה, ABx אמפירי" },
  { cat: "⚡ תרחישים", title: "כאב חזה", sub: "ACS / chest pain", detail: "ECG, טרופונין, אספירין 300mg, מורפין, ניטרו" },
  { cat: "⚡ תרחישים", title: "נפילה", sub: "הערכת נפילה", detail: "CT ראש (אנטיקואגולנט), X-ray, נוירולוגי, סוכר" },
  { cat: "⚡ תרחישים", title: "קבלה חדשה", sub: "New admission protocol", detail: "אנמנזה, בדיקות קבלה, DVT prophylaxis, תרופות" },
  { cat: "⚡ תרחישים", title: "שינוי הכרה / דליריום", sub: "Altered mental status", detail: "סוכר, Na, Ca, TSH, B12, שתן, 4AT/CAM" },
  { cat: "⚡ תרחישים", title: "קוצר נשימה", sub: "Dyspnea", detail: "O2, ABG, CXR, BNP, D-dimer, ECG" },
  { cat: "⚡ תרחישים", title: "דימום GI", sub: "GI bleeding", detail: "2 עירויים, CBC/Coag, Omeprazole 80mg IV, גסטרו" },
  { cat: "⚡ תרחישים", title: "AKI", sub: "Acute kidney injury", detail: "הפסק nephrotoxins, נוזלים, US כליות, אלקטרוליטים" },
  { cat: "⚡ תרחישים", title: "לחץ דם נמוך", sub: "Hypotension", detail: "Trendelenburg, NS 500ml bolus, lactate, תרביות" },
  { cat: "⚡ תרחישים", title: "טכיקרדיה", sub: "Tachycardia", detail: "ECG 12-lead, narrow vs wide QRS, SVT → adenosine" },
  { cat: "⚡ תרחישים", title: "אגיטציה / דליריום", sub: "Agitation", detail: "בדוק סיבה, de-escalation, haloperidol 0.5-1mg" },
  { cat: "⚡ תרחישים", title: "היפוגליקמיה", sub: "Low glucose", detail: "<70: גלוקוז PO, <50/לא בהכרה: D50W IV" },
  { cat: "⚡ תרחישים", title: "לחץ דם גבוה", sub: "Hypertensive urgency", detail: "בדוק end-organ, captopril 25mg PO / labetalol IV" },
  { cat: "⚡ תרחישים", title: "אנפילקסיס", sub: "Anaphylaxis", detail: "Epinephrine 0.3mg IM, NS 1L, diphenhydramine + steroids" },
];

// ABx protocols (abbreviated)
const ABX: SearchItem[] = [
  { cat: "🦠 אנטיביוטיקה", title: "CAP — דלקת ריאות קהילתית", sub: "Amoxicillin-Clav + Azithromycin", detail: "חמור: Ceftriaxone + Azithromycin" },
  { cat: "🦠 אנטיביוטיקה", title: "HAP — דלקת ריאות בי\"ח", sub: "Piperacillin-Tazobactam", detail: "MRSA risk: +Vancomycin" },
  { cat: "🦠 אנטיביוטיקה", title: "UTI פשוט", sub: "Nitrofurantoin / Cephalexin", detail: "3-5 ימים" },
  { cat: "🦠 אנטיביוטיקה", title: "UTI מסובך / פיאלונפריטיס", sub: "Ceftriaxone 2g IV", detail: "Gentamicin בשוק" },
  { cat: "🦠 אנטיביוטיקה", title: "ספסיס", sub: "Piperacillin-Tazobactam 4.5g q6h", detail: "+Gentamicin 5mg/kg, +Vancomycin if MRSA" },
  { cat: "🦠 אנטיביוטיקה", title: "צלוליטיס", sub: "Cefazolin 2g IV q8h", detail: "Severe: Ceftriaxone + Clindamycin" },
  { cat: "🦠 אנטיביוטיקה", title: "C. difficile", sub: "Vancomycin 125mg PO q6h", detail: "חמור: Vanc 500mg PO + Metronidazole 500mg IV" },
  { cat: "🦠 אנטיביוטיקה", title: "דלקת קרום המוח", sub: "Ceftriaxone 2g q12h + Ampicillin + Dexamethasone", detail: "Ampicillin for Listeria (age>50)" },
  { cat: "🦠 אנטיביוטיקה", title: "אנדוקרדיטיס", sub: "Ampicillin-Sulbactam + Gentamicin", detail: "Prosthetic: Vancomycin + Gentamicin + Rifampin" },
  { cat: "🦠 אנטיביוטיקה", title: "זיהום תוך-בטני", sub: "Piperacillin-Tazobactam / Meropenem", detail: "SBP: Ceftriaxone" },
  { cat: "🦠 אנטיביוטיקה", title: "חום + נויטרופניה", sub: "Meropenem / Piperacillin-Tazobactam", detail: "+Vancomycin if line infection" },
];

// Calculators/tools
const TOOLS: SearchItem[] = [
  { cat: "🧮 מחשבונים", title: "CURB-65", sub: "חומרת דלקת ריאות", detail: "Confusion, Urea>7, RR≥30, BP<90/60, Age≥65" },
  { cat: "🧮 מחשבונים", title: "CrCl (Cockcroft-Gault)", sub: "פינוי קריאטינין", detail: "(140-age) × weight / (72 × Cr)" },
  { cat: "🧮 מחשבונים", title: "NEWS2", sub: "Early warning score", detail: "RR, SpO2, Temp, SBP, HR, AVPU, O2" },
  { cat: "🧮 מחשבונים", title: "אלקטרוליטים", sub: "פרוטוקולי החזרה", detail: "K+, Mg2+, Ca2+, PO4, Na+" },
  { cat: "🧮 מחשבונים", title: "אינסולין", sub: "Sliding scale + basal-bolus", detail: "TDD, correction factor, golden rules" },
];

// Critical value thresholds (for search)
const CRIT_VALUES: SearchItem[] = [
  { cat: "🔴 ערכים קריטיים", title: "K+ > 6.0 / < 2.5", sub: "היפרקלמיה / היפוקלמיה קריטית", detail: "ECG + Calcium Gluconate + Insulin/D50 | KCl IV" },
  { cat: "🔴 ערכים קריטיים", title: "Na < 120", sub: "היפונתרמיה חמורה", detail: "NaCl 3% 100ml IV over 10min, מקס 8mEq/24h" },
  { cat: "🔴 ערכים קריטיים", title: "Glucose < 50", sub: "היפוגליקמיה חמורה", detail: "D50W 25-50ml IV" },
  { cat: "🔴 ערכים קריטיים", title: "Hb < 7", sub: "אנמיה חמורה", detail: "עירוי דם, T&S, בדוק מקור דימום" },
  { cat: "🔴 ערכים קריטיים", title: "INR > 5", sub: "דימום / סיכון דימום", detail: "Vitamin K 5-10mg IV, FFP/PCC" },
  { cat: "🔴 ערכים קריטיים", title: "Lactate > 4", sub: "שוק / hypoperfusion", detail: "נוזלים, תרביות, ABx, vasopressors" },
  { cat: "🔴 ערכים קריטיים", title: "PLT < 20", sub: "תרומבוציטופניה חמורה", detail: "עירוי טסיות, בדוק DIC/TTP/HIT" },
];

const ALL_ITEMS = [...MEDS, ...SCENARIOS, ...ABX, ...TOOLS, ...CRIT_VALUES];

// ─── Component ───────────────────────────────────────────

export function GlobalSearch({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { patients } = usePatientsState();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const patientResults = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    return patients.filter(p =>
      (p.name?.toLowerCase().includes(term)) ||
      (p.room?.toLowerCase().includes(term)) ||
      (p.diagnosis?.toLowerCase().includes(term))
    ).slice(0, 8);
  }, [q, patients]);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    return ALL_ITEMS.filter(
      (item) =>
        item.title.toLowerCase().includes(term) ||
        item.sub.toLowerCase().includes(term) ||
        (item.detail?.toLowerCase().includes(term) ?? false),
    ).slice(0, 15);
  }, [q]);

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 flex flex-col items-center pt-[10vh] px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <span className="text-gray-400 text-lg">🔍</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="שם, חדר, אבחנה, תרופה, פרוטוקול..."
            dir="auto"
            className="flex-1 bg-transparent text-gray-900 dark:text-gray-100 text-base outline-none placeholder:text-gray-400"
          />
          <kbd className="hidden sm:inline text-[10px] text-gray-400 border border-gray-300 dark:border-gray-600 rounded px-1.5 py-0.5">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {q.trim() === "" && (
            <div className="px-4 py-6 text-center text-gray-400 text-sm">
              <p>חפש מטופלים, תרופות, אנטיביוטיקה, תרחישים, מחשבונים, ערכים קריטיים</p>
              <p className="text-xs mt-2 text-gray-500">נער את הטלפון 📱 כדי לפתוח מכל מסך</p>
            </div>
          )}

          {q.trim() !== "" && patientResults.length === 0 && results.length === 0 && (
            <div className="px-4 py-6 text-center text-gray-400 text-sm">
              לא נמצאו תוצאות
            </div>
          )}

          {/* Patient results — section aware */}
          {patientResults.length > 0 && (
            <>
              <div className="px-4 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide bg-gray-50 dark:bg-gray-800/50">
                מטופלים
              </div>
              {patientResults.map(p => {
                const acuityScore = [...p.tasks, ...p.generatedTasks.filter(t => !t.dismissed)].reduce((s, t) => {
                  if (t.done) return s;
                  return s + (t.urgency === "stat" ? 3 : t.urgency === "urgent" ? 2 : 0);
                }, 0);
                return (
                  <button
                    key={p.id}
                    className="w-full px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-right"
                    onClick={() => {
                      onClose();
                      setTimeout(() => {
                        document.getElementById(`patient-${p.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                      }, 100);
                    }}
                  >
                    <div className="flex items-center gap-2">
                      {p.room && <span className="text-xs font-mono bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded shrink-0">{p.room}</span>}
                      <span className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">{p.name ?? "—"}</span>
                      {acuityScore >= 5 && <span className="text-xs text-red-500 shrink-0">⚠️</span>}
                      <span className="text-xs text-gray-400 shrink-0 mr-auto">{SECTION_LABEL[p.section]}</span>
                    </div>
                    {p.diagnosis && <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{p.diagnosis}</div>}
                  </button>
                );
              })}
            </>
          )}

          {/* Clinical reference results */}
          {results.length > 0 && (
            <>
              <div className="px-4 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide bg-gray-50 dark:bg-gray-800/50">
                עזר קליני
              </div>
              {results.map((item, i) => (
                <div
                  key={`${item.title}-${i}`}
                  className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-gray-400 whitespace-nowrap mt-0.5">
                      {item.cat}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                        {item.title}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {item.sub}
                      </div>
                      {item.detail && (
                        <div className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                          {item.detail}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

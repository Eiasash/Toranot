import { useState, useMemo } from "react";

// ─────────────────────────────────────────────────────────
// DATA: DAG Protocol Quick Reference
// ─────────────────────────────────────────────────────────

interface ProtocolEntry {
  condition: string;
  conditionHe: string;
  category: string;
  empiric: string;
  alternative: string;
  notes: string;
  dagLink?: string;
}

const PROTOCOLS: ProtocolEntry[] = [
  {
    condition: "CAP (Community-Acquired Pneumonia)",
    conditionHe: "דלקת ריאות נרכשת בקהילה",
    category: "respiratory",
    empiric: "Ceftriaxone 2g IV q24h + Azithromycin 500mg IV/PO q24h",
    alternative: "Levofloxacin 750mg IV/PO q24h (monotx)",
    notes: "CURB-65 ≥2 → admission. תרביות דם x2 + אנטיגן שתן לפני ABx.",
  },
  {
    condition: "HAP / VAP",
    conditionHe: "דלקת ריאות נרכשת בבית חולים",
    category: "respiratory",
    empiric: "Piperacillin-Tazobactam 4.5g IV q6h",
    alternative: "Meropenem 1g IV q8h (אם ESBL/Pseudomonas)",
    notes: "שקול Vancomycin אם חשד MRSA. משך טיפול: 7-8 ימים (14d ל-Pseudomonas).",
  },
  {
    condition: "UTI — Uncomplicated",
    conditionHe: "דלקת בדרכי השתן — לא מסובכת",
    category: "gu",
    empiric: "Ciprofloxacin 500mg PO q12h x7d",
    alternative: "Cephalexin 500mg PO q6h / Nitrofurantoin 100mg PO q12h x5d",
    notes: "תרבית שתן לפני ABx. Nitrofurantoin רק אם CrCl>30.",
  },
  {
    condition: "UTI — Complicated / Pyelonephritis",
    conditionHe: "דלקת בדרכי השתן — מסובכת / פיאלונפריטיס",
    category: "gu",
    empiric: "Ceftriaxone 2g IV q24h",
    alternative: "Ciprofloxacin 400mg IV q12h / Gentamicin 5mg/kg IV q24h",
    notes: "תרביות דם x2 + שתן. שקול US כליות אם אין שיפור ב-48-72h.",
  },
  {
    condition: "Sepsis / Septic Shock",
    conditionHe: "ספסיס / הלם ספטי",
    category: "sepsis",
    empiric: "Piperacillin-Tazobactam 4.5g IV q6h",
    alternative: "Meropenem 1g IV q8h ± Amikacin 15mg/kg IV (once daily)",
    notes: "ABx תוך שעה! Lactate + תרביות x2 + NaCl 30ml/kg. Hour-1 Bundle!",
  },
  {
    condition: "Cellulitis / Erysipelas",
    conditionHe: "צלוליטיס / ארסיפלס",
    category: "skin",
    empiric: "Cefazolin 2g IV q8h (inpatient) / Cephalexin 500mg PO q6h (outpt)",
    alternative: "Clindamycin 600mg IV q8h (allergy/MRSA)",
    notes: "סמן גבולות! אם מוגלה/אבצס → שקול MRSA coverage + ניקוז.",
  },
  {
    condition: "C. difficile",
    conditionHe: "קלוסטרידיום דיפיצילה",
    category: "gi",
    empiric: "Vancomycin 125mg PO q6h x10-14d",
    alternative: "Fidaxomicin 200mg PO q12h x10d (אם הישנות)",
    notes: "הפסק ABx מיותרים! בידוד מגע. Metronidazole רק אם אין Vanco PO.",
  },
  {
    condition: "Meningitis — Bacterial",
    conditionHe: "דלקת קרום המוח — חיידקית",
    category: "neuro",
    empiric: "Ceftriaxone 2g IV q12h + Vancomycin 15-20mg/kg IV q8-12h + Dexamethasone 0.15mg/kg IV q6h",
    alternative: "Meropenem 2g IV q8h (אם אלרגיה ל-Cephalosporins)",
    notes: "דקסמתזון לפני או עם מנת ABx ראשונה! LP + תרביות דם לפני ABx.",
  },
  {
    condition: "Endocarditis — Empiric",
    conditionHe: "אנדוקרדיטיס — אמפירי",
    category: "cardiac",
    empiric: "Vancomycin 15-20mg/kg IV q8-12h + Gentamicin 1mg/kg IV q8h",
    alternative: "Consult ID",
    notes: "3 סטים תרביות דם לפני ABx! Echo (TTE/TEE). התייעצות זיהומיות.",
  },
  {
    condition: "Intra-abdominal Infection",
    conditionHe: "זיהום תוך-בטני",
    category: "gi",
    empiric: "Piperacillin-Tazobactam 4.5g IV q6h",
    alternative: "Meropenem 1g IV q8h / Ceftriaxone + Metronidazole",
    notes: "CT בטן + אגן. שקול ניקוז כירורגי/מלעורי.",
  },
  {
    condition: "Febrile Neutropenia",
    conditionHe: "חום עם נויטרופניה",
    category: "sepsis",
    empiric: "Piperacillin-Tazobactam 4.5g IV q6h (or Meropenem if unstable)",
    alternative: "Cefepime 2g IV q8h",
    notes: "ANC<500 + T≥38.3°C. תרביות x2 + CXR + U/A. דחוף!",
  },
];

// ─────────────────────────────────────────────────────────
// DATA: Common On-Call Meds
// ─────────────────────────────────────────────────────────

interface MedEntry {
  name: string;
  indication: string;
  dose: string;
  route: string;
  notes: string;
}

const ONCALL_MEDS: MedEntry[] = [
  { name: "Paracetamol", indication: "כאב / חום", dose: "1g", route: "PO/IV", notes: "מקס 4g/24h. 2g/24h בכבד" },
  { name: "Dipyrone (Optalgin)", indication: "כאב / חום", dose: "1g", route: "PO/IV", notes: "זהירות: אגרנולוציטוזיס" },
  { name: "Morphine", indication: "כאב חזק", dose: "2-4mg", route: "IV q4h", notes: "הפחת בקשישים, כליות. Naloxone 0.4mg IV אם דיכוי נשימתי" },
  { name: "Ondansetron", indication: "בחילה / הקאה", dose: "4-8mg", route: "IV/PO q8h", notes: "QTc! מקס 16mg/24h" },
  { name: "Metoclopramide", indication: "בחילה / הקאה", dose: "10mg", route: "IV/PO q8h", notes: "C/I: חסימת מעי, פרקינסון" },
  { name: "Omeprazole", indication: "PPI", dose: "40mg", route: "IV/PO q12-24h", notes: "GI bleed: 80mg bolus → 8mg/h drip" },
  { name: "Furosemide", indication: "עודף נוזלים", dose: "20-80mg", route: "IV", notes: "עקוב K+, Cr. כפלת מינון PO ביחס ל-IV" },
  { name: "KCl", indication: "היפוקלמיה", dose: "10-20mEq/h IV", route: "IV/PO", notes: "מקס 20mEq/h IV (מוניטור). 40mEq PO x2-3/d" },
  { name: "MgSO4", indication: "היפומגנזמיה", dose: "2g", route: "IV over 1h", notes: "חיוני לתיקון K+" },
  { name: "Calcium Gluconate", indication: "היפרקלמיה + ECG∆", dose: "10ml (10%)", route: "IV over 2-3min", notes: "מגן לב. אפקט 30-60 דק'" },
  { name: "Insulin Regular + D50", indication: "היפרקלמיה", dose: "10U + 50ml D50W", route: "IV", notes: "מוריד K+ ~0.5-1mEq/L. עקוב סוכר!" },
  { name: "NaCl 0.9%", indication: "החייאה / Pre-renal AKI", dose: "500ml-1L bolus", route: "IV", notes: "ספסיס: 30ml/kg. זהירות ב-CHF" },
  { name: "Haloperidol", indication: "דליריום / אגיטציה", dose: "0.5-2mg", route: "IV/PO", notes: "❌ לא בפרקינסון. QTc! הפחת בקשישים" },
  { name: "Melatonin", indication: "שינה / דליריום", dose: "3-5mg", route: "PO HS", notes: "קו ראשון לשינה בקשישים" },
  { name: "Enoxaparin", indication: "מניעת DVT / טיפול", dose: "40mg SC qd (prophylaxis) / 1mg/kg SC q12h (tx)", route: "SC", notes: "התאם ל-CrCl! CrCl<30 → 30mg qd / 1mg/kg qd" },
  { name: "Naloxone", indication: "דיכוי נשימתי מאופיואידים", dose: "0.4mg", route: "IV/IM", notes: "חזור כל 2-3 דק'. t½ קצר — מוניטור!" },
];

// ─────────────────────────────────────────────────────────
// CATEGORIES
// ─────────────────────────────────────────────────────────

const PROTO_CATEGORIES = [
  { key: "all", label: "הכל" },
  { key: "respiratory", label: "נשימתי" },
  { key: "gu", label: "שתן" },
  { key: "sepsis", label: "ספסיס" },
  { key: "skin", label: "עור" },
  { key: "gi", label: "GI" },
  { key: "neuro", label: "נוירו" },
  { key: "cardiac", label: "לב" },
];

// ─────────────────────────────────────────────────────────
// CrCl CALCULATOR (Cockcroft-Gault)
// ─────────────────────────────────────────────────────────

function CrClCalculator() {
  const [age, setAge] = useState("");
  const [weight, setWeight] = useState("");
  const [creatinine, setCr] = useState("");
  const [female, setFemale] = useState(false);

  const crcl = useMemo(() => {
    const a = parseFloat(age);
    const w = parseFloat(weight);
    const c = parseFloat(creatinine);
    if (!a || !w || !c || c <= 0) return null;
    let val = ((140 - a) * w) / (72 * c);
    if (female) val *= 0.85;
    return Math.round(val);
  }, [age, weight, creatinine, female]);

  return (
    <div className="space-y-3">
      <h3 className="font-bold text-sm">מחשבון CrCl (Cockcroft-Gault)</h3>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-gray-600">
          גיל
          <input type="number" value={age} onChange={(e) => setAge(e.target.value)}
            className="w-full mt-0.5 px-2 py-1.5 text-sm border border-gray-300 rounded-lg" placeholder="75" />
        </label>
        <label className="text-xs text-gray-600">
          משקל (kg)
          <input type="number" value={weight} onChange={(e) => setWeight(e.target.value)}
            className="w-full mt-0.5 px-2 py-1.5 text-sm border border-gray-300 rounded-lg" placeholder="70" />
        </label>
        <label className="text-xs text-gray-600">
          Creatinine (mg/dL)
          <input type="number" step="0.1" value={creatinine} onChange={(e) => setCr(e.target.value)}
            className="w-full mt-0.5 px-2 py-1.5 text-sm border border-gray-300 rounded-lg" placeholder="1.2" />
        </label>
        <label className="text-xs text-gray-600 flex items-end gap-2 pb-1.5">
          <input type="checkbox" checked={female} onChange={() => setFemale(!female)}
            className="h-4 w-4 rounded accent-blue-600" />
          נקבה (×0.85)
        </label>
      </div>
      {crcl !== null && (
        <div className={`text-center text-lg font-bold p-3 rounded-xl ${
          crcl > 60 ? "bg-green-100 text-green-800" :
          crcl > 30 ? "bg-yellow-100 text-yellow-800" :
          crcl > 15 ? "bg-orange-100 text-orange-800" :
          "bg-red-100 text-red-800"
        }`}>
          CrCl = {crcl} ml/min
          <div className="text-xs font-normal mt-1">
            {crcl > 60 ? "תקין / ירידה קלה" :
             crcl > 30 ? "ירידה בינונית — התאם מינונים" :
             crcl > 15 ? "ירידה חמורה — הפחת משמעותית" :
             "אי-ספיקת כליות קשה — שקול דיאליזה"}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// CURB-65 CALCULATOR
// ─────────────────────────────────────────────────────────

function CURB65Calculator() {
  const [c, setC] = useState(false); // Confusion
  const [u, setU] = useState(false); // Urea > 7 (BUN > 19)
  const [r, setR] = useState(false); // RR ≥ 30
  const [b, setB] = useState(false); // BP systolic < 90 or diastolic ≤ 60
  const [age65, setAge65] = useState(false); // Age ≥ 65

  const score = [c, u, r, b, age65].filter(Boolean).length;

  const interpretation = score <= 1
    ? { text: "סיכון נמוך — שקול טיפול אמבולטורי", color: "bg-green-100 text-green-800" }
    : score === 2
    ? { text: "סיכון בינוני — אשפוז קצר / מעקב צמוד", color: "bg-yellow-100 text-yellow-800" }
    : { text: "סיכון גבוה — אשפוז. ≥4 שקול ICU", color: "bg-red-100 text-red-800" };

  return (
    <div className="space-y-3">
      <h3 className="font-bold text-sm">CURB-65 (חומרת דלקת ריאות)</h3>
      <div className="space-y-2">
        {[
          { val: c, set: setC, label: "C — Confusion (בלבול חדש)" },
          { val: u, set: setU, label: "U — Urea > 7 mmol/L (BUN > 19)" },
          { val: r, set: setR, label: "R — Respiratory Rate ≥ 30" },
          { val: b, set: setB, label: "B — Blood Pressure: SBP<90 / DBP≤60" },
          { val: age65, set: setAge65, label: "65 — גיל ≥ 65" },
        ].map((item) => (
          <label key={item.label} className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={item.val} onChange={() => item.set(!item.val)}
              className="h-4 w-4 rounded accent-blue-600" />
            {item.label}
          </label>
        ))}
      </div>
      <div className={`text-center p-3 rounded-xl font-bold ${interpretation.color}`}>
        CURB-65 = {score}/5
        <div className="text-xs font-normal mt-1">{interpretation.text}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// TABS
// ─────────────────────────────────────────────────────────

type RefTab = "protocols" | "meds" | "crcl" | "curb65";

const TABS: { key: RefTab; label: string }[] = [
  { key: "protocols", label: "ABx פרוטוקולים" },
  { key: "meds", label: "תרופות תורן" },
  { key: "crcl", label: "CrCl" },
  { key: "curb65", label: "CURB-65" },
];

// ─────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────

export function QuickReference({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<RefTab>("protocols");
  const [search, setSearch] = useState("");
  const [protoCategory, setProtoCategory] = useState("all");

  const filteredProtocols = useMemo(() => {
    let list = PROTOCOLS;
    if (protoCategory !== "all") {
      list = list.filter((p) => p.category === protoCategory);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.condition.toLowerCase().includes(q) ||
          p.conditionHe.includes(q) ||
          p.empiric.toLowerCase().includes(q) ||
          p.alternative.toLowerCase().includes(q) ||
          p.notes.toLowerCase().includes(q)
      );
    }
    return list;
  }, [search, protoCategory]);

  const filteredMeds = useMemo(() => {
    if (!search.trim()) return ONCALL_MEDS;
    const q = search.trim().toLowerCase();
    return ONCALL_MEDS.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.indication.includes(q) ||
        m.dose.toLowerCase().includes(q) ||
        m.notes.toLowerCase().includes(q)
    );
  }, [search]);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-slate-800 text-white px-4 py-3 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold">עזר קליני</h2>
            <p className="text-xs text-slate-400">פרוטוקולי DAG ש\"צ + כלים</p>
          </div>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white text-xl px-2"
            aria-label="סגור"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 bg-gray-50 overflow-x-auto scrollbar-hide">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-none px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                tab === t.key
                  ? "border-blue-600 text-blue-700 bg-white"
                  : "border-transparent text-gray-500"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Search (for protocols & meds) */}
        {(tab === "protocols" || tab === "meds") && (
          <div className="px-4 py-2 border-b border-gray-100">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חפש..."
              dir="auto"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white placeholder:text-gray-400 focus:ring-2 focus:ring-blue-400 outline-none"
            />
          </div>
        )}

        {/* Protocol Category Filter */}
        {tab === "protocols" && (
          <div className="px-4 py-2 flex gap-1.5 overflow-x-auto scrollbar-hide border-b border-gray-100">
            {PROTO_CATEGORIES.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setProtoCategory(cat.key)}
                className={`flex-none px-3 py-1 text-xs rounded-full border transition-colors ${
                  protoCategory === cat.key
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-600 border-gray-200"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {tab === "protocols" && (
            <>
              {filteredProtocols.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">לא נמצאו פרוטוקולים</p>
              ) : (
                filteredProtocols.map((p, i) => (
                  <div key={i} className="border border-gray-200 rounded-xl p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-sm">{p.conditionHe}</div>
                        <div className="text-xs text-gray-500">{p.condition}</div>
                      </div>
                    </div>
                    <div className="text-sm space-y-1">
                      <div>
                        <span className="text-xs font-semibold text-green-700 bg-green-50 px-1.5 py-0.5 rounded">1st Line</span>
                        <span className="mr-2 text-sm" dir="ltr">{p.empiric}</span>
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-orange-700 bg-orange-50 px-1.5 py-0.5 rounded">Alt</span>
                        <span className="mr-2 text-sm" dir="ltr">{p.alternative}</span>
                      </div>
                      <div className="text-xs text-gray-600 bg-gray-50 rounded p-2">{p.notes}</div>
                    </div>
                  </div>
                ))
              )}
              <a
                href="https://szmc.anova.co.il/"
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center text-sm text-blue-600 underline py-2"
              >
                פתח אתר DAG ש&quot;צ המלא →
              </a>
            </>
          )}

          {tab === "meds" && (
            <div className="space-y-2">
              {filteredMeds.map((m, i) => (
                <div key={i} className="border border-gray-200 rounded-lg p-2.5 flex flex-wrap gap-x-4 gap-y-1 items-baseline">
                  <span className="font-bold text-sm text-blue-800 min-w-[120px]" dir="ltr">{m.name}</span>
                  <span className="text-xs text-gray-500">{m.indication}</span>
                  <span className="text-sm font-mono bg-blue-50 text-blue-900 px-1.5 py-0.5 rounded" dir="ltr">{m.dose} {m.route}</span>
                  <span className="text-xs text-gray-600 w-full">{m.notes}</span>
                </div>
              ))}
            </div>
          )}

          {tab === "crcl" && <CrClCalculator />}
          {tab === "curb65" && <CURB65Calculator />}
        </div>
      </div>
    </div>
  );
}

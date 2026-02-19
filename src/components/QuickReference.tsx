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
    notes: "שקול Vancomycin אם חשד MRSA. תרביות דם + כיח לפני ABx.",
  },
  {
    condition: "UTI (Uncomplicated)",
    conditionHe: "זיהום שתן לא מסובך",
    category: "genitourinary",
    empiric: "Ciprofloxacin 500mg PO q12h x7d",
    alternative: "Ceftriaxone 2g IV q24h (אם IV נדרש)",
    notes: "תרבית שתן לפני ABx. שקול Nitrofurantoin 100 PO q6h x5d (cystitis).",
  },
  {
    condition: "Pyelonephritis",
    conditionHe: "פיאלונפריטיס",
    category: "genitourinary",
    empiric: "Ceftriaxone 2g IV q24h",
    alternative: "Ciprofloxacin 500mg PO q12h (אם PO אפשרי)",
    notes: "תרביות דם x2 אם חום/ספסיס. החלפת/הוצאת קטטר אם קיים.",
  },
  {
    condition: "Sepsis (Unknown Source)",
    conditionHe: "ספסיס — מקור לא ידוע",
    category: "systemic",
    empiric: "Piperacillin-Tazobactam 4.5g IV q6h",
    alternative: "Meropenem 1g IV q8h ± Amikacin 15mg/kg IV (אם הלם)",
    notes: "ABx תוך שעה! תרביות דם x2 לפני. Lactate + NaCl 30ml/kg bolus.",
  },
  {
    condition: "Cellulitis",
    conditionHe: "צלוליטיס",
    category: "skin",
    empiric: "Cefazolin 2g IV q8h",
    alternative: "Cephalexin 500mg PO q6h (קל); Clindamycin 600mg IV q8h (MRSA)",
    notes: "סימון גבולות בעט + תיעוד צילום. ניקוז אם מוגלה.",
  },
  {
    condition: "C. difficile",
    conditionHe: "קלוסטרידיום דיפיצילה",
    category: "gastrointestinal",
    empiric: "Vancomycin 125mg PO q6h x10d",
    alternative: "Fidaxomicin 200mg PO q12h x10d",
    notes: "הפסקת ABx מיותרים. בידוד מגע. אין Metronidazole כקו ראשון.",
  },
  {
    condition: "COPD Exacerbation",
    conditionHe: "החמרת COPD",
    category: "respiratory",
    empiric: "Amoxicillin-Clavulanate 875/125 PO q12h",
    alternative: "Azithromycin 500mg PO x3d / Levofloxacin 750mg PO",
    notes: "ABx רק אם כיח מוגלתי. Prednisone 40mg PO x5d. Nebulizers.",
  },
  {
    condition: "Meningitis (Bacterial)",
    conditionHe: "דלקת קרומי מוח חיידקית",
    category: "neurological",
    empiric: "Ceftriaxone 2g IV q12h + Vancomycin 15-20mg/kg IV q8-12h + Dexamethasone",
    alternative: "Meropenem 2g IV q8h (אם אלרגיה)",
    notes: "LP לפני ABx אם אפשר (אין עיכוב!). Dexamethasone 0.15mg/kg לפני/עם ABx ראשון.",
  },
  {
    condition: "Endocarditis (Native Valve)",
    conditionHe: "אנדוקרדיטיס — מסתם טבעי",
    category: "cardiovascular",
    empiric: "Ampicillin-Sulbactam 3g IV q6h + Gentamicin 1mg/kg IV q8h",
    alternative: "Vancomycin 15-20mg/kg IV q12h (אם אלרגיה/MRSA)",
    notes: "תרביות דם x3 מאתרים שונים. Echo (TTE → TEE).",
  },
];

// ─────────────────────────────────────────────────────────
// DATA: Common On-Call Medications
// ─────────────────────────────────────────────────────────

interface OnCallMed {
  indication: string;
  drug: string;
  dose: string;
  notes: string;
}

const ON_CALL_MEDS: OnCallMed[] = [
  { indication: "כאב קל-בינוני", drug: "Paracetamol", dose: "1g PO/IV q6h (מקס 4g/d)", notes: "קו ראשון. זהירות בכבד." },
  { indication: "כאב בינוני-חזק", drug: "Tramadol", dose: "50-100mg PO/IV q6h", notes: "בחילה שכיחה. מוריד סף פרכוסים." },
  { indication: "כאב חזק", drug: "Morphine", dose: "2-5mg IV q4h PRN", notes: "ניטור נשימתי. Naloxone בהישג יד." },
  { indication: "בחילה / הקאה", drug: "Metoclopramide", dose: "10mg IV/PO q8h", notes: "לא ביחד עם חסמי דופמין. מקס 30mg/d." },
  { indication: "בחילה (קו שני)", drug: "Ondansetron", dose: "4mg IV/PO q8h", notes: "עצירות. QT prolongation." },
  { indication: "חום / כאב", drug: "Ibuprofen", dose: "400mg PO q8h", notes: "לא ב-AKI/GI bleed/anticoag. עם אוכל." },
  { indication: "נדודי שינה", drug: "Zolpidem", dose: "5mg PO HS", notes: "5mg בקשישים. סיכון נפילה." },
  { indication: "עצירות", drug: "Lactulose", dose: "15-30ml PO q12h", notes: "טיטרציה לפי תגובה." },
  { indication: "עצירות (קו שני)", drug: "Bisacodyl", dose: "10mg PO/PR HS", notes: "לא לשימוש כרוני." },
  { indication: "חרדה / אגיטציה", drug: "Haloperidol", dose: "0.5-2mg IV/PO", notes: "זהירות QT. מועדף על benzos בדליריום." },
  { indication: "היפוגליקמיה", drug: "Dextrose 50%", dose: "50ml IV (25g)", notes: "בהכרה → גלוקוז PO. Glucagon 1mg IM אם אין גישה." },
  { indication: "אנפילקסיס", drug: "Epinephrine", dose: "0.3-0.5mg IM (1:1000) ירך", notes: "חזור כל 5-15 דק'. נוזלים IV." },
  { indication: "היפרקלמיה", drug: "Calcium Gluconate", dose: "10% 10ml IV ב-10 דק'", notes: "הגנת לב. אינו מוריד K+." },
  { indication: "SVT", drug: "Adenosine", dose: "6mg IV rapid push → 12mg", notes: "עם flush מהיר. יש Defibrillator בהישג יד." },
  { indication: "AF (rate control)", drug: "Metoprolol", dose: "5mg IV q5min x3, then 25-50mg PO q6h", notes: "לא ב-CHF decompensated. שקול Diltiazem." },
];

// ─────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────

type Tab = "abx" | "meds" | "crcl" | "curb65";

const TAB_LABELS: Record<Tab, string> = {
  abx: "ABx פרוטוקול",
  meds: "תרופות תורן",
  crcl: "CrCl",
  curb65: "CURB-65",
};

export function QuickReference({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("abx");
  const [search, setSearch] = useState("");

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* modal */}
      <div
        className="relative z-10 bg-white w-full sm:max-w-2xl sm:rounded-xl rounded-t-xl max-h-[85dvh] flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 className="text-base font-bold text-slate-800">עזר קליני מהיר</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-xl leading-none px-1"
            aria-label="סגור"
          >
            &times;
          </button>
        </div>

        {/* tabs */}
        <div className="flex border-b border-gray-200 px-2 gap-1 overflow-x-auto scrollbar-hide">
          {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setSearch(""); }}
              className={
                "px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors " +
                (tab === t
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-700")
              }
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto p-4">
          {tab === "abx" && <AbxTab search={search} onSearch={setSearch} />}
          {tab === "meds" && <MedsTab search={search} onSearch={setSearch} />}
          {tab === "crcl" && <CrClCalculator />}
          {tab === "curb65" && <Curb65Calculator />}
        </div>
      </div>
    </div>
  );
}

// ─── ABx Protocols Tab ───────────────────────────────────

function AbxTab({ search, onSearch }: { search: string; onSearch: (v: string) => void }) {
  const filtered = useMemo(() => {
    if (!search.trim()) return PROTOCOLS;
    const q = search.trim().toLowerCase();
    return PROTOCOLS.filter(
      (p) =>
        p.condition.toLowerCase().includes(q) ||
        p.conditionHe.includes(q) ||
        p.empiric.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q),
    );
  }, [search]);

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder="חיפוש לפי מצב / אנטיביוטיקה..."
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
      />
      {filtered.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-4">לא נמצאו תוצאות</p>
      )}
      {filtered.map((p, i) => (
        <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-bold text-sm text-slate-800">{p.conditionHe}</p>
              <p className="text-xs text-slate-500">{p.condition}</p>
            </div>
            <span className="text-[10px] bg-slate-100 text-slate-500 rounded px-1.5 py-0.5 whitespace-nowrap">
              {p.category}
            </span>
          </div>
          <div className="text-xs space-y-1">
            <p>
              <span className="font-semibold text-green-700">Empiric: </span>
              <span className="text-slate-700">{p.empiric}</span>
            </p>
            <p>
              <span className="font-semibold text-amber-700">Alternative: </span>
              <span className="text-slate-700">{p.alternative}</span>
            </p>
            <p className="text-slate-500 italic">{p.notes}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── On-Call Meds Tab ────────────────────────────────────

function MedsTab({ search, onSearch }: { search: string; onSearch: (v: string) => void }) {
  const filtered = useMemo(() => {
    if (!search.trim()) return ON_CALL_MEDS;
    const q = search.trim().toLowerCase();
    return ON_CALL_MEDS.filter(
      (m) =>
        m.indication.includes(q) ||
        m.drug.toLowerCase().includes(q) ||
        m.notes.includes(q),
    );
  }, [search]);

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder="חיפוש לפי התוויה / תרופה..."
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
      />
      {filtered.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-4">לא נמצאו תוצאות</p>
      )}
      <div className="divide-y divide-gray-100">
        {filtered.map((m, i) => (
          <div key={i} className="py-2.5 first:pt-0 last:pb-0">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-slate-800">{m.indication}</p>
              <span className="text-xs font-mono text-blue-600 whitespace-nowrap">{m.drug}</span>
            </div>
            <p className="text-xs text-slate-700 mt-0.5">{m.dose}</p>
            <p className="text-xs text-slate-400 mt-0.5">{m.notes}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── CrCl Calculator (Cockcroft-Gault) ──────────────────

function CrClCalculator() {
  const [age, setAge] = useState("");
  const [weight, setWeight] = useState("");
  const [creatinine, setCr] = useState("");
  const [female, setFemale] = useState(false);

  const result = useMemo(() => {
    const a = parseFloat(age);
    const w = parseFloat(weight);
    const cr = parseFloat(creatinine);
    if (!a || !w || !cr || a <= 0 || w <= 0 || cr <= 0) return null;
    const base = ((140 - a) * w) / (72 * cr);
    return female ? base * 0.85 : base;
  }, [age, weight, creatinine, female]);

  function doseLabel(crcl: number): string {
    if (crcl >= 60) return "מינון רגיל";
    if (crcl >= 30) return "התאמה קלה (30-59)";
    if (crcl >= 15) return "התאמה משמעותית (15-29)";
    return "שקול דיאליזה (<15)";
  }

  function barColor(crcl: number): string {
    if (crcl >= 60) return "bg-green-500";
    if (crcl >= 30) return "bg-amber-500";
    return "bg-red-500";
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        Cockcroft-Gault — CrCl = [(140 - Age) x Weight] / (72 x Cr)
        {" "}(x 0.85 לנשים)
      </p>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs text-slate-600">גיל (שנים)</span>
          <input
            type="number"
            inputMode="numeric"
            value={age}
            onChange={(e) => setAge(e.target.value)}
            className="mt-0.5 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </label>
        <label className="block">
          <span className="text-xs text-slate-600">משקל (ק&quot;ג)</span>
          <input
            type="number"
            inputMode="decimal"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className="mt-0.5 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </label>
        <label className="block">
          <span className="text-xs text-slate-600">Creatinine (mg/dL)</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            value={creatinine}
            onChange={(e) => setCr(e.target.value)}
            className="mt-0.5 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </label>
        <label className="flex items-center gap-2 self-end pb-2">
          <input
            type="checkbox"
            checked={female}
            onChange={(e) => setFemale(e.target.checked)}
            className="rounded border-gray-300"
          />
          <span className="text-sm text-slate-700">נקבה (x0.85)</span>
        </label>
      </div>

      {result !== null && (
        <div className="border border-gray-200 rounded-lg p-3 space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-bold text-slate-800">
              CrCl = {result.toFixed(1)} mL/min
            </span>
            <span className="text-xs text-slate-500">{doseLabel(result)}</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={"h-full rounded-full transition-all " + barColor(result)}
              style={{ width: `${Math.min(100, (result / 120) * 100)}%` }}
            />
          </div>
          <div className="text-[10px] text-slate-400 flex justify-between">
            <span>0</span>
            <span>30</span>
            <span>60</span>
            <span>90</span>
            <span>120+</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CURB-65 Calculator ─────────────────────────────────

const CURB65_CRITERIA = [
  { key: "C", label: "Confusion — בלבול חדש", desc: "שינוי הכרה / AMT ≤8" },
  { key: "U", label: "Urea > 7 mmol/L (BUN > 20)", desc: "אוריאה מעל 7 ממול/ל" },
  { key: "R", label: "RR ≥ 30 / min", desc: "קצב נשימה 30 ומעלה" },
  { key: "B", label: "BP: SBP < 90 / DBP ≤ 60", desc: "לחץ דם סיסטולי <90 או דיאסטולי ≤60" },
  { key: "65", label: "Age ≥ 65", desc: "גיל 65 ומעלה" },
] as const;

function curb65Recommendation(score: number): { text: string; color: string } {
  if (score <= 1)
    return { text: "סיכון נמוך — שקול טיפול אמבולטורי", color: "text-green-700" };
  if (score === 2)
    return { text: "סיכון בינוני — אשפוז קצר / מעקב צמוד", color: "text-amber-700" };
  return { text: "סיכון גבוה — אשפוז + שקול ICU (אם 4-5)", color: "text-red-700" };
}

function Curb65Calculator() {
  const [checked, setChecked] = useState<Set<string>>(new Set());

  function toggle(key: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const score = checked.size;
  const rec = curb65Recommendation(score);

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        CURB-65 — ניקוד חומרת דלקת ריאות נרכשת בקהילה (CAP)
      </p>

      <div className="space-y-2">
        {CURB65_CRITERIA.map((c) => (
          <button
            key={c.key}
            onClick={() => toggle(c.key)}
            className={
              "w-full text-right border rounded-lg px-3 py-2.5 flex items-start gap-2 transition-colors " +
              (checked.has(c.key)
                ? "bg-blue-50 border-blue-300"
                : "bg-white border-gray-200 hover:border-gray-300")
            }
          >
            <div
              className={
                "mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors " +
                (checked.has(c.key)
                  ? "bg-blue-500 border-blue-500 text-white"
                  : "border-gray-300")
              }
            >
              {checked.has(c.key) && (
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-slate-800">{c.label}</p>
              <p className="text-xs text-slate-500">{c.desc}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="border border-gray-200 rounded-lg p-3 space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-lg font-bold text-slate-800">ציון: {score} / 5</span>
          <span className="text-xs text-slate-500">
            30-day mortality: {score === 0 ? "0.6%" : score === 1 ? "2.7%" : score === 2 ? "6.8%" : score === 3 ? "14%" : score === 4 ? "27%" : "57%"}
          </span>
        </div>
        <p className={"text-sm font-semibold " + rec.color}>{rec.text}</p>
      </div>
    </div>
  );
}

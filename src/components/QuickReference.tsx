import { useState, useMemo, useCallback } from "react";
import { DRUG_DOSING } from "../data/dosing";
import type { DrugDosingEntry } from "../data/dosing";
import { extractAntibioticsFromPlan } from "../engine/drugSafety";
import { crclToBucket, type CrClBucket } from "../utils/renal";
import { safeGetItem, safeSetItem } from "../utils/storage";

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
  { name: "Adenosine", indication: "SVT (narrow complex)", dose: "6mg → 12mg → 12mg", route: "rapid IV push + flush", notes: "הזרק מהר! חצי חיים 6 שניות. הזהר באסתמה" },
  { name: "Atropine", indication: "ברדיקרדיה סימפטומטית", dose: "0.5mg", route: "IV q3-5min", notes: "מקס 3mg. אם לא מגיב → pacing" },
  { name: "Captopril", indication: "יל\"ד דחוף (ללא end-organ)", dose: "25mg", route: "PO", notes: "אפקט תוך 15-30 דק'. C/I: K+>5.5, AKI, bilateral RAS" },
  { name: "Amlodipine", indication: "יל\"ד דחוף (אלטרנטיבה)", dose: "5-10mg", route: "PO", notes: "אפקט איטי. לא מוריד מהר מדי" },
  { name: "Labetalol", indication: "יל\"ד חירום (end-organ)", dose: "20mg IV → 40mg → 80mg", route: "IV q10min", notes: "C/I: אסתמה, ברדיקרדיה, CHF חמור" },
  { name: "Lorazepam", indication: "פרכוסים / אגיטציה / גמילה", dose: "1-2mg", route: "IV/IM/PO", notes: "קשישים: 0.5-1mg. עדיף על diazepam ב-CKD/כבד" },
  { name: "D50W (Dextrose 50%)", indication: "היפוגליקמיה חמורה", dose: "25-50ml", route: "IV", notes: "= 12.5-25g גלוקוז. עקוב סוכר אחרי 15 דק'" },
  { name: "Lactulose", indication: "עצירות / אנצפלופתיה כבדית", dose: "15-30ml", route: "PO q8h", notes: "אנצפלופתיה: טטר ל-3-4 יציאות/יום" },
  { name: "Senna + Docusate", indication: "עצירות", dose: "2 tabs", route: "PO HS", notes: "קו ראשון לעצירות מאופיואידים. ❌ לא סיבים אם על אופיואידים!" },
  { name: "Epinephrine", indication: "אנפילקסיס / PEA", dose: "0.3mg (1:1000)", route: "IM ירך", notes: "חזור כל 5-15 דק'. Code: 1mg (1:10,000) IV" },
  { name: "Metoprolol", indication: "AF rapid / tachycardia", dose: "5mg IV q5min x3", route: "IV → PO", notes: "C/I: SBP<90, CHF acute, asthma, AV block" },
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
// RENAL DOSE ADJUSTMENT — maps extracted ABx names → dosing keys
// ─────────────────────────────────────────────────────────

const ABX_KEY_ALIASES: Record<string, keyof typeof DRUG_DOSING> = {
  "piperacillin/tazobactam": "pip_tazo",
  "pip/tazo": "pip_tazo",
  "tazocin": "pip_tazo",
  "meropenem": "meropenem",
  "vancomycin": "vancomycin",
  "aztreonam": "aztreonam",
  "ceftriaxone": "ceftriaxone",
  "cefazolin": "cefazolin",
  "cephalexin": "cephalexin",
  "cefepime": "cefepime",
  "amoxicillin/clavulanate": "amox_clav",
  "augmentin": "amox_clav",
  "metronidazole": "metronidazole",
  "flagyl": "metronidazole",
  "ciprofloxacin": "ciprofloxacin",
  "cipro": "ciprofloxacin",
  "levofloxacin": "levofloxacin",
  "levo": "levofloxacin",
  "gentamicin": "gentamicin",
  "genta": "gentamicin",
  "amikacin": "amikacin",
  "clindamycin": "clindamycin",
  "azithromycin": "azithromycin",
  "nitrofurantoin": "nitrofurantoin",
  "fidaxomicin": "fidaxomicin",
};

const BUCKET_LABELS: Record<CrClBucket, string> = {
  gt50: ">50",
  "10_50": "10-50",
  lt10: "<10",
  hd: "HD",
};

function resolveDoseForBucket(
  key: keyof typeof DRUG_DOSING,
  bucket: CrClBucket
): { label: string; dose: string; notes?: string } | null {
  const entry: DrugDosingEntry | undefined = DRUG_DOSING[key];
  if (!entry) return null;
  const dose =
    bucket === "gt50" ? entry.normal
    : bucket === "10_50" ? entry.crcl_10_50
    : bucket === "lt10" ? entry.crcl_lt10
    : bucket === "hd" ? entry.hd
    : entry.normal;
  if (!dose) return null;
  return { label: entry.label, dose, notes: entry.notes };
}

function getDoseLinesForPlan(
  planText: string,
  bucket: CrClBucket
): Array<{ label: string; dose: string; notes?: string; needsAdjustment: boolean }> {
  const abxNames = extractAntibioticsFromPlan(planText);
  const seen = new Set<string>();
  const lines: Array<{ label: string; dose: string; notes?: string; needsAdjustment: boolean }> = [];

  for (const name of abxNames) {
    const key = ABX_KEY_ALIASES[name.toLowerCase().trim()];
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const resolved = resolveDoseForBucket(key, bucket);
    if (!resolved) continue;
    const entry = DRUG_DOSING[key];
    const needsAdjustment = bucket !== "gt50" && entry.normal !== resolved.dose &&
      !resolved.dose.toLowerCase().includes("no renal adjustment") &&
      !resolved.dose.toLowerCase().includes("no adjustment");
    lines.push({ ...resolved, needsAdjustment });
  }
  return lines;
}

function CrClCalculator({ onCrClChange }: { onCrClChange?: (crcl: number | null, isHD?: boolean) => void }) {
  const [age, setAge] = useState("");
  const [weight, setWeight] = useState("");
  const [creatinine, setCr] = useState("");
  const [female, setFemale] = useState(false);
  const [isHD, setIsHD] = useState(false);

  const crcl = useMemo(() => {
    if (isHD) return 0; // HD overrides
    const a = parseFloat(age);
    const w = parseFloat(weight);
    const c = parseFloat(creatinine);
    if (!a || !w || !c || c <= 0) return null;
    let val = ((140 - a) * w) / (72 * c);
    if (female) val *= 0.85;
    return Math.round(val);
  }, [age, weight, creatinine, female, isHD]);

  // Report CrCl to parent
  useMemo(() => {
    onCrClChange?.(crcl, isHD);
  }, [crcl, isHD, onCrClChange]);

  const bucket = crcl !== null ? crclToBucket(crcl, isHD) : null;

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
        <div className="flex flex-col gap-1 text-xs text-gray-600 justify-end pb-1.5">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={female} onChange={() => setFemale(!female)}
              className="h-4 w-4 rounded accent-blue-600" />
            נקבה (×0.85)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={isHD} onChange={() => setIsHD(!isHD)}
              className="h-4 w-4 rounded accent-purple-600" />
            דיאליזה (HD)
          </label>
        </div>
      </div>
      {(crcl !== null || isHD) && (
        <div className={`text-center text-lg font-bold p-3 rounded-xl ${
          isHD ? "bg-purple-100 text-purple-800" :
          crcl! > 60 ? "bg-green-100 text-green-800" :
          crcl! > 30 ? "bg-yellow-100 text-yellow-800" :
          crcl! > 15 ? "bg-orange-100 text-orange-800" :
          "bg-red-100 text-red-800"
        }`}>
          {isHD ? "HD — דיאליזה" : `CrCl = ${crcl} ml/min`}
          {bucket && (
            <div className="text-xs font-normal mt-1">
              {isHD ? "מינונים מותאמים להמודיאליזה" :
               crcl! > 60 ? "תקין / ירידה קלה" :
               crcl! > 30 ? "ירידה בינונית — התאם מינונים" :
               crcl! > 15 ? "ירידה חמורה — הפחת משמעותית" :
               "אי-ספיקת כליות קשה — שקול דיאליזה"}
            </div>
          )}
          {bucket && bucket !== "gt50" && (
            <div className="text-xs font-semibold mt-2 bg-white/50 rounded-lg p-1.5">
              💊 חזור ללשונית ABx לראות מינונים מותאמים
            </div>
          )}
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
// NEWS2 EARLY WARNING SCORE
// ─────────────────────────────────────────────────────────

function NEWS2Calculator() {
  const [rr, setRR] = useState("");
  const [spo2, setSpO2] = useState("");
  const [isType2, setIsType2] = useState(false); // Scale 2 for COPD
  const [onO2, setOnO2] = useState(false);
  const [temp, setTemp] = useState("");
  const [sbp, setSBP] = useState("");
  const [hr, setHR] = useState("");
  const [avpu, setAVPU] = useState("A"); // A, V, P, U

  const score = useMemo(() => {
    let s = 0;
    const rrVal = parseFloat(rr);
    const spo2Val = parseFloat(spo2);
    const tempVal = parseFloat(temp);
    const sbpVal = parseFloat(sbp);
    const hrVal = parseFloat(hr);

    // RR
    if (rrVal) {
      if (rrVal <= 8) s += 3;
      else if (rrVal <= 11) s += 1;
      else if (rrVal <= 20) s += 0;
      else if (rrVal <= 24) s += 2;
      else s += 3;
    }

    // SpO2
    if (spo2Val) {
      if (!isType2) { // Scale 1
        if (spo2Val <= 91) s += 3;
        else if (spo2Val <= 93) s += 2;
        else if (spo2Val <= 95) s += 1;
        else s += 0;
      } else { // Scale 2 (COPD target 88-92%)
        if (spo2Val <= 83) s += 3;
        else if (spo2Val <= 85) s += 2;
        else if (spo2Val <= 87) s += 1;
        else if (spo2Val <= 92) s += 0;
        else if (spo2Val <= 94 && onO2) s += 1;
        else if (spo2Val <= 96 && onO2) s += 2;
        else if (spo2Val >= 97 && onO2) s += 3;
      }
    }

    // Air/O2
    if (onO2) s += 2;

    // Temp
    if (tempVal) {
      if (tempVal <= 35.0) s += 3;
      else if (tempVal <= 36.0) s += 1;
      else if (tempVal <= 38.0) s += 0;
      else if (tempVal <= 39.0) s += 1;
      else s += 2;
    }

    // SBP
    if (sbpVal) {
      if (sbpVal <= 90) s += 3;
      else if (sbpVal <= 100) s += 2;
      else if (sbpVal <= 110) s += 1;
      else if (sbpVal <= 219) s += 0;
      else s += 3;
    }

    // HR
    if (hrVal) {
      if (hrVal <= 40) s += 3;
      else if (hrVal <= 50) s += 1;
      else if (hrVal <= 90) s += 0;
      else if (hrVal <= 110) s += 1;
      else if (hrVal <= 130) s += 2;
      else s += 3;
    }

    // AVPU
    if (avpu === "V" || avpu === "P" || avpu === "U") s += 3;

    return s;
  }, [rr, spo2, isType2, onO2, temp, sbp, hr, avpu]);

  const interpretation = score >= 7
    ? { text: "🔴 גבוה מאוד — שקול ICU. ניטור רציף. רופא בכיר!", color: "bg-red-100 text-red-800 border-red-300" }
    : score >= 5
    ? { text: "🟠 בינוני-גבוה — הערכה דחופה. שקול escalation", color: "bg-orange-100 text-orange-800 border-orange-300" }
    : score >= 1
    ? { text: "🟡 נמוך — הערכה ע\"י אחות. שקול הגברת ניטור", color: "bg-yellow-100 text-yellow-800 border-yellow-300" }
    : { text: "🟢 0 — ניטור שגרתי", color: "bg-green-100 text-green-800 border-green-300" };

  return (
    <div className="space-y-3">
      <h3 className="font-bold text-sm">NEWS2 (National Early Warning Score 2)</h3>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-gray-600">
          קצב נשימה (RR)
          <input type="number" value={rr} onChange={(e) => setRR(e.target.value)}
            className="w-full mt-0.5 px-2 py-1.5 text-sm border border-gray-300 rounded-lg" placeholder="16" />
        </label>
        <label className="text-xs text-gray-600">
          SpO2 (%)
          <input type="number" value={spo2} onChange={(e) => setSpO2(e.target.value)}
            className="w-full mt-0.5 px-2 py-1.5 text-sm border border-gray-300 rounded-lg" placeholder="96" />
        </label>
        <label className="text-xs text-gray-600">
          חום (°C)
          <input type="number" step="0.1" value={temp} onChange={(e) => setTemp(e.target.value)}
            className="w-full mt-0.5 px-2 py-1.5 text-sm border border-gray-300 rounded-lg" placeholder="37.0" />
        </label>
        <label className="text-xs text-gray-600">
          SBP (mmHg)
          <input type="number" value={sbp} onChange={(e) => setSBP(e.target.value)}
            className="w-full mt-0.5 px-2 py-1.5 text-sm border border-gray-300 rounded-lg" placeholder="120" />
        </label>
        <label className="text-xs text-gray-600">
          דופק (HR)
          <input type="number" value={hr} onChange={(e) => setHR(e.target.value)}
            className="w-full mt-0.5 px-2 py-1.5 text-sm border border-gray-300 rounded-lg" placeholder="80" />
        </label>
        <label className="text-xs text-gray-600">
          AVPU
          <select value={avpu} onChange={(e) => setAVPU(e.target.value)}
            className="w-full mt-0.5 px-2 py-1.5 text-sm border border-gray-300 rounded-lg bg-white">
            <option value="A">A — ערני</option>
            <option value="V">V — מגיב לקול</option>
            <option value="P">P — מגיב לכאב</option>
            <option value="U">U — לא מגיב</option>
          </select>
        </label>
      </div>
      <div className="flex gap-3 text-xs">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={onO2} onChange={() => setOnO2(!onO2)}
            className="h-3.5 w-3.5 rounded accent-blue-600" />
          על חמצן
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={isType2} onChange={() => setIsType2(!isType2)}
            className="h-3.5 w-3.5 rounded accent-blue-600" />
          COPD (Scale 2)
        </label>
      </div>
      <div className={`text-center p-3 rounded-xl font-bold border ${interpretation.color}`}>
        NEWS2 = {score}
        <div className="text-xs font-normal mt-1">{interpretation.text}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// ELECTROLYTE REPLACEMENT PROTOCOLS
// ─────────────────────────────────────────────────────────

function ElectrolyteReference() {
  return (
    <div className="space-y-4">
      <h3 className="font-bold text-sm">פרוטוקולי תיקון אלקטרוליטים</h3>

      {/* Potassium */}
      <div className="border border-gray-200 rounded-xl p-3 space-y-2">
        <div className="font-bold text-sm text-purple-800">🔋 אשלגן (K+)</div>
        <div className="text-xs space-y-1.5">
          <div className="bg-yellow-50 p-2 rounded-lg">
            <span className="font-semibold">K+ 3.0-3.4:</span> KCl 40mEq PO x2-3/d
          </div>
          <div className="bg-orange-50 p-2 rounded-lg">
            <span className="font-semibold">K+ 2.5-2.9:</span> KCl 10mEq/h IV (max 20mEq/h peripheral, 40 central) + PO
          </div>
          <div className="bg-red-50 p-2 rounded-lg">
            <span className="font-semibold">K+ &lt;2.5 / ECG∆:</span> KCl 20mEq/h IV (monitor!) + MgSO4 2g IV
          </div>
          <div className="text-gray-600 italic">💡 תמיד בדוק Mg — היפומגנזמיה = K+ לא מתתקן!</div>
        </div>
      </div>

      {/* Magnesium */}
      <div className="border border-gray-200 rounded-xl p-3 space-y-2">
        <div className="font-bold text-sm text-blue-800">🧲 מגנזיום (Mg2+)</div>
        <div className="text-xs space-y-1.5">
          <div className="bg-yellow-50 p-2 rounded-lg">
            <span className="font-semibold">Mg 1.2-1.6:</span> MgO 400mg PO x2/d (אם כליות תקינות)
          </div>
          <div className="bg-orange-50 p-2 rounded-lg">
            <span className="font-semibold">Mg &lt;1.2 / סימפטומטי:</span> MgSO4 2g IV over 1h → 4-6g over 24h
          </div>
          <div className="text-gray-600 italic">💡 חיוני לתיקון היפוקלמיה והיפוקלצמיה</div>
        </div>
      </div>

      {/* Calcium */}
      <div className="border border-gray-200 rounded-xl p-3 space-y-2">
        <div className="font-bold text-sm text-green-800">🦴 סידן (Ca2+)</div>
        <div className="text-xs space-y-1.5">
          <div className="bg-gray-50 p-2 rounded-lg">
            <span className="font-semibold">תיקון לאלבומין:</span> Ca_corrected = Ca + 0.8 × (4.0 − Albumin)
          </div>
          <div className="bg-yellow-50 p-2 rounded-lg">
            <span className="font-semibold">קל:</span> CaCO3 500mg PO x3/d + Vitamin D
          </div>
          <div className="bg-red-50 p-2 rounded-lg">
            <span className="font-semibold">חמור / סימפטומטי:</span> Ca Gluconate 10% 10-20ml IV over 10min → gtt
          </div>
          <div className="text-gray-600 italic">💡 אם גם היפומגנזמיה — תקן Mg קודם!</div>
        </div>
      </div>

      {/* Phosphate */}
      <div className="border border-gray-200 rounded-xl p-3 space-y-2">
        <div className="font-bold text-sm text-amber-800">⚡ זרחן (PO4)</div>
        <div className="text-xs space-y-1.5">
          <div className="bg-yellow-50 p-2 rounded-lg">
            <span className="font-semibold">PO4 1.5-2.5:</span> Phospho-Soda 5ml PO x2-3/d
          </div>
          <div className="bg-red-50 p-2 rounded-lg">
            <span className="font-semibold">PO4 &lt;1.5:</span> KPhos/NaPhos 15-30mmol IV over 6h
          </div>
          <div className="text-gray-600 italic">💡 שכיח ב-refeeding, DKA, ספסיס. עלול לגרום חולשת שרירים ואי"נ נשימתית</div>
        </div>
      </div>

      {/* Sodium */}
      <div className="border border-gray-200 rounded-xl p-3 space-y-2">
        <div className="font-bold text-sm text-indigo-800">💧 נתרן (Na+)</div>
        <div className="text-xs space-y-1.5">
          <div className="bg-yellow-50 p-2 rounded-lg">
            <span className="font-semibold">Na 125-130 אסימפטומטי:</span> הגבלת נוזלים 1-1.5L/d + בדוק SIADH
          </div>
          <div className="bg-orange-50 p-2 rounded-lg">
            <span className="font-semibold">Na 120-125 סימפטומטי:</span> NaCl 0.9% IV + Furosemide אם SIADH
          </div>
          <div className="bg-red-50 p-2 rounded-lg">
            <span className="font-semibold">Na &lt;120 / seizures:</span> NaCl 3% 100ml IV over 10min (bolus x3 max)
          </div>
          <div className="text-gray-600 italic">🔴 מקסימום תיקון: 8 mEq/L / 24h! (סכנת ODS)</div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// INSULIN SLIDING SCALE & INPATIENT GLUCOSE MANAGEMENT
// ─────────────────────────────────────────────────────────

function InsulinReference() {
  const [weight, setWeight] = useState("");
  const [sensitivity, setSensitivity] = useState<"low" | "medium" | "high">("medium");

  const basalDose = useMemo(() => {
    const w = parseFloat(weight);
    if (!w) return null;
    const tdd = sensitivity === "low" ? w * 0.2 : sensitivity === "medium" ? w * 0.3 : w * 0.4;
    return {
      tdd: Math.round(tdd),
      basal: Math.round(tdd * 0.5),
      bolus: Math.round(tdd * 0.5 / 3),
    };
  }, [weight, sensitivity]);

  return (
    <div className="space-y-4">
      <h3 className="font-bold text-sm">ניהול סוכר באשפוז</h3>

      {/* Sliding Scale */}
      <div className="border border-gray-200 rounded-xl p-3 space-y-2">
        <div className="font-bold text-sm text-blue-800">📊 Sliding Scale — תיקון מהיר</div>
        <div className="text-xs">
          <table className="w-full text-right">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="py-1 px-1">סוכר (mg/dL)</th>
                <th className="py-1 px-1">Low</th>
                <th className="py-1 px-1">Medium</th>
                <th className="py-1 px-1">High</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              <tr><td className="py-0.5 px-1">150-199</td><td>0</td><td>1</td><td>2</td></tr>
              <tr className="bg-yellow-50"><td className="py-0.5 px-1">200-249</td><td>1</td><td>2</td><td>4</td></tr>
              <tr><td className="py-0.5 px-1">250-299</td><td>2</td><td>4</td><td>6</td></tr>
              <tr className="bg-orange-50"><td className="py-0.5 px-1">300-349</td><td>3</td><td>5</td><td>8</td></tr>
              <tr className="bg-red-50"><td className="py-0.5 px-1">&gt;350</td><td>4</td><td>7</td><td>10</td></tr>
            </tbody>
          </table>
          <div className="text-gray-500 mt-1.5 italic">* יחידות Regular insulin SC. Low = רגיש/רזה/קשיש, High = שמן/סטרואידים</div>
        </div>
      </div>

      {/* Basal-Bolus Calculator */}
      <div className="border border-gray-200 rounded-xl p-3 space-y-2">
        <div className="font-bold text-sm text-green-800">💉 חישוב Basal-Bolus</div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-gray-600">
            משקל (kg)
            <input type="number" value={weight} onChange={(e) => setWeight(e.target.value)}
              className="w-full mt-0.5 px-2 py-1.5 text-sm border border-gray-300 rounded-lg" placeholder="70" />
          </label>
          <label className="text-xs text-gray-600">
            רגישות לאינסולין
            <select value={sensitivity} onChange={(e) => setSensitivity(e.target.value as any)}
              className="w-full mt-0.5 px-2 py-1.5 text-sm border border-gray-300 rounded-lg bg-white">
              <option value="low">נמוכה (0.2U/kg) — קשיש/רזה/CKD</option>
              <option value="medium">בינונית (0.3U/kg)</option>
              <option value="high">גבוהה (0.4U/kg) — השמנה/סטרואידים</option>
            </select>
          </label>
        </div>
        {basalDose && (
          <div className="bg-blue-50 p-3 rounded-xl text-sm space-y-1">
            <div><span className="font-semibold">TDD:</span> ~{basalDose.tdd}U/day</div>
            <div><span className="font-semibold">Basal (50%):</span> Glargine {basalDose.basal}U SC HS</div>
            <div><span className="font-semibold">Bolus (50%÷3):</span> Lispro ~{basalDose.bolus}U SC AC x3</div>
            <div className="text-xs text-gray-500 mt-1">+ Correction factor ≈ 1700 ÷ TDD = {Math.round(1700 / basalDose.tdd)} mg/dL per unit</div>
          </div>
        )}
      </div>

      {/* Key Rules */}
      <div className="border border-gray-200 rounded-xl p-3 space-y-2">
        <div className="font-bold text-sm text-red-800">⚠️ כללי זהב</div>
        <div className="text-xs space-y-1.5">
          <div className="bg-red-50 p-2 rounded-lg">🔴 <span className="font-semibold">אף פעם לא עוצרים basal insulin!</span> אפילו NPO — תן 50-80% מהמינון</div>
          <div className="bg-orange-50 p-2 rounded-lg">🟠 <span className="font-semibold">Type 1:</span> חייב basal — אחרת DKA תוך שעות</div>
          <div className="bg-yellow-50 p-2 rounded-lg">🟡 <span className="font-semibold">Sliding scale alone:</span> לא מספיק! תמיד שלב basal</div>
          <div className="bg-blue-50 p-2 rounded-lg">🔵 <span className="font-semibold">יעד:</span> 140-180 mg/dL (קשישים: עד 200 מותר)</div>
          <div className="bg-purple-50 p-2 rounded-lg">🟣 <span className="font-semibold">Hold metformin:</span> CrCl&lt;30, contrast, surgery, sepsis</div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// TABS
// ─────────────────────────────────────────────────────────

type RefTab = "protocols" | "meds" | "crcl" | "curb65" | "news2" | "lytes" | "insulin";

const TABS: { key: RefTab; label: string }[] = [
  { key: "protocols", label: "ABx פרוטוקולים" },
  { key: "meds", label: "תרופות תורן" },
  { key: "lytes", label: "אלקטרוליטים" },
  { key: "insulin", label: "אינסולין" },
  { key: "news2", label: "NEWS2" },
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
  // Persist CrCl across sessions (survives app close during 26h shift)
  const [sharedCrCl, setSharedCrCl] = useState<number | null>(() => {
    const stored = safeGetItem("toranot_crcl");
    return stored ? Number(stored) : null;
  });
  const [isHD, setIsHD] = useState(() => safeGetItem("toranot_crcl_hd") === "1");
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const crclBucket: CrClBucket | null = useMemo(() => {
    if (isHD) return "hd";
    if (sharedCrCl === null) return null;
    return crclToBucket(sharedCrCl, false);
  }, [sharedCrCl, isHD]);

  const handleCrClChange = useCallback((crcl: number | null, hd?: boolean) => {
    setSharedCrCl(crcl);
    if (crcl !== null) safeSetItem("toranot_crcl", String(crcl));
    if (hd !== undefined) {
      setIsHD(hd);
      safeSetItem("toranot_crcl_hd", hd ? "1" : "0");
    }
  }, []);

  const handleCopyProtocol = useCallback((p: ProtocolEntry, idx: number) => {
    const lines = [
      `${p.condition} (${p.conditionHe})`,
      `1st: ${p.empiric}`,
      `Alt: ${p.alternative}`,
    ];
    if (crclBucket && crclBucket !== "gt50") {
      const doseLines = getDoseLinesForPlan(p.empiric + " " + p.alternative, crclBucket);
      const adjusted = doseLines.filter(d => d.needsAdjustment);
      if (adjusted.length > 0) {
        lines.push(``, `⚠ Dose adjust (CrCl bucket: ${BUCKET_LABELS[crclBucket]}):`);
        adjusted.forEach(d => lines.push(`  ${d.label}: ${d.dose}`));
      }
    }
    lines.push(``, p.notes);
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1500);
    });
  }, [crclBucket]);

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
        className="quick-ref bg-white dark:bg-[#0a0a0a] w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-slate-800 dark:bg-[#050510] text-white px-4 py-3 flex items-center justify-between">
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
        <div className="flex border-b border-gray-200 dark:border-[#1a1a2e] bg-gray-50 dark:bg-[#050510] overflow-x-auto scrollbar-hide">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-none px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                tab === t.key
                  ? "border-blue-600 text-blue-700 dark:text-blue-400 bg-white dark:bg-[#0a0a0a]"
                  : "border-transparent text-gray-500 dark:text-gray-400"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Search (for protocols & meds) */}
        {(tab === "protocols" || tab === "meds") && (
          <div className="px-4 py-2 border-b border-gray-100 dark:border-[#1a1a2e]">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חפש..."
              dir="auto"
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-[#1a1a2e] rounded-lg bg-white dark:bg-[#111] dark:text-gray-200 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-400 outline-none"
            />
          </div>
        )}

        {/* Protocol Category Filter */}
        {tab === "protocols" && (
          <div className="px-4 py-2 flex gap-1.5 overflow-x-auto scrollbar-hide border-b border-gray-100 dark:border-[#1a1a2e]">
            {PROTO_CATEGORIES.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setProtoCategory(cat.key)}
                className={`flex-none px-3 py-1 text-xs rounded-full border transition-colors ${
                  protoCategory === cat.key
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white dark:bg-[#111] text-gray-600 dark:text-gray-300 border-gray-200 dark:border-[#1a1a2e]"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 dark:bg-[#0a0a0a]">
          {tab === "protocols" && (
            <>
              {/* CrCl status banner */}
              {crclBucket ? (
                <div className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium ${
                  crclBucket === "gt50" ? "bg-green-50 text-green-700 dark:bg-green-950/20 dark:text-green-400" :
                  crclBucket === "hd" ? "bg-purple-50 text-purple-700 dark:bg-purple-950/20 dark:text-purple-400" :
                  "bg-orange-50 text-orange-700 dark:bg-orange-950/20 dark:text-orange-400"
                }`}>
                  <span>
                    {crclBucket === "hd" ? "💊 HD — מינונים מותאמים לדיאליזה" :
                     `💊 CrCl ${sharedCrCl} ml/min (${BUCKET_LABELS[crclBucket]}) — מינונים מותאמים`}
                  </span>
                  <button onClick={() => setTab("crcl")} className="underline">שנה</button>
                </div>
              ) : (
                <button
                  onClick={() => setTab("crcl")}
                  className="w-full text-center text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/20 rounded-lg px-3 py-2 hover:bg-blue-100 transition-colors"
                >
                  💊 הזן CrCl להתאמת מינונים →
                </button>
              )}
              {filteredProtocols.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">לא נמצאו פרוטוקולים</p>
              ) : (
                filteredProtocols.map((p, i) => {
                  const doseLines = crclBucket ? getDoseLinesForPlan(p.empiric + " " + p.alternative, crclBucket) : [];
                  const hasAdjustments = doseLines.some(d => d.needsAdjustment);
                  return (
                  <div key={i} className={`border rounded-xl p-3 space-y-2 ${hasAdjustments ? "border-orange-300 bg-orange-50/30 dark:bg-orange-950/10" : "border-gray-200"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-sm">{p.conditionHe}</div>
                        <div className="text-xs text-gray-500">{p.condition}</div>
                      </div>
                      <button
                        onClick={() => handleCopyProtocol(p, i)}
                        className="flex-none text-xs px-2 py-1 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        title="העתק פרוטוקול"
                      >
                        {copiedIdx === i ? "✓" : "📋"}
                      </button>
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
                      {/* Dose adjustment block */}
                      {crclBucket && doseLines.length > 0 && (
                        <div className={`mt-2 rounded-lg border p-2.5 text-xs space-y-1.5 ${
                          hasAdjustments
                            ? "border-orange-300 bg-orange-50 dark:bg-orange-950/20"
                            : "border-gray-200 bg-gray-50 dark:bg-gray-900"
                        }`}>
                          <div className="font-semibold flex items-center gap-1.5" dir="ltr">
                            {hasAdjustments ? "⚠️" : "💊"} Dose — CrCl {BUCKET_LABELS[crclBucket]} ml/min
                          </div>
                          {doseLines.map((d) => (
                            <div key={d.label} className={`flex flex-col ${d.needsAdjustment ? "text-orange-800 dark:text-orange-300" : "text-gray-600 dark:text-gray-400"}`} dir="ltr">
                              <span className="font-medium">{d.label}:</span>
                              <span className="mr-1">{d.dose}</span>
                              {d.notes && d.needsAdjustment && (
                                <span className="text-[11px] italic text-gray-500">{d.notes}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="text-xs text-gray-600 bg-gray-50 dark:bg-gray-900 rounded p-2">{p.notes}</div>
                    </div>
                  </div>
                  );
                })
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

          {tab === "crcl" && <CrClCalculator onCrClChange={(crcl, hd) => handleCrClChange(crcl, hd)} />}
          {tab === "curb65" && <CURB65Calculator />}
          {tab === "news2" && <NEWS2Calculator />}
          {tab === "lytes" && <ElectrolyteReference />}
          {tab === "insulin" && <InsulinReference />}
        </div>
      </div>
    </div>
  );
}

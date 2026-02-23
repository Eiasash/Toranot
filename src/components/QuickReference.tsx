import { useState, useMemo, useCallback } from "react";
import { DRUG_DOSING } from "../data/dosing";
import type { DrugDosingEntry } from "../data/dosing";
import { extractAntibioticsFromPlan } from "../engine/drugSafety";
import { crclToBucket, type CrClBucket } from "../utils/renal";
import { safeGetItem, safeSetItem } from "../utils/storage";
import {
  CrClCalculator,
  CURB65Calculator,
  NEWS2Calculator,
  ElectrolyteReference,
  InsulinReference,
} from "./QuickReferenceCalculators";

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

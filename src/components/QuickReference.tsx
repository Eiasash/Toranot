import { useState, useMemo, useCallback, useRef, useEffect } from "react";
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
  DeliriumReference,
  FallsReference,
  BeersReference,
  PressureInjuryReference,
  DischargeChecklist,
  OrthoGeriatricAdmission,
  PhoneDirectory,
  OsteoporosisProtocol,
} from "./QuickReferenceCalculators";
import {
  ChestPainProtocol,
  AcuteDyspneaProtocol,
  GIBleedProtocol,
  AnaphylaxisProtocol,
  HypertensiveProtocol,
  RapidAFProtocol,
  SyncopeProtocol,
  FeverWorkupProtocol,
  SeizureProtocol,
  DKA_HHS_Protocol,
  TransfusionReactionProtocol,
  PainProtocol,
  AcuteStrokeProtocol,
  HyponatremiaProtocol,
  HyperkalemiaProtocol,
  HypoglycemiaProtocol,
  AlteredMentalStatusProtocol,
  FallProtocolOnCall,
  DVTPEProtocol,
  LiverProtocol,
  CorticosteroidProtocol,
  InsomniaBehaviorProtocol,
  UrinaryRetentionProtocol,
  BloodProductsProtocol,
  AcuteAbdomenProtocol,
  AcuteKidneyInjuryProtocol,
  DeathPronouncementProtocol,
  AnticoagReversalProtocol,
  HypercalcemiaProtocol,
  HypernatremiaProtocol,
  HypermagnesemiaProtocol,
} from "./OnCallProtocols";
import { ECGInterpreter } from "./ECGInterpreter";

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
    condition: "Aspiration Pneumonia",
    conditionHe: "דלקת ריאות שאיפתית",
    category: "respiratory",
    empiric: "Ampicillin-Sulbactam 3g IV q6h",
    alternative: "Clindamycin 600mg IV q8h + Ceftriaxone 2g IV q24h",
    notes: "שכיח בקשישים עם דיספגיה/CVA. בדוק בליעה! ❌ אין Metronidazole בד\"כ כ-monotherapy.",
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
  {
    condition: "Infected Pressure Ulcer",
    conditionHe: "פצע לחץ מזוהם",
    category: "skin",
    empiric: "Piperacillin-Tazobactam 4.5g IV q6h",
    alternative: "Meropenem 1g IV q8h (אם ESBL/MDR)",
    notes: "כולל anaerobes! ניקוז כירורגי אם מוגלה. תרבית מעמיקה (לא swab שטחי).",
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
// RENAL DOSE ADJUSTMENT
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
// SECTION DEFINITIONS — grid home screen
// ─────────────────────────────────────────────────────────

type SectionKey =
  | "home"
  | "protocols"
  | "meds"
  | "lytes"
  | "insulin"
  | "crcl"
  | "news2"
  | "curb65"
  | "delirium"
  | "falls"
  | "beers"
  | "pressure"
  | "discharge"
  | "orthoAdmit"
  | "osteoporosis"
  | "phones"
  // On-call protocols
  | "chestpain"
  | "dyspnea"
  | "gibleed"
  | "anaphylaxis"
  | "htncrisis"
  | "rapidaf"
  | "syncope"
  | "fever"
  | "seizure"
  | "dka"
  | "transfusion"
  | "pain"
  | "stroke"
  | "hyponatremia"
  | "hyperkalemia"
  | "hypoglycemia"
  | "ams"
  | "falloncall"
  | "dvtpe"
  | "liver"
  | "steroids"
  | "insomnia"
  | "retention"
  | "bloodproducts"
  | "abdomen"
  | "aki"
  | "death"
  | "anticoagreversal"
  | "hypercalcemia"
  | "hypernatremia"
  | "hypermagnesemia"
  | "ecg";

interface SectionDef {
  key: SectionKey;
  icon: string;
  label: string;
  group: "geriatrics" | "ortho" | "protocols" | "calculators" | "quickaccess" | "oncall_cardio" | "oncall_resp" | "oncall_gi" | "oncall_neuro" | "oncall_metabolic" | "oncall_heme" | "oncall_general";
}

const SECTIONS: SectionDef[] = [
  // ── Geriatric Syndromes (top priority) ──
  { key: "delirium",  icon: "🧠", label: "דליריום",      group: "geriatrics" },
  { key: "falls",     icon: "🦴", label: "נפילות",       group: "geriatrics" },
  { key: "beers",     icon: "💊", label: "Beers / PIM",   group: "geriatrics" },
  { key: "pressure",  icon: "🛏️", label: "פצעי לחץ",     group: "geriatrics" },
  { key: "discharge", icon: "🏥", label: "צ׳קליסט שחרור", group: "geriatrics" },
  // ── Orthogeriatrics ──
  { key: "orthoAdmit",   icon: "🦴", label: "קבלה אורתו",     group: "ortho" },
  { key: "osteoporosis",  icon: "💎", label: "אוסטיאופורוזיס", group: "ortho" },
  // ── Protocols & Meds ──
  { key: "protocols", icon: "🦠", label: "ABx פרוטוקולים",   group: "protocols" },
  { key: "meds",      icon: "💉", label: "תרופות תורן",       group: "protocols" },
  { key: "lytes",     icon: "⚡", label: "אלקטרוליטים",       group: "protocols" },
  { key: "insulin",   icon: "🩸", label: "אינסולין",          group: "protocols" },
  // ── Calculators & Scores ──
  { key: "crcl",   icon: "🧪", label: "CrCl",    group: "calculators" },
  { key: "news2",  icon: "📊", label: "NEWS2",   group: "calculators" },
  { key: "curb65", icon: "🫁", label: "CURB-65", group: "calculators" },
  // ── Quick Access ──
  { key: "phones", icon: "📞", label: "שלוחות",  group: "quickaccess" },
  // ── On-Call: Cardio & Hemodynamics ──
  { key: "chestpain",   icon: "💔", label: "כאב חזה",          group: "oncall_cardio" },
  { key: "rapidaf",     icon: "💓", label: "AF מהיר",          group: "oncall_cardio" },
  { key: "htncrisis",   icon: "🩺", label: "משבר יל״ד",        group: "oncall_cardio" },
  { key: "syncope",     icon: "😵", label: "סינקופה",          group: "oncall_cardio" },
  { key: "dvtpe",       icon: "🦵", label: "DVT / PE",         group: "oncall_cardio" },
  // ── On-Call: Respiratory ──
  { key: "dyspnea",     icon: "🫁", label: "קוצר נשימה חריף",  group: "oncall_resp" },
  { key: "anaphylaxis", icon: "🚨", label: "אנפילקסיס",        group: "oncall_resp" },
  // ── On-Call: GI & Liver ──
  { key: "gibleed",     icon: "🩸", label: "דימום GI",          group: "oncall_gi" },
  { key: "abdomen",     icon: "🤕", label: "בטן חריפה",         group: "oncall_gi" },
  { key: "liver",       icon: "🫘", label: "כבד / HE / SBP",    group: "oncall_gi" },
  // ── On-Call: Neuro ──
  { key: "stroke",      icon: "🧠", label: "שבץ חריף",          group: "oncall_neuro" },
  { key: "seizure",     icon: "⚡", label: "פרכוסים",           group: "oncall_neuro" },
  { key: "ams",         icon: "😶‍🌫️", label: "שינוי הכרה",       group: "oncall_neuro" },
  // ── On-Call: Metabolic & Renal ──
  { key: "dka",           icon: "📊", label: "DKA / HHS",        group: "oncall_metabolic" },
  { key: "hyponatremia",  icon: "🧂", label: "היפונתרמיה",       group: "oncall_metabolic" },
  { key: "hypernatremia", icon: "🧂", label: "היפרנתרמיה",       group: "oncall_metabolic" },
  { key: "hyperkalemia",  icon: "⬆️", label: "היפרקלמיה",       group: "oncall_metabolic" },
  { key: "hypoglycemia",  icon: "⬇️", label: "היפוגליקמיה",     group: "oncall_metabolic" },
  { key: "hypercalcemia", icon: "🦴", label: "היפרקלצמיה",       group: "oncall_metabolic" },
  { key: "hypermagnesemia", icon: "⚗️", label: "היפרמגנסמיה",   group: "oncall_metabolic" },
  { key: "aki",           icon: "🫘", label: "AKI חריף",         group: "oncall_metabolic" },
  { key: "ecg",           icon: "🫀", label: "פרשן ECG",         group: "oncall_cardio" },
  // ── On-Call: Heme ──
  { key: "transfusion",      icon: "💉", label: "תגובת עירוי",     group: "oncall_heme" },
  { key: "bloodproducts",    icon: "🅰️", label: "מוצרי דם",        group: "oncall_heme" },
  { key: "anticoagreversal", icon: "🔄", label: "reversal נוגדי קרישה", group: "oncall_heme" },
  // ── On-Call: General ──
  { key: "fever",       icon: "🌡️", label: "חום — בירור",       group: "oncall_general" },
  { key: "pain",        icon: "😣", label: "כאב — סולם",        group: "oncall_general" },
  { key: "falloncall",  icon: "🤸", label: "נפילה בתורנות",     group: "oncall_general" },
  { key: "steroids",    icon: "💊", label: "stress dose סטרואידים", group: "oncall_general" },
  { key: "insomnia",    icon: "🌙", label: "נדודי שינה",         group: "oncall_general" },
  { key: "retention",   icon: "🚽", label: "עצירת שתן",          group: "oncall_general" },
  { key: "death",       icon: "🕊️", label: "קביעת מוות",         group: "oncall_general" },
];

const GROUP_LABELS: Record<string, string> = {
  geriatrics: "גריאטריה — תסמונות ומניעה",
  ortho: "אורתוגריאטריה",
  protocols: "פרוטוקולים ותרופות",
  calculators: "מחשבונים וסקורים",
  quickaccess: "גישה מהירה",
  oncall_cardio: "🚨 תורן — לב וכלי דם",
  oncall_resp: "🚨 תורן — נשימה",
  oncall_gi: "🚨 תורן — GI וכבד",
  oncall_neuro: "🚨 תורן — נוירולוגיה",
  oncall_metabolic: "🚨 תורן — מטבולי וכליות",
  oncall_heme: "🚨 תורן — המטולוגיה ודם",
  oncall_general: "🚨 תורן — כללי",
};

// ─────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────

export function QuickReference({ onClose }: { onClose: () => void }) {
  const [section, setSection] = useState<SectionKey>("home");
  const [search, setSearch] = useState("");
  const [protoCategory, setProtoCategory] = useState("all");
  const [sharedCrCl, setSharedCrCl] = useState<number | null>(() => {
    const stored = safeGetItem("toranot_crcl");
    return stored ? Number(stored) : null;
  });
  const [isHD, setIsHD] = useState(() => safeGetItem("toranot_crcl_hd") === "1");
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => { if (copyTimerRef.current) clearTimeout(copyTimerRef.current); };
  }, []);

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
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopiedIdx(null), 1500);
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

  const currentDef = SECTIONS.find(s => s.key === section);

  // Navigate to adjacent section (prev/next arrows)
  const flatOrder = SECTIONS.map(s => s.key);
  const currentIdx = flatOrder.indexOf(section);
  const goPrev = currentIdx > 0 ? () => { setSection(flatOrder[currentIdx - 1]); setSearch(""); } : null;
  const goNext = currentIdx < flatOrder.length - 1 ? () => { setSection(flatOrder[currentIdx + 1]); setSearch(""); } : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-white dark:bg-[#0f0f1a] w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 dark:from-[#0a0a18] dark:to-[#0f0f20] text-white px-3 py-3 flex items-center gap-2 shrink-0">
          {section !== "home" ? (
            <button
              onClick={() => { setSection("home"); setSearch(""); }}
              className="min-w-[40px] min-h-[40px] flex items-center justify-center text-white/80 hover:text-white text-lg rounded-xl active:bg-white/10 transition-colors"
              aria-label="חזרה"
            >
              ←
            </button>
          ) : (
            <button
              onClick={onClose}
              className="min-w-[40px] min-h-[40px] flex items-center justify-center text-white/60 hover:text-white text-lg rounded-xl active:bg-white/10 transition-colors"
              aria-label="סגור"
            >
              ✕
            </button>
          )}
          <div className="flex-1 text-right min-w-0">
            <h2 className="text-base font-bold truncate">
              {section === "home" ? "עזר קליני" : `${currentDef?.icon ?? ""} ${currentDef?.label ?? ""}`}
            </h2>
            <p className="text-[11px] text-slate-400 truncate">
              {section === "home" ? "גריאטריה · פרוטוקולים · מחשבונים" : "עזר קליני"}
            </p>
          </div>
          {section !== "home" && (
            <button
              onClick={onClose}
              className="min-w-[40px] min-h-[40px] flex items-center justify-center text-white/40 hover:text-white text-sm rounded-xl active:bg-white/10 transition-colors"
              aria-label="סגור"
            >
              ✕
            </button>
          )}
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {section === "home" && <HomeGrid onSelect={(k) => { setSection(k); setSearch(""); }} />}

          {section === "protocols" && (
            <div className="p-4 space-y-3">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="חפש פרוטוקול..."
                dir="auto"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-[#1a1a2e] rounded-xl bg-gray-50 dark:bg-[#111] dark:text-gray-200 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <div dir="ltr" className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
                {PROTO_CATEGORIES.map((cat) => (
                  <button
                    key={cat.key}
                    onClick={() => setProtoCategory(cat.key)}
                    className={`flex-none px-3 py-1.5 text-xs rounded-full border transition-colors ${
                      protoCategory === cat.key
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white dark:bg-[#111] text-gray-600 dark:text-gray-300 border-gray-200 dark:border-[#1a1a2e]"
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
              {crclBucket ? (
                <div className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs font-medium ${
                  crclBucket === "gt50" ? "bg-green-50 text-green-700 dark:bg-green-950/20 dark:text-green-400" :
                  crclBucket === "hd" ? "bg-purple-50 text-purple-700 dark:bg-purple-950/20 dark:text-purple-400" :
                  "bg-orange-50 text-orange-700 dark:bg-orange-950/20 dark:text-orange-400"
                }`}>
                  <span>
                    {crclBucket === "hd" ? "💊 HD — מינונים מותאמים לדיאליזה" :
                     `💊 CrCl ${sharedCrCl} ml/min (${BUCKET_LABELS[crclBucket]}) — מינונים מותאמים`}
                  </span>
                  <button onClick={() => setSection("crcl")} className="underline">שנה</button>
                </div>
              ) : (
                <button
                  onClick={() => setSection("crcl")}
                  className="w-full text-center text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/20 rounded-xl px-3 py-2 active:bg-blue-100 transition-colors"
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
                  <div key={i} className={`border rounded-xl p-3 space-y-2 ${hasAdjustments ? "border-orange-300 bg-orange-50/30 dark:bg-orange-950/10" : "border-gray-200 dark:border-[#1a1a2e]"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-sm">{p.conditionHe}</div>
                        <div className="text-xs text-gray-500">{p.condition}</div>
                      </div>
                      <button
                        onClick={() => handleCopyProtocol(p, i)}
                        className="flex-none text-xs px-2 py-1 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 active:bg-gray-100 dark:active:bg-gray-800 transition-colors"
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
                      <div className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-[#111] rounded-lg p-2">{p.notes}</div>
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
            </div>
          )}

          {section === "meds" && (
            <div className="p-4 space-y-2">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="חפש תרופה..."
                dir="auto"
                className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-[#1a1a2e] rounded-xl bg-gray-50 dark:bg-[#111] dark:text-gray-200 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500 outline-none mb-2"
              />
              {filteredMeds.map((m, i) => (
                <div key={i} className="border border-gray-200 dark:border-[#1a1a2e] rounded-xl p-3 space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-bold text-sm text-blue-800 dark:text-blue-300" dir="ltr">{m.name}</span>
                    <span className="text-xs text-gray-500 shrink-0">{m.indication}</span>
                  </div>
                  <div className="text-sm font-mono bg-blue-50 dark:bg-blue-950/20 text-blue-900 dark:text-blue-200 px-2 py-1 rounded-lg" dir="ltr">
                    {m.dose} {m.route}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">{m.notes}</div>
                </div>
              ))}
            </div>
          )}

          {section === "crcl" && <div className="p-4"><CrClCalculator onCrClChange={(crcl, hd) => handleCrClChange(crcl, hd)} /></div>}
          {section === "curb65" && <div className="p-4"><CURB65Calculator /></div>}
          {section === "news2" && <div className="p-4"><NEWS2Calculator /></div>}
          {section === "lytes" && <div className="p-4"><ElectrolyteReference /></div>}
          {section === "insulin" && <div className="p-4"><InsulinReference /></div>}
          {section === "delirium" && <div className="p-4"><DeliriumReference /></div>}
          {section === "falls" && <div className="p-4"><FallsReference /></div>}
          {section === "beers" && <div className="p-4"><BeersReference /></div>}
          {section === "pressure" && <div className="p-4"><PressureInjuryReference /></div>}
          {section === "discharge" && <div className="p-4"><DischargeChecklist /></div>}
          {section === "orthoAdmit" && <div className="p-4"><OrthoGeriatricAdmission /></div>}
          {section === "osteoporosis" && <div className="p-4"><OsteoporosisProtocol /></div>}
          {section === "phones" && <div className="p-4"><PhoneDirectory /></div>}

          {/* On-Call Protocols */}
          {section === "chestpain" && <div className="p-4"><ChestPainProtocol /></div>}
          {section === "dyspnea" && <div className="p-4"><AcuteDyspneaProtocol /></div>}
          {section === "gibleed" && <div className="p-4"><GIBleedProtocol /></div>}
          {section === "anaphylaxis" && <div className="p-4"><AnaphylaxisProtocol /></div>}
          {section === "htncrisis" && <div className="p-4"><HypertensiveProtocol /></div>}
          {section === "rapidaf" && <div className="p-4"><RapidAFProtocol /></div>}
          {section === "syncope" && <div className="p-4"><SyncopeProtocol /></div>}
          {section === "fever" && <div className="p-4"><FeverWorkupProtocol /></div>}
          {section === "seizure" && <div className="p-4"><SeizureProtocol /></div>}
          {section === "dka" && <div className="p-4"><DKA_HHS_Protocol /></div>}
          {section === "transfusion" && <div className="p-4"><TransfusionReactionProtocol /></div>}
          {section === "pain" && <div className="p-4"><PainProtocol /></div>}
          {section === "stroke" && <div className="p-4"><AcuteStrokeProtocol /></div>}
          {section === "hyponatremia" && <div className="p-4"><HyponatremiaProtocol /></div>}
          {section === "hyperkalemia" && <div className="p-4"><HyperkalemiaProtocol /></div>}
          {section === "hypernatremia" && <div className="p-4"><HypernatremiaProtocol /></div>}
          {section === "hypercalcemia" && <div className="p-4"><HypercalcemiaProtocol /></div>}
          {section === "hypermagnesemia" && <div className="p-4"><HypermagnesemiaProtocol /></div>}
          {section === "ecg" && <div className="p-4"><ECGInterpreter /></div>}
          {section === "hypoglycemia" && <div className="p-4"><HypoglycemiaProtocol /></div>}
          {section === "ams" && <div className="p-4"><AlteredMentalStatusProtocol /></div>}
          {section === "falloncall" && <div className="p-4"><FallProtocolOnCall /></div>}
          {section === "dvtpe" && <div className="p-4"><DVTPEProtocol /></div>}
          {section === "liver" && <div className="p-4"><LiverProtocol /></div>}
          {section === "steroids" && <div className="p-4"><CorticosteroidProtocol /></div>}
          {section === "insomnia" && <div className="p-4"><InsomniaBehaviorProtocol /></div>}
          {section === "retention" && <div className="p-4"><UrinaryRetentionProtocol /></div>}
          {section === "bloodproducts" && <div className="p-4"><BloodProductsProtocol /></div>}
          {section === "abdomen" && <div className="p-4"><AcuteAbdomenProtocol /></div>}
          {section === "aki" && <div className="p-4"><AcuteKidneyInjuryProtocol /></div>}
          {section === "death" && <div className="p-4"><DeathPronouncementProtocol /></div>}
          {section === "anticoagreversal" && <div className="p-4"><AnticoagReversalProtocol /></div>}
        </div>

        {/* ── Footer nav ── */}
        <div className="border-t border-gray-200 dark:border-[#1a1a2e] bg-white dark:bg-[#0f0f1a] px-3 py-2 shrink-0">
          {section === "home" ? (
            <button
              onClick={onClose}
              className="w-full min-h-[44px] rounded-xl text-sm font-medium text-gray-500 dark:text-gray-400 active:bg-gray-100 dark:active:bg-gray-800"
            >
              סגור
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={goPrev ?? undefined}
                disabled={!goPrev}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-lg text-gray-400 dark:text-gray-500 active:bg-gray-100 dark:active:bg-gray-800 disabled:opacity-20 transition-opacity"
                aria-label="הקודם"
              >
                →
              </button>
              <button
                onClick={() => { setSection("home"); setSearch(""); }}
                className="flex-1 min-h-[44px] rounded-xl text-sm font-medium text-gray-500 dark:text-gray-400 active:bg-gray-100 dark:active:bg-gray-800 flex items-center justify-center gap-1.5"
              >
                <span className="text-base">☰</span> תפריט
              </button>
              <button
                onClick={goNext ?? undefined}
                disabled={!goNext}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-lg text-gray-400 dark:text-gray-500 active:bg-gray-100 dark:active:bg-gray-800 disabled:opacity-20 transition-opacity"
                aria-label="הבא"
              >
                ←
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// HOME GRID
// ─────────────────────────────────────────────────────────

function HomeGrid({ onSelect }: { onSelect: (key: SectionKey) => void }) {
  const groups = [
    "geriatrics", "ortho", "protocols", "calculators", "quickaccess",
    "oncall_cardio", "oncall_resp", "oncall_gi", "oncall_neuro",
    "oncall_metabolic", "oncall_heme", "oncall_general",
  ] as const;
  return (
    <div className="p-4 space-y-5">
      {groups.map((group) => {
        const items = SECTIONS.filter((s) => s.group === group);
        return (
          <div key={group}>
            <h3 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2 px-1">
              {GROUP_LABELS[group]}
            </h3>
            <div className={`grid gap-2.5 ${group === "calculators" || group === "quickaccess" ? "grid-cols-3" : items.length >= 5 ? "grid-cols-3" : "grid-cols-2"}`}>
              {items.map((s) => (
                <button
                  key={s.key}
                  onClick={() => onSelect(s.key)}
                  className="flex flex-col items-center justify-center gap-1.5 py-4 px-2 rounded-2xl border border-gray-200 dark:border-[#1a1a2e] bg-gray-50 dark:bg-[#111] active:bg-gray-100 dark:active:bg-[#1a1a2e] transition-colors"
                >
                  <span className="text-2xl">{s.icon}</span>
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300 text-center leading-tight">{s.label}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

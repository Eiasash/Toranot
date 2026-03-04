/**
 * Drug Safety Engine
 * 
 * Two safety layers:
 * 1. Drug interaction checker — flags dangerous combos in task text
 * 2. Renal dose adjustment — flags drugs needing dose adjustment when CrCl is low
 * 
 * These are NOT comprehensive databases — they cover the 30-40 most dangerous
 * combinations and renal-adjusted drugs commonly seen in geriatric wards.
 */

import type { PatientEntry, LabEntry } from "../types";

// ════════════════════════════════════════════════════════════
// 1. DRUG INTERACTION CHECKER
// ════════════════════════════════════════════════════════════

export interface DrugInteraction {
  drugA: string;       // regex-friendly name
  drugB: string;
  severity: "critical" | "major" | "moderate";
  risk: string;        // short Hebrew description
  detail: string;      // clinical detail
}

// Drug name patterns for matching in task text
const DRUG_PATTERNS: Record<string, RegExp> = {
  // QT-prolonging
  amiodarone: /amiodarone|אמיודרון|cordarone|קורדרון/i,
  ciprofloxacin: /ciprofloxacin|ציפרופלוקסצין|cipro|ציפרו/i,
  levofloxacin: /levofloxacin|לבופלוקסצין|levaquin/i,
  azithromycin: /azithromycin|אזיתרומיצין|zithromax/i,
  haloperidol: /haloperidol|הלופרידול|haldol|האלדול/i,
  ondansetron: /ondansetron|אונדנסטרון|zofran|זופרן/i,
  metoclopramide: /metoclopramide|מטוקלופרמיד|pramin|פרמין/i,
  escitalopram: /escitalopram|אסציטלופרם|cipralex/i,
  // Bleeding risk
  warfarin: /warfarin|וורפרין|coumadin|קומדין/i,
  enoxaparin: /enoxaparin|אנוקספרין|clexane|קלקסן/i,
  heparin: /heparin|הפרין/i,
  apixaban: /apixaban|אפיקסבן|eliquis|אליקוויס/i,
  rivaroxaban: /rivaroxaban|ריברוקסבן|xarelto/i,
  aspirin: /aspirin|אספירין|cardioaspirin|קרדיואספירין/i,
  clopidogrel: /clopidogrel|קלופידוגרל|plavix|פלאביקס/i,
  nsaid: /NSAID|ibuprofen|איבופרופן|diclofenac|דיקלופנק|naproxen|נפרוקסן|voltaren|אדויל|advil|nurofen/i,
  // Renal/Electrolyte
  spironolactone: /spironolactone|ספירונולקטון|aldactone/i,
  amiloride: /amiloride|אמילוריד/i,
  acei: /enalapril|אנלפריל|ramipril|רמיפריל|lisinopril|captopril|קפטופריל|ACEi/i,
  arb: /losartan|לוסרטן|valsartan|ולסרטן|candesartan|ARB/i,
  potassium: /KCl|אשלגן|potassium/i,
  // Serotonin
  ssri: /SSRI|sertraline|סרטרלין|paroxetine|פרוקסטין|fluoxetine|פלואוקסטין|escitalopram|cipralex|ציפרלקס/i,
  tramadol: /tramadol|טרמדול|tramadex/i,
  // Sedation
  benzodiazepine: /benzo|lorazepam|לוראזפם|diazepam|דיאזפם|midazolam|מידזולם|clonazepam|קלונזפם|oxazepam/i,
  opioid: /morphine|מורפין|oxycodone|אוקסיקודון|fentanyl|פנטניל|tramadol|טרמדול/i,
  // Other
  metformin: /metformin|מטפורמין|glucophage/i,
  digoxin: /digoxin|דיגוקסין|lanoxin/i,
  lithium: /lithium|ליתיום/i,
  trimethoprim: /trimethoprim|טרימתופרים|bactrim|באקטרים|septra/i,
  gentamicin: /gentamicin|גנטמיצין/i,
  vancomycin: /vancomycin|ונקומיצין/i,
  fluconazole: /fluconazole|פלוקונזול|diflucan/i,
  carbamazepine: /carbamazepine|קרבמזפין|tegretol|טגרטול/i,
  phenytoin: /phenytoin|פניטואין|dilantin/i,
  furosemide: /furosemide|פורוסמיד|lasix|לאסיקס|torsemide|torasemide/i,
  // Anticholinergic burden — Beers Criteria 2023 high-risk drugs
  anticholinergic_oxybutynin: /oxybutynin|אוקסיבוטינין|ditropan/i,
  anticholinergic_tolterodine: /tolterodine|טולטרודין|detrol/i,
  anticholinergic_solifenacin: /solifenacin|סוליפנצין|vesicare/i,
  anticholinergic_amitriptyline: /amitriptyline|אמיטריפטילין|elatrol/i,
  anticholinergic_hydroxyzine: /hydroxyzine|הידרוקסיזין|atarax/i,
  anticholinergic_diphenhydramine: /diphenhydramine|diphenhydr|benadryl|nytol/i,
  anticholinergic_meclizine: /meclizine|meclizin/i,
  anticholinergic_chlorphenamine: /chlorphenamine|chlorphenir|piriton/i,
};

const INTERACTIONS: DrugInteraction[] = [
  // ── QT prolongation combos ──
  { drugA: "amiodarone", drugB: "ciprofloxacin", severity: "critical", risk: "QT prolongation → Torsades", detail: "שני התרופות מאריכות QT. סיכון ל-Torsades de Pointes. שקול חלופה ל-Cipro" },
  { drugA: "amiodarone", drugB: "levofloxacin", severity: "critical", risk: "QT prolongation → Torsades", detail: "שני התרופות מאריכות QT. שקול Ceftriaxone במקום FQ" },
  { drugA: "amiodarone", drugB: "azithromycin", severity: "critical", risk: "QT prolongation → Torsades", detail: "Azithromycin + Amiodarone = סיכון גבוה ל-arrhythmia" },
  { drugA: "amiodarone", drugB: "haloperidol", severity: "critical", risk: "QT prolongation → Torsades", detail: "שניהם מאריכים QT. שקול Quetiapine במינון נמוך" },
  { drugA: "amiodarone", drugB: "ondansetron", severity: "major", risk: "QT prolongation", detail: "שקול Metoclopramide כחלופה לזופרן" },
  { drugA: "haloperidol", drugB: "ondansetron", severity: "major", risk: "QT prolongation", detail: "שניהם מאריכים QT. עקוב אחרי QTc" },
  { drugA: "ciprofloxacin", drugB: "haloperidol", severity: "major", risk: "QT prolongation", detail: "שקול חלופה לאחד מהם" },
  { drugA: "escitalopram", drugB: "ondansetron", severity: "major", risk: "QT prolongation", detail: "שניהם מאריכים QT" },
  { drugA: "metoclopramide", drugB: "haloperidol", severity: "major", risk: "EPS + QT", detail: "סיכון מוגבר לתסמינים אקסטרה-פירמידליים" },

  // ── Bleeding risk ──
  { drugA: "warfarin", drugB: "nsaid", severity: "critical", risk: "דימום חמור", detail: "NSAID + Warfarin = סיכון דימום GI x3-5. הימנע!" },
  { drugA: "apixaban", drugB: "nsaid", severity: "critical", risk: "דימום חמור", detail: "NOAC + NSAID = סיכון דימום מוגבר. הימנע!" },
  { drugA: "rivaroxaban", drugB: "nsaid", severity: "critical", risk: "דימום חמור", detail: "NOAC + NSAID = סיכון דימום מוגבר. הימנע!" },
  { drugA: "enoxaparin", drugB: "nsaid", severity: "major", risk: "דימום", detail: "LMWH + NSAID = סיכון דימום מוגבר" },
  { drugA: "warfarin", drugB: "aspirin", severity: "major", risk: "דימום מוגבר", detail: "Triple therapy? ודא שיש אינדיקציה ברורה לשניהם" },
  { drugA: "aspirin", drugB: "nsaid", severity: "major", risk: "דימום GI", detail: "Aspirin + NSAID = סיכון כיב ודימום. שקול PPI" },
  { drugA: "clopidogrel", drugB: "nsaid", severity: "major", risk: "דימום", detail: "שילוב מגביר סיכון דימום" },
  { drugA: "warfarin", drugB: "ciprofloxacin", severity: "major", risk: "INR ↑↑", detail: "Cipro מעכב CYP1A2 → INR עולה. עקוב INR יומי" },
  { drugA: "warfarin", drugB: "fluconazole", severity: "critical", risk: "INR ↑↑↑", detail: "Fluconazole מעכב CYP2C9 → INR עולה דרסטית. הפחת מינון Warfarin 50%" },
  { drugA: "warfarin", drugB: "trimethoprim", severity: "major", risk: "INR ↑↑", detail: "Bactrim מעלה INR. עקוב יומי" },

  // ── Hyperkalemia ──
  { drugA: "acei", drugB: "spironolactone", severity: "major", risk: "היפרקלמיה", detail: "ACEi + Spironolactone = סיכון K+ ↑↑. עקוב K+ תוך 48-72h" },
  { drugA: "arb", drugB: "spironolactone", severity: "major", risk: "היפרקלמיה", detail: "ARB + Spironolactone = סיכון K+ ↑↑" },
  { drugA: "acei", drugB: "potassium", severity: "major", risk: "היפרקלמיה", detail: "ACEi + KCl = סיכון K+ ↑↑. בדוק K+ לפני מתן" },
  { drugA: "acei", drugB: "trimethoprim", severity: "major", risk: "היפרקלמיה", detail: "Bactrim + ACEi = סיכון K+ ↑↑ בקשישים" },
  { drugA: "spironolactone", drugB: "potassium", severity: "critical", risk: "היפרקלמיה חמורה", detail: "אין לתת KCl עם Spironolactone! סכנת חיים" },

  // ── Serotonin syndrome ──
  { drugA: "ssri", drugB: "tramadol", severity: "major", risk: "תסמונת סרוטונין", detail: "SSRI + Tramadol = סיכון Serotonin syndrome. שקול Paracetamol + weak opioid" },

  // ── Sedation / respiratory depression ──
  { drugA: "benzodiazepine", drugB: "opioid", severity: "critical", risk: "דיכוי נשימתי", detail: "Benzo + Opioid = סיכון דיכוי נשימה ומוות בקשישים. הימנע!" },

  // ── Nephrotoxicity ──
  { drugA: "gentamicin", drugB: "vancomycin", severity: "major", risk: "נפרוטוקסיות", detail: "שני ABx נפרוטוקסיים. עקוב Cr יומי, שקול חלופה" },
  { drugA: "nsaid", drugB: "acei", severity: "critical", risk: "Triple Whammy → AKI חריף", detail: "NSAID + ACEi/ARB = הפחתת זרימת דם כלייתית. עם משתן = Triple Whammy — AKI חריף בקשישים. הפסק NSAID" },
  { drugA: "nsaid", drugB: "arb", severity: "critical", risk: "Triple Whammy → AKI חריף", detail: "NSAID + ARB + משתן = Triple Whammy — AKI חריף. הפסק NSAID מיידית" },
  { drugA: "nsaid", drugB: "furosemide", severity: "critical", risk: "Triple Whammy → AKI", detail: "NSAID מנטרל ואזודילטציה כלייתית של Prostaglandins → AKI עם Furosemide" },
  { drugA: "nsaid", drugB: "metformin", severity: "major", risk: "AKI + לקטיק אצידוזיס", detail: "NSAID → AKI → הצטברות Metformin → לקטיק אצידוזיס" },

  // ── Digoxin ──
  { drugA: "digoxin", drugB: "amiodarone", severity: "critical", risk: "טוקסיות דיגוקסין", detail: "Amiodarone מעלה רמת Digoxin x2. הפחת Digoxin 50%!" },

  // ── Anticholinergic combinations (Beers 2023) ──
  { drugA: "anticholinergic_oxybutynin", drugB: "anticholinergic_amitriptyline", severity: "critical", risk: "נטל אנטיכולינרגי גבוה → דליריום", detail: "Oxybutynin + Amitriptyline = נטל אנטיכולינרגי ≥4. סיכון דליריום, בלבול, אצירת שתן. בקשישים — הפסק לפחות אחד" },
  { drugA: "anticholinergic_oxybutynin", drugB: "anticholinergic_hydroxyzine", severity: "major", risk: "נטל אנטיכולינרגי", detail: "שני תרופות אנטיכולינרגיות — סיכון דליריום ונפילה בקשישים. שקול חלופה" },
  { drugA: "anticholinergic_tolterodine", drugB: "anticholinergic_amitriptyline", severity: "critical", risk: "נטל אנטיכולינרגי גבוה → דליריום", detail: "Tolterodine + Amitriptyline = נטל אנטיכולינרגי גבוה. Beers 2023: הימנע בגיל > 65" },
  { drugA: "anticholinergic_diphenhydramine", drugB: "benzodiazepine", severity: "critical", risk: "דיכוי CNS + נטל אנטיכולינרגי", detail: "Diphenhydramine (אנטיהיסטמין) + Benzo = סיכון נפילות, דליריום, דיכוי נשימתי. אסור בגיל > 65" },
  // ── Triple Whammy already covered in nephrotoxicity above ──
  // ── Seizure threshold ──
  { drugA: "carbamazepine", drugB: "warfarin", severity: "major", risk: "INR ↓↓", detail: "CBZ inducer CYP → מוריד INR. צריך מינון Warfarin גבוה יותר" },
];

/**
 * Scan all task text for a patient and return detected interactions.
 */
export function checkDrugInteractions(patient: PatientEntry): DrugInteraction[] {
  // Combine all text sources where drugs might be mentioned
  const allText = [
    ...patient.tasks.map((t) => t.text),
    ...patient.generatedTasks.map((t) => t.text),
    ...patient.status,
    ...patient.flags,
  ].join(" ");

  // Find all drugs mentioned
  const detectedDrugs: string[] = [];
  for (const [drugName, pattern] of Object.entries(DRUG_PATTERNS)) {
    if (pattern.test(allText)) {
      detectedDrugs.push(drugName);
    }
  }

  // Check for interactions between detected drugs
  const found: DrugInteraction[] = [];
  for (const interaction of INTERACTIONS) {
    if (
      detectedDrugs.includes(interaction.drugA) &&
      detectedDrugs.includes(interaction.drugB)
    ) {
      found.push(interaction);
    }
  }

  // Sort by severity: critical first
  return found.sort((a, b) => {
    const order = { critical: 0, major: 1, moderate: 2 };
    return order[a.severity] - order[b.severity];
  });
}

// ════════════════════════════════════════════════════════════
// 2. RENAL DOSE ADJUSTMENT WARNINGS
// ════════════════════════════════════════════════════════════

export interface RenalWarning {
  drug: string;
  adjustment: string;   // Hebrew guidance
  crcl: number;         // conservative CrCl used for the decision
  severity: "critical" | "warning";
  // Flags that the CrCl was estimated without actual patient weight/sex.
  // The displayed CrCl is the LOWER of two demographic estimates so the
  // engine errs toward over-alerting rather than under-alerting.
  weightAssumed: true;
  crclRange: { female55kg: number; male70kg: number };
}

interface RenalDrug {
  name: string;
  pattern: RegExp;
  thresholds: Array<{
    maxCrCl: number;
    severity: "critical" | "warning";
    guidance: string;
  }>;
}

const RENAL_DRUGS: RenalDrug[] = [
  {
    name: "Enoxaparin",
    pattern: /enoxaparin|אנוקספרין|clexane|קלקסן/i,
    thresholds: [
      { maxCrCl: 30, severity: "critical", guidance: "CrCl <30: הפחת ל-1mg/kg x1/d (לא x2/d)!" },
      { maxCrCl: 15, severity: "critical", guidance: "CrCl <15: הימנע! שקול UFH" },
    ],
  },
  {
    name: "Metformin",
    pattern: /metformin|מטפורמין|glucophage/i,
    thresholds: [
      { maxCrCl: 30, severity: "critical", guidance: "CrCl <30: הפסק Metformin! סיכון לקטיק אצידוזיס" },
      { maxCrCl: 45, severity: "warning", guidance: "CrCl 30-45: הפחת ל-500mg x2/d. עקוב Cr" },
    ],
  },
  {
    name: "Vancomycin",
    pattern: /vancomycin|ונקומיצין/i,
    thresholds: [
      { maxCrCl: 30, severity: "critical", guidance: "CrCl <30: loading dose רגיל, maintenance q48h. נטר רמות!" },
      { maxCrCl: 50, severity: "warning", guidance: "CrCl 30-50: q24h. בדוק trough לפני מנה 4" },
    ],
  },
  {
    name: "Gentamicin",
    pattern: /gentamicin|גנטמיצין/i,
    thresholds: [
      { maxCrCl: 40, severity: "critical", guidance: "CrCl <40: הארך מרווח מתן, נטר רמות. שקול חלופה בקשישים!" },
    ],
  },
  {
    name: "Apixaban",
    pattern: /apixaban|אפיקסבן|eliquis/i,
    thresholds: [
      { maxCrCl: 25, severity: "critical", guidance: "CrCl <25: הימנע! שקול UFH / Warfarin" },
      { maxCrCl: 50, severity: "warning", guidance: "CrCl 25-50 + גיל>80 / משקל<60: הפחת ל-2.5mg x2/d" },
    ],
  },
  {
    name: "Rivaroxaban",
    pattern: /rivaroxaban|ריברוקסבן|xarelto/i,
    thresholds: [
      { maxCrCl: 15, severity: "critical", guidance: "CrCl <15: הימנע!" },
      { maxCrCl: 50, severity: "warning", guidance: "CrCl 15-50: הפחת ל-15mg x1/d (AF) / 10mg (VTE)" },
    ],
  },
  {
    name: "Gabapentin",
    pattern: /gabapentin|גבפנטין|neurontin/i,
    thresholds: [
      { maxCrCl: 15, severity: "critical", guidance: "CrCl <15: 100-300mg post-dialysis" },
      { maxCrCl: 30, severity: "warning", guidance: "CrCl 15-30: max 300mg x1/d" },
      { maxCrCl: 60, severity: "warning", guidance: "CrCl 30-60: max 300mg x2/d" },
    ],
  },
  {
    name: "Pregabalin",
    pattern: /pregabalin|פרגבלין|lyrica/i,
    thresholds: [
      { maxCrCl: 30, severity: "warning", guidance: "CrCl <30: הפחת 50-75% מהמינון" },
      { maxCrCl: 60, severity: "warning", guidance: "CrCl 30-60: הפחת 50% מהמינון" },
    ],
  },
  {
    name: "Digoxin",
    pattern: /digoxin|דיגוקסין|lanoxin/i,
    thresholds: [
      { maxCrCl: 30, severity: "critical", guidance: "CrCl <30: 0.0625mg/d או כל יומיים. נטר רמות!" },
      { maxCrCl: 50, severity: "warning", guidance: "CrCl 30-50: 0.125mg/d. Target 0.5-0.9 ng/mL" },
    ],
  },
  {
    name: "Colchicine",
    pattern: /colchicine|קולכיצין/i,
    thresholds: [
      { maxCrCl: 30, severity: "critical", guidance: "CrCl <30: הימנע! סכנת טוקסיות חמורה" },
      { maxCrCl: 50, severity: "warning", guidance: "CrCl 30-50: הפחת 50%, מקסימום 0.5mg x1/d" },
    ],
  },
  {
    name: "Bactrim / TMP-SMX",
    pattern: /bactrim|באקטרים|trimethoprim|טרימתופרים|TMP.?SMX/i,
    thresholds: [
      { maxCrCl: 15, severity: "critical", guidance: "CrCl <15: הימנע!" },
      { maxCrCl: 30, severity: "warning", guidance: "CrCl 15-30: 50% מהמינון. עקוב K+!" },
    ],
  },
  {
    name: "Allopurinol",
    pattern: /allopurinol|אלופורינול/i,
    thresholds: [
      { maxCrCl: 30, severity: "warning", guidance: "CrCl <30: max 100mg/d. התחל 50mg" },
      { maxCrCl: 60, severity: "warning", guidance: "CrCl 30-60: max 200mg/d" },
    ],
  },
  {
    name: "Ciprofloxacin",
    pattern: /ciprofloxacin|ציפרופלוקסצין|cipro/i,
    thresholds: [
      { maxCrCl: 30, severity: "warning", guidance: "CrCl <30: 250-500mg q18-24h (PO) / 200-400mg q18-24h (IV)" },
    ],
  },
  {
    name: "Levofloxacin",
    pattern: /levofloxacin|לבופלוקסצין/i,
    thresholds: [
      { maxCrCl: 50, severity: "warning", guidance: "CrCl 20-50: 750mg q48h / 500mg loading then 250mg q24h" },
      { maxCrCl: 20, severity: "critical", guidance: "CrCl <20: 750mg loading then 500mg q48h" },
    ],
  },
  {
    name: "Meropenem",
    pattern: /meropenem|מרופנם/i,
    thresholds: [
      { maxCrCl: 26, severity: "warning", guidance: "CrCl 10-26: 1g q12h (standard) / 500mg q12h" },
      { maxCrCl: 10, severity: "critical", guidance: "CrCl <10: 500mg q24h" },
    ],
  },
];

/**
 * Calculate CrCl using Cockcroft-Gault formula.
 * Returns null if insufficient data.
 *
 * FRAILTY CORRECTION (AGS/ASHP): For patients ≥75yo, serum Cr is floored at 1.0 mg/dL.
 * Low muscle mass in sarcopenic elderly causes artificially low Cr (0.4–0.7 mg/dL),
 * which mathematically overestimates CrCl by 30–60%, leading to toxic overdosing of
 * renally cleared drugs (DOACs, aminoglycosides, vancomycin, meropenem, etc.).
 * A Cr of 0.4 in a 90yo woman ≠ normal kidneys — it means low muscle mass.
 */
export function calculateCrCl(
  age: number | null,
  creatinine: number | null,
  weight?: number,       // kg — optional, default 70 for estimate
  isFemale?: boolean,    // optional, default false
): number | null {
  if (!age || !creatinine || creatinine <= 0) return null;
  // Apply creatinine floor for frail elderly (≥75yo) — prevents CrCl overestimation
  const cr = age >= 75 && creatinine < 1.0 ? 1.0 : creatinine;
  const w = weight ?? 70;
  const genderFactor = isFemale ? 0.85 : 1.0;
  return Math.round(((140 - age) * w * genderFactor) / (72 * cr));
}

/**
 * Get the latest creatinine value from patient labs.
 */
function getLatestCr(patient: PatientEntry): number | null {
  const labs = patient.labs ?? [];
  const crLabs = labs
    .filter((l) => /^Cr$/i.test(l.label))
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  return crLabs.length > 0 ? crLabs[0].value : null;
}

/**
 * Check for renal dose adjustments needed based on patient's CrCl and drug mentions.
 *
 * ── DEMOGRAPHIC CORRECTION ──
 * PatientEntry has no sex or weight fields. The Cockcroft-Gault formula is
 * highly sensitive to both, and the geriatric ward is predominantly female
 * and underweight (typical 50-65kg, age 75-95).
 *
 * A 70kg male assumption for this population overestimates CrCl by 20-35%,
 * which means drug dose warnings fire at the wrong thresholds.
 *
 * Approach: calculate CrCl for BOTH demographic extremes:
 *   - Conservative: 55kg female (sex factor 0.85)
 *   - Liberal:      70kg male   (sex factor 1.0)
 *
 * We use the LOWER (conservative) value for threshold decisions, erring
 * toward over-alerting rather than missing a dose adjustment in a frail
 * elderly woman. The warning label exposes this assumption so the clinician
 * can apply clinical judgment.
 */
export function checkRenalDoseWarnings(patient: PatientEntry): RenalWarning[] {
  const cr = getLatestCr(patient);
  if (cr === null || !patient.age) return [];

  // Calculate both demographic bounds
  const crclFemale55 = calculateCrCl(patient.age, cr, 55, true)!;
  const crclMale70   = calculateCrCl(patient.age, cr, 70, false)!;

  // Use the conservative (lower) estimate for threshold decisions.
  // This protects the typical ward patient — a 55-65kg elderly woman —
  // from being under-warned because the formula assumed a 70kg man.
  const conservativeCrCl = Math.min(crclFemale55, crclMale70);

  const allText = [
    ...patient.tasks.map((t) => t.text),
    ...patient.generatedTasks.map((t) => t.text),
    ...patient.status,
  ].join(" ");

  const warnings: RenalWarning[] = [];

  for (const drug of RENAL_DRUGS) {
    if (!drug.pattern.test(allText)) continue;

    // Find the most severe applicable threshold using the conservative CrCl.
    // Secondary sort by maxCrCl ascending so that within the same severity,
    // the most specific (narrowest) threshold wins. Without this, Enoxaparin
    // CrCl <15 would get the CrCl <30 "reduce dose" guidance instead of
    // the CrCl <15 "AVOID — use UFH" guidance (both are severity "critical").
    const applicable = drug.thresholds
      .filter((t) => conservativeCrCl <= t.maxCrCl)
      .sort((a, b) => {
        const order = { critical: 0, warning: 1 };
        const severityDiff = order[a.severity] - order[b.severity];
        if (severityDiff !== 0) return severityDiff;
        return a.maxCrCl - b.maxCrCl;
      });

    if (applicable.length > 0) {
      warnings.push({
        drug: drug.name,
        adjustment: applicable[0].guidance,
        crcl: conservativeCrCl,
        severity: applicable[0].severity,
        weightAssumed: true,
        crclRange: { female55kg: crclFemale55, male70kg: crclMale70 },
      });
    }
  }

  return warnings;
}

// ════════════════════════════════════════════════════════════
// 3. BEERS CRITERIA 2023 — Age-specific alerts
// ════════════════════════════════════════════════════════════
//
// American Geriatrics Society Beers Criteria 2023 update.
// Applies to patients ≥65yo. The entire geriatric ward qualifies.
// Focus: drugs with strong evidence of harm in the elderly that
// may not be flagged by the interaction engine because they're
// harmful as monotherapy, not just in combination.

export interface BeersCriteria {
  drug: string;           // display name
  category: string;       // e.g. "CNS / שינה"
  concern: string;        // short Hebrew risk description
  recommendation: string; // what to do
  severity: "avoid" | "caution"; // avoid = strong recommendation; caution = use with monitoring
}

interface BeersRule {
  name: string;
  pattern: RegExp;
  category: string;
  concern: string;
  recommendation: string;
  severity: "avoid" | "caution";
  minAge?: number; // default 65
}

const BEERS_RULES: BeersRule[] = [
  // ── Sedative-hypnotics / Sleep ──
  {
    name: "Zolpidem / Zopiclone",
    pattern: /zolpidem|זולפידם|stilnox|סטילנוקס|zopiclone|זופיקלון|imovane/i,
    category: "CNS / שינה",
    concern: "נפילות, שברי ירך, דליריום — עד 2× סיכון ב-≥65",
    recommendation: "הימנע. שקול Melatonin / Mirtazapine 7.5mg. אם חיוני — מינון מחצית",
    severity: "avoid",
  },
  // ── Benzodiazepines (standalone, not just in combo) ──
  {
    name: "Benzodiazepine",
    pattern: /lorazepam|לוראזפם|ativan|diazepam|דיאזפם|valium|ולאום|midazolam|מידזולם|clonazepam|קלונזפם|alprazolam|אלפרזולם|xanax|זנקס|oxazepam|אוקסזפם/i,
    category: "CNS / שינה",
    concern: "נפילות, דליריום, שברים, דיכוי נשימה — סיכון גבוה ≥75",
    recommendation: "הימנע בשימוש כרוני. אם חיוני (Status/Alcohol WD) — השתמש לטווח קצר בלבד",
    severity: "avoid",
  },
  // ── Tramadol ──
  {
    name: "Tramadol",
    pattern: /tramadol|טרמדול|tramadex|tramal|טרמאל/i,
    category: "משככי כאב",
    concern: "נפילות, סיזורים, סינדרום סרוטונין (במיוחד עם SSRI), היפוגליקמיה",
    recommendation: "הימנע ≥75. שקול Paracetamol ± Opioid קצר-טווח במינון מחצית",
    severity: "avoid",
  },
  // ── TCAs ──
  {
    name: "Amitriptyline / Nortriptyline (TCA)",
    pattern: /amitriptyline|אמיטריפטילין|elatrol|אלטרול|nortriptyline|נורטריפטילין|doxepin|דוקספין/i,
    category: "נוגדי דיכאון",
    concern: "עומס אנטיכולינרגי, היפוטנציה אורתוסטטית, הפרעות הולכה לבבית, דליריום",
    recommendation: "הימנע. שקול SSRI / Mirtazapine. אם לנוירופתיה — Pregabalin",
    severity: "avoid",
  },
  // ── First-gen antihistamines ──
  {
    name: "Diphenhydramine / Hydroxyzine (אנטי-היסטמין דור-1)",
    pattern: /diphenhydramine|דיפנהידרמין|benadryl|hydroxyzine|הידרוקסיזין|atarax|אטרקס|promethazine|פרומתזין|phenergan/i,
    category: "אנטי-היסטמין",
    concern: "עומס אנטיכולינרגי חמור — דליריום, אצירת שתן, עצירות, בלבול",
    recommendation: "הימנע. לגרד: Cetirizine / Loratadine. לבחילה: Ondansetron / Metoclopramide",
    severity: "avoid",
  },
  // ── First-gen antipsychotics ──
  {
    name: "Haloperidol / Chlorpromazine (אנטי-פסיכוטי I)",
    pattern: /haloperidol|הלופרידול|haldol|האלדול|chlorpromazine|כלורפרומזין|largactil/i,
    category: "אנטי-פסיכוטי",
    concern: "QT הארכה, EPS, נפילות, תמותה מוגברת בדמנציה",
    recommendation: "שימוש מוגבל. לדליריום הכרחי — מינון מינימלי קצר-טווח. לדמנציה: הימנע",
    severity: "caution",
  },
  // ── Sulfonylureas ──
  {
    name: "Glibenclamide / Gliclazide (Sulfonylurea)",
    pattern: /glibenclamide|גליבנקלמיד|daonil|דאוניל|gliclazide|גליקלזיד|diamicron|דיאמיקרון|glipizide|גליפיזיד/i,
    category: "סוכרת",
    concern: "היפוגליקמיה מתמשכת — t½ ארוך, לא ניתנת לניטרול מהיר ≥70",
    recommendation: "שקול DPP-4 inhibitor (Sitagliptin) או SGLT2i. אם Sulfonylurea — Gliclazide MR בלבד",
    severity: "avoid",
  },
  // ── NSAIDs standalone (age-gated, not just combo) ──
  {
    name: "NSAID (כולל Ibuprofen / Diclofenac)",
    pattern: /NSAID|ibuprofen|איבופרופן|diclofenac|דיקלופנק|naproxen|נפרוקסן|voltaren|אדויל|advil|nurofen/i,
    category: "משככי כאב",
    concern: "סיכון גבוה לדימום GI, AKI, החמרת אי-ספיקת לב ≥75",
    recommendation: "הימנע כברירת מחדל. לכאב: Paracetamol. אם חיוני — מינון קצר-טווח + PPI",
    severity: "avoid",
    minAge: 75,
  },
  // ── Muscle relaxants ──
  {
    name: "Baclofen / Cyclobenzaprine (מרגיעי שריר)",
    pattern: /baclofen|בקלופן|lioresal|cyclobenzaprine|ציקלובנזפרין|tizanidine|טיזנידין/i,
    category: "מרגיעי שריר",
    concern: "רעילות CNS, עוויתות בגמילה, שיתוק שלפוחית, נפילות",
    recommendation: "הימנע. לספסטיסיטי: Tizanidine מינון נמוך עם ניטור BP",
    severity: "avoid",
  },
  // ── Digoxin high dose (Beers specific threshold) ──
  {
    name: "Digoxin >0.125mg/d",
    pattern: /digoxin|דיגוקסין|lanoxin/i,
    category: "לב",
    concern: "חלון תרפויטי צר עם ירידה ב-CrCl — רעילות Digoxin ≥70",
    recommendation: "מינון מקסימלי 0.125mg/d בגרייטריה. נטר רמות ו-CrCl בכל שינוי",
    severity: "caution",
  },
  // ── Metoclopramide long-term (Beers 2023: tardive dyskinesia) ──
  {
    name: "Metoclopramide (Pramin)",
    pattern: /metoclopramide|מטוקלופרמיד|pramin|פרמין/i,
    category: "גסטרואנטרולוגי",
    concern: "שימוש ≥12 שבועות — סיכון לדיסקינזיה טרדיבית בלתי הפיכה (Beers 2023)",
    recommendation: "הימנע מטיפול ממושך. לגסטרופרזיס: הגבל ל-12 שבועות. לבחילות פוסט-אופ: מקובל קצר-טווח",
    severity: "caution",
  },
];

/**
 * Check for Beers Criteria concerns in patient medication/task text.
 * Age-gated — only applies to patients ≥65 (minAge per rule, default 65).
 */
export function checkBeersCriteria(patient: PatientEntry): BeersCriteria[] {
  const age = patient.age;
  if (!age || age < 65) return [];

  const allText = [
    ...patient.tasks.map((t) => t.text),
    ...patient.generatedTasks.map((t) => t.text),
    ...patient.status,
    ...(patient.notes ?? []),
  ].join(" ");

  const results: BeersCriteria[] = [];

  for (const rule of BEERS_RULES) {
    const effectiveMinAge = rule.minAge ?? 65;
    if (age < effectiveMinAge) continue;
    if (!rule.pattern.test(allText)) continue;

    results.push({
      drug: rule.name,
      category: rule.category,
      concern: rule.concern,
      recommendation: rule.recommendation,
      severity: rule.severity,
    });
  }

  return results;
}

// ════════════════════════════════════════════════════════════
// 4. ANTIBIOTIC EXTRACTION FROM EMPIRIC PLAN TEXT
// ════════════════════════════════════════════════════════════
//
// Parses a free-text empiric plan (e.g. "Ceftriaxone 2g IV q12h +
// Vancomycin 15-20mg/kg IV q8-12h") and returns normalized antibiotic
// names suitable for lookup in the dosing database.

const ABX_EXTRACT_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  // Order matters for overlapping matches — more specific first
  { pattern: /piperacillin[\s/-]*tazobactam|pip[\s/-]*tazo|tazocin|tazorex/i, name: "piperacillin/tazobactam" },
  { pattern: /amoxicillin[\s/-]*clavulan(?:ate|ic)|augmentin|amoxiclav/i, name: "amoxicillin/clavulanate" },
  { pattern: /ceftazidime[\s/-]*avibactam|zavicefta/i, name: "ceftazidime/avibactam" },
  { pattern: /ampicillin[\s/-]*sulbactam|unasyn/i, name: "ampicillin/sulbactam" },
  { pattern: /trimethoprim[\s/-]*sulfamethoxazole|TMP[\s/-]*SMX|bactrim|septra/i, name: "trimethoprim/sulfamethoxazole" },
  { pattern: /ceftriaxone|rocephin/i, name: "ceftriaxone" },
  { pattern: /cefazolin|cefamezin/i, name: "cefazolin" },
  { pattern: /cephalexin|ceforal/i, name: "cephalexin" },
  { pattern: /cefepime/i, name: "cefepime" },
  { pattern: /ceftazidime|fortum/i, name: "ceftazidime" },
  { pattern: /cefuroxime|zinacef/i, name: "cefuroxime" },
  { pattern: /meropenem|meronem/i, name: "meropenem" },
  { pattern: /ertapenem|invanz/i, name: "ertapenem" },
  { pattern: /imipenem/i, name: "imipenem" },
  { pattern: /aztreonam/i, name: "aztreonam" },
  { pattern: /vancomycin/i, name: "vancomycin" },
  { pattern: /ciprofloxacin|cipro(?!lex)/i, name: "ciprofloxacin" },
  { pattern: /levofloxacin|tavanic/i, name: "levofloxacin" },
  { pattern: /moxifloxacin|avelox/i, name: "moxifloxacin" },
  { pattern: /gentamicin/i, name: "gentamicin" },
  { pattern: /amikacin/i, name: "amikacin" },
  { pattern: /metronidazole|flagyl/i, name: "metronidazole" },
  { pattern: /clindamycin|dalacin/i, name: "clindamycin" },
  { pattern: /azithromycin|zithromax/i, name: "azithromycin" },
  { pattern: /nitrofurantoin|macrodantin/i, name: "nitrofurantoin" },
  { pattern: /fidaxomicin|dificlir/i, name: "fidaxomicin" },
  { pattern: /fluconazole|diflucan|triflucan/i, name: "fluconazole" },
  { pattern: /dexamethasone/i, name: "dexamethasone" },
];

/**
 * Extract antibiotic names from a free-text empiric plan string.
 * Returns deduplicated array of normalized lowercase names.
 */
export function extractAntibioticsFromPlan(planText: string): string[] {
  const found: string[] = [];
  for (const { pattern, name } of ABX_EXTRACT_PATTERNS) {
    if (pattern.test(planText)) {
      if (!found.includes(name)) {
        found.push(name);
      }
    }
  }
  return found;
}

import type { PatientEntry, Task, Urgency, TaskCategory } from "../types";
import { generateId } from "../utils/id";

interface RuleTask {
  text: string;
  urgency: Urgency;
  category?: TaskCategory;
}

/**
 * triggerField controls WHICH patient fields the regex runs against:
 *  - "tasks"     → status + flags + manual task text (DEFAULT — diagnosis never triggers rules)
 *  - "diagnosis" → only the diagnosis field
 *  - "all"       → diagnosis + status + flags + task text (legacy, avoid)
 *
 * Default is "tasks" so that chronic diagnoses (DM, CVA, CHF) don't auto-generate
 * workup tasks unless the condition is explicitly mentioned in the task list.
 */
interface Rule {
  trigger: RegExp;
  source: string;
  group?: string;
  triggerField?: "all" | "tasks" | "diagnosis";
  tasks: RuleTask[];
}

// ── Comfort care / palliative detection ──
// These patterns identify patients who should NOT get aggressive workup tasks.
// DNR/DNI alone is NOT enough — many DNR patients still get full medical care.
// Only explicit comfort/palliative flags trigger suppression.
const COMFORT_CARE_PATTERN = /comfort\s*care|palliative|פליאטיב|טיפול תומך בלבד|טיפול מנחם|EOL|end.of.life|הנוחות בלבד|טיפולי נוחות/i;

// Rule groups that are suppressed for comfort-care-only patients.
// These represent aggressive workup/intervention that conflicts with comfort goals.
const COMFORT_SUPPRESSED_GROUPS = new Set([
  "sepsis",       // blood cultures, lactate, aggressive abx — may still want comfort abx
  "aki",          // renal workup, fluid boluses
  "acs",          // troponin, cath lab, heparin
  "dvtpe",        // CTA, anticoagulation
  "transfusion",  // T&S, transfusion protocol
  "stroke",       // CT head, tPA, neurology
  "gibleed",      // type & screen, GI consult, scope
  "preop",        // pre-op workup
  "anemia",       // type & screen, workup
  "newadmit",     // full admission workup
]);

const RULES: Rule[] = [
  // ═══ DISCHARGE ═══
  {
    trigger: /משתחרר|שחרור|לשחרר|D\/C|discharge/i,
    source: "שחרור",
    group: "discharge",
    // No auto-generated tasks. Discharge is morning team work.
    // On-call only does what's explicitly written on the list.
    tasks: [],
  },

  // ═══ NPO ═══
  {
    trigger: /\bNPO\b/i,
    source: "NPO",
    group: "npo",
    tasks: [
      { text: "לוודא צום - ללא אוכל ושתייה", urgency: "stat", category: "other" },
      { text: "עירוי נוזלים IV", urgency: "urgent", category: "meds" },
    ],
  },

  // ═══ PRE-OP ═══
  {
    trigger: /ניתוח|טרום ניתוח|לפני ניתוח|pre.?op/i,
    source: "טרום ניתוח",
    group: "preop",
    triggerField: "tasks",
    tasks: [
      { text: "בדיקות דם טרום ניתוח (CBC, CMP, PT/INR, סוג ושתלב)", urgency: "stat", category: "labs" },
      { text: "חתימת הסכמה לניתוח", urgency: "urgent", category: "other" },
      { text: "התייעצות הרדמה", urgency: "urgent", category: "consult" },
      { text: "ABx מניעתי לפי פרוטוקול DAG", urgency: "urgent", category: "meds" },
    ],
  },

  // ═══ BLOOD PRODUCTS ═══
  {
    trigger: /עירוי דם|מנת דם|PRBCs?|מנות דם|packed\s*cells/i,
    source: "עירוי דם",
    group: "transfusion",
    tasks: [
      { text: "סוג ושתלב (Type & Screen)", urgency: "stat", category: "labs" },
      { text: "הכנת גישה ורידית", urgency: "urgent", category: "procedure" },
      { text: "ניטור סימנים חיוניים כל 15 דק' בזמן עירוי", urgency: "stat", category: "other" },
      { text: "CBC לאחר מנת דם", urgency: "routine", category: "labs" },
    ],
  },

  // ═══ DIABETES ═══
  {
    trigger: /סוכרת|אינסולין|DM[12]?(?!\w)|insulin|היפרגליקמיה/i,
    source: "סוכרת",
    group: "diabetes",
    triggerField: "tasks",
    // BS monitoring is ordered on admission, not an on-call task unless explicitly asked.
    tasks: [],
  },

  // ═══ FALL RISK ═══
  {
    trigger: /נפילה|FALL|סיכון ליפול|סכנת נפילה/i,
    source: "סיכון נפילה",
    group: "fall",
    triggerField: "tasks",
    // ── No auto-generated tasks.
    // "נפילה" in the task list is almost always a historical fall or fall-risk
    // flag documented at admission — not an acute event requiring CT.
    // Acute falls come through a nurse phone call; if CT is needed, the caller
    // triggers it. A generated CT task on every patient with a fall-risk flag
    // adds noise and false urgency. Remove from rules; handle via scenario buttons.
    tasks: [],
  },

  // ═══ BLADDER SCAN ═══
  {
    trigger: /\bBS\b|Bladder\s*Scan|בלדר\s*סקאן|סריקה\s*של\s*שלפוחית/i,
    source: "BS (Bladder Scan)",
    group: "bs",
    tasks: [
      { text: "BS (Bladder Scan) — קטטר חד פעמי אם >400ml", urgency: "routine", category: "procedure" },
    ],
  },

  // ═══ ISOLATION ═══
  {
    trigger: /בידוד|ISO(?:lation)?|MRSA|VRE|ESBL|CRE|CPE|C\.?\s*diff/i,
    source: "בידוד",
    group: "isolation",
    triggerField: "tasks",
    // All isolation tasks (signage, PPE, cultures) = nursing, not on-call doctor.
    tasks: [],
  },

  // ═══ CATHETER ═══
  {
    trigger: /קטטר(?!\s*חד)|catheter|פולי|foley/i,
    source: "קטטר שתן",
    group: "catheter",
    triggerField: "tasks",
    // No auto-generated tasks. I/O monitoring is done only if explicitly requested.
    tasks: [],
  },

  // ═══ PNEUMONIA — DAG: Ceftriaxone ± Azithromycin ═══
  {
    trigger: /דלקת ריאות|pneumonia|CAP|HAP|VAP|פנאומוניה|זיהום ריאתי/i,
    source: "דלקת ריאות",
    group: "pneumonia",
    triggerField: "tasks",
    tasks: [
      { text: "תרביות דם x2 (לפני ABx!)", urgency: "stat", category: "labs" },
      { text: "צילום חזה (CXR)", urgency: "stat", category: "imaging" },
      { text: "אנטיגן שתן: Legionella + Pneumococcus", urgency: "urgent", category: "labs" },
      { text: "ABx — DAG: Ceftriaxone 2g IV + Azithromycin 500mg (CAP); Pip-Tazo (HAP)", urgency: "stat", category: "meds" },
      { text: "חישוב CURB-65 (ראה עזר קליני)", urgency: "urgent", category: "other" },
      { text: "גזים עורקיים / SpO2", urgency: "urgent", category: "labs" },
    ],
  },

  // ═══ UTI — DAG: Ciprofloxacin PO / Ceftriaxone IV ═══
  {
    trigger: /UTI|דלקת.*שתן|זיהום.*שתן|פיאלונפריטיס|pyelonephritis/i,
    source: "זיהום בדרכי השתן",
    group: "uti",
    triggerField: "tasks",
    tasks: [
      { text: "תרבית שתן + בדיקת שתן כללית (לפני ABx!)", urgency: "stat", category: "labs" },
      { text: "תרביות דם x2 (אם חום/ספסיס)", urgency: "stat", category: "labs" },
      { text: "ABx — DAG: Ciprofloxacin 500 PO (לא מסובך) / Ceftriaxone 2g IV", urgency: "stat", category: "meds" },
      { text: "שקול הוצאת/החלפת קטטר אם קיים", urgency: "urgent", category: "procedure" },
    ],
  },

  // ═══ SEPSIS — DAG: Pip-Tazo ± Amikacin ═══
  {
    trigger: /ספסיס|sepsis|ספטי|septic|bacteremia|בקטרמיה/i,
    source: "ספסיס",
    group: "sepsis",
    triggerField: "tasks",
    tasks: [
      { text: "🔴 תרביות דם x2 משני אתרים (לפני ABx!)", urgency: "stat", category: "labs" },
      { text: "🔴 לקטט סרום (Lactate)", urgency: "stat", category: "labs" },
      { text: "🔴 ABx רחב תוך שעה — DAG: Pip-Tazo 4.5g IV q6h", urgency: "stat", category: "meds" },
      { text: "🔴 נוזלים IV: NaCl 0.9% — 30ml/kg bolus", urgency: "stat", category: "meds" },
      { text: "ניטור שתן — יעד >0.5ml/kg/h", urgency: "stat", category: "other" },
      { text: "לקטט חוזר לאחר 4-6 שעות", urgency: "urgent", category: "labs" },
      { text: "אם לקטט >4 / הלם → שקול ICU + vasopressors", urgency: "urgent", category: "consult" },
    ],
  },

  // ═══ CELLULITIS — DAG: Cefazolin IV / Cephalexin PO ═══
  {
    trigger: /צלוליטיס|cellulitis|דלקת.*עור|erysipelas|ארסיפלס/i,
    source: "צלוליטיס",
    group: "cellulitis",
    triggerField: "tasks",
    tasks: [
      { text: "סימון גבולות בעט (+ תאריך+שעה)", urgency: "stat", category: "other" },
      { text: "תיעוד צילום", urgency: "urgent", category: "other" },
      { text: "ABx — DAG: Cefazolin 2g IV q8h / Cephalexin 500 PO q6h", urgency: "stat", category: "meds" },
      { text: "אם מוגלה → Clindamycin (MRSA) + ניקוז", urgency: "urgent", category: "meds" },
    ],
  },

  // ═══ C. DIFFICILE — DAG: PO Vancomycin 125mg q6h ═══
  {
    trigger: /C\.?\s*diff|קלוסטרידיום|clostridium|שלשול.*אנטיביוטיקה/i,
    source: "חשד C. difficile",
    group: "cdiff",
    triggerField: "tasks",
    tasks: [
      { text: "שליחת צואה ל-C.diff PCR/Toxin", urgency: "stat", category: "labs" },
      { text: "בידוד מגע!", urgency: "stat", category: "other" },
      { text: "הפסקת ABx מיותרים (Fluoroquinolones, Clindamycin)", urgency: "stat", category: "meds" },
      { text: "טיפול — DAG: Vancomycin 125mg PO q6h x10d", urgency: "urgent", category: "meds" },
    ],
  },

  // ═══ FEVER WORKUP ═══
  {
    trigger: /חום|febrile|fever|טמפרטורה\s*גבוהה|38\.[5-9]|39\.\d|40\.\d/i,
    source: "חום — בירור",
    group: "fever",
    tasks: [
      { text: "תרביות דם x2", urgency: "stat", category: "labs" },
      { text: "בדיקת שתן כללית + תרבית", urgency: "stat", category: "labs" },
      { text: "צילום חזה (CXR)", urgency: "urgent", category: "imaging" },
      { text: "מעבדה: CBC, CRP, Procalcitonin", urgency: "urgent", category: "labs" },
      { text: "מיפוי מקור: קו מרכזי? קטטר? פצע? צלוליטיס?", urgency: "urgent", category: "other" },
    ],
  },

  // ═══ AKI ═══
  {
    trigger: /AKI|אי.?ספיקת כליות חדה|acute kidney|עליית קראטינין|כליות.*חדה/i,
    source: "AKI",
    group: "aki",
    triggerField: "tasks",
    tasks: [
      { text: "US כליות (שלילת חסימה)", urgency: "urgent", category: "imaging" },
      { text: "הפסקת נפרוטוקסיים: NSAIDs, ACEi, ARB, Aminoglycosides", urgency: "stat", category: "meds" },
      { text: "הערכת מצב נפחי + I/O", urgency: "stat", category: "other" },
      { text: "מעבדה: Cr, BUN, K+, Na+, גזים, FENa", urgency: "stat", category: "labs" },
      { text: "אם Pre-renal → NaCl bolus; אין שיפור → נפרולוג", urgency: "urgent", category: "consult" },
      { text: "התאמת מינון תרופות ל-CrCl (ראה עזר קליני)", urgency: "urgent", category: "meds" },
    ],
  },

  // ═══ HYPERKALEMIA ═══
  {
    trigger: /היפרקלמיה|hyperkalemia|K\+?\s*>\s*5\.?[5-9]|K\+?\s*>\s*[67]|אשלגן\s*גבוה/i,
    source: "היפרקלמיה",
    group: "hyperK",
    tasks: [
      { text: "🔴 א.ק.ג STAT (peaked T, wide QRS)", urgency: "stat", category: "labs" },
      { text: "🔴 Calcium Gluconate 10% 10ml IV (אם שינויי ECG)", urgency: "stat", category: "meds" },
      { text: "Insulin 10U IV + Dextrose 50% 50ml IV", urgency: "stat", category: "meds" },
      { text: "Kayexalate 30g PO / PR", urgency: "urgent", category: "meds" },
      { text: "K+ חוזר + ECG חוזר לאחר שעה", urgency: "urgent", category: "labs" },
      { text: "אם K>6.5 / שינויי ECG → שקול דיאליזה", urgency: "stat", category: "consult" },
    ],
  },

  // ═══ HYPOKALEMIA ═══
  {
    trigger: /היפוקלמיה|hypokalemia|K\+?\s*<\s*3\.?[50]|אשלגן\s*נמוך/i,
    source: "היפוקלמיה",
    group: "hypoK",
    tasks: [
      { text: "בדוק Mg2+ (חיוני להעלאת K+)", urgency: "stat", category: "labs" },
      { text: "K+ PO 40-80mEq/d (אם K>3.0)", urgency: "urgent", category: "meds" },
      { text: "K+ IV: KCl 10mEq/h (אם K<3.0 — מוניטור)", urgency: "stat", category: "meds" },
      { text: "ECG (U wave, ST depression)", urgency: "urgent", category: "labs" },
      { text: "K+ חוזר לאחר 2-4h", urgency: "urgent", category: "labs" },
    ],
  },

  // ═══ CHEST PAIN / ACS ═══
  {
    trigger: /כאב.*חזה|chest\s*pain|ACS|STEMI|NSTEMI|אוטם|MI\b|טרופונין.*גבוה|תסמונת כלילית/i,
    source: "כאב חזה / ACS",
    group: "acs",
    triggerField: "tasks",  // Known CAD/MI shouldn't trigger acute workup
    tasks: [
      { text: "🔴 א.ק.ג תוך 10 דקות!", urgency: "stat", category: "labs" },
      { text: "🔴 טרופונין x3 (T0, T3h, T6h)", urgency: "stat", category: "labs" },
      { text: "Aspirin 300mg PO", urgency: "stat", category: "meds" },
      { text: "Heparin IV / Enoxaparin SC", urgency: "stat", category: "meds" },
      { text: "NTG SL 0.4mg q5min x3 (אם SBP>90)", urgency: "stat", category: "meds" },
      { text: "CXR", urgency: "urgent", category: "imaging" },
      { text: "התייעצות קרדיולוגיה", urgency: "stat", category: "consult" },
    ],
  },

  // ═══ HEART FAILURE / PULMONARY EDEMA ═══
  {
    trigger: /אי.?ספיקת לב|CHF|heart\s*failure|בצקת ריאות|pulmonary\s*edema|HFrEF|HFpEF/i,
    source: "אי-ספיקת לב",
    group: "chf",
    triggerField: "tasks",
    tasks: [
      { text: "Furosemide IV 40-80mg", urgency: "stat", category: "meds" },
      { text: "I/O קפדני + משקל יומי", urgency: "stat", category: "other" },
      { text: "הגבלת נוזלים <1.5L + מלח", urgency: "urgent", category: "other" },
      { text: "CXR", urgency: "urgent", category: "imaging" },
      { text: "BNP / NT-proBNP", urgency: "urgent", category: "labs" },
      { text: "אם SpO2<90% → O2, שקול BiPAP", urgency: "stat", category: "procedure" },
    ],
  },

  // ═══ DVT / PE ═══
  {
    trigger: /DVT|PE\b|תסחיף ריאתי|פקקת ורידים|pulmonary\s*embol|deep\s*vein/i,
    source: "DVT / PE",
    group: "dvtpe",
    triggerField: "tasks",  // Only fire when PE/DVT appears in tasks/status, NOT diagnosis
    tasks: [
      { text: "D-Dimer", urgency: "stat", category: "labs" },
      { text: "DVT → Doppler US ורידי", urgency: "stat", category: "imaging" },
      { text: "PE → CTPA", urgency: "stat", category: "imaging" },
      { text: "Enoxaparin 1mg/kg SC q12h", urgency: "stat", category: "meds" },
      { text: "אם PE מסיבי → שקול thrombolysis + ICU", urgency: "stat", category: "consult" },
    ],
  },

  // ═══ DELIRIUM ═══
  {
    trigger: /דליריום|delirium|בלבול חריף|agitat|ערפול.*הכרה|acute\s*confusion/i,
    source: "דליריום",
    group: "delirium",
    triggerField: "tasks",  // Chronic confusion vs acute delirium
    tasks: [
      { text: "בירור: זיהום? תרופות? מטבולי? היפוקסיה? עצירות? אצירה?", urgency: "stat", category: "other" },
      { text: "הפסקת anticholinergics, benzos, opioids", urgency: "stat", category: "meds" },
      { text: "מעבדה: CBC, CMP, Ca2+, TSH, B12, U/A, גזים", urgency: "urgent", category: "labs" },
      { text: "BS (שלילת אצירה)", urgency: "urgent", category: "procedure" },
      { text: "❌ לא בנזודיאזפינים! (מחמיר דליריום)", urgency: "stat", category: "meds" },
      { text: "אגיטציה → Haloperidol 0.5-1mg IV/PO (זהירות קשישים)", urgency: "urgent", category: "meds" },
      { text: "אמצעים לא-תרופתיים: תאורה, שעון, משקפיים, משפחה", urgency: "routine", category: "other" },
    ],
  },

  // ═══ GI BLEED ═══
  {
    trigger: /דימום.*GI|GI\s*bleed|מלנה|melena|המטמזיס|hematemesis|הקאת דם|דם.*צואה/i,
    source: "דימום GI",
    group: "gibleed",
    triggerField: "tasks",  // History of GI bleed vs active bleeding
    tasks: [
      { text: "🔴 סוג ושתלב + הזמנת 2 מנות דם", urgency: "stat", category: "labs" },
      { text: "🔴 2 גישות ורידיות רחבות (18G+)", urgency: "stat", category: "procedure" },
      { text: "נוזלים IV bolus", urgency: "stat", category: "meds" },
      { text: "PPI IV: Omeprazole 80mg bolus → 8mg/h drip", urgency: "stat", category: "meds" },
      { text: "מעבדה: CBC, CMP, PT/INR, Fibrinogen, לקטט", urgency: "stat", category: "labs" },
      { text: "התייעצות גסטרו דחופה", urgency: "stat", category: "consult" },
      { text: "הפסקת NSAIDs + אנטיקואגולנטים", urgency: "stat", category: "meds" },
      { text: "NPO", urgency: "stat", category: "other" },
    ],
  },

  // ═══ WARFARIN / INR ═══
  {
    trigger: /warfarin|קומדין|coumadin|INR\s*גבוה|INR\s*>\s*[3-9]/i,
    source: "Warfarin / INR",
    group: "warfarin",
    triggerField: "tasks",
    tasks: [
      { text: "בדיקת INR", urgency: "stat", category: "labs" },
      { text: "INR 3-5 (ללא דימום) → דלג מנה, הפחת מינון", urgency: "urgent", category: "meds" },
      { text: "INR 5-9 → Vitamin K 1-2.5mg PO", urgency: "urgent", category: "meds" },
      { text: "INR >9 / דימום → Vitamin K 5-10mg IV + FFP/PCC", urgency: "stat", category: "meds" },
    ],
  },

  // ═══ COPD EXACERBATION ═══
  {
    trigger: /COPD.*החמרה|החמרת.*COPD|AECOPD|COPD\s*exacerb/i,
    source: "החמרת COPD",
    group: "copd",
    triggerField: "tasks",
    tasks: [
      { text: "Ventolin + Atrovent Nebulizer", urgency: "stat", category: "meds" },
      { text: "Prednisone 40mg PO x5d", urgency: "urgent", category: "meds" },
      { text: "ABx אם כיח מוגלתי — DAG: Amox-Clav / Azithromycin", urgency: "urgent", category: "meds" },
      { text: "ABG (גזים עורקיים)", urgency: "urgent", category: "labs" },
      { text: "CXR", urgency: "urgent", category: "imaging" },
      { text: "אם pH<7.35 + pCO2>45 → BiPAP/NIV", urgency: "stat", category: "procedure" },
    ],
  },

  // ═══ HYPOGLYCEMIA ═══
  {
    trigger: /היפוגליקמיה|hypoglycemia|סוכר\s*נמוך|glucose\s*<\s*[67]0/i,
    source: "היפוגליקמיה",
    group: "hypoglycemia",
    tasks: [
      { text: "🔴 בהכרה: 15-20g גלוקוז PO → בדיקה ב-15 דק'", urgency: "stat", category: "meds" },
      { text: "🔴 לא בהכרה: D50W 50ml IV / Glucagon 1mg IM", urgency: "stat", category: "meds" },
      { text: "מדידות סוכר q1h עד יציב >100", urgency: "stat", category: "labs" },
    ],
  },

  // ═══ NEW ADMISSION ═══
  {
    trigger: /קבלה חדשה|new\s*admission|אשפוז חדש/i,
    source: "קבלה חדשה",
    group: "newadmit",
    triggerField: "tasks",
    tasks: [
      // Phrased as VERIFY+ORDER — labs may already be sent by the admitting doc.
      // The on-call task is to confirm they went out and review results.
      { text: "וודא בדיקות קבלה / הזמן אם חסרות: CBC, CMP, Mg, PO4, PT/INR, CRP", urgency: "urgent", category: "labs" },
      // ECG is justified on-call for age >50 or cardiac history — genuinely missable at admission.
      { text: "ECG (>50y / רקע קרדיאלי)", urgency: "urgent", category: "labs" },
      // CXR removed: on-call doc cannot determine from text whether a recent CXR exists.
      // Blind ordering leads to alarm fatigue on this task. Handled by primary team.
      // Med rec, fall risk, DVT prophylaxis = admitting doctor / morning team
    ],
  },

  // ═══ HYPONATREMIA ═══
  {
    trigger: /היפונתרמיה|hyponatremia|Na\+?\s*<\s*1[23]\d|נתרן\s*נמוך/i,
    source: "היפונתרמיה",
    group: "hypoNa",
    triggerField: "tasks",
    tasks: [
      { text: "מעבדה: Na+, Serum Osm, Urine Na+Osm, TSH, Cortisol", urgency: "stat", category: "labs" },
      { text: "הערכת מצב נפחי", urgency: "stat", category: "other" },
      { text: "SIADH → הגבלת נוזלים 1-1.5L/d", urgency: "urgent", category: "other" },
      { text: "Na<120 + סימפטומטי → NaCl 3% IV (מקס 8mEq/L/24h!)", urgency: "stat", category: "meds" },
      { text: "Na+ q4-6h", urgency: "urgent", category: "labs" },
    ],
  },

  // ═══ STROKE / TIA ═══
  {
    trigger: /שבץ|CVA|stroke|TIA|חולשה חד צדדית|אפזיה|NIHSS/i,
    source: "שבץ / TIA",
    group: "stroke",
    triggerField: "tasks",  // Old CVA vs new neurological event
    tasks: [
      { text: "🔴 CT ראש דחוף (שלילת דימום)", urgency: "stat", category: "imaging" },
      { text: "🔴 זמן תחילת סימפטומים (חלון tPA: 4.5h)", urgency: "stat", category: "other" },
      { text: "NIHSS score", urgency: "stat", category: "other" },
      { text: "מעבדה: CBC, CMP, PT/INR, Glucose, Troponin", urgency: "stat", category: "labs" },
      { text: "ECG (חיפוש AF)", urgency: "stat", category: "labs" },
      { text: "התייעצות נוירולוגיה דחופה", urgency: "stat", category: "consult" },
      { text: "NPO (עד הערכת בליעה)", urgency: "stat", category: "other" },
    ],
  },

  // ═══ HYPERTENSIVE URGENCY / EMERGENCY ═══
  {
    trigger: /hypertensive\s*(urgency|emergency|crisis)|לחץ דם גבוה|BP\s*>\s*18\d|SBP\s*>\s*18\d|יתר לחץ דם חד/i,
    source: "משבר יתר לחץ דם",
    group: "htnemergency",
    triggerField: "tasks",
    tasks: [
      { text: "בדוק סימני end-organ damage: כאב ראש, הפרעות ראיה, כאב חזה, קוצר נשימה", urgency: "stat", category: "other" },
      { text: "אם ללא end-organ → PO: captopril 25mg / amlodipine 5mg", urgency: "urgent", category: "meds" },
      { text: "אם end-organ → IV labetalol 20mg / nicardipine gtt → שקול ICU", urgency: "stat", category: "meds" },
      { text: "BP חוזר כל 15-30 דקות — יעד ירידה 10-20% בשעה הראשונה", urgency: "stat", category: "other" },
    ],
  },

  // ═══ SYNCOPE ═══
  {
    trigger: /syncope|עילפון|סינקופה|LOC|אובדן הכרה/i,
    source: "סינקופה",
    group: "syncope",
    triggerField: "tasks",
    tasks: [
      { text: "ECG 12 leads — בדוק QT, Brugada, AV block, arrhythmia", urgency: "stat", category: "labs" },
      { text: "BP שכיבה + עמידה (orthostatic)", urgency: "stat", category: "other" },
      { text: "CBC, glucose, troponin, BMP", urgency: "stat", category: "labs" },
      { text: "אם cardiac syncope → telemetry + קרדיולוג", urgency: "stat", category: "consult" },
    ],
  },

  // ═══ DESATURATION ═══
  {
    trigger: /דסטורציה|desaturation|SpO2\s*<\s*9[0-3]|היפוקסיה|hypoxia|חמצן נמוך/i,
    source: "דסטורציה",
    group: "desat",
    triggerField: "tasks",
    tasks: [
      { text: "🔴 O2 — NC / mask / NRB — יעד SpO2 >92% (COPD: 88-92%)", urgency: "stat", category: "meds" },
      { text: "ABG / VBG", urgency: "stat", category: "labs" },
      { text: "CXR — בדוק pneumothorax, effusion, edema, pneumonia", urgency: "stat", category: "imaging" },
      { text: "אם לא מגיב → שקול BiPAP / intubation → ICU", urgency: "stat", category: "consult" },
    ],
  },

  // ═══ ACUTE ABDOMEN ═══
  {
    trigger: /כאב בטן חד|acute abdomen|בטן חריפה|ileus|אילאוס|חסימת מעי|bowel obstruct/i,
    source: "בטן חריפה",
    group: "abdomen",
    triggerField: "tasks",
    tasks: [
      { text: "בדיקה גופנית: סימני פריטונאליים, אוושות מעי, נפיחות", urgency: "stat", category: "other" },
      { text: "מעבדה: CBC, CRP, lactate, lipase, LFTs", urgency: "stat", category: "labs" },
      { text: "צילום בטן עמידה / CT בטן אם חשד ניתוחי", urgency: "stat", category: "imaging" },
      { text: "NPO + IV fluids + שקול ייעוץ כירורגי", urgency: "stat", category: "consult" },
    ],
  },

  // ═══ ALCOHOL / BENZO WITHDRAWAL ═══
  {
    trigger: /גמילה מאלכוהול|alcohol withdrawal|CIWA|DT\b|delirium tremens|גמילה מבנזו/i,
    source: "גמילה",
    group: "withdrawal",
    triggerField: "tasks",
    tasks: [
      { text: "CIWA score q1-2h — אם >8 → טפל", urgency: "stat", category: "other" },
      { text: "Diazepam 5-10mg PO/IV PRN (or lorazepam 1-2mg אם כבד)", urgency: "stat", category: "meds" },
      { text: "Thiamine 100mg IV לפני גלוקוז!", urgency: "stat", category: "meds" },
      { text: "אם seizure / DTs → ICU + benzo gtt", urgency: "stat", category: "consult" },
    ],
  },

  // ═══ ANAPHYLAXIS ═══
  {
    trigger: /אנפילקסיס|anaphylaxis|תגובה אלרגית חמורה|angioedema|אנגיואדמה/i,
    source: "אנפילקסיס",
    group: "anaphylaxis",
    triggerField: "tasks",
    tasks: [
      { text: "🔴 Epinephrine 0.3mg IM (ירך חיצונית) — חזור כל 5-15 דקות", urgency: "stat", category: "meds" },
      { text: "NS 1L bolus IV", urgency: "stat", category: "meds" },
      { text: "Diphenhydramine 50mg IV + Ranitidine 50mg IV + Methylprednisolone 125mg IV", urgency: "stat", category: "meds" },
      { text: "ניטור 6-24 שעות (biphasic reaction)", urgency: "stat", category: "other" },
    ],
  },

  // ═══ ACUTE URINARY RETENTION ═══
  {
    trigger: /עצירת שתן|urinary retention|גלובוס|אצירת שתן|retention.*urine/i,
    source: "עצירת שתן",
    group: "retention",
    triggerField: "tasks",
    tasks: [
      { text: "Bladder Scan — אם >300ml → הכנס קטטר", urgency: "stat", category: "procedure" },
      { text: "אם >1L → שחרור איטי (500ml כל 30 דק) — סכנת post-obstructive diuresis", urgency: "urgent", category: "other" },
      { text: "בדוק סיבה: anticholinergics, opioids, BPH, constipation", urgency: "urgent", category: "other" },
    ],
  },

  // ═══ ACUTE ANEMIA / DROPPING HB ═══
  {
    trigger: /ירידה בהמוגלובין|Hb drop|אנמיה חדה|acute anemia|Hb\s*<\s*[78]/i,
    source: "ירידת המוגלובין",
    group: "anemia",
    triggerField: "tasks",
    tasks: [
      { text: "Type & Screen / Cross 2U", urgency: "stat", category: "labs" },
      { text: "בדוק מקור דימום: GI, wound, retroperitoneal, fracture", urgency: "stat", category: "other" },
      { text: "CBC, retic, LDH, haptoglobin, coags", urgency: "stat", category: "labs" },
      { text: "אם Hb<7 סימפטומטי → עירוי PRBC (Hb<8 אם cardiac)", urgency: "stat", category: "meds" },
    ],
  },
];

export function applyRules(patient: PatientEntry): Task[] {
  const generated: Task[] = [];
  const matchedGroups = new Set<string>();

  // ── Palliative / comfort care detection ──
  // If the patient is flagged for comfort care only, suppress aggressive
  // workup and intervention tasks. DNR/DNI alone does NOT suppress —
  // only explicit comfort-care / palliative / end-of-life flags do.
  const allFlags = [...patient.flags, ...patient.status, ...(patient.notes ?? [])].join(" ");
  const isComfortCareOnly = COMFORT_CARE_PATTERN.test(allFlags);

  // Pre-build text blobs for each trigger scope
  const diagnosisText = patient.diagnosis ?? "";
  const tasksText = [
    ...patient.status,
    ...patient.flags,
    ...patient.tasks.map((t) => t.text),
  ].join(" ");
  const allText = [tasksText, diagnosisText].join(" ");

  for (const rule of RULES) {
    if (rule.group && matchedGroups.has(rule.group)) continue;

    // Suppress aggressive rules for comfort-care-only patients
    if (isComfortCareOnly && rule.group && COMFORT_SUPPRESSED_GROUPS.has(rule.group)) continue;

    // Pick which text to match against (default: tasks only, never diagnosis)
    let textToMatch: string;
    switch (rule.triggerField) {
      case "all":
        textToMatch = allText;
        break;
      case "diagnosis":
        textToMatch = diagnosisText;
        break;
      default:
        textToMatch = tasksText;
    }

    if (rule.trigger.test(textToMatch)) {
      if (rule.group) matchedGroups.add(rule.group);

      for (const taskDef of rule.tasks) {
        generated.push({
          id: generateId("gen-"),
          text: taskDef.text,
          urgency: taskDef.urgency,
          category: taskDef.category ?? "other",
          source: "generated",
          done: false,
          doneTime: null,
          time: null,
          confidence: 0.9,
          generatedFrom: rule.source,
        });
      }
    }
  }

  // Deduplicate: if two rules independently generated an identical task text,
  // keep only the first occurrence. Normalise for comparison (trim + collapse
  // whitespace + lowercase) so minor formatting differences don't produce
  // duplicates that look identical to the user.
  // Example: both the Sepsis and Fever rules generate "תרביות דם x2" —
  // the patient should see one task, not two.
  const seenText = new Set<string>();
  return generated.filter((task) => {
    const key = task.text.trim().replace(/\s+/g, " ").toLowerCase();
    if (seenText.has(key)) return false;
    seenText.add(key);
    return true;
  });
}

export { RULES };
export type { Rule };

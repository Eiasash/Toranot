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
  // IV protocols suppressed in comfort care (aggressive monitoring)
  "iv_insulin",
  "iv_heparin",
  "iv_vasopressor",
  "iv_dopamine",
  "iv_amiodarone",
  "iv_kphos",
  // NOT suppressed: opioids, midazolam, propofol, magnesium — used for comfort
  // NOT suppressed: delirium rules — agitation management IS comfort care
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

  // ═══ BLOOD PRODUCTS / TRANSFUSION ═══
  {
    trigger: /עירוי\s*(?:דם|טסיות|פלזמה)|(?:מנת|מנות)\s*דם|PRBCs?|FFP|packed\s*cells|platelets?\s*transfusion|blood\s*transfusion|טרנספוזיה/i,
    source: "עירוי דם",
    group: "transfusion",
    triggerField: "all",
    tasks: [
      { text: "סוג ושתלב (Type & Screen)", urgency: "stat", category: "labs" },
      { text: "Vitals q15min ×4 during transfusion, then q1h", urgency: "stat", category: "procedure" },
      { text: "Watch for transfusion reaction: fever, rash, dyspnea, flank pain", urgency: "stat", category: "other" },
      { text: "Post-transfusion CBC 1h after completion", urgency: "urgent", category: "labs" },
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
    trigger: /דליריום|delirium|בלבול חריף|agitat|ערפול.*הכרה|acute\s*confusion|חוסר\s*שקט|אי\s*שקט|restless|sundowning/i,
    source: "דליריום",
    group: "delirium",
    triggerField: "all",
    tasks: [
      // ── WORKUP (find the cause) ──
      { text: "⚡ בירור דחוף: זיהום? תרופות? מטבולי? היפוקסיה? עצירות? אצירת שתן?", urgency: "stat", category: "other" },
      { text: "מעבדה: CBC, BMP, Ca2+, Mg2+, PO4, גלוקוז, U/A+תרבית, גזים", urgency: "stat", category: "labs" },
      { text: "Bladder Scan — שלילת אצירה (>300ml → קטטר)", urgency: "stat", category: "procedure" },
      { text: "סקור תרופות: STOP anticholinergics, benzos, opioids, steroids", urgency: "stat", category: "meds" },
      // ── NON-PHARM (always first) ──
      { text: "🔦 אמצעים לא-תרופתיים: תאורה, שעון, משקפיים, שמיעה, שתייה, משפחה", urgency: "urgent", category: "other" },
      { text: "הימנע מקשירה! (מחמיר אגיטציה + סיכון)", urgency: "urgent", category: "other" },
      // ── PHARMACOTHERAPY LADDER (if agitated + danger) ──
      { text: "📋 סולם טיפול אגיטציה (מהקל לכבד):", urgency: "urgent", category: "meds" },
      { text: "1️⃣ Quetiapine 12.5-25mg PO (בטוח בפרקינסון/DLB)", urgency: "urgent", category: "meds" },
      { text: "2️⃣ Haloperidol 0.5mg IM (❌ לא בפרקינסון/DLB, בדוק QTc)", urgency: "urgent", category: "meds" },
      { text: "3️⃣ Olanzapine 2.5mg PO/IM (חלופה אם QTc ארוך)", urgency: "urgent", category: "meds" },
      { text: "4️⃣ אגיטציה קשה → Haloperidol 0.5mg IM + חזור q30min (max 3mg/24h)", urgency: "stat", category: "meds" },
      { text: "5️⃣ רפרקטורי / סכנה מיידית → Lorazepam 1mg IV (חריג! בנזו מחמיר דליריום)", urgency: "stat", category: "meds" },
      { text: "🌙 לילה: Trazodone 25-50mg PO / Melatonin 3mg (שיקום שינה)", urgency: "routine", category: "meds" },
      { text: "⚠️ בנזו רק כמוצא אחרון / גמילה מאלכוהול — לא כקו ראשון!", urgency: "stat", category: "meds" },
    ],
  },

  // ═══ DELIRIUM DRUG PROTOCOLS ═══
  // These fire when a specific antipsychotic/sedative is mentioned,
  // generating drug-specific monitoring tasks for the on-call doctor.

  // ── Haloperidol (Haldol) ──
  {
    trigger: /הלופרידול|הלדול|haloperidol|haldol/i,
    source: "הלופרידול",
    group: "delirium_haloperidol",
    triggerField: "all",
    tasks: [
      { text: "א.ק.ג לפני ואחרי מתן — QTc >500ms → STOP", urgency: "stat", category: "procedure" },
      { text: "ניטור EPS: נוקשות, טרמור, אקתיזיה, דיסטוניה", urgency: "urgent", category: "other" },
      { text: "❌ אם פרקינסון/DLB → החלף ל-Quetiapine 12.5-25mg", urgency: "stat", category: "meds" },
      { text: "מינון קשישים: 0.5mg IM (PO אם משתף פעולה). ❌ לא >3mg/24h", urgency: "routine", category: "meds" },
    ],
  },

  // ── Quetiapine (Seroquel) ──
  {
    trigger: /קווטיאפין|סרוקוול|quetiapine|seroquel/i,
    source: "קווטיאפין",
    group: "delirium_quetiapine",
    triggerField: "all",
    tasks: [
      { text: "BP שכיבה + עמידה (אורתוסטטי!) — לפני ואחרי מתן", urgency: "urgent", category: "procedure" },
      { text: "מינון התחלתי: 12.5-25mg PO HS. Max 50mg/d בקשישים", urgency: "routine", category: "meds" },
      { text: "ניטור סדציה מוגזמת — סיכון נפילות", urgency: "urgent", category: "other" },
      { text: "BS בבוקר (hyperglycemia risk)", urgency: "routine", category: "labs" },
    ],
  },

  // ── Olanzapine (Zyprexa) ──
  {
    trigger: /אולנזפין|זיפרקסה|olanzapine|zyprexa/i,
    source: "אולנזפין",
    group: "delirium_olanzapine",
    triggerField: "all",
    tasks: [
      { text: "❌ לא עם IM benzodiazepines! (respiratory depression)", urgency: "stat", category: "meds" },
      { text: "BP — סיכון להיפוטנציה אורתוסטטית", urgency: "urgent", category: "procedure" },
      { text: "מינון קשישים: 2.5-5mg PO/IM. Max 10mg/d", urgency: "routine", category: "meds" },
      { text: "BS — hyperglycemia + metabolic effects", urgency: "routine", category: "labs" },
    ],
  },

  // ── Risperidone (Risperdal) ──
  {
    trigger: /ריספרידון|ריספרדל|risperidone|risperdal/i,
    source: "ריספרידון",
    group: "delirium_risperidone",
    triggerField: "all",
    tasks: [
      { text: "BP שכיבה + עמידה — orthostatic hypotension", urgency: "urgent", category: "procedure" },
      { text: "מינון קשישים: 0.25-0.5mg PO BID. Max 2mg/d", urgency: "routine", category: "meds" },
      { text: "ניטור EPS (סיכון גבוה יותר מ-quetiapine)", urgency: "urgent", category: "other" },
      { text: "⚠ FDA Black Box: ↑ mortality בדמנציה", urgency: "routine", category: "other" },
    ],
  },

  // ── Dexmedetomidine (Precedex) ──
  {
    trigger: /דקסמדטומידין|precedex|dexmedetomidine/i,
    source: "דקסמדטומידין (Precedex)",
    group: "delirium_dexmedetomidine",
    triggerField: "all",
    tasks: [
      { text: "HR + BP q15min — bradycardia + hypotension common", urgency: "stat", category: "procedure" },
      { text: "Sedation score (RASS) q1-2h — target 0 to -2", urgency: "urgent", category: "procedure" },
      { text: "Loading dose: 1mcg/kg over 10min → 0.2-0.7 mcg/kg/h", urgency: "routine", category: "meds" },
      { text: "ICU/ניטור setting only — continuous telemetry required", urgency: "stat", category: "other" },
    ],
  },

  // ── Trazodone (for delirium insomnia/sundowning) ──
  {
    trigger: /טרזודון|trazodone|דסירל|desyrel/i,
    source: "טרזודון",
    group: "delirium_trazodone",
    triggerField: "all",
    tasks: [
      { text: "BP — orthostatic hypotension risk, especially nocturnal", urgency: "urgent", category: "procedure" },
      { text: "מינון: 25-50mg PO HS. ❌ לא >100mg בקשישים", urgency: "routine", category: "meds" },
      { text: "ניטור סדציה יתרה בבוקר — סיכון נפילות", urgency: "routine", category: "other" },
    ],
  },

  // ── Melatonin (delirium prevention protocol) ──
  {
    trigger: /מלטונין\s*(?:\d|delirium|דליריום|prevention)|melatonin\s*(?:\d|delirium|prevention)/i,
    source: "מלטונין (מניעת דליריום)",
    group: "delirium_melatonin",
    triggerField: "all",
    tasks: [
      { text: "Melatonin 3-5mg PO HS — מניעת דליריום (HELP protocol)", urgency: "routine", category: "meds" },
      { text: "ודא: אין סדציה מוגזמת בבוקר", urgency: "routine", category: "other" },
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

  // ═══════════════════════════════════════════════════════════════
  // IV PROTOCOL MONITORING — on-call tasks for active IV drips
  // ═══════════════════════════════════════════════════════════════

  // ── IV Insulin (Actrapid drip) ──
  {
    trigger: /אינסולין\s*(?:מתמשך|ווריד|IV|drip|infusion)|insulin\s*(?:drip|infusion|gtt|iv)|actrapid\s*(?:drip|infusion|iv)/i,
    source: "אינסולין IV",
    group: "iv_insulin",
    triggerField: "all",
    tasks: [
      { text: "BS q2h (q1h after rate change)", urgency: "urgent", category: "procedure" },
      { text: "אם BS<70 → STOP drip, D50% 50ml IV, recheck q15min", urgency: "stat", category: "meds" },
      { text: "Target BS 140-180; titrate per protocol", urgency: "routine", category: "meds" },
    ],
  },

  // ── Heparin (UFH) drip ──
  {
    trigger: /הפרין\s*(?:מתמשך|ווריד|IV|drip|infusion|gtt)|heparin\s*(?:drip|infusion|gtt|iv|protocol)|UFH\b/i,
    source: "הפרין IV",
    group: "iv_heparin",
    triggerField: "all",
    tasks: [
      { text: "PTT q6h — titrate per nomogram", urgency: "urgent", category: "labs" },
      { text: "CBC + platelets daily (HIT watch)", urgency: "routine", category: "labs" },
      { text: "בדוק סימני דימום: guaiac, hemoglobin, sites", urgency: "routine", category: "other" },
    ],
  },

  // ── Noradrenaline / Vasopressors ──
  {
    trigger: /נוראדרנלין|noradrenaline|norepinephrine|levophed|vasopressor|ואזופרסור/i,
    source: "נוראדרנלין / vasopressor",
    group: "iv_vasopressor",
    triggerField: "all",
    tasks: [
      { text: "BP q15-30min, target MAP ≥65", urgency: "stat", category: "procedure" },
      { text: "Lactate q4-6h — trend for perfusion", urgency: "urgent", category: "labs" },
      { text: "Urine output q1h — target ≥0.5 ml/kg/h", urgency: "urgent", category: "procedure" },
      { text: "Verify central line access + functioning", urgency: "routine", category: "other" },
    ],
  },

  // ── Dopamine ──
  {
    trigger: /דופמין|dopamine\s*(?:drip|infusion|gtt|iv)/i,
    source: "דופמין IV",
    group: "iv_dopamine",
    triggerField: "all",
    tasks: [
      { text: "BP + HR q15-30min; titrate to target", urgency: "stat", category: "procedure" },
      { text: "Monitor for tachyarrhythmia", urgency: "urgent", category: "other" },
      { text: "Urine output q1h", urgency: "urgent", category: "procedure" },
    ],
  },

  // ── Amiodarone (Procor) IV ──
  {
    trigger: /אמיודרון|amiodarone|procor|פרוקור/i,
    source: "אמיודרון IV",
    group: "iv_amiodarone",
    triggerField: "all",
    tasks: [
      { text: "Continuous telemetry — watch QTc + HR", urgency: "stat", category: "procedure" },
      { text: "BP q30min during loading (hypotension risk)", urgency: "urgent", category: "procedure" },
      { text: "Check K+, Mg2+ — correct before/during infusion", urgency: "urgent", category: "labs" },
    ],
  },

  // ── Propofol ──
  {
    trigger: /פרופופול|propofol|diprivan/i,
    source: "פרופופול IV",
    group: "iv_propofol",
    triggerField: "all",
    tasks: [
      { text: "הערכת רמת סדציה q2h — תעד תגובתיות", urgency: "urgent", category: "procedure" },
      { text: "TG level q48h if >48h infusion (propofol infusion syndrome)", urgency: "routine", category: "labs" },
      { text: "Change syringe q12h", urgency: "routine", category: "meds" },
    ],
  },

  // ── Opioid drips (Morphine / Fentanyl) ──
  {
    trigger: /מורפין\s*(?:מתמשך|ווריד|IV|drip|infusion)|morphine\s*(?:drip|infusion|gtt|iv|PCA)|פנטניל\s*(?:מתמשך|ווריד|IV|drip)|fentanyl\s*(?:drip|infusion|gtt|iv|PCA)/i,
    source: "אופיואידים IV",
    group: "iv_opioid",
    triggerField: "all",
    tasks: [
      { text: "RR + SpO2 q2h — hold if RR<10 or SpO2<90%", urgency: "urgent", category: "procedure" },
      { text: "Naloxone 0.4mg IV bedside (emergency reversal)", urgency: "routine", category: "meds" },
      { text: "Bowel protocol — עצירות צפויה", urgency: "routine", category: "meds" },
    ],
  },

  // ── Midazolam (Dormicum) drip ──
  {
    trigger: /מידזולם|midazolam|dormicum\s*(?:מתמשך|drip|infusion|gtt|iv)/i,
    source: "דורמיקום IV",
    group: "iv_midazolam",
    triggerField: "all",
    tasks: [
      { text: "RR + SpO2 q2h — סיכון לדיכוי נשימתי", urgency: "urgent", category: "procedure" },
      { text: "הערכת רמת הכרה q2h — תעד תגובתיות", urgency: "urgent", category: "procedure" },
      { text: "⚠️ Flumazenil 0.2mg IV מוכן ליד המיטה (reversal חירום — שימוש רק אם דיכוי נשימתי)", urgency: "routine", category: "meds" },
    ],
  },

  // ── Magnesium IV ──
  {
    trigger: /מגנזיום\s*(?:IV|ווריד|infusion|drip)|magnesium\s*(?:iv|infusion|drip|sulfate\s*iv)/i,
    source: "מגנזיום IV",
    group: "iv_magnesium",
    triggerField: "all",
    tasks: [
      { text: "Mg2+ level post-infusion (recheck 2h after)", urgency: "urgent", category: "labs" },
      { text: "Monitor DTRs during infusion (loss = toxicity)", urgency: "urgent", category: "procedure" },
      { text: "BP + HR during infusion (hypotension/bradycardia)", urgency: "routine", category: "procedure" },
    ],
  },

  // ── K Phosphate IV ──
  {
    trigger: /אשלגן\s*פוספט|potassium\s*phosphate\s*(?:iv|infusion)|KPhos\b|K.?phosphate/i,
    source: "K-Phosphate IV",
    group: "iv_kphos",
    triggerField: "all",
    tasks: [
      { text: "Phosphate + Ca2+ + K+ recheck 2h post-infusion", urgency: "urgent", category: "labs" },
      { text: "Infuse over ≥4h via central line if available", urgency: "routine", category: "meds" },
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
  const allFlags = [...patient.flags, ...patient.status, ...(patient.notes ?? []), patient.handoverNote ?? ""].join(" ");
  const isComfortCareOnly = COMFORT_CARE_PATTERN.test(allFlags);

  // Pre-build text blobs for each trigger scope
  const diagnosisText = patient.diagnosis ?? "";
  const tasksText = [
    ...patient.status,
    ...patient.flags,
    ...patient.tasks.map((t) => t.text),
  ].join(" ");
  // ⚠️ planNotes / tomorrowNotes are intentionally EXCLUDED from allText.
  // Plan notes describe the patient's existing management ("on fentanyl drip",
  // "continue amiodarone") — they are NOT explicit on-call action requests.
  // Including them caused rules to generate red/urgent tasks from background
  // plan text, violating the golden rule: on-call tasks must be explicitly requested.
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

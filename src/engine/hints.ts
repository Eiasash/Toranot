import type { PatientEntry } from "../types";

/**
 * Clinical hints: background awareness tips generated from the DIAGNOSIS field.
 * These are NOT tasks and NOT counted. They're collapsible FYI reminders
 * for the on-call doctor to keep in mind.
 *
 * Example: patient with PE as diagnosis →
 *   "מטופל עם PE — שים לב לסימני הידרדרות: טכיקרדיה, דסטורציה, hypotension"
 */

export interface ClinicalHint {
  emoji: string;
  title: string;
  tips: string[];
}

interface HintRule {
  trigger: RegExp;
  hint: ClinicalHint;
}

const HINT_RULES: HintRule[] = [
  // ═══ PE ═══
  {
    trigger: /\bPE\b|תסחיף ריאתי|pulmonary\s*embol/i,
    hint: {
      emoji: "🫁",
      title: "PE — הנחיות רקע",
      tips: [
        "סימני הידרדרות: טכיקרדיה חדשה, דסטורציה, ירידה בל\"ד",
        "ודא שאנטיקואגולציה ניתנת כמתוכנן (enoxaparin / heparin gtt)",
        "בדוק אם יש IVC filter — אם כן, שים לב ל-DVT סימפטומטי",
        "אם על חמצן — תעד SpO2 יעד ומצב נוכחי",
      ],
    },
  },

  // ═══ DVT ═══
  {
    trigger: /\bDVT\b|פקקת ורידים|deep\s*vein/i,
    hint: {
      emoji: "🦵",
      title: "DVT — הנחיות רקע",
      tips: [
        "בדוק גפה — נפיחות, אודם, חום מקומי",
        "ודא אנטיקואגולציה כמתוכנן",
        "סימני PE: קוצר נשימה חדש, טכיקרדיה, כאב חזה",
      ],
    },
  },

  // ═══ CHF ═══
  {
    trigger: /אי.?ספיקת לב|CHF|heart\s*failure|HFrEF|HFpEF/i,
    hint: {
      emoji: "💙",
      title: "אי-ספיקת לב — הנחיות רקע",
      tips: [
        "שקילה יומית — עלייה >1.5 ק\"ג/יום = retention",
        "מעקב I/O — יעד שתן תגובה למשתנים",
        "הגבלת נוזלים — בדוק אם יש הוראה",
        "סימני הידרדרות: קוצר נשימה במנוחה, orthopnea, בצקת חדשה",
      ],
    },
  },

  // ═══ ACS / CAD ═══
  {
    trigger: /\bCAD\b|ACS|STEMI|NSTEMI|אוטם|MI\b|תסמונת כלילית/i,
    hint: {
      emoji: "❤️",
      title: "CAD / ACS — הנחיות רקע",
      tips: [
        "אם כאב חזה חדש → ECG תוך 10 דקות + טרופונין",
        "ודא אספירין + סטטין פעיל",
        "שים לב ל-HR, BP — יעד <130/80",
      ],
    },
  },

  // ═══ AF ═══
  {
    trigger: /\bAF\b|atrial\s*fib|פרפור עליות|a\.?\s*fib/i,
    hint: {
      emoji: "💓",
      title: "AF — הנחיות רקע",
      tips: [
        "בדוק דופק — אם >110 בר פעולה, שקול rate control",
        "ודא אנטיקואגולציה (אם CHA₂DS₂-VASc ≥2)",
        "אם AF חדש — בדוק TSH, אלקטרוליטים, ECG",
      ],
    },
  },

  // ═══ STROKE / CVA ═══
  {
    trigger: /שבץ|CVA|stroke|TIA/i,
    hint: {
      emoji: "🧠",
      title: "שבץ / CVA — הנחיות רקע",
      tips: [
        "סטטוס נוירולוגי — דווח שינוי חדש מייד",
        "שמור BP <180/110 (אם ischemic) או לפי הוראה",
        "בליעה — אם יש dysphagia, NPO עד הערכה",
        "אם על anticoagulation — ודא שלא hemorrhagic",
      ],
    },
  },

  // ═══ DIABETES ═══
  {
    trigger: /סוכרת|DM[12]?(?!\w)|diabetes|אינסולין|insulin/i,
    hint: {
      emoji: "🩸",
      title: "סוכרת — הנחיות רקע",
      tips: [
        "BS — ודא מעקב לפי פרוטוקול (q6h / AC+HS)",
        "אם NPO — בטל אינסולין ארוך-טווח? בדוק הוראות",
        "היפוגליקמיה <70 → פרוטוקול מיידי",
      ],
    },
  },

  // ═══ CKD ═══
  {
    trigger: /CKD|אי.?ספיקת כליות כרונית|chronic kidney|דיאליזה|dialysis|HD\b/i,
    hint: {
      emoji: "💧",
      title: "CKD — הנחיות רקע",
      tips: [
        "התאמת מינונים — בדוק GFR ותרופות שדורשות adjust",
        "הימנע NSAIDs, aminoglycosides, IV contrast ללא הכנה",
        "אם על דיאליזה — ודא מועד HD הבא + K+ לפני",
        "אם K+ >5.5 → פרוטוקול היפרקלמיה",
      ],
    },
  },

  // ═══ COPD ═══
  {
    trigger: /COPD|מחלת ריאות חסימתית/i,
    hint: {
      emoji: "🌬️",
      title: "COPD — הנחיות רקע",
      tips: [
        "SpO2 יעד: 88-92% (לא 100%!)",
        "אם על BiPAP/CPAP — ודא הגדרות ותאימות",
        "סימני החמרה: שימוש בשרירי עזר, RR >25, שינוי הכרה",
      ],
    },
  },

  // ═══ DEMENTIA ═══
  {
    trigger: /דמנציה|dementia|אלצהיימר|alzheimer|cognitive\s*decline/i,
    hint: {
      emoji: "🧩",
      title: "דמנציה — הנחיות רקע",
      tips: [
        "מצב בסיסי — שאל צוות מה הבסיס, כל שינוי = חשד דליריום",
        "הימנע benzodiazepines, anticholinergics",
        "שמור על סביבה רגועה, תאורה, שעון, לוח",
        "אם agitation — דה-אסקלציה לא תרופתית קודם",
      ],
    },
  },

  // ═══ ENDOCARDITIS ═══
  {
    trigger: /endocarditis|אנדוקרדיטיס/i,
    hint: {
      emoji: "🦠",
      title: "אנדוקרדיטיס — הנחיות רקע",
      tips: [
        "ודא IV ABx ניתנים בזמן (לפי פרוטוקול)",
        "חום חדש → תרביות דם (2 סטים) לפני שינוי ABx",
        "שים לב לסימני אמבוליזציה: פטכיות, splinter hemorrhages, CVA",
        "מעקב Echo — בדוק מתי מתוכנן TTE/TEE הבא",
      ],
    },
  },

  // ═══ LIVER DISEASE ═══
  {
    trigger: /שחמת|cirrhosis|liver\s*failure|אי.?ספיקת כבד|hepatic\s*encephalop|HE\b/i,
    hint: {
      emoji: "🟡",
      title: "מחלת כבד — הנחיות רקע",
      tips: [
        "הימנע NSAIDs, paracetamol >2g/day",
        "אם ascites — בדוק SBP אם חום / כאב בטן",
        "אם encephalopathy — ודא lactulose, rifaximin",
        "מעקב INR, albumin, bilirubin",
      ],
    },
  },

  // ═══ PALLIATIVE / DNR ═══
  {
    trigger: /פליאטיבי|palliative|DNR|DNI|comfort\s*(care|measures)|נוחות/i,
    hint: {
      emoji: "🕊️",
      title: "טיפול תומך / DNR — הנחיות רקע",
      tips: [
        "ודא הוראות ברורות — DNR? DNI? comfort measures only?",
        "ניהול כאב — ודא שיש PRN אנלגזיה",
        "אם שינוי במצב — עדכן משפחה, אל תבצע CPR/intubation אם DNR/DNI",
        "שמור על כבוד ונוחות — antiemetics, mouth care, positioning",
      ],
    },
  },

  // ═══ ANTICOAGULATION ═══
  {
    trigger: /warfarin|קומדין|coumadin|eliquis|apixaban|xarelto|rivaroxaban|pradaxa|dabigatran|אנטיקואגולציה/i,
    hint: {
      emoji: "💊",
      title: "אנטיקואגולציה — הנחיות רקע",
      tips: [
        "אם דימום פעיל → שקול reversal (vitamin K / idarucizumab / andexanet)",
        "אם ניתוח מתוכנן — בדוק bridging protocol",
        "Warfarin: INR יעד 2-3 (אלא אם מסתם — 2.5-3.5)",
      ],
    },
  },
];

/**
 * Generate clinical hints for a patient based on their DIAGNOSIS field only.
 * Returns empty array if no diagnosis matches.
 */
export function generateHints(patient: PatientEntry): ClinicalHint[] {
  const diagnosis = patient.diagnosis ?? "";
  if (!diagnosis.trim()) return [];

  // Also check flags for things like DNR/DNI
  const searchText = [diagnosis, ...patient.flags].join(" ");

  const hints: ClinicalHint[] = [];
  const seen = new Set<string>();

  for (const rule of HINT_RULES) {
    if (rule.trigger.test(searchText) && !seen.has(rule.hint.title)) {
      seen.add(rule.hint.title);
      hints.push(rule.hint);
    }
  }

  return hints;
}

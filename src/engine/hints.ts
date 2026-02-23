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

  // ═══ PARKINSON'S ═══
  {
    trigger: /פרקינסון|parkinson|PD\b|levodopa|סינמט|sinemet/i,
    hint: {
      emoji: "🤲",
      title: "פרקינסון — הנחיות רקע",
      tips: [
        "🔴 אל תדלג על מינוני levodopa — תן בדיוק בזמן!",
        "אסור metoclopramide — מחמיר פרקינסון (שקול domperidone)",
        "הימנע haloperidol — שקול quetiapine low-dose לאגיטציה",
        "סיכון גבוה לנפילות, דליריום, dysphagia",
      ],
    },
  },

  // ═══ HIP FRACTURE / POST-OP ═══
  {
    trigger: /שבר ירך|hip fracture|שבר צוואר ירך|ORIF|post.?op.*orthoped/i,
    hint: {
      emoji: "🦴",
      title: "שבר ירך — הנחיות רקע",
      tips: [
        "DVT prophylaxis — ודא enoxaparin / mechanical compression",
        "ניהול כאב — paracetamol קבוע + opioids PRN במינון נמוך",
        "הימנע NSAIDs (סיכון כלייתי + דימום)",
        "מוביליזציה מוקדמת — פיזיותרפיה ביום הראשון אם אפשר",
        "דליריום — שכיח מאוד post-op, בדוק כל משמרת",
      ],
    },
  },

  // ═══ PRESSURE ULCERS ═══
  {
    trigger: /פצע לחץ|pressure ulcer|decubitus|פצעי לחץ/i,
    hint: {
      emoji: "🛏️",
      title: "פצעי לחץ — הנחיות רקע",
      tips: [
        "הפיכות כל 2 שעות — ודא שהצוות מתעד",
        "מזרן מתאים — ודא מזרן אוויר/לחץ משתנה",
        "תזונה — חלבון מספיק? שקול ייעוץ תזונאית",
        "אם stage 3-4 — ייעוץ פלסטיקה / wound care",
      ],
    },
  },

  // ═══ TUBE FEEDING ═══
  {
    trigger: /הזנה.*צינור|tube feed|PEG|NG feed|NGT|סונדה/i,
    hint: {
      emoji: "🥤",
      title: "הזנה צינורית — הנחיות רקע",
      tips: [
        "ראש מיטה >30° בזמן הזנה + 30 דקות אחרי",
        "בדוק residual כל 4-6 שעות — אם >500ml → עצור",
        "אם שלשול — בדוק C.diff, שקול הפחתת קצב",
        "NPO אם intubation / procedure — זכור לחדש!",
      ],
    },
  },

  // ═══ CHRONIC LIVER DISEASE ═══ (supplement existing)
  {
    trigger: /ascites|מיימת/i,
    hint: {
      emoji: "💧",
      title: "מיימת — הנחיות רקע",
      tips: [
        "אם חום / כאב בטן → ניקור דיאגנוסטי SBP (PMN>250 = SBP)",
        "הגבלת מלח <2g/day + spironolactone/furosemide",
        "אם ניקור טיפולי >5L → albumin 6-8g/L שהוצא",
      ],
    },
  },
  // ═══ COMFORT CARE / PALLIATIVE ═══
  {
    trigger: /comfort\s*care|palliative|פליאטיב|טיפול תומך בלבד|טיפול מנחם|EOL|end.of.life|הנוחות בלבד|טיפולי נוחות/i,
    hint: {
      emoji: "🕊️",
      title: "טיפול מנחם — הנחיות רקע",
      tips: [
        "מיקוד: שליטה בתסמינים (כאב, קוצר נשימה, בחילה, חרדה)",
        "סקאלת כאב q4h — מורפין SC 2.5-5mg PRN / fentanyl patch",
        "קוצר נשימה → מורפין SC + O2 לנוחות (לא לפי SpO2 יעד)",
        "הפחתת ניטורים מיותרים (BP, labs) אלא אם משנה טיפול",
        "שיחה עם המשפחה על ציפיות ומהלך צפוי",
        "ודא שיש PRN: כאב, חרדה, הפרשות, בחילה",
      ],
    },
  },
  // ═══ DNR/DNI (not comfort care — still gets workup) ═══
  {
    trigger: /\bDNR\b|\bDNI\b|לא להחיות|אל החיאה/i,
    hint: {
      emoji: "📋",
      title: "DNR/DNI — תזכורת",
      tips: [
        "ודא שטופס DNR/DNI חתום ומעודכן בתיק",
        "DNR ≠ comfort care — טיפול רפואי מלא ממשיך",
        "בהידרדרות: אנטיביוטיקה, נוזלים, ניטור — כן. הנשמה, CPR — לא",
        "עדכן צוות סיעוד לגבי סטטוס Code",
      ],
    },
  },
];

/**
 * Generate clinical hints for a patient based on diagnosis, flags, and status.
 * Returns empty array if no matches found.
 */
export function generateHints(patient: PatientEntry): ClinicalHint[] {
  // Check diagnosis + flags + status for broader coverage
  const textToSearch = [
    patient.diagnosis ?? "",
    ...patient.flags,
    ...patient.status,
    ...(patient.notes ?? []),
    patient.handoverNote ?? "",
  ].join(" ");
  if (!textToSearch.trim()) return [];

  const hints: ClinicalHint[] = [];
  const seen = new Set<string>();

  for (const rule of HINT_RULES) {
    if (rule.trigger.test(textToSearch) && !seen.has(rule.hint.title)) {
      seen.add(rule.hint.title);
      hints.push(rule.hint);
    }
  }

  return hints;
}

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

  // ═══ PNEUMONIA / ASPIRATION ═══
  {
    trigger: /pneumonia|דלקת ריאות|aspiration|שאיפת|ASP\b|LRTI|CAP\b|HAP\b|VAP\b/i,
    hint: {
      emoji: "🫁",
      title: "דלקת ריאות — הנחיות רקע",
      tips: [
        "ודא ABx ניתנים בזמן — בדוק שעת מתן אחרונה",
        "אם aspiration — NPO / הגבלת PO? ודא הערכת בליעה",
        "ראש מיטה ≥30° (מניעת aspiration חוזרת)",
        "SpO2 יעד — 92-96% (88-92% אם COPD)",
        "סימני הידרדרות: RR>25, SpO2 יורד, שינוי הכרה",
        "אם אין שיפור ב-48-72h → שקול הרחבת טווח / הדמיה חוזרת",
      ],
    },
  },

  // ═══ UTI / CATHETER ═══
  {
    trigger: /UTI|דלקת.*שתן|urinary.*infect|זיהום.*שתן|CAUTI|קטטר\s*(?:שתן|קבוע)|foley|catheter/i,
    hint: {
      emoji: "🚽",
      title: "UTI / קטטר — הנחיות רקע",
      tips: [
        "קטטר → שאל: עדיין נדרש? הסר מוקדם ככל האפשר (CAUTI)",
        "אם קטטר >48h + חום → תרבית שתן דרך פורט, לא מהשקית",
        "bacteriuria בלי תסמינים = אל תטפל (בזקנים: שינוי הכרה יכול להיות UTI)",
        "אם UTI חוזרת → שקול US כליות, שארית שתן",
      ],
    },
  },

  // ═══ AKI ═══
  {
    trigger: /AKI|acute kidney|אי.?ספיקת כליות חריפה|Cr.*עלייה|creatinine.*ris/i,
    hint: {
      emoji: "⚠️",
      title: "AKI — הנחיות רקע",
      tips: [
        "בדוק Pre-renal (ירידה בנפח) vs Renal vs Post-renal (חסימה)",
        "I/O — עקוב שתן q1-2h. אם <0.5ml/kg/h → fluid challenge",
        "עצור nephrotoxins: NSAIDs, aminoglycosides, ACEi/ARB, contrast",
        "בדוק K+ — אם >5.5 → פרוטוקול היפרקלמיה",
        "US כליות ודרכי שתן — שלילת חסימה (במיוחד בזקנים עם BPH)",
        "התאמת מינונים לפי GFR מעודכן",
      ],
    },
  },

  // ═══ SEPSIS ═══
  {
    trigger: /sepsis|ספסיס|SIRS|זיהום.*חמור|bacteremia|בקטרמיה|ספטי/i,
    hint: {
      emoji: "🔴",
      title: "ספסיס — הנחיות רקע",
      tips: [
        "ABx תוך שעה מזיהוי — ודא שניתנו. אם לא, דחוף!",
        "קריסטלואידים 30ml/kg אם hypotension — אלא אם CHF/overload",
        "לקטט q4-6h — יעד clearance (ירידה >10%)",
        "אם MAP <65 אחרי נוזלים → vasopressors (קו מרכזי)",
        "I/O — target UO ≥0.5ml/kg/h",
        "מעקב אורגן: Cr, biluribin, platelets, lactate, mental status",
      ],
    },
  },

  // ═══ FALLS ═══
  {
    trigger: /נפילה|fall\b|נפל|סיכון ליפול|fall risk/i,
    hint: {
      emoji: "⚡",
      title: "נפילה / סיכון נפילות — הנחיות רקע",
      tips: [
        "אם נפילה חדשה → בדוק ראש (GCS, pupil), סימני שבר",
        "אם על anticoagulation + נפילה + חבלת ראש → CT head",
        "סקור תרופות: benzos, opioids, antihypertensives, hypoglycemics",
        "orthostatic BP — ירידה >20 systolic = positive",
        "מניעה: נעליים סגורות, פעמון בהישג, תאורת לילה, מעקה",
        "שקול vitamin D 800-1000 IU/d + הערכת צפיפות עצם",
      ],
    },
  },

  // ═══ HYPONATREMIA ═══
  {
    trigger: /hyponatremia|היפונתרמיה|Na.*נמוך|Na\+?\s*<\s*13[0-5]/i,
    hint: {
      emoji: "🧂",
      title: "היפונתרמיה — הנחיות רקע",
      tips: [
        "Na q4-6h — יעד תיקון ≤10 mEq/24h (סכנת ODS!)",
        "הערך volume status: יתר נוזלים? חוסר? euvolemic?",
        "בדוק: serum osm, urine osm, urine Na → SIADH vs cerebral salt wasting",
        "סקור תרופות: thiazides, SSRIs, carbamazepine, desmopressin",
        "אם Na <120 + סימפטומטי (פרכוס, בלבול) → NaCl 3% 100ml over 10min",
        "הגבלת נוזלים — בדוק אם יש הוראה ומה היעד",
      ],
    },
  },

  // ═══ HYPERKALEMIA ═══
  {
    trigger: /hyperkalemia|היפרקלמיה|K\+?\s*>\s*5\.?[5-9]|אשלגן.*גבוה/i,
    hint: {
      emoji: "⚡",
      title: "היפרקלמיה — הנחיות רקע",
      tips: [
        "ECG מיידי — חפש peaked T, wide QRS, sine wave",
        "אם K >6.5 או שינויי ECG → calcium gluconate 10% IV (הגנת לב)",
        "הורדה: insulin 10U + D50% 50ml IV, salbutamol nebulizer 10mg",
        "הפרשה: kayexalate 30g PO/PR, furosemide אם יש שתן",
        "עצור: ACEi/ARB, K-sparing diuretics, K supplements",
        "אם אנוריה + K >6.5 → שקול דיאליזה חירום",
      ],
    },
  },

  // ═══ DELIRIUM (as hint — supplements the rule) ═══
  {
    trigger: /דליריום|delirium|בלבול חריף|acute confusion|sundowning/i,
    hint: {
      emoji: "🌙",
      title: "דליריום — הנחיות רקע",
      tips: [
        "דליריום = חירום רפואי — תמיד חפש סיבה (זיהום, תרופות, מטבולי, אצירה)",
        "המצב הקוגניטיבי הבסיסי הוא המפתח — שאל צוות/משפחה מה הבסיס",
        "אמצעים לא תרופתיים קודם תמיד: משקפיים, שמיעה, שעון, אור, משפחה",
        "הימנע קשירה — מחמיר אגיטציה ודליריום",
        "בנזודיאזפינים מחמירים דליריום (חריג: גמילת אלכוהול)",
        "זכור hypoactive delirium — רגוע אבל מבולבל, מסוכן לא פחות",
      ],
    },
  },
  // ═══ URINARY RETENTION ═══
  {
    trigger: /עצירת שתן|אצירת שתן|urinary retention|גלובוס שתן|retention.*urine|bladder.*retention/i,
    hint: {
      emoji: "🚿",
      title: "אצירת שתן — הנחיות רקע",
      tips: [
        "סיבות נפוצות: Anticholinergics, Opioids, BPH, עצירות סכית, Relaxants",
        "אם מאוין / כאב בבטן → Bladder Scan. >300ml → קטטר",
        ">1L: שחרור איטי (500ml כל 30 דק) — סכנת post-obstructive diuresis",
        "בטיפול מנחם: קטטר PRN עפני אי נוחות בלבד — לא נדרש באופן שגרתי",
      ],
    },
  },


  // ═══ C.DIFF ═══
  {
    trigger: /C\.?\s*diff|clostridium|clostridioides|קלוסטרידיום|שלשול.*ABx|antibiotic.*diarrhea/i,
    hint: {
      emoji: "🦠",
      title: "C. difficile — הנחיות רקע",
      tips: [
        "בידוד מגע — כפפות + חלוק + חדר בודד",
        "אלכוג'ל לא מספיק — רחיצת ידיים עם מים וסבון!",
        "אם מאובחן → Vancomycin PO 125mg q6h (לא metronidazole כקו ראשון)",
        "הפסק ABx מיותר ככל האפשר — זה הגורם הראשי",
        "אם fulminant (megacolon, shock) → Vanco PO + Metro IV + ייעוץ כירורגי",
      ],
    },
  },

  // ═══ MRSA / VRE / MDR ISOLATION ═══
  {
    trigger: /MRSA|VRE|ESBL|CRE|MDR|CPE|isolation|בידוד|עמיד/i,
    hint: {
      emoji: "🛡️",
      title: "חיידק עמיד / בידוד — הנחיות רקע",
      tips: [
        "ודא סוג בידוד: מגע? טיפות? אוויר?",
        "כפפות + חלוק לפני כניסה, הסר לפני יציאה",
        "ציוד ייעודי בחדר (סטטוסקופ, BP cuff)",
        "MRSA → שקול mupirocin nasal decolonization אם pre-op",
        "VRE / CRE → אל תשתמש ב-vancomycin אמפירי אם VRE, בדוק רגישויות",
      ],
    },
  },

  // ═══ NIV / BiPAP / CPAP ═══
  {
    trigger: /BiPAP|CPAP|NIV|NIPPV|non.?invasive.*ventil|הנשמה.*לא.*פולשנית/i,
    hint: {
      emoji: "😮‍💨",
      title: "NIV / BiPAP — הנחיות רקע",
      tips: [
        "ודא הגדרות: IPAP, EPAP, FiO2, trigger sensitivity",
        "בדוק התאמת מסכה — דליפה = חוסר יעילות",
        "גזים אחרי 1-2h — אם אין שיפור → שקול הנשמה",
        "NPO בזמן BiPAP — סיכון aspiration",
        "כשל NIV: RR>35, paradoxical breathing, GCS יורד → intubation",
        "אם DNI — תעד ceiling of care ברור",
      ],
    },
  },

  // ═══ TRACHEOSTOMY ═══
  {
    trigger: /trach|טרכיאוסטומ|טרכאוסטומ|קנה ניתוח/i,
    hint: {
      emoji: "🫁",
      title: "טרכיאוסטומיה — הנחיות רקע",
      tips: [
        "ציוד חירום ליד המיטה: spare trach (same + one size smaller), obturator, suction",
        "אם decannulation/obstruction: suction → remove inner cannula → replace → call ENT",
        "בדוק inner cannula נקי — לפחות q8h",
        "הרטבה — ודא humidification (HME / heated)",
        "אם trach <7 ימים — אין להחליף בלי ENT/surgeon",
      ],
    },
  },

  // ═══ ANEMIA / TRANSFUSION ═══
  {
    trigger: /אנמיה|anemia|Hb\s*<|hemoglobin.*low|iron defic/i,
    hint: {
      emoji: "🩸",
      title: "אנמיה — הנחיות רקע",
      tips: [
        "סף עירוי: Hb <7 (Hb <8 אם cardiac / symptomatic)",
        "אם אנמיה חדשה → בדוק מקור: GI (guaiac), wound, retroperitoneal",
        "CBC, retic, LDH, haptoglobin, iron/ferritin/TIBC",
        "אם על anticoagulation + Hb drop → שקול הפסקה / reversal",
      ],
    },
  },

  // ═══ HYPOTHYROIDISM ═══
  {
    trigger: /hypothyroid|תת.?פעילות.*תריס|TSH.*גבוה|levothyroxine|eltroxin|אלטרוקסין/i,
    hint: {
      emoji: "🦋",
      title: "תת-פעילות תריס — הנחיות רקע",
      tips: [
        "Eltroxin — תן בבוקר על קיבה ריקה, 30-60 דקות לפני אוכל",
        "אל תתן עם סידן, ברזל, IPP — הפרש לפחות 4 שעות",
        "אם NPO → תן IV (70-80% מהמינון PO)",
        "Myxedema coma (נדיר): hypothermia + bradycardia + altered MS → hydrocortisone + T4 IV",
      ],
    },
  },

  // ═══ DYSPHAGIA / NPO ═══
  {
    trigger: /dysphagia|דיספגיה|קושי בבליעה|הפרעת בליעה|NPO.*aspir/i,
    hint: {
      emoji: "🥄",
      title: "דיספגיה — הנחיות רקע",
      tips: [
        "NPO עד הערכת בליעה — אם לא בוצעה, סמן לקלינאית תקשורת",
        "אם מאושר PO — בדוק consistency: רגיל / soft / pureed / thickened liquids",
        "תרופות — בדוק אם צריך crush או liquid form",
        "ראש מיטה ≥30° בזמן אכילה + 30 דקות אחרי",
        "אם aspiration חוזרת → שקול הזנה צינורית (NGT/PEG)",
      ],
    },
  },

  // ═══ OBESITY / DOSING ═══
  {
    trigger: /השמנה|obesity|BMI\s*>\s*[34]0|bariatric|morbid/i,
    hint: {
      emoji: "⚖️",
      title: "השמנה — הנחיות רקע",
      tips: [
        "מינונים: enoxaparin, aminoglycosides, vancomycin — לפי actual weight",
        "Adjusted body weight לתרופות ליפופיליות (propofol, benzodiazepines)",
        "סיכון גבוה ל-DVT — ודא prophylaxis מתאים",
        "גישה ורידית קשה — שקול US-guided IV / PICC",
        "BiPAP/CPAP — בדוק אם יש OSA baseline",
      ],
    },
  },

  // ═══ OSTEOPOROSIS / VERTEBRAL FRACTURE ═══
  {
    trigger: /אוסטאופורוזיס|osteoporo|שבר.*חוליה|vertebral.*fracture|compression.*fracture/i,
    hint: {
      emoji: "🦴",
      title: "אוסטאופורוזיס — הנחיות רקע",
      tips: [
        "ניהול כאב: paracetamol קבוע ± tramadol, הימנע NSAIDs",
        "מוביליזציה מוקדמת — מנע immobility complications",
        "Vitamin D + Calcium — ודא שהתחילו/ממשיכים",
        "אם שבר שברירות חדש → bisphosphonates (לא אם GFR <30)",
        "סיכון נפילות חוזרות — physio + תיקון גורמים",
      ],
    },
  },

  // ═══ ALCOHOL WITHDRAWAL ═══
  {
    trigger: /גמילה.*אלכוהול|alcohol.*withdraw|DTs?(?!\w)|delirium tremens|CIWA/i,
    hint: {
      emoji: "🍺",
      title: "גמילה מאלכוהול — הנחיות רקע",
      tips: [
        "בנזודיאזפינים הם הטיפול! (חריג לכלל ה-benzo בדליריום)",
        "CIWA protocol — score q1-2h, treat if >8",
        "Diazepam 5-10mg IV/PO q5-15min עד שקט (loading dose)",
        "Thiamine 500mg IV x3/day × 3 ימים (לפני גלוקוז!)",
        "סכנת חיים: פרכוסים (12-48h), DTs (48-72h) — ICU אם severe",
        "מעקב: HR, BP, tremor, diaphoresis, hallucinations",
      ],
    },
  },

  // ═══ CONSTIPATION / ILEUS ═══
  {
    trigger: /עצירות|constipation|ileus|אילאוס|חסימת.*מעי|bowel obstruct/i,
    hint: {
      emoji: "💩",
      title: "עצירות / חסימת מעי — הנחיות רקע",
      tips: [
        "שאל: מתי יציאה אחרונה? אם >3 ימים → בדוק בטן + DRE",
        "אם על אופיואידים → bowel protocol חובה (senna + docusate / lactulose)",
        "הימנע lactulose בחשד חסימה מכנית",
        "אם distension + הקאות + no flatus → צילום בטן → ייעוץ כירורגי",
        "הידרציה + מוביליזציה — שני הכלים הלא-תרופתיים הכי חשובים",
      ],
    },
  },

  // ═══ INSULIN / HYPOGLYCEMIA ═══
  {
    trigger: /היפוגליקמיה|hypoglycemia|BS\s*<\s*70|סוכר.*נמוך/i,
    hint: {
      emoji: "🍬",
      title: "היפוגליקמיה — הנחיות רקע",
      tips: [
        "BS <70 → 15g glucose PO (juice/tablets) + recheck 15min",
        "BS <54 או altered MS → D50% 50ml IV (=25g glucose)",
        "אם על sulfonylurea → admission + D10% drip + BS q1h ×24h (long-acting!)",
        "ודא סיבה: אכל? מינון אינסולין? AKI? liver failure? infection?",
        "הפחת / בטל insulin/SU עד בירור",
      ],
    },
  },

  // ═══ GI BLEED ═══
  {
    trigger: /דימום.*GI|GI.*bleed|melena|מלנה|hematemesis|המטמזיס|hematochezia|המטוכזיה|דם.*צואה|הקאת.*דם|coffee.?ground/i,
    hint: {
      emoji: "🩸",
      title: "דימום GI — הנחיות רקע",
      tips: [
        "2 IV lines (16-18G), crossmatch, type & screen 2-4U pRBC",
        "PPI: Omeprazole 80mg IV bolus → 8mg/h drip (upper GI)",
        "Transfuse if Hb <7 (or <8 if cardiac/unstable)",
        "שחמת + דימום → Octreotide 50mcg bolus + 50mcg/h + Ceftriaxone 1g IV",
        "Anticoagulation reversal אם רלוונטי — אל תמתין ל-INR",
        "Glasgow-Blatchford Score 0 → שקול שחרור עם F/U",
      ],
    },
  },

  // ═══ PANCREATITIS ═══
  {
    trigger: /דלקת.*לבלב|pancreatitis|פנקריאטיטיס|lipase|ליפאז|amylase.*elevated/i,
    hint: {
      emoji: "🫘",
      title: "דלקת לבלב — הנחיות רקע",
      tips: [
        "Lipase >3x ULN = diagnostic. אין צורך ב-CT ב-24h הראשונות",
        "נוזלים אגרסיביים: LR 1.5ml/kg/h (200-250ml/h) × 24-48h",
        "כאב: Paracetamol + Morphine. ❌ לא Meperidine (seizure risk)",
        "NPO רק אם הקאות. אחרת: low-fat diet מוקדם ככל האפשר",
        "סיבות: אבנים (55%), אלכוהול (35%). US צד ימין לשלול choledocholithiasis",
        "Ranson / BISAP לחומרה. ICU אם organ failure / necrosis",
      ],
    },
  },

  // ═══ PLEURAL EFFUSION ═══
  {
    trigger: /תפליט.*פלאורלי|pleural.*effusion|תפליט.*ריאתי|empyema|אמפיימה|חזה.*נוזל/i,
    hint: {
      emoji: "💧",
      title: "תפליט פלאורלי — הנחיות רקע",
      tips: [
        "אם >10mm ב-decubitus / US → שקול thoracentesis diagnostit",
        "Light's criteria: transudate vs exudate (LDH, protein fluid/serum ratio)",
        "שלח: cell count + diff, LDH, protein, glucose, pH, culture, cytology",
        "pH <7.2 / glucose <40 / pus → chest tube (complicated parapneumonic / empyema)",
        "CHF = transudative → optimize diuretics before tapping",
      ],
    },
  },

  // ═══ RHABDOMYOLYSIS ═══
  {
    trigger: /רבדומיוליזיס|rhabdomyolysis|rhabdo|CK.*elevated|CK.*גבוה|myoglobin/i,
    hint: {
      emoji: "💪",
      title: "רבדומיוליזיס — הנחיות רקע",
      tips: [
        "נוזלים אגרסיביים: NaCl 0.9% 200-300ml/h — יעד UO >200-300ml/h",
        "CK peak day 1-3. Monitor CK q6-12h until downtrend",
        "סיכון AKI: CK >5000, dehydration, acidosis, elderly",
        "K+ monitoring q4-6h — hyperkalemia סיכון מרכזי!",
        "❌ לא Ringer's Lactate (K+ content). ❌ לא mannitol/bicarb routinely",
        "סיבות: נפילה ממושכת, statins, trauma, seizure, heat stroke",
      ],
    },
  },

  // ═══ ADRENAL CRISIS / INSUFFICIENCY ═══
  {
    trigger: /אדרנל|adrenal|אדיסון|addison|cortisol|קורטיזול|סטרואידים.*כרוני|chronic.*steroid|stress.*dose/i,
    hint: {
      emoji: "🧬",
      title: "אי-ספיקת אדרנל / stress dose — הנחיות רקע",
      tips: [
        "אם על סטרואידים >5mg prednisone ×3 שבועות → risk for adrenal suppression",
        "Stress dose: Hydrocortisone 50mg IV q8h (surgery/sepsis) or 25mg q8h (moderate illness)",
        "Crisis: hypotension + hyponatremia + hyperkalemia → Hydrocortisone 100mg IV STAT + fluids",
        "Random cortisol <3 = diagnostic. 3-18 = gray zone → ACTH stim test",
        "❌ אל תפסיק סטרואידים פתאום! taper slowly",
      ],
    },
  },

  // ═══ THYROID STORM / THYROTOXICOSIS ═══
  {
    trigger: /סערת.*תריס|thyroid.*storm|thyrotoxicosis|תירוטוקסיקוזיס|TSH.*suppressed|גראבס|graves/i,
    hint: {
      emoji: "🔥",
      title: "סערת תריס — הנחיות רקע",
      tips: [
        "Burch-Wartofsky score ≥45 = thyroid storm. חירום!",
        "PTU 200mg PO q4h (blocks synthesis + T4→T3 conversion)",
        "1h after PTU: Lugol's solution 5 drops q8h (blocks release)",
        "Propranolol 60-80mg PO q4-6h (or Esmolol drip if severe)",
        "Hydrocortisone 100mg IV q8h (blocks T4→T3 + relative adrenal insufficiency)",
        "חפש trigger: infection, surgery, iodine contrast, med non-compliance",
      ],
    },
  },

  // ═══ GOUT / ACUTE ARTHRITIS ═══
  {
    trigger: /שיגדון|gout|גאוט|podagra|פודגרה|arthritis.*acute|דלקת.*פרק.*חריפה|uric.*acid|חומצה.*שתן/i,
    hint: {
      emoji: "🦶",
      title: "שיגדון / דלקת פרק חריפה — הנחיות רקע",
      tips: [
        "שלול ספטית! Joint aspiration + crystal analysis + culture חובה (especially monoarticular)",
        "Crystal: needle-shaped negative birefringent = gout. Rhomboid positive = pseudogout",
        "Colchicine 0.5mg x2 then 0.5mg x1 (low-dose regimen). ❌ בקשישים עם CKD",
        "NSAIDs: Indomethacin 50mg PO TID × 5 days (❌ AKI, GI bleed, CHF)",
        "Prednisone 30-40mg PO × 5 days — safest in elderly / CKD",
        "❌ אל תתחיל / תשנה Allopurinol באירוע חריף!",
      ],
    },
  },

  // ═══ CELLULITIS ═══
  {
    trigger: /צלוליטיס|cellulitis|אריסיפלס|erysipelas|דלקת.*עור|skin.*infection|רקמה.*רכה/i,
    hint: {
      emoji: "🔴",
      title: "צלוליטיס — הנחיות רקע",
      tips: [
        "סמן גבולות בעט! — follow-up q12h לעקוב אחרי התקדמות/נסיגה",
        "Mild: Cephalexin 500mg PO QID or Clindamycin 300mg PO QID",
        "Moderate (IV): Cefazolin 2g IV q8h. MRSA risk? → Vancomycin + Cefazolin",
        "Purulent / abscess → I&D + wound culture. שקול MRSA cover (TMP-SMX / Doxycycline)",
        "Necrotizing fasciitis? crepitus, pain out of proportion, toxic → surgical emergency!",
        "הרם גפה. DVT בדד״מ אם unilateral leg swelling",
      ],
    },
  },

  // ═══ SBP / ASCITES ═══
  {
    trigger: /SBP|peritonitis.*spontaneous|דלקת.*צפק.*ספונטנית/i,
    hint: {
      emoji: "💥",
      title: "SBP — הנחיות רקע",
      tips: [
        "PMN >250/mm³ in ascitic fluid = SBP → ABx immediately",
        "Cefotaxime 2g IV q8h (or Ceftriaxone 2g IV daily) × 5 days",
        "Albumin: 1.5g/kg day 1 + 1g/kg day 3 → reduces HRS + mortality",
        "Repeat paracentesis day 3 אם אין שיפור קליני (PMN should ↓ 25%)",
        "Prophylaxis: Norfloxacin 400mg PO daily / TMP-SMX (after SBP or protein <1.5)",
      ],
    },
  },

  // ═══ HEPATIC ENCEPHALOPATHY ═══
  {
    trigger: /אנצפלופתיה.*כבד|hepatic.*encephalopathy|HE\b|אנצפלופתיה.*הפטית|ammonia.*elevated|אמוניה/i,
    hint: {
      emoji: "🧠",
      title: "אנצפלופתיה כבדית — הנחיות רקע",
      tips: [
        "Lactulose 30ml q1-2h PO/NG until bowel movement → titrate ל-3-4 יציאות/יום",
        "Rifaximin 550mg PO BID — secondary prophylaxis (+ lactulose)",
        "חפש precipitant: GI bleed, infection/SBP, constipation, AKI, benzos/opioids, hypokalemia",
        "❌ לא protein restriction (outdated). Nutrition is important.",
        "Ammonia level does NOT correlate well with severity — treat clinically",
        "West Haven grade 3-4 → intubation risk. NG lactulose + ICU",
      ],
    },
  },

  // ═══ SEIZURE DISORDER ═══
  {
    trigger: /אפילפסיה|epilepsy|פרכוס|seizure|convulsion|levetiracetam|keppra|פנוברביטל|phenobarbital|carbamazepine|valproate/i,
    hint: {
      emoji: "⚡",
      title: "פרכוסים — הנחיות רקע",
      tips: [
        "Status epilepticus (>5min): Lorazepam 4mg IV → Levetiracetam 60mg/kg IV (max 4.5g)",
        "Check anticonvulsant levels (Valproate, Phenytoin, Carbamazepine)",
        "New onset in elderly: CT head (stroke, mass, SDH). LP אם חשד CNS infection",
        "Common precipitants: med non-compliance, Na+/glucose, alcohol, infection, sleep deprivation",
        "Post-ictal: recovery position, O2, glucose check, neuro obs q15min",
        "❌ Phenytoin IV max rate 50mg/min → cardiac monitor (arrhythmia, hypotension)",
      ],
    },
  },

  // ═══ PACEMAKER / ICD ═══
  {
    trigger: /קוצב|pacemaker|pace.?maker|ICD|defibrillator|דפיברילטור|CRT|מכשיר.*לב/i,
    hint: {
      emoji: "🫀",
      title: "קוצב / ICD — הנחיות רקע",
      tips: [
        "ECG: pacing spikes + appropriate capture? (spike → QRS = working)",
        "Magnet over ICD → disables shock. Use if inappropriate shocks / end-of-life",
        "Magnet over pacemaker → asynchronous pacing (VOO/DOO) at fixed rate",
        "❌ אין MRI אלא אם MRI-conditional device (ודא עם אלקטרופיזיולוג)",
        "Pocket infection: fever + redness/swelling/erosion over generator → urgent consult",
        "Failure to pace: check leads, battery (ERI), metabolic (K+, acidosis), lead fracture",
      ],
    },
  },

  // ═══ AORTIC STENOSIS ═══
  {
    trigger: /היצרות.*אאורטל|aortic.*stenosis|AS\s+severe|stenosis.*aortic|TAVI|TAVR|מסתם.*אאורט/i,
    hint: {
      emoji: "❤️",
      title: "היצרות אאורטלית — הנחיות רקע",
      tips: [
        "Severe AS triad: syncope, angina, heart failure → poor prognosis without intervention",
        "❌ Vasodilators (ACEi, nitrates) — זהירות רבה! סיכון לירידה חמורה ב-BP",
        "❌ Tachycardia — שומר על filling time. Rate control חשוב ב-AF",
        "Hypotension: NS bolus (preload dependent). Phenylephrine if needed (not vasodilators!)",
        "Volume sensitive — dehydration → severe ↓BP. Over-diuresis dangerous",
        "New murmur + symptoms → echo + cardiology/cardiac surgery consult",
      ],
    },
  },

  // ═══ ACUTE CORONARY SYNDROME ═══
  {
    trigger: /STEMI|NSTEMI|unstable.*angina|תעוקה.*לא.*יציב|אוטם.*שריר.*לב|MI\b|ACS\b|troponin.*positive|טרופונין.*חיובי/i,
    hint: {
      emoji: "💔",
      title: "ACS — הנחיות רקע",
      tips: [
        "STEMI → cathlab בתוך 90 דקות. אל תמתין!",
        "Aspirin 300mg PO (ללעוס) + Ticagrelor 180mg / Clopidogrel 300mg (per cardiology)",
        "Heparin 60U/kg bolus → 12U/kg/h IV (NSTEMI)",
        "NTG SL 0.5mg q5min x3 (❌ SBP<90, RV infarct, PDE5i)",
        "Serial troponin q3h. Serial ECG if dynamic symptoms",
        "In elderly: atypical presentations common — dyspnea, confusion, nausea instead of chest pain",
      ],
    },
  },

  // ═══ POST-OPERATIVE PATIENT ═══
  {
    trigger: /פוסט.*ניתוח|post.?op|after.*surgery|ניתוח.*היום|POD\s*\d|post.*operative/i,
    hint: {
      emoji: "🔪",
      title: "פוסט-ניתוחי — הנחיות רקע",
      tips: [
        "Pain: Paracetamol קבוע + opioid PRN. מונע ileus vs under-treatment",
        "VTE prophylaxis: Enoxaparin 40mg SC daily (adjust for CKD/weight)",
        "חום פוסט-ניתוחי 5 W's: Wind (atelectasis d1-2), Water (UTI d3-5), Wound (SSI d5-7), Walk (DVT d7+), Wonder drugs",
        "I/O monitoring. Remove catheter ASAP (CAUTI risk). Early mobilization",
        "Resume chronic meds: beta-blockers, thyroid, seizure meds — don't skip!",
        "Hold ACEi/ARB 24-48h post-op (hypotension risk). Hold metformin until stable renal function",
      ],
    },
  },

  // ═══ BLOOD TRANSFUSION ═══
  {
    trigger: /עירוי.*דם|מנת.*דם|pRBC|transfusion|blood.*product|FFP|טסיות|platelet.*transfusion/i,
    hint: {
      emoji: "🅰️",
      title: "עירוי דם — הנחיות רקע",
      tips: [
        "ודא crossmatch + consent. 2 nurses verify ID + blood bag",
        "V/S baseline → q15min × 1h → q30min until done",
        "Transfusion reaction: STOP immediately → V/S → send bag + blood samples to bank",
        "Febrile non-hemolytic: most common. Paracetamol. Rule out hemolytic.",
        "TACO risk in elderly/CHF: give slowly (4h per unit), consider Furosemide 20mg IV between units",
        "Thresholds: Hb <7 (general), <8 (cardiac/symptomatic), PLT <10K (prophylaxis), <50K (bleeding/procedure)",
      ],
    },
  },

  // ═══ HYPERTENSIVE CRISIS ═══
  {
    trigger: /יתר.*לחץ.*חמור|hypertensive.*crisis|hypertensive.*emergency|BP.*>.*200|משבר.*לחץ.*דם|malignant.*hypertension/i,
    hint: {
      emoji: "📈",
      title: "משבר יתר לחץ דם — הנחיות רקע",
      tips: [
        "Emergency (end-organ damage) vs Urgency (no damage) — different management!",
        "Urgency: Captopril 25mg PO. Goal: 25% ↓BP over hours. Don't normalize immediately",
        "Emergency: Labetalol 20mg IV → 40mg → 80mg q10min, or Nicardipine 5mg/h drip",
        "Aortic dissection → HR <60 + SBP <120. BB FIRST, then NTG. ❌ NTG before BB!",
        "Stroke: don't lower BP unless >220/120 (or >185/110 if tPA candidate)",
        "Check for end-organ: fundoscopy, troponin, Cr, UA (proteinuria), CT head if neuro symptoms",
      ],
    },
  },

  // ═══ CHRONIC PAIN / OPIOID USE ═══
  {
    trigger: /כאב.*כרוני|chronic.*pain|opioid.*chronic|אופיואידים.*כרוני|fentanyl.*patch|מדבקת.*פנטניל|tramadol|טרמדול|oxycodone|אוקסיקודון/i,
    hint: {
      emoji: "💊",
      title: "כאב כרוני / אופיואידים — הנחיות רקע",
      tips: [
        "המשך אופיואידים כרוניים באשפוז (withdrawal risk). Convert to equianalgesic IV if NPO",
        "Fentanyl patch: אל תסיר! onset 12-24h, offset 12-24h. אם NPO — patch is fine",
        "Breakthrough: 10-15% of total daily dose PRN q3-4h",
        "Bowel protocol חובה: Senna + Docusate. ❌ לא סיבים אם על אופיואידים",
        "בקשישים: start low, go slow. Morphine → reduce 50% if CKD",
        "Naloxone 0.04mg IV (low-dose) for over-sedation without respiratory arrest. 0.4mg for apnea",
      ],
    },
  },

  // ═══ ASTHMA ═══
  {
    trigger: /אסתמה|asthma|bronchospasm|ברונכוספזם|wheezing.*acute|צפצופים/i,
    hint: {
      emoji: "🌬️",
      title: "אסתמה — התקף חריף",
      tips: [
        "Salbutamol 2.5-5mg neb q20min × 3 + Ipratropium 0.5mg neb × 3",
        "Methylprednisolone 40mg IV (or Prednisone 40-60mg PO) — give EARLY",
        "MgSO4 2g IV over 20min — if severe/life-threatening (not routine)",
        "SpO2 target ≥94%. Peak flow before/after treatment if able",
        "❌ Beta-blockers (including eye drops!). ❌ NSAIDs if aspirin-sensitive",
        "No improvement + rising CO2 → ICU + possible intubation (ketamine induction preferred)",
      ],
    },
  },

  // ═══ DKA / HHS ═══
  {
    trigger: /DKA|HHS|diabetic.*ketoacid|קטואצידוזיס|hyperosmolar|היפראוסמולרי|anion.*gap.*metabolic/i,
    hint: {
      emoji: "📊",
      title: "DKA / HHS — הנחיות רקע",
      tips: [
        "DKA: glucose >250, pH <7.3, bicarb <18, AG >12, ketones+",
        "HHS: glucose >600, osm >320, no significant ketosis. שכיח בקשישים!",
        "Fluids first! NS 1L/h × 1-2h → 250-500ml/h. Switch to 0.45% if Na corrected >140",
        "Insulin: Regular 0.1U/kg/h IV. אם K <3.3 → תקן K לפני insulin!",
        "D5 when glucose reaches 200-250 (DKA) / 300 (HHS) — continue insulin until AG closes",
        "K+ monitoring q2h. BMP q2-4h. חפש precipitant: infection, MI, non-compliance",
      ],
    },
  },

  // ═══ MENINGITIS ═══
  {
    trigger: /מנינגיטיס|meningitis|דלקת.*קרומי.*מוח|neck.*stiffness|קשיון.*עורף|LP.*positive|CSF.*pleocytosis/i,
    hint: {
      emoji: "🧠",
      title: "מנינגיטיס — הנחיות רקע",
      tips: [
        "ABx IMMEDIATELY — don't wait for LP if delayed! Ceftriaxone 2g IV + Vancomycin + Ampicillin (age >50)",
        "Dexamethasone 0.15mg/kg IV q6h × 4 days — give BEFORE or WITH first ABx dose",
        "LP: opening pressure, cell count + diff, protein, glucose, Gram stain, culture, HSV PCR",
        "CT before LP only if: immunocompromised, focal neuro, papilledema, altered consciousness, new seizure",
        "Kernig + Brudzinski signs — sensitivity poor in elderly. High index of suspicion if fever + altered MS",
        "Contact prophylaxis (N. meningitidis): Ciprofloxacin 500mg PO × 1 for close contacts",
      ],
    },
  },

  // ═══ HYPERNATREMIA ═══
  {
    trigger: /היפרנתרמיה|hypernatremia|Na\+?\s*>?\s*14[5-9]|Na\+?\s*>?\s*1[5-9]\d/i,
    hint: {
      emoji: "🧂",
      title: "היפרנתרמיה — הנחיות רקע",
      tips: [
        "שכיח בקשישים: ירידה בתחושת צמא + גישה מוגבלת לנוזלים",
        "תיקון: max 10-12 mEq/L ב-24h. מהיר מדי → cerebral edema!",
        "Free water deficit = TBW × (Na/140 - 1). TBW = weight × 0.5 (elderly)",
        "D5W IV או מים חופשיים דרך NGT. עדיף PO/NGT על IV",
        "חפש סיבה: dehydration, diabetes insipidus, tube feeds ללא מים חופשיים, osmotic diuresis",
        "מעקב: Na q4-6h. UO + osmolality",
      ],
    },
  },

  // ═══ HYPERCALCEMIA ═══
  {
    trigger: /היפרקלצמיה|hypercalcemia|Ca\+?\+?\s*>?\s*1[1-9]|calcium.*elevated|corrected.*Ca/i,
    hint: {
      emoji: "🦴",
      title: "היפרקלצמיה — הנחיות רקע",
      tips: [
        "Corrected Ca = measured Ca + 0.8 × (4 - albumin). חובה לתקן!",
        "קל (<12): הידרציה. בינוני (12-14): NS + calcitonin. חמור (>14): NS aggressive + zoledronic acid",
        "NS 200-500ml/h (watch CHF!) — rehydration is the most important first step",
        "Calcitonin 4U/kg SC/IM q12h — fast onset (4-6h) but tachyphylaxis after 48h",
        "Zoledronic acid 4mg IV over 15min — onset 2-4 days, duration weeks",
        "סיבות: malignancy (PTHrP), primary hyperparathyroidism, vitamin D, thiazides, immobilization",
        "ECG: short QT, wide T waves. מוניטור אם Ca >14",
      ],
    },
  },

  // ═══ HYPOCALCEMIA ═══
  {
    trigger: /היפוקלצמיה|hypocalcemia|Ca\+?\+?\s*<?\s*[78]\.\d|low.*calcium|post.*thyroidectomy/i,
    hint: {
      emoji: "⬇️",
      title: "היפוקלצמיה — הנחיות רקע",
      tips: [
        "Correct for albumin! Corrected Ca = measured + 0.8 × (4 - albumin)",
        "Symptomatic (tetany, Chvostek, Trousseau, seizures): Ca gluconate 10ml 10% IV over 10min",
        "ECG: prolonged QT → risk of Torsades! מוניטור",
        "תקן Mg — hypomagnesemia = refractory hypocalcemia",
        "Chronic: CaCO3 500-1000mg PO TID + calcitriol 0.25-0.5mcg PO daily",
        "סיבות: post-thyroidectomy, CKD, vitamin D deficiency, hypoparathyroidism, pancreatitis",
      ],
    },
  },

  // ═══ NMS (NEUROLEPTIC MALIGNANT SYNDROME) ═══
  {
    trigger: /NMS|neuroleptic.*malignant|תסמונת.*נוירולפטית|rigidity.*fever|lead.*pipe/i,
    hint: {
      emoji: "🔥",
      title: "NMS — תסמונת נוירולפטית ממאירה",
      tips: [
        "Classic tetrad: Fever + Rigidity + AMS + Autonomic instability",
        "הפסק IMMEDIATELY את כל הנוירולפטיקה (haloperidol, olanzapine, quetiapine etc.)",
        "Labs: CK↑↑↑ (>1000), WBC↑, LFTs↑, metabolic acidosis",
        "Dantrolene 1-2.5mg/kg IV — primary treatment. Bromocriptine 2.5mg PO q8h as adjunct",
        "Aggressive cooling + IV fluids. Watch for rhabdomyolysis → AKI",
        "ICU admission. Mortality 5-20% even with treatment",
        "DDx from serotonin syndrome: NMS = slow onset (days), rigidity. SS = rapid onset (hours), clonus",
      ],
    },
  },

  // ═══ SEROTONIN SYNDROME ═══
  {
    trigger: /serotonin.*syndrome|תסמונת.*סרוטונין|SS.*clonus|tremor.*hyperreflexia|SSRI.*interaction/i,
    hint: {
      emoji: "⚡",
      title: "תסמונת סרוטונין — הנחיות רקע",
      tips: [
        "Hunter criteria: serotonergic drug + clonus (spontaneous/inducible/ocular) ± agitation, diaphoresis, tremor, hyperreflexia",
        "הפסק את כל התרופות הסרוטונרגיות: SSRIs, SNRIs, tramadol, linezolid, fentanyl, MAOIs",
        "Mild: observation + benzodiazepines. Severe: cyproheptadine 12mg PO → 2mg q2h",
        "Cooling (no antipyretics — this isn't infection-mediated fever)",
        "בד\"כ resolves within 24-72h of drug cessation",
        "DDx from NMS: SS = rapid onset (hours), clonus, hyperreflexia. NMS = slow (days), rigidity",
      ],
    },
  },

  // ═══ DIALYSIS PATIENT ═══
  {
    trigger: /דיאליזה|hemodialysis|\\bHD\\b.*renal|ESRD|end.stage.*renal|peritoneal.*dialysis|\\bPD\\b.*renal/i,
    hint: {
      emoji: "🔄",
      title: "חולה דיאליזה — הנחיות רקע",
      tips: [
        "K+ monitoring — hyperkalemia is #1 killer. ECG אם K >5.5",
        "Dry weight: overload → pulmonary edema. אם acute → urgent dialysis or UF",
        "Drug dosing: many drugs need post-dialysis supplementation. Check each medication!",
        "Fistula/graft: NEVER BP cuff, IV, or blood draw from access arm",
        "Hypotension post-dialysis: normal. Fluid bolus 250ml NS if symptomatic",
        "מינונים: no NSAIDs, ACEi/ARB — check with nephrology. Avoid gadolinium (NSF)",
        "Chest pain in ESRD: DDx includes uremic pericarditis — friction rub, diffuse ST elevation",
      ],
    },
  },

  // ═══ NEUTROPENIC FEVER ═══
  {
    trigger: /neutropenic.*fever|febrile.*neutropenia|ANC\s*<?\s*500|נויטרופני/i,
    hint: {
      emoji: "🦠",
      title: "חום נויטרופני — הנחיות רקע",
      tips: [
        "EMERGENCY: ABx within 30-60 minutes! Mortality increases per hour of delay",
        "ANC <500 or expected to fall <500 within 48h = neutropenic",
        "First-line: Cefepime 2g IV q8h OR Meropenem 1g IV q8h OR Pip-Tazo 4.5g IV q6h",
        "Add Vancomycin only if: hemodynamic instability, line infection, MRSA risk, mucositis",
        "Cultures x2 sets (peripheral + from each lumen if central line)",
        "❌ No rectal exams, no rectal temps! Mucositis risk → perforation",
        "MASCC score for risk stratification — low risk may do outpatient ABx",
      ],
    },
  },

  // ═══ REFEEDING SYNDROME ═══
  {
    trigger: /refeeding|הזנה.*מחודשת|malnourish|תת.*תזונה|BMI\s*<?\s*1[678]|NPO.*prolonged|starvation/i,
    hint: {
      emoji: "🍽️",
      title: "תסמונת הזנה מחדש — הנחיות רקע",
      tips: [
        "Risk factors: BMI <18.5, unintentional weight loss >10% in 3-6 months, NPO >5 days",
        "Hallmark: ↓PO4, ↓K, ↓Mg within 12-72h of refeeding",
        "Start low and go slow: begin at 10-20 kcal/kg/day, advance over 4-7 days",
        "Thiamine 200-300mg IV BEFORE first feeding — prevents Wernicke encephalopathy",
        "Monitor PO4, K+, Mg2+ q12h for first 3 days. Supplement aggressively if dropping",
        "Fluid restriction: avoid aggressive IV fluids — sodium/water retention is part of syndrome",
        "Cardiac risk: arrhythmias from electrolyte shifts. מוניטור ECG",
      ],
    },
  },

  // ═══ HEART BLOCK ═══
  {
    trigger: /heart.*block|AV.*block|חסם.*לבבי|bradycardia|ברדיקרדיה|2nd.*degree|3rd.*degree|Mobitz|complete.*block/i,
    hint: {
      emoji: "💓",
      title: "חסם לבבי / ברדיקרדיה — הנחיות רקע",
      tips: [
        "Symptomatic bradycardia (HR <50 + hypotension/syncope/altered MS): Atropine 0.5mg IV q3-5min (max 3mg)",
        "1st degree AVB: usually benign. 2nd degree Mobitz I (Wenckebach): usually benign, observe",
        "2nd degree Mobitz II: HIGH RISK → can progress to complete block. Transcutaneous pacer ready!",
        "3rd degree (complete): wide QRS escape = unstable. Pacing needed. Narrow QRS = more stable but still needs cards consult",
        "If atropine fails: transcutaneous pacing → transvenous pacing. Dopamine 5-20mcg/kg/min or Isoproterenol as bridge",
        "Common causes: beta-blockers, CCBs, digoxin, hyperkalemia, ischemia (RCA territory)",
        "Reversible causes first: stop offending drugs, correct K+. If drug-related → may resolve in hours",
      ],
    },
  },

  // ═══ SVT ═══
  {
    trigger: /\\bSVT\\b|supraventricular.*tachycardia|narrow.*complex|AVNRT|AVRT|פרוזדורית/i,
    hint: {
      emoji: "💗",
      title: "SVT — טכיקרדיה על-חדרית",
      tips: [
        "Vagal maneuvers first: carotid massage (❌ if bruit), Valsalva (modified: 40mmHg × 15sec → lie flat + leg raise)",
        "Adenosine 6mg rapid IV push + flush → 12mg → 12mg. t½ = 6 seconds — inject FAST!",
        "❌ Adenosine C/I: WPW with wide complex (pre-excited AF), severe asthma",
        "If adenosine fails: Verapamil 5-10mg IV over 2min (❌ if HFrEF or on beta-blocker)",
        "Unstable (hypotension, chest pain, altered MS): synchronized cardioversion 50-100J",
        "Narrow vs wide: if wide complex — treat as VT until proven otherwise!",
      ],
    },
  },

  // ═══ DIGOXIN TOXICITY ═══
  {
    trigger: /digoxin|דיגוקסין|digitalis|dig.*level|dig.*toxicity/i,
    hint: {
      emoji: "💊",
      title: "דיגוקסין — הנחיות רקע",
      tips: [
        "Therapeutic range: 0.8-2.0 ng/mL. Toxicity more common at levels >2.0 but can occur at 'therapeutic' levels in elderly",
        "Symptoms: nausea, vomiting, visual changes (yellow/green halos), confusion, ANY arrhythmia",
        "Classic ECG: 'reverse check mark' ST depression (Salvador Dali sign), PR prolongation. Toxicity: bidirectional VT, regularized AF",
        "Risk factors for toxicity: hypokalemia (!!), hypomagnesemia, hypothyroidism, renal failure, amiodarone interaction",
        "Treatment: stop digoxin, correct K+ (keep >4), Mg2+ supplementation",
        "Severe (life-threatening arrhythmia): Digibind (DigiFab) — 10-20 vials. Call poison control for dosing",
        "❌ Avoid cardioversion if digoxin toxic — can precipitate VF. Avoid calcium IV (stone heart theory)",
      ],
    },
  },

  // ═══ AORTIC DISSECTION ═══
  {
    trigger: /dissection|דיסקציה|aortic.*tear|tearing.*pain|Stanford.*A|Stanford.*B|DeBakey/i,
    hint: {
      emoji: "🫀",
      title: "דיסקציה של אאורטה — הנחיות רקע",
      tips: [
        "Tearing chest/back pain + BP asymmetry (>20mmHg between arms) = dissection until proven otherwise",
        "Immediate: HR <60 AND SBP <120! Beta-blocker FIRST → then vasodilator",
        "Esmolol 500mcg/kg bolus → 50-200mcg/kg/min OR Labetalol 20mg IV q10min",
        "❌ NEVER NTG before beta-blocker — reflex tachycardia worsens dissection",
        "Type A (ascending): surgical emergency → call CT surgery NOW",
        "Type B (descending): medical management unless complicated (malperfusion, rupture)",
        "CTA chest/abdomen/pelvis — gold standard imaging. CXR: widened mediastinum (only 60% sensitive)",
        "D-dimer negative = very unlikely dissection (good for ruling out)",
      ],
    },
  },

  // ═══ ACUTE LIMB ISCHEMIA ═══
  {
    trigger: /acute.*limb|limb.*ischemia|6P|cold.*leg|pale.*leg|pulseless.*leg|arterial.*occlusion/i,
    hint: {
      emoji: "🦵",
      title: "איסכמיה חריפה בגפה — הנחיות רקע",
      tips: [
        "6 P's: Pain, Pallor, Pulselessness, Paresthesia, Paralysis, Poikilothermia (cold)",
        "Heparin bolus 80U/kg IV immediately (even before imaging) — prevent propagation",
        "Vascular surgery consult URGENT — embolectomy or thrombolysis within 6h",
        "CTA or duplex US for localization",
        "Compartment syndrome risk after revascularization — monitor for reperfusion injury",
        "Source: AF (most common), aortic aneurysm, arterial plaque. ECG to check for AF",
        "❌ Do not elevate limb (unlike venous) — keep at heart level or slightly dependent",
      ],
    },
  },

  // ═══ HYPOMAGNESEMIA ═══
  {
    trigger: /היפומגנזמיה|hypomagnes|low.*magnesium|Mg\+?\+?\s*<?\s*1\.[0-7]/i,
    hint: {
      emoji: "⚡",
      title: "היפומגנזמיה — הנחיות רקע",
      tips: [
        "שכיח מאוד בקשישים: PPIs (long-term), diuretics, alcoholism, diarrhea",
        "חובה לתקן Mg לפני K — hypokalemia is refractory until Mg is corrected!",
        "Mild: Mg oxide 400mg PO BID-TID (poorly absorbed but available)",
        "Moderate-severe or symptomatic: MgSO4 2g IV over 1h. May repeat x1",
        "Severe (<1.0) or arrhythmia: MgSO4 4g IV over 4h. ICU monitoring",
        "ECG: prolonged PR, wide QRS, peaked T waves. Can cause Torsades!",
        "Monitor DTRs — loss of reflexes = early sign of hypermagnesemia from overcorrection",
      ],
    },
  },

  // ═══ HYPOPHOSPHATEMIA ═══
  {
    trigger: /היפופוספטמיה|hypophosphat|low.*phosph|PO4\s*<?\s*[12]\.|refeeding/i,
    hint: {
      emoji: "📉",
      title: "היפופוספטמיה — הנחיות רקע",
      tips: [
        "Common in refeeding, DKA recovery, chronic alcoholism, post-parathyroidectomy",
        "Mild (2.0-2.5): PO supplementation — Neutra-Phos 1-2 packets PO TID",
        "Severe (<1.0) or symptomatic: K-Phos or Na-Phos 15-30mmol IV over 6h",
        "Symptoms: weakness, respiratory failure (diaphragm!), altered MS, hemolysis, rhabdomyolysis",
        "Monitor Ca2+ — phosphate replacement can precipitate hypocalcemia",
        "In DKA: PO4 drops as insulin drives it intracellularly. Check q4-6h during DKA treatment",
      ],
    },
  },

  // ═══ TUMOR LYSIS SYNDROME ═══
  {
    trigger: /tumor.*lysis|TLS|תסמונת.*פירוק.*גידול|uric.*acid.*high|hyperuricemia/i,
    hint: {
      emoji: "💥",
      title: "TLS — תסמונת פירוק גידול",
      tips: [
        "Lab hallmarks: ↑K, ↑PO4, ↑uric acid, ↑LDH, ↓Ca, ↑Cr",
        "Prevention: aggressive hydration NS 200ml/h + allopurinol 300mg PO daily",
        "Established TLS: Rasburicase 0.2mg/kg IV (single dose) — rapid uric acid reduction",
        "❌ Rasburicase C/I in G6PD deficiency — causes methemoglobinemia",
        "Monitor: BMP + PO4 + uric acid + LDH q4-6h",
        "Hyperkalemia = most dangerous acute complication → standard hyperK protocol",
        "Dialysis if: refractory K, oliguria, severe acidosis, symptomatic hypocalcemia",
      ],
    },
  },

  // ═══ POST-OPERATIVE COMPLICATIONS ═══
  {
    trigger: /post.*op|פוסט.*אופ|post.*surgical|אחרי.*ניתוח|s\/p.*surgery|POD\s*\d/i,
    hint: {
      emoji: "🏥",
      title: "פוסט-ניתוחי — הנחיות רקע",
      tips: [
        "DVT prophylaxis: enoxaparin 40mg SC daily (unless contraindicated). SCDs. Early mobilization",
        "Pain: multimodal — paracetamol scheduled + opioids PRN. Bowel protocol with opioids!",
        "Post-op fever 5 W's: Wind (day 1-2), Water (3-5), Wound (5-7), Walk (7+), Wonder drugs (any day)",
        "Urine output: target >0.5ml/kg/h. If oliguric → fluid bolus, check Foley, assess volume status",
        "Delirium: VERY common in elderly post-op. Non-pharm first. Avoid benzos. Low-dose haloperidol 0.5mg",
        "Diet: advance as tolerated. If abdominal surgery → wait for flatus/bowel sounds",
        "Glucose control: target 140-180mg/dL (NICE-SUGAR). Insulin sliding scale + basal if diabetic",
      ],
    },
  },

  // ═══ IMMUNOSUPPRESSED / TRANSPLANT ═══
  {
    trigger: /transplant|מושתל|immunosuppres|prednisone.*chronic|tacrolimus|cyclosporine|mycophenolate|MMF|azathioprine/i,
    hint: {
      emoji: "🛡️",
      title: "חולה מדוכא חיסונית — הנחיות רקע",
      tips: [
        "Low threshold for cultures + broad-spectrum ABx. Atypical presentations common!",
        "Drug levels: check tacrolimus/cyclosporine trough if available. Drug interactions are CRITICAL",
        "DO NOT stop immunosuppression without transplant team approval (rejection risk)",
        "Stress dose steroids if on chronic prednisone and septic/surgical/critically ill",
        "Opportunistic infections: PJP (TMP-SMX prophylaxis?), CMV, fungal, TB",
        "Neutropenic precautions if WBC low. No live vaccines. Handwashing critical",
        "AKI in transplant: rejection vs drug toxicity vs infection — nephrology consult early",
      ],
    },
  },

  // ═══ DRUG OVERDOSE / INTOXICATION ═══
  {
    trigger: /overdose|OD|הרעלה|intoxication|poisoning|suicide.*attempt|ingestion|toxicology/i,
    hint: {
      emoji: "☠️",
      title: "הרעלה / OD — הנחיות רקע",
      tips: [
        "ABCs first. Stabilize before workup. Check glucose!",
        "Activated charcoal 50g PO if <1-2h from ingestion (❌ if altered MS, caustic, risk of aspiration)",
        "Toxidrome recognition: cholinergic (DUMBELS), anticholinergic, sympathomimetic, opioid, sedative-hypnotic",
        "Key antidotes: Naloxone (opioids), NAC (paracetamol), Flumazenil (benzos — ❌ if chronic use/seizure risk)",
        "Paracetamol: Rumack-Matthew nomogram. NAC if >150mg/kg or level above treatment line",
        "ECG: QRS >100ms (TCA), QTc prolongation → מוניטור",
        "Consult poison control / toxicology. Comprehensive tox screen + paracetamol + salicylate levels on everyone",
      ],
    },
  },

  // ═══ COPD with CO2 retention ═══
  {
    trigger: /CO2.*retention|co2.*retainer|היפרקפניה|hypercapn|type.*2.*respiratory|chronic.*respiratory.*failure/i,
    hint: {
      emoji: "💨",
      title: "CO2 Retention — הנחיות רקע",
      tips: [
        "O2 target 88-92%! לא 100%. Avoid high-flow O2 → worsens CO2 retention (Haldane effect + decreased respiratory drive)",
        "VBG/ABG baseline — pH, pCO2. Chronic: compensated (normal pH, high bicarb). Acute on chronic: acidotic pH",
        "BiPAP if: pH <7.35 + pCO2 >45 + respiratory distress. Settings: IPAP 10-15, EPAP 5",
        "If patient is DNI → BiPAP is ceiling of care. Document clearly!",
        "Nebulizers: Salbutamol 2.5-5mg + Ipratropium 0.5mg. Systemic steroids x5 days",
        "Failure criteria: worsening pH, rising CO2 despite max BiPAP, altered MS → intubation decision",
        "מוניטור: ABG 1-2h after starting BiPAP to assess response",
      ],
    },
  },

  // ═══ COMPARTMENT SYNDROME ═══
  {
    trigger: /compartment.*syndrome|תסמונת.*מדורים|pressure.*compartment|fasciotomy/i,
    hint: {
      emoji: "🦴",
      title: "תסמונת מדורים — הנחיות רקע",
      tips: [
        "6 P's: Pain out of proportion (earliest!), Pain on passive stretch, Pressure, Paresthesia, Pulselessness (LATE!), Paralysis (LATE!)",
        "Clinical diagnosis — don't wait for pressure measurement if high suspicion",
        "Compartment pressure >30mmHg or ΔP <30 (diastolic - compartment) = surgical emergency",
        "REMOVE ALL circumferential dressings/casts/splints immediately",
        "Ortho/surgery consult STAT → fasciotomy within 6h to prevent irreversible damage",
        "שכיח אחרי: fractures (tibia #1), crush injuries, burns, vascular injury, prolonged immobilization (elderly falls!)",
        "❌ Do not elevate — keep at heart level. Ice is controversial",
      ],
    },
  },

  // ═══ PALLIATIVE SEDATION ═══
  {
    trigger: /palliative.*sedation|סדציה.*פליאטיבית|terminal.*sedation|refractory.*symptom|midazolam.*continuous/i,
    hint: {
      emoji: "🕊️",
      title: "סדציה פליאטיבית — הנחיות רקע",
      tips: [
        "Indication: refractory symptom (pain, dyspnea, agitation) in terminal patient after all other measures failed",
        "Common regimen: Midazolam 1-2mg/h IV/SC continuous. Titrate to comfort, not to sedation depth",
        "Morphine SC 2.5-5mg q4h PRN continues alongside for pain/dyspnea",
        "Document: goals of care discussion, family consent, reason for sedation, symptoms being treated",
        "Continue comfort meds (anticholinergics for secretions: Scopolamine patch/Glycopyrrolate)",
        "STOP non-comfort meds: statins, vitamins, BP meds, glucose monitoring, antibiotics",
        "Monitoring: comfort assessment, not vital signs. Alarm silencing appropriate",
      ],
    },
  },

  // ═══ MASSIVE TRANSFUSION ═══
  {
    trigger: /massive.*transfusion|MTP|עירוי.*מסיבי|hemorrhag|דימום.*מסיבי|trauma.*bleed/i,
    hint: {
      emoji: "🩸",
      title: "עירוי מסיבי — הנחיות רקע",
      tips: [
        "MTP activation: expected need for >10U pRBC in 24h or >4U in 1h",
        "Ratio 1:1:1 — pRBC : FFP : platelets (6-pack). Don't wait for labs!",
        "TXA 1g IV over 10min → 1g over 8h (most effective if given within 3h of bleeding onset)",
        "Calcium: massive transfusion → citrate toxicity → ionized Ca drops. CaCl 1g IV or Ca gluconate 3g IV",
        "Monitor: iCa, K+, fibrinogen (replace with cryo if <1.5), pH, temp (prevent hypothermia!)",
        "Lethal triad of trauma: hypothermia + acidosis + coagulopathy. Warm everything!",
        "Type O neg blood if can't wait for crossmatch",
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
    ...(patient.planNotes ?? []),
    ...(patient.tomorrowNotes ?? []),
    ...patient.tasks.map((t) => t.text),
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

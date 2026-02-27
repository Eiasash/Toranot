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

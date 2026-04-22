
import { useState, useCallback, useRef } from "react";
import type { PatientEntry, PatientSection, PatientClinicalMeta, GoalsOfCare, SexAtBirth, BaselineMobility, BaselineCognition, LivingArrangement, AdmissionSource, IsolationType } from "../types";
import { getProxyAuthHeaders, isProxyAvailableAsync } from "../cloudSync";
import { safeGetItem } from "../utils/storage";

const API_KEY_STORAGE = "toranot-anthropic-key";
const DIRECT_API_URL = "https://api.anthropic.com/v1/messages";
import { usePatientsState, usePatientsDispatch } from "../context/PatientsContext";
import { generateId } from "../utils/id";
import { processIntake } from "../engine/admissionProcessor";

const SIDE_TO_SECTION: Record<"A" | "B" | "C" | "REHAB" | "UNKNOWN", PatientSection> = {
  A: "SIDE_A",
  B: "SIDE_B",
  C: "SIDE_C",
  REHAB: "REHAB",
  UNKNOWN: "UNKNOWN_SECTION",
};

interface Props {
  onClose: () => void;
  onSuccess?: () => void;
}

// ── Freestyle parser ──
// "2088 כהן יוסף 82 pneumonia DNR"
// "א-92 לוי שרה 75 CHF"  (short form of א-2092)
// "70 אברהם דוד 80 UTI"  (short form of 2070)
// Legacy: "49/2 כהן יוסף 82 pneumonia DNR"
export function parseFreestyle(text: string): Partial<{
  room: string;
  bed: number;
  name: string;
  age: number;
  diagnosis: string;
  status: string;
  side: "A" | "B" | "C";
}> {
  const result: ReturnType<typeof parseFreestyle> = {};
  let remaining = text.trim();

  // Extract DNR/DNI
  const statusMatch = remaining.match(/\b(DNR\s*\/?\s*DNI|DNR|DNI|FULL\s*CODE)\b/i);
  if (statusMatch) {
    const raw = statusMatch[1].toUpperCase().replace(/\s+/g, "");
    result.status = raw === "FULLCODE" ? "" : raw.replace("/", "/");
    remaining = remaining.replace(statusMatch[0], " ");
  }

  // Extract section BEFORE room — "צד א/ב/ג"
  // Must come first so "ב" in "צד ב" doesn't confuse Hebrew-letter room prefix regex
  const sectionMatch = remaining.match(/צד\s+([אבג])/);
  if (sectionMatch) {
    result.side = sectionMatch[1] === "א" ? "A" : sectionMatch[1] === "ב" ? "B" : "C";
    remaining = remaining.replace(sectionMatch[0], " ");
  }

  // Extract room — try formats in order of specificity:
  // 0. Explicit "חדר" keyword: "חדר 2114", "חדר2114"
  //    MUST come before Hebrew-letter prefix match — otherwise "ר" (end of חדר) + space + digits
  //    is mistakenly captured as a letter-prefix room (e.g. "ר-2114").
  const hedarMatch = remaining.match(/חדר\s*(\d{1,4})(?=\s|$)/);
  if (hedarMatch) {
    result.room = hedarMatch[1];
    remaining = remaining.replace(hedarMatch[0], " ");
  }

  // 0b. Monitor room: "ניטור-1", "ניטור 2", "ניטור2"
  if (!result.room) {
    const monitorMatch = remaining.match(/ניטור\s*-?\s*(\d{1,2})(?=\s|$)/);
    if (monitorMatch) {
      result.room = `ניטור-${monitorMatch[1]}`;
      remaining = remaining.replace(monitorMatch[0], " ");
    }
  }

  if (!result.room) {
    // 1. Hebrew-letter prefix: "א-92", "ב-10", "ג-15"
    //    MUST use hyphen separator only — space is too ambiguous (matches letters inside words)
    const prefixMatch = remaining.match(/([א-ת])-(\d{1,4})(?=\s|$)/);
    if (prefixMatch) {
      result.room = `${prefixMatch[1]}-${prefixMatch[2]}`;
      remaining = remaining.replace(prefixMatch[0], " ");
    } else {
      // 2. Number with Hebrew-letter suffix: "2095-א", "2095א"
      const suffixMatch = remaining.match(/(\d{1,4})[-]?([א-ת])(?=\s|$)/);
      if (suffixMatch) {
        result.room = `${suffixMatch[1]}-${suffixMatch[2]}`;
        remaining = remaining.replace(suffixMatch[0], " ");
      } else {
        // 3. Plain 4-digit room: "2088"
        const fourDigit = remaining.match(/(\d{4})(?=\s|$)/);
        if (fourDigit) {
          result.room = fourDigit[1];
          remaining = remaining.replace(fourDigit[0], " ");
        } else {
          // 4. Legacy room/bed: "49/2", "49-2"
          const roomBedMatch = remaining.match(/(\d{2,3})\s*[\/\-]\s*(\d)/);
          if (roomBedMatch) {
            result.room = roomBedMatch[1];
            result.bed = parseInt(roomBedMatch[2]);
            remaining = remaining.replace(roomBedMatch[0], " ");
          } else {
            // 5. Plain 2-3 digit room or חדר prefix: "70", "117", "חדר 70"
            const roomOnlyMatch = remaining.match(/(?:חדר\s+)?(\d{2,3})(?=\s|$)/);
            if (roomOnlyMatch) {
              result.room = roomOnlyMatch[1];
              remaining = remaining.replace(roomOnlyMatch[0], " ");
            }
            const bedMatch = remaining.match(/(?:מיטה\s+)(\d)/);
            if (bedMatch) {
              result.bed = parseInt(bedMatch[1]);
              remaining = remaining.replace(bedMatch[0], " ");
            }
          }
        }
      }
    }
  }

  // Extract age: "בת/בן X" or standalone number 50-120
  const ageHebMatch = remaining.match(/(?:בת|בן)\s+(\d{2,3})/);
  if (ageHebMatch) {
    const a = parseInt(ageHebMatch[1]);
    if (a >= 18 && a <= 120) {
      result.age = a;
      remaining = remaining.replace(ageHebMatch[0], " ");
    }
  }
  if (!result.age) {
    const ageMatch = remaining.match(/\b(\d{2,3})\b/g);
    if (ageMatch) {
      for (const m of ageMatch) {
        const a = parseInt(m);
        if (a >= 50 && a <= 120 && String(a) !== result.room) {
          result.age = a;
          remaining = remaining.replace(new RegExp(`\\b${m}\\b`), " ");
          break;
        }
      }
    }
  }

  // Remaining: Hebrew name first, then diagnosis
  remaining = remaining.replace(/\s+/g, " ").trim();

  // Limit to 1-3 Hebrew words so diagnosis isn't swallowed into name
  const hebrewNameMatch = remaining.match(/^([\u0590-\u05FF][\u0590-\u05FF'"\\-]*(?:\s+[\u0590-\u05FF][\u0590-\u05FF'"\\-]*){0,2})(?:\s|$)/);
  if (hebrewNameMatch) {
    result.name = hebrewNameMatch[1].trim();
    remaining = remaining.slice(hebrewNameMatch[0].length).trim();
  } else {
    const latinNameMatch = remaining.match(/^([A-Za-z][\w\s'\-]{1,30}[A-Za-z])/);
    if (latinNameMatch) {
      result.name = latinNameMatch[1].trim();
      remaining = remaining.slice(latinNameMatch[0].length).trim();
    }
  }

  if (remaining.trim()) {
    // Normalize multiple diagnoses: accept comma, semicolon, plus as separators
    // and join with " + " for consistent internal representation
    const dxParts = remaining.split(/\s*[,;]\s*|\s*\+\s*/).map(s => s.trim()).filter(Boolean);
    result.diagnosis = dxParts.length > 1 ? dxParts.join(" + ") : remaining.trim();
  }

  return result;
}

// Organised by category for the chip picker
const DX_CATEGORIES: { label: string; items: string[] }[] = [
  { label: "זיהום 🦠", items: ["Pneumonia", "Aspiration pneumonia", "UTI", "Urosepsis", "Sepsis", "Cellulitis", "C. diff", "COVID-19", "Cholangitis", "Endocarditis"] },
  { label: "לב ❤️", items: ["ACS", "NSTEMI", "AF with RVR", "Acute HF", "HFrEF", "HFpEF", "Hypertensive urgency", "Syncope", "PE", "DVT"] },
  { label: "ריאות 🫁", items: ["COPD exacerbation", "CO2 retention", "Pleural effusion", "Asthma", "Respiratory failure"] },
  { label: "נוירו 🧠", items: ["Delirium", "Stroke", "TIA", "Seizure", "SAH", "AMS"] },
  { label: "כליה/מטבולי 🧪", items: ["AKI", "AKI on CKD", "DKA", "HHS", "Hyponatremia", "Hyperkalemia", "Hypoglycemia"] },
  { label: "כירורגי/אורתו 🦴", items: ["Hip fracture", "GI bleed", "Bowel obstruction", "Acute abdomen", "Falls", "Calcaneal fracture"] },
  { label: "שונות", items: ["Anemia", "Malignancy", "Functional decline", "Cholecystitis", "Pancreatitis", "Liver failure"] },
];

// Common geriatric combos — one tap fills the whole diagnosis field
const DX_COMBOS = [
  "Pneumonia + AKI",
  "Sepsis + AKI",
  "COPD exacerbation + CO2 retention",
  "Acute HF + AF with RVR",
  "Pneumonia + Delirium",
  "UTI + Delirium",
  "ACS + Acute HF",
  "Hip fracture + Delirium",
  "Pleural effusion + Acute HF",
  "DKA + AKI",
  "Stroke + Aspiration pneumonia",
  "HHS + Pneumonia",
];

const COMMON_ADMISSION_MEDS = [
  "Warfarin", "Apixaban", "Rivaroxaban", "Aspirin",
  "Insulin", "Metformin", "Steroids (chronic)",
  "ACEi / ARB", "Beta-blocker", "Digoxin",
  "Furosemide", "Antiepileptics", "Opioids",
  "Benzodiazepines", "Antipsychotics",
];

// ── Quick admission templates — one-tap common geriatric patterns ──
// Each includes a realistic fictitious scenario with [placeholders] for specifics.
const QUICK_TEMPLATES: { label: string; emoji: string; diagnosis: string; source?: AdmissionSource; meta?: Partial<PatientClinicalMeta>; scenario?: string }[] = [
  {
    label: "חום ממוסד", emoji: "🏥",
    diagnosis: "Sepsis workup",
    source: "nursing_home",
    meta: { livingArrangement: "nursing_home", baselineMobility: "wheelchair", baselineCognition: "dementia" },
    scenario: "חולה עם דמנציה בבסיס, ניידות בכסא גלגלים, שוהה במוסד סיעודי [שם המוסד]. הובא/ה בגלל חום [38.5°C] מזה [X] שעות עם [שתן עכור / שיעול / פצע לחץ]. במוסד קיבל/ה [אנטיביוטיקה PO / לא טופל]. ברקע [DM / HTN / CVA], תרופות קבועות כוללות [רשימה].",
  },
  {
    label: "נפילה מהבית", emoji: "🦴",
    diagnosis: "Falls + Hip fracture workup",
    source: "ed",
    meta: { livingArrangement: "independent", baselineMobility: "walker", baselineCognition: "mci" },
    scenario: "חולה עם MCI בבסיס, מהלך/ת עם הליכון, גר/ה לבד בבית. נפל/ה [בלילה כשקם/ה לשירותים / במדרגות / בבית], מתלונן/ת על כאב ב-[ירך ימין / אגן / ראש]. במיון בוצע צילום [אגן / ירך] שהדגים [שבר צוואר ירך / תקין], וכן CT ראש [תקין / SDH קטן]. ברקע [HTN / AF / אוסטאופורוזיס], נוטל/ת [Eliquis / Coumadin / ללא נוגדי קרישה].",
  },
  {
    label: "אי ספיקת לב", emoji: "❤️",
    diagnosis: "Acute HF decompensation",
    source: "ed",
    meta: { baselineMobility: "walker" },
    scenario: "חולה עם אי ספיקת לב ידועה עם EF [30% / 45% / שמור], מהלך/ת עם הליכון, גר/ה [עם משפחה / לבד]. הגיע/ה עם קוצר נשימה מחמיר מזה [X] ימים עם בצקות רגליים ו-[PND / אורתופניאה / עלייה במשקל של X ק\"ג]. סטורציה [88%] באוויר חדר. כנראה הפסיק/ה [משתנים / לא ברור]. תרופות קבועות כוללות [Furosemide / Entresto / BB].",
  },
  {
    label: "דלקת ריאות", emoji: "🫁",
    diagnosis: "Pneumonia",
    source: "ed",
    meta: { baselineCognition: "oriented" },
    scenario: "חולה צלול/ה בבסיס, [מהלך עצמאי / עם הליכון], גר/ה ב-[בית / מוסד]. מתלונן/ת על שיעול [יבש / פרודוקטיבי] מזה [X] ימים עם חום עד [38.X°C] וקוצר נשימה. בצילום חזה נמצא [תסנין ימני / שמאלי / דו-צדדי], סטורציה [92%] באוויר חדר, CRP [120], WBC [15K]. ברקע [COPD / אי ספיקת לב / סוכרת]. אלרגיה ל-[פניצילין / אין אלרגיות ידועות].",
  },
  {
    label: "בלבול חדש", emoji: "🧠",
    diagnosis: "Delirium — workup",
    source: "ed",
    meta: { baselineCognition: "oriented" },
    scenario: "חולה צלול/ה בבסיס, [מהלך עצמאי / עם הליכון], גר/ה ב-[בית / מוסד]. פיתח/ה בלבול חדש מזה [X שעות / ימים] שמתבטא ב-[תוקפנות / אי שקט / ישנוניות חריגה]. CAM חיובי. חשד לגורם [UTI / עצירות / תרופה חדשה / כאב לא מטופל]. ברקע [דמנציה קלה / ללא ירידה קוגניטיבית ידועה], נוטל/ת [BZD / אנטיכולינרגיות / רשימת תרופות]. בבדיקות Na [X], TSH [X], B12 [X].",
  },
  {
    label: "UTI / אורוספסיס", emoji: "🦠",
    diagnosis: "UTI + Urosepsis",
    source: "ed",
    meta: { livingArrangement: "nursing_home", baselineMobility: "wheelchair", baselineCognition: "dementia" },
    scenario: "חולה עם דמנציה בבסיס, ניידות ב-[כסא גלגלים / מרותק למיטה], שוהה במוסד סיעודי. הובא/ה בגלל [חום / שתן סרוח / בלבול חדש / ירידה תפקודית]. [יש / אין] קטטר קבוע. תרבית שתן [ממתינה / הדגימה E.coli / Klebsiella]. מעבדות הדגימו CRP [X], WBC [X], Cr [X]. ברקע [UTI חוזרות / BPH / אבנים בדרכי השתן]. אלרגיות: [X / אין ידועות].",
  },
  {
    label: "AKI", emoji: "🧪",
    diagnosis: "AKI",
    source: "ed",
    meta: {},
    scenario: "חולה [צלול / MCI] בבסיס, [מהלך עצמאי / עם הליכון], גר/ה ב-[בית / מוסד]. קריאטינין עלה מ-[baseline] ל-[X] בהתאם ל-KDIGO stage [I / II / III]. הגורם החשוד הוא [התייבשות / NSAIDs / ACEi / חסימה]. תפוקת שתן [X] מ\"ל לשעה, אשלגן [X], pH [X]. נוטל/ת [ACEi / ARB / Metformin / משתנים] שהופסקו. US כליות [ממתין / הדגים הידרונפרוזיס / תקין].",
  },
  {
    label: "דימום GI", emoji: "🩸",
    diagnosis: "GI bleed",
    source: "ed",
    meta: {},
    scenario: "חולה צלול/ה בבסיס, [מהלך עצמאי / עם הליכון / כסא גלגלים], גר/ה ב-[בית / מוסד]. הגיע/ה עם [המטמזיס / מלנה / דם טרי רקטלי] מזה [X שעות / ימים]. המוגלובין [X] (ירד מ-[baseline]), INR [X]. נוטל/ת [Aspirin / Eliquis / Coumadin / ללא]. לחץ דם [X/X] עם דופק [X]. במיון קיבל/ה [עירויים / מנת דם / ללא]. גסטרוסקופיה [מתוכננת / בוצעה והדגימה X].",
  },
  {
    label: "צלוליטיס", emoji: "🔴",
    diagnosis: "Cellulitis",
    source: "ed",
    meta: {},
    scenario: "חולה צלול/ה בבסיס, [מהלך עצמאי / עם הליכון / כסא גלגלים], גר/ה ב-[בית / מוסד]. מתלונן/ת על אודם וחום מקומי ב-[רגל ימין / שמאלית / פנים] מזה [X] ימים עם חום עד [38.X°C]. גורמי סיכון כוללים [בצקות כרוניות / פטרת / פצע כרוני]. מעבדות הדגימו WBC [X] ו-CRP [X]. סומנו גבולות [כן / לא]. אלרגיה ל-[פניצילין / אין ידועות].",
  },
  {
    label: "סינקופה", emoji: "💫",
    diagnosis: "Syncope workup",
    source: "ed",
    meta: { baselineCognition: "oriented" },
    scenario: "חולה צלול/ה בבסיס, [מהלך עצמאי / עם הליכון], גר/ה בבית. חווה אירוע [התעלפות / ליפותימיה] [בקימה מהמיטה / במאמץ / ללא טריגר ברור] עם אובדן הכרה של [מספר שניות / כדקה]. [נחבל/ה בראש / ללא חבלה]. ב-ECG נמצא [SR / AF / ברדיקרדיה / בלוק]. לחץ דם בשכיבה [X/X] ובעמידה [X/X]. טרופונין [X]. נוטל/ת [BB / CCB / alpha-blockers / רשימה].",
  },
  {
    label: "DVT / PE", emoji: "🫁",
    diagnosis: "DVT/PE",
    source: "ed",
    meta: {},
    scenario: "חולה צלול/ה בבסיס, [מהלך עצמאי / כסא גלגלים / מרותק], גר/ה ב-[בית / מוסד]. הגיע/ה עם [בצקת רגל חד-צדדית / קוצר נשימה פתאומי / כאב חזה פלאוריטי]. D-dimer [X], Wells score [X]. US ורידי הדגים [DVT proximal / distal / שלילי]. CTA [הדגים PE / תקין / לא בוצע]. גורמי סיכון כוללים [חוסר תנועה ממושך / ממאירות ידועה / ניתוח לאחרונה].",
  },
  {
    label: "היפרגליקמיה", emoji: "📈",
    diagnosis: "Hyperglycemia / DKA workup",
    source: "ed",
    meta: {},
    scenario: "חולה [צלול/ה / מבולבל/ת], [מהלך עצמאי / עם הליכון], גר/ה ב-[בית / מוסד]. הגיע/ה עם סוכר [X] mg/dL. כנראה [הקיא / הפסיק אינסולין / יש זיהום חדש]. בגזים pH [X], HCO3 [X], AG [X], קטונים [חיובי / שלילי]. סוכרת סוג [1 / 2] עם HbA1c אחרון [X%]. בבית מטופל/ת ב-[Insulin / Metformin / לא מטופל]. אשלגן [X], נתרן [X].",
  },
  {
    label: "העברה ממחלקה", emoji: "🔄",
    diagnosis: "",
    source: "transfer",
    meta: {},
    scenario: "חולה מועבר/ת מ-[שם מחלקה] לאחר [ניתוח / צנתור / טיפול במצב חריף]. אושפז/ה במקור בגלל [סיבה]. בבסיס [צלול / דמנציה], ניידות [עם הליכון / כסא גלגלים]. נושאים פתוחים להמשך טיפול כוללים [אנטיביוטיקה IV ליום X מתוך Y / שיקום / המשך מעקב מעבדות].",
  },
];

const ISOLATION_OPTIONS: { value: IsolationType; label: string; color: string }[] = [
  { value: "MRSA", label: "MRSA", color: "bg-orange-500" },
  { value: "VRE", label: "VRE", color: "bg-red-500" },
  { value: "CRE", label: "CRE", color: "bg-red-700" },
  { value: "ESBL", label: "ESBL", color: "bg-amber-500" },
  { value: "COVID", label: "COVID", color: "bg-purple-500" },
  { value: "CDiff", label: "C.diff", color: "bg-yellow-600" },
  { value: "TB", label: "TB", color: "bg-pink-600" },
];

const MOBILITY_OPTIONS: { value: BaselineMobility; label: string }[] = [
  { value: "independent", label: "עצמאי" },
  { value: "walker", label: "הליכון" },
  { value: "wheelchair", label: "כסא גלגלים" },
  { value: "bedbound", label: "מרותק למיטה" },
];

const COGNITION_OPTIONS: { value: BaselineCognition; label: string }[] = [
  { value: "oriented", label: "צלול" },
  { value: "mci", label: "MCI" },
  { value: "dementia", label: "דמנציה" },
];

const LIVING_OPTIONS: { value: LivingArrangement; label: string }[] = [
  { value: "independent", label: "עצמאי" },
  { value: "with_family", label: "עם משפחה" },
  { value: "assisted_living", label: "דיור מוגן" },
  { value: "nursing_home", label: "מוסד סיעודי" },
];

const SOURCE_OPTIONS: { value: AdmissionSource; label: string }[] = [
  { value: "ed", label: "מיון" },
  { value: "community", label: "קהילה" },
  { value: "transfer", label: "העברה" },
  { value: "nursing_home", label: "מוסד" },
  { value: "rehab", label: "שיקום" },
];

// ── File → base64 helper ──
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip data URL prefix: "data:...;base64,"
      resolve(result.split(",")[1]);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

// ── DOCX text extractor (no dependency — reads raw XML from zip) ──
async function extractDocxText(file: File): Promise<string> {
  // DOCX is a zip; we unzip in browser using JSZip loaded from CDN
  try {
    const url = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js";
    if (!("JSZip" in window)) {
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement("script");
        s.src = url;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("JSZip load failed"));
        document.head.appendChild(s);
      });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const JSZip = (window as any).JSZip as { loadAsync: (data: ArrayBuffer) => Promise<{ files: Record<string, { async: (type: string) => Promise<string> }> }> };
    const ab = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(ab);
    const xml = await zip.files["word/document.xml"].async("string");
    return xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 15000);
  } catch {
    throw new Error("לא ניתן לקרוא קובץ DOCX. נסה להמיר ל-PDF.");
  }
}

// ── Structured extraction prompt ──
const EXTRACTION_SYSTEM = `You are a clinical data extraction assistant for a geriatric ward in Israel.
Extract structured information from this hospital admission letter and return ONLY valid JSON, no other text.

CRITICAL HALLUCINATION PREVENTION:
- Copy values EXACTLY as written. Do NOT interpret or reformat numbers.
- If a value is unclear, return null — never guess.
- age MUST be 18-120. Outside this range → null.
- Room format: plain number (70, 117, 2088) or with Hebrew letter prefix/suffix (א-92, 2095-א). Return as-is.
- bed: only for legacy 2-3 digit rooms with explicit bed (e.g. 49/2). For standalone room numbers → null.
- meds: only drugs explicitly named in document, max 8. Never infer unlisted drugs.
- For baseline fields: extract ONLY if explicitly stated. "מהלכת עם הליכון" → mobility "walker". If not mentioned → null.

The JSON must have this exact shape:
{
  "name": "patient full name in Hebrew or as written",
  "age": number or null,
  "diagnosis": "primary + secondary diagnoses, comma separated, concise",
  "room": "room number as string e.g. 70 or א-92 or 2088 or null",
  "bed": number or null,
  "status": "" | "DNR" | "DNI" | "DNR/DNI",
  "meds": ["list of relevant chronic/home medications, max 8"],
  "allergies": ["known drug allergies, exact names as written, empty array if none mentioned"],
  "mobility": "independent" | "walker" | "wheelchair" | "bedbound" | null,
  "cognition": "oriented" | "mci" | "dementia" | null,
  "livingArrangement": "independent" | "with_family" | "assisted_living" | "nursing_home" | null,
  "admissionSource": "ed" | "community" | "transfer" | "nursing_home" | "rehab" | null,
  "isolation": ["MRSA", "VRE", "CRE", "ESBL", "COVID", "CDiff", "TB"] or empty array,
  "morningPresentation": "Concise morning handover in English suitable for ward rounds. Format: [Name, Age] admitted [date if known] with [chief complaint]. PMH: [key comorbidities]. Presenting: [vitals/exam findings if available]. Workup: [key labs/imaging]. Assessment: [working diagnosis]. Plan: [key management steps]. Pending: [outstanding issues for morning team].",
  "remarks": "Any other clinically relevant info not captured above (e.g. social, functional status)"
}`;

interface ExtractedData {
  name?: string;
  age?: number | null;
  diagnosis?: string;
  room?: string | null;
  bed?: number | null;
  status?: "" | "DNR" | "DNI" | "DNR/DNI";
  meds?: string[];
  allergies?: string[];
  mobility?: BaselineMobility | null;
  cognition?: BaselineCognition | null;
  livingArrangement?: LivingArrangement | null;
  admissionSource?: AdmissionSource | null;
  isolation?: IsolationType[];
  morningPresentation?: string;
  remarks?: string;
}

// ── SZMC admission note generation prompt (condensed from szmc-clinical-notes skill) ──
const KABALA_SYSTEM = `You are a senior geriatric physician at Shaare Zedek Medical Center (SZMC) drafting a formal ward admission note (קבלה רפואית) in exact SZMC institutional format.

OUTPUT: Plain text only. No HTML, no markdown bold, no tables. User copies sections into EMR fields.

SECTION ORDER:
הצגת החולה → אבחנות פעילות → אבחנות ברקע → ניתוחים בעבר → תלונה עיקרית → רקע רפואי → מחלה נוכחית → רגישויות → תרופות בבית → הרגלים → תפקוד → בדיקה גופנית → בדיקות עזר → בדיקות מעבדה → דיון ותוכנית → חתימה

KEY RULES:
- Diagnoses: ALWAYS English (PNEUMONIA, AKI, DELIRIUM 02/26)
- Narrative: Hebrew, flowing prose, no bullet points
- Labs: inline prose grouped by panel (כימיה: נתרן 136, אשלגן 3.6...)
- רקע רפואי: MANDATORY. Organ-system dash headers (לבבי - / GI - / ניתוחים:)
- Problem discussion: use # Hebrew headers (# זיהומית / # כלייתית / # נוירולוגית / # תפקודית) — each is 3-6 sentences covering reasoning, workup, finding, next step
- תוכנית: bare verb list, no bullets no numbers
- Medications: Generic ( Brand Hebrew ) Route Dose Unit X Freq / Period
- תפקוד: one value per field (מגורים / עזרה / ניידות / התמצאות / הלבשה / רחצה / אכילה / מעברים / שליטה על שתן / שליטה על יציאה / הזנה)
- Padua score at end of מחלה נוכחית
- Gender agreement throughout Hebrew text
- הרגלים section always present (מעשן: לא, שימוש באלכוהול: לא, שימוש בסמים: לא)
- Goals-of-care inline in relevant problem paragraph for frail/complex patients
- Consultant recommendations attributed by name and specialty
- If data is missing, write [חסר - להשלים] — never invent clinical facts

Each section should be clearly labeled. Output the complete note ready for EMR copy-paste.`;

async function generateKabalaNote(
  file: File,
  patientContext: { name?: string; age?: number | null; diagnosis?: string; room?: string; side?: string },
): Promise<string> {
  const fileType = file.type;
  const isImage = fileType.startsWith("image/");
  const isPdf = fileType === "application/pdf";
  const isDocx = fileType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    || file.name.endsWith(".docx");

  let messageContent: unknown;
  const contextLine = [
    patientContext.name && `שם: ${patientContext.name}`,
    patientContext.age && `גיל: ${patientContext.age}`,
    patientContext.diagnosis && `אבחנה: ${patientContext.diagnosis}`,
    patientContext.room && `חדר: ${patientContext.room}`,
    patientContext.side && `צד: ${patientContext.side}`,
  ].filter(Boolean).join(", ");
  const userText = `Draft a formal SZMC geriatric ward admission note (קבלה רפואית) from this admission letter.${contextLine ? `\nPatient context: ${contextLine}` : ""}`;

  if (isImage) {
    const data = await fileToBase64(file);
    messageContent = [
      { type: "image", source: { type: "base64", media_type: fileType, data } },
      { type: "text", text: userText },
    ];
  } else if (isPdf) {
    const data = await fileToBase64(file);
    messageContent = [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data } },
      { type: "text", text: userText },
    ];
  } else if (isDocx) {
    const text = await extractDocxText(file);
    messageContent = `${userText}\n\nAdmission letter text:\n${text}`;
  } else {
    throw new Error("פורמט לא נתמך.");
  }

  const useProxy = await isProxyAvailableAsync();
  const storedKey = safeGetItem(API_KEY_STORAGE) ?? "";
  if (!useProxy && !storedKey) throw new Error("נדרש מפתח API.");

  let endpoint: string;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (useProxy) {
    endpoint = "/api/claude";
    const authHeaders = await getProxyAuthHeaders();
    if (authHeaders) Object.assign(headers, authHeaders);
  } else {
    endpoint = DIRECT_API_URL;
    headers["x-api-key"] = storedKey;
    headers["anthropic-version"] = "2023-06-01";
    headers["anthropic-dangerous-direct-browser-access"] = "true";
  }

  const body = { model: "claude-sonnet-4-6", max_tokens: 4000, system: KABALA_SYSTEM, messages: [{ role: "user", content: messageContent }] };
  const res = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`שגיאת שרת (${res.status})`);

  const data = await res.json();
  return (data?.content?.[0]?.text ?? "").trim();
}

async function extractFromLetter(
  file: File,
): Promise<ExtractedData> {
  const fileType = file.type;
  const isImage = fileType.startsWith("image/");
  const isPdf = fileType === "application/pdf";
  const isDocx = fileType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    || file.name.endsWith(".docx");

  let messageContent: unknown;

  if (isImage) {
    const data = await fileToBase64(file);
    messageContent = [
      { type: "image", source: { type: "base64", media_type: fileType, data } },
      { type: "text", text: "Extract the clinical information from this admission letter." },
    ];
  } else if (isPdf) {
    const data = await fileToBase64(file);
    messageContent = [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data } },
      { type: "text", text: "Extract the clinical information from this admission letter." },
    ];
  } else if (isDocx) {
    const text = await extractDocxText(file);
    messageContent = `Extract the clinical information from this admission letter text:\n\n${text}`;
  } else {
    throw new Error("פורמט לא נתמך. יש להשתמש ב-PDF, תמונה (JPG/PNG) או DOCX.");
  }

  const useProxy = await isProxyAvailableAsync();
  const storedKey = safeGetItem(API_KEY_STORAGE) ?? "";

  // Require either proxy auth or a locally stored API key
  if (!useProxy && !storedKey) {
    throw new Error("נדרש מפתח API. הוסף אותו בתפריט ⋯ ← הגדרות API.");
  }

  let endpoint: string;
  const headers: Record<string, string> = { "content-type": "application/json" };

  if (useProxy) {
    endpoint = "/api/claude";
    const authHeaders = await getProxyAuthHeaders();
    if (authHeaders) Object.assign(headers, authHeaders);
  } else {
    // Direct browser call with user's stored key (same fallback as Scanner / AIClinicalReasoning)
    endpoint = DIRECT_API_URL;
    headers["x-api-key"] = storedKey;
    headers["anthropic-version"] = "2023-06-01";
    headers["anthropic-dangerous-direct-browser-access"] = "true";
  }

  const body = { model: "claude-sonnet-4-6", max_tokens: 1500, system: EXTRACTION_SYSTEM, messages: [{ role: "user", content: messageContent }] };

  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    console.warn("[Toranot] /api/claude error:", res.status, err.slice(0, 200));
    if (res.status === 401) {
      throw new Error("מפתח API לא תקין — בדוק את ההגדרות בתפריט ⋯.");
    }
    if (res.status === 429) {
      throw new Error("יותר מדי בקשות — נסה שוב בעוד דקה");
    }
    if (res.status === 504) {
      throw new Error("השרת לא הגיב בזמן — נסה שוב");
    }
    throw new Error(`שגיאת שרת (${res.status}) — נסה שוב מאוחר יותר`);
  }

  const data = await res.json();
  const text = (data?.content?.[0]?.text ?? "").trim();
  
  // Strip markdown code fences if present
  const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
  
  try {
    return JSON.parse(cleaned) as ExtractedData;
  } catch {
    throw new Error("לא ניתן לנתח את התשובה. נסה שוב.");
  }
}

export function AddAdmissionModal({ onClose, onSuccess }: Props) {
  const { patients } = usePatientsState();
  const dispatch = usePatientsDispatch();

  const [freestyle, setFreestyle] = useState("");
  const [showStructured, setShowStructured] = useState(false);
  const [side, setSide] = useState<"A" | "B" | "C" | "REHAB" | "UNKNOWN">("A");
  const [room, setRoom] = useState("");
  const [bed, setBed] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [status, setStatus] = useState<"" | "DNR" | "DNI" | "DNR/DNI">("");
  const [remarks, setRemarks] = useState("");
  const [meds, setMeds] = useState<string[]>([]);
  const [allergies, setAllergies] = useState<string[]>([]);
  const [clinicalMeta, setClinicalMeta] = useState<PatientClinicalMeta>({});
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState(false);
  const [isolation, setIsolation] = useState<IsolationType[]>([]);

  // ── Diagnosis picker state ──
  const [dxSearch, setDxSearch] = useState("");
  const [activeDxCat, setActiveDxCat] = useState(0);
  const [showDxPicker, setShowDxPicker] = useState(false);

  // Split diagnosis string into parts — supports " + ", ",", ";" as separators
  const splitDxParts = (dx: string): string[] =>
    dx.split(/\s*[+,;]\s*|\s*\+\s*/).map(s => s.trim()).filter(Boolean);

  // Toggle a single diagnosis item in/out of the diagnosis string
  const toggleDx = (item: string) => {
    setDiagnosis(prev => {
      const parts = splitDxParts(prev);
      if (parts.includes(item)) return parts.filter(p => p !== item).join(" + ");
      return [...parts, item].join(" + ");
    });
  };

  // Add multiple free-text diagnoses at once (handles "pneumonia, AKI, delirium")
  const addFreeTextDx = (text: string) => {
    const newItems = splitDxParts(text).filter(Boolean);
    if (newItems.length === 0) return;
    setDiagnosis(prev => {
      const existing = splitDxParts(prev);
      const merged = [...existing];
      for (const item of newItems) {
        if (!merged.some(m => m.toLowerCase() === item.toLowerCase())) {
          merged.push(item);
        }
      }
      return merged.join(" + ");
    });
  };

  const activeDxParts = splitDxParts(diagnosis);

  // ── Letter extraction state ──
  const [letterFile, setLetterFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [morningPresentation, setMorningPresentation] = useState("");
  const [showMorning, setShowMorning] = useState(false);
  const [kabalaNote, setKabalaNote] = useState("");
  const [kabalaLoading, setKabalaLoading] = useState(false);
  const [showKabala, setShowKabala] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFreestyleParse = useCallback(() => {
    if (!freestyle.trim()) return;
    const p = parseFreestyle(freestyle);
    if (p.room) setRoom(p.room);
    if (p.bed) setBed(p.bed as 1 | 2 | 3);
    if (p.name) setName(p.name);
    if (p.age) setAge(String(p.age));
    if (p.diagnosis) setDiagnosis(p.diagnosis);
    if (p.status) setStatus(p.status as typeof status);
    if (p.side) setSide(p.side);
    setParsed(true);
    setShowStructured(true);
  }, [freestyle]);

  // ── Letter upload handler ──
  const handleLetterExtract = useCallback(async () => {
    if (!letterFile) return;
    setExtracting(true);
    setError(null);
    try {
      const extracted = await extractFromLetter(letterFile);
      
      // Auto-fill fields from extraction
      if (extracted.name) setName(extracted.name);
      // ── Validate extracted fields against physiological bounds before applying ──
      // Protects against hallucinated values: Claude may misread digits (e.g., 150 → 1.50)
      const safeAge = extracted.age != null && extracted.age >= 18 && extracted.age <= 120
        ? extracted.age : null;
      const safeBed = extracted.bed != null && [1, 2, 3].includes(extracted.bed)
        ? extracted.bed : null;
      const safeMeds = (extracted.meds ?? []).filter(
        (m): m is string => typeof m === "string" && m.trim().length > 1 && m.trim().length < 80,
      ).slice(0, 8);  // max 8 per prompt spec

      if (safeAge) setAge(String(safeAge));
      if (extracted.diagnosis) setDiagnosis(extracted.diagnosis);
      if (extracted.room) setRoom(extracted.room);
      if (safeBed) setBed(safeBed as 1 | 2 | 3);
      if (extracted.status) setStatus(extracted.status);
      if (safeMeds.length > 0) {
        setMeds(prev => Array.from(new Set([...prev, ...safeMeds])));
      }
      const safeAllergies = (extracted.allergies ?? []).filter(
        (a): a is string => typeof a === "string" && a.trim().length > 0 && a.trim().length < 80,
      ).slice(0, 10);
      if (safeAllergies.length > 0) {
        setAllergies(prev => Array.from(new Set([...prev, ...safeAllergies])));
      }
      if (extracted.remarks) {
        setRemarks(prev => prev ? `${prev}\n${extracted.remarks}` : extracted.remarks!);
      }
      if (extracted.morningPresentation) {
        setMorningPresentation(extracted.morningPresentation);
        setShowMorning(true);
      }

      // ── Geriatric baseline from letter ──
      const metaUpdate: Partial<PatientClinicalMeta> = {};
      const validMobility: BaselineMobility[] = ["independent", "walker", "wheelchair", "bedbound"];
      if (extracted.mobility && validMobility.includes(extracted.mobility)) metaUpdate.baselineMobility = extracted.mobility;
      const validCognition: BaselineCognition[] = ["oriented", "mci", "dementia"];
      if (extracted.cognition && validCognition.includes(extracted.cognition)) metaUpdate.baselineCognition = extracted.cognition;
      const validLiving: LivingArrangement[] = ["independent", "with_family", "assisted_living", "nursing_home"];
      if (extracted.livingArrangement && validLiving.includes(extracted.livingArrangement)) metaUpdate.livingArrangement = extracted.livingArrangement;
      const validSource: AdmissionSource[] = ["ed", "community", "transfer", "nursing_home", "rehab"];
      if (extracted.admissionSource && validSource.includes(extracted.admissionSource)) metaUpdate.admissionSource = extracted.admissionSource;
      if (Object.keys(metaUpdate).length > 0) setClinicalMeta(prev => ({ ...prev, ...metaUpdate }));

      const validIso: IsolationType[] = ["MRSA", "VRE", "CRE", "ESBL", "COVID", "CDiff", "TB"];
      const safeIso = (extracted.isolation ?? []).filter((i): i is IsolationType => validIso.includes(i as IsolationType));
      if (safeIso.length > 0) setIsolation(prev => Array.from(new Set([...prev, ...safeIso])));

      setShowStructured(true);
      setParsed(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בניתוח המכתב");
    } finally {
      setExtracting(false);
    }
  }, [letterFile]);

  function validate(): string | null {
    if (!side) return "יש לבחור צד";
    const r = room.trim();
    // Accept: "70", "2088", "א-92", "2095-א", "92א", legacy "49/2"
    if (!r || !/^(?:ניטור-?\d{1,2}|[א-ת][-]\d{1,4}|\d{1,4}[-]?[א-ת]|\d{1,4}|\d{2,3}\/\d)$/.test(r)) return "יש להזין מספר חדר תקין";
    if (!name.trim()) return "יש להזין שם מטופל";
    if (!diagnosis.trim()) return "יש להזין אבחנה";
    return null;
  }

  /** Is the room a standalone identifier (no separate bed needed)? Legacy format uses room/bed (49/2). */
  const isStandaloneRoom = !room.trim().includes("/");

  function isDuplicateBed(): boolean {
    // UNKNOWN_SECTION: no duplicate check (multiple unknowns are expected)
    if (side === "UNKNOWN") return false;
    const section = SIDE_TO_SECTION[side];
    const roomStr = isStandaloneRoom ? room.trim() : `${room.trim()}/${bed}`;
    return patients.some((p: PatientEntry) => p.section === section && p.room === roomStr);
  }

  function handleSubmit() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    if (isDuplicateBed()) {
      const sideLabelMap: Record<string, string> = { A: "א", B: "ב", C: "ג", REHAB: "שיקום", UNKNOWN: "לא ידוע" };
      const sideLabel = sideLabelMap[side] ?? side;
      const roomLabel = isStandaloneRoom ? room.trim() : `מיטה ${bed} בחדר ${room}`;
      setError(`${roomLabel} (צד ${sideLabel}) כבר תפוס/ה`);
      return;
    }

    const section = SIDE_TO_SECTION[side];
    const roomStr = isStandaloneRoom ? room.trim() : `${room.trim()}/${bed}`;
    const parsedAge = age.trim() ? parseInt(age.trim()) : null;

    const patient: PatientEntry = {
      id: generateId("pt-"),
      section,
      date: (() => {
        const d = new Date();
        return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
      })(),
      room: roomStr,
      name: name.trim(),
      age: parsedAge && parsedAge >= 18 && parsedAge <= 120 ? parsedAge : null,
      diagnosis: diagnosis.trim(),
      status: status ? [status] : [],
      flags: [],
      tasks: [],
      generatedTasks: [],
      tomorrowNotes: [],
      planNotes: [],
      notes: [
        ...(remarks.trim() ? [remarks.trim()] : []),
        ...(meds.length > 0 ? [`מדים: ${meds.join(", ")}`] : []),
      ],
      labs: [],
      allergies: allergies.length > 0 ? allergies : [],
      scannedAt: new Date().toISOString(),
      confidence: 1,
      order: Date.now(),
      // Morning presentation stored as handoverNote — shows in handoff sheet
      ...(morningPresentation.trim() ? { handoverNote: `📋 Morning: ${morningPresentation.trim()}` } : {}),
      clinicalMeta: (() => {
        const merged = { ...clinicalMeta, ...(isolation.length > 0 ? { isolation } : {}) };
        return Object.keys(merged).length > 0 ? merged : undefined;
      })(),
    } as PatientEntry;

    const processed = processIntake(patient);
    dispatch({ type: "NEW_ADMISSION", patient: processed });
    onSuccess?.();
    onClose();
  }

  const inputCls = "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        className="bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto p-5 space-y-4 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">קבלה חדשה</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xl px-1">×</button>
        </div>

        {error && (
          <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</div>
        )}

        {/* ── Letter upload section ── */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/40 rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">📄 מכתב קבלה</span>
            <span className="text-xs text-blue-500 dark:text-blue-400">PDF · תמונה · DOCX</span>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 px-3 py-2 text-xs border-2 border-dashed border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors truncate"
            >
              {letterFile ? `✓ ${letterFile.name}` : "📎 בחר קובץ..."}
            </button>
            {letterFile && (letterFile.type === "application/pdf" || letterFile.name.endsWith(".pdf")) && (
              <button
                type="button"
                onClick={() => {
                  const url = URL.createObjectURL(letterFile);
                  window.open(url, "_blank", "noopener");
                  // Revoke after a delay to allow the browser to load it
                  setTimeout(() => URL.revokeObjectURL(url), 30000);
                }}
                className="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg text-xs font-semibold active:bg-gray-200 whitespace-nowrap"
                title="פתח PDF לצפייה"
              >
                👁 פתח
              </button>
            )}
            <button
              type="button"
              onClick={handleLetterExtract}
              disabled={!letterFile || extracting}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold disabled:opacity-40 active:bg-blue-700 whitespace-nowrap"
            >
              {extracting ? "⏳ מנתח..." : "נתח 🤖"}
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) { setLetterFile(f); setError(null); }
            }}
          />

          {/* Morning presentation preview */}
          {morningPresentation && (
            <div className="mt-1">
              <button
                type="button"
                onClick={() => setShowMorning(v => !v)}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1"
              >
                🌅 הצגת בוקר {showMorning ? "▲" : "▼"}
              </button>
              {showMorning && (
                <div className="mt-1.5 relative">
                  <textarea
                    value={morningPresentation}
                    onChange={e => setMorningPresentation(e.target.value)}
                    rows={6}
                    dir="ltr"
                    className="w-full px-2 py-1.5 text-xs border border-blue-200 dark:border-blue-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 resize-none font-mono leading-relaxed"
                  />
                  <button
                    type="button"
                    onClick={() => { navigator.clipboard.writeText(morningPresentation).catch(() => {}); }}
                    className="absolute top-1.5 left-1.5 text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded opacity-70 hover:opacity-100"
                  >
                    העתק
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Generate formal SZMC admission note ── */}
        {letterFile && parsed && (
          <div className="bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800/40 rounded-xl p-3 space-y-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  setKabalaLoading(true);
                  setError(null);
                  try {
                    const note = await generateKabalaNote(letterFile, { name, age: age ? parseInt(age) : null, diagnosis, room, side });
                    setKabalaNote(note);
                    setShowKabala(true);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "שגיאה ביצירת קבלה");
                  } finally {
                    setKabalaLoading(false);
                  }
                }}
                disabled={kabalaLoading}
                className="flex-1 px-3 py-2 bg-teal-600 text-white rounded-lg text-xs font-semibold disabled:opacity-40 active:bg-teal-700"
              >
                {kabalaLoading ? "⏳ כותב קבלה..." : kabalaNote ? "🔄 צור מחדש" : "📝 צור קבלה רפואית"}
              </button>
              <span className="text-[10px] text-gray-400">SZMC format</span>
            </div>

            {kabalaNote && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowKabala(v => !v)}
                  className="text-xs font-semibold text-teal-600 dark:text-teal-400 flex items-center gap-1"
                >
                  📋 קבלה רפואית {showKabala ? "▲" : "▼"}
                </button>
                {showKabala && (
                  <div className="mt-1.5 relative">
                    <textarea
                      value={kabalaNote}
                      onChange={e => setKabalaNote(e.target.value)}
                      rows={12}
                      dir="rtl"
                      className="w-full px-2 py-1.5 text-xs border border-teal-200 dark:border-teal-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 resize-y leading-relaxed"
                      style={{ unicodeBidi: "plaintext" as const }}
                    />
                    <button
                      type="button"
                      onClick={() => { navigator.clipboard.writeText(kabalaNote).catch(() => {}); }}
                      className="absolute top-1.5 left-1.5 text-[10px] bg-teal-600 text-white px-1.5 py-0.5 rounded opacity-70 hover:opacity-100"
                    >
                      העתק
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Quick admission templates ── */}
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">קבלה מהירה</label>
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            {QUICK_TEMPLATES.map(t => (
              <button
                key={t.label}
                type="button"
                onClick={() => {
                  if (t.diagnosis) setDiagnosis(prev => prev ? `${prev} + ${t.diagnosis}` : t.diagnosis);
                  if (t.source) setClinicalMeta(prev => ({ ...prev, admissionSource: t.source }));
                  if (t.meta) setClinicalMeta(prev => ({ ...prev, ...t.meta }));
                  if (t.scenario) setMorningPresentation(prev => prev || t.scenario!);
                  setShowStructured(true);
                  setParsed(true);
                }}
                className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-200 whitespace-nowrap active:bg-blue-50 dark:active:bg-blue-900/30 flex-shrink-0"
              >
                <span>{t.emoji}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Freestyle input ── */}
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">הקלד חופשי — הכל בשורה אחת</label>
          <div className="flex gap-2">
            <textarea
              value={freestyle}
              onChange={(e) => { setFreestyle(e.target.value); setParsed(false); }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleFreestyleParse(); } }}
              placeholder={"70 כהן יוסף 82 pneumonia DNR"}
              dir="auto"
              rows={2}
              autoFocus
              style={{ unicodeBidi: "plaintext" as const }}
              className={`flex-1 ${inputCls} resize-none placeholder:text-gray-400`}
            />
            <button
              onClick={handleFreestyleParse}
              disabled={!freestyle.trim()}
              className="self-end px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium active:bg-blue-700 disabled:opacity-40 whitespace-nowrap"
            >
              {parsed ? "✓ נותח" : "נתח →"}
            </button>
          </div>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
            דוגמאות: &quot;70 כהן יוסף 82 pneumonia DNR&quot; · &quot;א-92 לוי שרה בת 75 CHF&quot;
          </p>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
          <button onClick={() => setShowStructured(!showStructured)} className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            {showStructured ? "▲ הסתר שדות" : "▼ ערוך שדות ידנית"}
          </button>
          <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
        </div>

        {/* ── Structured fields ── */}
        {showStructured && (
          <>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">צד *</label>
                <select value={side} onChange={(e) => setSide(e.target.value as "A" | "B" | "C" | "REHAB" | "UNKNOWN")} className={inputCls}>
                  <option value="A">צד א</option>
                  <option value="B">צד ב</option>
                  <option value="C">צד ג</option>
                  <option value="REHAB">שיקום</option>
                  <option value="UNKNOWN">לא ידוע</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">חדר *</label>
                <input type="text" inputMode="text" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="70 / א-92 / ניטור-1" className={inputCls} />
              </div>
              {!isStandaloneRoom && (
                <div className="w-24">
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">מיטה</label>
                  <select value={bed} onChange={(e) => setBed(Number(e.target.value) as 1 | 2 | 3)} className={inputCls}>
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                    <option value={3}>3</option>
                  </select>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">שם מטופל *</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="כהן יוסף" dir="auto" className={inputCls} />
              </div>
              <div className="w-20">
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">גיל</label>
                <input type="number" value={age} onChange={(e) => setAge(e.target.value)} placeholder="82" min={18} max={120} className={inputCls} />
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">אבחנה *</label>

              {/* Active diagnoses display + free-text input */}
              <div
                className={`${inputCls} min-h-[40px] flex flex-wrap gap-1 items-center cursor-text`}
                onClick={() => setShowDxPicker(true)}
              >
                {activeDxParts.map(d => (
                  <span key={d} className="inline-flex items-center gap-1 bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full">
                    {d}
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); toggleDx(d); }}
                      className="opacity-70 hover:opacity-100 font-bold leading-none"
                    >×</button>
                  </span>
                ))}
                <input
                  type="text"
                  value={dxSearch}
                  onChange={e => { setDxSearch(e.target.value); setShowDxPicker(true); }}
                  onFocus={() => { if (!dxSearch) setShowDxPicker(true); }}
                  onKeyDown={e => {
                    if ((e.key === "Enter" || e.key === ",") && dxSearch.trim()) {
                      e.preventDefault();
                      // Support typing multiple comma-separated diagnoses at once
                      const input = dxSearch.trim().replace(/[,;+]+$/, "");
                      addFreeTextDx(input);
                      setDxSearch("");
                    } else if (e.key === "Backspace" && !dxSearch && activeDxParts.length > 0) {
                      toggleDx(activeDxParts[activeDxParts.length - 1]);
                    }
                  }}
                  onBlur={() => {
                    // Auto-commit free text when user taps away — don't lose what they typed
                    if (dxSearch.trim()) {
                      const input = dxSearch.trim().replace(/[,;+]+$/, "");
                      addFreeTextDx(input);
                      setDxSearch("");
                    }
                    setTimeout(() => setShowDxPicker(false), 150);
                  }}
                  placeholder={activeDxParts.length === 0 ? "הקלד חופשי (pneumonia, AKI, delirium...)" : "+ הוסף אבחנות"}
                  className="flex-1 min-w-[80px] bg-transparent outline-none text-sm placeholder:text-gray-400"
                  dir="auto"
                />
              </div>

              {/* Combos row */}
              <div className="mt-1.5">
                <p className="text-[10px] text-gray-400 mb-1">קומבינציות נפוצות:</p>
                <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
                  {DX_COMBOS.map(combo => (
                    <button
                      key={combo}
                      type="button"
                      onClick={() => { setDiagnosis(combo); setDxSearch(""); setShowDxPicker(false); }}
                      className={"text-[10px] px-2 py-1 rounded-lg border whitespace-nowrap transition-colors flex-shrink-0 " +
                        (diagnosis === combo
                          ? "bg-purple-600 text-white border-purple-600"
                          : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 active:bg-purple-100")}
                    >
                      {combo}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quick-add free-text — tappable card when user types */}
              {dxSearch.trim() && (
                <button
                  type="button"
                  onMouseDown={e => { e.preventDefault(); addFreeTextDx(dxSearch.trim()); setDxSearch(""); setShowDxPicker(false); }}
                  className="mt-1.5 w-full text-right px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-900/40 border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 text-sm font-medium active:bg-blue-100"
                >
                  ＋ הוסף &ldquo;{dxSearch.trim()}&rdquo;
                </button>
              )}
              {/* Picker panel */}
              {showDxPicker && (
                <div className="mt-1 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 shadow-lg overflow-hidden">
                  {/* Category tabs */}
                  <div className="flex gap-0.5 overflow-x-auto p-1.5 border-b border-gray-100 dark:border-gray-700 scrollbar-hide">
                    {DX_CATEGORIES.map((cat, i) => (
                      <button
                        key={cat.label}
                        type="button"
                        onClick={() => { setActiveDxCat(i); setDxSearch(""); }}
                        className={"text-[10px] px-2 py-1 rounded-lg whitespace-nowrap transition-colors flex-shrink-0 " +
                          (activeDxCat === i
                            ? "bg-blue-600 text-white"
                            : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700")}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>

                  {/* Items */}
                  <div className="flex flex-wrap gap-1 p-2 max-h-32 overflow-y-auto">
                    {(dxSearch.trim()
                      ? DX_CATEGORIES.flatMap(c => c.items).filter(item =>
                          item.toLowerCase().includes(dxSearch.toLowerCase())
                        )
                      : DX_CATEGORIES[activeDxCat].items
                    ).map(item => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => { toggleDx(item); setDxSearch(""); }}
                        className={"text-xs px-2 py-1 rounded-full border transition-colors " +
                          (activeDxParts.includes(item)
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600 active:bg-blue-50")}
                      >
                        {activeDxParts.includes(item) ? "✓ " : ""}{item}
                      </button>
                    ))}
                  </div>

                  <div className="flex justify-between items-center px-2 py-1.5 border-t border-gray-100 dark:border-gray-700">
                    <span className="text-[10px] text-gray-400">
                      {activeDxParts.length > 0 ? activeDxParts.join(" + ") : "לא נבחרה אבחנה"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowDxPicker(false)}
                      className="text-xs text-blue-600 font-semibold px-2 py-0.5"
                    >
                      סגור ✓
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                תרופות לדגל <span className="text-gray-400">(אופציונלי)</span>
              </label>
              <div className="flex flex-wrap gap-1">
                {COMMON_ADMISSION_MEDS.map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMeds(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])}
                    className={"text-[10px] px-2 py-0.5 rounded-full border transition-colors " + (meds.includes(m) ? "bg-amber-500 text-white border-amber-500" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600")}
                  >
                    {m}
                  </button>
                ))}
              </div>
              {/* Free-text drug entry */}
              <input
                type="text"
                placeholder="תרופה אחרת... (Enter להוספה)"
                dir="auto"
                className="mt-1.5 w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 outline-none focus:border-amber-400"
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const val = (e.target as HTMLInputElement).value.trim();
                    if (val && !meds.includes(val)) setMeds(prev => [...prev, val]);
                    (e.target as HTMLInputElement).value = "";
                  }
                }}
              />
            </div>

            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">סטטוס</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={inputCls}>
                <option value="">ללא</option>
                <option value="DNR">DNR</option>
                <option value="DNI">DNI</option>
                <option value="DNR/DNI">DNR/DNI</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                אלרגיות לתרופות <span className="text-red-400 font-bold">⚠</span>
              </label>
              <input
                value={allergies.join(", ")}
                onChange={(e) => setAllergies(e.target.value.split(",").map(s => s.trim()).filter(Boolean))}
                placeholder="penicillin, sulfa, codeine..."
                dir="auto"
                className={inputCls}
              />
              {allergies.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {allergies.map((a) => (
                    <span key={a} className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700">
                      {a}
                      <button onClick={() => setAllergies(prev => prev.filter(x => x !== a))} className="mr-1 font-bold">×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">הערות</label>
              <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="הערות נוספות..." dir="auto" rows={2} className={`${inputCls} resize-none`} />
            </div>

            {/* ── Clinical metadata — resolves renal-indeterminate warnings ── */}
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-xl p-3 space-y-3">
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">⚕ נתונים קליניים (מינון כלייתי)</span>

              <div className="grid grid-cols-2 gap-3">
                {/* Sex at birth */}
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">מין ביולוגי</label>
                  <select
                    value={clinicalMeta.sexAtBirth ?? ""}
                    onChange={(e) => setClinicalMeta({ ...clinicalMeta, sexAtBirth: e.target.value as SexAtBirth || undefined })}
                    className={inputCls}
                  >
                    <option value="">לא ידוע</option>
                    <option value="male">זכר</option>
                    <option value="female">נקבה</option>
                  </select>
                </div>

                {/* Weight */}
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">משקל (ק"ג)</label>
                  <input
                    type="number"
                    min={20}
                    max={250}
                    value={clinicalMeta.weightKg ?? ""}
                    onChange={(e) => setClinicalMeta({ ...clinicalMeta, weightKg: e.target.value ? Number(e.target.value) : null })}
                    placeholder="55"
                    className={inputCls}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Goals of care */}
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">יעדי טיפול</label>
                  <select
                    value={clinicalMeta.goalsOfCare ?? ""}
                    onChange={(e) => setClinicalMeta({ ...clinicalMeta, goalsOfCare: e.target.value as GoalsOfCare || undefined })}
                    className={inputCls}
                  >
                    <option value="">טיפול רגיל</option>
                    <option value="full">טיפול מלא</option>
                    <option value="limited">טיפול מוגבל</option>
                    <option value="comfort_only">טיפול מנחם בלבד</option>
                    <option value="unknown">לא ידוע</option>
                  </select>
                </div>

                {/* Dialysis */}
                <div className="flex items-center gap-2 pt-5">
                  <input
                    id="dialysis-check"
                    type="checkbox"
                    checked={clinicalMeta.onDialysis ?? false}
                    onChange={(e) => setClinicalMeta({ ...clinicalMeta, onDialysis: e.target.checked || undefined })}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600"
                  />
                  <label htmlFor="dialysis-check" className="text-xs text-gray-700 dark:text-gray-300">דיאליזה</label>
                </div>
              </div>
            </div>

            {/* ── Geriatric baseline — תפקוד בסיסי ── */}
            <div className="bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-700/40 rounded-xl p-3 space-y-3">
              <span className="text-xs font-semibold text-teal-700 dark:text-teal-300">🏠 תפקוד בסיסי ומקור</span>

              {/* Admission source */}
              <div>
                <label className="block text-[10px] text-gray-500 dark:text-gray-400 mb-1">מקור קבלה</label>
                <div className="flex gap-1 flex-wrap">
                  {SOURCE_OPTIONS.map(o => (
                    <button key={o.value} type="button" onClick={() => setClinicalMeta(prev => ({ ...prev, admissionSource: prev.admissionSource === o.value ? undefined : o.value }))}
                      className={"text-[11px] px-2.5 py-1 rounded-lg border transition-colors " + (clinicalMeta.admissionSource === o.value ? "bg-teal-600 text-white border-teal-600" : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 active:bg-teal-50")}
                    >{o.label}</button>
                  ))}
                </div>
              </div>

              {/* Mobility */}
              <div>
                <label className="block text-[10px] text-gray-500 dark:text-gray-400 mb-1">ניידות בסיסית</label>
                <div className="flex gap-1 flex-wrap">
                  {MOBILITY_OPTIONS.map(o => (
                    <button key={o.value} type="button" onClick={() => setClinicalMeta(prev => ({ ...prev, baselineMobility: prev.baselineMobility === o.value ? undefined : o.value }))}
                      className={"text-[11px] px-2.5 py-1 rounded-lg border transition-colors " + (clinicalMeta.baselineMobility === o.value ? "bg-teal-600 text-white border-teal-600" : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 active:bg-teal-50")}
                    >{o.label}</button>
                  ))}
                </div>
              </div>

              {/* Cognition + Living arrangement row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-gray-500 dark:text-gray-400 mb-1">קוגניציה</label>
                  <div className="flex gap-1 flex-wrap">
                    {COGNITION_OPTIONS.map(o => (
                      <button key={o.value} type="button" onClick={() => setClinicalMeta(prev => ({ ...prev, baselineCognition: prev.baselineCognition === o.value ? undefined : o.value }))}
                        className={"text-[10px] px-2 py-1 rounded-lg border transition-colors " + (clinicalMeta.baselineCognition === o.value ? "bg-teal-600 text-white border-teal-600" : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600")}
                      >{o.label}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 dark:text-gray-400 mb-1">מגורים</label>
                  <div className="flex gap-1 flex-wrap">
                    {LIVING_OPTIONS.map(o => (
                      <button key={o.value} type="button" onClick={() => setClinicalMeta(prev => ({ ...prev, livingArrangement: prev.livingArrangement === o.value ? undefined : o.value }))}
                        className={"text-[10px] px-2 py-1 rounded-lg border transition-colors " + (clinicalMeta.livingArrangement === o.value ? "bg-teal-600 text-white border-teal-600" : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600")}
                      >{o.label}</button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Isolation ── */}
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                בידוד <span className="text-gray-400">(אופציונלי)</span>
              </label>
              <div className="flex gap-1.5 flex-wrap">
                {ISOLATION_OPTIONS.map(o => (
                  <button key={o.value} type="button"
                    onClick={() => setIsolation(prev => prev.includes(o.value) ? prev.filter(x => x !== o.value) : [...prev, o.value])}
                    className={"text-[11px] px-2.5 py-1 rounded-full border font-medium transition-colors " + (isolation.includes(o.value) ? `${o.color} text-white border-transparent` : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 active:bg-red-50")}
                  >{o.label}</button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button onClick={handleSubmit} className="flex-1 py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold active:bg-blue-700">
            הוסף מטופל
          </button>
          <button onClick={onClose} className="px-5 py-3 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl text-sm active:bg-gray-100 dark:active:bg-gray-700">
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}

import type { PatientEntry, Task, TaskCategory } from "../types";
import { Section, detectSectionFromHeader, detectSectionFromRoom } from "../types";
import { generateId } from "../utils/id";
import { applyRules } from "../engine/rules";

/**
 * Parse a pasted Hebrew patient list into PatientEntry objects.
 *
 * Expected format (flexible):
 *   צד א
 *   101 כהן יוסף 72 דלקת ריאות DNR NPO | משתחרר היום | בדיקת דם בבוקר
 *   102 לוי שרה 65 אי ספיקת לב | מוניטור רציף
 *   צד ב
 *   ...
 *
 * Each patient line: room name age? diagnosis? flags? | status/tasks
 */

const FLAG_PATTERN = /\b(DNR|DNI|NPO|FALL|ISO|MRSA|VRE|ESBL|C\.?\s?DIFF)\b/gi;
const URGENCY_MARKERS: Record<string, import("../types").Urgency> = {
  "דחוף": "stat",
  "סטט": "stat",
  STAT: "stat",
  "דחוף!": "stat",
  "אורגנטי": "urgent",
  "בוקר": "morning",
  "שגרה": "routine",
};

const TIME_PATTERN = /\b(\d{1,2}:\d{2})\b/;

const PLAN_DAY_REF_PATTERN =
  /\b(?:ביום\s*[א-ת]|ביום\s*(?:ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)|(?:ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת))\b/;

const PLAN_NOTE_PATTERN =
  /(פיזיו|פיזיותרפ|דיאט|תזונ|קלינאית|בליעה|ריפוי\s*בעיסוק|עו"?ס|עוס|סוציאלי|staff|סטאף|פרוטוקול|לפי\s*הצורך|prn|להמשיך|המשך|שיקום|פצע|טיפול\s*פצע|פיזיותרפיה|דיבור)/i;

const PLAN_STRONG_ORDER_PATTERN =
  /(?:\bCT\b|\bUS\b|\bMRI\b|\bECHO\b|דימות|צילום|ב"?ד|בדיקת\s*דם|מעבדה|גזים|\bBS\b|Bladder\s*Scan|קטטר|פולי|להזמין|לבצע|למדוד|לשלוח|לתת\s|אנטיביוטיקה|ואנקו|vanco|מרופנם)/i;

const PLAN_URGENCY_PATTERN =
  /(דחוף|סטט|asap|urgent|עכשיו)/i;

function isPlanNote(text: string): boolean {
  const lower = text.toLowerCase();
  if (PLAN_URGENCY_PATTERN.test(lower)) return false;
  const hasDayRef = PLAN_DAY_REF_PATTERN.test(text);
  const hasPlanWords = PLAN_NOTE_PATTERN.test(text);
  if (!(hasDayRef || hasPlanWords)) return false;
  if (PLAN_STRONG_ORDER_PATTERN.test(text)) return false;
  return true;
}

function detectUrgency(text: string): import("../types").Urgency {
  const lower = text.toLowerCase();
  for (const [marker, urgency] of Object.entries(URGENCY_MARKERS)) {
    if (lower.includes(marker.toLowerCase()) || text.includes(marker)) {
      return urgency;
    }
  }
  return "routine";
}

function extractTime(text: string): string | null {
  const match = text.match(TIME_PATTERN);
  return match ? match[1] : null;
}

function extractFlags(text: string): { flags: string[]; cleaned: string } {
  const flags: string[] = [];
  const cleaned = text.replace(FLAG_PATTERN, (match) => {
    flags.push(match.toUpperCase().replace(/\s/g, ""));
    return "";
  });
  return { flags, cleaned: cleaned.trim() };
}

function classifyTaskCategory(text: string): TaskCategory | undefined {
  if (/\bCT\b|\bUS\b|דימות|צילום/i.test(text)) return "imaging";
  if (/ב"ד|בדיקת דם|מעבדה/i.test(text)) return "labs";
  if (/\bBS\b|Bladder\s*Scan|קטטר|פולי/i.test(text)) return "procedure";
  if (/שחרור|מכתב שחרור|סיכום/i.test(text)) return "discharge";
  if (/ייעוץ|שיחה/i.test(text)) return "consult";
  return undefined;
}

function parseAge(token: string): number | null {
  const n = parseInt(token, 10);
  return !isNaN(n) && n > 0 && n < 150 ? n : null;
}

function isSectionHeader(line: string): Section | null {
  return detectSectionFromHeader(line);
}

function parsePatientLine(
  line: string,
  section: Section,
  date: string,
): PatientEntry | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length < 3) return null;

  // Split by | to separate segments: main info | status/tasks
  const segments = trimmed.split("|").map((s) => s.trim());
  const mainPart = segments[0];
  const extraParts = segments.slice(1);

  // Extract flags from the main part
  const { flags, cleaned } = extractFlags(mainPart);

  // Tokenize the cleaned main part
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;

  // First token(s): room/bed code (supports 49-3, 55/1, ניטור-1, ניטור 1, etc.)
  let room: string | null = null;
  let idx = 0;

  const ROOM_PATTERN =
    /^(?:\d{1,4}[-/]\d{1,2}|\d{1,4}[א-ת]?|ניטור[-]?\d{1,2}|חדר[-]?\d{1,3})$/;

  if (ROOM_PATTERN.test(tokens[0])) {
    room = tokens[0];
    idx = 1;
  } else if (
    /^(?:ניטור|חדר)$/.test(tokens[0]) &&
    tokens.length > 1 &&
    /^\d{1,3}$/.test(tokens[1])
  ) {
    // Handle "ניטור 1" as two tokens
    room = `${tokens[0]} ${tokens[1]}`;
    idx = 2;
  }

  // Collect name tokens (Hebrew characters)
  const nameTokens: string[] = [];
  while (idx < tokens.length && /^[א-ת\-']+$/.test(tokens[idx])) {
    nameTokens.push(tokens[idx]);
    idx++;
  }
  const name = nameTokens.length > 0 ? nameTokens.join(" ") : null;

  // Next token: age?
  let age: number | null = null;
  if (idx < tokens.length) {
    age = parseAge(tokens[idx]);
    if (age !== null) idx++;
  }

  // Remaining tokens in main part = diagnosis
  const diagTokens = tokens.slice(idx);
  const diagnosis = diagTokens.length > 0 ? diagTokens.join(" ") : null;

  const finalSection: Section = section;

  // Parse extra segments into status, tasks, tomorrowNotes, planNotes
  const status: string[] = [];
  const tasks: Task[] = [];
  const tomorrowNotes: string[] = [];
  const planNotes: string[] = [];

  for (const rawPart of extraParts) {
    const part = rawPart.trim();
    if (!part) continue;

    // Explicit תורן: label → tasks
    const toranMatch = part.match(/^(?:תורן)\s*[:\-]\s*(.*)$/);
    if (toranMatch) {
      const body = toranMatch[1].trim();
      if (body) {
        for (const chunk of body.split(/\s*[;\n•]+\s*/).map((c) => c.trim()).filter(Boolean)) {
          tasks.push({
            id: generateId("task-"),
            text: chunk,
            urgency: detectUrgency(chunk),
            category: classifyTaskCategory(chunk),
            source: "extracted",
            done: false,
            doneTime: null,
            time: extractTime(chunk),
            confidence: 0.9,
          });
        }
      }
      continue;
    }

    // Explicit מחר: label → tomorrowNotes
    const macharMatch = part.match(/^(?:מחר)\s*[:\-]\s*(.*)$/);
    if (macharMatch) {
      const body = macharMatch[1].trim();
      if (body) {
        for (const chunk of body.split(/\s*[;\n•]+\s*/).map((c) => c.trim()).filter(Boolean)) {
          tomorrowNotes.push(chunk);
        }
      }
      continue;
    }

    // Real tomorrow indicators (מחר / בבוקר) → tomorrowNotes
    const implicitMachar = /\bמחר\b|\bלבוקר\b|\bבבוקר\b/.test(part);
    if (implicitMachar) {
      tomorrowNotes.push(part.replace(/^מחר\s*[:\-]?\s*/, "").trim() || part);
      continue;
    }

    // Explicit plan prefix (תוכנית / תכנון / הערכה / סטאף / staff) → planNotes
    const planPrefix = part.match(/^(?:תוכנית|תכנון|הערכה|סטאף|staff)\s*[:\-]\s*(.*)/i);
    if (planPrefix) {
      const body = planPrefix[1].trim();
      const chunks = (body || part).split(/\s*[;\n•]+\s*/).map((c) => c.trim()).filter(Boolean);
      for (const chunk of chunks) planNotes.push(chunk);
      continue;
    }

    // Plan-ish heuristic (physio, diet, speech, PRN, day-of-week, etc.) → planNotes
    if (isPlanNote(part)) {
      planNotes.push(part);
      continue;
    }

    // Actionable task heuristic
    const isTask =
      /(?:בדיק|ב"ד|CT|US|\bBS\b|Bladder\s*Scan|תור |לתת |להזמין|לבצע|למדוד|לשלוח|טיפול|ניקוז|עירוי|צילום|דימות|ייעוץ|שיחה|א\.?ק\.?ג)/i.test(
        part,
      );
    if (isTask) {
      tasks.push({
        id: generateId("task-"),
        text: part,
        urgency: detectUrgency(part),
        category: classifyTaskCategory(part),
        source: "extracted",
        done: false,
        doneTime: null,
        time: extractTime(part),
        confidence: 0.8,
      });
    } else {
      status.push(part);
    }
  }

  // Also extract any extra flags from extra parts
  for (const part of extraParts) {
    const { flags: extraFlags } = extractFlags(part);
    flags.push(...extraFlags);
  }

  const confidence =
    (room ? 0.25 : 0) +
    (name ? 0.35 : 0) +
    (age ? 0.1 : 0) +
    (diagnosis ? 0.2 : 0) +
    0.1;

  const entry: PatientEntry = {
    id: generateId("pt-"),
    section: finalSection,
    date,
    room,
    name,
    age,
    diagnosis,
    flags: [...new Set(flags)],
    status,
    tomorrowNotes,
    planNotes,
    tasks,
    generatedTasks: [],
    notes: [],
    scannedAt: new Date().toISOString(),
    confidence: Math.min(confidence, 1),
  };

  // Apply rule engine
  entry.generatedTasks = applyRules(entry);

  return entry;
}

export function parsePatientList(text: string): PatientEntry[] {
  const lines = text.split("\n");
  const patients: PatientEntry[] = [];
  let currentSection: Section = "SIDE_A";
  const today = new Date();
  const date = `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check if this is a section header
    const section = isSectionHeader(trimmed);
    if (section) {
      currentSection = section;
      continue;
    }

    // Try to parse as patient line
    const patient = parsePatientLine(trimmed, currentSection, date);
    if (patient) {
      patient.order = patients.length;
      patients.push(patient);
    }
  }

  return patients;
}

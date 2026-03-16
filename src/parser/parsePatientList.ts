import type { PatientEntry, Task, TaskCategory } from "../types";
import { type PatientSection, detectSectionFromHeader, detectSectionFromRoom } from "../types";
import { generateId } from "../utils/id";
import { applyRules } from "../engine/rules";

/** Strip Unicode BiDi control characters that invisibly break Hebrew regex matching.
 *  RTL markers (U+200F, U+200E), embedding chars (U+202A–U+202E), and isolates
 *  (U+2066–U+2069) are commonly injected by WhatsApp and iOS clipboard.
 */
function stripBidi(text: string): string {
  return text.replace(/[‎‏‪-‮⁦-⁩﻿]/g, "");
}

/**
 * Pre-parser normalization shim.
 *
 * Applied ONCE to the raw input before any parsing.
 * Corrects character-level noise that would silently break the parser:
 *
 *   - NFC normalization (composed form — consistent diacritic handling)
 *   - BiDi control character stripping (WhatsApp / iOS clipboard artifacts)
 *   - Broken-bar / box-drawing / fullwidth pipe variants → ASCII |
 *   - Em dash / en dash / minus-like variants → ASCII hyphen-minus
 *   - Smart/curly quotes → straight ASCII quotes
 *   - Non-breaking spaces → regular space (U+00A0 common in Word pastes)
 *   - Tabs → single space
 *   - Multiple consecutive spaces → single space
 *   - Windows/old-Mac line endings → Unix LF
 *   - Three or more consecutive blank lines → two blank lines
 *   - Unambiguous per-line OCR corruptions of section headers only:
 *       "!ד א/ב/ג" (צ → !) and "ד א/ב/ג" (צ dropped) on a line by themselves.
 *     These are already handled by SECTION_ALIASES so this is a belt-and-suspenders
 *     normalisation that makes the raw text easier to inspect in debug logs.
 *
 * Invariants:
 *   - Output is always a string.
 *   - Never throws.
 *   - Never silently removes a patient row — only normalises whitespace/punctuation.
 *   - UNKNOWN_SECTION fallback is unaffected; section assignment is NOT guessed here.
 */
export function normalizeWardText(raw: string): string {
  // 1. NFC — composed Unicode form; consistent diacritics
  let text = raw.normalize("NFC");

  // 2. BiDi control characters
  text = stripBidi(text);

  // 3. Separator variants → ASCII pipe |
  //    ¦ U+00A6 BROKEN BAR (common OCR substitution for |)
  //    │ U+2502 BOX DRAWINGS LIGHT VERTICAL
  //    ǀ U+01C0 LATIN LETTER DENTAL CLICK
  //    ｜ U+FF5C FULLWIDTH VERTICAL LINE
  text = text.replace(/[¦│ǀ｜]/g, "|");

  // 4. Dash variants → ASCII hyphen-minus (used in room numbers: 49-3, א-92, ניטור-1)
  //    — U+2014 EM DASH   – U+2013 EN DASH   ‒ U+2012 FIGURE DASH
  //    ― U+2015 HORIZONTAL BAR   ‑ U+2011 NON-BREAKING HYPHEN
  //    − U+2212 MINUS SIGN
  text = text.replace(/[—–‒―‑−]/g, "-");

  // 5. Smart / curly quotes → straight ASCII
  text = text.replace(/[\u201C\u201D\u201E\u201F]/g, '"').replace(/[\u2018\u2019\u201A\u201B]/g, "'");

  // 6. Non-breaking space (U+00A0) → regular space
  text = text.replace(/\u00A0/g, " ");

  // 7. Tabs → space
  text = text.replace(/\t/g, " ");

  // 8. Collapse multiple consecutive spaces → single space (preserve newlines)
  text = text.replace(/[^\S\n]{2,}/g, " ");

  // 9. Line ending normalisation: CRLF → LF, lone CR → LF
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // 10. Collapse 3+ consecutive blank lines → 2 blank lines
  //     (preserves intentional double-blank section separators)
  text = text.replace(/\n{3,}/g, "\n\n");

  // 11. Per-line OCR section header corrections
  //     Only applied when the ENTIRE trimmed line matches the corruption pattern.
  //     Conservative: never modifies lines that could be patient rows.
  //     The SECTION_ALIASES table also handles these — this is belt-and-suspenders.
  const correctedLines = text.split("\n").map((line) => {
    const t = line.trim();
    // "!ד א" / "!ד ב" / "!ד ג" — OCR replaces צ with !
    if (/^!ד\s+[אבג]$/.test(t)) return t.replace("!ד", "צד");
    // "ד א" / "ד ב" / "ד ג" — OCR drops the צ entirely
    // Guard: must be ONLY two Hebrew characters separated by a space — not a patient line.
    if (/^ד\s+[אבג]$/.test(t)) return "צ" + t;
    return line;
  });
  text = correctedLines.join("\n");

  return text;
}

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

// Unicode-safe "מחר" word boundary — \b does not work with Hebrew characters.
// Matches "מחר" at start/end of string or surrounded by whitespace/punctuation,
// but NOT inside longer words like "מחרוזת".
const MACHAR_WORD = /(^|[\s,;•\-\(\)\[\]])מחר(?=$|[\s,;•:.\-!\?\)\]\(])/;

// Orphan line matcher: short lines that appear between patient rows in OCR output.
// These are typically left-column artifacts (ABG, BiPAP, blood products, vitals)
// that belong to the NEXT patient in the list. Only used when the line:
//   (a) does NOT parse as a patient row, (b) is short (<=35 chars),
//   (c) matches this pattern, and (d) is followed by a valid patient line.
const ORPHAN_TO_NEXT_PATIENT_PATTERN = new RegExp(
  [
    // Blood products / transfusion
    String.raw`מנת\s*דם`,
    String.raw`עירוי`,
    String.raw`transfusion`,
    String.raw`\bPRBC\b`,
    String.raw`\bFFP\b`,
    String.raw`\bRBC\b`,
    String.raw`טסיות`,
    String.raw`\bplatelets?\b`,

    // Respiratory / ABG / oxygen support
    String.raw`\bABG\b`,
    String.raw`גזים`,
    String.raw`גזים\s*דם`,
    String.raw`סטורציה`,
    String.raw`\bBiPAP\b`,
    String.raw`\bCPAP\b`,
    String.raw`חמצן`,
    String.raw`שקילה\s*סטורציה`,

    // Common nursing/monitoring fragments that appear alone
    String.raw`דם\s*ו(?:שתן|סטיק)`,
    String.raw`מדדים`,
    String.raw`לחץ\s*דם`,
    String.raw`סוכר`,
    String.raw`\bBS\b`,
    String.raw`Bladder\s*Scan`,

    // Diuretics that often appear as orphan notes
    String.raw`פוסיד`,
    String.raw`\bLasix\b`,
  ].join("|"),
  "i"
);

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

function isSectionHeader(line: string): PatientSection | null {
  return detectSectionFromHeader(line);
}

function parsePatientLine(
  line: string,
  section: PatientSection,
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

  // First token(s): room/bed code
  // New SZMC format: plain numbers (70, 117, 120) or Hebrew-letter prefix (א-92, א-95)
  // Legacy format: 49-3, 55/1, ניטור-1, ניטור 1, חדר-12
  let room: string | null = null;
  let idx = 0;

  const ROOM_PATTERN =
    /^(?:\d{1,4}[-/]\d{1,2}|[א-ת][-]\d{1,3}|\d{1,4}[-]?[א-ת]|\d{1,4}|ניטור[-]?\d{1,2}|חדר[-]?\d{1,3})$/;

  if (ROOM_PATTERN.test(tokens[0])) {
    room = tokens[0];
    idx = 1;
  } else if (
    // Handle "א 92" as two tokens → "א-92" (Hebrew letter prefix + number)
    /^[א-ת]$/.test(tokens[0]) &&
    tokens.length > 1 &&
    /^\d{1,3}$/.test(tokens[1]) &&
    // Must NOT be a section header keyword (ניטור, חדר already handled above)
    !/^(?:ב|ג)$/.test(tokens[0]) // avoid swallowing "ב" / "ג" from section headers
  ) {
    room = `${tokens[0]}-${tokens[1]}`;
    idx = 2;
  } else if (
    // Handle "2095 א" as two tokens (number + Hebrew letter suffix)
    /^\d{1,4}$/.test(tokens[0]) &&
    tokens.length > 1 &&
    /^[א-ת]$/.test(tokens[1])
  ) {
    room = `${tokens[0]}-${tokens[1]}`;
    idx = 2;
  } else if (
    /^(?:ניטור|חדר)$/.test(tokens[0]) &&
    tokens.length > 1 &&
    /^\d{1,4}$/.test(tokens[1])
  ) {
    // Handle "ניטור 1" or "חדר 2000" as two tokens
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

  // A valid patient line needs at least a room or a name.
  // Lines like "ABG" or "BiPAP" have neither — they're orphan fragments, not patients.
  // Lines with only a Hebrew name but no room (like "מנת דם", "סטורציה") are also
  // not real patients — in OCR ward lists, every patient has a room number.
  if (!room) return null;

  // Next token: age?
  let age: number | null = null;
  if (idx < tokens.length) {
    age = parseAge(tokens[idx]);
    if (age !== null) idx++;
  }

  // Remaining tokens in main part = diagnosis
  const diagTokens = tokens.slice(idx);
  const diagnosis = diagTokens.length > 0 ? diagTokens.join(" ") : null;

  const finalSection: PatientSection = section;

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

    // Real tomorrow indicators (מחר / בבוקר / לבוקר) → tomorrowNotes
    // Uses MACHAR_WORD for Unicode-safe Hebrew word boundary detection.
    // Note: \b doesn't work with Hebrew. MACHAR_WORD handles מחר correctly.
    // בבוקר/לבוקר use \b which is known-broken for Hebrew but left as-is
    // to preserve existing routing semantics (they route to planNotes, not tomorrowNotes).
    const implicitMachar = MACHAR_WORD.test(part) || /\bלבוקר\b|\bבבוקר\b/.test(part);
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

    // ──────────────────────────────────────────────────────────────
    // GOLDEN RULE: Only explicitly marked תורן: items become tasks.
    // Everything else is informational (planNotes or status).
    // This prevents morning-team orders, nursing tasks, and general
    // plans from cluttering the on-call task list.
    // ──────────────────────────────────────────────────────────────

    // If it looks like a clinical order/action but wasn't under תורן: → planNotes
    const looksActionable =
      /(?:בדיק|ב"ד|CT|US|\bBS\b|Bladder\s*Scan|תור |לתת |להזמין|לבצע|למדוד|לשלוח|טיפול|ניקוז|עירוי|צילום|דימות|ייעוץ|שיחה|א\.?ק\.?ג|ABG|BiPAP|CPAP|גזים|אנטיביוטיקה)/i.test(
        part,
      );
    if (looksActionable) {
      planNotes.push(part);
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
  text = normalizeWardText(text);
  const lines = text.split("\n");
  const patients: PatientEntry[] = [];
  let currentSection: PatientSection = "UNKNOWN_SECTION";
  const today = new Date();
  const date = `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`;

  // Buffer for orphan lines (short non-patient lines between patient rows).
  // Flushed into the NEXT patient that successfully parses.
  const pendingOrphans: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check if this is a section header
    const section = isSectionHeader(trimmed);
    if (section) {
      currentSection = section;
      // Section headers discard pending orphans (they belong to the previous section)
      pendingOrphans.length = 0;
      continue;
    }

    // Try to parse as patient line first
    const patient = parsePatientLine(trimmed, currentSection, date);
    if (patient) {
      // Flush any pending orphan lines into this patient as tasks
      for (const orphan of pendingOrphans) {
        patient.tasks.push({
          id: generateId("task-"),
          text: orphan,
          urgency: detectUrgency(orphan),
          category: classifyTaskCategory(orphan),
          source: "extracted",
          done: false,
          doneTime: null,
          time: extractTime(orphan),
          confidence: 0.7,
        });
      }
      pendingOrphans.length = 0;
      // Re-run rules AFTER flushing orphans so rule engine sees them
      // (orphans were added after initial applyRules in parsePatientLine)
      if (patient.tasks.length > 0) {
        patient.generatedTasks = applyRules(patient);
      }
      patient.order = patients.length;
      patients.push(patient);
    } else {
      // Line didn't parse as patient — check if it's a short orphan fragment
      // (ABG, BiPAP, מנת דם, etc.) that belongs to the next patient.
      const looksShort = trimmed.length <= 35;
      if (looksShort && ORPHAN_TO_NEXT_PATIENT_PATTERN.test(trimmed)) {
        pendingOrphans.push(trimmed);
      }
      // else: silently drop (noise, long paragraphs, unknown lines)
    }
  }

  return patients;
}

/**
 * Ward list text generator for fuzz testing.
 *
 * Generates synthetic Hebrew ward lists that match the format expected by
 * parsePatientList(). Used in three modes:
 *   1. Round-trip: generate structured patients → render text → parse → compare
 *   2. Mutation: take valid text and introduce realistic format drift
 *   3. Seed corpus: a set of pre-baked realistic ward list strings
 */

import type { PatientEntry, PatientSection } from "../../types";

// ─── Deterministic PRNG (seeded for reproducible test runs) ──────────────────

export function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

// ─── Data tables ──────────────────────────────────────────────────────────────

const HEBREW_FIRST = ["כהן", "לוי", "מזרחי", "פרץ", "ביטון", "אברהם", "דוד", "יוסף", "שמעון"];
const HEBREW_LAST  = ["שרה", "מרים", "רחל", "לאה", "דינה", "יעל", "נועה", "תמר", "חוה"];
const DIAGNOSES    = [
  "דלקת ריאות", "אי ספיקת לב", "ירידה בהכרה", "דלקת דרכי שתן",
  "כאב בית חזה", "היפוגליקמיה", "CVA חריף", "מחלת ריאות חסימתית",
  "פרפור פרוזדורים", "AKI על רקע CKD",
];
const FLAGS        = ["DNR", "DNI", "NPO", "FALL", "ISO", "MRSA"];
const SECTION_HEADERS: Record<PatientSection, string[]> = {
  SIDE_A:          ["צד א", "צד א", "צד א:"],
  SIDE_B:          ["צד ב", "צד ב:"],
  SIDE_C:          ["צד ג", "צד ג:"],
  REHAB:           ["שיקום", "שיקומי"],
  MONITOR:         ["ניטור", "מוניטור"],
  UNKNOWN_SECTION: [],
};

// ─── Random patient generator ─────────────────────────────────────────────────

export function generatePatients(rng = seededRng(42), count = 5): PatientEntry[] {
  const patients: PatientEntry[] = [];
  const sections: PatientSection[] = ["SIDE_A", "SIDE_B", "SIDE_C", "REHAB"];
  let roomCounter = 100;

  for (let i = 0; i < count; i++) {
    const section = sections[Math.floor(rng() * sections.length)];
    const name = `${HEBREW_FIRST[Math.floor(rng() * HEBREW_FIRST.length)]} ${HEBREW_LAST[Math.floor(rng() * HEBREW_LAST.length)]}`;
    const age = 65 + Math.floor(rng() * 35);
    const diagnosis = DIAGNOSES[Math.floor(rng() * DIAGNOSES.length)];
    const flags = rng() > 0.7 ? [FLAGS[Math.floor(rng() * FLAGS.length)]] : [];
    const room = String(roomCounter++);

    patients.push({
      id: `fuzz-${i}`,
      section,
      date: "01/01/2025",
      room,
      name,
      age,
      diagnosis,
      flags,
      status: [],
      tomorrowNotes: [],
      tasks: [],
      generatedTasks: [],
      notes: [],
      scannedAt: "2025-01-01T08:00:00.000Z",
      confidence: 1,
    });
  }
  return patients;
}

// ─── Ward list text renderer ──────────────────────────────────────────────────

/**
 * Render a patient list to the text format expected by parsePatientList().
 * Groups patients by section, emitting a section header for each group.
 */
export function renderWardList(patients: PatientEntry[]): string {
  // Group by section
  const groups = new Map<PatientSection, PatientEntry[]>();
  for (const p of patients) {
    if (p.section === "UNKNOWN_SECTION") continue;
    const arr = groups.get(p.section) ?? [];
    arr.push(p);
    groups.set(p.section, arr);
  }

  const lines: string[] = [];
  for (const [section, pts] of groups) {
    const headers = SECTION_HEADERS[section];
    if (headers.length > 0) lines.push(headers[0]);
    for (const p of pts) {
      const parts: string[] = [];
      if (p.room) parts.push(p.room);
      if (p.name) parts.push(p.name);
      if (p.age) parts.push(String(p.age));
      if (p.diagnosis) parts.push(p.diagnosis);
      if (p.flags.length > 0) parts.push(p.flags.join(" "));
      lines.push(parts.join(" "));
    }
  }
  return lines.join("\n");
}

// ─── Normalizer (for round-trip comparison) ───────────────────────────────────

/** Strip fields that are legitimately not preserved through parse (order, id, etc.) */
export function normalizeForCompare(patients: PatientEntry[]) {
  return patients.map((p) => ({
    section: p.section,
    room: p.room,
    name: p.name,
    age: p.age,
    diagnosis: p.diagnosis,
    flags: [...p.flags].sort(),
  })).sort((a, b) => (a.room ?? "").localeCompare(b.room ?? ""));
}

// ─── Mutation engine ──────────────────────────────────────────────────────────

type Mutator = (text: string, rng: () => number) => string;

const MUTATORS: Mutator[] = [
  // Separator drift: | → — (common in WhatsApp copy-paste)
  (t) => t.replace(/\|/g, "—"),
  // OCR corruption: צ → ! (scanner artifact)
  (t) => t.replace(/צ/g, "!"),
  // Extra blank lines (copy from PDF)
  (t) => t.replace(/\n/g, "\n\n"),
  // Whitespace collapse (Excel export)
  (t) => t.replace(/ {2,}/g, " "),
  // Trailing spaces on headers
  (t) => t.replace(/\n(צד [אבג])/g, "\n$1  "),
  // Non-breaking space (Word paste)
  (t) => t.replace(/ /g, "\u00A0"),
  // Room format drift: "101" → "101/1"
  (t) => t.replace(/^(\d{3})\b/gm, "$1/1"),
  // Mixed separator: some | some —
  (t, rng) => t.replace(/\|/g, () => rng() > 0.5 ? "|" : "—"),
  // Missing room (OCR skipped the number)
  (t) => t.replace(/^(\d{3}) /m, ""),
  // Extra header separator
  (t) => t.replace(/(צד [אבג])/g, "$1:"),
];

/**
 * Apply one random mutation to the input text.
 * The mutation is always minor — "almost valid" inputs, not garbage.
 */
export function mutateWardList(text: string, rng = seededRng(99)): string {
  const mutator = MUTATORS[Math.floor(rng() * MUTATORS.length)];
  return mutator(text, rng);
}

// ─── Seed corpus ──────────────────────────────────────────────────────────────

/** A set of realistic ward list strings for mutation fuzzing seed corpus. */
export const SEED_CORPUS: string[] = [
  // Minimal valid list
  `צד א
101 כהן יוסף 78 דלקת ריאות
102 לוי שרה 85 אי ספיקת לב DNR`,

  // Two sections
  `צד א
101 כהן יוסף 78 דלקת ריאות
102 לוי שרה 85 אי ספיקת לב
צד ב
201 מזרחי דוד 72 AKI
202 פרץ מרים 90 CVA DNI`,

  // With pipes
  `צד א
101 כהן יוסף 78 דלקת ריאות | DNR NPO | לבוקר בדיקת דם
102 לוי שרה 85 אי ספיקת לב | תורן: שקילה`,

  // Rehab section
  `שיקום
301 דוד שרה 82 שבר צוואר ירך | פיזיו בבוקר`,

  // Monitor rooms
  `ניטור
ניטור 1 אברהם רחל 75 פרפור פרוזדורים
ניטור 2 יוסף לאה 68 ACS`,

  // Leading/trailing whitespace noise
  `  צד א  
  101 כהן יוסף 78   דלקת ריאות  
  102 לוי שרה 85 אי ספיקת לב  `,

  // Mixed flags and tasks
  `צד ג
401 מזרחי דינה 91 היפוגליקמיה DNR NPO | תורן: BS q4h | מחר: ייעוץ דיאטה`,
];

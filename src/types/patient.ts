// Single source of truth for your top-level navigation sections.
// "Rehab" is NOT a filter. It's its own section.

export const SECTIONS = ["SIDE_A", "SIDE_B", "SIDE_C", "REHAB", "MONITOR"] as const;
export type Section = (typeof SECTIONS)[number];

export const SECTION_LABEL: Record<Section, string> = {
  SIDE_A: "צד א",
  SIDE_B: "צד ב",
  SIDE_C: "צד ג",
  REHAB: "שיקום",
  MONITOR: "ניטור",
};

export type Urgency = "stat" | "urgent" | "morning" | "routine";

export type TaskCategory =
  | "labs"
  | "imaging"
  | "meds"
  | "consult"
  | "procedure"
  | "discharge"
  | "other";

export type TaskSource = "extracted" | "manual" | "generated";

export type Task = {
  id: string;
  text: string; // exact text as written
  urgency: Urgency;
  category?: TaskCategory;
  source: TaskSource;
  done: boolean;
  doneTime: string | null; // ISO string or null
  time: string | null; // "16:30" if present, else null
  confidence: number; // 0..1
  generatedFrom?: string; // e.g., "משתחרר היום"

  // Manual remark/result, e.g. "BS 250ml" / "Called family" / etc.
  // Optional for backwards compatibility with old localStorage.
  note?: string | null;
};

export type PatientEntry = {
  id: string; // stable key (room+name hash)
  section: Section; // SIDE_A / SIDE_B / SIDE_C / REHAB / MONITOR
  date: string; // "DD/MM/YYYY"
  room: string | null;
  name: string | null;
  age: number | null;
  diagnosis: string | null;

  flags: string[]; // e.g., ["DNI", "DNR", "NPO"] or raw if written oddly
  status: string[]; // informational notes (not actionable)
  tomorrowNotes: string[]; // 'מחר' column notes (not on-call tasks)
  tasks: Task[]; // explicit actionable tasks
  generatedTasks: Task[]; // rule-engine tasks created from status triggers

  // Manual notes you add in the UI (persist across rescans).
  // Optional for backwards compatibility with old localStorage.
  notes?: string[];

  scannedAt: string; // ISO string
  confidence: number; // 0..1 overall row confidence
};

/**
 * Strict helper: map a header-only line -> Section.
 *
 * IMPORTANT:
 * - Must NOT match patient rows like "ניטור 3 ..." (room labels contain digits).
 * - Should tolerate trailing ":" / "-" etc.
 */
export function detectSectionFromHeader(headerText: string): Section | null {
  const raw = headerText.trim();
  if (!raw) return null;

  // Strip common separators, keep the core words.
  const cleaned = raw.replace(/[:：\-–—]+/g, " ").trim();

  // If there are digits, it's almost certainly a room/bed label, not a header.
  if (/\d/.test(cleaned)) return null;

  const t = cleaned.replace(/\s+/g, "").toLowerCase();

  if (t === "צדא" || t === "sidea") return "SIDE_A";
  if (t === "צדב" || t === "sideb") return "SIDE_B";
  if (t === "צדג" || t === "sidec") return "SIDE_C";

  if (
    t === "שיקום" ||
    t === "שיקומי" ||
    t === "rehab" ||
    t === "rehabilitation"
  )
    return "REHAB";

  if (
    t === "ניטור" ||
    t === "מוניטור" ||
    t === "מוניטורים" ||
    t === "monitor" ||
    t === "monitoring"
  )
    return "MONITOR";

  return null;
}

/**
 * Infer section from a room string.
 * Helps when the pasted list does NOT include explicit headers.
 */
export function detectSectionFromRoom(room: string | null): Section | null {
  if (!room) return null;
  const t = room.replace(/\s+/g, "").toLowerCase();

  if (t.startsWith("ניטור") || t.startsWith("מוניטור") || t.startsWith("monitor")) {
    return "MONITOR";
  }

  return null;
}

// Single source of truth for your top-level navigation sections.
// "Rehab" is NOT a filter. It's its own section.

export const SECTIONS = ["ALL", "SIDE_A", "SIDE_B", "SIDE_C", "REHAB", "MONITOR"] as const;
export type Section = (typeof SECTIONS)[number];

// Sections that patients can actually belong to (ALL is view-only filter)
export const PATIENT_SECTIONS = ["SIDE_A", "SIDE_B", "SIDE_C", "REHAB", "MONITOR"] as const;
export type PatientSection = (typeof PATIENT_SECTIONS)[number];

export const SECTION_LABEL: Record<Section, string> = {
  ALL: "הכל",
  SIDE_A: "צד א",
  SIDE_B: "צד ב",
  SIDE_C: "צד ג",
  REHAB: "שיקום",
  MONITOR: "ניטור",
};

export type Urgency = "stat" | "urgent" | "morning" | "routine" | "extra";

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

  // When this task is due (ISO string). Used for time-aware tasks.
  dueAt?: string | null;
};

export type PatientEntry = {
  id: string; // stable key (room+name hash)
  section: PatientSection; // SIDE_A / SIDE_B / SIDE_C / REHAB / MONITOR (never ALL)
  date: string; // "DD/MM/YYYY"
  room: string | null;
  name: string | null;
  age: number | null;
  diagnosis: string | null;

  flags: string[]; // e.g., ["DNI", "DNR", "NPO"] or raw if written oddly
  status: string[]; // informational notes (not actionable)
  tomorrowNotes: string[]; // 'מחר' column notes (not on-call tasks)
  planNotes?: string[];    // morning-team plan items (physio, diet, continue X, staff notes)
  tasks: Task[]; // explicit actionable tasks
  generatedTasks: Task[]; // rule-engine tasks created from status triggers

  // Manual notes you add in the UI (persist across rescans).
  // Optional for backwards compatibility with old localStorage.
  notes?: string[];

  scannedAt: string; // ISO string
  confidence: number; // 0..1 overall row confidence

  // Lab values for tracking trends (manual entry)
  labs?: LabEntry[];

  // Sticky handover note — persists across shift archives
  handoverNote?: string;
  discharged?: boolean;

  // Photo attachments (base64 data URLs, stored in localStorage)
  photos?: PatientPhoto[];

  // Display order within section (lower = higher on list)
  order?: number;
};

export type PatientPhoto = {
  id: string;
  dataUrl: string;      // base64 data URL
  caption?: string;
  time: string;          // ISO string
};

export type LabEntry = {
  id: string;
  label: string; // e.g. "Cr", "K+", "WBC"
  value: number;
  unit?: string;
  time: string; // ISO string
};

/**
 * Strict helper: map a header-only line -> Section.
 *
 * IMPORTANT:
 * - Must NOT match patient rows like "ניטור 3 ..." (room labels contain digits after the section name).
 * - Should tolerate trailing ":" / "-" etc.
 * - May have spaces in section names like "צד א"
 */
export function detectSectionFromHeader(headerText: string): PatientSection | null {
  const raw = headerText.trim();
  if (!raw) return null;

  // Strip common separators, keep the core words.
  const cleaned = raw.replace(/[:：\-–—]+/g, " ").trim();

  // Check if this looks like a patient line (has room number + name pattern)
  // e.g., "ניטור 3 כהן יוסף" or "49/1 לוי שרה"
  // If it has both a number AND Hebrew letters after, it's likely a patient line
  if (/\d+.*[א-ת]/.test(cleaned)) return null;

  // Normalize for comparison (keep spaces between words for "צד א" etc.)
  const normalized = cleaned.toLowerCase();
  const compact = normalized.replace(/\s+/g, "");

  // Check with spaces first (for "צד א", "צד ב", "צד ג")
  if (normalized === "צד א" || compact === "צדא" || compact === "sidea") return "SIDE_A";
  if (normalized === "צד ב" || compact === "צדב" || compact === "sideb") return "SIDE_B";
  if (normalized === "צד ג" || compact === "צדג" || compact === "sidec") return "SIDE_C";

  if (
    compact === "שיקום" ||
    compact === "שיקומי" ||
    compact === "rehab" ||
    compact === "rehabilitation"
  )
    return "REHAB";

  // For monitor, be careful not to match "ניטור 3" (which is a room)
  // Only match if it's just "ניטור" without a following number
  if (!cleaned.match(/ניטור\s+\d/) && !cleaned.match(/monitor\s+\d/)) {
    if (
      compact === "ניטור" ||
      compact === "מוניטור" ||
      compact === "מוניטורים" ||
      compact === "monitor" ||
      compact === "monitoring"
    )
      return "MONITOR";
  }

  return null;
}

/**
 * Infer section from a room string.
 * NOTE: Room numbers do NOT determine sections!
 * - Regular rooms (49/1, 52/2, etc.) can belong to ANY section
 * - ניטור rooms can belong to צד א, צד ב, or צד ג
 * - שיקום is its own section but uses regular room numbers
 * 
 * This function returns null for all cases since we cannot infer
 * section from room alone. Section must come from explicit headers.
 */
export function detectSectionFromRoom(_room: string | null): PatientSection | null {
  // Rooms NEVER determine sections. Section comes ONLY from explicit headers.
  // A room like "ניטור 1" can be under צד א, צד ב, or ניטור depending on
  // which section header it appears under in the patient list.
  return null;
}

// ─── Ward Events ────────────────────────────────────────────
export type WardEvent =
  | { id: string; type: "ADMISSION"; at: string; patientId: string; patientName: string | null; room: string | null }
  | { id: string; type: "MOVE"; at: string; patientId: string; patientName: string | null; from: string | null; to: string }
  | { id: string; type: "TASK_CREATED"; at: string; patientId?: string; patientName?: string | null; text: string; urgency: string }
  | { id: string; type: "TASK_COMPLETED"; at: string; patientId: string; taskId: string; text: string };

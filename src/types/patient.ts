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
  text: string;          // exact text as written
  urgency: Urgency;
  category?: TaskCategory;
  source: TaskSource;
  done: boolean;
  doneTime: string | null; // ISO string or null
  time: string | null;     // "16:30" if present, else null
  confidence: number;      // 0..1
  generatedFrom?: string;  // e.g., "משתחרר היום"
};

export type PatientEntry = {
  id: string;             // stable key (room+name hash)
  section: Section;       // SIDE_A / SIDE_B / SIDE_C / REHAB / MONITOR
  date: string;           // "DD/MM/YYYY"
  room: string | null;
  name: string | null;
  age: number | null;
  diagnosis: string | null;

  flags: string[];        // e.g., ["DNI", "DNR", "NPO"] or raw if written oddly
  status: string[];       // informational notes (not actionable)
  tomorrowNotes: string[]; // 'מחר' column notes (not on-call tasks)
  tasks: Task[];          // explicit actionable tasks
  generatedTasks: Task[]; // rule-engine tasks created from status triggers

  scannedAt: string;      // ISO string
  confidence: number;     // 0..1 overall row confidence
};

// Optional helper: map Hebrew header text -> Section
export function detectSectionFromHeader(headerText: string): Section | null {
  const t = headerText.replace(/\s+/g, "");
  if (t.includes("צדא")) return "SIDE_A";
  if (t.includes("צדב")) return "SIDE_B";
  if (t.includes("צדג")) return "SIDE_C";
  if (t.includes("שיקום")) return "REHAB";
  if (t.includes("ניטור") || t.includes("מוניטור") || t.includes("מונ") ) return "MONITOR";
  return null;
}

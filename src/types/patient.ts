// Single source of truth for your top-level navigation sections.
// "Rehab" is NOT a filter. It's its own section.

export const SECTIONS = ["ALL", "SIDE_A", "SIDE_B", "SIDE_C", "REHAB", "MONITOR", "UNKNOWN_SECTION"] as const;
export type Section = (typeof SECTIONS)[number];

// Sections that patients can actually belong to (ALL is view-only filter)
// UNKNOWN_SECTION: assigned by parser when no section header was seen.
// Must be resolved to a real section before import is committed.
export const PATIENT_SECTIONS = ["SIDE_A", "SIDE_B", "SIDE_C", "REHAB", "MONITOR", "UNKNOWN_SECTION"] as const;
export type PatientSection = (typeof PATIENT_SECTIONS)[number];

export const SECTION_LABEL: Record<Section, string> = {
  ALL: "הכל",
  SIDE_A: "צד א",
  SIDE_B: "צד ב",
  SIDE_C: "צד ג",
  REHAB: "שיקום",
  MONITOR: "ניטור",
  UNKNOWN_SECTION: "לא ידוע",
};

// Label for the UNKNOWN_SECTION state — shown in preview/warning UI
export const UNKNOWN_SECTION_LABEL = "קטע לא ידוע";

/**
 * Returns a display label for any PatientSection, including UNKNOWN_SECTION.
 * Components should use this instead of SECTION_LABEL[patient.section] directly,
 * which does not typecheck when patient.section can be UNKNOWN_SECTION.
 */
export function patientSectionLabel(section: PatientSection): string {
  if (section === "UNKNOWN_SECTION") return UNKNOWN_SECTION_LABEL;
  return SECTION_LABEL[section as Section];
}

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

  // User explicitly dismissed this generated task — suppress on re-generate.
  dismissed?: boolean;
};

// ─── Structured clinical metadata ──────────────────────────
// Explicit demographics/care-goals carried on the patient record.
// Populated via AddAdmissionModal / patient editor.
// When absent, renal-dose and comfort-care logic must emit indeterminate
// warnings rather than guessing from free text.
export type GoalsOfCare = "full" | "limited" | "comfort_only" | "unknown";
export type SexAtBirth = "male" | "female" | "unknown";
export type BaselineMobility = "independent" | "walker" | "wheelchair" | "bedbound";
export type BaselineCognition = "oriented" | "mci" | "dementia" | "unknown";
export type LivingArrangement = "independent" | "with_family" | "assisted_living" | "nursing_home";
export type AdmissionSource = "ed" | "community" | "transfer" | "nursing_home" | "rehab";
export type IsolationType = "MRSA" | "VRE" | "CRE" | "ESBL" | "COVID" | "CDiff" | "TB" | "other";

export interface PatientClinicalMeta {
  sexAtBirth?: SexAtBirth;
  weightKg?: number | null;
  onDialysis?: boolean;
  baselineCreatinine?: number | null;
  goalsOfCare?: GoalsOfCare;
  // ── Geriatric baseline (populated on admission) ──
  baselineMobility?: BaselineMobility;
  baselineCognition?: BaselineCognition;
  livingArrangement?: LivingArrangement;
  admissionSource?: AdmissionSource;
  isolation?: IsolationType[];
}

// ─── Sync metadata ──────────────────────────────────────────
// Per-patient revision tracking for shared-shift conflict detection.
// Phase 4 — populated here so the type is forward-compatible.
export interface PatientSyncMeta {
  revision?: number;
  lastModifiedAt?: string;
  lastModifiedBy?: string | null;
}

// ─── Photo reference (Phase 2: IndexedDB migration) ────────
// Phase 2 will replace PatientPhoto.dataUrl with a blobKey reference.
// Both shapes are kept for migration compatibility.
export interface PatientPhotoRef {
  id: string;
  blobKey: string;
  thumbBlobKey?: string;
  caption?: string;
  mimeType?: string;
  time: string;
}

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
  isAdmission?: boolean;

  // MOH surrogate-consent trigger: flagged by the intake processor when an
  // elderly patient (age >= 65) has a high anticholinergic burden (ACB >= 3).
  // UI surfaces this as a reminder to verify decision-making capacity before
  // discharge planning or advance-directive discussions.
  needsCapacityAssessment?: boolean;

  // Legacy photo attachments (base64 data URLs, stored in localStorage).
  // DEPRECATED: Phase 2 migration moves blobs to IndexedDB.
  // After migration this field is removed from the patient record.
  photos?: PatientPhoto[];

  // Phase 2: IDs referencing photos stored in IndexedDB (src/persistence/photoStore.ts).
  // After migration this replaces the legacy photos[] field.
  photoIds?: string[];

  // Known drug allergies (e.g., ["penicillin", "sulfa"])
  allergies?: string[];

  // Structured medication list — one drug per entry (e.g., ["Omeprazole 20mg", "Metoprolol 50mg"])
  // Fed to ACB, falls risk, drug interaction, Beers engines for accurate scoring.
  // Populated via MedicationInput paste (from תיק אשפוז home med list).
  medications?: string[];

  // Display order within section (lower = higher on list)
  order?: number;

  // Structured clinical metadata — explicit demographics and care goals.
  // When absent, renal/comfort logic emits indeterminate warnings.
  clinicalMeta?: PatientClinicalMeta;

  // Sync metadata — per-patient revision for conflict detection (Phase 4).
  syncMeta?: PatientSyncMeta;
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
 * Canonical section alias table.
 *
 * All section header matching must go through this table, not through
 * scattered regex. Adding a new format/OCR variant = adding one string here.
 *
 * Includes:
 *   - Standard Hebrew headers
 *   - Common OCR corruptions (ד א for צד א, !ד for צד, etc.)
 *   - English variants used in bilingual contexts
 *   - Separator variants (colon, dash, etc. are stripped before matching)
 */
export const SECTION_ALIASES: Record<Exclude<PatientSection, "UNKNOWN_SECTION">, string[]> = {
  SIDE_A: [
    "צד א",
    "צד א:",
    "צדא",
    "!ד א",   // OCR: צ → !
    "ד א",    // OCR: צ dropped
    "side a",
    "sidea",
    "a ward",
  ],
  SIDE_B: [
    "צד ב",
    "צד ב:",
    "צדב",
    "!ד ב",
    "ד ב",
    "side b",
    "sideb",
    "b ward",
  ],
  SIDE_C: [
    "צד ג",
    "צד ג:",
    "צדג",
    "!ד ג",
    "ד ג",
    "side c",
    "sidec",
    "c ward",
  ],
  REHAB: [
    "שיקום",
    "שיקומי",
    "rehab",
    "rehabilitation",
    "שיקום:",
  ],
  MONITOR: [
    "ניטור",
    "מוניטור",
    "מוניטורים",
    "monitor",
    "monitoring",
    "ניטור:",
  ],
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
  // e.g., "ניטור 3 כהן יוסף" or "70 לוי שרה" or "א-92 אברהם דוד" or legacy "49/1 לוי שרה"
  if (/\d+.*[א-ת]/.test(cleaned)) return null;

  // Primary: match against canonical alias table (SECTION_ALIASES)
  const normalizedForAlias = cleaned.toLowerCase().trim();
  for (const [section, aliases] of Object.entries(SECTION_ALIASES) as Array<[Exclude<PatientSection, "UNKNOWN_SECTION">, string[]]>) {
    if (aliases.some((alias) => normalizedForAlias === alias.toLowerCase() || normalizedForAlias.replace(/\s+/g, "") === alias.toLowerCase().replace(/\s+/g, ""))) {
      // Extra guard for MONITOR: "ניטור 3" (room label) must not match as a header
      if (section === "MONITOR" && /ניטור\s*\d|monitor\s*\d/i.test(cleaned)) continue;
      return section;
    }
  }

  return null;
}

/**
 * Infer section from a room string.
 * NOTE: Room numbers do NOT determine sections!
 * - Regular rooms (70, א-92, 2088, legacy 49/1, 52/2, etc.) can belong to ANY section
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
  | { id: string; type: "TASK_COMPLETED"; at: string; patientId: string; taskId: string; text: string }
  | { id: string; type: "BED_CONFLICT"; at: string; patientId: string; patientName: string | null; text: string };

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  type ReactNode,
  type Dispatch,
} from "react";
import type { PatientEntry, Section, PatientSection, Task, Urgency, LabEntry, WardEvent } from "../types";
import { parsePatientList } from "../parser/parsePatientList";
import { mergeScan } from "../engine/mergeScan";
import { applyRules } from "../engine/rules";
import { generateId } from "../utils/id";
import { safeGetItem, safeSetItem } from "../utils/storage";
import { useToranotCloudSync, type ToranotCloudState, type SyncStatus, type ConflictData } from "../cloudSync";
import type { ScanDiff } from "../engine/smartOCR";

// -----------------------------
// Constants
// -----------------------------
const STORAGE_KEY_PATIENTS = "toranot-patients";
const STORAGE_KEY_SHIFT_HISTORY = "toranot-shift-history";
const STORAGE_KEY_DARK_MODE = "toranot-dark";
const STORAGE_KEY_SCAN_MODE = "toranot-scan-mode";
const STORAGE_KEY_EVENTS = "toranot-events";
const STORAGE_KEY_UNASSIGNED = "toranot-unassigned-tasks";
const STORAGE_KEY_SHOW_TOMORROW = "toranot-show-tomorrow";
const MAX_EVENTS = 300;
const MAX_SHIFT_HISTORY = 30;

// -----------------------------
// State
// -----------------------------
export interface ShiftSnapshot {
  id: string;
  date: string;       // ISO date
  label: string;      // "19/02 — ערב"
  patients: PatientEntry[];
  archivedAt: string;  // ISO
}

interface PatientsState {
  patients: PatientEntry[];
  activeSection: Section;
  showTomorrow: boolean;
  darkMode: boolean;
  shiftHistory: ShiftSnapshot[];
  scanMode: boolean;
  events: WardEvent[];
  unassignedTasks: Task[];
  lastScanDiff?: ScanDiff | null;
}

// Data loaded from localStorage or external sources may have missing/wrong-typed fields.
// These types represent the raw shape before normalization.
type RawTask = Record<string, unknown>;
type RawPatient = Record<string, unknown>;

export function normalizeTask(t: RawTask): Task {
  return {
    ...t,
    done: !!t.done,
    doneTime: t.doneTime ?? null,
    time: t.time ?? null,
    confidence: typeof t.confidence === "number" ? t.confidence : 1,
    note: t.note ?? null,
    dueAt: t.dueAt ?? null,
    // Ensure required string fields always have safe values
    id: typeof t.id === "string" && t.id ? t.id : Math.random().toString(36).slice(2),
    text: typeof t.text === "string" ? t.text : String(t.text ?? ""),
    urgency: (["stat","urgent","morning","extra","routine"].includes(t.urgency as string)
      ? t.urgency : "routine") as Task["urgency"],
    category: (typeof t.category === "string" ? t.category : "general") as Task["category"],
    source: (["manual","generated","imported"].includes(t.source as string)
      ? t.source : "manual") as Task["source"],
  } as Task;
}

export function normalizePatient(p: RawPatient): PatientEntry {
  return {
    ...p,
    flags: Array.isArray(p.flags) ? p.flags : [],
    status: Array.isArray(p.status) ? p.status : [],
    tomorrowNotes: Array.isArray(p.tomorrowNotes) ? p.tomorrowNotes : [],
    planNotes: Array.isArray(p.planNotes) ? p.planNotes : [],
    tasks: Array.isArray(p.tasks) ? p.tasks.map(normalizeTask) : [],
    generatedTasks: Array.isArray(p.generatedTasks)
      ? p.generatedTasks.map(normalizeTask)
      : [],
    notes: Array.isArray(p.notes) ? p.notes : [],
    labs: Array.isArray(p.labs) ? p.labs : [],
    order: typeof p.order === "number" ? p.order : 0,
    ...(p.discharged ? { discharged: true } : {}),
    ...(p.isAdmission ? { isAdmission: true } : {}),
  } as PatientEntry;
}

// Archiving entire patients (including base64 photos) will blow up localStorage fast.
// Shift history is for timeline/context, not for hoarding JPEGs.
function stripPatientForArchive(p: PatientEntry): PatientEntry {
  return {
    ...p,
    photos: [],
    generatedTasks: [],
  };
}

function loadSavedPatients(): PatientEntry[] {
  try {
    const raw = safeGetItem(STORAGE_KEY_PATIENTS);
    const parsed: unknown[] = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map((p) => normalizePatient(p as RawPatient)) : [];
  } catch (err) {
    console.warn("Failed to load saved patients:", err);
    return [];
  }
}

function loadShiftHistory(): ShiftSnapshot[] {
  try {
    const raw = safeGetItem(STORAGE_KEY_SHIFT_HISTORY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.map((s: ShiftSnapshot) => ({
          ...s,
          patients: Array.isArray(s.patients)
            ? s.patients.map(normalizePatient)
            : [],
        }))
      : [];
  } catch {
    return [];
  }
}

function loadDarkMode(): boolean {
  try {
    return safeGetItem(STORAGE_KEY_DARK_MODE) === "true";
  } catch (err) {
    console.warn("Failed to load dark mode preference:", err);
    return false;
  }
}

function loadScanMode(): boolean {
  try {
    return safeGetItem(STORAGE_KEY_SCAN_MODE) === "true";
  } catch {
    return false;
  }
}

function loadShowTomorrow(): boolean {
  try {
    return safeGetItem(STORAGE_KEY_SHOW_TOMORROW) === "true";
  } catch {
    return false;
  }
}

function loadEvents(): WardEvent[] {
  try {
    const raw = safeGetItem(STORAGE_KEY_EVENTS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadUnassignedTasks(): Task[] {
  try {
    const raw = safeGetItem(STORAGE_KEY_UNASSIGNED);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizeTask) : [];
  } catch {
    return [];
  }
}

const initializer = (): PatientsState => ({
  patients: loadSavedPatients(),
  activeSection: "ALL",
  showTomorrow: loadShowTomorrow(),
  darkMode: loadDarkMode(),
  shiftHistory: loadShiftHistory(),
  scanMode: loadScanMode(),
  events: loadEvents(),
  unassignedTasks: loadUnassignedTasks(),
  lastScanDiff: null,
});

// -----------------------------
export type Action =
  | { type: "IMPORT_TEXT"; text: string }
  | { type: "SET_SECTION"; section: Section }
  | { type: "TOGGLE_TASK"; patientId: string; taskId: string }
  | { type: "SET_TASK_NOTE"; patientId: string; taskId: string; note: string | null }
  | { type: "SET_TASK_DUE"; patientId: string; taskId: string; dueAt: string | null }
  | { type: "ADD_TASK"; patientId: string; text: string; urgency?: Urgency }
  | { type: "ADD_NOTE"; patientId: string; text: string }
  | { type: "REMOVE_NOTE"; patientId: string; index: number }
  | { type: "ADD_LAB"; patientId: string; lab: LabEntry }
  | { type: "SET_HANDOVER_NOTE"; patientId: string; note: string }
  | { type: "ADD_PHOTO"; patientId: string; photo: import("../types").PatientPhoto }
  | { type: "REMOVE_PHOTO"; patientId: string; photoId: string }
  | { type: "REORDER_PATIENT"; patientId: string; direction: "up" | "down" }
  | { type: "EDIT_PATIENT"; patientId: string; name?: string; room?: string; section?: PatientSection; diagnosis?: string; discharged?: boolean }
  | { type: "REMOVE_PATIENT"; patientId: string }
  | { type: "ARCHIVE_SHIFT"; label: string }
  | { type: "RESTORE_SHIFT"; snapshotId: string }
  | { type: "DELETE_SHIFT"; snapshotId: string }
  | { type: "TOGGLE_DARK_MODE" }
  | { type: "CLEAR_ALL" }
  | { type: "TOGGLE_SHOW_TOMORROW" }
  | { type: "REAPPLY_RULES" }
  | { type: "IMPORT_BACKUP"; patients: PatientEntry[] }
  | { type: "MERGE_PATIENTS"; patients: PatientEntry[] }
  | { type: "SYNC_SHIFT_HISTORY"; shiftHistory: ShiftSnapshot[] }
  | { type: "SYNC_PATIENTS"; patients: PatientEntry[] }
  | { type: "TOGGLE_SCAN_MODE" }
  | { type: "LOG_EVENT"; event: WardEvent }
  | { type: "MOVE_PATIENT"; patientId: string; toRoom: string; toSection?: PatientSection }
  | { type: "NEW_ADMISSION"; patient: PatientEntry }
  | { type: "ADD_PATIENT"; patient: PatientEntry }
  | { type: "ADD_UNASSIGNED_TASK"; text: string; urgency: Urgency }
  | { type: "ASSIGN_TASK_TO_PATIENT"; taskId: string; patientId: string }
  | { type: "TOGGLE_UNASSIGNED_TASK"; taskId: string }
  | { type: "IMPORT_CLOUD_STATE"; state: ToranotCloudState }
  | { type: "DISMISS_SCAN_DIFF" };

export function inferUrgencyFromText(text: string): Urgency {
  const t = text.trim();
  if (!t) return "routine";
  // \b does not work for Hebrew letters (they are non-word chars in JS regex).
  // Use Unicode lookbehind/lookahead — "not preceded/followed by a Hebrew letter"
  // — so we still avoid matching partial Hebrew words, while correctly matching
  // standalone words in any position within the string.
  if (/\bSTAT\b|(?<![א-ת])(סטט|דחוף)(?![א-ת])/i.test(t)) return "stat";
  if (/\burgent\b|(?<![א-ת])אורגנטי(?![א-ת])/i.test(t)) return "urgent";
  if (/(?<![א-ת])(בוקר|לבוקר|בבוקר)(?![א-ת])/.test(t)) return "morning";
  return "routine";
}

function toggleTaskInList(tasks: Task[], taskId: string): Task[] {
  return tasks.map((t) =>
    t.id === taskId
      ? {
          ...t,
          done: !t.done,
          doneTime: !t.done ? new Date().toISOString() : null,
        }
      : t,
  );
}

function setTaskNoteInList(tasks: Task[], taskId: string, note: string | null): Task[] {
  return tasks.map((t) => (t.id === taskId ? { ...t, note } : t));
}

/**
 * Check if a bed is occupied by a different patient.
 * Two patients collide if they share the same room AND section.
 * Returns the occupant's id if occupied, null if free.
 */
function bedOccupiedBy(
  patients: PatientEntry[],
  room: string | null,
  section: PatientSection,
  excludeId?: string,
): string | null {
  if (!room) return null;
  const occupant = patients.find(
    (p) => p.room === room && p.section === section && p.id !== excludeId,
  );
  return occupant?.id ?? null;
}

export function reducer(state: PatientsState, action: Action): PatientsState {
  switch (action.type) {
    case "IMPORT_TEXT": {
      const parsed = parsePatientList(action.text);
      const merged = mergeScan(state.patients, parsed);

      // Deduplicate beds: if two patients share room+section, keep the later one
      const seen = new Map<string, number>();
      for (let i = 0; i < merged.length; i++) {
        const p = merged[i];
        if (!p.room) continue;
        const key = `${p.section}::${p.room}`;
        seen.set(key, i);
      }
      const keepIndices = new Set(seen.values());
      const deduped = merged.filter((p, i) => !p.room || keepIndices.has(i));

      // Compute diff from merge results.
      // mergeScan has 3-tier matching (strict→loose→stable) which is far more
      // robust than detectScanChanges' single-key lookup. We trust its output:
      // patients that kept their old ID were matched; new IDs = genuine admissions.
      let scanDiff: ScanDiff | null = null;
      if (state.patients.length > 0) {
        const existingIds = new Set(state.patients.map((p) => p.id));
        const mergedIds = new Set(deduped.map((p) => p.id));

        const newPatients = deduped.filter((p) => !existingIds.has(p.id));
        const missingPatients = state.patients.filter((p) => !mergedIds.has(p.id));
        const changedPatients = deduped
          .filter((p) => existingIds.has(p.id))
          .flatMap((p) => {
            const old = state.patients.find((o) => o.id === p.id);
            if (!old) return [];
            const changes: string[] = [];
            if (old.room !== p.room && p.room) changes.push(`חדר: ${old.room ?? "?"} → ${p.room}`);
            if (old.section !== p.section) changes.push("מדור עודכן");
            if (old.diagnosis !== p.diagnosis && p.diagnosis) changes.push("אבחנה עודכנה");
            const oldTaskTexts = new Set(old.tasks.map((t) => t.text.trim()));
            const newTasks = p.tasks.filter((t) => !oldTaskTexts.has(t.text.trim()));
            if (newTasks.length > 0) changes.push(`${newTasks.length} משימות חדשות`);
            return changes.length > 0 ? [{ patient: p, changes }] : [];
          });

        const hasDiff =
          newPatients.length > 0 ||
          missingPatients.length > 0 ||
          changedPatients.length > 0;

        if (hasDiff) {
          scanDiff = {
            newPatients,
            missingPatients,
            changedPatients,
            unchanged:
              deduped.filter((p) => existingIds.has(p.id)).length -
              changedPatients.length,
          };
        }
      }

      return { ...state, patients: deduped, lastScanDiff: scanDiff };
    }
    case "SET_SECTION":
      return { ...state, activeSection: action.section };

    case "TOGGLE_TASK": {
      const patient = state.patients.find(p => p.id === action.patientId);
      const task = patient && [...(patient.tasks), ...(patient.generatedTasks)].find(t => t.id === action.taskId);
      const wasUndone = task && !task.done;
      const newPatients = state.patients.map((p) =>
        p.id === action.patientId
          ? {
              ...p,
              tasks: toggleTaskInList(p.tasks, action.taskId),
              generatedTasks: toggleTaskInList(p.generatedTasks, action.taskId),
            }
          : p,
      );
      if (wasUndone && task) {
        const event: WardEvent = {
          id: generateId("ev-"),
          type: "TASK_COMPLETED",
          at: new Date().toISOString(),
          patientId: action.patientId,
          taskId: action.taskId,
          text: task.text,
        };
        return { ...state, patients: newPatients, events: [event, ...state.events].slice(0, MAX_EVENTS) };
      }
      return { ...state, patients: newPatients };
    }

    case "SET_TASK_NOTE":
      return {
        ...state,
        patients: state.patients.map((p) =>
          p.id === action.patientId
            ? {
                ...p,
                tasks: setTaskNoteInList(p.tasks, action.taskId, action.note),
                generatedTasks: setTaskNoteInList(
                  p.generatedTasks,
                  action.taskId,
                  action.note,
                ),
              }
            : p,
        ),
      };

    case "SET_TASK_DUE":
      return {
        ...state,
        patients: state.patients.map((p) =>
          p.id === action.patientId
            ? {
                ...p,
                tasks: p.tasks.map((t) =>
                  t.id === action.taskId ? { ...t, dueAt: action.dueAt } : t,
                ),
                generatedTasks: p.generatedTasks.map((t) =>
                  t.id === action.taskId ? { ...t, dueAt: action.dueAt } : t,
                ),
              }
            : p,
        ),
      };

    case "ADD_TASK": {
      const text = action.text.trim();
      if (!text) return state;
      const patient = state.patients.find(p => p.id === action.patientId);
      const urgency = action.urgency ?? inferUrgencyFromText(text);
      const taskId = generateId("manual-");
      const event: WardEvent = {
        id: generateId("ev-"),
        type: "TASK_CREATED",
        at: new Date().toISOString(),
        patientId: action.patientId,
        patientName: patient?.name ?? null,
        text,
        urgency,
      };
      return {
        ...state,
        events: [event, ...state.events].slice(0, MAX_EVENTS),
        patients: state.patients.map((p) =>
          p.id === action.patientId
            ? {
                ...p,
                tasks: [
                  ...p.tasks,
                  {
                    id: taskId,
                    text,
                    urgency,
                    category: "other" as const,
                    source: "manual" as const,
                    done: false,
                    doneTime: null,
                    time: null,
                    confidence: 1,
                    note: null,
                  },
                ],
              }
            : p,
        ),
      };
    }

    case "ADD_NOTE": {
      const text = action.text.trim();
      if (!text) return state;

      return {
        ...state,
        patients: state.patients.map((p) => {
          if (p.id !== action.patientId) return p;

          const current = p.notes ?? [];
          if (current.includes(text)) return p;

          return { ...p, notes: [...current, text] };
        }),
      };
    }

    case "REMOVE_NOTE":
      return {
        ...state,
        patients: state.patients.map((p) => {
          if (p.id !== action.patientId) return p;
          const current = p.notes ?? [];
          if (action.index < 0 || action.index >= current.length) return p;
          return { ...p, notes: current.filter((_, i) => i !== action.index) };
        }),
      };

    case "TOGGLE_SHOW_TOMORROW":
      return { ...state, showTomorrow: !state.showTomorrow };

    case "TOGGLE_SCAN_MODE":
      return { ...state, scanMode: !state.scanMode };

    case "ADD_LAB":
      return {
        ...state,
        patients: state.patients.map((p) =>
          p.id === action.patientId
            ? { ...p, labs: [...(p.labs ?? []), action.lab] }
            : p,
        ),
      };

    case "SET_HANDOVER_NOTE":
      return {
        ...state,
        patients: state.patients.map((p) =>
          p.id === action.patientId
            ? { ...p, handoverNote: action.note || undefined }
            : p,
        ),
      };

    case "ADD_PHOTO":
      return {
        ...state,
        patients: state.patients.map((p) =>
          p.id === action.patientId
            ? { ...p, photos: [...(p.photos ?? []), action.photo] }
            : p,
        ),
      };

    case "REMOVE_PHOTO":
      return {
        ...state,
        patients: state.patients.map((p) =>
          p.id === action.patientId
            ? { ...p, photos: (p.photos ?? []).filter((ph) => ph.id !== action.photoId) }
            : p,
        ),
      };

    case "REORDER_PATIENT": {
      const section = state.patients.find(
        (p) => p.id === action.patientId,
      )?.section;
      if (!section) return state;
      const sectionPatients = state.patients
        .filter((p) => p.section === section)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const idx = sectionPatients.findIndex(
        (p) => p.id === action.patientId,
      );
      if (idx < 0) return state;
      const swapIdx = action.direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= sectionPatients.length) return state;
      const a = sectionPatients[idx];
      const b = sectionPatients[swapIdx];
      // When both patients share the same order value (e.g. both 0),
      // swapping identical values is a no-op. Fall back to array indices
      // so the swap always produces a visible change.
      const aOrder = (a.order != null && b.order != null && a.order !== b.order) ? a.order : idx;
      const bOrder = (a.order != null && b.order != null && a.order !== b.order) ? b.order : swapIdx;
      return {
        ...state,
        patients: state.patients.map((p) => {
          if (p.id === a.id) return { ...p, order: bOrder };
          if (p.id === b.id) return { ...p, order: aOrder };
          return p;
        }),
      };
    }

    case "EDIT_PATIENT": {
      const editTarget = state.patients.find((p) => p.id === action.patientId);
      if (!editTarget) return state;
      const newRoom = action.room ?? editTarget.room;
      const newSection = action.section ?? editTarget.section;
      if (
        (action.room !== undefined || action.section !== undefined) &&
        bedOccupiedBy(state.patients, newRoom, newSection, action.patientId)
      ) {
        return state; // bed occupied — reject silently
      }
      return {
        ...state,
        patients: state.patients.map((p) =>
          p.id === action.patientId
            ? {
                ...p,
                ...(action.name !== undefined && { name: action.name }),
                ...(action.room !== undefined && { room: action.room }),
                ...(action.section !== undefined && { section: action.section }),
                ...(action.diagnosis !== undefined && { diagnosis: action.diagnosis }),
                ...(action.discharged !== undefined && { discharged: action.discharged }),
              }
            : p,
        ),
      };
    }

    case "REMOVE_PATIENT": {
      return {
        ...state,
        patients: state.patients.filter((p) => p.id !== action.patientId),
      };
    }

    case "ARCHIVE_SHIFT": {
      const snapshot: ShiftSnapshot = {
        id: generateId("shift-"),
        date: new Date().toISOString(),
        label: action.label,
        // IMPORTANT: don't archive base64 photos (localStorage will explode).
        patients: state.patients.map(stripPatientForArchive),
        archivedAt: new Date().toISOString(),
      };
      const history = [snapshot, ...state.shiftHistory].slice(0, MAX_SHIFT_HISTORY);
      console.debug("[Toranot] Shift archived:", snapshot.label, "| total:", history.length, "| patients:", snapshot.patients.length);
      return { ...state, shiftHistory: history };
    }

    case "RESTORE_SHIFT": {
      const snap = state.shiftHistory.find(
        (s) => s.id === action.snapshotId,
      );
      if (!snap) return state;
      return { ...state, patients: snap.patients.map(normalizePatient) };
    }

    case "DELETE_SHIFT":
      return {
        ...state,
        shiftHistory: state.shiftHistory.filter(
          (s) => s.id !== action.snapshotId,
        ),
      };

    case "TOGGLE_DARK_MODE":
      return { ...state, darkMode: !state.darkMode };

    case "CLEAR_ALL":
      return { ...state, patients: [], events: [], unassignedTasks: [], shiftHistory: [] };

    case "REAPPLY_RULES":
      return {
        ...state,
        patients: state.patients.map((p) => ({
          ...p,
          generatedTasks: applyRules(p),
        })),
      };

    case "IMPORT_BACKUP":
      return { ...state, patients: action.patients.map(normalizePatient) };

    case "MERGE_PATIENTS":
      // Lossless merge: preserves manual tasks, done state, notes, photos
      // from existing patients while folding in incoming edits/additions.
      return {
        ...state,
        patients: mergeScan(state.patients, action.patients.map(normalizePatient)),
      };

    case "IMPORT_CLOUD_STATE": {
      const c = action.state;
      return {
        ...state,
        patients: Array.isArray(c.patients)
          ? c.patients.map((p) => { const n = normalizePatient(p as RawPatient); const rp = p as RawPatient; if (rp.discharged) n.discharged = true; if (rp.isAdmission) (n as PatientEntry & {isAdmission?:boolean}).isAdmission = true; return n; })
          : state.patients,
        shiftHistory: Array.isArray(c.shiftHistory)
          ? c.shiftHistory.map((s) => {
              const snap = s as Record<string, unknown>;
              return {
                ...snap,
                patients: Array.isArray(snap.patients)
                  ? (snap.patients as unknown[]).map((p) => normalizePatient(p as RawPatient))
                  : [],
              } as ShiftSnapshot;
            })
          : state.shiftHistory,
        events: Array.isArray(c.events) ? (c.events as WardEvent[]) : state.events,
        unassignedTasks: Array.isArray(c.unassignedTasks)
          ? c.unassignedTasks.map((t) => normalizeTask(t as RawTask))
          : state.unassignedTasks,
        darkMode: typeof c.darkMode === "boolean" ? c.darkMode : state.darkMode,
        scanMode: typeof c.scanMode === "boolean" ? c.scanMode : state.scanMode,
      };
    }

    case "SYNC_SHIFT_HISTORY":
      return { ...state, shiftHistory: action.shiftHistory };

    case "SYNC_PATIENTS":
      return { ...state, patients: action.patients.map(normalizePatient) };

    case "LOG_EVENT": {
      const events = [action.event, ...state.events].slice(0, MAX_EVENTS);
      return { ...state, events };
    }

    case "MOVE_PATIENT": {
      const patient = state.patients.find(p => p.id === action.patientId);
      if (!patient) return state;
      const moveSection = action.toSection ?? patient.section;
      if (bedOccupiedBy(state.patients, action.toRoom, moveSection, action.patientId)) {
        return state; // bed occupied — reject silently
      }
      const event: WardEvent = {
        id: generateId("ev-"),
        type: "MOVE",
        at: new Date().toISOString(),
        patientId: action.patientId,
        patientName: patient.name,
        from: patient.room,
        to: action.toRoom,
      };
      return {
        ...state,
        events: [event, ...state.events].slice(0, MAX_EVENTS),
        patients: state.patients.map(p =>
          p.id === action.patientId
            ? { ...p, room: action.toRoom, ...(action.toSection ? { section: action.toSection } : {}) }
            : p,
        ),
      };
    }

    case "ADD_PATIENT": {
      const normalized = normalizePatient(action.patient as RawPatient);
      if (
        normalized.room &&
        bedOccupiedBy(state.patients, normalized.room, normalized.section, normalized.id)
      ) {
        return state; // bed occupied by someone else — reject
      }
      const exists = state.patients.some((p) => p.id === normalized.id);
      return {
        ...state,
        patients: exists
          ? state.patients.map((p) => (p.id === normalized.id ? normalized : p))
          : [...state.patients, normalized],
      };
    }

    case "NEW_ADMISSION": {
      const admitted = { ...normalizePatient(action.patient as RawPatient), isAdmission: true };
      if (
        admitted.room &&
        bedOccupiedBy(state.patients, admitted.room, admitted.section, admitted.id)
      ) {
        return state; // bed occupied — reject
      }
      const event: WardEvent = {
        id: generateId("ev-"),
        type: "ADMISSION",
        at: new Date().toISOString(),
        patientId: admitted.id,
        patientName: admitted.name,
        room: admitted.room,
      };
      const existsAlready = state.patients.some((p) => p.id === admitted.id);
      return {
        ...state,
        events: [event, ...state.events].slice(0, MAX_EVENTS),
        patients: existsAlready
          ? state.patients.map((p) => (p.id === admitted.id ? admitted : p))
          : [...state.patients, admitted],
      };
    }

    case "ADD_UNASSIGNED_TASK": {
      const task: Task = {
        id: generateId("task-"),
        text: action.text,
        urgency: action.urgency,
        category: "other",
        source: "manual",
        done: false,
        doneTime: null,
        time: null,
        confidence: 1,
        note: null,
      };
      const event: WardEvent = {
        id: generateId("ev-"),
        type: "TASK_CREATED",
        at: new Date().toISOString(),
        text: action.text,
        urgency: action.urgency,
      };
      return {
        ...state,
        unassignedTasks: [task, ...state.unassignedTasks],
        events: [event, ...state.events].slice(0, MAX_EVENTS),
      };
    }

    case "ASSIGN_TASK_TO_PATIENT": {
      const task = state.unassignedTasks.find(t => t.id === action.taskId);
      if (!task) return state;
      return {
        ...state,
        unassignedTasks: state.unassignedTasks.filter(t => t.id !== action.taskId),
        patients: state.patients.map(p =>
          p.id === action.patientId
            ? { ...p, tasks: [task, ...p.tasks] }
            : p
        ),
      };
    }

    case "TOGGLE_UNASSIGNED_TASK": {
      return {
        ...state,
        unassignedTasks: state.unassignedTasks.map(t =>
          t.id === action.taskId
            ? { ...t, done: !t.done, doneTime: !t.done ? new Date().toISOString() : null }
            : t
        ),
      };
    }

    case "DISMISS_SCAN_DIFF":
      return { ...state, lastScanDiff: null };

    default:
      return state;
  }
}

// -----------------------------
// Context
// -----------------------------
const PatientsStateContext = createContext<PatientsState>({
  patients: [],
  activeSection: "ALL",
  showTomorrow: false,
  darkMode: false,
  shiftHistory: [],
  scanMode: false,
  events: [],
  unassignedTasks: [],
  lastScanDiff: null,
});
const PatientsDispatchContext = createContext<Dispatch<Action>>(() => {});

export type CloudSyncState = {
  status: SyncStatus;
  lastSync: Date | null;
  conflict: ConflictData | null;
  resolveConflict: (choice: "local" | "cloud") => void;
};
const CloudSyncContext = createContext<CloudSyncState>({
  status: "off",
  lastSync: null,
  conflict: null,
  resolveConflict: () => {},
});

export function PatientsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined as unknown as PatientsState, initializer);

  // ─── Cloud sync (one line, everything lives in the hook) ────
  const syncState = useToranotCloudSync(state, dispatch);

  // Persist patients to localStorage so data survives Android tab kills
  useEffect(() => {
    safeSetItem(STORAGE_KEY_PATIENTS, JSON.stringify(state.patients));
  }, [state.patients]);

  // Persist shift history
  useEffect(() => {
    const ok = safeSetItem(STORAGE_KEY_SHIFT_HISTORY, JSON.stringify(state.shiftHistory));
    if (!ok && state.shiftHistory.length > 0) {
      alert("⚠️ לא ניתן לשמור היסטוריית משמרות — נפח האחסון מלא. נסה למחוק משמרות ישנות.");
    }
  }, [state.shiftHistory]);

  // Persist dark mode + apply class
  useEffect(() => {
    safeSetItem(STORAGE_KEY_DARK_MODE, state.darkMode ? "true" : "false");
    document.documentElement.classList.toggle("dark", state.darkMode);
  }, [state.darkMode]);

  // Persist scan mode
  useEffect(() => {
    safeSetItem(STORAGE_KEY_SCAN_MODE, state.scanMode ? "true" : "false");
  }, [state.scanMode]);

  // Persist show-tomorrow toggle
  useEffect(() => {
    safeSetItem(STORAGE_KEY_SHOW_TOMORROW, state.showTomorrow ? "true" : "false");
  }, [state.showTomorrow]);

  // Persist events log
  useEffect(() => {
    safeSetItem(STORAGE_KEY_EVENTS, JSON.stringify(state.events));
  }, [state.events]);

  // Persist unassigned tasks
  useEffect(() => {
    safeSetItem(STORAGE_KEY_UNASSIGNED, JSON.stringify(state.unassignedTasks));
  }, [state.unassignedTasks]);

  // Cross-tab sync: if another tab writes to localStorage, pick up the changes.
  // The "storage" event only fires in OTHER tabs, never the one that wrote.
  // Uses e.newValue directly — no re-reading storage. Validates before dispatch.
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      try {
        if (e.key === STORAGE_KEY_SHIFT_HISTORY) {
          const parsed = e.newValue ? JSON.parse(e.newValue) : [];
          const safe = (Array.isArray(parsed) ? parsed : []).slice(0, MAX_SHIFT_HISTORY);
          dispatch({ type: "SYNC_SHIFT_HISTORY", shiftHistory: safe });
          console.info("[Toranot] storage sync: shiftHistory", safe.length, "items");
        } else if (e.key === STORAGE_KEY_PATIENTS) {
          const parsed = e.newValue ? JSON.parse(e.newValue) : [];
          const safe = Array.isArray(parsed) ? parsed : [];
          dispatch({ type: "SYNC_PATIENTS", patients: safe });
          console.info("[Toranot] storage sync: patients", safe.length, "items");
        }
      } catch {
        console.warn("[Toranot] storage sync parse failed for key:", e.key);
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [dispatch]);

  return (
    <PatientsStateContext.Provider value={state}>
      <PatientsDispatchContext.Provider value={dispatch}>
        <CloudSyncContext.Provider value={syncState}>
          {children}
        </CloudSyncContext.Provider>
      </PatientsDispatchContext.Provider>
    </PatientsStateContext.Provider>
  );
}

export function usePatientsState() {
  return useContext(PatientsStateContext);
}

export function usePatientsDispatch() {
  return useContext(PatientsDispatchContext);
}

export function useCloudSync() {
  return useContext(CloudSyncContext);
}


/**
 * Toranot patient state reducer — extracted from PatientsContext to break
 * the circular import between PatientsContext ↔ patientsStore.
 *
 * Import chain:
 *   patientsStore  → reducer.ts  (reducer, Action, normalise utils)
 *   PatientsContext → reducer.ts  (same)
 *   No file imports both patientsStore AND PatientsContext — cycle broken.
 */

import type { PatientEntry, Section, PatientSection, Task, Urgency, LabEntry, WardEvent } from "../types";
import { parsePatientList } from "../parser/parsePatientList";
import { mergeScan } from "../engine/mergeScan";
import { applyRules } from "../engine/rules";
import { generateId } from "../utils/id";
import type { ToranotCloudState } from "../cloudSync";
import type { ScanDiff } from "../engine/smartOCR";

// -----------------------------
// Constants
// -----------------------------
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

export interface PatientsState {
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
    id: typeof t.id === "string" && t.id ? t.id : generateId(),
    text: typeof t.text === "string" ? t.text : String(t.text ?? ""),
    urgency: (["stat","urgent","morning","extra","routine"].includes(t.urgency as string)
      ? t.urgency : "routine") as Task["urgency"],
    category: (typeof t.category === "string" ? t.category : "other") as Task["category"],
    source: (["manual","generated","extracted"].includes(t.source as string)
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
    allergies: Array.isArray(p.allergies) ? p.allergies : [],
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
  | { type: "EDIT_PATIENT"; patientId: string; name?: string; room?: string; section?: PatientSection; diagnosis?: string; discharged?: boolean; allergies?: string[] }
  | { type: "REMOVE_PATIENT"; patientId: string }
  | { type: "ARCHIVE_SHIFT"; label: string }
  | { type: "RESTORE_SHIFT"; snapshotId: string }
  | { type: "DELETE_SHIFT"; snapshotId: string }
  | { type: "TOGGLE_DARK_MODE" }
  | { type: "CLEAR_ALL" }
  | { type: "TOGGLE_SHOW_TOMORROW" }
  | { type: "REAPPLY_RULES" }
  | { type: "REMOVE_DISCHARGED" }
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
  | { type: "DELETE_TASK"; patientId: string; taskId: string }
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
    (p) => p.room === room && p.section === section && p.id !== excludeId && !p.discharged,
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
                    dueAt: null,
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
                ...(action.allergies !== undefined && { allergies: action.allergies }),
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
      return { ...state, patients: snap.patients.map(normalizePatient), lastScanDiff: null };
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
      return { ...state, patients: [], events: [], unassignedTasks: [], lastScanDiff: null }; // intentionally keep shiftHistory

    case "REAPPLY_RULES":
      return {
        ...state,
        patients: state.patients.map((p) => {
          const newGenerated = applyRules(p);
          // Preserve done state + dismissals from existing generated tasks
          const existingByText = new Map(
            p.generatedTasks.map(t => [t.text.trim().toLowerCase(), t])
          );
          const merged = newGenerated.map(nt => {
            const existing = existingByText.get(nt.text.trim().toLowerCase());
            if (!existing) return nt;
            return { ...nt, done: existing.done, doneTime: existing.doneTime, note: existing.note ?? null };
          }).filter(nt => {
            const existing = existingByText.get(nt.text.trim().toLowerCase());
            return !(existing as (typeof existing & { dismissed?: boolean }) | undefined)?.dismissed;
          });
          // Re-include dismissed tasks (with dismissed:true) so subsequent REAPPLY_RULES
          // still has them in existingByText. Without this, dismissed tasks re-appear
          // after the second REAPPLY_RULES call because the first call dropped them.
          const dismissedStubs = p.generatedTasks.filter(t =>
            (t as typeof t & { dismissed?: boolean }).dismissed
          );
          return { ...p, generatedTasks: [...merged, ...dismissedStubs] };
        }),
      };

    case "REMOVE_DISCHARGED":
      return { ...state, patients: state.patients.filter((p) => !p.discharged) };

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
      return { ...state, shiftHistory: action.shiftHistory.slice(0, MAX_SHIFT_HISTORY) };

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
      const admittedBase = normalizePatient(action.patient as RawPatient);
      // Do NOT auto-apply rules on admission — on-call doctors should add tasks
      // explicitly. Auto-generated tasks from diagnosis create noise and are
      // better suited for morning staff review. The user can manually trigger
      // REAPPLY_RULES from the patient card if they want generated tasks.
      const admitted = { ...admittedBase, isAdmission: true };
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
        dueAt: null,
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
      // Verify patient exists — avoid orphaning the task if patient was deleted
      if (!state.patients.some(p => p.id === action.patientId)) return state;
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

    case "DELETE_TASK":
      return {
        ...state,
        patients: state.patients.map((p) => {
          if (p.id !== action.patientId) return p;
          return {
            ...p,
            // Manual tasks: hard-delete
            tasks: p.tasks.filter(t => t.id !== action.taskId),
            // Generated tasks: mark dismissed=true so REAPPLY_RULES won't re-add them
            // Do NOT remove — keep in array so the dismissed flag survives re-renders
            generatedTasks: p.generatedTasks.map(t =>
              t.id === action.taskId ? { ...t, dismissed: true, done: true } : t
            ),
          };
        }),
      };

    case "DISMISS_SCAN_DIFF":
      return { ...state, lastScanDiff: null };

    default:
      return state;
  }
}

// -----------------------------
// Context
// -----------------------------

// ─────────────────────────────────────────────────────────────────────────────
// Provider & Hooks — backed by Zustand store (src/store/patientsStore.ts)
//
// The Zustand store is the single source of truth. Context just bridges it
// for backward-compatible hook access across the component tree.
// All existing consumers of usePatientsState/usePatientsDispatch/useCloudSync
// continue to work with zero changes.
// ─────────────────────────────────────────────────────────────────────────────


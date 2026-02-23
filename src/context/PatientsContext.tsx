import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  type ReactNode,
  type Dispatch,
} from "react";
import type { PatientEntry, Section, Task, Urgency, LabEntry } from "../types";
import { parsePatientList } from "../parser/parsePatientList";
import { mergeScan } from "../engine/mergeScan";
import { applyRules } from "../engine/rules";
import { generateId } from "../utils/id";
import { safeGetItem, safeSetItem } from "../utils/storage";

// -----------------------------
// Constants
// -----------------------------
const STORAGE_KEY_PATIENTS = "toranot-patients";
const STORAGE_KEY_SHIFT_HISTORY = "toranot-shift-history";
const STORAGE_KEY_DARK_MODE = "toranot-dark";
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
  } as Task;
}

export function normalizePatient(p: RawPatient): PatientEntry {
  return {
    ...p,
    flags: Array.isArray(p.flags) ? p.flags : [],
    status: Array.isArray(p.status) ? p.status : [],
    tomorrowNotes: Array.isArray(p.tomorrowNotes) ? p.tomorrowNotes : [],
    tasks: Array.isArray(p.tasks) ? p.tasks.map(normalizeTask) : [],
    generatedTasks: Array.isArray(p.generatedTasks)
      ? p.generatedTasks.map(normalizeTask)
      : [],
    notes: Array.isArray(p.notes) ? p.notes : [],
    labs: Array.isArray(p.labs) ? p.labs : [],
    order: typeof p.order === "number" ? p.order : 0,
  } as PatientEntry;
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
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.warn("Failed to load shift history:", err);
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

const initialState: PatientsState = {
  patients: loadSavedPatients(),
  activeSection: "SIDE_A",
  showTomorrow: false,
  darkMode: loadDarkMode(),
  shiftHistory: loadShiftHistory(),
};

// -----------------------------
// Actions
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
  | { type: "EDIT_PATIENT"; patientId: string; name?: string; room?: string; section?: Section; diagnosis?: string }
  | { type: "REMOVE_PATIENT"; patientId: string }
  | { type: "ARCHIVE_SHIFT"; label: string }
  | { type: "RESTORE_SHIFT"; snapshotId: string }
  | { type: "DELETE_SHIFT"; snapshotId: string }
  | { type: "TOGGLE_DARK_MODE" }
  | { type: "CLEAR_ALL" }
  | { type: "TOGGLE_SHOW_TOMORROW" }
  | { type: "REAPPLY_RULES" }
  | { type: "IMPORT_BACKUP"; patients: PatientEntry[] };

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

export function reducer(state: PatientsState, action: Action): PatientsState {
  switch (action.type) {
    case "IMPORT_TEXT": {
      const parsed = parsePatientList(action.text);
      return { ...state, patients: mergeScan(state.patients, parsed) };
    }
    case "SET_SECTION":
      return { ...state, activeSection: action.section };

    case "TOGGLE_TASK":
      return {
        ...state,
        patients: state.patients.map((p) =>
          p.id === action.patientId
            ? {
                ...p,
                tasks: toggleTaskInList(p.tasks, action.taskId),
                generatedTasks: toggleTaskInList(p.generatedTasks, action.taskId),
              }
            : p,
        ),
      };

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

      return {
        ...state,
        patients: state.patients.map((p) =>
          p.id === action.patientId
            ? {
                ...p,
                tasks: [
                  ...p.tasks,
                  {
                    id: generateId("manual-"),
                    text,
                    urgency: action.urgency ?? inferUrgencyFromText(text),
                    category: "other",
                    source: "manual",
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
      // Swap the actual .order property values, not the array indices.
      // idx/swapIdx are positions in the filtered subarray — using them
      // directly as order values would corrupt ordering for all patients
      // whose .order wasn't involved in this swap.
      const aOrder = a.order ?? idx;
      const bOrder = b.order ?? swapIdx;
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
        patients: state.patients,
        archivedAt: new Date().toISOString(),
      };
      const history = [snapshot, ...state.shiftHistory].slice(0, MAX_SHIFT_HISTORY);
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
      return { ...state, patients: [] };

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

    default:
      return state;
  }
}

// -----------------------------
// Context
// -----------------------------
const PatientsStateContext = createContext<PatientsState>(initialState);
const PatientsDispatchContext = createContext<Dispatch<Action>>(() => {});

export function PatientsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

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

  return (
    <PatientsStateContext.Provider value={state}>
      <PatientsDispatchContext.Provider value={dispatch}>
        {children}
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

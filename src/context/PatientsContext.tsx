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
import { generateId } from "../utils/id";

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

function normalizeTask(t: any): Task {
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

function normalizePatient(p: any): PatientEntry {
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
    const raw = localStorage.getItem("toranot-patients");
    const parsed = raw ? (JSON.parse(raw) as any[]) : [];
    return Array.isArray(parsed) ? parsed.map(normalizePatient) : [];
  } catch {
    return [];
  }
}

function loadShiftHistory(): ShiftSnapshot[] {
  try {
    const raw = localStorage.getItem("toranot-shift-history");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function loadDarkMode(): boolean {
  try {
    return localStorage.getItem("toranot-dark") === "true";
  } catch {
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
type Action =
  | { type: "IMPORT_TEXT"; text: string }
  | { type: "SET_SECTION"; section: Section }
  | { type: "TOGGLE_TASK"; patientId: string; taskId: string }
  | { type: "SET_TASK_NOTE"; patientId: string; taskId: string; note: string | null }
  | { type: "SET_TASK_DUE"; patientId: string; taskId: string; dueAt: string | null }
  | { type: "ADD_TASK"; patientId: string; text: string }
  | { type: "ADD_NOTE"; patientId: string; text: string }
  | { type: "REMOVE_NOTE"; patientId: string; index: number }
  | { type: "ADD_LAB"; patientId: string; lab: LabEntry }
  | { type: "REORDER_PATIENT"; patientId: string; direction: "up" | "down" }
  | { type: "ARCHIVE_SHIFT"; label: string }
  | { type: "RESTORE_SHIFT"; snapshotId: string }
  | { type: "DELETE_SHIFT"; snapshotId: string }
  | { type: "TOGGLE_DARK_MODE" }
  | { type: "CLEAR_ALL" }
  | { type: "TOGGLE_SHOW_TOMORROW" };

function inferUrgencyFromText(text: string): Urgency {
  const t = text.trim();
  if (!t) return "routine";
  if (/(^|\b)(סטט|STAT|דחוף)(\b|!)/i.test(t)) return "stat";
  if (/(^|\b)(אורגנטי|urgent)(\b|!)/i.test(t)) return "urgent";
  if (/\b(בוקר|לבוקר|בבוקר)\b/.test(t)) return "morning";
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

function reducer(state: PatientsState, action: Action): PatientsState {
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
                    urgency: inferUrgencyFromText(text),
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
      return {
        ...state,
        patients: state.patients.map((p) => {
          if (p.id === a.id) return { ...p, order: swapIdx };
          if (p.id === b.id) return { ...p, order: idx };
          return p;
        }),
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
      // Keep last 5 shifts
      const history = [snapshot, ...state.shiftHistory].slice(0, 5);
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
    try {
      localStorage.setItem("toranot-patients", JSON.stringify(state.patients));
    } catch {
      // Storage quota exceeded — ignore
    }
  }, [state.patients]);

  // Persist shift history
  useEffect(() => {
    try {
      localStorage.setItem(
        "toranot-shift-history",
        JSON.stringify(state.shiftHistory),
      );
    } catch {}
  }, [state.shiftHistory]);

  // Persist dark mode + apply class
  useEffect(() => {
    try {
      localStorage.setItem("toranot-dark", state.darkMode ? "true" : "false");
    } catch {}
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

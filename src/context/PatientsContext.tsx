import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  type ReactNode,
  type Dispatch,
} from "react";
import type { PatientEntry, Section, Task, Urgency } from "../types";
import { parsePatientList } from "../parser/parsePatientList";
import { mergeScan } from "../engine/mergeScan";
import { generateId } from "../utils/id";

// -----------------------------
// State
// -----------------------------
interface PatientsState {
  patients: PatientEntry[];
  activeSection: Section;
  showTomorrow: boolean;
}

function normalizeTask(t: any): Task {
  return {
    ...t,
    done: !!t.done,
    doneTime: t.doneTime ?? null,
    time: t.time ?? null,
    confidence: typeof t.confidence === "number" ? t.confidence : 1,
    note: t.note ?? null,
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

const initialState: PatientsState = {
  patients: loadSavedPatients(),
  activeSection: "SIDE_A",
  showTomorrow: false,
};

// -----------------------------
// Actions
// -----------------------------
type Action =
  | { type: "IMPORT_TEXT"; text: string }
  | { type: "SET_SECTION"; section: Section }
  | { type: "TOGGLE_TASK"; patientId: string; taskId: string }
  | { type: "SET_TASK_NOTE"; patientId: string; taskId: string; note: string | null }
  | { type: "ADD_TASK"; patientId: string; text: string }
  | { type: "ADD_NOTE"; patientId: string; text: string }
  | { type: "REMOVE_NOTE"; patientId: string; index: number }
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

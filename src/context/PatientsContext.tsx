import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  type ReactNode,
  type Dispatch,
} from "react";
import type { PatientEntry, Section, Task } from "../types";
import { parsePatientList } from "../parser/parsePatientList";
import { mergeScan } from "../engine/mergeScan";
import { generateId } from "../utils/id";

// State
interface PatientsState {
  patients: PatientEntry[];
  activeSection: Section;
  showTomorrow: boolean;
}

function loadSavedPatients(): PatientEntry[] {
  try {
    const raw = localStorage.getItem("toranot-patients");
    return raw ? (JSON.parse(raw) as PatientEntry[]) : [];
  } catch {
    return [];
  }
}

const initialState: PatientsState = {
  patients: loadSavedPatients(),
  activeSection: "SIDE_A",
  showTomorrow: false,
};

// Actions
type Action =
  | { type: "IMPORT_TEXT"; text: string }
  | { type: "SET_SECTION"; section: Section }
  | { type: "TOGGLE_TASK"; patientId: string; taskId: string }
  | { type: "ADD_TASK"; patientId: string; text: string }
  | { type: "CLEAR_ALL" }
  | { type: "TOGGLE_SHOW_TOMORROW" };

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
                generatedTasks: toggleTaskInList(
                  p.generatedTasks,
                  action.taskId,
                ),
              }
            : p,
        ),
      };
    case "ADD_TASK":
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
                    text: action.text,
                    urgency: "routine",
                    source: "manual",
                    done: false,
                    doneTime: null,
                    time: null,
                    confidence: 1,
                  },
                ],
              }
            : p,
        ),
      };
    case "CLEAR_ALL":
      return { ...state, patients: [] };
    default:
      return state;
  }
}

// Context
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

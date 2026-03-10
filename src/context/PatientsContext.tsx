import {
  createContext,
  useContext,
  useEffect,
  type ReactNode,
  type Dispatch,
} from "react";
import type { WardEvent } from "../types";
import { useToranotCloudSync, type SyncStatus, type ConflictData } from "../cloudSync";
import { useShallow } from "zustand/react/shallow";

// Re-export from reducer.ts — single source of truth for all reducer logic.
// PatientsContext no longer duplicates the reducer, types, or normalization utils.
export {
  reducer,
  normalizeTask,
  normalizePatient,
  inferUrgencyFromText,
  type Action,
  type ShiftSnapshot,
  type PatientsState,
} from "./reducer";
import type { Action, PatientsState } from "./reducer";

// ─────────────────────────────────────────────────────────────────────────────
// Provider & Hooks — backed by Zustand store (src/store/patientsStore.ts)
//
// The Zustand store is the single source of truth. Context just bridges it
// for backward-compatible hook access across the component tree.
// All existing consumers of usePatientsState/usePatientsDispatch/useCloudSync
// continue to work with zero changes.
// ─────────────────────────────────────────────────────────────────────────────

import { usePatientsStore } from "../store/patientsStore";

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
  // Read state + dispatch directly from Zustand store.
  // No useReducer here — the store owns the state.
  const state = usePatientsStore(
    // useShallow required: spread selector returns new object every call → Zustand
    // Object.is comparison fails every render → infinite re-render loop (#185).
    // useShallow does property-by-property comparison instead.
    useShallow((s) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { dispatch: _dispatch, ...rest } = s;
      return rest as PatientsState;
    })
  );
  const dispatch = usePatientsStore((s) => s.dispatch);

  // CRITICAL: pass only the 6 primitive fields useToranotCloudSync depends on —
  // NOT the whole state object. usePatientsStore spread creates a new object every
  // render, which makes cloudState useMemo deps change every cycle → infinite loop
  // (React error #185: Maximum update depth exceeded).
  const patients = usePatientsStore((s) => s.patients);
  const shiftHistory = usePatientsStore((s) => s.shiftHistory);
  const events = usePatientsStore((s) => s.events);
  const unassignedTasks = usePatientsStore((s) => s.unassignedTasks);
  const darkMode = usePatientsStore((s) => s.darkMode);
  const scanMode = usePatientsStore((s) => s.scanMode);
  const syncFields = { patients, shiftHistory, events, unassignedTasks, darkMode, scanMode };

  // Cloud sync unchanged — depends on state + dispatch
  const syncState = useToranotCloudSync(syncFields, dispatch);

  // Dark mode DOM class is handled by store subscription in patientsStore.ts.
  // No duplicate useEffect needed here.

  // Service worker message handlers
  useEffect(() => {
    const handleTaskDone = (e: Event) => {
      const { taskId, patientId } = (e as CustomEvent).detail ?? {};
      if (taskId && patientId) dispatch({ type: "TOGGLE_TASK", patientId, taskId });
    };
    const handleTaskSnooze = (e: Event) => {
      const { taskId, patientId, newDueAt } = (e as CustomEvent).detail ?? {};
      if (taskId && patientId && newDueAt)
        dispatch({ type: "SET_TASK_DUE", patientId, taskId, dueAt: newDueAt });
    };
    const handleFocusPatient = (e: Event) => {
      const { patientId } = (e as CustomEvent).detail ?? {};
      if (!patientId) return;
      requestAnimationFrame(() => {
        document.getElementById(`patient-${patientId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    };
    window.addEventListener("toranot:task-done", handleTaskDone);
    window.addEventListener("toranot:task-snooze", handleTaskSnooze);
    window.addEventListener("toranot:focus-patient", handleFocusPatient);
    return () => {
      window.removeEventListener("toranot:task-done", handleTaskDone);
      window.removeEventListener("toranot:task-snooze", handleTaskSnooze);
      window.removeEventListener("toranot:focus-patient", handleFocusPatient);
    };
  }, [dispatch]);

  // Cross-tab storage sync
  useEffect(() => {
    const SK_SHIFT  = "toranot-shift-history";
    const SK_PAT    = "toranot-patients";
    const MAX_HIST  = 30;
    const handler = (e: StorageEvent) => {
      try {
        if (e.key === SK_SHIFT) {
          const parsed = e.newValue ? JSON.parse(e.newValue) : [];
          const safe = (Array.isArray(parsed) ? parsed : []).slice(0, MAX_HIST);
          dispatch({ type: "SYNC_SHIFT_HISTORY", shiftHistory: safe });
        } else if (e.key === SK_PAT) {
          const parsed = e.newValue ? JSON.parse(e.newValue) : [];
          // Use MERGE_PATIENTS instead of SYNC_PATIENTS to avoid overwriting
          // local edits (manual tasks, done state, notes) when another tab writes.
          dispatch({ type: "MERGE_PATIENTS", patients: Array.isArray(parsed) ? parsed : [] });
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

// Bypass Context for state/dispatch — go directly to Zustand to avoid
// context propagation loops caused by PatientsProvider re-renders.
export function usePatientsState() {
  return usePatientsStore(
    useShallow((s) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { dispatch: _d, ...rest } = s;
      return rest as PatientsState;
    })
  );
}
export function usePatientsDispatch() { return usePatientsStore((s) => s.dispatch); }
export function useCloudSync()        { return useContext(CloudSyncContext); }

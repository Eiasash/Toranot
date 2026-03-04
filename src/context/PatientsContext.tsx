/**
 * PatientsContext — React context layer over the Zustand patientsStore.
 *
 * All state logic lives in:
 *   src/context/reducer.ts      — reducer, Action, normalise utils
 *   src/store/patientsStore.ts  — Zustand store (wraps the reducer)
 *
 * This file only provides React Context hooks for backward compatibility.
 * Consumers can also subscribe directly via usePatientsStore() for
 * fine-grained selectors that avoid unnecessary re-renders.
 */
import {
  createContext,
  useContext,
  useEffect,
  type ReactNode,
  type Dispatch,
} from "react";
import { useToranotCloudSync, type SyncStatus, type ConflictData } from "../cloudSync";
import { usePatientsStore } from "../store/patientsStore";

// Re-export everything from reducer so existing imports from PatientsContext still work.
export type { ShiftSnapshot, PatientsState, Action } from "./reducer";
export { normalizeTask, normalizePatient, inferUrgencyFromText, reducer } from "./reducer";

import type { PatientsState, Action } from "./reducer";

// ─── Contexts ─────────────────────────────────────────────────────────────────
const PatientsStateContext = createContext<PatientsState>({
  patients:        [],
  activeSection:   "ALL",
  showTomorrow:    false,
  darkMode:        false,
  shiftHistory:    [],
  scanMode:        false,
  events:          [],
  unassignedTasks: [],
  lastScanDiff:    null,
});
const PatientsDispatchContext = createContext<Dispatch<Action>>(() => {});

export type CloudSyncState = {
  status:           SyncStatus;
  lastSync:         Date | null;
  conflict:         ConflictData | null;
  resolveConflict:  (choice: "local" | "cloud") => void;
};
const CloudSyncContext = createContext<CloudSyncState>({
  status:          "off",
  lastSync:        null,
  conflict:        null,
  resolveConflict: () => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────
export function PatientsProvider({ children }: { children: ReactNode }) {
  // Zustand store owns all state and persistence.
  const state    = usePatientsStore((s) => { const { dispatch: _d, ...rest } = s; return rest as PatientsState; });
  const dispatch = usePatientsStore((s) => s.dispatch);

  const syncState = useToranotCloudSync(state, dispatch);

  // Dark mode DOM class (persistence handled by store subscription in patientsStore.ts)
  useEffect(() => {
    document.documentElement.classList.toggle("dark", state.darkMode);
  }, [state.darkMode]);

  // Service worker notification action → dispatch bridge
  useEffect(() => {
    const onDone   = (e: Event) => { const { taskId, patientId } = (e as CustomEvent).detail ?? {}; if (taskId && patientId) dispatch({ type: "TOGGLE_TASK", patientId, taskId }); };
    const onSnooze = (e: Event) => { const { taskId, patientId, newDueAt } = (e as CustomEvent).detail ?? {}; if (taskId && patientId && newDueAt) dispatch({ type: "SET_TASK_DUE", patientId, taskId, dueAt: newDueAt }); };
    const onFocus  = (e: Event) => { const { patientId } = (e as CustomEvent).detail ?? {}; if (!patientId) return; requestAnimationFrame(() => document.getElementById(`patient-${patientId}`)?.scrollIntoView({ behavior: "smooth", block: "center" })); };
    window.addEventListener("toranot:task-done",     onDone);
    window.addEventListener("toranot:task-snooze",   onSnooze);
    window.addEventListener("toranot:focus-patient", onFocus);
    return () => {
      window.removeEventListener("toranot:task-done",     onDone);
      window.removeEventListener("toranot:task-snooze",   onSnooze);
      window.removeEventListener("toranot:focus-patient", onFocus);
    };
  }, [dispatch]);

  // Cross-tab localStorage sync (storage event fires in OTHER tabs only)
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      try {
        if (e.key === "toranot-shift-history") {
          const parsed = e.newValue ? JSON.parse(e.newValue) : [];
          dispatch({ type: "SYNC_SHIFT_HISTORY", shiftHistory: (Array.isArray(parsed) ? parsed : []).slice(0, 30) });
        } else if (e.key === "toranot-patients") {
          const parsed = e.newValue ? JSON.parse(e.newValue) : [];
          dispatch({ type: "SYNC_PATIENTS", patients: Array.isArray(parsed) ? parsed : [] });
        }
      } catch { console.warn("[Toranot] storage sync parse failed:", e.key); }
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

// ─── Hooks ────────────────────────────────────────────────────────────────────
export function usePatientsState()    { return useContext(PatientsStateContext); }
export function usePatientsDispatch() { return useContext(PatientsDispatchContext); }
export function useCloudSync()        { return useContext(CloudSyncContext); }

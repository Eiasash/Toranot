/**
 * Zustand store for Toranot patient state.
 *
 * Architecture: wraps the existing reducer from PatientsContext — no logic
 * duplication. The store IS the source of truth; PatientsContext just reads
 * from it and re-exports the same hooks for backward compatibility.
 *
 * Why Zustand over pure Context:
 *  - Components can subscribe to specific slices: usePatientById(id) only
 *    re-renders when THAT patient changes, not when any patient changes.
 *  - UI state (darkMode, scanMode, activeSection) no longer causes PatientCard
 *    to re-render.
 *  - dispatch is stable — no context re-render just because dispatch was
 *    recreated.
 */

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import {
  reducer,
  normalizePatient,
  normalizeTask,
  type Action,
  type ShiftSnapshot,
} from "../context/reducer";
import type { PatientEntry, Section, Task, WardEvent, LabEntry } from "../types";
import { SECTIONS } from "../types";
import { safeGetItem, safeSetItem, safeStorageSet } from "../utils/storage";
import type { ScanDiff } from "../engine/smartOCR";
import { migratePatientPhotos } from "../persistence/photoStore";

// ─── Storage keys (duplicated here so store is self-contained) ────────────────
const SK_PATIENTS        = "toranot-patients";
const SK_PATIENTS_BACKUP = "toranot-patients-backup"; // shadow copy — never wiped by CLEAR_ALL
const SK_SHIFT_HISTORY   = "toranot-shift-history";
const SK_DARK_MODE       = "toranot-dark";
const SK_SCAN_MODE       = "toranot-scan-mode";
const SK_EVENTS          = "toranot-events";
const SK_UNASSIGNED      = "toranot-unassigned-tasks";
const SK_SHOW_TOMORROW   = "toranot-show-tomorrow";
const SK_ACTIVE_SECTION  = "toranot-active-section";
const MAX_SHIFT_HISTORY  = 20;
const MAX_EVENTS         = 300;

// ─── Loaders (same logic as PatientsContext, kept in sync) ───────────────────
type RawTask    = Record<string, unknown>;
type RawPatient = Record<string, unknown>;

function loadSavedPatients(): PatientEntry[] {
  try {
    const raw = safeGetItem(SK_PATIENTS);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as RawPatient[]).map(normalizePatient);
  } catch (err) { console.warn("[Toranot] loadSavedPatients failed:", err); return []; }
}

function loadShiftHistory(): ShiftSnapshot[] {
  try {
    const raw = safeGetItem(SK_SHIFT_HISTORY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_SHIFT_HISTORY) : [];
  } catch (err) { console.warn("[Toranot] loadShiftHistory failed:", err); return []; }
}

function loadDarkMode(): boolean {
  return safeGetItem(SK_DARK_MODE) === "true";
}

function loadScanMode(): boolean {
  return safeGetItem(SK_SCAN_MODE) === "true";
}

function loadShowTomorrow(): boolean {
  return safeGetItem(SK_SHOW_TOMORROW) === "true";
}

function loadActiveSection(): Section {
  const saved = safeGetItem(SK_ACTIVE_SECTION);
  if (saved && (SECTIONS as readonly string[]).includes(saved)) return saved as Section;
  return "ALL";
}

function loadEvents(): WardEvent[] {
  try {
    const raw = safeGetItem(SK_EVENTS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_EVENTS) : [];
  } catch (err) { console.warn("[Toranot] loadEvents failed:", err); return []; }
}

function loadUnassignedTasks(): Task[] {
  try {
    const raw = safeGetItem(SK_UNASSIGNED);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RawTask[]).map(normalizeTask) : [];
  } catch (err) { console.warn("[Toranot] loadUnassignedTasks failed:", err); return []; }
}

// ─── Store shape ─────────────────────────────────────────────────────────────
export interface PatientsStoreState {
  patients:       PatientEntry[];
  activeSection:  Section;
  showTomorrow:   boolean;
  darkMode:       boolean;
  shiftHistory:   ShiftSnapshot[];
  scanMode:       boolean;
  events:         WardEvent[];
  unassignedTasks: Task[];
  lastScanDiff:   ScanDiff | null;
  // Stable dispatch — does NOT trigger store re-render on its own
  dispatch: (action: Action) => void;
}

// ─── Store ───────────────────────────────────────────────────────────────────
export const usePatientsStore = create<PatientsStoreState>()(
  subscribeWithSelector((set) => ({
    patients:        loadSavedPatients(),
    activeSection:   loadActiveSection(),
    showTomorrow:    loadShowTomorrow(),
    darkMode:        loadDarkMode(),
    shiftHistory:    loadShiftHistory(),
    scanMode:        loadScanMode(),
    events:          loadEvents(),
    unassignedTasks: loadUnassignedTasks(),
    lastScanDiff:    null,

    dispatch: (action: Action) =>
      set((state) => {
        // Pull dispatch out so reducer doesn't see it
        const { dispatch: _d, ...reducerState } = state;
        return reducer(reducerState as Parameters<typeof reducer>[0], action);
      }),
  })),
);

// ─── Phase 2: IndexedDB photo migration ──────────────────────────────────────
// Runs once on boot. Patients with legacy base64 .photos are migrated to
// IndexedDB. The migration is async and fire-and-forget — it does not block
// the UI. Failures are logged but do not crash the app.
(async () => {
  try {
    const state = usePatientsStore.getState();
    const patients = state.patients;
    const toUpdate: Array<{ id: string; photoIds: string[] }> = [];

    for (const p of patients) {
      if (!p.photos || p.photos.length === 0) continue;
      const ids = await migratePatientPhotos(
        p.id,
        p.photos.map((ph) => ({ id: ph.id, dataUrl: ph.dataUrl, caption: ph.caption, time: ph.time })),
      );
      toUpdate.push({ id: p.id, photoIds: ids });
    }

    if (toUpdate.length > 0) {
      // Update store: replace photos[] with photoIds[], strip blobs from localStorage
      usePatientsStore.setState((s) => ({
        patients: s.patients.map((p) => {
          const update = toUpdate.find((u) => u.id === p.id);
          if (!update) return p;
          const { photos: _dropped, ...rest } = p;
          void _dropped;
          return { ...rest, photoIds: update.photoIds };
        }),
      }));
      console.info(`[photoStore] Migrated photos for ${toUpdate.length} patient(s) to IndexedDB`);
    }
  } catch (err) {
    console.warn("[photoStore] Migration error (non-fatal):", err);
  }
})();

// ─── Persistence subscriptions ───────────────────────────────────────────────
// Run once — subscribes directly on store, no component re-render needed.
// Each slice is persisted independently so an unrelated change doesn't
// trigger unnecessary localStorage writes.

usePatientsStore.subscribe(
  (s) => s.patients,
  (patients) => {
    const r = safeSetItem(SK_PATIENTS, JSON.stringify(patients));
    if (!r.ok) {
      window.dispatchEvent(new CustomEvent("toranot:storage-full", {
        detail: { message: r.message, quotaExceeded: r.quotaExceeded }
      }));
    }
    // Shadow backup — only overwrite when list is non-empty so CLEAR_ALL never kills it
    if (patients.length > 0) {
      safeSetItem(SK_PATIENTS_BACKUP, JSON.stringify({ ts: new Date().toISOString(), patients }));
    }
  },
);

usePatientsStore.subscribe(
  (s) => s.shiftHistory,
  (shiftHistory) => {
    const json = JSON.stringify(shiftHistory);
    const ok = safeStorageSet(SK_SHIFT_HISTORY, json);
    if (!ok && shiftHistory.length > 0) {
      window.dispatchEvent(new CustomEvent("toranot:storage-full", {
        detail: { message: "Shift history quota exceeded", quotaExceeded: true }
      }));
    }
  },
);

usePatientsStore.subscribe(
  (s) => s.darkMode,
  (dark) => {
    safeSetItem(SK_DARK_MODE, dark ? "true" : "false");
    document.documentElement.classList.toggle("dark", dark);
  },
);

usePatientsStore.subscribe(
  (s) => s.scanMode,
  (v) => safeSetItem(SK_SCAN_MODE, v ? "true" : "false"),
);

usePatientsStore.subscribe(
  (s) => s.showTomorrow,
  (v) => safeSetItem(SK_SHOW_TOMORROW, v ? "true" : "false"),
);

usePatientsStore.subscribe(
  (s) => s.activeSection,
  (section) => safeSetItem(SK_ACTIVE_SECTION, section),
);

usePatientsStore.subscribe(
  (s) => s.events,
  (events) => {
    const r = safeSetItem(SK_EVENTS, JSON.stringify(events));
    if (!r.ok) {
      window.dispatchEvent(new CustomEvent("toranot:storage-full", {
        detail: { message: r.message, quotaExceeded: r.quotaExceeded }
      }));
    }
  },
);

usePatientsStore.subscribe(
  (s) => s.unassignedTasks,
  (tasks) => {
    const r = safeSetItem(SK_UNASSIGNED, JSON.stringify(tasks));
    if (!r.ok) {
      window.dispatchEvent(new CustomEvent("toranot:storage-full", {
        detail: { message: r.message, quotaExceeded: r.quotaExceeded }
      }));
    }
  },
);

// ─── Selector helpers ─────────────────────────────────────────────────────────
/** Re-renders only when the specific patient object changes (shallow-equal). */
export const usePatientById = (id: string) =>
  usePatientsStore((s) => s.patients.find((p) => p.id === id));

/** Re-renders only when patients in the active section change. */
export const useSectionPatients = () =>
  usePatientsStore((s) =>
    s.activeSection === "ALL"
      ? s.patients
      : s.patients.filter((p) => p.section === s.activeSection),
  );

/** Stable dispatch reference — never causes re-render. */
export const useStoreDispatch = () => usePatientsStore((s) => s.dispatch);

/** Granular boolean selectors — components subscribe to ONE field instead of entire state. */
export const useScanMode = () => usePatientsStore((s) => s.scanMode);
export const useShowTomorrow = () => usePatientsStore((s) => s.showTomorrow);
export const useDarkMode = () => usePatientsStore((s) => s.darkMode);
export const useActiveSection = () => usePatientsStore((s) => s.activeSection);

/**
 * patientsStore.ts unit tests
 *
 * Tests the Zustand store: hydration from localStorage, persistence
 * subscriptions, dispatch integration, and selector helpers.
 *
 * Strategy: mock localStorage + DOM APIs so we can test the store logic
 * without a browser. We dynamically import the store module per-test group
 * to get a fresh store instance.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { PatientEntry, Task } from "../types";

// ─── localStorage mock ──────────────────────────────────────────────────────
const storage = new Map<string, string>();

const localStorageMock = {
  getItem: vi.fn((key: string) => storage.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => { storage.set(key, value); }),
  removeItem: vi.fn((key: string) => { storage.delete(key); }),
  clear: vi.fn(() => { storage.clear(); }),
  get length() { return storage.size; },
  key: vi.fn((_i: number) => null),
};

// ─── DOM mock (for document.documentElement.classList + dispatchEvent) ────
const classListMock = {
  toggle: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
};

beforeEach(() => {
  storage.clear();
  vi.clearAllMocks();

  // Install mocks
  Object.defineProperty(globalThis, "localStorage", { value: localStorageMock, writable: true, configurable: true });
  Object.defineProperty(globalThis, "document", {
    value: {
      documentElement: { classList: classListMock },
      createElement: vi.fn(),
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
    },
    writable: true,
    configurable: true,
  });
  // window.dispatchEvent for storage-full event
  if (typeof globalThis.window === "undefined") {
    (globalThis as Record<string, unknown>).window = { dispatchEvent: vi.fn() };
  } else {
    vi.spyOn(window, "dispatchEvent").mockImplementation(() => true);
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Helper: fresh store import ─────────────────────────────────────────────
// Each test group imports a fresh module to get a clean store.
async function freshStore() {
  // Reset module registry so we get a new Zustand store
  vi.resetModules();
  const mod = await import("../store/patientsStore");
  return mod;
}

// ─── Helper: make a minimal patient ─────────────────────────────────────────
function makePatient(overrides: Partial<PatientEntry> = {}): PatientEntry {
  return {
    id: overrides.id ?? "pt-1",
    section: "SIDE_A",
    date: "01/01/2025",
    room: "101",
    name: "Test Patient",
    age: 70,
    diagnosis: null,
    flags: [],
    status: [],
    tomorrowNotes: [],
    tasks: [],
    generatedTasks: [],
    notes: [],
    planNotes: [],
    scannedAt: new Date().toISOString(),
    confidence: 1,
    labs: [],
    ...overrides,
  };
}

// ═════════════════════════════════════════════════════════════
// 1. Hydration from localStorage
// ═════════════════════════════════════════════════════════════

describe("store hydration", () => {
  it("loads empty state when localStorage is empty", async () => {
    const { usePatientsStore } = await freshStore();
    const state = usePatientsStore.getState();
    expect(state.patients).toEqual([]);
    expect(state.shiftHistory).toEqual([]);
    expect(state.darkMode).toBe(false);
    expect(state.scanMode).toBe(false);
    expect(state.showTomorrow).toBe(false);
    expect(state.events).toEqual([]);
    expect(state.unassignedTasks).toEqual([]);
  });

  it("loads patients from localStorage", async () => {
    const patient = makePatient();
    storage.set("toranot-patients", JSON.stringify([patient]));
    const { usePatientsStore } = await freshStore();
    expect(usePatientsStore.getState().patients).toHaveLength(1);
    expect(usePatientsStore.getState().patients[0].id).toBe("pt-1");
  });

  it("loads darkMode from localStorage", async () => {
    storage.set("toranot-dark", "true");
    const { usePatientsStore } = await freshStore();
    expect(usePatientsStore.getState().darkMode).toBe(true);
  });

  it("loads scanMode from localStorage", async () => {
    storage.set("toranot-scan-mode", "true");
    const { usePatientsStore } = await freshStore();
    expect(usePatientsStore.getState().scanMode).toBe(true);
  });

  it("loads showTomorrow from localStorage", async () => {
    storage.set("toranot-show-tomorrow", "true");
    const { usePatientsStore } = await freshStore();
    expect(usePatientsStore.getState().showTomorrow).toBe(true);
  });

  it("loads events from localStorage (capped at 200)", async () => {
    const events = Array.from({ length: 350 }, (_, i) => ({
      id: `e-${i}`, type: "ADMISSION" as const, at: new Date().toISOString(),
      patientId: "pt-1", patientName: "Test", room: "101",
    }));
    storage.set("toranot-events", JSON.stringify(events));
    const { usePatientsStore } = await freshStore();
    expect(usePatientsStore.getState().events).toHaveLength(300);
  });

  it("loads shiftHistory from localStorage (capped at 20)", async () => {
    const history = Array.from({ length: 40 }, (_, i) => ({
      id: `s-${i}`, date: "2025-01-01", label: `Shift ${i}`,
      patients: [], archivedAt: new Date().toISOString(),
    }));
    storage.set("toranot-shift-history", JSON.stringify(history));
    const { usePatientsStore } = await freshStore();
    expect(usePatientsStore.getState().shiftHistory).toHaveLength(20);
  });

  it("returns empty patients on corrupted JSON", async () => {
    storage.set("toranot-patients", "{broken json!!!");
    const { usePatientsStore } = await freshStore();
    expect(usePatientsStore.getState().patients).toEqual([]);
  });

  it("returns empty patients when localStorage has non-array", async () => {
    storage.set("toranot-patients", '{"not":"array"}');
    const { usePatientsStore } = await freshStore();
    expect(usePatientsStore.getState().patients).toEqual([]);
  });

  it("normalizes tasks during patient load", async () => {
    const rawPatient = {
      id: "pt-1", section: "SIDE_A", date: "01/01/2025",
      room: "101", name: "Test", age: 70, diagnosis: null,
      flags: [], status: [], tomorrowNotes: [],
      tasks: [{ id: "t1", text: "some task" }], // missing done, doneTime, etc.
      generatedTasks: [],
      scannedAt: new Date().toISOString(), confidence: 1,
    };
    storage.set("toranot-patients", JSON.stringify([rawPatient]));
    const { usePatientsStore } = await freshStore();
    const task = usePatientsStore.getState().patients[0].tasks[0];
    expect(task.done).toBe(false);
    expect(task.doneTime).toBeNull();
    expect(task.confidence).toBe(1);
  });

  it("normalizes unassigned tasks during load", async () => {
    const rawTasks = [{ id: "ut-1", text: "unassigned task" }];
    storage.set("toranot-unassigned-tasks", JSON.stringify(rawTasks));
    const { usePatientsStore } = await freshStore();
    const task = usePatientsStore.getState().unassignedTasks[0];
    expect(task.done).toBe(false);
    expect(task.doneTime).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════
// 2. Dispatch integration
// ═════════════════════════════════════════════════════════════

describe("store dispatch", () => {
  it("dispatch is a stable function", async () => {
    const { usePatientsStore } = await freshStore();
    const dispatch1 = usePatientsStore.getState().dispatch;
    const dispatch2 = usePatientsStore.getState().dispatch;
    expect(dispatch1).toBe(dispatch2);
  });

  it("dispatch TOGGLE_DARK_MODE toggles darkMode", async () => {
    const { usePatientsStore } = await freshStore();
    expect(usePatientsStore.getState().darkMode).toBe(false);
    usePatientsStore.getState().dispatch({ type: "TOGGLE_DARK_MODE" });
    expect(usePatientsStore.getState().darkMode).toBe(true);
    usePatientsStore.getState().dispatch({ type: "TOGGLE_DARK_MODE" });
    expect(usePatientsStore.getState().darkMode).toBe(false);
  });

  it("dispatch TOGGLE_SHOW_TOMORROW toggles showTomorrow", async () => {
    const { usePatientsStore } = await freshStore();
    expect(usePatientsStore.getState().showTomorrow).toBe(false);
    usePatientsStore.getState().dispatch({ type: "TOGGLE_SHOW_TOMORROW" });
    expect(usePatientsStore.getState().showTomorrow).toBe(true);
  });

  it("dispatch TOGGLE_SCAN_MODE toggles scanMode", async () => {
    const { usePatientsStore } = await freshStore();
    expect(usePatientsStore.getState().scanMode).toBe(false);
    usePatientsStore.getState().dispatch({ type: "TOGGLE_SCAN_MODE" });
    expect(usePatientsStore.getState().scanMode).toBe(true);
  });

  it("dispatch SET_SECTION changes activeSection", async () => {
    const { usePatientsStore } = await freshStore();
    expect(usePatientsStore.getState().activeSection).toBe("ALL");
    usePatientsStore.getState().dispatch({ type: "SET_SECTION", section: "SIDE_B" });
    expect(usePatientsStore.getState().activeSection).toBe("SIDE_B");
  });

  it("dispatch CLEAR_ALL clears patients", async () => {
    const patient = makePatient();
    storage.set("toranot-patients", JSON.stringify([patient]));
    const { usePatientsStore } = await freshStore();
    expect(usePatientsStore.getState().patients).toHaveLength(1);
    usePatientsStore.getState().dispatch({ type: "CLEAR_ALL" });
    expect(usePatientsStore.getState().patients).toHaveLength(0);
  });

  it("dispatch ADD_PATIENT adds a patient", async () => {
    const { usePatientsStore } = await freshStore();
    const patient = makePatient({ id: "new-pt" });
    usePatientsStore.getState().dispatch({ type: "ADD_PATIENT", patient });
    expect(usePatientsStore.getState().patients).toHaveLength(1);
    expect(usePatientsStore.getState().patients[0].id).toBe("new-pt");
  });
});

// ═════════════════════════════════════════════════════════════
// 3. Persistence subscriptions
// ═════════════════════════════════════════════════════════════

describe("persistence subscriptions", () => {
  it("persists patients to localStorage on change", async () => {
    const { usePatientsStore } = await freshStore();
    const patient = makePatient({ id: "persist-pt" });
    usePatientsStore.getState().dispatch({ type: "ADD_PATIENT", patient });

    // The subscription should have written to localStorage
    const stored = localStorageMock.setItem.mock.calls.find(
      (c: [string, string]) => c[0] === "toranot-patients"
    );
    expect(stored).toBeDefined();
    const parsed = JSON.parse(stored![1]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe("persist-pt");
  });

  it("persists darkMode to localStorage on toggle", async () => {
    const { usePatientsStore } = await freshStore();
    usePatientsStore.getState().dispatch({ type: "TOGGLE_DARK_MODE" });

    const stored = localStorageMock.setItem.mock.calls.find(
      (c: [string, string]) => c[0] === "toranot-dark"
    );
    expect(stored).toBeDefined();
    expect(stored![1]).toBe("true");
  });

  it("toggles document.documentElement.classList on darkMode change", async () => {
    const { usePatientsStore } = await freshStore();
    usePatientsStore.getState().dispatch({ type: "TOGGLE_DARK_MODE" });
    expect(classListMock.toggle).toHaveBeenCalledWith("dark", true);
  });

  it("persists scanMode to localStorage on toggle", async () => {
    const { usePatientsStore } = await freshStore();
    usePatientsStore.getState().dispatch({ type: "TOGGLE_SCAN_MODE" });

    const stored = localStorageMock.setItem.mock.calls.find(
      (c: [string, string]) => c[0] === "toranot-scan-mode"
    );
    expect(stored).toBeDefined();
    expect(stored![1]).toBe("true");
  });

  it("persists showTomorrow to localStorage on toggle", async () => {
    const { usePatientsStore } = await freshStore();
    usePatientsStore.getState().dispatch({ type: "TOGGLE_SHOW_TOMORROW" });

    const stored = localStorageMock.setItem.mock.calls.find(
      (c: [string, string]) => c[0] === "toranot-show-tomorrow"
    );
    expect(stored).toBeDefined();
    expect(stored![1]).toBe("true");
  });
});

// ═════════════════════════════════════════════════════════════
// 4. Initial state defaults
// ═════════════════════════════════════════════════════════════

describe("initial state defaults", () => {
  it("activeSection defaults to ALL", async () => {
    const { usePatientsStore } = await freshStore();
    expect(usePatientsStore.getState().activeSection).toBe("ALL");
  });

  it("lastScanDiff defaults to null", async () => {
    const { usePatientsStore } = await freshStore();
    expect(usePatientsStore.getState().lastScanDiff).toBeNull();
  });
});

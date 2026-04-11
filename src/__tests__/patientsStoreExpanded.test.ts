/**
 * patientsStoreExpanded.test.ts — expanded Zustand store tests
 *
 * Covers gaps not addressed by patientsStore.test.ts:
 *   1. localStorage hydration edge cases
 *   2. Persistence subscription behavior
 *   3. Selector stability and reference identity
 *   4. Edge cases (scale, missing fields, concurrent ops, partial updates)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { PatientEntry, Task } from "../types";

// ─── localStorage mock ──────────────────────────────────────────────────────
const storage = new Map<string, string>();

const localStorageMock: Storage & { _simulateQuotaError?: boolean } = {
  getItem: vi.fn((key: string) => storage.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    if ((localStorageMock as { _simulateQuotaError?: boolean })._simulateQuotaError) {
      const err = new DOMException("QuotaExceededError", "QuotaExceededError");
      Object.defineProperty(err, "name", { value: "QuotaExceededError" });
      throw err;
    }
    storage.set(key, value);
  }),
  removeItem: vi.fn((key: string) => { storage.delete(key); }),
  clear: vi.fn(() => { storage.clear(); }),
  get length() { return storage.size; },
  key: vi.fn((_i: number) => null),
  _simulateQuotaError: false,
};

// ─── DOM mock ───────────────────────────────────────────────────────────────
const classListMock = {
  toggle: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
};

let dispatchEventSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  storage.clear();
  localStorageMock._simulateQuotaError = false;
  vi.clearAllMocks();

  Object.defineProperty(globalThis, "localStorage", {
    value: localStorageMock,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(globalThis, "document", {
    value: {
      documentElement: { classList: classListMock },
      createElement: vi.fn(),
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
    },
    writable: true,
    configurable: true,
  });
  dispatchEventSpy = vi.fn(() => true);
  if (typeof globalThis.window === "undefined") {
    (globalThis as Record<string, unknown>).window = { dispatchEvent: dispatchEventSpy };
  } else {
    vi.spyOn(window, "dispatchEvent").mockImplementation(dispatchEventSpy);
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Helper: fresh store import ─────────────────────────────────────────────
async function freshStore() {
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

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: overrides.id ?? "task-1",
    text: "Test task",
    urgency: "routine",
    category: "other",
    source: "manual",
    done: false,
    doneTime: null,
    time: null,
    confidence: 1,
    ...overrides,
  };
}

// ═════════════════════════════════════════════════════════════
// 1. localStorage hydration edge cases
// ═════════════════════════════════════════════════════════════

describe("localStorage hydration edge cases", () => {
  it("initializes all state slices from localStorage when data exists", async () => {
    const patients = [makePatient({ id: "h-1" }), makePatient({ id: "h-2" })];
    const shiftHistory = [{
      id: "s-1", date: "2025-01-01", label: "Morning",
      patients: [makePatient({ id: "s-pt" })], archivedAt: new Date().toISOString(),
    }];
    const events = [{ id: "e-1", type: "ADMISSION" as const, at: new Date().toISOString(), patientId: "h-1", patientName: "Test", room: "101" }];
    const unassigned = [{ id: "ut-1", text: "check labs" }];

    storage.set("toranot-patients", JSON.stringify(patients));
    storage.set("toranot-shift-history", JSON.stringify(shiftHistory));
    storage.set("toranot-dark", "true");
    storage.set("toranot-scan-mode", "true");
    storage.set("toranot-show-tomorrow", "true");
    storage.set("toranot-active-section", "SIDE_B");
    storage.set("toranot-events", JSON.stringify(events));
    storage.set("toranot-unassigned-tasks", JSON.stringify(unassigned));

    const { usePatientsStore } = await freshStore();
    const state = usePatientsStore.getState();

    expect(state.patients).toHaveLength(2);
    expect(state.shiftHistory).toHaveLength(1);
    expect(state.darkMode).toBe(true);
    expect(state.scanMode).toBe(true);
    expect(state.showTomorrow).toBe(true);
    expect(state.activeSection).toBe("SIDE_B");
    expect(state.events).toHaveLength(1);
    expect(state.unassignedTasks).toHaveLength(1);
  });

  it("handles corrupted JSON in shiftHistory gracefully", async () => {
    storage.set("toranot-shift-history", "NOT VALID JSON {{{");
    const { usePatientsStore } = await freshStore();
    expect(usePatientsStore.getState().shiftHistory).toEqual([]);
  });

  it("handles corrupted JSON in events gracefully", async () => {
    storage.set("toranot-events", "BROKEN!!!");
    const { usePatientsStore } = await freshStore();
    expect(usePatientsStore.getState().events).toEqual([]);
  });

  it("handles corrupted JSON in unassigned tasks gracefully", async () => {
    storage.set("toranot-unassigned-tasks", "{not an array}");
    const { usePatientsStore } = await freshStore();
    expect(usePatientsStore.getState().unassignedTasks).toEqual([]);
  });

  it("handles localStorage with missing optional fields (forward compat)", async () => {
    // Patient with only bare minimum fields — no notes, labs, allergies, etc.
    const rawPatient = {
      id: "compat-1",
      section: "SIDE_A",
      date: "01/01/2025",
      room: "200",
      name: "Forward Compat",
      age: 55,
      diagnosis: "Test",
      scannedAt: new Date().toISOString(),
      confidence: 0.9,
      // Missing: flags, status, tomorrowNotes, tasks, generatedTasks, notes, labs, etc.
    };
    storage.set("toranot-patients", JSON.stringify([rawPatient]));
    const { usePatientsStore } = await freshStore();
    const patient = usePatientsStore.getState().patients[0];

    // normalizePatient should fill in defaults
    expect(patient.id).toBe("compat-1");
    expect(patient.flags).toEqual([]);
    expect(patient.status).toEqual([]);
    expect(patient.tomorrowNotes).toEqual([]);
    expect(patient.tasks).toEqual([]);
    expect(patient.generatedTasks).toEqual([]);
    expect(patient.notes).toEqual([]);
    expect(patient.labs).toEqual([]);
    expect(patient.planNotes).toEqual([]);
  });

  it("handles empty localStorage (all keys missing)", async () => {
    // No storage.set calls — everything is empty
    const { usePatientsStore } = await freshStore();
    const state = usePatientsStore.getState();
    expect(state.patients).toEqual([]);
    expect(state.shiftHistory).toEqual([]);
    expect(state.events).toEqual([]);
    expect(state.unassignedTasks).toEqual([]);
    expect(state.darkMode).toBe(false);
    expect(state.scanMode).toBe(false);
    expect(state.showTomorrow).toBe(false);
    expect(state.activeSection).toBe("ALL");
    expect(state.lastScanDiff).toBeNull();
  });

  it("handles non-array value for shiftHistory in localStorage", async () => {
    storage.set("toranot-shift-history", '{"some":"object"}');
    const { usePatientsStore } = await freshStore();
    expect(usePatientsStore.getState().shiftHistory).toEqual([]);
  });

  it("handles non-array value for events in localStorage", async () => {
    storage.set("toranot-events", '"just a string"');
    const { usePatientsStore } = await freshStore();
    expect(usePatientsStore.getState().events).toEqual([]);
  });

  it("handles non-array value for unassigned tasks in localStorage", async () => {
    storage.set("toranot-unassigned-tasks", "42");
    const { usePatientsStore } = await freshStore();
    expect(usePatientsStore.getState().unassignedTasks).toEqual([]);
  });

  it("loads activeSection with an invalid value and defaults to ALL", async () => {
    storage.set("toranot-active-section", "INVALID_SECTION_NAME");
    const { usePatientsStore } = await freshStore();
    expect(usePatientsStore.getState().activeSection).toBe("ALL");
  });

  it("loads activeSection with a valid section value", async () => {
    storage.set("toranot-active-section", "REHAB");
    const { usePatientsStore } = await freshStore();
    expect(usePatientsStore.getState().activeSection).toBe("REHAB");
  });
});

// ═════════════════════════════════════════════════════════════
// 2. Persistence subscriptions
// ═════════════════════════════════════════════════════════════

describe("persistence subscriptions", () => {
  it("changes to patients array trigger localStorage write", async () => {
    const { usePatientsStore } = await freshStore();
    const patient1 = makePatient({ id: "ps-1", room: "201" });
    const patient2 = makePatient({ id: "ps-2", room: "202" });
    usePatientsStore.getState().dispatch({ type: "ADD_PATIENT", patient: patient1 });
    usePatientsStore.getState().dispatch({ type: "ADD_PATIENT", patient: patient2 });

    // Find all writes to toranot-patients
    const patientWrites = localStorageMock.setItem.mock.calls.filter(
      (c: [string, string]) => c[0] === "toranot-patients"
    );
    // Should have written at least twice (once for each ADD_PATIENT)
    expect(patientWrites.length).toBeGreaterThanOrEqual(2);
    const lastWrite = JSON.parse(patientWrites[patientWrites.length - 1][1]);
    expect(lastWrite).toHaveLength(2);
  });

  it("changes to shiftHistory trigger localStorage write", async () => {
    // Pre-seed a patient so ARCHIVE_SHIFT has something to archive
    const patient = makePatient({ id: "archive-pt" });
    storage.set("toranot-patients", JSON.stringify([patient]));
    const { usePatientsStore } = await freshStore();

    usePatientsStore.getState().dispatch({ type: "ARCHIVE_SHIFT", label: "Evening" });

    const historyWrites = localStorageMock.setItem.mock.calls.filter(
      (c: [string, string]) => c[0] === "toranot-shift-history"
    );
    expect(historyWrites.length).toBeGreaterThanOrEqual(1);
    const written = JSON.parse(historyWrites[historyWrites.length - 1][1]);
    expect(Array.isArray(written)).toBe(true);
    expect(written.length).toBeGreaterThanOrEqual(1);
  });

  it("dark mode preference persists as 'true'/'false' string", async () => {
    const { usePatientsStore } = await freshStore();

    usePatientsStore.getState().dispatch({ type: "TOGGLE_DARK_MODE" });
    let darkWrites = localStorageMock.setItem.mock.calls.filter(
      (c: [string, string]) => c[0] === "toranot-dark"
    );
    expect(darkWrites[darkWrites.length - 1][1]).toBe("true");

    usePatientsStore.getState().dispatch({ type: "TOGGLE_DARK_MODE" });
    darkWrites = localStorageMock.setItem.mock.calls.filter(
      (c: [string, string]) => c[0] === "toranot-dark"
    );
    expect(darkWrites[darkWrites.length - 1][1]).toBe("false");
  });

  it("activeSection persists to localStorage on change", async () => {
    const { usePatientsStore } = await freshStore();
    usePatientsStore.getState().dispatch({ type: "SET_SECTION", section: "SIDE_C" });

    const sectionWrites = localStorageMock.setItem.mock.calls.filter(
      (c: [string, string]) => c[0] === "toranot-active-section"
    );
    expect(sectionWrites.length).toBeGreaterThanOrEqual(1);
    expect(sectionWrites[sectionWrites.length - 1][1]).toBe("SIDE_C");
  });

  it("persists a shadow backup when patients is non-empty", async () => {
    const { usePatientsStore } = await freshStore();
    const patient = makePatient({ id: "backup-pt" });
    usePatientsStore.getState().dispatch({ type: "ADD_PATIENT", patient });

    const backupWrites = localStorageMock.setItem.mock.calls.filter(
      (c: [string, string]) => c[0] === "toranot-patients-backup"
    );
    expect(backupWrites.length).toBeGreaterThanOrEqual(1);
    const backupData = JSON.parse(backupWrites[backupWrites.length - 1][1]);
    expect(backupData.patients).toHaveLength(1);
    expect(backupData.ts).toBeDefined();
  });

  it("does not write shadow backup when patients list becomes empty", async () => {
    const patient = makePatient({ id: "clear-pt" });
    storage.set("toranot-patients", JSON.stringify([patient]));
    const { usePatientsStore } = await freshStore();

    // Clear mock calls accumulated from initialization
    localStorageMock.setItem.mockClear();

    usePatientsStore.getState().dispatch({ type: "CLEAR_ALL" });

    // After CLEAR_ALL, patients is empty so no backup should be written
    const backupWrites = localStorageMock.setItem.mock.calls.filter(
      (c: [string, string]) => c[0] === "toranot-patients-backup"
    );
    expect(backupWrites).toHaveLength(0);
  });

  it("events persist to localStorage when added", async () => {
    const patient = makePatient({ id: "ev-pt" });
    storage.set("toranot-patients", JSON.stringify([patient]));
    const { usePatientsStore } = await freshStore();

    usePatientsStore.getState().dispatch({
      type: "LOG_EVENT",
      event: {
        id: "e-new",
        type: "ADMISSION",
        at: new Date().toISOString(),
        patientId: "ev-pt",
        patientName: "Test",
        room: "101",
      },
    });

    const eventWrites = localStorageMock.setItem.mock.calls.filter(
      (c: [string, string]) => c[0] === "toranot-events"
    );
    expect(eventWrites.length).toBeGreaterThanOrEqual(1);
  });

  it("large state payloads persist correctly", async () => {
    const { usePatientsStore } = await freshStore();

    // Add a patient with a very long diagnosis and many tasks
    const patient = makePatient({
      id: "large-pt",
      diagnosis: "A".repeat(5000),
      tasks: Array.from({ length: 50 }, (_, i) => makeTask({
        id: `task-${i}`,
        text: `Task ${i}: ${"Description ".repeat(20)}`,
      })),
    });
    usePatientsStore.getState().dispatch({ type: "ADD_PATIENT", patient });

    const patientWrites = localStorageMock.setItem.mock.calls.filter(
      (c: [string, string]) => c[0] === "toranot-patients"
    );
    expect(patientWrites.length).toBeGreaterThanOrEqual(1);
    const written = JSON.parse(patientWrites[patientWrites.length - 1][1]);
    expect(written[0].diagnosis.length).toBe(5000);
    expect(written[0].tasks).toHaveLength(50);
  });
});

// ═════════════════════════════════════════════════════════════
// 3. Selector stability
// ═════════════════════════════════════════════════════════════

describe("selector stability", () => {
  it("selector returns same patients reference if patients have not changed", async () => {
    const { usePatientsStore } = await freshStore();
    const patient = makePatient({ id: "stable-pt" });
    usePatientsStore.getState().dispatch({ type: "ADD_PATIENT", patient });

    const ref1 = usePatientsStore.getState().patients;
    // Dispatch an action that does NOT change patients
    usePatientsStore.getState().dispatch({ type: "TOGGLE_DARK_MODE" });
    const ref2 = usePatientsStore.getState().patients;

    expect(ref1).toBe(ref2);
  });

  it("selector returns new patients reference after patient update", async () => {
    const { usePatientsStore } = await freshStore();
    const patient = makePatient({ id: "update-pt", tasks: [makeTask({ id: "t-1" })] });
    usePatientsStore.getState().dispatch({ type: "ADD_PATIENT", patient });

    const ref1 = usePatientsStore.getState().patients;
    // Dispatch an action that changes patients
    usePatientsStore.getState().dispatch({ type: "TOGGLE_TASK", patientId: "update-pt", taskId: "t-1" });
    const ref2 = usePatientsStore.getState().patients;

    expect(ref1).not.toBe(ref2);
  });

  it("getState() is always in sync with latest dispatched state", async () => {
    const { usePatientsStore } = await freshStore();

    usePatientsStore.getState().dispatch({ type: "ADD_PATIENT", patient: makePatient({ id: "sync-1", room: "301" }) });
    expect(usePatientsStore.getState().patients).toHaveLength(1);

    usePatientsStore.getState().dispatch({ type: "ADD_PATIENT", patient: makePatient({ id: "sync-2", room: "302" }) });
    expect(usePatientsStore.getState().patients).toHaveLength(2);

    usePatientsStore.getState().dispatch({ type: "REMOVE_PATIENT", patientId: "sync-1" });
    expect(usePatientsStore.getState().patients).toHaveLength(1);
    expect(usePatientsStore.getState().patients[0].id).toBe("sync-2");
  });

  it("multiple subscribers receive consistent snapshots", async () => {
    const { usePatientsStore } = await freshStore();
    const snapshots: number[] = [];

    // Subscribe to patient count changes
    const unsub1 = usePatientsStore.subscribe(
      (s) => s.patients.length,
      (len) => { snapshots.push(len); },
    );

    const darkModeValues: boolean[] = [];
    const unsub2 = usePatientsStore.subscribe(
      (s) => s.darkMode,
      (dm) => { darkModeValues.push(dm); },
    );

    usePatientsStore.getState().dispatch({ type: "ADD_PATIENT", patient: makePatient({ id: "sub-1", room: "401" }) });
    usePatientsStore.getState().dispatch({ type: "TOGGLE_DARK_MODE" });
    usePatientsStore.getState().dispatch({ type: "ADD_PATIENT", patient: makePatient({ id: "sub-2", room: "402" }) });

    expect(snapshots).toContain(1);
    expect(snapshots).toContain(2);
    expect(darkModeValues).toContain(true);

    // At the end, state is consistent
    expect(usePatientsStore.getState().patients).toHaveLength(2);
    expect(usePatientsStore.getState().darkMode).toBe(true);

    unsub1();
    unsub2();
  });

  it("subscribeWithSelector only fires for the selected slice", async () => {
    const { usePatientsStore } = await freshStore();
    const darkModeChanges: boolean[] = [];

    const unsub = usePatientsStore.subscribe(
      (s) => s.darkMode,
      (dm) => { darkModeChanges.push(dm); },
    );

    // Actions that do NOT touch darkMode
    usePatientsStore.getState().dispatch({ type: "ADD_PATIENT", patient: makePatient({ id: "slice-1" }) });
    usePatientsStore.getState().dispatch({ type: "SET_SECTION", section: "SIDE_B" });
    usePatientsStore.getState().dispatch({ type: "TOGGLE_SHOW_TOMORROW" });

    // darkMode subscriber should NOT have fired
    expect(darkModeChanges).toHaveLength(0);

    // Now toggle dark mode — should fire
    usePatientsStore.getState().dispatch({ type: "TOGGLE_DARK_MODE" });
    expect(darkModeChanges).toHaveLength(1);
    expect(darkModeChanges[0]).toBe(true);

    unsub();
  });
});

// ═════════════════════════════════════════════════════════════
// 4. Edge cases
// ═════════════════════════════════════════════════════════════

describe("edge cases", () => {
  it("handles 100+ patients without issues", async () => {
    const patients = Array.from({ length: 120 }, (_, i) =>
      makePatient({ id: `pt-${i}`, room: `${100 + i}`, name: `Patient ${i}` })
    );
    storage.set("toranot-patients", JSON.stringify(patients));
    const { usePatientsStore } = await freshStore();

    expect(usePatientsStore.getState().patients).toHaveLength(120);

    // Can still add patients (room must not collide with existing)
    usePatientsStore.getState().dispatch({
      type: "ADD_PATIENT",
      patient: makePatient({ id: "pt-extra", room: "999" }),
    });
    expect(usePatientsStore.getState().patients).toHaveLength(121);

    // Can still toggle a task on one of them
    usePatientsStore.getState().dispatch({
      type: "ADD_TASK",
      patientId: "pt-50",
      text: "Check labs",
      urgency: "routine",
    });
    const p50 = usePatientsStore.getState().patients.find((p) => p.id === "pt-50");
    expect(p50!.tasks.length).toBeGreaterThanOrEqual(1);
  });

  it("handles patients with missing optional fields", async () => {
    // Simulate a patient with absolutely minimal data — no room, name, age, diagnosis
    const rawPatient = {
      id: "minimal-pt",
      section: "SIDE_B",
      date: "15/03/2025",
      room: null,
      name: null,
      age: null,
      diagnosis: null,
      scannedAt: new Date().toISOString(),
      confidence: 0.5,
      // All arrays missing
    };
    storage.set("toranot-patients", JSON.stringify([rawPatient]));
    const { usePatientsStore } = await freshStore();
    const patient = usePatientsStore.getState().patients[0];

    expect(patient.id).toBe("minimal-pt");
    expect(patient.room).toBeNull();
    expect(patient.name).toBeNull();
    expect(patient.age).toBeNull();
    expect(patient.flags).toEqual([]);
    expect(patient.tasks).toEqual([]);
    expect(patient.generatedTasks).toEqual([]);
    expect(patient.notes).toEqual([]);
    expect(patient.labs).toEqual([]);

    // Should still be able to add tasks to this patient
    usePatientsStore.getState().dispatch({
      type: "ADD_TASK",
      patientId: "minimal-pt",
      text: "Follow up",
    });
    const updated = usePatientsStore.getState().patients.find((p) => p.id === "minimal-pt");
    expect(updated!.tasks).toHaveLength(1);
  });

  it("handles concurrent dispatch operations correctly", async () => {
    const { usePatientsStore } = await freshStore();

    // Dispatch multiple actions rapidly (unique rooms to avoid bed conflict)
    const dispatch = usePatientsStore.getState().dispatch;
    dispatch({ type: "ADD_PATIENT", patient: makePatient({ id: "cc-1", room: "501" }) });
    dispatch({ type: "ADD_PATIENT", patient: makePatient({ id: "cc-2", room: "502" }) });
    dispatch({ type: "ADD_PATIENT", patient: makePatient({ id: "cc-3", room: "503" }) });
    dispatch({ type: "TOGGLE_DARK_MODE" });
    dispatch({ type: "SET_SECTION", section: "REHAB" });
    dispatch({ type: "TOGGLE_SHOW_TOMORROW" });
    dispatch({ type: "REMOVE_PATIENT", patientId: "cc-2" });

    const state = usePatientsStore.getState();
    expect(state.patients).toHaveLength(2);
    expect(state.patients.map((p) => p.id).sort()).toEqual(["cc-1", "cc-3"]);
    expect(state.darkMode).toBe(true);
    expect(state.activeSection).toBe("REHAB");
    expect(state.showTomorrow).toBe(true);
  });

  it("store correctly merges partial state updates via setState", async () => {
    const { usePatientsStore } = await freshStore();
    usePatientsStore.getState().dispatch({
      type: "ADD_PATIENT",
      patient: makePatient({ id: "merge-pt" }),
    });

    // Use setState directly (as the store does internally for photo migration)
    usePatientsStore.setState({ darkMode: true });

    // darkMode updated, but patients are unchanged
    expect(usePatientsStore.getState().darkMode).toBe(true);
    expect(usePatientsStore.getState().patients).toHaveLength(1);
    expect(usePatientsStore.getState().patients[0].id).toBe("merge-pt");
  });

  it("dispatch is stable across state changes", async () => {
    const { usePatientsStore } = await freshStore();
    const dispatch1 = usePatientsStore.getState().dispatch;

    usePatientsStore.getState().dispatch({ type: "ADD_PATIENT", patient: makePatient({ id: "d-1" }) });
    usePatientsStore.getState().dispatch({ type: "TOGGLE_DARK_MODE" });
    usePatientsStore.getState().dispatch({ type: "SET_SECTION", section: "MONITOR" });

    const dispatch2 = usePatientsStore.getState().dispatch;
    expect(dispatch1).toBe(dispatch2);
  });

  it("handles patients with tasks containing all optional fields", async () => {
    const fullTask = makeTask({
      id: "ft-1",
      text: "Full task",
      urgency: "stat",
      category: "labs",
      source: "extracted",
      done: true,
      doneTime: new Date().toISOString(),
      time: "14:30",
      confidence: 0.8,
      note: "Result: WBC 12.5",
      dueAt: new Date().toISOString(),
      dismissed: false,
    });
    const patient = makePatient({
      id: "full-task-pt",
      tasks: [fullTask],
      allergies: ["penicillin", "sulfa"],
      medications: ["Omeprazole 20mg", "Metoprolol 50mg"],
      handoverNote: "Watch for fever",
      discharged: false,
      isAdmission: true,
    });
    storage.set("toranot-patients", JSON.stringify([patient]));
    const { usePatientsStore } = await freshStore();

    const p = usePatientsStore.getState().patients[0];
    expect(p.tasks[0].note).toBe("Result: WBC 12.5");
    expect(p.tasks[0].dueAt).toBeTruthy();
    expect(p.allergies).toEqual(["penicillin", "sulfa"]);
    expect(p.medications).toEqual(["Omeprazole 20mg", "Metoprolol 50mg"]);
    expect(p.handoverNote).toBe("Watch for fever");
  });

  it("handles rapid add-then-remove cycles", async () => {
    const { usePatientsStore } = await freshStore();
    const dispatch = usePatientsStore.getState().dispatch;

    // Add and remove rapidly (unique rooms to avoid bed conflicts)
    for (let i = 0; i < 10; i++) {
      dispatch({ type: "ADD_PATIENT", patient: makePatient({ id: `rapid-${i}`, room: `${600 + i}` }) });
    }
    for (let i = 0; i < 5; i++) {
      dispatch({ type: "REMOVE_PATIENT", patientId: `rapid-${i}` });
    }

    expect(usePatientsStore.getState().patients).toHaveLength(5);
    const ids = usePatientsStore.getState().patients.map((p) => p.id).sort();
    expect(ids).toEqual(["rapid-5", "rapid-6", "rapid-7", "rapid-8", "rapid-9"]);
  });

  it("toggles tasks on a patient that has both tasks and generatedTasks", async () => {
    const { usePatientsStore } = await freshStore();
    const patient = makePatient({
      id: "dual-tasks-pt",
      tasks: [makeTask({ id: "manual-t1", text: "Manual task" })],
      generatedTasks: [makeTask({ id: "gen-t1", text: "Generated task", source: "generated" })],
    });
    usePatientsStore.getState().dispatch({ type: "ADD_PATIENT", patient });

    // Toggle the manual task
    usePatientsStore.getState().dispatch({ type: "TOGGLE_TASK", patientId: "dual-tasks-pt", taskId: "manual-t1" });
    let p = usePatientsStore.getState().patients.find((pt) => pt.id === "dual-tasks-pt")!;
    expect(p.tasks[0].done).toBe(true);
    expect(p.generatedTasks[0].done).toBe(false);

    // Toggle the generated task
    usePatientsStore.getState().dispatch({ type: "TOGGLE_TASK", patientId: "dual-tasks-pt", taskId: "gen-t1" });
    p = usePatientsStore.getState().patients.find((pt) => pt.id === "dual-tasks-pt")!;
    expect(p.generatedTasks[0].done).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import {
  reducer,
  normalizeTask,
  normalizePatient,
  inferUrgencyFromText,
} from "../context/PatientsContext";
import type { PatientEntry, Task, Section, LabEntry } from "../types";

// ─── Helpers ───

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: overrides.id ?? "task-1",
    text: overrides.text ?? "test task",
    urgency: overrides.urgency ?? "routine",
    source: overrides.source ?? "extracted",
    done: overrides.done ?? false,
    doneTime: overrides.doneTime ?? null,
    time: overrides.time ?? null,
    confidence: overrides.confidence ?? 1,
    ...overrides,
  };
}

function makePatient(overrides: Partial<PatientEntry> = {}): PatientEntry {
  return {
    id: overrides.id ?? "pt-1",
    section: overrides.section ?? "SIDE_A",
    date: overrides.date ?? "01/01/2025",
    room: overrides.room ?? "101",
    name: overrides.name ?? "כהן יוסף",
    age: overrides.age ?? 70,
    diagnosis: overrides.diagnosis ?? null,
    flags: overrides.flags ?? [],
    status: overrides.status ?? [],
    tomorrowNotes: overrides.tomorrowNotes ?? [],
    tasks: overrides.tasks ?? [],
    generatedTasks: overrides.generatedTasks ?? [],
    notes: overrides.notes ?? [],
    scannedAt: overrides.scannedAt ?? "2025-01-01T00:00:00.000Z",
    confidence: overrides.confidence ?? 1,
    order: overrides.order ?? 0,
  };
}

function makeState(
  patients: PatientEntry[] = [],
  overrides: Record<string, any> = {},
) {
  return {
    patients,
    activeSection: "SIDE_A" as Section,
    showTomorrow: false,
    darkMode: false,
    shiftHistory: [],
    ...overrides,
  };
}

// ─── normalizeTask ───

describe("normalizeTask", () => {
  it("fills missing fields with defaults", () => {
    const raw = { id: "t1", text: "test", urgency: "stat", source: "manual" };
    const t = normalizeTask(raw);
    expect(t.done).toBe(false);
    expect(t.doneTime).toBeNull();
    expect(t.time).toBeNull();
    expect(t.confidence).toBe(1);
  });

  it("preserves existing done=true", () => {
    const raw = { id: "t1", text: "test", urgency: "stat", source: "manual", done: true };
    const t = normalizeTask(raw);
    expect(t.done).toBe(true);
  });

  it("converts falsy done to false", () => {
    const raw = { id: "t1", text: "test", urgency: "stat", source: "manual", done: 0 };
    const t = normalizeTask(raw);
    expect(t.done).toBe(false);
  });

  it("uses provided confidence when it is a number", () => {
    const raw = { id: "t1", text: "test", urgency: "stat", source: "manual", confidence: 0.5 };
    const t = normalizeTask(raw);
    expect(t.confidence).toBe(0.5);
  });

  it("defaults confidence to 1 for non-number", () => {
    const raw = { id: "t1", text: "test", urgency: "stat", source: "manual", confidence: "high" };
    const t = normalizeTask(raw);
    expect(t.confidence).toBe(1);
  });
});

// ─── normalizePatient ───

describe("normalizePatient", () => {
  it("converts non-array fields to empty arrays", () => {
    const raw = {
      id: "p1",
      section: "SIDE_A",
      date: "01/01/2025",
      room: "101",
      name: "Test",
      flags: "not-an-array",
      status: null,
      tomorrowNotes: undefined,
      tasks: null,
      generatedTasks: "bad",
      notes: 42,
    };
    const p = normalizePatient(raw);
    expect(Array.isArray(p.flags)).toBe(true);
    expect(p.flags).toHaveLength(0);
    expect(Array.isArray(p.status)).toBe(true);
    expect(Array.isArray(p.tomorrowNotes)).toBe(true);
    expect(Array.isArray(p.tasks)).toBe(true);
    expect(Array.isArray(p.generatedTasks)).toBe(true);
    expect(Array.isArray(p.notes)).toBe(true);
  });

  it("normalizes tasks within the patient", () => {
    const raw = {
      id: "p1",
      section: "SIDE_A",
      tasks: [{ id: "t1", text: "test", urgency: "stat", source: "manual" }],
      generatedTasks: [],
      flags: [],
      status: [],
      tomorrowNotes: [],
      notes: [],
    };
    const p = normalizePatient(raw);
    expect(p.tasks[0].done).toBe(false);
    expect(p.tasks[0].doneTime).toBeNull();
  });

  it("defaults order to 0 when not a number", () => {
    const raw = { id: "p1", flags: [], status: [], tomorrowNotes: [], tasks: [], generatedTasks: [], notes: [] };
    const p = normalizePatient(raw);
    expect(p.order).toBe(0);
  });
});

// ─── inferUrgencyFromText ───

describe("inferUrgencyFromText", () => {
  it('returns "stat" for "STAT"', () => {
    expect(inferUrgencyFromText("STAT")).toBe("stat");
  });

  it('returns "stat" for "STAT" in a sentence', () => {
    expect(inferUrgencyFromText("STAT blood draw")).toBe("stat");
  });

  // NOTE: Hebrew-only keywords (דחוף, סטט, אורגנטי, בוקר) don't match
  // because the regex uses \b which doesn't work with Hebrew Unicode chars.
  // These return "routine" — this is a known limitation.
  it('returns "routine" for pure Hebrew urgency keywords (\\b limitation)', () => {
    expect(inferUrgencyFromText("דחוף")).toBe("routine");
    expect(inferUrgencyFromText("סטט")).toBe("routine");
    expect(inferUrgencyFromText("אורגנטי")).toBe("routine");
    expect(inferUrgencyFromText("בדיקה בבוקר")).toBe("routine");
  });

  it('returns "routine" for unrecognized text', () => {
    expect(inferUrgencyFromText("check vitals")).toBe("routine");
  });

  it('returns "routine" for empty string', () => {
    expect(inferUrgencyFromText("")).toBe("routine");
  });
});

// ─── reducer ───

describe("reducer", () => {
  describe("SET_SECTION", () => {
    it("changes the active section", () => {
      const state = makeState();
      const next = reducer(state, { type: "SET_SECTION", section: "SIDE_B" });
      expect(next.activeSection).toBe("SIDE_B");
    });
  });

  describe("TOGGLE_TASK", () => {
    it("toggles a task from done=false to done=true", () => {
      const task = makeTask({ id: "t1", done: false });
      const patient = makePatient({ id: "p1", tasks: [task] });
      const state = makeState([patient]);

      const next = reducer(state, { type: "TOGGLE_TASK", patientId: "p1", taskId: "t1" });
      const toggled = next.patients[0].tasks[0];
      expect(toggled.done).toBe(true);
      expect(toggled.doneTime).toBeTruthy();
    });

    it("toggles a task from done=true back to done=false", () => {
      const task = makeTask({ id: "t1", done: true, doneTime: "2025-01-01T00:00:00Z" });
      const patient = makePatient({ id: "p1", tasks: [task] });
      const state = makeState([patient]);

      const next = reducer(state, { type: "TOGGLE_TASK", patientId: "p1", taskId: "t1" });
      const toggled = next.patients[0].tasks[0];
      expect(toggled.done).toBe(false);
      expect(toggled.doneTime).toBeNull();
    });

    it("toggles generated tasks too", () => {
      const genTask = makeTask({ id: "g1", done: false, source: "generated" });
      const patient = makePatient({ id: "p1", generatedTasks: [genTask] });
      const state = makeState([patient]);

      const next = reducer(state, { type: "TOGGLE_TASK", patientId: "p1", taskId: "g1" });
      expect(next.patients[0].generatedTasks[0].done).toBe(true);
    });

    it("does not affect other patients", () => {
      const p1 = makePatient({ id: "p1", tasks: [makeTask({ id: "t1" })] });
      const p2 = makePatient({ id: "p2", tasks: [makeTask({ id: "t2" })] });
      const state = makeState([p1, p2]);

      const next = reducer(state, { type: "TOGGLE_TASK", patientId: "p1", taskId: "t1" });
      expect(next.patients[1].tasks[0].done).toBe(false);
    });
  });

  describe("SET_TASK_NOTE", () => {
    it("sets a note on a task", () => {
      const task = makeTask({ id: "t1" });
      const patient = makePatient({ id: "p1", tasks: [task] });
      const state = makeState([patient]);

      const next = reducer(state, {
        type: "SET_TASK_NOTE",
        patientId: "p1",
        taskId: "t1",
        note: "BS result: 250ml",
      });
      expect(next.patients[0].tasks[0].note).toBe("BS result: 250ml");
    });

    it("clears a note when set to null", () => {
      const task = makeTask({ id: "t1", note: "old note" } as any);
      const patient = makePatient({ id: "p1", tasks: [task] });
      const state = makeState([patient]);

      const next = reducer(state, {
        type: "SET_TASK_NOTE",
        patientId: "p1",
        taskId: "t1",
        note: null,
      });
      expect(next.patients[0].tasks[0].note).toBeNull();
    });

    it("sets note on generated tasks too", () => {
      const genTask = makeTask({ id: "g1", source: "generated" });
      const patient = makePatient({ id: "p1", generatedTasks: [genTask] });
      const state = makeState([patient]);

      const next = reducer(state, {
        type: "SET_TASK_NOTE",
        patientId: "p1",
        taskId: "g1",
        note: "done",
      });
      expect(next.patients[0].generatedTasks[0].note).toBe("done");
    });
  });

  describe("SET_TASK_DUE", () => {
    it("sets dueAt on a task", () => {
      const task = makeTask({ id: "t1" });
      const patient = makePatient({ id: "p1", tasks: [task] });
      const state = makeState([patient]);

      const next = reducer(state, {
        type: "SET_TASK_DUE",
        patientId: "p1",
        taskId: "t1",
        dueAt: "2025-06-01T10:00:00Z",
      });
      expect(next.patients[0].tasks[0].dueAt).toBe("2025-06-01T10:00:00Z");
    });

    it("clears dueAt when null", () => {
      const task = makeTask({ id: "t1", dueAt: "2025-06-01T10:00:00Z" } as any);
      const patient = makePatient({ id: "p1", tasks: [task] });
      const state = makeState([patient]);

      const next = reducer(state, {
        type: "SET_TASK_DUE",
        patientId: "p1",
        taskId: "t1",
        dueAt: null,
      });
      expect(next.patients[0].tasks[0].dueAt).toBeNull();
    });
  });

  describe("ADD_TASK", () => {
    it("adds a manual task to the correct patient", () => {
      const patient = makePatient({ id: "p1" });
      const state = makeState([patient]);

      const next = reducer(state, {
        type: "ADD_TASK",
        patientId: "p1",
        text: "בדוק לחץ דם",
      });
      expect(next.patients[0].tasks).toHaveLength(1);
      expect(next.patients[0].tasks[0].text).toBe("בדוק לחץ דם");
      expect(next.patients[0].tasks[0].source).toBe("manual");
    });

    it("infers urgency from text when not provided", () => {
      const patient = makePatient({ id: "p1" });
      const state = makeState([patient]);

      const next = reducer(state, {
        type: "ADD_TASK",
        patientId: "p1",
        text: "STAT blood draw",
      });
      expect(next.patients[0].tasks[0].urgency).toBe("stat");
    });

    it("uses provided urgency over inferred", () => {
      const patient = makePatient({ id: "p1" });
      const state = makeState([patient]);

      const next = reducer(state, {
        type: "ADD_TASK",
        patientId: "p1",
        text: "some task",
        urgency: "urgent",
      });
      expect(next.patients[0].tasks[0].urgency).toBe("urgent");
    });

    it("ignores empty text", () => {
      const patient = makePatient({ id: "p1" });
      const state = makeState([patient]);

      const next = reducer(state, {
        type: "ADD_TASK",
        patientId: "p1",
        text: "   ",
      });
      expect(next.patients[0].tasks).toHaveLength(0);
    });
  });

  describe("ADD_NOTE", () => {
    it("adds a note to the patient", () => {
      const patient = makePatient({ id: "p1", notes: [] });
      const state = makeState([patient]);

      const next = reducer(state, {
        type: "ADD_NOTE",
        patientId: "p1",
        text: "allergic to penicillin",
      });
      expect(next.patients[0].notes).toContain("allergic to penicillin");
    });

    it("does not add duplicate notes", () => {
      const patient = makePatient({ id: "p1", notes: ["existing note"] });
      const state = makeState([patient]);

      const next = reducer(state, {
        type: "ADD_NOTE",
        patientId: "p1",
        text: "existing note",
      });
      expect(next.patients[0].notes).toHaveLength(1);
    });

    it("ignores empty text", () => {
      const patient = makePatient({ id: "p1", notes: [] });
      const state = makeState([patient]);

      const next = reducer(state, {
        type: "ADD_NOTE",
        patientId: "p1",
        text: "  ",
      });
      expect(next.patients[0].notes).toHaveLength(0);
    });
  });

  describe("REMOVE_NOTE", () => {
    it("removes a note by index", () => {
      const patient = makePatient({ id: "p1", notes: ["note0", "note1", "note2"] });
      const state = makeState([patient]);

      const next = reducer(state, {
        type: "REMOVE_NOTE",
        patientId: "p1",
        index: 1,
      });
      expect(next.patients[0].notes).toEqual(["note0", "note2"]);
    });

    it("does nothing for out-of-bounds index", () => {
      const patient = makePatient({ id: "p1", notes: ["note0"] });
      const state = makeState([patient]);

      const next = reducer(state, {
        type: "REMOVE_NOTE",
        patientId: "p1",
        index: 5,
      });
      expect(next.patients[0].notes).toEqual(["note0"]);
    });

    it("does nothing for negative index", () => {
      const patient = makePatient({ id: "p1", notes: ["note0"] });
      const state = makeState([patient]);

      const next = reducer(state, {
        type: "REMOVE_NOTE",
        patientId: "p1",
        index: -1,
      });
      expect(next.patients[0].notes).toEqual(["note0"]);
    });
  });

  describe("ADD_LAB", () => {
    it("appends a lab entry", () => {
      const patient = makePatient({ id: "p1" });
      const state = makeState([patient]);
      const lab: LabEntry = {
        id: "lab-1",
        label: "Cr",
        value: 1.5,
        unit: "mg/dL",
        time: "2025-01-01T08:00:00Z",
      };

      const next = reducer(state, { type: "ADD_LAB", patientId: "p1", lab });
      expect(next.patients[0].labs).toHaveLength(1);
      expect(next.patients[0].labs![0].label).toBe("Cr");
    });
  });

  describe("REORDER_PATIENT", () => {
    it("moves a patient up within their section", () => {
      const p1 = makePatient({ id: "p1", section: "SIDE_A", order: 0 });
      const p2 = makePatient({ id: "p2", section: "SIDE_A", order: 1 });
      const state = makeState([p1, p2]);

      const next = reducer(state, {
        type: "REORDER_PATIENT",
        patientId: "p2",
        direction: "up",
      });
      expect(next.patients.find((p) => p.id === "p2")!.order).toBe(0);
      expect(next.patients.find((p) => p.id === "p1")!.order).toBe(1);
    });

    it("does not move first patient up", () => {
      const p1 = makePatient({ id: "p1", section: "SIDE_A", order: 0 });
      const state = makeState([p1]);

      const next = reducer(state, {
        type: "REORDER_PATIENT",
        patientId: "p1",
        direction: "up",
      });
      expect(next.patients[0].order).toBe(0);
    });

    it("does not affect patients in other sections", () => {
      const p1 = makePatient({ id: "p1", section: "SIDE_A", order: 0 });
      const p2 = makePatient({ id: "p2", section: "SIDE_B", order: 0 });
      const state = makeState([p1, p2]);

      const next = reducer(state, {
        type: "REORDER_PATIENT",
        patientId: "p1",
        direction: "down",
      });
      // p1 is the only patient in SIDE_A, so no swap happens
      expect(next.patients.find((p) => p.id === "p1")!.order).toBe(0);
    });
  });

  describe("EDIT_PATIENT", () => {
    it("updates patient name", () => {
      const patient = makePatient({ id: "p1", name: "Old Name" });
      const state = makeState([patient]);

      const next = reducer(state, {
        type: "EDIT_PATIENT",
        patientId: "p1",
        name: "New Name",
      });
      expect(next.patients[0].name).toBe("New Name");
    });

    it("updates patient room", () => {
      const patient = makePatient({ id: "p1", room: "101" });
      const state = makeState([patient]);

      const next = reducer(state, {
        type: "EDIT_PATIENT",
        patientId: "p1",
        room: "202",
      });
      expect(next.patients[0].room).toBe("202");
    });

    it("updates patient section", () => {
      const patient = makePatient({ id: "p1", section: "SIDE_A" });
      const state = makeState([patient]);

      const next = reducer(state, {
        type: "EDIT_PATIENT",
        patientId: "p1",
        section: "SIDE_B",
      });
      expect(next.patients[0].section).toBe("SIDE_B");
    });

    it("updates diagnosis", () => {
      const patient = makePatient({ id: "p1", diagnosis: null });
      const state = makeState([patient]);

      const next = reducer(state, {
        type: "EDIT_PATIENT",
        patientId: "p1",
        diagnosis: "דלקת ריאות",
      });
      expect(next.patients[0].diagnosis).toBe("דלקת ריאות");
    });

    it("does not modify unspecified fields", () => {
      const patient = makePatient({ id: "p1", name: "Test", room: "101", diagnosis: "DM" });
      const state = makeState([patient]);

      const next = reducer(state, {
        type: "EDIT_PATIENT",
        patientId: "p1",
        name: "Updated",
      });
      expect(next.patients[0].name).toBe("Updated");
      expect(next.patients[0].room).toBe("101");
      expect(next.patients[0].diagnosis).toBe("DM");
    });
  });

  describe("REMOVE_PATIENT", () => {
    it("removes the correct patient", () => {
      const p1 = makePatient({ id: "p1" });
      const p2 = makePatient({ id: "p2" });
      const state = makeState([p1, p2]);

      const next = reducer(state, { type: "REMOVE_PATIENT", patientId: "p1" });
      expect(next.patients).toHaveLength(1);
      expect(next.patients[0].id).toBe("p2");
    });

    it("does nothing for non-existent patient", () => {
      const patient = makePatient({ id: "p1" });
      const state = makeState([patient]);

      const next = reducer(state, { type: "REMOVE_PATIENT", patientId: "p999" });
      expect(next.patients).toHaveLength(1);
    });
  });

  describe("ARCHIVE_SHIFT", () => {
    it("creates a shift snapshot", () => {
      const patient = makePatient({ id: "p1" });
      const state = makeState([patient]);

      const next = reducer(state, { type: "ARCHIVE_SHIFT", label: "19/02 — ערב" });
      expect(next.shiftHistory).toHaveLength(1);
      expect(next.shiftHistory[0].label).toBe("19/02 — ערב");
      expect(next.shiftHistory[0].patients).toHaveLength(1);
    });

    it("adds new shift to history", () => {
      const state = makeState([], {
        shiftHistory: Array.from({ length: 5 }, (_, i) => ({
          id: `shift-${i}`,
          date: "2025-01-01",
          label: `Shift ${i}`,
          patients: [],
          archivedAt: "2025-01-01T00:00:00Z",
        })),
      });

      const next = reducer(state, { type: "ARCHIVE_SHIFT", label: "New Shift" });
      expect(next.shiftHistory).toHaveLength(6);
      expect(next.shiftHistory[0].label).toBe("New Shift");
    });

    it("newest shift is first in array", () => {
      const state = makeState([], {
        shiftHistory: [
          { id: "old", date: "2025-01-01", label: "Old", patients: [], archivedAt: "2025-01-01" },
        ],
      });

      const next = reducer(state, { type: "ARCHIVE_SHIFT", label: "New" });
      expect(next.shiftHistory[0].label).toBe("New");
      expect(next.shiftHistory[1].label).toBe("Old");
    });
  });

  describe("RESTORE_SHIFT", () => {
    it("restores patients from a snapshot", () => {
      const archivedPatient = makePatient({ id: "archived-1", name: "Archived" });
      const state = makeState([makePatient({ id: "current-1" })], {
        shiftHistory: [
          {
            id: "snap-1",
            date: "2025-01-01",
            label: "Old shift",
            patients: [archivedPatient],
            archivedAt: "2025-01-01T00:00:00Z",
          },
        ],
      });

      const next = reducer(state, { type: "RESTORE_SHIFT", snapshotId: "snap-1" });
      expect(next.patients).toHaveLength(1);
      expect(next.patients[0].name).toBe("Archived");
    });

    it("does nothing for non-existent snapshot", () => {
      const state = makeState([makePatient({ id: "p1" })]);
      const next = reducer(state, { type: "RESTORE_SHIFT", snapshotId: "nope" });
      expect(next.patients).toHaveLength(1);
      expect(next.patients[0].id).toBe("p1");
    });
  });

  describe("DELETE_SHIFT", () => {
    it("removes the correct shift", () => {
      const state = makeState([], {
        shiftHistory: [
          { id: "s1", date: "d", label: "Shift 1", patients: [], archivedAt: "d" },
          { id: "s2", date: "d", label: "Shift 2", patients: [], archivedAt: "d" },
        ],
      });

      const next = reducer(state, { type: "DELETE_SHIFT", snapshotId: "s1" });
      expect(next.shiftHistory).toHaveLength(1);
      expect(next.shiftHistory[0].id).toBe("s2");
    });
  });

  describe("TOGGLE_DARK_MODE", () => {
    it("toggles dark mode on", () => {
      const state = makeState([], { darkMode: false });
      const next = reducer(state, { type: "TOGGLE_DARK_MODE" });
      expect(next.darkMode).toBe(true);
    });

    it("toggles dark mode off", () => {
      const state = makeState([], { darkMode: true });
      const next = reducer(state, { type: "TOGGLE_DARK_MODE" });
      expect(next.darkMode).toBe(false);
    });
  });

  describe("TOGGLE_SHOW_TOMORROW", () => {
    it("toggles showTomorrow", () => {
      const state = makeState([], { showTomorrow: false });
      const next = reducer(state, { type: "TOGGLE_SHOW_TOMORROW" });
      expect(next.showTomorrow).toBe(true);
    });
  });

  describe("CLEAR_ALL", () => {
    it("empties the patients array", () => {
      const state = makeState([makePatient(), makePatient({ id: "p2" })]);
      const next = reducer(state, { type: "CLEAR_ALL" });
      expect(next.patients).toHaveLength(0);
    });

    it("preserves other state fields", () => {
      const state = makeState([makePatient()], { darkMode: true, activeSection: "SIDE_B" });
      const next = reducer(state, { type: "CLEAR_ALL" });
      expect(next.darkMode).toBe(true);
      expect(next.activeSection).toBe("SIDE_B");
    });
  });

  describe("IMPORT_TEXT", () => {
    it("parses and adds patients from text", () => {
      const state = makeState();
      const next = reducer(state, {
        type: "IMPORT_TEXT",
        text: "101 כהן יוסף 72 דלקת ריאות",
      });
      expect(next.patients.length).toBeGreaterThanOrEqual(1);
      expect(next.patients[0].name).toBe("כהן יוסף");
    });

    it("merges with existing patients on rescan", () => {
      const state = makeState();
      const first = reducer(state, {
        type: "IMPORT_TEXT",
        text: "101 כהן יוסף 72",
      });
      const originalId = first.patients[0].id;

      const second = reducer(first, {
        type: "IMPORT_TEXT",
        text: "101 כהן יוסף 72",
      });
      expect(second.patients).toHaveLength(1);
      expect(second.patients[0].id).toBe(originalId);
    });
  });
});

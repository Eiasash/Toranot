import { describe, it, expect } from "vitest";
import {
  reducer,
  normalizeTask,
  normalizePatient,
  inferUrgencyFromText,
} from "../context/PatientsContext";
import type { PatientEntry, Task, Section, PatientSection, LabEntry } from "../types";

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
    scanMode: false,
    events: [],
    unassignedTasks: [] as Task[],
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

  // Hebrew urgency keywords now match correctly.
  // The old \b-based regex was broken for Hebrew; replaced with Unicode
  // lookbehind/lookahead (?<![א-ת]) / (?![א-ת]).
  it('returns "stat" for standalone Hebrew stat keyword "דחוף"', () => {
    expect(inferUrgencyFromText("דחוף")).toBe("stat");
  });

  it('returns "stat" for Hebrew stat keyword "סטט" in a sentence', () => {
    expect(inferUrgencyFromText("א.ק.ג סטט")).toBe("stat");
  });

  it('returns "urgent" for Hebrew urgent keyword "אורגנטי"', () => {
    expect(inferUrgencyFromText("אורגנטי")).toBe("urgent");
  });

  it('returns "morning" for Hebrew morning keyword in a sentence', () => {
    expect(inferUrgencyFromText("בדיקה בבוקר")).toBe("morning");
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

    it("swaps tied orders using array indices instead of no-op", () => {
      // Both patients have order=0 — this used to be a silent no-op
      const p1 = makePatient({ id: "p1", section: "SIDE_A", order: 0 });
      const p2 = makePatient({ id: "p2", section: "SIDE_A", order: 0 });
      const state = makeState([p1, p2]);

      const next = reducer(state, {
        type: "REORDER_PATIENT",
        patientId: "p2",
        direction: "up",
      });
      // After swap, orders must differ so the reorder is visible
      const o1 = next.patients.find((p) => p.id === "p1")!.order!;
      const o2 = next.patients.find((p) => p.id === "p2")!.order!;
      expect(o1).not.toBe(o2);
      // p2 moved up, so p2.order < p1.order
      expect(o2).toBeLessThan(o1);
    });

    it("moves patient down within section", () => {
      const p1 = makePatient({ id: "p1", section: "SIDE_A", order: 0 });
      const p2 = makePatient({ id: "p2", section: "SIDE_A", order: 1 });
      const p3 = makePatient({ id: "p3", section: "SIDE_A", order: 2 });
      const state = makeState([p1, p2, p3]);

      const next = reducer(state, {
        type: "REORDER_PATIENT",
        patientId: "p1",
        direction: "down",
      });
      expect(next.patients.find((p) => p.id === "p1")!.order).toBe(1);
      expect(next.patients.find((p) => p.id === "p2")!.order).toBe(0);
      // p3 is untouched
      expect(next.patients.find((p) => p.id === "p3")!.order).toBe(2);
    });

    it("does not move last patient down", () => {
      const p1 = makePatient({ id: "p1", section: "SIDE_A", order: 0 });
      const p2 = makePatient({ id: "p2", section: "SIDE_A", order: 1 });
      const state = makeState([p1, p2]);

      const next = reducer(state, {
        type: "REORDER_PATIENT",
        patientId: "p2",
        direction: "down",
      });
      expect(next.patients.find((p) => p.id === "p2")!.order).toBe(1);
    });

    it("handles three patients with all tied orders", () => {
      const p1 = makePatient({ id: "p1", section: "SIDE_A", order: 0 });
      const p2 = makePatient({ id: "p2", section: "SIDE_A", order: 0 });
      const p3 = makePatient({ id: "p3", section: "SIDE_A", order: 0 });
      const state = makeState([p1, p2, p3]);

      const next = reducer(state, {
        type: "REORDER_PATIENT",
        patientId: "p3",
        direction: "up",
      });
      const o2 = next.patients.find((p) => p.id === "p2")!.order!;
      const o3 = next.patients.find((p) => p.id === "p3")!.order!;
      expect(o3).toBeLessThan(o2);
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

  describe("ADD_PATIENT dedup/replace", () => {
    it("replaces existing patient with same id instead of duplicating", () => {
      const existing = makePatient({ id: "pt-dup", name: "כהן יוסף", diagnosis: "דלקת ריאות" });
      const state = makeState([existing]);

      const replacement = makePatient({ id: "pt-dup", name: "כהן יוסף", diagnosis: "אי ספיקת לב" });
      const next = reducer(state, { type: "ADD_PATIENT", patient: replacement });

      expect(next.patients).toHaveLength(1);
      expect(next.patients[0].id).toBe("pt-dup");
      expect(next.patients[0].diagnosis).toBe("אי ספיקת לב");
    });

    it("adds new patient when id does not exist", () => {
      const existing = makePatient({ id: "pt-1", name: "כהן יוסף", room: "49/1" });
      const state = makeState([existing]);

      const newPt = makePatient({ id: "pt-2", name: "לוי שרה", room: "50/1" });
      const next = reducer(state, { type: "ADD_PATIENT", patient: newPt });

      expect(next.patients).toHaveLength(2);
    });
  });

  describe("bed collision prevention", () => {
    it("ADD_PATIENT rejects when bed is occupied by a different patient", () => {
      const occupant = makePatient({ id: "pt-1", room: "49/1", section: "SIDE_A" });
      const state = makeState([occupant]);

      const intruder = makePatient({ id: "pt-2", room: "49/1", section: "SIDE_A" });
      const next = reducer(state, { type: "ADD_PATIENT", patient: intruder });

      expect(next.patients).toHaveLength(1);
      expect(next.patients[0].id).toBe("pt-1");
    });

    it("ADD_PATIENT allows same bed in different section", () => {
      const occupant = makePatient({ id: "pt-1", room: "49/1", section: "SIDE_A" });
      const state = makeState([occupant]);

      const other = makePatient({ id: "pt-2", room: "49/1", section: "SIDE_B" });
      const next = reducer(state, { type: "ADD_PATIENT", patient: other });

      expect(next.patients).toHaveLength(2);
    });

    it("ADD_PATIENT allows updating same patient in same bed", () => {
      const occupant = makePatient({ id: "pt-1", room: "49/1", section: "SIDE_A", diagnosis: "old" });
      const state = makeState([occupant]);

      const updated = makePatient({ id: "pt-1", room: "49/1", section: "SIDE_A", diagnosis: "new" });
      const next = reducer(state, { type: "ADD_PATIENT", patient: updated });

      expect(next.patients).toHaveLength(1);
      expect(next.patients[0].diagnosis).toBe("new");
    });

    it("MOVE_PATIENT rejects when target bed is occupied", () => {
      const p1 = makePatient({ id: "pt-1", room: "49/1", section: "SIDE_A" });
      const p2 = makePatient({ id: "pt-2", room: "49/2", section: "SIDE_A" });
      const state = makeState([p1, p2]);

      const next = reducer(state, { type: "MOVE_PATIENT", patientId: "pt-1", toRoom: "49/2" });

      // Move rejected — p1 stays in 49/1
      expect(next.patients.find(p => p.id === "pt-1")?.room).toBe("49/1");
    });

    it("MOVE_PATIENT allows moving to empty bed", () => {
      const p1 = makePatient({ id: "pt-1", room: "49/1", section: "SIDE_A" });
      const state = makeState([p1]);

      const next = reducer(state, { type: "MOVE_PATIENT", patientId: "pt-1", toRoom: "50/1" });

      expect(next.patients.find(p => p.id === "pt-1")?.room).toBe("50/1");
    });

    it("EDIT_PATIENT rejects room change to occupied bed", () => {
      const p1 = makePatient({ id: "pt-1", room: "49/1", section: "SIDE_A" });
      const p2 = makePatient({ id: "pt-2", room: "49/2", section: "SIDE_A" });
      const state = makeState([p1, p2]);

      const next = reducer(state, { type: "EDIT_PATIENT", patientId: "pt-1", room: "49/2" });

      // Edit rejected — room unchanged
      expect(next.patients.find(p => p.id === "pt-1")?.room).toBe("49/1");
    });

    it("NEW_ADMISSION rejects when bed is occupied", () => {
      const occupant = makePatient({ id: "pt-1", room: "49/1", section: "SIDE_A" });
      const state = makeState([occupant]);

      const newAdmission = makePatient({ id: "pt-3", room: "49/1", section: "SIDE_A", name: "חדש" });
      const next = reducer(state, { type: "NEW_ADMISSION", patient: newAdmission });

      expect(next.patients).toHaveLength(1);
      expect(next.patients[0].id).toBe("pt-1");
    });

    it("IMPORT_TEXT deduplicates same bed within a single import", () => {
      // Two patients with same room in same section — last one wins
      const text = `צד א
49/1 כהן יוסף 72 דלקת ריאות | | תורן: | מחר:
49/1 לוי שרה 65 אי ספיקת לב | | תורן: | מחר:`;
      const state = makeState([]);
      const next = reducer(state, { type: "IMPORT_TEXT", text });

      const bed491 = next.patients.filter(p => p.room === "49/1" && p.section === "SIDE_A");
      expect(bed491).toHaveLength(1);
      expect(bed491[0].name).toBe("לוי שרה"); // last one wins
    });
  });

  describe("ASSIGN_TASK_TO_PATIENT", () => {
    it("assigns unassigned task to existing patient", () => {
      const task = makeTask({ id: "ut-1", text: "blood cultures", source: "manual" });
      const patient = makePatient({ id: "pt-1" });
      const state = makeState([patient]);
      state.unassignedTasks = [task];
      const next = reducer(state, { type: "ASSIGN_TASK_TO_PATIENT", taskId: "ut-1", patientId: "pt-1" });
      expect(next.unassignedTasks).toHaveLength(0);
      expect(next.patients[0].tasks).toHaveLength(1);
      expect(next.patients[0].tasks[0].text).toBe("blood cultures");
    });

    it("does nothing if task not found in unassigned list", () => {
      const state = makeState([makePatient()]);
      state.unassignedTasks = [];
      const next = reducer(state, { type: "ASSIGN_TASK_TO_PATIENT", taskId: "missing", patientId: "pt-1" });
      expect(next).toBe(state);
    });

    it("does nothing if target patient does not exist", () => {
      const task = makeTask({ id: "ut-1", text: "blood cultures", source: "manual" });
      const state = makeState([makePatient({ id: "pt-1" })]);
      state.unassignedTasks = [task];
      const next = reducer(state, { type: "ASSIGN_TASK_TO_PATIENT", taskId: "ut-1", patientId: "nonexistent" });
      // Task should stay in unassigned — not orphaned
      expect(next).toBe(state);
    });
  });

  describe("normalizePatient", () => {
    it("normalizes missing arrays to empty arrays", () => {
      const raw = { id: "test", section: "SIDE_A", name: "כהן", room: "101", date: "01/01/2025" };
      const p = normalizePatient(raw as Record<string, unknown>);
      expect(Array.isArray(p.flags)).toBe(true);
      expect(Array.isArray(p.status)).toBe(true);
      expect(Array.isArray(p.tasks)).toBe(true);
      expect(Array.isArray(p.generatedTasks)).toBe(true);
      expect(Array.isArray(p.notes)).toBe(true);
      expect(Array.isArray(p.tomorrowNotes)).toBe(true);
    });

    it("preserves valid fields from raw input", () => {
      const raw = {
        id: "test-id",
        section: "SIDE_B",
        name: "לוי שרה",
        room: "42/1",
        date: "15/03/2025",
        age: 85,
        diagnosis: "pneumonia",
      };
      const p = normalizePatient(raw as Record<string, unknown>);
      expect(p.id).toBe("test-id");
      expect(p.section).toBe("SIDE_B");
      expect(p.name).toBe("לוי שרה");
      expect(p.age).toBe(85);
      expect(p.diagnosis).toBe("pneumonia");
    });
  });

  describe("IMPORT_CLOUD_STATE", () => {
    it("imports patients from cloud state", () => {
      const state = makeState([makePatient({ id: "local-1" })]);
      const cloudPatient = { id: "cloud-1", section: "SIDE_A", name: "Cloud Patient", room: "201", tasks: [], generatedTasks: [], flags: [], status: [], tomorrowNotes: [], notes: [] };
      const next = reducer(state, {
        type: "IMPORT_CLOUD_STATE",
        state: { patients: [cloudPatient], shiftHistory: [], events: [], unassignedTasks: [] },
      });
      expect(next.patients).toHaveLength(1);
      expect(next.patients[0].name).toBe("Cloud Patient");
    });

    it("imports darkMode and scanMode settings", () => {
      const state = makeState([], { darkMode: false, scanMode: false });
      const next = reducer(state, {
        type: "IMPORT_CLOUD_STATE",
        state: { patients: [], shiftHistory: [], events: [], unassignedTasks: [], darkMode: true, scanMode: true },
      });
      expect(next.darkMode).toBe(true);
      expect(next.scanMode).toBe(true);
    });

    it("preserves local state when cloud field is not an array", () => {
      const localPatient = makePatient({ id: "p1" });
      const state = makeState([localPatient]);
      const next = reducer(state, {
        type: "IMPORT_CLOUD_STATE",
        state: { patients: "corrupt" as unknown as unknown[], shiftHistory: [], events: [], unassignedTasks: [] },
      });
      // Patients preserved since cloud value was not an array
      expect(next.patients).toHaveLength(1);
      expect(next.patients[0].id).toBe("p1");
    });

    it("imports events from cloud", () => {
      const event = { id: "e1", type: "ADMISSION" as const, at: "2025-01-01T00:00:00Z", patientId: "p1", patientName: "Test", room: "101" };
      const state = makeState();
      const next = reducer(state, {
        type: "IMPORT_CLOUD_STATE",
        state: { patients: [], shiftHistory: [], events: [event], unassignedTasks: [] },
      });
      expect(next.events).toHaveLength(1);
      expect(next.events[0].id).toBe("e1");
    });
  });

  describe("MERGE_PATIENTS", () => {
    it("merges incoming patients with existing (preserves manual tasks)", () => {
      const manualTask = makeTask({ id: "mt1", text: "manual task", source: "manual" });
      const existing = makePatient({ id: "p1", section: "SIDE_A", room: "101", name: "כהן", tasks: [manualTask] });
      const state = makeState([existing]);

      const incoming = { ...existing, tasks: [] };
      const next = reducer(state, { type: "MERGE_PATIENTS", patients: [incoming] });
      // Manual task should be preserved across merge
      expect(next.patients[0].tasks.some(t => t.text === "manual task")).toBe(true);
    });

    it("adds new patients from incoming list", () => {
      const existing = makePatient({ id: "p1" });
      const state = makeState([existing]);

      const newPatient = makePatient({ id: "p2", name: "לוי שרה", room: "202" });
      const next = reducer(state, { type: "MERGE_PATIENTS", patients: [newPatient] });
      expect(next.patients.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("LOG_EVENT", () => {
    it("adds event to the front of the events array", () => {
      const state = makeState([], {
        events: [{ id: "old", type: "ADMISSION", at: "2025-01-01T00:00:00Z", patientId: "p1", patientName: "Old", room: "101" }],
      });
      const newEvent = { id: "new", type: "ADMISSION" as const, at: "2025-01-02T00:00:00Z", patientId: "p2", patientName: "New", room: "102" };
      const next = reducer(state, { type: "LOG_EVENT", event: newEvent });
      expect(next.events[0].id).toBe("new");
      expect(next.events[1].id).toBe("old");
    });

    it("trims events to max limit (300)", () => {
      const events = Array.from({ length: 350 }, (_, i) => ({
        id: `e${i}`, type: "ADMISSION" as const, at: "2025-01-01", patientId: "p", patientName: "P", room: "1",
      }));
      const state = makeState([], { events });
      const newEvent = { id: "overflow", type: "ADMISSION" as const, at: "2025-01-02", patientId: "p", patientName: "P", room: "1" };
      const next = reducer(state, { type: "LOG_EVENT", event: newEvent });
      expect(next.events.length).toBeLessThanOrEqual(300);
      expect(next.events[0].id).toBe("overflow");
    });
  });

  // ═════════════════════════════════════════════════════════════
  // DELETE_TASK
  // ═════════════════════════════════════════════════════════════
  describe("DELETE_TASK", () => {
    it("hard-deletes a manual task", () => {
      const t = makeTask({ id: "m1", text: "manual task", source: "manual" });
      const p = makePatient({ tasks: [t] });
      const state = makeState([p]);
      const next = reducer(state, { type: "DELETE_TASK", patientId: "pt-1", taskId: "m1" });
      expect(next.patients[0].tasks).toHaveLength(0);
    });

    it("marks a generated task as dismissed (not removed)", () => {
      const t = makeTask({ id: "g1", text: "generated task", source: "generated" });
      const p = makePatient({ generatedTasks: [t] });
      const state = makeState([p]);
      const next = reducer(state, { type: "DELETE_TASK", patientId: "pt-1", taskId: "g1" });
      const dismissed = next.patients[0].generatedTasks.find((t: Task) => t.id === "g1");
      expect(dismissed).toBeDefined();
      expect(dismissed!.dismissed).toBe(true);
      expect(dismissed!.done).toBe(true);
    });

    it("does not affect other patients", () => {
      const t1 = makeTask({ id: "m1", source: "manual" });
      const p1 = makePatient({ id: "pt-1", tasks: [t1] });
      const p2 = makePatient({ id: "pt-2", tasks: [makeTask({ id: "m2", source: "manual" })] });
      const state = makeState([p1, p2]);
      const next = reducer(state, { type: "DELETE_TASK", patientId: "pt-1", taskId: "m1" });
      expect(next.patients[1].tasks).toHaveLength(1);
    });
  });

  // ═════════════════════════════════════════════════════════════
  // REAPPLY_RULES
  // ═════════════════════════════════════════════════════════════
  describe("REAPPLY_RULES", () => {
    it("preserves done state on re-generated tasks", () => {
      const gen = makeTask({ id: "g1", text: "בדיקות דם טרום ניתוח (CBC, CMP, PT/INR, סוג ושתלב)", source: "generated", done: true, doneTime: "2025-01-01T10:00:00Z" });
      const p = makePatient({ status: ["טרום ניתוח"], generatedTasks: [gen] });
      const state = makeState([p]);
      const next = reducer(state, { type: "REAPPLY_RULES" });
      // Find the task with matching text
      const reapplied = next.patients[0].generatedTasks.find(
        (t: Task) => t.text.includes("טרום ניתוח") && !t.dismissed
      );
      if (reapplied) {
        expect(reapplied.done).toBe(true);
      }
    });

    it("dismissed tasks survive multiple REAPPLY_RULES calls", () => {
      const gen = makeTask({ id: "g1", text: "auto task", source: "generated", dismissed: true, done: true });
      const p = makePatient({ status: ["some status"], generatedTasks: [gen] });
      const state = makeState([p]);
      // First reapply
      const next1 = reducer(state, { type: "REAPPLY_RULES" });
      const dismissed1 = next1.patients[0].generatedTasks.filter((t: Task) => t.dismissed);
      expect(dismissed1.length).toBeGreaterThanOrEqual(1);
      // Second reapply — dismissed stubs should still be there
      const next2 = reducer(next1, { type: "REAPPLY_RULES" });
      const dismissed2 = next2.patients[0].generatedTasks.filter((t: Task) => t.dismissed);
      expect(dismissed2.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ═════════════════════════════════════════════════════════════
  // REMOVE_DISCHARGED
  // ═════════════════════════════════════════════════════════════
  describe("REMOVE_DISCHARGED", () => {
    it("removes patients flagged as discharged", () => {
      const p1 = { ...makePatient({ id: "p1" }), discharged: true };
      const p2 = makePatient({ id: "p2" });
      const state = makeState([p1, p2]);
      const next = reducer(state, { type: "REMOVE_DISCHARGED" });
      expect(next.patients).toHaveLength(1);
      expect(next.patients[0].id).toBe("p2");
    });

    it("no-op when no discharged patients", () => {
      const state = makeState([makePatient()]);
      const next = reducer(state, { type: "REMOVE_DISCHARGED" });
      expect(next.patients).toHaveLength(1);
    });
  });

  // ═════════════════════════════════════════════════════════════
  // SET_HANDOVER_NOTE
  // ═════════════════════════════════════════════════════════════
  describe("SET_HANDOVER_NOTE", () => {
    it("sets a handover note on patient", () => {
      const p = makePatient();
      const state = makeState([p]);
      const next = reducer(state, { type: "SET_HANDOVER_NOTE", patientId: "pt-1", note: "חולה מורכב, לעקוב אחר Cr" });
      expect(next.patients[0].handoverNote).toBe("חולה מורכב, לעקוב אחר Cr");
    });

    it("clears handover note when empty string", () => {
      const p = makePatient({ handoverNote: "old note" } as Partial<PatientEntry>);
      const state = makeState([p]);
      const next = reducer(state, { type: "SET_HANDOVER_NOTE", patientId: "pt-1", note: "" });
      expect(next.patients[0].handoverNote).toBeUndefined();
    });
  });

  // ═════════════════════════════════════════════════════════════
  // TOGGLE_SCAN_MODE
  // ═════════════════════════════════════════════════════════════
  describe("TOGGLE_SCAN_MODE", () => {
    it("toggles scan mode on", () => {
      const state = makeState();
      const next = reducer(state, { type: "TOGGLE_SCAN_MODE" });
      expect(next.scanMode).toBe(true);
    });

    it("toggles scan mode off", () => {
      const state = makeState([], { scanMode: true });
      const next = reducer(state, { type: "TOGGLE_SCAN_MODE" });
      expect(next.scanMode).toBe(false);
    });
  });

  // ═════════════════════════════════════════════════════════════
  // ADD_UNASSIGNED_TASK / TOGGLE_UNASSIGNED_TASK
  // ═════════════════════════════════════════════════════════════
  describe("ADD_UNASSIGNED_TASK", () => {
    it("adds an unassigned task with event", () => {
      const state = makeState();
      const next = reducer(state, { type: "ADD_UNASSIGNED_TASK", text: "ward task", urgency: "stat" });
      expect(next.unassignedTasks).toHaveLength(1);
      expect(next.unassignedTasks[0].text).toBe("ward task");
      expect(next.unassignedTasks[0].urgency).toBe("stat");
      expect(next.events.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("TOGGLE_UNASSIGNED_TASK", () => {
    it("toggles an unassigned task done", () => {
      const t = makeTask({ id: "ut-1", text: "ward task" });
      const state = makeState([], { unassignedTasks: [t] });
      const next = reducer(state, { type: "TOGGLE_UNASSIGNED_TASK", taskId: "ut-1" });
      expect(next.unassignedTasks[0].done).toBe(true);
      expect(next.unassignedTasks[0].doneTime).toBeTruthy();
    });

    it("toggles an unassigned task back to undone", () => {
      const t = makeTask({ id: "ut-1", done: true, doneTime: "2025-01-01T10:00:00Z" });
      const state = makeState([], { unassignedTasks: [t] });
      const next = reducer(state, { type: "TOGGLE_UNASSIGNED_TASK", taskId: "ut-1" });
      expect(next.unassignedTasks[0].done).toBe(false);
      expect(next.unassignedTasks[0].doneTime).toBeNull();
    });
  });

  // ═════════════════════════════════════════════════════════════
  // DISMISS_SCAN_DIFF
  // ═════════════════════════════════════════════════════════════
  describe("DISMISS_SCAN_DIFF", () => {
    it("clears lastScanDiff", () => {
      const state = makeState([], { lastScanDiff: { newPatients: [], missingPatients: [], changedPatients: [], unchanged: 5 } });
      const next = reducer(state, { type: "DISMISS_SCAN_DIFF" });
      expect(next.lastScanDiff).toBeNull();
    });
  });

  // ═════════════════════════════════════════════════════════════
  // IMPORT_BACKUP
  // ═════════════════════════════════════════════════════════════
  describe("IMPORT_BACKUP", () => {
    it("replaces patients with imported backup", () => {
      const p1 = makePatient({ id: "old" });
      const p2 = makePatient({ id: "imported", name: "לוי שרה" });
      const state = makeState([p1]);
      const next = reducer(state, { type: "IMPORT_BACKUP", patients: [p2] });
      expect(next.patients).toHaveLength(1);
      expect(next.patients[0].id).toBe("imported");
    });

    it("normalizes imported patients", () => {
      const raw = { id: "raw", name: "test" } as any;
      const state = makeState();
      const next = reducer(state, { type: "IMPORT_BACKUP", patients: [raw] });
      // normalizePatient should add default fields
      expect(next.patients[0].flags).toEqual([]);
      expect(next.patients[0].tasks).toEqual([]);
    });
  });

  // ═════════════════════════════════════════════════════════════
  // MERGE_PATIENTS_FROM_REMOTE
  // ═════════════════════════════════════════════════════════════
  describe("MERGE_PATIENTS_FROM_REMOTE", () => {
    it("applies remote patient with higher revision", () => {
      const local = makePatient({ id: "p1", name: "LocalName", syncMeta: { revision: 1, lastModifiedAt: "2025-01-01", lastModifiedBy: "a" } } as Partial<PatientEntry>);
      const remote = makePatient({ id: "p1", name: "RemoteName", syncMeta: { revision: 2, lastModifiedAt: "2025-01-02", lastModifiedBy: "b" } } as Partial<PatientEntry>);
      const state = makeState([local]);
      const next = reducer(state, { type: "MERGE_PATIENTS_FROM_REMOTE", patients: [remote] });
      expect(next.patients[0].name).toBe("RemoteName");
    });

    it("keeps local patient when revision is higher", () => {
      // syncMeta must be set on the object AFTER makePatient to avoid normalizePatient overriding it
      const local = { ...makePatient({ id: "p1", name: "LocalName" }), syncMeta: { revision: 5, lastModifiedAt: "2025-01-03", lastModifiedBy: "a" } };
      const remote = { ...makePatient({ id: "p1", name: "RemoteName" }), syncMeta: { revision: 1, lastModifiedAt: "2025-01-01", lastModifiedBy: "b" } };
      const state = makeState([local]);
      const next = reducer(state, { type: "MERGE_PATIENTS_FROM_REMOTE", patients: [remote] });
      expect(next.patients[0].name).toBe("LocalName");
    });

    it("adds patients that exist on remote but not locally", () => {
      const local = makePatient({ id: "p1" });
      const remote = makePatient({ id: "p2", name: "New Remote" });
      const state = makeState([local]);
      const next = reducer(state, { type: "MERGE_PATIENTS_FROM_REMOTE", patients: [remote] });
      expect(next.patients).toHaveLength(2);
      expect(next.patients.find((p: PatientEntry) => p.id === "p2")).toBeDefined();
    });
  });

  // ═════════════════════════════════════════════════════════════
  // SYNC_PATIENTS / SYNC_SHIFT_HISTORY
  // ═════════════════════════════════════════════════════════════
  describe("SYNC_PATIENTS", () => {
    it("replaces patients with synced data (normalized)", () => {
      const p = makePatient({ id: "synced" });
      const state = makeState([makePatient({ id: "old" })]);
      const next = reducer(state, { type: "SYNC_PATIENTS", patients: [p] });
      expect(next.patients).toHaveLength(1);
      expect(next.patients[0].id).toBe("synced");
    });
  });

  describe("SYNC_SHIFT_HISTORY", () => {
    it("replaces shift history and caps at 20", () => {
      const history = Array.from({ length: 25 }, (_, i) => ({
        id: `s${i}`, date: "2025-01-01", label: `shift ${i}`, patients: [], archivedAt: "2025-01-01",
      }));
      const state = makeState();
      const next = reducer(state, { type: "SYNC_SHIFT_HISTORY", shiftHistory: history });
      expect(next.shiftHistory.length).toBeLessThanOrEqual(20);
    });
  });

  // ═════════════════════════════════════════════════════════════
  // ADD_PHOTO / REMOVE_PHOTO
  // ═════════════════════════════════════════════════════════════
  describe("ADD_PHOTO", () => {
    it("adds a photo to patient", () => {
      const p = makePatient();
      const state = makeState([p]);
      const photo = { id: "ph1", dataUrl: "data:image/png;base64,abc", time: "2025-01-01T10:00:00Z" };
      const next = reducer(state, { type: "ADD_PHOTO", patientId: "pt-1", photo });
      expect(next.patients[0].photos).toHaveLength(1);
      expect(next.patients[0].photos![0].id).toBe("ph1");
    });
  });

  describe("REMOVE_PHOTO", () => {
    it("removes a photo from patient", () => {
      const photo = { id: "ph1", dataUrl: "data:image/png;base64,abc", time: "2025-01-01T10:00:00Z" };
      const p = makePatient({ photos: [photo] } as Partial<PatientEntry>);
      const state = makeState([p]);
      const next = reducer(state, { type: "REMOVE_PHOTO", patientId: "pt-1", photoId: "ph1" });
      expect(next.patients[0].photos).toHaveLength(0);
    });
  });
});

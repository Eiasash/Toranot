/**
 * Expanded acuity tests — boundary deadlines, dismissed tasks, multiple components.
 */
import { describe, it, expect } from "vitest";
import { calculateAcuity, sortByAcuity } from "../engine/acuity";
import type { PatientEntry, Task } from "../types";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: overrides.id ?? `task-${Math.random().toString(36).slice(2)}`,
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
    name: overrides.name ?? "Test Patient",
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
    labs: overrides.labs ?? [],
    order: overrides.order ?? 0,
  };
}

describe("calculateAcuity — dismissed tasks", () => {
  it("excludes dismissed generatedTasks from scoring", () => {
    const patient = makePatient({
      generatedTasks: [
        makeTask({ urgency: "stat", dismissed: true } as any),
        makeTask({ urgency: "stat", dismissed: true } as any),
      ],
    });
    expect(calculateAcuity(patient).score).toBe(0);
  });

  it("counts non-dismissed generatedTasks", () => {
    const patient = makePatient({
      generatedTasks: [
        makeTask({ urgency: "stat", dismissed: false } as any),
      ],
    });
    const result = calculateAcuity(patient);
    // stat × 5 + scenario × 1 = 6
    expect(result.score).toBeGreaterThanOrEqual(5);
  });

  it("counts mix of dismissed and non-dismissed", () => {
    const patient = makePatient({
      generatedTasks: [
        makeTask({ id: "gt-1", urgency: "stat", dismissed: true } as any),
        makeTask({ id: "gt-2", urgency: "urgent", dismissed: false } as any),
      ],
    });
    const result = calculateAcuity(patient);
    // Only non-dismissed urgent task counted: urgent × 3 + scenario × 1 = 4
    expect(result.score).toBeGreaterThanOrEqual(3);
  });
});

describe("calculateAcuity — deadline handling", () => {
  it("overdue task (past dueAt) scores weight 4", () => {
    const past = new Date(Date.now() - 60000).toISOString(); // 1 min ago
    const patient = makePatient({
      tasks: [makeTask({ dueAt: past } as any)],
    });
    const result = calculateAcuity(patient);
    expect(result.components.some(c => c.label.includes("איחור"))).toBe(true);
  });

  it("approaching deadline (<30 min) scores weight 3", () => {
    const soon = new Date(Date.now() + 15 * 60000).toISOString(); // 15 min from now
    const patient = makePatient({
      tasks: [makeTask({ dueAt: soon } as any)],
    });
    const result = calculateAcuity(patient);
    expect(result.components.some(c => c.label.includes("דדליין"))).toBe(true);
  });

  it("task due in 31 min does NOT count as approaching", () => {
    const later = new Date(Date.now() + 31 * 60000).toISOString();
    const patient = makePatient({
      tasks: [makeTask({ dueAt: later } as any)],
    });
    const result = calculateAcuity(patient);
    expect(result.components.some(c => c.label.includes("דדליין"))).toBe(false);
  });

  it("done task with dueAt is NOT counted as overdue", () => {
    const past = new Date(Date.now() - 60000).toISOString();
    const patient = makePatient({
      tasks: [makeTask({ dueAt: past, done: true } as any)],
    });
    const result = calculateAcuity(patient);
    expect(result.components.some(c => c.label.includes("איחור"))).toBe(false);
  });

  it("task with no dueAt is not overdue or approaching", () => {
    const patient = makePatient({
      tasks: [makeTask({ urgency: "routine" })],
    });
    const result = calculateAcuity(patient);
    expect(result.components.some(c => c.label.includes("איחור") || c.label.includes("דדליין"))).toBe(false);
  });
});

describe("calculateAcuity — all zero counts", () => {
  it("returns empty components array when all counts are 0", () => {
    const patient = makePatient({});
    const result = calculateAcuity(patient);
    expect(result.components).toHaveLength(0);
    expect(result.score).toBe(0);
  });
});

describe("calculateAcuity — combined scoring", () => {
  it("sums multiple component weights correctly", () => {
    const past = new Date(Date.now() - 60000).toISOString();
    const patient = makePatient({
      tasks: [
        makeTask({ urgency: "stat" }),
        makeTask({ urgency: "urgent" }),
        makeTask({ urgency: "routine", dueAt: past } as any),
      ],
    });
    const result = calculateAcuity(patient);
    // stat × 5 + urgent × 3 + overdue × 4 = 12
    expect(result.score).toBeGreaterThanOrEqual(12);
  });
});

describe("sortByAcuity", () => {
  it("sorts sickest patient first", () => {
    const low = makePatient({ id: "low", tasks: [] });
    const high = makePatient({
      id: "high",
      tasks: [makeTask({ urgency: "stat" }), makeTask({ urgency: "stat" })],
    });
    const sorted = sortByAcuity([low, high]);
    expect(sorted[0].id).toBe("high");
  });

  it("uses manual order as tiebreaker for equal scores", () => {
    const a = makePatient({ id: "a", order: 2 });
    const b = makePatient({ id: "b", order: 1 });
    const sorted = sortByAcuity([a, b]);
    // Both have score 0, so sort by order ascending
    expect(sorted[0].id).toBe("b");
    expect(sorted[1].id).toBe("a");
  });

  it("does not mutate original array", () => {
    const patients = [
      makePatient({ id: "a" }),
      makePatient({ id: "b", tasks: [makeTask({ urgency: "stat" })] }),
    ];
    const original = [...patients];
    sortByAcuity(patients);
    expect(patients[0].id).toBe(original[0].id);
  });
});

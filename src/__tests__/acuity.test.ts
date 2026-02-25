import { describe, it, expect } from "vitest";
import { calculateAcuity, sortByAcuity } from "../engine/acuity";
import type { PatientEntry, Task } from "../types";

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
    dueAt: overrides.dueAt ?? null,
  };
}

function makePatient(overrides: Partial<PatientEntry> = {}): PatientEntry {
  return {
    id: overrides.id ?? "pt-1",
    section: overrides.section ?? "SIDE_A",
    date: overrides.date ?? "01/01/2025",
    room: overrides.room ?? "101",
    name: overrides.name ?? "Test Patient",
    age: overrides.age ?? 80,
    diagnosis: overrides.diagnosis ?? null,
    flags: overrides.flags ?? [],
    status: overrides.status ?? [],
    tomorrowNotes: [],
    tasks: overrides.tasks ?? [],
    generatedTasks: overrides.generatedTasks ?? [],
    notes: overrides.notes ?? [],
    scannedAt: new Date().toISOString(),
    confidence: 1,
    labs: overrides.labs ?? [],
    order: overrides.order ?? 0,
  };
}

describe("calculateAcuity", () => {
  it("returns score 0 for a patient with no tasks, no interactions, no labs", () => {
    const p = makePatient();
    const { score, components } = calculateAcuity(p);
    expect(score).toBe(0);
    expect(components).toEqual([]);
  });

  it("scores stat tasks at weight 5", () => {
    const p = makePatient({
      tasks: [makeTask({ urgency: "stat" })],
    });
    const { score, components } = calculateAcuity(p);
    const statComp = components.find((c) => c.weight === 5);
    expect(statComp).toBeDefined();
    expect(statComp!.subtotal).toBe(5);
    expect(score).toBeGreaterThanOrEqual(5);
  });

  it("scores urgent tasks at weight 3", () => {
    const p = makePatient({
      tasks: [makeTask({ urgency: "urgent" }), makeTask({ id: "t2", urgency: "urgent" })],
    });
    const { components } = calculateAcuity(p);
    const urgentComp = components.find((c) => c.weight === 3 && c.count === 2);
    expect(urgentComp).toBeDefined();
    expect(urgentComp!.subtotal).toBe(6);
  });

  it("does not count done tasks", () => {
    const p = makePatient({
      tasks: [makeTask({ urgency: "stat", done: true })],
    });
    const { score } = calculateAcuity(p);
    expect(score).toBe(0);
  });

  it("includes generatedTasks in count", () => {
    const p = makePatient({
      generatedTasks: [makeTask({ urgency: "stat" })],
    });
    const { score } = calculateAcuity(p);
    expect(score).toBeGreaterThanOrEqual(5);
  });

  it("counts approaching deadlines (within 30 min) at weight 3", () => {
    const soon = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const p = makePatient({
      tasks: [makeTask({ dueAt: soon })],
    });
    const { components } = calculateAcuity(p);
    const deadlineComp = components.find((c) => c.weight === 3 && c.label.includes("דדליין"));
    expect(deadlineComp).toBeDefined();
    expect(deadlineComp!.count).toBe(1);
  });

  it("does not count future deadlines beyond 30 min", () => {
    const far = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const p = makePatient({
      tasks: [makeTask({ dueAt: far })],
    });
    const { components } = calculateAcuity(p);
    const deadlineComp = components.find((c) => c.label.includes("דדליין"));
    expect(deadlineComp).toBeUndefined();
  });

  it("counts overdue tasks at weight 4", () => {
    const past = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const p = makePatient({
      tasks: [makeTask({ dueAt: past })],
    });
    const { components } = calculateAcuity(p);
    const overdueComp = components.find((c) => c.weight === 4 && c.label.includes("איחור"));
    expect(overdueComp).toBeDefined();
    expect(overdueComp!.count).toBe(1);
  });

  it("counts recent labs within 4 hours", () => {
    const recentTime = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1h ago
    const p = makePatient({
      labs: [{ id: "l1", label: "K+", value: 5.5, time: recentTime }],
    });
    const { components } = calculateAcuity(p);
    const labComp = components.find((c) => c.label.includes("מעבדות"));
    expect(labComp).toBeDefined();
    expect(labComp!.count).toBe(1);
    expect(labComp!.weight).toBe(2);
  });

  it("does not count old labs (>4 hours)", () => {
    const oldTime = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(); // 5h ago
    const p = makePatient({
      labs: [{ id: "l1", label: "K+", value: 5.5, time: oldTime }],
    });
    const { components } = calculateAcuity(p);
    const labComp = components.find((c) => c.label.includes("מעבדות"));
    expect(labComp).toBeUndefined();
  });

  it("counts active scenarios (undone generatedTasks) at weight 1", () => {
    const p = makePatient({
      generatedTasks: [
        makeTask({ id: "g1", done: false }),
        makeTask({ id: "g2", done: false }),
        makeTask({ id: "g3", done: true }),
      ],
    });
    const { components } = calculateAcuity(p);
    const scenarioComp = components.find((c) => c.weight === 1 && c.label.includes("תרחישים"));
    expect(scenarioComp).toBeDefined();
    expect(scenarioComp!.count).toBe(2);
  });

  it("total score is sum of all component subtotals", () => {
    const p = makePatient({
      tasks: [
        makeTask({ urgency: "stat" }),
        makeTask({ id: "t2", urgency: "urgent" }),
      ],
    });
    const { score, components } = calculateAcuity(p);
    const expectedSum = components.reduce((sum, c) => sum + c.subtotal, 0);
    expect(score).toBe(expectedSum);
  });

  it("filters out zero-count components", () => {
    const p = makePatient({
      tasks: [makeTask({ urgency: "stat" })],
    });
    const { components } = calculateAcuity(p);
    for (const c of components) {
      expect(c.count).toBeGreaterThan(0);
    }
  });
});

describe("sortByAcuity", () => {
  it("sorts sicker patients first", () => {
    const sick = makePatient({
      id: "sick",
      tasks: [makeTask({ urgency: "stat" }), makeTask({ id: "t2", urgency: "stat" })],
    });
    const healthy = makePatient({ id: "healthy" });
    const sorted = sortByAcuity([healthy, sick]);
    expect(sorted[0].id).toBe("sick");
    expect(sorted[1].id).toBe("healthy");
  });

  it("falls back to order for equal scores", () => {
    const pA = makePatient({ id: "a", order: 2 });
    const pB = makePatient({ id: "b", order: 1 });
    const sorted = sortByAcuity([pA, pB]);
    expect(sorted[0].id).toBe("b"); // lower order first
    expect(sorted[1].id).toBe("a");
  });

  it("does not mutate the original array", () => {
    const patients = [
      makePatient({ id: "a" }),
      makePatient({ id: "b", tasks: [makeTask({ urgency: "stat" })] }),
    ];
    const sorted = sortByAcuity(patients);
    expect(patients[0].id).toBe("a"); // original unchanged
    expect(sorted[0].id).toBe("b");   // sorted copy
    expect(sorted).not.toBe(patients);
  });
});

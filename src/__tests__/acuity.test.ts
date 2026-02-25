import { describe, it, expect } from "vitest";
import { calculateAcuity, sortByAcuity } from "../engine/acuity";
import type { PatientEntry, Task } from "../types";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: `task-${Math.random().toString(36).slice(2)}`,
    text: overrides.text ?? "Test task",
    urgency: overrides.urgency ?? "routine",
    source: overrides.source ?? "extracted",
    done: overrides.done ?? false,
    doneTime: overrides.doneTime ?? null,
    time: overrides.time ?? null,
    confidence: overrides.confidence ?? 1,
    dueAt: overrides.dueAt ?? null,
    category: overrides.category,
  };
}

function makePatient(overrides: {
  tasks?: Task[];
  generatedTasks?: Task[];
  status?: string[];
  flags?: string[];
  labs?: Array<{ id: string; label: string; value: number; time: string }>;
  order?: number;
}): PatientEntry {
  return {
    id: `pt-${Math.random().toString(36).slice(2)}`,
    section: "SIDE_A",
    date: "01/01/2025",
    room: "101",
    name: "Test Patient",
    age: 75,
    diagnosis: null,
    flags: overrides.flags ?? [],
    status: overrides.status ?? [],
    tomorrowNotes: [],
    tasks: overrides.tasks ?? [],
    generatedTasks: overrides.generatedTasks ?? [],
    notes: [],
    scannedAt: new Date().toISOString(),
    confidence: 1,
    labs: overrides.labs,
    order: overrides.order,
  };
}

describe("calculateAcuity", () => {
  it("returns score 0 for patient with no tasks", () => {
    const result = calculateAcuity(makePatient({}));
    expect(result.score).toBe(0);
    expect(result.components).toEqual([]);
  });

  it("returns score 0 for patient with only done tasks", () => {
    const result = calculateAcuity(
      makePatient({
        tasks: [makeTask({ urgency: "stat", done: true })],
      }),
    );
    expect(result.score).toBe(0);
  });

  it("scores stat tasks at weight 5", () => {
    const result = calculateAcuity(
      makePatient({
        tasks: [makeTask({ urgency: "stat" })],
      }),
    );
    const statComp = result.components.find((c) => c.label === "סטט פתוחים");
    expect(statComp).toBeDefined();
    expect(statComp!.count).toBe(1);
    expect(statComp!.weight).toBe(5);
    expect(statComp!.subtotal).toBe(5);
  });

  it("scores urgent tasks at weight 3", () => {
    const result = calculateAcuity(
      makePatient({
        tasks: [makeTask({ urgency: "urgent" })],
      }),
    );
    const urgComp = result.components.find((c) => c.label === "דחופים פתוחים");
    expect(urgComp).toBeDefined();
    expect(urgComp!.subtotal).toBe(3);
  });

  it("counts multiple stat tasks correctly", () => {
    const result = calculateAcuity(
      makePatient({
        tasks: [
          makeTask({ urgency: "stat" }),
          makeTask({ urgency: "stat" }),
          makeTask({ urgency: "stat" }),
        ],
      }),
    );
    const statComp = result.components.find((c) => c.label === "סטט פתוחים");
    expect(statComp!.count).toBe(3);
    expect(statComp!.subtotal).toBe(15);
  });

  it("does not count routine tasks in stat or urgent", () => {
    const result = calculateAcuity(
      makePatient({
        tasks: [makeTask({ urgency: "routine" })],
      }),
    );
    expect(result.components.find((c) => c.label === "סטט פתוחים")).toBeUndefined();
    expect(result.components.find((c) => c.label === "דחופים פתוחים")).toBeUndefined();
  });

  it("includes generatedTasks in acuity calculation", () => {
    const result = calculateAcuity(
      makePatient({
        generatedTasks: [
          makeTask({ urgency: "stat", source: "generated" }),
        ],
      }),
    );
    const statComp = result.components.find((c) => c.label === "סטט פתוחים");
    expect(statComp).toBeDefined();
    expect(statComp!.count).toBe(1);
  });

  it("counts open generated tasks as active scenarios", () => {
    const result = calculateAcuity(
      makePatient({
        generatedTasks: [
          makeTask({ urgency: "routine", source: "generated" }),
          makeTask({ urgency: "routine", source: "generated" }),
        ],
      }),
    );
    const scenComp = result.components.find((c) => c.label === "תרחישים פעילים");
    expect(scenComp).toBeDefined();
    expect(scenComp!.count).toBe(2);
    expect(scenComp!.weight).toBe(1);
  });

  it("scores overdue tasks at weight 4", () => {
    const pastDue = new Date(Date.now() - 60000).toISOString(); // 1min ago
    const result = calculateAcuity(
      makePatient({
        tasks: [makeTask({ urgency: "routine", dueAt: pastDue })],
      }),
    );
    const overdueComp = result.components.find((c) => c.label === "משימות באיחור");
    expect(overdueComp).toBeDefined();
    expect(overdueComp!.weight).toBe(4);
  });

  it("scores approaching deadlines at weight 3", () => {
    const soon = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10min from now
    const result = calculateAcuity(
      makePatient({
        tasks: [makeTask({ urgency: "routine", dueAt: soon })],
      }),
    );
    const approachComp = result.components.find((c) => c.label.includes("דדליין"));
    expect(approachComp).toBeDefined();
    expect(approachComp!.weight).toBe(3);
  });

  it("does not count future deadlines >30min as approaching", () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1hr from now
    const result = calculateAcuity(
      makePatient({
        tasks: [makeTask({ urgency: "routine", dueAt: future })],
      }),
    );
    const approachComp = result.components.find((c) => c.label.includes("דדליין"));
    expect(approachComp).toBeUndefined();
  });

  it("counts recent labs at weight 2", () => {
    const recentTime = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1hr ago
    const result = calculateAcuity(
      makePatient({
        labs: [
          { id: "l1", label: "Cr", value: 1.5, time: recentTime },
          { id: "l2", label: "K+", value: 5.5, time: recentTime },
        ],
      }),
    );
    const labComp = result.components.find((c) => c.label === "מעבדות אחרונות");
    expect(labComp).toBeDefined();
    expect(labComp!.count).toBe(2);
    expect(labComp!.weight).toBe(2);
  });

  it("does not count old labs (>4h)", () => {
    const oldTime = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(); // 6hr ago
    const result = calculateAcuity(
      makePatient({
        labs: [{ id: "l1", label: "Cr", value: 1.5, time: oldTime }],
      }),
    );
    const labComp = result.components.find((c) => c.label === "מעבדות אחרונות");
    expect(labComp).toBeUndefined();
  });

  it("sums all component scores correctly", () => {
    const result = calculateAcuity(
      makePatient({
        tasks: [
          makeTask({ urgency: "stat" }),      // 5
          makeTask({ urgency: "urgent" }),     // 3
        ],
      }),
    );
    expect(result.score).toBe(8);
  });

  it("only includes components with count > 0", () => {
    const result = calculateAcuity(
      makePatient({
        tasks: [makeTask({ urgency: "stat" })],
      }),
    );
    for (const c of result.components) {
      expect(c.count).toBeGreaterThan(0);
    }
  });
});

describe("sortByAcuity", () => {
  it("sorts sickest patient first", () => {
    const healthy = makePatient({ tasks: [], order: 0 });
    const sick = makePatient({
      tasks: [
        makeTask({ urgency: "stat" }),
        makeTask({ urgency: "stat" }),
        makeTask({ urgency: "stat" }),
      ],
      order: 1,
    });

    const sorted = sortByAcuity([healthy, sick]);
    expect(sorted[0]).toBe(sick);
    expect(sorted[1]).toBe(healthy);
  });

  it("preserves manual order when scores are equal", () => {
    const p1 = makePatient({ tasks: [], order: 1 });
    const p2 = makePatient({ tasks: [], order: 2 });
    const p3 = makePatient({ tasks: [], order: 0 });

    const sorted = sortByAcuity([p1, p2, p3]);
    expect(sorted[0]).toBe(p3); // order 0
    expect(sorted[1]).toBe(p1); // order 1
    expect(sorted[2]).toBe(p2); // order 2
  });

  it("does not mutate input array", () => {
    const patients = [
      makePatient({ tasks: [], order: 1 }),
      makePatient({
        tasks: [makeTask({ urgency: "stat" })],
        order: 0,
      }),
    ];
    const original = [...patients];
    sortByAcuity(patients);
    expect(patients).toEqual(original);
  });
});

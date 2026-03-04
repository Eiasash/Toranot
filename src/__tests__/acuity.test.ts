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

describe("calculateAcuity", () => {
  it("returns score 0 for patient with no tasks, no interactions, no labs", () => {
    const result = calculateAcuity(makePatient());
    expect(result.score).toBe(0);
    expect(result.components).toHaveLength(0);
  });

  it("scores stat tasks at weight 5", () => {
    const patient = makePatient({
      tasks: [makeTask({ urgency: "stat" })],
    });
    const result = calculateAcuity(patient);
    const statComponent = result.components.find((c) => c.label === "סטט פתוחים");
    expect(statComponent).toBeDefined();
    expect(statComponent!.weight).toBe(5);
    expect(statComponent!.subtotal).toBe(5);
  });

  it("scores urgent tasks at weight 3", () => {
    const patient = makePatient({
      tasks: [makeTask({ urgency: "urgent" }), makeTask({ id: "t2", urgency: "urgent" })],
    });
    const result = calculateAcuity(patient);
    const urgentComponent = result.components.find((c) => c.label === "דחופים פתוחים");
    expect(urgentComponent).toBeDefined();
    expect(urgentComponent!.count).toBe(2);
    expect(urgentComponent!.subtotal).toBe(6);
  });

  it("ignores completed tasks", () => {
    const patient = makePatient({
      tasks: [makeTask({ urgency: "stat", done: true })],
    });
    const result = calculateAcuity(patient);
    expect(result.score).toBe(0);
  });

  it("includes generatedTasks in scoring", () => {
    const patient = makePatient({
      generatedTasks: [makeTask({ urgency: "stat" })],
    });
    const result = calculateAcuity(patient);
    // stat task + active scenario
    expect(result.score).toBeGreaterThan(0);
    const statComponent = result.components.find((c) => c.label === "סטט פתוחים");
    expect(statComponent).toBeDefined();
  });

  it("scores approaching deadlines (<30 min) at weight 3", () => {
    const soonDue = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min from now
    const patient = makePatient({
      tasks: [makeTask({ dueAt: soonDue })],
    });
    const result = calculateAcuity(patient);
    const deadlineComponent = result.components.find((c) => c.label.includes("דדליין"));
    expect(deadlineComponent).toBeDefined();
    expect(deadlineComponent!.subtotal).toBe(3);
  });

  it("does not score tasks due > 30 min as approaching deadline", () => {
    const farDue = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour from now
    const patient = makePatient({
      tasks: [makeTask({ dueAt: farDue })],
    });
    const result = calculateAcuity(patient);
    const deadlineComponent = result.components.find((c) => c.label.includes("דדליין"));
    expect(deadlineComponent).toBeUndefined();
  });

  it("scores overdue tasks at weight 4", () => {
    const pastDue = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min ago
    const patient = makePatient({
      tasks: [makeTask({ dueAt: pastDue })],
    });
    const result = calculateAcuity(patient);
    const overdueComponent = result.components.find((c) => c.label === "משימות באיחור");
    expect(overdueComponent).toBeDefined();
    expect(overdueComponent!.subtotal).toBe(4);
  });

  it("scores critical lab deltas at weight 4", () => {
    const t0 = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const t1 = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    const patient = makePatient({
      labs: [
        // Cr rising from 1.0 to 2.5 = KDIGO AKI Stage 2 (critical)
        { id: "lab-1", label: "Cr", value: 1.0, time: t0 },
        { id: "lab-2", label: "Cr", value: 2.5, time: t1 },
      ],
    });
    const result = calculateAcuity(patient);
    const criticalLabComponent = result.components.find((c) => c.label === "מעבדות קריטיות");
    expect(criticalLabComponent).toBeDefined();
    expect(criticalLabComponent!.count).toBe(1);
    expect(criticalLabComponent!.weight).toBe(4);
    expect(criticalLabComponent!.subtotal).toBe(4);
  });

  it("scores warning lab deltas at weight 2", () => {
    const t0 = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const t1 = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    const patient = makePatient({
      labs: [
        // K+ rising by 0.6 = warning threshold
        { id: "lab-1", label: "K+", value: 4.0, time: t0 },
        { id: "lab-2", label: "K+", value: 4.6, time: t1 },
      ],
    });
    const result = calculateAcuity(patient);
    const warningLabComponent = result.components.find((c) => c.label === "מעבדות חריגות");
    expect(warningLabComponent).toBeDefined();
    expect(warningLabComponent!.count).toBe(1);
    expect(warningLabComponent!.weight).toBe(2);
    expect(warningLabComponent!.subtotal).toBe(2);
  });

  it("does not score labs with normal deltas", () => {
    const t0 = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const t1 = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    const patient = makePatient({
      labs: [
        // K+ change of 0.1 = within normal, no alert
        { id: "lab-1", label: "K+", value: 4.0, time: t0 },
        { id: "lab-2", label: "K+", value: 4.1, time: t1 },
      ],
    });
    const result = calculateAcuity(patient);
    const labComponent = result.components.find((c) => c.label === "מעבדות קריטיות" || c.label === "מעבדות חריגות");
    expect(labComponent).toBeUndefined();
  });

  it("does not score a single lab entry (no delta possible)", () => {
    const patient = makePatient({
      labs: [{ id: "lab-1", label: "Cr", value: 2.5, time: new Date().toISOString() }],
    });
    const result = calculateAcuity(patient);
    const labComponent = result.components.find((c) => c.label === "מעבדות קריטיות" || c.label === "מעבדות חריגות");
    expect(labComponent).toBeUndefined();
  });

  it("scores active scenarios (undone generatedTasks) at weight 1", () => {
    const patient = makePatient({
      generatedTasks: [
        makeTask({ id: "g1", generatedFrom: "חשד לספסיס" }),
        makeTask({ id: "g2", generatedFrom: "חשד לספסיס" }),
      ],
    });
    const result = calculateAcuity(patient);
    const scenarioComponent = result.components.find((c) => c.label === "תרחישים פעילים");
    expect(scenarioComponent).toBeDefined();
    expect(scenarioComponent!.count).toBe(2);
    expect(scenarioComponent!.subtotal).toBe(2);
  });

  it("scores drug interactions (critical at 4, major at 2)", () => {
    // Trigger amiodarone + ciprofloxacin = critical QT interaction
    const patient = makePatient({
      tasks: [
        makeTask({ text: "amiodarone 200mg" }),
        makeTask({ id: "t2", text: "ciprofloxacin 500mg" }),
      ],
    });
    const result = calculateAcuity(patient);
    const critComponent = result.components.find((c) => c.label === "אינטראקציות קריטיות");
    expect(critComponent).toBeDefined();
    expect(critComponent!.weight).toBe(4);
  });

  it("accumulates all component scores correctly", () => {
    const soonDue = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const patient = makePatient({
      tasks: [
        makeTask({ urgency: "stat", dueAt: soonDue }),
        makeTask({ id: "t2", urgency: "urgent" }),
      ],
    });
    const result = calculateAcuity(patient);
    const total = result.components.reduce((sum, c) => sum + c.subtotal, 0);
    expect(result.score).toBe(total);
  });

  it("filters out zero-count components", () => {
    const result = calculateAcuity(makePatient());
    for (const c of result.components) {
      expect(c.count).toBeGreaterThan(0);
    }
  });
});

describe("sortByAcuity", () => {
  it("sorts sickest patients first", () => {
    const sickPatient = makePatient({
      id: "sick",
      tasks: [makeTask({ urgency: "stat" }), makeTask({ id: "t2", urgency: "stat" })],
    });
    const wellPatient = makePatient({ id: "well" });
    const result = sortByAcuity([wellPatient, sickPatient]);
    expect(result[0].id).toBe("sick");
    expect(result[1].id).toBe("well");
  });

  it("falls back to manual order for equal scores", () => {
    const p1 = makePatient({ id: "p1", order: 2 });
    const p2 = makePatient({ id: "p2", order: 1 });
    const result = sortByAcuity([p1, p2]);
    expect(result[0].id).toBe("p2"); // lower order first
    expect(result[1].id).toBe("p1");
  });

  it("does not mutate original array", () => {
    const patients = [makePatient({ id: "a" }), makePatient({ id: "b" })];
    const original = [...patients];
    sortByAcuity(patients);
    expect(patients).toEqual(original);
  });

  it("handles empty array", () => {
    expect(sortByAcuity([])).toEqual([]);
  });

  it("handles single patient", () => {
    const p = makePatient();
    const result = sortByAcuity([p]);
    expect(result).toHaveLength(1);
  });
});

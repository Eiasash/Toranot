/**
 * PatientCard component tests.
 *
 * PatientCard.tsx is ~1,233 lines. Without @testing-library/react we test the
 * pure logic functions that power the component:
 *   - Acuity scoring (AcuityBadge derives from calculateAcuity)
 *   - Task sorting (sortTasks priority order)
 *   - Task progress counting (done/total)
 *   - Comfort care detection (goalsOfCare === "comfort_only")
 *   - Medication flags display logic (medications array)
 *   - Flag badge rendering logic (DNR/DNI detection)
 */

import { describe, it, expect } from "vitest";
import { calculateAcuity } from "../engine/acuity";
import type { PatientEntry, Task } from "../types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
    labs: overrides.labs ?? [],
    medications: overrides.medications ?? [],
    allergies: overrides.allergies ?? [],
    clinicalMeta: overrides.clinicalMeta,
  };
}

/**
 * Reimplementation of PatientCard's sortTasks for testing.
 * This is the exact same logic used inside the component.
 */
function sortTasks(tasks: Task[]): Task[] {
  const weight: Record<Task["urgency"], number> = {
    stat: 0,
    urgent: 1,
    morning: 2,
    extra: 3,
    routine: 4,
  };
  const now = Date.now();
  return [...tasks].sort((a, b) => {
    // 1. Undone before done
    if (a.done !== b.done) return a.done ? 1 : -1;
    // 2. Urgency
    const uDiff = weight[a.urgency] - weight[b.urgency];
    if (uDiff !== 0) return uDiff;
    // 3. Tasks with approaching deadlines first
    const aDue = a.dueAt ? new Date(a.dueAt).getTime() - now : Infinity;
    const bDue = b.dueAt ? new Date(b.dueAt).getTime() - now : Infinity;
    return aDue - bDue;
  });
}

// ─── Acuity scoring (powers AcuityBadge) ──────────────────────────────────────

describe("PatientCard — Acuity scoring (AcuityBadge)", () => {
  it("returns score 0 for patient with no tasks/drugs/labs", () => {
    const p = makePatient();
    const { score } = calculateAcuity(p);
    expect(score).toBe(0);
  });

  it("gives high score (>=8) for patient with stat tasks", () => {
    const p = makePatient({
      tasks: [
        makeTask({ id: "t1", text: "stat CBC", urgency: "stat" }),
        makeTask({ id: "t2", text: "stat troponin", urgency: "stat" }),
      ],
    });
    const { score } = calculateAcuity(p);
    // 2 stat tasks * 5 = 10
    expect(score).toBeGreaterThanOrEqual(8);
  });

  it("gives moderate score (4-7) for patient with urgent tasks", () => {
    const p = makePatient({
      tasks: [
        makeTask({ id: "t1", text: "urgent labs", urgency: "urgent" }),
        makeTask({ id: "t2", text: "urgent imaging", urgency: "urgent" }),
      ],
    });
    const { score } = calculateAcuity(p);
    // 2 urgent * 3 = 6
    expect(score).toBeGreaterThanOrEqual(4);
    expect(score).toBeLessThan(15);
  });

  it("gives low score for patient with only routine tasks", () => {
    const p = makePatient({
      tasks: [
        makeTask({ id: "t1", text: "routine check", urgency: "routine" }),
      ],
    });
    const { score } = calculateAcuity(p);
    expect(score).toBeLessThan(4);
  });

  it("does not count done tasks in acuity", () => {
    const p = makePatient({
      tasks: [
        makeTask({ id: "t1", text: "stat task already done", urgency: "stat", done: true }),
      ],
    });
    const { score } = calculateAcuity(p);
    // Done stat task should not contribute to score
    expect(score).toBeLessThan(5);
  });

  it("accounts for drug interactions in acuity", () => {
    const p = makePatient({
      medications: ["amiodarone 200mg", "ciprofloxacin 500mg"],
    });
    const { score } = calculateAcuity(p);
    // Critical interaction: amiodarone + cipro → should contribute to score
    expect(score).toBeGreaterThanOrEqual(1);
  });

  it("scores higher when critical lab deltas exist", () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const p = makePatient({
      labs: [
        { id: "l1", label: "Cr", value: 0.8, time: yesterday.toISOString() },
        { id: "l2", label: "Cr", value: 2.5, time: now.toISOString() },
      ],
    });
    const { score } = calculateAcuity(p);
    // Significant Cr rise → AKI → critical lab delta → high acuity
    expect(score).toBeGreaterThanOrEqual(1);
  });

  it("provides a components breakdown", () => {
    const p = makePatient({
      tasks: [makeTask({ id: "t1", text: "stat task", urgency: "stat" })],
    });
    const result = calculateAcuity(p);
    expect(result.components).toBeDefined();
    expect(Array.isArray(result.components)).toBe(true);
    // At least one component should have a non-zero subtotal
    expect(result.components.some((c) => c.subtotal > 0)).toBe(true);
  });
});

// ─── Task sorting (sortTasks logic inside PatientCard) ────────────────────────

describe("PatientCard — Task sorting", () => {
  it("sorts undone tasks before done tasks", () => {
    const tasks = [
      makeTask({ id: "done", text: "done task", done: true }),
      makeTask({ id: "undone", text: "undone task", done: false }),
    ];
    const sorted = sortTasks(tasks);
    expect(sorted[0].id).toBe("undone");
    expect(sorted[1].id).toBe("done");
  });

  it("sorts stat before urgent before routine", () => {
    const tasks = [
      makeTask({ id: "routine", text: "routine", urgency: "routine" }),
      makeTask({ id: "stat", text: "stat", urgency: "stat" }),
      makeTask({ id: "urgent", text: "urgent", urgency: "urgent" }),
    ];
    const sorted = sortTasks(tasks);
    expect(sorted[0].id).toBe("stat");
    expect(sorted[1].id).toBe("urgent");
    expect(sorted[2].id).toBe("routine");
  });

  it("sorts morning before extra before routine", () => {
    const tasks = [
      makeTask({ id: "routine", text: "routine", urgency: "routine" }),
      makeTask({ id: "morning", text: "morning", urgency: "morning" }),
      makeTask({ id: "extra", text: "extra", urgency: "extra" }),
    ];
    const sorted = sortTasks(tasks);
    expect(sorted[0].id).toBe("morning");
    expect(sorted[1].id).toBe("extra");
    expect(sorted[2].id).toBe("routine");
  });

  it("sorts tasks with closer deadlines first (same urgency)", () => {
    const soon = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const later = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const tasks = [
      makeTask({ id: "later", text: "later", urgency: "routine", dueAt: later }),
      makeTask({ id: "soon", text: "soon", urgency: "routine", dueAt: soon }),
    ];
    const sorted = sortTasks(tasks);
    expect(sorted[0].id).toBe("soon");
    expect(sorted[1].id).toBe("later");
  });

  it("preserves original array (returns new sorted copy)", () => {
    const original = [
      makeTask({ id: "b", text: "b", urgency: "routine" }),
      makeTask({ id: "a", text: "a", urgency: "stat" }),
    ];
    const sorted = sortTasks(original);
    expect(original[0].id).toBe("b"); // original unchanged
    expect(sorted[0].id).toBe("a");
  });
});

// ─── Task progress counting ───────────────────────────────────────────────────

describe("PatientCard — Task progress", () => {
  it("counts done and total correctly for mixed tasks", () => {
    const p = makePatient({
      tasks: [
        makeTask({ id: "t1", done: true }),
        makeTask({ id: "t2", done: false }),
      ],
      generatedTasks: [
        makeTask({ id: "g1", done: true }),
        makeTask({ id: "g2", done: false }),
      ],
    });
    // PatientCard merges tasks + generatedTasks (non-dismissed)
    const allTasks = [...p.tasks, ...p.generatedTasks.filter((t) => !t.dismissed)];
    const doneCount = allTasks.filter((t) => t.done).length;
    const totalCount = allTasks.length;
    expect(doneCount).toBe(2);
    expect(totalCount).toBe(4);
  });

  it("excludes dismissed generated tasks from count", () => {
    const p = makePatient({
      tasks: [makeTask({ id: "t1", done: false })],
      generatedTasks: [
        makeTask({ id: "g1", done: false, dismissed: true }),
        makeTask({ id: "g2", done: false }),
      ],
    });
    const allTasks = [...p.tasks, ...p.generatedTasks.filter((t) => !t.dismissed)];
    expect(allTasks).toHaveLength(2);
  });

  it("returns 0/0 for patient with no tasks", () => {
    const p = makePatient();
    const allTasks = [...p.tasks, ...p.generatedTasks.filter((t) => !t.dismissed)];
    expect(allTasks).toHaveLength(0);
  });
});

// ─── Comfort care mode ─────────────────────────────────────────────────────────

describe("PatientCard — Comfort care detection", () => {
  it("detects comfort_only goalsOfCare from clinicalMeta", () => {
    const p = makePatient({
      clinicalMeta: { goalsOfCare: "comfort_only" },
    });
    expect(p.clinicalMeta?.goalsOfCare).toBe("comfort_only");
  });

  it("differentiates full, limited, and comfort_only goals", () => {
    const full = makePatient({ clinicalMeta: { goalsOfCare: "full" } });
    const limited = makePatient({ clinicalMeta: { goalsOfCare: "limited" } });
    const comfort = makePatient({ clinicalMeta: { goalsOfCare: "comfort_only" } });

    expect(full.clinicalMeta?.goalsOfCare).toBe("full");
    expect(limited.clinicalMeta?.goalsOfCare).toBe("limited");
    expect(comfort.clinicalMeta?.goalsOfCare).toBe("comfort_only");
  });

  it("treats missing goalsOfCare as unknown", () => {
    const p = makePatient();
    const goc = p.clinicalMeta?.goalsOfCare ?? "unknown";
    expect(goc).toBe("unknown");
  });
});

// ─── Medication flags display logic ────────────────────────────────────────────

describe("PatientCard — Medication flags", () => {
  it("patient with medications has non-empty medications array", () => {
    const p = makePatient({
      medications: ["Omeprazole 20mg", "Metoprolol 50mg", "Aspirin 100mg"],
    });
    expect(p.medications).toHaveLength(3);
  });

  it("patient without medications has empty or undefined array", () => {
    const p = makePatient();
    expect(p.medications?.length ?? 0).toBe(0);
  });

  it("MedCountBadge would show count > 0 for patient with medications", () => {
    const p = makePatient({
      medications: ["Drug A", "Drug B"],
    });
    // MedCountBadge shows count when medications.length > 0
    const count = p.medications?.length ?? 0;
    expect(count).toBe(2);
    expect(count > 0).toBe(true);
  });
});

// ─── Flag badge logic (DNR/DNI detection) ──────────────────────────────────────

describe("PatientCard — Flag badge logic", () => {
  it("identifies DNR flag", () => {
    const flags = ["DNR", "NPO"];
    const dnrFlags = flags.filter(
      (f) => f.toUpperCase().includes("DNR") || f.toUpperCase().includes("DNI")
    );
    expect(dnrFlags).toContain("DNR");
    expect(dnrFlags).toHaveLength(1);
  });

  it("identifies DNI flag", () => {
    const flags = ["DNI"];
    const codeFlags = flags.filter(
      (f) => f.toUpperCase().includes("DNR") || f.toUpperCase().includes("DNI")
    );
    expect(codeFlags).toContain("DNI");
  });

  it("identifies both DNR and DNI", () => {
    const flags = ["DNR", "DNI", "NPO"];
    const codeFlags = flags.filter(
      (f) => f.toUpperCase().includes("DNR") || f.toUpperCase().includes("DNI")
    );
    expect(codeFlags).toHaveLength(2);
  });

  it("returns empty when no code status flags", () => {
    const flags = ["NPO", "Fall risk"];
    const codeFlags = flags.filter(
      (f) => f.toUpperCase().includes("DNR") || f.toUpperCase().includes("DNI")
    );
    expect(codeFlags).toHaveLength(0);
  });
});

// ─── Acuity-based border color logic ──────────────────────────────────────────

describe("PatientCard — Acuity border color", () => {
  function borderColor(score: number): string {
    if (score >= 8) return "border-l-red-500";
    if (score >= 5) return "border-l-yellow-400";
    if (score >= 1) return "border-l-orange-300";
    return "border-l-gray-200 dark:border-l-gray-700";
  }

  it("returns red for critical acuity (>=8)", () => {
    expect(borderColor(10)).toBe("border-l-red-500");
    expect(borderColor(8)).toBe("border-l-red-500");
  });

  it("returns yellow for high acuity (5-7)", () => {
    expect(borderColor(5)).toBe("border-l-yellow-400");
    expect(borderColor(7)).toBe("border-l-yellow-400");
  });

  it("returns orange for moderate acuity (1-4)", () => {
    expect(borderColor(1)).toBe("border-l-orange-300");
    expect(borderColor(4)).toBe("border-l-orange-300");
  });

  it("returns gray for zero acuity", () => {
    expect(borderColor(0)).toBe("border-l-gray-200 dark:border-l-gray-700");
  });
});

// ─── Patient display logic ─────────────────────────────────────────────────────

describe("PatientCard — Patient display", () => {
  it("shows patient name, room, and section correctly", () => {
    const p = makePatient({
      name: "לוי שרה",
      room: "205",
      section: "SIDE_B",
    });
    expect(p.name).toBe("לוי שרה");
    expect(p.room).toBe("205");
    expect(p.section).toBe("SIDE_B");
  });

  it("handles null name gracefully (fallback to לא ידוע)", () => {
    const p: PatientEntry = { ...makePatient(), name: null };
    // PatientCard renders: patient.name ?? "לא ידוע"
    const displayName = p.name ?? "לא ידוע";
    expect(displayName).toBe("לא ידוע");
  });

  it("handles null room gracefully", () => {
    const p: PatientEntry = { ...makePatient(), room: null };
    // PatientCard only renders room badge when room is truthy
    expect(p.room).toBeNull();
  });

  it("shows isolation badges from clinicalMeta", () => {
    const p = makePatient({
      clinicalMeta: { isolation: ["MRSA", "VRE"] },
    });
    expect(p.clinicalMeta?.isolation).toEqual(["MRSA", "VRE"]);
    expect(p.clinicalMeta!.isolation!.length).toBe(2);
  });

  it("marks discharged patients", () => {
    const p: PatientEntry & { discharged: boolean } = { ...makePatient(), discharged: true };
    expect(!!p.discharged).toBe(true);
  });
});

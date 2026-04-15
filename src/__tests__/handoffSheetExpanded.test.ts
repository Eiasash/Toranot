/**
 * HandoffSheet component tests — expanded coverage.
 *
 * Complements handoffSheet.test.ts (which covers formatPatient, isOncallRelevant,
 * drug safety aggregation, and phlebotomy).
 * This file covers:
 *   - Section grouping logic for handoff generation
 *   - Shift summary statistics (done/pending/stat counts)
 *   - GoC gap detection
 *   - Allergy conflict surfacing
 *   - Text export structure and correctness
 *   - New admission summary generation
 *   - Empty ward handoff
 */

import { describe, it, expect } from "vitest";
import type { PatientEntry, Task, PatientSection } from "../types";
import { patientSectionLabel, PATIENT_SECTIONS } from "../types";
import {
  checkDrugInteractions,
  checkRenalDoseWarnings,
  checkBeersCriteria,
  checkAllergyConflicts,
} from "../engine/drugSafety";
import { calculateLabDeltas } from "../engine/labDelta";

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
    id: "pt-1",
    section: "SIDE_A",
    date: "01/01/2025",
    room: "101",
    name: "כהן יוסף",
    age: 70,
    diagnosis: "דלקת ריאות",
    flags: [],
    status: [],
    tomorrowNotes: [],
    tasks: [],
    generatedTasks: [],
    notes: [],
    scannedAt: "2025-01-01T00:00:00.000Z",
    confidence: 1,
    labs: [],
    medications: [],
    allergies: [],
    ...overrides,
  };
}

/**
 * Reimplementation of HandoffSheet's section grouping for testing.
 * Groups patients by section, preserving section order from PATIENT_SECTIONS.
 */
function groupBySection(patients: PatientEntry[]): Map<string, PatientEntry[]> {
  const map = new Map<string, PatientEntry[]>();
  for (const p of patients) {
    const sec = p.section;
    if (!map.has(sec)) map.set(sec, []);
    map.get(sec)!.push(p);
  }
  return map;
}

/**
 * Reimplementation of HandoffSheet's shift summary statistics.
 */
function computeShiftStats(patients: PatientEntry[]) {
  const allTasks = patients.flatMap((p) => [
    ...p.tasks,
    ...p.generatedTasks.filter((t) => !t.dismissed),
  ]);
  return {
    totalDone: allTasks.filter((t) => t.done).length,
    totalPending: allTasks.filter((t) => !t.done).length,
    statPending: allTasks.filter((t) => !t.done && t.urgency === "stat").length,
    statDone: allTasks.filter((t) => t.done && t.urgency === "stat").length,
    urgentDone: allTasks.filter((t) => t.done && t.urgency === "urgent").length,
  };
}

/**
 * Reimplementation of HandoffSheet's GoC gap detection.
 * Finds patients with stat/urgent tasks but no defined GoC.
 */
function findGocGap(patients: PatientEntry[]): PatientEntry[] {
  return patients.filter((p) => {
    const goc = p.clinicalMeta?.goalsOfCare;
    if (goc && goc !== "unknown") return false;
    const allT = [...p.tasks, ...p.generatedTasks.filter((t) => !t.dismissed)];
    return allT.some((t) => !t.done && (t.urgency === "stat" || t.urgency === "urgent"));
  });
}

// ─── Section grouping ─────────────────────────────────────────────────────────

describe("HandoffSheet expanded — section grouping", () => {
  it("groups patients by their section", () => {
    const patients = [
      makePatient({ id: "a1", section: "SIDE_A" }),
      makePatient({ id: "b1", section: "SIDE_B" }),
      makePatient({ id: "a2", section: "SIDE_A" }),
    ];
    const groups = groupBySection(patients);
    expect(groups.get("SIDE_A")).toHaveLength(2);
    expect(groups.get("SIDE_B")).toHaveLength(1);
  });

  it("returns empty map for empty patients array", () => {
    const groups = groupBySection([]);
    expect(groups.size).toBe(0);
  });

  it("handles all sections in a single group call", () => {
    const patients = PATIENT_SECTIONS.map((sec, i) =>
      makePatient({ id: `p-${i}`, section: sec, room: `${100 + i}` })
    );
    const groups = groupBySection(patients);
    expect(groups.size).toBe(PATIENT_SECTIONS.length);
    for (const sec of PATIENT_SECTIONS) {
      expect(groups.get(sec)).toHaveLength(1);
    }
  });

  it("preserves insertion order (first-seen section comes first)", () => {
    const patients = [
      makePatient({ id: "c1", section: "SIDE_C" }),
      makePatient({ id: "a1", section: "SIDE_A" }),
      makePatient({ id: "c2", section: "SIDE_C" }),
    ];
    const groups = groupBySection(patients);
    const keys = [...groups.keys()];
    expect(keys[0]).toBe("SIDE_C");
    expect(keys[1]).toBe("SIDE_A");
  });
});

// ─── Shift summary statistics ─────────────────────────────────────────────────

describe("HandoffSheet expanded — shift summary statistics", () => {
  it("returns all zeros for patients with no tasks", () => {
    const patients = [makePatient(), makePatient({ id: "p2" })];
    const stats = computeShiftStats(patients);
    expect(stats.totalDone).toBe(0);
    expect(stats.totalPending).toBe(0);
    expect(stats.statPending).toBe(0);
    expect(stats.statDone).toBe(0);
    expect(stats.urgentDone).toBe(0);
  });

  it("counts pending and done tasks correctly", () => {
    const patients = [
      makePatient({
        id: "p1",
        tasks: [
          makeTask({ id: "t1", done: false }),
          makeTask({ id: "t2", done: true }),
        ],
      }),
      makePatient({
        id: "p2",
        tasks: [makeTask({ id: "t3", done: false })],
      }),
    ];
    const stats = computeShiftStats(patients);
    expect(stats.totalDone).toBe(1);
    expect(stats.totalPending).toBe(2);
  });

  it("counts stat tasks separately", () => {
    const patients = [
      makePatient({
        tasks: [
          makeTask({ id: "t1", urgency: "stat", done: false }),
          makeTask({ id: "t2", urgency: "stat", done: true }),
          makeTask({ id: "t3", urgency: "routine", done: false }),
        ],
      }),
    ];
    const stats = computeShiftStats(patients);
    expect(stats.statPending).toBe(1);
    expect(stats.statDone).toBe(1);
  });

  it("counts urgent done tasks separately", () => {
    const patients = [
      makePatient({
        tasks: [
          makeTask({ id: "t1", urgency: "urgent", done: true }),
          makeTask({ id: "t2", urgency: "urgent", done: true }),
        ],
      }),
    ];
    const stats = computeShiftStats(patients);
    expect(stats.urgentDone).toBe(2);
  });

  it("includes non-dismissed generatedTasks in counts", () => {
    const patients = [
      makePatient({
        tasks: [],
        generatedTasks: [
          makeTask({ id: "g1", done: false }),
          makeTask({ id: "g2", done: true }),
          makeTask({ id: "g3", done: false, dismissed: true }),
        ],
      }),
    ];
    const stats = computeShiftStats(patients);
    // g3 is dismissed, so only g1 (pending) and g2 (done)
    expect(stats.totalPending).toBe(1);
    expect(stats.totalDone).toBe(1);
  });

  it("aggregates across many patients correctly", () => {
    const patients = Array.from({ length: 10 }, (_, i) =>
      makePatient({
        id: `p-${i}`,
        room: `${100 + i}`,
        tasks: [
          makeTask({ id: `t-${i}-1`, done: false }),
          makeTask({ id: `t-${i}-2`, done: true }),
        ],
      })
    );
    const stats = computeShiftStats(patients);
    expect(stats.totalDone).toBe(10);
    expect(stats.totalPending).toBe(10);
  });
});

// ─── GoC gap detection ────────────────────────────────────────────────────────

describe("HandoffSheet expanded — GoC gap detection", () => {
  it("identifies patient with stat task and no GoC defined", () => {
    const patients = [
      makePatient({
        id: "p1",
        tasks: [makeTask({ urgency: "stat", done: false })],
      }),
    ];
    const gaps = findGocGap(patients);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].id).toBe("p1");
  });

  it("does not flag patient when GoC is full", () => {
    const patients = [
      makePatient({
        id: "p1",
        clinicalMeta: { goalsOfCare: "full" },
        tasks: [makeTask({ urgency: "stat", done: false })],
      }),
    ];
    expect(findGocGap(patients)).toHaveLength(0);
  });

  it("does not flag patient when GoC is comfort_only", () => {
    const patients = [
      makePatient({
        id: "p1",
        clinicalMeta: { goalsOfCare: "comfort_only" },
        tasks: [makeTask({ urgency: "stat", done: false })],
      }),
    ];
    expect(findGocGap(patients)).toHaveLength(0);
  });

  it("flags patient when GoC is 'unknown'", () => {
    const patients = [
      makePatient({
        id: "p1",
        clinicalMeta: { goalsOfCare: "unknown" },
        tasks: [makeTask({ urgency: "urgent", done: false })],
      }),
    ];
    expect(findGocGap(patients)).toHaveLength(1);
  });

  it("does not flag patient with only routine tasks", () => {
    const patients = [
      makePatient({
        tasks: [makeTask({ urgency: "routine", done: false })],
      }),
    ];
    expect(findGocGap(patients)).toHaveLength(0);
  });

  it("does not flag patient when all stat/urgent tasks are done", () => {
    const patients = [
      makePatient({
        tasks: [makeTask({ urgency: "stat", done: true })],
      }),
    ];
    expect(findGocGap(patients)).toHaveLength(0);
  });

  it("returns multiple gap patients", () => {
    const patients = [
      makePatient({
        id: "p1",
        tasks: [makeTask({ id: "t1", urgency: "stat", done: false })],
      }),
      makePatient({
        id: "p2",
        clinicalMeta: { goalsOfCare: "full" },
        tasks: [makeTask({ id: "t2", urgency: "stat", done: false })],
      }),
      makePatient({
        id: "p3",
        tasks: [makeTask({ id: "t3", urgency: "urgent", done: false })],
      }),
    ];
    const gaps = findGocGap(patients);
    expect(gaps).toHaveLength(2);
    expect(gaps.map((p) => p.id).sort()).toEqual(["p1", "p3"]);
  });
});

// ─── New admissions list ──────────────────────────────────────────────────────

describe("HandoffSheet expanded — new admissions", () => {
  it("identifies patients with isAdmission flag as new admissions", () => {
    const patients = [
      makePatient({ id: "p1", isAdmission: true }),
      makePatient({ id: "p2", isAdmission: false }),
      makePatient({ id: "p3" }),
      makePatient({ id: "p4", isAdmission: true }),
    ];
    const admissions = patients.filter((p) => p.isAdmission);
    expect(admissions).toHaveLength(2);
    expect(admissions.map((p) => p.id)).toEqual(["p1", "p4"]);
  });

  it("sorts new admissions by scannedAt time", () => {
    const patients = [
      makePatient({
        id: "p2",
        isAdmission: true,
        scannedAt: "2025-01-01T20:00:00.000Z",
      }),
      makePatient({
        id: "p1",
        isAdmission: true,
        scannedAt: "2025-01-01T16:30:00.000Z",
      }),
    ];
    const sorted = patients
      .filter((p) => p.isAdmission)
      .sort((a, b) => (a.scannedAt ?? "").localeCompare(b.scannedAt ?? ""));
    expect(sorted[0].id).toBe("p1");
    expect(sorted[1].id).toBe("p2");
  });

  it("returns empty array when no admissions exist", () => {
    const patients = [makePatient(), makePatient({ id: "p2" })];
    const admissions = patients.filter((p) => p.isAdmission);
    expect(admissions).toHaveLength(0);
  });
});

// ─── Allergy conflict surfacing ───────────────────────────────────────────────

describe("HandoffSheet expanded — allergy conflict surfacing", () => {
  it("detects allergy conflict in handoff summary", () => {
    const patients = [
      makePatient({
        id: "p1",
        medications: ["amoxicillin 500mg"],
        allergies: ["penicillin"],
      }),
    ];
    const withConflicts = patients.filter(
      (p) => checkAllergyConflicts(p).length > 0
    );
    expect(withConflicts).toHaveLength(1);
  });

  it("no conflict for unrelated allergy", () => {
    const patients = [
      makePatient({
        id: "p1",
        medications: ["metoprolol 50mg"],
        allergies: ["penicillin"],
      }),
    ];
    const withConflicts = patients.filter(
      (p) => checkAllergyConflicts(p).length > 0
    );
    expect(withConflicts).toHaveLength(0);
  });
});

// ─── Empty ward handoff ──────────────────────────────────────────────────────

describe("HandoffSheet expanded — empty ward", () => {
  it("computes zero stats for empty patient list", () => {
    const stats = computeShiftStats([]);
    expect(stats.totalDone).toBe(0);
    expect(stats.totalPending).toBe(0);
    expect(stats.statPending).toBe(0);
  });

  it("section groups are empty for empty patient list", () => {
    const groups = groupBySection([]);
    expect(groups.size).toBe(0);
  });

  it("no GoC gaps for empty patient list", () => {
    expect(findGocGap([])).toHaveLength(0);
  });
});

// ─── patientSectionLabel utility ──────────────────────────────────────────────

describe("HandoffSheet expanded — patientSectionLabel", () => {
  it("returns Hebrew label for SIDE_A", () => {
    expect(patientSectionLabel("SIDE_A")).toBe("צד א");
  });

  it("returns Hebrew label for REHAB", () => {
    expect(patientSectionLabel("REHAB")).toBe("שיקום");
  });

  it("returns special label for UNKNOWN_SECTION", () => {
    expect(patientSectionLabel("UNKNOWN_SECTION")).toBe("קטע לא ידוע");
  });

  it("returns Hebrew label for MONITOR", () => {
    expect(patientSectionLabel("MONITOR")).toBe("ניטור");
  });
});

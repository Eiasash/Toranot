/**
 * PatientList component tests.
 *
 * PatientList.tsx renders the patient list with filtering and sorting.
 * Without @testing-library/react we test the pure logic functions
 * that power the component:
 *   - Section filtering (ALL vs specific section)
 *   - Sorting modes: room, severity, name, new, activity, pending
 *   - Section grouping in ALL view
 *   - Empty state detection
 *   - comparePatientsByRoom sort utility
 *   - isNewThisShift logic (admission flag + shift window)
 */

import { describe, it, expect } from "vitest";
import { calculateAcuity } from "../engine/acuity";
import { comparePatientsByRoom, parseRoomBed } from "../utils/sortPatients";
import { PATIENT_SECTIONS, type PatientEntry, type Task, type PatientSection } from "../types";

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
    diagnosis: null,
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

// ─── Section ordering (mirrors PatientList.tsx) ─────────────────────────────

const SECTION_ORDER: Record<string, number> = Object.fromEntries(
  PATIENT_SECTIONS.map((s, i) => [s, i])
);

/**
 * Reimplementation of PatientList's filtering logic.
 */
function filterBySection(patients: PatientEntry[], activeSection: string): PatientEntry[] {
  return activeSection === "ALL"
    ? patients
    : patients.filter((p) => p.section === activeSection);
}

/**
 * Reimplementation of PatientList's room sort (default).
 */
function sortByRoom(patients: PatientEntry[], activeSection: string): PatientEntry[] {
  const sorted = [...patients];
  if (activeSection === "ALL") {
    sorted.sort((a, b) => {
      const dDiff = (a.discharged ? 1 : 0) - (b.discharged ? 1 : 0);
      if (dDiff !== 0) return dDiff;
      const secDiff = (SECTION_ORDER[a.section] ?? 99) - (SECTION_ORDER[b.section] ?? 99);
      if (secDiff !== 0) return secDiff;
      return comparePatientsByRoom(a, b);
    });
  } else {
    sorted.sort((a, b) => {
      const dDiff = (a.discharged ? 1 : 0) - (b.discharged ? 1 : 0);
      if (dDiff !== 0) return dDiff;
      return comparePatientsByRoom(a, b);
    });
  }
  return sorted;
}

/**
 * Reimplementation of PatientList's severity sort.
 */
function sortBySeverity(patients: PatientEntry[]): PatientEntry[] {
  return [...patients].sort((a, b) => {
    const dDiff = (a.discharged ? 1 : 0) - (b.discharged ? 1 : 0);
    if (dDiff !== 0) return dDiff;
    return calculateAcuity(b).score - calculateAcuity(a).score || (a.order ?? 0) - (b.order ?? 0);
  });
}

/**
 * Reimplementation of PatientList's name sort.
 */
function sortByName(patients: PatientEntry[]): PatientEntry[] {
  return [...patients].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "he"));
}

/**
 * Reimplementation of pending count sort (PatientList "pending" mode).
 */
function sortByPending(patients: PatientEntry[]): PatientEntry[] {
  const pendingCount = (p: PatientEntry) =>
    [...p.tasks, ...p.generatedTasks.filter(t => !t.dismissed)].filter(t => !t.done).length;
  return [...patients].sort((a, b) => {
    const dDiff = (a.discharged ? 1 : 0) - (b.discharged ? 1 : 0);
    if (dDiff !== 0) return dDiff;
    const diff = pendingCount(b) - pendingCount(a);
    if (diff !== 0) return diff;
    return comparePatientsByRoom(a, b);
  });
}

/**
 * Reimplementation of activity sort (PatientList "activity" mode).
 */
function sortByActivity(patients: PatientEntry[]): PatientEntry[] {
  const hasActivity = (p: PatientEntry) => {
    if (p.tasks.some(t => t.source === "manual")) return true;
    if ([...p.tasks, ...p.generatedTasks.filter(t => !t.dismissed)].some(t => t.done)) return true;
    if (p.handoverNote) return true;
    if ((p.notes ?? []).length > 0) return true;
    return false;
  };
  return [...patients].sort((a, b) => {
    const dDiff = (a.discharged ? 1 : 0) - (b.discharged ? 1 : 0);
    if (dDiff !== 0) return dDiff;
    const aAct = hasActivity(a) ? 0 : 1;
    const bAct = hasActivity(b) ? 0 : 1;
    if (aAct !== bAct) return aAct - bAct;
    return comparePatientsByRoom(a, b);
  });
}

// ─── Section filtering ────────────────────────────────────────────────────────

describe("PatientList — section filtering", () => {
  const patients = [
    makePatient({ id: "a1", section: "SIDE_A", room: "101" }),
    makePatient({ id: "a2", section: "SIDE_A", room: "102" }),
    makePatient({ id: "b1", section: "SIDE_B", room: "201" }),
    makePatient({ id: "c1", section: "SIDE_C", room: "301" }),
    makePatient({ id: "r1", section: "REHAB", room: "401" }),
  ];

  it("returns all patients when activeSection is ALL", () => {
    const result = filterBySection(patients, "ALL");
    expect(result).toHaveLength(5);
  });

  it("filters to SIDE_A patients only", () => {
    const result = filterBySection(patients, "SIDE_A");
    expect(result).toHaveLength(2);
    expect(result.every(p => p.section === "SIDE_A")).toBe(true);
  });

  it("filters to SIDE_B patients only", () => {
    const result = filterBySection(patients, "SIDE_B");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("b1");
  });

  it("returns empty array for section with no patients", () => {
    const result = filterBySection(patients, "MONITOR");
    expect(result).toHaveLength(0);
  });

  it("filters to REHAB section", () => {
    const result = filterBySection(patients, "REHAB");
    expect(result).toHaveLength(1);
    expect(result[0].section).toBe("REHAB");
  });
});

// ─── Empty state ──────────────────────────────────────────────────────────────

describe("PatientList — empty state", () => {
  it("empty patients array triggers empty state", () => {
    const filtered = filterBySection([], "ALL");
    expect(filtered).toHaveLength(0);
  });

  it("patients exist but not in selected section triggers empty state", () => {
    const patients = [makePatient({ section: "SIDE_A" })];
    const filtered = filterBySection(patients, "SIDE_B");
    expect(filtered).toHaveLength(0);
  });
});

// ─── Room sorting ─────────────────────────────────────────────────────────────

describe("PatientList — room sort (default)", () => {
  it("sorts patients by room number ascending", () => {
    const patients = [
      makePatient({ id: "p3", room: "300", section: "SIDE_A" }),
      makePatient({ id: "p1", room: "100", section: "SIDE_A" }),
      makePatient({ id: "p2", room: "200", section: "SIDE_A" }),
    ];
    const sorted = sortByRoom(patients, "SIDE_A");
    expect(sorted.map(p => p.id)).toEqual(["p1", "p2", "p3"]);
  });

  it("sorts by room/bed number (e.g. 101/1, 101/2)", () => {
    const patients = [
      makePatient({ id: "p2", room: "101/2", section: "SIDE_A" }),
      makePatient({ id: "p1", room: "101/1", section: "SIDE_A" }),
      makePatient({ id: "p3", room: "102/1", section: "SIDE_A" }),
    ];
    const sorted = sortByRoom(patients, "SIDE_A");
    expect(sorted.map(p => p.id)).toEqual(["p1", "p2", "p3"]);
  });

  it("groups by section in ALL mode, then sorts by room within section", () => {
    const patients = [
      makePatient({ id: "b1", section: "SIDE_B", room: "201" }),
      makePatient({ id: "a2", section: "SIDE_A", room: "102" }),
      makePatient({ id: "a1", section: "SIDE_A", room: "101" }),
      makePatient({ id: "c1", section: "SIDE_C", room: "301" }),
    ];
    const sorted = sortByRoom(patients, "ALL");
    // SIDE_A first, then SIDE_B, then SIDE_C
    expect(sorted.map(p => p.id)).toEqual(["a1", "a2", "b1", "c1"]);
  });

  it("discharged patients sort to the bottom", () => {
    const patients = [
      makePatient({ id: "d1", room: "100", discharged: true, section: "SIDE_A" }),
      makePatient({ id: "a1", room: "200", discharged: false, section: "SIDE_A" }),
    ];
    const sorted = sortByRoom(patients, "SIDE_A");
    expect(sorted[0].id).toBe("a1");
    expect(sorted[1].id).toBe("d1");
  });

  it("null room sorts to the end (Infinity)", () => {
    const patients = [
      makePatient({ id: "noroom", room: null, section: "SIDE_A" }),
      makePatient({ id: "hasroom", room: "100", section: "SIDE_A" }),
    ];
    const sorted = sortByRoom(patients, "SIDE_A");
    expect(sorted[0].id).toBe("hasroom");
    expect(sorted[1].id).toBe("noroom");
  });
});

// ─── Severity sorting ─────────────────────────────────────────────────────────

describe("PatientList — severity sort", () => {
  it("places patient with stat tasks before patient with no tasks", () => {
    const sickPatient = makePatient({
      id: "sick",
      tasks: [
        makeTask({ id: "t1", urgency: "stat", done: false }),
        makeTask({ id: "t2", urgency: "stat", done: false }),
      ],
    });
    const healthyPatient = makePatient({ id: "healthy" });
    const sorted = sortBySeverity([healthyPatient, sickPatient]);
    expect(sorted[0].id).toBe("sick");
  });

  it("discharged patients sort to bottom regardless of acuity", () => {
    const discharged = makePatient({
      id: "discharged",
      discharged: true,
      tasks: [makeTask({ id: "t1", urgency: "stat", done: false })],
    });
    const active = makePatient({ id: "active" });
    const sorted = sortBySeverity([discharged, active]);
    expect(sorted[0].id).toBe("active");
    expect(sorted[1].id).toBe("discharged");
  });

  it("falls back to order field when acuity is equal", () => {
    const p1 = makePatient({ id: "p1", order: 1 });
    const p2 = makePatient({ id: "p2", order: 0 });
    const sorted = sortBySeverity([p1, p2]);
    // Both have score 0, so p2 (order=0) should come first
    expect(sorted[0].id).toBe("p2");
    expect(sorted[1].id).toBe("p1");
  });
});

// ─── Name sorting ─────────────────────────────────────────────────────────────

describe("PatientList — name sort", () => {
  it("sorts patients alphabetically by Hebrew name", () => {
    const patients = [
      makePatient({ id: "p2", name: "לוי שרה" }),
      makePatient({ id: "p1", name: "אברהם יצחק" }),
      makePatient({ id: "p3", name: "כהן דוד" }),
    ];
    const sorted = sortByName(patients);
    expect(sorted[0].name).toBe("אברהם יצחק");
    // Hebrew collation: alef < kaf < lamed
    expect(sorted[sorted.length - 1].name).toBe("לוי שרה");
  });

  it("handles null names without crashing", () => {
    const patients = [
      makePatient({ id: "p2", name: "כהן" }),
      makePatient({ id: "p1", name: null }),
    ];
    // Should not throw when names are null
    const sorted = sortByName(patients);
    expect(sorted).toHaveLength(2);
    // Both patients should be present regardless of sort order
    expect(sorted.map(p => p.id).sort()).toEqual(["p1", "p2"]);
  });
});

// ─── Pending sort ─────────────────────────────────────────────────────────────

describe("PatientList — pending tasks sort", () => {
  it("patient with more pending tasks sorts first", () => {
    const manyTasks = makePatient({
      id: "many",
      tasks: [
        makeTask({ id: "t1", done: false }),
        makeTask({ id: "t2", done: false }),
        makeTask({ id: "t3", done: false }),
      ],
    });
    const fewTasks = makePatient({
      id: "few",
      tasks: [makeTask({ id: "t4", done: false })],
    });
    const sorted = sortByPending([fewTasks, manyTasks]);
    expect(sorted[0].id).toBe("many");
  });

  it("counts generatedTasks (non-dismissed) in pending count", () => {
    const generated = makePatient({
      id: "gen",
      tasks: [],
      generatedTasks: [
        makeTask({ id: "g1", done: false }),
        makeTask({ id: "g2", done: false }),
      ],
    });
    const manual = makePatient({
      id: "man",
      tasks: [makeTask({ id: "t1", done: false })],
    });
    const sorted = sortByPending([manual, generated]);
    expect(sorted[0].id).toBe("gen");
  });

  it("does not count dismissed tasks in pending", () => {
    const dismissed = makePatient({
      id: "dis",
      tasks: [],
      generatedTasks: [
        makeTask({ id: "g1", done: false, dismissed: true }),
        makeTask({ id: "g2", done: false, dismissed: true }),
      ],
    });
    const active = makePatient({
      id: "act",
      tasks: [makeTask({ id: "t1", done: false })],
    });
    const sorted = sortByPending([active, dismissed]);
    expect(sorted[0].id).toBe("act");
  });

  it("discharged patients sort to bottom", () => {
    const discharged = makePatient({
      id: "d",
      discharged: true,
      tasks: [
        makeTask({ id: "t1", done: false }),
        makeTask({ id: "t2", done: false }),
        makeTask({ id: "t3", done: false }),
      ],
    });
    const active = makePatient({
      id: "a",
      tasks: [makeTask({ id: "t4", done: false })],
    });
    const sorted = sortByPending([discharged, active]);
    expect(sorted[0].id).toBe("a");
  });

  it("falls back to room sort when pending count is equal", () => {
    const p1 = makePatient({
      id: "p1",
      room: "200",
      tasks: [makeTask({ id: "t1", done: false })],
    });
    const p2 = makePatient({
      id: "p2",
      room: "100",
      tasks: [makeTask({ id: "t2", done: false })],
    });
    const sorted = sortByPending([p1, p2]);
    // Same pending count (1 each), so room 100 < room 200
    expect(sorted[0].id).toBe("p2");
  });
});

// ─── Activity sort ────────────────────────────────────────────────────────────

describe("PatientList — activity sort", () => {
  it("patient with manual tasks sorts before patient with no activity", () => {
    const active = makePatient({
      id: "active",
      tasks: [makeTask({ id: "t1", source: "manual", done: false })],
    });
    const inactive = makePatient({ id: "inactive" });
    const sorted = sortByActivity([inactive, active]);
    expect(sorted[0].id).toBe("active");
  });

  it("patient with handover note counts as activity", () => {
    const withNote = makePatient({
      id: "noted",
      handoverNote: "Follow up on labs",
    });
    const without = makePatient({ id: "bare" });
    const sorted = sortByActivity([without, withNote]);
    expect(sorted[0].id).toBe("noted");
  });

  it("patient with completed tasks counts as activity", () => {
    const withDone = makePatient({
      id: "done",
      tasks: [makeTask({ id: "t1", done: true, source: "extracted" })],
    });
    const noDone = makePatient({ id: "nodone" });
    const sorted = sortByActivity([noDone, withDone]);
    expect(sorted[0].id).toBe("done");
  });

  it("patient with notes counts as activity", () => {
    const withNotes = makePatient({
      id: "noted",
      notes: ["Called family at 3pm"],
    });
    const noNotes = makePatient({ id: "nonotes" });
    const sorted = sortByActivity([noNotes, withNotes]);
    expect(sorted[0].id).toBe("noted");
  });

  it("discharged patients sort to bottom even with activity", () => {
    const discharged = makePatient({
      id: "d",
      discharged: true,
      handoverNote: "Some note",
    });
    const active = makePatient({ id: "a" });
    const sorted = sortByActivity([discharged, active]);
    expect(sorted[0].id).toBe("a");
  });
});

// ─── parseRoomBed utility ─────────────────────────────────────────────────────

describe("PatientList — parseRoomBed utility", () => {
  it("parses room/bed format", () => {
    expect(parseRoomBed("101/2")).toEqual({ roomNum: 101, bedNum: 2 });
  });

  it("parses room-bed format", () => {
    expect(parseRoomBed("101-3")).toEqual({ roomNum: 101, bedNum: 3 });
  });

  it("parses simple room number", () => {
    expect(parseRoomBed("205")).toEqual({ roomNum: 205, bedNum: 0 });
  });

  it("returns Infinity for null room", () => {
    expect(parseRoomBed(null)).toEqual({ roomNum: Infinity, bedNum: Infinity });
  });

  it("returns Infinity for non-numeric room", () => {
    const result = parseRoomBed("ICU");
    expect(result.roomNum).toBe(Infinity);
  });
});

// ─── comparePatientsByRoom ────────────────────────────────────────────────────

describe("PatientList — comparePatientsByRoom", () => {
  it("sorts by room number ascending", () => {
    const a = makePatient({ room: "100" });
    const b = makePatient({ room: "200" });
    expect(comparePatientsByRoom(a, b)).toBeLessThan(0);
  });

  it("sorts by bed number when room is same", () => {
    const a = makePatient({ room: "101/1" });
    const b = makePatient({ room: "101/2" });
    expect(comparePatientsByRoom(a, b)).toBeLessThan(0);
  });

  it("falls back to order when room and bed are same", () => {
    const a = makePatient({ room: "101", order: 2 });
    const b = makePatient({ room: "101", order: 1 });
    expect(comparePatientsByRoom(a, b)).toBeGreaterThan(0);
  });

  it("returns 0 for same room, bed, and order", () => {
    const a = makePatient({ room: "101" });
    const b = makePatient({ room: "101" });
    expect(comparePatientsByRoom(a, b)).toBe(0);
  });
});

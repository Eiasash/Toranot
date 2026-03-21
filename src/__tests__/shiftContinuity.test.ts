import { describe, it, expect } from "vitest";
import { buildShiftContinuity } from "../engine/shiftContinuity";
import type { PatientEntry } from "../types";
import type { ShiftSnapshot } from "../context/reducer";

function makePatient(overrides: Partial<PatientEntry> = {}): PatientEntry {
  return {
    id: "p1",
    section: "SIDE_A",
    date: "21/03/2026",
    room: "70",
    name: "כהן שרה",
    age: 82,
    diagnosis: null,
    flags: [],
    status: [],
    tomorrowNotes: [],
    tasks: [],
    generatedTasks: [],
    scannedAt: new Date().toISOString(),
    confidence: 1,
    ...overrides,
  };
}

function makeTask(text: string, done = false) {
  return {
    id: `t-${Math.random().toString(36).slice(2, 8)}`,
    text,
    urgency: "routine" as const,
    source: "manual" as const,
    done,
    doneTime: null,
    time: null,
    confidence: 1,
  };
}

function makeSnapshot(patients: PatientEntry[]): ShiftSnapshot {
  return {
    id: "snap-1",
    date: new Date().toISOString(),
    label: "20/03 — ערב",
    patients,
    archivedAt: new Date().toISOString(),
  };
}

describe("shiftContinuity", () => {
  it("returns empty map with no shift history", () => {
    const result = buildShiftContinuity([makePatient()], []);
    expect(result.size).toBe(0);
  });

  it("matches patient by room + name prefix", () => {
    const prev = makePatient({
      handoverNote: "מטופלת עם דליריום, ממתינה ל-CT ראש",
    });
    const curr = makePatient(); // same room=70, name=כהן שרה

    const result = buildShiftContinuity([curr], [makeSnapshot([prev])]);
    expect(result.has(curr.id)).toBe(true);
    expect(result.get(curr.id)!.handoverNote).toContain("דליריום");
  });

  it("surfaces open tasks from previous shift", () => {
    const prev = makePatient({
      tasks: [makeTask("recheck K+"), makeTask("CBC done", true)],
    });
    const curr = makePatient();

    const result = buildShiftContinuity([curr], [makeSnapshot([prev])]);
    expect(result.get(curr.id)!.openTasks).toEqual(["recheck K+"]);
  });

  it("surfaces flags from previous shift", () => {
    const prev = makePatient({ flags: ["DNR", "NPO"] });
    const curr = makePatient();

    const result = buildShiftContinuity([curr], [makeSnapshot([prev])]);
    expect(result.get(curr.id)!.flags).toEqual(["DNR", "NPO"]);
  });

  it("does not return patients with no meaningful context", () => {
    const prev = makePatient({ handoverNote: "", flags: [] });
    const curr = makePatient();

    const result = buildShiftContinuity([curr], [makeSnapshot([prev])]);
    expect(result.size).toBe(0);
  });

  it("matches by name even if room changed", () => {
    const prev = makePatient({ room: "80", handoverNote: "unstable overnight" });
    const curr = makePatient({ room: "70" }); // same name, different room

    const result = buildShiftContinuity([curr], [makeSnapshot([prev])]);
    expect(result.has(curr.id)).toBe(true);
  });

  it("handles OCR name variations (prefix match)", () => {
    const prev = makePatient({
      name: "כהן ש",
      room: "70",
      handoverNote: "fever workup ongoing",
    });
    const curr = makePatient({ name: "כהן שרה", room: "70" });

    const result = buildShiftContinuity([curr], [makeSnapshot([prev])]);
    expect(result.has(curr.id)).toBe(true);
  });

  it("includes shift label and archivedAt", () => {
    const prev = makePatient({ handoverNote: "test note here" });
    const snap = makeSnapshot([prev]);
    const curr = makePatient();

    const result = buildShiftContinuity([curr], [snap]);
    const ctx = result.get(curr.id)!;
    expect(ctx.shiftLabel).toBe("20/03 — ערב");
    expect(ctx.archivedAt).toBeTruthy();
  });

  it("handles multiple patients", () => {
    const prev1 = makePatient({ id: "p1", room: "70", name: "כהן שרה", handoverNote: "note for patient 1" });
    const prev2 = makePatient({ id: "p2", room: "80", name: "לוי דוד", handoverNote: "note for patient 2" });
    const curr1 = makePatient({ id: "c1", room: "70", name: "כהן שרה" });
    const curr2 = makePatient({ id: "c2", room: "80", name: "לוי דוד" });
    const curr3 = makePatient({ id: "c3", room: "90", name: "חדש לגמרי" });

    const result = buildShiftContinuity([curr1, curr2, curr3], [makeSnapshot([prev1, prev2])]);
    expect(result.has("c1")).toBe(true);
    expect(result.has("c2")).toBe(true);
    expect(result.has("c3")).toBe(false);
  });

  it("uses only the most recent shift", () => {
    const older = makeSnapshot([makePatient({ handoverNote: "old note" })]);
    older.archivedAt = "2026-03-19T00:00:00Z";
    const newer = makeSnapshot([makePatient({ handoverNote: "recent note" })]);
    newer.archivedAt = "2026-03-20T00:00:00Z";

    // shiftHistory[0] is most recent
    const result = buildShiftContinuity([makePatient()], [newer, older]);
    expect(result.get("p1")!.handoverNote).toBe("recent note");
  });

  it("filters out dismissed generated tasks", () => {
    const prev = makePatient({
      generatedTasks: [
        { ...makeTask("auto task"), dismissed: true, done: true },
        makeTask("active gen task"),
      ],
    });
    const curr = makePatient();

    const result = buildShiftContinuity([curr], [makeSnapshot([prev])]);
    expect(result.get(curr.id)!.openTasks).toEqual(["active gen task"]);
  });
});

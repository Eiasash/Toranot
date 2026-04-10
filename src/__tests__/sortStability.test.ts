/**
 * Sort stability tests for patient list ordering.
 *
 * Verifies that comparePatientsByRoom produces deterministic results
 * when used with Array.sort — patients with equal room/bed maintain
 * consistent ordering across repeated sorts.
 */

import { describe, it, expect } from "vitest";
import { parseRoomBed, comparePatientsByRoom } from "../utils/sortPatients";
import type { PatientEntry } from "../types";

function makePatient(overrides: Partial<PatientEntry> = {}): PatientEntry {
  return {
    id: overrides.id ?? "pt-1",
    section: overrides.section ?? "SIDE_A",
    date: "01/01/2025",
    room: overrides.room ?? "101",
    name: overrides.name ?? "כהן יוסף",
    age: overrides.age ?? 70,
    diagnosis: null,
    flags: [],
    status: [],
    tomorrowNotes: [],
    tasks: [],
    generatedTasks: [],
    notes: [],
    scannedAt: "2025-01-01T00:00:00.000Z",
    confidence: 1,
    order: overrides.order ?? 0,
  };
}

describe("sort stability — deterministic ordering", () => {
  it("repeated sorts produce identical order", () => {
    const patients = [
      makePatient({ id: "a", room: "50/1", order: 0 }),
      makePatient({ id: "b", room: "49/2", order: 1 }),
      makePatient({ id: "c", room: "50/2", order: 2 }),
      makePatient({ id: "d", room: "49/1", order: 3 }),
      makePatient({ id: "e", room: "51/1", order: 4 }),
    ];

    const sorted1 = [...patients].sort(comparePatientsByRoom);
    const sorted2 = [...patients].sort(comparePatientsByRoom);
    const sorted3 = [...patients].sort(comparePatientsByRoom);

    expect(sorted1.map((p) => p.id)).toEqual(sorted2.map((p) => p.id));
    expect(sorted2.map((p) => p.id)).toEqual(sorted3.map((p) => p.id));
  });

  it("patients with same room/bed but different order are stable", () => {
    const patients = [
      makePatient({ id: "c", room: "49/1", order: 2 }),
      makePatient({ id: "a", room: "49/1", order: 0 }),
      makePatient({ id: "b", room: "49/1", order: 1 }),
    ];

    const sorted = [...patients].sort(comparePatientsByRoom);
    // Should sort by order: a(0), b(1), c(2)
    expect(sorted.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("large list sorts correctly (30 patients)", () => {
    const patients: PatientEntry[] = [];
    for (let i = 0; i < 30; i++) {
      const room = Math.floor(40 + i / 3);
      const bed = (i % 3) + 1;
      patients.push(makePatient({
        id: `pt-${i}`,
        room: `${room}/${bed}`,
        order: i,
      }));
    }

    // Shuffle
    const shuffled = [...patients].sort(() => Math.random() - 0.5);
    const sorted = shuffled.sort(comparePatientsByRoom);

    // Verify ascending room/bed order
    for (let i = 1; i < sorted.length; i++) {
      const cmp = comparePatientsByRoom(sorted[i - 1], sorted[i]);
      expect(cmp).toBeLessThanOrEqual(0);
    }
  });

  it("equal room+bed+order yields stable 0", () => {
    const a = makePatient({ id: "a", room: "49/1", order: 0 });
    const b = makePatient({ id: "b", room: "49/1", order: 0 });
    expect(comparePatientsByRoom(a, b)).toBe(0);
    expect(comparePatientsByRoom(b, a)).toBe(0);
  });
});

describe("parseRoomBed — extended edge cases", () => {
  it("handles leading zeros in room", () => {
    expect(parseRoomBed("049/2")).toEqual({ roomNum: 49, bedNum: 2 });
  });

  it("handles leading zeros in bed", () => {
    expect(parseRoomBed("49/02")).toEqual({ roomNum: 49, bedNum: 2 });
  });

  it("handles empty string", () => {
    const result = parseRoomBed("");
    expect(result.roomNum).toBe(Infinity);
  });

  it("handles pure number with no separator", () => {
    const result = parseRoomBed("42");
    expect(result).toEqual({ roomNum: 42, bedNum: 0 });
  });

  it("handles large room numbers", () => {
    expect(parseRoomBed("999/9")).toEqual({ roomNum: 999, bedNum: 9 });
  });

  it("handles single-digit room", () => {
    expect(parseRoomBed("5/1")).toEqual({ roomNum: 5, bedNum: 1 });
  });

  it("Hebrew room label returns Infinity", () => {
    const result = parseRoomBed("חדר");
    expect(result.roomNum).toBe(Infinity);
  });

  it("mixed Hebrew-number that doesn't match pattern", () => {
    const result = parseRoomBed("ניטור2");
    expect(result.roomNum).toBe(Infinity);
  });
});

describe("comparePatientsByRoom — antisymmetry and transitivity", () => {
  it("antisymmetry: cmp(a,b) === -cmp(b,a)", () => {
    const a = makePatient({ room: "49/1", order: 0 });
    const b = makePatient({ room: "50/2", order: 1 });
    expect(comparePatientsByRoom(a, b)).toBe(-comparePatientsByRoom(b, a));
  });

  it("transitivity: a < b < c implies a < c", () => {
    const a = makePatient({ room: "49/1", order: 0 });
    const b = makePatient({ room: "50/1", order: 1 });
    const c = makePatient({ room: "51/1", order: 2 });
    expect(comparePatientsByRoom(a, b)).toBeLessThan(0);
    expect(comparePatientsByRoom(b, c)).toBeLessThan(0);
    expect(comparePatientsByRoom(a, c)).toBeLessThan(0);
  });

  it("null rooms sort after numbered rooms", () => {
    const a = makePatient({ room: "49/1" });
    const b = makePatient({ room: null as unknown as string });
    // @ts-expect-error -- testing null room edge case
    b.room = null;
    expect(comparePatientsByRoom(a, b)).toBeLessThan(0);
  });
});

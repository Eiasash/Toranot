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

describe("parseRoomBed", () => {
  it('parses "49/2" → roomNum:49, bedNum:2', () => {
    expect(parseRoomBed("49/2")).toEqual({ roomNum: 49, bedNum: 2 });
  });

  it('parses "55-1" (hyphen) → roomNum:55, bedNum:1', () => {
    expect(parseRoomBed("55-1")).toEqual({ roomNum: 55, bedNum: 1 });
  });

  it("rooms without / default bedNum to 0", () => {
    expect(parseRoomBed("101")).toEqual({ roomNum: 101, bedNum: 0 });
  });

  it("non-numeric room returns Infinity", () => {
    const result = parseRoomBed("ניטור-1");
    // "ניטור-1" doesn't match the ^\d+[/-]\d+$ pattern, and parseInt returns NaN
    expect(result.roomNum).toBe(Infinity);
  });

  it("null room returns Infinity for both", () => {
    expect(parseRoomBed(null)).toEqual({ roomNum: Infinity, bedNum: Infinity });
  });
});

describe("comparePatientsByRoom", () => {
  it("sorts by room number first", () => {
    const a = makePatient({ room: "50/1", order: 0 });
    const b = makePatient({ room: "49/1", order: 1 });
    expect(comparePatientsByRoom(a, b)).toBeGreaterThan(0);
  });

  it("sorts by bed number when rooms are equal", () => {
    const a = makePatient({ room: "49/2", order: 0 });
    const b = makePatient({ room: "49/1", order: 1 });
    expect(comparePatientsByRoom(a, b)).toBeGreaterThan(0);
  });

  it("uses order as final tiebreaker when room and bed are equal", () => {
    const a = makePatient({ room: "49/1", order: 5 });
    const b = makePatient({ room: "49/1", order: 2 });
    expect(comparePatientsByRoom(a, b)).toBeGreaterThan(0); // 5 > 2
    expect(comparePatientsByRoom(b, a)).toBeLessThan(0);
  });

  it("equal room/bed/order returns 0", () => {
    const a = makePatient({ room: "49/1", order: 0 });
    const b = makePatient({ room: "49/1", order: 0 });
    expect(comparePatientsByRoom(a, b)).toBe(0);
  });
});

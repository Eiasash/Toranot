import { describe, it, expect, vi, afterEach } from "vitest";
import { isOnCallTime, getShiftStart, isNewThisShift } from "../utils/shiftTime";

describe("isOnCallTime", () => {
  it("returns true at 16:00 (shift start)", () => {
    expect(isOnCallTime(new Date("2026-03-04T16:00:00"))).toBe(true);
  });

  it("returns true at 23:59 (late night)", () => {
    expect(isOnCallTime(new Date("2026-03-04T23:59:00"))).toBe(true);
  });

  it("returns true at 00:00 (midnight)", () => {
    expect(isOnCallTime(new Date("2026-03-05T00:00:00"))).toBe(true);
  });

  it("returns true at 07:59 (just before shift end)", () => {
    expect(isOnCallTime(new Date("2026-03-05T07:59:00"))).toBe(true);
  });

  it("returns false at 08:00 (shift end)", () => {
    expect(isOnCallTime(new Date("2026-03-05T08:00:00"))).toBe(false);
  });

  it("returns false at 12:00 (midday)", () => {
    expect(isOnCallTime(new Date("2026-03-04T12:00:00"))).toBe(false);
  });

  it("returns false at 15:59 (just before shift start)", () => {
    expect(isOnCallTime(new Date("2026-03-04T15:59:00"))).toBe(false);
  });
});

describe("getShiftStart", () => {
  afterEach(() => vi.useRealTimers());

  it("returns yesterday 16:00 when current time is early morning", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-05T03:00:00"));
    const start = getShiftStart();
    expect(start.getDate()).toBe(4);
    expect(start.getHours()).toBe(16);
    expect(start.getMinutes()).toBe(0);
  });

  it("returns today 16:00 when current time is evening", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-04T20:00:00"));
    const start = getShiftStart();
    expect(start.getDate()).toBe(4);
    expect(start.getHours()).toBe(16);
  });

  it("returns today 16:00 when current time is exactly 16:00", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-04T16:00:00"));
    const start = getShiftStart();
    expect(start.getDate()).toBe(4);
    expect(start.getHours()).toBe(16);
  });
});

describe("isNewThisShift", () => {
  afterEach(() => vi.useRealTimers());

  it("returns false for undefined scannedAt", () => {
    expect(isNewThisShift(undefined)).toBe(false);
  });

  it("returns true for patient scanned during current shift", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-04T20:00:00"));
    // Scanned at 17:00 today (within current 16:00-08:00 shift)
    expect(isNewThisShift("2026-03-04T17:00:00")).toBe(true);
  });

  it("returns false for patient scanned before shift start", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-04T20:00:00"));
    // Scanned at 14:00 today (before 16:00 shift start)
    expect(isNewThisShift("2026-03-04T14:00:00")).toBe(false);
  });

  it("returns false for patient with done tasks (existing activity)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-04T20:00:00"));
    expect(isNewThisShift("2026-03-04T17:00:00", { hasDoneTasks: true })).toBe(false);
  });

  it("returns false for patient with manual tasks", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-04T20:00:00"));
    expect(isNewThisShift("2026-03-04T17:00:00", { hasManualTasks: true })).toBe(false);
  });

  it("returns false for patient with notes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-04T20:00:00"));
    expect(isNewThisShift("2026-03-04T17:00:00", { hasNotes: true })).toBe(false);
  });

  it("returns false for patient with labs", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-04T20:00:00"));
    expect(isNewThisShift("2026-03-04T17:00:00", { hasLabs: true })).toBe(false);
  });

  it("returns false for patient with handover note", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-04T20:00:00"));
    expect(isNewThisShift("2026-03-04T17:00:00", { hasHandoverNote: true })).toBe(false);
  });

  it("returns true when activity object has all false flags", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-04T20:00:00"));
    expect(isNewThisShift("2026-03-04T17:00:00", {
      hasDoneTasks: false, hasManualTasks: false,
      hasNotes: false, hasLabs: false, hasHandoverNote: false,
    })).toBe(true);
  });

  it("handles early morning correctly (scanned yesterday evening)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-05T03:00:00"));
    // Scanned at 18:00 yesterday — within the current shift (started 16:00 Mar 4)
    expect(isNewThisShift("2026-03-04T18:00:00")).toBe(true);
  });

  it("returns false for previous shift scan when in early morning", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-05T03:00:00"));
    // Scanned at 15:00 yesterday — before current shift start (16:00 Mar 4)
    expect(isNewThisShift("2026-03-04T15:00:00")).toBe(false);
  });
});

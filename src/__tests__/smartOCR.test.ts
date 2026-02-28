import { describe, it, expect } from "vitest";
import { detectScanChanges, formatScanDiffSummary } from "../engine/smartOCR";
import type { PatientEntry, Task } from "../types";

function makePatient(overrides: Partial<PatientEntry> = {}): PatientEntry {
  return {
    id: overrides.id ?? "pt-1",
    section: overrides.section ?? "SIDE_A",
    date: overrides.date ?? "01/01/2025",
    room: overrides.room ?? "101",
    name: overrides.name ?? "כהן יוסף",
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
  };
}

function makeTask(text: string): Task {
  return {
    id: `t-${text.slice(0, 5)}`,
    text,
    urgency: "routine",
    source: "extracted",
    done: false,
    doneTime: null,
    time: null,
    confidence: 1,
  };
}

describe("detectScanChanges", () => {
  it("returns empty diff for identical lists", () => {
    const patients = [makePatient({ name: "כהן יוסף", room: "101" })];
    const diff = detectScanChanges(patients, patients);
    expect(diff.newPatients).toEqual([]);
    expect(diff.missingPatients).toEqual([]);
    expect(diff.changedPatients).toEqual([]);
    expect(diff.unchanged).toBe(1);
  });

  it("detects new patients", () => {
    const old = [makePatient({ name: "כהן יוסף" })];
    const newList = [
      makePatient({ name: "כהן יוסף" }),
      makePatient({ id: "pt-2", name: "לוי שרה", room: "102" }),
    ];
    const diff = detectScanChanges(old, newList);
    expect(diff.newPatients).toHaveLength(1);
    expect(diff.newPatients[0].name).toBe("לוי שרה");
  });

  it("detects missing patients (discharged)", () => {
    const old = [
      makePatient({ name: "כהן יוסף" }),
      makePatient({ id: "pt-2", name: "לוי שרה", room: "102" }),
    ];
    const newList = [makePatient({ name: "כהן יוסף" })];
    const diff = detectScanChanges(old, newList);
    expect(diff.missingPatients).toHaveLength(1);
    expect(diff.missingPatients[0].name).toBe("לוי שרה");
  });

  it("detects room changes (shows as missing + new with room-based keys)", () => {
    const old = [makePatient({ name: "כהן יוסף", room: "101" })];
    const newList = [makePatient({ name: "כהן יוסף", room: "102" })];
    const diff = detectScanChanges(old, newList);
    // With room::name composite key, room change = old key missing + new key added
    expect(diff.missingPatients).toHaveLength(1);
    expect(diff.newPatients).toHaveLength(1);
  });

  it("detects section changes", () => {
    const old = [makePatient({ name: "כהן יוסף", section: "SIDE_A" })];
    const newList = [makePatient({ name: "כהן יוסף", section: "SIDE_B" })];
    const diff = detectScanChanges(old, newList);
    expect(diff.changedPatients).toHaveLength(1);
    expect(diff.changedPatients[0].changes.some((c) => c.includes("מדור"))).toBe(true);
  });

  it("detects new tasks added", () => {
    const old = [makePatient({ name: "כהן יוסף", tasks: [makeTask("CBC morning")] })];
    const newList = [
      makePatient({
        name: "כהן יוסף",
        tasks: [makeTask("CBC morning"), makeTask("CT chest")],
      }),
    ];
    const diff = detectScanChanges(old, newList);
    expect(diff.changedPatients).toHaveLength(1);
    expect(diff.changedPatients[0].changes.some((c) => c.includes("משימות חדשות"))).toBe(true);
  });

  it("detects diagnosis change", () => {
    const old = [makePatient({ name: "כהן יוסף", diagnosis: "pneumonia" })];
    const newList = [makePatient({ name: "כהן יוסף", diagnosis: "PE" })];
    const diff = detectScanChanges(old, newList);
    expect(diff.changedPatients).toHaveLength(1);
    expect(diff.changedPatients[0].changes.some((c) => c.includes("אבחנה"))).toBe(true);
  });

  it("handles empty patient lists", () => {
    const diff = detectScanChanges([], []);
    expect(diff.newPatients).toEqual([]);
    expect(diff.missingPatients).toEqual([]);
    expect(diff.changedPatients).toEqual([]);
    expect(diff.unchanged).toBe(0);
  });

  it("skips patients with no name", () => {
    const old = [makePatient({ name: null })];
    const newList = [makePatient({ name: null })];
    const diff = detectScanChanges(old, newList);
    // Null names are skipped by normalizeKey, so they should not show in any bucket
    expect(diff.newPatients).toEqual([]);
    expect(diff.missingPatients).toEqual([]);
  });

  it("normalizes Hebrew niqqud for matching", () => {
    // Same name with and without niqqud should match
    const old = [makePatient({ name: "כֹּהֵן יוֹסֵף" })];
    const newList = [makePatient({ name: "כהן יוסף" })];
    const diff = detectScanChanges(old, newList);
    expect(diff.newPatients).toEqual([]);
    expect(diff.missingPatients).toEqual([]);
  });

  it("handles multiple changes for same patient (same room)", () => {
    const old = [makePatient({ name: "כהן יוסף", room: "101", section: "SIDE_A", diagnosis: "UTI" })];
    const newList = [makePatient({ name: "כהן יוסף", room: "101", section: "SIDE_B", diagnosis: "Sepsis" })];
    const diff = detectScanChanges(old, newList);
    expect(diff.changedPatients).toHaveLength(1);
    expect(diff.changedPatients[0].changes.length).toBeGreaterThanOrEqual(2);
  });
});

describe("formatScanDiffSummary", () => {
  it("returns null for no changes", () => {
    const result = formatScanDiffSummary({
      newPatients: [],
      missingPatients: [],
      changedPatients: [],
      unchanged: 5,
    });
    expect(result).toBeNull();
  });

  it("shows new patients count", () => {
    const result = formatScanDiffSummary({
      newPatients: [makePatient()],
      missingPatients: [],
      changedPatients: [],
      unchanged: 5,
    });
    expect(result).toContain("1 חדשים");
  });

  it("shows discharged/transferred count", () => {
    const result = formatScanDiffSummary({
      newPatients: [],
      missingPatients: [makePatient()],
      changedPatients: [],
      unchanged: 4,
    });
    expect(result).toContain("1 שוחררו/הועברו");
  });

  it("shows updated patients count", () => {
    const result = formatScanDiffSummary({
      newPatients: [],
      missingPatients: [],
      changedPatients: [{ patient: makePatient(), changes: ["room change"] }],
      unchanged: 4,
    });
    expect(result).toContain("1 עודכנו");
  });

  it("combines multiple change types with pipe separator", () => {
    const result = formatScanDiffSummary({
      newPatients: [makePatient()],
      missingPatients: [makePatient({ id: "pt-2" })],
      changedPatients: [{ patient: makePatient({ id: "pt-3" }), changes: ["room"] }],
      unchanged: 2,
    });
    expect(result).toContain("|");
  });
});

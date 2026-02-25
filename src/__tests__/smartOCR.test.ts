import { describe, it, expect } from "vitest";
import {
  detectScanChanges,
  formatScanDiffSummary,
} from "../engine/smartOCR";
import type { PatientEntry } from "../types";

function makePatient(overrides: Partial<PatientEntry> = {}): PatientEntry {
  return {
    id: overrides.id ?? "pt-1",
    section: overrides.section ?? "SIDE_A",
    date: overrides.date ?? "01/01/2025",
    room: overrides.room ?? "101",
    name: overrides.name ?? "כהן יוסף",
    age: overrides.age ?? 75,
    diagnosis: overrides.diagnosis ?? null,
    flags: overrides.flags ?? [],
    status: overrides.status ?? [],
    tomorrowNotes: overrides.tomorrowNotes ?? [],
    tasks: overrides.tasks ?? [],
    generatedTasks: overrides.generatedTasks ?? [],
    notes: overrides.notes ?? [],
    scannedAt: overrides.scannedAt ?? new Date().toISOString(),
    confidence: overrides.confidence ?? 1,
  };
}

function makeTask(text: string) {
  return {
    id: `t-${Math.random().toString(36).slice(2)}`,
    text,
    urgency: "routine" as const,
    source: "extracted" as const,
    done: false,
    doneTime: null,
    time: null,
    confidence: 1,
  };
}

describe("detectScanChanges", () => {
  it("returns empty diff for identical lists", () => {
    const patients = [makePatient()];
    const diff = detectScanChanges(patients, patients);
    expect(diff.newPatients).toEqual([]);
    expect(diff.missingPatients).toEqual([]);
    expect(diff.changedPatients).toEqual([]);
    expect(diff.unchanged).toBe(1);
  });

  it("detects new patients (admission)", () => {
    const old = [makePatient({ name: "כהן יוסף" })];
    const added = makePatient({ name: "לוי שרה" });
    const newList = [...old, added];

    const diff = detectScanChanges(old, newList);
    expect(diff.newPatients).toHaveLength(1);
    expect(diff.newPatients[0].name).toBe("לוי שרה");
  });

  it("detects missing patients (discharge)", () => {
    const old = [
      makePatient({ name: "כהן יוסף" }),
      makePatient({ name: "לוי שרה" }),
    ];
    const newList = [makePatient({ name: "כהן יוסף" })];

    const diff = detectScanChanges(old, newList);
    expect(diff.missingPatients).toHaveLength(1);
    expect(diff.missingPatients[0].name).toBe("לוי שרה");
  });

  it("detects room changes", () => {
    const old = [makePatient({ name: "כהן יוסף", room: "101" })];
    const newList = [makePatient({ name: "כהן יוסף", room: "205" })];

    const diff = detectScanChanges(old, newList);
    expect(diff.changedPatients).toHaveLength(1);
    expect(diff.changedPatients[0].changes.some((c) => c.includes("חדר"))).toBe(true);
  });

  it("detects section changes", () => {
    const old = [makePatient({ name: "כהן יוסף", section: "SIDE_A" })];
    const newList = [makePatient({ name: "כהן יוסף", section: "SIDE_B" })];

    const diff = detectScanChanges(old, newList);
    expect(diff.changedPatients).toHaveLength(1);
    expect(diff.changedPatients[0].changes.some((c) => c.includes("מדור"))).toBe(true);
  });

  it("detects new tasks added", () => {
    const old = [makePatient({ name: "כהן יוסף", tasks: [makeTask("blood test")] })];
    const newList = [
      makePatient({
        name: "כהן יוסף",
        tasks: [makeTask("blood test"), makeTask("ECG")],
      }),
    ];

    const diff = detectScanChanges(old, newList);
    expect(diff.changedPatients).toHaveLength(1);
    expect(diff.changedPatients[0].changes.some((c) => c.includes("משימות חדשות"))).toBe(true);
  });

  it("detects diagnosis change", () => {
    const old = [makePatient({ name: "כהן יוסף", diagnosis: "UTI" })];
    const newList = [makePatient({ name: "כהן יוסף", diagnosis: "Sepsis" })];

    const diff = detectScanChanges(old, newList);
    expect(diff.changedPatients).toHaveLength(1);
    expect(diff.changedPatients[0].changes.some((c) => c.includes("אבחנה"))).toBe(true);
  });

  it("handles empty lists gracefully", () => {
    const diff = detectScanChanges([], []);
    expect(diff.newPatients).toEqual([]);
    expect(diff.missingPatients).toEqual([]);
    expect(diff.changedPatients).toEqual([]);
    expect(diff.unchanged).toBe(0);
  });

  it("all new patients from empty old list", () => {
    const newList = [
      makePatient({ name: "כהן יוסף" }),
      makePatient({ name: "לוי שרה" }),
    ];
    const diff = detectScanChanges([], newList);
    expect(diff.newPatients).toHaveLength(2);
    expect(diff.missingPatients).toHaveLength(0);
  });

  it("all discharged from empty new list", () => {
    const old = [
      makePatient({ name: "כהן יוסף" }),
      makePatient({ name: "לוי שרה" }),
    ];
    const diff = detectScanChanges(old, []);
    expect(diff.missingPatients).toHaveLength(2);
    expect(diff.newPatients).toHaveLength(0);
  });

  it("ignores patients with null name (key normalization)", () => {
    const old = [makePatient({ name: null })];
    const newList = [makePatient({ name: null })];
    const diff = detectScanChanges(old, newList);
    // null names can't be keyed, so they're ignored
    expect(diff.newPatients).toHaveLength(0);
    expect(diff.missingPatients).toHaveLength(0);
  });

  it("normalizes Hebrew names (removes niqqud)", () => {
    const old = [makePatient({ name: "כֹּהֵן" })];
    const newList = [makePatient({ name: "כהן" })];
    const diff = detectScanChanges(old, newList);
    // Should match despite niqqud differences
    expect(diff.newPatients).toHaveLength(0);
    expect(diff.missingPatients).toHaveLength(0);
    expect(diff.unchanged).toBe(1);
  });

  it("handles complex scenario: add + remove + change simultaneously", () => {
    const old = [
      makePatient({ name: "כהן יוסף", room: "101" }),
      makePatient({ name: "לוי שרה", room: "102" }),
    ];
    const newList = [
      makePatient({ name: "כהן יוסף", room: "205" }),  // room changed
      makePatient({ name: "מזרחי דוד", room: "103" }), // new patient
    ];

    const diff = detectScanChanges(old, newList);
    expect(diff.newPatients).toHaveLength(1);
    expect(diff.newPatients[0].name).toBe("מזרחי דוד");
    expect(diff.missingPatients).toHaveLength(1);
    expect(diff.missingPatients[0].name).toBe("לוי שרה");
    expect(diff.changedPatients).toHaveLength(1);
    expect(diff.changedPatients[0].patient.name).toBe("כהן יוסף");
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

  it("formats new patients count", () => {
    const result = formatScanDiffSummary({
      newPatients: [makePatient()],
      missingPatients: [],
      changedPatients: [],
      unchanged: 5,
    });
    expect(result).toContain("1 חדשים");
  });

  it("formats missing patients count", () => {
    const result = formatScanDiffSummary({
      newPatients: [],
      missingPatients: [makePatient()],
      changedPatients: [],
      unchanged: 5,
    });
    expect(result).toContain("1 שוחררו/הועברו");
  });

  it("formats changed patients count", () => {
    const result = formatScanDiffSummary({
      newPatients: [],
      missingPatients: [],
      changedPatients: [{ patient: makePatient(), changes: ["room change"] }],
      unchanged: 5,
    });
    expect(result).toContain("1 עודכנו");
  });

  it("combines multiple change types with separator", () => {
    const result = formatScanDiffSummary({
      newPatients: [makePatient()],
      missingPatients: [makePatient()],
      changedPatients: [{ patient: makePatient(), changes: ["room change"] }],
      unchanged: 2,
    });
    expect(result).toContain("|");
    expect(result).toContain("חדשים");
    expect(result).toContain("שוחררו/הועברו");
    expect(result).toContain("עודכנו");
  });
});

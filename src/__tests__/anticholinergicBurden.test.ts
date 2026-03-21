import { describe, it, expect } from "vitest";
import { calculateACB, ACB_DRUGS } from "../engine/anticholinergicBurden";
import type { PatientEntry } from "../types";

function makePatient(overrides: Partial<PatientEntry> = {}): PatientEntry {
  return {
    id: "test-1",
    section: "SIDE_A",
    date: "01/01/2026",
    room: "70",
    name: "Test",
    age: 85,
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

describe("anticholinergicBurden", () => {
  it("returns none for patient with no drugs mentioned", () => {
    const result = calculateACB(makePatient({ diagnosis: "pneumonia" }));
    expect(result.totalScore).toBe(0);
    expect(result.severity).toBe("none");
    expect(result.detectedDrugs).toHaveLength(0);
  });

  it("detects single score-3 drug → moderate", () => {
    const result = calculateACB(makePatient({
      handoverNote: "מטופל עם oxybutynin 5mg x2",
    }));
    expect(result.totalScore).toBe(3);
    expect(result.severity).toBe("moderate");
    expect(result.detectedDrugs).toHaveLength(1);
    expect(result.detectedDrugs[0].name).toBe("Oxybutynin");
  });

  it("cumulates multiple drugs correctly", () => {
    const result = calculateACB(makePatient({
      handoverNote: "amitriptyline 25mg, hydroxyzine 25mg, quetiapine 25mg",
    }));
    // amitriptyline=3, hydroxyzine=3, quetiapine=2 → total 8
    expect(result.totalScore).toBe(8);
    expect(result.severity).toBe("high");
    expect(result.detectedDrugs).toHaveLength(3);
  });

  it("detects Hebrew drug names", () => {
    const result = calculateACB(makePatient({
      diagnosis: "אוקסיבוטינין 5mg, הידרוקסיזין 25mg",
    }));
    expect(result.totalScore).toBe(6); // 3+3
    expect(result.severity).toBe("high");
  });

  it("score-1 drugs accumulate to meaningful burden", () => {
    const result = calculateACB(makePatient({
      handoverNote: "furosemide 40mg, metoprolol 50mg, mirtazapine 15mg, warfarin 5mg, tramadol PRN",
    }));
    // furosemide=1, metoprolol=1, mirtazapine=1, warfarin=1, tramadol=1 → total 5
    expect(result.totalScore).toBe(5);
    expect(result.severity).toBe("high");
  });

  it("detects drugs in task text", () => {
    const result = calculateACB(makePatient({
      tasks: [
        { id: "t1", text: "נתתי diphenhydramine 25mg PO", urgency: "routine", source: "manual", done: false, doneTime: null, time: null, confidence: 1 },
      ],
    }));
    expect(result.totalScore).toBe(3);
    expect(result.detectedDrugs[0].name).toBe("Diphenhydramine");
  });

  it("low severity for score 1-2", () => {
    const result = calculateACB(makePatient({
      handoverNote: "furosemide 40mg",
    }));
    expect(result.totalScore).toBe(1);
    expect(result.severity).toBe("low");
  });

  it("moderate severity for score 3-4", () => {
    const result = calculateACB(makePatient({
      handoverNote: "amitriptyline 10mg", // score 3 only
    }));
    expect(result.totalScore).toBe(3);
    expect(result.severity).toBe("moderate");
  });

  it("empty patient returns none", () => {
    const result = calculateACB(makePatient());
    expect(result.totalScore).toBe(0);
    expect(result.severity).toBe("none");
    expect(result.message).toBe("");
  });

  it("does not double-count same drug mentioned in multiple fields", () => {
    // Each drug pattern matches once regardless of how many times it appears
    const result = calculateACB(makePatient({
      diagnosis: "amitriptyline",
      handoverNote: "amitriptyline 25mg nocte",
      status: ["on amitriptyline"],
    }));
    expect(result.detectedDrugs.filter(d => d.name === "Amitriptyline")).toHaveLength(1);
    expect(result.totalScore).toBe(3);
  });

  it("ACB drug database has expected count", () => {
    expect(ACB_DRUGS.length).toBe(34);
  });

  it("all score-3 drugs are classified correctly", () => {
    const score3 = ACB_DRUGS.filter(d => d.score === 3);
    expect(score3.length).toBeGreaterThanOrEqual(10);
  });

  it("detects brand names", () => {
    const result = calculateACB(makePatient({
      handoverNote: "Ditropan 5mg, Seroquel 25mg",
    }));
    expect(result.detectedDrugs.map(d => d.name).sort()).toEqual(
      ["Oxybutynin", "Quetiapine"].sort()
    );
  });

  it("buscopan detected as scopolamine", () => {
    const result = calculateACB(makePatient({
      handoverNote: "buscopan PRN for abdominal cramp",
    }));
    expect(result.detectedDrugs[0].name).toBe("Scopolamine");
    expect(result.totalScore).toBe(3);
  });
});

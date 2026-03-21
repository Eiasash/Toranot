import { describe, it, expect } from "vitest";
import { calculateFallsRisk } from "../engine/fallsRisk";
import type { PatientEntry } from "../types";

function makePatient(overrides: Partial<PatientEntry> = {}): PatientEntry {
  return {
    id: "test-1",
    section: "SIDE_A",
    date: "01/01/2026",
    room: "70",
    name: "Test",
    age: 75,
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

describe("fallsRisk", () => {
  it("returns low for young patient with no risk factors", () => {
    const result = calculateFallsRisk(makePatient({ age: 65 }));
    expect(result.severity).toBe("low");
    expect(result.score).toBe(0);
  });

  it("age ≥80 adds 1 point", () => {
    const result = calculateFallsRisk(makePatient({ age: 82 }));
    expect(result.components.some(c => c.label === "גיל ≥80")).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(1);
  });

  it("age ≥90 adds 2 points total (80 + 90)", () => {
    const result = calculateFallsRisk(makePatient({ age: 93 }));
    const agePoints = result.components
      .filter(c => c.label.startsWith("גיל"))
      .reduce((sum, c) => sum + c.points, 0);
    expect(agePoints).toBe(2);
  });

  it("benzodiazepine adds 2 points", () => {
    const result = calculateFallsRisk(makePatient({
      age: 65,
      handoverNote: "lorazepam 1mg PRN",
    }));
    expect(result.components.some(c => c.label === "בנזודיאזפין")).toBe(true);
  });

  it("opioid adds 1 point", () => {
    const result = calculateFallsRisk(makePatient({
      age: 65,
      handoverNote: "tramadol 50mg PRN",
    }));
    expect(result.components.some(c => c.label === "אופיואיד")).toBe(true);
  });

  it("delirium adds 2 points", () => {
    const result = calculateFallsRisk(makePatient({
      age: 65,
      diagnosis: "דליריום על רקע UTI",
    }));
    expect(result.components.some(c => c.label === "דליריום / בלבול")).toBe(true);
  });

  it("recent fall adds 2 points", () => {
    const result = calculateFallsRisk(makePatient({
      age: 65,
      diagnosis: "נפילה",
    }));
    expect(result.components.some(c => c.label === "נפילה אחרונה")).toBe(true);
  });

  it("mobility impairment detected from Hebrew", () => {
    const result = calculateFallsRisk(makePatient({
      age: 65,
      handoverNote: "תלוי בניידות, כיסא גלגלים",
    }));
    expect(result.components.some(c => c.label === "ניידות מוגבלת")).toBe(true);
  });

  it("composite high-risk patient scores correctly", () => {
    const result = calculateFallsRisk(makePatient({
      age: 88, // +1 for ≥80
      diagnosis: "דליריום, נפילה חוזרת", // +2 delirium, +2 fall
      handoverNote: "lorazepam 0.5mg, fentanyl patch 25mcg, quetiapine 25mg, amitriptyline 10mg",
      // benzo=+2, opioid=+1, ACB (amitriptyline=3 + quetiapine=2 + mirtazapine... actually just those) → ACB ≥3 → +2
      // psychotropics: benzo, opioid, quetiapine, amitriptyline = 4 → ≥2 → +2
    }));
    expect(result.severity).toBe("high");
    expect(result.score).toBeGreaterThanOrEqual(6);
  });

  it("moderate risk classification for score 3-5", () => {
    const result = calculateFallsRisk(makePatient({
      age: 82, // +1
      handoverNote: "lorazepam 0.5mg", // benzo +2, psychotropic counted
    }));
    expect(result.severity).toBe("moderate");
  });

  it("message includes score for non-zero results", () => {
    const result = calculateFallsRisk(makePatient({
      age: 85,
      handoverNote: "lorazepam 1mg, tramadol PRN, דליריום",
    }));
    expect(result.message).toContain(String(result.score));
  });

  it("null age does not add age points", () => {
    const result = calculateFallsRisk(makePatient({
      age: null,
      diagnosis: "pneumonia",
    }));
    expect(result.components.every(c => !c.label.startsWith("גיל"))).toBe(true);
  });

  it("orthostatic hypotension detected", () => {
    const result = calculateFallsRisk(makePatient({
      age: 65,
      status: ["orthostatic hypotension"],
    }));
    expect(result.components.some(c => c.label === "אורתוסטטיזם")).toBe(true);
  });
});

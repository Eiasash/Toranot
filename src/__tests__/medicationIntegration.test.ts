import { describe, it, expect } from "vitest";
import { calculateACB } from "../engine/anticholinergicBurden";
import { calculateFallsRisk } from "../engine/fallsRisk";
import { checkDrugInteractions } from "../engine/drugSafety";
import { checkBeersCriteria } from "../engine/drugSafety";
import { checkAllergyConflicts } from "../engine/drugSafety";
import type { PatientEntry } from "../types";

function makePatient(overrides: Partial<PatientEntry> = {}): PatientEntry {
  return {
    id: "test-1",
    section: "SIDE_A",
    date: "21/03/2026",
    room: "70",
    name: "Test Patient",
    age: 82,
    diagnosis: null,
    flags: [],
    status: [],
    tomorrowNotes: [],
    tasks: [],
    generatedTasks: [],
    scannedAt: new Date().toISOString(),
    confidence: 1,
    medications: [],
    ...overrides,
  };
}

describe("medications → engine integration", () => {
  describe("medications → ACB", () => {
    it("structured meds feed ACB scoring", () => {
      const result = calculateACB(makePatient({
        medications: ["Oxybutynin 5mg", "Amitriptyline 25mg"],
      }));
      // oxybutynin=3, amitriptyline=3 → total 6
      expect(result.totalScore).toBe(6);
      expect(result.severity).toBe("high");
    });

    it("meds detected even when handoverNote is empty", () => {
      const result = calculateACB(makePatient({
        handoverNote: "",
        medications: ["Hydroxyzine 25mg"],
      }));
      expect(result.totalScore).toBe(3);
    });

    it("meds and handoverNote don't double-count same drug", () => {
      const result = calculateACB(makePatient({
        handoverNote: "on oxybutynin 5mg for bladder",
        medications: ["Oxybutynin 5mg x2/day"],
      }));
      // Same drug mentioned in both — should only count once
      expect(result.detectedDrugs.filter(d => d.name === "Oxybutynin")).toHaveLength(1);
    });
  });

  describe("medications → falls risk", () => {
    it("benzo in med list triggers falls risk", () => {
      const result = calculateFallsRisk(makePatient({
        age: 85,
        medications: ["Lorazepam 0.5mg PRN"],
      }));
      expect(result.components.some(c => c.label === "בנזודיאזפין")).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(3);
    });

    it("multiple psychotropics from med list", () => {
      const result = calculateFallsRisk(makePatient({
        age: 65,
        medications: ["Quetiapine 25mg", "Sertraline 50mg", "Lorazepam 0.5mg"],
      }));
      expect(result.components.some(c => c.label.includes("פסיכוטרופיים"))).toBe(true);
    });

    it("polypharmacy detected from med list", () => {
      const result = calculateFallsRisk(makePatient({
        age: 65,
        medications: [
          "Omeprazole 20mg", "Metoprolol 50mg", "Amlodipine 5mg",
          "Furosemide 40mg", "Atorvastatin 40mg", "Aspirin 100mg",
        ],
      }));
      expect(result.components.some(c => c.label.includes("פוליפרמקולוגיה"))).toBe(true);
    });
  });

  describe("medications → drug interactions", () => {
    it("interaction detected from med list alone", () => {
      const result = checkDrugInteractions(makePatient({
        medications: ["Warfarin 5mg", "Aspirin 100mg"],
      }));
      expect(result.length).toBeGreaterThan(0);
      expect(result.some(i => i.risk.includes("דימום"))).toBe(true);
    });

    it("interaction between med list and task", () => {
      const result = checkDrugInteractions(makePatient({
        medications: ["Sertraline 50mg"],
        tasks: [{
          id: "t1", text: "give tramadol 50mg PRN", urgency: "routine",
          source: "manual", done: false, doneTime: null, time: null, confidence: 1,
        }],
      }));
      expect(result.some(i => i.risk.includes("סרוטונין"))).toBe(true);
    });
  });

  describe("medications → allergy check", () => {
    it("allergy conflict from med list", () => {
      const result = checkAllergyConflicts(makePatient({
        allergies: ["penicillin"],
        medications: ["Amoxicillin 500mg TID"],
      }));
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("medications field basics", () => {
    it("empty medications does not break engines", () => {
      const p = makePatient({ medications: [] });
      expect(calculateACB(p).totalScore).toBe(0);
      expect(calculateFallsRisk(p).score).toBeLessThanOrEqual(2); // age-only
      expect(checkDrugInteractions(p)).toEqual([]);
    });

    it("undefined medications does not break engines", () => {
      const p = makePatient();
      delete (p as Record<string, unknown>).medications;
      expect(calculateACB(p).totalScore).toBe(0);
      expect(() => calculateFallsRisk(p)).not.toThrow();
    });
  });
});

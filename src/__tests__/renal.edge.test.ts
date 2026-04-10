/**
 * Extended edge-case tests for renal calculations.
 *
 * Covers: zero/negative creatinine, extreme ages, boundary CrCl values,
 * frailty floor edge cases, and dialysis overrides.
 */

import { describe, it, expect } from "vitest";
import { cockcroft, crclToBucket, patientCrClBucket } from "../utils/renal";

describe("cockcroft — edge cases", () => {
  it("returns 0 (not negative) when age >= 140", () => {
    // (140-140) * 70 / (72 * 1.0) = 0
    expect(cockcroft(140, 70, false, 1.0)).toBe(0);
  });

  it("returns 0 when age > 140 (would be negative without clamp)", () => {
    expect(cockcroft(150, 70, false, 1.0)).toBe(0);
  });

  it("handles very low weight", () => {
    const result = cockcroft(70, 30, false, 1.0);
    // (140-70)*30/(72*1.0) = 29.17
    expect(result).toBeCloseTo(29.17, 0);
  });

  it("handles very high creatinine", () => {
    const result = cockcroft(70, 70, false, 10.0);
    // (140-70)*70/(72*10.0) = 6.81
    expect(result).toBeCloseTo(6.81, 0);
  });

  it("frailty floor applies exactly at age 75", () => {
    const floored = cockcroft(75, 70, false, 0.5);
    const withOne = cockcroft(75, 70, false, 1.0);
    // Floor should apply — both should use Cr=1.0
    expect(floored).toBeCloseTo(withOne, 1);
  });

  it("frailty floor does NOT apply at age 74", () => {
    const with05 = cockcroft(74, 70, false, 0.5);
    const with10 = cockcroft(74, 70, false, 1.0);
    // Without floor, Cr 0.5 gives double the CrCl
    expect(with05).toBeCloseTo(with10 * 2, 0);
  });

  it("frailty floor does NOT apply when Cr is exactly 1.0", () => {
    // Cr = 1.0 is not < 1.0, so no floor
    const result = cockcroft(80, 60, false, 1.0);
    const expected = ((140 - 80) * 60) / (72 * 1.0);
    expect(result).toBeCloseTo(expected, 1);
  });

  it("female factor with frailty floor", () => {
    const male = cockcroft(80, 60, false, 0.5);   // floored to 1.0
    const female = cockcroft(80, 60, true, 0.5);   // floored to 1.0, *0.85
    expect(female).toBeCloseTo(male * 0.85, 1);
  });

  it("zero weight returns 0", () => {
    expect(cockcroft(70, 0, false, 1.0)).toBe(0);
  });

  it("very young patient (age 20)", () => {
    const result = cockcroft(20, 70, false, 1.0);
    // (140-20)*70/(72*1.0) = 116.67
    expect(result).toBeCloseTo(116.67, 0);
  });

  it("neonate age (0) gives maximum CrCl for weight", () => {
    const result = cockcroft(0, 3, false, 0.3);
    // (140-0)*3/(72*0.3) = 420/21.6 = 19.44
    expect(result).toBeCloseTo(19.44, 0);
  });
});

describe("crclToBucket — boundaries", () => {
  it("CrCl 0 → lt10", () => expect(crclToBucket(0)).toBe("lt10"));
  it("CrCl 9.99 → lt10", () => expect(crclToBucket(9.99)).toBe("lt10"));
  it("CrCl 10 → 10_50 (boundary inclusive)", () => expect(crclToBucket(10)).toBe("10_50"));
  it("CrCl 50 → 10_50 (boundary inclusive)", () => expect(crclToBucket(50)).toBe("10_50"));
  it("CrCl 50.01 → gt50", () => expect(crclToBucket(50.01)).toBe("gt50"));
  it("CrCl 200 → gt50", () => expect(crclToBucket(200)).toBe("gt50"));
  it("negative CrCl → lt10", () => expect(crclToBucket(-5)).toBe("lt10"));

  it("dialysis overrides even if CrCl is high", () => {
    expect(crclToBucket(100, true)).toBe("hd");
  });

  it("dialysis overrides even if CrCl is 0", () => {
    expect(crclToBucket(0, true)).toBe("hd");
  });
});

describe("patientCrClBucket — integration", () => {
  it("dialysis flag overrides calculated CrCl", () => {
    // Young healthy patient — would be gt50 without dialysis
    expect(patientCrClBucket(30, 80, false, 0.8, true)).toBe("hd");
  });

  it("elderly female with very high Cr → lt10", () => {
    // 90yo, 40kg, female, Cr 5.0 → CrCl ≈ (50*40*0.85)/(72*5) = 4.72
    expect(patientCrClBucket(90, 40, true, 5.0)).toBe("lt10");
  });

  it("elderly sarcopenic patient benefits from frailty floor", () => {
    // 85yo, 50kg, male, Cr 0.4 — without floor CrCl = (55*50)/(72*0.4)=95.5 → gt50 (dangerous)
    // with floor Cr=1.0 → CrCl = (55*50)/(72*1.0)=38.2 → 10_50 (safe conservative)
    expect(patientCrClBucket(85, 50, false, 0.4)).toBe("10_50");
  });
});

describe("cockcroft — invalid input guards", () => {
  it("returns 0 for zero weight", () => {
    expect(cockcroft(70, 0, false, 1.0)).toBe(0);
  });

  it("returns 0 for negative weight", () => {
    expect(cockcroft(70, -10, false, 1.0)).toBe(0);
  });

  it("returns 0 for zero creatinine", () => {
    expect(cockcroft(70, 70, false, 0)).toBe(0);
  });

  it("returns 0 for negative creatinine", () => {
    expect(cockcroft(70, 70, false, -0.5)).toBe(0);
  });

  it("CrCl boundary: exactly 50.01 → gt50", () => {
    // Verify the boundary at exactly the gt50 threshold
    expect(crclToBucket(50.001)).toBe("gt50");
  });

  it("CrCl boundary: exactly 9.999 → lt10", () => {
    expect(crclToBucket(9.999)).toBe("lt10");
  });
});

// ── clinicalMeta-aware CrCl in checkRenalDoseWarnings ──
import { checkRenalDoseWarnings, calculateCrCl } from "../engine/drugSafety";
import type { PatientEntry } from "../types";

function makePatient(overrides: Partial<PatientEntry>): PatientEntry {
  return {
    id: "test", section: "SIDE_A", date: "01/01/2026", room: "70",
    name: "Test", age: 85, diagnosis: "AKI", status: ["Enoxaparin 40mg"],
    flags: [], tasks: [], generatedTasks: [], tomorrowNotes: [],
    labs: [{ label: "Cr", value: 1.8, time: new Date().toISOString(), unit: "mg/dL" }],
    scannedAt: new Date().toISOString(), confidence: 1,
    ...overrides,
  } as PatientEntry;
}

describe("checkRenalDoseWarnings — clinicalMeta demographics", () => {
  it("uses exact CrCl when both sex and weight provided", () => {
    const pt = makePatient({
      clinicalMeta: { sexAtBirth: "female", weightKg: 50 },
    });
    const warnings = checkRenalDoseWarnings(pt);
    expect(warnings.length).toBeGreaterThan(0);
    // Exact CrCl: (140-85)*50*0.85 / (72*1.8) = 55*50*0.85/129.6 ≈ 18
    const w = warnings[0];
    expect(w.crcl).toBe(calculateCrCl(85, 1.8, 50, true));
    expect(w.weightAssumed).toBeUndefined();
    expect(w.crclRange).toBeUndefined();
  });

  it("falls back to dual-estimate when no clinicalMeta", () => {
    const pt = makePatient({ clinicalMeta: undefined });
    const warnings = checkRenalDoseWarnings(pt);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0].weightAssumed).toBe(true);
    expect(warnings[0].crclRange).toBeDefined();
  });

  it("uses weight with female assumption when sex unknown", () => {
    const pt = makePatient({ clinicalMeta: { weightKg: 60 } });
    const warnings = checkRenalDoseWarnings(pt);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0].crcl).toBe(calculateCrCl(85, 1.8, 60, true));
    expect(warnings[0].weightAssumed).toBe(true);
  });
});

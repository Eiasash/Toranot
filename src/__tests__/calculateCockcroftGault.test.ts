/**
 * Tests for the structured Cockcroft-Gault API (calculateCockcroftGault).
 *
 * The structured API differs from the legacy cockcroft() function:
 * - Requires explicit sex and weight — never guesses
 * - NO creatinine floor — uses measured Cr as-is
 * - Returns null with an explanatory reason when inputs are absent
 */

import { describe, it, expect } from "vitest";
import { calculateCockcroftGault, type CockcroftGaultInput } from "../utils/renal";

describe("calculateCockcroftGault — complete inputs", () => {
  it("computes CrCl for standard male patient", () => {
    const result = calculateCockcroftGault({
      ageYears: 70,
      sexAtBirth: "male",
      weightKg: 70,
      serumCrMgDl: 1.0,
    });
    expect(result.indeterminate).toBe(false);
    expect(result.crcl).not.toBeNull();
    // (140-70)*70*1.0 / (72*1.0) = 68 (rounded)
    expect(result.crcl).toBe(68);
    expect(result.bucket).toBe("gt50");
  });

  it("applies 0.85 factor for female", () => {
    const result = calculateCockcroftGault({
      ageYears: 70,
      sexAtBirth: "female",
      weightKg: 70,
      serumCrMgDl: 1.0,
    });
    expect(result.indeterminate).toBe(false);
    // (140-70)*70*0.85 / (72*1.0) = 57.85 → 58 (rounded)
    expect(result.crcl).toBe(58);
    expect(result.bucket).toBe("gt50");
  });

  it("does NOT apply frailty floor (unlike legacy cockcroft)", () => {
    // Structured API uses raw Cr — no floor even for elderly
    const result = calculateCockcroftGault({
      ageYears: 85,
      sexAtBirth: "male",
      weightKg: 60,
      serumCrMgDl: 0.5,
    });
    expect(result.indeterminate).toBe(false);
    // (140-85)*60 / (72*0.5) = 55*60/36 = 91.67 → 92
    expect(result.crcl).toBe(92);
    expect(result.bucket).toBe("gt50");
  });

  it("returns lt10 bucket for severe CKD", () => {
    const result = calculateCockcroftGault({
      ageYears: 90,
      sexAtBirth: "female",
      weightKg: 40,
      serumCrMgDl: 5.0,
    });
    expect(result.indeterminate).toBe(false);
    // (140-90)*40*0.85 / (72*5.0) = 50*40*0.85/360 = 4.72 → 5
    expect(result.crcl).toBeLessThanOrEqual(5);
    expect(result.bucket).toBe("lt10");
  });

  it("returns 10_50 bucket for moderate CKD", () => {
    const result = calculateCockcroftGault({
      ageYears: 80,
      sexAtBirth: "male",
      weightKg: 70,
      serumCrMgDl: 2.5,
    });
    expect(result.indeterminate).toBe(false);
    // (140-80)*70 / (72*2.5) = 60*70/180 = 23.33 → 23
    expect(result.crcl).toBe(23);
    expect(result.bucket).toBe("10_50");
  });

  it("clamps negative CrCl to 0", () => {
    const result = calculateCockcroftGault({
      ageYears: 150,
      sexAtBirth: "male",
      weightKg: 50,
      serumCrMgDl: 1.0,
    });
    expect(result.indeterminate).toBe(false);
    expect(result.crcl).toBe(0);
    expect(result.bucket).toBe("lt10");
  });
});

describe("calculateCockcroftGault — dialysis override", () => {
  it("returns hd bucket and null crcl when onDialysis=true", () => {
    const result = calculateCockcroftGault({
      ageYears: 70,
      sexAtBirth: "male",
      weightKg: 70,
      serumCrMgDl: 1.0,
      onDialysis: true,
    });
    expect(result.crcl).toBeNull();
    expect(result.bucket).toBe("hd");
    expect(result.indeterminate).toBe(false);
  });

  it("returns hd even with missing other fields", () => {
    const result = calculateCockcroftGault({ onDialysis: true });
    expect(result.bucket).toBe("hd");
    expect(result.indeterminate).toBe(false);
  });
});

describe("calculateCockcroftGault — indeterminate (missing inputs)", () => {
  it("reports missing age", () => {
    const result = calculateCockcroftGault({
      sexAtBirth: "male",
      weightKg: 70,
      serumCrMgDl: 1.0,
    });
    expect(result.indeterminate).toBe(true);
    expect(result.crcl).toBeNull();
    expect(result.bucket).toBeNull();
    expect(result.indeterminateReason).toContain("גיל");
  });

  it("reports missing weight", () => {
    const result = calculateCockcroftGault({
      ageYears: 70,
      sexAtBirth: "male",
      serumCrMgDl: 1.0,
    });
    expect(result.indeterminate).toBe(true);
    expect(result.indeterminateReason).toContain("משקל");
  });

  it("reports missing sex", () => {
    const result = calculateCockcroftGault({
      ageYears: 70,
      weightKg: 70,
      serumCrMgDl: 1.0,
    });
    expect(result.indeterminate).toBe(true);
    expect(result.indeterminateReason).toContain("מין");
  });

  it("reports missing creatinine", () => {
    const result = calculateCockcroftGault({
      ageYears: 70,
      sexAtBirth: "male",
      weightKg: 70,
    });
    expect(result.indeterminate).toBe(true);
    expect(result.indeterminateReason).toContain("קראטינין");
  });

  it("reports zero weight as missing", () => {
    const result = calculateCockcroftGault({
      ageYears: 70,
      sexAtBirth: "male",
      weightKg: 0,
      serumCrMgDl: 1.0,
    });
    expect(result.indeterminate).toBe(true);
    expect(result.indeterminateReason).toContain("משקל");
  });

  it("reports negative weight as missing", () => {
    const result = calculateCockcroftGault({
      ageYears: 70,
      sexAtBirth: "male",
      weightKg: -10,
      serumCrMgDl: 1.0,
    });
    expect(result.indeterminate).toBe(true);
    expect(result.indeterminateReason).toContain("משקל");
  });

  it("reports zero creatinine as missing", () => {
    const result = calculateCockcroftGault({
      ageYears: 70,
      sexAtBirth: "male",
      weightKg: 70,
      serumCrMgDl: 0,
    });
    expect(result.indeterminate).toBe(true);
    expect(result.indeterminateReason).toContain("קראטינין");
  });

  it("reports negative creatinine as missing", () => {
    const result = calculateCockcroftGault({
      ageYears: 70,
      sexAtBirth: "male",
      weightKg: 70,
      serumCrMgDl: -0.5,
    });
    expect(result.indeterminate).toBe(true);
    expect(result.indeterminateReason).toContain("קראטינין");
  });

  it("reports multiple missing fields at once", () => {
    const result = calculateCockcroftGault({});
    expect(result.indeterminate).toBe(true);
    expect(result.indeterminateReason).toContain("גיל");
    expect(result.indeterminateReason).toContain("משקל");
    expect(result.indeterminateReason).toContain("מין");
    expect(result.indeterminateReason).toContain("קראטינין");
  });

  it("empty input is fully indeterminate", () => {
    const result = calculateCockcroftGault({});
    expect(result).toEqual({
      crcl: null,
      bucket: null,
      indeterminate: true,
      indeterminateReason: expect.stringContaining("חסרים נתונים"),
    });
  });
});

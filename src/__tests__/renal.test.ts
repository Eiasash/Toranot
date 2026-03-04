import { describe, it, expect } from "vitest";
import { cockcroft, crclToBucket, patientCrClBucket, type CrClBucket } from "../utils/renal";

describe("cockcroft", () => {
  it("standard formula for 70yo 70kg male, Cr 1.0", () => {
    const result = cockcroft(70, 70, false, 1.0);
    // ((140-70) * 70 / (72 * 1.0)) = 67.6
    expect(result).toBeCloseTo(67.6, 0);
  });

  it("female factor applies 0.85 correction", () => {
    const male = cockcroft(70, 70, false, 1.0);
    const female = cockcroft(70, 70, true, 1.0);
    expect(female).toBeCloseTo(male * 0.85, 1);
  });

  it("frailty floor: age ≥75 with Cr 0.5 → floored to 1.0", () => {
    const floored = cockcroft(80, 60, false, 0.5);
    const unFloored = cockcroft(80, 60, false, 1.0); // same as floor
    expect(floored).toBeCloseTo(unFloored, 1);
  });

  it("frailty floor NOT applied for age <75", () => {
    const with05 = cockcroft(70, 70, false, 0.5);
    const with10 = cockcroft(70, 70, false, 1.0);
    // Without floor, Cr 0.5 gives double the CrCl
    expect(with05).toBeGreaterThan(with10 * 1.5);
  });

  it("frailty floor NOT applied for Cr ≥ 1.0 even if age ≥75", () => {
    const normal = cockcroft(80, 60, false, 1.2);
    const expected = ((140 - 80) * 60) / (72 * 1.2);
    expect(normal).toBeCloseTo(expected, 1);
  });
});

describe("crclToBucket", () => {
  it(">50 → gt50", () => expect(crclToBucket(80)).toBe("gt50"));
  it("10-50 → 10_50", () => expect(crclToBucket(30)).toBe("10_50"));
  it("<10 → lt10", () => expect(crclToBucket(5)).toBe("lt10"));
  it("exactly 50 → 10_50", () => expect(crclToBucket(50)).toBe("10_50"));
  it("exactly 10 → 10_50 (boundary inclusive)", () => expect(crclToBucket(10)).toBe("10_50"));
});

describe("patientCrClBucket", () => {
  it("returns gt50 for healthy 60yo male", () => {
    expect(patientCrClBucket(60, 75, false, 0.9)).toBe("gt50");
  });

  it("returns 10_50 for elderly with moderate CKD", () => {
    expect(patientCrClBucket(85, 55, true, 1.8)).toBe("10_50");
  });

  it("returns hd when onDialysis=true", () => {
    expect(patientCrClBucket(75, 60, false, 2.0, true)).toBe("hd");
  });

  it("returns lt10 for advanced CKD", () => {
    // 90yo, 45kg, Cr 4.0 → CrCl ~(50*45)/(72*4) ≈ 7.8
    expect(patientCrClBucket(90, 45, false, 4.0)).toBe("lt10");
  });

  it("frailty floor raises bucket for sarcopenic 80yo with Cr 0.5", () => {
    // With floor: Cr treated as 1.0 → CrCl ≈ (60*60)/(72*1.0) = 50 → 10_50
    // Without floor: Cr 0.5 → CrCl ≈ 100 → gt50 (wrong, would overdose)
    const withFloor = patientCrClBucket(80, 60, false, 0.5);
    expect(withFloor).toBe("10_50"); // floor applied: conservative dosing
  });
});

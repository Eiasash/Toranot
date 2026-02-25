import { describe, it, expect } from "vitest";
import { DRUG_DOSING, type DrugDosingEntry } from "../data/dosing";

describe("DRUG_DOSING data integrity", () => {
  const entries = Object.entries(DRUG_DOSING);

  it("contains at least 10 drug entries", () => {
    expect(entries.length).toBeGreaterThanOrEqual(10);
  });

  it.each(entries)("%s has all required dosing fields", (_key, entry: DrugDosingEntry) => {
    expect(typeof entry.label).toBe("string");
    expect(entry.label.length).toBeGreaterThan(0);

    expect(typeof entry.normal).toBe("string");
    expect(entry.normal.length).toBeGreaterThan(0);

    expect(typeof entry.crcl_10_50).toBe("string");
    expect(entry.crcl_10_50.length).toBeGreaterThan(0);

    expect(typeof entry.crcl_lt10).toBe("string");
    expect(entry.crcl_lt10.length).toBeGreaterThan(0);

    expect(typeof entry.hd).toBe("string");
    expect(entry.hd.length).toBeGreaterThan(0);
  });

  it("all keys are lowercase snake_case", () => {
    for (const key of Object.keys(DRUG_DOSING)) {
      expect(key).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it("no duplicate labels", () => {
    const labels = entries.map(([, e]) => e.label);
    const unique = new Set(labels);
    expect(unique.size).toBe(labels.length);
  });

  it("notes field is either undefined or a non-empty string", () => {
    for (const [, entry] of entries) {
      if (entry.notes !== undefined) {
        expect(typeof entry.notes).toBe("string");
        expect(entry.notes.length).toBeGreaterThan(0);
      }
    }
  });

  // Spot-check critical drugs
  it("contains vancomycin with AUC dosing note", () => {
    expect(DRUG_DOSING.vancomycin).toBeDefined();
    expect(DRUG_DOSING.vancomycin.notes).toContain("AUC");
  });

  it("contains pip_tazo", () => {
    expect(DRUG_DOSING.pip_tazo).toBeDefined();
    expect(DRUG_DOSING.pip_tazo.label).toBe("Piperacillin/Tazobactam");
  });

  it("ceftriaxone requires no renal adjustment", () => {
    expect(DRUG_DOSING.ceftriaxone.crcl_10_50).toContain("no adjustment");
  });

  it("nitrofurantoin is contraindicated in severe renal impairment", () => {
    expect(DRUG_DOSING.nitrofurantoin.crcl_lt10).toMatch(/CONTRAINDICATED/i);
  });
});

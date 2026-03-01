import { describe, it, expect } from "vitest";
import { crclToBucket } from "../utils/renal";
import { extractAntibioticsFromPlan } from "../engine/drugSafety";
import { DRUG_DOSING } from "../data/dosing";

describe("crclToBucket", () => {
  it("classifies >50 as gt50", () => {
    expect(crclToBucket(75)).toBe("gt50");
    expect(crclToBucket(51)).toBe("gt50");
  });

  it("classifies 10-50 as 10_50", () => {
    expect(crclToBucket(50)).toBe("10_50");
    expect(crclToBucket(30)).toBe("10_50");
    expect(crclToBucket(10)).toBe("10_50");
  });

  it("classifies <10 as lt10", () => {
    expect(crclToBucket(9)).toBe("lt10");
    expect(crclToBucket(0)).toBe("lt10");
  });

  it("classifies HD override", () => {
    expect(crclToBucket(75, true)).toBe("hd");
    expect(crclToBucket(5, true)).toBe("hd");
  });
});

describe("extractAntibioticsFromPlan", () => {
  it("extracts single antibiotic", () => {
    expect(extractAntibioticsFromPlan("Ceftriaxone 2g IV q24h")).toEqual(["ceftriaxone"]);
  });

  it("extracts multiple antibiotics from combo plan", () => {
    const result = extractAntibioticsFromPlan(
      "Ceftriaxone 2g IV q24h + Azithromycin 500mg IV/PO q24h"
    );
    expect(result).toContain("ceftriaxone");
    expect(result).toContain("azithromycin");
    expect(result).toHaveLength(2);
  });

  it("extracts pip/tazo from various spellings", () => {
    expect(extractAntibioticsFromPlan("Piperacillin/Tazobactam 4.5g IV")).toContain("piperacillin/tazobactam");
    expect(extractAntibioticsFromPlan("Pip/Tazo 4.5g IV q6h")).toContain("piperacillin/tazobactam");
    expect(extractAntibioticsFromPlan("Tazocin 4.5g")).toContain("piperacillin/tazobactam");
  });

  it("extracts from a complex empiric string", () => {
    const result = extractAntibioticsFromPlan(
      "Pip/Tazo 4.5g IV q6h + Vancomycin 15-20mg/kg IV q8-12h + Metronidazole 500mg PO q8h"
    );
    expect(result).toContain("piperacillin/tazobactam");
    expect(result).toContain("vancomycin");
    expect(result).toContain("metronidazole");
    expect(result).toHaveLength(3);
  });

  it("deduplicates same antibiotic mentioned twice", () => {
    const result = extractAntibioticsFromPlan(
      "Meropenem 1g IV q8h or Meropenem 2g IV q8h"
    );
    expect(result).toEqual(["meropenem"]);
  });

  it("handles brand names", () => {
    expect(extractAntibioticsFromPlan("Augmentin 875mg PO")).toContain("amoxicillin/clavulanate");
    expect(extractAntibioticsFromPlan("Flagyl 500mg IV")).toContain("metronidazole");
    expect(extractAntibioticsFromPlan("Tavanic 750mg")).toContain("levofloxacin");
  });

  it("returns empty for non-antibiotic text", () => {
    expect(extractAntibioticsFromPlan("Paracetamol 1g PO q6h")).toEqual([]);
  });
});

describe("DRUG_DOSING database", () => {
  it("has entries for all commonly used antibiotics", () => {
    const required = [
      "pip_tazo", "ceftriaxone", "meropenem", "vancomycin",
      "ciprofloxacin", "levofloxacin", "gentamicin", "metronidazole",
    ];
    for (const key of required) {
      expect(DRUG_DOSING[key], `Missing ${key}`).toBeDefined();
      expect(DRUG_DOSING[key].normal).toBeTruthy();
      expect(DRUG_DOSING[key].crcl_10_50).toBeTruthy();
      expect(DRUG_DOSING[key].crcl_lt10).toBeTruthy();
      expect(DRUG_DOSING[key].hd).toBeTruthy();
    }
  });

  it("ceftriaxone needs no renal adjustment", () => {
    const entry = DRUG_DOSING.ceftriaxone;
    expect(entry.crcl_10_50).toContain("no adjustment");
    expect(entry.crcl_lt10).toContain("no adjustment");
  });

  it("cefepime has neurotoxicity warning", () => {
    expect(DRUG_DOSING.cefepime.notes).toContain("Neurotoxicity");
  });

  it("nitrofurantoin is contraindicated in severe CKD", () => {
    expect(DRUG_DOSING.nitrofurantoin.crcl_10_50).toContain("AVOID");
    expect(DRUG_DOSING.nitrofurantoin.crcl_lt10).toContain("CONTRAINDICATED");
  });
});

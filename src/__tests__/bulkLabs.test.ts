import { describe, it, expect } from "vitest";
import { parseBulkLabs, LAB_ALIASES } from "../components/LabTracker";

describe("parseBulkLabs", () => {
  it("parses comma-separated labs", () => {
    const result = parseBulkLabs("Cr 1.8, K 5.2, WBC 14, Hb 9.1");
    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({ label: "Cr", value: 1.8 });
    expect(result[1]).toEqual({ label: "K+", value: 5.2 });
    expect(result[2]).toEqual({ label: "WBC", value: 14 });
    expect(result[3]).toEqual({ label: "Hb", value: 9.1 });
  });

  it("parses equals-separated format", () => {
    const result = parseBulkLabs("Na=138, K+=4.5, Cr=1.2");
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ label: "Na", value: 138 });
    expect(result[1]).toEqual({ label: "K+", value: 4.5 });
    expect(result[2]).toEqual({ label: "Cr", value: 1.2 });
  });

  it("parses pipe-separated format", () => {
    const result = parseBulkLabs("Hb 7.2 | PLT 45 | WBC 22");
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ label: "Hb", value: 7.2 });
    expect(result[1]).toEqual({ label: "PLT", value: 45 });
    expect(result[2]).toEqual({ label: "WBC", value: 22 });
  });

  it("parses colon-separated format", () => {
    const result = parseBulkLabs("CRP: 150, Lactate: 4.2");
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ label: "CRP", value: 150 });
    expect(result[1]).toEqual({ label: "Lactate", value: 4.2 });
  });

  it("normalizes aliases", () => {
    const result = parseBulkLabs("creatinine 2.1, potassium 6.0, hgb 8.5, sodium 128");
    expect(result).toHaveLength(4);
    expect(result[0].label).toBe("Cr");
    expect(result[1].label).toBe("K+");
    expect(result[2].label).toBe("Hb");
    expect(result[3].label).toBe("Na");
  });

  it("handles single lab", () => {
    const result = parseBulkLabs("Cr 3.5");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ label: "Cr", value: 3.5 });
  });

  it("returns empty for garbage input", () => {
    expect(parseBulkLabs("")).toHaveLength(0);
    expect(parseBulkLabs("hello world")).toHaveLength(0);
    expect(parseBulkLabs("no numbers here")).toHaveLength(0);
  });

  it("handles newline-separated input", () => {
    const result = parseBulkLabs("Cr 1.5\nK+ 4.8\nNa 140");
    expect(result).toHaveLength(3);
  });

  it("handles liver function tests", () => {
    const result = parseBulkLabs("AST 85, ALT 120, ALP 250, GGT 180, Bili 3.2");
    expect(result).toHaveLength(5);
    expect(result[0].label).toBe("AST");
    expect(result[1].label).toBe("ALT");
    expect(result[2].label).toBe("ALP");
    expect(result[3].label).toBe("GGT");
    expect(result[4].label).toBe("Bili");
  });

  it("handles Hebrew sugar alias", () => {
    const result = parseBulkLabs("סוכר 280");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ label: "Glucose", value: 280 });
  });

  it("handles cardiac markers", () => {
    const result = parseBulkLabs("Troponin 0.15, BNP 1500");
    expect(result).toHaveLength(2);
    expect(result[0].label).toBe("Troponin");
    expect(result[1].label).toBe("BNP");
  });

  it("handles mixed formats", () => {
    const result = parseBulkLabs("Cr: 1.8, K=5.2 | Na 138");
    expect(result).toHaveLength(3);
  });
});

describe("LAB_ALIASES coverage", () => {
  it("has common lab aliases", () => {
    const essentialAliases = ["cr", "k", "na", "wbc", "hb", "plt", "crp", "inr", "glucose"];
    for (const alias of essentialAliases) {
      expect(LAB_ALIASES[alias]).toBeDefined();
    }
  });
});

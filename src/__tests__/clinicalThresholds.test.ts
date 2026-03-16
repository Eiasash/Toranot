import { describe, it, expect } from "vitest";
import {
  CANONICAL_LAB_THRESHOLDS,
  matchLabThreshold,
  isCriticalLabValue,
  isWarningLabValue,
} from "../clinical/clinicalThresholds";

describe("CANONICAL_LAB_THRESHOLDS", () => {
  it("has entries for K, Na, Hb, Lactate, Cr", () => {
    const keys = CANONICAL_LAB_THRESHOLDS.map((t) => t.key);
    expect(keys).toContain("K");
    expect(keys).toContain("Na");
    expect(keys).toContain("Hb");
    expect(keys).toContain("Lactate");
    expect(keys).toContain("Cr");
  });

  it("all entries have key, labels array", () => {
    for (const t of CANONICAL_LAB_THRESHOLDS) {
      expect(t.key).toBeTruthy();
      expect(Array.isArray(t.labels)).toBe(true);
      expect(t.labels.length).toBeGreaterThan(0);
    }
  });

  it("warning thresholds low < high when both exist", () => {
    for (const t of CANONICAL_LAB_THRESHOLDS) {
      if (t.warning?.low != null && t.warning?.high != null) {
        expect(t.warning.low).toBeLessThan(t.warning.high);
      }
    }
  });

  it("critical thresholds low < high when both exist", () => {
    for (const t of CANONICAL_LAB_THRESHOLDS) {
      if (t.critical?.low != null && t.critical?.high != null) {
        expect(t.critical.low).toBeLessThan(t.critical.high);
      }
    }
  });

  it("critical thresholds are more extreme than warning thresholds", () => {
    for (const t of CANONICAL_LAB_THRESHOLDS) {
      if (t.warning && t.critical) {
        if (t.warning.low != null && t.critical.low != null) {
          expect(t.critical.low).toBeLessThanOrEqual(t.warning.low);
        }
        if (t.warning.high != null && t.critical.high != null) {
          expect(t.critical.high).toBeGreaterThanOrEqual(t.warning.high);
        }
      }
    }
  });

  it("Cr has mode delta_only and no critical band", () => {
    const cr = CANONICAL_LAB_THRESHOLDS.find((t) => t.key === "Cr");
    expect(cr).toBeDefined();
    expect(cr!.mode).toBe("delta_only");
    expect(cr!.critical).toBeUndefined();
  });
});

describe("matchLabThreshold", () => {
  it("matches K by K+", () => {
    expect(matchLabThreshold("K+")?.key).toBe("K");
  });

  it("matches K by K", () => {
    expect(matchLabThreshold("K")?.key).toBe("K");
  });

  it("matches K case-insensitively (potassium)", () => {
    expect(matchLabThreshold("Potassium")?.key).toBe("K");
  });

  it("matches Na by Na+", () => {
    expect(matchLabThreshold("Na+")?.key).toBe("Na");
  });

  it("matches Na by sodium", () => {
    expect(matchLabThreshold("sodium")?.key).toBe("Na");
  });

  it("matches Hb by hemoglobin", () => {
    expect(matchLabThreshold("hemoglobin")?.key).toBe("Hb");
  });

  it("matches Hb by haemoglobin (British spelling)", () => {
    expect(matchLabThreshold("haemoglobin")?.key).toBe("Hb");
  });

  it("matches Lactate by lactic acid", () => {
    expect(matchLabThreshold("lactic acid")?.key).toBe("Lactate");
  });

  it("matches Cr by creatinine", () => {
    expect(matchLabThreshold("creatinine")?.key).toBe("Cr");
  });

  it("returns null for unknown lab label", () => {
    expect(matchLabThreshold("Urea")).toBeNull();
  });

  it("trims whitespace", () => {
    expect(matchLabThreshold("  K+ ")?.key).toBe("K");
  });
});

describe("isCriticalLabValue", () => {
  // Potassium critical: low ≤2.5, high ≥6.0
  it("K+ ≥6.0 is critical", () => {
    expect(isCriticalLabValue("K+", 6.0)).toBe(true);
  });

  it("K+ ≤2.5 is critical", () => {
    expect(isCriticalLabValue("K+", 2.5)).toBe(true);
  });

  it("K+ 4.0 is NOT critical", () => {
    expect(isCriticalLabValue("K+", 4.0)).toBe(false);
  });

  it("K+ just below critical high (5.9) is NOT critical", () => {
    expect(isCriticalLabValue("K+", 5.9)).toBe(false);
  });

  it("K+ just above critical low (2.6) is NOT critical", () => {
    expect(isCriticalLabValue("K+", 2.6)).toBe(false);
  });

  // Sodium critical: low ≤120, high ≥160
  it("Na 160 is critical", () => {
    expect(isCriticalLabValue("Na", 160)).toBe(true);
  });

  it("Na 120 is critical", () => {
    expect(isCriticalLabValue("Na", 120)).toBe(true);
  });

  it("Na 135 is NOT critical", () => {
    expect(isCriticalLabValue("Na", 135)).toBe(false);
  });

  // Hemoglobin critical: low ≤7.0
  it("Hb ≤7.0 is critical", () => {
    expect(isCriticalLabValue("Hb", 7.0)).toBe(true);
  });

  it("Hb 7.1 is NOT critical", () => {
    expect(isCriticalLabValue("Hb", 7.1)).toBe(false);
  });

  // Lactate critical: high ≥4.0
  it("Lactate ≥4.0 is critical", () => {
    expect(isCriticalLabValue("lactate", 4.0)).toBe(true);
  });

  it("Lactate 3.9 is NOT critical", () => {
    expect(isCriticalLabValue("lactate", 3.9)).toBe(false);
  });

  // Creatinine: delta_only — never critical on raw value
  it("Cr 10.0 is NOT critical (delta_only mode)", () => {
    expect(isCriticalLabValue("Cr", 10.0)).toBe(false);
  });

  // Unknown lab
  it("unknown lab returns false", () => {
    expect(isCriticalLabValue("Urea", 100)).toBe(false);
  });
});

describe("isWarningLabValue", () => {
  // Potassium warning: low ≤3.0, high ≥5.5
  it("K+ ≥5.5 is warning", () => {
    expect(isWarningLabValue("K+", 5.5)).toBe(true);
  });

  it("K+ ≤3.0 is warning", () => {
    expect(isWarningLabValue("K+", 3.0)).toBe(true);
  });

  it("K+ 4.0 is NOT warning", () => {
    expect(isWarningLabValue("K+", 4.0)).toBe(false);
  });

  // Sodium warning: low ≤125, high ≥150
  it("Na ≥150 is warning", () => {
    expect(isWarningLabValue("Na", 150)).toBe(true);
  });

  it("Na ≤125 is warning", () => {
    expect(isWarningLabValue("Na", 125)).toBe(true);
  });

  // Hb warning: low ≤8.0
  it("Hb ≤8.0 is warning", () => {
    expect(isWarningLabValue("Hb", 8.0)).toBe(true);
  });

  it("Hb 8.1 is NOT warning", () => {
    expect(isWarningLabValue("Hb", 8.1)).toBe(false);
  });

  // Lactate warning: high ≥2.0
  it("Lactate ≥2.0 is warning", () => {
    expect(isWarningLabValue("lactate", 2.0)).toBe(true);
  });

  // Cr delta_only — never warning
  it("Cr is never warning (delta_only)", () => {
    expect(isWarningLabValue("Cr", 5.0)).toBe(false);
  });
});

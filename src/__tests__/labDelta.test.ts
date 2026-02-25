import { describe, it, expect } from "vitest";
import { calculateLabDeltas } from "../engine/labDelta";
import type { PatientEntry, LabEntry } from "../types";

function makePatient(labs: LabEntry[]): PatientEntry {
  return {
    id: "test-pt",
    section: "SIDE_A",
    date: "01/01/2025",
    room: "101",
    name: "Test Patient",
    age: 75,
    diagnosis: null,
    flags: [],
    status: [],
    tomorrowNotes: [],
    tasks: [],
    generatedTasks: [],
    notes: [],
    scannedAt: new Date().toISOString(),
    confidence: 1,
    labs,
  };
}

function makeLab(label: string, value: number, time: string, id?: string): LabEntry {
  return { id: id ?? `lab-${label}-${value}`, label, value, time };
}

// ════════════════════════════════════════════════════════════
// BASIC BEHAVIOR
// ════════════════════════════════════════════════════════════

describe("calculateLabDeltas — basic", () => {
  it("returns empty for patient with no labs", () => {
    expect(calculateLabDeltas(makePatient([]))).toEqual([]);
  });

  it("returns empty for patient with undefined labs", () => {
    const p = makePatient([]);
    p.labs = undefined;
    expect(calculateLabDeltas(p)).toEqual([]);
  });

  it("returns empty for single lab entry (need ≥2 for delta)", () => {
    const labs = [makeLab("Cr", 1.0, "2025-01-01T08:00:00Z")];
    expect(calculateLabDeltas(makePatient(labs))).toEqual([]);
  });

  it("returns empty for two entries of different labels", () => {
    const labs = [
      makeLab("Cr", 1.0, "2025-01-01T08:00:00Z"),
      makeLab("K+", 4.0, "2025-01-01T10:00:00Z"),
    ];
    expect(calculateLabDeltas(makePatient(labs))).toEqual([]);
  });

  it("returns empty when change is below threshold (ok)", () => {
    const labs = [
      makeLab("K+", 4.0, "2025-01-01T08:00:00Z"),
      makeLab("K+", 4.2, "2025-01-01T16:00:00Z"),
    ];
    expect(calculateLabDeltas(makePatient(labs))).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════
// CREATININE — KDIGO AKI STAGING
// ════════════════════════════════════════════════════════════

describe("calculateLabDeltas — Creatinine / KDIGO AKI", () => {
  it("detects AKI Stage 1 (>=1.5x baseline)", () => {
    const labs = [
      makeLab("Cr", 1.0, "2025-01-01T08:00:00Z"),
      makeLab("Cr", 1.5, "2025-01-02T08:00:00Z"),
    ];
    const deltas = calculateLabDeltas(makePatient(labs));
    expect(deltas).toHaveLength(1);
    expect(deltas[0].akiStage).toBe(1);
    expect(deltas[0].severity).toBe("warning");
    expect(deltas[0].message).toContain("AKI Stage 1");
  });

  it("detects AKI Stage 1 (0.3 rise within 48h)", () => {
    const labs = [
      makeLab("Cr", 0.8, "2025-01-01T08:00:00Z"),
      makeLab("Cr", 1.1, "2025-01-01T20:00:00Z"), // 0.3 rise within 12h
    ];
    const deltas = calculateLabDeltas(makePatient(labs));
    expect(deltas).toHaveLength(1);
    expect(deltas[0].akiStage).toBe(1);
  });

  it("does NOT flag 0.3 rise if >48h elapsed", () => {
    const labs = [
      makeLab("Cr", 0.8, "2025-01-01T08:00:00Z"),
      makeLab("Cr", 1.1, "2025-01-04T08:00:00Z"), // 0.3 rise but 72h elapsed
    ];
    const deltas = calculateLabDeltas(makePatient(labs));
    // ratio = 1.1/0.8 = 1.375 < 1.5 and >48h, so no AKI
    expect(deltas).toHaveLength(0);
  });

  it("detects AKI Stage 2 (>=2.0x baseline)", () => {
    const labs = [
      makeLab("Cr", 1.0, "2025-01-01T08:00:00Z"),
      makeLab("Cr", 2.0, "2025-01-02T08:00:00Z"),
    ];
    const deltas = calculateLabDeltas(makePatient(labs));
    expect(deltas).toHaveLength(1);
    expect(deltas[0].akiStage).toBe(2);
    expect(deltas[0].severity).toBe("critical");
    expect(deltas[0].message).toContain("AKI Stage 2");
  });

  it("detects AKI Stage 3 (>=3.0x baseline)", () => {
    const labs = [
      makeLab("Cr", 1.0, "2025-01-01T08:00:00Z"),
      makeLab("Cr", 3.0, "2025-01-02T08:00:00Z"),
    ];
    const deltas = calculateLabDeltas(makePatient(labs));
    expect(deltas).toHaveLength(1);
    expect(deltas[0].akiStage).toBe(3);
    expect(deltas[0].severity).toBe("critical");
    expect(deltas[0].message).toContain("AKI Stage 3");
  });

  it("detects AKI Stage 3 when Cr >= 4.0 absolute", () => {
    const labs = [
      makeLab("Cr", 2.0, "2025-01-01T08:00:00Z"),
      makeLab("Cr", 4.0, "2025-01-02T08:00:00Z"), // 2x but >=4.0 → Stage 3
    ];
    const deltas = calculateLabDeltas(makePatient(labs));
    expect(deltas[0].akiStage).toBe(3);
  });

  it("uses peak Cr for staging (not latest)", () => {
    const labs = [
      makeLab("Cr", 1.0, "2025-01-01T08:00:00Z", "cr1"),
      makeLab("Cr", 3.5, "2025-01-02T08:00:00Z", "cr2"), // peak
      makeLab("Cr", 2.0, "2025-01-03T08:00:00Z", "cr3"), // recovering
    ];
    const deltas = calculateLabDeltas(makePatient(labs));
    expect(deltas).toHaveLength(1);
    expect(deltas[0].akiStage).toBe(3); // Staged on peak (3.5x)
    expect(deltas[0].peak).toBe(3.5);
    expect(deltas[0].latest).toBe(2.0);
    expect(deltas[0].peakWasPast).toBe(true);
  });

  it("adds recovery note when Cr is improving from peak", () => {
    const labs = [
      makeLab("Cr", 1.0, "2025-01-01T08:00:00Z", "cr1"),
      makeLab("Cr", 2.5, "2025-01-02T08:00:00Z", "cr2"),
      makeLab("Cr", 1.5, "2025-01-03T08:00:00Z", "cr3"),
    ];
    const deltas = calculateLabDeltas(makePatient(labs));
    expect(deltas[0].message).toContain("שיפור");
  });

  it("no Cr delta when values are stable", () => {
    const labs = [
      makeLab("Cr", 1.0, "2025-01-01T08:00:00Z"),
      makeLab("Cr", 1.1, "2025-01-02T08:00:00Z"),
    ];
    const deltas = calculateLabDeltas(makePatient(labs));
    // ratio 1.1 < 1.5, no AKI
    expect(deltas).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════
// POTASSIUM (K+)
// ════════════════════════════════════════════════════════════

describe("calculateLabDeltas — Potassium", () => {
  it("flags warning for K+ rise >= 0.5", () => {
    const labs = [
      makeLab("K+", 4.0, "2025-01-01T08:00:00Z"),
      makeLab("K+", 4.6, "2025-01-01T16:00:00Z"),
    ];
    const deltas = calculateLabDeltas(makePatient(labs));
    expect(deltas).toHaveLength(1);
    expect(deltas[0].severity).toBe("warning");
    expect(deltas[0].direction).toBe("up");
  });

  it("flags critical for K+ rise >= 1.0", () => {
    const labs = [
      makeLab("K+", 4.0, "2025-01-01T08:00:00Z"),
      makeLab("K+", 5.5, "2025-01-01T16:00:00Z"),
    ];
    const deltas = calculateLabDeltas(makePatient(labs));
    expect(deltas).toHaveLength(1);
    expect(deltas[0].severity).toBe("critical");
  });

  it("flags warning for K+ drop >= 0.5", () => {
    const labs = [
      makeLab("K+", 4.5, "2025-01-01T08:00:00Z"),
      makeLab("K+", 3.9, "2025-01-01T16:00:00Z"),
    ];
    const deltas = calculateLabDeltas(makePatient(labs));
    expect(deltas).toHaveLength(1);
    expect(deltas[0].severity).toBe("warning");
    expect(deltas[0].direction).toBe("down");
  });

  it("flags critical for K+ drop >= 1.0", () => {
    const labs = [
      makeLab("K+", 5.0, "2025-01-01T08:00:00Z"),
      makeLab("K+", 3.8, "2025-01-01T16:00:00Z"),
    ];
    const deltas = calculateLabDeltas(makePatient(labs));
    expect(deltas[0].severity).toBe("critical");
  });
});

// ════════════════════════════════════════════════════════════
// SODIUM (Na)
// ════════════════════════════════════════════════════════════

describe("calculateLabDeltas — Sodium", () => {
  it("flags warning for Na rise >= 5", () => {
    const labs = [
      makeLab("Na", 135, "2025-01-01T08:00:00Z"),
      makeLab("Na", 141, "2025-01-01T16:00:00Z"),
    ];
    const deltas = calculateLabDeltas(makePatient(labs));
    expect(deltas).toHaveLength(1);
    expect(deltas[0].severity).toBe("warning");
  });

  it("flags critical for Na drop >= 8", () => {
    const labs = [
      makeLab("Na", 140, "2025-01-01T08:00:00Z"),
      makeLab("Na", 130, "2025-01-01T16:00:00Z"),
    ];
    const deltas = calculateLabDeltas(makePatient(labs));
    expect(deltas[0].severity).toBe("critical");
  });
});

// ════════════════════════════════════════════════════════════
// HEMOGLOBIN (Hb) — percentage-based thresholds
// ════════════════════════════════════════════════════════════

describe("calculateLabDeltas — Hemoglobin", () => {
  it("flags warning for Hb drop >= 15%", () => {
    const labs = [
      makeLab("Hb", 12.0, "2025-01-01T08:00:00Z"),
      makeLab("Hb", 10.0, "2025-01-01T16:00:00Z"), // -16.7%
    ];
    const deltas = calculateLabDeltas(makePatient(labs));
    expect(deltas).toHaveLength(1);
    expect(deltas[0].severity).toBe("warning");
    expect(deltas[0].direction).toBe("down");
  });

  it("flags critical for Hb drop >= 25%", () => {
    const labs = [
      makeLab("Hb", 12.0, "2025-01-01T08:00:00Z"),
      makeLab("Hb", 8.5, "2025-01-01T16:00:00Z"), // -29%
    ];
    const deltas = calculateLabDeltas(makePatient(labs));
    expect(deltas[0].severity).toBe("critical");
  });

  it("no alert for small Hb change", () => {
    const labs = [
      makeLab("Hb", 12.0, "2025-01-01T08:00:00Z"),
      makeLab("Hb", 11.5, "2025-01-01T16:00:00Z"), // -4%
    ];
    expect(calculateLabDeltas(makePatient(labs))).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════
// WBC, PLT, CRP, Lactate, INR, Glucose
// ════════════════════════════════════════════════════════════

describe("calculateLabDeltas — WBC", () => {
  it("flags warning for WBC rise >= 5", () => {
    const labs = [
      makeLab("WBC", 8, "2025-01-01T08:00:00Z"),
      makeLab("WBC", 14, "2025-01-01T16:00:00Z"),
    ];
    const deltas = calculateLabDeltas(makePatient(labs));
    expect(deltas[0].severity).toBe("warning");
  });

  it("flags critical for WBC rise >= 10", () => {
    const labs = [
      makeLab("WBC", 6, "2025-01-01T08:00:00Z"),
      makeLab("WBC", 18, "2025-01-01T16:00:00Z"),
    ];
    const deltas = calculateLabDeltas(makePatient(labs));
    expect(deltas[0].severity).toBe("critical");
  });
});

describe("calculateLabDeltas — Platelets", () => {
  it("flags warning for PLT drop >= 30", () => {
    const labs = [
      makeLab("PLT", 200, "2025-01-01T08:00:00Z"),
      makeLab("PLT", 165, "2025-01-01T16:00:00Z"),
    ];
    const deltas = calculateLabDeltas(makePatient(labs));
    expect(deltas[0].severity).toBe("warning");
  });

  it("flags critical for PLT drop >= 50", () => {
    const labs = [
      makeLab("PLT", 200, "2025-01-01T08:00:00Z"),
      makeLab("PLT", 140, "2025-01-01T16:00:00Z"),
    ];
    const deltas = calculateLabDeltas(makePatient(labs));
    expect(deltas[0].severity).toBe("critical");
  });
});

describe("calculateLabDeltas — CRP", () => {
  it("flags warning for CRP rise >= 50", () => {
    const labs = [
      makeLab("CRP", 10, "2025-01-01T08:00:00Z"),
      makeLab("CRP", 65, "2025-01-01T16:00:00Z"),
    ];
    const deltas = calculateLabDeltas(makePatient(labs));
    expect(deltas[0].severity).toBe("warning");
  });

  it("flags critical for CRP rise >= 100", () => {
    const labs = [
      makeLab("CRP", 20, "2025-01-01T08:00:00Z"),
      makeLab("CRP", 150, "2025-01-01T16:00:00Z"),
    ];
    const deltas = calculateLabDeltas(makePatient(labs));
    expect(deltas[0].severity).toBe("critical");
  });
});

describe("calculateLabDeltas — Lactate", () => {
  it("flags warning for Lactate rise >= 0.5", () => {
    const labs = [
      makeLab("Lactate", 1.2, "2025-01-01T08:00:00Z"),
      makeLab("Lactate", 1.8, "2025-01-01T16:00:00Z"),
    ];
    const deltas = calculateLabDeltas(makePatient(labs));
    expect(deltas[0].severity).toBe("warning");
  });

  it("flags critical for Lactate rise >= 1.5", () => {
    const labs = [
      makeLab("Lactate", 1.0, "2025-01-01T08:00:00Z"),
      makeLab("Lactate", 3.0, "2025-01-01T16:00:00Z"),
    ];
    const deltas = calculateLabDeltas(makePatient(labs));
    expect(deltas[0].severity).toBe("critical");
  });
});

describe("calculateLabDeltas — INR", () => {
  it("flags warning for INR rise >= 0.5", () => {
    const labs = [
      makeLab("INR", 2.0, "2025-01-01T08:00:00Z"),
      makeLab("INR", 2.6, "2025-01-01T16:00:00Z"),
    ];
    const deltas = calculateLabDeltas(makePatient(labs));
    expect(deltas[0].severity).toBe("warning");
  });

  it("flags critical for INR rise >= 1.0", () => {
    const labs = [
      makeLab("INR", 2.0, "2025-01-01T08:00:00Z"),
      makeLab("INR", 3.5, "2025-01-01T16:00:00Z"),
    ];
    const deltas = calculateLabDeltas(makePatient(labs));
    expect(deltas[0].severity).toBe("critical");
  });
});

describe("calculateLabDeltas — Glucose", () => {
  it("flags warning for Glucose rise >= 80", () => {
    const labs = [
      makeLab("Glucose", 120, "2025-01-01T08:00:00Z"),
      makeLab("Glucose", 210, "2025-01-01T16:00:00Z"),
    ];
    const deltas = calculateLabDeltas(makePatient(labs));
    expect(deltas[0].severity).toBe("warning");
  });

  it("flags critical for Glucose rise >= 150", () => {
    const labs = [
      makeLab("Glucose", 100, "2025-01-01T08:00:00Z"),
      makeLab("Glucose", 280, "2025-01-01T16:00:00Z"),
    ];
    const deltas = calculateLabDeltas(makePatient(labs));
    expect(deltas[0].severity).toBe("critical");
  });

  it("flags critical for Glucose drop >= 100", () => {
    const labs = [
      makeLab("Glucose", 300, "2025-01-01T08:00:00Z"),
      makeLab("Glucose", 180, "2025-01-01T16:00:00Z"),
    ];
    const deltas = calculateLabDeltas(makePatient(labs));
    expect(deltas[0].severity).toBe("critical");
  });
});

// ════════════════════════════════════════════════════════════
// SORTING & MULTI-LAB
// ════════════════════════════════════════════════════════════

describe("calculateLabDeltas — sorting", () => {
  it("sorts critical before warning", () => {
    const labs = [
      makeLab("K+", 4.0, "2025-01-01T08:00:00Z", "k1"),
      makeLab("K+", 4.6, "2025-01-01T16:00:00Z", "k2"),   // warning
      makeLab("Cr", 1.0, "2025-01-01T08:00:00Z", "cr1"),
      makeLab("Cr", 3.0, "2025-01-01T16:00:00Z", "cr2"),   // critical (AKI Stage 3)
    ];
    const deltas = calculateLabDeltas(makePatient(labs));
    expect(deltas.length).toBeGreaterThanOrEqual(2);
    expect(deltas[0].severity).toBe("critical");
  });
});

// ════════════════════════════════════════════════════════════
// PEAK TRACKING
// ════════════════════════════════════════════════════════════

describe("calculateLabDeltas — peak tracking", () => {
  it("tracks peak K+ correctly (highest value)", () => {
    const labs = [
      makeLab("K+", 4.0, "2025-01-01T08:00:00Z", "k1"),
      makeLab("K+", 5.5, "2025-01-01T12:00:00Z", "k2"), // peak
      makeLab("K+", 4.8, "2025-01-01T16:00:00Z", "k3"), // recovering
    ];
    const deltas = calculateLabDeltas(makePatient(labs));
    expect(deltas).toHaveLength(1);
    expect(deltas[0].peak).toBe(5.5);
    expect(deltas[0].latest).toBe(4.8);
    expect(deltas[0].peakWasPast).toBe(true);
  });
});

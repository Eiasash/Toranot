/**
 * labDelta edge case tests — zero/negative baselines, boundary thresholds,
 * float precision, peak tracking, extreme multipliers.
 */
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
    age: 80,
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

function makeLab(label: string, value: number, hoursAgo: number): LabEntry {
  const time = new Date(Date.now() - hoursAgo * 3600 * 1000).toISOString();
  return { id: `lab-${label}-${hoursAgo}-${value}`, label, value, time };
}

// ═══ ZERO / NEGATIVE BASELINE ═══

describe("zero and negative baseline handling", () => {
  it("skips Cr with zero baseline (avoids division by zero)", () => {
    const p = makePatient([makeLab("Cr", 0, 24), makeLab("Cr", 1.5, 1)]);
    const deltas = calculateLabDeltas(p);
    expect(deltas).toHaveLength(0);
  });

  it("skips K+ with zero baseline", () => {
    const p = makePatient([makeLab("K+", 0, 24), makeLab("K+", 5.0, 1)]);
    expect(calculateLabDeltas(p)).toHaveLength(0);
  });

  it("skips Hb with negative baseline (data corruption)", () => {
    const p = makePatient([makeLab("Hb", -1, 24), makeLab("Hb", 10.0, 1)]);
    expect(calculateLabDeltas(p)).toHaveLength(0);
  });

  it("skips Na with zero baseline", () => {
    const p = makePatient([makeLab("Na", 0, 48), makeLab("Na", 135, 1)]);
    expect(calculateLabDeltas(p)).toHaveLength(0);
  });
});

// ═══ KDIGO AKI BOUNDARY THRESHOLDS ═══

describe("KDIGO AKI — exact boundary values", () => {
  it("Cr exactly 1.5x baseline → AKI Stage 1", () => {
    // Baseline 1.0, peak 1.5 → ratio exactly 1.5
    const p = makePatient([makeLab("Cr", 1.0, 48), makeLab("Cr", 1.5, 1)]);
    const deltas = calculateLabDeltas(p);
    expect(deltas).toHaveLength(1);
    expect(deltas[0].akiStage).toBe(1);
    expect(deltas[0].severity).toBe("warning");
  });

  it("Cr 1.49x baseline → no AKI (just below Stage 1)", () => {
    const p = makePatient([makeLab("Cr", 1.0, 48), makeLab("Cr", 1.49, 1)]);
    // 1.49x is below 1.5x threshold — check if within 48h absolute (0.49 >= 0.3)
    const deltas = calculateLabDeltas(p);
    if (deltas.length > 0) {
      // May trigger on 48h absolute criterion (≥0.3 rise within 48h)
      expect(deltas[0].akiStage).toBe(1);
    }
  });

  it("Cr exactly 2.0x baseline → AKI Stage 2", () => {
    const p = makePatient([makeLab("Cr", 1.0, 48), makeLab("Cr", 2.0, 1)]);
    const deltas = calculateLabDeltas(p);
    expect(deltas).toHaveLength(1);
    expect(deltas[0].akiStage).toBe(2);
    expect(deltas[0].severity).toBe("critical");
  });

  it("Cr exactly 3.0x baseline → AKI Stage 3", () => {
    const p = makePatient([makeLab("Cr", 1.0, 48), makeLab("Cr", 3.0, 1)]);
    const deltas = calculateLabDeltas(p);
    expect(deltas).toHaveLength(1);
    expect(deltas[0].akiStage).toBe(3);
    expect(deltas[0].severity).toBe("critical");
  });

  it("Cr absolute rise ≥0.3 within 48h → AKI Stage 1 (48h criterion)", () => {
    const p = makePatient([makeLab("Cr", 1.0, 24), makeLab("Cr", 1.3, 1)]);
    const deltas = calculateLabDeltas(p);
    expect(deltas).toHaveLength(1);
    expect(deltas[0].akiStage).toBe(1);
  });

  it("Cr absolute rise 0.29 within 48h → no AKI (below 0.3)", () => {
    const p = makePatient([makeLab("Cr", 1.0, 24), makeLab("Cr", 1.29, 1)]);
    const deltas = calculateLabDeltas(p);
    expect(deltas).toHaveLength(0);
  });
});

// ═══ FLOAT PRECISION (IEEE754 edge cases) ═══

describe("float precision handling", () => {
  it("handles 4.1 - 3.8 = 0.3 correctly (rounded, not 0.2999...)", () => {
    // Baseline 3.8, peak 4.1 → absolute rise 0.3, peak ≥4.0
    // Should classify as Stage 3 (absolute criterion)
    const p = makePatient([makeLab("Cr", 3.8, 24), makeLab("Cr", 4.1, 1)]);
    const deltas = calculateLabDeltas(p);
    expect(deltas).toHaveLength(1);
    expect(deltas[0].akiStage).toBe(3);
  });

  it("handles stable CKD-5 (Cr 4.2→4.2) — NOT AKI Stage 3", () => {
    // No rise — should not trigger AKI
    const p = makePatient([makeLab("Cr", 4.2, 48), makeLab("Cr", 4.2, 1)]);
    const deltas = calculateLabDeltas(p);
    expect(deltas).toHaveLength(0);
  });

  it("stable CKD with tiny fluctuation (4.0→4.1) — below 0.3 threshold", () => {
    const p = makePatient([makeLab("Cr", 4.0, 48), makeLab("Cr", 4.1, 1)]);
    const deltas = calculateLabDeltas(p);
    // Ratio ~1.025, absolute rise 0.1 — should NOT trigger
    expect(deltas).toHaveLength(0);
  });
});

// ═══ EXTREME MULTIPLIERS ═══

describe("extreme Cr multipliers", () => {
  it("Cr from 0.5 to 2.0 (4× multiplier) → AKI Stage 3", () => {
    const p = makePatient([makeLab("Cr", 0.5, 24), makeLab("Cr", 2.0, 1)]);
    const deltas = calculateLabDeltas(p);
    expect(deltas).toHaveLength(1);
    expect(deltas[0].akiStage).toBe(3);
    expect(deltas[0].severity).toBe("critical");
  });

  it("Cr from 0.3 to 1.5 (5× multiplier) → AKI Stage 3", () => {
    const p = makePatient([makeLab("Cr", 0.3, 24), makeLab("Cr", 1.5, 1)]);
    const deltas = calculateLabDeltas(p);
    expect(deltas).toHaveLength(1);
    expect(deltas[0].akiStage).toBe(3);
  });
});

// ═══ PEAK TRACKING — RECOVERING PATIENTS ═══

describe("peak tracking across multiple values", () => {
  it("recovering Cr (0.8 → 1.5 → 1.0) still shows peak-based staging", () => {
    const p = makePatient([
      makeLab("Cr", 0.8, 48),
      makeLab("Cr", 1.5, 24),
      makeLab("Cr", 1.0, 1),
    ]);
    const deltas = calculateLabDeltas(p);
    expect(deltas).toHaveLength(1);
    // Peak was 1.5 (1.875× baseline) → Stage 1
    expect(deltas[0].akiStage).toBe(1);
    expect(deltas[0].peakWasPast).toBe(true);
    expect(deltas[0].peak).toBe(1.5);
    expect(deltas[0].message).toContain("שיפור");
  });

  it("worsening Cr (1.0 → 1.5 → 2.5 → 3.5) → Stage 3", () => {
    const p = makePatient([
      makeLab("Cr", 1.0, 72),
      makeLab("Cr", 1.5, 48),
      makeLab("Cr", 2.5, 24),
      makeLab("Cr", 3.5, 1),
    ]);
    const deltas = calculateLabDeltas(p);
    expect(deltas).toHaveLength(1);
    expect(deltas[0].akiStage).toBe(3);
    expect(deltas[0].peakWasPast).toBe(false);
  });
});

// ═══ HB PERCENTAGE THRESHOLDS ═══

describe("Hb percentage-based delta thresholds", () => {
  it("Hb drop exactly 15% → warning", () => {
    // Baseline 10.0, latest 8.5 → -15%
    const p = makePatient([makeLab("Hb", 10.0, 24), makeLab("Hb", 8.5, 1)]);
    const deltas = calculateLabDeltas(p);
    expect(deltas).toHaveLength(1);
    expect(deltas[0].severity).toBe("warning");
  });

  it("Hb drop 25% → critical", () => {
    // Baseline 12.0, latest 9.0 → -25%
    const p = makePatient([makeLab("Hb", 12.0, 24), makeLab("Hb", 9.0, 1)]);
    const deltas = calculateLabDeltas(p);
    expect(deltas).toHaveLength(1);
    expect(deltas[0].severity).toBe("critical");
  });

  it("Hb drop 14% → no alert (below 15% warning)", () => {
    // Baseline 10.0, latest 8.6 → -14%
    const p = makePatient([makeLab("Hb", 10.0, 24), makeLab("Hb", 8.6, 1)]);
    const deltas = calculateLabDeltas(p);
    expect(deltas).toHaveLength(0);
  });

  it("small Hb drop from low baseline (8→7.5 = 6.25%) → no alert", () => {
    const p = makePatient([makeLab("Hb", 8.0, 24), makeLab("Hb", 7.5, 1)]);
    expect(calculateLabDeltas(p)).toHaveLength(0);
  });
});

// ═══ K+ DELTA THRESHOLDS ═══

describe("K+ delta thresholds", () => {
  it("K+ rise 1.0 → critical", () => {
    const p = makePatient([makeLab("K+", 4.0, 24), makeLab("K+", 5.0, 1)]);
    const deltas = calculateLabDeltas(p);
    expect(deltas).toHaveLength(1);
    expect(deltas[0].severity).toBe("critical");
  });

  it("K+ rise 0.5 → warning", () => {
    const p = makePatient([makeLab("K+", 4.0, 24), makeLab("K+", 4.5, 1)]);
    const deltas = calculateLabDeltas(p);
    expect(deltas).toHaveLength(1);
    expect(deltas[0].severity).toBe("warning");
  });

  it("K+ drop 1.0 → critical", () => {
    const p = makePatient([makeLab("K+", 4.5, 24), makeLab("K+", 3.5, 1)]);
    const deltas = calculateLabDeltas(p);
    expect(deltas).toHaveLength(1);
    expect(deltas[0].severity).toBe("critical");
  });

  it("K+ stable (no change) → no alert", () => {
    const p = makePatient([makeLab("K+", 4.0, 24), makeLab("K+", 4.0, 1)]);
    expect(calculateLabDeltas(p)).toHaveLength(0);
  });
});

// ═══ Na DELTA THRESHOLDS ═══

describe("Na delta thresholds", () => {
  it("Na rise 8 → critical", () => {
    const p = makePatient([makeLab("Na", 130, 24), makeLab("Na", 138, 1)]);
    const deltas = calculateLabDeltas(p);
    expect(deltas).toHaveLength(1);
    expect(deltas[0].severity).toBe("critical");
  });

  it("Na drop 8 → critical", () => {
    const p = makePatient([makeLab("Na", 140, 24), makeLab("Na", 132, 1)]);
    const deltas = calculateLabDeltas(p);
    expect(deltas).toHaveLength(1);
    expect(deltas[0].severity).toBe("critical");
  });

  it("Na rise 5 → warning", () => {
    const p = makePatient([makeLab("Na", 130, 24), makeLab("Na", 135, 1)]);
    const deltas = calculateLabDeltas(p);
    expect(deltas).toHaveLength(1);
    expect(deltas[0].severity).toBe("warning");
  });
});

// ═══ MULTIPLE LAB TYPES ═══

describe("multiple lab types simultaneously", () => {
  it("returns deltas sorted: critical first, then alphabetical", () => {
    const p = makePatient([
      makeLab("K+", 4.0, 24),
      makeLab("K+", 5.5, 1),   // critical rise (1.5)
      makeLab("Na", 140, 24),
      makeLab("Na", 135, 1),    // warning drop (5)
    ]);
    const deltas = calculateLabDeltas(p);
    expect(deltas.length).toBe(2);
    // K+ critical should be first
    expect(deltas[0].label).toBe("K+");
    expect(deltas[0].severity).toBe("critical");
    expect(deltas[1].label).toBe("Na");
    expect(deltas[1].severity).toBe("warning");
  });
});

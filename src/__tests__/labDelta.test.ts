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
  return { id: `lab-${label}-${hoursAgo}`, label, value, time };
}

describe("calculateLabDeltas", () => {
  it("returns empty for no labs", () => {
    const p = makePatient([]);
    expect(calculateLabDeltas(p)).toEqual([]);
  });

  it("returns empty for only one lab", () => {
    const p = makePatient([makeLab("Cr", 1.0, 2)]);
    expect(calculateLabDeltas(p)).toEqual([]);
  });

  it("returns empty for two different lab types with one value each", () => {
    const p = makePatient([makeLab("Cr", 1.0, 2), makeLab("K+", 4.0, 1)]);
    expect(calculateLabDeltas(p)).toEqual([]);
  });

  // ── Creatinine / KDIGO AKI ──

  describe("Creatinine KDIGO AKI staging", () => {
    it("detects AKI Stage 1 (>=1.5x baseline)", () => {
      const p = makePatient([
        makeLab("Cr", 1.0, 48),
        makeLab("Cr", 1.6, 1),
      ]);
      const deltas = calculateLabDeltas(p);
      const crDelta = deltas.find((d) => d.label === "Cr");
      expect(crDelta).toBeDefined();
      expect(crDelta!.akiStage).toBe(1);
      expect(crDelta!.severity).toBe("warning");
    });

    it("detects AKI Stage 1 (>=0.3 rise within 48h)", () => {
      const p = makePatient([
        makeLab("Cr", 0.8, 24),
        makeLab("Cr", 1.2, 1),
      ]);
      const deltas = calculateLabDeltas(p);
      const crDelta = deltas.find((d) => d.label === "Cr");
      expect(crDelta).toBeDefined();
      expect(crDelta!.akiStage).toBe(1);
    });

    it("detects AKI Stage 2 (>=2x baseline)", () => {
      const p = makePatient([
        makeLab("Cr", 1.0, 72),
        makeLab("Cr", 2.1, 1),
      ]);
      const deltas = calculateLabDeltas(p);
      const crDelta = deltas.find((d) => d.label === "Cr");
      expect(crDelta).toBeDefined();
      expect(crDelta!.akiStage).toBe(2);
      expect(crDelta!.severity).toBe("critical");
    });

    it("detects AKI Stage 3 (>=3x baseline)", () => {
      const p = makePatient([
        makeLab("Cr", 1.0, 96),
        makeLab("Cr", 3.5, 1),
      ]);
      const deltas = calculateLabDeltas(p);
      const crDelta = deltas.find((d) => d.label === "Cr");
      expect(crDelta).toBeDefined();
      expect(crDelta!.akiStage).toBe(3);
      expect(crDelta!.severity).toBe("critical");
    });

    it("detects AKI Stage 3 for absolute Cr >= 4.0", () => {
      const p = makePatient([
        makeLab("Cr", 2.0, 96),
        makeLab("Cr", 4.5, 1),
      ]);
      const deltas = calculateLabDeltas(p);
      const crDelta = deltas.find((d) => d.label === "Cr");
      expect(crDelta).toBeDefined();
      expect(crDelta!.akiStage).toBe(3);
    });

    it("no AKI for stable creatinine", () => {
      const p = makePatient([
        makeLab("Cr", 1.0, 48),
        makeLab("Cr", 1.1, 1),
      ]);
      const deltas = calculateLabDeltas(p);
      const crDelta = deltas.find((d) => d.label === "Cr");
      expect(crDelta).toBeUndefined();
    });

    it("uses peak Cr for staging even if latest is lower (recovery)", () => {
      const p = makePatient([
        makeLab("Cr", 1.0, 72),
        makeLab("Cr", 2.5, 24),  // peak
        makeLab("Cr", 1.5, 1),   // improving
      ]);
      const deltas = calculateLabDeltas(p);
      const crDelta = deltas.find((d) => d.label === "Cr");
      expect(crDelta).toBeDefined();
      expect(crDelta!.akiStage).toBe(2); // 2.5x = stage 2
      expect(crDelta!.peakWasPast).toBe(true);
      expect(crDelta!.message).toContain("שיפור");
    });
  });

  // ── Potassium ──

  describe("Potassium (K+)", () => {
    it("flags critical rise in K+ (>=1.0)", () => {
      const p = makePatient([
        makeLab("K+", 4.0, 12),
        makeLab("K+", 5.2, 1),
      ]);
      const deltas = calculateLabDeltas(p);
      const kDelta = deltas.find((d) => d.label === "K+");
      expect(kDelta).toBeDefined();
      expect(kDelta!.severity).toBe("critical");
    });

    it("flags warning rise in K+ (>=0.5)", () => {
      const p = makePatient([
        makeLab("K+", 4.0, 12),
        makeLab("K+", 4.6, 1),
      ]);
      const deltas = calculateLabDeltas(p);
      const kDelta = deltas.find((d) => d.label === "K+");
      expect(kDelta).toBeDefined();
      expect(kDelta!.severity).toBe("warning");
    });

    it("flags critical drop in K+ (<=-1.0)", () => {
      const p = makePatient([
        makeLab("K+", 4.5, 12),
        makeLab("K+", 3.4, 1),
      ]);
      const deltas = calculateLabDeltas(p);
      const kDelta = deltas.find((d) => d.label === "K+");
      expect(kDelta).toBeDefined();
      expect(kDelta!.severity).toBe("critical");
    });

    it("no alert for stable K+", () => {
      const p = makePatient([
        makeLab("K+", 4.0, 12),
        makeLab("K+", 4.2, 1),
      ]);
      const deltas = calculateLabDeltas(p);
      const kDelta = deltas.find((d) => d.label === "K+");
      expect(kDelta).toBeUndefined();
    });
  });

  // ── Hemoglobin (percentage-based) ──

  describe("Hemoglobin (Hb)", () => {
    it("flags warning for >= 15% drop", () => {
      const p = makePatient([
        makeLab("Hb", 12.0, 48),
        makeLab("Hb", 10.0, 1), // ~17% drop
      ]);
      const deltas = calculateLabDeltas(p);
      const hbDelta = deltas.find((d) => d.label === "Hb");
      expect(hbDelta).toBeDefined();
      expect(hbDelta!.severity).toBe("warning");
    });

    it("flags critical for >= 25% drop", () => {
      const p = makePatient([
        makeLab("Hb", 12.0, 48),
        makeLab("Hb", 8.5, 1), // ~29% drop
      ]);
      const deltas = calculateLabDeltas(p);
      const hbDelta = deltas.find((d) => d.label === "Hb");
      expect(hbDelta).toBeDefined();
      expect(hbDelta!.severity).toBe("critical");
    });

    it("no alert for small Hb change", () => {
      const p = makePatient([
        makeLab("Hb", 12.0, 48),
        makeLab("Hb", 11.5, 1), // ~4% drop
      ]);
      const deltas = calculateLabDeltas(p);
      const hbDelta = deltas.find((d) => d.label === "Hb");
      expect(hbDelta).toBeUndefined();
    });
  });

  // ── Sodium ──

  describe("Sodium (Na)", () => {
    it("flags warning for Na drop >= 5", () => {
      const p = makePatient([
        makeLab("Na", 140, 48),
        makeLab("Na", 134, 1),
      ]);
      const deltas = calculateLabDeltas(p);
      const naDelta = deltas.find((d) => d.label === "Na");
      expect(naDelta).toBeDefined();
      expect(naDelta!.severity).toBe("warning");
    });

    it("flags critical for Na drop >= 8", () => {
      const p = makePatient([
        makeLab("Na", 140, 48),
        makeLab("Na", 131, 1),
      ]);
      const deltas = calculateLabDeltas(p);
      const naDelta = deltas.find((d) => d.label === "Na");
      expect(naDelta).toBeDefined();
      expect(naDelta!.severity).toBe("critical");
    });
  });

  // ── CRP ──

  describe("CRP", () => {
    it("flags warning for CRP rise >= 50", () => {
      const p = makePatient([
        makeLab("CRP", 20, 48),
        makeLab("CRP", 75, 1),
      ]);
      const deltas = calculateLabDeltas(p);
      const crpDelta = deltas.find((d) => d.label === "CRP");
      expect(crpDelta).toBeDefined();
      expect(crpDelta!.severity).toBe("warning");
    });

    it("flags critical for CRP rise >= 100", () => {
      const p = makePatient([
        makeLab("CRP", 20, 48),
        makeLab("CRP", 130, 1),
      ]);
      const deltas = calculateLabDeltas(p);
      const crpDelta = deltas.find((d) => d.label === "CRP");
      expect(crpDelta).toBeDefined();
      expect(crpDelta!.severity).toBe("critical");
    });
  });

  // ── INR ──

  describe("INR", () => {
    it("flags warning for INR rise >= 0.5", () => {
      const p = makePatient([
        makeLab("INR", 2.0, 48),
        makeLab("INR", 2.6, 1),
      ]);
      const deltas = calculateLabDeltas(p);
      const inrDelta = deltas.find((d) => d.label === "INR");
      expect(inrDelta).toBeDefined();
      expect(inrDelta!.severity).toBe("warning");
    });
  });

  // ── Sorting ──

  describe("sorting", () => {
    it("puts critical deltas before warning deltas", () => {
      const p = makePatient([
        makeLab("K+", 4.0, 12),
        makeLab("K+", 4.6, 1),  // warning
        makeLab("Cr", 1.0, 48),
        makeLab("Cr", 3.5, 1),  // critical (AKI stage 3)
      ]);
      const deltas = calculateLabDeltas(p);
      if (deltas.length >= 2) {
        expect(deltas[0].severity).toBe("critical");
      }
    });
  });

  // ── Peak tracking ──

  describe("peak tracking", () => {
    it("tracks peak value across multiple measurements", () => {
      const p = makePatient([
        makeLab("K+", 4.0, 48),
        makeLab("K+", 5.5, 24),  // peak
        makeLab("K+", 4.8, 1),   // latest (improved)
      ]);
      const deltas = calculateLabDeltas(p);
      const kDelta = deltas.find((d) => d.label === "K+");
      expect(kDelta).toBeDefined();
      expect(kDelta!.peak).toBe(5.5);
    });
  });

  // ── Edge cases ──

  describe("edge cases", () => {
    it("handles zero baseline Cr without division by zero", () => {
      const p = makePatient([
        makeLab("Cr", 0, 48),
        makeLab("Cr", 2.0, 1),
      ]);
      // Should not throw or produce Infinity-based false alerts
      const deltas = calculateLabDeltas(p);
      const crDelta = deltas.find((d) => d.label === "Cr");
      // With baseline 0, AKI classification should be skipped (returns null)
      // but the generic delta engine may still fire on absolute change
      if (crDelta) {
        expect(crDelta.severity).not.toBe("critical"); // shouldn't be AKI stage 3 from Infinity ratio
        expect(Number.isFinite(crDelta.changePercent)).toBe(true);
      }
    });

    it("handles negative lab values gracefully", () => {
      const p = makePatient([
        makeLab("Cr", -1, 48),
        makeLab("Cr", 1.0, 1),
      ]);
      const deltas = calculateLabDeltas(p);
      // Should not crash
      expect(Array.isArray(deltas)).toBe(true);
    });

    it("handles identical baseline and latest values (no change)", () => {
      const p = makePatient([
        makeLab("Cr", 1.0, 48),
        makeLab("Cr", 1.0, 1),
      ]);
      const deltas = calculateLabDeltas(p);
      const crDelta = deltas.find((d) => d.label === "Cr");
      expect(crDelta).toBeUndefined(); // no alert for stable
    });

    it("handles labs with same timestamp", () => {
      const now = new Date().toISOString();
      const p = makePatient([
        { id: "l1", label: "K+", value: 4.0, time: now },
        { id: "l2", label: "K+", value: 5.5, time: now },
      ]);
      // Should not crash on zero time difference
      const deltas = calculateLabDeltas(p);
      expect(Array.isArray(deltas)).toBe(true);
    });
  });

  // ── Boundary value tests ──

  describe("KDIGO AKI boundaries", () => {
    it("Cr exactly 1.5x baseline triggers AKI Stage 1", () => {
      const p = makePatient([
        makeLab("Cr", 1.0, 48),
        makeLab("Cr", 1.5, 1),  // exactly 1.5x
      ]);
      const deltas = calculateLabDeltas(p);
      const crDelta = deltas.find((d) => d.label === "Cr");
      expect(crDelta).toBeDefined();
      expect(crDelta!.akiStage).toBe(1);
    });

    it("Cr just under 1.5x does not trigger AKI (outside 48h window)", () => {
      const p = makePatient([
        makeLab("Cr", 1.0, 72),  // baseline >48h ago
        makeLab("Cr", 1.49, 1),  // just below 1.5x
      ]);
      const deltas = calculateLabDeltas(p);
      const crDelta = deltas.find((d) => d.label === "Cr");
      expect(crDelta).toBeUndefined();
    });

    it("Cr exactly 2.0x baseline triggers AKI Stage 2", () => {
      const p = makePatient([
        makeLab("Cr", 1.0, 72),
        makeLab("Cr", 2.0, 1),
      ]);
      const deltas = calculateLabDeltas(p);
      const crDelta = deltas.find((d) => d.label === "Cr");
      expect(crDelta).toBeDefined();
      expect(crDelta!.akiStage).toBe(2);
      expect(crDelta!.severity).toBe("critical");
    });

    it("Cr exactly 3.0x baseline triggers AKI Stage 3", () => {
      const p = makePatient([
        makeLab("Cr", 1.0, 96),
        makeLab("Cr", 3.0, 1),
      ]);
      const deltas = calculateLabDeltas(p);
      const crDelta = deltas.find((d) => d.label === "Cr");
      expect(crDelta).toBeDefined();
      expect(crDelta!.akiStage).toBe(3);
    });

    it("Cr exactly 4.0 triggers AKI Stage 3 regardless of ratio", () => {
      const p = makePatient([
        makeLab("Cr", 3.5, 96),
        makeLab("Cr", 4.0, 1),  // ratio 1.14x (below stage 1) but absolute >= 4.0
      ]);
      const deltas = calculateLabDeltas(p);
      const crDelta = deltas.find((d) => d.label === "Cr");
      expect(crDelta).toBeDefined();
      expect(crDelta!.akiStage).toBe(3);
    });

    it("0.3 rise within 48h triggers Stage 1 even with low ratio", () => {
      const p = makePatient([
        makeLab("Cr", 0.8, 24),  // 24h ago (within 48h)
        makeLab("Cr", 1.1, 1),   // rise of 0.3, ratio only 1.375
      ]);
      const deltas = calculateLabDeltas(p);
      const crDelta = deltas.find((d) => d.label === "Cr");
      expect(crDelta).toBeDefined();
      expect(crDelta!.akiStage).toBe(1);
    });

    it("0.3 rise outside 48h does not trigger Stage 1 (48h criterion)", () => {
      const p = makePatient([
        makeLab("Cr", 0.8, 72),  // 72h ago (>48h)
        makeLab("Cr", 1.1, 1),   // rise of 0.3, ratio 1.375 (<1.5)
      ]);
      const deltas = calculateLabDeltas(p);
      const crDelta = deltas.find((d) => d.label === "Cr");
      expect(crDelta).toBeUndefined();
    });
  });

  describe("K+ threshold boundaries", () => {
    it("K+ rise of exactly 0.5 triggers warning", () => {
      const p = makePatient([
        makeLab("K+", 4.0, 12),
        makeLab("K+", 4.5, 1),
      ]);
      const deltas = calculateLabDeltas(p);
      const kDelta = deltas.find((d) => d.label === "K+");
      expect(kDelta).toBeDefined();
      expect(kDelta!.severity).toBe("warning");
    });

    it("K+ rise of 0.49 does not trigger alert", () => {
      const p = makePatient([
        makeLab("K+", 4.0, 12),
        makeLab("K+", 4.49, 1),
      ]);
      const deltas = calculateLabDeltas(p);
      const kDelta = deltas.find((d) => d.label === "K+");
      expect(kDelta).toBeUndefined();
    });

    it("K+ rise of exactly 1.0 triggers critical", () => {
      const p = makePatient([
        makeLab("K+", 4.0, 12),
        makeLab("K+", 5.0, 1),
      ]);
      const deltas = calculateLabDeltas(p);
      const kDelta = deltas.find((d) => d.label === "K+");
      expect(kDelta).toBeDefined();
      expect(kDelta!.severity).toBe("critical");
    });
  });
});

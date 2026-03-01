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
});

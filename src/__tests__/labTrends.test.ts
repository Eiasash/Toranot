import { describe, it, expect } from "vitest";
import { calculateLabTrends, type TrendArrow } from "../engine/labDelta";
import type { PatientEntry } from "../types";

function makePatient(overrides: Partial<PatientEntry> = {}): PatientEntry {
  return {
    id: "test-1",
    section: "SIDE_A",
    date: "01/01/2026",
    room: "70",
    name: "Test",
    age: 80,
    diagnosis: null,
    flags: [],
    status: [],
    tomorrowNotes: [],
    tasks: [],
    generatedTasks: [],
    scannedAt: new Date().toISOString(),
    confidence: 1,
    ...overrides,
  };
}

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3600000).toISOString();
}

describe("calculateLabTrends", () => {
  it("returns empty for no labs", () => {
    expect(calculateLabTrends(makePatient())).toEqual([]);
  });

  it("returns empty for single lab value", () => {
    const result = calculateLabTrends(makePatient({
      labs: [{ id: "l1", label: "Cr", value: 1.0, time: hoursAgo(6) }],
    }));
    expect(result).toEqual([]);
  });

  it("computes Cr rate per day correctly", () => {
    // Cr 1.0 → 1.3 over 12 hours = 0.6/day
    const result = calculateLabTrends(makePatient({
      labs: [
        { id: "l1", label: "Cr", value: 1.0, time: hoursAgo(12) },
        { id: "l2", label: "Cr", value: 1.3, time: hoursAgo(0) },
      ],
    }));
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("Cr");
    expect(result[0].ratePerDay).toBeCloseTo(0.6, 1);
  });

  it("fast rising Cr → ↑↑ arrow", () => {
    // Cr 1.0 → 1.5 over 6 hours = 2.0/day (fast > 0.3 threshold)
    const result = calculateLabTrends(makePatient({
      labs: [
        { id: "l1", label: "Cr", value: 1.0, time: hoursAgo(6) },
        { id: "l2", label: "Cr", value: 1.5, time: hoursAgo(0) },
      ],
    }));
    expect(result[0].arrow).toBe("↑↑");
  });

  it("slow rising Cr → ↑ arrow", () => {
    // Cr 1.0 → 1.2 over 24 hours = 0.2/day (slow: between 0.1 and 0.3)
    const result = calculateLabTrends(makePatient({
      labs: [
        { id: "l1", label: "Cr", value: 1.0, time: hoursAgo(24) },
        { id: "l2", label: "Cr", value: 1.2, time: hoursAgo(0) },
      ],
    }));
    expect(result[0].arrow).toBe("↑");
  });

  it("stable Cr → → arrow", () => {
    // Cr 1.0 → 1.02 over 48 hours = ~0.01/day (< 0.1 slow threshold)
    const result = calculateLabTrends(makePatient({
      labs: [
        { id: "l1", label: "Cr", value: 1.0, time: hoursAgo(48) },
        { id: "l2", label: "Cr", value: 1.02, time: hoursAgo(0) },
      ],
    }));
    expect(result[0].arrow).toBe("→");
  });

  it("falling Hb → ↓ arrow", () => {
    // Hb 10.0 → 9.0 over 24 hours = -1.0/day (slow fall for Hb)
    const result = calculateLabTrends(makePatient({
      labs: [
        { id: "l1", label: "Hb", value: 10.0, time: hoursAgo(24) },
        { id: "l2", label: "Hb", value: 9.0, time: hoursAgo(0) },
      ],
    }));
    expect(result[0].arrow).toBe("↓");
    expect(result[0].ratePerDay).toBeCloseTo(-1.0, 1);
  });

  it("fast falling Hb → ↓↓ arrow", () => {
    // Hb 10.0 → 7.0 over 6 hours = -12.0/day (fast > 1.5 threshold)
    const result = calculateLabTrends(makePatient({
      labs: [
        { id: "l1", label: "Hb", value: 10.0, time: hoursAgo(6) },
        { id: "l2", label: "Hb", value: 7.0, time: hoursAgo(0) },
      ],
    }));
    expect(result[0].arrow).toBe("↓↓");
  });

  it("uses last two values for rate (not baseline→latest)", () => {
    // 3 values: 1.0 (48h ago), 1.5 (24h ago), 1.6 (now)
    // Rate should be based on 1.5→1.6 over 24h = 0.1/day (not 1.0→1.6 over 48h)
    const result = calculateLabTrends(makePatient({
      labs: [
        { id: "l1", label: "Cr", value: 1.0, time: hoursAgo(48) },
        { id: "l2", label: "Cr", value: 1.5, time: hoursAgo(24) },
        { id: "l3", label: "Cr", value: 1.6, time: hoursAgo(0) },
      ],
    }));
    expect(result[0].ratePerDay).toBeCloseTo(0.1, 1);
    expect(result[0].arrow).toBe("↑"); // 0.1 = at slow threshold = slow rise
  });

  it("handles multiple lab types simultaneously", () => {
    const result = calculateLabTrends(makePatient({
      labs: [
        { id: "l1", label: "Cr", value: 1.0, time: hoursAgo(12) },
        { id: "l2", label: "Cr", value: 1.3, time: hoursAgo(0) },
        { id: "l3", label: "K+", value: 4.0, time: hoursAgo(12) },
        { id: "l4", label: "K+", value: 5.5, time: hoursAgo(0) },
      ],
    }));
    expect(result).toHaveLength(2);
    const labels = result.map(t => t.label).sort();
    expect(labels).toEqual(["Cr", "K+"]);
  });

  it("sorts by absolute rate descending", () => {
    const result = calculateLabTrends(makePatient({
      labs: [
        { id: "l1", label: "Cr", value: 1.0, time: hoursAgo(24) },
        { id: "l2", label: "Cr", value: 1.1, time: hoursAgo(0) }, // 0.1/day
        { id: "l3", label: "K+", value: 4.0, time: hoursAgo(24) },
        { id: "l4", label: "K+", value: 5.5, time: hoursAgo(0) }, // 1.5/day
      ],
    }));
    // K+ rate (1.5/day) > Cr rate (0.1/day)
    expect(result[0].label).toBe("K+");
  });

  it("skips labs with identical timestamps", () => {
    const now = hoursAgo(0);
    const result = calculateLabTrends(makePatient({
      labs: [
        { id: "l1", label: "Cr", value: 1.0, time: now },
        { id: "l2", label: "Cr", value: 1.5, time: now },
      ],
    }));
    expect(result).toHaveLength(0);
  });

  it("summary includes rate and speed description", () => {
    const result = calculateLabTrends(makePatient({
      labs: [
        { id: "l1", label: "Cr", value: 1.0, time: hoursAgo(6) },
        { id: "l2", label: "Cr", value: 1.5, time: hoursAgo(0) },
      ],
    }));
    expect(result[0].summary).toContain("Cr");
    expect(result[0].summary).toContain("עולה");
    expect(result[0].summary).toContain("מהיר");
  });

  it("values array is ordered chronologically", () => {
    const result = calculateLabTrends(makePatient({
      labs: [
        { id: "l2", label: "Cr", value: 1.5, time: hoursAgo(0) },
        { id: "l1", label: "Cr", value: 1.0, time: hoursAgo(12) },
      ],
    }));
    expect(result[0].values[0].value).toBe(1.0);
    expect(result[0].values[1].value).toBe(1.5);
  });
});

/**
 * Expanded IV protocol matching tests — untested protocols and tier logic.
 */
import { describe, it, expect } from "vitest";
import { matchIVProtocols } from "../engine/ivProtocolMatch";
import type { PatientEntry } from "../types";

function makePatient(overrides: Partial<PatientEntry> = {}): PatientEntry {
  return {
    id: "test-pt",
    section: "SIDE_A",
    date: "01/01/2025",
    room: "101",
    name: "Test Patient",
    age: 70,
    diagnosis: overrides.diagnosis ?? null,
    flags: overrides.flags ?? [],
    status: overrides.status ?? [],
    tomorrowNotes: overrides.tomorrowNotes ?? [],
    tasks: overrides.tasks ?? [],
    generatedTasks: overrides.generatedTasks ?? [],
    notes: overrides.notes ?? [],
    scannedAt: "2025-01-01T00:00:00.000Z",
    confidence: 1,
  };
}

function makeTask(text: string) {
  return {
    id: "t-1",
    text,
    urgency: "routine" as const,
    source: "extracted" as const,
    done: false,
    doneTime: null,
    time: null,
    confidence: 1,
  };
}

describe("matchIVProtocols — expanded protocol coverage", () => {
  // ── Propofol ──
  it("matches propofol active", () => {
    const p = makePatient({ tasks: [makeTask("propofol drip 30mcg/kg/min")] });
    const matches = matchIVProtocols(p);
    expect(matches.some(m => m.protocolId === "propofol" && m.tier === "active")).toBe(true);
  });

  it("matches diprivan (brand)", () => {
    const p = makePatient({ status: ["Diprivan infusion"] });
    const matches = matchIVProtocols(p);
    expect(matches.some(m => m.protocolId === "propofol")).toBe(true);
  });

  // ── Fentanyl ──
  it("matches fentanyl IV drip", () => {
    const p = makePatient({ tasks: [makeTask("fentanyl drip 30mcg/hr")] });
    const matches = matchIVProtocols(p);
    expect(matches.some(m => m.protocolId === "fentanyl" && m.tier === "active")).toBe(true);
  });

  it("matches פנטניל IV (Hebrew)", () => {
    const p = makePatient({ tasks: [makeTask("פנטניל IV 20mcg/hr")] });
    const matches = matchIVProtocols(p);
    expect(matches.some(m => m.protocolId === "fentanyl")).toBe(true);
  });

  // ── Morphine ──
  it("matches morphine continuous", () => {
    const p = makePatient({ tasks: [makeTask("morphine continuous 2mg/hr")] });
    const matches = matchIVProtocols(p);
    expect(matches.some(m => m.protocolId === "morphine" && m.tier === "active")).toBe(true);
  });

  it("matches מורפין IV (Hebrew)", () => {
    const p = makePatient({ tasks: [makeTask("מורפין IV pump")] });
    expect(matchIVProtocols(p).some(m => m.protocolId === "morphine")).toBe(true);
  });

  // ── Dormicum/Midazolam ──
  it("matches midazolam drip", () => {
    const p = makePatient({ tasks: [makeTask("midazolam drip 2mg/hr")] });
    const matches = matchIVProtocols(p);
    expect(matches.some(m => m.protocolId === "dormicum" && m.tier === "active")).toBe(true);
  });

  it("matches דורמיקום (Hebrew)", () => {
    const p = makePatient({ tasks: [makeTask("דורמיקום gtt")] });
    expect(matchIVProtocols(p).some(m => m.protocolId === "dormicum")).toBe(true);
  });

  // ── Amiodarone ──
  it("matches amiodarone loading", () => {
    const p = makePatient({ tasks: [makeTask("amiodarone load 300mg")] });
    const matches = matchIVProtocols(p);
    expect(matches.some(m => m.protocolId === "amiodarone" && m.tier === "active")).toBe(true);
  });

  it("matches cordarone (brand)", () => {
    const p = makePatient({ status: ["Cordarone drip"] });
    expect(matchIVProtocols(p).some(m => m.protocolId === "amiodarone")).toBe(true);
  });

  it("matches פרוקור (Hebrew brand)", () => {
    const p = makePatient({ tasks: [makeTask("פרוקור IV")] });
    expect(matchIVProtocols(p).some(m => m.protocolId === "amiodarone")).toBe(true);
  });

  // ── Lidocaine ──
  it("matches lidocaine IV drip", () => {
    const p = makePatient({ tasks: [makeTask("lidocaine drip 2mg/min")] });
    const matches = matchIVProtocols(p);
    expect(matches.some(m => m.protocolId === "lidocaine" && m.tier === "active")).toBe(true);
  });

  it("matches לידוקאין IV (Hebrew)", () => {
    const p = makePatient({ tasks: [makeTask("לידוקאין IV bolus")] });
    expect(matchIVProtocols(p).some(m => m.protocolId === "lidocaine")).toBe(true);
  });

  // ── Magnesium ──
  it("matches MgSO4 (abbreviation)", () => {
    const p = makePatient({ tasks: [makeTask("MgSO4 2g IV")] });
    const matches = matchIVProtocols(p);
    expect(matches.some(m => m.protocolId === "magnesium" && m.tier === "active")).toBe(true);
  });

  it("suggests magnesium for torsade (context pattern)", () => {
    const p = makePatient({ diagnosis: "torsade de pointes" });
    const matches = matchIVProtocols(p);
    expect(matches.some(m => m.protocolId === "magnesium" && m.tier === "suggest")).toBe(true);
  });

  // ── K-Phosphate ──
  it("matches potassium phosphate IV", () => {
    const p = makePatient({ tasks: [makeTask("potassium phosphate 15mmol IV")] });
    const matches = matchIVProtocols(p);
    expect(matches.some(m => m.protocolId === "kphosphate" && m.tier === "active")).toBe(true);
  });

  it("matches אשלגן זרחתי (Hebrew)", () => {
    const p = makePatient({ tasks: [makeTask("אשלגן זרחתי IV")] });
    expect(matchIVProtocols(p).some(m => m.protocolId === "kphosphate")).toBe(true);
  });

  it("suggests K-Phosphate for hypophosphatemia (context)", () => {
    const p = makePatient({ diagnosis: "hypophosphatemia" });
    const matches = matchIVProtocols(p);
    expect(matches.some(m => m.protocolId === "kphosphate" && m.tier === "suggest")).toBe(true);
  });
});

describe("matchIVProtocols — tier logic", () => {
  it("active tier wins over suggest when both match", () => {
    const p = makePatient({
      diagnosis: "DKA",
      tasks: [makeTask("אינסולין IV drip")],
    });
    const matches = matchIVProtocols(p);
    const insulin = matches.find(m => m.protocolId === "insulin");
    expect(insulin).toBeDefined();
    expect(insulin!.tier).toBe("active");
  });

  it("deduplicates — same protocol not returned twice", () => {
    const p = makePatient({
      diagnosis: "septic shock",
      tasks: [makeTask("noradrenaline gtt 0.1mcg/kg/min")],
    });
    const matches = matchIVProtocols(p);
    const norepi = matches.filter(m => m.protocolId === "noradrenaline");
    expect(norepi).toHaveLength(1);
    expect(norepi[0].tier).toBe("active");
  });

  it("returns empty for patient with no relevant text", () => {
    const p = makePatient({});
    expect(matchIVProtocols(p)).toHaveLength(0);
  });

  it("highRisk flag is set correctly for insulin", () => {
    const p = makePatient({ tasks: [makeTask("insulin IV drip")] });
    const match = matchIVProtocols(p).find(m => m.protocolId === "insulin");
    expect(match?.highRisk).toBe(true);
  });

  it("highRisk is false for lidocaine", () => {
    const p = makePatient({ tasks: [makeTask("lidocaine IV drip")] });
    const match = matchIVProtocols(p).find(m => m.protocolId === "lidocaine");
    expect(match?.highRisk).toBe(false);
  });

  it("trigger field contains matched text", () => {
    const p = makePatient({ tasks: [makeTask("heparin gtt 1000u/hr")] });
    const match = matchIVProtocols(p).find(m => m.protocolId === "heparin");
    expect(match?.trigger).toContain("heparin");
  });
});

describe("matchIVProtocols — searches all text fields", () => {
  it("matches drugs in notes", () => {
    const p = makePatient({ notes: ["dopamine drip started"] });
    expect(matchIVProtocols(p).some(m => m.protocolId === "dopamine")).toBe(true);
  });

  it("matches drugs in tomorrowNotes", () => {
    const p = makePatient({ tomorrowNotes: ["start heparin gtt"] });
    expect(matchIVProtocols(p).some(m => m.protocolId === "heparin")).toBe(true);
  });

  it("matches drugs in generatedTasks", () => {
    const p = makePatient({
      generatedTasks: [{
        id: "gt-1",
        text: "noradrenaline infusion",
        urgency: "stat" as const,
        source: "generated" as const,
        done: false,
        doneTime: null,
        time: null,
        confidence: 1,
      }],
    });
    expect(matchIVProtocols(p).some(m => m.protocolId === "noradrenaline")).toBe(true);
  });
});

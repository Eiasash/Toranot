import { describe, it, expect } from "vitest";
import { matchIVProtocols } from "../engine/ivProtocolMatch";
import type { PatientEntry } from "../types";

function makePatient(overrides: Partial<PatientEntry> = {}): PatientEntry {
  return {
    id: "test-1",
    section: "SIDE_A",
    date: "01/01/2026",
    room: "49/1",
    name: "Test Patient",
    age: 82,
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

function makeTask(text: string) {
  return {
    id: "t1",
    text,
    urgency: "routine" as const,
    source: "extracted" as const,
    done: false,
    doneTime: null,
    time: null,
    confidence: 1,
  };
}

describe("matchIVProtocols — tier system", () => {
  // ── Empty / no match ──
  it("returns empty for patient with no relevant data", () => {
    expect(matchIVProtocols(makePatient({ diagnosis: "UTI" }))).toEqual([]);
  });

  // ═══════════════════════════════════════════════
  //  TIER: ACTIVE — drug explicitly in tasks/status
  // ═══════════════════════════════════════════════

  it("active: insulin gtt in task text", () => {
    const p = makePatient({ tasks: [makeTask("אינסולין מתמשך IV")] });
    const m = matchIVProtocols(p);
    expect(m).toHaveLength(1);
    expect(m[0].protocolId).toBe("insulin");
    expect(m[0].tier).toBe("active");
    expect(m[0].highRisk).toBe(true);
  });

  it("active: actrapid drip", () => {
    const p = makePatient({ tasks: [makeTask("Actrapid gtt 2cc/hr")] });
    const m = matchIVProtocols(p);
    expect(m[0].tier).toBe("active");
    expect(m[0].protocolId).toBe("insulin");
  });

  it("active: noradrenaline in status", () => {
    const p = makePatient({ status: ["על נוראדרנלין"] });
    const m = matchIVProtocols(p);
    expect(m).toHaveLength(1);
    expect(m[0].protocolId).toBe("noradrenaline");
    expect(m[0].tier).toBe("active");
  });

  it("active: vasopressor in flags", () => {
    const p = makePatient({ flags: ["vasopressor"] });
    const m = matchIVProtocols(p).find((x) => x.protocolId === "noradrenaline")!;
    expect(m.tier).toBe("active");
  });

  it("active: heparin gtt in tasks", () => {
    const p = makePatient({ tasks: [makeTask("heparin gtt per protocol")] });
    const m = matchIVProtocols(p).find((x) => x.protocolId === "heparin")!;
    expect(m.tier).toBe("active");
    expect(m.actions.some((a) => a.includes("aPTT"))).toBe(true);
  });

  it("active: UFH in handover note", () => {
    const p = makePatient({ handoverNote: "started UFH 18u/kg/hr" });
    expect(matchIVProtocols(p).find((x) => x.protocolId === "heparin")!.tier).toBe("active");
  });

  it("active: propofol in status", () => {
    const p = makePatient({ status: ["propofol 30 mcg/kg/min"] });
    const m = matchIVProtocols(p).find((x) => x.protocolId === "propofol")!;
    expect(m.tier).toBe("active");
    expect(m.actions.some((a) => a.includes("PRIS"))).toBe(true);
  });

  it("active: fentanyl infusion in tasks", () => {
    const p = makePatient({ tasks: [makeTask("fentanyl gtt 30mcg/hr")] });
    expect(matchIVProtocols(p).find((x) => x.protocolId === "fentanyl")!.tier).toBe("active");
  });

  it("active: morphine IV pump", () => {
    const p = makePatient({ status: ["morphine IV pump 2mg/hr"] });
    expect(matchIVProtocols(p).find((x) => x.protocolId === "morphine")!.tier).toBe("active");
  });

  it("active: דורמיקום IV", () => {
    const p = makePatient({ status: ["דורמיקום IV 3mg/hr"] });
    expect(matchIVProtocols(p).find((x) => x.protocolId === "dormicum")!.tier).toBe("active");
  });

  it("active: midazolam gtt", () => {
    const p = makePatient({ tasks: [makeTask("midazolam gtt per sedation protocol")] });
    expect(matchIVProtocols(p).find((x) => x.protocolId === "dormicum")!.tier).toBe("active");
  });

  it("active: amiodarone IV load", () => {
    const p = makePatient({ tasks: [makeTask("amiodarone IV load 300mg")] });
    expect(matchIVProtocols(p).find((x) => x.protocolId === "amiodarone")!.tier).toBe("active");
  });

  it("active: פרוקור in status", () => {
    const p = makePatient({ status: ["פרוקור 900mg/24hr"] });
    expect(matchIVProtocols(p).find((x) => x.protocolId === "amiodarone")!.tier).toBe("active");
  });

  it("active: lidocaine gtt", () => {
    const p = makePatient({ tasks: [makeTask("lidocaine drip 2mg/min")] });
    const m = matchIVProtocols(p).find((x) => x.protocolId === "lidocaine")!;
    expect(m.tier).toBe("active");
    expect(m.highRisk).toBe(false);
  });

  it("active: MgSO4 IV replacement", () => {
    const p = makePatient({ tasks: [makeTask("magnesium sulfate 2g IV")] });
    expect(matchIVProtocols(p).find((x) => x.protocolId === "magnesium")!.tier).toBe("active");
  });

  it("active: potassium phosphate IV", () => {
    const p = makePatient({ tasks: [makeTask("potassium phosphate 15mmol IV")] });
    expect(matchIVProtocols(p).find((x) => x.protocolId === "kphosphate")!.tier).toBe("active");
  });

  it("active: dopamine drip", () => {
    const p = makePatient({ tasks: [makeTask("dopamine IV 5mcg/kg/min")] });
    expect(matchIVProtocols(p).find((x) => x.protocolId === "dopamine")!.tier).toBe("active");
  });

  it("active: from manual notes", () => {
    const p = makePatient({ notes: ["started heparin drip at 22:00"] });
    expect(matchIVProtocols(p).find((x) => x.protocolId === "heparin")!.tier).toBe("active");
  });

  it("active: from tomorrowNotes", () => {
    const p = makePatient({ tomorrowNotes: ["להתחיל אמיודרון IV loading"] });
    expect(matchIVProtocols(p).find((x) => x.protocolId === "amiodarone")!.tier).toBe("active");
  });

  // ═══════════════════════════════════════════════
  //  TIER: SUGGEST — diagnosis context only
  // ═══════════════════════════════════════════════

  it("suggest: DKA in diagnosis → insulin suggestion, NOT active", () => {
    const p = makePatient({ diagnosis: "DKA, T2DM" });
    const m = matchIVProtocols(p).find((x) => x.protocolId === "insulin")!;
    expect(m.tier).toBe("suggest");
  });

  it("suggest: septic shock in diagnosis → norepi suggestion, NOT active", () => {
    const p = makePatient({ diagnosis: "Septic shock, E. coli bacteremia" });
    const m = matchIVProtocols(p).find((x) => x.protocolId === "noradrenaline")!;
    expect(m.tier).toBe("suggest");
  });

  it("suggest: hemodynamic instability in diagnosis → suggestion", () => {
    const p = makePatient({ diagnosis: "hemodynamic instability post-surgery" });
    const m = matchIVProtocols(p).find((x) => x.protocolId === "noradrenaline")!;
    expect(m.tier).toBe("suggest");
  });

  it("suggest: hypomagnesemia in diagnosis", () => {
    const p = makePatient({ diagnosis: "hypomagnesemia, refractory hypokalemia" });
    const m = matchIVProtocols(p).find((x) => x.protocolId === "magnesium")!;
    expect(m.tier).toBe("suggest");
  });

  it("suggest: hypophosphatemia in diagnosis", () => {
    const p = makePatient({ diagnosis: "hypophosphatemia, refeeding" });
    const m = matchIVProtocols(p).find((x) => x.protocolId === "kphosphate")!;
    expect(m.tier).toBe("suggest");
  });

  it("suggest: torsades in diagnosis", () => {
    const p = makePatient({ diagnosis: "torsade de pointes" });
    const m = matchIVProtocols(p).find((x) => x.protocolId === "magnesium")!;
    expect(m.tier).toBe("suggest");
  });

  it("suggest: glucose uncontrolled in status → suggestion not active", () => {
    const p = makePatient({ status: ["glucose uncontrolled >300"] });
    const m = matchIVProtocols(p).find((x) => x.protocolId === "insulin")!;
    expect(m.tier).toBe("suggest");
  });

  // ═══════════════════════════════════════════════
  //  ACTIVE wins over SUGGEST (dedup)
  // ═══════════════════════════════════════════════

  it("active wins: septic shock in diagnosis + noradrenaline in tasks → active", () => {
    const p = makePatient({
      diagnosis: "Septic shock",
      tasks: [makeTask("נוראדרנלין 0.1mcg/kg/min")],
    });
    const norepi = matchIVProtocols(p).filter((x) => x.protocolId === "noradrenaline");
    expect(norepi).toHaveLength(1);
    expect(norepi[0].tier).toBe("active");
  });

  it("active wins: DKA in diagnosis + actrapid gtt in status → active", () => {
    const p = makePatient({
      diagnosis: "DKA",
      status: ["actrapid gtt 2cc/hr"],
    });
    const insulin = matchIVProtocols(p).filter((x) => x.protocolId === "insulin");
    expect(insulin).toHaveLength(1);
    expect(insulin[0].tier).toBe("active");
  });

  // ═══════════════════════════════════════════════
  //  MIXED: active + suggest on same patient
  // ═══════════════════════════════════════════════

  it("mixed: explicit heparin (active) + septic shock (suggest norepi)", () => {
    const p = makePatient({
      diagnosis: "Septic shock, E. coli",
      tasks: [makeTask("heparin gtt per protocol")],
    });
    const m = matchIVProtocols(p);
    const hep = m.find((x) => x.protocolId === "heparin")!;
    const nor = m.find((x) => x.protocolId === "noradrenaline")!;
    expect(hep.tier).toBe("active");
    expect(nor.tier).toBe("suggest");
  });

  // ═══════════════════════════════════════════════
  //  MULTI-DRUG complex patient
  // ═══════════════════════════════════════════════

  it("complex patient: multiple active + suggest", () => {
    const p = makePatient({
      diagnosis: "septic shock, hypophosphatemia",
      status: ["propofol sedation"],
      tasks: [makeTask("heparin gtt per protocol"), makeTask("fentanyl gtt 20mcg/hr")],
    });
    const m = matchIVProtocols(p);
    const byId = Object.fromEntries(m.map((x) => [x.protocolId, x]));

    expect(byId["propofol"].tier).toBe("active");
    expect(byId["heparin"].tier).toBe("active");
    expect(byId["fentanyl"].tier).toBe("active");
    expect(byId["noradrenaline"].tier).toBe("suggest");
    expect(byId["kphosphate"].tier).toBe("suggest");
  });

  // ═══════════════════════════════════════════════
  //  DEDUPLICATION
  // ═══════════════════════════════════════════════

  it("no duplicates when same drug in multiple fields", () => {
    const p = makePatient({
      diagnosis: "DKA",
      tasks: [makeTask("insulin gtt per protocol")],
      status: ["אינסולין IV"],
      handoverNote: "started actrapid drip at 14:00",
    });
    const insulin = matchIVProtocols(p).filter((x) => x.protocolId === "insulin");
    expect(insulin).toHaveLength(1);
    expect(insulin[0].tier).toBe("active"); // active wins
  });

  // ═══════════════════════════════════════════════
  //  NO FALSE POSITIVES
  // ═══════════════════════════════════════════════

  it("does NOT match fentanyl patch (oral/transdermal)", () => {
    const p = makePatient({ tasks: [makeTask("fentanyl patch 25mcg")] });
    expect(matchIVProtocols(p).some((x) => x.protocolId === "fentanyl")).toBe(false);
  });

  it("does NOT match oral morphine", () => {
    const p = makePatient({ tasks: [makeTask("morphine PO 10mg q6h")] });
    expect(matchIVProtocols(p).some((x) => x.protocolId === "morphine")).toBe(false);
  });

  it("does NOT match oral midazolam", () => {
    const p = makePatient({ tasks: [makeTask("midazolam 7.5mg PO hs")] });
    expect(matchIVProtocols(p).some((x) => x.protocolId === "dormicum")).toBe(false);
  });

  // ═══════════════════════════════════════════════
  //  TRIGGER STRING
  // ═══════════════════════════════════════════════

  it("captures the matched trigger string", () => {
    const p = makePatient({ tasks: [makeTask("UFH 18u/kg bolus then gtt")] });
    expect(matchIVProtocols(p).find((x) => x.protocolId === "heparin")!.trigger).toBe("UFH");
  });

  it("captures context trigger for suggest tier", () => {
    const p = makePatient({ diagnosis: "septic shock" });
    expect(matchIVProtocols(p).find((x) => x.protocolId === "noradrenaline")!.trigger).toBe("septic shock");
  });

  // ═══════════════════════════════════════════════
  //  PROTOCOLS WITHOUT CONTEXT PATTERN
  // ═══════════════════════════════════════════════

  it("propofol has no context pattern — never suggest-only", () => {
    const p = makePatient({ diagnosis: "respiratory failure, intubated, ventilated" });
    // "ventilated" doesn't match propofol — only explicit drug name does
    expect(matchIVProtocols(p).some((x) => x.protocolId === "propofol")).toBe(false);
  });

  it("dopamine has no context pattern — only explicit", () => {
    const p = makePatient({ diagnosis: "symptomatic bradycardia" });
    expect(matchIVProtocols(p).some((x) => x.protocolId === "dopamine")).toBe(false);
  });
});

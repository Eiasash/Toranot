/**
 * Extended drug safety tests — brand names, edge cases, multi-interaction
 * deduplication, and cross-field detection.
 */

import { describe, it, expect } from "vitest";
import {
  checkDrugInteractions,
  calculateCrCl,
  checkRenalDoseWarnings,
  checkBeersCriteria,
  extractAntibioticsFromPlan,
} from "../engine/drugSafety";
import type { PatientEntry } from "../types";

function makePatient(overrides: Partial<PatientEntry> = {}): PatientEntry {
  return {
    id: "test-pt",
    section: "SIDE_A",
    date: "01/01/2025",
    room: "101",
    name: "Test Patient",
    age: "age" in overrides ? overrides.age! : 80,
    diagnosis: overrides.diagnosis ?? null,
    flags: overrides.flags ?? [],
    status: overrides.status ?? [],
    tomorrowNotes: [],
    tasks: overrides.tasks ?? [],
    generatedTasks: overrides.generatedTasks ?? [],
    notes: overrides.notes ?? [],
    planNotes: overrides.planNotes ?? [],
    scannedAt: new Date().toISOString(),
    confidence: 1,
    labs: overrides.labs ?? [],
  };
}

function makeTask(text: string, id?: string) {
  return {
    id: id ?? `t-${Math.random().toString(36).slice(2, 6)}`,
    text,
    urgency: "routine" as const,
    source: "extracted" as const,
    done: false,
    doneTime: null,
    time: null,
    confidence: 1,
  };
}

// ═════════════════════════════════════════════════════════════
// Brand name matching for drug interactions
// ═════════════════════════════════════════════════════════════

describe("checkDrugInteractions — brand names", () => {
  it("detects QT risk: Cordarone (amiodarone brand) + cipro", () => {
    const p = makePatient({
      tasks: [makeTask("Cordarone 200mg"), makeTask("ciprofloxacin 500mg")],
    });
    const result = checkDrugInteractions(p);
    expect(result.some(i => i.drugA === "amiodarone" && i.severity === "critical")).toBe(true);
  });

  it("detects bleeding: Coumadin (warfarin brand) + Voltaren (NSAID brand)", () => {
    const p = makePatient({
      tasks: [makeTask("Coumadin 5mg"), makeTask("Voltaren gel")],
    });
    const result = checkDrugInteractions(p);
    expect(result.some(i => i.drugA === "warfarin" && i.drugB === "nsaid")).toBe(true);
  });

  it("detects bleeding: Eliquis (apixaban brand) + Advil (NSAID brand)", () => {
    const p = makePatient({
      tasks: [makeTask("Eliquis 5mg BID"), makeTask("Advil 200mg PRN")],
    });
    const result = checkDrugInteractions(p);
    expect(result.some(i => i.drugA === "apixaban" && i.drugB === "nsaid")).toBe(true);
  });

  it("detects bleeding: Xarelto (rivaroxaban brand) + ibuprofen", () => {
    const p = makePatient({
      status: ["Xarelto 20mg daily", "ibuprofen PRN for pain"],
    });
    const result = checkDrugInteractions(p);
    expect(result.some(i => i.drugA === "rivaroxaban" && i.drugB === "nsaid")).toBe(true);
  });

  it("detects Plavix (clopidogrel brand) + NSAID", () => {
    const p = makePatient({
      tasks: [makeTask("Plavix 75mg"), makeTask("Nurofen 400mg PRN")],
    });
    const result = checkDrugInteractions(p);
    expect(result.some(i => i.drugA === "clopidogrel" && i.drugB === "nsaid")).toBe(true);
  });

  it("detects Tegretol (carbamazepine brand) + warfarin", () => {
    const p = makePatient({
      tasks: [makeTask("Tegretol 200mg BID"), makeTask("warfarin 5mg")],
    });
    const result = checkDrugInteractions(p);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it("detects Haldol (haloperidol brand) + Zofran (ondansetron brand)", () => {
    const p = makePatient({
      tasks: [makeTask("Haldol 2.5mg PRN"), makeTask("Zofran 4mg PRN")],
    });
    const result = checkDrugInteractions(p);
    expect(result.some(i => i.drugA === "haloperidol" && i.drugB === "ondansetron")).toBe(true);
  });

  it("detects Hebrew brand names: קומדין + דיקלופנק", () => {
    const p = makePatient({
      status: ["קומדין 5mg", "דיקלופנק ג'ל"],
    });
    const result = checkDrugInteractions(p);
    expect(result.some(i => i.drugA === "warfarin" && i.drugB === "nsaid")).toBe(true);
  });

  it("detects Cipralex (escitalopram brand) + ondansetron QT risk", () => {
    const p = makePatient({
      tasks: [makeTask("Cipralex 10mg"), makeTask("ondansetron 4mg PRN")],
    });
    const result = checkDrugInteractions(p);
    expect(result.some(i => i.drugA === "escitalopram" && i.drugB === "ondansetron")).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════
// Multi-interaction (5+ drugs on one patient)
// ═════════════════════════════════════════════════════════════

describe("checkDrugInteractions — multi-drug scenarios", () => {
  it("detects multiple interactions from a heavily medicated patient", () => {
    const p = makePatient({
      tasks: [
        makeTask("amiodarone 200mg"),
        makeTask("ciprofloxacin 500mg"),
        makeTask("warfarin 5mg"),
        makeTask("ibuprofen 400mg"),
        makeTask("digoxin 0.125mg"),
      ],
    });
    const result = checkDrugInteractions(p);
    // Should detect at least: amiodarone+cipro (QT), warfarin+nsaid (bleed),
    // amiodarone+digoxin (toxicity), warfarin+?
    expect(result.length).toBeGreaterThanOrEqual(3);
    // Results should be sorted by severity (critical first)
    const sevOrder = { critical: 0, major: 1, moderate: 2 };
    for (let i = 1; i < result.length; i++) {
      expect(sevOrder[result[i].severity]).toBeGreaterThanOrEqual(sevOrder[result[i - 1].severity]);
    }
  });

  it("no duplicate interaction pairs", () => {
    const p = makePatient({
      tasks: [
        makeTask("amiodarone 200mg"),
        makeTask("haloperidol 5mg"),
        makeTask("ondansetron 4mg"),
        makeTask("ciprofloxacin 500mg"),
      ],
    });
    const result = checkDrugInteractions(p);
    // Check no duplicate drug pairs (A+B should only appear once)
    const pairKeys = result.map(i => [i.drugA, i.drugB].sort().join("+"));
    const uniquePairs = new Set(pairKeys);
    expect(uniquePairs.size).toBe(pairKeys.length);
  });
});

// ═════════════════════════════════════════════════════════════
// calculateCrCl edge cases
// ═════════════════════════════════════════════════════════════

describe("calculateCrCl — additional edge cases", () => {
  it("returns null for zero creatinine", () => {
    expect(calculateCrCl(80, 0)).toBeNull();
  });

  it("returns null for negative creatinine", () => {
    expect(calculateCrCl(80, -1.5)).toBeNull();
  });

  it("returns null for null age", () => {
    expect(calculateCrCl(null, 1.0)).toBeNull();
  });

  it("returns null for null creatinine", () => {
    expect(calculateCrCl(70, null)).toBeNull();
  });

  it("handles very high creatinine (CKD5)", () => {
    const result = calculateCrCl(70, 8.0, 70, false);
    // (140-70)*70/(72*8) = 4900/576 ≈ 8.5 → rounded to 9 or 8
    expect(result).toBeLessThan(10);
    expect(result).toBeGreaterThan(0);
  });

  it("handles very low creatinine in young patient (no floor)", () => {
    const result = calculateCrCl(30, 0.3, 70, false);
    // (140-30)*70/(72*0.3) = 7700/21.6 ≈ 356
    expect(result).toBeGreaterThan(300);
  });
});

// ═════════════════════════════════════════════════════════════
// checkRenalDoseWarnings — brand names + edge cases
// ═════════════════════════════════════════════════════════════

describe("checkRenalDoseWarnings — brand names", () => {
  it("flags Clexane (enoxaparin brand) with low CrCl", () => {
    const p = makePatient({
      age: 85,
      tasks: [makeTask("Clexane 40mg SC")],
      labs: [{ id: "l1", label: "Cr", value: 2.5, time: new Date().toISOString() }],
    });
    const warnings = checkRenalDoseWarnings(p);
    expect(warnings.some(w => w.drug === "Enoxaparin")).toBe(true);
  });

  it("flags Glucophage (metformin brand) with low CrCl", () => {
    const p = makePatient({
      age: 85,
      tasks: [makeTask("Glucophage 500mg BID")],
      labs: [{ id: "l1", label: "Cr", value: 3.0, time: new Date().toISOString() }],
    });
    const warnings = checkRenalDoseWarnings(p);
    expect(warnings.some(w => w.drug === "Metformin")).toBe(true);
  });

  it("no warnings when patient is young with normal CrCl", () => {
    const p = makePatient({
      age: 40,
      tasks: [makeTask("enoxaparin 40mg SC")],
      labs: [{ id: "l1", label: "Cr", value: 0.8, time: new Date().toISOString() }],
    });
    const warnings = checkRenalDoseWarnings(p);
    expect(warnings).toEqual([]);
  });

  it("no warnings without any renally-cleared drugs", () => {
    const p = makePatient({
      age: 85,
      tasks: [makeTask("paracetamol 1g"), makeTask("ondansetron 4mg")],
      labs: [{ id: "l1", label: "Cr", value: 3.0, time: new Date().toISOString() }],
    });
    expect(checkRenalDoseWarnings(p)).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════
// checkBeersCriteria — edge cases
// ═════════════════════════════════════════════════════════════

describe("checkBeersCriteria — edge cases", () => {
  it("returns empty for exactly age 64 (below threshold)", () => {
    const p = makePatient({
      age: 64,
      tasks: [makeTask("zolpidem 10mg")],
    });
    expect(checkBeersCriteria(p)).toEqual([]);
  });

  it("triggers at exactly age 65 (boundary)", () => {
    const p = makePatient({
      age: 65,
      tasks: [makeTask("zolpidem 10mg")],
    });
    const result = checkBeersCriteria(p);
    expect(result.find(r => r.drug.includes("Zolpidem"))).toBeDefined();
  });

  it("flags Stilnox (zolpidem brand) via status field", () => {
    const p = makePatient({
      age: 80,
      status: ["stilnox 5mg HS"],
    });
    const result = checkBeersCriteria(p);
    expect(result.find(r => r.drug.includes("Zolpidem"))).toBeDefined();
  });

  it("flags multiple Beers drugs simultaneously", () => {
    const p = makePatient({
      age: 80,
      tasks: [
        makeTask("zolpidem 5mg"),
        makeTask("lorazepam 1mg"),
        makeTask("amitriptyline 25mg"),
        makeTask("hydroxyzine 25mg"),
      ],
    });
    const result = checkBeersCriteria(p);
    // Should flag zolpidem, benzo, TCA, and antihistamine
    expect(result.length).toBeGreaterThanOrEqual(4);
  });

  it("does not flag second-gen antihistamines (cetirizine)", () => {
    const p = makePatient({
      age: 80,
      tasks: [makeTask("cetirizine 10mg")],
    });
    const result = checkBeersCriteria(p);
    expect(result.find(r => r.drug.includes("אנטי-היסטמין"))).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════
// extractAntibioticsFromPlan — additional patterns
// ═════════════════════════════════════════════════════════════

describe("extractAntibioticsFromPlan — additional patterns", () => {
  it("recognises Tazocin as piperacillin/tazobactam", () => {
    expect(extractAntibioticsFromPlan("Tazocin 4.5g IV q6h")).toEqual(["piperacillin/tazobactam"]);
  });

  it("recognises pip/tazo shorthand", () => {
    expect(extractAntibioticsFromPlan("pip-tazo 4.5g")).toEqual(["piperacillin/tazobactam"]);
  });

  it("recognises Rocephin as ceftriaxone", () => {
    expect(extractAntibioticsFromPlan("Rocephin 2g IV daily")).toEqual(["ceftriaxone"]);
  });

  it("recognises Meronem as meropenem", () => {
    expect(extractAntibioticsFromPlan("Meronem 1g q8h")).toEqual(["meropenem"]);
  });

  it("recognises Bactrim as TMP-SMX", () => {
    expect(extractAntibioticsFromPlan("Bactrim DS PO BID")).toEqual(["trimethoprim/sulfamethoxazole"]);
  });

  it("handles mixed brand + generic in same plan", () => {
    const result = extractAntibioticsFromPlan("Tazocin 4.5g + vancomycin 1g + Flagyl 500mg");
    expect(result).toContain("piperacillin/tazobactam");
    expect(result).toContain("vancomycin");
    expect(result).toContain("metronidazole");
  });

  it("handles case-insensitive matching", () => {
    const result = extractAntibioticsFromPlan("CEFTRIAXONE 2g iv daily");
    expect(result).toEqual(["ceftriaxone"]);
  });

  it("does not extract non-antibiotics", () => {
    expect(extractAntibioticsFromPlan("omeprazole 20mg + paracetamol 1g")).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import {
  checkDrugInteractions,
  checkRenalDoseWarnings,
  checkBeersCriteria,
  calculateCrCl,
} from "../engine/drugSafety";
import type { PatientEntry } from "../types";

/** Build a minimal PatientEntry for testing drug safety. */
function makePatient(overrides: {
  age?: number | null;
  tasks?: Array<{ text: string }>;
  generatedTasks?: Array<{ text: string }>;
  status?: string[];
  flags?: string[];
  notes?: string[];
  labs?: Array<{ id: string; label: string; value: number; time: string }>;
}): PatientEntry {
  return {
    id: "test-pt",
    section: "SIDE_A",
    date: "01/01/2025",
    room: "101",
    name: "Test Patient",
    age: overrides.age !== undefined ? overrides.age : 75,
    diagnosis: null,
    flags: overrides.flags ?? [],
    status: overrides.status ?? [],
    tomorrowNotes: [],
    tasks: (overrides.tasks ?? []).map((t, i) => ({
      id: `t-${i}`,
      text: t.text,
      urgency: "routine" as const,
      source: "extracted" as const,
      done: false,
      doneTime: null,
      time: null,
      confidence: 1,
    })),
    generatedTasks: (overrides.generatedTasks ?? []).map((t, i) => ({
      id: `g-${i}`,
      text: t.text,
      urgency: "routine" as const,
      source: "generated" as const,
      done: false,
      doneTime: null,
      time: null,
      confidence: 0.9,
    })),
    notes: overrides.notes ?? [],
    scannedAt: new Date().toISOString(),
    confidence: 1,
    labs: overrides.labs,
  };
}

// ════════════════════════════════════════════════════════════
// 1. DRUG INTERACTION CHECKER
// ════════════════════════════════════════════════════════════

describe("checkDrugInteractions", () => {
  it("returns empty for patient with no drugs", () => {
    const result = checkDrugInteractions(makePatient({}));
    expect(result).toEqual([]);
  });

  it("returns empty for single drug (no interaction possible)", () => {
    const result = checkDrugInteractions(
      makePatient({ tasks: [{ text: "Amiodarone 200mg PO" }] }),
    );
    expect(result).toEqual([]);
  });

  // ── QT prolongation combos ──
  it("detects amiodarone + ciprofloxacin as critical QT risk", () => {
    const result = checkDrugInteractions(
      makePatient({
        tasks: [{ text: "Amiodarone 200mg" }, { text: "Ciprofloxacin 500mg" }],
      }),
    );
    expect(result.length).toBeGreaterThan(0);
    const qt = result.find((i) => i.drugA === "amiodarone" && i.drugB === "ciprofloxacin");
    expect(qt).toBeDefined();
    expect(qt!.severity).toBe("critical");
  });

  it("detects amiodarone + haloperidol as critical QT risk", () => {
    const result = checkDrugInteractions(
      makePatient({
        tasks: [{ text: "קורדרון" }, { text: "הלופרידול 0.5mg" }],
      }),
    );
    const qt = result.find((i) => i.drugA === "amiodarone" && i.drugB === "haloperidol");
    expect(qt).toBeDefined();
    expect(qt!.severity).toBe("critical");
  });

  it("detects haloperidol + ondansetron as major QT risk", () => {
    const result = checkDrugInteractions(
      makePatient({
        status: ["haloperidol 1mg", "ondansetron 4mg"],
      }),
    );
    const qt = result.find((i) => i.drugA === "haloperidol" && i.drugB === "ondansetron");
    expect(qt).toBeDefined();
    expect(qt!.severity).toBe("major");
  });

  // ── Bleeding risk ──
  it("detects warfarin + NSAID as critical bleeding risk", () => {
    const result = checkDrugInteractions(
      makePatient({
        tasks: [{ text: "Warfarin 5mg" }, { text: "Ibuprofen 400mg" }],
      }),
    );
    const bleed = result.find((i) => i.drugA === "warfarin" && i.drugB === "nsaid");
    expect(bleed).toBeDefined();
    expect(bleed!.severity).toBe("critical");
  });

  it("detects apixaban + NSAID as critical bleeding risk", () => {
    const result = checkDrugInteractions(
      makePatient({
        tasks: [{ text: "Eliquis 5mg" }, { text: "Diclofenac 50mg" }],
      }),
    );
    const bleed = result.find((i) => i.drugA === "apixaban" && i.drugB === "nsaid");
    expect(bleed).toBeDefined();
    expect(bleed!.severity).toBe("critical");
  });

  it("detects warfarin + fluconazole as critical INR risk", () => {
    const result = checkDrugInteractions(
      makePatient({
        tasks: [{ text: "Coumadin 3mg" }, { text: "Diflucan 200mg" }],
      }),
    );
    expect(result.some((i) => i.drugA === "warfarin" && i.drugB === "fluconazole")).toBe(true);
  });

  // ── Hyperkalemia ──
  it("detects spironolactone + potassium as critical hyperkalemia", () => {
    const result = checkDrugInteractions(
      makePatient({
        tasks: [{ text: "Spironolactone 25mg" }, { text: "KCl 40mEq" }],
      }),
    );
    const hk = result.find((i) => i.drugA === "spironolactone" && i.drugB === "potassium");
    expect(hk).toBeDefined();
    expect(hk!.severity).toBe("critical");
  });

  it("detects ACEi + spironolactone as hyperkalemia risk", () => {
    const result = checkDrugInteractions(
      makePatient({
        tasks: [{ text: "Enalapril 10mg" }, { text: "Aldactone 25mg" }],
      }),
    );
    expect(result.some((i) => i.drugA === "acei" && i.drugB === "spironolactone")).toBe(true);
  });

  // ── Serotonin syndrome ──
  it("detects SSRI + tramadol as serotonin syndrome risk", () => {
    const result = checkDrugInteractions(
      makePatient({
        tasks: [{ text: "Sertraline 50mg" }, { text: "Tramadol 50mg" }],
      }),
    );
    expect(result.some((i) => i.drugA === "ssri" && i.drugB === "tramadol")).toBe(true);
  });

  // ── Respiratory depression ──
  it("detects benzo + opioid as critical respiratory depression risk", () => {
    const result = checkDrugInteractions(
      makePatient({
        tasks: [{ text: "Lorazepam 1mg" }, { text: "Morphine 5mg" }],
      }),
    );
    const resp = result.find((i) => i.drugA === "benzodiazepine" && i.drugB === "opioid");
    expect(resp).toBeDefined();
    expect(resp!.severity).toBe("critical");
  });

  // ── Nephrotoxicity ──
  it("detects gentamicin + vancomycin as nephrotoxicity risk", () => {
    const result = checkDrugInteractions(
      makePatient({
        tasks: [{ text: "Gentamicin 5mg/kg" }, { text: "Vancomycin 1g" }],
      }),
    );
    expect(result.some((i) => i.drugA === "gentamicin" && i.drugB === "vancomycin")).toBe(true);
  });

  // ── Digoxin toxicity ──
  it("detects digoxin + amiodarone as critical toxicity risk", () => {
    const result = checkDrugInteractions(
      makePatient({
        tasks: [{ text: "Digoxin 0.125mg" }, { text: "Amiodarone 200mg" }],
      }),
    );
    const dig = result.find((i) => i.drugA === "digoxin" && i.drugB === "amiodarone");
    expect(dig).toBeDefined();
    expect(dig!.severity).toBe("critical");
  });

  // ── Hebrew drug names ──
  it("detects interactions using Hebrew drug names", () => {
    const result = checkDrugInteractions(
      makePatient({
        tasks: [{ text: "וורפרין 5mg" }, { text: "איבופרופן 400mg" }],
      }),
    );
    expect(result.some((i) => i.severity === "critical")).toBe(true);
  });

  // ── Sorting ──
  it("sorts results with critical first", () => {
    const result = checkDrugInteractions(
      makePatient({
        tasks: [
          { text: "Warfarin 5mg" },
          { text: "Ibuprofen 400mg" },
          { text: "Aspirin 100mg" },
        ],
      }),
    );
    expect(result.length).toBeGreaterThan(1);
    // First should be critical
    expect(result[0].severity).toBe("critical");
  });

  // ── Scans generatedTasks too ──
  it("checks generatedTasks for drug mentions", () => {
    const result = checkDrugInteractions(
      makePatient({
        tasks: [{ text: "Warfarin 5mg" }],
        generatedTasks: [{ text: "ABx — Ciprofloxacin 500mg PO" }],
      }),
    );
    expect(result.some((i) => i.drugA === "warfarin" && i.drugB === "ciprofloxacin")).toBe(true);
  });

  // ── Multiple interactions ──
  it("detects multiple interactions simultaneously", () => {
    const result = checkDrugInteractions(
      makePatient({
        tasks: [
          { text: "Amiodarone 200mg" },
          { text: "Ciprofloxacin 500mg" },
          { text: "Digoxin 0.125mg" },
        ],
      }),
    );
    // Amiodarone+Cipro (QT) and Digoxin+Amiodarone (toxicity)
    expect(result.length).toBeGreaterThanOrEqual(2);
  });
});

// ════════════════════════════════════════════════════════════
// 2. calculateCrCl
// ════════════════════════════════════════════════════════════

describe("calculateCrCl", () => {
  it("returns null if age is null", () => {
    expect(calculateCrCl(null, 1.0)).toBeNull();
  });

  it("returns null if creatinine is null", () => {
    expect(calculateCrCl(70, null)).toBeNull();
  });

  it("returns null if creatinine is 0", () => {
    expect(calculateCrCl(70, 0)).toBeNull();
  });

  it("returns null if creatinine is negative", () => {
    expect(calculateCrCl(70, -1)).toBeNull();
  });

  it("calculates CrCl for 70yo male 70kg Cr=1.0", () => {
    // (140-70)*70*1.0 / (72*1.0) = 4900/72 ≈ 68
    const result = calculateCrCl(70, 1.0, 70, false);
    expect(result).toBe(68);
  });

  it("calculates CrCl for 70yo female 55kg Cr=1.0", () => {
    // (140-70)*55*0.85 / (72*1.0) = 3272.5/72 ≈ 45
    const result = calculateCrCl(70, 1.0, 55, true);
    expect(result).toBe(45);
  });

  it("uses default weight 70kg when not provided", () => {
    const result = calculateCrCl(70, 1.0);
    // (140-70)*70*1.0 / (72*1.0) ≈ 68
    expect(result).toBe(68);
  });

  it("higher Cr → lower CrCl", () => {
    const low = calculateCrCl(80, 2.5, 70, false)!;
    const high = calculateCrCl(80, 1.0, 70, false)!;
    expect(low).toBeLessThan(high);
  });

  it("older age → lower CrCl", () => {
    const old = calculateCrCl(90, 1.0, 70, false)!;
    const young = calculateCrCl(50, 1.0, 70, false)!;
    expect(old).toBeLessThan(young);
  });

  it("female factor reduces CrCl", () => {
    const male = calculateCrCl(70, 1.0, 70, false)!;
    const female = calculateCrCl(70, 1.0, 70, true)!;
    expect(female).toBeLessThan(male);
  });
});

// ════════════════════════════════════════════════════════════
// 3. RENAL DOSE WARNINGS
// ════════════════════════════════════════════════════════════

describe("checkRenalDoseWarnings", () => {
  it("returns empty if no creatinine lab", () => {
    const result = checkRenalDoseWarnings(
      makePatient({ tasks: [{ text: "Enoxaparin 60mg SC" }] }),
    );
    expect(result).toEqual([]);
  });

  it("returns empty if no age", () => {
    const result = checkRenalDoseWarnings(
      makePatient({
        age: null,
        tasks: [{ text: "Enoxaparin 60mg SC" }],
        labs: [{ id: "l1", label: "Cr", value: 2.0, time: "2025-01-01T10:00:00Z" }],
      }),
    );
    expect(result).toEqual([]);
  });

  it("returns empty if no renal drugs in text", () => {
    const result = checkRenalDoseWarnings(
      makePatient({
        tasks: [{ text: "Paracetamol 1g PO" }],
        labs: [{ id: "l1", label: "Cr", value: 3.0, time: "2025-01-01T10:00:00Z" }],
      }),
    );
    expect(result).toEqual([]);
  });

  it("warns for Enoxaparin with low CrCl", () => {
    const result = checkRenalDoseWarnings(
      makePatient({
        age: 85,
        tasks: [{ text: "Enoxaparin 60mg SC q12h" }],
        labs: [{ id: "l1", label: "Cr", value: 2.5, time: "2025-01-01T10:00:00Z" }],
      }),
    );
    expect(result.length).toBeGreaterThan(0);
    const enox = result.find((w) => w.drug === "Enoxaparin");
    expect(enox).toBeDefined();
    expect(enox!.severity).toBe("critical");
  });

  it("warns for Metformin with low CrCl", () => {
    const result = checkRenalDoseWarnings(
      makePatient({
        age: 80,
        tasks: [{ text: "Metformin 850mg PO" }],
        labs: [{ id: "l1", label: "Cr", value: 2.0, time: "2025-01-01T10:00:00Z" }],
      }),
    );
    const met = result.find((w) => w.drug === "Metformin");
    expect(met).toBeDefined();
  });

  it("warns for Gabapentin with moderate renal impairment", () => {
    const result = checkRenalDoseWarnings(
      makePatient({
        age: 75,
        tasks: [{ text: "Gabapentin 300mg TID" }],
        labs: [{ id: "l1", label: "Cr", value: 1.8, time: "2025-01-01T10:00:00Z" }],
      }),
    );
    const gab = result.find((w) => w.drug === "Gabapentin");
    expect(gab).toBeDefined();
  });

  it("uses conservative (lower) CrCl estimate", () => {
    const result = checkRenalDoseWarnings(
      makePatient({
        age: 80,
        tasks: [{ text: "Vancomycin 1g IV" }],
        labs: [{ id: "l1", label: "Cr", value: 1.5, time: "2025-01-01T10:00:00Z" }],
      }),
    );
    const vanc = result.find((w) => w.drug === "Vancomycin");
    expect(vanc).toBeDefined();
    // Conservative CrCl should be the lower of female55kg and male70kg estimates
    expect(vanc!.crclRange.female55kg).toBeLessThanOrEqual(vanc!.crclRange.male70kg);
    expect(vanc!.crcl).toBe(Math.min(vanc!.crclRange.female55kg, vanc!.crclRange.male70kg));
  });

  it("marks weightAssumed as true", () => {
    const result = checkRenalDoseWarnings(
      makePatient({
        age: 80,
        tasks: [{ text: "Digoxin 0.25mg" }],
        labs: [{ id: "l1", label: "Cr", value: 2.0, time: "2025-01-01T10:00:00Z" }],
      }),
    );
    if (result.length > 0) {
      expect(result[0].weightAssumed).toBe(true);
    }
  });

  it("uses latest Cr value when multiple labs present", () => {
    const result = checkRenalDoseWarnings(
      makePatient({
        age: 80,
        tasks: [{ text: "Enoxaparin 60mg" }],
        labs: [
          { id: "l1", label: "Cr", value: 0.8, time: "2025-01-01T08:00:00Z" },
          { id: "l2", label: "Cr", value: 3.0, time: "2025-01-01T16:00:00Z" },
        ],
      }),
    );
    // Should use the latest (Cr=3.0) → very low CrCl → critical
    const enox = result.find((w) => w.drug === "Enoxaparin");
    expect(enox).toBeDefined();
    expect(enox!.severity).toBe("critical");
  });

  it("detects drugs mentioned in Hebrew", () => {
    const result = checkRenalDoseWarnings(
      makePatient({
        age: 85,
        tasks: [{ text: "קלקסן 60mg SC" }],
        labs: [{ id: "l1", label: "Cr", value: 2.5, time: "2025-01-01T10:00:00Z" }],
      }),
    );
    expect(result.some((w) => w.drug === "Enoxaparin")).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════
// 4. BEERS CRITERIA
// ════════════════════════════════════════════════════════════

describe("checkBeersCriteria", () => {
  it("returns empty for patient under 65", () => {
    const result = checkBeersCriteria(
      makePatient({
        age: 60,
        tasks: [{ text: "Zolpidem 10mg" }],
      }),
    );
    expect(result).toEqual([]);
  });

  it("returns empty if age is null", () => {
    const result = checkBeersCriteria(
      makePatient({
        age: null,
        tasks: [{ text: "Zolpidem 10mg" }],
      }),
    );
    expect(result).toEqual([]);
  });

  it("flags Zolpidem for elderly patient", () => {
    const result = checkBeersCriteria(
      makePatient({
        age: 75,
        tasks: [{ text: "Zolpidem 5mg at bedtime" }],
      }),
    );
    const zolp = result.find((b) => b.drug.includes("Zolpidem"));
    expect(zolp).toBeDefined();
    expect(zolp!.severity).toBe("avoid");
  });

  it("flags Benzodiazepine for elderly patient", () => {
    const result = checkBeersCriteria(
      makePatient({
        age: 70,
        tasks: [{ text: "Lorazepam 1mg PO PRN" }],
      }),
    );
    const benzo = result.find((b) => b.drug.includes("Benzodiazepine"));
    expect(benzo).toBeDefined();
    expect(benzo!.severity).toBe("avoid");
  });

  it("flags Tramadol for elderly patient", () => {
    const result = checkBeersCriteria(
      makePatient({
        age: 78,
        tasks: [{ text: "Tramadol 50mg PO" }],
      }),
    );
    expect(result.some((b) => b.drug.includes("Tramadol"))).toBe(true);
  });

  it("flags TCA (Amitriptyline) for elderly patient", () => {
    const result = checkBeersCriteria(
      makePatient({
        age: 72,
        tasks: [{ text: "Amitriptyline 25mg" }],
      }),
    );
    expect(result.some((b) => b.drug.includes("Amitriptyline"))).toBe(true);
  });

  it("flags first-gen antihistamine for elderly", () => {
    const result = checkBeersCriteria(
      makePatient({
        age: 70,
        tasks: [{ text: "Diphenhydramine 50mg" }],
      }),
    );
    expect(result.some((b) => b.drug.includes("Diphenhydramine"))).toBe(true);
  });

  it("flags NSAIDs only for patients ≥75 (age-gated)", () => {
    const under75 = checkBeersCriteria(
      makePatient({
        age: 70,
        tasks: [{ text: "Ibuprofen 400mg" }],
      }),
    );
    expect(under75.some((b) => b.drug.includes("NSAID"))).toBe(false);

    const over75 = checkBeersCriteria(
      makePatient({
        age: 78,
        tasks: [{ text: "Ibuprofen 400mg" }],
      }),
    );
    expect(over75.some((b) => b.drug.includes("NSAID"))).toBe(true);
  });

  it("flags Sulfonylurea for elderly patient", () => {
    const result = checkBeersCriteria(
      makePatient({
        age: 75,
        tasks: [{ text: "Glibenclamide 5mg" }],
      }),
    );
    expect(result.some((b) => b.drug.includes("Sulfonylurea"))).toBe(true);
  });

  it("flags Digoxin with caution (not avoid)", () => {
    const result = checkBeersCriteria(
      makePatient({
        age: 72,
        tasks: [{ text: "Digoxin 0.25mg" }],
      }),
    );
    const dig = result.find((b) => b.drug.includes("Digoxin"));
    expect(dig).toBeDefined();
    expect(dig!.severity).toBe("caution");
  });

  it("flags Haloperidol with caution", () => {
    const result = checkBeersCriteria(
      makePatient({
        age: 80,
        tasks: [{ text: "Haloperidol 0.5mg" }],
      }),
    );
    const halo = result.find((b) => b.drug.includes("Haloperidol"));
    expect(halo).toBeDefined();
    expect(halo!.severity).toBe("caution");
  });

  it("detects drugs in Hebrew text", () => {
    const result = checkBeersCriteria(
      makePatient({
        age: 75,
        tasks: [{ text: "לוראזפם 1mg" }],
      }),
    );
    expect(result.some((b) => b.drug.includes("Benzodiazepine"))).toBe(true);
  });

  it("detects drugs in notes field", () => {
    const result = checkBeersCriteria(
      makePatient({
        age: 75,
        notes: ["takes Zolpidem at home"],
      }),
    );
    expect(result.some((b) => b.drug.includes("Zolpidem"))).toBe(true);
  });

  it("returns multiple Beers alerts for multi-drug patient", () => {
    const result = checkBeersCriteria(
      makePatient({
        age: 80,
        tasks: [
          { text: "Lorazepam 1mg" },
          { text: "Tramadol 50mg" },
          { text: "Digoxin 0.25mg" },
        ],
      }),
    );
    expect(result.length).toBeGreaterThanOrEqual(3);
  });
});

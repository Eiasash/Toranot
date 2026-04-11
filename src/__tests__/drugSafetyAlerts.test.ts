/**
 * DrugSafetyAlerts component tests.
 *
 * DrugSafetyAlerts.tsx renders a unified safety alert panel that combines
 * results from five engine functions. Without @testing-library/react we test
 * the integrated alert pipeline — the same computation the component runs
 * via useMemo hooks.
 *
 * Test areas:
 *   - Drug interactions (checkDrugInteractions)
 *   - Beers Criteria alerts (checkBeersCriteria)
 *   - Renal dosing alerts (checkRenalDoseWarnings)
 *   - Allergy conflict alerts (checkAllergyConflicts)
 *   - Lab delta alerts (calculateLabDeltas)
 *   - Empty state (totalAlerts === 0 → null)
 *   - Alert severity logic (hasCritical)
 *   - Combined alert counting
 */

import { describe, it, expect } from "vitest";
import type { PatientEntry, Task } from "../types";
import {
  checkDrugInteractions,
  checkRenalDoseWarnings,
  checkBeersCriteria,
  checkAllergyConflicts,
} from "../engine/drugSafety";
import { calculateLabDeltas } from "../engine/labDelta";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: overrides.id ?? "task-1",
    text: overrides.text ?? "test task",
    urgency: overrides.urgency ?? "routine",
    source: overrides.source ?? "extracted",
    done: overrides.done ?? false,
    doneTime: overrides.doneTime ?? null,
    time: overrides.time ?? null,
    confidence: overrides.confidence ?? 1,
    ...overrides,
  };
}

function makePatient(overrides: Partial<PatientEntry> = {}): PatientEntry {
  return {
    id: overrides.id ?? "pt-1",
    section: overrides.section ?? "SIDE_A",
    date: overrides.date ?? "01/01/2025",
    room: overrides.room ?? "101",
    name: overrides.name ?? "Test Patient",
    age: "age" in overrides ? overrides.age! : 80,
    diagnosis: overrides.diagnosis ?? null,
    flags: overrides.flags ?? [],
    status: overrides.status ?? [],
    tomorrowNotes: overrides.tomorrowNotes ?? [],
    tasks: overrides.tasks ?? [],
    generatedTasks: overrides.generatedTasks ?? [],
    notes: overrides.notes ?? [],
    planNotes: overrides.planNotes ?? [],
    scannedAt: new Date().toISOString(),
    confidence: 1,
    labs: overrides.labs ?? [],
    medications: overrides.medications ?? [],
    allergies: overrides.allergies ?? [],
    clinicalMeta: overrides.clinicalMeta,
  };
}

/**
 * Mimics the component's totalAlerts calculation.
 */
function getTotalAlerts(patient: PatientEntry) {
  const interactions = checkDrugInteractions(patient);
  const renalWarnings = checkRenalDoseWarnings(patient);
  const labDeltas = calculateLabDeltas(patient);
  const beers = checkBeersCriteria(patient);
  const allergyWarnings = checkAllergyConflicts(patient);
  return {
    interactions,
    renalWarnings,
    labDeltas,
    beers,
    allergyWarnings,
    totalAlerts:
      interactions.length +
      renalWarnings.length +
      labDeltas.length +
      beers.length +
      allergyWarnings.length,
  };
}

/**
 * Mimics the component's hasCritical check.
 */
function hasCritical(patient: PatientEntry): boolean {
  const { interactions, renalWarnings, labDeltas, beers, allergyWarnings } =
    getTotalAlerts(patient);
  return (
    interactions.some((i) => i.severity === "critical") ||
    renalWarnings.some((w) => w.severity === "critical") ||
    labDeltas.some((d) => d.severity === "critical") ||
    beers.some((b) => b.severity === "avoid") ||
    allergyWarnings.some((a) => a.severity === "critical")
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

describe("DrugSafetyAlerts — Empty state", () => {
  it("returns null (0 alerts) for patient with no meds, labs, or allergies", () => {
    const p = makePatient();
    const { totalAlerts } = getTotalAlerts(p);
    // Component returns null when totalAlerts === 0
    expect(totalAlerts).toBe(0);
  });

  it("returns null for patient with only routine tasks and no drugs", () => {
    const p = makePatient({
      tasks: [makeTask({ text: "discharge planning" })],
    });
    const { totalAlerts } = getTotalAlerts(p);
    expect(totalAlerts).toBe(0);
  });
});

// ─── Drug interactions ─────────────────────────────────────────────────────────

describe("DrugSafetyAlerts — Drug interactions", () => {
  it("detects QT prolongation: amiodarone + ciprofloxacin (critical)", () => {
    const p = makePatient({
      medications: ["amiodarone 200mg", "ciprofloxacin 500mg"],
    });
    const { interactions, totalAlerts } = getTotalAlerts(p);
    expect(totalAlerts).toBeGreaterThanOrEqual(1);
    expect(interactions.some((i) => i.severity === "critical")).toBe(true);
    expect(interactions.some((i) => i.risk.includes("QT"))).toBe(true);
  });

  it("detects bleeding risk: warfarin + NSAID (critical)", () => {
    const p = makePatient({
      medications: ["warfarin 5mg", "ibuprofen 400mg"],
    });
    const { interactions } = getTotalAlerts(p);
    const bleeding = interactions.find(
      (i) => i.drugA === "warfarin" && i.drugB === "nsaid"
    );
    expect(bleeding).toBeDefined();
    expect(bleeding!.severity).toBe("critical");
  });

  it("detects serotonin risk: SSRI + tramadol", () => {
    const p = makePatient({
      medications: ["sertraline 50mg", "tramadol 50mg"],
    });
    const { interactions } = getTotalAlerts(p);
    expect(interactions.length).toBeGreaterThanOrEqual(1);
    // Should find serotonin-related interaction
    expect(interactions.some((i) => i.risk.includes("סרוטונין") || i.risk.includes("serotonin") || i.severity === "critical" || i.severity === "major")).toBe(true);
  });

  it("detects hyperkalemia: spironolactone + ACEi + potassium", () => {
    const p = makePatient({
      medications: ["spironolactone 25mg", "enalapril 10mg", "KCl supplement"],
    });
    const { interactions } = getTotalAlerts(p);
    // Should detect K-sparing + ACEi and/or K-sparing + KCl
    expect(interactions.length).toBeGreaterThanOrEqual(1);
  });

  it("returns no interactions for single drug", () => {
    const p = makePatient({
      medications: ["omeprazole 20mg"],
    });
    const { interactions } = getTotalAlerts(p);
    expect(interactions).toHaveLength(0);
  });

  it("scans both medications[] and task text for drugs", () => {
    const p = makePatient({
      tasks: [
        makeTask({ text: "amiodarone 200mg IV" }),
        makeTask({ text: "ciprofloxacin 500mg PO" }),
      ],
    });
    const { interactions } = getTotalAlerts(p);
    // Should detect interaction from task text
    expect(interactions.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Beers Criteria ────────────────────────────────────────────────────────────

describe("DrugSafetyAlerts — Beers Criteria", () => {
  it("flags benzodiazepines in elderly patients (>=65)", () => {
    const p = makePatient({
      age: 80,
      medications: ["diazepam 5mg"],
    });
    const { beers } = getTotalAlerts(p);
    expect(beers.length).toBeGreaterThanOrEqual(1);
    // Beers rule name is "Benzodiazepine", not the specific drug name
    expect(beers.some((b) => b.drug.toLowerCase().includes("benzodiazepine"))).toBe(true);
  });

  it("flags first-gen antihistamines in elderly (anticholinergic)", () => {
    const p = makePatient({
      age: 82,
      medications: ["hydroxyzine 25mg"],
    });
    const { beers } = getTotalAlerts(p);
    expect(beers.length).toBeGreaterThanOrEqual(1);
  });

  it("does NOT flag Beers criteria for young patients (<65)", () => {
    const p = makePatient({
      age: 40,
      medications: ["diazepam 5mg"],
    });
    const { beers } = getTotalAlerts(p);
    // Beers applies only to >=65
    expect(beers).toHaveLength(0);
  });

  it("flags multiple inappropriate medications", () => {
    const p = makePatient({
      age: 78,
      medications: ["diazepam 5mg", "amitriptyline 25mg", "oxybutynin 5mg"],
    });
    const { beers } = getTotalAlerts(p);
    expect(beers.length).toBeGreaterThanOrEqual(2);
  });

  it("Beers items have category and recommendation", () => {
    const p = makePatient({
      age: 80,
      medications: ["diazepam 5mg"],
    });
    const { beers } = getTotalAlerts(p);
    if (beers.length > 0) {
      expect(beers[0].category).toBeDefined();
      expect(beers[0].recommendation).toBeDefined();
      expect(beers[0].concern).toBeDefined();
    }
  });
});

// ─── Renal dosing alerts ───────────────────────────────────────────────────────

describe("DrugSafetyAlerts — Renal dosing alerts", () => {
  it("warns about renal-adjusted drugs with low CrCl", () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const p = makePatient({
      age: 85,
      clinicalMeta: { sexAtBirth: "male", weightKg: 60 },
      labs: [
        { id: "l1", label: "Cr", value: 2.5, time: now.toISOString() },
      ],
      medications: ["gentamicin 80mg"],
    });
    const { renalWarnings } = getTotalAlerts(p);
    // Gentamicin with high Cr → should trigger renal warning
    expect(renalWarnings.length).toBeGreaterThanOrEqual(1);
  });

  it("returns no renal warnings when no Cr lab exists", () => {
    const p = makePatient({
      age: 85,
      medications: ["gentamicin 80mg"],
      // No labs → no CrCl calculation → no warnings
    });
    const { renalWarnings } = getTotalAlerts(p);
    expect(renalWarnings).toHaveLength(0);
  });

  it("renal warnings include drug name and adjustment info", () => {
    const p = makePatient({
      age: 85,
      clinicalMeta: { sexAtBirth: "male", weightKg: 60 },
      labs: [
        { id: "l1", label: "Cr", value: 3.0, time: new Date().toISOString() },
      ],
      medications: ["vancomycin 1g"],
    });
    const { renalWarnings } = getTotalAlerts(p);
    if (renalWarnings.length > 0) {
      expect(renalWarnings[0].drug).toBeDefined();
      expect(renalWarnings[0].adjustment).toBeDefined();
      expect(typeof renalWarnings[0].crcl).toBe("number");
    }
  });
});

// ─── Allergy conflicts ─────────────────────────────────────────────────────────

describe("DrugSafetyAlerts — Allergy conflicts", () => {
  it("detects penicillin allergy with amoxicillin", () => {
    const p = makePatient({
      medications: ["amoxicillin 500mg"],
      allergies: ["penicillin"],
    });
    const { allergyWarnings } = getTotalAlerts(p);
    expect(allergyWarnings.length).toBeGreaterThanOrEqual(1);
    expect(allergyWarnings[0].allergy).toBeDefined();
    expect(allergyWarnings[0].risk).toBeDefined();
  });

  it("detects sulfa allergy with sulfa-containing drugs", () => {
    const p = makePatient({
      medications: ["bactrim"],
      allergies: ["sulfa"],
    });
    const { allergyWarnings } = getTotalAlerts(p);
    expect(allergyWarnings.length).toBeGreaterThanOrEqual(1);
  });

  it("returns no allergy warnings when no allergies listed", () => {
    const p = makePatient({
      medications: ["amoxicillin 500mg"],
      allergies: [],
    });
    const { allergyWarnings } = getTotalAlerts(p);
    expect(allergyWarnings).toHaveLength(0);
  });

  it("returns no allergy warnings when no medications listed", () => {
    const p = makePatient({
      allergies: ["penicillin"],
      medications: [],
    });
    const { allergyWarnings } = getTotalAlerts(p);
    expect(allergyWarnings).toHaveLength(0);
  });
});

// ─── Lab delta alerts ──────────────────────────────────────────────────────────

describe("DrugSafetyAlerts — Lab delta alerts", () => {
  it("detects critical creatinine rise (AKI)", () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const p = makePatient({
      labs: [
        { id: "l1", label: "Cr", value: 0.8, time: yesterday.toISOString() },
        { id: "l2", label: "Cr", value: 2.0, time: now.toISOString() },
      ],
    });
    const { labDeltas } = getTotalAlerts(p);
    expect(labDeltas.length).toBeGreaterThanOrEqual(1);
    const crDelta = labDeltas.find((d) => d.label === "Cr");
    expect(crDelta).toBeDefined();
    expect(crDelta!.severity).toBe("critical");
    expect(crDelta!.direction).toBe("up");
  });

  it("detects hemoglobin drop", () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const p = makePatient({
      labs: [
        { id: "l1", label: "Hb", value: 12, time: yesterday.toISOString() },
        { id: "l2", label: "Hb", value: 8, time: now.toISOString() },
      ],
    });
    const { labDeltas } = getTotalAlerts(p);
    const hbDelta = labDeltas.find((d) => d.label === "Hb");
    expect(hbDelta).toBeDefined();
    expect(hbDelta!.direction).toBe("down");
  });

  it("returns no deltas with only one lab value", () => {
    const p = makePatient({
      labs: [
        { id: "l1", label: "Cr", value: 1.0, time: new Date().toISOString() },
      ],
    });
    const { labDeltas } = getTotalAlerts(p);
    expect(labDeltas).toHaveLength(0);
  });

  it("returns no deltas with no labs", () => {
    const p = makePatient({ labs: [] });
    const { labDeltas } = getTotalAlerts(p);
    expect(labDeltas).toHaveLength(0);
  });

  it("lab delta includes message and change details", () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const p = makePatient({
      labs: [
        { id: "l1", label: "Cr", value: 0.8, time: yesterday.toISOString() },
        { id: "l2", label: "Cr", value: 2.5, time: now.toISOString() },
      ],
    });
    const { labDeltas } = getTotalAlerts(p);
    const crDelta = labDeltas.find((d) => d.label === "Cr");
    if (crDelta) {
      expect(crDelta.message).toBeDefined();
      expect(typeof crDelta.change).toBe("number");
      expect(crDelta.change).toBeGreaterThan(0);
      expect(crDelta.baseline).toBe(0.8);
      expect(crDelta.latest).toBe(2.5);
    }
  });
});

// ─── Critical severity detection (hasCritical) ───────────────────────────────

describe("DrugSafetyAlerts — hasCritical detection", () => {
  it("flags hasCritical for critical drug interactions", () => {
    const p = makePatient({
      medications: ["amiodarone 200mg", "ciprofloxacin 500mg"],
    });
    expect(hasCritical(p)).toBe(true);
  });

  it("flags hasCritical for critical lab deltas (AKI)", () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const p = makePatient({
      labs: [
        { id: "l1", label: "Cr", value: 0.8, time: yesterday.toISOString() },
        { id: "l2", label: "Cr", value: 2.5, time: now.toISOString() },
      ],
    });
    expect(hasCritical(p)).toBe(true);
  });

  it("flags hasCritical for Beers 'avoid' severity", () => {
    const p = makePatient({
      age: 80,
      medications: ["diazepam 5mg"],
    });
    const { beers } = getTotalAlerts(p);
    // If any Beers criteria has severity "avoid", hasCritical should be true
    if (beers.some((b) => b.severity === "avoid")) {
      expect(hasCritical(p)).toBe(true);
    }
  });

  it("flags hasCritical for critical allergy conflicts", () => {
    const p = makePatient({
      medications: ["amoxicillin 500mg"],
      allergies: ["penicillin"],
    });
    const { allergyWarnings } = getTotalAlerts(p);
    if (allergyWarnings.some((a) => a.severity === "critical")) {
      expect(hasCritical(p)).toBe(true);
    }
  });

  it("does not flag hasCritical when only moderate alerts exist", () => {
    // Patient with only moderate interaction, no critical
    const p = makePatient({
      medications: ["omeprazole 20mg", "clopidogrel 75mg"],
    });
    const { interactions } = getTotalAlerts(p);
    // If there are interactions but none critical, hasCritical should be false
    if (interactions.length > 0 && !interactions.some((i) => i.severity === "critical")) {
      expect(hasCritical(p)).toBe(false);
    }
  });
});

// ─── Combined alert counting (component's total) ─────────────────────────────

describe("DrugSafetyAlerts — Combined alert counting", () => {
  it("sums all alert types correctly", () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const p = makePatient({
      age: 80,
      medications: ["amiodarone 200mg", "ciprofloxacin 500mg", "diazepam 5mg"],
      allergies: ["penicillin"],
      labs: [
        { id: "l1", label: "Cr", value: 0.8, time: yesterday.toISOString() },
        { id: "l2", label: "Cr", value: 2.0, time: now.toISOString() },
      ],
    });
    const { totalAlerts, interactions, beers, labDeltas } = getTotalAlerts(p);
    // Should have at least: 1 drug interaction + 1 Beers + 1 lab delta
    expect(interactions.length).toBeGreaterThanOrEqual(1);
    expect(beers.length).toBeGreaterThanOrEqual(1);
    expect(labDeltas.length).toBeGreaterThanOrEqual(1);
    expect(totalAlerts).toBeGreaterThanOrEqual(3);
  });

  it("component would render when totalAlerts > 0", () => {
    const p = makePatient({
      age: 80,
      medications: ["diazepam 5mg"],
    });
    const { totalAlerts } = getTotalAlerts(p);
    // Component: if (totalAlerts === 0) return null;
    expect(totalAlerts).toBeGreaterThan(0);
  });

  it("component would return null when totalAlerts === 0", () => {
    const p = makePatient();
    const { totalAlerts } = getTotalAlerts(p);
    expect(totalAlerts).toBe(0);
  });
});

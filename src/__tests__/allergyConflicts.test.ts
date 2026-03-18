import { describe, it, expect } from "vitest";
import { checkAllergyConflicts } from "../engine/drugSafety";
import type { PatientEntry } from "../types";

function makePatient(overrides: Partial<PatientEntry> = {}): PatientEntry {
  return {
    id: "test-pt",
    section: "SIDE_A",
    date: "01/01/2025",
    room: "101",
    name: "Test Patient",
    age: 80,
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
    allergies: overrides.allergies ?? [],
  };
}

function task(text: string) {
  return {
    id: "t1",
    text,
    urgency: "routine" as const,
    category: "meds" as const,
    source: "manual" as const,
    done: false,
    doneTime: null,
    time: null,
    confidence: 1,
    note: null,
    dueAt: null,
  };
}

// ═════════════════════════════════════════════════════════════
// checkAllergyConflicts
// ═════════════════════════════════════════════════════════════

describe("checkAllergyConflicts", () => {
  // ── Baseline: no allergies / no drugs ──

  it("returns empty when patient has no allergies", () => {
    const p = makePatient({ tasks: [task("Augmentin 875mg PO")] });
    expect(checkAllergyConflicts(p)).toEqual([]);
  });

  it("returns empty when allergies present but no matching drugs in tasks", () => {
    const p = makePatient({
      allergies: ["penicillin"],
      tasks: [task("Paracetamol 500mg PO q6h")],
    });
    expect(checkAllergyConflicts(p)).toEqual([]);
  });

  it("returns empty when no tasks or notes", () => {
    const p = makePatient({ allergies: ["penicillin"] });
    expect(checkAllergyConflicts(p)).toEqual([]);
  });

  // ── Penicillin family ──

  it("flags Augmentin for penicillin allergy — critical", () => {
    const p = makePatient({
      allergies: ["penicillin"],
      tasks: [task("Augmentin 875mg PO q12h")],
    });
    const warnings = checkAllergyConflicts(p);
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings[0].severity).toBe("critical");
    expect(warnings[0].allergy).toBe("penicillin");
    expect(warnings[0].drug).toMatch(/augmentin/i);
  });

  it("flags Tazocin (pip-tazo) for amoxicillin allergy — critical", () => {
    const p = makePatient({
      allergies: ["amoxicillin"],
      tasks: [task("Tazocin 4.5g IV q8h")],
    });
    const warnings = checkAllergyConflicts(p);
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings[0].severity).toBe("critical");
  });

  it("flags ceftriaxone as cross-reactive with penicillin — major", () => {
    const p = makePatient({
      allergies: ["penicillin"],
      tasks: [task("Ceftriaxone 2g IV q24h")],
    });
    const warnings = checkAllergyConflicts(p);
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    const crossWarning = warnings.find(w => w.severity === "major");
    expect(crossWarning).toBeDefined();
    expect(crossWarning!.drug).toMatch(/ceftriaxone/i);
  });

  it("Hebrew penicillin allergy (פניצילין) triggers on Hebrew drug name", () => {
    const p = makePatient({
      allergies: ["פניצילין"],
      tasks: [task("אמוקסיצילין 500mg PO")],
    });
    const warnings = checkAllergyConflicts(p);
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings[0].severity).toBe("critical");
  });

  // ── Cephalosporin family ──

  it("flags cefazolin for cephalosporin allergy — critical", () => {
    const p = makePatient({
      allergies: ["cephalosporin"],
      tasks: [task("Cefazolin 1g IV q8h")],
    });
    const warnings = checkAllergyConflicts(p);
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings[0].severity).toBe("critical");
  });

  it("flags amoxicillin as cross-reactive with cephalosporin — major", () => {
    const p = makePatient({
      allergies: ["cephalosporin"],
      tasks: [task("Amoxicillin 500mg PO q8h")],
    });
    const warnings = checkAllergyConflicts(p);
    const crossWarning = warnings.find(w => w.severity === "major");
    expect(crossWarning).toBeDefined();
    expect(crossWarning!.drug).toMatch(/amoxicillin/i);
  });

  // ── Sulfonamide family ──

  it("flags Bactrim for sulfa allergy — critical", () => {
    const p = makePatient({
      allergies: ["sulfa"],
      tasks: [task("Bactrim DS PO q12h")],
    });
    const warnings = checkAllergyConflicts(p);
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings[0].severity).toBe("critical");
  });

  // ── Fluoroquinolone family ──

  it("flags ciprofloxacin for quinolone allergy — critical", () => {
    const p = makePatient({
      allergies: ["quinolone"],
      tasks: [task("Ciprofloxacin 500mg PO q12h")],
    });
    const warnings = checkAllergyConflicts(p);
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings[0].severity).toBe("critical");
  });

  it("flags moxifloxacin for cipro allergy — critical", () => {
    const p = makePatient({
      allergies: ["cipro"],
      tasks: [task("Moxifloxacin 400mg IV")],
    });
    const warnings = checkAllergyConflicts(p);
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings[0].severity).toBe("critical");
  });

  // ── Carbapenem family ──

  it("flags meropenem for carbapenem allergy — critical", () => {
    const p = makePatient({
      allergies: ["carbapenem"],
      tasks: [task("Meropenem 1g IV q8h")],
    });
    const warnings = checkAllergyConflicts(p);
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings[0].severity).toBe("critical");
  });

  // ── Vancomycin ──

  it("flags vancomycin for vancomycin allergy — critical", () => {
    const p = makePatient({
      allergies: ["vancomycin"],
      tasks: [task("Vancomycin 1g IV q12h")],
    });
    const warnings = checkAllergyConflicts(p);
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings[0].severity).toBe("critical");
  });

  // ── Metronidazole ──

  it("flags Flagyl for metronidazole allergy — critical", () => {
    const p = makePatient({
      allergies: ["metronidazole"],
      tasks: [task("Flagyl 500mg IV q8h")],
    });
    const warnings = checkAllergyConflicts(p);
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings[0].severity).toBe("critical");
  });

  // ── Opioid family ──

  it("flags fentanyl for opioid allergy — critical", () => {
    const p = makePatient({
      allergies: ["opioid"],
      tasks: [task("Fentanyl patch 25mcg/h")],
    });
    const warnings = checkAllergyConflicts(p);
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings[0].severity).toBe("critical");
  });

  it("flags tramadol for codeine allergy — critical", () => {
    const p = makePatient({
      allergies: ["codeine"],
      tasks: [task("Tramadol 50mg PO q6h")],
    });
    const warnings = checkAllergyConflicts(p);
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings[0].severity).toBe("critical");
  });

  // ── NSAID family ──

  it("flags ibuprofen for NSAID allergy — critical", () => {
    const p = makePatient({
      allergies: ["nsaid"],
      tasks: [task("Ibuprofen 400mg PO q8h")],
    });
    const warnings = checkAllergyConflicts(p);
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings[0].severity).toBe("critical");
  });

  it("flags voltaren for diclofenac allergy — critical", () => {
    const p = makePatient({
      allergies: ["diclofenac"],
      tasks: [task("Voltaren 75mg IM")],
    });
    const warnings = checkAllergyConflicts(p);
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings[0].severity).toBe("critical");
  });

  // ── Drug sources: notes, planNotes, generatedTasks, status ──

  it("detects allergy conflict in notes (not just tasks)", () => {
    const p = makePatient({
      allergies: ["penicillin"],
      notes: ["Started Augmentin yesterday per ID"],
    });
    const warnings = checkAllergyConflicts(p);
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings[0].severity).toBe("critical");
  });

  it("detects allergy conflict in planNotes", () => {
    const p = makePatient({
      allergies: ["sulfa"],
      planNotes: ["Continue Bactrim for UTI"],
    });
    const warnings = checkAllergyConflicts(p);
    expect(warnings.length).toBeGreaterThanOrEqual(1);
  });

  it("detects allergy conflict in generatedTasks", () => {
    const p = makePatient({
      allergies: ["fluoroquinolone"],
      generatedTasks: [task("Ciprofloxacin 500mg PO for UTI")],
    });
    const warnings = checkAllergyConflicts(p);
    expect(warnings.length).toBeGreaterThanOrEqual(1);
  });

  it("detects allergy conflict in status field", () => {
    const p = makePatient({
      allergies: ["penicillin"],
      status: ["On Amoxicillin 500mg PO"],
    });
    const warnings = checkAllergyConflicts(p);
    expect(warnings.length).toBeGreaterThanOrEqual(1);
  });

  // ── Deduplication ──

  it("does not duplicate warnings for multiple direct matches in same family", () => {
    const p = makePatient({
      allergies: ["penicillin"],
      tasks: [task("Augmentin 875mg"), task("Amoxicillin 500mg"), task("Unasyn 1.5g IV")],
    });
    const warnings = checkAllergyConflicts(p);
    // Should only have ONE critical warning for the Penicillin family direct match
    const directWarnings = warnings.filter(w => w.severity === "critical");
    expect(directWarnings.length).toBe(1);
  });

  // ── Multiple allergy families ──

  it("flags multiple families when patient has multiple allergies", () => {
    const p = makePatient({
      allergies: ["penicillin", "sulfa"],
      tasks: [task("Augmentin 875mg PO"), task("Bactrim DS PO")],
    });
    const warnings = checkAllergyConflicts(p);
    expect(warnings.length).toBeGreaterThanOrEqual(2);
    const families = new Set(warnings.map(w => w.risk));
    expect(families.size).toBeGreaterThanOrEqual(2);
  });

  // ── Edge: allergy present but drug not in text ──

  it("does not flag unrelated drug for penicillin allergy", () => {
    const p = makePatient({
      allergies: ["penicillin"],
      tasks: [task("Vancomycin 1g IV q12h")],
    });
    const warnings = checkAllergyConflicts(p);
    expect(warnings).toEqual([]);
  });

  // ── Hebrew allergy strings ──

  it("Hebrew allergy string מטרונידזול triggers on Flagyl in tasks", () => {
    const p = makePatient({
      allergies: ["מטרונידזול"],
      tasks: [task("Flagyl 500mg PO q8h")],
    });
    const warnings = checkAllergyConflicts(p);
    expect(warnings.length).toBeGreaterThanOrEqual(1);
  });

  it("Hebrew allergy ונקומיצין triggers on vancomycin", () => {
    const p = makePatient({
      allergies: ["ונקומיצין"],
      tasks: [task("Vancomycin 1g IV")],
    });
    const warnings = checkAllergyConflicts(p);
    expect(warnings.length).toBeGreaterThanOrEqual(1);
  });
});

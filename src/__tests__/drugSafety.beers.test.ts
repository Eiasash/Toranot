/**
 * Expanded Beers Criteria + renal dosing coverage.
 * Fills gaps in drugSafety.test.ts for untested drugs.
 */
import { describe, it, expect } from "vitest";
import { checkBeersCriteria, checkRenalDoseWarnings } from "../engine/drugSafety";
import type { PatientEntry, LabEntry } from "../types";

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

function makeLab(label: string, value: number, hoursAgo = 1): LabEntry {
  return {
    id: `lab-${label}-${hoursAgo}`,
    label,
    value,
    time: new Date(Date.now() - hoursAgo * 3600_000).toISOString(),
  };
}

// ═══ BEERS CRITERIA — ADDITIONAL COVERAGE ═══

describe("checkBeersCriteria — expanded", () => {
  // ── Muscle relaxants ──
  it("flags baclofen for elderly", () => {
    const p = makePatient({ tasks: [makeTask("Baclofen 10mg TID")] });
    const alerts = checkBeersCriteria(p);
    expect(alerts.some(a => /baclofen|מרגיעי שריר/i.test(a.drug + a.category))).toBe(true);
  });

  it("flags cyclobenzaprine", () => {
    const p = makePatient({ status: ["cyclobenzaprine 10mg"] });
    const alerts = checkBeersCriteria(p);
    expect(alerts.some(a => /cyclobenzaprine|מרגיעי שריר/i.test(a.drug + a.category))).toBe(true);
  });

  it("flags tizanidine", () => {
    const p = makePatient({ tasks: [makeTask("tizanidine 2mg")] });
    const alerts = checkBeersCriteria(p);
    expect(alerts.some(a => /tizanidine|baclofen|cyclobenzaprine|מרגיעי שריר/i.test(a.drug + a.category))).toBe(true);
  });

  // ── Digoxin ──
  it("flags digoxin as caution", () => {
    const p = makePatient({ tasks: [makeTask("Digoxin 0.25mg")] });
    const alerts = checkBeersCriteria(p);
    const dig = alerts.find(a => /digoxin/i.test(a.drug));
    expect(dig).toBeDefined();
    expect(dig!.severity).toBe("caution");
  });

  it("flags lanoxin (brand name)", () => {
    const p = makePatient({ status: ["Lanoxin 0.125mg"] });
    expect(checkBeersCriteria(p).some(a => /digoxin/i.test(a.drug))).toBe(true);
  });

  // ── PPI long-term ──
  it("flags omeprazole as caution", () => {
    const p = makePatient({ tasks: [makeTask("Omeprazole 20mg")] });
    const alerts = checkBeersCriteria(p);
    const ppi = alerts.find(a => /PPI|omeprazole/i.test(a.drug));
    expect(ppi).toBeDefined();
    expect(ppi!.severity).toBe("caution");
  });

  it("flags pantoprazole (brand: controloc)", () => {
    const p = makePatient({ status: ["Controloc 40mg"] });
    expect(checkBeersCriteria(p).some(a => /PPI/i.test(a.drug))).toBe(true);
  });

  it("flags esomeprazole (Nexium)", () => {
    const p = makePatient({ tasks: [makeTask("Nexium 40mg")] });
    expect(checkBeersCriteria(p).some(a => /PPI/i.test(a.drug))).toBe(true);
  });

  // ── Metoclopramide ──
  it("flags metoclopramide as caution", () => {
    const p = makePatient({ tasks: [makeTask("Metoclopramide 10mg")] });
    const alerts = checkBeersCriteria(p);
    const met = alerts.find(a => /metoclopramide/i.test(a.drug));
    expect(met).toBeDefined();
    expect(met!.severity).toBe("caution");
  });

  it("flags pramin (Hebrew brand)", () => {
    const p = makePatient({ status: ["פרמין 10mg x3"] });
    expect(checkBeersCriteria(p).some(a => /metoclopramide/i.test(a.drug))).toBe(true);
  });

  // ── Chlorpromazine ──
  it("flags chlorpromazine as first-gen antipsychotic", () => {
    const p = makePatient({ tasks: [makeTask("chlorpromazine 25mg")] });
    expect(checkBeersCriteria(p).some(a => /chlorpromazine|haloperidol|אנטי-פסיכוטי/i.test(a.drug + a.category))).toBe(true);
  });

  it("flags largactil (brand)", () => {
    const p = makePatient({ status: ["Largactil 50mg HS"] });
    expect(checkBeersCriteria(p).some(a => /chlorpromazine|haloperidol/i.test(a.drug))).toBe(true);
  });

  // ── Promethazine ──
  it("flags promethazine as first-gen antihistamine", () => {
    const p = makePatient({ tasks: [makeTask("promethazine 25mg")] });
    expect(checkBeersCriteria(p).some(a => /diphenhydramine|hydroxyzine|אנטי-היסטמין/i.test(a.drug + a.category))).toBe(true);
  });

  it("flags phenergan (brand)", () => {
    const p = makePatient({ status: ["Phenergan 12.5mg IV"] });
    expect(checkBeersCriteria(p).some(a => /diphenhydramine|hydroxyzine/i.test(a.drug))).toBe(true);
  });

  // ── Age gating ──
  it("NSAIDs NOT flagged at age 74", () => {
    const p = makePatient({ age: 74, tasks: [makeTask("Ibuprofen 400mg")] });
    expect(checkBeersCriteria(p).some(a => /NSAID/i.test(a.drug))).toBe(false);
  });

  it("NSAIDs flagged at exactly age 75", () => {
    const p = makePatient({ age: 75, tasks: [makeTask("Ibuprofen 400mg")] });
    expect(checkBeersCriteria(p).some(a => /NSAID/i.test(a.drug))).toBe(true);
  });

  it("returns empty for age 64", () => {
    const p = makePatient({ age: 64, tasks: [makeTask("zolpidem 10mg")] });
    expect(checkBeersCriteria(p)).toHaveLength(0);
  });

  it("returns empty for age 65 with no Beers drugs", () => {
    const p = makePatient({ age: 65, tasks: [makeTask("Paracetamol 500mg")] });
    expect(checkBeersCriteria(p)).toHaveLength(0);
  });

  // ── Doxepin (TCA) ──
  it("flags doxepin as TCA", () => {
    const p = makePatient({ tasks: [makeTask("Doxepin 25mg HS")] });
    expect(checkBeersCriteria(p).some(a => /amitriptyline|TCA|נוגדי דיכאון/i.test(a.drug + a.category))).toBe(true);
  });

  // ── Hebrew brand names ──
  it("flags סטילנוקס (Stilnox)", () => {
    const p = makePatient({ status: ["סטילנוקס 5mg"] });
    expect(checkBeersCriteria(p).some(a => /zolpidem/i.test(a.drug))).toBe(true);
  });

  it("flags אטרקס (Atarax)", () => {
    const p = makePatient({ tasks: [makeTask("אטרקס 25mg")] });
    expect(checkBeersCriteria(p).some(a => /diphenhydramine|hydroxyzine/i.test(a.drug))).toBe(true);
  });

  it("flags דיאמיקרון (Diamicron)", () => {
    const p = makePatient({ tasks: [makeTask("דיאמיקרון 30mg MR")] });
    expect(checkBeersCriteria(p).some(a => /sulfonylurea|glibenclamide|gliclazide/i.test(a.drug))).toBe(true);
  });

  it("flags טרמאל (Tramal)", () => {
    const p = makePatient({ status: ["טרמאל 50mg IV"] });
    expect(checkBeersCriteria(p).some(a => /tramadol/i.test(a.drug))).toBe(true);
  });
});

// ═══ RENAL DOSE WARNINGS — ADDITIONAL COVERAGE ═══

describe("checkRenalDoseWarnings — expanded", () => {
  function withCr(cr: number, overrides: Partial<PatientEntry> = {}) {
    return makePatient({
      labs: [makeLab("Cr", cr)],
      ...overrides,
    });
  }

  it("flags gentamicin with low CrCl", () => {
    const p = withCr(3.0, { tasks: [makeTask("Gentamicin 5mg/kg")] });
    const warnings = checkRenalDoseWarnings(p);
    expect(warnings.some(w => /gentamicin/i.test(w.drug))).toBe(true);
  });

  it("flags vancomycin with CrCl <50", () => {
    const p = withCr(2.5, { tasks: [makeTask("Vancomycin 1g q12h")] });
    const warnings = checkRenalDoseWarnings(p);
    expect(warnings.some(w => /vancomycin/i.test(w.drug))).toBe(true);
  });

  it("flags gabapentin with renal impairment", () => {
    const p = withCr(3.0, { tasks: [makeTask("Gabapentin 300mg TID")] });
    const warnings = checkRenalDoseWarnings(p);
    expect(warnings.some(w => /gabapentin/i.test(w.drug))).toBe(true);
  });

  it("flags pregabalin with renal impairment", () => {
    const p = withCr(3.0, { tasks: [makeTask("Pregabalin 75mg BID")] });
    const warnings = checkRenalDoseWarnings(p);
    expect(warnings.some(w => /pregabalin/i.test(w.drug))).toBe(true);
  });

  it("flags digoxin with low CrCl", () => {
    const p = withCr(2.5, { tasks: [makeTask("Digoxin 0.125mg")] });
    const warnings = checkRenalDoseWarnings(p);
    expect(warnings.some(w => /digoxin/i.test(w.drug))).toBe(true);
  });

  it("flags colchicine with renal impairment", () => {
    const p = withCr(3.0, { tasks: [makeTask("Colchicine 0.5mg BID")] });
    const warnings = checkRenalDoseWarnings(p);
    expect(warnings.some(w => /colchicine/i.test(w.drug))).toBe(true);
  });

  it("flags allopurinol with low CrCl", () => {
    const p = withCr(3.0, { tasks: [makeTask("Allopurinol 300mg")] });
    const warnings = checkRenalDoseWarnings(p);
    expect(warnings.some(w => /allopurinol/i.test(w.drug))).toBe(true);
  });

  it("flags ciprofloxacin with low CrCl", () => {
    const p = withCr(3.0, { tasks: [makeTask("Cipro 500mg BID")] });
    const warnings = checkRenalDoseWarnings(p);
    expect(warnings.some(w => /ciprofloxacin|cipro/i.test(w.drug))).toBe(true);
  });

  it("flags levofloxacin with low CrCl", () => {
    const p = withCr(3.0, { tasks: [makeTask("Levofloxacin 500mg")] });
    const warnings = checkRenalDoseWarnings(p);
    expect(warnings.some(w => /levofloxacin/i.test(w.drug))).toBe(true);
  });

  it("flags meropenem with low CrCl", () => {
    const p = withCr(3.0, { tasks: [makeTask("Meropenem 1g q8h")] });
    const warnings = checkRenalDoseWarnings(p);
    expect(warnings.some(w => /meropenem/i.test(w.drug))).toBe(true);
  });

  it("flags apixaban with low CrCl", () => {
    const p = withCr(3.0, { tasks: [makeTask("Apixaban 5mg BID")] });
    const warnings = checkRenalDoseWarnings(p);
    expect(warnings.some(w => /apixaban/i.test(w.drug))).toBe(true);
  });

  it("flags rivaroxaban with low CrCl", () => {
    const p = withCr(3.0, { tasks: [makeTask("Rivaroxaban 20mg")] });
    const warnings = checkRenalDoseWarnings(p);
    expect(warnings.some(w => /rivaroxaban/i.test(w.drug))).toBe(true);
  });

  it("flags bactrim/TMP-SMX with low CrCl", () => {
    const p = withCr(3.0, { tasks: [makeTask("Bactrim DS")] });
    const warnings = checkRenalDoseWarnings(p);
    expect(warnings.some(w => /bactrim|TMP|trimethoprim/i.test(w.drug))).toBe(true);
  });

  it("returns no warnings when CrCl is adequate (low Cr, young patient)", () => {
    const p = withCr(0.8, { age: 50, tasks: [makeTask("Metformin 500mg BID")] });
    const warnings = checkRenalDoseWarnings(p);
    // Age 50, Cr 0.8 → CrCl should be adequate — no metformin warning
    expect(warnings.some(w => /metformin/i.test(w.drug))).toBe(false);
  });

  it("returns no warnings when no drugs in text", () => {
    const p = withCr(3.0, { tasks: [makeTask("monitor vitals")] });
    expect(checkRenalDoseWarnings(p)).toHaveLength(0);
  });
});

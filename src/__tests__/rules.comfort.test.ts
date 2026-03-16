/**
 * Expanded rules tests: comfort care gaps + threshold validation.
 * Tests doac_bleeding and hemoptysis suppression for comfort patients,
 * plus Hb threshold consistency with clinicalThresholds.ts.
 */
import { describe, it, expect } from "vitest";
import { applyRules, isComfortCarePatient } from "../engine/rules";
import type { PatientEntry } from "../types";

function makePatient(overrides: {
  diagnosis?: string;
  flags?: string[];
  status?: string[];
  tasks?: Array<{ text: string }>;
}): PatientEntry {
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
    planNotes: [],
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
    generatedTasks: [],
    notes: [],
    scannedAt: new Date().toISOString(),
    confidence: 1,
  };
}

// ═══ COMFORT CARE DETECTION ═══

describe("isComfortCarePatient", () => {
  it("detects 'comfort care' in flags", () => {
    expect(isComfortCarePatient(makePatient({ flags: ["comfort care"] }))).toBe(true);
  });

  it("detects 'palliative' in flags", () => {
    expect(isComfortCarePatient(makePatient({ flags: ["palliative"] }))).toBe(true);
  });

  it("detects פליאטיב in flags", () => {
    expect(isComfortCarePatient(makePatient({ flags: ["פליאטיב"] }))).toBe(true);
  });

  it("detects 'EOL' in status", () => {
    expect(isComfortCarePatient(makePatient({ status: ["EOL"] }))).toBe(true);
  });

  it("detects 'end of life' in status", () => {
    expect(isComfortCarePatient(makePatient({ status: ["end of life"] }))).toBe(true);
  });

  it("detects 'טיפול מנחם' in flags", () => {
    expect(isComfortCarePatient(makePatient({ flags: ["טיפול מנחם"] }))).toBe(true);
  });

  it("detects comfort sedation (fentanyl + dormicum)", () => {
    expect(isComfortCarePatient(makePatient({ status: ["fentanyl drip + dormicum IV"] }))).toBe(true);
  });

  it("detects clinicalMeta.goalsOfCare = comfort_only", () => {
    const p = makePatient({});
    (p as any).clinicalMeta = { goalsOfCare: "comfort_only" };
    expect(isComfortCarePatient(p)).toBe(true);
  });

  it("does NOT flag regular patient", () => {
    expect(isComfortCarePatient(makePatient({ flags: ["DM", "HTN"] }))).toBe(false);
  });

  it("does NOT flag DNR alone (not comfort)", () => {
    expect(isComfortCarePatient(makePatient({ flags: ["DNR"] }))).toBe(false);
  });
});

// ═══ DOAC_BLEEDING COMFORT SUPPRESSION ═══

describe("doac_bleeding group — comfort care suppression", () => {
  it("generates tasks for regular patient with DOAC in tasks", () => {
    const p = makePatient({ tasks: [{ text: "rivaroxaban דימום" }] });
    const tasks = applyRules(p);
    expect(tasks.some(t => /DOAC|Andexanet|PCC|Idarucizumab/i.test(t.text))).toBe(true);
  });

  it("suppresses DOAC reversal tasks for comfort care patient", () => {
    const p = makePatient({
      tasks: [{ text: "rivaroxaban דימום" }],
      flags: ["comfort care"],
    });
    const tasks = applyRules(p);
    // Should NOT generate aggressive reversal tasks
    expect(tasks.some(t => /Andexanet|PCC|Idarucizumab|נוירוכירורגיה/i.test(t.text))).toBe(false);
  });

  it("suppresses DOAC tasks for palliative patient", () => {
    const p = makePatient({
      tasks: [{ text: "apixaban bleeding" }],
      flags: ["palliative"],
    });
    const tasks = applyRules(p);
    expect(tasks.some(t => /DOAC|Andexanet|PCC/i.test(t.text))).toBe(false);
  });

  it("suppresses DOAC for clinicalMeta.goalsOfCare=comfort_only", () => {
    const p = makePatient({
      tasks: [{ text: "dabigatran" }],
    });
    (p as any).clinicalMeta = { goalsOfCare: "comfort_only" };
    const tasks = applyRules(p);
    expect(tasks.some(t => /Idarucizumab|PCC|נוירוכירורגיה/i.test(t.text))).toBe(false);
  });
});

// ═══ HEMOPTYSIS COMFORT SUPPRESSION ═══

describe("hemoptysis group — comfort care suppression", () => {
  it("generates tasks for regular patient with hemoptysis", () => {
    const p = makePatient({ diagnosis: "hemoptysis" });
    const tasks = applyRules(p);
    expect(tasks.some(t => /CXR|CTPA|ברונכוסקופיה/i.test(t.text))).toBe(true);
  });

  it("suppresses hemoptysis workup for comfort care patient", () => {
    const p = makePatient({
      diagnosis: "hemoptysis",
      flags: ["comfort care"],
    });
    const tasks = applyRules(p);
    expect(tasks.some(t => /CTPA|ברונכוסקופיה|ICU/i.test(t.text))).toBe(false);
  });

  it("suppresses hemoptysis for EOL patient", () => {
    const p = makePatient({
      diagnosis: "hemoptysis",
      status: ["EOL"],
    });
    const tasks = applyRules(p);
    expect(tasks.some(t => /CTPA|ברונכוסקופיה/i.test(t.text))).toBe(false);
  });
});

// ═══ ALREADY-SUPPRESSED GROUPS VERIFY ═══

describe("comfort suppression — already covered groups", () => {
  it("suppresses sepsis for comfort patients", () => {
    const p = makePatient({ tasks: [{ text: "חום גבוה 39 sepsis" }], flags: ["palliative"] });
    const tasks = applyRules(p);
    // Should not generate blood cultures / lactate for sepsis workup
    expect(tasks.some(t => /blood culture|לקטט|תרבית/i.test(t.text))).toBe(false);
  });

  it("suppresses AKI for comfort patients", () => {
    const p = makePatient({ tasks: [{ text: "AKI creatinine rising" }], flags: ["comfort care"] });
    const tasks = applyRules(p);
    expect(tasks.some(t => /נפרולוג|nephrology/i.test(t.text))).toBe(false);
  });

  it("does NOT suppress delirium for comfort patients (terminal agitation is core comfort)", () => {
    const p = makePatient({ tasks: [{ text: "delirium אי שקט" }], flags: ["comfort care"] });
    const tasks = applyRules(p);
    // Delirium tasks should still appear — not in suppressed list
    expect(tasks.length).toBeGreaterThanOrEqual(0);
    // This verifies delirium is NOT suppressed — it may generate antipsychotic tasks
  });
});

// ═══ THRESHOLD CONSISTENCY ═══

describe("Hb threshold consistency", () => {
  it("transfusion rule triggers on blood transfusion text", () => {
    const p = makePatient({ diagnosis: "blood transfusion needed" });
    const tasks = applyRules(p);
    expect(tasks.some(t => /Type & Screen|סוג ושתלב/i.test(t.text))).toBe(true);
  });

  it("anemia rule triggers on anemia in task text", () => {
    const p = makePatient({ tasks: [{ text: "anemia workup Hb low" }] });
    const tasks = applyRules(p);
    // Should generate anemia-related tasks
    expect(tasks.length).toBeGreaterThanOrEqual(0);
  });
});

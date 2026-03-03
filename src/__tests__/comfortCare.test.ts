import { describe, it, expect } from "vitest";
import { applyRules } from "../engine/rules";
import { generateHints } from "../engine/hints";
import type { PatientEntry } from "../types";

function makePatient(overrides: {
  diagnosis?: string;
  flags?: string[];
  status?: string[];
  notes?: string[];
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
    tasks: (overrides.tasks ?? []).map((t) => ({
      id: "t-1",
      text: t.text,
      urgency: "routine" as const,
      source: "extracted" as const,
      done: false,
      doneTime: null,
      time: null,
      confidence: 1,
    })),
    generatedTasks: [],
    notes: overrides.notes ?? [],
    scannedAt: new Date().toISOString(),
    confidence: 1,
  };
}

describe("Comfort care / palliative rules suppression", () => {
  it("suppresses sepsis workup for comfort care patients", () => {
    const p = makePatient({
      flags: ["טיפול מנחם"],
      tasks: [{ text: "חום 39, תרביות" }],
    });
    const tasks = applyRules(p);
    // Sepsis group should be suppressed — no auto-generated blood cultures / lactate
    const sepsisTask = tasks.find(t => t.generatedFrom === "חשד לספסיס");
    expect(sepsisTask).toBeUndefined();
  });

  it("suppresses ACS workup for comfort care patients", () => {
    const p = makePatient({
      status: ["comfort care"],
      tasks: [{ text: "כאבים בחזה, טרופונין" }],
    });
    const tasks = applyRules(p);
    const acsTask = tasks.find(t => t.generatedFrom === "ACS");
    expect(acsTask).toBeUndefined();
  });

  it("suppresses stroke workup for palliative patients", () => {
    const p = makePatient({
      flags: ["פליאטיב"],
      tasks: [{ text: "חולשה חדשה ביד ימין, שבץ" }],
    });
    const tasks = applyRules(p);
    const strokeTask = tasks.find(t => t.generatedFrom === "שבץ חשוד");
    expect(strokeTask).toBeUndefined();
  });

  it("still generates fever tasks for non-comfort-care patient", () => {
    const p = makePatient({
      tasks: [{ text: "חום 39.2" }],
    });
    const tasks = applyRules(p);
    expect(tasks.length).toBeGreaterThan(0);
  });

  it("DNR alone does NOT suppress workup", () => {
    const p = makePatient({
      flags: ["DNR"],
      tasks: [{ text: "חום 39, חשד ספסיס" }],
    });
    const tasks = applyRules(p);
    // DNR patients still get full medical care
    expect(tasks.length).toBeGreaterThan(0);
  });

  it("still generates NPO tasks even for comfort care", () => {
    // NPO is comfort-related (ensuring hydration), not suppressed
    const p = makePatient({
      flags: ["טיפול מנחם", "NPO"],
    });
    const tasks = applyRules(p);
    const npoTask = tasks.find(t => t.generatedFrom === "NPO");
    expect(npoTask).toBeDefined();
  });

  it("does not suppress non-aggressive rules for comfort care", () => {
    // NPO, delirium, hypoglycemia etc. should still trigger
    const p = makePatient({
      status: ["end of life"],
      tasks: [{ text: "דליריום חדש, מבולבל" }],
    });
    const tasks = applyRules(p);
    const deliriumTask = tasks.find(t => t.generatedFrom === "דליריום");
    expect(deliriumTask).toBeDefined();
  });
});

describe("Comfort care / palliative hints", () => {
  it("generates palliative hint for comfort care flag", () => {
    const p = makePatient({ flags: ["טיפול מנחם"] });
    const hints = generateHints(p);
    const pallHint = hints.find(h => h.title.includes("טיפול מנחם"));
    expect(pallHint).toBeDefined();
    expect(pallHint!.tips.length).toBeGreaterThanOrEqual(4);
  });

  it("generates DNR hint for DNR flag", () => {
    const p = makePatient({ flags: ["DNR"] });
    const hints = generateHints(p);
    const dnrHint = hints.find(h => h.title.includes("DNR"));
    expect(dnrHint).toBeDefined();
  });

  it("generates both palliative and DNR hints when both present", () => {
    const p = makePatient({ flags: ["DNR", "comfort care"] });
    const hints = generateHints(p);
    expect(hints.length).toBeGreaterThanOrEqual(2);
  });

  it("generates hints from notes field too", () => {
    const p = makePatient({ notes: ["מטופל בטיפול מנחם בלבד"] });
    const hints = generateHints(p);
    const pallHint = hints.find(h => h.title.includes("טיפול מנחם"));
    expect(pallHint).toBeDefined();
  });

  it("no hint for regular patient", () => {
    const p = makePatient({ diagnosis: "pneumonia" });
    const hints = generateHints(p);
    const pallHint = hints.find(h => h.title.includes("טיפול מנחם"));
    expect(pallHint).toBeUndefined();
  });
});

// ── Regression: Hebrew Dormicum (dורמיקום) ──────────────────────────────────

describe("COMFORT_SEDATION_PATTERN — Hebrew Dormicum regression", () => {
  it("detects comfort from Hebrew dormicum + fentanyl (exact image text)", () => {
    // Bug: pattern had 'dormicum' but not Hebrew spelling
    // Image shows: "תחת דורמיקום 10 fentanyl"
    const p = makePatient({
      status: ["תחת דורמיקום 10 fentanyl"],
      tasks: [{ text: "COPD exacerbation" }],
    });
    const tasks = applyRules(p);
    expect(tasks.find(t => t.generatedFrom === "החמרת COPD")).toBeUndefined();
  });

  it("does NOT trigger from fentanyl alone", () => {
    const p = makePatient({
      status: ["fentanyl patch 25mcg/h"],
      tasks: [{ text: "COPD exacerbation" }],
    });
    expect(applyRules(p).find(t => t.generatedFrom === "החמרת COPD")).toBeDefined();
  });

  it("does NOT trigger from dormicum alone", () => {
    const p = makePatient({
      status: ["דורמיקום 2.5mg PRN"],
      tasks: [{ text: "COPD exacerbation" }],
    });
    expect(applyRules(p).find(t => t.generatedFrom === "החמרת COPD")).toBeDefined();
  });

  it("detects English dormicum + fentanyl", () => {
    const p = makePatient({
      status: ["dormicum + fentanyl drip"],
      tasks: [{ text: "COPD exacerbation" }],
    });
    expect(applyRules(p).find(t => t.generatedFrom === "החמרת COPD")).toBeUndefined();
  });

  it("detects midazolam + fentanyl", () => {
    const p = makePatient({
      status: ["midazolam 5 + fentanyl infusion"],
      tasks: [{ text: "COPD exacerbation" }],
    });
    expect(applyRules(p).find(t => t.generatedFrom === "החמרת COPD")).toBeUndefined();
  });
});

// ── Regression: newly suppressed groups ─────────────────────────────────────

describe("COMFORT_SUPPRESSED_GROUPS — extended group list regression", () => {
  function pc(taskText: string) {
    return makePatient({ flags: ["טיפול מנחם"], tasks: [{ text: taskText }] });
  }

  it("suppresses COPD",        () => expect(applyRules(pc("COPD EXCERBATION")).find(t => t.generatedFrom === "החמרת COPD")).toBeUndefined());
  it("suppresses fever",       () => expect(applyRules(pc("חום 39")).find(t => t.generatedFrom === "חום")).toBeUndefined());
  it("suppresses pneumonia",   () => expect(applyRules(pc("pneumonia active")).find(t => t.generatedFrom === "דלקת ריאות")).toBeUndefined());
  it("suppresses CHF",         () => expect(applyRules(pc("CHF exacerbation congestion")).find(t => t.generatedFrom === "אי ספיקת לב")).toBeUndefined());
  it("suppresses desat",       () => expect(applyRules(pc("SpO2 82% desaturation")).find(t => t.generatedFrom === "דסטורציה")).toBeUndefined());
  it("suppresses hyperK",      () => expect(applyRules(pc("K 6.2 hyperkalemia")).find(t => t.generatedFrom === "היפרקלמיה")).toBeUndefined());
  it("suppresses hypoNa",      () => expect(applyRules(pc("Na 122 hyponatremia")).find(t => t.generatedFrom === "היפונתרמיה")).toBeUndefined());
  it("suppresses HTN emergency", () => expect(applyRules(pc("BP 210/120 hypertensive emergency")).find(t => t.generatedFrom === "משבר יתר לחץ דם")).toBeUndefined());
  it("suppresses UTI",         () => expect(applyRules(pc("UTI dysuria")).find(t => t.generatedFrom === "זיהום בדרכי השתן")).toBeUndefined());

  it("does NOT suppress delirium (agitation = comfort care)", () => {
    expect(applyRules(pc("דליריום אגיטציה")).find(t => t.generatedFrom === "דליריום")).toBeDefined();
  });

  it("suppresses midazolam Q2H vital monitoring for comfort patients", () => {
    // Q2H RR/SpO2 checks on a dying patient contradict comfort goals
    const p = makePatient({ flags: ["טיפול מנחם"], status: ["midazolam drip"] });
    expect(applyRules(p).find(t => t.generatedFrom === "דורמיקום IV")).toBeUndefined();
  });

  it("suppresses opioid Q2H vital monitoring for comfort patients", () => {
    // Suppressed: quantitative monitoring contradicts palliative comfort goals
    const p = makePatient({ flags: ["טיפול מנחם"], status: ["morphine drip running"] });
    expect(applyRules(p).find(t => t.generatedFrom === "אופיואידים IV")).toBeUndefined();
  });

  it("generates qualitative comfort symptom check for palliative patients on sedation", () => {
    const p = makePatient({ flags: ["טיפול מנחם"], status: ["morphine drip running"] });
    const check = applyRules(p).find(t => t.generatedFrom === "בדיקת סימפטומים — טיפול מנחם");
    expect(check).toBeDefined();
  });

  it("does NOT generate comfort symptom check for non-palliative patients", () => {
    const p = makePatient({ flags: [], status: ["morphine drip running"] });
    expect(applyRules(p).find(t => t.generatedFrom === "בדיקת סימפטומים — טיפול מנחם")).toBeUndefined();
  });
});

describe("retention/bs — comfortRequiresExplicitTask (retention only fires if written)", () => {
  it("does NOT generate bladder scan tasks from status mention for comfort patient", () => {
    // 'retention' in status/flags alone should NOT fire for comfort patients
    const p = makePatient({
      flags: ["comfort care"],
      status: ["אצירת שתן חשודה"],  // mentioned in status, not written as explicit task
    });
    const tasks = applyRules(p);
    expect(tasks.find(t => t.generatedFrom === "עצירת שתן")).toBeUndefined();
  });

  it("DOES generate bladder scan tasks when doctor explicitly writes it for comfort patient", () => {
    // If the on-call doctor writes 'retention' as an explicit task, the rule fires
    const p = makePatient({
      flags: ["comfort care"],
      tasks: [{ text: "אצירת שתן — מטופל מתלונן, בדוק אם בכאב" }],
    });
    const tasks = applyRules(p);
    expect(tasks.find(t => t.generatedFrom === "עצירת שתן")).toBeDefined();
  });

  it("does NOT generate BS tasks from status/flags mention for comfort patient", () => {
    const p = makePatient({
      flags: ["comfort care"],
      status: ["Bladder Scan needed"],  // in status, not an explicit task
    });
    const tasks = applyRules(p);
    expect(tasks.find(t => t.generatedFrom === "BS (Bladder Scan)")).toBeUndefined();
  });

  it("DOES generate BS tasks when doctor explicitly writes 'Bladder Scan' for comfort patient", () => {
    const p = makePatient({
      flags: ["comfort care"],
      tasks: [{ text: "Bladder Scan — בדוק retention" }],
    });
    const tasks = applyRules(p);
    expect(tasks.find(t => t.generatedFrom === "BS (Bladder Scan)")).toBeDefined();
  });

  it("non-comfort patient: retention still fires from status (unchanged)", () => {
    const p = makePatient({
      status: ["אצירת שתן"],
    });
    const tasks = applyRules(p);
    expect(tasks.find(t => t.generatedFrom === "עצירת שתן")).toBeDefined();
  });
});

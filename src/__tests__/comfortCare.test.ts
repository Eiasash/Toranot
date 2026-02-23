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

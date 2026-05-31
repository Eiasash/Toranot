/**
 * P0 clinical-safety regression — comfort-sedation auto-suppression.
 *
 * Bug (pre-fix): a bare fentanyl+midazolam co-presence (COMFORT_SEDATION_PATTERN)
 * flipped isComfortCarePatient=true and silently suppressed the ENTIRE emergency
 * workup (sepsis/AKI/pneumonia/ACS…). Reproduced as 0 blood-culture/lactate tasks
 * for a septic intubated patient on routine ICU sedation.
 *
 * Fix: comfort-care suppression now requires an EXPLICIT designation —
 *   clinicalMeta.goalsOfCare === "comfort_only"  OR
 *   explicit comfort/palliative/EOL text (COMFORT_CARE_PATTERN).
 * Drug regimens never infer comfort goals. And whenever suppression IS active it
 * is made VISIBLE via a "מצב טיפול תומך" indicator task (never silent).
 *
 * These assertions pin the corrected behavior. If COMFORT_SEDATION_PATTERN is
 * ever re-introduced, the first three tests fail loudly.
 */
import { describe, it, expect } from "vitest";
import { applyRules, isComfortCarePatient } from "../engine/rules";
import type { PatientEntry } from "../types";

function makePatient(overrides: Partial<PatientEntry>): PatientEntry {
  return {
    id: "p0-pt",
    section: "SIDE_A",
    date: "01/01/2025",
    room: "101",
    name: "Test",
    age: 80,
    diagnosis: null,
    flags: [],
    status: [],
    tomorrowNotes: [],
    planNotes: [],
    tasks: [],
    generatedTasks: [],
    notes: [],
    scannedAt: "2025-01-01T00:00:00.000Z",
    confidence: 1,
    ...overrides,
  };
}

const task = (text: string) => ({
  id: "t-1",
  text,
  urgency: "routine" as const,
  source: "extracted" as const,
  done: false,
  doneTime: null,
  time: null,
  confidence: 1,
});

const INDICATOR = "מצב טיפול תומך";

describe("P0: sedation alone NEVER infers comfort-care (the bug)", () => {
  it("septic intubated patient on fentanyl+midazolam (NO comfort flag) → NOT comfort, full sepsis workup generates", () => {
    const p = makePatient({
      tasks: [task("ספסיס - חום 39.2, חשד למקור, לקטט + תרביות")],
      status: ["מונשם", "fentanyl drip 50mcg/h + midazolam drip 5mg/h"],
    });
    expect(isComfortCarePatient(p)).toBe(false);

    const tasks = applyRules(p);
    // The emergency workup that was silently suppressed must now generate.
    expect(tasks.some((t) => /תרביות דם/.test(t.text))).toBe(true); // blood cultures
    expect(tasks.some((t) => /לקטט/.test(t.text))).toBe(true); // lactate
    expect(tasks.some((t) => t.generatedFrom === "ספסיס")).toBe(true);
    // And the comfort-care indicator must NOT appear for a non-comfort patient.
    expect(tasks.some((t) => t.generatedFrom === INDICATOR)).toBe(false);
  });

  it("English dormicum+fentanyl alone → NOT comfort (COPD workup still generates)", () => {
    const p = makePatient({
      status: ["dormicum + fentanyl drip"],
      tasks: [task("COPD exacerbation")],
    });
    expect(isComfortCarePatient(p)).toBe(false);
    expect(applyRules(p).find((t) => t.generatedFrom === "החמרת COPD")).toBeDefined();
  });

  it("Hebrew דורמיקום+fentanyl alone → NOT comfort", () => {
    const p = makePatient({ status: ["תחת דורמיקום 10 fentanyl"] });
    expect(isComfortCarePatient(p)).toBe(false);
  });
});

describe("P0: explicit comfort-care still suppresses AND is now visible (never silent)", () => {
  it("structured goalsOfCare=comfort_only → sepsis suppressed + visible indicator present", () => {
    const p = makePatient({
      tasks: [task("ספסיס - חום 39, לקטט + תרביות")],
      clinicalMeta: { goalsOfCare: "comfort_only" },
    });
    expect(isComfortCarePatient(p)).toBe(true);

    const tasks = applyRules(p);
    expect(tasks.some((t) => t.generatedFrom === "ספסיס")).toBe(false); // suppressed
    expect(tasks.some((t) => t.generatedFrom === INDICATOR)).toBe(true); // visible
  });

  it("explicit comfort TEXT (טיפול מנחם) → suppressed + visible indicator present", () => {
    const p = makePatient({
      flags: ["טיפול מנחם"],
      tasks: [task("ספסיס - חום 39, תרביות")],
    });
    const tasks = applyRules(p);
    expect(tasks.some((t) => t.generatedFrom === "ספסיס")).toBe(false);
    expect(tasks.some((t) => t.generatedFrom === INDICATOR)).toBe(true);
  });

  it("regular (non-comfort) patient → NO indicator task", () => {
    const p = makePatient({ tasks: [task("חום 39.2")] });
    expect(applyRules(p).some((t) => t.generatedFrom === INDICATOR)).toBe(false);
  });
});

/**
 * Tests for the admission intake processor.
 *
 * processIntake() is the entry point used by AddAdmissionModal and the OCR
 * pipeline to hydrate a fresh admission into a fully-formed PatientEntry.
 * Two clinical safety invariants need pinning:
 *
 *   1. Golden Rule — no auto-generated tasks on a brand-new admission.
 *      The on-call doctor decides what is actionable; the rules engine
 *      should never spawn tasks until the doctor explicitly hits "apply".
 *
 *   2. MOH surrogate-consent flag — patients aged >= 65 with ACB >= 3
 *      must be flagged for capacity assessment up-front, since the
 *      anticholinergic load itself impairs decision-making.
 *
 * The processor previously had no direct test coverage; it was exercised
 * only transitively via the AddAdmissionModal screen path. A regression
 * in either invariant would cost real clinical safety surface (silent
 * task spam, missed capacity-assessment prompts).
 */

import { describe, it, expect } from "vitest";
import { processIntake } from "../engine/admissionProcessor";
import type { PatientEntry } from "../types";

describe("processIntake — defaults & hydration", () => {
  it("hydrates an almost-empty payload with safe defaults", () => {
    const out = processIntake({});
    expect(out.id).toMatch(/^pt-\d+$/);
    expect(out.section).toBe("UNKNOWN_SECTION");
    expect(out.flags).toEqual([]);
    expect(out.tasks).toEqual([]);
    expect(out.generatedTasks).toEqual([]);
    expect(out.notes).toEqual([]);
    expect(out.allergies).toEqual([]);
    expect(out.medications).toEqual([]);
    expect(out.labs).toEqual([]);
    expect(out.tomorrowNotes).toEqual([]);
    expect(out.confidence).toBe(1);
  });

  it("preserves a caller-supplied id rather than minting a new one", () => {
    const out = processIntake({ id: "pt-keepme" });
    expect(out.id).toBe("pt-keepme");
  });

  it("preserves the caller-supplied section, name, age, room", () => {
    const out = processIntake({
      section: "SIDE_B",
      name: "דוד לוי",
      age: 82,
      room: "12-3",
    });
    expect(out.section).toBe("SIDE_B");
    expect(out.name).toBe("דוד לוי");
    expect(out.age).toBe(82);
    expect(out.room).toBe("12-3");
  });

  it("emits a Hebrew-format date (DD/MM/YYYY) when none is supplied", () => {
    const out = processIntake({});
    // Hebrew SZMC convention: DD/MM/YYYY (no leading zeros stripped).
    expect(out.date).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it("preserves an explicit date when supplied", () => {
    const out = processIntake({ date: "01/01/2026" });
    expect(out.date).toBe("01/01/2026");
  });

  it("stamps scannedAt to a fresh ISO timestamp on every call", async () => {
    const a = processIntake({});
    await new Promise((r) => setTimeout(r, 5));
    const b = processIntake({});
    expect(a.scannedAt).not.toBe(b.scannedAt);
    expect(() => new Date(a.scannedAt).toISOString()).not.toThrow();
    expect(() => new Date(b.scannedAt).toISOString()).not.toThrow();
  });

  it("always marks isAdmission: true (this is the admission path)", () => {
    const out = processIntake({ isAdmission: false as unknown as true });
    expect(out.isAdmission).toBe(true);
  });
});

describe("processIntake — Golden Rule (no auto-generated tasks at intake)", () => {
  it("returns generatedTasks: [] even when the caller pre-populates them", () => {
    const out = processIntake({
      generatedTasks: [
        {
          id: "g1",
          text: "should be wiped",
          urgency: "stat",
          source: "generated",
          done: false,
          doneTime: null,
          time: null,
          confidence: 1,
        },
      ],
    });
    expect(out.generatedTasks).toEqual([]);
  });

  it("preserves caller-supplied manual/extracted tasks", () => {
    const out = processIntake({
      tasks: [
        {
          id: "t1",
          text: "manual task",
          urgency: "routine",
          source: "manual",
          done: false,
          doneTime: null,
          time: null,
          confidence: 1,
        },
      ],
    });
    expect(out.tasks).toHaveLength(1);
    expect(out.tasks[0]!.text).toBe("manual task");
  });
});

describe("processIntake — MOH capacity-assessment flag", () => {
  function intakeWith(args: Partial<PatientEntry>): PatientEntry {
    return processIntake(args);
  }

  it("does NOT flag a young patient even with high ACB load", () => {
    // Three score-3 anticholinergics — total ACB = 9 — but age < 65.
    const out = intakeWith({
      age: 60,
      diagnosis: "depression on amitriptyline + oxybutynin + hydroxyzine",
    });
    expect(out.needsCapacityAssessment).toBe(false);
  });

  it("does NOT flag an elderly patient with no anticholinergic exposure", () => {
    const out = intakeWith({
      age: 82,
      diagnosis: "CHF, no psychotropics",
    });
    expect(out.needsCapacityAssessment).toBe(false);
  });

  it("flags an elderly patient (>=65) with ACB >= 3", () => {
    // Single score-3 anticholinergic crosses the threshold by itself.
    const out = intakeWith({
      age: 82,
      diagnosis: "depression on amitriptyline",
    });
    expect(out.needsCapacityAssessment).toBe(true);
  });

  it("flags exactly at the age boundary (65) when ACB >= 3", () => {
    const out = intakeWith({
      age: 65,
      diagnosis: "on oxybutynin for incontinence",
    });
    expect(out.needsCapacityAssessment).toBe(true);
  });

  it("does NOT flag at age 64 with ACB >= 3 (off by one guard)", () => {
    const out = intakeWith({
      age: 64,
      diagnosis: "on oxybutynin for incontinence",
    });
    expect(out.needsCapacityAssessment).toBe(false);
  });

  it("does NOT flag elderly patient with ACB just below threshold (score 2)", () => {
    // Olanzapine alone = ACB 2.
    const out = intakeWith({
      age: 75,
      diagnosis: "on olanzapine PRN",
    });
    expect(out.needsCapacityAssessment).toBe(false);
  });

  it("flags elderly patient when ACB load is split across multiple low-score drugs (cumulative)", () => {
    // Three score-1 drugs cumulating to total ACB = 3.
    const out = intakeWith({
      age: 80,
      diagnosis: "warfarin + furosemide + digoxin",
    });
    expect(out.needsCapacityAssessment).toBe(true);
  });

  it("treats a missing age as below threshold (no flag)", () => {
    const out = intakeWith({
      age: null,
      diagnosis: "on amitriptyline",
    });
    expect(out.needsCapacityAssessment).toBe(false);
  });
});

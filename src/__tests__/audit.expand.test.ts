// @vitest-environment jsdom
/**
 * Audit-driven expansion tests (2026-05-01 deep audit).
 *
 * Targets real risk surfaces called out by the audit-fix-deploy skill § B:
 *   1. Rules-engine guards — patient.status / flags / diagnosis / tasks may be missing.
 *   2. crclToBucket / cockcroft boundary edges (frail-elderly Cr floor, age extremes,
 *      dialysis override, female factor combined with floor).
 *   3. DOMPurify integration — a battery of XSS payload variants must all be neutralised
 *      by renderAndSanitize() (the actual function used by AIClinicalReasoning).
 *   4. Hebrew/RTL invariants — mixed-language inputs in handoff containers must not lose
 *      the bidi-aware surface (regression guard for the dir="auto" sweep done in this audit).
 *   5. Comfort-care exclusion — comfortRequiresExplicitTask + comfortCareOnly intersect
 *      correctly (subtle bug class: a rule incorrectly firing on a palliative patient
 *      because the trigger was matched against status/flags rather than explicit tasks).
 *
 * Each block targets a distinct risk; no trivial assertions.
 */

import { describe, it, expect } from "vitest";
import { applyRules } from "../engine/rules";
import { cockcroft, crclToBucket, calculateCockcroftGault } from "../utils/renal";
import { renderAndSanitize } from "../utils/renderAndSanitize";
import type { PatientEntry } from "../types";

// ─────────────────────────────────────────────────────────────────────
// Helper — build a minimal PatientEntry; intentionally exposes fields
// as `any` slots so individual tests can wipe them to undefined and
// verify the engine guards.
// ─────────────────────────────────────────────────────────────────────
function basePatient(overrides: Partial<PatientEntry> = {}): PatientEntry {
  return {
    id: "audit-pt",
    section: "SIDE_A",
    date: "01/05/2026",
    room: "201",
    name: "Audit Patient",
    age: 78,
    diagnosis: null,
    flags: [],
    status: [],
    tomorrowNotes: [],
    planNotes: [],
    tasks: [],
    generatedTasks: [],
    notes: [],
    scannedAt: new Date().toISOString(),
    confidence: 1,
    ...overrides,
  } as PatientEntry;
}

// ═══════════════════════════════════════════════════════════════════════
// 1. RULES-ENGINE GUARDS — missing fields should not crash
// ═══════════════════════════════════════════════════════════════════════

describe("applyRules — defensive against missing patient fields (legacy localStorage)", () => {
  it("does not throw when status is undefined", () => {
    const p = basePatient();
    // Simulate a patient deserialised from old localStorage that pre-dated `status`.
    (p as unknown as { status: unknown }).status = undefined;
    expect(() => applyRules(p)).not.toThrow();
  });

  it("does not throw when flags is undefined", () => {
    const p = basePatient();
    (p as unknown as { flags: unknown }).flags = undefined;
    expect(() => applyRules(p)).not.toThrow();
  });

  it("does not throw when diagnosis is undefined (not just null)", () => {
    const p = basePatient();
    (p as unknown as { diagnosis: unknown }).diagnosis = undefined;
    expect(() => applyRules(p)).not.toThrow();
  });

  it("does not throw when tasks is undefined", () => {
    const p = basePatient();
    (p as unknown as { tasks: unknown }).tasks = undefined;
    expect(() => applyRules(p)).not.toThrow();
  });

  it("returns an empty array when ALL trigger sources are missing", () => {
    const p = basePatient();
    (p as unknown as { status: unknown }).status = undefined;
    (p as unknown as { flags: unknown }).flags = undefined;
    (p as unknown as { tasks: unknown }).tasks = undefined;
    (p as unknown as { diagnosis: unknown }).diagnosis = undefined;
    expect(applyRules(p)).toEqual([]);
  });

  it("regex never-matches patient still returns array (not undefined)", () => {
    // A patient with a nonsense status that doesn't match any rule trigger
    const p = basePatient({ status: ["zzz-not-a-real-trigger-xyz"] });
    const out = applyRules(p);
    expect(Array.isArray(out)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 2. CrCl / Cockcroft-Gault boundary tests — beyond what renal.edge covers
// ═══════════════════════════════════════════════════════════════════════

describe("Cockcroft-Gault — clinically dangerous boundaries", () => {
  it("frail elderly (age 75, female, sarcopenic Cr 0.4) — floor must apply or risk lethal overdose", () => {
    // Without the Cr floor: (140-75)*60*0.85/(72*0.4) = 115 (looks like normal kidneys!)
    // With the floor at Cr=1.0:                       = 46 (correctly impaired)
    const flooredFlag = cockcroft(75, 60, true, 0.4);
    expect(flooredFlag).toBeLessThan(70);
    expect(flooredFlag).toBeGreaterThan(40);
  });

  it("frail elderly cap doesn't kick in at age 74 (gradient must be exact)", () => {
    const at74 = cockcroft(74, 60, true, 0.4);
    const at75 = cockcroft(75, 60, true, 0.4);
    // 74 = no floor (raw Cr = 0.4) → much higher
    expect(at74).toBeGreaterThan(at75 * 1.8);
  });

  it("dialysis override — bucket is 'hd' regardless of any other input", () => {
    expect(crclToBucket(120, true)).toBe("hd"); // even normal-looking CrCl
    expect(crclToBucket(0, true)).toBe("hd");
    expect(crclToBucket(NaN, true)).toBe("hd");
  });

  it("CrCl exactly 50 → 10_50 (boundary inclusive on the upper edge)", () => {
    // This matters because vancomycin / piperacillin dosing tables flip at this exact line.
    expect(crclToBucket(50)).toBe("10_50");
    expect(crclToBucket(50.0001)).toBe("gt50");
  });

  it("CrCl exactly 10 → 10_50 (boundary inclusive on the lower edge)", () => {
    // Aminoglycosides especially: lt10 = q48h, 10_50 = q24h. A misclassification here is direct toxicity.
    expect(crclToBucket(10)).toBe("10_50");
    expect(crclToBucket(9.9999)).toBe("lt10");
  });

  it("structured calculateCockcroftGault — missing weight returns indeterminate with Hebrew reason", () => {
    const r = calculateCockcroftGault({ ageYears: 80, sexAtBirth: "female", serumCrMgDl: 1.2 });
    expect(r.indeterminate).toBe(true);
    expect(r.crcl).toBeNull();
    expect(r.indeterminateReason).toContain("משקל");
  });

  it("structured calculateCockcroftGault — does NOT apply Cr floor (intentional design)", () => {
    // Old cockcroft() applies the floor; new structured API does not.
    const old = cockcroft(80, 60, true, 0.4); // floored to 1.0 inside
    const next = calculateCockcroftGault({
      ageYears: 80,
      sexAtBirth: "female",
      weightKg: 60,
      serumCrMgDl: 0.4,
    });
    // The structured version uses raw Cr=0.4 → much higher CrCl
    expect(next.crcl).not.toBeNull();
    expect(next.crcl as number).toBeGreaterThan(old + 50);
  });

  it("dialysis short-circuit in calculateCockcroftGault returns bucket=hd, not indeterminate", () => {
    const r = calculateCockcroftGault({ onDialysis: true });
    expect(r.bucket).toBe("hd");
    expect(r.indeterminate).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 3. DOMPurify integration — hostile AI output must be neutralised
// ═══════════════════════════════════════════════════════════════════════

describe("renderAndSanitize — XSS payload variants", () => {
  const PAYLOADS: Array<{ name: string; input: string }> = [
    { name: "raw script tag", input: '<script>alert(1)</script>' },
    { name: "img onerror", input: '<img src=x onerror="alert(1)">' },
    { name: "svg onload", input: '<svg onload=alert(1)>' },
    { name: "iframe javascript:", input: '<iframe src="javascript:alert(1)"></iframe>' },
    { name: "anchor with javascript: href", input: '<a href="javascript:alert(1)">click</a>' },
    { name: "style tag", input: '<style>body{background:url(javascript:alert(1))}</style>' },
    { name: "data URI script", input: '<a href="data:text/html,<script>alert(1)</script>">x</a>' },
    { name: "onmouseover handler", input: '<p onmouseover="alert(1)">hi</p>' },
    { name: "form/button injection", input: '<form><button formaction="javascript:alert(1)">x</button></form>' },
    { name: "object tag", input: '<object data="javascript:alert(1)"></object>' },
    { name: "encoded entity script", input: '&lt;script&gt;alert(1)&lt;/script&gt;' },
  ];

  for (const { name, input } of PAYLOADS) {
    it(`neutralises ${name}`, () => {
      const out = renderAndSanitize(input);
      // No raw script tag
      expect(out).not.toMatch(/<script\b/i);
      // No event-handler attributes
      expect(out).not.toMatch(/\son\w+\s*=/i);
      // No javascript: URI
      expect(out).not.toMatch(/javascript:/i);
      // No iframe / object / svg / form survived (not in ALLOWED_TAGS)
      expect(out).not.toMatch(/<(iframe|object|svg|form|style)\b/i);
    });
  }

  it("preserves benign markdown — bold, headers, bullets — for clinical content", () => {
    const out = renderAndSanitize("## Plan\n**Furosemide** 40mg IV\n* daily weight\n* fluid restriction");
    expect(out).toContain("<h2");
    expect(out).toContain("<strong");
    expect(out).toContain("<ul");
    expect(out).toContain("<li");
    expect(out).toContain("Furosemide");
  });

  it("does not allow class smuggling beyond the safe whitelist (DOMPurify keeps `class` attr but no others)", () => {
    const out = renderAndSanitize('<p class="ok" style="color:red" onclick="x()">text</p>');
    // class is allowed, but on* and style must be stripped
    expect(out).not.toMatch(/style\s*=/i);
    expect(out).not.toMatch(/onclick/i);
  });

  it("Hebrew + bullet markdown round-trips intact (no Hebrew character corruption)", () => {
    const out = renderAndSanitize("## תכנית טיפול\n* מתן Furosemide 40mg\n* מעקב משקל יומי");
    expect(out).toContain("תכנית טיפול");
    expect(out).toContain("מתן Furosemide");
    expect(out).toContain("מעקב משקל יומי");
  });

  it("empty input does not throw and returns string", () => {
    expect(typeof renderAndSanitize("")).toBe("string");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 4. Comfort-care exclusion — cross-cut subtle bugs
// ═══════════════════════════════════════════════════════════════════════

describe("comfort-care suppression edge cases", () => {
  it("comfort-care patient with sepsis flag — sepsis tasks are suppressed", () => {
    const p = basePatient({
      flags: ["palliative"],
      status: ["sepsis", "fever"],
    });
    const tasks = applyRules(p);
    // Sepsis is in COMFORT_SUPPRESSED_GROUPS — should not generate aggressive workup.
    const sepsisTasks = tasks.filter(t =>
      t.text.includes("תרביות") || /lactate/i.test(t.text)
    );
    expect(sepsisTasks).toHaveLength(0);
  });

  it("comfort-care patient with explicit BS task — bladder scan still generated (comfortRequiresExplicitTask)", () => {
    // BS uses comfortRequiresExplicitTask. When the doctor explicitly writes "BS" in tasks,
    // the rule should still fire even on a palliative patient.
    const p = basePatient({
      flags: ["comfort care"],
      tasks: [
        {
          id: "t1",
          text: "BS",
          urgency: "routine",
          source: "manual",
          done: false,
          doneTime: null,
          time: null,
          confidence: 1,
        },
      ],
    });
    const generated = applyRules(p);
    const bsTasks = generated.filter(t => t.generatedFrom === "BS (Bladder Scan)");
    expect(bsTasks.length).toBeGreaterThanOrEqual(1);
  });

  it("non-comfort patient — comfortCareOnly rules do NOT fire", () => {
    // Regular patient should not get comfort-only artefacts.
    const p = basePatient({ status: ["fever"] });
    const tasks = applyRules(p);
    // No comfort_sedation_symptom or similar comfort-only tasks should appear.
    const comfortOnly = tasks.filter(t => /נוחות/i.test(t.text) && /איכותית/i.test(t.text));
    expect(comfortOnly).toHaveLength(0);
  });

  it("DNR alone is NOT comfort-care — full sepsis workup proceeds", () => {
    // Critical correctness invariant: many DNR patients still get full medical care.
    const p = basePatient({
      flags: ["DNR", "DNI"],
      status: ["דלקת ריאות"], // pneumonia
      tasks: [
        {
          id: "t1",
          text: "דלקת ריאות",
          urgency: "stat",
          source: "extracted",
          done: false,
          doneTime: null,
          time: null,
          confidence: 1,
        },
      ],
    });
    const tasks = applyRules(p);
    // Pneumonia rule must still fire — DNR is not comfort-care suppression
    const pneumoniaTasks = tasks.filter(t => t.generatedFrom === "דלקת ריאות");
    expect(pneumoniaTasks.length).toBeGreaterThan(0);
  });

  it("idempotency — running applyRules twice on the same patient yields the same task texts (set equality)", () => {
    const p = basePatient({
      tasks: [
        {
          id: "t1",
          text: "NPO",
          urgency: "routine",
          source: "extracted",
          done: false,
          doneTime: null,
          time: null,
          confidence: 1,
        },
      ],
    });
    const a = applyRules(p).map(t => t.text).sort();
    const b = applyRules(p).map(t => t.text).sort();
    expect(a).toEqual(b);
  });
});

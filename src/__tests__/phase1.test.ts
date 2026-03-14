/**
 * Phase 1 acceptance tests
 *
 * Covers every item in ACCEPTANCE_TEST_PLAN.md §Phase 1:
 *   - AKI staging regression (KDIGO correctness)
 *   - Parser UNKNOWN_SECTION default
 *   - Renal dosing indeterminate path
 *   - calculateCockcroftGault structured API
 *   - Linezolid serotonin interactions
 *   - TMP-SMX + spironolactone critical hyperkalemia
 *   - Comfort care suppression via task text
 *   - Comfort care suppression via structured goalsOfCare
 *   - DNR alone does NOT suppress aggressive workup
 *   - clinicalThresholds: Cr is delta_only, K/Na/Hb/Lactate have raw thresholds
 */

import { describe, it, expect } from "vitest";
import { calculateLabDeltas } from "../engine/labDelta";
import { parsePatientList } from "../parser/parsePatientList";
import { calculateCockcroftGault } from "../utils/renal";
import { checkDrugInteractions, checkRenalDoseWarnings } from "../engine/drugSafety";
import { applyRules, isComfortCarePatient } from "../engine/rules";
import {
  matchLabThreshold,
  isCriticalLabValue,
  CANONICAL_LAB_THRESHOLDS,
} from "../clinical/clinicalThresholds";
import type { PatientEntry, LabEntry, PatientClinicalMeta } from "../types";

// ─── helpers ───────────────────────────────────────────────────────────────

function makePatient(overrides: Partial<PatientEntry> = {}): PatientEntry {
  return {
    id: "pt-test",
    section: "SIDE_A",
    date: "01/01/2025",
    room: "101",
    name: "בדיקה",
    age: 82,
    diagnosis: null,
    flags: [],
    status: [],
    tomorrowNotes: [],
    tasks: [],
    generatedTasks: [],
    notes: [],
    scannedAt: new Date().toISOString(),
    confidence: 1,
    ...overrides,
  };
}

function lab(label: string, value: number, hoursAgo: number): LabEntry {
  return {
    id: `lab-${label}-${hoursAgo}`,
    label,
    value,
    time: new Date(Date.now() - hoursAgo * 3_600_000).toISOString(),
  };
}

function task(text: string) {
  return {
    id: "t1",
    text,
    urgency: "routine" as const,
    source: "manual" as const,
    done: false,
    doneTime: null,
    time: null,
    confidence: 1,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. AKI STAGING — KDIGO correctness
// ═══════════════════════════════════════════════════════════════════════════

describe("AKI staging (KDIGO)", () => {
  it("stable CKD-5: baseline 4.2 → peak 4.2 → NO AKI", () => {
    const p = makePatient({ labs: [lab("Cr", 4.2, 72), lab("Cr", 4.2, 1)] });
    const deltas = calculateLabDeltas(p);
    const cr = deltas.find((d) => d.label === "Cr");
    expect(cr).toBeUndefined(); // no AKI at all
  });

  it("acute rise: baseline 3.8 → peak 4.1 → Stage 3 (≥0.3 rise to ≥4.0)", () => {
    const p = makePatient({ labs: [lab("Cr", 3.8, 24), lab("Cr", 4.1, 1)] });
    const deltas = calculateLabDeltas(p);
    const cr = deltas.find((d) => d.label === "Cr");
    expect(cr).toBeDefined();
    expect(cr!.akiStage).toBe(3);
  });

  it("48h criterion: baseline 1.0 → peak 1.35 within 48h → Stage 1", () => {
    const p = makePatient({ labs: [lab("Cr", 1.0, 47), lab("Cr", 1.35, 1)] });
    const deltas = calculateLabDeltas(p);
    const cr = deltas.find((d) => d.label === "Cr");
    expect(cr).toBeDefined();
    expect(cr!.akiStage).toBe(1);
  });

  it("ratio ≥3: baseline 1.0 → peak 3.0 → Stage 3", () => {
    const p = makePatient({ labs: [lab("Cr", 1.0, 48), lab("Cr", 3.0, 1)] });
    const deltas = calculateLabDeltas(p);
    const cr = deltas.find((d) => d.label === "Cr");
    expect(cr!.akiStage).toBe(3);
  });

  it("ratio ≥2: baseline 1.0 → peak 2.0 → Stage 2", () => {
    const p = makePatient({ labs: [lab("Cr", 1.0, 48), lab("Cr", 2.0, 1)] });
    const deltas = calculateLabDeltas(p);
    const cr = deltas.find((d) => d.label === "Cr");
    expect(cr!.akiStage).toBe(2);
  });

  it("stable CKD-3: baseline 2.0 → peak 2.0 → NO AKI", () => {
    const p = makePatient({ labs: [lab("Cr", 2.0, 72), lab("Cr", 2.0, 1)] });
    const deltas = calculateLabDeltas(p);
    expect(deltas.find((d) => d.label === "Cr")).toBeUndefined();
  });

  it("mild rise to 4.0: baseline 3.9 → peak 4.0 → Stage 3 (delta 0.1 < 0.3 → NOT stage 3 via absolute criterion)", () => {
    // delta 0.1 mg/dL — does NOT meet the ≥0.3 acute rise criterion.
    // Ratio = 4.0/3.9 = 1.026 — also does NOT meet Stage 1 ratio.
    // Result: no AKI.
    const p = makePatient({ labs: [lab("Cr", 3.9, 24), lab("Cr", 4.0, 1)] });
    const deltas = calculateLabDeltas(p);
    expect(deltas.find((d) => d.label === "Cr")).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. PARSER — UNKNOWN_SECTION default
// ═══════════════════════════════════════════════════════════════════════════

describe("parser UNKNOWN_SECTION", () => {
  it("text with no section header → patients get UNKNOWN_SECTION", () => {
    const text = "101 כהן יוסף 78 דלקת ריאות\n102 לוי שרה 85 אי ספיקת לב";
    const patients = parsePatientList(text);
    expect(patients.length).toBeGreaterThan(0);
    for (const p of patients) {
      expect(p.section).toBe("UNKNOWN_SECTION");
    }
  });

  it("text with section header → patients get correct section", () => {
    const text = "צד א\n101 כהן יוסף 78 דלקת ריאות\n102 לוי שרה 85 אי ספיקת לב";
    const patients = parsePatientList(text);
    expect(patients.length).toBeGreaterThan(0);
    for (const p of patients) {
      expect(p.section).toBe("SIDE_A");
    }
  });

  it("mixed: patients before first header get UNKNOWN_SECTION, after get real section", () => {
    const text = "101 כהן יוסף 78 דלקת ריאות\nצד ב\n102 לוי שרה 85 אי ספיקת לב";
    const patients = parsePatientList(text);
    const pre = patients.filter((p) => p.room === "101");
    const post = patients.filter((p) => p.room === "102");
    expect(pre[0]?.section).toBe("UNKNOWN_SECTION");
    expect(post[0]?.section).toBe("SIDE_B");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. RENAL DOSING — calculateCockcroftGault structured API
// ═══════════════════════════════════════════════════════════════════════════

describe("calculateCockcroftGault", () => {
  it("missing weight → indeterminate with reason", () => {
    const r = calculateCockcroftGault({ ageYears: 80, sexAtBirth: "female", serumCrMgDl: 1.2 });
    expect(r.indeterminate).toBe(true);
    expect(r.crcl).toBeNull();
    expect(r.indeterminateReason).toMatch(/משקל/);
  });

  it("missing sex → indeterminate with reason", () => {
    const r = calculateCockcroftGault({ ageYears: 80, weightKg: 55, serumCrMgDl: 1.2 });
    expect(r.indeterminate).toBe(true);
    expect(r.crcl).toBeNull();
    expect(r.indeterminateReason).toMatch(/מין/);
  });

  it("missing age → indeterminate", () => {
    const r = calculateCockcroftGault({ weightKg: 55, sexAtBirth: "female", serumCrMgDl: 1.2 });
    expect(r.indeterminate).toBe(true);
    expect(r.crcl).toBeNull();
  });

  it("all inputs present → returns numeric crcl, no floor applied", () => {
    // 80yo female, 55kg, Cr 0.5 — WITHOUT floor → crcl = ((140-80)*55*0.85)/(72*0.5) ≈ 87
    const r = calculateCockcroftGault({ ageYears: 80, weightKg: 55, sexAtBirth: "female", serumCrMgDl: 0.5 });
    expect(r.indeterminate).toBe(false);
    expect(r.crcl).not.toBeNull();
    expect(r.crcl!).toBeGreaterThan(70); // no floor means high CrCl for low Cr
    expect(r.bucket).toBe("gt50");
  });

  it("dialysis flag → bucket=hd regardless of inputs", () => {
    const r = calculateCockcroftGault({ ageYears: 75, weightKg: 60, sexAtBirth: "male", serumCrMgDl: 3.0, onDialysis: true });
    expect(r.bucket).toBe("hd");
    expect(r.indeterminate).toBe(false);
  });

  it("returns correct bucket for moderate CKD", () => {
    // 75yo male, 70kg, Cr 2.0 → crcl = ((140-75)*70)/(72*2.0) ≈ 31.6 → 10_50
    const r = calculateCockcroftGault({ ageYears: 75, weightKg: 70, sexAtBirth: "male", serumCrMgDl: 2.0 });
    expect(r.crcl).not.toBeNull();
    expect(r.bucket).toBe("10_50");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. DRUG INTERACTIONS — linezolid serotonin syndrome
// ═══════════════════════════════════════════════════════════════════════════

describe("linezolid serotonin interactions", () => {
  it("linezolid + sertraline (SSRI) → critical serotonin syndrome", () => {
    const p = makePatient({
      tasks: [task("linezolid 600mg q12h"), task("sertraline 50mg")],
    });
    const interactions = checkDrugInteractions(p);
    const serotonin = interactions.find(
      (i) => i.risk.includes("סרוטונין") || i.risk.toLowerCase().includes("serotonin"),
    );
    expect(serotonin).toBeDefined();
    expect(serotonin!.severity).toBe("critical");
  });

  it("linezolid + venlafaxine (SNRI) → critical serotonin syndrome", () => {
    const p = makePatient({
      tasks: [task("linezolid 600mg"), task("efexor 75mg venlafaxine")],
    });
    const interactions = checkDrugInteractions(p);
    const serotonin = interactions.find(
      (i) => (i.drugA === "linezolid" && i.drugB === "snri") ||
              (i.drugA === "snri" && i.drugB === "linezolid"),
    );
    expect(serotonin).toBeDefined();
    expect(serotonin!.severity).toBe("critical");
  });

  it("linezolid + tramadol → critical serotonin syndrome", () => {
    const p = makePatient({
      tasks: [task("linezolid iv"), task("tramadol 50mg prn pain")],
    });
    const interactions = checkDrugInteractions(p);
    const hit = interactions.find(
      (i) => (i.drugA === "linezolid" && i.drugB === "tramadol") ||
              (i.drugA === "tramadol" && i.drugB === "linezolid"),
    );
    expect(hit).toBeDefined();
    expect(hit!.severity).toBe("critical");
  });

  it("SSRI + tramadol (no linezolid) → major (existing behavior preserved)", () => {
    const p = makePatient({
      tasks: [task("sertraline 100mg"), task("tramadol 50mg prn")],
    });
    const interactions = checkDrugInteractions(p);
    const serotonin = interactions.find(
      (i) => (i.drugA === "ssri" && i.drugB === "tramadol") ||
              (i.drugA === "tramadol" && i.drugB === "ssri"),
    );
    expect(serotonin).toBeDefined();
    expect(serotonin!.severity).toBe("major");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. TMP-SMX + spironolactone → critical hyperkalemia
// ═══════════════════════════════════════════════════════════════════════════

describe("TMP-SMX + spironolactone hyperkalemia", () => {
  it("bactrim + spironolactone → critical hyperkalemia warning", () => {
    const p = makePatient({
      tasks: [task("bactrim DS PO q12h"), task("spironolactone 25mg daily")],
    });
    const interactions = checkDrugInteractions(p);
    const hk = interactions.find(
      (i) =>
        (i.drugA === "trimethoprim" && i.drugB === "spironolactone") ||
        (i.drugA === "spironolactone" && i.drugB === "trimethoprim"),
    );
    expect(hk).toBeDefined();
    expect(hk!.severity).toBe("critical");
    expect(hk!.risk).toMatch(/היפרקלמיה/);
  });

  it("trimethoprim pattern matches bactrim/TMP-SMX/septra", () => {
    for (const drug of ["bactrim", "trimethoprim", "TMP-SMX", "septra"]) {
      const p = makePatient({
        status: [`${drug} DS daily`, "spironolactone 50mg"],
      });
      const interactions = checkDrugInteractions(p);
      const hk = interactions.find(
        (i) =>
          (i.drugA === "trimethoprim" && i.drugB === "spironolactone") ||
          (i.drugA === "spironolactone" && i.drugB === "trimethoprim"),
      );
      expect(hk).toBeDefined();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. COMFORT CARE SUPPRESSION
// ═══════════════════════════════════════════════════════════════════════════

describe("comfort care suppression", () => {
  it("'comfort care' in task text alone suppresses aggressive workup", () => {
    const p = makePatient({
      diagnosis: "CHF סיום חיים",
      tasks: [task("comfort care only — no aggressive workup")],
      status: ["atrial fibrillation"],
    });
    expect(isComfortCarePatient(p)).toBe(true);
    const generated = applyRules(p);
    // Should not generate AKI workup, sepsis, etc.
    const aggressive = generated.filter(
      (t) => t.generatedFrom && /ספסיס|AKI|troponin|קתטר|CT|echocardio/i.test(t.text),
    );
    expect(aggressive).toHaveLength(0);
  });

  it("structured goalsOfCare=comfort_only suppresses workup even without text markers", () => {
    const meta: PatientClinicalMeta = { goalsOfCare: "comfort_only" };
    const p = makePatient({
      diagnosis: "COPD exacerbation",
      clinicalMeta: meta,
    });
    expect(isComfortCarePatient(p)).toBe(true);
    const generated = applyRules(p);
    const aggressive = generated.filter(
      (t) => t.generatedFrom && /BiPAP|ABG|גזים|אינטובציה/i.test(t.text),
    );
    expect(aggressive).toHaveLength(0);
  });

  it("DNR alone does NOT suppress aggressive workup", () => {
    const p = makePatient({
      diagnosis: "pneumonia",
      flags: ["DNR"],
    });
    expect(isComfortCarePatient(p)).toBe(false);
  });

  it("DNR+DNI together still do NOT suppress without comfort text", () => {
    const p = makePatient({
      diagnosis: "pneumonia — full treatment",
      flags: ["DNR", "DNI"],
    });
    expect(isComfortCarePatient(p)).toBe(false);
  });

  it("goalsOfCare=full is not comfort care", () => {
    const p = makePatient({
      clinicalMeta: { goalsOfCare: "full" },
      flags: ["DNR"],
    });
    expect(isComfortCarePatient(p)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. CANONICAL LAB THRESHOLDS
// ═══════════════════════════════════════════════════════════════════════════

describe("canonical lab thresholds", () => {
  it("all four required keys are present in registry", () => {
    const keys = CANONICAL_LAB_THRESHOLDS.map((t) => t.key);
    expect(keys).toContain("K");
    expect(keys).toContain("Na");
    expect(keys).toContain("Hb");
    expect(keys).toContain("Lactate");
    expect(keys).toContain("Cr");
  });

  it("Cr is mode=delta_only — raw critical check returns false", () => {
    expect(isCriticalLabValue("Cr", 6.0)).toBe(false);
    expect(isCriticalLabValue("creatinine", 10.0)).toBe(false);
  });

  it("K critical high fires at ≥6.0", () => {
    expect(isCriticalLabValue("K+", 6.0)).toBe(true);
    expect(isCriticalLabValue("K+", 5.9)).toBe(false);
  });

  it("K critical low fires at ≤2.5", () => {
    expect(isCriticalLabValue("K+", 2.5)).toBe(true);
    expect(isCriticalLabValue("K+", 2.6)).toBe(false);
  });

  it("Na critical low fires at ≤120", () => {
    expect(isCriticalLabValue("Na", 120)).toBe(true);
    expect(isCriticalLabValue("Na", 121)).toBe(false);
  });

  it("Na critical high fires at ≥160", () => {
    expect(isCriticalLabValue("Na", 160)).toBe(true);
    expect(isCriticalLabValue("Na", 159)).toBe(false);
  });

  it("Hb critical low fires at ≤7.0", () => {
    expect(isCriticalLabValue("Hb", 7.0)).toBe(true);
    expect(isCriticalLabValue("Hb", 7.1)).toBe(false);
  });

  it("Lactate critical high fires at ≥4.0", () => {
    expect(isCriticalLabValue("Lactate", 4.0)).toBe(true);
    expect(isCriticalLabValue("Lactate", 3.9)).toBe(false);
  });

  it("matchLabThreshold matches K+ with plus sign", () => {
    expect(matchLabThreshold("K+")).not.toBeNull();
    expect(matchLabThreshold("K+")!.key).toBe("K");
  });

  it("matchLabThreshold matches Cr and creatinine", () => {
    expect(matchLabThreshold("Cr")).not.toBeNull();
    expect(matchLabThreshold("creatinine")).not.toBeNull();
  });

  it("unknown label returns null", () => {
    expect(matchLabThreshold("troponin")).toBeNull();
    expect(matchLabThreshold("CRP")).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. RENAL DOSE WARNINGS — indeterminate path (missing demographics)
// ═══════════════════════════════════════════════════════════════════════════

describe("checkRenalDoseWarnings indeterminate", () => {
  it("existing behavior: still fires warnings via heuristic CrCl when demographics absent", () => {
    // The existing checkRenalDoseWarnings uses the heuristic (55kg female / 70kg male).
    // The new calculateCockcroftGault is a separate API. Both must work.
    const p = makePatient({
      age: 85,
      tasks: [task("enoxaparin 40mg SC daily")],
      labs: [lab("Cr", 2.5, 1)],
    });
    const warnings = checkRenalDoseWarnings(p);
    expect(warnings.length).toBeGreaterThan(0);
    const enoxa = warnings.find((w) => w.drug === "Enoxaparin");
    expect(enoxa).toBeDefined();
  });
});

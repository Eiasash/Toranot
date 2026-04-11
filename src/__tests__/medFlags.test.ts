/**
 * Tests for src/components/MedFlags.tsx — analyzeMeds pure function
 *
 * Covers: anticholinergic burden scoring, QTc prolongation detection,
 * nephrotoxicity, fall risk, Beers criteria, combinatorial edge cases.
 */
import { describe, it, expect } from "vitest";
import { analyzeMeds, type MedFlag } from "../components/MedFlags";
import type { PatientEntry } from "../types";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makePatient(overrides: Partial<PatientEntry> = {}): PatientEntry {
  return {
    id: "p1",
    section: "SIDE_A",
    date: "01/04/2026",
    room: "70",
    name: "כהן יוסף",
    age: 82,
    diagnosis: null,
    status: [],
    flags: [],
    tomorrowNotes: [],
    tasks: [],
    generatedTasks: [],
    notes: [],
    labs: [],
    order: 0,
    scannedAt: new Date().toISOString(),
    confidence: 1,
    ...overrides,
  };
}

function flagLabels(flags: MedFlag[]): string[] {
  return flags.map((f) => f.label);
}

// ─── Anticholinergic Burden ─────────────────────────────────────────────────

describe("analyzeMeds — anticholinergic burden", () => {
  it("no flag for single moderate anticholinergic (score 1)", () => {
    const p = makePatient({ diagnosis: "quetiapine for sleep" });
    const flags = analyzeMeds(p);
    expect(flags.find((f) => f.label.includes("אנטיכולינרגי"))).toBeUndefined();
  });

  it("flags burden ≥3 from one high-ACB drug (score 3)", () => {
    const p = makePatient({ diagnosis: "amitriptyline for neuropathy" });
    const flags = analyzeMeds(p);
    const acb = flags.find((f) => f.label.includes("אנטיכולינרגי"));
    expect(acb).toBeDefined();
    expect(acb!.color).toBe("amber");
    expect(acb!.meds).toContain("amitriptyline");
  });

  it("flags high burden ≥6 as red (two high-ACB drugs)", () => {
    const p = makePatient({
      diagnosis: "amitriptyline, oxybutynin",
    });
    const flags = analyzeMeds(p);
    const acb = flags.find((f) => f.label.includes("אנטיכולינרגי"));
    expect(acb).toBeDefined();
    expect(acb!.color).toBe("red");
  });

  it("counts moderate drugs (score 1 each) — 3 moderates = score 3", () => {
    const p = makePatient({
      diagnosis: "quetiapine, cetirizine, tramadol",
    });
    const flags = analyzeMeds(p);
    const acb = flags.find((f) => f.label.includes("אנטיכולינרגי"));
    expect(acb).toBeDefined();
    expect(acb!.color).toBe("amber");
  });
});

// ─── QTc Prolongation ───────────────────────────────────────────────────────

describe("analyzeMeds — QTc prolongation", () => {
  it("amber flag for single QTc-prolonging drug", () => {
    const p = makePatient({ diagnosis: "amiodarone" });
    const flags = analyzeMeds(p);
    const qtc = flags.find((f) => f.label.includes("QTc"));
    expect(qtc).toBeDefined();
    expect(qtc!.color).toBe("amber");
    expect(qtc!.label).toContain("עקוב");
  });

  it("red flag for ≥2 QTc-prolonging drugs", () => {
    const p = makePatient({ diagnosis: "amiodarone ciprofloxacin" });
    const flags = analyzeMeds(p);
    const qtc = flags.find((f) => f.label.includes("QTc"));
    expect(qtc).toBeDefined();
    expect(qtc!.color).toBe("red");
    expect(qtc!.label).toContain("2");
  });

  it("no QTc flag when no QTc drugs present", () => {
    const p = makePatient({ diagnosis: "metformin aspirin" });
    const flags = analyzeMeds(p);
    expect(flags.find((f) => f.label.includes("QTc"))).toBeUndefined();
  });
});

// ─── Nephrotoxicity ─────────────────────────────────────────────────────────

describe("analyzeMeds — nephrotoxicity", () => {
  it("amber flag for single nephrotoxic drug", () => {
    const p = makePatient({ diagnosis: "vancomycin" });
    const flags = analyzeMeds(p);
    const nephro = flags.find((f) => f.label.includes("נפרוטוקסי"));
    expect(nephro).toBeDefined();
    expect(nephro!.color).toBe("amber");
  });

  it("red flag for ≥2 nephrotoxic drugs", () => {
    const p = makePatient({ diagnosis: "vancomycin gentamicin" });
    const flags = analyzeMeds(p);
    const nephro = flags.find((f) => f.label.includes("נפרוטוקסי"));
    expect(nephro).toBeDefined();
    expect(nephro!.color).toBe("red");
  });

  it("detects NSAIDs as nephrotoxic", () => {
    const p = makePatient({ diagnosis: "ibuprofen" });
    const flags = analyzeMeds(p);
    const nephro = flags.find((f) => f.label.includes("נפרוטוקסי"));
    expect(nephro).toBeDefined();
    expect(nephro!.meds).toContain("ibuprofen");
  });
});

// ─── Fall Risk ──────────────────────────────────────────────────────────────

describe("analyzeMeds — fall risk", () => {
  it("no flag for single fall-risk drug", () => {
    const p = makePatient({ diagnosis: "lorazepam" });
    const flags = analyzeMeds(p);
    expect(flags.find((f) => f.label.includes("נפילה"))).toBeUndefined();
  });

  it("amber flag for 2 fall-risk drugs", () => {
    const p = makePatient({ diagnosis: "lorazepam quetiapine" });
    const flags = analyzeMeds(p);
    const fall = flags.find((f) => f.label.includes("נפילה"));
    expect(fall).toBeDefined();
    expect(fall!.color).toBe("amber");
  });

  it("red flag for ≥3 fall-risk drugs", () => {
    const p = makePatient({ diagnosis: "lorazepam quetiapine tramadol" });
    const flags = analyzeMeds(p);
    const fall = flags.find((f) => f.label.includes("נפילה"));
    expect(fall).toBeDefined();
    expect(fall!.color).toBe("red");
  });
});

// ─── Beers Criteria ─────────────────────────────────────────────────────────

describe("analyzeMeds — Beers criteria", () => {
  it("flags Beers-avoid drugs", () => {
    const p = makePatient({ diagnosis: "glibenclamide" });
    const flags = analyzeMeds(p);
    const beers = flags.find((f) => f.label.includes("Beers"));
    expect(beers).toBeDefined();
    expect(beers!.color).toBe("red");
    expect(beers!.meds).toContain("glibenclamide");
  });

  it("flags meperidine as Beers-avoid", () => {
    const p = makePatient({ diagnosis: "meperidine for pain" });
    const flags = analyzeMeds(p);
    expect(flags.find((f) => f.label.includes("Beers"))).toBeDefined();
  });

  it("no Beers flag for safe medications", () => {
    const p = makePatient({ diagnosis: "aspirin metformin" });
    const flags = analyzeMeds(p);
    expect(flags.find((f) => f.label.includes("Beers"))).toBeUndefined();
  });
});

// ─── Combinatorial / Edge Cases ─────────────────────────────────────────────

describe("analyzeMeds — combinatorial", () => {
  it("multiple categories flagged simultaneously", () => {
    // amitriptyline = high ACB + fall risk
    // ciprofloxacin = QTc + nephrotoxic
    // lorazepam = fall risk
    // glibenclamide = Beers
    const p = makePatient({
      diagnosis: "amitriptyline ciprofloxacin lorazepam glibenclamide",
    });
    const flags = analyzeMeds(p);
    const labels = flagLabels(flags);
    expect(labels.some((l) => l.includes("אנטיכולינרגי"))).toBe(true);
    expect(labels.some((l) => l.includes("QTc"))).toBe(true);
    expect(labels.some((l) => l.includes("נפילה"))).toBe(true);
    expect(labels.some((l) => l.includes("Beers"))).toBe(true);
  });

  it("returns empty array for no medications", () => {
    const p = makePatient({ diagnosis: "" });
    expect(analyzeMeds(p)).toEqual([]);
  });

  it("returns empty array for null diagnosis", () => {
    const p = makePatient({ diagnosis: null });
    expect(analyzeMeds(p)).toEqual([]);
  });

  it("extracts meds from tasks, not just diagnosis", () => {
    const p = makePatient({
      diagnosis: "UTI",
      tasks: [{ id: "t1", text: "vancomycin 1g q12h", urgency: "routine", source: "extracted", done: false, doneTime: null, time: null, confidence: 1 }],
    });
    const flags = analyzeMeds(p);
    expect(flags.find((f) => f.meds.includes("vancomycin"))).toBeDefined();
  });

  it("extracts meds from notes", () => {
    const p = makePatient({
      notes: ["started on amiodarone, ciprofloxacin"],
    });
    const flags = analyzeMeds(p);
    const qtc = flags.find((f) => f.label.includes("QTc"));
    expect(qtc).toBeDefined();
    expect(qtc!.meds).toContain("amiodarone");
    expect(qtc!.meds).toContain("ciprofloxacin");
  });

  it("case-insensitive matching", () => {
    const p = makePatient({ diagnosis: "VANCOMYCIN GENTAMICIN" });
    const flags = analyzeMeds(p);
    // extractMedNames lowercases everything
    expect(flags.find((f) => f.label.includes("נפרוטוקסי"))).toBeDefined();
  });
});

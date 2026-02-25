import { describe, it, expect } from "vitest";
import { generateHints } from "../engine/hints";
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
    tasks: [],
    generatedTasks: [],
    notes: overrides.notes ?? [],
    scannedAt: new Date().toISOString(),
    confidence: 1,
    handoverNote: overrides.handoverNote ?? undefined,
  };
}

describe("generateHints", () => {
  it("returns empty for patient with no diagnosis/flags/status", () => {
    const p = makePatient();
    expect(generateHints(p)).toEqual([]);
  });

  it("returns empty for blank-only text", () => {
    const p = makePatient({ diagnosis: "   " });
    expect(generateHints(p)).toEqual([]);
  });

  // ── Individual hint rules ──

  it("generates PE hint", () => {
    const p = makePatient({ diagnosis: "PE" });
    const hints = generateHints(p);
    expect(hints.some((h) => h.title.includes("PE"))).toBe(true);
  });

  it("generates DVT hint", () => {
    const p = makePatient({ diagnosis: "DVT" });
    const hints = generateHints(p);
    expect(hints.some((h) => h.title.includes("DVT"))).toBe(true);
  });

  it("generates CHF hint", () => {
    const p = makePatient({ diagnosis: "CHF" });
    const hints = generateHints(p);
    expect(hints.some((h) => h.title.includes("אי-ספיקת לב"))).toBe(true);
  });

  it("generates CHF hint from Hebrew diagnosis", () => {
    const p = makePatient({ diagnosis: "אי ספיקת לב" });
    const hints = generateHints(p);
    expect(hints.some((h) => h.title.includes("אי-ספיקת לב"))).toBe(true);
  });

  it("generates CAD/ACS hint", () => {
    const p = makePatient({ diagnosis: "NSTEMI" });
    const hints = generateHints(p);
    expect(hints.some((h) => h.title.includes("CAD"))).toBe(true);
  });

  it("generates AF hint", () => {
    const p = makePatient({ diagnosis: "AF" });
    const hints = generateHints(p);
    expect(hints.some((h) => h.title.includes("AF"))).toBe(true);
  });

  it("generates stroke/CVA hint", () => {
    const p = makePatient({ diagnosis: "CVA" });
    const hints = generateHints(p);
    expect(hints.some((h) => h.title.includes("שבץ"))).toBe(true);
  });

  it("generates diabetes hint", () => {
    const p = makePatient({ diagnosis: "DM2" });
    const hints = generateHints(p);
    expect(hints.some((h) => h.title.includes("סוכרת"))).toBe(true);
  });

  it("generates CKD hint", () => {
    const p = makePatient({ diagnosis: "CKD stage 4" });
    const hints = generateHints(p);
    expect(hints.some((h) => h.title.includes("CKD"))).toBe(true);
  });

  it("generates CKD hint for dialysis patients", () => {
    const p = makePatient({ status: ["dialysis 3x/week"] });
    const hints = generateHints(p);
    expect(hints.some((h) => h.title.includes("CKD"))).toBe(true);
  });

  it("generates COPD hint", () => {
    const p = makePatient({ diagnosis: "COPD" });
    const hints = generateHints(p);
    expect(hints.some((h) => h.title.includes("COPD"))).toBe(true);
  });

  it("generates dementia hint", () => {
    const p = makePatient({ diagnosis: "דמנציה" });
    const hints = generateHints(p);
    expect(hints.some((h) => h.title.includes("דמנציה"))).toBe(true);
  });

  it("generates endocarditis hint", () => {
    const p = makePatient({ diagnosis: "endocarditis" });
    const hints = generateHints(p);
    expect(hints.some((h) => h.title.includes("אנדוקרדיטיס"))).toBe(true);
  });

  it("generates liver disease hint", () => {
    const p = makePatient({ diagnosis: "cirrhosis" });
    const hints = generateHints(p);
    expect(hints.some((h) => h.title.includes("מחלת כבד"))).toBe(true);
  });

  it("generates anticoagulation hint", () => {
    const p = makePatient({ flags: ["warfarin"] });
    const hints = generateHints(p);
    expect(hints.some((h) => h.title.includes("אנטיקואגולציה"))).toBe(true);
  });

  it("generates Parkinson's hint", () => {
    const p = makePatient({ diagnosis: "פרקינסון" });
    const hints = generateHints(p);
    expect(hints.some((h) => h.title.includes("פרקינסון"))).toBe(true);
  });

  it("generates hip fracture hint", () => {
    const p = makePatient({ diagnosis: "שבר ירך" });
    const hints = generateHints(p);
    expect(hints.some((h) => h.title.includes("שבר ירך"))).toBe(true);
  });

  it("generates pressure ulcer hint", () => {
    const p = makePatient({ status: ["פצע לחץ stage 2"] });
    const hints = generateHints(p);
    expect(hints.some((h) => h.title.includes("פצעי לחץ"))).toBe(true);
  });

  it("generates tube feeding hint", () => {
    const p = makePatient({ status: ["PEG feeding"] });
    const hints = generateHints(p);
    expect(hints.some((h) => h.title.includes("הזנה צינורית"))).toBe(true);
  });

  it("generates ascites hint", () => {
    const p = makePatient({ diagnosis: "ascites" });
    const hints = generateHints(p);
    expect(hints.some((h) => h.title.includes("מיימת"))).toBe(true);
  });

  // ── Deduplication ──

  it("does not duplicate hints for the same trigger appearing multiple times", () => {
    const p = makePatient({
      diagnosis: "CHF",
      status: ["אי ספיקת לב known"],
    });
    const hints = generateHints(p);
    const chfHints = hints.filter((h) => h.title.includes("אי-ספיקת לב"));
    expect(chfHints).toHaveLength(1);
  });

  // ── Multiple hints ──

  it("generates multiple hints for multiple diagnoses", () => {
    const p = makePatient({
      diagnosis: "CHF, AF, DM2",
    });
    const hints = generateHints(p);
    expect(hints.length).toBeGreaterThanOrEqual(3);
  });

  // ── Sources ──

  it("searches diagnosis, flags, status, notes, and handoverNote", () => {
    const pDiag = makePatient({ diagnosis: "PE" });
    const pFlag = makePatient({ flags: ["warfarin"] });
    const pStatus = makePatient({ status: ["COPD exacerbation"] });
    const pNotes = makePatient({ notes: ["דמנציה known"] });
    const pHandover = makePatient({ handoverNote: "patient has AF" });

    expect(generateHints(pDiag).length).toBeGreaterThan(0);
    expect(generateHints(pFlag).length).toBeGreaterThan(0);
    expect(generateHints(pStatus).length).toBeGreaterThan(0);
    expect(generateHints(pNotes).length).toBeGreaterThan(0);
    expect(generateHints(pHandover).length).toBeGreaterThan(0);
  });

  // ── Hint structure ──

  it("each hint has emoji, title, and non-empty tips", () => {
    const p = makePatient({ diagnosis: "CHF, PE, DVT, COPD" });
    const hints = generateHints(p);
    for (const h of hints) {
      expect(h.emoji).toBeTruthy();
      expect(h.title).toBeTruthy();
      expect(h.tips.length).toBeGreaterThan(0);
    }
  });
});

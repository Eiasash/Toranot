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


  // ── High-priority clinical hints not yet covered ────────────────────────

  it("generates sepsis hint", () => {
    const p = makePatient({ diagnosis: "sepsis" });
    expect(generateHints(p).some(h => h.title.includes("ספסיס"))).toBe(true);
  });

  it("generates pneumonia hint", () => {
    const p = makePatient({ diagnosis: "PNEUMONIA" });
    expect(generateHints(p).some(h => h.title.includes("דלקת ריאות"))).toBe(true);
  });

  it("generates UTI hint", () => {
    const p = makePatient({ diagnosis: "UTI" });
    expect(generateHints(p).some(h => h.title.includes("UTI"))).toBe(true);
  });

  it("generates AKI hint", () => {
    const p = makePatient({ diagnosis: "AKI" });
    expect(generateHints(p).some(h => h.title.includes("AKI"))).toBe(true);
  });

  it("generates delirium hint", () => {
    const p = makePatient({ status: ["דליריום"] });
    expect(generateHints(p).some(h => h.title.includes("דליריום"))).toBe(true);
  });

  it("generates falls hint", () => {
    const p = makePatient({ diagnosis: "fall risk" });
    expect(generateHints(p).some(h => h.title.includes("נפילות"))).toBe(true);
  });

  it("generates GI bleed hint", () => {
    const p = makePatient({ diagnosis: "GI bleed" });
    expect(generateHints(p).some(h => h.title.includes("דימום GI"))).toBe(true);
  });

  it("generates DKA hint", () => {
    const p = makePatient({ diagnosis: "DKA" });
    expect(generateHints(p).some(h => h.title.includes("DKA"))).toBe(true);
  });

  it("generates digoxin toxicity hint", () => {
    const p = makePatient({ diagnosis: "digoxin toxicity" });
    expect(generateHints(p).some(h => h.title.includes("דיגוקסין"))).toBe(true);
  });

  it("generates NIV/BiPAP hint", () => {
    const p = makePatient({ status: ["on BiPAP"] });
    expect(generateHints(p).some(h => h.title.includes("BiPAP"))).toBe(true);
  });

  it("generates dialysis hint", () => {
    const p = makePatient({ diagnosis: "ESRD on dialysis" });
    expect(generateHints(p).some(h => h.title.includes("דיאליזה"))).toBe(true);
  });

  it("generates neutropenic fever hint", () => {
    const p = makePatient({ diagnosis: "neutropenic fever" });
    expect(generateHints(p).some(h => h.title.includes("חום נויטרופני"))).toBe(true);
  });

  it("generates NMS hint", () => {
    const p = makePatient({ diagnosis: "NMS suspected" });
    expect(generateHints(p).some(h => h.title.includes("NMS"))).toBe(true);
  });

  it("generates serotonin syndrome hint", () => {
    const p = makePatient({ diagnosis: "serotonin syndrome" });
    expect(generateHints(p).some(h => h.title.includes("סרוטונין"))).toBe(true);
  });

  it("generates palliative care hint", () => {
    const p = makePatient({ flags: ["טיפול מנחם"] });
    expect(generateHints(p).some(h => h.title.includes("טיפול מנחם"))).toBe(true);
  });

  it("generates alcohol withdrawal hint", () => {
    const p = makePatient({ diagnosis: "alcohol withdrawal" });
    expect(generateHints(p).some(h => h.title.includes("גמילה מאלכוהול"))).toBe(true);
  });

  it("generates seizure hint", () => {
    const p = makePatient({ diagnosis: "seizure disorder" });
    expect(generateHints(p).some(h => h.title.includes("פרכוס"))).toBe(true);
  });

  it("generates pleural effusion hint", () => {
    const p = makePatient({ diagnosis: "pleural effusion" });
    expect(generateHints(p).some(h => h.title.includes("תפליט"))).toBe(true);
  });

  it("generates post-operative hint", () => {
    const p = makePatient({ status: ["post-op day 1"] });
    expect(generateHints(p).some(h => h.title.includes("פוסט-ניתוחי"))).toBe(true);
  });

  it("generates hyponatremia hint", () => {
    const p = makePatient({ diagnosis: "hyponatremia" });
    expect(generateHints(p).some(h => h.title.includes("היפונתרמיה"))).toBe(true);
  });

  it("generates hyperkalemia hint", () => {
    const p = makePatient({ diagnosis: "hyperkalemia" });
    expect(generateHints(p).some(h => h.title.includes("היפרקלמיה"))).toBe(true);
  });

  it("generates pacemaker hint", () => {
    const p = makePatient({ status: ["permanent pacemaker"] });
    expect(generateHints(p).some(h => h.title.includes("קוצב"))).toBe(true);
  });

  it("generates aortic stenosis hint", () => {
    const p = makePatient({ diagnosis: "aortic stenosis severe" });
    expect(generateHints(p).some(h => h.title.includes("היצרות אאורטלית"))).toBe(true);
  });

  it("generates COPD CO2 retention hint", () => {
    const p = makePatient({ diagnosis: "COPD CO2 retention" });
    expect(generateHints(p).some(h => h.title.includes("CO2"))).toBe(true);
  });

  it("generates C.diff hint", () => {
    const p = makePatient({ diagnosis: "C.diff colitis" });
    expect(generateHints(p).some(h => h.title.toLowerCase().includes("diff"))).toBe(true);
  });

  it("generates isolation hint for MRSA", () => {
    const p = makePatient({ flags: ["MRSA"] });
    expect(generateHints(p).some(h => h.title.includes("בידוד"))).toBe(true);
  });

  it("generates tracheostomy hint", () => {
    const p = makePatient({ status: ["tracheostomy in situ"] });
    expect(generateHints(p).some(h => h.title.includes("טרכיאוסטומיה"))).toBe(true);
  });

  it("generates osteoporosis hint", () => {
    const p = makePatient({ diagnosis: "osteoporosis, vertebral fracture" });
    expect(generateHints(p).some(h => h.title.includes("אוסטאופורוזיס"))).toBe(true);
  });

  it("generates rhabdomyolysis hint", () => {
    const p = makePatient({ diagnosis: "rhabdomyolysis" });
    expect(generateHints(p).some(h => h.title.includes("רבדומיוליזיס"))).toBe(true);
  });

  it("generates pancreatitis hint", () => {
    const p = makePatient({ diagnosis: "pancreatitis" });
    expect(generateHints(p).some(h => h.title.includes("לבלב"))).toBe(true);
  });

  it("generates hypernatremia hint", () => {
    const p = makePatient({ diagnosis: "hypernatremia" });
    expect(generateHints(p).some(h => h.title.includes("היפרנתרמיה"))).toBe(true);
  });

  it("generates hypercalcemia hint", () => {
    const p = makePatient({ diagnosis: "hypercalcemia" });
    expect(generateHints(p).some(h => h.title.includes("היפרקלצמיה"))).toBe(true);
  });

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

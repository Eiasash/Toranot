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
    expect(hints.filter((h) => h.title.includes("PE"))).toHaveLength(1);
  });

  it("generates DVT hint", () => {
    const p = makePatient({ diagnosis: "DVT" });
    const hints = generateHints(p);
    expect(hints.filter((h) => h.title.includes("DVT"))).toHaveLength(1);
  });

  it("generates CHF hint", () => {
    const p = makePatient({ diagnosis: "CHF" });
    const hints = generateHints(p);
    expect(hints.filter((h) => h.title.includes("אי-ספיקת לב"))).toHaveLength(1);
  });

  it("generates CHF hint from Hebrew diagnosis", () => {
    const p = makePatient({ diagnosis: "אי ספיקת לב" });
    const hints = generateHints(p);
    expect(hints.filter((h) => h.title.includes("אי-ספיקת לב"))).toHaveLength(1);
  });

  it("generates CAD/ACS hint", () => {
    const p = makePatient({ diagnosis: "NSTEMI" });
    const hints = generateHints(p);
    expect(hints.filter((h) => h.title.includes("CAD"))).toHaveLength(1);
  });

  it("generates AF hint", () => {
    const p = makePatient({ diagnosis: "AF" });
    const hints = generateHints(p);
    expect(hints.filter((h) => h.title.includes("AF"))).toHaveLength(1);
  });

  it("generates stroke/CVA hint", () => {
    const p = makePatient({ diagnosis: "CVA" });
    const hints = generateHints(p);
    expect(hints.filter((h) => h.title.includes("שבץ"))).toHaveLength(1);
  });

  it("generates diabetes hint", () => {
    const p = makePatient({ diagnosis: "DM2" });
    const hints = generateHints(p);
    expect(hints.filter((h) => h.title.includes("סוכרת"))).toHaveLength(1);
  });

  it("generates CKD hint", () => {
    const p = makePatient({ diagnosis: "CKD stage 4" });
    const hints = generateHints(p);
    expect(hints.filter((h) => h.title.includes("CKD"))).toHaveLength(1);
  });

  it("generates CKD hint for dialysis patients", () => {
    const p = makePatient({ status: ["dialysis 3x/week"] });
    const hints = generateHints(p);
    expect(hints.filter((h) => h.title.includes("CKD"))).toHaveLength(1);
  });

  it("generates COPD hint", () => {
    const p = makePatient({ diagnosis: "COPD" });
    const hints = generateHints(p);
    expect(hints.filter((h) => h.title.includes("COPD"))).toHaveLength(1);
  });

  it("generates dementia hint", () => {
    const p = makePatient({ diagnosis: "דמנציה" });
    const hints = generateHints(p);
    expect(hints.filter((h) => h.title.includes("דמנציה"))).toHaveLength(1);
  });

  it("generates endocarditis hint", () => {
    const p = makePatient({ diagnosis: "endocarditis" });
    const hints = generateHints(p);
    expect(hints.filter((h) => h.title.includes("אנדוקרדיטיס"))).toHaveLength(1);
  });

  it("generates liver disease hint", () => {
    const p = makePatient({ diagnosis: "cirrhosis" });
    const hints = generateHints(p);
    expect(hints.filter((h) => h.title.includes("מחלת כבד"))).toHaveLength(1);
  });

  it("generates anticoagulation hint", () => {
    const p = makePatient({ flags: ["warfarin"] });
    const hints = generateHints(p);
    expect(hints.filter((h) => h.title.includes("אנטיקואגולציה"))).toHaveLength(1);
  });

  it("generates Parkinson's hint", () => {
    const p = makePatient({ diagnosis: "פרקינסון" });
    const hints = generateHints(p);
    expect(hints.filter((h) => h.title.includes("פרקינסון"))).toHaveLength(1);
  });

  it("generates hip fracture hint", () => {
    const p = makePatient({ diagnosis: "שבר ירך" });
    const hints = generateHints(p);
    expect(hints.filter((h) => h.title.includes("שבר ירך"))).toHaveLength(1);
  });

  it("generates pressure ulcer hint", () => {
    const p = makePatient({ status: ["פצע לחץ stage 2"] });
    const hints = generateHints(p);
    expect(hints.filter((h) => h.title.includes("פצעי לחץ"))).toHaveLength(1);
  });

  it("generates tube feeding hint", () => {
    const p = makePatient({ status: ["PEG feeding"] });
    const hints = generateHints(p);
    expect(hints.filter((h) => h.title.includes("הזנה צינורית"))).toHaveLength(1);
  });

  it("generates ascites hint", () => {
    const p = makePatient({ diagnosis: "ascites" });
    const hints = generateHints(p);
    expect(hints.filter((h) => h.title.includes("מיימת"))).toHaveLength(1);
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
    expect(generateHints(p).filter(h => h.title.includes("ספסיס"))).toHaveLength(1);
  });

  it("generates pneumonia hint", () => {
    const p = makePatient({ diagnosis: "PNEUMONIA" });
    expect(generateHints(p).filter(h => h.title.includes("דלקת ריאות"))).toHaveLength(1);
  });

  it("generates UTI hint", () => {
    const p = makePatient({ diagnosis: "UTI" });
    expect(generateHints(p).filter(h => h.title.includes("UTI"))).toHaveLength(1);
  });

  it("generates AKI hint", () => {
    const p = makePatient({ diagnosis: "AKI" });
    expect(generateHints(p).filter(h => h.title.includes("AKI"))).toHaveLength(1);
  });

  it("generates delirium hint", () => {
    const p = makePatient({ status: ["דליריום"] });
    expect(generateHints(p).filter(h => h.title.includes("דליריום"))).toHaveLength(1);
  });

  it("generates falls hint", () => {
    const p = makePatient({ diagnosis: "fall risk" });
    expect(generateHints(p).filter(h => h.title.includes("נפילות"))).toHaveLength(1);
  });

  it("generates GI bleed hint", () => {
    const p = makePatient({ diagnosis: "GI bleed" });
    expect(generateHints(p).filter(h => h.title.includes("דימום GI"))).toHaveLength(1);
  });

  it("generates DKA hint", () => {
    const p = makePatient({ diagnosis: "DKA" });
    expect(generateHints(p).filter(h => h.title.includes("DKA"))).toHaveLength(1);
  });

  it("generates digoxin toxicity hint", () => {
    const p = makePatient({ diagnosis: "digoxin toxicity" });
    expect(generateHints(p).filter(h => h.title.includes("דיגוקסין"))).toHaveLength(1);
  });

  it("generates NIV/BiPAP hint", () => {
    const p = makePatient({ status: ["on BiPAP"] });
    expect(generateHints(p).filter(h => h.title.includes("BiPAP"))).toHaveLength(1);
  });

  it("generates dialysis hint", () => {
    const p = makePatient({ diagnosis: "ESRD on dialysis" });
    expect(generateHints(p).filter(h => h.title.includes("דיאליזה"))).toHaveLength(1);
  });

  it("generates neutropenic fever hint", () => {
    const p = makePatient({ diagnosis: "neutropenic fever" });
    expect(generateHints(p).filter(h => h.title.includes("חום נויטרופני"))).toHaveLength(1);
  });

  it("generates NMS hint", () => {
    const p = makePatient({ diagnosis: "NMS suspected" });
    expect(generateHints(p).filter(h => h.title.includes("NMS"))).toHaveLength(1);
  });

  it("generates serotonin syndrome hint", () => {
    const p = makePatient({ diagnosis: "serotonin syndrome" });
    expect(generateHints(p).filter(h => h.title.includes("סרוטונין"))).toHaveLength(1);
  });

  it("generates palliative care hint", () => {
    const p = makePatient({ flags: ["טיפול מנחם"] });
    expect(generateHints(p).filter(h => h.title.includes("טיפול מנחם"))).toHaveLength(1);
  });

  it("generates alcohol withdrawal hint", () => {
    const p = makePatient({ diagnosis: "alcohol withdrawal" });
    expect(generateHints(p).filter(h => h.title.includes("גמילה מאלכוהול"))).toHaveLength(1);
  });

  it("generates seizure hint", () => {
    const p = makePatient({ diagnosis: "seizure disorder" });
    expect(generateHints(p).filter(h => h.title.includes("פרכוס"))).toHaveLength(1);
  });

  it("generates pleural effusion hint", () => {
    const p = makePatient({ diagnosis: "pleural effusion" });
    expect(generateHints(p).filter(h => h.title.includes("תפליט"))).toHaveLength(1);
  });

  it("generates post-operative hint", () => {
    const p = makePatient({ status: ["post-op day 1"] });
    expect(generateHints(p).filter(h => h.title.includes("פוסט-ניתוחי"))).toHaveLength(1);
  });

  it("generates hyponatremia hint", () => {
    const p = makePatient({ diagnosis: "hyponatremia" });
    expect(generateHints(p).filter(h => h.title.includes("היפונתרמיה"))).toHaveLength(1);
  });

  it("generates hyperkalemia hint", () => {
    const p = makePatient({ diagnosis: "hyperkalemia" });
    expect(generateHints(p).filter(h => h.title.includes("היפרקלמיה"))).toHaveLength(1);
  });

  it("generates pacemaker hint", () => {
    const p = makePatient({ status: ["permanent pacemaker"] });
    expect(generateHints(p).filter(h => h.title.includes("קוצב"))).toHaveLength(1);
  });

  it("generates aortic stenosis hint", () => {
    const p = makePatient({ diagnosis: "aortic stenosis severe" });
    expect(generateHints(p).filter(h => h.title.includes("היצרות אאורטלית"))).toHaveLength(1);
  });

  it("generates COPD CO2 retention hint", () => {
    const p = makePatient({ diagnosis: "COPD CO2 retention" });
    expect(generateHints(p).filter(h => h.title.includes("CO2"))).toHaveLength(1);
  });

  it("generates C.diff hint", () => {
    const p = makePatient({ diagnosis: "C.diff colitis" });
    expect(generateHints(p).filter(h => h.title.toLowerCase().includes("diff"))).toHaveLength(1);
  });

  it("generates isolation hint for MRSA", () => {
    const p = makePatient({ flags: ["MRSA"] });
    expect(generateHints(p).filter(h => h.title.includes("בידוד"))).toHaveLength(1);
  });

  it("generates tracheostomy hint", () => {
    const p = makePatient({ status: ["tracheostomy in situ"] });
    expect(generateHints(p).filter(h => h.title.includes("טרכיאוסטומיה"))).toHaveLength(1);
  });

  it("generates osteoporosis hint", () => {
    const p = makePatient({ diagnosis: "osteoporosis, vertebral fracture" });
    expect(generateHints(p).filter(h => h.title.includes("אוסטאופורוזיס"))).toHaveLength(1);
  });

  it("generates rhabdomyolysis hint", () => {
    const p = makePatient({ diagnosis: "rhabdomyolysis" });
    expect(generateHints(p).filter(h => h.title.includes("רבדומיוליזיס"))).toHaveLength(1);
  });

  it("generates pancreatitis hint", () => {
    const p = makePatient({ diagnosis: "pancreatitis" });
    expect(generateHints(p).filter(h => h.title.includes("לבלב"))).toHaveLength(1);
  });

  it("generates hypernatremia hint", () => {
    const p = makePatient({ diagnosis: "hypernatremia" });
    expect(generateHints(p).filter(h => h.title.includes("היפרנתרמיה"))).toHaveLength(1);
  });

  it("generates hypercalcemia hint", () => {
    const p = makePatient({ diagnosis: "hypercalcemia" });
    expect(generateHints(p).filter(h => h.title.includes("היפרקלצמיה"))).toHaveLength(1);
  });

  it("each hint has emoji, title, and non-empty tips", () => {
    const p = makePatient({ diagnosis: "CHF, PE, DVT, COPD" });
    const hints = generateHints(p);
    for (const h of hints) {
      expect(typeof h.emoji).toBe("string");
      expect(h.emoji.length).toBeGreaterThan(0);
      expect(typeof h.title).toBe("string");
      expect(h.title.length).toBeGreaterThan(0);
      expect(h.tips.length).toBeGreaterThan(0);
    }
  });
});

import { describe, it, expect } from "vitest";
import { generateHints } from "../engine/hints";
import type { PatientEntry } from "../types";

function makePatient(overrides: {
  diagnosis?: string;
  flags?: string[];
  status?: string[];
  notes?: string[];
  handoverNote?: string;
}): PatientEntry {
  return {
    id: "test-pt",
    section: "SIDE_A",
    date: "01/01/2025",
    room: "101",
    name: "Test Patient",
    age: 75,
    diagnosis: overrides.diagnosis ?? null,
    flags: overrides.flags ?? [],
    status: overrides.status ?? [],
    tomorrowNotes: [],
    tasks: [],
    generatedTasks: [],
    notes: overrides.notes ?? [],
    scannedAt: new Date().toISOString(),
    confidence: 1,
    handoverNote: overrides.handoverNote,
  };
}

describe("generateHints — basic", () => {
  it("returns empty for patient with no diagnosis/flags/status", () => {
    expect(generateHints(makePatient({}))).toEqual([]);
  });

  it("returns empty for patient with empty strings", () => {
    expect(generateHints(makePatient({ diagnosis: "", flags: [], status: [] }))).toEqual([]);
  });
});

describe("generateHints — PE", () => {
  it("generates PE hint from diagnosis", () => {
    const hints = generateHints(makePatient({ diagnosis: "PE bilateral" }));
    const pe = hints.find((h) => h.title.includes("PE"));
    expect(pe).toBeDefined();
    expect(pe!.tips.length).toBeGreaterThanOrEqual(3);
  });

  it("generates PE hint from Hebrew", () => {
    const hints = generateHints(makePatient({ diagnosis: "תסחיף ריאתי" }));
    expect(hints.some((h) => h.title.includes("PE"))).toBe(true);
  });
});

describe("generateHints — DVT", () => {
  it("generates DVT hint", () => {
    const hints = generateHints(makePatient({ diagnosis: "DVT left leg" }));
    expect(hints.some((h) => h.title.includes("DVT"))).toBe(true);
  });
});

describe("generateHints — CHF", () => {
  it("generates CHF hint from 'אי ספיקת לב'", () => {
    const hints = generateHints(makePatient({ diagnosis: "אי ספיקת לב" }));
    expect(hints.some((h) => h.title.includes("אי-ספיקת לב"))).toBe(true);
  });

  it("generates CHF hint from 'CHF'", () => {
    const hints = generateHints(makePatient({ diagnosis: "CHF exacerbation" }));
    expect(hints.some((h) => h.title.includes("אי-ספיקת לב"))).toBe(true);
  });

  it("generates CHF hint from 'HFpEF'", () => {
    const hints = generateHints(makePatient({ diagnosis: "HFpEF" }));
    expect(hints.some((h) => h.title.includes("אי-ספיקת לב"))).toBe(true);
  });
});

describe("generateHints — ACS / CAD", () => {
  it("generates ACS hint from 'NSTEMI'", () => {
    const hints = generateHints(makePatient({ diagnosis: "NSTEMI" }));
    expect(hints.some((h) => h.title.includes("CAD"))).toBe(true);
  });

  it("generates ACS hint from 'אוטם'", () => {
    const hints = generateHints(makePatient({ diagnosis: "אוטם שריר הלב" }));
    expect(hints.some((h) => h.title.includes("CAD"))).toBe(true);
  });
});

describe("generateHints — AF", () => {
  it("generates AF hint", () => {
    const hints = generateHints(makePatient({ diagnosis: "AF" }));
    expect(hints.some((h) => h.title.includes("AF"))).toBe(true);
  });

  it("generates AF hint from Hebrew", () => {
    const hints = generateHints(makePatient({ diagnosis: "פרפור עליות" }));
    expect(hints.some((h) => h.title.includes("AF"))).toBe(true);
  });
});

describe("generateHints — Stroke / CVA", () => {
  it("generates stroke hint from 'CVA'", () => {
    const hints = generateHints(makePatient({ diagnosis: "CVA" }));
    expect(hints.some((h) => h.title.includes("שבץ"))).toBe(true);
  });

  it("generates stroke hint from 'שבץ'", () => {
    const hints = generateHints(makePatient({ diagnosis: "שבץ איסכמי" }));
    expect(hints.some((h) => h.title.includes("שבץ"))).toBe(true);
  });
});

describe("generateHints — Diabetes", () => {
  it("generates diabetes hint from 'סוכרת'", () => {
    const hints = generateHints(makePatient({ diagnosis: "סוכרת סוג 2" }));
    expect(hints.some((h) => h.title.includes("סוכרת"))).toBe(true);
  });

  it("generates diabetes hint from 'DM2'", () => {
    const hints = generateHints(makePatient({ diagnosis: "DM2" }));
    expect(hints.some((h) => h.title.includes("סוכרת"))).toBe(true);
  });
});

describe("generateHints — CKD", () => {
  it("generates CKD hint from 'CKD'", () => {
    const hints = generateHints(makePatient({ diagnosis: "CKD stage 4" }));
    expect(hints.some((h) => h.title.includes("CKD"))).toBe(true);
  });

  it("generates CKD hint from 'dialysis'", () => {
    const hints = generateHints(makePatient({ status: ["HD MWF"] }));
    expect(hints.some((h) => h.title.includes("CKD"))).toBe(true);
  });
});

describe("generateHints — COPD", () => {
  it("generates COPD hint", () => {
    const hints = generateHints(makePatient({ diagnosis: "COPD" }));
    expect(hints.some((h) => h.title.includes("COPD"))).toBe(true);
  });
});

describe("generateHints — Dementia", () => {
  it("generates dementia hint from 'דמנציה'", () => {
    const hints = generateHints(makePatient({ diagnosis: "דמנציה" }));
    expect(hints.some((h) => h.title.includes("דמנציה"))).toBe(true);
  });

  it("generates dementia hint from 'Alzheimer'", () => {
    const hints = generateHints(makePatient({ diagnosis: "Alzheimer disease" }));
    expect(hints.some((h) => h.title.includes("דמנציה"))).toBe(true);
  });
});

describe("generateHints — Endocarditis", () => {
  it("generates endocarditis hint", () => {
    const hints = generateHints(makePatient({ diagnosis: "endocarditis" }));
    expect(hints.some((h) => h.title.includes("אנדוקרדיטיס"))).toBe(true);
  });
});

describe("generateHints — Liver disease", () => {
  it("generates liver hint from 'cirrhosis'", () => {
    const hints = generateHints(makePatient({ diagnosis: "cirrhosis" }));
    expect(hints.some((h) => h.title.includes("מחלת כבד"))).toBe(true);
  });

  it("generates liver hint from 'שחמת'", () => {
    const hints = generateHints(makePatient({ diagnosis: "שחמת כבד" }));
    expect(hints.some((h) => h.title.includes("מחלת כבד"))).toBe(true);
  });
});

describe("generateHints — Anticoagulation", () => {
  it("generates anticoagulation hint from 'warfarin'", () => {
    const hints = generateHints(makePatient({ status: ["on warfarin"] }));
    expect(hints.some((h) => h.title.includes("אנטיקואגולציה"))).toBe(true);
  });

  it("generates anticoagulation hint from 'eliquis'", () => {
    const hints = generateHints(makePatient({ status: ["eliquis 5mg"] }));
    expect(hints.some((h) => h.title.includes("אנטיקואגולציה"))).toBe(true);
  });
});

describe("generateHints — Parkinson's", () => {
  it("generates Parkinson hint from 'פרקינסון'", () => {
    const hints = generateHints(makePatient({ diagnosis: "פרקינסון" }));
    expect(hints.some((h) => h.title.includes("פרקינסון"))).toBe(true);
  });

  it("generates Parkinson hint from 'levodopa'", () => {
    const hints = generateHints(makePatient({ status: ["levodopa"] }));
    expect(hints.some((h) => h.title.includes("פרקינסון"))).toBe(true);
  });
});

describe("generateHints — Hip fracture", () => {
  it("generates hip fracture hint", () => {
    const hints = generateHints(makePatient({ diagnosis: "שבר ירך" }));
    expect(hints.some((h) => h.title.includes("שבר ירך"))).toBe(true);
  });
});

describe("generateHints — Pressure ulcers", () => {
  it("generates pressure ulcer hint", () => {
    const hints = generateHints(makePatient({ diagnosis: "פצע לחץ stage 3" }));
    expect(hints.some((h) => h.title.includes("פצעי לחץ"))).toBe(true);
  });
});

describe("generateHints — Tube feeding", () => {
  it("generates tube feeding hint from 'PEG'", () => {
    const hints = generateHints(makePatient({ status: ["PEG feeding"] }));
    expect(hints.some((h) => h.title.includes("הזנה צינורית"))).toBe(true);
  });

  it("generates tube feeding hint from 'סונדה'", () => {
    const hints = generateHints(makePatient({ status: ["סונדה"] }));
    expect(hints.some((h) => h.title.includes("הזנה צינורית"))).toBe(true);
  });
});

describe("generateHints — Ascites", () => {
  it("generates ascites hint", () => {
    const hints = generateHints(makePatient({ diagnosis: "ascites" }));
    expect(hints.some((h) => h.title.includes("מיימת"))).toBe(true);
  });

  it("generates ascites hint from 'מיימת'", () => {
    const hints = generateHints(makePatient({ diagnosis: "מיימת" }));
    expect(hints.some((h) => h.title.includes("מיימת"))).toBe(true);
  });
});

describe("generateHints — dedup and cross-cutting", () => {
  it("does not duplicate hints for same condition mentioned multiple times", () => {
    const hints = generateHints(
      makePatient({ diagnosis: "PE", flags: ["PE"], status: ["PE treatment"] }),
    );
    const peHints = hints.filter((h) => h.title.includes("PE"));
    expect(peHints).toHaveLength(1);
  });

  it("generates multiple hints for multi-morbid patient", () => {
    const hints = generateHints(
      makePatient({
        diagnosis: "DM2, CKD stage 4, CHF",
      }),
    );
    expect(hints.length).toBeGreaterThanOrEqual(3);
  });

  it("reads from handoverNote field", () => {
    const hints = generateHints(
      makePatient({ handoverNote: "patient is on warfarin" }),
    );
    expect(hints.some((h) => h.title.includes("אנטיקואגולציה"))).toBe(true);
  });

  it("reads from notes array", () => {
    const hints = generateHints(
      makePatient({ notes: ["patient has Parkinson's disease"] }),
    );
    expect(hints.some((h) => h.title.includes("פרקינסון"))).toBe(true);
  });

  it("all hints have emoji, title, and tips", () => {
    const hints = generateHints(
      makePatient({ diagnosis: "PE, CHF, DM2, COPD, CKD" }),
    );
    for (const h of hints) {
      expect(h.emoji.length).toBeGreaterThan(0);
      expect(h.title.length).toBeGreaterThan(0);
      expect(h.tips.length).toBeGreaterThan(0);
    }
  });
});

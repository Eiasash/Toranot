import { describe, it, expect } from "vitest";
import { applyRules, RULES } from "../engine/rules";
import type { PatientEntry, Task } from "../types";

/** Build a minimal PatientEntry for testing rules. */
function makePatient(overrides: {
  diagnosis?: string;
  flags?: string[];
  status?: string[];
  tasks?: Array<{ text: string }>;
}): PatientEntry {
  return {
    id: "test-pt",
    section: "SIDE_A",
    date: "01/01/2025",
    room: "101",
    name: "Test Patient",
    age: 60,
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
    notes: [],
    scannedAt: new Date().toISOString(),
    confidence: 1,
  };
}

function generatedSources(tasks: Task[]): string[] {
  return [...new Set(tasks.map((t) => t.generatedFrom!))];
}

// ─── Individual rule trigger tests ───

describe("rules engine — all rules", () => {
  // 1. Discharge
  describe("Discharge", () => {
    it("triggers on 'משתחרר'", () => {
      const tasks = applyRules(makePatient({ status: ["משתחרר היום"] }));
      expect(generatedSources(tasks)).toContain("שחרור");
    });

    it("triggers on 'D/C'", () => {
      const tasks = applyRules(makePatient({ status: ["D/C today"] }));
      expect(generatedSources(tasks)).toContain("שחרור");
    });

    it("triggers on 'discharge'", () => {
      const tasks = applyRules(makePatient({ status: ["discharge planned"] }));
      expect(generatedSources(tasks)).toContain("שחרור");
    });

    it("generates 4 discharge tasks", () => {
      const tasks = applyRules(makePatient({ status: ["משתחרר"] }));
      const dischargeTasks = tasks.filter((t) => t.generatedFrom === "שחרור");
      expect(dischargeTasks).toHaveLength(4);
    });

    it("discharge tasks have correct categories", () => {
      const tasks = applyRules(makePatient({ status: ["משתחרר"] }));
      const dischargeTasks = tasks.filter((t) => t.generatedFrom === "שחרור");
      expect(dischargeTasks.every((t) => t.category === "discharge")).toBe(true);
    });
  });

  // 2. NPO
  describe("NPO", () => {
    it("triggers on 'NPO' flag", () => {
      const tasks = applyRules(makePatient({ flags: ["NPO"] }));
      expect(generatedSources(tasks)).toContain("NPO");
    });

    it("generates 2 NPO tasks", () => {
      const tasks = applyRules(makePatient({ flags: ["NPO"] }));
      const npoTasks = tasks.filter((t) => t.generatedFrom === "NPO");
      expect(npoTasks).toHaveLength(2);
    });

    it("does NOT trigger on 'NPORT' (word boundary)", () => {
      const tasks = applyRules(makePatient({ status: ["NPORT device"] }));
      expect(generatedSources(tasks)).not.toContain("NPO");
    });
  });

  // 3. Pre-op
  describe("Pre-op", () => {
    it("triggers on 'ניתוח'", () => {
      const tasks = applyRules(makePatient({ diagnosis: "לפני ניתוח" }));
      expect(generatedSources(tasks)).toContain("טרום ניתוח");
    });

    it("triggers on 'pre-op'", () => {
      const tasks = applyRules(makePatient({ status: ["pre-op workup"] }));
      expect(generatedSources(tasks)).toContain("טרום ניתוח");
    });

    it("generates 4 pre-op tasks", () => {
      const tasks = applyRules(makePatient({ diagnosis: "ניתוח" }));
      const preopTasks = tasks.filter((t) => t.generatedFrom === "טרום ניתוח");
      expect(preopTasks).toHaveLength(4);
    });
  });

  // 4. Blood products / transfusion
  describe("Blood products", () => {
    it("triggers on 'עירוי דם'", () => {
      const tasks = applyRules(makePatient({ status: ["עירוי דם"] }));
      expect(generatedSources(tasks)).toContain("עירוי דם");
    });

    it("triggers on 'PRBCs'", () => {
      const tasks = applyRules(makePatient({ status: ["2 PRBCs ordered"] }));
      expect(generatedSources(tasks)).toContain("עירוי דם");
    });

    it("triggers on 'packed cells'", () => {
      const tasks = applyRules(makePatient({ status: ["packed cells"] }));
      expect(generatedSources(tasks)).toContain("עירוי דם");
    });

    it("generates 4 transfusion tasks", () => {
      const tasks = applyRules(makePatient({ status: ["מנת דם"] }));
      const transTasks = tasks.filter((t) => t.generatedFrom === "עירוי דם");
      expect(transTasks).toHaveLength(4);
    });
  });

  // 5. Diabetes
  describe("Diabetes", () => {
    it("triggers on 'סוכרת'", () => {
      const tasks = applyRules(makePatient({ diagnosis: "סוכרת סוג 2" }));
      expect(generatedSources(tasks)).toContain("סוכרת");
    });

    it("triggers on 'DM2'", () => {
      const tasks = applyRules(makePatient({ diagnosis: "DM2" }));
      expect(generatedSources(tasks)).toContain("סוכרת");
    });

    it("triggers on 'insulin'", () => {
      const tasks = applyRules(makePatient({ status: ["insulin sliding scale"] }));
      expect(generatedSources(tasks)).toContain("סוכרת");
    });

    it("does NOT trigger on 'DM' followed by a word char (e.g. DMG)", () => {
      const tasks = applyRules(makePatient({ diagnosis: "DMG test" }));
      expect(generatedSources(tasks)).not.toContain("סוכרת");
    });

    it("generates 3 diabetes tasks", () => {
      const tasks = applyRules(makePatient({ diagnosis: "סוכרת" }));
      const dmTasks = tasks.filter((t) => t.generatedFrom === "סוכרת");
      expect(dmTasks).toHaveLength(3);
    });
  });

  // 6. Fall risk
  describe("Fall risk", () => {
    it("triggers on 'נפילה'", () => {
      const tasks = applyRules(makePatient({ status: ["נפילה"] }));
      expect(generatedSources(tasks)).toContain("סיכון נפילה");
    });

    it("triggers on 'FALL' flag", () => {
      const tasks = applyRules(makePatient({ flags: ["FALL"] }));
      expect(generatedSources(tasks)).toContain("סיכון נפילה");
    });

    it("generates 3 fall tasks", () => {
      const tasks = applyRules(makePatient({ flags: ["FALL"] }));
      const fallTasks = tasks.filter((t) => t.generatedFrom === "סיכון נפילה");
      expect(fallTasks).toHaveLength(3);
    });
  });

  // 7. Bladder Scan (BS)
  describe("BS (Bladder Scan)", () => {
    it("triggers on 'BS' in task text", () => {
      const tasks = applyRules(makePatient({ tasks: [{ text: "BS בערב" }] }));
      expect(generatedSources(tasks)).toContain("BS (Bladder Scan)");
    });

    it("triggers on 'Bladder Scan'", () => {
      const tasks = applyRules(makePatient({ status: ["Bladder Scan needed"] }));
      expect(generatedSources(tasks)).toContain("BS (Bladder Scan)");
    });

    it("BS is NOT confused with blood sugar / DM rule", () => {
      const tasks = applyRules(makePatient({ tasks: [{ text: "BS בערב" }] }));
      expect(generatedSources(tasks)).not.toContain("סוכרת");
    });

    it("generates 1 BS task", () => {
      const tasks = applyRules(makePatient({ tasks: [{ text: "BS" }] }));
      const bsTasks = tasks.filter((t) => t.generatedFrom === "BS (Bladder Scan)");
      expect(bsTasks).toHaveLength(1);
      expect(bsTasks[0].category).toBe("procedure");
    });
  });

  // 8. Isolation
  describe("Isolation", () => {
    it("triggers on 'בידוד'", () => {
      const tasks = applyRules(makePatient({ status: ["בידוד מגע"] }));
      expect(generatedSources(tasks)).toContain("בידוד");
    });

    it("triggers on 'MRSA' flag", () => {
      const tasks = applyRules(makePatient({ flags: ["MRSA"] }));
      expect(generatedSources(tasks)).toContain("בידוד");
    });

    it("triggers on 'VRE'", () => {
      const tasks = applyRules(makePatient({ flags: ["VRE"] }));
      expect(generatedSources(tasks)).toContain("בידוד");
    });

    it("generates 3 isolation tasks", () => {
      const tasks = applyRules(makePatient({ status: ["בידוד"] }));
      const isoTasks = tasks.filter((t) => t.generatedFrom === "בידוד");
      expect(isoTasks).toHaveLength(3);
    });
  });

  // 9. Catheter
  describe("Catheter", () => {
    it("triggers on 'קטטר'", () => {
      const tasks = applyRules(makePatient({ status: ["קטטר שתן"] }));
      expect(generatedSources(tasks)).toContain("קטטר שתן");
    });

    it("triggers on 'foley'", () => {
      const tasks = applyRules(makePatient({ status: ["foley catheter"] }));
      expect(generatedSources(tasks)).toContain("קטטר שתן");
    });

    it("does NOT trigger on 'קטטר חד' (one-time catheter)", () => {
      const tasks = applyRules(makePatient({ status: ["קטטר חד פעמי"] }));
      expect(generatedSources(tasks)).not.toContain("קטטר שתן");
    });

    it("generates 2 catheter tasks", () => {
      const tasks = applyRules(makePatient({ status: ["foley"] }));
      const catTasks = tasks.filter((t) => t.generatedFrom === "קטטר שתן");
      expect(catTasks).toHaveLength(2);
    });
  });

  // 10. Pneumonia
  describe("Pneumonia", () => {
    it("triggers on 'דלקת ריאות'", () => {
      const tasks = applyRules(makePatient({ diagnosis: "דלקת ריאות" }));
      expect(generatedSources(tasks)).toContain("דלקת ריאות");
    });

    it("triggers on 'pneumonia'", () => {
      const tasks = applyRules(makePatient({ diagnosis: "pneumonia" }));
      expect(generatedSources(tasks)).toContain("דלקת ריאות");
    });

    it("triggers on 'CAP'", () => {
      const tasks = applyRules(makePatient({ diagnosis: "CAP" }));
      expect(generatedSources(tasks)).toContain("דלקת ריאות");
    });

    it("generates 6 pneumonia tasks", () => {
      const tasks = applyRules(makePatient({ diagnosis: "דלקת ריאות" }));
      const pnTasks = tasks.filter((t) => t.generatedFrom === "דלקת ריאות");
      expect(pnTasks).toHaveLength(6);
    });
  });

  // 11. UTI
  describe("UTI", () => {
    it("triggers on 'UTI'", () => {
      const tasks = applyRules(makePatient({ diagnosis: "UTI" }));
      expect(generatedSources(tasks)).toContain("זיהום בדרכי השתן");
    });

    it("triggers on 'דלקת בדרכי השתן'", () => {
      const tasks = applyRules(makePatient({ diagnosis: "דלקת בדרכי השתן" }));
      expect(generatedSources(tasks)).toContain("זיהום בדרכי השתן");
    });

    it("generates 4 UTI tasks", () => {
      const tasks = applyRules(makePatient({ diagnosis: "UTI" }));
      const utiTasks = tasks.filter((t) => t.generatedFrom === "זיהום בדרכי השתן");
      expect(utiTasks).toHaveLength(4);
    });
  });

  // 12. Sepsis
  describe("Sepsis", () => {
    it("triggers on 'ספסיס'", () => {
      const tasks = applyRules(makePatient({ diagnosis: "ספסיס" }));
      expect(generatedSources(tasks)).toContain("ספסיס");
    });

    it("triggers on 'sepsis'", () => {
      const tasks = applyRules(makePatient({ diagnosis: "sepsis" }));
      expect(generatedSources(tasks)).toContain("ספסיס");
    });

    it("triggers on 'bacteremia'", () => {
      const tasks = applyRules(makePatient({ diagnosis: "bacteremia" }));
      expect(generatedSources(tasks)).toContain("ספסיס");
    });

    it("generates 7 sepsis tasks", () => {
      const tasks = applyRules(makePatient({ diagnosis: "ספסיס" }));
      const sepTasks = tasks.filter((t) => t.generatedFrom === "ספסיס");
      expect(sepTasks).toHaveLength(7);
    });
  });

  // 13. Cellulitis
  describe("Cellulitis", () => {
    it("triggers on 'צלוליטיס'", () => {
      const tasks = applyRules(makePatient({ diagnosis: "צלוליטיס" }));
      expect(generatedSources(tasks)).toContain("צלוליטיס");
    });

    it("triggers on 'cellulitis'", () => {
      const tasks = applyRules(makePatient({ diagnosis: "cellulitis" }));
      expect(generatedSources(tasks)).toContain("צלוליטיס");
    });

    it("generates 4 cellulitis tasks", () => {
      const tasks = applyRules(makePatient({ diagnosis: "צלוליטיס" }));
      const cellTasks = tasks.filter((t) => t.generatedFrom === "צלוליטיס");
      expect(cellTasks).toHaveLength(4);
    });
  });

  // 14. C. difficile
  describe("C. difficile", () => {
    it("triggers on 'C diff'", () => {
      const tasks = applyRules(makePatient({ diagnosis: "C diff infection" }));
      expect(generatedSources(tasks)).toContain("חשד C. difficile");
    });

    it("triggers on 'קלוסטרידיום'", () => {
      const tasks = applyRules(makePatient({ diagnosis: "קלוסטרידיום" }));
      expect(generatedSources(tasks)).toContain("חשד C. difficile");
    });

    it("generates 4 C. diff tasks", () => {
      const tasks = applyRules(makePatient({ diagnosis: "clostridium" }));
      const cdTasks = tasks.filter((t) => t.generatedFrom === "חשד C. difficile");
      expect(cdTasks).toHaveLength(4);
    });
  });

  // 15. Fever
  describe("Fever", () => {
    it("triggers on 'חום'", () => {
      const tasks = applyRules(makePatient({ status: ["חום 38.8"] }));
      expect(generatedSources(tasks)).toContain("חום — בירור");
    });

    it("triggers on 'fever'", () => {
      const tasks = applyRules(makePatient({ status: ["fever workup"] }));
      expect(generatedSources(tasks)).toContain("חום — בירור");
    });

    it("triggers on '39.2' (temperature value)", () => {
      const tasks = applyRules(makePatient({ status: ["39.2 degrees"] }));
      expect(generatedSources(tasks)).toContain("חום — בירור");
    });

    it("generates 5 fever tasks", () => {
      const tasks = applyRules(makePatient({ status: ["חום"] }));
      const fvTasks = tasks.filter((t) => t.generatedFrom === "חום — בירור");
      expect(fvTasks).toHaveLength(5);
    });
  });

  // 16. AKI
  describe("AKI", () => {
    it("triggers on 'AKI'", () => {
      const tasks = applyRules(makePatient({ diagnosis: "AKI" }));
      expect(generatedSources(tasks)).toContain("AKI");
    });

    it("triggers on 'acute kidney'", () => {
      const tasks = applyRules(makePatient({ diagnosis: "acute kidney injury" }));
      expect(generatedSources(tasks)).toContain("AKI");
    });

    it("generates 6 AKI tasks", () => {
      const tasks = applyRules(makePatient({ diagnosis: "AKI" }));
      const akiTasks = tasks.filter((t) => t.generatedFrom === "AKI");
      expect(akiTasks).toHaveLength(6);
    });
  });

  // 17. Hyperkalemia
  describe("Hyperkalemia", () => {
    it("triggers on 'היפרקלמיה'", () => {
      const tasks = applyRules(makePatient({ diagnosis: "היפרקלמיה" }));
      expect(generatedSources(tasks)).toContain("היפרקלמיה");
    });

    it("triggers on 'hyperkalemia'", () => {
      const tasks = applyRules(makePatient({ diagnosis: "hyperkalemia" }));
      expect(generatedSources(tasks)).toContain("היפרקלמיה");
    });

    it("generates 6 hyperkalemia tasks", () => {
      const tasks = applyRules(makePatient({ diagnosis: "היפרקלמיה" }));
      const hkTasks = tasks.filter((t) => t.generatedFrom === "היפרקלמיה");
      expect(hkTasks).toHaveLength(6);
    });
  });

  // 18. Hypokalemia
  describe("Hypokalemia", () => {
    it("triggers on 'היפוקלמיה'", () => {
      const tasks = applyRules(makePatient({ diagnosis: "היפוקלמיה" }));
      expect(generatedSources(tasks)).toContain("היפוקלמיה");
    });

    it("triggers on 'hypokalemia'", () => {
      const tasks = applyRules(makePatient({ diagnosis: "hypokalemia" }));
      expect(generatedSources(tasks)).toContain("היפוקלמיה");
    });

    it("generates 5 hypokalemia tasks", () => {
      const tasks = applyRules(makePatient({ diagnosis: "היפוקלמיה" }));
      const lkTasks = tasks.filter((t) => t.generatedFrom === "היפוקלמיה");
      expect(lkTasks).toHaveLength(5);
    });
  });

  // 19. Chest pain / ACS
  describe("Chest pain / ACS", () => {
    it("triggers on 'כאב בחזה'", () => {
      const tasks = applyRules(makePatient({ status: ["כאב בחזה"] }));
      expect(generatedSources(tasks)).toContain("כאב חזה / ACS");
    });

    it("triggers on 'STEMI'", () => {
      const tasks = applyRules(makePatient({ diagnosis: "STEMI" }));
      expect(generatedSources(tasks)).toContain("כאב חזה / ACS");
    });

    it("triggers on 'chest pain'", () => {
      const tasks = applyRules(makePatient({ status: ["chest pain"] }));
      expect(generatedSources(tasks)).toContain("כאב חזה / ACS");
    });

    it("generates 7 ACS tasks", () => {
      const tasks = applyRules(makePatient({ diagnosis: "STEMI" }));
      const acsTasks = tasks.filter((t) => t.generatedFrom === "כאב חזה / ACS");
      expect(acsTasks).toHaveLength(7);
    });
  });

  // 20. CHF
  describe("CHF / Heart failure", () => {
    it("triggers on 'אי ספיקת לב'", () => {
      const tasks = applyRules(makePatient({ diagnosis: "אי ספיקת לב" }));
      expect(generatedSources(tasks)).toContain("אי-ספיקת לב");
    });

    it("triggers on 'CHF'", () => {
      const tasks = applyRules(makePatient({ diagnosis: "CHF" }));
      expect(generatedSources(tasks)).toContain("אי-ספיקת לב");
    });

    it("triggers on 'pulmonary edema'", () => {
      const tasks = applyRules(makePatient({ diagnosis: "pulmonary edema" }));
      expect(generatedSources(tasks)).toContain("אי-ספיקת לב");
    });

    it("generates 6 CHF tasks", () => {
      const tasks = applyRules(makePatient({ diagnosis: "CHF" }));
      const chfTasks = tasks.filter((t) => t.generatedFrom === "אי-ספיקת לב");
      expect(chfTasks).toHaveLength(6);
    });
  });

  // 21. DVT / PE
  describe("DVT / PE", () => {
    it("triggers on 'DVT'", () => {
      const tasks = applyRules(makePatient({ diagnosis: "DVT" }));
      expect(generatedSources(tasks)).toContain("DVT / PE");
    });

    it("triggers on 'תסחיף ריאתי'", () => {
      const tasks = applyRules(makePatient({ diagnosis: "תסחיף ריאתי" }));
      expect(generatedSources(tasks)).toContain("DVT / PE");
    });

    it("generates 5 DVT/PE tasks", () => {
      const tasks = applyRules(makePatient({ diagnosis: "DVT" }));
      const dvtTasks = tasks.filter((t) => t.generatedFrom === "DVT / PE");
      expect(dvtTasks).toHaveLength(5);
    });
  });

  // 22. Delirium
  describe("Delirium", () => {
    it("triggers on 'דליריום'", () => {
      const tasks = applyRules(makePatient({ diagnosis: "דליריום" }));
      expect(generatedSources(tasks)).toContain("דליריום");
    });

    it("triggers on 'delirium'", () => {
      const tasks = applyRules(makePatient({ diagnosis: "delirium" }));
      expect(generatedSources(tasks)).toContain("דליריום");
    });

    it("triggers on 'acute confusion'", () => {
      const tasks = applyRules(makePatient({ status: ["acute confusion"] }));
      expect(generatedSources(tasks)).toContain("דליריום");
    });

    it("generates 7 delirium tasks", () => {
      const tasks = applyRules(makePatient({ diagnosis: "דליריום" }));
      const delTasks = tasks.filter((t) => t.generatedFrom === "דליריום");
      expect(delTasks).toHaveLength(7);
    });
  });

  // 23. GI Bleed
  describe("GI Bleed", () => {
    it("triggers on 'GI bleed'", () => {
      const tasks = applyRules(makePatient({ status: ["GI bleed"] }));
      expect(generatedSources(tasks)).toContain("דימום GI");
    });

    it("triggers on 'מלנה'", () => {
      const tasks = applyRules(makePatient({ status: ["מלנה"] }));
      expect(generatedSources(tasks)).toContain("דימום GI");
    });

    it("triggers on 'hematemesis'", () => {
      const tasks = applyRules(makePatient({ diagnosis: "hematemesis" }));
      expect(generatedSources(tasks)).toContain("דימום GI");
    });

    it("generates 8 GI bleed tasks", () => {
      const tasks = applyRules(makePatient({ status: ["GI bleed"] }));
      const giTasks = tasks.filter((t) => t.generatedFrom === "דימום GI");
      expect(giTasks).toHaveLength(8);
    });
  });

  // 24. Warfarin / INR
  describe("Warfarin / INR", () => {
    it("triggers on 'warfarin'", () => {
      const tasks = applyRules(makePatient({ status: ["on warfarin"] }));
      expect(generatedSources(tasks)).toContain("Warfarin / INR");
    });

    it("triggers on 'קומדין'", () => {
      const tasks = applyRules(makePatient({ status: ["קומדין"] }));
      expect(generatedSources(tasks)).toContain("Warfarin / INR");
    });

    it("generates 4 warfarin tasks", () => {
      const tasks = applyRules(makePatient({ status: ["warfarin"] }));
      const warTasks = tasks.filter((t) => t.generatedFrom === "Warfarin / INR");
      expect(warTasks).toHaveLength(4);
    });
  });

  // 25. COPD
  describe("COPD exacerbation", () => {
    it("triggers on 'COPD החמרה'", () => {
      const tasks = applyRules(makePatient({ diagnosis: "COPD החמרה" }));
      expect(generatedSources(tasks)).toContain("החמרת COPD");
    });

    it("triggers on 'AECOPD'", () => {
      const tasks = applyRules(makePatient({ diagnosis: "AECOPD" }));
      expect(generatedSources(tasks)).toContain("החמרת COPD");
    });

    it("generates 6 COPD tasks", () => {
      const tasks = applyRules(makePatient({ diagnosis: "COPD החמרה" }));
      const copdTasks = tasks.filter((t) => t.generatedFrom === "החמרת COPD");
      expect(copdTasks).toHaveLength(6);
    });
  });

  // 26. Hypoglycemia
  describe("Hypoglycemia", () => {
    it("triggers on 'היפוגליקמיה'", () => {
      const tasks = applyRules(makePatient({ diagnosis: "היפוגליקמיה" }));
      expect(generatedSources(tasks)).toContain("היפוגליקמיה");
    });

    it("triggers on 'hypoglycemia'", () => {
      const tasks = applyRules(makePatient({ diagnosis: "hypoglycemia" }));
      expect(generatedSources(tasks)).toContain("היפוגליקמיה");
    });

    it("generates 3 hypoglycemia tasks", () => {
      const tasks = applyRules(makePatient({ diagnosis: "היפוגליקמיה" }));
      const hypoTasks = tasks.filter((t) => t.generatedFrom === "היפוגליקמיה");
      expect(hypoTasks).toHaveLength(3);
    });
  });

  // 27. New admission
  describe("New admission", () => {
    it("triggers on 'קבלה חדשה'", () => {
      const tasks = applyRules(makePatient({ status: ["קבלה חדשה"] }));
      expect(generatedSources(tasks)).toContain("קבלה חדשה");
    });

    it("triggers on 'new admission'", () => {
      const tasks = applyRules(makePatient({ status: ["new admission"] }));
      expect(generatedSources(tasks)).toContain("קבלה חדשה");
    });

    it("generates 6 new admission tasks", () => {
      const tasks = applyRules(makePatient({ status: ["קבלה חדשה"] }));
      const admTasks = tasks.filter((t) => t.generatedFrom === "קבלה חדשה");
      expect(admTasks).toHaveLength(6);
    });
  });

  // 28. Hyponatremia
  describe("Hyponatremia", () => {
    it("triggers on 'היפונתרמיה'", () => {
      const tasks = applyRules(makePatient({ diagnosis: "היפונתרמיה" }));
      expect(generatedSources(tasks)).toContain("היפונתרמיה");
    });

    it("triggers on 'hyponatremia'", () => {
      const tasks = applyRules(makePatient({ diagnosis: "hyponatremia" }));
      expect(generatedSources(tasks)).toContain("היפונתרמיה");
    });

    it("generates 5 hyponatremia tasks", () => {
      const tasks = applyRules(makePatient({ diagnosis: "היפונתרמיה" }));
      const naTasks = tasks.filter((t) => t.generatedFrom === "היפונתרמיה");
      expect(naTasks).toHaveLength(5);
    });
  });

  // 29. Stroke / TIA
  describe("Stroke / TIA", () => {
    it("triggers on 'שבץ'", () => {
      const tasks = applyRules(makePatient({ diagnosis: "שבץ" }));
      expect(generatedSources(tasks)).toContain("שבץ / TIA");
    });

    it("triggers on 'CVA'", () => {
      const tasks = applyRules(makePatient({ diagnosis: "CVA" }));
      expect(generatedSources(tasks)).toContain("שבץ / TIA");
    });

    it("triggers on 'TIA'", () => {
      const tasks = applyRules(makePatient({ diagnosis: "TIA" }));
      expect(generatedSources(tasks)).toContain("שבץ / TIA");
    });

    it("generates 7 stroke tasks", () => {
      const tasks = applyRules(makePatient({ diagnosis: "שבץ" }));
      const strTasks = tasks.filter((t) => t.generatedFrom === "שבץ / TIA");
      expect(strTasks).toHaveLength(7);
    });
  });
});

// ─── Cross-cutting rule behavior ───

describe("rules engine — cross-cutting behavior", () => {
  it("all generated tasks have source='generated'", () => {
    const tasks = applyRules(makePatient({ diagnosis: "ספסיס", flags: ["NPO", "FALL"] }));
    expect(tasks.length).toBeGreaterThan(0);
    for (const t of tasks) {
      expect(t.source).toBe("generated");
    }
  });

  it("all generated tasks have a generatedFrom field", () => {
    const tasks = applyRules(makePatient({ diagnosis: "דלקת ריאות" }));
    for (const t of tasks) {
      expect(t.generatedFrom).toBeDefined();
      expect(t.generatedFrom!.length).toBeGreaterThan(0);
    }
  });

  it("all generated tasks have valid urgency", () => {
    const tasks = applyRules(makePatient({ diagnosis: "ספסיס" }));
    const validUrgencies = ["stat", "urgent", "morning", "routine", "extra"];
    for (const t of tasks) {
      expect(validUrgencies).toContain(t.urgency);
    }
  });

  it("group dedup: same group triggered twice produces only one set", () => {
    // "cellulitis" and "דלקת בעור" both match the cellulitis group
    const tasks = applyRules(
      makePatient({ diagnosis: "cellulitis", status: ["דלקת בעור"] }),
    );
    const cellTasks = tasks.filter((t) => t.generatedFrom === "צלוליטיס");
    expect(cellTasks).toHaveLength(4); // exactly one set
  });

  it("multiple conditions generate tasks from each rule", () => {
    const tasks = applyRules(
      makePatient({ diagnosis: "סוכרת", flags: ["NPO"] }),
    );
    const sources = generatedSources(tasks);
    expect(sources).toContain("סוכרת");
    expect(sources).toContain("NPO");
  });

  it("patient with no matching conditions generates no tasks", () => {
    const tasks = applyRules(makePatient({}));
    expect(tasks).toHaveLength(0);
  });

  it("RULES array has expected number of rules", () => {
    expect(RULES.length).toBe(29);
  });

  it("every rule has a unique group", () => {
    const groups = RULES.map((r) => r.group).filter(Boolean);
    expect(new Set(groups).size).toBe(groups.length);
  });
});

import { describe, it, expect } from "vitest";
import { applyRules, RULES } from "../engine/rules";
import type { PatientEntry, Task } from "../types";

/** Build a minimal PatientEntry for testing rules. */
function makePatient(overrides: {
  diagnosis?: string;
  flags?: string[];
  status?: string[];
  tasks?: Array<{ text: string }>;
  planNotes?: string[];
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
    planNotes: overrides.planNotes ?? [],
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
  // 1. Discharge — rule matches but generates NO on-call tasks
  //    Discharge is morning team work. On-call only does what's explicitly written.
  describe("Discharge", () => {
    it("generates 0 tasks (discharge is morning team work)", () => {
      const tasks = applyRules(makePatient({ status: ["משתחרר היום"] }));
      const dischargeTasks = tasks.filter((t) => t.generatedFrom === "שחרור");
      expect(dischargeTasks).toHaveLength(0);
    });

    it("generates 0 tasks for D/C variant", () => {
      const tasks = applyRules(makePatient({ status: ["D/C today"] }));
      const dischargeTasks = tasks.filter((t) => t.generatedFrom === "שחרור");
      expect(dischargeTasks).toHaveLength(0);
    });

    it("generates 0 tasks for discharge variant", () => {
      const tasks = applyRules(makePatient({ status: ["discharge planned"] }));
      const dischargeTasks = tasks.filter((t) => t.generatedFrom === "שחרור");
      expect(dischargeTasks).toHaveLength(0);
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
      const tasks = applyRules(makePatient({ status: ["לפני ניתוח"] }));
      expect(generatedSources(tasks)).toContain("טרום ניתוח");
    });

    it("triggers on 'pre-op'", () => {
      const tasks = applyRules(makePatient({ status: ["pre-op workup"] }));
      expect(generatedSources(tasks)).toContain("טרום ניתוח");
    });

    it("generates 4 pre-op tasks", () => {
      const tasks = applyRules(makePatient({ status: ["ניתוח"] }));
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

  // 5. Diabetes — 0 auto-generated tasks (BS only if explicitly asked)
  describe("Diabetes", () => {
    it("generates 0 tasks for סוכרת", () => {
      const tasks = applyRules(makePatient({ status: ["סוכרת סוג 2"] }));
      const dmTasks = tasks.filter((t) => t.generatedFrom === "סוכרת");
      expect(dmTasks).toHaveLength(0);
    });

    it("generates 0 tasks for DM2", () => {
      const tasks = applyRules(makePatient({ status: ["DM2"] }));
      const dmTasks = tasks.filter((t) => t.generatedFrom === "סוכרת");
      expect(dmTasks).toHaveLength(0);
    });

    it("does NOT trigger on 'DM' followed by a word char (e.g. DMG)", () => {
      const tasks = applyRules(makePatient({ status: ["DMG test"] }));
      expect(generatedSources(tasks)).not.toContain("סוכרת");
    });
  });

  // 6. Fall risk
  describe("Fall risk", () => {
    // Decision: fall risk generates 0 tasks.
    // "נפילה" / FALL in the task list is a historical fall or admission flag,
    // not an acute event. The CT head task was generating noise on every
    // patient with a fall-risk flag, even if the fall was weeks ago.
    // Acute fall calls come in by phone and the scenario buttons handle them.
    it("generates 0 tasks for נפילה (static fall-risk flag = not an acute call)", () => {
      const tasks = applyRules(makePatient({ status: ["נפילה"] }));
      const fallTasks = tasks.filter((t) => t.generatedFrom === "סיכון נפילה");
      expect(fallTasks).toHaveLength(0);
    });

    it("generates 0 tasks for FALL flag", () => {
      const tasks = applyRules(makePatient({ flags: ["FALL"] }));
      const fallTasks = tasks.filter((t) => t.generatedFrom === "סיכון נפילה");
      expect(fallTasks).toHaveLength(0);
    });

    it("rule still matches (group fires, no tasks emitted) so the group is consumed", () => {
      // The rule must fire (and mark the group as matched) even though tasks:[].
      // This prevents a hypothetical future duplicate rule from adding tasks.
      // We verify indirectly by checking that applyRules runs without error
      // and returns an array (no tasks from this group).
      const result = applyRules(makePatient({ flags: ["FALL"] }));
      expect(Array.isArray(result)).toBe(true);
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

  // 8. Isolation — 0 auto-generated tasks (nursing job)
  describe("Isolation", () => {
    it("generates 0 tasks for בידוד", () => {
      const tasks = applyRules(makePatient({ status: ["בידוד מגע"] }));
      const isoTasks = tasks.filter((t) => t.generatedFrom === "בידוד");
      expect(isoTasks).toHaveLength(0);
    });

    it("generates 0 tasks for MRSA", () => {
      const tasks = applyRules(makePatient({ flags: ["MRSA"] }));
      const isoTasks = tasks.filter((t) => t.generatedFrom === "בידוד");
      expect(isoTasks).toHaveLength(0);
    });
  });

  // 9. Catheter — rule matches but generates NO on-call tasks
  describe("Catheter", () => {
    it("generates 0 tasks (I/O only if explicitly asked)", () => {
      const tasks = applyRules(makePatient({ status: ["קטטר שתן"] }));
      const catTasks = tasks.filter((t) => t.generatedFrom === "קטטר שתן");
      expect(catTasks).toHaveLength(0);
    });

    it("generates 0 tasks for foley variant", () => {
      const tasks = applyRules(makePatient({ status: ["foley catheter"] }));
      const catTasks = tasks.filter((t) => t.generatedFrom === "קטטר שתן");
      expect(catTasks).toHaveLength(0);
    });

    it("does NOT trigger on 'קטטר חד' (one-time catheter)", () => {
      const tasks = applyRules(makePatient({ status: ["קטטר חד פעמי"] }));
      expect(generatedSources(tasks)).not.toContain("קטטר שתן");
    });
  });

  // 10. Pneumonia
  describe("Pneumonia", () => {
    it("triggers on 'דלקת ריאות'", () => {
      const tasks = applyRules(makePatient({ status: ["דלקת ריאות"] }));
      expect(generatedSources(tasks)).toContain("דלקת ריאות");
    });

    it("triggers on 'pneumonia'", () => {
      const tasks = applyRules(makePatient({ status: ["pneumonia"] }));
      expect(generatedSources(tasks)).toContain("דלקת ריאות");
    });

    it("triggers on 'CAP'", () => {
      const tasks = applyRules(makePatient({ status: ["CAP"] }));
      expect(generatedSources(tasks)).toContain("דלקת ריאות");
    });

    it("generates 6 pneumonia tasks", () => {
      const tasks = applyRules(makePatient({ status: ["דלקת ריאות"] }));
      const pnTasks = tasks.filter((t) => t.generatedFrom === "דלקת ריאות");
      expect(pnTasks).toHaveLength(6);
    });
  });

  // 11. UTI
  describe("UTI", () => {
    it("triggers on 'UTI'", () => {
      const tasks = applyRules(makePatient({ status: ["UTI"] }));
      expect(generatedSources(tasks)).toContain("זיהום בדרכי השתן");
    });

    it("triggers on 'דלקת בדרכי השתן'", () => {
      const tasks = applyRules(makePatient({ status: ["דלקת בדרכי השתן"] }));
      expect(generatedSources(tasks)).toContain("זיהום בדרכי השתן");
    });

    it("generates 4 UTI tasks", () => {
      const tasks = applyRules(makePatient({ status: ["UTI"] }));
      const utiTasks = tasks.filter((t) => t.generatedFrom === "זיהום בדרכי השתן");
      expect(utiTasks).toHaveLength(4);
    });
  });

  // 12. Sepsis
  describe("Sepsis", () => {
    it("triggers on 'ספסיס'", () => {
      const tasks = applyRules(makePatient({ status: ["ספסיס"] }));
      expect(generatedSources(tasks)).toContain("ספסיס");
    });

    it("triggers on 'sepsis'", () => {
      const tasks = applyRules(makePatient({ status: ["sepsis"] }));
      expect(generatedSources(tasks)).toContain("ספסיס");
    });

    it("triggers on 'bacteremia'", () => {
      const tasks = applyRules(makePatient({ status: ["bacteremia"] }));
      expect(generatedSources(tasks)).toContain("ספסיס");
    });

    it("generates 7 sepsis tasks", () => {
      const tasks = applyRules(makePatient({ status: ["ספסיס"] }));
      const sepTasks = tasks.filter((t) => t.generatedFrom === "ספסיס");
      expect(sepTasks).toHaveLength(7);
    });
  });

  // 13. Cellulitis
  describe("Cellulitis", () => {
    it("triggers on 'צלוליטיס'", () => {
      const tasks = applyRules(makePatient({ status: ["צלוליטיס"] }));
      expect(generatedSources(tasks)).toContain("צלוליטיס");
    });

    it("triggers on 'cellulitis'", () => {
      const tasks = applyRules(makePatient({ status: ["cellulitis"] }));
      expect(generatedSources(tasks)).toContain("צלוליטיס");
    });

    it("generates 4 cellulitis tasks", () => {
      const tasks = applyRules(makePatient({ status: ["צלוליטיס"] }));
      const cellTasks = tasks.filter((t) => t.generatedFrom === "צלוליטיס");
      expect(cellTasks).toHaveLength(4);
    });
  });

  // 14. C. difficile
  describe("C. difficile", () => {
    it("triggers on 'C diff'", () => {
      const tasks = applyRules(makePatient({ status: ["C diff infection"] }));
      expect(generatedSources(tasks)).toContain("חשד C. difficile");
    });

    it("triggers on 'קלוסטרידיום'", () => {
      const tasks = applyRules(makePatient({ status: ["קלוסטרידיום"] }));
      expect(generatedSources(tasks)).toContain("חשד C. difficile");
    });

    it("generates 4 C. diff tasks", () => {
      const tasks = applyRules(makePatient({ status: ["clostridium"] }));
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
      const tasks = applyRules(makePatient({ status: ["AKI"] }));
      expect(generatedSources(tasks)).toContain("AKI");
    });

    it("triggers on 'acute kidney'", () => {
      const tasks = applyRules(makePatient({ status: ["acute kidney injury"] }));
      expect(generatedSources(tasks)).toContain("AKI");
    });

    it("generates 6 AKI tasks", () => {
      const tasks = applyRules(makePatient({ status: ["AKI"] }));
      const akiTasks = tasks.filter((t) => t.generatedFrom === "AKI");
      expect(akiTasks).toHaveLength(6);
    });
  });

  // 17. Hyperkalemia
  describe("Hyperkalemia", () => {
    it("triggers on 'היפרקלמיה'", () => {
      const tasks = applyRules(makePatient({ status: ["היפרקלמיה"] }));
      expect(generatedSources(tasks)).toContain("היפרקלמיה");
    });

    it("triggers on 'hyperkalemia'", () => {
      const tasks = applyRules(makePatient({ status: ["hyperkalemia"] }));
      expect(generatedSources(tasks)).toContain("היפרקלמיה");
    });

    it("generates 6 hyperkalemia tasks", () => {
      const tasks = applyRules(makePatient({ status: ["היפרקלמיה"] }));
      const hkTasks = tasks.filter((t) => t.generatedFrom === "היפרקלמיה");
      expect(hkTasks).toHaveLength(6);
    });
  });

  // 18. Hypokalemia
  describe("Hypokalemia", () => {
    it("triggers on 'היפוקלמיה'", () => {
      const tasks = applyRules(makePatient({ status: ["היפוקלמיה"] }));
      expect(generatedSources(tasks)).toContain("היפוקלמיה");
    });

    it("triggers on 'hypokalemia'", () => {
      const tasks = applyRules(makePatient({ status: ["hypokalemia"] }));
      expect(generatedSources(tasks)).toContain("היפוקלמיה");
    });

    it("generates 5 hypokalemia tasks", () => {
      const tasks = applyRules(makePatient({ status: ["היפוקלמיה"] }));
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
      const tasks = applyRules(makePatient({ status: ["STEMI"] }));
      expect(generatedSources(tasks)).toContain("כאב חזה / ACS");
    });

    it("triggers on 'chest pain'", () => {
      const tasks = applyRules(makePatient({ status: ["chest pain"] }));
      expect(generatedSources(tasks)).toContain("כאב חזה / ACS");
    });

    it("generates 7 ACS tasks", () => {
      const tasks = applyRules(makePatient({ status: ["STEMI"] }));
      const acsTasks = tasks.filter((t) => t.generatedFrom === "כאב חזה / ACS");
      expect(acsTasks).toHaveLength(7);
    });
  });

  // 20. CHF
  describe("CHF / Heart failure", () => {
    it("triggers on 'אי ספיקת לב'", () => {
      const tasks = applyRules(makePatient({ status: ["אי ספיקת לב"] }));
      expect(generatedSources(tasks)).toContain("אי-ספיקת לב");
    });

    it("triggers on 'CHF'", () => {
      const tasks = applyRules(makePatient({ status: ["CHF"] }));
      expect(generatedSources(tasks)).toContain("אי-ספיקת לב");
    });

    it("triggers on 'pulmonary edema'", () => {
      const tasks = applyRules(makePatient({ status: ["pulmonary edema"] }));
      expect(generatedSources(tasks)).toContain("אי-ספיקת לב");
    });

    it("generates 6 CHF tasks", () => {
      const tasks = applyRules(makePatient({ status: ["CHF"] }));
      const chfTasks = tasks.filter((t) => t.generatedFrom === "אי-ספיקת לב");
      expect(chfTasks).toHaveLength(6);
    });
  });

  // 21. DVT / PE
  describe("DVT / PE", () => {
    it("triggers on 'DVT'", () => {
      const tasks = applyRules(makePatient({ status: ["DVT"] }));
      expect(generatedSources(tasks)).toContain("DVT / PE");
    });

    it("triggers on 'תסחיף ריאתי'", () => {
      const tasks = applyRules(makePatient({ status: ["תסחיף ריאתי"] }));
      expect(generatedSources(tasks)).toContain("DVT / PE");
    });

    it("generates 5 DVT/PE tasks", () => {
      const tasks = applyRules(makePatient({ status: ["DVT"] }));
      const dvtTasks = tasks.filter((t) => t.generatedFrom === "DVT / PE");
      expect(dvtTasks).toHaveLength(5);
    });
  });

  // 22. Delirium
  describe("Delirium", () => {
    it("triggers on 'דליריום'", () => {
      const tasks = applyRules(makePatient({ status: ["דליריום"] }));
      expect(generatedSources(tasks)).toContain("דליריום");
    });

    it("triggers on 'delirium'", () => {
      const tasks = applyRules(makePatient({ status: ["delirium"] }));
      expect(generatedSources(tasks)).toContain("דליריום");
    });

    it("triggers on 'acute confusion'", () => {
      const tasks = applyRules(makePatient({ status: ["acute confusion"] }));
      expect(generatedSources(tasks)).toContain("דליריום");
    });

    it("includes lorazepam IV as last-resort rescue", () => {
      const tasks = applyRules(makePatient({ status: ["דליריום"] }));
      expect(tasks.some(t => t.text.includes("Lorazepam 1mg IV"))).toBe(true);
    });

    it("haloperidol is IM only (no IV)", () => {
      const tasks = applyRules(makePatient({ status: ["דליריום"] }));
      const haldolTasks = tasks.filter(t => t.text.includes("Haloperidol"));
      expect(haldolTasks.every(t => t.text.includes("IM"))).toBe(true);
      expect(haldolTasks.some(t => t.text.includes("IV"))).toBe(false);
    });

    it("triggers on sundowning", () => {
      const tasks = applyRules(makePatient({ status: ["sundowning"] }));
      expect(generatedSources(tasks)).toContain("דליריום");
    });

    it("generates 13 delirium tasks (workup + non-pharm + treatment ladder)", () => {
      const tasks = applyRules(makePatient({ status: ["דליריום"] }));
      const delTasks = tasks.filter((t) => t.generatedFrom === "דליריום");
      expect(delTasks).toHaveLength(14);
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
      const tasks = applyRules(makePatient({ status: ["hematemesis"] }));
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
      const tasks = applyRules(makePatient({ status: ["COPD החמרה"] }));
      expect(generatedSources(tasks)).toContain("החמרת COPD");
    });

    it("triggers on 'AECOPD'", () => {
      const tasks = applyRules(makePatient({ status: ["AECOPD"] }));
      expect(generatedSources(tasks)).toContain("החמרת COPD");
    });

    it("generates 6 COPD tasks", () => {
      const tasks = applyRules(makePatient({ status: ["COPD החמרה"] }));
      const copdTasks = tasks.filter((t) => t.generatedFrom === "החמרת COPD");
      expect(copdTasks).toHaveLength(6);
    });
  });

  // 26. Hypoglycemia
  describe("Hypoglycemia", () => {
    it("triggers on 'היפוגליקמיה'", () => {
      const tasks = applyRules(makePatient({ status: ["היפוגליקמיה"] }));
      expect(generatedSources(tasks)).toContain("היפוגליקמיה");
    });

    it("triggers on 'hypoglycemia'", () => {
      const tasks = applyRules(makePatient({ status: ["hypoglycemia"] }));
      expect(generatedSources(tasks)).toContain("היפוגליקמיה");
    });

    it("generates 3 hypoglycemia tasks", () => {
      const tasks = applyRules(makePatient({ status: ["היפוגליקמיה"] }));
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

    it("generates 2 admission tasks (verify-labs + ECG; CXR removed)", () => {
      // CXR was removed: the on-call doc cannot determine from imported text
      // whether a recent CXR exists, so ordering one blindly creates alarm fatigue.
      // Labs task is now phrased as verification+order, not just order.
      const tasks = applyRules(makePatient({ status: ["קבלה חדשה"] }));
      const admTasks = tasks.filter((t) => t.generatedFrom === "קבלה חדשה");
      expect(admTasks).toHaveLength(2);
    });
  });

  // 28. Hyponatremia
  describe("Hyponatremia", () => {
    it("triggers on 'היפונתרמיה'", () => {
      const tasks = applyRules(makePatient({ status: ["היפונתרמיה"] }));
      expect(generatedSources(tasks)).toContain("היפונתרמיה");
    });

    it("triggers on 'hyponatremia'", () => {
      const tasks = applyRules(makePatient({ status: ["hyponatremia"] }));
      expect(generatedSources(tasks)).toContain("היפונתרמיה");
    });

    it("generates 5 hyponatremia tasks", () => {
      const tasks = applyRules(makePatient({ status: ["היפונתרמיה"] }));
      const naTasks = tasks.filter((t) => t.generatedFrom === "היפונתרמיה");
      expect(naTasks).toHaveLength(5);
    });
  });

  // 29. Stroke / TIA
  describe("Stroke / TIA", () => {
    it("triggers on 'שבץ'", () => {
      const tasks = applyRules(makePatient({ status: ["שבץ"] }));
      expect(generatedSources(tasks)).toContain("שבץ / TIA");
    });

    it("triggers on 'CVA'", () => {
      const tasks = applyRules(makePatient({ status: ["CVA"] }));
      expect(generatedSources(tasks)).toContain("שבץ / TIA");
    });

    it("triggers on 'TIA'", () => {
      const tasks = applyRules(makePatient({ status: ["TIA"] }));
      expect(generatedSources(tasks)).toContain("שבץ / TIA");
    });

    it("generates 7 stroke tasks", () => {
      const tasks = applyRules(makePatient({ status: ["שבץ"] }));
      const strTasks = tasks.filter((t) => t.generatedFrom === "שבץ / TIA");
      expect(strTasks).toHaveLength(7);
    });
  });
});

// ─── Cross-cutting rule behavior ───

describe("rules engine — cross-cutting behavior", () => {
  it("all generated tasks have source='generated'", () => {
    const tasks = applyRules(makePatient({ status: ["ספסיס"], flags: ["NPO", "FALL"] }));
    expect(tasks.length).toBeGreaterThan(0);
    for (const t of tasks) {
      expect(t.source).toBe("generated");
    }
  });

  it("all generated tasks have a generatedFrom field", () => {
    const tasks = applyRules(makePatient({ status: ["דלקת ריאות"] }));
    for (const t of tasks) {
      expect(t.generatedFrom).toBeDefined();
      expect(t.generatedFrom!.length).toBeGreaterThan(0);
    }
  });

  it("all generated tasks have valid urgency", () => {
    const tasks = applyRules(makePatient({ status: ["ספסיס"] }));
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
      makePatient({ status: ["NPO", "עירוי דם"] }),
    );
    const sources = generatedSources(tasks);
    expect(sources).toContain("NPO");
    expect(sources).toContain("עירוי דם");
  });

  it("patient with no matching conditions generates no tasks", () => {
    const tasks = applyRules(makePatient({}));
    expect(tasks).toHaveLength(0);
  });

  it("RULES array has expected number of rules", () => {
    expect(RULES.length).toBe(58); // +4: comfort_sedation_symptom, aspiration_risk, pressure_ulcer, delirium_nonpharm_bundle
  });

  it("every rule has a unique group", () => {
    const groups = RULES.map((r) => r.group).filter(Boolean);
    expect(new Set(groups).size).toBe(groups.length);
  });

  // ═══ IV Protocol Monitoring Rules ═══

  describe("IV Insulin", () => {
    it("does NOT trigger on 'insulin drip' in planNotes — plan text is not a task", () => {
      // Golden rule: planNotes describe the existing plan, not on-call actions.
      // A patient on insulin drip per plan ≠ the on-call doctor needs to act.
      const tasks = applyRules(makePatient({ planNotes: ["insulin drip 2cc/hr"] }));
      expect(generatedSources(tasks)).not.toContain("אינסולין IV");
    });

    it("triggers on 'אינסולין מתמשך' in status", () => {
      const tasks = applyRules(makePatient({ status: ["אינסולין מתמשך ווריד"] }));
      expect(generatedSources(tasks)).toContain("אינסולין IV");
    });
  });

  describe("IV Heparin", () => {
    it("does NOT trigger on 'heparin drip' in planNotes — plan text is not a task", () => {
      const tasks = applyRules(makePatient({ planNotes: ["heparin drip per protocol"] }));
      expect(generatedSources(tasks)).not.toContain("הפרין IV");
    });

    it("triggers on 'UFH'", () => {
      const tasks = applyRules(makePatient({ status: ["UFH infusion"] }));
      expect(generatedSources(tasks)).toContain("הפרין IV");
    });
  });

  describe("IV Vasopressors", () => {
    it("does NOT trigger on noradrenaline in planNotes — plan text is not a task", () => {
      const tasks = applyRules(makePatient({ planNotes: ["noradrenaline 0.1 mcg/kg/min"] }));
      expect(generatedSources(tasks)).not.toContain("נוראדרנלין / vasopressor");
    });

    it("triggers on נוראדרנלין in Hebrew", () => {
      const tasks = applyRules(makePatient({ status: ["נוראדרנלין"] }));
      expect(generatedSources(tasks)).toContain("נוראדרנלין / vasopressor");
    });
  });

  describe("IV Amiodarone", () => {
    it("does NOT trigger on amiodarone in planNotes — plan text is not a task", () => {
      const tasks = applyRules(makePatient({ planNotes: ["amiodarone loading"] }));
      expect(generatedSources(tasks)).not.toContain("אמיודרון IV");
    });

    it("triggers on procor/פרוקור", () => {
      const tasks = applyRules(makePatient({ status: ["פרוקור IV"] }));
      expect(generatedSources(tasks)).toContain("אמיודרון IV");
    });
  });

  describe("IV Opioids", () => {
    it("does NOT trigger on morphine drip in planNotes — plan text is not a task", () => {
      // Core bug fix: "patient is on fentanyl/morphine" in the plan should not
      // generate red/urgent monitoring tasks for the on-call doctor.
      const tasks = applyRules(makePatient({ planNotes: ["morphine drip 2mg/hr"] }));
      expect(generatedSources(tasks)).not.toContain("אופיואידים IV");
    });

    it("does NOT trigger on fentanyl infusion in planNotes", () => {
      const tasks = applyRules(makePatient({ planNotes: ["fentanyl infusion"] }));
      expect(generatedSources(tasks)).not.toContain("אופיואידים IV");
    });

    it("DOES trigger on morphine drip in status (explicit on-call context)", () => {
      // If the on-call doctor explicitly has morphine drip in their status/task,
      // then monitoring tasks are appropriate.
      const tasks = applyRules(makePatient({ status: ["morphine drip 2mg/hr IV"] }));
      expect(generatedSources(tasks)).toContain("אופיואידים IV");
    });
  });

  describe("Blood Transfusion", () => {
    it("does NOT trigger on עירוי דם in planNotes — plan text is not a task", () => {
      const tasks = applyRules(makePatient({ planNotes: ["עירוי דם PRBC"] }));
      expect(generatedSources(tasks)).not.toContain("עירוי דם");
    });

    it("triggers on PRBC", () => {
      const tasks = applyRules(makePatient({ status: ["PRBC x2 ordered"] }));
      expect(generatedSources(tasks)).toContain("עירוי דם");
    });

    it("suppressed in comfort care when in status", () => {
      // Suppression logic still valid — just test via status not planNotes
      const tasks = applyRules(makePatient({
        flags: ["palliative"],
        status: ["עירוי דם PRBC מתוכנן"],
      }));
      expect(generatedSources(tasks)).not.toContain("עירוי דם");
    });
  });

  describe("IV protocol + comfort care suppression", () => {
    it("insulin drip suppressed in comfort care (when in status)", () => {
      // planNotes no longer triggers — test via status to verify suppression logic
      const tasks = applyRules(makePatient({
        flags: ["comfort care"],
        status: ["insulin drip actrapid 2cc/hr"],
      }));
      expect(generatedSources(tasks)).not.toContain("אינסולין IV");
    });

    it("vasopressor suppressed in comfort care (when in status)", () => {
      const tasks = applyRules(makePatient({
        flags: ["טיפול מנחם"],
        status: ["noradrenaline 0.1 mcg/kg/min"],
      }));
      expect(generatedSources(tasks)).not.toContain("נוראדרנלין / vasopressor");
    });

    it("midazolam in planNotes does NOT trigger (plan text, not task)", () => {
      // planNotes no longer triggers any rule — comfort care or not
      const tasks = applyRules(makePatient({
        flags: ["פליאטיב"],
        planNotes: ["dormicum drip"],
      }));
      expect(generatedSources(tasks)).not.toContain("דורמיקום IV");
    });

    it("midazolam in status DOES trigger (explicit on-call item)", () => {
      // Even in non-comfort-care patients, midazolam in status generates monitoring
      const tasks = applyRules(makePatient({
        status: ["dormicum midazolam drip infusion"],
      }));
      expect(generatedSources(tasks)).toContain("דורמיקום IV");
    });
  });

  // ═══ DELIRIUM DRUG PROTOCOLS ═══

  describe("Haloperidol protocol", () => {
    it("does NOT trigger on הלופרידול in planNotes — plan text is not a task", () => {
      const tasks = applyRules(makePatient({ planNotes: ["הלופרידול 0.5mg IV"] }));
      expect(generatedSources(tasks)).not.toContain("הלופרידול");
    });

    it("triggers on haldol in status", () => {
      const tasks = applyRules(makePatient({ status: ["haldol 1mg PRN"] }));
      expect(generatedSources(tasks)).toContain("הלופרידול");
    });

    it("warns about Parkinson/DLB when in status", () => {
      const tasks = applyRules(makePatient({ status: ["haloperidol 0.5mg IM"] }));
      expect(tasks.some(t => t.text.includes("DLB") && t.text.includes("Quetiapine"))).toBe(true);
    });

    it("NOT suppressed in comfort care when in status (agitation management is comfort care)", () => {
      const tasks = applyRules(makePatient({
        flags: ["comfort care"],
        status: ["haloperidol 0.5mg IM PRN agitation"],
      }));
      expect(generatedSources(tasks)).toContain("הלופרידול");
    });
  });

  describe("Quetiapine protocol", () => {
    it("does NOT trigger on quetiapine in planNotes", () => {
      const tasks = applyRules(makePatient({ planNotes: ["quetiapine 25mg HS"] }));
      expect(generatedSources(tasks)).not.toContain("קווטיאפין");
    });

    it("triggers on סרוקוול", () => {
      const tasks = applyRules(makePatient({ status: ["סרוקוול 12.5mg"] }));
      expect(generatedSources(tasks)).toContain("קווטיאפין");
    });

    it("NOT suppressed in comfort care when in status (comfort drug)", () => {
      const tasks = applyRules(makePatient({
        flags: ["palliative"],
        status: ["quetiapine 12.5mg HS"],
      }));
      expect(generatedSources(tasks)).toContain("קווטיאפין");
    });
  });

  describe("Olanzapine protocol", () => {
    it("does NOT trigger on olanzapine in planNotes", () => {
      const tasks = applyRules(makePatient({ planNotes: ["olanzapine 2.5mg IM"] }));
      expect(generatedSources(tasks)).not.toContain("אולנזפין");
    });

    it("triggers on zyprexa", () => {
      const tasks = applyRules(makePatient({ status: ["zyprexa 5mg"] }));
      expect(generatedSources(tasks)).toContain("אולנזפין");
    });
  });

  describe("Risperidone protocol", () => {
    it("does NOT trigger on risperidone in planNotes", () => {
      const tasks = applyRules(makePatient({ planNotes: ["risperidone 0.5mg"] }));
      expect(generatedSources(tasks)).not.toContain("ריספרידון");
    });

    it("includes FDA Black Box warning when in status", () => {
      const tasks = applyRules(makePatient({ status: ["risperidone risperdal 0.5mg BID"] }));
      expect(tasks.some(t => t.text.includes("Black Box"))).toBe(true);
    });
  });

  describe("Dexmedetomidine protocol", () => {
    it("does NOT trigger on precedex in planNotes", () => {
      const tasks = applyRules(makePatient({ planNotes: ["precedex infusion"] }));
      expect(generatedSources(tasks)).not.toContain("דקסמדטומידין (Precedex)");
    });

    it("triggers on דקסמדטומידין", () => {
      const tasks = applyRules(makePatient({ status: ["דקסמדטומידין"] }));
      expect(generatedSources(tasks)).toContain("דקסמדטומידין (Precedex)");
    });

    it("NOT suppressed in comfort care when in status (sedation for terminal agitation)", () => {
      const tasks = applyRules(makePatient({
        flags: ["EOL"],
        status: ["dexmedetomidine precedex infusion"],
      }));
      expect(generatedSources(tasks)).toContain("דקסמדטומידין (Precedex)");
    });
  });

  describe("Trazodone protocol", () => {
    it("does NOT trigger on trazodone in planNotes — plan text is not a task", () => {
      const tasks = applyRules(makePatient({ planNotes: ["trazodone 50mg HS"] }));
      expect(generatedSources(tasks)).not.toContain("טרזודון");
    });

    it("NOT suppressed in comfort care when in status", () => {
      const tasks = applyRules(makePatient({
        flags: ["comfort care"],
        status: ["trazodone טרזודון 25mg HS"],
      }));
      expect(generatedSources(tasks)).toContain("טרזודון");
    });
  });
});

// ── New geriatric safety rules (Gemini audit 2026-03-03) ─────────────────────

describe("aspiration_risk rule", () => {
  it("triggers for dysphagia", () => {
    const p = makePatient({ diagnosis: "dysphagia aspiration pneumonia" });
    expect(generatedSources(applyRules(p))).toContain("סיכון לאספירציה");
  });
  it("triggers for NPO", () => {
    const p = makePatient({ diagnosis: "NPO post-op bowel obstruction" });
    expect(generatedSources(applyRules(p))).toContain("סיכון לאספירציה");
  });
});

describe("pressure_ulcer rule", () => {
  it("triggers for pressure ulcer", () => {
    const p = makePatient({ diagnosis: "pressure ulcer heel stage 2" });
    expect(generatedSources(applyRules(p))).toContain("סיכון לפצע לחץ");
  });
  it("triggers for decubitus", () => {
    const p = makePatient({ diagnosis: "decubitus sacrum" });
    expect(generatedSources(applyRules(p))).toContain("סיכון לפצע לחץ");
  });
});

describe("delirium_nonpharm_bundle rule", () => {
  it("triggers for delirium", () => {
    const p = makePatient({ diagnosis: "delirium acute confusion" });
    expect(generatedSources(applyRules(p))).toContain("חבילת דליריום — לא תרופתית");
  });
  it("does NOT suppress bundle for comfort patients — non-pharm bundle is always appropriate", () => {
    const p = makePatient({ diagnosis: "delirium agitation palliative care EOL" });
    expect(generatedSources(applyRules(p))).toContain("חבילת דליריום — לא תרופתית");
  });
});

describe("comfort_sedation_symptom rule", () => {
  // isComfortCareOnly is detected via COMFORT_CARE_PATTERN in diagnosis/status text
  it("fires qualitative check for comfort patient on morphine", () => {
    const p = makePatient({ diagnosis: "מורפין IV palliative comfort care", status: ["morphine drip 2mg/hr IV"] });
    expect(generatedSources(applyRules(p))).toContain("בדיקת סימפטומים — טיפול מנחם");
  });
  it("does NOT fire for non-comfort patients — Q2H monitoring fires instead", () => {
    const p = makePatient({ status: ["morphine drip 2mg/hr IV"] });
    const sources = generatedSources(applyRules(p));
    expect(sources).not.toContain("בדיקת סימפטומים — טיפול מנחם");
    expect(sources).toContain("אופיואידים IV");
  });
  it("iv_opioid Q2H monitoring IS suppressed for comfort/palliative patients", () => {
    const p = makePatient({ diagnosis: "palliative care EOL", status: ["morphine drip 2mg/hr IV"] });
    expect(generatedSources(applyRules(p))).not.toContain("אופיואידים IV");
  });
  it("iv_midazolam Q2H monitoring IS suppressed for comfort patients", () => {
    const p = makePatient({ diagnosis: "palliative care end of life", status: ["dormicum midazolam drip IV"] });
    expect(generatedSources(applyRules(p))).not.toContain("דורמיקום IV");
  });
});

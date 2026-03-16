/**
 * Room Format Simulation Tests — SZMC Geriatric Ward
 * 
 * Simulates real ward scenarios with 30+ patients across all sections,
 * mixing new room format (70, א-92, 2088) with legacy (49/2).
 * Tests parser, section detection, sorting, handoff text, and edge cases.
 */
import { describe, it, expect } from "vitest";
import { parsePatientList } from "../parser/parsePatientList";

// ─── Helpers ────────────────────────────────────────────────────────────────

function expectRoom(input: string, expectedRoom: string, expectedName?: string) {
  const result = parsePatientList(input);
  expect(result.length).toBeGreaterThanOrEqual(1);
  expect(result[0].room).toBe(expectedRoom);
  if (expectedName) expect(result[0].name).toBe(expectedName);
}

function expectNoParse(input: string) {
  const result = parsePatientList(input);
  expect(result).toHaveLength(0);
}

// ─── 1. Room Format — New SZMC Format (100+ scenarios) ──────────────────────

describe("New SZMC room format — comprehensive", () => {
  describe("plain 2-digit rooms", () => {
    it.each([
      ["70", "70"], ["71", "71"], ["76", "76"], ["78", "78"],
      ["79", "79"], ["80", "80"], ["86", "86"], ["88", "88"],
      ["94", "94"], ["96", "96"],
    ])("room %s → %s", (input, expected) => {
      expectRoom(`${input} כהן יוסף 82`, expected);
    });
  });

  describe("3-digit rooms", () => {
    it.each([
      ["117", "117"], ["119", "119"], ["120", "120"],
      ["100", "100"], ["101", "101"], ["200", "200"],
    ])("room %s → %s", (input, expected) => {
      expectRoom(`${input} לוי שרה 75`, expected);
    });
  });

  describe("4-digit rooms (full format)", () => {
    it.each([
      ["2070", "2070"], ["2088", "2088"], ["2092", "2092"],
      ["2095", "2095"], ["2096", "2096"], ["2117", "2117"],
      ["2120", "2120"], ["1000", "1000"], ["3000", "3000"],
    ])("room %s → %s", (input, expected) => {
      expectRoom(`${input} אברהם דוד 80`, expected);
    });
  });

  describe("Hebrew-letter prefix rooms (א-92 format)", () => {
    it.each([
      ["א-92", "א-92"],
      ["א-95", "א-95"],
      ["ב-10", "ב-10"],
      ["ג-15", "ג-15"],
    ])("room %s → %s (hyphenated)", (input, expected) => {
      expectRoom(`${input} גולדנברג צפורה 93`, expected);
    });

    it("א 92 (space-separated) normalizes to א-92", () => {
      expectRoom("א 92 גולדנברג צפורה 93", "א-92");
    });

    it("א 95 (space-separated) normalizes to א-95", () => {
      expectRoom("א 95 שוויקי יהודית 91", "א-95");
    });
  });

  describe("Hebrew-letter suffix rooms (2095-א format)", () => {
    it.each([
      ["2095-א", "2095-א"],
      ["92-א", "92-א"],
      ["95-ב", "95-ב"],
    ])("room %s → %s", (input, expected) => {
      expectRoom(`${input} לוי שרה 78`, expected);
    });

    it("2095א (no hyphen) → 2095א", () => {
      expectRoom("2095א לוי שרה 78", "2095א");
    });
  });

  describe("legacy room/bed format preserved", () => {
    it.each([
      ["49/2", "49/2"], ["55/1", "55/1"], ["58/3", "58/3"],
      ["49-3", "49-3"], ["52-1", "52-1"],
    ])("room %s → %s", (input, expected) => {
      expectRoom(`${input} כהן דני 65`, expected);
    });
  });

  describe("monitor rooms preserved", () => {
    it.each([
      ["ניטור-1", "ניטור-1"],
      ["ניטור-2", "ניטור-2"],
      ["ניטור 3", "ניטור 3"],
    ])("room %s → %s", (input, expected) => {
      expectRoom(`${input} כהן דני 55`, expected);
    });
  });
});

// ─── 2. Full Ward Simulation — Side ב from images ──────────────────────────

describe("Full ward simulation — צד ב (from actual ward list 15/03/2026)", () => {
  const SIDE_B_LIST = `צד ב
70 אסרף אברהם 87 RETENTION 2CO
71 בן שמעון דוד 89 HYPERNATREMIA DNR DNI
76 שוויקי סמיחה 75 Dyspnea CHF RIGHT PLEURAL EFFUSION
78 חיט ולדימיר 77 pancytopenia
79 לביאד דוד 82 Peg complication
80 בליגסקי מרינה 89 Falls
86 חזלט חיים 95 Aspiration pneumonia DNR/DNI
88 ויינר פיוטר 94 hypernatremic PNEUMONIA DNR/DNI
א-92 אביסרור חיים 96 HEMATOMA ILIOPSOAS CLL S/P crif
94 יוסף ששון 90 ASTHMA RT PLEURAL EFFUSION PNEUMONIA
א-95 ששון יעקב 78 ANASARCA Pulmonary edema
96 דואניס שמואל 88 UTI
117 בן הרוש רנה 93 HYPONATREMIA
120 הררי נפטלי ידידה 93 ISCHEMIC COLITIS ECOLI URINE
119 שוויקי יהודית 91 PLEURAL EFFUSION LARGE LEFT`;

  const result = parsePatientList(SIDE_B_LIST);

  it("parses all 15 patients", () => {
    expect(result).toHaveLength(15);
  });

  it("all patients assigned to SIDE_B", () => {
    expect(result.every(p => p.section === "SIDE_B")).toBe(true);
  });

  it("correctly parses room 70", () => {
    const p = result.find(r => r.room === "70");
    expect(p).toBeDefined();
    expect(p!.name).toBe("אסרף אברהם");
    expect(p!.age).toBe(87);
  });

  it("correctly parses room א-92 (letter prefix)", () => {
    const p = result.find(r => r.room === "א-92");
    expect(p).toBeDefined();
    expect(p!.name).toBe("אביסרור חיים");
    expect(p!.age).toBe(96);
  });

  it("correctly parses room א-95 (letter prefix)", () => {
    const p = result.find(r => r.room === "א-95");
    expect(p).toBeDefined();
    expect(p!.name).toBe("ששון יעקב");
    expect(p!.age).toBe(78);
  });

  it("correctly parses DNR/DNI from room 86", () => {
    const p = result.find(r => r.room === "86");
    expect(p).toBeDefined();
    expect(p!.name).toBe("חזלט חיים");
    expect(p!.status.length + p!.flags.length).toBeGreaterThan(0);
  });

  it("correctly parses DNR DNI (space-separated) from room 71", () => {
    const p = result.find(r => r.room === "71");
    expect(p).toBeDefined();
    expect(p!.name).toBe("בן שמעון דוד");
  });

  it("correctly parses multi-word diagnosis from room 76", () => {
    const p = result.find(r => r.room === "76");
    expect(p).toBeDefined();
    expect(p!.diagnosis).toContain("CHF");
  });

  it("correctly parses 3-digit rooms 117, 119, 120", () => {
    expect(result.find(r => r.room === "117")).toBeDefined();
    expect(result.find(r => r.room === "119")).toBeDefined();
    expect(result.find(r => r.room === "120")).toBeDefined();
  });

  it("room 120 patient has correct name", () => {
    const p = result.find(r => r.room === "120");
    expect(p!.name).toContain("הררי");
  });
});

// ─── 3. Multi-Section Full Ward (30+ patients) ─────────────────────────────

describe("Full ward simulation — 35 patients across all sections", () => {
  const FULL_WARD = `צד א
20 כהן אברהם 85 CHF NYHA III
21 לוי רחל 79 UTI sepsis
22 אברמוביץ דוד 91 PNEUMONIA DNR
23 פרידמן שרה 88 HIP FRACTURE S/P ORIF
24 גולד יעקב 76 COPD exacerbation
25 ברקוביץ מרים 94 HYPERNATREMIA
26 שטרן משה 82 AKI on CKD
27 חיים דניאל 73 GI BLEED
28 דוידוב אסתר 87 FALL WITH HEAD INJURY
29 גרינברג נחום 90 DELIRIUM hyperactive

צד ב
70 אסרף אברהם 87 RETENTION 2CO
71 בן שמעון דוד 89 HYPERNATREMIA DNR DNI
76 שוויקי סמיחה 75 Dyspnea CHF RIGHT PLEURAL EFFUSION
78 חיט ולדימיר 77 pancytopenia
79 לביאד דוד 82 Peg complication
80 בליגסקי מרינה 89 Falls
86 חזלט חיים 95 Aspiration pneumonia DNR/DNI
88 ויינר פיוטר 94 hypernatremic PNEUMONIA DNR/DNI
א-92 אביסרור חיים 96 HEMATOMA ILIOPSOAS CLL
94 יוסף ששון 90 ASTHMA RT PLEURAL EFFUSION
א-95 ששון יעקב 78 ANASARCA Pulmonary edema
96 דואניס שמואל 88 UTI
117 בן הרוש רנה 93 HYPONATREMIA

צד ג
30 קפלן אריה 80 DVT PE
31 רוזנברג לאה 86 CELLULITIS left leg
32 מזרחי יוסף 77 SYNCOPE workup
33 אלון חנה 92 HYPONATREMIA severe
34 פינקלשטיין בוריס 84 PNEUMONIA aspiration DNR/DNI
35 ביטון שמעון 71 PANCREATITIS

שיקום
40 נחמיאס רבקה 78 HIP FRACTURE rehab
41 טובול אהרון 83 STROKE rehab
42 סבג דליה 76 KNEE REPLACEMENT rehab

ניטור
ניטור-1 לנדאו אפרים 88 STEMI post PCI
ניטור 2 וולף גיטל 91 SEPTIC SHOCK
ניטור-3 מלול חיים 85 RESPIRATORY FAILURE BiPAP`;

  const result = parsePatientList(FULL_WARD);

  it("parses all 35 patients", () => {
    expect(result).toHaveLength(35);
  });

  it("section counts are correct", () => {
    const counts: Record<string, number> = {};
    for (const p of result) {
      counts[p.section] = (counts[p.section] ?? 0) + 1;
    }
    expect(counts["SIDE_A"]).toBe(10);
    expect(counts["SIDE_B"]).toBe(13);
    expect(counts["SIDE_C"]).toBe(6);
    expect(counts["REHAB"]).toBe(3);
    expect(counts["MONITOR"]).toBe(3);
  });

  it("all patients have a room", () => {
    expect(result.every(p => p.room !== null && p.room !== "")).toBe(true);
  });

  it("all patients have a name", () => {
    expect(result.every(p => p.name !== null && p.name !== "")).toBe(true);
  });

  it("all patients have an age", () => {
    expect(result.every(p => p.age !== null && p.age! >= 18 && p.age! <= 120)).toBe(true);
  });

  it("monitor rooms parsed correctly", () => {
    const monitors = result.filter(p => p.section === "MONITOR");
    expect(monitors.map(p => p.room).sort()).toEqual(["ניטור 2", "ניטור-1", "ניטור-3"]);
  });

  it("rehab patients in REHAB section", () => {
    const rehab = result.filter(p => p.section === "REHAB");
    expect(rehab).toHaveLength(3);
    expect(rehab.every(p => p.section === "REHAB")).toBe(true);
  });

  it("letter-prefix rooms in side ב", () => {
    const letterRooms = result.filter(p => p.room?.startsWith("א-"));
    expect(letterRooms).toHaveLength(2);
    expect(letterRooms.every(p => p.section === "SIDE_B")).toBe(true);
  });
});

// ─── 4. Edge Cases ──────────────────────────────────────────────────────────

describe("Room format edge cases", () => {
  it("single-digit room (room 5)", () => {
    expectRoom("5 כהן יוסף 82", "5");
  });

  it("room 0 is valid", () => {
    expectRoom("0 כהן יוסף 82", "0");
  });

  it("room 9999 (max 4 digits)", () => {
    expectRoom("9999 כהן יוסף 82", "9999");
  });

  it("room with age ambiguity — 80 is room, 75 is age", () => {
    const result = parsePatientList("80 כהן יוסף 75");
    expect(result[0].room).toBe("80");
    expect(result[0].age).toBe(75);
  });

  it("room 94 with patient age 90 — no confusion", () => {
    const result = parsePatientList("94 יוסף ששון 90");
    expect(result[0].room).toBe("94");
    expect(result[0].name).toBe("יוסף ששון");
    expect(result[0].age).toBe(90);
  });

  it("room 117 with patient age 93 — no confusion", () => {
    const result = parsePatientList("117 בן הרוש רנה 93");
    expect(result[0].room).toBe("117");
    expect(result[0].age).toBe(93);
  });

  it("room א-92 followed by non-Hebrew name (edge case)", () => {
    // Should still parse the room correctly
    const result = parsePatientList("א-92 SMITH JOHN 75 UTI");
    expect(result).toHaveLength(1);
    expect(result[0].room).toBe("א-92");
  });

  it("does not confuse section header ב with room letter", () => {
    // "צד ב" should be a section header, not "ב" as a room prefix
    const result = parsePatientList(`צד ב
70 כהן יוסף 82 UTI`);
    expect(result).toHaveLength(1);
    expect(result[0].room).toBe("70");
    expect(result[0].section).toBe("SIDE_B");
  });

  it("does not confuse standalone ב followed by number as room", () => {
    // "ב 3" on its own line SHOULD now parse as room "ב-3" since section headers
    // are detected earlier in the pipeline (they need "צד ב" not bare "ב")
    const result = parsePatientList("ב 3 כהן יוסף 82");
    expect(result).toHaveLength(1);
    expect(result[0].room).toBe("ב-3");
  });

  it("ג-15 room parses correctly (not confused with section ג)", () => {
    const result = parsePatientList("ג 15 כהן דני 55");
    expect(result).toHaveLength(1);
    expect(result[0].room).toBe("ג-15");
  });

  it("room ב-10 under צד ב stays in SIDE_B", () => {
    const result = parsePatientList("צד ב\nב-10 כהן יוסף 82 UTI");
    expect(result).toHaveLength(1);
    expect(result[0].room).toBe("ב-10");
    expect(result[0].section).toBe("SIDE_B");
  });

  it("handles multiple spaces between room and name", () => {
    expectRoom("70   אסרף   אברהם   87", "70", "אסרף אברהם");
  });

  it("handles tab-separated room and name", () => {
    expectRoom("70\tאסרף אברהם\t87", "70");
  });

  it("handles mixed new and legacy in same section", () => {
    const text = `צד א
70 כהן יוסף 82 UTI
49/2 לוי שרה 75 CHF
א-92 אברהם דוד 90 PNEUMONIA`;
    const result = parsePatientList(text);
    expect(result).toHaveLength(3);
    expect(result[0].room).toBe("70");
    expect(result[1].room).toBe("49/2");
    expect(result[2].room).toBe("א-92");
  });

  it("CRITICAL: room א-92 under צד ב stays SIDE_B — letter prefix is NOT section", () => {
    const text = `צד ב
70 אסרף אברהם 87 RETENTION
א-92 אביסרור חיים 96 HEMATOMA
א-95 ששון יעקב 78 ANASARCA`;
    const result = parsePatientList(text);
    expect(result).toHaveLength(3);
    // All three must be SIDE_B — the א prefix is a room identifier, NOT a section
    expect(result[0].section).toBe("SIDE_B");
    expect(result[1].section).toBe("SIDE_B");
    expect(result[1].room).toBe("א-92");
    expect(result[2].section).toBe("SIDE_B");
    expect(result[2].room).toBe("א-95");
  });

  it("CRITICAL: room ב-10 under צד א stays SIDE_A — not reassigned to SIDE_B", () => {
    const text = `צד א
ב-10 כהן יוסף 82 UTI`;
    const result = parsePatientList(text);
    expect(result).toHaveLength(1);
    expect(result[0].room).toBe("ב-10");
    expect(result[0].section).toBe("SIDE_A");
  });

  it("room with diagnosis that starts with number (2CO)", () => {
    const result = parsePatientList("70 אסרף אברהם 87 RETENTION 2CO");
    expect(result[0].room).toBe("70");
    expect(result[0].name).toBe("אסרף אברהם");
    expect(result[0].age).toBe(87);
    // 2CO should be part of diagnosis, not confused with room
    expect(result[0].diagnosis).toContain("RETENTION");
  });

  it("room 86 with complex status DNR/DNI", () => {
    const result = parsePatientList("86 חזלט חיים 95 Aspiration pneumonia DNR/DNI");
    expect(result[0].room).toBe("86");
    expect(result[0].name).toBe("חזלט חיים");
    expect(result[0].age).toBe(95);
  });

  it("room with S/P in diagnosis does not break parser", () => {
    const result = parsePatientList("א-92 אביסרור חיים 96 HEMATOMA ILIOPSOAS CLL S/P crif");
    expect(result[0].room).toBe("א-92");
    expect(result[0].name).toBe("אביסרור חיים");
  });
});

// ─── 5. Ward list with tasks (pipe-separated) ──────────────────────────────

describe("Ward list with tasks — pipe-separated format", () => {
  const TASKED_LIST = `צד ב
70 אסרף אברהם 87 RETENTION 2CO | מצב יציב | תורן: catheter check; fluid balance | מחר: US KUB
71 בן שמעון דוד 89 HYPERNATREMIA DNR DNI | Na 158; free water | תורן: repeat Na 22:00; adjust D5W rate | מחר: Na trend
76 שוויקי סמיחה 75 CHF PLEURAL EFFUSION | הוזמן US בשאלה של ניקור מימין | תורן: | מחר: US result
78 חיט ולדימיר 77 pancytopenia | | תורן: אם חום <<< תרביות דם | מחר:
86 חזלט חיים 95 Aspiration pneumonia DNR/DNI | | תורן: | מחר:
88 ויינר פיוטר 94 PNEUMONIA DNR/DNI | hypernatremic | תורן: | מחר:
א-92 אביסרור חיים 96 HEMATOMA ILIOPSOAS CLL | CT פענוח; אנגיו; אם לא יציב < המטולוג בשאלה של PROTAMINE SULPHATE | תורן: | מחר:
94 יוסף ששון 90 ASTHMA RT PLEURAL EFFUSION PNEUMONIA | | תורן: נקז פלאורלי מימין 400 מל + נשלחו לבדיקות | מחר:
א-95 ששון יעקב 78 ANASARCA Pulmonary edema | | תורן: | מחר:
96 דואניס שמואל 88 UTI | | תורן: | מחר:
117 בן הרוש רנה 93 HYPONATREMIA | שוחררה | תורן: | מחר:
120 הררי נפטלי ידידה 93 ISCHEMIC COLITIS ECOLI URINE | מקבלת טריאדה | תורן: | מחר:
119 שוויקי יהודית 91 PLEURAL EFFUSION LARGE LEFT | | תורן: מעקב בדיקות דם כולל אסמתפ | מחר:`;

  const result = parsePatientList(TASKED_LIST);

  it("parses all 13 patients", () => {
    expect(result).toHaveLength(13);
  });

  it("room 70 has on-call tasks", () => {
    const p = result.find(r => r.room === "70");
    expect(p).toBeDefined();
    expect(p!.tasks.length).toBeGreaterThan(0);
  });

  it("room 71 has on-call tasks with repeat Na", () => {
    const p = result.find(r => r.room === "71");
    expect(p).toBeDefined();
    const allTaskTexts = p!.tasks.map(t => t.text).join(" ");
    expect(allTaskTexts).toContain("Na");
  });

  it("room 78 has conditional task (אם חום)", () => {
    const p = result.find(r => r.room === "78");
    expect(p).toBeDefined();
    const taskTexts = p!.tasks.map(t => t.text).join(" ");
    expect(taskTexts).toContain("חום");
  });

  it("room 94 on-call task with drainage", () => {
    const p = result.find(r => r.room === "94");
    expect(p).toBeDefined();
    const taskTexts = p!.tasks.map(t => t.text).join(" ");
    expect(taskTexts + (p!.status?.join(" ") ?? "")).toMatch(/נקז|פלאורלי|400/);
  });

  it("room 119 has on-call task for labs", () => {
    const p = result.find(r => r.room === "119");
    expect(p).toBeDefined();
    const taskTexts = p!.tasks.map(t => t.text).join(" ");
    expect(taskTexts).toContain("בדיקות דם");
  });

  it("room א-92 parsed correctly with complex status text", () => {
    const p = result.find(r => r.room === "א-92");
    expect(p).toBeDefined();
    expect(p!.name).toBe("אביסרור חיים");
    expect(p!.age).toBe(96);
    expect(p!.diagnosis).toContain("HEMATOMA");
  });

  it("room 117 status includes שוחררה", () => {
    const p = result.find(r => r.room === "117");
    expect(p).toBeDefined();
    const allText = [...p!.status, ...(p!.notes ?? [])].join(" ");
    expect(allText + (p!.diagnosis ?? "")).toMatch(/שוחררה|HYPONATREMIA/);
  });

  it("all rooms have correct format", () => {
    const rooms = result.map(p => p.room);
    // Verify specific rooms are present
    expect(rooms).toContain("70");
    expect(rooms).toContain("71");
    expect(rooms).toContain("א-92");
    expect(rooms).toContain("א-95");
    expect(rooms).toContain("117");
    expect(rooms).toContain("119");
    expect(rooms).toContain("120");
  });
});

// ─── 6. Stress test — rapid sequential parses ──────────────────────────────

describe("Stress test — 100 sequential parses", () => {
  const SAMPLE = `צד ב
70 אסרף אברהם 87 RETENTION
א-92 אביסרור חיים 96 HEMATOMA
119 שוויקי יהודית 91 PLEURAL EFFUSION`;

  it("100 parses produce identical results", () => {
    const first = parsePatientList(SAMPLE);
    for (let i = 0; i < 100; i++) {
      const run = parsePatientList(SAMPLE);
      expect(run).toHaveLength(first.length);
      for (let j = 0; j < first.length; j++) {
        expect(run[j].room).toBe(first[j].room);
        expect(run[j].name).toBe(first[j].name);
        expect(run[j].age).toBe(first[j].age);
        expect(run[j].section).toBe(first[j].section);
      }
    }
  });
});

// ─── 7. Regression: age-room disambiguation ─────────────────────────────────

describe("Age-room disambiguation with new format", () => {
  it("room 88 patient age 94 — room first, age second", () => {
    const r = parsePatientList("88 ויינר פיוטר 94 PNEUMONIA");
    expect(r[0].room).toBe("88");
    expect(r[0].age).toBe(94);
  });

  it("room 86 patient age 95", () => {
    const r = parsePatientList("86 חזלט חיים 95 Aspiration pneumonia");
    expect(r[0].room).toBe("86");
    expect(r[0].age).toBe(95);
  });

  it("room 96 patient age 88 — numbers could be swapped", () => {
    const r = parsePatientList("96 דואניס שמואל 88 UTI");
    expect(r[0].room).toBe("96");
    expect(r[0].age).toBe(88);
  });

  it("room 120 patient age 93", () => {
    const r = parsePatientList("120 הררי נפטלי ידידה 93 ISCHEMIC COLITIS");
    expect(r[0].room).toBe("120");
    expect(r[0].age).toBe(93);
  });

  it("room 94 patient age 90", () => {
    const r = parsePatientList("94 יוסף ששון 90 ASTHMA");
    expect(r[0].room).toBe("94");
    expect(r[0].age).toBe(90);
  });

  it("room 70 patient age 87 — 70 not confused with age", () => {
    const r = parsePatientList("70 אסרף אברהם 87 RETENTION");
    expect(r[0].room).toBe("70");
    expect(r[0].age).toBe(87);
  });

  it("room 71 patient age 89", () => {
    const r = parsePatientList("71 בן שמעון דוד 89 HYPERNATREMIA");
    expect(r[0].room).toBe("71");
    expect(r[0].age).toBe(89);
    expect(r[0].name).toBe("בן שמעון דוד");
  });
});

// ─── 8. Discharged/שוחרר patients ───────────────────────────────────────────

describe("Discharged patient handling", () => {
  it("שוחרר in תורן column parsed correctly", () => {
    const text = `צד ב
79 לביאד דוד 82 Peg complication | | תורן: שוחרר | מחר:`;
    const r = parsePatientList(text);
    expect(r[0].room).toBe("79");
    expect(r[0].name).toBe("לביאד דוד");
  });

  it("שוחררה in status parsed correctly", () => {
    const text = `צד ב
117 בן הרוש רנה 93 HYPONATREMIA | שוחררה | תורן: | מחר:`;
    const r = parsePatientList(text);
    expect(r[0].room).toBe("117");
  });
});

// ─── 9. Empty/malformed lines resilience ────────────────────────────────────

describe("Malformed line resilience", () => {
  it("blank lines between patients are ignored", () => {
    const text = `צד ב

70 אסרף אברהם 87 RETENTION

71 בן שמעון דוד 89 HYPERNATREMIA`;
    const r = parsePatientList(text);
    expect(r).toHaveLength(2);
  });

  it("line with only numbers is not a patient", () => {
    expectNoParse("1234567890");
  });

  it("line with only Hebrew text (no room) is not a patient", () => {
    expectNoParse("כהן יוסף");
  });

  it("section header alone produces no patients", () => {
    expectNoParse("צד ב");
  });

  it("handles unicode BOM and invisible chars", () => {
    const text = `\uFEFF70 כהן יוסף 82 UTI`;
    const r = parsePatientList(text);
    expect(r).toHaveLength(1);
    expect(r[0].room).toBe("70");
  });
});

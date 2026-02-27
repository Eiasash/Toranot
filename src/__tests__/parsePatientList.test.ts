import { describe, it, expect } from "vitest";
import { parsePatientList } from "../parser/parsePatientList";

describe("parsePatientList", () => {
  describe("room parsing", () => {
    it('recognizes room "49-3" (hyphen format)', () => {
      const result = parsePatientList("49-3 כהן יוסף 72");
      expect(result).toHaveLength(1);
      expect(result[0].room).toBe("49-3");
      expect(result[0].name).toBe("כהן יוסף");
    });

    it('recognizes room "55/1" (slash format)', () => {
      const result = parsePatientList("55/1 לוי שרה 65");
      expect(result).toHaveLength(1);
      expect(result[0].room).toBe("55/1");
    });

    it('recognizes room "58/3"', () => {
      const result = parsePatientList("58/3 אברהם דוד 80");
      expect(result).toHaveLength(1);
      expect(result[0].room).toBe("58/3");
    });

    it('recognizes room "ניטור-1" (Hebrew monitor room with hyphen)', () => {
      const result = parsePatientList("ניטור-1 כהן דני 55");
      expect(result).toHaveLength(1);
      expect(result[0].room).toBe("ניטור-1");
      expect(result[0].name).toBe("כהן דני");
    });

    it('recognizes room "ניטור 1" (Hebrew monitor room with space)', () => {
      const result = parsePatientList("ניטור 1 כהן דני 55");
      expect(result).toHaveLength(1);
      expect(result[0].room).toBe("ניטור 1");
      expect(result[0].name).toBe("כהן דני");
    });

    it("recognizes plain numeric rooms like 101", () => {
      const result = parsePatientList("101 כהן יוסף 72");
      expect(result).toHaveLength(1);
      expect(result[0].room).toBe("101");
    });
  });

  describe("section headers", () => {
    it("assigns correct sections from Hebrew headers", () => {
      const text = `צד א
101 כהן יוסף 72
צד ב
201 לוי שרה 65`;
      const result = parsePatientList(text);
      expect(result).toHaveLength(2);
      expect(result[0].section).toBe("SIDE_A");
      expect(result[1].section).toBe("SIDE_B");
    });

    it("handles all 5 section types", () => {
      const text = `צד א
101 כהן א 72
צד ב
201 לוי ב 65
צד ג
301 דוד ג 50
שיקום
401 משה ד 80
ניטור
501 יעקב ה 60`;
      const result = parsePatientList(text);
      expect(result).toHaveLength(5);
      expect(result[0].section).toBe("SIDE_A");
      expect(result[1].section).toBe("SIDE_B");
      expect(result[2].section).toBe("SIDE_C");
      expect(result[3].section).toBe("REHAB");
      expect(result[4].section).toBe("MONITOR");
    });

    it("defaults to SIDE_A when no header is present", () => {
      const result = parsePatientList("101 כהן יוסף 72");
      expect(result[0].section).toBe("SIDE_A");
    });
  });

  describe("task extraction", () => {
    it("extracts tasks with source='extracted'", () => {
      const result = parsePatientList("101 כהן יוסף 72 | בדיקת דם בבוקר");
      expect(result).toHaveLength(1);
      expect(result[0].tasks).toHaveLength(1);
      expect(result[0].tasks[0].source).toBe("extracted");
      expect(result[0].tasks[0].text).toBe("בדיקת דם בבוקר");
    });

    it('recognizes "BS בערב" as a task', () => {
      const result = parsePatientList("101 כהן יוסף 72 | BS בערב");
      expect(result).toHaveLength(1);
      expect(result[0].tasks).toHaveLength(1);
      expect(result[0].tasks[0].text).toBe("BS בערב");
      expect(result[0].tasks[0].category).toBe("procedure");
      expect(result[0].tasks[0].source).toBe("extracted");
    });

    it("generated tasks have source='generated'", () => {
      const result = parsePatientList("101 כהן יוסף 72 NPO");
      expect(result).toHaveLength(1);
      expect(result[0].generatedTasks.length).toBeGreaterThan(0);
      for (const t of result[0].generatedTasks) {
        expect(t.source).toBe("generated");
      }
    });
  });

  // ─── New edge case tests ───

  describe("diagnosis extraction", () => {
    it("extracts diagnosis from remaining tokens after name and age", () => {
      const result = parsePatientList("101 כהן יוסף 72 דלקת ריאות");
      expect(result).toHaveLength(1);
      expect(result[0].diagnosis).toBe("דלקת ריאות");
    });

    it("returns null diagnosis when none provided", () => {
      const result = parsePatientList("101 כהן יוסף 72");
      expect(result).toHaveLength(1);
      expect(result[0].diagnosis).toBeNull();
    });
  });

  describe("age parsing", () => {
    it("extracts a valid age", () => {
      const result = parsePatientList("101 כהן יוסף 72");
      expect(result[0].age).toBe(72);
    });

    it("without a numeric age, Hebrew tokens are absorbed into the name", () => {
      // Without an age number as separator, the parser can't distinguish
      // name tokens from diagnosis tokens (all Hebrew)
      const result = parsePatientList("101 כהן יוסף דלקת ריאות");
      expect(result).toHaveLength(1);
      // All Hebrew tokens become part of the name
      expect(result[0].name).toBe("כהן יוסף דלקת ריאות");
      expect(result[0].age).toBeNull();
    });
  });

  describe("flag extraction", () => {
    it("extracts DNR flag", () => {
      const result = parsePatientList("101 כהן יוסף 72 DNR");
      expect(result[0].flags).toContain("DNR");
    });

    it("extracts NPO flag", () => {
      const result = parsePatientList("101 כהן יוסף 72 NPO");
      expect(result[0].flags).toContain("NPO");
    });

    it("extracts ISO flag", () => {
      const result = parsePatientList("101 כהן יוסף 72 ISO");
      expect(result[0].flags).toContain("ISO");
    });

    it("extracts MRSA flag", () => {
      const result = parsePatientList("101 כהן יוסף 72 MRSA");
      expect(result[0].flags).toContain("MRSA");
    });

    it("extracts FALL flag", () => {
      const result = parsePatientList("101 כהן יוסף 72 FALL");
      expect(result[0].flags).toContain("FALL");
    });

    it("extracts multiple flags", () => {
      const result = parsePatientList("101 כהן יוסף 72 DNR NPO FALL");
      expect(result[0].flags).toContain("DNR");
      expect(result[0].flags).toContain("NPO");
      expect(result[0].flags).toContain("FALL");
    });
  });

  describe("task categorization", () => {
    it("classifies CT/US as imaging", () => {
      const result = parsePatientList("101 כהן יוסף 72 | CT חזה");
      const task = result[0].tasks[0];
      expect(task.category).toBe("imaging");
    });

    it("classifies בדיקת דם as labs", () => {
      const result = parsePatientList("101 כהן יוסף 72 | בדיקת דם בבוקר");
      const task = result[0].tasks[0];
      expect(task.category).toBe("labs");
    });

    it("classifies שחרור via תורן column label as discharge", () => {
      // "מכתב שחרור" alone doesn't match the task-detection heuristic,
      // but using the תורן: prefix forces it through as a task
      const result = parsePatientList("101 כהן יוסף 72 | תורן: מכתב שחרור");
      const task = result[0].tasks.find((t) => t.text === "מכתב שחרור");
      expect(task).toBeDefined();
      expect(task!.category).toBe("discharge");
    });

    it("classifies ייעוץ as consult", () => {
      const result = parsePatientList("101 כהן יוסף 72 | ייעוץ קרדיולוגיה");
      const task = result[0].tasks[0];
      expect(task.category).toBe("consult");
    });
  });

  describe("multi-patient parsing", () => {
    it("parses multiple patients across sections", () => {
      const text = `צד א
101 כהן יוסף 72 דלקת ריאות | בדיקת דם בבוקר
102 לוי שרה 65 אי ספיקת לב
צד ב
201 אברהם דוד 80 סוכרת | BS בערב`;

      const result = parsePatientList(text);
      expect(result).toHaveLength(3);
      expect(result[0].name).toBe("כהן יוסף");
      expect(result[0].section).toBe("SIDE_A");
      expect(result[1].name).toBe("לוי שרה");
      expect(result[1].section).toBe("SIDE_A");
      expect(result[2].name).toBe("אברהם דוד");
      expect(result[2].section).toBe("SIDE_B");
    });
  });

  describe("empty and edge inputs", () => {
    it("returns empty array for empty string", () => {
      const result = parsePatientList("");
      expect(result).toHaveLength(0);
    });

    it("returns empty array for whitespace-only input", () => {
      const result = parsePatientList("   \n  \n  ");
      expect(result).toHaveLength(0);
    });

    it("skips very short lines", () => {
      const result = parsePatientList("ab");
      expect(result).toHaveLength(0);
    });

    it("handles blank lines between patients", () => {
      const text = `101 כהן יוסף 72

102 לוי שרה 65`;
      const result = parsePatientList(text);
      expect(result).toHaveLength(2);
    });
  });

  describe("confidence calculation", () => {
    it("patient with room, name, age, diagnosis has high confidence", () => {
      const result = parsePatientList("101 כהן יוסף 72 דלקת ריאות");
      // room(0.25) + name(0.35) + age(0.1) + diagnosis(0.2) + base(0.1) = 1.0
      expect(result[0].confidence).toBeCloseTo(1.0, 1);
    });

    it("patient with just room and name has partial confidence", () => {
      const result = parsePatientList("101 כהן יוסף");
      // room(0.25) + name(0.35) + base(0.1) = 0.7
      expect(result[0].confidence).toBeCloseTo(0.7, 1);
    });
  });

  describe("tomorrow notes", () => {
    it("routes 'מחר' segments to tomorrowNotes", () => {
      const result = parsePatientList("101 כהן יוסף 72 | מחר: צילום חזה");
      expect(result[0].tomorrowNotes.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("status extraction", () => {
    it("non-task segments go to status array", () => {
      const result = parsePatientList("101 כהן יוסף 72 דלקת ריאות | מצב יציב");
      expect(result[0].status).toContain("מצב יציב");
    });
  });

  describe("planNotes routing", () => {
    it("physio fragment routes to planNotes", () => {
      const result = parsePatientList("101 כהן יוסף 72 | פיזיותרפיה פעמיים ביום");
      expect(result[0].planNotes).toContain("פיזיותרפיה פעמיים ביום");
      expect(result[0].tasks.map(t => t.text)).not.toContain("פיזיותרפיה פעמיים ביום");
    });

    it("diet/nutrition fragment routes to planNotes", () => {
      const result = parsePatientList("101 כהן יוסף 72 | דיאטה דלת מלח");
      expect(result[0].planNotes).toContain("דיאטה דלת מלח");
    });

    it("PRN fragment routes to planNotes", () => {
      const result = parsePatientList("101 כהן יוסף 72 | משכך כאבים לפי הצורך");
      expect(result[0].planNotes).toContain("משכך כאבים לפי הצורך");
    });

    it("social worker fragment routes to planNotes", () => {
      const result = parsePatientList('101 כהן יוסף 72 | עו"ס לשיחה עם משפחה');
      expect(result[0].planNotes!.length).toBeGreaterThan(0);
    });

    it("day-of-week reference routes to planNotes", () => {
      const result = parsePatientList("101 כהן יוסף 72 | ביום ראשון סטאף");
      expect(result[0].planNotes!.length).toBeGreaterThan(0);
    });

    it("מחר routes to tomorrowNotes, NOT planNotes", () => {
      const result = parsePatientList("101 כהן יוסף 72 | מחר: צילום חזה");
      expect(result[0].tomorrowNotes.length).toBeGreaterThan(0);
      expect(result[0].planNotes!.some(n => n.includes("מחר"))).toBe(false);
    });

    it("מחר without colon/dash routes to tomorrowNotes (Hebrew word boundary fix)", () => {
      const result = parsePatientList("101 כהן יוסף 72 | מחר צילום חזה");
      expect(result[0].tomorrowNotes.length).toBeGreaterThan(0);
      expect(result[0].tomorrowNotes.some(n => n.includes("צילום"))).toBe(true);
      expect(result[0].planNotes).toEqual([]);
      expect(result[0].tasks.map(t => t.text)).not.toContain("מחר צילום חזה");
    });

    it("מחרוזת does NOT trigger tomorrowNotes (false positive guard)", () => {
      const result = parsePatientList("101 כהן יוסף 72 | מחרוזת בדיקה");
      expect(result[0].tomorrowNotes).toEqual([]);
    });

    it("strong orders (CT/US/MRI) do NOT route to planNotes", () => {
      const result = parsePatientList("101 כהן יוסף 72 | CT חזה");
      expect(result[0].planNotes).toEqual([]);
      expect(result[0].tasks.length).toBeGreaterThan(0);
    });

    it("דחוף prevents routing to planNotes", () => {
      const result = parsePatientList("101 כהן יוסף 72 | פיזיותרפיה דחוף");
      expect(result[0].planNotes).toEqual([]);
    });

    it("סטט prevents routing to planNotes", () => {
      const result = parsePatientList("101 כהן יוסף 72 | פיזיותרפיה סטט");
      expect(result[0].planNotes).toEqual([]);
    });
  });

  describe("monitor room section inference", () => {
    it("ניטור room does NOT infer section — only headers assign sections", () => {
      const result = parsePatientList("ניטור-1 כהן דני 55");
      expect(result[0].section).toBe("SIDE_A"); // default, no header
    });
  });

  describe("order assignment", () => {
    it("assigns sequential order starting from 0", () => {
      const result = parsePatientList(`צד א
101 כהן יוסף 72
102 לוי שרה 65
103 אברהם דוד 80`);
      expect(result).toHaveLength(3);
      expect(result[0].order).toBe(0);
      expect(result[1].order).toBe(1);
      expect(result[2].order).toBe(2);
    });

    it("order is cumulative across sections (not reset per section)", () => {
      const result = parsePatientList(`צד א
101 כהן יוסף 72
צד ב
201 לוי שרה 65`);
      expect(result).toHaveLength(2);
      expect(result[0].order).toBe(0);
      expect(result[1].order).toBe(1);
    });

    it("single patient gets order 0", () => {
      const result = parsePatientList("101 כהן יוסף 72");
      expect(result).toHaveLength(1);
      expect(result[0].order).toBe(0);
    });

    it("empty input produces no patients (no order needed)", () => {
      const result = parsePatientList("");
      expect(result).toHaveLength(0);
    });

    it("all orders are unique", () => {
      const result = parsePatientList(`צד א
101 כהן יוסף 72
102 לוי שרה 65
צד ב
201 אברהם דוד 80
202 משה יעקב 60
צד ג
301 דני כהן 55`);
      const orders = result.map(p => p.order);
      const unique = new Set(orders);
      expect(unique.size).toBe(orders.length);
    });

    it("order matches position in the list", () => {
      const result = parsePatientList(`101 כהן יוסף 72
102 לוי שרה 65
103 אברהם דוד 80`);
      for (let i = 0; i < result.length; i++) {
        expect(result[i].order).toBe(i);
      }
    });
  });
});

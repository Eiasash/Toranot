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

  describe("monitor room section inference", () => {
    it("ניטור room does NOT infer section — only headers assign sections", () => {
      const result = parsePatientList("ניטור-1 כהן דני 55");
      expect(result[0].section).toBe("SIDE_A"); // default, no header
    });
  });
});

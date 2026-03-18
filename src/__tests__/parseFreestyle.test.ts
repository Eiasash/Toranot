import { describe, it, expect } from "vitest";
import { parseFreestyle } from "../components/AddAdmissionModal";

describe("parseFreestyle", () => {
  describe("חדר keyword room parsing (bug fix: חדר must not bleed into name)", () => {
    it("parses 'חדר 2114' correctly — not as ר-2114", () => {
      const r = parseFreestyle("77 כהן צפריר חדר 2114 צד ב hyponatremia pleural effusion");
      expect(r.room).toBe("2114");
    });

    it("name does not include 'חד' leftover from חדר", () => {
      const r = parseFreestyle("77 כהן צפריר חדר 2114 צד ב hyponatremia pleural effusion");
      expect(r.name).toBe("כהן צפריר");
    });

    it("parses חדר without space: 'חדר2114'", () => {
      const r = parseFreestyle("82 לוי שרה חדר2114 hyponatremia");
      expect(r.room).toBe("2114");
    });

    it("parses 2-3 digit חדר: 'חדר 70'", () => {
      const r = parseFreestyle("75 כהן יוסף חדר 70 pneumonia");
      expect(r.room).toBe("70");
    });
  });

  describe("section / side parsing (bug fix: צד ב must set side, not bleed into diagnosis)", () => {
    it("extracts צד ב → side B", () => {
      const r = parseFreestyle("77 כהן צפריר חדר 2114 צד ב hyponatremia pleural effusion");
      expect(r.side).toBe("B");
    });

    it("diagnosis does not include 'צד ב'", () => {
      const r = parseFreestyle("77 כהן צפריר חדר 2114 צד ב hyponatremia pleural effusion");
      expect(r.diagnosis).not.toContain("צד ב");
      expect(r.diagnosis).toContain("hyponatremia");
    });

    it("extracts צד א → side A", () => {
      const r = parseFreestyle("82 לוי שרה 2088 צד א pneumonia");
      expect(r.side).toBe("A");
    });

    it("extracts צד ג → side C", () => {
      const r = parseFreestyle("90 אברהם דוד חדר 50 צד ג AKI");
      expect(r.side).toBe("C");
    });

    it("no צד in text → side undefined (preserve dropdown default)", () => {
      const r = parseFreestyle("82 לוי שרה 2088 pneumonia");
      expect(r.side).toBeUndefined();
    });
  });

  describe("full parse — the exact screenshot input", () => {
    it("parses screenshot input correctly end-to-end", () => {
      const r = parseFreestyle("77 כהן צפריר חדר 2114 צד ב hyponatremia pleural effusion");
      expect(r.age).toBe(77);
      expect(r.name).toBe("כהן צפריר");
      expect(r.room).toBe("2114");
      expect(r.side).toBe("B");
      expect(r.diagnosis).toBe("hyponatremia pleural effusion");
    });
  });

  describe("existing formats still work", () => {
    it("plain 4-digit room", () => {
      const r = parseFreestyle("82 כהן יוסף 2088 pneumonia DNR");
      expect(r.room).toBe("2088");
      expect(r.age).toBe(82);
      expect(r.name).toBe("כהן יוסף");
      expect(r.diagnosis).toBe("pneumonia");
      expect(r.status).toBe("DNR");
    });

    it("Hebrew-letter prefix room: א-92", () => {
      const r = parseFreestyle("א-92 לוי שרה 75 CHF");
      expect(r.room).toBe("א-92");
      expect(r.name).toBe("לוי שרה");
      expect(r.age).toBe(75);
    });

    it("legacy room/bed: 49/2", () => {
      const r = parseFreestyle("49/2 כהן יוסף 82 pneumonia");
      expect(r.room).toBe("49");
      expect(r.bed).toBe(2);
    });

    it("2-3 digit plain room: 70", () => {
      const r = parseFreestyle("70 אברהם דוד 80 UTI");
      expect(r.room).toBe("70");
    });

    it("DNR/DNI extraction", () => {
      const r = parseFreestyle("70 כהן יוסף 82 pneumonia DNR/DNI");
      expect(r.status).toBe("DNR/DNI");
      expect(r.diagnosis).toBe("pneumonia");
    });
  });
});

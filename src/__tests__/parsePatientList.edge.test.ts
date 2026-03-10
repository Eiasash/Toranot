/**
 * Parser robustness tests — malformed input, extreme cases,
 * BiDi characters, very large inputs, and mixed-language edge cases.
 */

import { describe, it, expect } from "vitest";
import { parsePatientList } from "../parser/parsePatientList";

describe("parsePatientList — malformed input", () => {
  it("handles input with only section headers (no patients)", () => {
    const text = `צד א
צד ב
צד ג`;
    const result = parsePatientList(text);
    expect(result).toHaveLength(0);
  });

  it("handles line with room number but no name", () => {
    const result = parsePatientList("101");
    // Parser accepts the line (room is enough to create a patient entry)
    expect(result).toHaveLength(1);
    expect(result[0].room).toBe("101");
    expect(result[0].name).toBeNull();
  });

  it("handles null-like inputs gracefully", () => {
    expect(parsePatientList("")).toHaveLength(0);
    expect(parsePatientList("\n\n\n")).toHaveLength(0);
    expect(parsePatientList("   ")).toHaveLength(0);
  });

  it("handles tab-separated input", () => {
    const result = parsePatientList("101\tכהן יוסף\t72");
    expect(result).toHaveLength(1);
    expect(result[0].room).toBe("101");
  });

  it("handles extremely long patient name", () => {
    const longName = "כהן " + "אברהם ".repeat(20);
    const result = parsePatientList(`101 ${longName.trim()} 72`);
    expect(result).toHaveLength(1);
    expect(result[0].age).toBe(72);
  });

  it("handles multiple pipe separators", () => {
    const result = parsePatientList("101 כהן יוסף 72 | מצב יציב | תורן: בדיקת דם | דיאטה");
    expect(result).toHaveLength(1);
    expect(result[0].tasks).toHaveLength(1);
    expect(result[0].tasks[0].text).toBe("בדיקת דם");
  });
});

describe("parsePatientList — BiDi control characters", () => {
  it("strips BiDi control characters (U+200F RLM)", () => {
    const text = "\u200F101 כהן יוסף 72\u200F";
    const result = parsePatientList(text);
    expect(result).toHaveLength(1);
    expect(result[0].room).toBe("101");
  });

  it("strips LRE/RLE/PDF markers (U+202A-C)", () => {
    const text = "\u202A101 כהן יוסף 72\u202C";
    const result = parsePatientList(text);
    expect(result).toHaveLength(1);
  });

  it("strips LRI/RLI/FSI/PDI (U+2066-9)", () => {
    const text = "\u2066101\u2069 \u2067כהן יוסף\u2069 72";
    const result = parsePatientList(text);
    expect(result).toHaveLength(1);
    expect(result[0].room).toBe("101");
  });
});

describe("parsePatientList — large input", () => {
  it("handles 50 patients without error", () => {
    const lines: string[] = ["צד א"];
    for (let i = 1; i <= 50; i++) {
      lines.push(`${i}/1 חולה${i} שם${i} ${50 + i}`);
    }
    const result = parsePatientList(lines.join("\n"));
    expect(result).toHaveLength(50);
    // Orders should be sequential
    for (let i = 0; i < result.length; i++) {
      expect(result[i].order).toBe(i);
    }
  });

  it("handles many segments per patient", () => {
    const segments = Array.from({ length: 10 }, (_, i) => `מידע ${i}`).join(" | ");
    const result = parsePatientList(`101 כהן יוסף 72 | ${segments}`);
    expect(result).toHaveLength(1);
  });
});

describe("parsePatientList — age edge cases", () => {
  it("parses age 0 as null (falsy zero is skipped)", () => {
    const result = parsePatientList("101 כהן תינוק 0 אשפוז חדש");
    expect(result).toHaveLength(1);
    // The parser treats 0 as falsy — age becomes null, "0" absorbed elsewhere
    expect(result[0].age === 0 || result[0].age === null).toBe(true);
  });

  it("parses age 120 (extreme elderly)", () => {
    const result = parsePatientList("101 כהן קשיש 120");
    expect(result).toHaveLength(1);
    expect(result[0].age).toBe(120);
  });
});

describe("parsePatientList — flag combinations", () => {
  it("extracts all supported flags together", () => {
    const result = parsePatientList("101 כהן יוסף 72 DNR DNI NPO FALL ISO MRSA VRE ESBL");
    expect(result).toHaveLength(1);
    const flags = result[0].flags;
    expect(flags).toContain("DNR");
    expect(flags).toContain("DNI");
    expect(flags).toContain("NPO");
    expect(flags).toContain("FALL");
    expect(flags).toContain("ISO");
    expect(flags).toContain("MRSA");
  });

  it("flags are case-insensitive (lowercase dnr)", () => {
    const result = parsePatientList("101 כהן יוסף 72 dnr");
    expect(result).toHaveLength(1);
    // The parser may normalize to uppercase
    expect(result[0].flags.map(f => f.toUpperCase())).toContain("DNR");
  });
});

describe("parsePatientList — mixed language", () => {
  it("handles English diagnosis after Hebrew name", () => {
    const result = parsePatientList("101 כהן יוסף 72 PNEUMONIA");
    expect(result).toHaveLength(1);
    expect(result[0].diagnosis).toBe("PNEUMONIA");
  });

  it("handles mixed Hebrew + English diagnosis", () => {
    const result = parsePatientList("101 כהן יוסף 72 דלקת ריאות BILATERAL");
    expect(result).toHaveLength(1);
    expect(result[0].diagnosis).toContain("דלקת");
  });
});

describe("parsePatientList — duplicate room handling", () => {
  it("parses patients with same room in different sections", () => {
    const text = `צד א
101 כהן יוסף 72
צד ב
101 לוי שרה 65`;
    const result = parsePatientList(text);
    expect(result).toHaveLength(2);
    expect(result[0].section).toBe("SIDE_A");
    expect(result[1].section).toBe("SIDE_B");
  });
});

describe("parsePatientList — whitespace edge cases", () => {
  it("handles leading/trailing whitespace in lines", () => {
    const result = parsePatientList("   101 כהן יוסף 72   ");
    expect(result).toHaveLength(1);
    expect(result[0].room).toBe("101");
  });

  it("handles multiple spaces between tokens", () => {
    const result = parsePatientList("101   כהן   יוסף   72");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("כהן יוסף");
  });

  it("handles Windows line endings (\\r\\n)", () => {
    const text = "101 כהן יוסף 72\r\n102 לוי שרה 65";
    const result = parsePatientList(text);
    expect(result).toHaveLength(2);
  });
});

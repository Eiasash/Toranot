/**
 * Tests for normalizeWardText — the pre-parser normalization shim.
 *
 * Every test verifies a specific character-level transformation without
 * coupling to parser semantics. The invariant throughout: normalization
 * must never silently drop patient rows, only clean punctuation/whitespace.
 */

import { describe, it, expect } from "vitest";
import { normalizeWardText } from "../parser/parsePatientList";
import { parsePatientList } from "../parser/parsePatientList";

// ─── 1. Return-type and purity ───────────────────────────────────────────────

describe("normalizeWardText — invariants", () => {
  it("always returns a string", () => {
    expect(typeof normalizeWardText("")).toBe("string");
    expect(typeof normalizeWardText("hello")).toBe("string");
  });

  it("never throws on any string input", () => {
    const inputs = [
      "",
      " ",
      "\n",
      "!@#$%^&*()",
      "א".repeat(10000),
      "\u0000\u0001\u001F",
      "\uFFFD\uFFFE\uFFFF",
    ];
    for (const input of inputs) {
      expect(() => normalizeWardText(input)).not.toThrow();
    }
  });

  it("is idempotent — applying twice gives the same result", () => {
    const inputs = [
      "צד א\n101 כהן יוסף 78\u00A0דלקת ריאות",
      "\t102\tלוי שרה\t85",
      "—ניטור—\n\n\n\nשיקום:",
    ];
    for (const input of inputs) {
      const once = normalizeWardText(input);
      const twice = normalizeWardText(once);
      expect(twice).toBe(once);
    }
  });
});

// ─── 2. Unicode NFC ──────────────────────────────────────────────────────────

describe("normalizeWardText — Unicode NFC", () => {
  it("NFC-normalises composed vs decomposed Hebrew (should be identical after)", () => {
    // Hebrew with niqqud: alef + dagesh (decomposed NFD) vs composed NFC
    const composed = "\u05D0\u05BC"; // alef + dagesh, NFC
    const decomposed = "\u05D0\u05BC"; // same, but going through NFD then back
    const nfd = composed.normalize("NFD");
    expect(normalizeWardText(nfd)).toBe(normalizeWardText(composed));
  });
});

// ─── 3. Separator variants → | ───────────────────────────────────────────────

describe("normalizeWardText — separator normalisation", () => {
  it("converts BROKEN BAR ¦ (U+00A6) to |", () => {
    const result = normalizeWardText("101 כהן יוסף 78 ¦ DNR");
    expect(result).toContain("|");
    expect(result).not.toContain("¦");
  });

  it("converts BOX DRAWINGS VERTICAL │ (U+2502) to |", () => {
    const result = normalizeWardText("101 כהן יוסף 78 │ תורן: בדיקת דם");
    expect(result).toContain("|");
    expect(result).not.toContain("│");
  });

  it("converts FULLWIDTH VERTICAL LINE ｜ (U+FF5C) to |", () => {
    const result = normalizeWardText("101 כהן יוסף 78 ｜ DNR");
    expect(result).toContain("|");
    expect(result).not.toContain("｜");
  });

  it("normalised separator is correctly parsed downstream", () => {
    const result = parsePatientList("101 כהן יוסף 78 ¦ תורן: בדיקת דם");
    expect(result).toHaveLength(1);
    expect(result[0].tasks).toHaveLength(1);
    expect(result[0].tasks[0].text).toBe("בדיקת דם");
  });
});

// ─── 4. Dash variants → - ────────────────────────────────────────────────────

describe("normalizeWardText — dash normalisation", () => {
  it("converts EM DASH — (U+2014) to hyphen-minus", () => {
    const result = normalizeWardText("ניטור-1 כהן דני 55".replace("-", "—"));
    expect(result).toContain("-");
    expect(result).not.toContain("—");
  });

  it("converts EN DASH – (U+2013) to hyphen-minus", () => {
    const result = normalizeWardText("49–3 כהן יוסף 78");
    expect(result).toContain("49-3");
  });

  it("converts MINUS SIGN − (U+2212) to hyphen-minus", () => {
    const result = normalizeWardText("101 כהן יוסף 78 BS−בוקר");
    expect(result).not.toContain("−");
  });

  it("room number with en-dash parses correctly after normalisation", () => {
    const result = parsePatientList("צד א\n49–3 כהן יוסף 78 דלקת ריאות");
    expect(result).toHaveLength(1);
    expect(result[0].room).toBe("49-3");
  });
});

// ─── 5. Smart quotes ─────────────────────────────────────────────────────────

describe("normalizeWardText — smart quote normalisation", () => {
  it('converts left double quotation mark " (U+201C) to straight "', () => {
    const result = normalizeWardText('\u201Cבדיקת דם\u201D');
    expect(result).toBe('"בדיקת דם"');
  });

  it("converts right single quotation mark ' (U+2019) to straight '", () => {
    const result = normalizeWardText("עו\u2019ס לשיחה");
    expect(result).toBe("עו'ס לשיחה");
  });

  it("converts all four smart double quote variants", () => {
    for (const q of ["\u201C", "\u201D", "\u201E", "\u201F"]) {
      expect(normalizeWardText(q)).toBe('"');
    }
  });

  it("converts all four smart single quote variants", () => {
    for (const q of ["\u2018", "\u2019", "\u201B", "\u201A"]) {
      expect(normalizeWardText(q)).toBe("'");
    }
  });
});

// ─── 6. Non-breaking space ────────────────────────────────────────────────────

describe("normalizeWardText — non-breaking space", () => {
  it("converts U+00A0 to regular space", () => {
    const input = "101\u00A0כהן\u00A0יוסף\u00A078";
    const result = normalizeWardText(input);
    expect(result).toBe("101 כהן יוסף 78");
  });

  it("NBSP in patient line parses correctly after normalisation", () => {
    const result = parsePatientList("צד\u00A0א\n101\u00A0כהן יוסף 78");
    expect(result).toHaveLength(1);
    expect(result[0].section).toBe("SIDE_A");
    expect(result[0].room).toBe("101");
  });
});

// ─── 7. Tabs and spaces ───────────────────────────────────────────────────────

describe("normalizeWardText — whitespace", () => {
  it("converts tabs to single space", () => {
    const result = normalizeWardText("101\tכהן יוסף\t78");
    expect(result).toBe("101 כהן יוסף 78");
  });

  it("collapses multiple spaces to single space", () => {
    const result = normalizeWardText("101   כהן    יוסף   78");
    expect(result).toBe("101 כהן יוסף 78");
  });

  it("does NOT collapse newlines (preserves line structure)", () => {
    const result = normalizeWardText("צד א\n101 כהן יוסף 78\n102 לוי שרה 85");
    expect(result).toContain("\n");
    expect(result.split("\n")).toHaveLength(3);
  });
});

// ─── 8. Line endings ─────────────────────────────────────────────────────────

describe("normalizeWardText — line endings", () => {
  it("converts CRLF to LF", () => {
    const result = normalizeWardText("101 כהן יוסף 78\r\n102 לוי שרה 85");
    expect(result).not.toContain("\r");
    expect(result).toContain("\n");
  });

  it("converts lone CR to LF", () => {
    const result = normalizeWardText("101 כהן יוסף 78\r102 לוי שרה 85");
    expect(result).not.toContain("\r");
    expect(result).toContain("\n");
  });

  it("CRLF ward list parses the same as LF", () => {
    const lf = "צד א\n101 כהן יוסף 78\n102 לוי שרה 85";
    const crlf = lf.replace(/\n/g, "\r\n");
    const resultLf = parsePatientList(lf);
    const resultCrlf = parsePatientList(crlf);
    expect(resultCrlf).toHaveLength(resultLf.length);
    expect(resultCrlf[0].room).toBe(resultLf[0].room);
  });
});

// ─── 9. Blank line collapsing ─────────────────────────────────────────────────

describe("normalizeWardText — blank line collapsing", () => {
  it("collapses 3+ consecutive blank lines to 2", () => {
    const result = normalizeWardText("צד א\n\n\n\n\n101 כהן יוסף 78");
    expect(result).not.toContain("\n\n\n");
  });

  it("preserves intentional double blank lines (section separators)", () => {
    const result = normalizeWardText("צד א\n\n101 כהן יוסף 78");
    expect(result.split("\n")).toHaveLength(3);
  });

  it("many blank lines still parses correct patient count", () => {
    const result = parsePatientList("צד א\n\n\n\n\n101 כהן יוסף 78\n\n\n\n102 לוי שרה 85");
    expect(result).toHaveLength(2);
  });
});

// ─── 10. OCR section header corrections ──────────────────────────────────────

describe("normalizeWardText — OCR section header corrections", () => {
  it("corrects '!ד א' to 'צד א' on its own line", () => {
    const result = normalizeWardText("!ד א\n101 כהן יוסף 78");
    expect(result.split("\n")[0]).toBe("צד א");
  });

  it("corrects '!ד ב' to 'צד ב' on its own line", () => {
    const result = normalizeWardText("!ד ב\n201 לוי שרה 85");
    expect(result.split("\n")[0]).toBe("צד ב");
  });

  it("corrects '!ד ג' to 'צד ג' on its own line", () => {
    const result = normalizeWardText("!ד ג\n301 מזרחי דוד 72");
    expect(result.split("\n")[0]).toBe("צד ג");
  });

  it("corrects 'ד א' (dropped צ) to 'צד א' on its own line", () => {
    const result = normalizeWardText("ד א\n101 כהן יוסף 78");
    expect(result.split("\n")[0]).toBe("צד א");
  });

  it("does NOT modify 'ד א' when it appears mid-line (patient row guard)", () => {
    // "ד א" as part of a patient name — must NOT be mutated
    const result = normalizeWardText("101 ד א 78 דלקת ריאות");
    expect(result).toBe("101 ד א 78 דלקת ריאות");
  });

  it("OCR-corrupted section header resolves to correct section after parse", () => {
    const result = parsePatientList("!ד א\n101 כהן יוסף 78 דלקת ריאות");
    expect(result).toHaveLength(1);
    expect(result[0].section).toBe("SIDE_A");
  });

  it("'ד ב' section header resolves to SIDE_B after parse", () => {
    const result = parsePatientList("ד ב\n201 לוי שרה 85 אי ספיקת לב");
    expect(result).toHaveLength(1);
    expect(result[0].section).toBe("SIDE_B");
  });
});

// ─── 11. Combinations ────────────────────────────────────────────────────────

describe("normalizeWardText — combined transformations", () => {
  it("cleans a realistic Word-paste input with multiple noise types", () => {
    const wordPaste =
      "צד\u00A0א\r\n" +
      "101\tכהן\u00A0יוסף\t78  דלקת ריאות\r\n" +
      "\r\n\r\n\r\n" +
      "102\u00A0לוי שרה\u00A085\u00A0\u00A0אי ספיקת לב";

    const result = parsePatientList(wordPaste);
    expect(result).toHaveLength(2);
    expect(result[0].section).toBe("SIDE_A");
    expect(result[0].room).toBe("101");
    expect(result[0].age).toBe(78);
    expect(result[1].room).toBe("102");
  });

  it("pipe variant ¦ in pipe-separated fields is parsed correctly", () => {
    const result = parsePatientList("101 כהן יוסף 78 ¦ תורן: בדיקת דם ¦ מחר: CT חזה");
    expect(result).toHaveLength(1);
    expect(result[0].tasks).toHaveLength(1);
    expect(result[0].tomorrowNotes.length).toBeGreaterThan(0);
  });
});

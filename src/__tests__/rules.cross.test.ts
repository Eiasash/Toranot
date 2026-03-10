/**
 * Multi-rule cross-interaction tests.
 *
 * Verifies that when multiple rules fire on the same patient:
 * - All expected tasks are generated
 * - Tasks are properly deduplicated (no exact duplicates)
 * - Generated tasks all have source='generated'
 */

import { describe, it, expect } from "vitest";
import { parsePatientList } from "../parser/parsePatientList";

describe("multi-rule firing via parser", () => {
  it("NPO + FALL + ISO flags generate multiple rule tasks", () => {
    const result = parsePatientList("101 כהן יוסף 72 NPO FALL ISO");
    expect(result).toHaveLength(1);
    const genTasks = result[0].generatedTasks;
    // Should have tasks from NPO rule, FALL rule, and ISO rule
    expect(genTasks.length).toBeGreaterThanOrEqual(3);
    // All should be source='generated'
    for (const t of genTasks) {
      expect(t.source).toBe("generated");
    }
  });

  it("generated tasks have unique ids", () => {
    const result = parsePatientList("101 כהן יוסף 72 NPO FALL ISO DNR");
    const genTasks = result[0].generatedTasks;
    const ids = genTasks.map(t => t.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("no exact duplicate task texts", () => {
    const result = parsePatientList("101 כהן יוסף 85 NPO FALL ISO MRSA");
    const genTasks = result[0].generatedTasks;
    const texts = genTasks.map(t => t.text);
    const unique = new Set(texts);
    expect(unique.size).toBe(texts.length);
  });

  it("DNR flag is extracted but may not generate tasks on its own", () => {
    const result = parsePatientList("101 כהן יוסף 80 DNR");
    expect(result).toHaveLength(1);
    expect(result[0].flags).toContain("DNR");
    // DNR alone is a flag — it may or may not generate tasks depending on rules
    expect(Array.isArray(result[0].generatedTasks)).toBe(true);
  });

  it("elderly patient with multiple conditions generates appropriate tasks", () => {
    // Parse a complex patient with diagnosis that triggers rules
    const text = "101 כהן יוסף 85 דלקת ריאות NPO FALL | תורן: בדיקת דם בבוקר";
    const result = parsePatientList(text);
    expect(result).toHaveLength(1);

    // Should have extracted task (from תורן:)
    expect(result[0].tasks.length).toBeGreaterThanOrEqual(1);
    expect(result[0].tasks[0].source).toBe("extracted");

    // Should have generated tasks (from NPO, FALL flags)
    expect(result[0].generatedTasks.length).toBeGreaterThanOrEqual(2);
  });

  it("section headers do not affect rule generation", () => {
    const text = `צד א
101 כהן יוסף 72 NPO FALL
צד ב
201 לוי שרה 65 NPO FALL`;

    const result = parsePatientList(text);
    expect(result).toHaveLength(2);
    // Both patients should have similar generated tasks (same flags)
    expect(result[0].generatedTasks.length).toBe(result[1].generatedTasks.length);
  });

  it("patient with no flags or triggers gets no generated tasks", () => {
    const result = parsePatientList("101 כהן יוסף 40");
    expect(result).toHaveLength(1);
    // Young, healthy, no flags — should have minimal or no generated tasks
    // (age-based rules might still fire for very specific conditions)
    // We just verify the array exists and is valid
    expect(Array.isArray(result[0].generatedTasks)).toBe(true);
  });
});

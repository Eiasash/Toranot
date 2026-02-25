import { describe, it, expect } from "vitest";
import { parseAndValidate, validatePatientsShape } from "../utils/storage";

describe("parseAndValidate", () => {
  it("returns empty array for null input when expecting array", () => {
    const result = parseAndValidate(null, "array");
    expect(result).toEqual({ ok: true, data: [] });
  });

  it("returns empty object for null input when expecting object", () => {
    const result = parseAndValidate(null, "object");
    expect(result).toEqual({ ok: true, data: {} });
  });

  it("returns empty array for empty string when expecting array", () => {
    const result = parseAndValidate("", "array");
    expect(result).toEqual({ ok: true, data: [] });
  });

  it("returns empty array for whitespace-only string when expecting array", () => {
    const result = parseAndValidate("   ", "array");
    expect(result).toEqual({ ok: true, data: [] });
  });

  it("parses valid JSON array", () => {
    const result = parseAndValidate('[1, 2, 3]', "array");
    expect(result).toEqual({ ok: true, data: [1, 2, 3] });
  });

  it("parses valid JSON object", () => {
    const result = parseAndValidate('{"a": 1}', "object");
    expect(result).toEqual({ ok: true, data: { a: 1 } });
  });

  it("returns error for invalid JSON", () => {
    const result = parseAndValidate("{broken json", "object");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("JSON parse error");
    }
  });

  it("returns error when expecting array but got object", () => {
    const result = parseAndValidate('{"key": "val"}', "array");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("Expected array");
    }
  });

  it("returns error when expecting object but got array", () => {
    const result = parseAndValidate('[1, 2]', "object");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("Expected object");
    }
  });

  it("returns error when expecting object but got string", () => {
    const result = parseAndValidate('"hello"', "object");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("Expected object");
    }
  });

  it("returns error when expecting object but got null JSON", () => {
    const result = parseAndValidate("null", "object");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("Expected object");
    }
  });

  it("returns error when expecting array but got number", () => {
    const result = parseAndValidate("42", "array");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("Expected array");
    }
  });
});

describe("validatePatientsShape", () => {
  it("returns valid for an empty array", () => {
    const result = validatePatientsShape([]);
    expect(result.valid).toBe(true);
    expect(result.problems).toEqual([]);
  });

  it("returns invalid for non-array input", () => {
    const result = validatePatientsShape("not an array");
    expect(result.valid).toBe(false);
    expect(result.problems).toContain("Patient store is not an array");
  });

  it("validates correct patient shape", () => {
    const result = validatePatientsShape([
      {
        id: "pt-1",
        section: "SIDE_A",
        tasks: [],
        generatedTasks: [],
      },
    ]);
    expect(result.valid).toBe(true);
    expect(result.problems).toEqual([]);
  });

  it("catches missing id", () => {
    const result = validatePatientsShape([
      { section: "SIDE_A", tasks: [], generatedTasks: [] },
    ]);
    expect(result.valid).toBe(false);
    expect(result.problems.some((p) => p.includes("id"))).toBe(true);
  });

  it("catches missing section", () => {
    const result = validatePatientsShape([
      { id: "pt-1", tasks: [], generatedTasks: [] },
    ]);
    expect(result.valid).toBe(false);
    expect(result.problems.some((p) => p.includes("section"))).toBe(true);
  });

  it("catches non-array tasks", () => {
    const result = validatePatientsShape([
      { id: "pt-1", section: "SIDE_A", tasks: "not an array", generatedTasks: [] },
    ]);
    expect(result.valid).toBe(false);
    expect(result.problems.some((p) => p.includes("tasks"))).toBe(true);
  });

  it("catches non-array generatedTasks", () => {
    const result = validatePatientsShape([
      { id: "pt-1", section: "SIDE_A", tasks: [], generatedTasks: "not an array" },
    ]);
    expect(result.valid).toBe(false);
    expect(result.problems.some((p) => p.includes("generatedTasks"))).toBe(true);
  });

  it("catches non-object patient entries", () => {
    const result = validatePatientsShape([null, "string", 42]);
    expect(result.valid).toBe(false);
    expect(result.problems.length).toBeGreaterThanOrEqual(3);
  });

  it("reports problems for multiple patients", () => {
    const result = validatePatientsShape([
      { id: "pt-1", section: "SIDE_A", tasks: [], generatedTasks: [] },
      { section: "SIDE_B", tasks: [], generatedTasks: [] }, // missing id
      { id: "pt-3", tasks: [], generatedTasks: [] }, // missing section
    ]);
    expect(result.valid).toBe(false);
    expect(result.problems.length).toBe(2);
  });
});

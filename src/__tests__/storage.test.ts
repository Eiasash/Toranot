import { describe, it, expect } from "vitest";
import { parseAndValidate, validatePatientsShape } from "../utils/storage";

// ════════════════════════════════════════════════════════════
// parseAndValidate
// ════════════════════════════════════════════════════════════

describe("parseAndValidate", () => {
  describe("array type", () => {
    it("returns empty array for null input", () => {
      const result = parseAndValidate(null, "array");
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data).toEqual([]);
    });

    it("returns empty array for empty string", () => {
      const result = parseAndValidate("", "array");
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data).toEqual([]);
    });

    it("returns empty array for whitespace-only string", () => {
      const result = parseAndValidate("   ", "array");
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data).toEqual([]);
    });

    it("parses valid JSON array", () => {
      const result = parseAndValidate('[1, 2, 3]', "array");
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data).toEqual([1, 2, 3]);
    });

    it("rejects JSON object when expecting array", () => {
      const result = parseAndValidate('{"key": "value"}', "array");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toContain("Expected array");
    });

    it("rejects JSON string when expecting array", () => {
      const result = parseAndValidate('"hello"', "array");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toContain("Expected array");
    });

    it("rejects invalid JSON", () => {
      const result = parseAndValidate("{broken json", "array");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toContain("JSON parse error");
    });

    it("rejects JSON number when expecting array", () => {
      const result = parseAndValidate("42", "array");
      expect(result.ok).toBe(false);
    });
  });

  describe("object type", () => {
    it("returns empty object for null input", () => {
      const result = parseAndValidate(null, "object");
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data).toEqual({});
    });

    it("returns empty object for empty string", () => {
      const result = parseAndValidate("", "object");
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data).toEqual({});
    });

    it("parses valid JSON object", () => {
      const result = parseAndValidate('{"a": 1}', "object");
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data).toEqual({ a: 1 });
    });

    it("rejects JSON array when expecting object", () => {
      const result = parseAndValidate("[1, 2]", "object");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toContain("Expected object");
    });

    it("rejects null JSON when expecting object", () => {
      const result = parseAndValidate("null", "object");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toContain("Expected object");
    });

    it("rejects JSON string when expecting object", () => {
      const result = parseAndValidate('"hello"', "object");
      expect(result.ok).toBe(false);
    });
  });
});

// ════════════════════════════════════════════════════════════
// validatePatientsShape
// ════════════════════════════════════════════════════════════

describe("validatePatientsShape", () => {
  it("validates a correct patient array", () => {
    const data = [
      {
        id: "p1",
        section: "SIDE_A",
        tasks: [],
        generatedTasks: [],
      },
    ];
    const result = validatePatientsShape(data);
    expect(result.valid).toBe(true);
    expect(result.problems).toEqual([]);
  });

  it("rejects non-array input", () => {
    const result = validatePatientsShape("not an array");
    expect(result.valid).toBe(false);
    expect(result.problems).toContain("Patient store is not an array");
  });

  it("rejects null input", () => {
    const result = validatePatientsShape(null);
    expect(result.valid).toBe(false);
  });

  it("rejects object input", () => {
    const result = validatePatientsShape({ patients: [] });
    expect(result.valid).toBe(false);
  });

  it("validates empty array as valid", () => {
    const result = validatePatientsShape([]);
    expect(result.valid).toBe(true);
    expect(result.problems).toEqual([]);
  });

  it("reports missing id", () => {
    const data = [{ section: "SIDE_A", tasks: [], generatedTasks: [] }];
    const result = validatePatientsShape(data);
    expect(result.valid).toBe(false);
    expect(result.problems.some((p) => p.includes("id"))).toBe(true);
  });

  it("reports missing section", () => {
    const data = [{ id: "p1", tasks: [], generatedTasks: [] }];
    const result = validatePatientsShape(data);
    expect(result.valid).toBe(false);
    expect(result.problems.some((p) => p.includes("section"))).toBe(true);
  });

  it("reports missing tasks array", () => {
    const data = [{ id: "p1", section: "SIDE_A", generatedTasks: [] }];
    const result = validatePatientsShape(data);
    expect(result.valid).toBe(false);
    expect(result.problems.some((p) => p.includes("tasks"))).toBe(true);
  });

  it("reports missing generatedTasks array", () => {
    const data = [{ id: "p1", section: "SIDE_A", tasks: [] }];
    const result = validatePatientsShape(data);
    expect(result.valid).toBe(false);
    expect(result.problems.some((p) => p.includes("generatedTasks"))).toBe(true);
  });

  it("reports non-object patient entry", () => {
    const data = ["not a patient"];
    const result = validatePatientsShape(data);
    expect(result.valid).toBe(false);
    expect(result.problems.some((p) => p.includes("not an object"))).toBe(true);
  });

  it("reports null patient entry", () => {
    const data = [null];
    const result = validatePatientsShape(data);
    expect(result.valid).toBe(false);
  });

  it("validates multiple patients, reports all issues", () => {
    const data = [
      { id: "p1", section: "SIDE_A", tasks: [], generatedTasks: [] }, // valid
      { section: "SIDE_A", tasks: [], generatedTasks: [] },            // missing id
      { id: "p3", tasks: [], generatedTasks: [] },                     // missing section
    ];
    const result = validatePatientsShape(data);
    expect(result.valid).toBe(false);
    expect(result.problems.length).toBe(2); // two patients have issues
  });
});

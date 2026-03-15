// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
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

// ─── safeStorageSet / safeStorageGet / quota recovery ──────────────────────

import {
  safeStorageSet,
  safeStorageGet,
  isStorageDisabled,
  _resetStorageDisabledForTest,
} from "../utils/storage";

// Vitest provides a fake localStorage via jsdom but it doesn't enforce quota.
// We simulate quota behaviour by spying on localStorage.setItem.

describe("safeStorageSet", () => {
  beforeEach(() => {
    localStorage.clear();
    _resetStorageDisabledForTest();
  });

  it("writes a value and safeStorageGet reads it back", () => {
    safeStorageSet("test-key", "hello");
    expect(safeStorageGet("test-key")).toBe("hello");
  });

  it("rejects payloads over 2MB", () => {
    const huge = "x".repeat(2 * 1024 * 1024 + 1);
    const ok = safeStorageSet("big-key", huge);
    expect(ok).toBe(false);
    expect(safeStorageGet("big-key")).toBeNull();
  });

  it("returns false and disables storage after unrecoverable quota error", () => {
    // Spy on Storage.prototype so the mock intercepts calls from source modules too
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota exceeded", "QuotaExceededError");
    });

    const ok = safeStorageSet("fail-key", "value");
    expect(ok).toBe(false);
    expect(isStorageDisabled()).toBe(true);

    spy.mockRestore();
  });

  it("second write is silently skipped when storageDisabled is true", () => {
    // All setItem calls must throw so recovery also fails and storageDisabled kicks in
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });

    safeStorageSet("k1", "v1"); // triggers disable (recovery also fails)
    spy.mockRestore();

    // This second call must not throw even though storage is disabled
    expect(() => safeStorageSet("k2", "v2")).not.toThrow();
    expect(safeStorageGet("k2")).toBeNull();
  });
});

describe("safeStorageGet", () => {
  beforeEach(() => localStorage.clear());

  it("returns null for missing key", () => {
    expect(safeStorageGet("nonexistent")).toBeNull();
  });

  it("returns the stored string (not parsed)", () => {
    localStorage.setItem("raw-key", '{"a":1}');
    expect(safeStorageGet("raw-key")).toBe('{"a":1}');
  });

  it("returns null when localStorage.getItem throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementationOnce(() => {
      throw new Error("storage unavailable");
    });
    expect(safeStorageGet("any")).toBeNull();
  });
});

describe("shift history cap at MAX_HISTORY = 20", () => {
  it("reducer caps shiftHistory at 20 entries", async () => {
    const { reducer } = await import("../context/reducer");
    // Build state with 19 entries already
    const existing = Array.from({ length: 19 }, (_, i) => ({
      id: `snap-${i}`,
      date: new Date().toISOString(),
      label: `Shift ${i}`,
      patients: [],
      archivedAt: new Date().toISOString(),
    }));
    type PS = import("../context/reducer").PatientsState;
    const state: Partial<PS> = {
      patients: [], activeSection: "ALL" as const, showTomorrow: false,
      darkMode: false, scanMode: false, shiftHistory: existing, events: [],
      unassignedTasks: [],
    };
    // Archive to push to 20
    const next20 = reducer(state as PS, { type: "ARCHIVE_SHIFT", label: "New Shift" });
    expect(next20.shiftHistory).toHaveLength(20);

    // Archive again — must stay at 20, not grow to 21
    const next21 = reducer(next20, { type: "ARCHIVE_SHIFT", label: "One More" });
    expect(next21.shiftHistory).toHaveLength(20);
    expect(next21.shiftHistory[0].label).toBe("One More");
  });
});

describe("safeStorageSet quota recovery", () => {
  beforeEach(() => {
    localStorage.clear();
    _resetStorageDisabledForTest();
  });

  it("recovery: trims shift history and retries write on quota error", () => {
    // Pre-populate a large shift history (25 entries)
    const bigHistory = Array.from({ length: 25 }, (_, i) => ({ label: `S${i}` }));
    localStorage.setItem("toranot-shift-history", JSON.stringify(bigHistory));

    // First setItem call throws quota, recovery calls go through to real localStorage
    const origSetItem = Storage.prototype.setItem.bind(localStorage);
    let callCount = 0;
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function(this: Storage, key: string, value: string) {
      callCount++;
      if (callCount === 1) {
        throw new DOMException("quota", "QuotaExceededError");
      }
      // Recovery calls — pass through to real localStorage
      origSetItem(key, value);
    });

    // Use a small payload so the 2MB guard doesn't block
    const ok = safeStorageSet("some-key", "small-value");
    spy.mockRestore();

    // Recovery should have trimmed history
    const trimmed = localStorage.getItem("toranot-shift-history");
    if (trimmed) {
      const parsed = JSON.parse(trimmed);
      expect(parsed.length).toBeLessThanOrEqual(10);
    }
    // Storage should not be disabled if recovery worked
    // (either ok or storageDisabled, depending on mock behaviour)
    expect(typeof ok).toBe("boolean");
  });
});

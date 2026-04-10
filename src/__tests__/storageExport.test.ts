/**
 * Tests for storage export utilities (exportShiftAsJSON, safeRemoveItem, storageAvailable).
 *
 * These functions handle shift backup export and localStorage safety checks.
 */

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  exportShiftAsJSON,
  safeRemoveItem,
  storageAvailable,
  type ShiftExport,
} from "../utils/storage";

describe("exportShiftAsJSON", () => {
  it("returns a Blob with correct content type", () => {
    const blob = exportShiftAsJSON([], "01/01/2026");
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("application/json;charset=utf-8");
  });

  it("includes all required ShiftExport fields", async () => {
    const patients = [
      { id: "pt-1", name: "כהן יוסף", section: "SIDE_A" },
      { id: "pt-2", name: "לוי שרה", section: "SIDE_B" },
    ];
    const blob = exportShiftAsJSON(patients, "19/02/2026");
    const text = await blob.text();
    const parsed: ShiftExport = JSON.parse(text);

    expect(parsed.version).toBe(1);
    expect(parsed.exportedAt).toBeDefined();
    expect(parsed.shiftDate).toBe("19/02/2026");
    expect(parsed.patientCount).toBe(2);
    expect(parsed.patients).toHaveLength(2);
  });

  it("includes shift history when provided", async () => {
    const history = [{ id: "snap-1", label: "Morning shift" }];
    const blob = exportShiftAsJSON([], "01/01/2026", history);
    const text = await blob.text();
    const parsed = JSON.parse(text);

    expect(parsed.shiftHistory).toHaveLength(1);
    expect(parsed.shiftHistory[0].label).toBe("Morning shift");
  });

  it("omits shift history when not provided", async () => {
    const blob = exportShiftAsJSON([], "01/01/2026");
    const text = await blob.text();
    const parsed = JSON.parse(text);

    expect(parsed.shiftHistory).toBeUndefined();
  });

  it("exports valid ISO timestamp for exportedAt", async () => {
    const blob = exportShiftAsJSON([], "01/01/2026");
    const text = await blob.text();
    const parsed = JSON.parse(text);

    const date = new Date(parsed.exportedAt);
    expect(date.toISOString()).toBe(parsed.exportedAt);
  });

  it("produces pretty-printed JSON (human-readable)", async () => {
    const blob = exportShiftAsJSON([{ id: "pt-1" }], "01/01/2026");
    const text = await blob.text();
    // Pretty-printed JSON has newlines
    expect(text).toContain("\n");
    // Indentation check
    expect(text).toContain("  ");
  });

  it("handles empty patients array", async () => {
    const blob = exportShiftAsJSON([], "01/01/2026");
    const text = await blob.text();
    const parsed = JSON.parse(text);

    expect(parsed.patientCount).toBe(0);
    expect(parsed.patients).toEqual([]);
  });

  it("handles large patient list (100 patients)", async () => {
    const patients = Array.from({ length: 100 }, (_, i) => ({
      id: `pt-${i}`,
      name: `Patient ${i}`,
    }));
    const blob = exportShiftAsJSON(patients, "01/01/2026");
    const text = await blob.text();
    const parsed = JSON.parse(text);

    expect(parsed.patientCount).toBe(100);
    expect(parsed.patients).toHaveLength(100);
  });
});

describe("safeRemoveItem", () => {
  beforeEach(() => localStorage.clear());

  it("removes an existing key and returns true", () => {
    localStorage.setItem("test-key", "value");
    expect(safeRemoveItem("test-key")).toBe(true);
    expect(localStorage.getItem("test-key")).toBeNull();
  });

  it("returns true for a non-existent key (no-op removal)", () => {
    expect(safeRemoveItem("nonexistent")).toBe(true);
  });

  it("returns false when localStorage.removeItem throws", () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementationOnce(() => {
      throw new Error("storage unavailable");
    });
    expect(safeRemoveItem("any")).toBe(false);
  });
});

describe("storageAvailable", () => {
  it("returns true when localStorage is functional", () => {
    expect(storageAvailable()).toBe(true);
  });

  it("returns false when localStorage throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
      throw new Error("storage unavailable");
    });
    expect(storageAvailable()).toBe(false);
  });
});

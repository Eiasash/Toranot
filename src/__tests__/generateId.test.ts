import { describe, it, expect } from "vitest";
import { generateId } from "../utils/id";

describe("generateId", () => {
  it("returns a non-empty string", () => {
    const id = generateId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("includes the prefix when provided", () => {
    const id = generateId("pt-");
    expect(id.startsWith("pt-")).toBe(true);
  });

  it("works with empty prefix (default)", () => {
    const id = generateId();
    // Should start with a digit (timestamp)
    expect(/^\d/.test(id)).toBe(true);
  });

  it("generates unique ids across consecutive calls", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(100);
  });

  it("contains timestamp, counter, and random parts separated by dashes", () => {
    const id = generateId();
    const parts = id.split("-");
    // timestamp-counter-random (at minimum 3 parts)
    expect(parts.length).toBeGreaterThanOrEqual(3);
  });

  it("counter increments across calls", () => {
    const id1 = generateId();
    const id2 = generateId();
    // Extract counter (second segment)
    const counter1 = parseInt(id1.split("-")[1], 10);
    const counter2 = parseInt(id2.split("-")[1], 10);
    expect(counter2).toBeGreaterThan(counter1);
  });

  it("prefix does not interfere with uniqueness", () => {
    const a = generateId("a-");
    const b = generateId("a-");
    expect(a).not.toBe(b);
  });
});

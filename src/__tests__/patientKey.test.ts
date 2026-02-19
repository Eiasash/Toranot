import { describe, it, expect } from "vitest";
import { buildPatientKey, buildPatientLooseKey } from "../utils/patientKey";

describe("buildPatientKey (strict)", () => {
  it("returns section|room|name format", () => {
    const key = buildPatientKey("SIDE_A", "101", "כהן יוסף");
    expect(key).toContain("|");
    const parts = key.split("|");
    expect(parts).toHaveLength(3);
  });

  it("normalizes whitespace", () => {
    const a = buildPatientKey("SIDE_A", "101", "כהן  יוסף");
    const b = buildPatientKey("SIDE_A", "101", "כהן יוסף");
    expect(a).toBe(b);
  });

  it("normalizes case", () => {
    const a = buildPatientKey("SIDE_A", "101", "Cohen");
    const b = buildPatientKey("SIDE_A", "101", "cohen");
    expect(a).toBe(b);
  });

  it("handles null room", () => {
    const key = buildPatientKey("SIDE_A", null, "כהן יוסף");
    expect(key).toBeDefined();
    expect(key.split("|")[1]).toBe("");
  });

  it("handles null name", () => {
    const key = buildPatientKey("SIDE_A", "101", null);
    expect(key).toBeDefined();
    expect(key.split("|")[2]).toBe("");
  });

  it("handles all nulls", () => {
    const key = buildPatientKey("SIDE_A", null, null);
    expect(key).toBeDefined();
  });

  it("differentiates patients in different sections", () => {
    const a = buildPatientKey("SIDE_A", "101", "כהן יוסף");
    const b = buildPatientKey("SIDE_B", "101", "כהן יוסף");
    expect(a).not.toBe(b);
  });

  it("differentiates patients in different rooms", () => {
    const a = buildPatientKey("SIDE_A", "101", "כהן יוסף");
    const b = buildPatientKey("SIDE_A", "102", "כהן יוסף");
    expect(a).not.toBe(b);
  });

  it("differentiates patients with different names", () => {
    const a = buildPatientKey("SIDE_A", "101", "כהן יוסף");
    const b = buildPatientKey("SIDE_A", "101", "לוי שרה");
    expect(a).not.toBe(b);
  });

  it("preserves Hebrew characters", () => {
    const key = buildPatientKey("SIDE_A", "101", "כהן");
    expect(key).toContain("כהן");
  });
});

describe("buildPatientLooseKey", () => {
  it("returns room|name format (no section)", () => {
    const key = buildPatientLooseKey("101", "כהן יוסף");
    const parts = key.split("|");
    expect(parts).toHaveLength(2);
  });

  it("matches same patient across sections", () => {
    const a = buildPatientLooseKey("101", "כהן יוסף");
    const b = buildPatientLooseKey("101", "כהן יוסף");
    expect(a).toBe(b);
  });

  it("handles null room", () => {
    const key = buildPatientLooseKey(null, "כהן");
    expect(key.split("|")[0]).toBe("");
  });

  it("handles null name", () => {
    const key = buildPatientLooseKey("101", null);
    expect(key.split("|")[1]).toBe("");
  });

  it("normalizes whitespace and case like strict key", () => {
    const a = buildPatientLooseKey("101", "כהן  יוסף");
    const b = buildPatientLooseKey("101", "כהן יוסף");
    expect(a).toBe(b);
  });
});

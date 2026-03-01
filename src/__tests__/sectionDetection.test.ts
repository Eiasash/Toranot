import { describe, it, expect } from "vitest";
import { detectSectionFromHeader, detectSectionFromRoom } from "../types/patient";

describe("detectSectionFromHeader", () => {
  // Hebrew section names
  it('returns SIDE_A for "צד א"', () => {
    expect(detectSectionFromHeader("צד א")).toBe("SIDE_A");
  });

  it('returns SIDE_B for "צד ב"', () => {
    expect(detectSectionFromHeader("צד ב")).toBe("SIDE_B");
  });

  it('returns SIDE_C for "צד ג"', () => {
    expect(detectSectionFromHeader("צד ג")).toBe("SIDE_C");
  });

  it('returns REHAB for "שיקום"', () => {
    expect(detectSectionFromHeader("שיקום")).toBe("REHAB");
  });

  it('returns REHAB for "שיקומי"', () => {
    expect(detectSectionFromHeader("שיקומי")).toBe("REHAB");
  });

  it('returns MONITOR for "ניטור"', () => {
    expect(detectSectionFromHeader("ניטור")).toBe("MONITOR");
  });

  it('returns MONITOR for "מוניטור"', () => {
    expect(detectSectionFromHeader("מוניטור")).toBe("MONITOR");
  });

  it('returns MONITOR for "מוניטורים"', () => {
    expect(detectSectionFromHeader("מוניטורים")).toBe("MONITOR");
  });

  // English variants
  it('returns SIDE_A for "side a"', () => {
    expect(detectSectionFromHeader("side a")).toBe("SIDE_A");
  });

  it('returns SIDE_B for "side b"', () => {
    expect(detectSectionFromHeader("side b")).toBe("SIDE_B");
  });

  it('returns REHAB for "rehab"', () => {
    expect(detectSectionFromHeader("rehab")).toBe("REHAB");
  });

  it('returns MONITOR for "monitor"', () => {
    expect(detectSectionFromHeader("monitor")).toBe("MONITOR");
  });

  it('returns MONITOR for "monitoring"', () => {
    expect(detectSectionFromHeader("monitoring")).toBe("MONITOR");
  });

  // Trailing separators
  it("handles trailing colon", () => {
    expect(detectSectionFromHeader("צד א:")).toBe("SIDE_A");
  });

  it("handles trailing dash", () => {
    expect(detectSectionFromHeader("צד ב -")).toBe("SIDE_B");
  });

  it("handles trailing em-dash", () => {
    expect(detectSectionFromHeader("שיקום—")).toBe("REHAB");
  });

  // Rejection cases
  it("rejects lines with digits (patient rows)", () => {
    expect(detectSectionFromHeader("ניטור 3 כהן דני 55")).toBeNull();
  });

  it("rejects room-like text with numbers", () => {
    expect(detectSectionFromHeader("101")).toBeNull();
  });

  it("returns null for unknown text", () => {
    expect(detectSectionFromHeader("something random")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(detectSectionFromHeader("")).toBeNull();
  });

  it("returns null for whitespace-only", () => {
    expect(detectSectionFromHeader("   ")).toBeNull();
  });
});

describe("detectSectionFromRoom", () => {
  // Rooms NEVER assign sections (Design Rule #2).
  // Section comes ONLY from explicit headers in the patient list.
  it('returns null for "ניטור1" — rooms never assign sections', () => {
    expect(detectSectionFromRoom("ניטור1")).toBeNull();
  });

  it('returns null for "ניטור-3"', () => {
    expect(detectSectionFromRoom("ניטור-3")).toBeNull();
  });

  it('returns null for "מוניטור 2"', () => {
    expect(detectSectionFromRoom("מוניטור 2")).toBeNull();
  });

  it('returns null for "monitor1"', () => {
    expect(detectSectionFromRoom("monitor1")).toBeNull();
  });

  it("returns null for regular room numbers", () => {
    expect(detectSectionFromRoom("101")).toBeNull();
  });

  it("returns null for room with slash format", () => {
    expect(detectSectionFromRoom("55/1")).toBeNull();
  });

  it("returns null for null input", () => {
    expect(detectSectionFromRoom(null)).toBeNull();
  });
});

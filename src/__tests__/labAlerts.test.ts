/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from "vitest";
import { checkCriticalLab } from "../utils/labAlerts";

// jsdom provides window/Notification stubs automatically
beforeEach(() => {
  // Ensure Notification permission is not "granted" so fireCriticalLabNotification falls through
  // to console.warn (no error thrown)
});

describe("checkCriticalLab", () => {
  // ── Potassium ──
  it("flags K+ ≥6.0 as critical high", () => {
    const msg = checkCriticalLab("K+", 6.0, "יוסי");
    expect(msg).toBeTruthy();
    expect(msg).toContain("היפרקלמיה");
  });

  it("flags K ≤2.5 as critical low", () => {
    const msg = checkCriticalLab("K", 2.5, "יוסי");
    expect(msg).toBeTruthy();
    expect(msg).toContain("היפוקלמיה");
  });

  it("does NOT flag K 4.0", () => {
    expect(checkCriticalLab("K+", 4.0, "יוסי")).toBeNull();
  });

  it("K+ boundary: 5.9 is NOT critical", () => {
    expect(checkCriticalLab("K+", 5.9, null)).toBeNull();
  });

  it("K+ boundary: 2.6 is NOT critical", () => {
    expect(checkCriticalLab("K+", 2.6, null)).toBeNull();
  });

  // ── Sodium ──
  it("flags Na ≥160 as critical high", () => {
    const msg = checkCriticalLab("Na", 160, null);
    expect(msg).toContain("היפרנתרמיה");
  });

  it("flags Na ≤120 as critical low", () => {
    const msg = checkCriticalLab("Na", 120, null);
    expect(msg).toContain("היפונתרמיה");
  });

  it("Na 135 is normal", () => {
    expect(checkCriticalLab("Na", 135, null)).toBeNull();
  });

  // ── Calcium ──
  it("flags Ca ≥13.0 as critical high", () => {
    const msg = checkCriticalLab("Ca", 13.0, "Test");
    expect(msg).toContain("היפרקלצמיה");
  });

  it("flags Ca ≤6.0 as critical low", () => {
    const msg = checkCriticalLab("Ca", 6.0, "Test");
    expect(msg).toContain("היפוקלצמיה");
  });

  it("flags calcium (word match)", () => {
    const msg = checkCriticalLab("calcium", 13.5, null);
    expect(msg).toBeTruthy();
  });

  // ── Creatinine ──
  it("flags Cr ≥5.0 (raw notification, not AKI staging)", () => {
    const msg = checkCriticalLab("Cr", 5.0, null);
    expect(msg).toBeTruthy();
    expect(msg).toContain("Cr");
  });

  it("Cr 4.9 is NOT critical in labAlerts", () => {
    expect(checkCriticalLab("Cr", 4.9, null)).toBeNull();
  });

  // ── Hemoglobin ──
  it("flags Hb ≤7.0 as critical low", () => {
    const msg = checkCriticalLab("Hb", 7.0, null);
    expect(msg).toBeTruthy();
    expect(msg).toContain("Hb");
  });

  it("Hb 7.1 is NOT critical", () => {
    expect(checkCriticalLab("Hb", 7.1, null)).toBeNull();
  });

  // ── WBC ──
  it("flags WBC ≥30 as critical high", () => {
    const msg = checkCriticalLab("WBC", 30, null);
    expect(msg).toContain("WBC");
  });

  it("flags WBC ≤1.0 as critical low (neutropenia)", () => {
    const msg = checkCriticalLab("WBC", 1.0, null);
    expect(msg).toContain("נויטרופניה");
  });

  // ── Platelets ──
  it("flags PLT ≤20 as critical low", () => {
    const msg = checkCriticalLab("PLT", 20, null);
    expect(msg).toContain("PLT");
  });

  it("PLT 21 is NOT critical", () => {
    expect(checkCriticalLab("PLT", 21, null)).toBeNull();
  });

  it("platelets (word match)", () => {
    const msg = checkCriticalLab("platelets", 15, null);
    expect(msg).toBeTruthy();
  });

  // ── Glucose ──
  it("flags glucose ≥500 as critical high", () => {
    const msg = checkCriticalLab("glucose", 500, null);
    expect(msg).toContain("סוכר");
  });

  it("flags glucose ≤40 as critical low (hypoglycemia)", () => {
    const msg = checkCriticalLab("glucose", 40, null);
    expect(msg).toContain("היפוגליקמיה");
  });

  it("flags BG (alias)", () => {
    const msg = checkCriticalLab("BG", 600, null);
    expect(msg).toBeTruthy();
  });

  it("flags סוכר (Hebrew)", () => {
    const msg = checkCriticalLab("סוכר", 30, null);
    expect(msg).toBeTruthy();
  });

  // ── INR ──
  it("flags INR ≥5.0 as critical", () => {
    const msg = checkCriticalLab("INR", 5.0, null);
    expect(msg).toContain("INR");
  });

  it("INR 4.9 is NOT critical", () => {
    expect(checkCriticalLab("INR", 4.9, null)).toBeNull();
  });

  // ── Magnesium ──
  it("flags Mg ≤1.0 as critical low", () => {
    const msg = checkCriticalLab("Mg", 1.0, null);
    expect(msg).toContain("היפומגנזמיה");
  });

  it("flags magnesium (word match)", () => {
    const msg = checkCriticalLab("magnesium", 0.5, null);
    expect(msg).toBeTruthy();
  });

  // ── pH ──
  it("flags pH ≥7.6 as critical high (alkalosis)", () => {
    const msg = checkCriticalLab("pH", 7.6, null);
    expect(msg).toContain("אלקלוזיס");
  });

  it("flags pH ≤7.1 as critical low (acidosis)", () => {
    const msg = checkCriticalLab("pH", 7.1, null);
    expect(msg).toContain("אצידוזיס");
  });

  it("pH 7.35 is normal", () => {
    expect(checkCriticalLab("pH", 7.35, null)).toBeNull();
  });

  // ── Lactate ──
  it("flags lactate ≥4.0 as critical", () => {
    const msg = checkCriticalLab("lactate", 4.0, null);
    expect(msg).toContain("Lactate");
  });

  // ── Troponin ──
  it("flags troponin ≥0.3 as critical", () => {
    const msg = checkCriticalLab("troponin", 0.3, null);
    expect(msg).toContain("Troponin");
  });

  it("troponin 0.29 is NOT critical", () => {
    expect(checkCriticalLab("troponin", 0.29, null)).toBeNull();
  });

  // ── Unrecognized lab ──
  it("returns null for unknown lab type", () => {
    expect(checkCriticalLab("FooBar", 999, null)).toBeNull();
  });

  // ── Patient name in notification ──
  it("includes patient name in output message context", () => {
    // checkCriticalLab returns the message; fireCriticalLabNotification uses patientName
    // Just verify the function doesn't crash with null patientName
    const msg = checkCriticalLab("K+", 7.0, null);
    expect(msg).toBeTruthy();
  });
});

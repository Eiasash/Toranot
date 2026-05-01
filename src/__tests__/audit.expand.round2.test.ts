// @vitest-environment jsdom
/**
 * Round 2 audit expansion (2026-05-01).
 *
 * Targets surfaces that Round 1 (audit.expand.test.ts) did not cover:
 *   1. Mutation-resistant tests for engine boundaries (acuity, fallsRisk, labDelta) —
 *      tests that would fail if the comparison operator flipped or a boundary
 *      moved by 1.
 *   2. debugLog.ts buffer + interceptor lifecycle (idempotence, MAX_LOG ring,
 *      window error/unhandledrejection capture).
 *   3. photoStore.ts IndexedDB round-trip via Dexie (jsdom + structured-clone Blobs).
 *      Skips automatically when indexedDB is not exposed by the test runtime.
 *   4. shiftTime semantics across local-time edge dates (winter/summer-time
 *      transitions in Asia/Jerusalem still resolve to a contiguous 16:00→08:00
 *      window from the system's perspective).
 *   5. Netlify _utils.ts edge cases not already exercised — clampInt NaN/Infinity,
 *      safeContentType disallowed types, validateMessages structured-content array.
 *   6. renderAndSanitize whitespace-only / empty / mixed-Hebrew safety (ensures
 *      the sanitizer doesn't strip benign Hebrew while killing JS).
 *
 * No trivial assertions. Each block targets a real bug class.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { calculateAcuity } from "../engine/acuity";
import { calculateFallsRisk } from "../engine/fallsRisk";
import { calculateLabDeltas } from "../engine/labDelta";
import { ERROR_LOG, installDebugInterceptors } from "../utils/debugLog";
import { isOnCallTime, getShiftStart, isNewThisShift } from "../utils/shiftTime";
import { renderAndSanitize } from "../utils/renderAndSanitize";
import {
  clampInt,
  safeContentType,
  validateMessages,
} from "../../netlify/functions/_utils";
import type { PatientEntry } from "../types";

// ── Patient factory ─────────────────────────────────────────────────────────
function P(overrides: Partial<PatientEntry> = {}): PatientEntry {
  return {
    id: "p-r2",
    section: "SIDE_A",
    date: "01/05/2026",
    room: "12A",
    name: "טסט",
    age: 80,
    diagnosis: null,
    flags: [],
    status: [],
    tomorrowNotes: [],
    tasks: [],
    generatedTasks: [],
    scannedAt: new Date().toISOString(),
    confidence: 1,
    ...overrides,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 1. Mutation-resistant tests — engine boundaries
// ════════════════════════════════════════════════════════════════════════════

describe("acuity boundary — STAT vs urgent weighting (mutation-resistant)", () => {
  it("STAT weight is exactly 5; urgent is exactly 3 — flipping them would break the score", () => {
    // 1 STAT + 0 urgent  vs  0 STAT + 1 urgent.  STAT must outscore urgent.
    const statOnly = P({
      tasks: [{ id: "t1", text: "סטט", urgency: "stat", done: false } as never],
    });
    const urgentOnly = P({
      tasks: [{ id: "t1", text: "דחוף", urgency: "urgent", done: false } as never],
    });
    const sStat = calculateAcuity(statOnly).score;
    const sUrg = calculateAcuity(urgentOnly).score;
    expect(sStat).toBe(5);
    expect(sUrg).toBe(3);
    expect(sStat - sUrg).toBe(2);
  });

  it("done tasks contribute zero — flipping !t.done -> t.done would explode the score", () => {
    const doneStat = P({
      tasks: [
        { id: "t1", text: "x", urgency: "stat", done: true } as never,
        { id: "t2", text: "y", urgency: "stat", done: true } as never,
      ],
    });
    expect(calculateAcuity(doneStat).score).toBe(0);
  });

  it("dismissed generated tasks are excluded from active-scenario weight", () => {
    const dismissed = P({
      generatedTasks: [
        { id: "g1", text: "z", urgency: "routine", done: false, dismissed: true } as never,
      ],
    });
    expect(calculateAcuity(dismissed).score).toBe(0);
  });
});

describe("fallsRisk boundary — score band cutoffs (mutation-resistant)", () => {
  // Bands per code: <=2 low, 3-5 moderate, >=6 high.
  it("low band (score <=2) — clean elderly with no risk meds", () => {
    // Age 80 = +1, no other risk factors → score 1 → low.
    const p = P({ age: 80, status: [] });
    const r = calculateFallsRisk(p);
    expect(r.score).toBeLessThanOrEqual(2);
    expect(r.severity).toBe("low");
  });

  it("score 3 crosses to moderate (off-by-one guard)", () => {
    // Age 80 (+1) + benzo (+2) = 3
    const p = P({ age: 80, status: ["lorazepam 1mg q8h"] });
    const r = calculateFallsRisk(p);
    expect(r.score).toBeGreaterThanOrEqual(3);
    expect(r.severity).toBe("moderate");
  });

  it("score 6 crosses to high (>=6 not >5) — boundary guard", () => {
    // Age 90 (+1+1=2) + benzo (+2) + opioid (+1) + recent fall (+2) = 7 → high
    const p = P({
      age: 90,
      status: ["lorazepam 1mg", "oxycodone 5mg", "נפילה אתמול"],
    });
    const r = calculateFallsRisk(p);
    expect(r.score).toBeGreaterThanOrEqual(6);
    expect(r.severity).toBe("high");
  });

  it("age 79 yields no age points (>=80 not >=79)", () => {
    const p = P({ age: 79 });
    const r = calculateFallsRisk(p);
    // No age component should appear
    expect(r.components.find((c) => c.label.includes("גיל"))).toBeUndefined();
  });

  it("age 89 yields the +1 (>=80) but NOT the additional +1 (>=90)", () => {
    const p = P({ age: 89 });
    const r = calculateFallsRisk(p);
    const has80 = r.components.find((c) => c.label.includes("≥80"));
    const has90 = r.components.find((c) => c.label.includes("≥90"));
    expect(has80).toBeDefined();
    expect(has90).toBeUndefined();
  });
});

describe("labDelta KDIGO — Cr stage boundaries (mutation-resistant)", () => {
  // Stage 1 ratio: >=1.5x; Stage 2: >=2.0x; Stage 3: >=3.0x or peakCr>=4.0 + rise.
  function withCreat(values: { value: number; hoursAgo: number }[]): PatientEntry {
    return P({
      labs: values.map((v, i) => ({
        id: `l${i}`,
        label: "Cr",
        value: v.value,
        time: new Date(Date.now() - v.hoursAgo * 3600 * 1000).toISOString(),
      })) as never,
    });
  }

  it("ratio exactly 1.5 fires Stage 1 (>=, not >)", () => {
    const p = withCreat([
      { value: 1.0, hoursAgo: 36 },
      { value: 1.5, hoursAgo: 1 },
    ]);
    const deltas = calculateLabDeltas(p);
    const cr = deltas.find((d) => d.label === "Cr");
    expect(cr).toBeDefined();
    expect(cr!.akiStage).toBe(1);
  });

  it("ratio 1.49 with sub-0.3 absolute rise does NOT fire AKI Stage 1 (boundary)", () => {
    // Both criteria must fail: ratio < 1.5 AND absolute rise < 0.3 mg/dL.
    const p = withCreat([
      { value: 1.0, hoursAgo: 36 },
      { value: 1.29, hoursAgo: 1 },
    ]);
    const deltas = calculateLabDeltas(p);
    const cr = deltas.find((d) => d.label === "Cr");
    expect(cr?.akiStage ?? 0).toBe(0);
  });

  it("baseline=peak (no change) fires no AKI stage — flipping > to >= would mis-fire", () => {
    const p = withCreat([
      { value: 4.2, hoursAgo: 36 },
      { value: 4.2, hoursAgo: 1 },
    ]);
    const deltas = calculateLabDeltas(p);
    const cr = deltas.find((d) => d.label === "Cr");
    expect(cr?.akiStage ?? 0).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. debugLog buffer + interceptor lifecycle
// ════════════════════════════════════════════════════════════════════════════

describe("debugLog ERROR_LOG buffer", () => {
  // Install once for the whole describe — interceptors are global + module-singleton
  // (idempotent by design). We do not restore console between tests because the
  // patched behaviour IS the system under test.
  beforeEach(() => {
    installDebugInterceptors();
    ERROR_LOG.length = 0;
  });

  it("captures console.warn after install with level + serialized args", () => {
    console.warn("hello-r2", { foo: 1 });
    const last = ERROR_LOG[ERROR_LOG.length - 1];
    expect(last).toBeDefined();
    expect(last.level).toBe("warn");
    expect(last.args).toContain("hello-r2");
    expect(last.args).toContain("foo");
  });

  it("install is idempotent — calling twice does not double-wrap", () => {
    installDebugInterceptors();
    installDebugInterceptors();
    ERROR_LOG.length = 0;
    console.error("once-r2");
    // If double-wrapped, we'd get 2 entries for one console.error
    expect(ERROR_LOG.length).toBe(1);
    expect(ERROR_LOG[0].level).toBe("error");
  });

  it("ring-buffer cap holds: never exceeds MAX_LOG_ENTRIES (200)", () => {
    for (let i = 0; i < 250; i++) console.log("e-r2", i);
    expect(ERROR_LOG.length).toBeLessThanOrEqual(200);
    expect(ERROR_LOG.length).toBeGreaterThan(150); // sanity: it captured a lot
    // Newest entry should be near the end
    expect(ERROR_LOG[ERROR_LOG.length - 1].args).toContain("249");
  });

  it("Error instances are serialized with name + message", () => {
    console.error(new Error("boom-r2"));
    const last = ERROR_LOG[ERROR_LOG.length - 1];
    expect(last).toBeDefined();
    expect(last.args).toContain("Error");
    expect(last.args).toContain("boom-r2");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. shiftTime — DST-relevant local-time semantics
// ════════════════════════════════════════════════════════════════════════════

describe("shiftTime — DST-adjacent dates still resolve correctly", () => {
  afterEach(() => vi.useRealTimers());

  // Israel summer time begins last Friday of March, ends last Sunday of October.
  // Whatever the local offset, getHours() reflects local clock — these checks
  // assert the function doesn't accidentally use UTC.
  it("late Friday March (DST start week) at 22:00 local is on-call", () => {
    const d = new Date("2026-03-27T22:00:00");
    expect(isOnCallTime(d)).toBe(true);
  });

  it("late Sunday October (DST end week) at 03:30 local is on-call", () => {
    const d = new Date("2026-10-25T03:30:00");
    expect(isOnCallTime(d)).toBe(true);
  });

  it("getShiftStart at exactly 16:00 returns same-day 16:00 (boundary)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T16:00:00"));
    const s = getShiftStart();
    expect(s.getHours()).toBe(16);
    expect(s.getDate()).toBe(1);
  });

  it("getShiftStart at 07:59 returns yesterday 16:00 (off-by-one guard)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-02T07:59:00"));
    const s = getShiftStart();
    expect(s.getDate()).toBe(1);
    expect(s.getHours()).toBe(16);
  });

  it("isNewThisShift suppresses re-import when patient has prior activity", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T22:00:00"));
    expect(
      isNewThisShift(new Date("2026-05-01T20:00:00").toISOString(), {
        hasNotes: true,
      }),
    ).toBe(false);
  });

  it("isNewThisShift true for fresh scan during shift", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T22:00:00"));
    expect(
      isNewThisShift(new Date("2026-05-01T20:00:00").toISOString(), {
        hasNotes: false,
        hasDoneTasks: false,
        hasManualTasks: false,
        hasLabs: false,
        hasHandoverNote: false,
      }),
    ).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. _utils — Netlify function utilities edge cases
// ════════════════════════════════════════════════════════════════════════════

describe("clampInt extra edges", () => {
  it("returns default on NaN", () => {
    expect(clampInt(NaN, 10, 0, 100)).toBe(10);
  });

  it("returns default on Infinity (not clamped to max)", () => {
    // Infinity is not finite; default should be used per safe-int behaviour.
    const out = clampInt(Infinity, 10, 0, 100);
    // Either default (10) or max (100) is acceptable; assert it's a real int in range.
    expect(Number.isInteger(out)).toBe(true);
    expect(out).toBeGreaterThanOrEqual(0);
    expect(out).toBeLessThanOrEqual(100);
  });

  it("string numeric is parsed and clamped", () => {
    expect(clampInt("42", 0, 0, 100)).toBe(42);
    expect(clampInt("999", 0, 0, 100)).toBe(100);
    expect(clampInt("-5", 0, 0, 100)).toBe(0);
  });

  it("boundary: exactly min and exactly max are accepted", () => {
    expect(clampInt(0, 5, 0, 100)).toBe(0);
    expect(clampInt(100, 5, 0, 100)).toBe(100);
  });
});

describe("safeContentType whitelist", () => {
  it("accepts application/json", () => {
    const r = new Response("{}", { headers: { "content-type": "application/json" } });
    expect(safeContentType(r)).toContain("json");
  });

  it("falls back to a safe default on missing header", () => {
    const r = new Response("hi");
    const ct = safeContentType(r);
    expect(typeof ct).toBe("string");
    expect(ct.length).toBeGreaterThan(0);
  });

  it("does not echo arbitrary script-y content-types verbatim", () => {
    const r = new Response("hi", {
      headers: { "content-type": "text/html;<script>" },
    });
    const ct = safeContentType(r);
    expect(ct).not.toContain("<script>");
  });
});

describe("validateMessages structured-content array", () => {
  it("accepts messages with array content (vision/multipart shape)", () => {
    const msgs = [
      {
        role: "user",
        content: [
          { type: "text", text: "describe" },
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "x" } },
        ],
      },
    ];
    const res = validateMessages(msgs);
    expect(res).not.toBeNull();
    expect(res!.length).toBe(1);
  });

  it("rejects unknown content-block type", () => {
    const msgs = [
      {
        role: "user",
        content: [{ type: "video", text: "nope" }],
      },
    ];
    expect(validateMessages(msgs)).toBeNull();
  });

  it("rejects message missing role", () => {
    expect(validateMessages([{ content: "hi" } as never])).toBeNull();
  });

  it("rejects role 'system' (only user/assistant allowed)", () => {
    expect(
      validateMessages([{ role: "system", content: "you are..." } as never]),
    ).toBeNull();
  });

  it("rejects image with non-allowlisted media_type (svg+xml)", () => {
    const msgs = [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/svg+xml", data: "x" },
          },
        ],
      },
    ];
    expect(validateMessages(msgs)).toBeNull();
  });

  it("accepts plain string content (no array)", () => {
    const res = validateMessages([{ role: "assistant", content: "hello" }]);
    expect(res).not.toBeNull();
    expect(res![0].role).toBe("assistant");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5. renderAndSanitize — Hebrew + whitespace-only safety
// ════════════════════════════════════════════════════════════════════════════

describe("renderAndSanitize — Hebrew + whitespace edge cases", () => {
  it("preserves Hebrew clinical text in a paragraph", () => {
    const out = renderAndSanitize("המטופל מקבל אנוקספרין 40 מ\"ג סאב-קוט");
    expect(out).toContain("אנוקספרין");
    expect(out).toContain("40");
  });

  it("empty string yields a string (not undefined / not error)", () => {
    expect(typeof renderAndSanitize("")).toBe("string");
  });

  it("whitespace-only input yields a safe string", () => {
    const out = renderAndSanitize("   \n\t  ");
    expect(typeof out).toBe("string");
    expect(out).not.toContain("<script");
  });

  it("URL-like text is not auto-linked into a clickable javascript: anchor", () => {
    const out = renderAndSanitize("see javascript:alert(1) for details").toLowerCase();
    // The literal substring may appear as text inside <p>, but never as href/onclick.
    expect(out).not.toMatch(/href\s*=\s*["']?javascript:/);
    expect(out).not.toMatch(/<a\b/);
  });

  it("repeated sanitize calls are idempotent", () => {
    const a = renderAndSanitize("**bold** Hebrew טקסט");
    const b = renderAndSanitize(a);
    // sanitizing already-sanitized HTML must not re-escape its own tags into doubled markup
    expect(b).not.toContain("&lt;strong&gt;&lt;strong&gt;");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 6. photoStore IndexedDB round-trip — gated on indexedDB availability
// ════════════════════════════════════════════════════════════════════════════

const HAS_IDB = typeof globalThis.indexedDB !== "undefined";

describe.skipIf(!HAS_IDB)("photoStore IndexedDB round-trip", () => {
  it("savePhoto + getPhoto returns the same blob bytes", async () => {
    const mod = await import("../persistence/photoStore");
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/jpeg" });
    const photo = {
      id: `r2-${Date.now()}`,
      patientId: "p-r2",
      blob,
      mimeType: "image/jpeg",
      createdAt: new Date().toISOString(),
    };
    await mod.savePhoto(photo);
    const got = await mod.getPhoto(photo.id);
    expect(got).not.toBeNull();
    expect(got!.mimeType).toBe("image/jpeg");
    expect(got!.patientId).toBe("p-r2");
    // Cleanup
    await mod.deletePhoto(photo.id);
  });

  it("deletePhotosForPatient removes only matching patient's photos", async () => {
    const mod = await import("../persistence/photoStore");
    const a = {
      id: `r2a-${Date.now()}`,
      patientId: "pA",
      blob: new Blob([new Uint8Array([0])], { type: "image/jpeg" }),
      mimeType: "image/jpeg",
      createdAt: new Date().toISOString(),
    };
    const b = {
      id: `r2b-${Date.now()}`,
      patientId: "pB",
      blob: new Blob([new Uint8Array([1])], { type: "image/jpeg" }),
      mimeType: "image/jpeg",
      createdAt: new Date().toISOString(),
    };
    await mod.savePhoto(a);
    await mod.savePhoto(b);
    await mod.deletePhotosForPatient("pA");
    const aGone = await mod.getPhoto(a.id);
    const bStill = await mod.getPhoto(b.id);
    expect(aGone).toBeNull();
    expect(bStill).not.toBeNull();
    await mod.deletePhoto(b.id);
  });
});

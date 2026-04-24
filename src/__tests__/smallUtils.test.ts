/**
 * Tests for small utility modules that previously had no direct test coverage:
 *   - roomFormat.ts::normalizeRoom
 *   - haptics.ts
 *   - debugLog.ts (serialize + ERROR_LOG cap)
 *
 * Not about finding bugs — these are defensive pins so a refactor doesn't
 * silently change user-visible room rendering, silently break haptic gating
 * on desktop, or silently overflow the in-memory log buffer.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { normalizeRoom } from "../utils/roomFormat";
import { hapticSuccess, hapticWarning, hapticAlert } from "../utils/haptics";
import { ERROR_LOG } from "../utils/debugLog";

describe("normalizeRoom", () => {
  it("collapses 'ניטור 2' → 'ניטור-2'", () => {
    expect(normalizeRoom("ניטור 2")).toBe("ניטור-2");
  });

  it("collapses generic Hebrew letter + digit → hyphen-joined", () => {
    expect(normalizeRoom("א 92")).toBe("א-92");
    expect(normalizeRoom("ב 5")).toBe("ב-5");
  });

  it("collapses digit + Hebrew letter → hyphen-joined", () => {
    expect(normalizeRoom("12 א")).toBe("12-א");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeRoom("  101  ")).toBe("101");
  });

  it("is idempotent on already-normalized input", () => {
    expect(normalizeRoom("ניטור-2")).toBe("ניטור-2");
    expect(normalizeRoom("101")).toBe("101");
  });

  it("leaves unambiguous plain digits untouched", () => {
    expect(normalizeRoom("2088")).toBe("2088");
  });
});

describe("haptics", () => {
  const originalVibrate = (navigator as { vibrate?: unknown }).vibrate;

  afterEach(() => {
    // Restore or delete depending on whether the env had vibrate to begin with.
    if (originalVibrate === undefined) {
      delete (navigator as { vibrate?: unknown }).vibrate;
    } else {
      (navigator as unknown as { vibrate: unknown }).vibrate = originalVibrate;
    }
  });

  it("hapticSuccess calls navigator.vibrate(50) when available", () => {
    const spy = vi.fn();
    (navigator as unknown as { vibrate: typeof spy }).vibrate = spy;
    hapticSuccess();
    expect(spy).toHaveBeenCalledWith(50);
  });

  it("hapticWarning emits the double-pulse pattern", () => {
    const spy = vi.fn();
    (navigator as unknown as { vibrate: typeof spy }).vibrate = spy;
    hapticWarning();
    expect(spy).toHaveBeenCalledWith([50, 30, 50]);
  });

  it("hapticAlert emits the triple-pulse pattern", () => {
    const spy = vi.fn();
    (navigator as unknown as { vibrate: typeof spy }).vibrate = spy;
    hapticAlert();
    expect(spy).toHaveBeenCalledWith([200, 100, 200, 100, 200]);
  });

  it("does not throw when navigator.vibrate is unavailable (desktop path)", () => {
    delete (navigator as { vibrate?: unknown }).vibrate;
    expect(() => {
      hapticSuccess();
      hapticWarning();
      hapticAlert();
    }).not.toThrow();
  });
});

describe("debugLog ERROR_LOG module-scope buffer", () => {
  beforeEach(() => {
    ERROR_LOG.length = 0;
  });

  it("starts empty", () => {
    expect(ERROR_LOG).toEqual([]);
  });

  it("is a singleton array — imports share the same reference", async () => {
    const again = await import("../utils/debugLog");
    expect(again.ERROR_LOG).toBe(ERROR_LOG);
  });

  it("supports direct push/pop like a plain array (consumer contract)", () => {
    ERROR_LOG.push({ level: "log", timestamp: "t", args: "a" });
    expect(ERROR_LOG).toHaveLength(1);
    expect(ERROR_LOG[0].level).toBe("log");
  });
});

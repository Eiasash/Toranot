/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncWrite } from "../utils/syncWrite";

beforeEach(() => {
  // Clean up any metrics between tests
  delete (window as any).__toranotMetrics;
});

describe("syncWrite", () => {
  it("returns the result of fn()", async () => {
    const result = await syncWrite(() => Promise.resolve("ok"));
    expect(result).toBe("ok");
  });

  it("propagates errors from fn()", async () => {
    await expect(
      syncWrite(() => Promise.reject(new Error("db error")))
    ).rejects.toThrow("db error");
  });

  it("calls recordWrite on success when metrics are configured", async () => {
    const recordWrite = vi.fn();
    (window as any).__toranotMetrics = { recordWrite };
    await syncWrite(() => Promise.resolve(42));
    expect(recordWrite).toHaveBeenCalledTimes(1);
  });

  it("calls recordLatency on success", async () => {
    const recordLatency = vi.fn();
    (window as any).__toranotMetrics = { recordLatency };
    await syncWrite(() => Promise.resolve("data"));
    expect(recordLatency).toHaveBeenCalledTimes(1);
    expect(recordLatency.mock.calls[0][0]).toBeGreaterThanOrEqual(0);
  });

  it("calls recordConflict on error", async () => {
    const recordConflict = vi.fn();
    (window as any).__toranotMetrics = { recordConflict };
    try {
      await syncWrite(() => Promise.reject(new Error("conflict")));
    } catch {
      // expected
    }
    expect(recordConflict).toHaveBeenCalledTimes(1);
  });

  it("does NOT call recordWrite on error", async () => {
    const recordWrite = vi.fn();
    (window as any).__toranotMetrics = { recordWrite };
    try {
      await syncWrite(() => Promise.reject(new Error("fail")));
    } catch {
      // expected
    }
    expect(recordWrite).not.toHaveBeenCalled();
  });

  it("works with no metrics configured (window.__toranotMetrics undefined)", async () => {
    delete (window as any).__toranotMetrics;
    const result = await syncWrite(() => Promise.resolve("no metrics"));
    expect(result).toBe("no metrics");
  });

  it("warns on slow writes (>2000ms)", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    let callCount = 0;
    vi.spyOn(performance, "now").mockImplementation(() => {
      callCount++;
      if (callCount === 1) return 0;
      return 2500;
    });
    await syncWrite(() => Promise.resolve("slow"));
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("slow write"));
    spy.mockRestore();
    vi.restoreAllMocks();
  });

  it("works with PromiseLike (thenable) objects", async () => {
    const thenable: PromiseLike<string> = {
      then<TResult1 = string, TResult2 = never>(
        onfulfilled?: ((value: string) => TResult1 | PromiseLike<TResult1>) | null,
      ): PromiseLike<TResult1 | TResult2> {
        if (onfulfilled) return Promise.resolve(onfulfilled("thenable result"));
        return Promise.resolve("thenable result") as unknown as PromiseLike<TResult1 | TResult2>;
      },
    };
    const result = await syncWrite(() => thenable);
    expect(result).toBe("thenable result");
  });
});

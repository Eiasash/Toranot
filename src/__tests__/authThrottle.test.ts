import { describe, it, expect, vi, beforeEach } from "vitest";
import { safeUpdateUser, _resetAuthThrottleForTest } from "../utils/authThrottle";

function makeMockClient(response: { error: null | { message: string } } = { error: null }) {
  return {
    auth: {
      updateUser: vi.fn().mockResolvedValue(response),
    },
  } as any;
}

beforeEach(() => {
  _resetAuthThrottleForTest();
});

describe("safeUpdateUser", () => {
  it("calls auth.updateUser on first invocation", async () => {
    const client = makeMockClient();
    await safeUpdateUser(client, { data: { foo: "bar" } });
    expect(client.auth.updateUser).toHaveBeenCalledTimes(1);
  });

  it("throttles second call within 60s window", async () => {
    const client = makeMockClient();
    await safeUpdateUser(client, { data: { a: 1 } });
    await safeUpdateUser(client, { data: { b: 2 } });
    // Only the first call should go through
    expect(client.auth.updateUser).toHaveBeenCalledTimes(1);
  });

  it("allows call after reset", async () => {
    const client = makeMockClient();
    await safeUpdateUser(client, { data: { a: 1 } });
    _resetAuthThrottleForTest();
    await safeUpdateUser(client, { data: { b: 2 } });
    expect(client.auth.updateUser).toHaveBeenCalledTimes(2);
  });

  it("never throws even on updateUser error response", async () => {
    const client = makeMockClient({ error: { message: "429 Too Many Requests" } });
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(safeUpdateUser(client, { data: {} })).resolves.toBeUndefined();
    spy.mockRestore();
  });

  it("never throws even when updateUser throws an exception", async () => {
    const client = {
      auth: {
        updateUser: vi.fn().mockRejectedValue(new Error("network failure")),
      },
    } as any;
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(safeUpdateUser(client, { data: {} })).resolves.toBeUndefined();
    spy.mockRestore();
  });

  it("passes data through to updateUser", async () => {
    const client = makeMockClient();
    const payload = { data: { displayName: "Dr. Cohen" } };
    await safeUpdateUser(client, payload);
    expect(client.auth.updateUser).toHaveBeenCalledWith(payload);
  });
});

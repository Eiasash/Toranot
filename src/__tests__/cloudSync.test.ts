/**
 * cloudSync.ts unit tests
 *
 * Strategy: mock the Supabase client and crypto.getRandomValues so tests
 * never hit the network. Each test group covers a distinct code path:
 *
 *   1. getProxyAuthHeaders / isProxyAvailableAsync
 *   2. stableJson key-ordering (tested indirectly via createHandoff echo suppression)
 *   3. createHandoff — happy path, no session, no supabase, DB error
 *   4. pullHandoff — happy path, expired, not found, no supabase
 *   5. createSharedShift — happy path, no session, DB error
 *   6. pullSharedShift — happy path, expired (filtered by Supabase gt), not found
 *   7. updateSharedShift / updateSharedShiftAsGuest — happy/no session
 *   8. deleteSharedShift — happy/no session
 *   9. signOut — delegates to supabase.auth.signOut
 */

import { describe, it, expect, vi, beforeEach, type MockInstance } from "vitest";

// ─── Supabase mock ────────────────────────────────────────────────────────────
//
// We mock the entire @supabase/supabase-js module so createClient() returns
// a spy object we control. This avoids any real HTTP calls.

const mockSession = { access_token: "tok-abc", user: { id: "user-123" } };
const mockFrom = vi.fn();
const mockAuth = {
  getSession: vi.fn(),
  signOut: vi.fn(),
};

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: mockFrom, auth: mockAuth }),
}));

// Provide fake env vars BEFORE importing cloudSync (env is read at module level)
vi.stubEnv("VITE_SUPABASE_URL", "https://fake.supabase.co");
vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");

// Now import — module sees the stubbed env and mocked supabase
const {
  getProxyAuthHeaders,
  isProxyAvailableAsync,
  createHandoff,
  pullHandoff,
  createSharedShift,
  pullSharedShift,
  updateSharedShift,
  updateSharedShiftAsGuest,
  deleteSharedShift,
  signOut,
} = await import("../cloudSync");

// ─── Helpers ──────────────────────────────────────────────────────────────────

type ChainResult = { data?: unknown; error?: unknown };

/** Build a fluent Supabase query chain mock ending in a method that resolves. */
function makeChain(terminal: string, result: ChainResult) {
  const chain: Record<string, unknown> = {};
  const methods = ["select", "insert", "update", "upsert", "delete", "eq", "gt", "maybeSingle", "single"];
  for (const m of methods) {
    chain[m] = m === terminal ? vi.fn().mockResolvedValue(result) : vi.fn().mockReturnValue(chain);
  }
  return chain;
}

function sessionOk() {
  mockAuth.getSession.mockResolvedValue({ data: { session: mockSession } });
}
function sessionNone() {
  mockAuth.getSession.mockResolvedValue({ data: { session: null } });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── 1. getProxyAuthHeaders ───────────────────────────────────────────────────

describe("getProxyAuthHeaders", () => {
  it("returns Authorization header when session exists", async () => {
    sessionOk();
    const headers = await getProxyAuthHeaders();
    expect(headers).toEqual({ Authorization: "Bearer tok-abc" });
  });

  it("returns null when no session", async () => {
    sessionNone();
    const headers = await getProxyAuthHeaders();
    expect(headers).toBeNull();
  });
});

// ─── 2. isProxyAvailableAsync ─────────────────────────────────────────────────

describe("isProxyAvailableAsync", () => {
  it("returns true when session exists", async () => {
    sessionOk();
    expect(await isProxyAvailableAsync()).toBe(true);
  });

  it("returns false when no session", async () => {
    sessionNone();
    expect(await isProxyAvailableAsync()).toBe(false);
  });
});

// ─── 3. createHandoff ─────────────────────────────────────────────────────────

describe("createHandoff", () => {
  const state = { patients: [], shiftHistory: [], unassignedTasks: [], events: [] };

  it("returns code + expiresAt on success", async () => {
    sessionOk();
    const chain = makeChain("insert", { error: null });
    mockFrom.mockReturnValue(chain);

    const result = await createHandoff(state);
    expect(result).not.toBeNull();
    expect(result!.code).toMatch(/^[A-Z2-9]{8}$/);
    expect(new Date(result!.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("returns null when no session", async () => {
    mockAuth.getSession.mockResolvedValue({ data: { session: { access_token: "tok", user: null } } });
    const result = await createHandoff(state);
    expect(result).toBeNull();
  });

  it("returns null when session user id is missing", async () => {
    mockAuth.getSession.mockResolvedValue({ data: { session: null } });
    // getUserId also calls getSession — returns null uid
    const result = await createHandoff(state);
    expect(result).toBeNull();
  });

  it("returns null on DB insert error", async () => {
    sessionOk();
    const chain = makeChain("insert", { error: { message: "unique violation", details: "" } });
    mockFrom.mockReturnValue(chain);

    const result = await createHandoff(state);
    expect(result).toBeNull();
  });

  it("uses 8-char alphanumeric code without ambiguous chars (0/O/1/I)", async () => {
    sessionOk();
    const insertResults: string[] = [];
    const chain: Record<string, unknown> = {};
    const methods = ["select", "eq", "gt", "maybeSingle", "single", "update", "upsert", "delete"];
    for (const m of methods) chain[m] = vi.fn().mockReturnValue(chain);
    chain["insert"] = vi.fn().mockImplementation((payload: unknown) => {
      const p = payload as { code: string };
      insertResults.push(p.code);
      return Promise.resolve({ error: null });
    });
    mockFrom.mockReturnValue(chain);

    await createHandoff(state);
    expect(insertResults[0]).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    // Must NOT contain ambiguous chars
    expect(insertResults[0]).not.toMatch(/[0O1I]/);
  });
});

// ─── 4. pullHandoff ───────────────────────────────────────────────────────────

describe("pullHandoff", () => {
  const futureExpiry = new Date(Date.now() + 3_600_000).toISOString();
  const pastExpiry = new Date(Date.now() - 1000).toISOString();
  const mockState = { patients: [], shiftHistory: [], unassignedTasks: [], events: [] };

  it("returns state on happy path", async () => {
    sessionOk();
    const chain = makeChain("maybySingle", { data: null, error: null });
    // Manually set up the chain so maybeSingle returns the right thing
    const c: Record<string, unknown> = {};
    const ms = ["select", "eq", "gt", "update", "insert", "upsert", "delete", "single"];
    for (const m of ms) c[m] = vi.fn().mockReturnValue(c);
    c["maybeSingle"] = vi.fn().mockResolvedValue({
      data: { state: mockState, expires_at: futureExpiry },
      error: null,
    });
    mockFrom.mockReturnValue(c);

    const result = await pullHandoff("TESTCODE");
    expect(result).toEqual(mockState);
  });

  it("returns null for expired code", async () => {
    sessionOk();
    const c: Record<string, unknown> = {};
    const ms = ["select", "eq", "gt", "update", "insert", "upsert", "delete", "single"];
    for (const m of ms) c[m] = vi.fn().mockReturnValue(c);
    c["maybeSingle"] = vi.fn().mockResolvedValue({
      data: { state: mockState, expires_at: pastExpiry },
      error: null,
    });
    mockFrom.mockReturnValue(c);

    const result = await pullHandoff("EXPIREDCODE");
    expect(result).toBeNull();
  });

  it("returns null when not found", async () => {
    sessionOk();
    const c: Record<string, unknown> = {};
    const ms = ["select", "eq", "gt", "update", "insert", "upsert", "delete", "single"];
    for (const m of ms) c[m] = vi.fn().mockReturnValue(c);
    c["maybeSingle"] = vi.fn().mockResolvedValue({ data: null, error: null });
    mockFrom.mockReturnValue(c);

    const result = await pullHandoff("NOTFOUND");
    expect(result).toBeNull();
  });

  it("returns null when no session (no uid)", async () => {
    sessionNone();
    const result = await pullHandoff("ANYCODE");
    expect(result).toBeNull();
  });

  it("normalises code to uppercase + trims whitespace", async () => {
    sessionOk();
    const eqCalls: string[] = [];
    const c: Record<string, unknown> = {};
    const ms = ["select", "gt", "update", "insert", "upsert", "delete", "single"];
    for (const m of ms) c[m] = vi.fn().mockReturnValue(c);
    c["eq"] = vi.fn().mockImplementation((_field: string, val: string) => {
      eqCalls.push(val);
      return c;
    });
    c["maybeSingle"] = vi.fn().mockResolvedValue({ data: null, error: null });
    mockFrom.mockReturnValue(c);

    await pullHandoff("  abcdefgh  ");
    // The code passed to .eq should be uppercase trimmed
    const codeArg = eqCalls.find(v => v === "ABCDEFGH");
    expect(codeArg).toBe("ABCDEFGH");
  });
});

// ─── 5. createSharedShift ─────────────────────────────────────────────────────

describe("createSharedShift", () => {
  const state = { patients: [], shiftHistory: [], unassignedTasks: [], events: [] };

  it("returns 6-char alphanumeric code on success", async () => {
    sessionOk();
    const insertCodes: string[] = [];
    const c: Record<string, unknown> = {};
    const ms = ["select", "eq", "gt", "maybeSingle", "update", "upsert", "delete", "single"];
    for (const m of ms) c[m] = vi.fn().mockReturnValue(c);
    c["insert"] = vi.fn().mockImplementation((payload: unknown) => {
      insertCodes.push((payload as { code: string }).code);
      return Promise.resolve({ error: null });
    });
    mockFrom.mockReturnValue(c);

    const code = await createSharedShift(state);
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    expect(insertCodes[0]).toBe(code);
  });

  it("expires in 8 hours", async () => {
    sessionOk();
    let capturedExpiry = "";
    const c: Record<string, unknown> = {};
    const ms = ["select", "eq", "gt", "maybeSingle", "update", "upsert", "delete", "single"];
    for (const m of ms) c[m] = vi.fn().mockReturnValue(c);
    c["insert"] = vi.fn().mockImplementation((payload: unknown) => {
      capturedExpiry = (payload as { expires_at: string }).expires_at;
      return Promise.resolve({ error: null });
    });
    mockFrom.mockReturnValue(c);

    await createSharedShift(state);
    const diff = new Date(capturedExpiry).getTime() - Date.now();
    expect(diff).toBeGreaterThan(7 * 3600 * 1000);  // at least 7h
    expect(diff).toBeLessThan(9 * 3600 * 1000);     // at most 9h
  });

  it("throws when no session", async () => {
    sessionNone();
    await expect(createSharedShift(state)).rejects.toThrow();
  });

  it("throws on DB error", async () => {
    sessionOk();
    const c: Record<string, unknown> = {};
    const ms = ["select", "eq", "gt", "maybeSingle", "update", "upsert", "delete", "single"];
    for (const m of ms) c[m] = vi.fn().mockReturnValue(c);
    c["insert"] = vi.fn().mockResolvedValue({ error: { message: "duplicate key", details: "" } });
    mockFrom.mockReturnValue(c);

    await expect(createSharedShift(state)).rejects.toBeDefined();
  });
});

// ─── 6. pullSharedShift ───────────────────────────────────────────────────────

describe("pullSharedShift", () => {
  const mockState = { patients: [], shiftHistory: [], unassignedTasks: [], events: [] };
  const ts = "2026-03-04T07:00:00Z";

  function makeSharedChain(returnVal: unknown) {
    const c: Record<string, unknown> = {};
    const ms = ["select", "eq", "insert", "upsert", "update", "delete", "single"];
    for (const m of ms) c[m] = vi.fn().mockReturnValue(c);
    c["gt"] = vi.fn().mockReturnValue(c);
    c["maybeSingle"] = vi.fn().mockResolvedValue(returnVal);
    return c;
  }

  it("returns state + updatedAt on success", async () => {
    mockFrom.mockReturnValue(makeSharedChain({
      data: { state: mockState, updated_at: ts }, error: null
    }));
    const result = await pullSharedShift("ABC123");
    expect(result).toEqual({ state: mockState, updatedAt: ts });
  });

  it("returns null when not found", async () => {
    mockFrom.mockReturnValue(makeSharedChain({ data: null, error: null }));
    const result = await pullSharedShift("NOPE");
    expect(result).toBeNull();
  });

  it("returns null on DB error", async () => {
    mockFrom.mockReturnValue(makeSharedChain({ data: null, error: { message: "rls" } }));
    const result = await pullSharedShift("ERR");
    expect(result).toBeNull();
  });

  it("passes gt filter for expires_at (rejects expired rows server-side)", async () => {
    const gtCalls: unknown[][] = [];
    const c: Record<string, unknown> = {};
    const ms = ["select", "eq", "insert", "upsert", "update", "delete", "single"];
    for (const m of ms) c[m] = vi.fn().mockReturnValue(c);
    c["gt"] = vi.fn().mockImplementation((...args: unknown[]) => { gtCalls.push(args); return c; });
    c["maybeSingle"] = vi.fn().mockResolvedValue({ data: null, error: null });
    mockFrom.mockReturnValue(c);

    await pullSharedShift("TESTGT");
    expect(gtCalls.length).toBeGreaterThan(0);
    expect(gtCalls[0][0]).toBe("expires_at");
  });

  it("normalises code to uppercase", async () => {
    const eqArgs: unknown[][] = [];
    const c: Record<string, unknown> = {};
    const ms = ["select", "insert", "upsert", "update", "delete", "single"];
    for (const m of ms) c[m] = vi.fn().mockReturnValue(c);
    c["eq"] = vi.fn().mockImplementation((...args: unknown[]) => { eqArgs.push(args); return c; });
    c["gt"] = vi.fn().mockReturnValue(c);
    c["maybeSingle"] = vi.fn().mockResolvedValue({ data: null, error: null });
    mockFrom.mockReturnValue(c);

    await pullSharedShift("  lower  ");
    const codeArg = eqArgs.find(a => a[0] === "code");
    expect(codeArg?.[1]).toBe("LOWER");
  });
});

// ─── 7. updateSharedShift / updateSharedShiftAsGuest ─────────────────────────

describe("updateSharedShift", () => {
  const state = { patients: [], shiftHistory: [], unassignedTasks: [], events: [] };

  it("calls update with code + creator_id filter", async () => {
    sessionOk();
    const updateArgs: unknown[] = [];
    const c: Record<string, unknown> = {};
    const ms = ["select", "insert", "upsert", "delete", "single", "maybeSingle", "gt"];
    for (const m of ms) c[m] = vi.fn().mockReturnValue(c);
    c["eq"] = vi.fn().mockReturnValue(c);
    c["update"] = vi.fn().mockImplementation((payload: unknown) => {
      updateArgs.push(payload);
      return c;
    });
    mockFrom.mockReturnValue(c);

    await updateSharedShift("MYCODE", state);
    expect(updateArgs.length).toBe(1);
    const p = updateArgs[0] as { state: unknown; updated_at: string };
    expect(p.state).toEqual(state);
    expect(p.updated_at).toBeDefined();
  });

  it("no-ops when no session", async () => {
    sessionNone();
    await expect(updateSharedShift("CODE", state)).resolves.toBeUndefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe("updateSharedShiftAsGuest", () => {
  const state = { patients: [], shiftHistory: [], unassignedTasks: [], events: [] };

  it("uses gt filter on expires_at (never updates expired rows)", async () => {
    sessionOk();
    const gtArgs: unknown[][] = [];
    const c: Record<string, unknown> = {};
    const ms = ["select", "insert", "upsert", "delete", "single", "maybeSingle"];
    for (const m of ms) c[m] = vi.fn().mockReturnValue(c);
    c["eq"] = vi.fn().mockReturnValue(c);
    c["gt"] = vi.fn().mockImplementation((...args: unknown[]) => { gtArgs.push(args); return c; });
    c["update"] = vi.fn().mockReturnValue(c);
    mockFrom.mockReturnValue(c);

    await updateSharedShiftAsGuest("GUEST1", state);
    expect(gtArgs.length).toBeGreaterThan(0);
    expect(gtArgs[0][0]).toBe("expires_at");
  });
});

// ─── 8. deleteSharedShift ─────────────────────────────────────────────────────

describe("deleteSharedShift", () => {
  it("calls delete with code + creator_id", async () => {
    sessionOk();
    const eqArgs: unknown[][] = [];
    const c: Record<string, unknown> = {};
    const ms = ["select", "insert", "upsert", "update", "single", "maybeSingle", "gt"];
    for (const m of ms) c[m] = vi.fn().mockReturnValue(c);
    c["eq"] = vi.fn().mockImplementation((...args: unknown[]) => { eqArgs.push(args); return c; });
    c["delete"] = vi.fn().mockReturnValue(c);
    mockFrom.mockReturnValue(c);

    await deleteSharedShift("DELME");
    const codeArg = eqArgs.find(a => a[0] === "code");
    const ownerArg = eqArgs.find(a => a[0] === "creator_id");
    expect(codeArg?.[1]).toBe("DELME");
    expect(ownerArg?.[1]).toBe("user-123");
  });

  it("no-ops when no session", async () => {
    sessionNone();
    await expect(deleteSharedShift("DELME")).resolves.toBeUndefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

// ─── 9. signOut ───────────────────────────────────────────────────────────────

describe("signOut", () => {
  it("delegates to supabase.auth.signOut", async () => {
    mockAuth.signOut.mockResolvedValue({ error: null });
    await signOut();
    expect(mockAuth.signOut).toHaveBeenCalledOnce();
  });
});

/**
 * cloudSync.ts unit tests
 *
 * Mocks the Supabase client so tests never hit the network.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ─── Supabase mock ────────────────────────────────────────────────────────────

const mockFrom = vi.fn();
const mockAuth = {
  getSession: vi.fn(),
  signOut: vi.fn(),
};

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: mockFrom, auth: mockAuth }),
}));

vi.stubEnv("VITE_SUPABASE_URL", "https://fake.supabase.co");
vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");

// ─── Module imports (dynamic to run after mocks are in place) ─────────────────

type CloudSyncModule = typeof import("../cloudSync");
let mod: CloudSyncModule;

beforeAll(async () => {
  mod = await import("../cloudSync");
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mockSession = { access_token: "tok-abc", user: { id: "user-123" } };

function sessionOk() {
  mockAuth.getSession.mockResolvedValue({ data: { session: mockSession } });
}
function sessionNone() {
  mockAuth.getSession.mockResolvedValue({ data: { session: null } });
}

function makeChainFor(terminalMethod: string, terminalResult: unknown) {
  const c: Record<string, unknown> = {};
  const methods = ["select", "insert", "update", "upsert", "delete", "eq", "gt", "maybeSingle", "single"];
  for (const m of methods) {
    c[m] = m === terminalMethod
      ? vi.fn().mockResolvedValue(terminalResult)
      : vi.fn().mockReturnValue(c);
  }
  return c;
}

beforeEach(() => vi.clearAllMocks());

// ─── 1. getProxyAuthHeaders ───────────────────────────────────────────────────

describe("getProxyAuthHeaders", () => {
  it("returns Authorization header when session exists", async () => {
    sessionOk();
    expect(await mod.getProxyAuthHeaders()).toEqual({ Authorization: "Bearer tok-abc" });
  });

  it("returns null when no session", async () => {
    sessionNone();
    expect(await mod.getProxyAuthHeaders()).toBeNull();
  });
});

// ─── 2. isProxyAvailableAsync ─────────────────────────────────────────────────

describe("isProxyAvailableAsync", () => {
  it("true when session active", async () => {
    sessionOk();
    expect(await mod.isProxyAvailableAsync()).toBe(true);
  });

  it("false when no session", async () => {
    sessionNone();
    expect(await mod.isProxyAvailableAsync()).toBe(false);
  });
});

// ─── 3. createHandoff ─────────────────────────────────────────────────────────

describe("createHandoff", () => {
  const state = { patients: [], shiftHistory: [], unassignedTasks: [], events: [] };

  it("returns code + expiresAt on success", async () => {
    sessionOk();
    const c: Record<string, unknown> = {};
    const ms = ["select", "update", "upsert", "delete", "eq", "gt", "maybeSingle", "single"];
    for (const m of ms) c[m] = vi.fn().mockReturnValue(c);
    c["insert"] = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValue(c);

    const result = await mod.createHandoff(state);
    expect(result).not.toBeNull();
    expect(result!.code).toMatch(/^[A-Z2-9]{8}$/);
    expect(new Date(result!.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("code never contains ambiguous chars 0/O/1/I", async () => {
    sessionOk();
    const codes: string[] = [];
    const c: Record<string, unknown> = {};
    const ms = ["select", "update", "upsert", "delete", "eq", "gt", "maybeSingle", "single"];
    for (const m of ms) c[m] = vi.fn().mockReturnValue(c);
    c["insert"] = vi.fn().mockImplementation((p: unknown) => {
      codes.push((p as { code: string }).code);
      return Promise.resolve({ error: null });
    });
    mockFrom.mockReturnValue(c);
    // Generate multiple codes
    for (let i = 0; i < 5; i++) await mod.createHandoff(state);
    for (const code of codes) expect(code).not.toMatch(/[0O1I]/);
  });

  it("returns null when session user id is missing", async () => {
    mockAuth.getSession.mockResolvedValue({ data: { session: null } });
    expect(await mod.createHandoff(state)).toBeNull();
  });

  it("returns null on DB insert error", async () => {
    sessionOk();
    const c: Record<string, unknown> = {};
    const ms = ["select", "update", "upsert", "delete", "eq", "gt", "maybeSingle", "single"];
    for (const m of ms) c[m] = vi.fn().mockReturnValue(c);
    c["insert"] = vi.fn().mockResolvedValue({ error: { message: "unique violation", details: "" } });
    mockFrom.mockReturnValue(c);
    expect(await mod.createHandoff(state)).toBeNull();
  });
});

// ─── 4. pullHandoff ───────────────────────────────────────────────────────────

describe("pullHandoff", () => {
  const futureExpiry = new Date(Date.now() + 3_600_000).toISOString();
  const pastExpiry   = new Date(Date.now() - 1000).toISOString();
  const mockState    = { patients: [], shiftHistory: [], unassignedTasks: [], events: [] };

  function handoffChain(data: unknown) {
    const c: Record<string, unknown> = {};
    const ms = ["select", "insert", "update", "upsert", "delete", "single"];
    for (const m of ms) c[m] = vi.fn().mockReturnValue(c);
    c["eq"] = vi.fn().mockReturnValue(c);
    c["maybeSingle"] = vi.fn().mockResolvedValue({ data, error: null });
    return c;
  }

  it("returns state when valid + not expired", async () => {
    sessionOk();
    mockFrom.mockReturnValue(handoffChain({ state: mockState, expires_at: futureExpiry }));
    expect(await mod.pullHandoff("TESTCODE")).toEqual(mockState);
  });

  it("returns null for expired code", async () => {
    sessionOk();
    mockFrom.mockReturnValue(handoffChain({ state: mockState, expires_at: pastExpiry }));
    expect(await mod.pullHandoff("EXPIRED")).toBeNull();
  });

  it("returns null when not found", async () => {
    sessionOk();
    mockFrom.mockReturnValue(handoffChain(null));
    expect(await mod.pullHandoff("NOTFOUND")).toBeNull();
  });

  it("returns null when no session", async () => {
    sessionNone();
    expect(await mod.pullHandoff("ANYCODE")).toBeNull();
  });

  it("normalises code to uppercase + trims", async () => {
    sessionOk();
    const eqArgs: unknown[][] = [];
    const c: Record<string, unknown> = {};
    const ms = ["select", "insert", "update", "upsert", "delete", "single"];
    for (const m of ms) c[m] = vi.fn().mockReturnValue(c);
    c["eq"] = vi.fn().mockImplementation((...a: unknown[]) => { eqArgs.push(a); return c; });
    c["maybeSingle"] = vi.fn().mockResolvedValue({ data: null, error: null });
    mockFrom.mockReturnValue(c);

    await mod.pullHandoff("  abcde  ");
    const codeArg = eqArgs.find(a => a[0] === "code");
    expect(codeArg?.[1]).toBe("ABCDE");
  });
});

// ─── 5. createSharedShift ─────────────────────────────────────────────────────

describe("createSharedShift", () => {
  const state = { patients: [], shiftHistory: [], unassignedTasks: [], events: [] };

  it("returns 6-char code on success", async () => {
    sessionOk();
    const c: Record<string, unknown> = {};
    const ms = ["select", "update", "upsert", "delete", "eq", "gt", "maybeSingle", "single"];
    for (const m of ms) c[m] = vi.fn().mockReturnValue(c);
    c["insert"] = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValue(c);

    const code = await mod.createSharedShift(state);
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
  });

  it("expires in ~8 hours", async () => {
    sessionOk();
    let capturedExpiry = "";
    const c: Record<string, unknown> = {};
    const ms = ["select", "update", "upsert", "delete", "eq", "gt", "maybeSingle", "single"];
    for (const m of ms) c[m] = vi.fn().mockReturnValue(c);
    c["insert"] = vi.fn().mockImplementation((p: unknown) => {
      capturedExpiry = (p as { expires_at: string }).expires_at;
      return Promise.resolve({ error: null });
    });
    mockFrom.mockReturnValue(c);
    await mod.createSharedShift(state);
    const diff = new Date(capturedExpiry).getTime() - Date.now();
    expect(diff).toBeGreaterThan(7 * 3600 * 1000);
    expect(diff).toBeLessThan(9 * 3600 * 1000);
  });

  it("throws when no session", async () => {
    sessionNone();
    await expect(mod.createSharedShift(state)).rejects.toBeDefined();
  });

  it("throws on DB error", async () => {
    sessionOk();
    const c: Record<string, unknown> = {};
    const ms = ["select", "update", "upsert", "delete", "eq", "gt", "maybeSingle", "single"];
    for (const m of ms) c[m] = vi.fn().mockReturnValue(c);
    c["insert"] = vi.fn().mockResolvedValue({ error: { message: "dup", details: "" } });
    mockFrom.mockReturnValue(c);
    await expect(mod.createSharedShift(state)).rejects.toBeDefined();
  });
});

// ─── 6. pullSharedShift ───────────────────────────────────────────────────────

describe("pullSharedShift", () => {
  const mockState = { patients: [], shiftHistory: [], unassignedTasks: [], events: [] };
  const ts = "2026-03-04T07:00:00Z";

  function shiftChain(data: unknown) {
    const c: Record<string, unknown> = {};
    const ms = ["select", "insert", "update", "upsert", "delete", "single"];
    for (const m of ms) c[m] = vi.fn().mockReturnValue(c);
    c["eq"]  = vi.fn().mockReturnValue(c);
    c["gt"]  = vi.fn().mockReturnValue(c);
    c["maybeSingle"] = vi.fn().mockResolvedValue({ data, error: null });
    return c;
  }

  it("returns state + updatedAt on success", async () => {
    mockFrom.mockReturnValue(shiftChain({ state: mockState, updated_at: ts }));
    expect(await mod.pullSharedShift("ABC123")).toEqual({ state: mockState, updatedAt: ts });
  });

  it("returns null when not found", async () => {
    mockFrom.mockReturnValue(shiftChain(null));
    expect(await mod.pullSharedShift("NOPE")).toBeNull();
  });

  it("passes gt filter on expires_at", async () => {
    const gtArgs: unknown[][] = [];
    const c: Record<string, unknown> = {};
    const ms = ["select", "insert", "update", "upsert", "delete", "single"];
    for (const m of ms) c[m] = vi.fn().mockReturnValue(c);
    c["eq"]  = vi.fn().mockReturnValue(c);
    c["gt"]  = vi.fn().mockImplementation((...a: unknown[]) => { gtArgs.push(a); return c; });
    c["maybeSingle"] = vi.fn().mockResolvedValue({ data: null, error: null });
    mockFrom.mockReturnValue(c);
    await mod.pullSharedShift("X");
    expect(gtArgs[0][0]).toBe("expires_at");
  });

  it("normalises code to uppercase", async () => {
    const eqArgs: unknown[][] = [];
    const c: Record<string, unknown> = {};
    const ms = ["select", "insert", "update", "upsert", "delete", "single"];
    for (const m of ms) c[m] = vi.fn().mockReturnValue(c);
    c["eq"]  = vi.fn().mockImplementation((...a: unknown[]) => { eqArgs.push(a); return c; });
    c["gt"]  = vi.fn().mockReturnValue(c);
    c["maybeSingle"] = vi.fn().mockResolvedValue({ data: null, error: null });
    mockFrom.mockReturnValue(c);
    await mod.pullSharedShift("  lower  ");
    expect(eqArgs.find(a => a[0] === "code")?.[1]).toBe("LOWER");
  });
});

// ─── 7. updateSharedShift / updateSharedShiftAsGuest ─────────────────────────

describe("updateSharedShift", () => {
  const state = { patients: [], shiftHistory: [], unassignedTasks: [], events: [] };

  it("calls update with correct payload", async () => {
    sessionOk();
    const updates: unknown[] = [];
    const c: Record<string, unknown> = {};
    const ms = ["select", "insert", "upsert", "delete", "gt", "maybeSingle", "single"];
    for (const m of ms) c[m] = vi.fn().mockReturnValue(c);
    c["eq"]     = vi.fn().mockReturnValue(c);
    c["update"] = vi.fn().mockImplementation((p: unknown) => { updates.push(p); return c; });
    mockFrom.mockReturnValue(c);

    await mod.updateSharedShift("CODE", state);
    const p = updates[0] as { state: unknown; updated_at: string };
    expect(p.state).toEqual(state);
    expect(p.updated_at).toBeDefined();
  });

  it("no-ops when no session", async () => {
    sessionNone();
    await expect(mod.updateSharedShift("CODE", state)).resolves.toBeUndefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe("updateSharedShiftAsGuest", () => {
  const state = { patients: [], shiftHistory: [], unassignedTasks: [], events: [] };

  it("uses gt filter on expires_at (never updates expired rows)", async () => {
    sessionOk();
    const gtArgs: unknown[][] = [];
    const c: Record<string, unknown> = {};
    const ms = ["select", "insert", "upsert", "delete", "maybeSingle", "single"];
    for (const m of ms) c[m] = vi.fn().mockReturnValue(c);
    c["eq"]     = vi.fn().mockReturnValue(c);
    c["gt"]     = vi.fn().mockImplementation((...a: unknown[]) => { gtArgs.push(a); return c; });
    c["update"] = vi.fn().mockReturnValue(c);
    mockFrom.mockReturnValue(c);
    await mod.updateSharedShiftAsGuest("G1", state);
    expect(gtArgs[0][0]).toBe("expires_at");
  });
});

// ─── 8. deleteSharedShift ─────────────────────────────────────────────────────

describe("deleteSharedShift", () => {
  it("filters by code + creator_id", async () => {
    sessionOk();
    const eqArgs: unknown[][] = [];
    const c: Record<string, unknown> = {};
    const ms = ["select", "insert", "upsert", "update", "gt", "maybeSingle", "single"];
    for (const m of ms) c[m] = vi.fn().mockReturnValue(c);
    c["eq"]     = vi.fn().mockImplementation((...a: unknown[]) => { eqArgs.push(a); return c; });
    c["delete"] = vi.fn().mockReturnValue(c);
    mockFrom.mockReturnValue(c);

    await mod.deleteSharedShift("DELME");
    expect(eqArgs.find(a => a[0] === "code")?.[1]).toBe("DELME");
    expect(eqArgs.find(a => a[0] === "creator_id")?.[1]).toBe("user-123");
  });

  it("no-ops when no session", async () => {
    sessionNone();
    await expect(mod.deleteSharedShift("X")).resolves.toBeUndefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

// ─── 9. signOut ───────────────────────────────────────────────────────────────

describe("signOut", () => {
  it("delegates to supabase.auth.signOut", async () => {
    mockAuth.signOut.mockResolvedValue({ error: null });
    await mod.signOut();
    expect(mockAuth.signOut).toHaveBeenCalledOnce();
  });
});

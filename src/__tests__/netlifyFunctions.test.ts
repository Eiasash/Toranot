/**
 * Netlify Functions — _utils.ts tests.
 *
 * Tests the shared serverless utilities:
 *   - checkBodySize: Content-Length validation
 *   - validateMessages: Claude API message validation
 *   - clampInt: Number clamping
 *   - safeContentType: Content-type whitelist
 *   - checkAuth: Auth header validation
 *   - checkRateLimit: Rate limiting via Upstash Redis
 *   - fetchWithTimeout: timeout wrapper (basic shape)
 *
 * Mocks:
 *   - Netlify.env.get() — Netlify-specific global
 *   - global.fetch — for auth and rate limit calls
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mock Netlify global ─────────��───────────────────────────────────────────
// Netlify functions use `Netlify.env.get()` instead of process.env

let envStore: Record<string, string> = {};

const NetlifyMock = {
  env: {
    get: (key: string) => envStore[key] ?? undefined,
  },
};

// Install the global before importing the module
(globalThis as any).Netlify = NetlifyMock;

// Now import the utilities — they will see the global Netlify mock
import {
  checkBodySize,
  validateMessages,
  clampInt,
  safeContentType,
  checkAuth,
  checkRateLimit,
  MAX_BODY_BYTES,
} from "../../netlify/functions/_utils";

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  envStore = {};
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Helper ────────���──────────────────────────────────────────────────────────

function makeRequest(overrides: {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
} = {}): Request {
  const headers = new Headers(overrides.headers ?? {});
  return new Request("https://example.com/api/test", {
    method: overrides.method ?? "POST",
    headers,
    body: overrides.method === "GET" ? undefined : (overrides.body ?? "{}"),
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// checkBodySize
// ���═════════════════════��══════════════════════════════���═══════════════════════

describe("checkBodySize", () => {
  it("returns null when Content-Length is within limit", () => {
    const req = makeRequest({ headers: { "content-length": "1000" } });
    expect(checkBodySize(req)).toBeNull();
  });

  it("returns null when Content-Length is absent (chunked)", () => {
    const req = makeRequest({ headers: {} });
    expect(checkBodySize(req)).toBeNull();
  });

  it("returns 413 when Content-Length exceeds MAX_BODY_BYTES", () => {
    const req = makeRequest({
      headers: { "content-length": String(MAX_BODY_BYTES + 1) },
    });
    const res = checkBodySize(req);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(413);
  });

  it("returns null at exactly MAX_BODY_BYTES", () => {
    const req = makeRequest({
      headers: { "content-length": String(MAX_BODY_BYTES) },
    });
    expect(checkBodySize(req)).toBeNull();
  });
});

// ��═══════════════════════���═════════════════════��══════════════════════════════
// validateMessages
// ════════���════════════════════════════════════════���═════════════════════════���═

describe("validateMessages", () => {
  it("accepts valid user message with string content", () => {
    const result = validateMessages([
      { role: "user", content: "Hello" },
    ]);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    expect(result![0].role).toBe("user");
    expect(result![0].content).toBe("Hello");
  });

  it("accepts valid assistant message", () => {
    const result = validateMessages([
      { role: "assistant", content: "I can help." },
    ]);
    expect(result).not.toBeNull();
    expect(result![0].role).toBe("assistant");
  });

  it("accepts multi-turn conversation", () => {
    const result = validateMessages([
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello" },
      { role: "user", content: "Help me" },
    ]);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(3);
  });

  it("rejects message with invalid role", () => {
    const result = validateMessages([
      { role: "system", content: "Not allowed" },
    ]);
    expect(result).toBeNull();
  });

  it("rejects message with missing role", () => {
    const result = validateMessages([{ content: "No role" }]);
    expect(result).toBeNull();
  });

  it("rejects non-object message", () => {
    const result = validateMessages(["just a string"]);
    expect(result).toBeNull();
  });

  it("rejects null message", () => {
    const result = validateMessages([null]);
    expect(result).toBeNull();
  });

  it("accepts text content block", () => {
    const result = validateMessages([
      { role: "user", content: [{ type: "text", text: "Hello" }] },
    ]);
    expect(result).not.toBeNull();
    const content = result![0].content;
    expect(Array.isArray(content)).toBe(true);
  });

  it("accepts image content block with valid media type", () => {
    const result = validateMessages([
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/jpeg",
              data: "abc123",
            },
          },
        ],
      },
    ]);
    expect(result).not.toBeNull();
  });

  it("rejects image content block with invalid media type", () => {
    const result = validateMessages([
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/svg+xml",
              data: "abc123",
            },
          },
        ],
      },
    ]);
    expect(result).toBeNull();
  });

  it("accepts document content block (PDF)", () => {
    const result = validateMessages([
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: "abc123",
            },
          },
        ],
      },
    ]);
    expect(result).not.toBeNull();
  });

  it("rejects document content block with non-PDF type", () => {
    const result = validateMessages([
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "text/html",
              data: "abc123",
            },
          },
        ],
      },
    ]);
    expect(result).toBeNull();
  });

  it("rejects unknown content block type", () => {
    const result = validateMessages([
      {
        role: "user",
        content: [{ type: "video", url: "https://example.com" }],
      },
    ]);
    expect(result).toBeNull();
  });

  it("strips unknown keys from messages (only keeps role + content)", () => {
    const result = validateMessages([
      { role: "user", content: "Hello", extra: "should be removed" },
    ]);
    expect(result).not.toBeNull();
    expect((result![0] as any).extra).toBeUndefined();
  });
});

// ════════════════════���═════════════════════════════════���══════════════════════
// clampInt
// ════════════════════════════���════════════════════════════════════════════════

describe("clampInt", () => {
  it("returns the value when within range", () => {
    expect(clampInt(500, 100, 0, 1000)).toBe(500);
  });

  it("clamps to min when value is below", () => {
    expect(clampInt(-5, 100, 0, 1000)).toBe(0);
  });

  it("clamps to max when value is above", () => {
    expect(clampInt(9999, 100, 0, 1000)).toBe(1000);
  });

  it("returns default for NaN", () => {
    expect(clampInt("not a number", 42, 0, 100)).toBe(42);
  });

  it("returns default for undefined", () => {
    expect(clampInt(undefined, 42, 0, 100)).toBe(42);
  });

  it("clamps null to min (Number(null) === 0)", () => {
    // Number(null) === 0, which is finite, so it clamps to max(0, min(100, 0)) = 0
    expect(clampInt(null, 42, 0, 100)).toBe(0);
  });

  it("floors floating point values", () => {
    expect(clampInt(7.9, 0, 0, 100)).toBe(7);
  });

  it("returns default for Infinity", () => {
    expect(clampInt(Infinity, 42, 0, 100)).toBe(42);
  });
});

// ════════════════════════���════════════════════════════════���═══════════════════
// safeContentType
// ═══════��═════════════════════════════════════════════════════════════════════

describe("safeContentType", () => {
  it("allows application/json", () => {
    const upstream = new Response("{}", {
      headers: { "content-type": "application/json" },
    });
    expect(safeContentType(upstream)).toBe("application/json");
  });

  it("allows application/json with charset", () => {
    const upstream = new Response("{}", {
      headers: { "content-type": "application/json; charset=utf-8" },
    });
    expect(safeContentType(upstream)).toContain("application/json");
  });

  it("allows text/plain", () => {
    const upstream = new Response("ok", {
      headers: { "content-type": "text/plain" },
    });
    expect(safeContentType(upstream)).toBe("text/plain");
  });

  it("rejects text/html (returns application/json fallback)", () => {
    const upstream = new Response("<html>", {
      headers: { "content-type": "text/html" },
    });
    expect(safeContentType(upstream)).toBe("application/json");
  });

  it("rejects multipart/form-data", () => {
    const upstream = new Response("", {
      headers: { "content-type": "multipart/form-data" },
    });
    expect(safeContentType(upstream)).toBe("application/json");
  });

  it("returns text/plain for Response with default text/plain content-type", () => {
    // new Response("") in Node sets content-type to text/plain;charset=utf-8
    const upstream = new Response("");
    const ct = safeContentType(upstream);
    // text/plain is in the safe whitelist
    expect(ct).toContain("text/plain");
  });

  it("returns application/json for response with unsafe content-type", () => {
    const upstream = new Response("", {
      headers: { "content-type": "application/xml" },
    });
    expect(safeContentType(upstream)).toBe("application/json");
  });
});

// ═════��════════════════════════════════════════════════════���══════════════════
// checkAuth
// ═════════════════════════════════════════════════��═══════════════════════════

describe("checkAuth", () => {
  it("allows request with matching API_SECRET", async () => {
    envStore["API_SECRET"] = "test-secret-123";
    const req = makeRequest({
      headers: { "x-api-secret": "test-secret-123" },
    });
    const result = await checkAuth(req);
    expect(result).toBeNull(); // null means auth passed
  });

  it("rejects request with wrong API_SECRET", async () => {
    envStore["API_SECRET"] = "correct-secret";
    const req = makeRequest({
      headers: { "x-api-secret": "wrong-secret" },
    });
    const result = await checkAuth(req);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  it("returns 503 when neither Supabase nor API_SECRET configured", async () => {
    // No env vars set
    const req = makeRequest();
    const result = await checkAuth(req);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(503);
  });

  it("requires Bearer token when Supabase URL is configured", async () => {
    envStore["VITE_SUPABASE_URL"] = "https://test.supabase.co";
    envStore["VITE_SUPABASE_ANON_KEY"] = "test-anon-key";
    const req = makeRequest(); // no Authorization header
    const result = await checkAuth(req);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  it("API_SECRET fast path takes priority over Supabase", async () => {
    envStore["API_SECRET"] = "secret";
    envStore["VITE_SUPABASE_URL"] = "https://test.supabase.co";
    envStore["VITE_SUPABASE_ANON_KEY"] = "test-anon-key";
    const req = makeRequest({
      headers: { "x-api-secret": "secret" },
    });
    const result = await checkAuth(req);
    expect(result).toBeNull(); // passes via fast path
  });

  it("verifies JWT token via Supabase /auth/v1/user", async () => {
    envStore["VITE_SUPABASE_URL"] = "https://test.supabase.co";
    envStore["VITE_SUPABASE_ANON_KEY"] = "test-anon-key";

    const fetchMock = vi.fn().mockResolvedValue(
      new Response("{}", { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const req = makeRequest({
      headers: { authorization: "Bearer valid-jwt-token" },
    });
    const result = await checkAuth(req);
    expect(result).toBeNull(); // authenticated
    expect(fetchMock).toHaveBeenCalledWith(
      "https://test.supabase.co/auth/v1/user",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer valid-jwt-token",
          apikey: "test-anon-key",
        }),
      })
    );
  });

  it("returns 401 when Supabase returns 401", async () => {
    envStore["VITE_SUPABASE_URL"] = "https://test.supabase.co";
    envStore["VITE_SUPABASE_ANON_KEY"] = "test-anon-key";

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response("Unauthorized", { status: 401 })
    ));

    const req = makeRequest({
      headers: { authorization: "Bearer expired-token" },
    });
    const result = await checkAuth(req);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  it("falls back to API_SECRET on Supabase 500 error", async () => {
    envStore["VITE_SUPABASE_URL"] = "https://test.supabase.co";
    envStore["VITE_SUPABASE_ANON_KEY"] = "test-anon-key";
    envStore["API_SECRET"] = "backup-secret";

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response("Server Error", { status: 500 })
    ));

    const req = makeRequest({
      headers: {
        authorization: "Bearer some-token",
        "x-api-secret": "backup-secret",
      },
    });
    const result = await checkAuth(req);
    expect(result).toBeNull(); // falls back to API_SECRET
  });

  it("returns 503 on Supabase 500 without API_SECRET fallback", async () => {
    envStore["VITE_SUPABASE_URL"] = "https://test.supabase.co";
    envStore["VITE_SUPABASE_ANON_KEY"] = "test-anon-key";

    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response("Server Error", { status: 500 })
    ));

    const req = makeRequest({
      headers: { authorization: "Bearer some-token" },
    });
    const result = await checkAuth(req);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(503);
    spy.mockRestore();
  });

  it("returns 503 on Supabase network timeout without API_SECRET fallback", async () => {
    envStore["VITE_SUPABASE_URL"] = "https://test.supabase.co";
    envStore["VITE_SUPABASE_ANON_KEY"] = "test-anon-key";

    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));

    const req = makeRequest({
      headers: { authorization: "Bearer some-token" },
    });
    const result = await checkAuth(req);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(503);
    spy.mockRestore();
  });
});

// ════════��═════════════════════════════���══════════════════════════════════════
// checkRateLimit
// ═════════════════��════════════════════════════════════���══════════════════════

describe("checkRateLimit", () => {
  it("returns null (skip) when Upstash not configured", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const req = makeRequest();
    const result = await checkRateLimit(req);
    expect(result).toBeNull();
    spy.mockRestore();
  });

  it("allows request under limit", async () => {
    envStore["UPSTASH_REDIS_REST_URL"] = "https://redis.upstash.io";
    envStore["UPSTASH_REDIS_REST_TOKEN"] = "test-token";

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ result: 5 }, {}]), { status: 200 })
    ));

    const req = makeRequest({
      headers: { "x-nf-client-connection-ip": "1.2.3.4" },
    });
    const result = await checkRateLimit(req, "ai");
    expect(result).toBeNull(); // under limit (5 < 30)
  });

  it("returns 429 when over AI limit (30/min)", async () => {
    envStore["UPSTASH_REDIS_REST_URL"] = "https://redis.upstash.io";
    envStore["UPSTASH_REDIS_REST_TOKEN"] = "test-token";

    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ result: 31 }, {}]), { status: 200 })
    ));

    const req = makeRequest({
      headers: { "x-nf-client-connection-ip": "1.2.3.4" },
    });
    const result = await checkRateLimit(req, "ai");
    expect(result).not.toBeNull();
    expect(result!.status).toBe(429);
    spy.mockRestore();
  });

  it("returns 429 when over OCR limit (10/min)", async () => {
    envStore["UPSTASH_REDIS_REST_URL"] = "https://redis.upstash.io";
    envStore["UPSTASH_REDIS_REST_TOKEN"] = "test-token";

    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ result: 11 }, {}]), { status: 200 })
    ));

    const req = makeRequest({
      headers: { "x-nf-client-connection-ip": "1.2.3.4" },
    });
    const result = await checkRateLimit(req, "ocr");
    expect(result).not.toBeNull();
    expect(result!.status).toBe(429);
    spy.mockRestore();
  });

  it("includes Retry-After header on 429", async () => {
    envStore["UPSTASH_REDIS_REST_URL"] = "https://redis.upstash.io";
    envStore["UPSTASH_REDIS_REST_TOKEN"] = "test-token";

    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ result: 50 }, {}]), { status: 200 })
    ));

    const req = makeRequest();
    const result = await checkRateLimit(req, "ai");
    expect(result).not.toBeNull();
    expect(result!.headers.get("Retry-After")).toBe("60");
    expect(result!.headers.get("X-RateLimit-Remaining")).toBe("0");
    spy.mockRestore();
  });

  it("fails open when Upstash returns error", async () => {
    envStore["UPSTASH_REDIS_REST_URL"] = "https://redis.upstash.io";
    envStore["UPSTASH_REDIS_REST_TOKEN"] = "test-token";

    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response("Server Error", { status: 500 })
    ));

    const req = makeRequest();
    const result = await checkRateLimit(req, "ai");
    expect(result).toBeNull(); // fail-open
    spy.mockRestore();
  });

  it("fails open when Upstash is unreachable (network error)", async () => {
    envStore["UPSTASH_REDIS_REST_URL"] = "https://redis.upstash.io";
    envStore["UPSTASH_REDIS_REST_TOKEN"] = "test-token";

    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    const req = makeRequest();
    const result = await checkRateLimit(req, "ai");
    expect(result).toBeNull(); // fail-open
    spy.mockRestore();
  });

  it("uses x-nf-client-connection-ip for IP extraction", async () => {
    envStore["UPSTASH_REDIS_REST_URL"] = "https://redis.upstash.io";
    envStore["UPSTASH_REDIS_REST_TOKEN"] = "test-token";

    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ result: 1 }, {}]), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchSpy);

    const req = makeRequest({
      headers: { "x-nf-client-connection-ip": "10.0.0.1" },
    });
    await checkRateLimit(req, "ai");

    // Verify the Redis key includes the IP
    const callBody = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(callBody[0][1]).toContain("10.0.0.1");
  });
});

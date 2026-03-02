/**
 * Shared utilities for Netlify serverless functions.
 * Prefixed with _ so Netlify does not treat this as a function endpoint.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

export const MAX_BODY_BYTES = 5_000_000; // 5MB — supports base64-encoded admission letter files
export const UPSTREAM_TIMEOUT_MS = 9_000;

// ─── Auth ─────────────────────────────────────────────────────────────────────

/**
 * Validates the x-api-secret header against the API_SECRET env var.
 * Returns a 401 Response if invalid, null if valid.
 *
 * Callers: if (authError) return authError;
 */
export function checkAuth(req: Request): Response | null {
  const secret = Netlify.env.get("API_SECRET");
  if (!secret) {
    console.error("[auth] API_SECRET env var is not set — all requests blocked");
    return new Response("Service misconfigured", { status: 503 });
  }
  if (req.headers.get("x-api-secret") !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}

// ─── Request validation ───────────────────────────────────────────────────────

/**
 * Rejects requests whose Content-Length exceeds MAX_BODY_BYTES.
 * Note: Content-Length can be absent on chunked transfers — parse-time
 * guards in each function cover that path.
 */
export function checkBodySize(req: Request): Response | null {
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return new Response("Payload too large", { status: 413 });
  }
  return null;
}

// Content block types forwarded to Claude upstream
type TextBlock = { type: "text"; text: string };
type ImageBlock = { type: "image"; source: { type: "base64"; media_type: string; data: string } };
type DocumentBlock = { type: "document"; source: { type: "base64"; media_type: string; data: string } };
type ContentBlock = TextBlock | ImageBlock | DocumentBlock;
type ClaudeMessage = { role: "user" | "assistant"; content: string | ContentBlock[] };

/**
 * Validates that each message in an array has the expected shape.
 * Supports both plain string content and rich content block arrays
 * (text, image, document) for file-based requests (admission letters etc).
 * Strips unknown keys — never forward raw caller input to upstream APIs.
 */
export function validateMessages(
  messages: unknown[]
): ClaudeMessage[] | null {
  const valid: ClaudeMessage[] = [];
  for (const m of messages) {
    if (typeof m !== "object" || m === null) return null;
    const { role, content } = m as Record<string, unknown>;
    if (role !== "user" && role !== "assistant") return null;

    if (typeof content === "string") {
      valid.push({ role, content });
    } else if (Array.isArray(content)) {
      // Validate each content block
      const blocks: ContentBlock[] = [];
      for (const block of content) {
        if (typeof block !== "object" || block === null) return null;
        const b = block as Record<string, unknown>;
        if (b.type === "text") {
          if (typeof b.text !== "string") return null;
          blocks.push({ type: "text", text: b.text });
        } else if (b.type === "image") {
          const src = b.source as Record<string, unknown>;
          if (!src || src.type !== "base64") return null;
          if (typeof src.media_type !== "string" || typeof src.data !== "string") return null;
          const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
          if (!allowed.includes(src.media_type)) return null;
          blocks.push({ type: "image", source: { type: "base64", media_type: src.media_type, data: src.data } });
        } else if (b.type === "document") {
          const src = b.source as Record<string, unknown>;
          if (!src || src.type !== "base64") return null;
          if (typeof src.media_type !== "string" || typeof src.data !== "string") return null;
          if (src.media_type !== "application/pdf") return null;
          blocks.push({ type: "document", source: { type: "base64", media_type: src.media_type, data: src.data } });
        } else {
          return null; // unknown block type — reject
        }
      }
      valid.push({ role, content: blocks });
    } else {
      return null;
    }
  }
  return valid;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function clampInt(value: unknown, def: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

/**
 * fetch() wrapper with an AbortController deadline.
 * Throws on timeout — callers should catch and return 504.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = UPSTREAM_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Logs upstream errors server-side without leaking details to the caller.
 */
export function logUpstreamError(service: string, status: number, body: string): void {
  console.error(`[${service}] upstream ${status}:`, body.slice(0, 500));
}

// ─── Rate limiting (Upstash Redis) ───────────────────────────────────────────

/**
 * Sliding-window rate limiter via Upstash Redis REST API.
 * No SDK required — plain HTTP.
 *
 * Limits per endpoint type:
 *   ai:  30 requests / minute / IP  (claude, gemini)
 *   ocr: 10 requests / minute / IP  (OCR — expensive, slow)
 *
 * Degrades gracefully: if Upstash is not configured or unreachable,
 * the request is ALLOWED (fail-open) with a console warning.
 * This prevents Upstash outages from taking down the app.
 *
 * Usage:
 *   const limitError = await checkRateLimit(req, "ai");
 *   if (limitError) return limitError;
 */
export async function checkRateLimit(
  req: Request,
  tier: "ai" | "ocr" = "ai"
): Promise<Response | null> {
  const url   = Netlify.env.get("UPSTASH_REDIS_REST_URL");
  const token = Netlify.env.get("UPSTASH_REDIS_REST_TOKEN");

  if (!url || !token) {
    console.warn("[rate-limit] Upstash not configured — skipping rate limit");
    return null; // fail-open
  }

  // Extract client IP — Netlify sets x-nf-client-connection-ip
  const ip =
    req.headers.get("x-nf-client-connection-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    "unknown";

  const limits = { ai: 30, ocr: 10 } as const;
  const limit  = limits[tier];

  // Sliding window: bucket per IP per minute
  const window = Math.floor(Date.now() / 60_000);
  const key    = `rl:${tier}:${ip}:${window}`;

  try {
    // INCR + EXPIRE in a single pipeline call to Upstash REST API
    const res = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", key],
        ["EXPIRE", key, 90], // 90s TTL — covers current + next window
      ]),
      signal: AbortSignal.timeout(1500), // 1.5s max — never block the request long
    });

    if (!res.ok) {
      console.warn(`[rate-limit] Upstash error ${res.status} — failing open`);
      return null;
    }

    const data = (await res.json()) as [{ result: number }, unknown];
    const count = data[0]?.result ?? 0;

    if (count > limit) {
      console.warn(`[rate-limit] ${tier} IP=${ip} count=${count}/${limit} — throttled`);
      return new Response("Too Many Requests", {
        status: 429,
        headers: {
          "Retry-After": "60",
          "X-RateLimit-Limit": String(limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String((window + 1) * 60),
        },
      });
    }

    return null; // under limit — allow
  } catch (err) {
    console.warn("[rate-limit] Upstash unreachable — failing open:", err);
    return null; // fail-open on network error
  }
}

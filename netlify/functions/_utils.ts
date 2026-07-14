/**
 * Shared utilities for Netlify serverless functions.
 * Prefixed with _ so Netlify does not treat this as a function endpoint.
 */

declare const Netlify: {
  env: { get(key: string): string | undefined }
};

// ─── Constants ────────────────────────────────────────────────────────────────

export const MAX_BODY_BYTES = 5_000_000; // 5MB — supports base64-encoded admission letter files
export const UPSTREAM_TIMEOUT_MS = 24_000;       // 9 → 20 → 24s — Sonnet 4.6 on Hebrew board MCQ generation regularly hits 18-22s
export const UPSTREAM_TIMEOUT_LONG_MS = 25_000;  // file/vision/long-generation — 1s buffer before Netlify's 26s function timeout

// ─── Auth ─────────────────────────────────────────────────────────────────────

// ─── Auth — Supabase JWT verification ────────────────────────────────────────
//
// Replaces the shared VITE_API_SECRET / x-api-secret approach.
// The client sends the Supabase session JWT as "Authorization: Bearer <token>".
// We verify it by calling Supabase's /auth/v1/user endpoint — no external
// package needed, no shared secret baked into the client bundle.
//
// Requirements (already in Netlify env vars):
//   VITE_SUPABASE_URL     — project URL  e.g. https://xxxx.supabase.co
//   VITE_SUPABASE_ANON_KEY — anon key (public, required for apikey header)
//
// Falls back to legacy x-api-secret if VITE_SUPABASE_URL is not set,
// so local dev without Supabase continues to work.

function matchesSecret(reqSecret: string | null, envSecret: string | undefined): boolean {
  if (!reqSecret || !envSecret) return false;
  return envSecret.split(",").some(s => s.trim() === reqSecret);
}

export async function checkAuth(req: Request): Promise<Response | null> {
  // ── Fast path: API_SECRET — supports comma-separated values for multiple apps ──
  const secret = Netlify.env.get("API_SECRET");
  if (matchesSecret(req.headers.get("x-api-secret"), secret)) return null;

  const supabaseUrl  = Netlify.env.get("VITE_SUPABASE_URL");
  const supabaseAnon = Netlify.env.get("VITE_SUPABASE_ANON_KEY");

  // ── Path 1: Supabase JWT (production) ──────────────────────────────────
  if (supabaseUrl && supabaseAnon) {
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      return new Response("Unauthorized — no session or API secret", { status: 401 });
    }

    try {
      const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: {
          "Authorization": `Bearer ${token}`,
          "apikey": supabaseAnon,
        },
        signal: AbortSignal.timeout(3000),
      });

      if (res.ok) return null; // authenticated

      if (res.status === 401 || res.status === 403) {
        return new Response("Unauthorized — invalid or expired session", { status: 401 });
      }

      // Supabase returned unexpected error — require API_SECRET fallback instead of failing open
      console.warn("[auth] Supabase /auth/v1/user returned", res.status, "— checking API_SECRET fallback");
      if (matchesSecret(req.headers.get("x-api-secret"), Netlify.env.get("API_SECRET"))) return null;
      return new Response("Authentication service unavailable", { status: 503 });

    } catch (err) {
      // Network timeout reaching Supabase — require API_SECRET fallback instead of failing open
      console.warn("[auth] Supabase JWT verification timed out — checking API_SECRET fallback:", err);
      if (matchesSecret(req.headers.get("x-api-secret"), Netlify.env.get("API_SECRET"))) return null;
      return new Response("Authentication service unavailable", { status: 503 });
    }
  }

  // ── Path 2: No Supabase, no API_SECRET matched above ──
  if (!secret) {
    console.error("[auth] Neither VITE_SUPABASE_URL nor API_SECRET configured");
    return new Response("Service misconfigured", { status: 503 });
  }
  // API_SECRET exists but wasn't matched (wrong value sent by client)
  return new Response("Unauthorized", { status: 401 });
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

/** Whitelist safe response content-types — prevents forwarding unexpected types from upstream */
const SAFE_CONTENT_TYPES = ["application/json", "text/plain"];
export function safeContentType(upstream: Response): string {
  const ct = upstream.headers.get("content-type")?.toLowerCase().trim() ?? "";
  for (const safe of SAFE_CONTENT_TYPES) {
    if (ct.startsWith(safe)) return ct;
  }
  return "application/json";
}

// ─── Rate limiting (Upstash Redis) ───────────────────────────────────────────

/**
 * Fixed-window rate limiter via Upstash Redis REST API.
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
function clampEnvInt(name: string, def: number): number {
  const v = Number(Netlify.env.get(name));
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : def;
}

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

  // Extract client IP — only trust Netlify's own header (x-forwarded-for is spoofable)
  const ip =
    req.headers.get("x-nf-client-connection-ip") ??
    "unknown";

  // Layered caps (all env-tunable): per-IP/minute for interactive bursts, and a
  // per-IP/day hard cap that bounds sustained abuse of the shared proxy secret
  // (which ships in client bundles) WITHOUT enabling a global DoS — each IP is
  // limited independently. A global/day counter is ALERT-ONLY (never blocks), so
  // an attacker cannot weaponize it to deny service to the clinical apps.
  const perMin      = tier === "ai" ? clampEnvInt("RL_AI_PER_MIN", 30)          : clampEnvInt("RL_OCR_PER_MIN", 10);
  const perDay      = tier === "ai" ? clampEnvInt("RL_AI_PER_DAY", 2000)        : clampEnvInt("RL_OCR_PER_DAY", 300);
  const globalAlert = tier === "ai" ? clampEnvInt("RL_AI_GLOBAL_DAY_ALERT", 5000) : clampEnvInt("RL_OCR_GLOBAL_DAY_ALERT", 800);

  const minWindow = Math.floor(Date.now() / 60_000);
  const dayWindow = Math.floor(Date.now() / 86_400_000);
  const minKey    = `rl:${tier}:${ip}:${minWindow}`;
  const dayKey    = `rl:${tier}:d:${ip}:${dayWindow}`;
  const gKey      = `rl:${tier}:global:${dayWindow}`;

  try {
    // INCR + EXPIRE the minute, per-IP-day, and global-day counters in one pipeline.
    const res = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", minKey], ["EXPIRE", minKey, 90],       // covers current + next minute window
        ["INCR", dayKey], ["EXPIRE", dayKey, 90_000],   // ~25h — day window
        ["INCR", gKey],   ["EXPIRE", gKey, 90_000],
      ]),
      signal: AbortSignal.timeout(1500), // 1.5s max — never block the request long
    });

    if (!res.ok) {
      console.warn(`[rate-limit] Upstash error ${res.status} — failing open`);
      return null;
    }

    const data = (await res.json()) as Array<{ result: number }>;
    const minCount = data[0]?.result ?? 0;
    const dayCount = data[2]?.result ?? 0;
    const gCount   = data[4]?.result ?? 0;

    // Abuse monitoring — global spike ALERT only (does NOT throttle; avoids DoS on clinical apps).
    if (gCount === globalAlert || gCount === globalAlert * 2 || gCount === globalAlert * 5) {
      console.error(`[rate-limit][ALERT] ${tier} GLOBAL daily count=${gCount} crossed ${globalAlert} — possible shared-secret abuse; review Upstash / rotate the proxy secret`);
    }

    const over =
      minCount > perMin ? { scope: "min", count: minCount, limit: perMin, retry: "60",   reset: (minWindow + 1) * 60 } :
      dayCount > perDay ? { scope: "day", count: dayCount, limit: perDay, retry: "3600", reset: (dayWindow + 1) * 86_400 } :
      null;

    if (over) {
      console.warn(`[rate-limit] ${tier} IP=${ip} ${over.scope} count=${over.count}/${over.limit} — throttled`);
      return new Response("Too Many Requests", {
        status: 429,
        headers: {
          "Retry-After": over.retry,
          "X-RateLimit-Limit": String(over.limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(over.reset),
        },
      });
    }

    return null; // under all limits — allow
  } catch (err) {
    console.warn("[rate-limit] Upstash unreachable — failing open:", err);
    return null; // fail-open on network error
  }
}

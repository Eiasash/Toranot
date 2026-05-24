/**
 * ROLLBACK PAIR — DO NOT DELETE in isolation.
 * This file is the edge-function half of the /api/claude rollback architecture.
 * Standard-function half: netlify/functions/claude.ts
 * See PR #103 (silent-404 routing fix) and audit-fix-deploy SKILL.md HARD CONSTRAINTS section.
 * Deleting one without rotating the other breaks the rollback path.
 */
/**
 * Claude proxy — Netlify Edge Function (Deno runtime).
 *
 * Replaces the synchronous Netlify Function at `/api/claude` (which lives at
 * `netlify/functions/claude.ts`) with an edge-runtime version that:
 *
 *   1. Has no 26s synchronous-function timeout — generation prompts that used
 *      to 504 (Hebrew board MCQ generation, long chapter summaries, open-ended
 *      chat) now run to completion.
 *   2. Supports streaming responses end-to-end. When the client sends
 *      `stream: true`, we forward `stream: true` to Anthropic and pipe the
 *      SSE response straight through. The connection stays alive for the
 *      whole generation; first byte arrives in <2s.
 *   3. Cold-starts in ~10ms instead of the 1-3s of Lambda functions.
 *
 * Backwards compat: callers that DON'T send `stream: true` continue to get
 * a single buffered JSON response, identical to the old Function. The old
 * Function file remains in `netlify/functions/claude.ts` as a fallback —
 * but Netlify's edge-functions config in netlify.toml gives this edge
 * function priority for `/api/claude`.
 *
 * Auth, body-size, rate-limit, and message-validation logic are reused
 * verbatim from `../functions/_utils.ts` — that file uses only standard
 * Web APIs (fetch, Request, Response, AbortSignal) and the `Netlify.env`
 * global, all of which work identically in the Deno edge runtime.
 */

import type { Context, Config } from "@netlify/edge-functions";
import {
  checkAuth,
  checkBodySize,
  checkRateLimit,
  clampInt,
  validateMessages,
  logUpstreamError,
  safeContentType,
} from "../functions/_utils.ts";

// ─── Model normalization (mirror of functions/claude.ts) ────────────────────

const ALLOWED_MODELS = new Set([
  "claude-sonnet-4-6",
  "claude-opus-4-6",
  "claude-opus-4-7",
  "claude-haiku-4-5-20251001",
]);

function normalizeClaudeModel(input: unknown): string | null {
  const raw = String(input ?? "").trim();
  if (!raw) return "claude-sonnet-4-6";
  const s = raw.toLowerCase();
  const aliases: Record<string, string> = {
    "claude-sonnet-4-6":  "claude-sonnet-4-6",
    "claude-sonnet-4.6":  "claude-sonnet-4-6",
    "claude-4-6-sonnet":  "claude-sonnet-4-6",
    "claude-4.6-sonnet":  "claude-sonnet-4-6",
    "sonnet-4-6":         "claude-sonnet-4-6",
    "sonnet":             "claude-sonnet-4-6",
    "claude-opus-4-6":    "claude-opus-4-6",
    "claude-opus-4-7":    "claude-opus-4-7",
    "claude-opus-4.7":    "claude-opus-4-7",
    "opus-4-7":           "claude-opus-4-7",
    "opus-4.7":           "claude-opus-4-7",
    "opus":               "claude-opus-4-7",
    "claude-haiku-4-5":   "claude-haiku-4-5-20251001",
    "haiku":              "claude-haiku-4-5-20251001",
  };
  if (aliases[s]) return aliases[s];
  if (ALLOWED_MODELS.has(raw)) return raw;
  return null;
}

// ─── CORS ────────────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = new Set([
  "https://eiasash.github.io",      // Shlav A Mega
  "https://toranot.netlify.app",    // Toranot
  "http://localhost:3737",
  "http://localhost:5173",
  "http://localhost:8888",
]);

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : "https://toranot.netlify.app";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-api-secret, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

// ─── Token-usage tracking (fire-and-forget, identical to functions/claude.ts) ──

function trackUsage(
  usage: { input_tokens?: number; output_tokens?: number } | undefined,
  model: string,
): void {
  if (!usage || (!usage.input_tokens && !usage.output_tokens)) return;
  const sbUrl = Netlify.env.get("SUPABASE_URL") || Netlify.env.get("VITE_SUPABASE_URL");
  const sbKey = Netlify.env.get("SUPABASE_SERVICE_KEY") || Netlify.env.get("VITE_SUPABASE_ANON_KEY");
  if (!sbUrl || !sbKey) return;
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  // Fire-and-forget — never await, never block the response, never throw.
  fetch(`${sbUrl}/rest/v1/rpc/increment_token_usage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": sbKey,
      "Authorization": `Bearer ${sbKey}`,
    },
    body: JSON.stringify({
      p_month: month,
      p_provider: "claude",
      p_input: usage.input_tokens ?? 0,
      p_output: usage.output_tokens ?? 0,
      p_model: model,
    }),
  }).catch(() => {});
}

// ─── Handler ────────────────────────────────────────────────────────────────

export default async (req: Request, _context: Context) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders(req) });
  }

  const authError = await checkAuth(req);
  if (authError) {
    return new Response(await authError.text(), {
      status: authError.status,
      headers: { ...corsHeaders(req), "content-type": "text/plain" },
    });
  }

  const sizeError = checkBodySize(req);
  if (sizeError) {
    return new Response(await sizeError.text(), {
      status: sizeError.status,
      headers: { ...corsHeaders(req), "content-type": "text/plain" },
    });
  }

  const limitError = await checkRateLimit(req, "ai");
  if (limitError) {
    return new Response(await limitError.text(), {
      status: limitError.status,
      headers: { ...corsHeaders(req), "content-type": "text/plain" },
    });
  }

  const apiKey = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return new Response("AI service not configured", { status: 503, headers: corsHeaders(req) });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400, headers: corsHeaders(req) });
  }

  const b = body as Record<string, unknown>;
  const envModel = Netlify.env.get("CLAUDE_MODEL");
  const model = normalizeClaudeModel(b?.model ?? envModel);
  if (!model) {
    return new Response("Unsupported model", { status: 400, headers: corsHeaders(req) });
  }

  const maxTokens = clampInt(b?.max_tokens ?? b?.maxTokens, 4096, 256, 32768);

  const rawMessages =
    Array.isArray(b?.messages) && (b.messages as unknown[]).length
      ? (b.messages as unknown[])
      : typeof b?.prompt === "string" && (b.prompt as string).trim()
        ? [{ role: "user", content: b.prompt }]
        : [];

  if (!rawMessages.length) {
    return new Response("Missing prompt/messages", { status: 400, headers: corsHeaders(req) });
  }

  const messages = validateMessages(rawMessages);
  if (!messages) {
    return new Response("Invalid messages format", { status: 400, headers: corsHeaders(req) });
  }

  const wantsStream = b?.stream === true;

  const payload: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    messages,
  };
  if (wantsStream) payload.stream = true;
  if (typeof b?.system === "string") payload.system = b.system;
  // Opus 4.7 rejects temperature/top_p with non-default values (returns 400).
  // Silently drop them for that model rather than propagating the error to clients
  // that historically pass these defensively.
  const isOpus47 = model === "claude-opus-4-7";
  if (!isOpus47) {
    if (typeof b?.temperature === "number" && Number.isFinite(b.temperature)) {
      payload.temperature = Math.max(0, Math.min(2, b.temperature));
    }
    if (typeof b?.top_p === "number" && Number.isFinite(b.top_p)) {
      payload.top_p = Math.max(0, Math.min(1, b.top_p));
    }
  }
  // Adaptive thinking: forward thinking config if the client opted in.
  // We accept exactly one shape — { type: "adaptive" | "disabled" } —
  // and nothing else, so a typoed param can't unlock arbitrary upstream features.
  if (b?.thinking && typeof b.thinking === "object") {
    const t = b.thinking as { type?: unknown };
    if (t.type === "adaptive" || t.type === "disabled") {
      payload.thinking = { type: t.type };
    }
  }
  // output_config carries the effort dial for adaptive thinking. Only `effort`
  // is forwarded; `display` etc. are not whitelisted yet — we omit thinking
  // summaries from responses by default (matching Opus 4.7 default behavior).
  if (b?.output_config && typeof b.output_config === "object") {
    const oc = b.output_config as { effort?: unknown };
    if (typeof oc.effort === "string" && /^(low|medium|high|xhigh|max)$/.test(oc.effort)) {
      payload.output_config = { effort: oc.effort };
    }
  }

  // ── Streaming path ────────────────────────────────────────────────────────
  // No timeout wrapper — edge functions run on a streaming infrastructure that
  // keeps the connection alive as long as the upstream is sending bytes.
  if (wantsStream) {
    let upstream: Response;
    try {
      upstream = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "accept": "text/event-stream",
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.error("[claude-edge stream] upstream fetch failed:", err);
      return new Response("Upstream unavailable", { status: 502, headers: corsHeaders(req) });
    }

    if (!upstream.ok || !upstream.body) {
      const errText = await upstream.text();
      logUpstreamError("claude-edge stream", upstream.status, errText);
      return new Response(errText, {
        status: upstream.status,
        headers: { ...corsHeaders(req), "content-type": "application/json" },
      });
    }

    // Tap the stream to track usage from the final message_delta event without
    // buffering the whole response. The TransformStream forwards every chunk
    // unchanged AND parses for `event: message_delta` to extract usage info.
    const decoder = new TextDecoder();
    let buffer = "";
    const tap = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        controller.enqueue(chunk);
        try {
          buffer += decoder.decode(chunk, { stream: true });
          // Only retain the last 8KB to bound memory — usage events are tiny
          // and arrive late in the stream, so the tail is what matters.
          if (buffer.length > 8192) buffer = buffer.slice(-8192);
        } catch { /* ignore decode errors */ }
      },
      flush() {
        try {
          // Find the final message_delta event and extract its usage block.
          const events = buffer.split(/\n\n/);
          for (let i = events.length - 1; i >= 0; i--) {
            const ev = events[i];
            if (!ev.includes("message_delta")) continue;
            const dataMatch = ev.match(/^data:\s*(\{.*\})\s*$/m);
            if (!dataMatch) continue;
            const parsed = JSON.parse(dataMatch[1]);
            if (parsed?.usage) {
              trackUsage(parsed.usage, model);
              break;
            }
          }
        } catch { /* tracking failures must never break the stream */ }
      },
    });

    return new Response(upstream.body.pipeThrough(tap), {
      status: 200,
      headers: {
        ...corsHeaders(req),
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        "x-accel-buffering": "no",
      },
    });
  }

  // ── Non-streaming path (backwards compat) ─────────────────────────────────
  // Edge has no 26s wall, so we don't need a manual AbortSignal.timeout — but
  // we cap at 90s to protect against runaway upstream calls. Anthropic's own
  // server timeouts are well under this.
  let upstream: Response;
  try {
    upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(90_000),
    });
  } catch (err) {
    console.error("[claude-edge] upstream fetch failed:", err);
    return new Response("Upstream timeout", { status: 504, headers: corsHeaders(req) });
  }

  const text = await upstream.text();
  if (!upstream.ok) {
    logUpstreamError("claude-edge", upstream.status, text);
  } else {
    try {
      const parsed = JSON.parse(text);
      trackUsage(parsed?.usage, model);
    } catch { /* tracking failures must never fail the request */ }
  }

  return new Response(text, {
    status: upstream.status,
    headers: {
      "content-type": safeContentType(upstream),
      ...corsHeaders(req),
    },
  });
};

export const config: Config = {
  path: "/api/claude",
};

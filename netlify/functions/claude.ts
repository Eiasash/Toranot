import type { Context, Config } from "@netlify/functions";
import {
  checkAuth,
  checkBodySize,
  checkRateLimit,
  clampInt,
  fetchWithTimeout,
  logUpstreamError,
  validateMessages,
  UPSTREAM_TIMEOUT_LONG_MS,
  safeContentType,
} from "./_utils.ts";

// ─── Model normalization ──────────────────────────────────────────────────────

const ALLOWED_MODELS = new Set([
  "claude-sonnet-4-6",
  "claude-opus-4-6",
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
    "opus":               "claude-opus-4-6",
    "claude-haiku-4-5":   "claude-haiku-4-5-20251001",
    "haiku":              "claude-haiku-4-5-20251001",
  };

  if (aliases[s]) return aliases[s];
  if (ALLOWED_MODELS.has(raw)) return raw;
  return null;
}

// ─── CORS ────────────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = new Set([
  "https://eiasash.github.io",      // Shlav A Mega (Geriatrics study app)
  "https://toranot.netlify.app",    // Toranot (ward management)
  "http://localhost:3737",          // local dev — Shlav A Mega
  "http://localhost:5173",          // local dev — Vite
  "http://localhost:8888",          // local dev — Netlify Dev
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

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async (req: Request, _context: Context) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: corsHeaders(req) });

  const authError = await checkAuth(req);
  if (authError) return new Response(await authError.text(), { status: authError.status, headers: { ...corsHeaders(req), "content-type": "text/plain" } });

  const sizeError = checkBodySize(req);
  if (sizeError) return new Response(await sizeError.text(), { status: sizeError.status, headers: { ...corsHeaders(req), "content-type": "text/plain" } });

  const limitError = await checkRateLimit(req, "ai");
  if (limitError) return new Response(await limitError.text(), { status: limitError.status, headers: { ...corsHeaders(req), "content-type": "text/plain" } });

  const apiKey = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return new Response("AI service not configured", { status: 503, headers: corsHeaders(req) });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400, headers: corsHeaders(req) });
  }

  const b = body as Record<string, unknown>;
  const envModel = Netlify.env.get("CLAUDE_MODEL");
  const model = normalizeClaudeModel(b?.model ?? envModel);
  if (!model) return new Response("Unsupported model", { status: 400, headers: corsHeaders(req) });

  const maxTokens = clampInt(b?.max_tokens ?? b?.maxTokens, 4096, 256, 8192);

  const rawMessages =
    Array.isArray(b?.messages) && (b.messages as unknown[]).length
      ? (b.messages as unknown[])
      : typeof b?.prompt === "string" && (b.prompt as string).trim()
        ? [{ role: "user", content: b.prompt }]
        : [];

  if (!rawMessages.length) return new Response("Missing prompt/messages", { status: 400, headers: corsHeaders(req) });

  const messages = validateMessages(rawMessages);
  if (!messages) return new Response("Invalid messages format", { status: 400, headers: corsHeaders(req) });

  const payload: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    messages,
  };

  if (typeof b?.system === "string") payload.system = b.system;
  if (typeof b?.temperature === "number" && Number.isFinite(b.temperature)) payload.temperature = Math.max(0, Math.min(2, b.temperature));
  if (typeof b?.top_p === "number" && Number.isFinite(b.top_p)) payload.top_p = Math.max(0, Math.min(1, b.top_p));

  // Use longer timeout when request contains file content blocks (PDF/image)
  const hasFileBlocks = messages.some(m =>
    Array.isArray(m.content) &&
    (m.content as {type:string}[]).some(b => b.type === "image" || b.type === "document")
  );
  const isLongGeneration = maxTokens >= 2000; // clinical reasoning uses 3000 — needs more time
  const timeoutMs = (hasFileBlocks || isLongGeneration) ? UPSTREAM_TIMEOUT_LONG_MS : undefined;

  let upstream: Response;
  try {
    upstream = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
    }, timeoutMs);
  } catch {
    return new Response("Upstream timeout", { status: 504, headers: corsHeaders(req) });
  }

  const text = await upstream.text();
  if (!upstream.ok) logUpstreamError("claude", upstream.status, text);

  // ── Token usage tracking (fire-and-forget) ─────────────────────────────
  if (upstream.ok) {
    try {
      const parsed = JSON.parse(text);
      const usage = parsed?.usage;
      if (usage?.input_tokens || usage?.output_tokens) {
        const sbUrl = Netlify.env.get("SUPABASE_URL") || Netlify.env.get("VITE_SUPABASE_URL");
        const sbKey = Netlify.env.get("SUPABASE_SERVICE_KEY") || Netlify.env.get("VITE_SUPABASE_ANON_KEY");
        if (sbUrl && sbKey) {
          const now = new Date();
          const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
          // Fire-and-forget — don't await, don't block the response
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
            }),
          }).catch(() => {}); // silently ignore — tracking must never fail the request
        }
      }
    } catch { /* parsing failed — skip tracking */ }
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

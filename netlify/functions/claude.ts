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

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async (req: Request, _context: Context) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const authError = await checkAuth(req);
  if (authError) return authError;

  const sizeError = checkBodySize(req);
  if (sizeError) return sizeError;

  const limitError = await checkRateLimit(req, "ai");
  if (limitError) return limitError;

  const apiKey = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return new Response("Missing ANTHROPIC_API_KEY", { status: 500 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const envModel = Netlify.env.get("CLAUDE_MODEL");
  const model = normalizeClaudeModel(b?.model ?? envModel);
  if (!model) return new Response("Unsupported model", { status: 400 });

  const maxTokens = clampInt(b?.max_tokens ?? b?.maxTokens, 4096, 256, 8192);

  const rawMessages =
    Array.isArray(b?.messages) && (b.messages as unknown[]).length
      ? (b.messages as unknown[])
      : typeof b?.prompt === "string" && (b.prompt as string).trim()
        ? [{ role: "user", content: b.prompt }]
        : [];

  if (!rawMessages.length) return new Response("Missing prompt/messages", { status: 400 });

  const messages = validateMessages(rawMessages);
  if (!messages) return new Response("Invalid messages format", { status: 400 });

  const payload: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    messages,
  };

  if (typeof b?.system === "string") payload.system = b.system;
  if (typeof b?.temperature === "number") payload.temperature = b.temperature;
  if (typeof b?.top_p === "number") payload.top_p = b.top_p;

  // Use longer timeout when request contains file content blocks (PDF/image)
  const hasFileBlocks = messages.some(m =>
    Array.isArray(m.content) &&
    (m.content as {type:string}[]).some(b => b.type === "image" || b.type === "document")
  );
  const timeoutMs = hasFileBlocks ? UPSTREAM_TIMEOUT_LONG_MS : undefined;

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
    return new Response("Upstream timeout", { status: 504 });
  }

  const text = await upstream.text();
  if (!upstream.ok) logUpstreamError("claude", upstream.status, text);

  return new Response(text, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
    },
  });
};

export const config: Config = {
  path: "/api/claude",
};

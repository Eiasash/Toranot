import type { Context, Config } from "@netlify/functions";
import {
  checkAuth,
  checkBodySize,
  checkRateLimit,
  clampInt,
  fetchWithTimeout,
  logUpstreamError,
  validateMessages,
  safeContentType,
} from "./_utils.ts";

// ─── Model normalization ──────────────────────────────────────────────────────

// Models verified available March 2026 from /v1beta/models endpoint
const ALLOWED_MODELS = new Set([
  "gemini-2.0-flash",
  "gemini-2.0-flash-001",
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash-lite-001",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
  "gemini-flash-latest",
  "gemini-pro-latest",
]);

function normalizeGeminiModel(input: unknown): string | null {
  const raw = String(input ?? "").trim();
  if (!raw) return "gemini-2.5-flash";

  const s = raw.toLowerCase();
  const aliases: Record<string, string> = {
    "flash":                  "gemini-2.0-flash",
    "gemini-flash":           "gemini-2.0-flash",
    "gemini-2-flash":         "gemini-2.0-flash",
    "gemini-2.0-flash":       "gemini-2.0-flash",
    "gemini-2.0-flash-001":   "gemini-2.0-flash-001",
    "flash-lite":             "gemini-2.0-flash-lite",
    "gemini-2.0-flash-lite":  "gemini-2.0-flash-lite",
    "gemini-2.0-flash-lite-001": "gemini-2.0-flash-lite-001",
    "gemini-2.5-flash":       "gemini-2.5-flash",
    "2.5-flash":              "gemini-2.5-flash",
    "gemini-2.5-flash-lite":  "gemini-2.5-flash-lite",
    "pro":                    "gemini-2.5-pro",
    "gemini-2.5-pro":         "gemini-2.5-pro",
    "2.5-pro":                "gemini-2.5-pro",
    "latest":                 "gemini-flash-latest",
  };

  if (aliases[s]) return aliases[s];
  if (ALLOWED_MODELS.has(raw)) return raw;
  return null; // reject unknown models
}

// ─── Format conversion ────────────────────────────────────────────────────────

// OpenAI-style messages → Gemini `contents` format.
// Gemini roles: "user" | "model" (not "assistant")
// Content can be a string or an array of content blocks (text/image/document).
// Only text blocks are forwarded — Gemini uses a different format for images/docs.
function toGeminiContents(messages: { role: "user" | "assistant"; content: string | { type: string; text?: string }[] }[]) {
  return messages.map((m) => {
    let parts: { text: string }[];
    if (typeof m.content === "string") {
      parts = [{ text: m.content }];
    } else if (Array.isArray(m.content)) {
      // Extract text from content blocks; skip non-text blocks (images/documents)
      // rather than silently corrupting them to "[object Object]"
      parts = m.content
        .filter((b): b is { type: "text"; text: string } => b.type === "text" && typeof b.text === "string")
        .map((b) => ({ text: b.text }));
      if (parts.length === 0) {
        parts = [{ text: "" }];
      }
    } else {
      parts = [{ text: String(m.content ?? "") }];
    }
    return {
      role: m.role === "assistant" ? "model" : "user",
      parts,
    };
  });
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

  const apiKey = Netlify.env.get("GEMINI_API_KEY");
  if (!apiKey) return new Response("AI service not configured", { status: 503 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const envModel = Netlify.env.get("GEMINI_MODEL");
  const model = normalizeGeminiModel(b?.model ?? envModel);
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
    contents: toGeminiContents(messages),
    generationConfig: {
      maxOutputTokens: maxTokens,
      ...(typeof b?.temperature === "number" && Number.isFinite(b.temperature) && { temperature: Math.max(0, Math.min(2, b.temperature)) }),
      ...(typeof b?.top_p === "number" && Number.isFinite(b.top_p) && { topP: Math.max(0, Math.min(1, b.top_p)) }),
    },
  };

  if (typeof b?.system === "string" && (b.system as string).trim()) {
    payload.systemInstruction = { parts: [{ text: b.system }] };
  }

  // Use x-goog-api-key header — prevents key from appearing in Netlify function logs.
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  let upstream: Response;
  try {
    upstream = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    return new Response("Upstream timeout", { status: 504 });
  }

  const text = await upstream.text();
  if (!upstream.ok) logUpstreamError("gemini", upstream.status, text);

  return new Response(text, {
    status: upstream.status,
    headers: {
      "content-type": safeContentType(upstream),
    },
  });
};

export const config: Config = {
  path: "/api/gemini",
};


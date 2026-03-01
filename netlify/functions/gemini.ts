import type { Context, Config } from "@netlify/functions";
import {
  checkAuth,
  checkBodySize,
  checkRateLimit,
  clampInt,
  fetchWithTimeout,
  logUpstreamError,
  validateMessages,
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
  "gemini-3.1-pro-preview",
  "gemini-3-pro-preview",
  "gemini-3-flash-preview",
  "gemini-flash-latest",
  "gemini-pro-latest",
]);

function normalizeGeminiModel(input: unknown): string | null {
  const raw = String(input ?? "").trim();
  if (!raw) return "gemini-3.1-pro-preview";

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
    "gemini-3.1-pro":         "gemini-3.1-pro-preview",
    "gemini-3.1-pro-preview": "gemini-3.1-pro-preview",
    "gemini-3-pro":           "gemini-3-pro-preview",
    "gemini-3-flash":         "gemini-3-flash-preview",
    "latest":                 "gemini-flash-latest",
  };

  if (aliases[s]) return aliases[s];
  if (ALLOWED_MODELS.has(raw)) return raw;
  return null; // reject unknown models
}

// ─── Format conversion ────────────────────────────────────────────────────────

// OpenAI-style messages → Gemini `contents` format.
// Gemini roles: "user" | "model" (not "assistant")
function toGeminiContents(messages: { role: "user" | "assistant"; content: string }[]) {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async (req: Request, _context: Context) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const authError = checkAuth(req);
  if (authError) return authError;

  const sizeError = checkBodySize(req);
  if (sizeError) return sizeError;

  const limitError = await checkRateLimit(req, "ai");
  if (limitError) return limitError;

  const apiKey = Netlify.env.get("GEMINI_API_KEY");
  if (!apiKey) return new Response("Missing GEMINI_API_KEY", { status: 500 });

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
      ...(typeof b?.temperature === "number" && { temperature: b.temperature }),
      ...(typeof b?.top_p === "number" && { topP: b.top_p }),
    },
  };

  if (typeof b?.system === "string" && (b.system as string).trim()) {
    payload.systemInstruction = { parts: [{ text: b.system }] };
  }

  // Google AI Studio API keys require query param — Bearer token is for OAuth2 only.
  // Note: key appears in Netlify function logs; restrict log access accordingly.
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  let upstream: Response;
  try {
    upstream = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
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
      "content-type": upstream.headers.get("content-type") ?? "application/json",
    },
  });
};

export const config: Config = {
  path: "/api/gemini",
};

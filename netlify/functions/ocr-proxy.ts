/**
 * OCR proxy — forwards image payloads to Anthropic API.
 * Key stays server-side. Auth via x-api-secret header.
 * Migrated from legacy exports.handler to modern ES module format.
 */
import type { Context, Config } from "@netlify/functions";
import { checkAuth, checkRateLimit, clampInt, fetchWithTimeout, logUpstreamError, validateMessages } from "./_utils.ts";

// OCR only uses claude-sonnet-4-6 — block attempts to use expensive models
const OCR_ALLOWED_MODELS = new Set(["claude-sonnet-4-6", "claude-haiku-4-5-20251001"]);
const OCR_DEFAULT_MODEL = "claude-sonnet-4-6";

// OCR payloads are base64-encoded images — 10 MB limit (shared default is 50 KB)
const OCR_MAX_BODY_BYTES = 10 * 1024 * 1024;

const RETRY_DELAYS_MS = [2000, 6000, 15000];

export default async (req: Request, _context: Context) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const authError = checkAuth(req);
  if (authError) return authError;

  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > OCR_MAX_BODY_BYTES) {
    return new Response("Payload too large (max 10 MB)", { status: 413 });
  }

  const limitError = await checkRateLimit(req, "ocr");
  if (limitError) return limitError;

  const apiKey = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return new Response("Missing ANTHROPIC_API_KEY", { status: 500 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  // Validate + sanitize — reconstruct only controlled fields, never forward raw input
  const raw = body as Record<string, unknown>;
  const requestedModel = typeof raw?.model === "string" ? raw.model : OCR_DEFAULT_MODEL;
  if (!OCR_ALLOWED_MODELS.has(requestedModel)) {
    return new Response("Unsupported model for OCR", { status: 400 });
  }
  const maxTokens = clampInt(raw?.max_tokens, 4096, 256, 8192);
  // Validate messages array — must exist and have at least one entry
  if (!Array.isArray(raw?.messages) || (raw.messages as unknown[]).length === 0) {
    return new Response("Missing messages", { status: 400 });
  }
  // Reconstruct only the fields we explicitly allow — no pass-through of unknown keys
  // Deep-validate messages (same as claude.ts) — never forward raw caller input
  const validatedMessages = validateMessages(raw.messages as unknown[]);
  if (!validatedMessages) {
    return new Response("Invalid messages format", { status: 400 });
  }

  const sanitizedBody: Record<string, unknown> = {
    model: requestedModel,
    max_tokens: maxTokens,
    messages: validatedMessages,
  };
  if (typeof raw?.system === "string" && raw.system.trim()) {
    sanitizedBody.system = raw.system;
  }
  body = sanitizedBody;

  // Retry on 429 / 529 (rate-limit / overloaded) with exponential backoff
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    let response: Response;
    try {
      response = await fetchWithTimeout(
        "https://api.anthropic.com/v1/messages",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify(body),
        },
        28_000, // OCR needs more time than regular calls — large image payloads
      );
    } catch {
      return new Response("Upstream timeout", { status: 504 });
    }

    const isOverloaded = response.status === 429 || response.status === 529;
    if (!isOverloaded) {
      const text = await response.text();
      if (!response.ok) logUpstreamError("ocr-proxy", response.status, text);
      return new Response(text, {
        status: response.status,
        headers: {
          "content-type": response.headers.get("content-type") ?? "application/json",
        },
      });
    }

    lastResponse = response;
    const delay = RETRY_DELAYS_MS[attempt];
    if (delay === undefined) break;

    const jitter = Math.random() * 1000;
    console.warn(
      `[ocr-proxy] Anthropic overloaded (${response.status}). Retry ${attempt + 1}/${RETRY_DELAYS_MS.length} in ${Math.round((delay + jitter) / 1000)}s`,
    );
    await new Promise((r) => setTimeout(r, delay + jitter));
  }

  // All retries exhausted
  const text = await lastResponse!.text().catch(() => JSON.stringify({ error: "API overloaded" }));
  logUpstreamError("ocr-proxy", lastResponse!.status, text);
  return new Response(text, {
    status: lastResponse!.status,
    headers: { "content-type": "application/json" },
  });
};

export const config: Config = {
  path: "/api/ocr",
};


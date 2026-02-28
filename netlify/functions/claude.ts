import type { Context } from "@netlify/functions";

// Don't let random websites siphon your API keys through this proxy.
// Configure ALLOWED_ORIGINS="https://toranot.netlify.app,https://your-domain.com"
const DEFAULT_ALLOWED = [
  "https://toranot.netlify.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allowed = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const allowList = allowed.length ? allowed : DEFAULT_ALLOWED;
  const ok = origin && allowList.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin : "null",
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type Msg = { role: "user" | "assistant"; content: unknown };

function isValidMessages(messages: unknown): messages is Msg[] {
  if (!Array.isArray(messages) || messages.length === 0) return false;
  return messages.every((m) => {
    if (!m || typeof m !== "object") return false;
    const mm = m as Record<string, unknown>;
    const roleOk = mm.role === "user" || mm.role === "assistant";
    const contentOk =
      typeof mm.content === "string" ||
      (Array.isArray(mm.content) && mm.content.length > 0);
    return roleOk && contentOk;
  });
}

export default async (req: Request, _context: Context) => {
  const CORS = corsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { ...CORS } });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const contentLength = req.headers.get("content-length");
  if (contentLength && Number(contentLength) > 5_500_000) {
    return new Response(JSON.stringify({ error: "Request too large" }), {
      status: 413,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const model =
    typeof body?.model === "string" && body.model.trim()
      ? body.model.trim()
      : "claude-sonnet-4-5";

  const maxTokensRaw = Number(body?.max_tokens ?? 2048);
  const max_tokens = Number.isFinite(maxTokensRaw)
    ? Math.min(Math.max(1, maxTokensRaw), 8192)
    : 2048;

  if (!isValidMessages(body?.messages)) {
    return new Response(JSON.stringify({ error: "Invalid or missing messages" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const payload: Record<string, unknown> = {
    model,
    max_tokens,
    messages: body.messages,
  };

  if (typeof body?.system === "string" && body.system.trim()) {
    payload.system = body.system;
  }

  if (body?.temperature !== undefined) {
    const t = Number(body.temperature);
    if (!Number.isFinite(t)) return json({ error: "Invalid temperature" }, 400);
    payload.temperature = Math.max(0, Math.min(t, 1));
  }

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ error: "Proxy error" }), {
      status: 502,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
};

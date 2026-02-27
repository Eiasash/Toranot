import type { Context } from "@netlify/functions";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
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
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { ...CORS_HEADERS } });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const contentLength = req.headers.get("content-length");
  if (contentLength && Number(contentLength) > 5_500_000) {
    return json({ error: "Request too large" }, 413);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json({ error: "Server misconfigured" }, 500);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const model =
    typeof body?.model === "string" && body.model.trim()
      ? body.model.trim()
      : "claude-sonnet-4-6";

  const maxTokensRaw = Number(body?.max_tokens ?? 1500);
  const max_tokens = Number.isFinite(maxTokensRaw)
    ? Math.min(Math.max(1, maxTokensRaw), 4096)
    : 1500;

  if (!isValidMessages(body?.messages)) {
    return json({ error: "Invalid or missing messages" }, 400);
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
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch {
    return json({ error: "Proxy error" }, 502);
  }
};

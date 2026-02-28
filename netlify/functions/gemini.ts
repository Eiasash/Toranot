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

export default async (req: Request, _context: Context) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { ...CORS_HEADERS } });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return json({ error: "Gemini API key not configured on server" }, 500);
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
      : "gemini-3.1-pro-preview";

  const maxTokensRaw = Number(body?.max_tokens ?? 1500);
  const maxOutputTokens = Number.isFinite(maxTokensRaw)
    ? Math.min(Math.max(1, maxTokensRaw), 8192)
    : 1500;

  // Convert Anthropic-style {system, messages} to Gemini format
  const systemInstruction = typeof body?.system === "string" && body.system.trim()
    ? { parts: [{ text: body.system }] }
    : undefined;

  const anthropicMessages: { role: string; content: string }[] = Array.isArray(body?.messages)
    ? body.messages
    : [];

  const contents = anthropicMessages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: typeof m.content === "string" ? m.content : "" }],
  }));

  if (contents.length === 0) {
    return json({ error: "No messages provided" }, 400);
  }

  const payload: Record<string, unknown> = {
    contents,
    generationConfig: {
      maxOutputTokens,
      ...(body?.temperature !== undefined ? { temperature: Math.max(0, Math.min(Number(body.temperature), 2)) } : {}),
    },
  };

  if (systemInstruction) {
    payload.systemInstruction = systemInstruction;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await upstream.json() as any;

    if (!upstream.ok) {
      return json({ error: data?.error?.message ?? "Gemini API error" }, upstream.status);
    }

    // Normalize to Anthropic-compatible response shape so the frontend doesn't need branching
    const text: string =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "אין תשובה.";

    return json({
      content: [{ type: "text", text }],
      model,
      usage: {
        input_tokens: data?.usageMetadata?.promptTokenCount ?? 0,
        output_tokens: data?.usageMetadata?.candidatesTokenCount ?? 0,
      },
    });
  } catch (e) {
    return json({ error: "Proxy error" }, 502);
  }
};

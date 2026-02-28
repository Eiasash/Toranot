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

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Gemini API key not configured on server" }), {
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
      : "gemini-2.5-pro-preview";

  const maxTokensRaw = Number(body?.max_tokens ?? 2048);
  const maxOutputTokens = Number.isFinite(maxTokensRaw)
    ? Math.min(Math.max(1, maxTokensRaw), 8192)
    : 2048;

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
    return new Response(JSON.stringify({ error: "No messages provided" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
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

  // Retry once on 429 after a short wait
  const attemptFetch = async (): Promise<Response> =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

  try {
    let upstream = await attemptFetch();

    // 429: back off 3s and retry once
    if (upstream.status === 429) {
      await new Promise((r) => setTimeout(r, 3000));
      upstream = await attemptFetch();
    }

    const data = await upstream.json() as any;

    if (!upstream.ok) {
      // Map Gemini error codes to Hebrew user-facing messages
      const msg: string = data?.error?.message ?? "";
      let userMsg = `שגיאת Gemini: ${upstream.status}`;
      if (upstream.status === 429) userMsg = "חריגה ממגבלת Gemini. נסה שוב בעוד דקה.";
      else if (upstream.status === 403) userMsg = "מכסת Gemini הסתיימה — בדוק את מגבלות ה-API שלך ב-Google AI Studio.";
      else if (upstream.status === 400) userMsg = `בקשה לא תקינה ל-Gemini: ${msg.slice(0, 120)}`;
      else if (upstream.status === 500 || upstream.status === 503) userMsg = "שרת Gemini לא זמין כרגע. נסה שוב.";
      return new Response(JSON.stringify({ error: userMsg }), {
        status: upstream.status,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const text: string =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "אין תשובה.";

    // Blocked by safety filters
    const finishReason: string = data?.candidates?.[0]?.finishReason ?? "";
    if (finishReason === "SAFETY") {
      return new Response(JSON.stringify({ error: "התוכן נחסם על ידי מסנני הבטיחות של Gemini." }), {
        status: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      content: [{ type: "text", text }],
      model,
      usage: {
        input_tokens: data?.usageMetadata?.promptTokenCount ?? 0,
        output_tokens: data?.usageMetadata?.candidatesTokenCount ?? 0,
      },
    }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "שגיאת רשת בחיבור ל-Gemini." }), {
      status: 502,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
};


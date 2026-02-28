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
      return json({ error: userMsg }, upstream.status);
    }

    const text: string =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "אין תשובה.";

    // Blocked by safety filters
    const finishReason: string = data?.candidates?.[0]?.finishReason ?? "";
    if (finishReason === "SAFETY") {
      return json({ error: "התוכן נחסם על ידי מסנני הבטיחות של Gemini." }, 200);
    }

    return json({
      content: [{ type: "text", text }],
      model,
      usage: {
        input_tokens: data?.usageMetadata?.promptTokenCount ?? 0,
        output_tokens: data?.usageMetadata?.candidatesTokenCount ?? 0,
      },
    });
  } catch (e) {
    return json({ error: "שגיאת רשת בחיבור ל-Gemini." }, 502);
  }
};


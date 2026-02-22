import type { Context, Config } from "@netlify/functions";

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const apiKey = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "API key not configured on server" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const body = await req.json();

    // Sanitize: only forward expected fields
    const sanitized = {
      model: body.model || "claude-sonnet-4-20250514",
      max_tokens: Math.min(body.max_tokens || 1500, 4096),
      system: body.system,
      messages: body.messages,
    };

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(sanitized),
    });

    const data = await response.text();
    return new Response(data, {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Proxy error", detail: String(err) }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }
};

export const config: Config = {
  path: "/api/claude",
};

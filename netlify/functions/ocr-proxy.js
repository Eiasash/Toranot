/**
 * Netlify serverless function: OCR proxy for Anthropic API
 * 
 * Keeps the Anthropic API key server-side instead of exposing it in the browser.
 * Set ANTHROPIC_API_KEY in Netlify environment variables.
 */

exports.handler = async (event, context) => {
  // CORS headers
  // Configure ALLOWED_ORIGINS="https://toranot.netlify.app,https://your-domain.com"
  const DEFAULT_ALLOWED = [
    "https://toranot.netlify.app",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ];

  const origin = event.headers?.origin || event.headers?.Origin || "";
  const allowed = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const allowList = allowed.length ? allowed : DEFAULT_ALLOWED;
  const ok = origin && allowList.includes(origin);

  const corsHeaders = {
    "Access-Control-Allow-Origin": ok ? origin : "null",
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  // Handle preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY not configured");
    return {
      statusCode: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "ANTHROPIC_API_KEY not configured on server" }),
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");

    // Retry on 429 / 529 with exponential backoff (server-side)
    const RETRY_DELAYS_MS = [2000, 6000, 15000];
    let lastResponse = null;

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      });

      const isOverloaded = response.status === 429 || response.status === 529;

      if (!isOverloaded) {
        // Success or non-retryable error — return immediately
        const data = await response.json();
        return {
          statusCode: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          body: JSON.stringify(data),
        };
      }

      lastResponse = response;
      const delay = RETRY_DELAYS_MS[attempt];
      if (delay === undefined) break; // exhausted retries

      const jitter = Math.random() * 1000;
      console.warn(`Anthropic overloaded (${response.status}). Retry ${attempt + 1}/${RETRY_DELAYS_MS.length} in ${Math.round((delay + jitter) / 1000)}s`);
      await new Promise((r) => setTimeout(r, delay + jitter));
    }

    // All retries exhausted — return the last overloaded response
    const data = await lastResponse.json().catch(() => ({ error: { message: `API overloaded (${lastResponse.status})` } }));
    return {
      statusCode: lastResponse.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify(data),
    };

  } catch (err) {
    console.error("Proxy error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return {
      statusCode: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ error: `Proxy error: ${message}` }),
    };
  }
};
// ward-helper: send-note-email
// Server-side Gmail API sender using a persisted refresh token.
//
// Invoked by ward-helper's NoteViewer/NoteEditor "✉ שלח במייל (Gmail)" button.
// The client sends {to, subject, body} via supabase.functions.invoke(), which
// automatically attaches the caller's anon JWT in the Authorization header.
// verify_jwt=true means Supabase validates that JWT before this function runs,
// so we don't need to re-auth here — any signed-in ward-helper user can invoke.
//
// Secrets required (set in Supabase dashboard → Project Settings → Edge Functions → Secrets):
//   GMAIL_CLIENT_ID      — OAuth 2.0 client ID from Google Cloud Console
//   GMAIL_CLIENT_SECRET  — OAuth 2.0 client secret
//   GMAIL_REFRESH_TOKEN  — refresh token obtained via OAuth Playground (gmail.send scope)
//   GMAIL_FROM           — From header, e.g. 'Eias Ashhab <eiasashhab@gmail.com>'
//
// Design notes:
// - Logs metadata only (recipient, subject length, body length, message_id).
//   Never logs the note body — it contains PHI. Do not add body logging even
//   for debugging; use the client-side debug panel (v1.18.0) instead.
// - RFC 2047 encoded-word subject for Hebrew — otherwise Hebrew renders as
//   mojibake in some older MTAs along the path.
// - Content-Type: text/plain; charset=UTF-8 handles the body; Hebrew is fine
//   inline without additional encoding.
// - No rate limiting. Gmail's own quota (~2 sends/s per user) is adequate for
//   a single-doctor workflow. If this ever grows to multi-user, add a
//   per-user rate limit via a Supabase table.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// RFC 2047 encoded-word for UTF-8. Needed for Hebrew subject lines —
// bare non-ASCII in Subject: is technically illegal and some MTAs mangle it.
function encodeSubject(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin);
  return `=?UTF-8?B?${b64}?=`;
}

// base64url, as required by Gmail users.messages.send (raw field)
function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

interface SendInput {
  to: string;
  subject: string;
  body: string;
}

function validate(input: unknown): SendInput {
  if (!input || typeof input !== "object") throw new Error("bad request body");
  const { to, subject, body } = input as Record<string, unknown>;
  // Permissive email check — we're not a registrar. Catches empty/typo'd
  // fields; trust the recipient otherwise (Gmail will bounce if invalid).
  if (
    typeof to !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim())
  ) {
    throw new Error("invalid recipient");
  }
  if (
    typeof subject !== "string" ||
    subject.length === 0 ||
    subject.length > 998
  ) {
    throw new Error("invalid subject (1-998 chars)");
  }
  if (
    typeof body !== "string" ||
    body.length === 0 ||
    body.length > 100_000
  ) {
    throw new Error("invalid body (1-100000 chars)");
  }
  return { to: to.trim(), subject, body };
}

async function getAccessToken(): Promise<string> {
  const clientId = Deno.env.get("GMAIL_CLIENT_ID");
  const clientSecret = Deno.env.get("GMAIL_CLIENT_SECRET");
  const refreshToken = Deno.env.get("GMAIL_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Gmail OAuth not configured — set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN in Supabase Edge Functions secrets",
    );
  }
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const txt = await res.text();
    // A 400 here usually means the refresh token was revoked (password
    // change, Google security event, or you revoked access from
    // myaccount.google.com). Re-run the OAuth Playground flow to get a new
    // refresh token and update GMAIL_REFRESH_TOKEN.
    throw new Error(`oauth token refresh failed (${res.status}): ${txt}`);
  }
  const j = (await res.json()) as { access_token?: string };
  if (!j.access_token) throw new Error("oauth response missing access_token");
  return j.access_token;
}

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ ok: false, error: "POST only" }, 405);
  }

  let input: SendInput;
  try {
    const raw = await req.json();
    input = validate(raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "bad request";
    return json({ ok: false, error: msg }, 400);
  }

  try {
    const from = Deno.env.get("GMAIL_FROM");
    if (!from) throw new Error("GMAIL_FROM not set");

    const accessToken = await getAccessToken();

    // RFC 5322 message. CRLF line endings are required by the spec and by
    // Gmail's parser — LF alone is silently accepted but can cause header
    // folding bugs.
    const rfc5322 = [
      `From: ${from}`,
      `To: ${input.to}`,
      `Subject: ${encodeSubject(input.subject)}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      input.body,
    ].join("\r\n");

    const gmailRes = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw: toBase64Url(rfc5322) }),
      },
    );
    if (!gmailRes.ok) {
      const txt = await gmailRes.text();
      throw new Error(`gmail api error (${gmailRes.status}): ${txt}`);
    }
    const sent = (await gmailRes.json()) as { id?: string; threadId?: string };

    // Structured log — metadata only, never the body. Grep-able via the
    // Supabase edge-function logs pane.
    console.log(
      JSON.stringify({
        evt: "send",
        to: input.to,
        subject_len: input.subject.length,
        body_len: input.body.length,
        message_id: sent.id,
        thread_id: sent.threadId,
      }),
    );

    return json({ ok: true, messageId: sent.id, threadId: sent.threadId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    console.error(JSON.stringify({ evt: "error", msg }));
    // 500 — client will surface the msg. Safe to echo because we control
    // the throw sites; none of them leak secrets.
    return json({ ok: false, error: msg }, 500);
  }
});

import type { Config } from "@netlify/functions";
import { checkAuth } from "./_utils.ts";

/**
 * POST /.netlify/functions/feedback-notify
 *
 * Receives real-time feedback submissions via Supabase pg_net triggers.
 * On INSERT into *_feedback tables, the DB trigger fires this endpoint
 * with the full row payload.
 *
 * Classifies each submission using Claude Sonnet:
 *   pending_trivial  → clear data error (wrong answer letter, typo, dupe option)
 *   pending_review   → clinical dispute, ambiguous question, missing image
 *
 * Updates the row status via feedback_set_status RPC.
 * auto-audit probe_feedback_queue then creates the GitHub issue on next tick (≤30 min).
 */

declare const Netlify: { env: { get(key: string): string | undefined } };

const SUPABASE_URL = "https://krmlzwwelqvlfslwltol.supabase.co";
const VALID_APPS = new Set(["geri", "mishpacha", "pnimit"]);

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Auth: pg_net trigger sends the proxy API secret in x-api-secret
  const authError = await checkAuth(req);
  if (authError) return authError;

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return new Response("Bad request: invalid JSON", { status: 400 });
  }

  const { app, id, type, message, context, app_version } = payload as {
    app: string; id: number; type: string; message: string;
    context: string; diagnostics: string; app_version: string;
  };

  if (!app || !id || !VALID_APPS.has(app)) {
    return new Response(`Invalid payload: unknown app '${app}'`, { status: 400 });
  }

  // ── Claude classification ──────────────────────────────────────────────────
  const anthropicKey = Netlify.env.get("ANTHROPIC_API_KEY");
  let assessment: { verdict: string; reason: string; suggested_fix?: string } = {
    verdict: "needs_review",
    reason: "ANTHROPIC_API_KEY not configured — defaulting to human review",
  };

  if (anthropicKey) {
    try {
      const classRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 400,
          system: `You are a medical board exam QA bot. A user submitted feedback on a question in a Hebrew/English medical board exam prep app.

Classify the feedback as exactly one of:
- "trivial": clear data error — the correct-answer letter in the DB contradicts the explanation text, a distractor option is blank or duplicated, or there is an obvious transcription error. These can be fixed programmatically.
- "needs_review": genuine clinical dispute about what the correct answer should be, ambiguous wording, missing image reference, or anything requiring medical judgement.

Respond ONLY with valid JSON, no preamble, no markdown fences:
{"verdict":"trivial"|"needs_review","reason":"one concise sentence","suggested_fix":"short description of fix if trivial, omit if needs_review"}`,
          messages: [{
            role: "user",
            content: `Feedback type: ${type}
User message (their claim about what's wrong): ${message}
Question context: ${context}
App version: ${app_version}`,
          }],
        }),
        signal: AbortSignal.timeout(12000),
      });

      if (classRes.ok) {
        const classData = await classRes.json() as {
          content: Array<{ type: string; text: string }>;
        };
        const raw = classData.content?.find((b) => b.type === "text")?.text ?? "{}";
        const cleaned = raw.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(cleaned);
        if (parsed.verdict === "trivial" || parsed.verdict === "needs_review") {
          assessment = parsed;
        }
      } else {
        console.error("[feedback-notify] Claude API error:", classRes.status);
      }
    } catch (err) {
      console.error("[feedback-notify] classification failed:", err);
      // Keep default needs_review
    }
  }

  const newStatus = assessment.verdict === "trivial" ? "pending_trivial" : "pending_review";

  // ── Update Supabase row via feedback_set_status RPC ───────────────────────
  const anonKey =
    Netlify.env.get("VITE_SUPABASE_ANON_KEY") ??
    Netlify.env.get("VITE_SUPABASE_PUBLISHABLE_KEY");

  if (anonKey) {
    try {
      const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/feedback_set_status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": anonKey,
          "Authorization": `Bearer ${anonKey}`,
        },
        body: JSON.stringify({
          p_app: app,
          p_id: id,
          p_status: newStatus,
          p_assessment: assessment,
        }),
        signal: AbortSignal.timeout(6000),
      });
      if (!rpcRes.ok) {
        const body = await rpcRes.text();
        console.error(`[feedback-notify] feedback_set_status HTTP ${rpcRes.status}:`, body.slice(0, 200));
      }
    } catch (err) {
      console.error("[feedback-notify] Supabase RPC failed:", err);
      // auto-audit probe handles the fallback — don't fail the webhook
    }
  } else {
    console.warn("[feedback-notify] No Supabase anon key — skipping status update");
  }

  console.log(`[feedback-notify] ${app}#${id} → ${newStatus} (${assessment.verdict})`);
  return new Response(JSON.stringify({ ok: true, app, id, status: newStatus }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export const config: Config = {
  path: "/.netlify/functions/feedback-notify",
};

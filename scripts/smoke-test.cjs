#!/usr/bin/env node
/**
 * smoke-test.cjs — Post-deploy live-endpoint probe for Toranot.
 *
 * Usage:
 *   node scripts/smoke-test.cjs [base-url]
 *
 * Default base-url is https://toranot.netlify.app. Pass an alternate origin
 * (e.g. a Netlify deploy-preview URL) as the first arg.
 *
 * Exit codes:
 *   0 — all critical-path /api/* routes are correctly wired (no 404, no 5xx).
 *   1 — at least one route is broken, mis-routed, or misconfigured.
 *
 * What "correctly wired" means: the function responds with its own HTTP
 * status (200 / 204 / 401 / 405 etc.) rather than the SPA catch-all HTML
 * 200 or Netlify's branded 404 page. Returning 401 (auth gate) or 405
 * (method gate) is HEALTHY — it proves the function was actually invoked.
 *
 * The script makes the smallest valid probe per route. Routes that accept
 * GET get a GET; POST-only routes get an OPTIONS preflight (which every
 * function handles before auth/method gating).
 */

const BASE = process.argv[2] || "https://toranot.netlify.app";

/** @typedef {{
 *    path: string,
 *    method: 'GET' | 'OPTIONS' | 'POST',
 *    okStatuses: number[],
 *    okContentTypePrefix?: string,
 *    note: string,
 *  }} Probe */

/** @type {Probe[]} */
const PROBES = [
  // Read endpoints — return JSON on GET, no auth required.
  {
    path: "/api/skill-snapshot",
    method: "GET",
    okStatuses: [200, 503],
    okContentTypePrefix: "application/json",
    note: "skill-snapshot read (503 acceptable when Supabase env missing on this site)",
  },
  {
    path: "/api/self-audit",
    method: "GET",
    okStatuses: [200, 503],
    okContentTypePrefix: "application/json",
    note: "self-audit read (503 acceptable when Supabase env missing on this site)",
  },

  // POST endpoints — gate auth/method without us needing valid credentials.
  // OPTIONS preflight is sufficient: every function returns 204 for OPTIONS
  // BEFORE checking auth, so any non-404 response proves routing works.
  {
    path: "/api/claude",
    method: "OPTIONS",
    okStatuses: [200, 204],
    note: "claude proxy CORS preflight (edge function)",
  },
  {
    path: "/api/gemini",
    method: "OPTIONS",
    okStatuses: [200, 204],
    note: "gemini proxy CORS preflight",
  },
  {
    path: "/api/ocr",
    method: "OPTIONS",
    okStatuses: [200, 204],
    note: "ocr proxy CORS preflight (alias for ocr-proxy)",
  },
  {
    path: "/api/feedback-notify",
    method: "OPTIONS",
    okStatuses: [200, 204, 405],
    note: "feedback-notify CORS preflight (405 acceptable if OPTIONS not whitelisted)",
  },
  {
    path: "/api/github-pat",
    method: "GET",
    okStatuses: [401, 405],
    note: "github-pat (401/405 both prove function was invoked; 404 = redirect missing)",
  },
];

const RED = "[31m";
const GREEN = "[32m";
const YELLOW = "[33m";
const DIM = "[2m";
const RESET = "[0m";
const useColor = process.stdout.isTTY || process.env.CI === "true";
const c = (color, s) => (useColor ? `${color}${s}${RESET}` : s);

async function probe(p) {
  const url = `${BASE}${p.path}`;
  let status;
  let contentType = "";
  let err = "";

  try {
    const res = await fetch(url, { method: p.method, redirect: "manual" });
    status = res.status;
    contentType = (res.headers.get("content-type") || "").split(";")[0].trim();
    // Drain body so connection closes cleanly
    await res.text().catch(() => {});
  } catch (e) {
    err = String(e?.message || e);
  }

  const statusOk = p.okStatuses.includes(status);
  const ctOk = !p.okContentTypePrefix ||
    contentType.startsWith(p.okContentTypePrefix);
  const pass = !err && statusOk && ctOk;

  return { ...p, url, status, contentType, err, pass, statusOk, ctOk };
}

async function main() {
  console.log(`Toranot post-deploy smoke test`);
  console.log(`Base URL: ${BASE}`);
  console.log("");

  const results = [];
  for (const p of PROBES) {
    const r = await probe(p);
    results.push(r);

    const tag = r.pass ? c(GREEN, "PASS") : c(RED, "FAIL");
    const detail = r.err
      ? c(RED, `network error: ${r.err}`)
      : `${r.method} ${r.status}${r.contentType ? ` ${r.contentType}` : ""}`;
    console.log(`  ${tag} ${p.path.padEnd(22)} ${detail}`);
    if (!r.pass && !r.err) {
      if (!r.statusOk) {
        console.log(`       ${c(YELLOW, `expected status ∈ {${p.okStatuses.join(",")}}, got ${r.status}`)}`);
      }
      if (!r.ctOk) {
        console.log(`       ${c(YELLOW, `expected content-type ${p.okContentTypePrefix}*, got ${r.contentType || "(none)"}`)}`);
      }
      if (r.status === 404 && r.contentType.startsWith("text/html")) {
        console.log(`       ${c(YELLOW, "404 + HTML body = redirect rule missing in netlify.toml")}`);
      }
    }
    console.log(`       ${c(DIM, p.note)}`);
  }

  const failed = results.filter((r) => !r.pass);
  console.log("");
  if (failed.length === 0) {
    console.log(c(GREEN, `✓ All ${results.length} /api/* routes are correctly wired.`));
    process.exit(0);
  }
  console.log(c(RED, `✗ ${failed.length} of ${results.length} routes are broken:`));
  for (const r of failed) {
    console.log(`    ${r.path}  →  ${r.err || `${r.status} ${r.contentType}`}`);
  }
  process.exit(1);
}

main().catch((e) => {
  console.error(c(RED, `FATAL: ${e?.stack || e}`));
  process.exit(1);
});

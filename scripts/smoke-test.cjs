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

// Universal sanity check: the SPA catch-all rewrite (`/* -> /index.html`) returns
// `200 text/html` for unmatched paths. If ANY probe — even one accepting status
// 200 — gets `text/html`, that's the SPA, not the function. Always a FAIL.
// This is what makes the smoke test detect missing redirects in the first
// place; without it a missing /api/<name> redirect would silently PASS for
// every OPTIONS probe that accepts 200.
const SPA_FALLBACK_CT = "text/html";

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

  // POST endpoints — probe via OPTIONS preflight to avoid needing real credentials.
  // Legitimate function OPTIONS responses are 204 with empty body (and thus no
  // content-type header). A 200 with `text/html` means the SPA catch-all fired
  // instead of the redirect — that's the routing failure mode we exist to catch
  // (see Codex P1 on PR #100). The universal SPA-fallback guard in `probe()`
  // rejects `text/html` for every route regardless of status.
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
    // github-pat: 401 / 405 prove function was reached; 503 is acceptable too
    // because `checkAuth()` returns 503 when Supabase auth verification times
    // out — routing is still correct, the auth service is just temporarily
    // slow. Accepting 503 keeps the smoke test from going red on transient
    // upstream issues unrelated to redirect drift (Codex P2 on PR #100).
    path: "/api/github-pat",
    method: "GET",
    okStatuses: [401, 405, 503],
    note: "github-pat (401/405 prove function was invoked; 503 = Supabase auth timeout, routing still healthy; 404 = redirect missing)",
  },
];

const RED = "[31m";
const GREEN = "[32m";
const YELLOW = "[33m";
const DIM = "[2m";
const RESET = "[0m";
const useColor = process.stdout.isTTY || process.env.CI === "true";
const c = (color, s) => (useColor ? `${color}${s}${RESET}` : s);

// Retry settings — transient `fetch failed` (DNS / TCP / edge cold-start) is
// the most common false-positive in this script. A real routing failure
// returns an HTTP response (404 / 5xx), not a network error. We retry only on
// network errors with bounded backoff: 1s, 3s, 7s.
const RETRY_DELAYS_MS = [1000, 3000, 7000];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchOnce(url, method) {
  const res = await fetch(url, { method, redirect: "manual" });
  const status = res.status;
  const contentType = (res.headers.get("content-type") || "").split(";")[0].trim();
  await res.text().catch(() => {});
  return { status, contentType };
}

async function probe(p) {
  const url = `${BASE}${p.path}`;
  let status;
  let contentType = "";
  let err = "";
  let attempts = 0;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    attempts = attempt + 1;
    err = "";
    try {
      const r = await fetchOnce(url, p.method);
      status = r.status;
      contentType = r.contentType;
      // Got a real HTTP response — no further retry needed regardless of
      // status (5xx with proper body is a real routing answer, not flake).
      break;
    } catch (e) {
      err = String(e?.message || e);
      // Network-level error (DNS, TCP, edge cold-start). Retry with backoff.
      if (attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      // Out of retries — leave err set, fall through to fail.
    }
  }

  const statusOk = p.okStatuses.includes(status);
  // SPA-fallback guard: text/html on a /api/* route always means the redirect
  // didn't fire and Netlify served index.html via the catch-all. Always FAIL,
  // overrides any okStatuses match. (Codex P1 on PR #100: without this, a
  // missing redirect that returns 200 HTML would PASS OPTIONS probes.)
  const isSpaFallback = contentType.startsWith(SPA_FALLBACK_CT);
  const ctOk = !isSpaFallback && (
    !p.okContentTypePrefix || contentType.startsWith(p.okContentTypePrefix)
  );
  const pass = !err && statusOk && ctOk;

  return { ...p, url, status, contentType, err, pass, statusOk, ctOk, isSpaFallback, attempts };
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
    const retrySuffix = r.attempts > 1 ? c(DIM, ` (after ${r.attempts} attempts)`) : "";
    const detail = r.err
      ? c(RED, `network error: ${r.err}`)
      : `${r.method} ${r.status}${r.contentType ? ` ${r.contentType}` : ""}`;
    console.log(`  ${tag} ${p.path.padEnd(22)} ${detail}${retrySuffix}`);
    if (!r.pass && !r.err) {
      if (r.isSpaFallback) {
        console.log(`       ${c(YELLOW, `${r.status} ${SPA_FALLBACK_CT} = SPA catch-all fired; redirect for ${p.path} is not active in netlify.toml`)}`);
      } else {
        if (!r.statusOk) {
          console.log(`       ${c(YELLOW, `expected status ∈ {${p.okStatuses.join(",")}}, got ${r.status}`)}`);
        }
        if (!r.ctOk) {
          console.log(`       ${c(YELLOW, `expected content-type ${p.okContentTypePrefix}*, got ${r.contentType || "(none)"}`)}`);
        }
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

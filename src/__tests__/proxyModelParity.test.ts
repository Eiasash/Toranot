/**
 * Proxy model-normalization parity guard.
 *
 * `ALLOWED_MODELS` and `normalizeClaudeModel` are defined INDEPENDENTLY in both
 * halves of the /api/claude proxy:
 *   - netlify/edge-functions/claude.ts  (the live edge function)
 *   - netlify/functions/claude.ts       (the documented rollback half, PR #103)
 * The edge copy even comments itself "mirror of functions/claude.ts". Neither
 * copy had any test, so the two could silently DRIFT — and because this proxy
 * is the shared AI backbone for the whole sibling suite (Geriatrics, IM, FM,
 * ward-helper), a drift surfacing during an emergency rollback would change
 * model/effort handling for every app with nothing to catch it.
 *
 * This is a SOURCE-TEXT parity check only — it does not import or alter the
 * proxy. It fails loudly the moment the model set or the alias map diverges,
 * forcing any change to one copy to be mirrored in the other (the
 * drift-prevention contract the inline comment asks for, made executable).
 *
 * Surfaced by the 2026-06-09 fleet audit (Toranot finding: dup'd, untested
 * AI-proxy request-shaping). If the two halves are ever consolidated into a
 * shared module, delete this guard.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function read(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf-8");
}

/** Extract the model identifiers inside `ALLOWED_MODELS = new Set([ ... ])`. */
function extractAllowedModels(src: string): string[] {
  const m = src.match(/ALLOWED_MODELS\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
  if (!m) throw new Error("ALLOWED_MODELS Set literal not found");
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]).sort();
}

/** Extract the `aliases` map ("alias" -> "canonical") from normalizeClaudeModel. */
function extractAliases(src: string): Record<string, string> {
  const m = src.match(/const aliases:\s*Record<string,\s*string>\s*=\s*\{([\s\S]*?)\};/);
  if (!m) throw new Error("aliases map literal not found");
  const out: Record<string, string> = {};
  for (const pair of m[1].matchAll(/"([^"]+)"\s*:\s*"([^"]+)"/g)) {
    out[pair[1]] = pair[2];
  }
  return out;
}

const edgeSrc = read("../../netlify/edge-functions/claude.ts");
const nodeSrc = read("../../netlify/functions/claude.ts");

const edgeModels = extractAllowedModels(edgeSrc);
const nodeModels = extractAllowedModels(nodeSrc);
const edgeAliases = extractAliases(edgeSrc);
const nodeAliases = extractAliases(nodeSrc);

describe("proxy model-normalization parity (edge ↔ node claude.ts)", () => {
  it("both copies define normalizeClaudeModel", () => {
    expect(edgeSrc).toMatch(/function normalizeClaudeModel\b/);
    expect(nodeSrc).toMatch(/function normalizeClaudeModel\b/);
  });

  it("ALLOWED_MODELS sets are non-empty and identical across both halves", () => {
    expect(edgeModels.length).toBeGreaterThan(0);
    expect(edgeModels).toEqual(nodeModels);
  });

  it("alias maps are non-empty and identical across both halves", () => {
    expect(Object.keys(edgeAliases).length).toBeGreaterThan(0);
    expect(edgeAliases).toEqual(nodeAliases);
  });

  it("every alias target is itself an allowed model (no orphan alias on either half)", () => {
    const allowed = new Set(edgeModels);
    for (const [alias, target] of Object.entries(edgeAliases)) {
      expect(allowed.has(target), `alias "${alias}" → "${target}" not in ALLOWED_MODELS`).toBe(true);
    }
  });
});

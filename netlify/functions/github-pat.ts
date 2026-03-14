import type { Context, Config } from "@netlify/functions";
import { checkAuth } from "./_utils.ts";

/**
 * GET /api/github-pat
 *
 * Returns the GitHub PAT for Toranot repo pushes.
 * Protected by API_SECRET — only authenticated callers (Claude sessions) can use this.
 * The PAT is scoped to Eiasash/Toranot Contents:write only.
 */
export default async function handler(req: Request, _ctx: Context) {
  // Only allow GET
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Auth check — must pass x-api-secret header
  const authError = await checkAuth(req);
  if (authError) return authError;

  const pat = Netlify.env.get("GITHUB_PAT_TORANOT");
  if (!pat) {
    return new Response("GITHUB_PAT_TORANOT not configured", { status: 500 });
  }

  return new Response(JSON.stringify({ pat }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export const config: Config = {
  path: "/api/github-pat",
};

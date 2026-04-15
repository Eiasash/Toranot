import { supabase } from "../cloudSync";

/**
 * Sign in with GitHub OAuth via Supabase.
 *
 * Prerequisites (Supabase Dashboard):
 *   1. Go to Authentication > Providers > GitHub
 *   2. Enable the GitHub provider
 *   3. Add your GitHub OAuth App credentials (Client ID + Secret)
 *   4. Set callback URL to: <your-supabase-url>/auth/v1/callback
 *   5. In GitHub OAuth App settings, set the authorization callback URL to the same
 */
export async function signInWithGitHub() {
  if (!supabase) throw new Error("Supabase not configured");
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo: window.location.origin,
    },
  });
  if (error) throw error;
  return data;
}

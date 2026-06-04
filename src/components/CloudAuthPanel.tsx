import { useState, useEffect } from "react";
import { signInWithPassword, signUpWithPassword, signOut, supabase } from "../cloudSync";
import { signInWithGitHub } from "../auth/githubAuth";
import { safeGetItem, safeSetItem } from "../utils/storage";
import { safeUpdateUser } from "../utils/authThrottle";

const API_KEY_STORAGE = "toranot-anthropic-key";
const API_KEY_CLOUD_META = "anthropic_api_key";

/** Save the locally-stored API key to Supabase user metadata so it persists across devices/logins. */
async function syncApiKeyToCloud() {
  if (!supabase) return;
  const localKey = safeGetItem(API_KEY_STORAGE);
  if (!localKey) return;
  try {
    await safeUpdateUser(supabase, { data: { [API_KEY_CLOUD_META]: localKey } });
  } catch { /* best effort */ }
}

/** Restore API key from Supabase user metadata into localStorage (only if local is empty). */
async function restoreApiKeyFromCloud() {
  if (!supabase) return;
  try {
    const { data } = await supabase.auth.getUser();
    const cloudKey = data.user?.user_metadata?.[API_KEY_CLOUD_META];
    if (typeof cloudKey === "string" && cloudKey.startsWith("sk-ant-")) {
      const local = safeGetItem(API_KEY_STORAGE);
      if (!local) {
        safeSetItem(API_KEY_STORAGE, cloudKey);
      }
    }
  } catch { /* ignore */ }
}

export function CloudAuthPanel() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user ?? null;
      setUser(u);
      if (u) restoreApiKeyFromCloud();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        // On login: restore cloud key then push local key up
        restoreApiKeyFromCloud().then(() => syncApiKeyToCloud());
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!supabase) return null;

  if (user) {
    return (
      <div className="px-4 py-3 border-t border-slate-700 text-right">
        <div className="text-xs text-green-400 mb-1.5">{"\u2601\ufe0f \u05de\u05e1\u05d5\u05e0\u05db\u05e8\u05df"}</div>
        <div className="text-[11px] text-slate-400 mb-2 truncate" dir="ltr">{user.email}</div>
        <button onClick={() => signOut()} className="text-[11px] text-red-400 active:text-red-300">
          {"\u05d4\u05ea\u05e0\u05ea\u05e7 \u05de\u05d4\u05e2\u05e0\u05df"}
        </button>
      </div>
    );
  }

  const canSubmit = email.includes("@") && password.length >= 6;

  const handleSubmit = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setLoading(true);
    setError(null);
    try {
      if (mode === "login") {
        await signInWithPassword(email, password);
      } else {
        await signUpWithPassword(email, password);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "\u05e9\u05d2\u05d9\u05d0\u05d4";
      // Supabase error messages \u2192 Hebrew
      if (msg.includes("Invalid login credentials")) setError("\u05e1\u05d9\u05e1\u05de\u05d4 \u05e9\u05d2\u05d5\u05d9\u05d4");
      else if (msg.includes("Email not confirmed")) setError("\u05d0\u05de\u05ea \u05d0\u05ea \u05d4\u05de\u05d9\u05d9\u05dc \u05ea\u05d7\u05d9\u05dc\u05d4");
      else if (msg.includes("User already registered")) setError("\u05de\u05e9\u05ea\u05de\u05e9 \u05e7\u05d9\u05d9\u05dd \u2014 \u05e0\u05e1\u05d4 \u05dc\u05d4\u05ea\u05d7\u05d1\u05e8");
      else setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGitHub = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setLoading(true);
    setError(null);
    try {
      await signInWithGitHub();
    } catch (err) {
      setError(err instanceof Error ? err.message : "GitHub login failed");
      setLoading(false);
    }
  };

  return (
    <div className="px-4 py-3 border-t border-slate-700 text-right space-y-2">
      {/* GitHub OAuth button */}
      <button
        disabled={loading}
        onClick={handleGitHub}
        className="w-full bg-slate-800 border border-slate-600 text-slate-200 text-xs px-3 py-2 rounded-lg active:bg-slate-700 transition-colors flex items-center justify-center gap-2"
      >
        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
        {loading ? "..." : "\u05db\u05e0\u05d9\u05e1\u05d4 \u05e2\u05dd GitHub"}
      </button>
      <div className="text-center text-[10px] text-slate-400">{"\u2014 \u05d0\u05d5 \u2014"}</div>
      {/* Login / Signup toggle */}
      <div className="flex rounded-lg overflow-hidden border border-slate-600 text-xs">
        <button
          onClick={(e) => { e.stopPropagation(); setMode("login"); setError(null); }}
          className={"flex-1 py-1.5 transition-colors " + (mode === "login" ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400")}
        >
          {"\u05db\u05e0\u05d9\u05e1\u05d4"}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setMode("signup"); setError(null); }}
          className={"flex-1 py-1.5 transition-colors " + (mode === "signup" ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400")}
        >
          {"\u05d4\u05e8\u05e9\u05de\u05d4"}
        </button>
      </div>
      <label htmlFor="cloud-auth-email" className="sr-only">{"\u05db\u05ea\u05d5\u05d1\u05ea \u05de\u05d9\u05d9\u05dc"}</label>
      <input
        id="cloud-auth-email"
        type="email"
        dir="ltr"
        placeholder="your@email.com"
        value={email}
        onChange={(e) => { setEmail(e.target.value); setError(null); }}
        onClick={(e) => e.stopPropagation()}
        autoComplete="email"
        aria-label="\u05db\u05ea\u05d5\u05d1\u05ea \u05de\u05d9\u05d9\u05dc"
        className="w-full bg-slate-900 border border-slate-600 text-slate-200 text-xs px-2.5 py-2 rounded-lg placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
      />
      <label htmlFor="cloud-auth-password" className="sr-only">{"\u05e1\u05d9\u05e1\u05de\u05d4"}</label>
      <input
        id="cloud-auth-password"
        type="password"
        dir="ltr"
        placeholder="\u05e1\u05d9\u05e1\u05de\u05d4 (\u05dc\u05e4\u05d7\u05d5\u05ea 6 \u05ea\u05d5\u05d5\u05d9\u05dd)"
        value={password}
        onChange={(e) => { setPassword(e.target.value); setError(null); }}
        onClick={(e) => e.stopPropagation()}
        autoComplete={mode === "login" ? "current-password" : "new-password"}
        aria-label="\u05e1\u05d9\u05e1\u05de\u05d4"
        className="w-full bg-slate-900 border border-slate-600 text-slate-200 text-xs px-2.5 py-2 rounded-lg placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
      />
      {error && <div role="alert" aria-live="assertive" className="text-[11px] text-red-400 text-center">{error}</div>}
      <button
        disabled={loading || !canSubmit}
        onClick={handleSubmit}
        className="w-full bg-blue-600 disabled:bg-slate-600 text-white text-xs px-3 py-2 rounded-lg active:bg-blue-700 transition-colors"
      >
        {loading ? "..." : mode === "login" ? "\u2601\ufe0f \u05db\u05e0\u05d9\u05e1\u05d4" : "\u2601\ufe0f \u05d4\u05e8\u05e9\u05de\u05d4"}
      </button>
    </div>
  );
}

// \u2500\u2500\u2500 Overflow menu (secondary actions) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

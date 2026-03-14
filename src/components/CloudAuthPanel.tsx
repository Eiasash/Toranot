import { useState, useEffect } from "react";
import { signInWithPassword, signUpWithPassword, signOut, supabase } from "../cloudSync";
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
        <div className="text-xs text-green-400 mb-1.5">☁️ מסונכרן</div>
        <div className="text-[11px] text-slate-400 mb-2 truncate" dir="ltr">{user.email}</div>
        <button onClick={() => signOut()} className="text-[11px] text-red-400 active:text-red-300">
          התנתק מהענן
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
      const msg = err instanceof Error ? err.message : "שגיאה";
      // Supabase error messages → Hebrew
      if (msg.includes("Invalid login credentials")) setError("סיסמה שגויה");
      else if (msg.includes("Email not confirmed")) setError("אמת את המייל תחילה");
      else if (msg.includes("User already registered")) setError("משתמש קיים — נסה להתחבר");
      else setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="px-4 py-3 border-t border-slate-700 text-right space-y-2">
      {/* Login / Signup toggle */}
      <div className="flex rounded-lg overflow-hidden border border-slate-600 text-xs">
        <button
          onClick={(e) => { e.stopPropagation(); setMode("login"); setError(null); }}
          className={"flex-1 py-1.5 transition-colors " + (mode === "login" ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400")}
        >
          כניסה
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setMode("signup"); setError(null); }}
          className={"flex-1 py-1.5 transition-colors " + (mode === "signup" ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400")}
        >
          הרשמה
        </button>
      </div>
      <input
        type="email"
        dir="ltr"
        placeholder="your@email.com"
        value={email}
        onChange={(e) => { setEmail(e.target.value); setError(null); }}
        onClick={(e) => e.stopPropagation()}
        className="w-full bg-slate-900 border border-slate-600 text-slate-200 text-xs px-2.5 py-2 rounded-lg placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
      />
      <input
        type="password"
        dir="ltr"
        placeholder="סיסמה (לפחות 6 תווים)"
        value={password}
        onChange={(e) => { setPassword(e.target.value); setError(null); }}
        onClick={(e) => e.stopPropagation()}
        className="w-full bg-slate-900 border border-slate-600 text-slate-200 text-xs px-2.5 py-2 rounded-lg placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
      />
      {error && <div className="text-[11px] text-red-400 text-center">{error}</div>}
      <button
        disabled={loading || !canSubmit}
        onClick={handleSubmit}
        className="w-full bg-blue-600 disabled:bg-slate-600 text-white text-xs px-3 py-2 rounded-lg active:bg-blue-700 transition-colors"
      >
        {loading ? "..." : mode === "login" ? "☁️ כניסה" : "☁️ הרשמה"}
      </button>
    </div>
  );
}

// ─── Overflow menu (secondary actions) ────────────────────

import { useState, useEffect } from "react";
import { usePatientsState, usePatientsDispatch } from "../context/PatientsContext";
import { createHandoff, pullHandoff, supabase, type ToranotCloudState } from "../cloudSync";
import { signInWithPassword, signUpWithPassword } from "../cloudSync";

function InlineAuth({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = email.includes("@") && password.length >= 6;

  const handleSubmit = async () => {
    setLoading(true); setError(null);
    try {
      if (mode === "login") await signInWithPassword(email, password);
      else await signUpWithPassword(email, password);
      onSuccess();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "שגיאה";
      if (msg.includes("Invalid login credentials")) setError("סיסמה שגויה");
      else if (msg.includes("User already registered")) setError("משתמש קיים — נסה להתחבר");
      else setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-amber-300 bg-amber-900/30 border border-amber-700/50 rounded-xl px-3 py-2 text-center">
        ☁️ נדרשת כניסה לענן כדי ליצור קוד מסירה
      </p>
      <div className="flex rounded-lg overflow-hidden border border-gray-600 text-xs">
        <button
          onClick={() => { setMode("login"); setError(null); }}
          className={"flex-1 py-2 transition-colors " + (mode === "login" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400")}
        >כניסה</button>
        <button
          onClick={() => { setMode("signup"); setError(null); }}
          className={"flex-1 py-2 transition-colors " + (mode === "signup" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400")}
        >הרשמה</button>
      </div>
      <input
        type="email" dir="ltr" placeholder="your@email.com" value={email}
        onChange={e => setEmail(e.target.value)}
        className="w-full bg-gray-800 border border-gray-600 text-white text-sm px-3 py-2.5 rounded-xl placeholder:text-gray-500 focus:outline-none focus:border-blue-500"
      />
      <input
        type="password" dir="ltr" placeholder="סיסמה (לפחות 6 תווים)" value={password}
        onChange={e => setPassword(e.target.value)}
        onKeyDown={e => e.key === "Enter" && canSubmit && handleSubmit()}
        className="w-full bg-gray-800 border border-gray-600 text-white text-sm px-3 py-2.5 rounded-xl placeholder:text-gray-500 focus:outline-none focus:border-blue-500"
      />
      {error && <p className="text-xs text-red-400 text-center">{error}</p>}
      <button
        onClick={handleSubmit}
        disabled={loading || !canSubmit}
        className="w-full py-3 rounded-xl bg-blue-600 disabled:bg-gray-700 text-white text-sm font-bold active:bg-blue-700"
      >
        {loading ? "..." : mode === "login" ? "☁️ כניסה" : "☁️ הרשמה"}
      </button>
    </div>
  );
}

export function ShiftHandoffModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"send" | "receive">("send");
  const [code, setCode] = useState<string | null>(null);
  const [inputCode, setInputCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const { patients } = usePatientsState();
  const dispatch = usePatientsDispatch();

  // Track auth state
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setIsLoggedIn(!!data.session?.user);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setIsLoggedIn(!!session?.user);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    try {
      const state: ToranotCloudState = {
        patients: patients as unknown[],
        shiftHistory: [],
        events: [],
        unassignedTasks: [],
      };
      const result = await createHandoff(state);
      if (result) {
        setCode(result.code);
      } else {
        setError("יצירת קוד נכשלה — נסה שוב");
      }
    } catch (err) {
      console.warn("[Toranot] handoff create failed:", err);
      setError("שגיאה ביצירת קוד מסירה");
    } finally {
      setLoading(false);
    }
  };

  const handlePull = async () => {
    if (inputCode.length < 4) return;
    setLoading(true);
    setError(null);
    try {
      const state = await pullHandoff(inputCode);
      if (state) {
        dispatch({ type: "IMPORT_CLOUD_STATE", state });
        onClose();
      } else {
        setError("קוד לא נמצא או פג תוקף");
      }
    } catch (err) {
      console.warn("[Toranot] handoff pull failed:", err);
      setError("שגיאה בטעינת נתונים");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-900">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-700 safe-top">
        <h2 className="text-lg font-bold text-white">🤝 מסירת משמרת — ענן</h2>
        <button onClick={onClose} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 active:text-white text-2xl">✕</button>
      </header>

      {/* Tabs */}
      <div className="flex border-b border-gray-700">
        <button
          onClick={() => setTab("send")}
          className={`flex-1 py-3 text-sm font-semibold ${tab === "send" ? "text-blue-400 border-b-2 border-blue-400" : "text-gray-400"}`}
        >
          📤 שלח מסירה
        </button>
        <button
          onClick={() => setTab("receive")}
          className={`flex-1 py-3 text-sm font-semibold ${tab === "receive" ? "text-green-400 border-b-2 border-green-400" : "text-gray-400"}`}
        >
          📥 קבל מסירה
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5">
        {tab === "send" ? (
          <div className="max-w-sm mx-auto space-y-4">
            {!isLoggedIn ? (
              <InlineAuth onSuccess={() => setIsLoggedIn(true)} />
            ) : !code ? (
              <>
                <p className="text-sm text-gray-400 text-center">
                  צור קוד מסירה שהתורן הבא יכניס כדי לקבל את רשימת המטופלים שלך
                </p>
                <p className="text-xs text-gray-500 text-center">
                  {patients.length} מטופלים · תוקף 24 שעות
                </p>
                <button
                  onClick={handleCreate}
                  disabled={loading || patients.length === 0}
                  className="w-full bg-blue-600 disabled:bg-gray-700 text-white py-4 rounded-xl text-base font-bold active:bg-blue-700 transition-colors"
                >
                  {loading ? "יוצר..." : patients.length === 0 ? "אין מטופלים למסירה" : "צור קוד מסירה"}
                </button>
              </>
            ) : (
              <div className="text-center space-y-4">
                <div className="bg-gray-800 rounded-2xl p-6">
                  <p className="text-xs text-gray-400 mb-2">קוד המסירה:</p>
                  <p className="text-4xl font-mono font-bold text-white tracking-[0.3em]" dir="ltr">{code}</p>
                </div>
                <button
                  onClick={handleCopy}
                  className="w-full bg-gray-700 text-white py-3 rounded-xl text-sm active:bg-gray-600"
                >
                  {copied ? "✅ הועתק!" : "📋 העתק קוד"}
                </button>
                <p className="text-xs text-gray-500">תגיד/שלח לתורן הבא את הקוד הזה</p>
              </div>
            )}
          </div>
        ) : (
          <div className="max-w-sm mx-auto space-y-4">
            <p className="text-sm text-gray-400 text-center">
              הכנס את הקוד שקיבלת מהתורן היוצא
            </p>
            {!isLoggedIn && (
              <p className="text-xs text-amber-300 bg-amber-900/30 border border-amber-700/50 rounded-xl px-3 py-2 text-center">
                ☁️ נדרשת כניסה לענן כדי לקבל מסירה
              </p>
            )}
            <input
              type="text"
              dir="ltr"
              maxLength={8}
              placeholder="XXXXXXXX"
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value.toUpperCase())}
              className="w-full bg-gray-800 border border-gray-600 text-white text-center text-3xl font-mono tracking-[0.3em] px-4 py-5 rounded-xl placeholder:text-gray-600 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handlePull}
              disabled={loading || inputCode.length < 4 || !isLoggedIn}
              className="w-full bg-green-600 disabled:bg-gray-700 text-white py-4 rounded-xl text-base font-bold active:bg-green-700 transition-colors"
            >
              {loading ? "טוען..." : "📥 טען מסירה"}
            </button>
          </div>
        )}

        {error && (
          <div className="max-w-sm mx-auto mt-4 bg-red-900/30 border border-red-700 rounded-xl p-3 text-center">
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main App ──────────────────────────────────────────────
type Modal = "none" | "reference" | "handoff" | "dashboard" | "history" | "search" | "qrsync" | "capture" | "morning" | "ivprotocols" | "handoff_cloud";

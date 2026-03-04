import { useState, useEffect, useRef, useCallback } from "react";
import { usePatientsState, usePatientsDispatch } from "../context/PatientsContext";
import { safeGetItem } from "../utils/storage";
import {
  createSharedShift,
  updateSharedShift,
  updateSharedShiftAsGuest,
  deleteSharedShift,
  pullSharedShift,
  supabase,
} from "../cloudSync";

const SHARE_CODE_KEY = "toranot-share-code";
const SHARE_ROLE_KEY = "toranot-share-role"; // "host" | "guest"
const GUEST_CODE_KEY = "toranot-guest-code";

function toCloudState(state: ReturnType<typeof usePatientsState>) {
  return {
    patients: state.patients,
    shiftHistory: state.shiftHistory,
    events: state.events,
    unassignedTasks: state.unassignedTasks,
    darkMode: state.darkMode,
    scanMode: state.scanMode,
  };
}

export function SharedShiftPanel({ onClose }: { onClose: () => void }) {
  const state = usePatientsState();
  const dispatch = usePatientsDispatch();

  const [tab, setTab] = useState<"host" | "join">("host");
  const [shareCode, setShareCode] = useState<string>(() => safeGetItem(SHARE_CODE_KEY) ?? "");
  const [guestCode, setGuestCode] = useState<string>(safeGetItem(GUEST_CODE_KEY) ?? "");
  const [role, setRole] = useState<"host" | "guest" | null>(() => (safeGetItem(SHARE_ROLE_KEY) as "host" | "guest") ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [guestInput, setGuestInput] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stateRef = useRef(state);

  // Keep stateRef current so intervals always see latest state
  useEffect(() => { stateRef.current = state; }, [state]);

  const stopPoll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  // Guest polling — pull then push every 20s (bidirectional).
  // Pull and push are staggered: pull fires first, then push fires 10s later.
  // This avoids a race where stateRef still holds the pre-pull state at push time
  // (React hasn't re-rendered yet), which would overwrite the host's data.
  const guestPushRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startGuestSync = useCallback((code: string) => {
    stopPoll();
    if (guestPushRef.current) { clearInterval(guestPushRef.current); guestPushRef.current = null; }
    let failCount = 0;
    const pull = async () => {
      try {
        const result = await pullSharedShift(code);
        if (!result) {
          stopPoll();
          if (guestPushRef.current) { clearInterval(guestPushRef.current); guestPushRef.current = null; }
          setError("השיתוף פג תוקף או נסגר — התנתק וחזור מחדש");
          return;
        }
        failCount = 0;
        dispatch({ type: "IMPORT_CLOUD_STATE", state: result.state });
        setLastSync(new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }));
      } catch (e) {
        failCount++;
        console.warn("[Toranot] guest pull failed:", e);
        if (failCount >= 3) {
          setError("סנכרון נכשל — בדוק חיבור לרשת");
        }
      }
    };
    const push = async () => {
      try {
        await updateSharedShiftAsGuest(code, toCloudState(stateRef.current));
      } catch (e) {
        console.warn("[Toranot] guest push failed:", e);
      }
    };
    pull();
    pollRef.current = setInterval(pull, 20_000);
    // Push 10s offset from pull — by then React has re-rendered with pulled state
    guestPushRef.current = setInterval(push, 20_000);
    setTimeout(() => { push(); }, 10_000);
  }, [dispatch, stopPoll]);

  // Host auto-push — every 20s push current state to shared slot
  const hostPushRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopHostPush = useCallback(() => {
    if (hostPushRef.current) { clearInterval(hostPushRef.current); hostPushRef.current = null; }
  }, []);

  const startHostPush = useCallback((code: string) => {
    stopHostPush();
    let failCount = 0;
    hostPushRef.current = setInterval(async () => {
      try {
        await updateSharedShift(code, toCloudState(stateRef.current));
        failCount = 0;
        setLastSync(new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }));
      } catch (e) {
        failCount++;
        console.warn("[Toranot] host push failed:", e);
        if (failCount >= 3) {
          setError("סנכרון נכשל — בדוק חיבור לרשת");
        }
      }
    }, 20_000);
  }, [stopHostPush]);

  // Restore session on mount
  useEffect(() => {
    if (role === "host" && shareCode) startHostPush(shareCode);
    if (role === "guest" && guestCode) { setTab("join"); startGuestSync(guestCode); }
    return () => { stopPoll(); stopHostPush(); if (guestPushRef.current) clearInterval(guestPushRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Host: create share
  const handleShare = async () => {
    setLoading(true); setError(null);
    try {
      const code = await createSharedShift(toCloudState(state));
      setShareCode(code);
      setRole("host");
      localStorage.setItem(SHARE_CODE_KEY, code);
      localStorage.setItem(SHARE_ROLE_KEY, "host");
      startHostPush(code);
      setLastSync(new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }));
    } catch (e) { setError(String(e)); }
    setLoading(false);
  };

  // Host: stop sharing
  const handleStopShare = async () => {
    if (shareCode) await deleteSharedShift(shareCode).catch(() => {});
    stopHostPush();
    setShareCode(""); setRole(null); setLastSync(null);
    localStorage.removeItem(SHARE_CODE_KEY);
    localStorage.removeItem(SHARE_ROLE_KEY);
  };

  // Guest: join
  const handleJoin = async () => {
    const code = guestInput.toUpperCase().trim();
    if (!code) return;
    setLoading(true); setError(null);
    const result = await pullSharedShift(code);
    if (!result) { setError("קוד לא נמצא או פג תוקף"); setLoading(false); return; }
    dispatch({ type: "IMPORT_CLOUD_STATE", state: result.state });
    setGuestCode(code);
    setRole("guest");
    localStorage.setItem(GUEST_CODE_KEY, code);
    localStorage.setItem(SHARE_ROLE_KEY, "guest");
    startGuestSync(code);
    setLastSync(new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }));
    setLoading(false);
  };

  // Guest: leave
  const handleLeave = () => {
    stopPoll();
    if (guestPushRef.current) { clearInterval(guestPushRef.current); guestPushRef.current = null; }
    setGuestCode(""); setRole(null); setLastSync(null); setGuestInput("");
    localStorage.removeItem(GUEST_CODE_KEY);
    localStorage.removeItem(SHARE_ROLE_KEY);
  };

  const copyCode = async () => {
    await navigator.clipboard.writeText(shareCode).catch(() => {});
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const isLoggedIn = !!supabase;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl p-5 space-y-4 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">🤝 שיתוף משמרת</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl px-2">✕</button>
        </div>

        {tab === "host" && !isLoggedIn && (
          <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            ⚠️ נדרשת התחברות לענן כדי לשתף — לצפייה במשמרת של עמית, עבור ל"הצטרף"
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
          <button
            onClick={() => setTab("host")}
            className={`flex-1 py-1.5 text-sm rounded-lg font-medium transition-colors ${tab === "host" ? "bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-gray-100" : "text-gray-500"}`}
          >
            📡 שתף משמרת שלי
          </button>
          <button
            onClick={() => setTab("join")}
            className={`flex-1 py-1.5 text-sm rounded-lg font-medium transition-colors ${tab === "join" ? "bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-gray-100" : "text-gray-500"}`}
          >
            🔗 הצטרף למשמרת
          </button>
        </div>

        {/* HOST TAB */}
        {tab === "host" && (
          <div className="space-y-3">
            {role !== "host" || !shareCode ? (
              <>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  צור קוד שיתוף לחברי הצוות — הם יוכלו לראות ולערוך את רשימת החולים שלך בזמן אמת.
                </p>
                <button
                  onClick={handleShare}
                  disabled={loading || !isLoggedIn}
                  className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold active:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? "יוצר..." : "🚀 התחל שיתוף"}
                </button>
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-500 dark:text-gray-400">קוד שיתוף (תקף 8 שעות):</p>
                <div
                  className="flex items-center justify-between bg-blue-50 dark:bg-blue-900/30 border-2 border-blue-300 dark:border-blue-700 rounded-xl px-4 py-3 cursor-pointer active:bg-blue-100"
                  onClick={copyCode}
                >
                  <span className="font-mono text-2xl font-bold tracking-widest text-blue-700 dark:text-blue-300 select-all">
                    {shareCode}
                  </span>
                  <span className="text-sm text-blue-600 dark:text-blue-400">
                    {copied ? "✓ הועתק!" : "📋 העתק"}
                  </span>
                </div>
                <p className="text-xs text-gray-500 text-center">
                  סנכרון אוטומטי כל 20 שניות{lastSync ? ` — עודכן ${lastSync}` : ""}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={copyCode}
                    className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium active:bg-blue-700"
                  >
                    {copied ? "✓ הועתק!" : "📋 העתק קוד"}
                  </button>
                  <button
                    onClick={handleStopShare}
                    className="py-2.5 px-4 rounded-xl border border-red-300 text-red-600 text-sm active:bg-red-50"
                  >
                    עצור
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* JOIN TAB */}
        {tab === "join" && (
          <div className="space-y-3">
            {role !== "guest" || !guestCode ? (
              <>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  הכנס קוד שיתוף שקיבלת מחבר הצוות כדי לראות ולערוך את רשימת החולים שלו.
                </p>
                <div className="flex gap-2">
                  <input
                    value={guestInput}
                    onChange={e => setGuestInput(e.target.value.toUpperCase())}
                    placeholder="ABC123"
                    maxLength={6}
                    dir="ltr"
                    className="flex-1 px-3 py-3 text-center font-mono text-lg font-bold tracking-widest border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-400 outline-none uppercase"
                    onKeyDown={e => e.key === "Enter" && handleJoin()}
                  />
                  <button
                    onClick={handleJoin}
                    disabled={loading || guestInput.length < 4 || !supabase}
                    className="px-4 py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold active:bg-blue-700 disabled:opacity-50"
                  >
                    {loading ? "..." : "הצטרף"}
                  </button>
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-300 dark:border-green-700 rounded-xl px-4 py-3 text-center">
                  <p className="text-xs text-green-600 font-medium">✅ מחובר — עריכה דו-כיוונית פעילה</p>
                  <p className="font-mono text-xl font-bold tracking-widest text-green-700 dark:text-green-300 mt-1">{guestCode}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    מסונכרן כל 20 שניות{lastSync ? ` — עודכן ${lastSync}` : ""}
                  </p>
                </div>
                <p className="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2">
                  ✏️ שינויים שתעשה יסונכרנו חזרה למשמרת המשותפת כל 20 שניות
                </p>
                <button
                  onClick={handleLeave}
                  className="w-full py-2.5 rounded-xl border border-red-300 text-red-600 text-sm active:bg-red-50"
                >
                  נתק מהמשמרת
                </button>
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}
      </div>
    </div>
  );
}

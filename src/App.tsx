import { useState, useEffect, useCallback, useRef, Component, type ErrorInfo, lazy, Suspense } from "react";
import { PatientsProvider } from "./context/PatientsContext";
import { createHandoff, pullHandoff, type ToranotCloudState } from "./cloudSync";
import { SectionTabs } from "./components/SectionTabs";
import { InputArea } from "./components/InputArea";
import { PatientList } from "./components/PatientList";
// Heavy modals — code-split so they don't block initial render
const QuickReference  = lazy(() => import("./components/QuickReference").then(m => ({ default: m.QuickReference })));
const IVProtocols     = lazy(() => import("./components/IVProtocols").then(m => ({ default: m.IVProtocols })));
const HandoffSheet    = lazy(() => import("./components/HandoffSheet").then(m => ({ default: m.HandoffSheet })));
const TaskDashboard   = lazy(() => import("./components/TaskDashboard").then(m => ({ default: m.TaskDashboard })));
const ShiftHistory    = lazy(() => import("./components/ShiftHistory").then(m => ({ default: m.ShiftHistory })));
const GlobalSearch    = lazy(() => import("./components/GlobalSearch").then(m => ({ default: m.GlobalSearch })));
import { UndoToastContainer } from "./components/UndoToast";
import { ShiftTimer } from "./components/ShiftTimer";
import { usePatientsDispatch, usePatientsState, useCloudSync } from "./context/PatientsContext";
const QRSync            = lazy(() => import("./components/QRSync").then(m => ({ default: m.QRSync })));
const QuickCaptureSheet = lazy(() => import("./components/QuickCaptureSheet").then(m => ({ default: m.QuickCaptureSheet })));
const MorningReport     = lazy(() => import("./components/MorningReport").then(m => ({ default: m.MorningReport })));
import { requestNotificationPermission, syncReminders, cancelAllReminders } from "./utils/taskReminders";
import { formatScanDiffSummary } from "./engine/smartOCR";
import { OverflowMenu } from "./components/OverflowMenu";
const ShiftHandoffModal = lazy(() => import("./components/ShiftHandoffModal").then(m => ({ default: m.ShiftHandoffModal })));
const SharedShiftPanel  = lazy(() => import("./components/SharedShiftPanel").then(m => ({ default: m.SharedShiftPanel })));
import { SECTION_LABEL } from "./types";
import { useSimpleToast, SimpleToast } from "./components/SimpleConfirm";

// ─── Scan Diff Banner ──────────────────────────────────────
function ScanDiffBanner() {
  const { lastScanDiff } = usePatientsState();
  const dispatch = usePatientsDispatch();

  if (!lastScanDiff) return null;
  const summary = formatScanDiffSummary(lastScanDiff);
  if (!summary) return null;

  return (
    <div
      role="status"
      className="w-full lg:max-w-6xl lg:mx-auto mx-0 px-3 py-2 bg-blue-50 dark:bg-blue-900/30 border-b border-blue-200 dark:border-blue-700 flex items-center justify-between gap-2 text-sm"
    >
      <span className="text-blue-800 dark:text-blue-300 font-medium">{summary}</span>
      <button
        onClick={() => dispatch({ type: "DISMISS_SCAN_DIFF" })}
        className="text-blue-600 dark:text-blue-400 text-xs px-2 py-0.5 rounded border border-blue-300 dark:border-blue-600 active:opacity-70 shrink-0"
        aria-label="סגור הודעת שינויים"
      >
        סגור
      </button>
    </div>
  );
}

// ─── Shift Progress Bar ────────────────────────────────────
function ShiftProgress() {
  const { patients, activeSection } = usePatientsState();
  const sectionPatients = activeSection === "ALL"
    ? patients
    : patients.filter((p) => p.section === activeSection);
  const allTasks = sectionPatients.flatMap((p) => [...p.tasks, ...p.generatedTasks.filter(t => !t.dismissed)]);
  const total = allTasks.length;
  const done = allTasks.filter((t) => t.done).length;
  const stat = allTasks.filter((t) => !t.done && t.urgency === "stat").length;
  const urgent = allTasks.filter((t) => !t.done && t.urgency === "urgent").length;
  if (total === 0) return null;
  const pct = Math.round((done / total) * 100);
  return (
    <div className="bg-slate-800 border-t border-slate-700 px-4 py-1.5">
      <div className="w-full lg:max-w-6xl lg:mx-auto flex items-center gap-3 text-xs">
        <div className="flex-1 bg-slate-700 rounded-full h-1.5 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500 bg-emerald-400"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-slate-300 tabular-nums whitespace-nowrap">{done}/{total}</span>
        {stat > 0 && <span className="text-red-400 font-semibold tabular-nums">🔴 {stat}</span>}
        {urgent > 0 && <span className="text-amber-400 tabular-nums">🟡 {urgent}</span>}
      </div>
    </div>
  );
}

// ─── Inline confirm dialogs — no window.confirm() ──────────
// window.confirm() is blocked in some PWA standalone contexts on Android,
// breaks the UI flow, and looks bad. React state handles this cleanly.

export type ConfirmDialog =
  | { type: "none" }
  | {
      type: "archive";
      mode: "archive" | "end";
      label: string;
      incompleteTasks: Array<{ name: string; room: string | null; task: string }>;
      patientsNoTasks: Array<{ name: string; room: string | null }>;
      abnormalLabs: Array<{ name: string; room: string | null; lab: string }>;
      openStatCount: number;
    }
  | { type: "clear" };

export function ConfirmModal({
  dialog,
  onConfirm,
  onCancel,
}: {
  dialog: ConfirmDialog;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (dialog.type === "none") return null;

  if (dialog.type === "clear") {
    return (
      <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center px-4 pb-8 sm:pb-0 bg-black/40">
        <div className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden">
          <div className="px-5 pt-5 pb-4">
            <div className="text-2xl mb-2">🗑️</div>
            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">מחיקת כל המטופלים</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              פעולה זו בלתי הפיכה. ודא שארכבת את המשמרת להיסטוריה לפני המחיקה.
            </p>
          </div>
          <div className="flex border-t border-gray-200 dark:border-gray-700">
            <button onClick={onCancel} className="flex-1 py-4 text-sm text-gray-600 dark:text-gray-400 active:bg-gray-50 dark:active:bg-gray-800">
              ביטול
            </button>
            <button onClick={onConfirm} className="flex-1 py-4 text-sm font-bold text-red-600 border-r border-gray-200 dark:border-gray-700 active:bg-red-50 dark:active:bg-red-900/20">
              מחק הכל
            </button>
          </div>
        </div>
      </div>
    );
  }

  // archive dialog
  const hasIncomplete = dialog.incompleteTasks.length > 0;
  const hasNoTasks = dialog.patientsNoTasks.length > 0;
  const hasAbnormalLabs = dialog.abnormalLabs.length > 0;
  const hasIssues = hasIncomplete || hasNoTasks || hasAbnormalLabs;
  const isEndShift = dialog.mode === "end";
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center px-4 pb-8 sm:pb-0 bg-black/40">
      <div className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col">
	        <div className="px-5 pt-5 pb-3 flex-shrink-0">
	          <div className="text-2xl mb-2">{isEndShift ? "🏁" : "💾"}</div>
	          <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">
	            {isEndShift ? "סיום משמרת" : "שמור משמרת להיסטוריה"}
	          </h3>
	          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{dialog.label}</p>
	          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
	            {isEndShift
	              ? "יישמר להיסטוריה ואז ינקה את הרשימות הנוכחיות."
	              : "נשמר מקומית בדפדפן. תמונות לא נשמרות בהיסטוריה כדי לא לפוצץ את האחסון."}
	          </p>
	        </div>

        <div className="overflow-y-auto flex-1 px-5 pb-3 space-y-2.5">
          {/* Open STAT tasks — red */}
          {dialog.openStatCount > 0 && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-xl p-3">
              <p className="text-xs font-semibold text-red-800 dark:text-red-300 mb-1">
                🔴 {dialog.openStatCount} משימות STAT פתוחות!
              </p>
              <p className="text-xs text-red-600 dark:text-red-400">
                משימות דחופות שטרם הושלמו. שקול לטפל לפני סיום המשמרת.
              </p>
            </div>
          )}

          {/* Incomplete urgent tasks */}
          {hasIncomplete && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-3">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-2">
                ⚠️ {dialog.incompleteTasks.length} משימות דחופות לא הושלמו
              </p>
              <div className="space-y-1 max-h-28 overflow-y-auto">
                {dialog.incompleteTasks.map((t, i) => (
                  <div key={i} className="text-xs text-amber-700 dark:text-amber-400">
                    <span className="font-mono font-bold">{t.room ?? "?"}</span>
                    {" "}{t.name} — {t.task}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Abnormal labs without follow-up — orange */}
          {hasAbnormalLabs && (
            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-xl p-3">
              <p className="text-xs font-semibold text-orange-800 dark:text-orange-300 mb-2">
                🧪 {dialog.abnormalLabs.length} ערכי מעבדה חריגים ללא מעקב
              </p>
              <div className="space-y-1 max-h-28 overflow-y-auto">
                {dialog.abnormalLabs.map((l, i) => (
                  <div key={i} className="text-xs text-orange-700 dark:text-orange-400">
                    <span className="font-mono font-bold">{l.room ?? "?"}</span>
                    {" "}{l.name} — {l.lab}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Patients with no tasks — blue info */}
          {hasNoTasks && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl p-3">
              <p className="text-xs font-semibold text-blue-800 dark:text-blue-300 mb-2">
                ℹ️ {dialog.patientsNoTasks.length} מטופלים ללא משימות
              </p>
              <div className="space-y-1 max-h-20 overflow-y-auto">
                {dialog.patientsNoTasks.map((p, i) => (
                  <div key={i} className="text-xs text-blue-700 dark:text-blue-400">
                    <span className="font-mono font-bold">{p.room ?? "?"}</span> {p.name}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All clear */}
          {!hasIssues && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-xl p-3">
              <p className="text-xs font-semibold text-green-800 dark:text-green-300">
                ✅ אין ממצאים חריגים — ניתן לסיים בבטחה
              </p>
            </div>
          )}
        </div>

        <div className="flex border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
          <button onClick={onCancel} className="flex-1 py-4 text-sm text-gray-600 dark:text-gray-400 active:bg-gray-50 dark:active:bg-gray-800">
            ביטול
          </button>
          <button onClick={onConfirm} className={`flex-1 py-4 text-sm font-bold border-r border-gray-200 dark:border-gray-700 ${
            dialog.openStatCount > 0
              ? "text-red-600 active:bg-red-50 dark:active:bg-red-900/20"
              : hasIssues
                ? "text-amber-600 active:bg-amber-50 dark:active:bg-amber-900/20"
                : "text-blue-600 active:bg-blue-50 dark:active:bg-blue-900/20"
          }`}>
            {dialog.openStatCount > 0
              ? isEndShift
                ? "סיים ושמור למרות STAT פתוח"
                : "שמור למרות STAT פתוח"
              : hasIssues
                ? isEndShift
                  ? "סיים ושמור בכל זאת"
                  : "שמור בכל זאת"
                : isEndShift
                  ? "סיים משמרת"
                  : "שמור משמרת"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal discriminant union ──────────────────────────────
// Single source of truth for all overlay states in AppInner.
// Exported so BottomNav, OverflowMenu, and any future surface can
// share the same type without re-declaring it locally.
export type Modal =
  | "none"
  | "reference"
  | "handoff"
  | "dashboard"
  | "history"
  | "search"
  | "qrsync"
  | "capture"
  | "morning"
  | "ivprotocols"
  | "handoff_cloud"
  | "shared_shift";

// ─── Bottom Navigation Bar ─────────────────────────────────
// Primary actions at thumb-reach. 56px height + safe area inset.
// Four slots: Search | Dashboard | Handoff | Reference
function BottomNav({
  onAction,
  pendingStat,
}: {
  onAction: (action: Modal) => void;
  pendingStat: number;
}) {
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-30 bg-slate-800 border-t border-slate-700 flex pb-safe"
      role="navigation"
      aria-label="ניווט ראשי"
    >
      {/* Search */}
      <button
        onClick={() => onAction("search")}
        className="flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[56px] text-slate-300 active:bg-slate-700 transition-colors"
        aria-label="חיפוש מהיר"
      >
        <span className="text-xl leading-none">🔍</span>
        <span className="text-[10px] text-slate-400">חיפוש</span>
      </button>

      {/* Dashboard — badge when stat tasks pending */}
      <button
        onClick={() => onAction("dashboard")}
        className="flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[56px] text-slate-300 active:bg-slate-700 transition-colors relative"
        aria-label={`לוח משימות${pendingStat > 0 ? ` — ${pendingStat} סטט פתוחים` : ""}`}
      >
        <span className="text-xl leading-none">🎯</span>
        <span className="text-[10px] text-slate-400">לוח</span>
        {pendingStat > 0 && (
          <span className="absolute top-2 right-[calc(50%-10px)] translate-x-2.5 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-0.5">
            {pendingStat > 99 ? "99+" : pendingStat}
          </span>
        )}
      </button>

      {/* Handoff */}
      <button
        onClick={() => onAction("handoff")}
        className="flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[56px] text-slate-300 active:bg-slate-700 transition-colors"
        aria-label="מסירת משמרת"
      >
        <span className="text-xl leading-none">📤</span>
        <span className="text-[10px] text-slate-400">מסירה</span>
      </button>

      {/* Quick Reference */}
      <button
        onClick={() => onAction("reference")}
        className="flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[56px] text-slate-300 active:bg-slate-700 transition-colors"
        aria-label="עזר קליני מהיר"
      >
        <span className="text-xl leading-none">📋</span>
        <span className="text-[10px] text-slate-400">עזר</span>
      </button>
    </nav>
  );
}

// ─── Shake-to-open Quick Reference ─────────────────────────
function useShakeDetector(onShake: () => void) {
  useEffect(() => {
    let lastX = 0, lastY = 0, lastZ = 0;
    let lastTime = 0;
    let shakeCount = 0;
    let shakeResetTimer: ReturnType<typeof setTimeout> | null = null;
    const THRESHOLD = 15;
    const SHAKE_COOLDOWN = 300;
    const SHAKES_NEEDED = 3;

    const handler = (e: DeviceMotionEvent) => {
      const acc = e.accelerationIncludingGravity;
      if (!acc || acc.x == null || acc.y == null || acc.z == null) return;
      const now = Date.now();
      if (now - lastTime < 100) return;
      const dx = Math.abs(acc.x - lastX);
      const dy = Math.abs(acc.y - lastY);
      const dz = Math.abs(acc.z - lastZ);
      const delta = dx + dy + dz;
      lastX = acc.x; lastY = acc.y; lastZ = acc.z; lastTime = now;
      if (delta > THRESHOLD) {
        shakeCount++;
        if (shakeResetTimer) clearTimeout(shakeResetTimer);
        shakeResetTimer = setTimeout(() => { shakeCount = 0; }, SHAKE_COOLDOWN * SHAKES_NEEDED);
        if (shakeCount >= SHAKES_NEEDED) { shakeCount = 0; onShake(); }
      }
    };

    const addListener = () => window.addEventListener("devicemotion", handler);
    if (typeof (DeviceMotionEvent as any).requestPermission === "function") {
      addListener();
    } else {
      addListener();
    }
    return () => {
      window.removeEventListener("devicemotion", handler);
      if (shakeResetTimer) clearTimeout(shakeResetTimer);
    };
  }, [onShake]);
}

// ─── Cloud Sync Status Indicator ──────────────────────────
function SyncIndicator() {
  const { status, lastSync } = useCloudSync();
  if (status === "off") return null;

  const config = {
    syncing: { icon: "⟳", color: "text-blue-400", label: "מסנכרן..." },
    synced: { icon: "☁️", color: "text-green-400", label: lastSync ? `סונכרן ${lastSync.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}` : "מסונכרן" },
    error: { icon: "⚠️", color: "text-red-400", label: "שגיאת סנכרון" },
    conflict: { icon: "⚡", color: "text-amber-400", label: "קונפליקט" },
  }[status];

  return (
    <div className={`flex items-center gap-1 text-[10px] ${config.color} min-h-[44px] px-1`} title={config.label}>
      <span className={status === "syncing" ? "animate-spin" : ""}>{config.icon}</span>
      <span className="hidden sm:inline">{config.label}</span>
    </div>
  );
}

// ─── Conflict Resolution Dialog ──────────────────────────
function ConflictDialog() {
  const { conflict, resolveConflict } = useCloudSync();
  if (!conflict) return null;

  const cloudTime = conflict.cloudUpdatedAt
    ? new Date(conflict.cloudUpdatedAt).toLocaleString("he-IL", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })
    : "לא ידוע";

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center px-4 pb-8 sm:pb-0 bg-black/50">
      <div className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-5 pt-5 pb-4">
          <div className="text-2xl mb-2">⚡</div>
          <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">קונפליקט סנכרון</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            נמצאו נתונים שונים במכשיר ובענן. איזו גרסה לשמור?
          </p>
        </div>
        <div className="px-5 pb-4 space-y-2">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl p-3">
            <p className="text-xs font-semibold text-blue-800 dark:text-blue-300">
              📱 מכשיר — {conflict.localCount} מטופלים
            </p>
            <p className="text-[11px] text-blue-600 dark:text-blue-400">הנתונים שנמצאים כרגע במכשיר הזה</p>
          </div>
          <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded-xl p-3">
            <p className="text-xs font-semibold text-purple-800 dark:text-purple-300">
              ☁️ ענן — {conflict.cloudCount} מטופלים
            </p>
            <p className="text-[11px] text-purple-600 dark:text-purple-400">עודכן: {cloudTime}</p>
          </div>
        </div>
        <div className="flex border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={() => resolveConflict("local")}
            className="flex-1 py-4 text-sm font-semibold text-blue-600 active:bg-blue-50 dark:active:bg-blue-900/20"
          >
            השאר מכשיר
          </button>
          <button
            onClick={() => resolveConflict("cloud")}
            className="flex-1 py-4 text-sm font-semibold text-purple-600 border-r border-gray-200 dark:border-gray-700 active:bg-purple-50 dark:active:bg-purple-900/20"
          >
            טען מענן
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main App Inner ──────────────────────────────────────
function AppInner() {
  const { toast: storageToast, showToast: showStorageToast } = useSimpleToast(4000);
  // Store showStorageToast in a ref so the event handler never needs it as a dep.
  // This prevents any risk of the effect re-running due to an unstable callback ref.
  const showStorageToastRef = useRef(showStorageToast);
  showStorageToastRef.current = showStorageToast;

  // Listen for storage-full event fired from patientsStore subscription (outside React)
  useEffect(() => {
    const handler = (e: Event) => {
      const msg = (e as CustomEvent<{ message: string }>).detail?.message;
      if (msg) showStorageToastRef.current(msg, "error");
    };
    window.addEventListener("toranot:storage-full", handler);
    return () => window.removeEventListener("toranot:storage-full", handler);
  }, []); // stable: ref never changes identity
  const [modal, setModal] = useState<Modal>("none");
  const { patients, activeSection } = usePatientsState();
  const dispatch = usePatientsDispatch();

  useEffect(() => { requestNotificationPermission(); }, []);
  useEffect(() => { syncReminders(patients); }, [patients]);
  // Cancel all reminder timers when the patient list is cleared
  useEffect(() => { if (patients.length === 0) cancelAllReminders(); }, [patients.length]);

  const openRef = useCallback(() => {
    setModal((prev) => (prev === "reference" ? "none" : "reference"));
  }, []);
  useShakeDetector(openRef);

  // Ctrl+K → search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setModal((prev) => (prev === "search" ? "none" : "search"));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const pendingStat = patients
    .flatMap((p) => [...p.tasks, ...p.generatedTasks.filter(t => !t.dismissed)])
    .filter((t) => !t.done && t.urgency === "stat").length;

  const handleBottomNav = useCallback((action: Modal) => {
    setModal((prev) => (prev === action ? "none" : action));
  }, []);

  return (
    // pb-[calc(56px+env(safe-area-inset-bottom))] gives room for the bottom nav + gesture bar.
    // This means the last patient card is never clipped by Android's gesture indicator.
    <div className="min-h-dvh bg-white dark:bg-gray-900 flex flex-col pb-[calc(56px+env(safe-area-inset-bottom))]">

      {/* ── Compact header: title + shift timer + overflow menu ── */}
      <header className="bg-slate-800 text-white px-3 py-2 safe-top border-b border-slate-700">
        <div className="w-full lg:max-w-6xl lg:mx-auto flex items-center gap-2">
          {/* Title — RTL so it sits on the right naturally */}
          <h1 className="text-lg font-bold tracking-tight flex-1">תורנות</h1>
          <p className="text-slate-400 text-xs hidden sm:inline">ניהול משמרת</p>

          {/* Stat badge — always visible in header so the count is at a glance */}
          {pendingStat > 0 && (
            <button
              onClick={() => setModal("dashboard")}
              className="flex items-center gap-1.5 min-h-[44px] px-3 rounded-lg bg-red-700/80 text-red-100 text-sm font-semibold active:bg-red-600 transition-colors"
              aria-label={`${pendingStat} משימות סטט פתוחות — פתח לוח`}
            >
              🔴 {pendingStat}
            </button>
          )}

          {/* Shift timer — compact */}
          <div className="min-h-[44px] flex items-center">
            <ShiftTimer />
          </div>

          {/* Cloud sync indicator */}
          <SyncIndicator />

          {/* Overflow menu — all secondary actions */}
          <OverflowMenu onOpenModal={(m) => setModal(m)} />
        </div>
      </header>

      <ShiftProgress />
      <ScanDiffBanner />

      <div className="w-full lg:max-w-6xl lg:mx-auto">
        <InputArea />
      </div>

      <SectionTabs />

      <main className="flex-1 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 lg:bg-white dark:lg:bg-gray-900">
        <div id={`panel-${activeSection}`} role="tabpanel" aria-label={SECTION_LABEL[activeSection] ?? activeSection} className="w-full lg:max-w-6xl lg:mx-auto">
          <PatientList />
        </div>
      </main>

      {/* ── Bottom navigation ── */}
      <BottomNav onAction={handleBottomNav} pendingStat={pendingStat} />

      {/* ── Modals (lazy-loaded — only fetched when first opened) ── */}
      <ModalErrorBoundary onClose={() => setModal("none")}>
        <Suspense fallback={null}>
          {modal === "reference"  && <QuickReference onClose={() => setModal("none")} />}
          {modal === "handoff"    && <HandoffSheet    onClose={() => setModal("none")} />}
          {modal === "dashboard"  && <TaskDashboard   onClose={() => setModal("none")} />}
          {modal === "history"    && <ShiftHistory    onClose={() => setModal("none")} />}
          {modal === "search"     && <GlobalSearch    onClose={() => setModal("none")} />}
          {modal === "qrsync"     && <QRSync          onClose={() => setModal("none")} />}
          {modal === "capture"    && <QuickCaptureSheet onClose={() => setModal("none")} />}
          {modal === "morning"    && <MorningReport   onClose={() => setModal("none")} />}
          {modal === "ivprotocols" && <IVProtocols    onClose={() => setModal("none")} />}
          {modal === "handoff_cloud" && <ShiftHandoffModal onClose={() => setModal("none")} />}
          {modal === "shared_shift" && <SharedShiftPanel onClose={() => setModal("none")} />}
        </Suspense>
      </ModalErrorBoundary>

      {/* Conflict resolution overlay — highest z-index */}
      <ConflictDialog />
      <SimpleToast state={storageToast} />
    </div>
  );
}

// ─── Modal Error Boundary — catches crashes in lazy modals without taking down the app ──

class ModalErrorBoundary extends Component<
  { children: React.ReactNode; onClose: () => void },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode; onClose: () => void }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[Toranot] Modal crashed:", error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-xs w-full text-center space-y-3 shadow-xl">
            <div className="text-3xl">⚠️</div>
            <p className="text-sm text-gray-700 dark:text-gray-300">שגיאה בטעינת החלון</p>
            <p className="text-xs text-gray-500 font-mono break-all">{this.state.error.message}</p>
            <button
              onClick={() => { this.setState({ error: null }); this.props.onClose(); }}
              className="w-full py-2 bg-violet-600 text-white rounded-xl font-bold text-sm"
            >
              סגור
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Error Boundary ───────────────────────────────────────

class AppErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: Error | null; componentStack?: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[Toranot] Uncaught error:", error, info.componentStack);
    this.setState({ componentStack: info.componentStack ?? "" });
  }
  render() {
    if (this.state.error) {
      // Extract the first meaningful component from the stack (the looping one)
      const stack = this.state.componentStack ?? "";
      const firstComponent = stack.split("\n").find(l => l.trim().startsWith("at ") && !l.includes("ErrorBoundary"))?.trim() ?? "";
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-6">
          <div className="max-w-sm w-full text-center space-y-4">
            <div className="text-5xl">⚠️</div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">שגיאה בלתי צפויה</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 font-mono break-all">
              {this.state.error.message}
            </p>
            {firstComponent && (
              <p className="text-xs text-red-500 font-mono break-all text-left dir-ltr">{firstComponent}</p>
            )}
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-violet-600 text-white rounded-xl font-bold"
            >
              טען מחדש
            </button>
            <a
              href="/reset.html"
              className="block w-full py-2 text-sm text-gray-500 dark:text-gray-400 underline"
            >
              נקיון מטמון מלא (אם הטעינה חוזרת)
            </a>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function App() {
  // Extract API key from URL hash on first load: #apikey=sk-ant-...
  // Hash fragments never hit server logs, analytics, or referrer headers.
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.includes("apikey=")) return;
    const match = hash.match(/apikey=([^&]+)/);
    if (match?.[1]) {
      try {
        localStorage.setItem("toranot-anthropic-key", decodeURIComponent(match[1]));
      } catch { /* quota */ }
      // Clean the URL so key isn't visible in address bar / history
      const cleanHash = hash.replace(/[#&]?apikey=[^&]+/, "").replace(/^#$/, "");
      window.history.replaceState(null, "", window.location.pathname + (cleanHash || ""));
    }
  }, []);

  return (
    <AppErrorBoundary>
      <PatientsProvider>
        <AppInner />
        <UndoToastContainer />
      </PatientsProvider>
    </AppErrorBoundary>
  );
}



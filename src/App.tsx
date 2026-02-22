import { useState, useEffect, useCallback } from "react";
import { PatientsProvider } from "./context/PatientsContext";
import { SectionTabs } from "./components/SectionTabs";
import { InputArea } from "./components/InputArea";
import { PatientList } from "./components/PatientList";
import { QuickReference } from "./components/QuickReference";
import { HandoffSheet } from "./components/HandoffSheet";
import { TaskDashboard } from "./components/TaskDashboard";
import { ShiftHistory } from "./components/ShiftHistory";
import { GlobalSearch } from "./components/GlobalSearch";
import { UndoToastContainer } from "./components/UndoToast";
import { ShiftTimer } from "./components/ShiftTimer";
import { usePatientsDispatch, usePatientsState } from "./context/PatientsContext";
import { QRSync } from "./components/QRSync";
import { requestNotificationPermission, syncReminders } from "./utils/taskReminders";

// ─── Shift Progress Bar ────────────────────────────────────
function ShiftProgress() {
  const { patients, activeSection } = usePatientsState();
  const sectionPatients = patients.filter((p) => p.section === activeSection);
  const allTasks = sectionPatients.flatMap((p) => [...p.tasks, ...p.generatedTasks]);
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

type ConfirmDialog =
  | { type: "none" }
  | { type: "archive"; label: string; incompleteTasks: Array<{ name: string; room: string | null; task: string }>; patientsNoTasks: Array<{ name: string; room: string | null }>; abnormalLabs: Array<{ name: string; room: string | null; lab: string }>; openStatCount: number }
  | { type: "clear" };

function ConfirmModal({
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
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center px-4 pb-8 sm:pb-0 bg-black/40">
      <div className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col">
        <div className="px-5 pt-5 pb-3 flex-shrink-0">
          <div className="text-2xl mb-2">💾</div>
          <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">
            שמור משמרת להיסטוריה
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{dialog.label}</p>
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
            {dialog.openStatCount > 0 ? "שמור למרות STAT פתוח" : hasIssues ? "שמור בכל זאת" : "שמור משמרת"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Overflow menu (secondary actions) ────────────────────
function OverflowMenu() {
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<ConfirmDialog>({ type: "none" });
  const { darkMode, showTomorrow, patients } = usePatientsState();
  const dispatch = usePatientsDispatch();

  const handleArchiveClick = () => {
    setOpen(false);
    const now = new Date();
    const date = now.toLocaleDateString("he-IL");
    const hour = now.getHours();
    const shiftType = hour >= 7 && hour < 15 ? "בוקר" : hour >= 15 && hour < 23 ? "ערב" : "לילה";
    const label = `${date} — ${shiftType}`;

    // Collect incomplete stat/urgent tasks
    const incompleteTasks = patients.flatMap((p) =>
      [...p.tasks, ...p.generatedTasks]
        .filter((t) => !t.done && (t.urgency === "stat" || t.urgency === "urgent"))
        .map((t) => ({ name: p.name ?? "?", room: p.room ?? null, task: t.text })),
    );

    // Patients with zero tasks (possibly forgotten)
    const patientsNoTasks = patients
      .filter((p) => [...p.tasks, ...p.generatedTasks].length === 0)
      .map((p) => ({ name: p.name ?? "?", room: p.room ?? null }));

    // Abnormal labs without a follow-up task mentioning that lab
    const abnormalLabs: Array<{ name: string; room: string | null; lab: string }> = [];
    for (const p of patients) {
      for (const lab of p.labs ?? []) {
        const val = lab.value;
        if (isNaN(val)) continue;
        const abnormal =
          (lab.label === "K" && (val < 3.0 || val > 5.5)) ||
          (lab.label === "Na" && (val < 130 || val > 150)) ||
          (lab.label === "Cr" && val > 1.5) ||
          (lab.label === "Hb" && val < 8) ||
          (lab.label === "PLT" && val < 50) ||
          (lab.label === "WBC" && val > 20) ||
          (lab.label === "INR" && val > 3) ||
          (lab.label === "glucose" && (val < 70 || val > 400)) ||
          (lab.label === "Lac" && val > 4) ||
          (lab.label === "pH" && (val < 7.25 || val > 7.55));
        if (abnormal) {
          const allTasks = [...p.tasks, ...p.generatedTasks];
          const hasFollowUp = allTasks.some((t) => !t.done && t.text.toLowerCase().includes(lab.label.toLowerCase()));
          if (!hasFollowUp) {
            abnormalLabs.push({ name: p.name ?? "?", room: p.room ?? null, lab: `${lab.label}: ${val}` });
          }
        }
      }
    }

    const openStatCount = incompleteTasks.filter((t) =>
      patients.some((p) =>
        [...p.tasks, ...p.generatedTasks].some((pt) => pt.text === t.task && pt.urgency === "stat" && !pt.done)
      )
    ).length;

    setDialog({ type: "archive", label, incompleteTasks, patientsNoTasks, abnormalLabs, openStatCount });
  };

  const handleClearClick = () => {
    setOpen(false);
    setDialog({ type: "clear" });
  };

  const handleConfirm = () => {
    if (dialog.type === "archive") {
      dispatch({ type: "ARCHIVE_SHIFT", label: dialog.label });
    } else if (dialog.type === "clear") {
      dispatch({ type: "CLEAR_ALL" });
    }
    setDialog({ type: "none" });
  };

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-200 active:bg-slate-700 transition-colors text-lg"
          aria-label="תפריט נוסף"
        >
          ···
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute left-0 top-full mt-1 z-50 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden min-w-[200px]">
              {/* Tomorrow toggle */}
              <button
                onClick={() => { dispatch({ type: "TOGGLE_SHOW_TOMORROW" }); setOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-sm text-slate-200 active:bg-slate-700 text-right"
              >
                <span className="text-base">📅</span>
                {showTomorrow ? "הסתר משימות מחר" : "הצג משימות מחר"}
              </button>
              {/* Dark mode */}
              <button
                onClick={() => { dispatch({ type: "TOGGLE_DARK_MODE" }); setOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-sm text-slate-200 active:bg-slate-700 border-t border-slate-700 text-right"
              >
                <span className="text-base">{darkMode ? "☀️" : "🌙"}</span>
                {darkMode ? "מצב יום" : "מצב לילה"}
              </button>
              {/* Archive shift */}
              {patients.length > 0 && (
                <button
                  onClick={handleArchiveClick}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-sm text-slate-200 active:bg-slate-700 border-t border-slate-700 text-right"
                >
                  <span className="text-base">💾</span>
                  שמור משמרת
                </button>
              )}
              {/* History */}
              <button
                onClick={() => setOpen(false)}
                id="overflow-history-trigger"
                className="w-full flex items-center gap-3 px-4 py-3.5 text-sm text-slate-200 active:bg-slate-700 border-t border-slate-700 text-right"
              >
                <span className="text-base">📁</span>
                היסטוריית משמרות
              </button>
              {/* QR Sync */}
              {patients.length > 0 && (
                <button
                  onClick={() => setOpen(false)}
                  id="overflow-qrsync-trigger"
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-sm text-slate-200 active:bg-slate-700 border-t border-slate-700 text-right"
                >
                  <span className="text-base">📲</span>
                  סנכרון QR
                </button>
              )}
              {/* Clear all */}
              {patients.length > 0 && (
                <button
                  onClick={handleClearClick}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-sm text-red-300 active:bg-red-900/30 border-t border-slate-700 text-right"
                >
                  <span className="text-base">🗑️</span>
                  מחק הכל
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Inline confirm modal — rendered outside the overflow container so z-index works */}
      <ConfirmModal
        dialog={dialog}
        onConfirm={handleConfirm}
        onCancel={() => setDialog({ type: "none" })}
      />
    </>
  );
}

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

// ─── Main App ──────────────────────────────────────────────
type Modal = "none" | "reference" | "handoff" | "dashboard" | "history" | "search" | "qrsync";

function AppInner() {
  const [modal, setModal] = useState<Modal>("none");
  const { patients } = usePatientsState();
  const dispatch = usePatientsDispatch();

  useEffect(() => { requestNotificationPermission(); }, []);
  useEffect(() => { syncReminders(patients); }, [patients]);

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

  // Listen for the history button inside the overflow menu
  // (avoids prop-drilling the setModal into OverflowMenu)
  useEffect(() => {
    const el = document.getElementById("overflow-history-trigger");
    if (!el) return;
    const handler = () => setModal("history");
    el.addEventListener("click", handler);
    return () => el.removeEventListener("click", handler);
  });

  // Listen for QR sync button
  useEffect(() => {
    const el = document.getElementById("overflow-qrsync-trigger");
    if (!el) return;
    const handler = () => setModal("qrsync");
    el.addEventListener("click", handler);
    return () => el.removeEventListener("click", handler);
  });

  const pendingStat = patients
    .flatMap((p) => [...p.tasks, ...p.generatedTasks])
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

          {/* Overflow menu — all secondary actions */}
          <OverflowMenu />
        </div>
      </header>

      <ShiftProgress />

      <div className="w-full lg:max-w-6xl lg:mx-auto">
        <InputArea />
      </div>

      <SectionTabs />

      <main className="flex-1 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 lg:bg-white dark:lg:bg-gray-900">
        <div className="w-full lg:max-w-6xl lg:mx-auto">
          <PatientList />
        </div>
      </main>

      {/* ── Bottom navigation ── */}
      <BottomNav onAction={handleBottomNav} pendingStat={pendingStat} />

      {/* ── Modals ── */}
      {modal === "reference"  && <QuickReference onClose={() => setModal("none")} />}
      {modal === "handoff"    && <HandoffSheet    onClose={() => setModal("none")} />}
      {modal === "dashboard"  && <TaskDashboard   onClose={() => setModal("none")} />}
      {modal === "history"    && <ShiftHistory    onClose={() => setModal("none")} />}
      {modal === "search"     && <GlobalSearch    onClose={() => setModal("none")} />}
      {modal === "qrsync"     && <QRSync          onClose={() => setModal("none")} />}
    </div>
  );
}

export function App() {
  return (
    <PatientsProvider>
      <AppInner />
      <UndoToastContainer />
    </PatientsProvider>
  );
}

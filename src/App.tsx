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
import { usePatientsDispatch, usePatientsState } from "./context/PatientsContext";

// ─── Header buttons ────────────────────────────────────────

function TomorrowToggle() {
  const { showTomorrow } = usePatientsState();
  const dispatch = usePatientsDispatch();
  return (
    <button
      onClick={() => dispatch({ type: "TOGGLE_SHOW_TOMORROW" })}
      className={
        "text-xs px-2 py-1 rounded-lg border transition-colors " +
        (showTomorrow
          ? "bg-amber-200 text-amber-900 border-amber-300"
          : "bg-slate-700 text-slate-200 border-slate-600 active:bg-slate-600")
      }
      title="הצג/הסתר משימות למחר"
    >
      מחר
    </button>
  );
}

function DarkModeToggle() {
  const { darkMode } = usePatientsState();
  const dispatch = usePatientsDispatch();
  return (
    <button
      onClick={() => dispatch({ type: "TOGGLE_DARK_MODE" })}
      className="text-xs px-2 py-1 rounded-lg border bg-slate-700 text-slate-200 border-slate-600 active:bg-slate-600 transition-colors"
      title="מצב לילה"
    >
      {darkMode ? "☀️" : "🌙"}
    </button>
  );
}

// ─── Shift Progress Bar ────────────────────────────────────

function ShiftProgress() {
  const { patients, activeSection } = usePatientsState();

  const sectionPatients = patients.filter(
    (p) => p.section === activeSection,
  );

  const allTasks = sectionPatients.flatMap((p) => [
    ...p.tasks,
    ...p.generatedTasks,
  ]);
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
        <span className="text-slate-300 tabular-nums whitespace-nowrap">
          {done}/{total}
        </span>
        {stat > 0 && (
          <span className="text-red-400 font-semibold tabular-nums">
            🔴 {stat}
          </span>
        )}
        {urgent > 0 && (
          <span className="text-amber-400 tabular-nums">
            🟡 {urgent}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Archive shift prompt ──────────────────────────────────

function ArchiveButton() {
  const dispatch = usePatientsDispatch();
  const { patients } = usePatientsState();

  if (patients.length === 0) return null;

  const handleArchive = () => {
    const now = new Date();
    const date = now.toLocaleDateString("he-IL");
    const hour = now.getHours();
    const shiftType =
      hour >= 7 && hour < 15 ? "בוקר" : hour >= 15 && hour < 23 ? "ערב" : "לילה";
    const label = `${date} — ${shiftType}`;

    if (confirm(`לשמור משמרת "${label}" להיסטוריה?`)) {
      dispatch({ type: "ARCHIVE_SHIFT", label });
    }
  };

  return (
    <button
      onClick={handleArchive}
      className="text-xs px-2 py-1 rounded-lg border bg-slate-700 text-slate-200 border-slate-600 active:bg-slate-600 transition-colors"
      title="שמור משמרת להיסטוריה"
    >
      💾
    </button>
  );
}

// ─── Shake-to-open Quick Reference ─────────────────────────
// Detects phone shake via accelerometer to open clinical reference hands-free

function useShakeDetector(onShake: () => void) {
  useEffect(() => {
    let lastX = 0, lastY = 0, lastZ = 0;
    let lastTime = 0;
    let shakeCount = 0;
    let shakeResetTimer: ReturnType<typeof setTimeout> | null = null;
    const THRESHOLD = 15; // acceleration threshold
    const SHAKE_COOLDOWN = 300; // ms between shakes
    const SHAKES_NEEDED = 3; // shakes to trigger

    const handler = (e: DeviceMotionEvent) => {
      const acc = e.accelerationIncludingGravity;
      if (!acc || acc.x == null || acc.y == null || acc.z == null) return;

      const now = Date.now();
      if (now - lastTime < 100) return; // throttle to 10Hz

      const dx = Math.abs(acc.x - lastX);
      const dy = Math.abs(acc.y - lastY);
      const dz = Math.abs(acc.z - lastZ);
      const delta = dx + dy + dz;

      lastX = acc.x; lastY = acc.y; lastZ = acc.z; lastTime = now;

      if (delta > THRESHOLD) {
        shakeCount++;
        if (shakeResetTimer) clearTimeout(shakeResetTimer);
        shakeResetTimer = setTimeout(() => { shakeCount = 0; }, SHAKE_COOLDOWN * SHAKES_NEEDED);

        if (shakeCount >= SHAKES_NEEDED) {
          shakeCount = 0;
          onShake();
        }
      }
    };

    // Request permission on iOS 13+
    const addListener = () => {
      window.addEventListener("devicemotion", handler);
    };

    if (typeof (DeviceMotionEvent as any).requestPermission === "function") {
      // Don't auto-request — permission will be requested on first tap of the app
      // For now, just try adding the listener
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

type Modal = "none" | "reference" | "handoff" | "dashboard" | "history" | "search";

function AppInner() {
  const [modal, setModal] = useState<Modal>("none");
  const { patients } = usePatientsState();
  const dispatch = usePatientsDispatch();

  // Shake-to-open Quick Reference
  const openRef = useCallback(() => {
    setModal((prev) => (prev === "reference" ? "none" : "reference"));
  }, []);
  useShakeDetector(openRef);

  // Keyboard shortcut: Ctrl+K or Cmd+K → Global Search
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

  // Global pending count for dashboard button badge
  const pendingStat = patients
    .flatMap((p) => [...p.tasks, ...p.generatedTasks])
    .filter((t) => !t.done && t.urgency === "stat").length;

  return (
    <div className="min-h-dvh bg-white dark:bg-gray-900 flex flex-col">
      <header className="bg-slate-800 text-white px-4 py-3 safe-top border-b border-slate-700">
        <div className="w-full lg:max-w-6xl lg:mx-auto flex items-baseline gap-3">
          <div className="ml-auto flex items-center gap-1.5 flex-wrap">
            {/* Global Search */}
            <button
              onClick={() => setModal("search")}
              className="text-xs px-2 py-1 rounded-lg border bg-violet-700 text-violet-100 border-violet-600 active:bg-violet-600 transition-colors"
              title="חיפוש מהיר (Ctrl+K)"
            >
              🔍
            </button>

            {/* Dashboard */}
            <button
              onClick={() => setModal("dashboard")}
              className="relative text-xs px-2 py-1 rounded-lg border bg-red-700 text-red-100 border-red-600 active:bg-red-600 transition-colors"
              title="לוח משימות — כל החולים"
            >
              🎯 לוח
              {pendingStat > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] rounded-full min-w-[1rem] h-4 flex items-center justify-center px-0.5">
                  {pendingStat}
                </span>
              )}
            </button>

            {/* Handoff */}
            <button
              onClick={() => setModal("handoff")}
              className="text-xs px-2 py-1 rounded-lg border bg-emerald-700 text-emerald-100 border-emerald-600 active:bg-emerald-600 transition-colors"
              title="סיכום משמרת — Sign Out"
            >
              📤 מסירה
            </button>

            {/* Quick Reference */}
            <button
              onClick={() => setModal("reference")}
              className="text-xs px-2 py-1 rounded-lg border bg-blue-700 text-blue-100 border-blue-600 active:bg-blue-600 transition-colors"
              title="עזר מהיר — פרוטוקולים, תרופות, מחשבונים"
            >
              📋 עזר
            </button>

            {/* Archive */}
            <ArchiveButton />

            {/* History */}
            <button
              onClick={() => setModal("history")}
              className="text-xs px-2 py-1 rounded-lg border bg-slate-700 text-slate-200 border-slate-600 active:bg-slate-600 transition-colors"
              title="היסטוריית משמרות"
            >
              📁
            </button>

            {/* Clear all */}
            <button
              onClick={() => {
                if (confirm("למחוק את כל המטופלים? (ודא ששמרת להיסטוריה)")) {
                  dispatch({ type: "CLEAR_ALL" });
                }
              }}
              className="text-xs px-2 py-1 rounded-lg border bg-red-800 text-red-200 border-red-700 active:bg-red-600 transition-colors"
              title="מחק הכל"
            >
              🗑️
            </button>

            <TomorrowToggle />
            <DarkModeToggle />
          </div>
          <h1 className="text-lg font-bold tracking-tight">תורנות</h1>
          <p className="text-slate-400 text-xs hidden sm:inline">ניהול משמרת</p>
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

      {/* Modals */}
      {modal === "reference" && <QuickReference onClose={() => setModal("none")} />}
      {modal === "handoff" && <HandoffSheet onClose={() => setModal("none")} />}
      {modal === "dashboard" && <TaskDashboard onClose={() => setModal("none")} />}
      {modal === "history" && <ShiftHistory onClose={() => setModal("none")} />}
      {modal === "search" && <GlobalSearch onClose={() => setModal("none")} />}
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

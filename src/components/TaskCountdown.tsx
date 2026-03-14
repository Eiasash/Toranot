import { useEffect, useState } from "react";
import type { Task } from "../types";

/**
 * TaskCountdown — shows a live countdown for tasks with dueAt.
 * Fires browser notification + vibration + SW alarm when time expires.
 */

function formatCountdown(ms: number): string {
  if (ms <= 0) return "⏰ עבר הזמן!";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function countdownColor(ms: number): string {
  if (ms <= 0) return "bg-red-600 text-white animate-pulse";
  if (ms < 5 * 60 * 1000) return "bg-red-500 text-white";
  if (ms < 15 * 60 * 1000) return "bg-orange-500 text-white";
  return "bg-amber-100 text-amber-800 border border-amber-300";
}

// Shared 1-second ticker using a module-level interval — one clock for all
// TaskCountdown instances instead of one setInterval per mounted component.
// Avoids O(n) timers when the patient list has many tasks with due times.
let _clockListeners = new Set<() => void>();
let _clockTimer: ReturnType<typeof setInterval> | null = null;

function useNow(): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const cb = () => setNow(Date.now());
    _clockListeners.add(cb);
    if (_clockTimer === null) {
      _clockTimer = setInterval(() => {
        const t = Date.now();
        for (const fn of _clockListeners) fn();
        void t;
      }, 1000);
    }
    return () => {
      _clockListeners.delete(cb);
      if (_clockListeners.size === 0 && _clockTimer !== null) {
        clearInterval(_clockTimer);
        _clockTimer = null;
      }
    };
  }, []);
  return now;
}

export function TaskCountdown({ task }: { task: Task }) {
  const now = useNow();

  const dueMs = task.dueAt ? new Date(task.dueAt).getTime() : 0;
  const remaining = dueMs - now;

  if (!task.dueAt || task.done) return null;

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono font-bold tabular-nums ${countdownColor(remaining)}`}
      title={`יעד: ${new Date(dueMs).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}`}
    >
      ⏱ {formatCountdown(remaining)}
    </span>
  );
}

// ── Auto-detect timer suggestion from task text ──────────────────────────────
// Returns suggested minutes based on clinical patterns in task text
export function suggestTimerMinutes(text: string): number | null {
  const t = text.toLowerCase();

  // Explicit patterns: "q1h", "q2h", "every 1 hour", "1h after", "in 30 min"
  const qMatch = t.match(/\bq(\d+(?:\.\d+)?)h\b/);
  if (qMatch) return Math.round(parseFloat(qMatch[1]) * 60);

  const inHMatch = t.match(/\bin\s+(\d+(?:\.\d+)?)\s*h(?:our)?/);
  if (inHMatch) return Math.round(parseFloat(inHMatch[1]) * 60);

  const inMinMatch = t.match(/\bin\s+(\d+)\s*(?:min|דק)/);
  if (inMinMatch) return parseInt(inMinMatch[1]);

  const afterHMatch = t.match(/(\d+(?:\.\d+)?)\s*h(?:our)?\s*after/);
  if (afterHMatch) return Math.round(parseFloat(afterHMatch[1]) * 60);

  // Clinical defaults
  if (/post.?transfusion|after.*transfusion|after.*completion/i.test(t)) return 60;
  if (/transfusion.*cbc|cbc.*transfusion/i.test(t)) return 60;
  if (/repeat.*ecg|ecg.*repeat/i.test(t)) return 30;
  if (/repeat.*bp|bp.*recheck|recheck.*bp/i.test(t)) return 30;
  if (/recheck.*k\+|k\+.*recheck|repeat.*k\+/i.test(t)) return 120;
  if (/bs\s*q|glucose\s*q|gluco.*check/i.test(t)) return 240;
  if (/recheck.*na|na.*recheck/i.test(t)) return 240;
  if (/recheck.*creatinine|cr.*recheck/i.test(t)) return 240;
  if (/vitals.*q|q.*vitals/i.test(t)) return 60;
  if (/urine.*output|i\/o.*check/i.test(t)) return 60;
  if (/iv\s*insulin.*gtt|insulin.*gtt/i.test(t)) return 60;

  return null;
}

/** Quick timer options — used in TaskItem */
export function getQuickDueOptions(): Array<{ label: string; minutes: number }> {
  return [
    { label: "15 דק׳", minutes: 15 },
    { label: "30 דק׳", minutes: 30 },
    { label: "1 שעה", minutes: 60 },
    { label: "2 שעות", minutes: 120 },
    { label: "4 שעות", minutes: 240 },
    { label: "6 שעות", minutes: 360 },
  ];
}

export function dueAtFromMinutes(minutes: number): string {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function fireAlarm(taskId: string, taskText: string) {
  if ("vibrate" in navigator) navigator.vibrate([300, 100, 300, 100, 300]);

  if ("Notification" in window && Notification.permission === "granted") {
    try {
      new Notification("⏰ תורנות — עבר הזמן!", {
        body: taskText,
        icon: "/icon-192.png",
        tag: `task-due-${taskId}`,
        requireInteraction: true,
      } as NotificationOptions);
      return;
    } catch { /* fallback */ }
  }

  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: "TASK_REMINDER",
      title: "⏰ תורנות — עבר הזמן!",
      body: taskText,
    });
  }
}

export function requestNotificationPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}

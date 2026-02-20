import { useEffect, useState } from "react";
import type { Task } from "../types";

/**
 * TaskCountdown — shows a live countdown for tasks with dueAt.
 * Fires a browser notification when time expires.
 * 
 * Used inside TaskItem when a task has a non-null dueAt.
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
  if (ms < 5 * 60 * 1000) return "bg-red-500 text-white"; // <5 min
  if (ms < 15 * 60 * 1000) return "bg-orange-500 text-white"; // <15 min
  return "bg-amber-100 text-amber-800 border border-amber-300";
}

export function TaskCountdown({ task }: { task: Task }) {
  const [now, setNow] = useState(Date.now());
  const [notified, setNotified] = useState(false);

  const dueMs = task.dueAt ? new Date(task.dueAt).getTime() : 0;
  const remaining = dueMs - now;

  useEffect(() => {
    if (!task.dueAt || task.done) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [task.dueAt, task.done]);

  // Fire notification when time is up
  useEffect(() => {
    if (notified || task.done || remaining > 0) return;
    if (!task.dueAt) return;
    setNotified(true);
    fireNotification(task.text);
  }, [remaining, notified, task.done, task.dueAt, task.text]);

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

/** Quick timer setter — returns ISO string for dueAt */
export function getQuickDueOptions(): Array<{ label: string; minutes: number }> {
  return [
    { label: "10 דק׳", minutes: 10 },
    { label: "30 דק׳", minutes: 30 },
    { label: "1 שעה", minutes: 60 },
    { label: "2 שעות", minutes: 120 },
    { label: "4 שעות", minutes: 240 },
  ];
}

export function dueAtFromMinutes(minutes: number): string {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function fireNotification(taskText: string) {
  // Try browser notification
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("⏰ תורנות — משימה!", {
      body: taskText,
      icon: "/Toranot/icon-192.png",
      tag: `task-due-${taskText.slice(0, 20)}`,
      requireInteraction: true,
    });
  }

  // Also try vibration for mobile
  if ("vibrate" in navigator) {
    navigator.vibrate([200, 100, 200, 100, 200]);
  }
}

/** Request notification permission (call once on app load) */
export function requestNotificationPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}

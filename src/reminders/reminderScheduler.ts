/**
 * Centralized reminder scheduler (Phase 2)
 *
 * Replaces the per-task setTimeout model in taskReminders.ts and the
 * local notified-state in TaskCountdown.tsx.
 *
 * Design decisions:
 * - One global 30s tick polls all due tasks — no n*setInterval overhead.
 * - Per-task notified state is tracked here, not in React component state,
 *   so snooze resets fire correctly (component re-mount cannot reset them).
 * - Re-syncs on visibilitychange and focus events — catches the case where
 *   the user backgrounds the app and returns after a task became due.
 * - SW alarms are NOT claimed as persistent — the SW may be killed at any
 *   time. This scheduler fires foreground-only notifications reliably.
 */

import type { PatientEntry } from "../types";

const TICK_MS = 30_000;

type DueTask = {
  taskId: string;
  patientName: string;
  taskText: string;
  dueAt: string;
  lastNotifiedAt: number;
};

// In-memory store: taskId → last notification timestamp (0 = never notified)
const notifiedAt = new Map<string, number>();

// Current patient snapshot (updated via resync)
let _patients: PatientEntry[] = [];

let _tickerId: ReturnType<typeof setInterval> | null = null;

// ─── Public API ──────────────────────────────────────────────────────────────

/** Start the scheduler. Call once on app init. Idempotent. */
export function startReminderScheduler(): void {
  if (_tickerId !== null) return; // already running
  _tickerId = setInterval(runCheck, TICK_MS);
  // Also re-check on visibility restored and window focus
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("focus", runCheck);
  // Restore persisted due tasks and fire any that became overdue while app was closed
  restoreAndCheckOverdue();
}

/** Stop the scheduler and clear all tracked state. */
export function stopReminderScheduler(): void {
  if (_tickerId !== null) {
    clearInterval(_tickerId);
    _tickerId = null;
  }
  document.removeEventListener("visibilitychange", onVisibility);
  window.removeEventListener("focus", runCheck);
  notifiedAt.clear();
  _patients = [];
}

/**
 * Update the patient list and run an immediate check.
 * Call whenever patients state changes (replace the syncReminders call in App.tsx).
 */
export function resyncReminders(patients: PatientEntry[]): void {
  _patients = patients;
  pruneNotifiedMap();
  persistDueTasks();
  runCheck();
}

/**
 * Reset notification state for a task (e.g. after snooze or dueAt change).
 * Causes the task to alert again when it next becomes due.
 */
export function resetTaskReminder(taskId: string): void {
  notifiedAt.delete(taskId);
  runCheck();
}

/** Cancel tracking for a task (done or removed). */
export function clearTaskReminder(taskId: string): void {
  notifiedAt.delete(taskId);
}

// ─── Internal ────────────────────────────────────────────────────────────────

function onVisibility() {
  if (document.visibilityState === "visible") runCheck();
}

function runCheck(): void {
  const now = Date.now();
  const due = collectDueTasks(now);
  for (const d of due) {
    fireNotification(d);
    notifiedAt.set(d.taskId, now);
  }
}

function collectDueTasks(now: number): DueTask[] {
  const result: DueTask[] = [];
  for (const p of _patients) {
    const allTasks = [...p.tasks, ...p.generatedTasks];
    for (const t of allTasks) {
      if (t.done || !t.dueAt) continue;
      const dueTime = new Date(t.dueAt).getTime();
      if (dueTime > now) continue; // not yet due
      const lastFired = notifiedAt.get(t.id) ?? 0;
      if (lastFired > 0) continue; // already notified since last reset
      result.push({
        taskId: t.id,
        patientName: p.name ?? "חולה",
        taskText: t.text,
        dueAt: t.dueAt,
        lastNotifiedAt: lastFired,
      });
    }
  }
  return result;
}

/** Remove entries for task IDs that no longer exist in any patient */
function pruneNotifiedMap(): void {
  if (notifiedAt.size === 0) return;
  const allTaskIds = new Set<string>();
  for (const p of _patients) {
    for (const t of [...p.tasks, ...p.generatedTasks]) allTaskIds.add(t.id);
  }
  for (const id of notifiedAt.keys()) {
    if (!allTaskIds.has(id)) notifiedAt.delete(id);
  }
}

function fireNotification(d: DueTask): void {
  const timeStr = new Date(d.dueAt).toLocaleTimeString("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const title = `⏰ ${d.patientName}`;
  const body = `${d.taskText} — ${timeStr}`;

  if ("vibrate" in navigator) navigator.vibrate([300, 100, 300, 100, 300]);

  // Prefer SW showNotification (works when tab is backgrounded on Android)
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: "TASK_REMINDER",
      title,
      body,
      tag: `task-due-${d.taskId}`,
    });
    return;
  }

  if ("Notification" in window && Notification.permission === "granted") {
    try {
      const n = new Notification(title, {
        body,
        icon: "/icon-192.png",
        tag: `task-due-${d.taskId}`,
        requireInteraction: true,
      } as NotificationOptions);
      setTimeout(() => n.close(), 60_000);
    } catch { /* fall through */ }
  }
}

// ─── Persistence — survive page reload ───────────────────────────────────────
//
// Stores due-task timestamps in localStorage. On next app boot, any tasks that
// became overdue while the app was closed will fire immediately.
// Also posts to SW so it can check on its own activation events.

const STORAGE_KEY = "toranot_due_tasks";

interface PersistedDueTask {
  taskId: string;
  patientName: string;
  taskText: string;
  dueAt: string;
}

function persistDueTasks(): void {
  try {
    const dueTasks: PersistedDueTask[] = [];
    for (const p of _patients) {
      const allTasks = [...p.tasks, ...p.generatedTasks];
      for (const t of allTasks) {
        if (t.done || !t.dueAt) continue;
        dueTasks.push({
          taskId: t.id,
          patientName: p.name ?? "חולה",
          taskText: t.text,
          dueAt: t.dueAt,
        });
      }
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dueTasks));

    // Also send to SW for checking on activation
    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: "PERSIST_DUE_TASKS",
        tasks: dueTasks,
      });
    }
  } catch { /* localStorage full — non-fatal */ }
}

function restoreAndCheckOverdue(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const tasks: PersistedDueTask[] = JSON.parse(raw);
    const now = Date.now();
    for (const t of tasks) {
      const dueTime = new Date(t.dueAt).getTime();
      if (dueTime <= now && !notifiedAt.has(t.taskId)) {
        // This task was due while app was closed — fire immediately
        fireNotification({
          taskId: t.taskId,
          patientName: t.patientName,
          taskText: t.taskText,
          dueAt: t.dueAt,
          lastNotifiedAt: 0,
        });
        notifiedAt.set(t.taskId, now);
      }
    }
  } catch { /* corrupt data — ignore */ }
}

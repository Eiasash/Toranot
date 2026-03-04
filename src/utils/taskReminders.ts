/**
 * Task Reminders via Notification API
 * 
 * Schedules browser/PWA notifications for tasks with dueAt times.
 * Falls back to in-app toast if Notification permission denied.
 */

type ScheduledReminder = {
  taskId: string;
  patientName: string;
  taskText: string;
  dueAt: string;
  timerId: ReturnType<typeof setTimeout>;
};

const activeReminders = new Map<string, ScheduledReminder>();

/** Request notification permission (call once on app init) */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

/** Schedule a reminder for a task */
export function scheduleTaskReminder(
  taskId: string,
  patientName: string,
  taskText: string,
  dueAt: string,
  reminderMinsBefore = 5,
) {
  // Cancel existing reminder for this task
  cancelTaskReminder(taskId);

  const dueTime = new Date(dueAt).getTime();
  const reminderTime = dueTime - reminderMinsBefore * 60 * 1000;
  const now = Date.now();
  const delay = reminderTime - now;

  // If the due time is already past, fire immediately
  if (dueTime < now) {
    fireReminder(taskId, patientName, taskText, dueAt);
    return;
  }

  // If reminder time is past but due time is still future, fire now
  if (delay < 0) {
    fireReminder(taskId, patientName, taskText, dueAt);
    return;
  }

  const timerId = setTimeout(() => {
    fireReminder(taskId, patientName, taskText, dueAt);
    activeReminders.delete(taskId);
  }, delay);

  activeReminders.set(taskId, {
    taskId,
    patientName,
    taskText,
    dueAt,
    timerId,
  });
}

/** Cancel a scheduled reminder */
export function cancelTaskReminder(taskId: string) {
  const existing = activeReminders.get(taskId);
  if (existing) {
    clearTimeout(existing.timerId);
    activeReminders.delete(taskId);
  }
}

/** Cancel all reminders */
export function cancelAllReminders() {
  for (const [, reminder] of activeReminders) {
    clearTimeout(reminder.timerId);
  }
  activeReminders.clear();
}

/** Fire a notification */
function fireReminder(
  _taskId: string,
  patientName: string,
  taskText: string,
  dueAt: string,
) {
  const timeStr = new Date(dueAt).toLocaleTimeString("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const title = `⏰ ${patientName}`;
  const body = `${taskText} — ${timeStr}`;

  // Try native notification
  if ("Notification" in window && Notification.permission === "granted") {
    try {
      const n = new Notification(title, {
        body,
        icon: "/icon-192.png",
        tag: `task-${_taskId}`,
        requireInteraction: true,
      } as NotificationOptions);
      // Auto-close after 30s
      setTimeout(() => n.close(), 30000);
      return;
    } catch {
      // Fallback below
    }
  }

  // Fallback: use service worker notification if available
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: "TASK_REMINDER",
      title,
      body,
    });
    return;
  }

  // Last resort: alert (not ideal but works)
  // The UndoToast system could be used here in a future iteration
  console.info(`[Reminder] ${title}: ${body}`);
}

/**
 * Sync reminders with current patient list.
 * Call after state changes to ensure reminders match current task due times.
 */
export function syncReminders(
  patients: Array<{
    id: string;
    name: string | null;
    tasks: Array<{ id: string; text: string; done: boolean; dueAt?: string | null }>;
    generatedTasks: Array<{ id: string; text: string; done: boolean; dueAt?: string | null }>;
  }>,
) {
  // Build set of currently needed reminders
  const neededTaskIds = new Set<string>();

  for (const p of patients) {
    const allTasks = [...p.tasks, ...p.generatedTasks];
    for (const t of allTasks) {
      if (!t.done && t.dueAt) {
        neededTaskIds.add(t.id);
        // Schedule if not already scheduled (or if time changed)
        const existing = activeReminders.get(t.id);
        if (!existing || existing.dueAt !== t.dueAt) {
          scheduleTaskReminder(t.id, p.name ?? "חולה", t.text, t.dueAt);
        }
      }
    }
  }

  // Cancel reminders for tasks that no longer need them
  for (const [taskId] of activeReminders) {
    if (!neededTaskIds.has(taskId)) {
      cancelTaskReminder(taskId);
    }
  }
}

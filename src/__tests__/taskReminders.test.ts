import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  scheduleTaskReminder,
  cancelTaskReminder,
  cancelAllReminders,
  syncReminders,
} from "../utils/taskReminders";

// Stub browser globals that fireReminder uses (window, Notification, navigator).
// `vi.stubGlobal` works even for read-only globals like `navigator`.
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("Notification", { permission: "denied" });
  vi.stubGlobal("navigator", { serviceWorker: {} });
});

afterEach(() => {
  cancelAllReminders();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("scheduleTaskReminder", () => {
  it("fires after the correct delay", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const now = Date.now();
    // Due 10 minutes from now, reminder 5 mins before = fires in 5 mins
    const dueAt = new Date(now + 10 * 60 * 1000).toISOString();

    scheduleTaskReminder("t1", "כהן יוסף", "בדיקת דם", dueAt, 5);

    // Not fired yet at 4 minutes
    vi.advanceTimersByTime(4 * 60 * 1000);
    expect(consoleSpy).not.toHaveBeenCalled();

    // Fires at 5 minutes
    vi.advanceTimersByTime(1 * 60 * 1000);
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy.mock.calls[0][0]).toContain("כהן יוסף");
    expect(consoleSpy.mock.calls[0][0]).toContain("בדיקת דם");

    consoleSpy.mockRestore();
  });

  it("does not fire for past due times", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const pastDue = new Date(Date.now() - 60 * 1000).toISOString();

    scheduleTaskReminder("t1", "כהן", "task", pastDue, 5);

    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(consoleSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it("replaces existing reminder for the same task", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const now = Date.now();

    // Schedule first reminder: due in 10 min, fires in 5 min
    const dueAt1 = new Date(now + 10 * 60 * 1000).toISOString();
    scheduleTaskReminder("t1", "כהן", "old task", dueAt1, 5);

    // Replace with new reminder: due in 20 min, fires in 15 min
    const dueAt2 = new Date(now + 20 * 60 * 1000).toISOString();
    scheduleTaskReminder("t1", "כהן", "new task", dueAt2, 5);

    // At 5 min, old reminder should NOT fire (was cancelled)
    vi.advanceTimersByTime(5 * 60 * 1000);
    expect(consoleSpy).not.toHaveBeenCalled();

    // At 15 min, new reminder fires
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy.mock.calls[0][0]).toContain("new task");

    consoleSpy.mockRestore();
  });

  it("uses default 5 minute reminderMinsBefore", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const now = Date.now();
    const dueAt = new Date(now + 6 * 60 * 1000).toISOString();

    // No explicit reminderMinsBefore — defaults to 5
    scheduleTaskReminder("t1", "כהן", "task", dueAt);

    // Should fire at 1 min (due in 6, remind 5 before = 1 min delay)
    vi.advanceTimersByTime(59 * 1000);
    expect(consoleSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2 * 1000);
    expect(consoleSpy).toHaveBeenCalledTimes(1);

    consoleSpy.mockRestore();
  });
});

describe("cancelTaskReminder", () => {
  it("cancels a scheduled reminder", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const dueAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    scheduleTaskReminder("t1", "כהן", "task", dueAt, 5);
    cancelTaskReminder("t1");

    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(consoleSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it("does nothing for non-existent task id", () => {
    expect(() => cancelTaskReminder("nonexistent")).not.toThrow();
  });
});

describe("cancelAllReminders", () => {
  it("cancels all active reminders", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const dueAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    scheduleTaskReminder("t1", "כהן", "task 1", dueAt, 5);
    scheduleTaskReminder("t2", "לוי", "task 2", dueAt, 5);
    cancelAllReminders();

    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(consoleSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});

describe("syncReminders", () => {
  it("schedules reminders for undone tasks with dueAt", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const dueAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    syncReminders([{
      id: "p1",
      name: "כהן יוסף",
      tasks: [{ id: "t1", text: "בדיקת דם", done: false, dueAt }],
      generatedTasks: [],
    }]);

    vi.advanceTimersByTime(5 * 60 * 1000);
    expect(consoleSpy).toHaveBeenCalledTimes(1);

    consoleSpy.mockRestore();
  });

  it("does not schedule reminders for done tasks", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const dueAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    syncReminders([{
      id: "p1",
      name: "כהן",
      tasks: [{ id: "t1", text: "task", done: true, dueAt }],
      generatedTasks: [],
    }]);

    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(consoleSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it("does not schedule reminders for tasks without dueAt", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    syncReminders([{
      id: "p1",
      name: "כהן",
      tasks: [{ id: "t1", text: "task", done: false, dueAt: null }],
      generatedTasks: [],
    }]);

    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(consoleSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it("cancels reminders for tasks no longer in the list", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const dueAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    syncReminders([{
      id: "p1",
      name: "כהן",
      tasks: [{ id: "t1", text: "task", done: false, dueAt }],
      generatedTasks: [],
    }]);

    syncReminders([{
      id: "p1",
      name: "כהן",
      tasks: [],
      generatedTasks: [],
    }]);

    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(consoleSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it("cancels reminders when task becomes done", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const dueAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    syncReminders([{
      id: "p1",
      name: "כהן",
      tasks: [{ id: "t1", text: "task", done: false, dueAt }],
      generatedTasks: [],
    }]);

    syncReminders([{
      id: "p1",
      name: "כהן",
      tasks: [{ id: "t1", text: "task", done: true, dueAt }],
      generatedTasks: [],
    }]);

    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(consoleSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it("reschedules when dueAt changes", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const now = Date.now();
    const dueAt1 = new Date(now + 10 * 60 * 1000).toISOString();
    const dueAt2 = new Date(now + 20 * 60 * 1000).toISOString();

    syncReminders([{
      id: "p1",
      name: "כהן",
      tasks: [{ id: "t1", text: "task", done: false, dueAt: dueAt1 }],
      generatedTasks: [],
    }]);

    syncReminders([{
      id: "p1",
      name: "כהן",
      tasks: [{ id: "t1", text: "task", done: false, dueAt: dueAt2 }],
      generatedTasks: [],
    }]);

    // At 5 min, old reminder should NOT fire
    vi.advanceTimersByTime(5 * 60 * 1000);
    expect(consoleSpy).not.toHaveBeenCalled();

    // At 15 min, new reminder fires
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(consoleSpy).toHaveBeenCalledTimes(1);

    consoleSpy.mockRestore();
  });

  it("handles generatedTasks the same as regular tasks", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const dueAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    syncReminders([{
      id: "p1",
      name: "כהן",
      tasks: [],
      generatedTasks: [{ id: "g1", text: "generated", done: false, dueAt }],
    }]);

    vi.advanceTimersByTime(5 * 60 * 1000);
    expect(consoleSpy).toHaveBeenCalledTimes(1);

    consoleSpy.mockRestore();
  });

  it("uses patient name in the reminder (falls back to חולה for null)", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const dueAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    syncReminders([{
      id: "p1",
      name: null,
      tasks: [{ id: "t1", text: "task", done: false, dueAt }],
      generatedTasks: [],
    }]);

    vi.advanceTimersByTime(5 * 60 * 1000);
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy.mock.calls[0][0]).toContain("חולה");

    consoleSpy.mockRestore();
  });

  it("handles empty patient list", () => {
    expect(() => syncReminders([])).not.toThrow();
  });

  it("handles multiple patients with multiple tasks", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const dueAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    syncReminders([
      {
        id: "p1",
        name: "כהן",
        tasks: [{ id: "t1", text: "task 1", done: false, dueAt }],
        generatedTasks: [{ id: "g1", text: "gen 1", done: false, dueAt }],
      },
      {
        id: "p2",
        name: "לוי",
        tasks: [{ id: "t2", text: "task 2", done: false, dueAt }],
        generatedTasks: [],
      },
    ]);

    vi.advanceTimersByTime(5 * 60 * 1000);
    expect(consoleSpy).toHaveBeenCalledTimes(3);

    consoleSpy.mockRestore();
  });
});

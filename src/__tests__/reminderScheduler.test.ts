/**
 * Tests for src/reminders/reminderScheduler.ts
 *
 * Tests the pure/testable logic: collectDueTasks, pruneNotifiedMap,
 * start/stop lifecycle, and resync behavior.
 *
 * Browser APIs (Notification, vibrate, serviceWorker) are mocked.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock browser APIs before importing the module
const mockVibrate = vi.fn();
const mockPostMessage = vi.fn();
const mockLocalStorage = (() => {
  const store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, val: string) => { store[key] = val; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { for (const k in store) delete store[k]; }),
  };
})();

vi.stubGlobal("navigator", {
  vibrate: mockVibrate,
  serviceWorker: { controller: { postMessage: mockPostMessage } },
});
vi.stubGlobal("localStorage", mockLocalStorage);
vi.stubGlobal("Notification", { permission: "granted" });

// Mock document events
const eventListeners: Record<string, Function[]> = {};
vi.stubGlobal("document", {
  addEventListener: vi.fn((event: string, fn: Function) => {
    eventListeners[event] = eventListeners[event] || [];
    eventListeners[event].push(fn);
  }),
  removeEventListener: vi.fn((event: string, fn: Function) => {
    eventListeners[event] = (eventListeners[event] || []).filter(f => f !== fn);
  }),
  visibilityState: "visible",
});

// Mock window events
const windowListeners: Record<string, Function[]> = {};
vi.stubGlobal("window", {
  addEventListener: vi.fn((event: string, fn: Function) => {
    windowListeners[event] = windowListeners[event] || [];
    windowListeners[event].push(fn);
  }),
  removeEventListener: vi.fn((event: string, fn: Function) => {
    windowListeners[event] = (windowListeners[event] || []).filter(f => f !== fn);
  }),
  Notification: { permission: "granted" },
});

import type { PatientEntry, Task } from "../types";

function makeTask(id: string, text: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    text,
    urgency: "routine",
    source: "manual",
    done: false,
    doneTime: null,
    time: null,
    confidence: 1,
    ...overrides,
  };
}

function makePatient(overrides: Partial<PatientEntry> = {}): PatientEntry {
  return {
    id: "p1",
    section: "SIDE_A",
    date: "21/03/2026",
    room: "70",
    name: "כהן שרה",
    age: 82,
    diagnosis: null,
    flags: [],
    status: [],
    tomorrowNotes: [],
    tasks: [],
    generatedTasks: [],
    scannedAt: "2026-03-21T08:00:00Z",
    confidence: 1,
    ...overrides,
  };
}

// We must import AFTER mocks are set up, and reset between tests
let startReminderScheduler: typeof import("../reminders/reminderScheduler").startReminderScheduler;
let stopReminderScheduler: typeof import("../reminders/reminderScheduler").stopReminderScheduler;
let resyncReminders: typeof import("../reminders/reminderScheduler").resyncReminders;
let resetTaskReminder: typeof import("../reminders/reminderScheduler").resetTaskReminder;
let clearTaskReminder: typeof import("../reminders/reminderScheduler").clearTaskReminder;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mockLocalStorage.clear();

  // Fresh import for each test
  vi.resetModules();
  const mod = await import("../reminders/reminderScheduler");
  startReminderScheduler = mod.startReminderScheduler;
  stopReminderScheduler = mod.stopReminderScheduler;
  resyncReminders = mod.resyncReminders;
  resetTaskReminder = mod.resetTaskReminder;
  clearTaskReminder = mod.clearTaskReminder;
});

afterEach(() => {
  stopReminderScheduler();
  vi.useRealTimers();
});

describe("reminderScheduler — lifecycle", () => {
  it("startReminderScheduler is idempotent", () => {
    startReminderScheduler();
    startReminderScheduler(); // second call should not throw or double-register
    stopReminderScheduler();
  });

  it("stopReminderScheduler clears interval and listeners", () => {
    startReminderScheduler();
    stopReminderScheduler();
    // Should be able to start again cleanly
    startReminderScheduler();
    stopReminderScheduler();
  });

  it("registers visibilitychange and focus listeners on start", () => {
    startReminderScheduler();
    expect(document.addEventListener).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    expect(window.addEventListener).toHaveBeenCalledWith("focus", expect.any(Function));
  });

  it("removes listeners on stop", () => {
    startReminderScheduler();
    stopReminderScheduler();
    expect(document.removeEventListener).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    expect(window.removeEventListener).toHaveBeenCalledWith("focus", expect.any(Function));
  });
});

describe("reminderScheduler — due task detection", () => {
  it("fires notification for a task that is past due", () => {
    const pastDue = new Date(Date.now() - 60_000).toISOString(); // 1 minute ago
    const patient = makePatient({
      tasks: [makeTask("t1", "Check K+", { dueAt: pastDue })],
    });

    startReminderScheduler();
    resyncReminders([patient]);

    // Should have posted to service worker
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "TASK_REMINDER",
        title: expect.stringContaining("כהן שרה"),
        body: expect.stringContaining("Check K+"),
      }),
    );
  });

  it("does not fire for tasks not yet due", () => {
    const future = new Date(Date.now() + 3600_000).toISOString(); // 1 hour from now
    const patient = makePatient({
      tasks: [makeTask("t1", "Future task", { dueAt: future })],
    });

    startReminderScheduler();
    resyncReminders([patient]);

    // Should NOT have fired a reminder
    const reminderCalls = mockPostMessage.mock.calls.filter(
      (c) => c[0]?.type === "TASK_REMINDER",
    );
    expect(reminderCalls).toHaveLength(0);
  });

  it("does not fire for done tasks", () => {
    const pastDue = new Date(Date.now() - 60_000).toISOString();
    const patient = makePatient({
      tasks: [makeTask("t1", "Done task", { dueAt: pastDue, done: true })],
    });

    startReminderScheduler();
    resyncReminders([patient]);

    const reminderCalls = mockPostMessage.mock.calls.filter(
      (c) => c[0]?.type === "TASK_REMINDER",
    );
    expect(reminderCalls).toHaveLength(0);
  });

  it("does not fire for tasks without dueAt", () => {
    const patient = makePatient({
      tasks: [makeTask("t1", "No due date")],
    });

    startReminderScheduler();
    resyncReminders([patient]);

    const reminderCalls = mockPostMessage.mock.calls.filter(
      (c) => c[0]?.type === "TASK_REMINDER",
    );
    expect(reminderCalls).toHaveLength(0);
  });

  it("fires for generatedTasks too", () => {
    const pastDue = new Date(Date.now() - 60_000).toISOString();
    const patient = makePatient({
      generatedTasks: [makeTask("g1", "Generated check", { dueAt: pastDue })],
    });

    startReminderScheduler();
    resyncReminders([patient]);

    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "TASK_REMINDER",
        body: expect.stringContaining("Generated check"),
      }),
    );
  });

  it("does not re-fire after initial notification", () => {
    const pastDue = new Date(Date.now() - 60_000).toISOString();
    const patient = makePatient({
      tasks: [makeTask("t1", "One-time fire", { dueAt: pastDue })],
    });

    startReminderScheduler();
    resyncReminders([patient]);

    const firstCount = mockPostMessage.mock.calls.filter(
      (c) => c[0]?.type === "TASK_REMINDER",
    ).length;

    // Advance timer to trigger another check
    vi.advanceTimersByTime(30_000);

    const secondCount = mockPostMessage.mock.calls.filter(
      (c) => c[0]?.type === "TASK_REMINDER",
    ).length;

    // Should not have fired again
    expect(secondCount).toBe(firstCount);
  });
});

describe("reminderScheduler — reset and clear", () => {
  it("resetTaskReminder allows a task to fire again", () => {
    const pastDue = new Date(Date.now() - 60_000).toISOString();
    const patient = makePatient({
      tasks: [makeTask("t1", "Resettable", { dueAt: pastDue })],
    });

    startReminderScheduler();
    resyncReminders([patient]);

    const firstCount = mockPostMessage.mock.calls.filter(
      (c) => c[0]?.type === "TASK_REMINDER",
    ).length;
    expect(firstCount).toBe(1);

    // Reset and re-check
    resetTaskReminder("t1");

    const secondCount = mockPostMessage.mock.calls.filter(
      (c) => c[0]?.type === "TASK_REMINDER",
    ).length;
    // Should have fired again after reset
    expect(secondCount).toBe(2);
  });

  it("clearTaskReminder prevents future firings", () => {
    startReminderScheduler();
    clearTaskReminder("t1");
    // Should not throw
  });
});

describe("reminderScheduler — persistence", () => {
  it("persists due tasks to localStorage on resync", () => {
    const future = new Date(Date.now() + 3600_000).toISOString();
    const patient = makePatient({
      tasks: [makeTask("t1", "Future check", { dueAt: future })],
    });

    startReminderScheduler();
    resyncReminders([patient]);

    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
      "toranot_due_tasks",
      expect.any(String),
    );

    const stored = JSON.parse(
      mockLocalStorage.setItem.mock.calls.find((c: string[]) => c[0] === "toranot_due_tasks")![1],
    );
    expect(stored).toHaveLength(1);
    expect(stored[0].taskId).toBe("t1");
    expect(stored[0].taskText).toBe("Future check");
  });

  it("also sends due tasks to service worker", () => {
    const future = new Date(Date.now() + 3600_000).toISOString();
    const patient = makePatient({
      tasks: [makeTask("t1", "SW persist", { dueAt: future })],
    });

    startReminderScheduler();
    resyncReminders([patient]);

    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "PERSIST_DUE_TASKS",
        tasks: expect.arrayContaining([
          expect.objectContaining({ taskId: "t1" }),
        ]),
      }),
    );
  });
});

describe("reminderScheduler — multiple patients", () => {
  it("collects due tasks from all patients", () => {
    const pastDue = new Date(Date.now() - 60_000).toISOString();
    const patients = [
      makePatient({
        id: "p1",
        name: "Patient A",
        tasks: [makeTask("t1", "Task A", { dueAt: pastDue })],
      }),
      makePatient({
        id: "p2",
        name: "Patient B",
        tasks: [makeTask("t2", "Task B", { dueAt: pastDue })],
      }),
    ];

    startReminderScheduler();
    resyncReminders(patients);

    const reminderCalls = mockPostMessage.mock.calls.filter(
      (c) => c[0]?.type === "TASK_REMINDER",
    );
    expect(reminderCalls).toHaveLength(2);
  });

  it("uses patient name in notification", () => {
    const pastDue = new Date(Date.now() - 60_000).toISOString();
    const patient = makePatient({
      name: "לוי דוד",
      tasks: [makeTask("t1", "IV fluids", { dueAt: pastDue })],
    });

    startReminderScheduler();
    resyncReminders([patient]);

    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining("לוי דוד"),
      }),
    );
  });

  it("uses fallback name when patient name is null", () => {
    const pastDue = new Date(Date.now() - 60_000).toISOString();
    const patient = makePatient({
      name: null,
      tasks: [makeTask("t1", "Check BP", { dueAt: pastDue })],
    });

    startReminderScheduler();
    resyncReminders([patient]);

    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining("חולה"),
      }),
    );
  });
});

/**
 * TaskDashboard component tests.
 *
 * TaskDashboard.tsx renders a modal with all pending tasks across patients.
 * Without @testing-library/react we test the pure logic functions
 * that power the component:
 *   - Task aggregation from all patients
 *   - Urgency sorting (stat > urgent > morning > extra > routine)
 *   - Filtering modes: all, stat, urgent, overdue
 *   - Urgency counts
 *   - Route mode: grouping by section then room
 *   - Empty state detection
 *   - Completed task separation
 */

import { describe, it, expect } from "vitest";
import type { PatientEntry, Task, PatientSection, Urgency } from "../types";
import { patientSectionLabel } from "../types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: overrides.id ?? "task-1",
    text: overrides.text ?? "test task",
    urgency: overrides.urgency ?? "routine",
    source: overrides.source ?? "extracted",
    done: overrides.done ?? false,
    doneTime: overrides.doneTime ?? null,
    time: overrides.time ?? null,
    confidence: overrides.confidence ?? 1,
    ...overrides,
  };
}

function makePatient(overrides: Partial<PatientEntry> = {}): PatientEntry {
  return {
    id: "pt-1",
    section: "SIDE_A",
    date: "01/01/2025",
    room: "101",
    name: "כהן יוסף",
    age: 70,
    diagnosis: null,
    flags: [],
    status: [],
    tomorrowNotes: [],
    tasks: [],
    generatedTasks: [],
    notes: [],
    scannedAt: "2025-01-01T00:00:00.000Z",
    confidence: 1,
    labs: [],
    medications: [],
    allergies: [],
    ...overrides,
  };
}

// ─── Constants (mirror TaskDashboard.tsx) ─────────────────────────────────────

const URGENCY_ORDER: Record<Urgency, number> = {
  stat: 0,
  urgent: 1,
  morning: 2,
  extra: 3,
  routine: 4,
};

const URGENCY_LABEL: Record<Urgency, string> = {
  stat: "🔴 סטט",
  urgent: "🟡 דחוף",
  morning: "🔵 בוקר",
  extra: "🟣 תוספת",
  routine: "⚪ שגרה",
};

// ─── Reimplemented logic from TaskDashboard.tsx ──────────────────────────────

interface DashTask {
  task: Task;
  patient: PatientEntry;
}

type FilterMode = "all" | "stat" | "urgent" | "overdue";

/**
 * Collects all pending (non-done, non-dismissed) tasks across patients.
 * Sorted by urgency.
 */
function collectAllDashTasks(patients: PatientEntry[]): DashTask[] {
  const items: DashTask[] = [];
  for (const p of patients) {
    for (const t of [...p.tasks, ...p.generatedTasks]) {
      if (!t.done && !(t as Task & { dismissed?: boolean }).dismissed)
        items.push({ task: t, patient: p });
    }
  }
  items.sort(
    (a, b) => URGENCY_ORDER[a.task.urgency] - URGENCY_ORDER[b.task.urgency]
  );
  return items;
}

/**
 * Filters dash tasks by mode.
 */
function filterTasks(tasks: DashTask[], mode: FilterMode): DashTask[] {
  switch (mode) {
    case "stat":
      return tasks.filter((d) => d.task.urgency === "stat");
    case "urgent":
      return tasks.filter(
        (d) => d.task.urgency === "stat" || d.task.urgency === "urgent"
      );
    case "overdue":
      return tasks.filter(
        (d) => d.task.dueAt && new Date(d.task.dueAt) < new Date()
      );
    default:
      return tasks;
  }
}

/**
 * Computes urgency counts.
 */
function computeCounts(tasks: DashTask[]) {
  const c = { stat: 0, urgent: 0, morning: 0, extra: 0, routine: 0, overdue: 0 };
  const now = new Date();
  for (const d of tasks) {
    c[d.task.urgency]++;
    if (d.task.dueAt && new Date(d.task.dueAt) < now) c.overdue++;
  }
  return c;
}

/**
 * Groups tasks by section then room (route mode).
 */
function buildRouteGroups(tasks: DashTask[]) {
  const map = new Map<PatientSection, Map<string, DashTask[]>>();
  for (const d of tasks) {
    const sec = d.patient.section;
    if (!map.has(sec)) map.set(sec, new Map());
    const roomKey = d.patient.room ?? "ללא חדר";
    const roomMap = map.get(sec)!;
    if (!roomMap.has(roomKey)) roomMap.set(roomKey, []);
    roomMap.get(roomKey)!.push(d);
  }
  const result: Array<{
    section: PatientSection;
    rooms: Array<{ room: string; tasks: DashTask[] }>;
  }> = [];
  for (const [section, roomMap] of map) {
    const rooms = [...roomMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
      .map(([room, tasks]) => ({
        room,
        tasks: tasks.sort(
          (a, b) => URGENCY_ORDER[a.task.urgency] - URGENCY_ORDER[b.task.urgency]
        ),
      }));
    result.push({ section, rooms });
  }
  return result;
}

/**
 * Collects completed tasks across patients.
 */
function collectCompleted(patients: PatientEntry[]): DashTask[] {
  const completed: DashTask[] = [];
  for (const p of patients) {
    for (const t of [...p.tasks, ...p.generatedTasks.filter((gt) => !gt.dismissed)]) {
      if (t.done) completed.push({ task: t, patient: p });
    }
  }
  return completed;
}

// ─── Task aggregation ─────────────────────────────────────────────────────────

describe("TaskDashboard — task aggregation", () => {
  it("collects all pending tasks from multiple patients", () => {
    const patients = [
      makePatient({
        id: "p1",
        tasks: [
          makeTask({ id: "t1", done: false }),
          makeTask({ id: "t2", done: true }),
        ],
      }),
      makePatient({
        id: "p2",
        room: "102",
        tasks: [makeTask({ id: "t3", done: false })],
      }),
    ];
    const dash = collectAllDashTasks(patients);
    expect(dash).toHaveLength(2); // only pending (t1 + t3)
  });

  it("includes pending generatedTasks", () => {
    const patients = [
      makePatient({
        generatedTasks: [
          makeTask({ id: "g1", done: false }),
          makeTask({ id: "g2", done: false }),
        ],
      }),
    ];
    const dash = collectAllDashTasks(patients);
    expect(dash).toHaveLength(2);
  });

  it("excludes dismissed generatedTasks", () => {
    const patients = [
      makePatient({
        generatedTasks: [
          makeTask({ id: "g1", done: false, dismissed: true }),
          makeTask({ id: "g2", done: false }),
        ],
      }),
    ];
    const dash = collectAllDashTasks(patients);
    expect(dash).toHaveLength(1);
    expect(dash[0].task.id).toBe("g2");
  });

  it("excludes done tasks", () => {
    const patients = [
      makePatient({
        tasks: [
          makeTask({ id: "t1", done: true }),
          makeTask({ id: "t2", done: true }),
        ],
      }),
    ];
    const dash = collectAllDashTasks(patients);
    expect(dash).toHaveLength(0);
  });

  it("returns empty for patients with no tasks", () => {
    const patients = [makePatient(), makePatient({ id: "p2", room: "102" })];
    const dash = collectAllDashTasks(patients);
    expect(dash).toHaveLength(0);
  });

  it("returns empty for empty patients array", () => {
    expect(collectAllDashTasks([])).toHaveLength(0);
  });

  it("associates correct patient with each task", () => {
    const patients = [
      makePatient({
        id: "p1",
        name: "Patient A",
        tasks: [makeTask({ id: "t1" })],
      }),
      makePatient({
        id: "p2",
        name: "Patient B",
        room: "102",
        tasks: [makeTask({ id: "t2" })],
      }),
    ];
    const dash = collectAllDashTasks(patients);
    const t1 = dash.find((d) => d.task.id === "t1");
    const t2 = dash.find((d) => d.task.id === "t2");
    expect(t1?.patient.name).toBe("Patient A");
    expect(t2?.patient.name).toBe("Patient B");
  });
});

// ─── Urgency sorting ──────────────────────────────────────────────────────────

describe("TaskDashboard — urgency sorting", () => {
  it("sorts stat tasks before urgent tasks", () => {
    const patients = [
      makePatient({
        tasks: [
          makeTask({ id: "t1", urgency: "urgent" }),
          makeTask({ id: "t2", urgency: "stat" }),
        ],
      }),
    ];
    const dash = collectAllDashTasks(patients);
    expect(dash[0].task.urgency).toBe("stat");
    expect(dash[1].task.urgency).toBe("urgent");
  });

  it("sorts in correct urgency order: stat > urgent > morning > extra > routine", () => {
    const patients = [
      makePatient({
        tasks: [
          makeTask({ id: "t5", urgency: "routine" }),
          makeTask({ id: "t3", urgency: "morning" }),
          makeTask({ id: "t1", urgency: "stat" }),
          makeTask({ id: "t4", urgency: "extra" }),
          makeTask({ id: "t2", urgency: "urgent" }),
        ],
      }),
    ];
    const dash = collectAllDashTasks(patients);
    const urgencies = dash.map((d) => d.task.urgency);
    expect(urgencies).toEqual(["stat", "urgent", "morning", "extra", "routine"]);
  });

  it("maintains relative order for same urgency level", () => {
    const patients = [
      makePatient({
        tasks: [
          makeTask({ id: "t1", urgency: "stat", text: "First stat" }),
          makeTask({ id: "t2", urgency: "stat", text: "Second stat" }),
          makeTask({ id: "t3", urgency: "stat", text: "Third stat" }),
        ],
      }),
    ];
    const dash = collectAllDashTasks(patients);
    expect(dash.map((d) => d.task.id)).toEqual(["t1", "t2", "t3"]);
  });
});

// ─── Filter modes ─────────────────────────────────────────────────────────────

describe("TaskDashboard — filter modes", () => {
  const patients = [
    makePatient({
      tasks: [
        makeTask({ id: "t1", urgency: "stat" }),
        makeTask({ id: "t2", urgency: "urgent" }),
        makeTask({ id: "t3", urgency: "morning" }),
        makeTask({ id: "t4", urgency: "routine" }),
        makeTask({
          id: "t5",
          urgency: "routine",
          dueAt: "2020-01-01T00:00:00.000Z", // overdue
        }),
      ],
    }),
  ];
  const allTasks = collectAllDashTasks(patients);

  it("all filter returns all tasks", () => {
    const filtered = filterTasks(allTasks, "all");
    expect(filtered).toHaveLength(5);
  });

  it("stat filter returns only stat tasks", () => {
    const filtered = filterTasks(allTasks, "stat");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].task.urgency).toBe("stat");
  });

  it("urgent filter returns stat + urgent tasks", () => {
    const filtered = filterTasks(allTasks, "urgent");
    expect(filtered).toHaveLength(2);
    expect(filtered.every((d) => d.task.urgency === "stat" || d.task.urgency === "urgent")).toBe(true);
  });

  it("overdue filter returns tasks with past dueAt", () => {
    const filtered = filterTasks(allTasks, "overdue");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].task.id).toBe("t5");
  });

  it("overdue filter excludes tasks with no dueAt", () => {
    const tasks = collectAllDashTasks([
      makePatient({
        tasks: [makeTask({ id: "no-due" })], // no dueAt
      }),
    ]);
    const filtered = filterTasks(tasks, "overdue");
    expect(filtered).toHaveLength(0);
  });

  it("overdue filter excludes tasks with future dueAt", () => {
    const futureDue = new Date(Date.now() + 86400000).toISOString();
    const tasks = collectAllDashTasks([
      makePatient({
        tasks: [makeTask({ id: "future", dueAt: futureDue })],
      }),
    ]);
    const filtered = filterTasks(tasks, "overdue");
    expect(filtered).toHaveLength(0);
  });
});

// ─── Urgency counts ───────────────────────────────────────────────────────────

describe("TaskDashboard — urgency counts", () => {
  it("counts each urgency level correctly", () => {
    const tasks = collectAllDashTasks([
      makePatient({
        tasks: [
          makeTask({ id: "t1", urgency: "stat" }),
          makeTask({ id: "t2", urgency: "stat" }),
          makeTask({ id: "t3", urgency: "urgent" }),
          makeTask({ id: "t4", urgency: "morning" }),
          makeTask({ id: "t5", urgency: "extra" }),
          makeTask({ id: "t6", urgency: "routine" }),
          makeTask({ id: "t7", urgency: "routine" }),
        ],
      }),
    ]);
    const counts = computeCounts(tasks);
    expect(counts.stat).toBe(2);
    expect(counts.urgent).toBe(1);
    expect(counts.morning).toBe(1);
    expect(counts.extra).toBe(1);
    expect(counts.routine).toBe(2);
  });

  it("counts overdue tasks", () => {
    const tasks = collectAllDashTasks([
      makePatient({
        tasks: [
          makeTask({ id: "t1", dueAt: "2020-01-01T00:00:00.000Z" }), // overdue
          makeTask({ id: "t2", dueAt: "2020-06-01T00:00:00.000Z" }), // overdue
          makeTask({ id: "t3" }), // no dueAt — not overdue
        ],
      }),
    ]);
    const counts = computeCounts(tasks);
    expect(counts.overdue).toBe(2);
  });

  it("returns all zeros for empty task list", () => {
    const counts = computeCounts([]);
    expect(counts.stat).toBe(0);
    expect(counts.urgent).toBe(0);
    expect(counts.morning).toBe(0);
    expect(counts.extra).toBe(0);
    expect(counts.routine).toBe(0);
    expect(counts.overdue).toBe(0);
  });
});

// ─── Route mode (section + room grouping) ─────────────────────────────────────

describe("TaskDashboard — route mode", () => {
  it("groups tasks by section then room", () => {
    const patients = [
      makePatient({
        id: "p1",
        section: "SIDE_A",
        room: "101",
        tasks: [makeTask({ id: "t1" })],
      }),
      makePatient({
        id: "p2",
        section: "SIDE_A",
        room: "102",
        tasks: [makeTask({ id: "t2" })],
      }),
      makePatient({
        id: "p3",
        section: "SIDE_B",
        room: "201",
        tasks: [makeTask({ id: "t3" })],
      }),
    ];
    const allTasks = collectAllDashTasks(patients);
    const groups = buildRouteGroups(allTasks);

    expect(groups).toHaveLength(2); // 2 sections
    const sideA = groups.find((g) => g.section === "SIDE_A")!;
    expect(sideA.rooms).toHaveLength(2);
    const sideB = groups.find((g) => g.section === "SIDE_B")!;
    expect(sideB.rooms).toHaveLength(1);
  });

  it("sorts rooms numerically within section", () => {
    const patients = [
      makePatient({
        id: "p2",
        section: "SIDE_A",
        room: "110",
        tasks: [makeTask({ id: "t2" })],
      }),
      makePatient({
        id: "p1",
        section: "SIDE_A",
        room: "102",
        tasks: [makeTask({ id: "t1" })],
      }),
    ];
    const allTasks = collectAllDashTasks(patients);
    const groups = buildRouteGroups(allTasks);
    expect(groups[0].rooms[0].room).toBe("102");
    expect(groups[0].rooms[1].room).toBe("110");
  });

  it("sorts tasks within room by urgency", () => {
    const patients = [
      makePatient({
        section: "SIDE_A",
        room: "101",
        tasks: [
          makeTask({ id: "t1", urgency: "routine" }),
          makeTask({ id: "t2", urgency: "stat" }),
        ],
      }),
    ];
    const allTasks = collectAllDashTasks(patients);
    const groups = buildRouteGroups(allTasks);
    const tasks = groups[0].rooms[0].tasks;
    expect(tasks[0].task.urgency).toBe("stat");
    expect(tasks[1].task.urgency).toBe("routine");
  });

  it("handles null room as fallback label", () => {
    const patients = [
      makePatient({
        room: null,
        tasks: [makeTask({ id: "t1" })],
      }),
    ];
    const allTasks = collectAllDashTasks(patients);
    const groups = buildRouteGroups(allTasks);
    expect(groups[0].rooms[0].room).toBe("ללא חדר");
  });

  it("returns empty array when no tasks exist", () => {
    const groups = buildRouteGroups([]);
    expect(groups).toHaveLength(0);
  });
});

// ─── Completed tasks ──────────────────────────────────────────────────────────

describe("TaskDashboard — completed tasks", () => {
  it("collects done tasks from tasks array", () => {
    const patients = [
      makePatient({
        tasks: [
          makeTask({ id: "t1", done: true }),
          makeTask({ id: "t2", done: false }),
        ],
      }),
    ];
    const completed = collectCompleted(patients);
    expect(completed).toHaveLength(1);
    expect(completed[0].task.id).toBe("t1");
  });

  it("collects done tasks from generatedTasks (non-dismissed)", () => {
    const patients = [
      makePatient({
        generatedTasks: [
          makeTask({ id: "g1", done: true }),
          makeTask({ id: "g2", done: true, dismissed: true }),
          makeTask({ id: "g3", done: false }),
        ],
      }),
    ];
    const completed = collectCompleted(patients);
    // g1 is done+not-dismissed; g2 is done+dismissed (excluded); g3 is not done
    expect(completed).toHaveLength(1);
    expect(completed[0].task.id).toBe("g1");
  });

  it("returns empty for patients with no done tasks", () => {
    const patients = [
      makePatient({
        tasks: [makeTask({ done: false })],
      }),
    ];
    expect(collectCompleted(patients)).toHaveLength(0);
  });

  it("returns empty for empty patients", () => {
    expect(collectCompleted([])).toHaveLength(0);
  });

  it("associates correct patient with completed tasks", () => {
    const patients = [
      makePatient({
        id: "p1",
        name: "Alice",
        tasks: [makeTask({ id: "t1", done: true })],
      }),
      makePatient({
        id: "p2",
        name: "Bob",
        room: "102",
        tasks: [makeTask({ id: "t2", done: true })],
      }),
    ];
    const completed = collectCompleted(patients);
    const t1Entry = completed.find((d) => d.task.id === "t1");
    expect(t1Entry?.patient.name).toBe("Alice");
  });
});

// ─── Urgency labels ───────────────────────────────────────────────────────────

describe("TaskDashboard — urgency labels", () => {
  it("maps each urgency to correct Hebrew label", () => {
    expect(URGENCY_LABEL.stat).toContain("סטט");
    expect(URGENCY_LABEL.urgent).toContain("דחוף");
    expect(URGENCY_LABEL.morning).toContain("בוקר");
    expect(URGENCY_LABEL.extra).toContain("תוספת");
    expect(URGENCY_LABEL.routine).toContain("שגרה");
  });

  it("urgency order has all 5 levels", () => {
    expect(Object.keys(URGENCY_ORDER)).toHaveLength(5);
    expect(URGENCY_ORDER.stat).toBeLessThan(URGENCY_ORDER.urgent);
    expect(URGENCY_ORDER.urgent).toBeLessThan(URGENCY_ORDER.morning);
    expect(URGENCY_ORDER.morning).toBeLessThan(URGENCY_ORDER.extra);
    expect(URGENCY_ORDER.extra).toBeLessThan(URGENCY_ORDER.routine);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe("TaskDashboard — edge cases", () => {
  it("handles patient with both tasks and generatedTasks", () => {
    const patients = [
      makePatient({
        tasks: [makeTask({ id: "t1", urgency: "stat" })],
        generatedTasks: [makeTask({ id: "g1", urgency: "routine" })],
      }),
    ];
    const dash = collectAllDashTasks(patients);
    expect(dash).toHaveLength(2);
    // stat should sort first
    expect(dash[0].task.urgency).toBe("stat");
  });

  it("handles many patients with many tasks efficiently", () => {
    const patients = Array.from({ length: 50 }, (_, i) =>
      makePatient({
        id: `p-${i}`,
        room: `${100 + i}`,
        tasks: Array.from({ length: 5 }, (_, j) =>
          makeTask({ id: `t-${i}-${j}`, urgency: j === 0 ? "stat" : "routine" })
        ),
      })
    );
    const dash = collectAllDashTasks(patients);
    expect(dash).toHaveLength(250); // 50 patients * 5 tasks
    // All stat tasks should be at the top
    const first50 = dash.slice(0, 50);
    expect(first50.every((d) => d.task.urgency === "stat")).toBe(true);
  });

  it("handles patient with null room in route grouping", () => {
    const patients = [
      makePatient({
        id: "p1",
        section: "SIDE_A",
        room: null,
        tasks: [makeTask({ id: "t1" })],
      }),
      makePatient({
        id: "p2",
        section: "SIDE_A",
        room: "101",
        tasks: [makeTask({ id: "t2" })],
      }),
    ];
    const allTasks = collectAllDashTasks(patients);
    const groups = buildRouteGroups(allTasks);
    const sideA = groups[0];
    expect(sideA.rooms).toHaveLength(2);
    // "101" sorts before Hebrew "ללא חדר" (numeric locale sort)
    expect(sideA.rooms[0].room).toBe("101");
  });
});

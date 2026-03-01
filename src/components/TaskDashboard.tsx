import { useMemo, useState } from "react";
import { usePatientsState, usePatientsDispatch } from "../context/PatientsContext";
import type { Task, PatientEntry, Urgency, Section } from "../types";
import { SECTION_LABEL } from "../types";
import { SectionDashboard } from "./SectionDashboard";

interface DashTask {
  task: Task;
  patient: PatientEntry;
}

const URGENCY_ORDER: Record<Urgency, number> = {
  stat: 0,
  urgent: 1,
  morning: 2,
  extra: 3,
  routine: 4,
};

const URGENCY_STYLE: Record<Urgency, string> = {
  stat: "bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800",
  urgent: "bg-orange-50 border-orange-200 dark:bg-orange-950 dark:border-orange-800",
  morning: "bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800",
  extra: "bg-purple-50 border-purple-200 dark:bg-purple-950 dark:border-purple-800",
  routine: "bg-white border-gray-200 dark:bg-gray-800 dark:border-gray-700",
};

const URGENCY_LABEL: Record<Urgency, string> = {
  stat: "🔴 סטט",
  urgent: "🟡 דחוף",
  morning: "🔵 בוקר",
  extra: "🟣 תוספת",
  routine: "⚪ שגרה",
};

type FilterMode = "all" | "stat" | "urgent" | "overdue";

export function TaskDashboard({ onClose }: { onClose: () => void }) {
  const { patients, unassignedTasks } = usePatientsState();
  const dispatch = usePatientsDispatch();
  const [filter, setFilter] = useState<FilterMode>("all");
  const [tab, setTab] = useState<"tasks" | "sections" | "route">("tasks");
  const [showCompleted, setShowCompleted] = useState(false);

  const allDashTasks = useMemo(() => {
    const items: DashTask[] = [];
    for (const p of patients) {
      for (const t of [...p.tasks, ...p.generatedTasks]) {
        if (!t.done) items.push({ task: t, patient: p });
      }
    }
    items.sort(
      (a, b) =>
        URGENCY_ORDER[a.task.urgency] - URGENCY_ORDER[b.task.urgency],
    );
    return items;
  }, [patients]);

  const filtered = useMemo(() => {
    switch (filter) {
      case "stat":
        return allDashTasks.filter((d) => d.task.urgency === "stat");
      case "urgent":
        return allDashTasks.filter(
          (d) =>
            d.task.urgency === "stat" || d.task.urgency === "urgent",
        );
      case "overdue":
        return allDashTasks.filter(
          (d) => d.task.dueAt && new Date(d.task.dueAt) < new Date(),
        );
      default:
        return allDashTasks;
    }
  }, [allDashTasks, filter]);

  const counts = useMemo(() => {
    const c = { stat: 0, urgent: 0, morning: 0, extra: 0, routine: 0, overdue: 0 };
    const now = new Date();
    for (const d of allDashTasks) {
      c[d.task.urgency]++;
      if (d.task.dueAt && new Date(d.task.dueAt) < now) c.overdue++;
    }
    return c;
  }, [allDashTasks]);

  // Route mode: group pending tasks by section → room for physical rounds
  const routeGroups = useMemo(() => {
    const map = new Map<Section, Map<string, DashTask[]>>();
    for (const d of allDashTasks) {
      const sec = d.patient.section;
      if (!map.has(sec)) map.set(sec, new Map());
      const roomKey = d.patient.room ?? "ללא חדר";
      const roomMap = map.get(sec)!;
      if (!roomMap.has(roomKey)) roomMap.set(roomKey, []);
      roomMap.get(roomKey)!.push(d);
    }
    // Sort rooms naturally within each section
    const result: Array<{ section: Section; rooms: Array<{ room: string; tasks: DashTask[] }> }> = [];
    for (const [section, roomMap] of map) {
      const rooms = [...roomMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
        .map(([room, tasks]) => ({
          room,
          tasks: tasks.sort((a, b) => URGENCY_ORDER[a.task.urgency] - URGENCY_ORDER[b.task.urgency]),
        }));
      result.push({ section, rooms });
    }
    return result;
  }, [allDashTasks]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-slate-800 text-white px-4 py-3 flex items-center justify-between rounded-t-2xl">
          <div>
            <h2 className="text-base font-bold">
              לוח משימות ({allDashTasks.length} ממתינות)
            </h2>
            <p className="text-xs text-slate-400">כל המשימות — כל החולים</p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white text-xl px-2">
            ✕
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setTab("tasks")}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              tab === "tasks"
                ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600"
                : "text-gray-500 dark:text-gray-400"
            }`}
          >
            📋 משימות
          </button>
          <button
            onClick={() => setTab("sections")}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              tab === "sections"
                ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600"
                : "text-gray-500 dark:text-gray-400"
            }`}
          >
            🏥 סקירת מדורים
          </button>
          <button
            onClick={() => setTab("route")}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              tab === "route"
                ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600"
                : "text-gray-500 dark:text-gray-400"
            }`}
          >
            🚶 מסלול סיבוב
          </button>
        </div>

        {tab === "sections" ? (
          <div className="flex-1 overflow-y-auto p-4">
            <SectionDashboard
              patients={patients}
              onSelectSection={(section: Section) => {
                dispatch({ type: "SET_SECTION", section });
                onClose();
              }}
            />
          </div>
        ) : tab === "route" ? (
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {routeGroups.length === 0 ? (
              <p className="text-center text-gray-400 py-12">אין משימות ממתינות 🎉</p>
            ) : (
              routeGroups.map(({ section, rooms }) => (
                <div key={section}>
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 px-1">
                    📍 {SECTION_LABEL[section]}
                  </div>
                  {rooms.map(({ room, tasks }) => (
                    <div key={room} className="mb-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 p-2">
                      <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                        🚪 חדר {room} — {tasks[0]?.patient.name ?? ""}
                        <span className="text-gray-400 font-normal mr-1">({tasks.length} משימות)</span>
                      </div>
                      <div className="space-y-1">
                        {tasks.map((d) => (
                          <div
                            key={d.task.id}
                            onClick={() => dispatch({ type: "TOGGLE_TASK", patientId: d.patient.id, taskId: d.task.id })}
                            className="flex items-start gap-1.5 text-xs cursor-pointer active:opacity-60"
                          >
                            <span className="mt-0.5">{URGENCY_LABEL[d.task.urgency] || "⚪"}</span>
                            <span className="text-gray-800 dark:text-gray-200 flex-1" dir="auto">{d.task.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        ) : (
        <>
        {/* Filters */}
        <div className="flex gap-1.5 px-4 py-2 border-b border-gray-200 dark:border-gray-700 overflow-x-auto scrollbar-hide">
          {(
            [
              { key: "all" as FilterMode, label: `הכל (${allDashTasks.length})` },
              { key: "stat" as FilterMode, label: `🔴 סטט (${counts.stat})` },
              { key: "urgent" as FilterMode, label: `🟡 דחוף+ (${counts.stat + counts.urgent})` },
              { key: "overdue" as FilterMode, label: `⏰ איחור (${counts.overdue})` },
            ] as const
          ).map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`flex-none px-3 py-1 text-xs rounded-full border transition-colors ${
                filter === f.key
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Task list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {filtered.length === 0 ? (
            <p className="text-center text-gray-400 py-12">
              {filter === "all" ? "אין משימות ממתינות 🎉" : "אין משימות בסינון זה"}
            </p>
          ) : (
            filtered.map((d) => (
              <div
                key={`${d.patient.id}-${d.task.id}`}
                className={`flex items-start gap-2 p-2.5 rounded-lg border ${URGENCY_STYLE[d.task.urgency]}`}
              >
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() =>
                    dispatch({
                      type: "TOGGLE_TASK",
                      patientId: d.patient.id,
                      taskId: d.task.id,
                    })
                  }
                  className="mt-1 h-5 w-5 rounded accent-blue-600"
                />
                <div className="flex-1 min-w-0">
                  <div
                    className="text-sm leading-snug dark:text-gray-200"
                    dir="auto"
                    style={{ unicodeBidi: "plaintext" }}
                  >
                    {d.task.text}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
                    <span className="font-semibold text-blue-700 dark:text-blue-400">
                      {d.patient.room} {d.patient.name}
                    </span>
                    {d.task.dueAt && (
                      <span
                        className={
                          new Date(d.task.dueAt) < new Date()
                            ? "text-red-600 font-semibold"
                            : "text-gray-500"
                        }
                      >
                        ⏰{" "}
                        {new Date(d.task.dueAt).toLocaleTimeString("he-IL", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                    {d.task.generatedFrom && (
                      <span className="text-gray-400">({d.task.generatedFrom})</span>
                    )}
                  </div>
                </div>
                <span className="text-xs whitespace-nowrap">
                  {URGENCY_LABEL[d.task.urgency]}
                </span>
              </div>
            ))
          )}

          {/* Unassigned tasks — captured without patient match */}
          {unassignedTasks.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <h3 className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-2 flex items-center gap-1.5">
                <span>📌</span> לא משויך ({unassignedTasks.filter(t => !t.done).length})
              </h3>
              <div className="space-y-2">
                {unassignedTasks.map(task => (
                  <div
                    key={task.id}
                    className="flex items-center gap-2 p-2 rounded-lg border border-amber-100 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/10"
                  >
                    <input
                      type="checkbox"
                      checked={task.done}
                      onChange={() => dispatch({ type: "TOGGLE_UNASSIGNED_TASK", taskId: task.id })}
                      className="h-5 w-5 rounded accent-amber-500 shrink-0"
                    />
                    <span
                      className={`flex-1 text-sm min-w-0 truncate ${task.done ? "line-through opacity-50 text-gray-400" : "text-gray-900 dark:text-gray-100"}`}
                      dir="auto"
                    >
                      {task.text}
                    </span>
                    <span className={`text-[10px] font-bold shrink-0 ${
                      task.urgency === "stat" ? "text-red-600" :
                      task.urgency === "urgent" ? "text-amber-600" :
                      "text-gray-400"
                    }`}>
                      {task.urgency === "stat" ? "STAT" : task.urgency === "urgent" ? "דחוף" : ""}
                    </span>
                    <select
                      className="text-xs border border-gray-300 dark:border-gray-600 rounded px-1 py-0.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 shrink-0 max-w-[110px]"
                      onChange={e => {
                        if (!e.target.value) return;
                        dispatch({ type: "ASSIGN_TASK_TO_PATIENT", taskId: task.id, patientId: e.target.value });
                      }}
                      defaultValue=""
                    >
                      <option value="" disabled>שיוך →</option>
                      {patients.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.room ?? "?"} — {p.name ?? "?"}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Completed tasks toggle */}
          {(() => {
            const completed: DashTask[] = [];
            for (const p of patients) {
              for (const t of [...p.tasks, ...p.generatedTasks]) {
                if (t.done) completed.push({ task: t, patient: p });
              }
            }
            if (completed.length === 0) return null;
            return (
              <>
                <button
                  onClick={() => setShowCompleted(v => !v)}
                  className="w-full text-xs text-gray-400 dark:text-gray-500 py-2 active:text-gray-600"
                >
                  {showCompleted ? "▴" : "▾"} הצג משימות שהושלמו ({completed.length})
                </button>
                {showCompleted && completed.map(d => (
                  <div
                    key={`done-${d.patient.id}-${d.task.id}`}
                    className="flex items-start gap-2 p-2 rounded-lg border border-gray-100 dark:border-gray-700 opacity-50"
                  >
                    <input
                      type="checkbox"
                      checked
                      onChange={() => dispatch({ type: "TOGGLE_TASK", patientId: d.patient.id, taskId: d.task.id })}
                      className="mt-1 h-5 w-5 rounded accent-blue-600"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm line-through text-gray-400 dark:text-gray-500" dir="auto" style={{ unicodeBidi: "plaintext" }}>
                        {d.task.text}
                      </div>
                      <div className="text-xs text-gray-400">{d.patient.room} {d.patient.name}</div>
                    </div>
                  </div>
                ))}
              </>
            );
          })()}
        </div>
        </>
        )}
      </div>
    </div>
  );
}

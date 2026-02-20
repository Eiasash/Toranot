import { useMemo, useState } from "react";
import { usePatientsState, usePatientsDispatch } from "../context/PatientsContext";
import type { Task, PatientEntry, Urgency, Section } from "../types";
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
  const { patients } = usePatientsState();
  const dispatch = usePatientsDispatch();
  const [filter, setFilter] = useState<FilterMode>("all");
  const [tab, setTab] = useState<"tasks" | "sections">("tasks");

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
        <div className="bg-red-700 text-white px-4 py-3 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold">
              לוח משימות ({allDashTasks.length} ממתינות)
            </h2>
            <p className="text-xs text-red-200">כל המשימות — כל החולים</p>
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
                ? "text-red-600 dark:text-red-400 border-b-2 border-red-600"
                : "text-gray-500 dark:text-gray-400"
            }`}
          >
            📋 משימות
          </button>
          <button
            onClick={() => setTab("sections")}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              tab === "sections"
                ? "text-red-600 dark:text-red-400 border-b-2 border-red-600"
                : "text-gray-500 dark:text-gray-400"
            }`}
          >
            🏥 סקירת מדורים
          </button>
        </div>

        {tab === "sections" ? (
          <div className="flex-1 overflow-y-auto p-4">
            <SectionDashboard patients={patients} onSelectSection={() => { onClose(); }} />
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
                  ? "bg-red-600 text-white border-red-600"
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
        </div>
        </>
        )}
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";
import type { PatientEntry, Task } from "../types";
import { TaskItem } from "./TaskItem";
import { usePatientsDispatch, usePatientsState } from "../context/PatientsContext";
import { LabBadges, AddLabForm } from "./LabTracker";
import { QuickScenario } from "./QuickScenario";
import { MedFlagBadges } from "./MedFlags";

function FlagBadge({ flag }: { flag: string }) {
  return (
    <span
      className={[
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold",
        flag.toUpperCase().includes("DNR") || flag.toUpperCase().includes("DNI")
          ? "bg-red-600 text-white"
          : "bg-gray-200 text-gray-800",
      ].join(" ")}
    >
      {flag}
    </span>
  );
}

function sortTasks(tasks: Task[]) {
  const weight: Record<Task["urgency"], number> = {
    stat: 0,
    urgent: 1,
    morning: 2,
    extra: 3,
    routine: 4,
  };
  return [...tasks].sort((a, b) => weight[a.urgency] - weight[b.urgency]);
}

function TaskProgress({ done, total }: { done: number; total: number }) {
  return (
    <span className="inline-flex items-center justify-center px-2 py-1 rounded-lg bg-blue-600 text-white text-sm font-semibold tabular-nums">
      {done}/{total}
    </span>
  );
}

export function PatientCard({ patient }: { patient: PatientEntry }) {
  const dispatch = usePatientsDispatch();
  const { showTomorrow } = usePatientsState();

  const manualNotes = patient.notes ?? [];

  const allTasks = useMemo(
    () => sortTasks([...patient.tasks, ...patient.generatedTasks]),
    [patient.tasks, patient.generatedTasks],
  );

  const doneCount = allTasks.filter((t) => t.done).length;
  const totalCount = allTasks.length;

  const [addOpen, setAddOpen] = useState(false);
  const [addType, setAddType] = useState<"task" | "note">("task");
  const [draft, setDraft] = useState("");
  const [showScenario, setShowScenario] = useState(false);
  const [showLabForm, setShowLabForm] = useState(false);

  const add = () => {
    const text = draft.trim();
    if (!text) return;

    if (addType === "task") {
      dispatch({ type: "ADD_TASK", patientId: patient.id, text });
    } else {
      dispatch({ type: "ADD_NOTE", patientId: patient.id, text });
    }

    setDraft("");
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold truncate dark:text-gray-100">
              {patient.name ?? "לא ידוע"}
            </span>
            {patient.room && (
              <span className="shrink-0 text-sm bg-blue-600 text-white px-2 py-0.5 rounded-lg">
                {patient.room}
              </span>
            )}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400 mt-1" dir="auto">
            {patient.diagnosis ?? ""}
          </div>
        </div>

        <div className="text-right shrink-0 flex items-center gap-2">
          {/* Reorder buttons */}
          <div className="flex flex-col gap-0.5">
            <button
              onClick={() =>
                dispatch({
                  type: "REORDER_PATIENT",
                  patientId: patient.id,
                  direction: "up",
                })
              }
              className="text-xs text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-1"
              title="הזז למעלה"
            >
              ▲
            </button>
            <button
              onClick={() =>
                dispatch({
                  type: "REORDER_PATIENT",
                  patientId: patient.id,
                  direction: "down",
                })
              }
              className="text-xs text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-1"
              title="הזז למטה"
            >
              ▼
            </button>
          </div>
          <div>
            <TaskProgress done={doneCount} total={totalCount} />
            {patient.age && (
              <div className="text-xs text-gray-500 mt-1 tabular-nums">
                {patient.age}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Flags */}
      {patient.flags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {patient.flags.map((f) => (
            <FlagBadge key={f} flag={f} />
          ))}
        </div>
      )}

      {/* Status + tomorrow + manual notes */}
      {(patient.status.length > 0 ||
        (showTomorrow && patient.tomorrowNotes.length > 0) ||
        manualNotes.length > 0) && (
        <div className="space-y-2">
          {patient.status.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {patient.status.map((s, i) => (
                <span
                  key={i}
                  dir="auto"
                  className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded"
                  style={{ unicodeBidi: "plaintext" }}
                >
                  {s}
                </span>
              ))}
            </div>
          )}

          {showTomorrow && patient.tomorrowNotes.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {patient.tomorrowNotes.map((s, i) => (
                <span
                  key={i}
                  dir="auto"
                  className="text-xs bg-green-50 text-green-900 px-2 py-0.5 rounded border border-green-200"
                  style={{ unicodeBidi: "plaintext" }}
                  title="מחר (לא תורן)"
                >
                  מחר: {s}
                </span>
              ))}
            </div>
          )}

          {manualNotes.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {manualNotes.map((n, idx) => (
                <span
                  key={idx}
                  dir="auto"
                  className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-900 px-2 py-0.5 rounded border border-blue-200"
                  style={{ unicodeBidi: "plaintext" }}
                  title="הערת תורן"
                >
                  {n}
                  <button
                    type="button"
                    onClick={() =>
                      dispatch({
                        type: "REMOVE_NOTE",
                        patientId: patient.id,
                        index: idx,
                      })
                    }
                    className="ml-1 text-blue-700 hover:text-blue-900"
                    aria-label="מחק הערה"
                    title="מחק"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Lab sparklines */}
      <LabBadges patient={patient} />

      {/* Medication safety flags */}
      <MedFlagBadges patient={patient} />

      {/* Quick action buttons */}
      <div className="flex gap-1.5">
        <button
          onClick={() => setShowScenario(true)}
          className="text-xs px-2.5 py-1 rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 active:bg-amber-100"
        >
          ⚡ תרחיש
        </button>
        <button
          onClick={() => setShowLabForm(!showLabForm)}
          className="text-xs px-2.5 py-1 rounded-lg border border-purple-200 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 active:bg-purple-100"
        >
          📊 Lab
        </button>
      </div>

      {showLabForm && (
        <AddLabForm patient={patient} onClose={() => setShowLabForm(false)} />
      )}

      {/* Tasks */}
      <div className="space-y-2">
        {allTasks.length === 0 ? (
          <div className="text-sm text-gray-500 dark:text-gray-400">אין משימות תורן</div>
        ) : (
          allTasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              onToggle={() =>
                dispatch({
                  type: "TOGGLE_TASK",
                  patientId: patient.id,
                  taskId: task.id,
                })
              }
              onSetNote={(note) =>
                dispatch({
                  type: "SET_TASK_NOTE",
                  patientId: patient.id,
                  taskId: task.id,
                  note,
                })
              }
            />
          ))
        )}
      </div>

      {/* Add manual task / note */}
      <div className="pt-2 border-t border-gray-100 dark:border-gray-700 space-y-2">
        {!addOpen ? (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="w-full py-2 rounded-xl border border-gray-200 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300"
          >
            + הוסף משימה / הערה
          </button>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAddType("task")}
                className={[
                  "px-3 py-1 rounded-lg text-sm border",
                  addType === "task"
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600",
                ].join(" ")}
              >
                משימה
              </button>
              <button
                type="button"
                onClick={() => setAddType("note")}
                className={[
                  "px-3 py-1 rounded-lg text-sm border",
                  addType === "note"
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600",
                ].join(" ")}
              >
                הערה
              </button>

              <button
                type="button"
                onClick={() => {
                  setAddOpen(false);
                  setDraft("");
                }}
                className="ml-auto px-3 py-1 rounded-lg text-sm border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300"
              >
                סגור
              </button>
            </div>

            <div className="flex items-center gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") add();
                  if (e.key === "Escape") setAddOpen(false);
                }}
                dir="auto"
                style={{ unicodeBidi: "plaintext" }}
                placeholder={
                  addType === "task"
                    ? "משימה חדשה (למשל: BS)"
                    : "הערה (למשל: BS 250ml)"
                }
                className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-400 outline-none"
              />
              <button
                type="button"
                onClick={add}
                className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm"
              >
                הוסף
              </button>
            </div>

            <div className="text-xs text-gray-500">
              הערה נשמרת אצל המטופל, משימה נספרת במונה תורן.
            </div>
          </div>
        )}
      </div>

      {showScenario && (
        <QuickScenario patient={patient} onClose={() => setShowScenario(false)} />
      )}
    </div>
  );
}

export function PatientRow({ patient }: { patient: PatientEntry }) {
  const dispatch = usePatientsDispatch();
  const { showTomorrow } = usePatientsState();

  const [expanded, setExpanded] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addType, setAddType] = useState<"task" | "note">("task");
  const [draft, setDraft] = useState("");

  const manualNotes = patient.notes ?? [];

  const allTasks = sortTasks([...patient.tasks, ...patient.generatedTasks]);
  const doneCount = allTasks.filter((t) => t.done).length;
  const totalCount = allTasks.length;

  const add = () => {
    const text = draft.trim();
    if (!text) return;

    if (addType === "task") {
      dispatch({ type: "ADD_TASK", patientId: patient.id, text });
    } else {
      dispatch({ type: "ADD_NOTE", patientId: patient.id, text });
    }

    setDraft("");
  };

  return (
    <>
      <tr
        onClick={() => setExpanded(!expanded)}
        className={`
          border-b border-gray-100 transition-colors
          cursor-pointer
          ${expanded ? "bg-blue-50/30" : "hover:bg-gray-50"}
        `}
      >
        <td className="py-2.5 px-4 font-mono font-bold text-blue-700 text-sm whitespace-nowrap">
          {patient.room ?? "—"}
        </td>
        <td className="py-2.5 px-4 font-semibold text-gray-900 text-sm whitespace-nowrap">
          {patient.name ?? "לא ידוע"}
        </td>
        <td className="py-2.5 px-4 text-gray-500 text-sm tabular-nums">
          {patient.age ?? "—"}
        </td>
        <td className="py-2.5 px-4 text-gray-600 text-sm max-w-xs truncate" dir="auto">
          {patient.diagnosis ?? "—"}
        </td>
        <td className="py-2.5 px-4">
          <div className="flex flex-wrap gap-1">
            {patient.flags.map((f) => (
              <FlagBadge key={f} flag={f} />
            ))}
          </div>
        </td>
        <td className="py-2.5 px-4 text-center">
          <div className="inline-flex items-center justify-center gap-2">
            <TaskProgress done={doneCount} total={totalCount} />
            <span className="text-gray-400 text-sm">{expanded ? "▴" : "▾"}</span>
          </div>
        </td>
      </tr>

      {expanded && (
        <tr className="border-b border-gray-100 bg-gray-50/50">
          <td colSpan={6} className="px-8 py-3">
            <div className="space-y-3 max-w-3xl">
              {patient.status.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {patient.status.map((s, i) => (
                    <span
                      key={i}
                      dir="auto"
                      className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded"
                      style={{ unicodeBidi: "plaintext" }}
                    >
                      {s}
                    </span>
                  ))}
                </div>
              )}

              {showTomorrow && patient.tomorrowNotes.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {patient.tomorrowNotes.map((s, i) => (
                    <span
                      key={i}
                      dir="auto"
                      className="text-xs bg-green-50 text-green-900 px-2 py-0.5 rounded border border-green-200"
                      style={{ unicodeBidi: "plaintext" }}
                      title="מחר (לא תורן)"
                    >
                      מחר: {s}
                    </span>
                  ))}
                </div>
              )}

              {manualNotes.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {manualNotes.map((n, idx) => (
                    <span
                      key={idx}
                      dir="auto"
                      className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-900 px-2 py-0.5 rounded border border-blue-200"
                      style={{ unicodeBidi: "plaintext" }}
                      title="הערת תורן"
                    >
                      {n}
                      <button
                        type="button"
                        onClick={() =>
                          dispatch({
                            type: "REMOVE_NOTE",
                            patientId: patient.id,
                            index: idx,
                          })
                        }
                        className="ml-1 text-blue-700 hover:text-blue-900"
                        aria-label="מחק הערה"
                        title="מחק"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {allTasks.length > 0 && (
                <div className="space-y-1.5">
                  {allTasks.map((task) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      onToggle={() =>
                        dispatch({
                          type: "TOGGLE_TASK",
                          patientId: patient.id,
                          taskId: task.id,
                        })
                      }
                      onSetNote={(note) =>
                        dispatch({
                          type: "SET_TASK_NOTE",
                          patientId: patient.id,
                          taskId: task.id,
                          note,
                        })
                      }
                    />
                  ))}
                </div>
              )}

              {/* Add manual task / note */}
              <div className="pt-2 border-t border-gray-200 space-y-2">
                {!addOpen ? (
                  <button
                    type="button"
                    onClick={() => setAddOpen(true)}
                    className="w-full py-2 rounded-xl border border-gray-300 text-sm text-gray-700 bg-white"
                  >
                    + הוסף משימה / הערה
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setAddType("task")}
                        className={[
                          "px-3 py-1 rounded-lg text-sm border",
                          addType === "task"
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-white text-gray-700 border-gray-200",
                        ].join(" ")}
                      >
                        משימה
                      </button>
                      <button
                        type="button"
                        onClick={() => setAddType("note")}
                        className={[
                          "px-3 py-1 rounded-lg text-sm border",
                          addType === "note"
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-white text-gray-700 border-gray-200",
                        ].join(" ")}
                      >
                        הערה
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setAddOpen(false);
                          setDraft("");
                        }}
                        className="ml-auto px-3 py-1 rounded-lg text-sm border border-gray-200 text-gray-700"
                      >
                        סגור
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") add();
                          if (e.key === "Escape") setAddOpen(false);
                        }}
                        dir="auto"
                        style={{ unicodeBidi: "plaintext" }}
                        placeholder={
                          addType === "task"
                            ? "משימה חדשה"
                            : "הערה (תורן)"
                        }
                        className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-xl bg-white text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-400 outline-none"
                      />
                      <button
                        type="button"
                        onClick={add}
                        className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm"
                      >
                        הוסף
                      </button>
                    </div>

                    <div className="text-xs text-gray-500">
                      הערה נשמרת אצל המטופל, משימה נספרת במונה תורן.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

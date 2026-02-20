import { useEffect, useState } from "react";
import type { Task } from "../types";
import { TaskCountdown, getQuickDueOptions, dueAtFromMinutes } from "./TaskCountdown";

function urgencyBadge(urgency: Task["urgency"]) {
  switch (urgency) {
    case "stat":
      return (
        <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200" role="status">
          סטט
        </span>
      );
    case "urgent":
      return (
        <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200" role="status">
          דחוף
        </span>
      );
    case "morning":
      return (
        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200" role="status">
          בוקר
        </span>
      );
    case "extra":
      return (
        <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200" role="status">
          תוספת
        </span>
      );
    default:
      return (
        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200" role="status">
          שגרה
        </span>
      );
  }
}

function backgroundFromUrgency(task: Task) {
  if (task.done) return "bg-white dark:bg-gray-800";
  switch (task.urgency) {
    case "stat":
      return "bg-red-50 dark:bg-red-900/20";
    case "urgent":
      return "bg-orange-50 dark:bg-orange-900/20";
    case "morning":
      return "bg-blue-50 dark:bg-blue-900/20";
    case "extra":
      return "bg-purple-50 dark:bg-purple-900/20";
    default:
      return "bg-white dark:bg-gray-800";
  }
}

export function TaskItem({
  task,
  onToggle,
  onSetNote,
  onSetDue,
}: {
  task: Task;
  onToggle: () => void;
  onSetNote?: (note: string | null) => void;
  onSetDue?: (dueAt: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [showTimer, setShowTimer] = useState(false);
  const [draft, setDraft] = useState(task.note ?? "");

  useEffect(() => {
    setDraft(task.note ?? "");
  }, [task.note]);

  const save = () => {
    if (!onSetNote) {
      setEditing(false);
      return;
    }
    const trimmed = draft.trim();
    onSetNote(trimmed ? trimmed : null);
    setEditing(false);
  };

  const noteExists = !!(task.note && task.note.trim());

  return (
    <div className="w-full">
      <div
        className={[
          "flex items-start gap-2 p-2 rounded-lg border",
          backgroundFromUrgency(task),
          task.done ? "opacity-60" : "",
        ].join(" ")}
        role="button"
        tabIndex={0}
        aria-label={`${task.done ? "בוצע: " : ""}${task.text}`}
        onClick={() => {
          if (editing || showTimer) return;
          onToggle();
        }}
        onKeyDown={(e) => {
          if (editing || showTimer) return;
          if (e.key === "Enter" || e.key === " ") onToggle();
        }}
      >
        <input
          type="checkbox"
          checked={task.done}
          onChange={onToggle}
          onClick={(e) => e.stopPropagation()}
          aria-label={`סמן ${task.text} כבוצע`}
          className="mt-1 h-5 w-5 rounded border-gray-300 bg-white accent-blue-600 text-blue-600 focus:ring-blue-500"
        />

        <div className="flex-1 min-w-0">
          <div
            className="text-sm leading-snug whitespace-pre-wrap break-words"
            dir="auto"
            style={{ unicodeBidi: "plaintext" }}
          >
            {task.text}
          </div>

          {/* Countdown timer */}
          {task.dueAt && !task.done && (
            <div className="mt-1">
              <TaskCountdown task={task} />
            </div>
          )}

          {noteExists && !editing && (
            <div
              className="mt-1 text-xs text-gray-600 whitespace-pre-wrap break-words"
              dir="auto"
              style={{ unicodeBidi: "plaintext" }}
            >
              📝 {task.note}
            </div>
          )}

          {editing && (
            <div
              className="mt-2 flex items-center gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") save();
                  if (e.key === "Escape") setEditing(false);
                }}
                placeholder="הערה / תוצאה (למשל: BS 250ml)"
                dir="auto"
                style={{ unicodeBidi: "plaintext" }}
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-400 outline-none"
              />
              <button
                type="button"
                onClick={save}
                className="px-3 py-2 text-sm rounded-lg bg-blue-600 text-white"
              >
                שמור
              </button>
            </div>
          )}

          {/* Quick timer setter */}
          {showTimer && !task.done && onSetDue && (
            <div
              className="mt-2 flex flex-wrap gap-1.5"
              onClick={(e) => e.stopPropagation()}
            >
              {getQuickDueOptions().map((opt) => (
                <button
                  key={opt.minutes}
                  type="button"
                  onClick={() => {
                    onSetDue(dueAtFromMinutes(opt.minutes));
                    setShowTimer(false);
                  }}
                  className="text-xs px-2.5 py-1 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 active:bg-amber-100"
                >
                  {opt.label}
                </button>
              ))}
              {task.dueAt && (
                <button
                  type="button"
                  onClick={() => {
                    onSetDue(null);
                    setShowTimer(false);
                  }}
                  className="text-xs px-2.5 py-1 rounded-lg border border-red-300 bg-red-50 text-red-700 active:bg-red-100"
                >
                  ❌ בטל
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowTimer(false)}
                className="text-xs px-2.5 py-1 rounded-lg border border-gray-300 bg-gray-50 text-gray-600"
              >
                סגור
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-1">
          {!task.done && urgencyBadge(task.urgency)}

          <div className="flex gap-1">
            {/* Timer button */}
            {!task.done && onSetDue && (
              <button
                type="button"
                title="הגדר טיימר"
                aria-label="הגדר טיימר למשימה"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowTimer((v) => !v);
                }}
                className={[
                  "text-xs px-2 py-0.5 rounded-lg border",
                  task.dueAt
                    ? "bg-amber-100 border-amber-300 text-amber-700"
                    : "bg-white border-gray-200 text-gray-700",
                ].join(" ")}
              >
                ⏱
              </button>
            )}

            {/* Note button */}
            <button
              type="button"
              title="הוסף הערה"
              aria-label="הוסף הערה למשימה"
              onClick={(e) => {
                e.stopPropagation();
                setEditing((v) => !v);
              }}
              className="text-xs px-2 py-0.5 rounded-lg bg-white border border-gray-200 text-gray-700"
            >
              ✎
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import type { Task } from "../types";

function urgencyBadge(urgency: Task["urgency"]) {
  switch (urgency) {
    case "stat":
      return (
        <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
          סטט
        </span>
      );
    case "urgent":
      return (
        <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200">
          דחוף
        </span>
      );
    case "morning":
      return (
        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
          בוקר
        </span>
      );
    default:
      return (
        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200">
          שגרה
        </span>
      );
  }
}

function backgroundFromUrgency(task: Task) {
  if (task.done) return "bg-white";
  switch (task.urgency) {
    case "stat":
      return "bg-red-50";
    case "urgent":
      return "bg-orange-50";
    case "morning":
      return "bg-blue-50";
    default:
      return "bg-white";
  }
}

export function TaskItem({
  task,
  onToggle,
  onSetNote,
}: {
  task: Task;
  onToggle: () => void;
  onSetNote?: (note: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
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
        onClick={() => {
          if (editing) return;
          onToggle();
        }}
        onKeyDown={(e) => {
          if (editing) return;
          if (e.key === "Enter" || e.key === " ") onToggle();
        }}
      >
        <input
          type="checkbox"
          checked={task.done}
          onChange={onToggle}
          onClick={(e) => e.stopPropagation()}
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
        </div>

        <div className="flex flex-col items-end gap-1">
          {!task.done && urgencyBadge(task.urgency)}

          <button
            type="button"
            title="הוסף הערה"
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
  );
}

import { useEffect, useState, useRef, useCallback } from "react";
import { usePatientsDispatch } from "../context/PatientsContext";
import type { Task } from "../types";
import { TaskCountdown, getQuickDueOptions, dueAtFromMinutes, suggestTimerMinutes, scheduleSwAlarm, cancelSwAlarm } from "./TaskCountdown";

const SWIPE_THRESHOLD = 80; // px to trigger completion

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
        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600" role="status">
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
  patientId,
  onToggle,
  onSetNote,
  onSetDue,
}: {
  task: Task;
  patientId?: string;
  onToggle: () => void;
  onSetNote?: (note: string | null) => void;
  onSetDue?: (dueAt: string | null) => void;
}) {
  const dispatch = usePatientsDispatch();
  const [editing, setEditing] = useState(false);
  const [showTimer, setShowTimer] = useState(false);
  const [draft, setDraft] = useState(task.note ?? "");
  const [customMinutes, setCustomMinutes] = useState("");
  const suggestedMinutes = suggestTimerMinutes(task.text);
  const [swipeX, setSwipeX] = useState(0);

  // Swipe tracking refs
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isSwiping = useRef(false);

  useEffect(() => {
    setDraft(task.note ?? "");
  }, [task.note]);

  // Sync SW alarm when dueAt changes
  useEffect(() => {
    if (task.dueAt && !task.done) {
      scheduleSwAlarm(task.id, task.text, task.dueAt);
    } else {
      cancelSwAlarm(task.id);
    }
    return () => cancelSwAlarm(task.id);
  }, [task.id, task.dueAt, task.done, task.text]);

  const save = () => {
    if (!onSetNote) {
      setEditing(false);
      return;
    }
    const trimmed = draft.trim();
    onSetNote(trimmed ? trimmed : null);
    setEditing(false);
  };

  // Swipe handlers for mobile gesture
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (editing || showTimer || task.done) return;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isSwiping.current = false;
  }, [editing, showTimer, task.done]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (editing || showTimer || task.done) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;

    // Only start swiping if horizontal movement > vertical (prevents scroll interference)
    if (!isSwiping.current && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      isSwiping.current = true;
    }

    if (isSwiping.current) {
      // Only allow rightward swipe (positive dx) — clamp between 0 and 120
      setSwipeX(Math.max(0, Math.min(dx, 120)));
      if (dx > 10) e.preventDefault();
    }
  }, [editing, showTimer, task.done]);

  const onTouchEnd = useCallback(() => {
    if (swipeX >= SWIPE_THRESHOLD) {
      onToggle();
    }
    setSwipeX(0);
    isSwiping.current = false;
  }, [swipeX, onToggle]);

  const noteExists = !!(task.note && task.note.trim());
  const swipeProgress = Math.min(swipeX / SWIPE_THRESHOLD, 1);

  return (
    <div className="w-full relative overflow-hidden rounded-lg">
      {/* Swipe background indicator */}
      {swipeX > 0 && (
        <div
          className="absolute inset-y-0 left-0 flex items-center justify-end px-4"
          style={{
            width: `${swipeX}px`,
            backgroundColor: swipeProgress >= 1 ? '#16a34a' : '#86efac',
            transition: 'background-color 0.15s',
          }}
        >
          <span className="text-white text-lg" style={{ opacity: swipeProgress }}>
            ✓
          </span>
        </div>
      )}

      <div
        className={[
          "flex items-start gap-2 p-2 rounded-lg border relative",
          backgroundFromUrgency(task),
          task.done ? "opacity-60" : "",
        ].join(" ")}
        style={{
          transform: swipeX > 0 ? `translateX(${swipeX}px)` : undefined,
          transition: swipeX === 0 ? 'transform 0.2s ease-out' : undefined,
        }}
        role="button"
        tabIndex={0}
        aria-label={`${task.done ? "בוצע: " : ""}${task.text}`}
        onClick={() => {
          if (editing || showTimer || isSwiping.current) return;
          onToggle();
        }}
        onKeyDown={(e) => {
          if (editing || showTimer) return;
          if (e.key === "Enter" || e.key === " ") onToggle();
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <input
          type="checkbox"
          checked={task.done}
          onChange={onToggle}
          onClick={(e) => e.stopPropagation()}
          aria-label={`סמן ${task.text} כבוצע`}
          className="mt-1 h-6 w-6 rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 accent-blue-600 text-blue-600 focus:ring-blue-500 flex-shrink-0"
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
                className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-400 outline-none"
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
              className="mt-2 flex flex-col gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Suggested timer highlight */}
              {suggestedMinutes && (
                <button
                  type="button"
                  onClick={() => { onSetDue(dueAtFromMinutes(suggestedMinutes)); setShowTimer(false); }}
                  className="text-xs px-3 py-1.5 rounded-lg border-2 border-blue-400 bg-blue-50 text-blue-800 font-bold flex items-center gap-1.5 active:bg-blue-100"
                >
                  🎯 מוצע: {suggestedMinutes >= 60 ? `${suggestedMinutes/60} שעות` : `${suggestedMinutes} דק׳`}
                </button>
              )}
              {/* Quick options */}
              <div className="flex flex-wrap gap-1.5">
                {getQuickDueOptions().map((opt) => (
                  <button
                    key={opt.minutes}
                    type="button"
                    onClick={() => { onSetDue(dueAtFromMinutes(opt.minutes)); setShowTimer(false); }}
                    className="text-xs px-2.5 py-1 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 active:bg-amber-100"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {/* Custom minutes input */}
              <div className="flex gap-1.5 items-center">
                <input
                  type="number"
                  min="1"
                  max="720"
                  placeholder="דקות..."
                  value={customMinutes}
                  onChange={(e) => setCustomMinutes(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && customMinutes) {
                      const mins = parseInt(customMinutes);
                      if (mins > 0) { onSetDue(dueAtFromMinutes(mins)); setShowTimer(false); setCustomMinutes(""); }
                    }
                  }}
                  className="w-24 px-2 py-1 text-xs border border-gray-300 rounded-lg bg-white dark:bg-gray-800 dark:border-gray-600 text-right"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => {
                    const mins = parseInt(customMinutes);
                    if (mins > 0) { onSetDue(dueAtFromMinutes(mins)); setShowTimer(false); setCustomMinutes(""); }
                  }}
                  className="text-xs px-2 py-1 rounded-lg bg-gray-700 text-white"
                >
                  הגדר
                </button>
                {task.dueAt && (
                  <button
                    type="button"
                    onClick={() => { onSetDue(null); setShowTimer(false); }}
                    className="text-xs px-2 py-1 rounded-lg border border-red-300 bg-red-50 text-red-700"
                  >
                    ❌ בטל
                  </button>
                )}
                <button type="button" onClick={() => setShowTimer(false)} className="text-xs px-2 py-1 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300">סגור</button>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-1">
          {!task.done && urgencyBadge(task.urgency)}

          <div className="flex gap-1">
            {/* Timer button — min 44×44px for Android touch target */}
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
                  "text-sm min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border",
                  task.dueAt
                    ? "bg-amber-100 border-amber-300 text-amber-700 dark:bg-amber-900/40 dark:border-amber-700 dark:text-amber-300"
                    : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300",
                ].join(" ")}
              >
                ⏱
              </button>
            )}

            {/* Note button — min 44×44px for Android touch target */}
            <button
              type="button"
              title="הוסף הערה"
              aria-label="הוסף הערה למשימה"
              onClick={(e) => {
                e.stopPropagation();
                setEditing((v) => !v);
              }}
              className="text-sm min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300"
            >
              ✎
            </button>

            {/* Delete button */}
            {patientId && (
              <button
                type="button"
                title="מחק משימה"
                aria-label="מחק משימה"
                onClick={(e) => {
                  e.stopPropagation();
                  dispatch({ type: "DELETE_TASK", patientId, taskId: task.id });
                }}
                className="text-sm min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-red-400 dark:text-red-500 active:bg-red-50"
              >
                🗑
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

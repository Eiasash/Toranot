import { useState, useEffect, useCallback, useRef } from "react";

export interface UndoAction {
  id: string;
  message: string;
  onUndo: () => void;
}

let _showToast: ((action: UndoAction) => void) | null = null;

/** Call from anywhere to show an undo toast */
export function showUndoToast(action: UndoAction) {
  _showToast?.(action);
}

const UNDO_TIMEOUT = 5000;

export function UndoToastContainer() {
  const [action, setAction] = useState<UndoAction | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = useCallback((a: UndoAction) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setAction(a);
    timerRef.current = setTimeout(() => setAction(null), UNDO_TIMEOUT);
  }, []);

  useEffect(() => {
    _showToast = show;
    return () => { _showToast = null; };
  }, [show]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!action) return null;

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[70] animate-slide-up">
      <div className="flex items-center gap-3 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 px-4 py-3 rounded-xl shadow-lg min-w-[260px]">
        <span className="text-sm flex-1">{action.message}</span>
        <button
          onClick={() => {
            action.onUndo();
            setAction(null);
            if (timerRef.current) clearTimeout(timerRef.current);
          }}
          className="text-sm font-bold text-blue-400 dark:text-blue-600 px-2 py-1 rounded active:bg-gray-700 dark:active:bg-gray-300"
        >
          ביטול
        </button>
      </div>
    </div>
  );
}

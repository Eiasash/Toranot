/**
 * Lightweight inline confirm / toast — replaces window.confirm() and
 * window.alert() which silently fail in Android PWA standalone mode.
 *
 * Usage (confirm):
 *   const { confirmState, requestConfirm, dismiss } = useSimpleConfirm();
 *   <button onClick={() => requestConfirm("למחוק?", handleDelete)}>מחק</button>
 *   <SimpleConfirmModal state={confirmState} onCancel={dismiss} />
 *
 * Usage (toast):
 *   const { toast, showToast } = useSimpleToast();
 *   showToast("הועתק!");
 *   <SimpleToast state={toast} />
 */
import { useState, useCallback, useRef } from "react";

// ─── Confirm ──────────────────────────────────────────────────────────────────

export interface ConfirmState {
  open: boolean;
  message: string;
  onConfirm: () => void;
}

export function useSimpleConfirm() {
  const [confirmState, setConfirmState] = useState<ConfirmState>({
    open: false,
    message: "",
    onConfirm: () => {},
  });

  const requestConfirm = useCallback((message: string, onConfirm: () => void) => {
    setConfirmState({ open: true, message, onConfirm });
  }, []);

  const dismiss = useCallback(() => {
    setConfirmState((s) => ({ ...s, open: false }));
  }, []);

  return { confirmState, requestConfirm, dismiss };
}

export function SimpleConfirmModal({
  state,
  onCancel,
}: {
  state: ConfirmState;
  onCancel: () => void;
}) {
  if (!state.open) return null;
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center px-4 pb-8 sm:pb-0 bg-black/40"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-xs bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-4">
          <p className="text-sm text-gray-800 dark:text-gray-100 font-medium">{state.message}</p>
        </div>
        <div className="flex border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onCancel}
            className="flex-1 py-4 text-sm text-gray-600 dark:text-gray-400 active:bg-gray-50 dark:active:bg-gray-800"
          >
            ביטול
          </button>
          <button
            onClick={() => { state.onConfirm(); onCancel(); }}
            className="flex-1 py-4 text-sm font-bold text-red-600 border-r border-gray-200 dark:border-gray-700 active:bg-red-50 dark:active:bg-red-900/20"
          >
            אישור
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

export interface ToastState {
  open: boolean;
  message: string;
  variant: "success" | "error";
}

export function useSimpleToast(durationMs = 2200) {
  const [toast, setToast] = useState<ToastState>({
    open: false,
    message: "",
    variant: "success",
  });
  // useRef so the timer ID persists across renders without being a dep
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const showToast = useCallback(
    (message: string, variant: "success" | "error" = "success") => {
      clearTimeout(timerRef.current);
      setToast({ open: true, message, variant });
      timerRef.current = setTimeout(
        () => setToast((s) => ({ ...s, open: false })),
        durationMs
      );
    },
    [durationMs]
  );

  return { toast, showToast };
}

export function SimpleToast({ state }: { state: ToastState }) {
  if (!state.open) return null;
  const bg =
    state.variant === "success"
      ? "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900"
      : "bg-red-600 text-white";
  return (
    <div
      className={`fixed bottom-20 left-1/2 -translate-x-1/2 z-[70] px-4 py-2 rounded-xl text-sm font-medium shadow-lg pointer-events-none ${bg}`}
    >
      {state.message}
    </div>
  );
}

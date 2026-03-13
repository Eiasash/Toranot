import { useRef, useState } from "react";
import { usePatientsState, usePatientsDispatch } from "../context/PatientsContext";
import type { PatientEntry } from "../types";
import { normalizePatient } from "../context/reducer";

export function ShiftHistory({ onClose }: { onClose: () => void }) {
  const { shiftHistory } = usePatientsState();
  const dispatch = usePatientsDispatch();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingAction, setPendingAction] = useState<
    | { type: "restore"; id: string; label: string }
    | { type: "delete"; id: string; label: string }
    | { type: "import"; data: PatientEntry[]; count: number }
    | null
  >(null);
  const [importError, setImportError] = useState<string | null>(null);

  const handleImportBackup = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string);
        if (!Array.isArray(parsed)) throw new Error("Invalid format");
        const data = (parsed as Record<string, unknown>[]).map(normalizePatient);
        setPendingAction({ type: "import", data, count: data.length });
      } catch (err) {
        console.warn("[Toranot] shift import parse failed:", err);
        setImportError("קובץ לא תקין. ודא שזה קובץ JSON שיוצא מתורנות.");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  };

  const confirmAction = () => {
    if (!pendingAction) return;
    if (pendingAction.type === "restore") {
      dispatch({ type: "RESTORE_SHIFT", snapshotId: pendingAction.id });
      onClose();
    } else if (pendingAction.type === "delete") {
      dispatch({ type: "DELETE_SHIFT", snapshotId: pendingAction.id });
    } else if (pendingAction.type === "import") {
      dispatch({ type: "IMPORT_BACKUP", patients: pendingAction.data });
      onClose();
    }
    setPendingAction(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[80vh] flex flex-col overflow-hidden shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="היסטוריית משמרות"
      >
        {/* Header */}
        <div className="bg-gray-700 text-white px-4 py-3 flex items-center justify-between">
          <button
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-white/70 hover:text-white text-xl rounded-lg active:bg-gray-600"
            aria-label="סגור"
          >
            ✕
          </button>
          <div className="text-right">
            <h2 className="text-base font-bold">היסטוריית משמרות</h2>
            <p className="text-xs text-gray-300">
              {shiftHistory.length} משמרות שמורות (עד 30)
            </p>
          </div>
        </div>

        {/* Inline confirm */}
        {pendingAction && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-700 px-4 py-3">
            <p className="text-sm text-amber-900 dark:text-amber-200 font-medium mb-3">
              {pendingAction.type === "restore" && `לשחזר משמרת "${pendingAction.label}"? (יחליף את הרשימה הנוכחית)`}
              {pendingAction.type === "delete" && `למחוק "${pendingAction.label}" מההיסטוריה?`}
              {pendingAction.type === "import" && `לייבא ${pendingAction.count} מטופלים? (יחליף את הרשימה הנוכחית)`}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPendingAction(null)}
                className="flex-1 py-2.5 text-sm rounded-xl bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 active:bg-gray-100"
              >
                ביטול
              </button>
              <button
                onClick={confirmAction}
                className={`flex-1 py-2.5 text-sm rounded-xl font-semibold text-white ${
                  pendingAction.type === "delete" ? "bg-red-600 active:bg-red-700" : "bg-blue-600 active:bg-blue-700"
                }`}
              >
                {pendingAction.type === "restore" ? "שחזר" : pendingAction.type === "delete" ? "מחק" : "ייבא"}
              </button>
            </div>
          </div>
        )}

        {/* Import error */}
        {importError && (
          <div className="bg-red-50 dark:bg-red-900/20 border-b border-red-200 px-4 py-2 text-xs text-red-700 dark:text-red-300">
            {importError}
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {shiftHistory.length === 0 ? (
            <p className="text-center text-gray-400 py-10">אין משמרות שמורות</p>
          ) : (
            shiftHistory.map((snap) => {
              const date = new Date(snap.archivedAt);
              const allTasks = snap.patients.flatMap((p) => [
                ...p.tasks,
                ...p.generatedTasks,
              ]);
              const done = allTasks.filter((t) => t.done).length;
              const total = allTasks.length;
              return (
                <div
                  key={snap.id}
                  className="border border-gray-200 dark:border-gray-700 rounded-xl p-3 space-y-2 bg-gray-50 dark:bg-gray-800"
                >
                  <div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {snap.label}
                    </div>
                    <div className="text-xs text-gray-500">
                      {date.toLocaleDateString("he-IL")}{" "}
                      {date.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                      {" · "}
                      {snap.patients.length} חולים · {done}/{total} בוצעו
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPendingAction({ type: "restore", id: snap.id, label: snap.label })}
                      className="flex-1 min-h-[44px] text-xs rounded-lg bg-blue-50 text-blue-700 border border-blue-200 active:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-700"
                    >
                      🔄 שחזר
                    </button>
                    <button
                      onClick={() => setPendingAction({ type: "delete", id: snap.id, label: snap.label })}
                      className="min-h-[44px] px-4 text-xs rounded-lg bg-red-50 text-red-700 border border-red-200 active:bg-red-100 dark:bg-red-900/20 dark:text-red-300 dark:border-red-700"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Import + close */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-3 space-y-2 shrink-0">
          <input ref={fileRef} type="file" accept=".json" onChange={handleImportBackup} className="hidden" />
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full min-h-[44px] bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium active:bg-gray-200"
          >
            📂 ייבא גיבוי (JSON)
          </button>
          <button
            onClick={onClose}
            className="w-full min-h-[44px] text-sm text-gray-400 active:bg-gray-50 dark:active:bg-gray-800 rounded-xl"
          >
            סגור
          </button>
        </div>
      </div>
    </div>
  );
}

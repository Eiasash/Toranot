import { useRef } from "react";
import { usePatientsState, usePatientsDispatch } from "../context/PatientsContext";
import type { PatientEntry } from "../types";

export function ShiftHistory({ onClose }: { onClose: () => void }) {
  const { shiftHistory } = usePatientsState();
  const dispatch = usePatientsDispatch();
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImportBackup = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string) as PatientEntry[];
        if (!Array.isArray(data)) throw new Error("Invalid format");
        if (confirm(`לייבא ${data.length} מטופלים? (יחליף את הרשימה הנוכחית)`)) {
          dispatch({ type: "IMPORT_BACKUP", patients: data });
          alert("יובא בהצלחה!");
        }
      } catch {
        alert("קובץ לא תקין. ודא שזה קובץ JSON שיוצא מתורנות.");
      }
    };
    reader.readAsText(file);
    // Reset so the same file can be re-imported
    event.target.value = "";
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[70vh] flex flex-col overflow-hidden shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="היסטוריית משמרות"
      >
        <div className="bg-gray-700 text-white px-4 py-3 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold">היסטוריית משמרות</h2>
            <p className="text-xs text-gray-300">
              {shiftHistory.length} משמרות שמורות (עד 30)
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white text-xl px-2"
            aria-label="סגור"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {shiftHistory.length === 0 ? (
            <p className="text-center text-gray-400 py-12">אין משמרות שמורות</p>
          ) : (
            shiftHistory.map((snap) => {
              const allTasks = snap.patients.flatMap((p) => [
                ...p.tasks,
                ...p.generatedTasks,
              ]);
              const done = allTasks.filter((t) => t.done).length;
              const total = allTasks.length;
              const date = new Date(snap.archivedAt);

              return (
                <div
                  key={snap.id}
                  className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {snap.label}
                      </div>
                      <div className="text-xs text-gray-500">
                        {date.toLocaleDateString("he-IL")}{" "}
                        {date.toLocaleTimeString("he-IL", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {" · "}
                        {snap.patients.length} חולים · {done}/{total} בוצעו
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        if (
                          confirm(
                            `לשחזר משמרת "${snap.label}"?\n(יחליף את הרשימה הנוכחית)`,
                          )
                        ) {
                          dispatch({
                            type: "RESTORE_SHIFT",
                            snapshotId: snap.id,
                          });
                          onClose();
                        }
                      }}
                      className="flex-1 py-2 text-xs rounded-lg bg-blue-50 text-blue-700 border border-blue-200 active:bg-blue-100"
                      aria-label={`שחזר משמרת ${snap.label}`}
                    >
                      🔄 שחזר
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`למחוק "${snap.label}" מההיסטוריה?`)) {
                          dispatch({
                            type: "DELETE_SHIFT",
                            snapshotId: snap.id,
                          });
                        }
                      }}
                      className="py-2 px-3 text-xs rounded-lg bg-red-50 text-red-700 border border-red-200 active:bg-red-100"
                      aria-label={`מחק משמרת ${snap.label}`}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Import backup */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-3">
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            onChange={handleImportBackup}
            className="hidden"
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl text-xs font-medium active:bg-gray-200"
            aria-label="ייבא גיבוי"
          >
            📂 ייבא גיבוי (JSON)
          </button>
        </div>
      </div>
    </div>
  );
}

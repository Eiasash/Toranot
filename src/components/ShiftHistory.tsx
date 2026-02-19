import { usePatientsState, usePatientsDispatch } from "../context/PatientsContext";

export function ShiftHistory({ onClose }: { onClose: () => void }) {
  const { shiftHistory } = usePatientsState();
  const dispatch = usePatientsDispatch();

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[70vh] flex flex-col overflow-hidden shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gray-700 text-white px-4 py-3 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold">היסטוריית משמרות</h2>
            <p className="text-xs text-gray-300">5 משמרות אחרונות</p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white text-xl px-2">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {shiftHistory.length === 0 ? (
            <p className="text-center text-gray-400 py-12">
              אין משמרות שמורות
            </p>
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
                        {date.toLocaleDateString("he-IL")} {date.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                    <div className="text-xs text-gray-500">
                      {snap.patients.length} חולים · {done}/{total} בוצעו
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        if (confirm("לטעון משמרת זו? המשמרת הנוכחית תוחלף.")) {
                          dispatch({
                            type: "RESTORE_SHIFT",
                            snapshotId: snap.id,
                          });
                          onClose();
                        }
                      }}
                      className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium"
                    >
                      שחזר
                    </button>
                    <button
                      onClick={() => {
                        if (confirm("למחוק משמרת זו?")) {
                          dispatch({
                            type: "DELETE_SHIFT",
                            snapshotId: snap.id,
                          });
                        }
                      }}
                      className="py-2 px-3 bg-red-50 text-red-600 rounded-lg text-xs font-medium border border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800"
                    >
                      מחק
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

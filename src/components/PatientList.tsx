import { useCallback, useState, useMemo } from "react";
import { usePatientsState, usePatientsDispatch } from "../context/PatientsContext";
import { SECTION_LABEL } from "../types";
import { PatientCard, PatientRow } from "./PatientCard";
import { PullToRefresh } from "./PullToRefresh";
import { calculateAcuity } from "../engine/acuity";
import { comparePatientsByRoom } from "../utils/sortPatients";

export function PatientList() {
  const { patients, activeSection } = usePatientsState();
  const dispatch = usePatientsDispatch();
  const [sortMode, setSortMode] = useState<"room" | "severity" | "name">("room");

  const filtered = useMemo(() => {
    const sectionPatients = patients.filter((p) => p.section === activeSection);
    const sorted = [...sectionPatients];
    if (sortMode === "severity") {
      sorted.sort((a, b) => calculateAcuity(b).score - calculateAcuity(a).score || (a.order ?? 0) - (b.order ?? 0));
    } else if (sortMode === "name") {
      sorted.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "he"));
    } else {
      // Deterministic: room number → bed number → order (▲▼ tiebreaker)
      sorted.sort(comparePatientsByRoom);
    }
    return sorted;
  }, [patients, activeSection, sortMode]);

  const handleRefresh = useCallback(() => {
    dispatch({ type: "REAPPLY_RULES" });
  }, [dispatch]);

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 py-20 px-6 animate-card-in">
        <svg width="72" height="72" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1} className="mb-4 opacity-30">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 5h6" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 14l2 2 4-4" />
        </svg>
        <p className="text-lg font-medium">אין חולים ב{SECTION_LABEL[activeSection]}</p>
        <p className="text-sm mt-2 text-center leading-relaxed">
          צלמו דף תורן או הדביקו רשימה למעלה
          <br />
          <span className="text-xs opacity-60">ניתן גם לגרור חולים מקטגוריה אחרת</span>
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Sort toggle + room chips — sticky so they stay visible while scrolling */}
      {filtered.length > 1 && (
        <div className="sticky top-0 z-10 px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
              {filtered.length} חולים ב{SECTION_LABEL[activeSection]}
            </span>
            <select
              value={sortMode}
              onChange={e => setSortMode(e.target.value as "room" | "severity" | "name")}
              className="text-xs px-2 py-1 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-none outline-none"
            >
              <option value="room">📋 לפי חדר</option>
              <option value="severity">🔥 לפי חומרה</option>
              <option value="name">א→ב לפי שם</option>
            </select>
          </div>
          {/* Room quick-filter chips + unstable jump */}
          {(() => {
            const rooms = [...new Set(filtered.map(p => p.room).filter(Boolean))].sort();
            const hasUnstable = filtered.some(p => calculateAcuity(p).score >= 8);
            if (rooms.length < 2 && !hasUnstable) return null;
            return (
              <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
                {hasUnstable && (
                  <button
                    onClick={() => {
                      const first = filtered.find(p => calculateAcuity(p).score >= 8);
                      if (first) {
                        document.getElementById(`patient-${first.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }
                    }}
                    className="shrink-0 text-xs px-2 py-0.5 rounded-md bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 active:bg-red-200 font-semibold"
                  >
                    ⚠ לא יציבים
                  </button>
                )}
                {rooms.map(room => (
                  <button
                    key={room}
                    onClick={() => {
                      document.querySelector(`[data-room="${room}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                    }}
                    className="shrink-0 text-xs px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 active:bg-blue-200 font-mono tabular-nums"
                  >
                    {room}
                  </button>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* Mobile: full-width cards with pull-to-refresh */}
      <div className="lg:hidden">
        <PullToRefresh onRefresh={handleRefresh}>
          <div className="space-y-2 p-2 pb-20">
            {filtered.map((patient) => (
              <PatientCard key={patient.id} patient={patient} />
            ))}
          </div>
        </PullToRefresh>
      </div>

      {/* Desktop: table view */}
      <div className="hidden lg:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 text-xs bg-gray-50 dark:bg-gray-800">
              <th className="py-2.5 px-4 text-right font-medium w-20">חדר</th>
              <th className="py-2.5 px-4 text-right font-medium">שם</th>
              <th className="py-2.5 px-4 text-right font-medium w-16">גיל</th>
              <th className="py-2.5 px-4 text-right font-medium">אבחנה</th>
              <th className="py-2.5 px-4 text-right font-medium w-40">דגלים</th>
              <th className="py-2.5 px-4 text-center font-medium w-20">משימות</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((patient) => (
              <PatientRow key={patient.id} patient={patient} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

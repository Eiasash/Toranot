import { useCallback } from "react";
import { usePatientsState, usePatientsDispatch } from "../context/PatientsContext";
import { SECTION_LABEL } from "../types";
import { PatientCard, PatientRow } from "./PatientCard";
import { PullToRefresh } from "./PullToRefresh";

export function PatientList() {
  const { patients, activeSection } = usePatientsState();
  const dispatch = usePatientsDispatch();
  const filtered = patients
    .filter((p) => p.section === activeSection)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

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
      {/* Mobile: full-width cards with pull-to-refresh */}
      <div className="lg:hidden">
        <PullToRefresh onRefresh={handleRefresh}>
          <div className="space-y-2 p-2 pb-6">
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

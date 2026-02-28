import React, { useCallback, useState, useMemo } from "react";
import { usePatientsState, usePatientsDispatch } from "../context/PatientsContext";
import { SECTION_LABEL, PATIENT_SECTIONS } from "../types";
import { PatientCard, PatientRow } from "./PatientCard";
import { PullToRefresh } from "./PullToRefresh";
import { calculateAcuity } from "../engine/acuity";
import { comparePatientsByRoom } from "../utils/sortPatients";

import { isNewThisShift as _isNewThisShift, getShiftStart } from "../utils/shiftTime";
function isNewThisShift(p: import("../types").PatientEntry): boolean { return _isNewThisShift(p.scannedAt); }

// Section ordering for ALL view
const SECTION_ORDER: Record<string, number> = Object.fromEntries(
  PATIENT_SECTIONS.map((s, i) => [s, i])
);

export function PatientList() {
  const { patients, activeSection } = usePatientsState();
  const dispatch = usePatientsDispatch();
  const [sortMode, setSortMode] = useState<"room" | "severity" | "name" | "new">("room");

  const filtered = useMemo(() => {
    const sectionPatients = activeSection === "ALL"
      ? patients
      : patients.filter((p) => p.section === activeSection);
    const sorted = [...sectionPatients];
    if (sortMode === "severity") {
      sorted.sort((a, b) => calculateAcuity(b).score - calculateAcuity(a).score || (a.order ?? 0) - (b.order ?? 0));
    } else if (sortMode === "name") {
      sorted.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "he"));
    } else if (sortMode === "new") {
      sorted.sort((a, b) => {
        const aN = isNewThisShift(a) ? 0 : 1;
        const bN = isNewThisShift(b) ? 0 : 1;
        if (aN !== bN) return aN - bN;
        return comparePatientsByRoom(a, b);
      });
    } else {
      if (activeSection === "ALL") {
        // Group by section order, then room within each section
        sorted.sort((a, b) => {
          const secDiff = (SECTION_ORDER[a.section] ?? 99) - (SECTION_ORDER[b.section] ?? 99);
          if (secDiff !== 0) return secDiff;
          return comparePatientsByRoom(a, b);
        });
      } else {
        // Deterministic: room number → bed number → order (▲▼ tiebreaker)
        sorted.sort(comparePatientsByRoom);
      }
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
        <p className="text-lg font-medium">
          {activeSection === "ALL" ? "אין חולים במחלקה" : `אין חולים ב${SECTION_LABEL[activeSection]}`}
        </p>
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
              {filtered.length} חולים {activeSection === "ALL" ? "במחלקה" : `ב${SECTION_LABEL[activeSection]}`}
            </span>
            <select
              value={sortMode}
              onChange={e => setSortMode(e.target.value as "room" | "severity" | "name")}
              className="text-xs px-2 py-1 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-none outline-none"
            >
              <option value="room">📋 לפי חדר</option>
              <option value="new">🆕 קבלות תורן</option>
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
                {(() => {
                  const newPts = filtered.filter(p => isNewThisShift(p));
                  if (newPts.length === 0) return null;
                  return (
                    <button
                      onClick={() => {
                        setSortMode("new");
                        const first = newPts[0];
                        setTimeout(() => document.getElementById(`patient-${first.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
                      }}
                      className="shrink-0 text-xs px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 active:bg-emerald-200 font-semibold"
                    >
                      🆕 קבלות ({newPts.length})
                    </button>
                  );
                })()}
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
            {filtered.map((patient, idx) => {
              const showDivider = activeSection === "ALL" && (idx === 0 || patient.section !== filtered[idx - 1].section);
              return (
                <div key={patient.id}>
                  {showDivider && (
                    <div className="flex items-center gap-2 py-1.5 px-1 mt-1">
                      <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                        {SECTION_LABEL[patient.section] ?? patient.section}
                      </span>
                      <div className="flex-1 border-t border-blue-200 dark:border-blue-800" />
                    </div>
                  )}
                  <PatientCard patient={patient} />
                </div>
              );
            })}
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
            {filtered.map((patient, idx) => {
              const showDivider = activeSection === "ALL" && (idx === 0 || patient.section !== filtered[idx - 1].section);
              return (
                <React.Fragment key={patient.id}>
                  {showDivider && (
                    <tr className="bg-blue-50 dark:bg-blue-900/20">
                      <td colSpan={6} className="py-1.5 px-4 text-xs font-semibold text-blue-700 dark:text-blue-400">
                        {SECTION_LABEL[patient.section] ?? patient.section}
                      </td>
                    </tr>
                  )}
                  <PatientRow patient={patient} />
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

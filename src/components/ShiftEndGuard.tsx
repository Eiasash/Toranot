/**
 * ShiftEndGuard — pre-flight handoff integrity check.
 *
 * Renders a banner at the top of HandoffSheet showing open issues.
 * When critical issues exist, the "copy/share" actions show a
 * confirmation dialog first.
 *
 * NOT a blocking modal on tab switch — that's annoying. Instead:
 * - Persistent banner at top of handoff view (collapsible)
 * - Copy/share buttons require acknowledgement when critical issues exist
 */

import { useState, useMemo } from "react";
import type { PatientEntry } from "../types";
import { runShiftIntegrityCheck, type IntegrityIssue, type ShiftIntegrityReport } from "../engine/shiftIntegrity";

interface ShiftEndGuardProps {
  patients: PatientEntry[];
  /** Called when user acknowledges issues and wants to proceed */
  onAcknowledge?: () => void;
}

export function ShiftEndGuard({ patients, onAcknowledge }: ShiftEndGuardProps) {
  const [expanded, setExpanded] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  const report: ShiftIntegrityReport = useMemo(
    () => runShiftIntegrityCheck(patients),
    [patients]
  );

  // No issues — show green banner, no expand
  if (report.issues.length === 0) {
    return (
      <div className="mx-3 mt-2 mb-1 px-3 py-2 rounded-lg bg-emerald-900/40 border border-emerald-700/50 text-emerald-300 text-xs">
        ✅ מוכן למסירה — אין בעיות פתוחות
      </div>
    );
  }

  const handleAcknowledge = () => {
    setAcknowledged(true);
    onAcknowledge?.();
  };

  return (
    <div className={`mx-3 mt-2 mb-1 rounded-lg border ${
      report.criticalCount > 0
        ? "bg-red-900/30 border-red-700/50"
        : "bg-yellow-900/30 border-yellow-700/50"
    }`}>
      {/* Summary banner — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2.5 flex items-center justify-between text-right min-h-[44px]"
      >
        <span className={`text-xs font-medium ${
          report.criticalCount > 0 ? "text-red-300" : "text-yellow-300"
        }`}>
          {report.summary}
        </span>
        <span className="text-gray-400 text-xs mr-2">
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {/* Expanded issue list */}
      {expanded && (
        <div className="px-3 pb-3 space-y-1.5">
          {report.issues.map((issue, i) => (
            <IssueRow key={`${issue.patientId}-${issue.category}-${i}`} issue={issue} />
          ))}

          {/* Acknowledge button for critical issues */}
          {report.criticalCount > 0 && !acknowledged && (
            <button
              onClick={handleAcknowledge}
              className="w-full mt-2 py-2.5 rounded-lg bg-red-800/50 text-red-200 text-xs font-medium border border-red-700/50 min-h-[44px] active:bg-red-700/50"
            >
              ✓ ידוע לי — המשך למסירה
            </button>
          )}

          {acknowledged && (
            <div className="text-xs text-gray-500 text-center mt-1">
              ✓ אושר — ניתן להעתיק/לשתף
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function IssueRow({ issue }: { issue: IntegrityIssue }) {
  const icon = issue.severity === "critical" ? "🔴" : "⚠️";
  return (
    <div className={`flex gap-2 items-start text-xs rounded px-2 py-1.5 ${
      issue.severity === "critical"
        ? "bg-red-950/50 text-red-200"
        : "bg-yellow-950/50 text-yellow-200"
    }`}>
      <span className="shrink-0">{icon}</span>
      <div className="min-w-0">
        <span className="font-medium">
          {issue.room ? `חדר ${issue.room}` : ""}{issue.patientName ? ` ${issue.patientName}` : ""}
        </span>
        <span className="text-gray-400 mx-1">—</span>
        <span>{issue.message}</span>
      </div>
    </div>
  );
}

/**
 * Hook for HandoffSheet to gate copy/share actions.
 * Returns true if handoff is safe to export without confirmation.
 */
export function useShiftIntegrity(patients: PatientEntry[]) {
  const [acknowledged, setAcknowledged] = useState(false);
  const report = useMemo(() => runShiftIntegrityCheck(patients), [patients]);

  return {
    report,
    canExportFreely: report.passed || acknowledged,
    acknowledge: () => setAcknowledged(true),
  };
}

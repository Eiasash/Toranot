/**
 * Shift Integrity Engine
 *
 * Pre-flight check before handoff export. Scans all patients and surfaces
 * open issues that should NOT be handed off unacknowledged:
 *   - Open STAT tasks (must be done or explicitly acknowledged)
 *   - Admissions with no handover note
 *   - Patients with active AKI and no follow-up task
 *   - Overdue tasks (past dueAt)
 *   - Critical drug interactions not addressed
 *   - Patients with critical lab deltas and no related task
 *
 * Returns a structured report. The component (ShiftEndGuard) decides
 * whether to block or warn.
 */

import type { PatientEntry, Task } from "../types";
import { calculateLabDeltas, type LabDelta } from "./labDelta";
import { checkDrugInteractions } from "./drugSafety";

export interface IntegrityIssue {
  patientId: string;
  patientName: string | null;
  room: string | null;
  severity: "critical" | "warning";
  category: "stat_open" | "no_handover" | "aki_no_followup" | "overdue" | "critical_interaction" | "critical_lab";
  message: string;
}

export interface ShiftIntegrityReport {
  issues: IntegrityIssue[];
  criticalCount: number;
  warningCount: number;
  passed: boolean; // true when zero critical issues
  summary: string; // Hebrew summary
}

function getOpenTasks(patient: PatientEntry): Task[] {
  const allTasks = [
    ...patient.tasks,
    ...patient.generatedTasks.filter(t => !(t.done && t.dismissed)),
  ];
  return allTasks.filter(t => !t.done);
}

export function runShiftIntegrityCheck(patients: PatientEntry[]): ShiftIntegrityReport {
  const issues: IntegrityIssue[] = [];
  const now = Date.now();

  for (const p of patients) {
    if (p.discharged) continue;

    const openTasks = getOpenTasks(p);

    // 1. Open STAT tasks
    const statOpen = openTasks.filter(t => t.urgency === "stat");
    if (statOpen.length > 0) {
      issues.push({
        patientId: p.id,
        patientName: p.name,
        room: p.room,
        severity: "critical",
        category: "stat_open",
        message: `${statOpen.length} משימות סטט פתוחות: ${statOpen.map(t => t.text).slice(0, 3).join(", ")}`,
      });
    }

    // 2. Admissions with no handover note
    if (p.isAdmission && (!p.handoverNote || p.handoverNote.trim().length < 10)) {
      issues.push({
        patientId: p.id,
        patientName: p.name,
        room: p.room,
        severity: "critical",
        category: "no_handover",
        message: "קבלה חדשה בלי סיכום מסירה",
      });
    }

    // 3. Critical lab deltas with no related follow-up task
    const labDeltas = calculateLabDeltas(p);
    const criticalLabs = labDeltas.filter(d => d.severity === "critical");
    for (const lab of criticalLabs) {
      const hasRelatedTask = openTasks.some(t =>
        t.text.toLowerCase().includes(lab.label.toLowerCase()) ||
        t.text.includes("מעבדות") ||
        t.text.includes("creatinine") ||
        t.text.includes("קראטינין") ||
        t.text.includes(lab.label)
      );
      if (!hasRelatedTask) {
        issues.push({
          patientId: p.id,
          patientName: p.name,
          room: p.room,
          severity: "critical",
          category: lab.akiStage ? "aki_no_followup" : "critical_lab",
          message: lab.akiStage
            ? `AKI Stage ${lab.akiStage} ללא משימת מעקב`
            : `${lab.label} קריטי (${lab.baseline}→${lab.latest}) ללא מעקב`,
        });
      }
    }

    // 4. Overdue tasks
    const overdue = openTasks.filter(t => t.dueAt && new Date(t.dueAt).getTime() < now);
    if (overdue.length > 0) {
      issues.push({
        patientId: p.id,
        patientName: p.name,
        room: p.room,
        severity: "warning",
        category: "overdue",
        message: `${overdue.length} משימות באיחור`,
      });
    }

    // 5. Critical drug interactions not addressed
    const interactions = checkDrugInteractions(p);
    const criticalInteractions = interactions.filter(i => i.severity === "critical");
    if (criticalInteractions.length > 0) {
      // Check if any task mentions drug interaction awareness
      const hasAcknowledgement = openTasks.some(t =>
        t.text.includes("אינטראקציה") || t.text.includes("interaction") || t.text.includes("drug")
      ) || (p.handoverNote?.includes("אינטראקציה") ?? false);

      if (!hasAcknowledgement) {
        issues.push({
          patientId: p.id,
          patientName: p.name,
          room: p.room,
          severity: "warning",
          category: "critical_interaction",
          message: `${criticalInteractions.length} אינטראקציות קריטיות לא מטופלות`,
        });
      }
    }
  }

  // Sort: critical first, then by room
  issues.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
    return (a.room ?? "").localeCompare(b.room ?? "");
  });

  const criticalCount = issues.filter(i => i.severity === "critical").length;
  const warningCount = issues.filter(i => i.severity === "warning").length;

  let summary: string;
  if (issues.length === 0) {
    summary = "✅ אין בעיות — מוכן למסירה";
  } else if (criticalCount > 0) {
    summary = `🔴 ${criticalCount} בעיות קריטיות, ${warningCount} אזהרות — נדרש אישור לפני מסירה`;
  } else {
    summary = `⚠️ ${warningCount} אזהרות — שים לב לפני מסירה`;
  }

  return {
    issues,
    criticalCount,
    warningCount,
    passed: criticalCount === 0,
    summary,
  };
}

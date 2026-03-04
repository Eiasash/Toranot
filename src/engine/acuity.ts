/**
 * Acuity Engine — calculates a "sickness score" per patient.
 *
 * Used for automatic sorting: sickest patients float to top.
 * Score is transparent — the UI shows the breakdown so the doctor
 * can override if clinical judgment disagrees.
 *
 * Scoring weights (tuned for geriatric on-call priorities):
 *   - Open STAT tasks          × 5
 *   - Open urgent tasks        × 3
 *   - Active drug interactions  × 4 (critical) / 2 (major)
 *   - Critical lab deltas       × 4
 *   - Warning lab deltas        × 2
 *   - DNR/DNI flags             × 0 (doesn't make them sicker, just changes goals)
 *   - Active scenarios          × 1
 *   - Tasks with approaching deadlines (<30min) × 3
 */

import type { PatientEntry } from "../types";
import { checkDrugInteractions } from "./drugSafety";
import { calculateLabDeltas } from "./labDelta";

export interface AcuityBreakdown {
  score: number;
  components: Array<{
    label: string;
    count: number;
    weight: number;
    subtotal: number;
  }>;
}

export function calculateAcuity(patient: PatientEntry): AcuityBreakdown {
  const allTasks = [...patient.tasks, ...patient.generatedTasks.filter(t => !t.dismissed)];
  const openTasks = allTasks.filter((t) => !t.done);

  const statCount = openTasks.filter((t) => t.urgency === "stat").length;
  const urgentCount = openTasks.filter((t) => t.urgency === "urgent").length;

  // Drug interactions
  const interactions = checkDrugInteractions(patient);
  const criticalInteractions = interactions.filter((i) => i.severity === "critical").length;
  const majorInteractions = interactions.filter((i) => i.severity === "major").length;

  // Approaching deadlines (<30 min)
  const now = Date.now();
  const approachingDeadlines = openTasks.filter((t) => {
    if (!t.dueAt) return false;
    const remaining = new Date(t.dueAt).getTime() - now;
    return remaining > 0 && remaining < 30 * 60 * 1000;
  }).length;

  // Overdue tasks
  const overdueTasks = openTasks.filter((t) => {
    if (!t.dueAt) return false;
    return new Date(t.dueAt).getTime() < now;
  }).length;

  // Abnormal labs — use the lab delta engine to count only clinically significant changes
  const labDeltas = calculateLabDeltas(patient);
  const criticalLabs = labDeltas.filter((d) => d.severity === "critical").length;
  const warningLabs = labDeltas.filter((d) => d.severity === "warning").length;

  // Active scenarios (status lines that triggered generated tasks)
  const activeScenarios = patient.generatedTasks.filter((t) => !t.done && !t.dismissed).length;

  const components = [
    { label: "סטט פתוחים", count: statCount, weight: 5, subtotal: statCount * 5 },
    { label: "דחופים פתוחים", count: urgentCount, weight: 3, subtotal: urgentCount * 3 },
    { label: "אינטראקציות קריטיות", count: criticalInteractions, weight: 4, subtotal: criticalInteractions * 4 },
    { label: "אינטראקציות משמעותיות", count: majorInteractions, weight: 2, subtotal: majorInteractions * 2 },
    { label: "משימות באיחור", count: overdueTasks, weight: 4, subtotal: overdueTasks * 4 },
    { label: "דדליין קרוב (<30 דק׳)", count: approachingDeadlines, weight: 3, subtotal: approachingDeadlines * 3 },
    { label: "מעבדות קריטיות", count: criticalLabs, weight: 4, subtotal: criticalLabs * 4 },
    { label: "מעבדות חריגות", count: warningLabs, weight: 2, subtotal: warningLabs * 2 },
    { label: "תרחישים פעילים", count: activeScenarios, weight: 1, subtotal: activeScenarios * 1 },
  ].filter((c) => c.count > 0);

  const score = components.reduce((sum, c) => sum + c.subtotal, 0);

  return { score, components };
}

/**
 * Sort patients by acuity (descending — sickest first).
 * Falls back to manual order for equal scores.
 */
export function sortByAcuity(patients: PatientEntry[]): PatientEntry[] {
  // Pre-compute scores once to avoid O(n log n) recalculations in the comparator
  const scores = new Map<string, number>();
  for (const p of patients) {
    scores.set(p.id, calculateAcuity(p).score);
  }
  return [...patients].sort((a, b) => {
    const scoreA = scores.get(a.id)!;
    const scoreB = scores.get(b.id)!;
    if (scoreA !== scoreB) return scoreB - scoreA; // Higher = sicker = first
    return (a.order ?? 0) - (b.order ?? 0); // Fallback to manual order
  });
}

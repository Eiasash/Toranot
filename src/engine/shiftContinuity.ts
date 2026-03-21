/**
 * Shift Continuity Engine
 *
 * Cross-references newly imported patients against the most recent archived shift.
 * Surfaces "previous on-call" context so the incoming doctor doesn't miss
 * critical information that was documented by the prior on-call.
 *
 * Match strategy: room + name fuzzy match (OCR names may differ slightly).
 * Returns a map of patientId → previous context.
 */

import type { PatientEntry } from "../types";
import type { ShiftSnapshot } from "../context/reducer";

export interface PreviousShiftContext {
  /** What the previous on-call wrote in the handover note */
  handoverNote: string | null;
  /** Open tasks from previous shift (not done, not dismissed) */
  openTasks: string[];
  /** Previous on-call flags (e.g., DNR, NPO) */
  flags: string[];
  /** When the previous shift was archived */
  archivedAt: string;
  /** Previous shift label (e.g., "19/03 — ערב") */
  shiftLabel: string;
}

/**
 * Match patients between shifts.
 * Strategy: exact room match + name similarity (first 4 chars, case-insensitive).
 * This handles OCR name variations like "כהן שרה" vs "כהן שרה מ".
 */
function findPreviousPatient(
  current: PatientEntry,
  previousPatients: PatientEntry[],
): PatientEntry | null {
  if (!current.room && !current.name) return null;

  // Try exact room + name prefix match
  for (const prev of previousPatients) {
    if (current.room && prev.room && current.room === prev.room) {
      // Same room — check if name is similar
      if (!current.name || !prev.name) return prev; // same room, either unnamed
      const currName = current.name.trim().toLowerCase();
      const prevName = prev.name.trim().toLowerCase();
      // Either starts with the other, or first 4 chars match
      if (
        currName.startsWith(prevName) ||
        prevName.startsWith(currName) ||
        currName.slice(0, 4) === prevName.slice(0, 4)
      ) {
        return prev;
      }
    }
  }

  // Try name-only match if room didn't match (patient may have moved rooms)
  if (current.name && current.name.length >= 4) {
    const currName = current.name.trim().toLowerCase();
    for (const prev of previousPatients) {
      if (!prev.name) continue;
      const prevName = prev.name.trim().toLowerCase();
      if (currName === prevName) return prev;
    }
  }

  return null;
}

/**
 * Build shift continuity context for all current patients.
 * Returns a Map<patientId, PreviousShiftContext> — only includes entries
 * where there's meaningful context to surface (handover note, open tasks, or flags).
 */
export function buildShiftContinuity(
  currentPatients: PatientEntry[],
  shiftHistory: ShiftSnapshot[],
): Map<string, PreviousShiftContext> {
  const result = new Map<string, PreviousShiftContext>();

  if (shiftHistory.length === 0) return result;

  // Use the most recent archived shift
  const lastShift = shiftHistory[0];
  if (!lastShift.patients || lastShift.patients.length === 0) return result;

  for (const current of currentPatients) {
    const prev = findPreviousPatient(current, lastShift.patients);
    if (!prev) continue;

    const openTasks = [
      ...prev.tasks.filter(t => !t.done),
      ...prev.generatedTasks.filter(t => !t.done && !t.dismissed),
    ].map(t => t.text);

    const hasContext =
      (prev.handoverNote && prev.handoverNote.trim().length > 5) ||
      openTasks.length > 0 ||
      prev.flags.length > 0;

    if (!hasContext) continue;

    result.set(current.id, {
      handoverNote: prev.handoverNote && prev.handoverNote.trim().length > 5
        ? prev.handoverNote
        : null,
      openTasks,
      flags: prev.flags,
      archivedAt: lastShift.archivedAt,
      shiftLabel: lastShift.label,
    });
  }

  return result;
}

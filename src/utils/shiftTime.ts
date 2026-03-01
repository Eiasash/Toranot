/**
 * On-call shift utilities — single source of truth.
 * Shift window: 16:00 → 08:00 next day.
 */

/** Returns true if the given time falls within on-call hours (16:00–08:00). */
export function isOnCallTime(d: Date): boolean {
  const h = d.getHours();
  return h >= 16 || h < 8;
}

/** Returns the start of the current on-call shift (most recent 16:00). */
export function getShiftStart(): Date {
  const now = new Date();
  const s = new Date(now);
  s.setMinutes(0, 0, 0);
  if (now.getHours() < 8) {
    // Early morning: shift started yesterday at 16:00
    s.setDate(s.getDate() - 1);
  }
  s.setHours(16);
  return s;
}

/** Returns true if the patient was scanned/added during the current on-call shift.
 * A patient with existing activity (done tasks, notes, labs) is never "new" —
 * this prevents re-imports from falsely marking established patients as new admissions.
 */
export function isNewThisShift(scannedAt: string | undefined, activity?: {
  hasDoneTasks?: boolean;
  hasManualTasks?: boolean;
  hasNotes?: boolean;
  hasLabs?: boolean;
  hasHandoverNote?: boolean;
}): boolean {
  if (!scannedAt) return false;
  // If the patient has any prior activity, they're not a new admission
  if (activity) {
    const hasActivity = activity.hasDoneTasks || activity.hasManualTasks ||
      activity.hasNotes || activity.hasLabs || activity.hasHandoverNote;
    if (hasActivity) return false;
  }
  const d = new Date(scannedAt);
  return isOnCallTime(d) && d >= getShiftStart();
}

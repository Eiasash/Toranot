import type { PatientEntry, Task } from "../types";
import { buildPatientKey, buildPatientLooseKey } from "../utils/patientKey";

function sameTask(a: Task, b: Task): boolean {
  return a.text.trim() === b.text.trim();
}

function mergeTaskState(oldTask: Task, newTask: Task): Task {
  return {
    ...newTask,
    done: oldTask.done,
    doneTime: oldTask.doneTime,
    // Preserve any manual remark/result the user wrote.
    note: oldTask.note ?? newTask.note ?? null,
  };
}

function mergePatient(oldP: PatientEntry, newP: PatientEntry): PatientEntry {
  // Merge extracted tasks: preserve done state from previous scan
  const mergedExtracted: Task[] = newP.tasks.map((nt) => {
    const match = oldP.tasks.find(
      (ot) => ot.source === "extracted" && sameTask(ot, nt),
    );
    return match ? mergeTaskState(match, nt) : nt;
  });

  // Keep manual tasks from the old entry — never delete them automatically
  const manualKeep = oldP.tasks.filter(
    (t) => t.source === "manual" && !mergedExtracted.some((nt) => sameTask(nt, t)),
  );

  // Merge generated tasks: preserve done state
  const mergedGenerated: Task[] = newP.generatedTasks.map((nt) => {
    const match = oldP.generatedTasks.find((ot) => sameTask(ot, nt));
    return match ? mergeTaskState(match, nt) : nt;
  });

  return {
    ...newP,
    id: oldP.id,
    scannedAt: newP.scannedAt,
    tasks: [...mergedExtracted, ...manualKeep],
    generatedTasks: mergedGenerated,
    notes: Array.from(new Set([...(oldP.notes ?? []), ...(newP.notes ?? [])])),
  };
}

/**
 * Merge a newly parsed scan into existing state.
 *
 * Guarantees:
 * - No duplicate patients (stable key based on section + room + name)
 * - Preserves manual tasks
 * - Preserves done/doneTime for extracted + generated tasks
 * - Detects transfers between sections via loose key (room + name)
 */
export function mergeScan(
  existing: PatientEntry[],
  incoming: PatientEntry[],
): PatientEntry[] {
  const existingByStrict = new Map<string, PatientEntry>();
  const existingByLoose = new Map<string, PatientEntry>();

  for (const p of existing) {
    existingByStrict.set(buildPatientKey(p.section, p.room, p.name), p);
    existingByLoose.set(buildPatientLooseKey(p.room, p.name), p);
  }

  const consumed = new Set<string>();
  const merged: PatientEntry[] = [];

  for (const np of incoming) {
    const strictKey = buildPatientKey(np.section, np.room, np.name);
    const looseKey = buildPatientLooseKey(np.room, np.name);

    const matchStrict = existingByStrict.get(strictKey);
    const matchLoose = existingByLoose.get(looseKey);
    const match = matchStrict ?? matchLoose;

    if (!match) {
      merged.push(np);
      continue;
    }

    consumed.add(buildPatientKey(match.section, match.room, match.name));
    merged.push(mergePatient(match, np));
  }

  // Keep patients that weren't mentioned in the new scan
  for (const p of existing) {
    const key = buildPatientKey(p.section, p.room, p.name);
    if (!consumed.has(key)) merged.push(p);
  }

  return merged;
}

import type { PatientEntry, Task } from "../types";
import {
  buildPatientKey,
  buildPatientLooseKey,
  buildPatientStableKey,
} from "../utils/patientKey";

function sameTask(a: Task, b: Task): boolean {
  return a.text.trim().replace(/\s+/g, " ") === b.text.trim().replace(/\s+/g, " ");
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
    order: newP.order ?? oldP.order ?? 0,
    // Preserve original scannedAt so isNewThisShift doesn't reset on every re-import
    scannedAt: oldP.scannedAt ?? newP.scannedAt,
    tasks: [...mergedExtracted, ...manualKeep],
    generatedTasks: mergedGenerated,
    notes: Array.from(new Set([...(oldP.notes ?? []), ...(newP.notes ?? [])])),
    labs: oldP.labs ?? [],
    handoverNote: oldP.handoverNote,
    photos: oldP.photos ?? [],
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
  const existingByLoose = new Map<string, PatientEntry[]>();
  const existingByStable = new Map<string, PatientEntry[]>();

  for (const p of existing) {
    existingByStrict.set(buildPatientKey(p.section, p.room, p.name), p);

    const looseKey = buildPatientLooseKey(p.room, p.name);
    const looseArr = existingByLoose.get(looseKey) ?? [];
    looseArr.push(p);
    existingByLoose.set(looseKey, looseArr);

    if (p.age == null) continue;
    const stableKey = buildPatientStableKey(p.name, p.age);
    if (stableKey.startsWith("|")) continue;
    const stableArr = existingByStable.get(stableKey) ?? [];
    stableArr.push(p);
    existingByStable.set(stableKey, stableArr);
  }

  // Track which *existing patient IDs* were already merged, so we don't merge the
  // same old patient into multiple incoming rows when keys collide.
  const consumedIds = new Set<string>();
  const merged: PatientEntry[] = [];

  const pickUnique = (
    candidates: PatientEntry[],
    predicate: (p: PatientEntry) => boolean,
  ): PatientEntry | null => {
    const filtered = candidates.filter(
      (p) => !consumedIds.has(p.id) && predicate(p),
    );
    return filtered.length === 1 ? filtered[0] : null;
  };

  const pickFromLoose = (np: PatientEntry): PatientEntry | null => {
    const looseKey = buildPatientLooseKey(np.room, np.name);
    const candidates = (existingByLoose.get(looseKey) ?? []).filter(
      (p) => !consumedIds.has(p.id),
    );

    if (candidates.length === 1) return candidates[0];
    if (candidates.length === 0) return null;

    // If multiple: try to narrow safely.
    return (
      pickUnique(candidates, (p) => p.age === np.age) ??
      pickUnique(candidates, (p) => p.section === np.section) ??
      null
    );
  };

  const pickFromStable = (np: PatientEntry): PatientEntry | null => {
    if (np.age == null) return null;
    const stableKey = buildPatientStableKey(np.name, np.age);
    if (stableKey.startsWith("|")) return null;

    const candidates = (existingByStable.get(stableKey) ?? []).filter(
      (p) => !consumedIds.has(p.id),
    );

    if (candidates.length === 1) return candidates[0];
    if (candidates.length === 0) return null;

    // Collisions are possible (two people same name+age). Be conservative.
    // Only auto-match if we can uniquely identify one candidate.
    const normDx = (s: string | null) => (s ?? "").trim().toLowerCase();
    return (
      pickUnique(candidates, (p) => p.section === np.section) ??
      pickUnique(candidates, (p) => normDx(p.diagnosis) === normDx(np.diagnosis)) ??
      null
    );
  };

  for (const np of incoming) {
    const strictKey = buildPatientKey(np.section, np.room, np.name);
    const matchStrict = existingByStrict.get(strictKey);
    const match =
      (matchStrict && !consumedIds.has(matchStrict.id) ? matchStrict : null) ??
      pickFromLoose(np) ??
      pickFromStable(np);

    if (!match) {
      merged.push(np);
      continue;
    }

    consumedIds.add(match.id);
    merged.push(mergePatient(match, np));
  }

  // Keep patients that weren't mentioned in the new scan.
  // Assign them orders after the incoming patients so they sort to the end.
  let tailOrder = incoming.length;
  for (const p of existing) {
    if (!consumedIds.has(p.id)) {
      merged.push({ ...p, order: tailOrder++ });
    }
  }

  return merged;
}

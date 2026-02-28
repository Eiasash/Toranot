/**
 * Smart OCR Re-import Detection
 * 
 * Compares old patient list to newly scanned list and identifies:
 * - New patients (admissions / transfers in)
 * - Missing patients (discharges / transfers out)
 * - Changed patients (room moves, new tasks)
 */

import type { PatientEntry } from "../types";

export interface ScanDiff {
  newPatients: PatientEntry[];       // admitted / transferred in
  missingPatients: PatientEntry[];   // discharged / transferred out  
  changedPatients: Array<{
    patient: PatientEntry;
    changes: string[];               // human-readable change descriptions
  }>;
  unchanged: number;
}

/**
 * Compare old state to new scan results.
 * Uses name+room as primary matching key.
 */
export function detectScanChanges(
  oldPatients: PatientEntry[],
  newPatients: PatientEntry[],
): ScanDiff {
  // Build lookup by name (primary) and room+section (secondary)
  const oldByName = new Map<string, PatientEntry>();
  const newByName = new Map<string, PatientEntry>();

  for (const p of oldPatients) {
    const key = normalizeKey(p);
    if (key) oldByName.set(key, p);
  }
  for (const p of newPatients) {
    const key = normalizeKey(p);
    if (key) newByName.set(key, p);
  }

  const diff: ScanDiff = {
    newPatients: [],
    missingPatients: [],
    changedPatients: [],
    unchanged: 0,
  };

  // Find new patients (in new but not in old)
  for (const [key, p] of newByName) {
    if (!oldByName.has(key)) {
      diff.newPatients.push(p);
    }
  }

  // Find missing patients (in old but not in new)
  for (const [key, p] of oldByName) {
    if (!newByName.has(key)) {
      diff.missingPatients.push(p);
    }
  }

  // Find changed patients
  for (const [key, newP] of newByName) {
    const oldP = oldByName.get(key);
    if (!oldP) continue;

    const changes: string[] = [];

    // Room change
    if (oldP.room !== newP.room && newP.room) {
      changes.push(`חדר: ${oldP.room ?? "?"} → ${newP.room}`);
    }

    // Section change
    if (oldP.section !== newP.section) {
      changes.push(`מדור: ${oldP.section} → ${newP.section}`);
    }

    // New tasks
    const oldTaskTexts = new Set(oldP.tasks.map((t) => t.text.trim()));
    const newTaskTexts = newP.tasks.filter((t) => !oldTaskTexts.has(t.text.trim()));
    if (newTaskTexts.length > 0) {
      changes.push(`${newTaskTexts.length} משימות חדשות`);
    }

    // Diagnosis change
    if (oldP.diagnosis !== newP.diagnosis && newP.diagnosis) {
      changes.push(`אבחנה עודכנה`);
    }

    if (changes.length > 0) {
      diff.changedPatients.push({ patient: newP, changes });
    } else {
      diff.unchanged++;
    }
  }

  return diff;
}

function normalizeKey(p: PatientEntry): string | null {
  const name = p.name?.trim();
  if (!name) return null;
  // Normalize Hebrew: remove niqqud, extra spaces
  const normalizedName = name.replace(/[\u0591-\u05C7]/g, "").replace(/\s+/g, " ").trim();
  // Use room+name composite key to disambiguate common names in different rooms.
  // Fall back to name-only when room is absent (e.g. newly admitted patient without bed).
  if (p.room) {
    return `${p.room}::${normalizedName}`;
  }
  return normalizedName;
}

/** Format diff as a short Hebrew summary */
export function formatScanDiffSummary(diff: ScanDiff): string | null {
  const parts: string[] = [];

  if (diff.newPatients.length > 0) {
    parts.push(`🆕 ${diff.newPatients.length} חדשים`);
  }
  if (diff.missingPatients.length > 0) {
    parts.push(`🔄 ${diff.missingPatients.length} שוחררו/הועברו`);
  }
  if (diff.changedPatients.length > 0) {
    parts.push(`✏️ ${diff.changedPatients.length} עודכנו`);
  }

  if (parts.length === 0) return null;
  return parts.join(" | ");
}

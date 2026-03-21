/**
 * Lab Persistence — cross-shift lab history via Supabase.
 *
 * Problem: when a shift is archived, lab values are lost. The same patient's
 * Cr trajectory from 3 shifts ago is gone. On a geriatric ward where patients
 * stay for weeks, this means losing critical trend data.
 *
 * Solution: persist lab entries in `toranot_labs` table keyed by patient
 * name+room. On each lab entry, upsert to Supabase. On import (IMPORT_TEXT),
 * hydrate matching patients with historical labs.
 *
 * All operations are fire-and-forget — lab persistence must never block
 * the main app flow or fail visibly.
 */

import type { PatientEntry, LabEntry } from "../types";

const TORANOT_USER_ID = "3f37c881-6e38-443b-a32d-f5eb9bd426cc";

// Max labs per patient to prevent unbounded growth
const MAX_LABS_PER_PATIENT = 50;

function getSupabaseConfig(): { url: string; key: string } | null {
  try {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    return { url, key };
  } catch {
    return null;
  }
}

/**
 * Build a stable patient key for cross-shift matching.
 * Uses lowercased name + room. Falls back to name-only if room is null.
 */
export function buildPatientKey(patient: PatientEntry): string | null {
  const name = patient.name?.trim().toLowerCase();
  if (!name) return null;
  const room = patient.room?.trim() ?? "";
  return room ? `${name}|${room}` : name;
}

/**
 * Persist a patient's labs to Supabase.
 * Fire-and-forget — never throws, never blocks.
 * Called after ADD_LAB or IMPORT_TEXT with lab data.
 */
export function persistPatientLabs(patient: PatientEntry): void {
  const config = getSupabaseConfig();
  if (!config) return;

  const key = buildPatientKey(patient);
  if (!key) return;

  const labs = patient.labs ?? [];
  if (labs.length === 0) return;

  // Trim to max and keep most recent
  const trimmed = labs.length > MAX_LABS_PER_PATIENT
    ? [...labs]
        .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
        .slice(0, MAX_LABS_PER_PATIENT)
    : labs;

  const body = {
    user_id: TORANOT_USER_ID,
    patient_key: key,
    labs: trimmed,
    updated_at: new Date().toISOString(),
  };

  // Upsert: insert or update on conflict (user_id, patient_key)
  fetch(`${config.url}/rest/v1/toranot_labs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": config.key,
      "Authorization": `Bearer ${config.key}`,
      "Prefer": "resolution=merge-duplicates",
    },
    body: JSON.stringify(body),
  }).catch(() => {});
}

/**
 * Batch persist labs for multiple patients.
 * Called after IMPORT_TEXT or RESTORE_SHIFT.
 */
export function persistAllPatientLabs(patients: PatientEntry[]): void {
  for (const p of patients) {
    if ((p.labs?.length ?? 0) > 0) {
      persistPatientLabs(p);
    }
  }
}

/**
 * Restore historical labs for a batch of patients from Supabase.
 * Returns a Map<patientId, LabEntry[]> of restored labs.
 * Only returns labs for patients that currently have NO lab data
 * (doesn't overwrite freshly entered labs).
 */
export async function restorePatientLabs(
  patients: PatientEntry[],
): Promise<Map<string, LabEntry[]>> {
  const result = new Map<string, LabEntry[]>();
  const config = getSupabaseConfig();
  if (!config) return result;

  // Build keys for patients without labs
  const keyToPatientId = new Map<string, string>();
  for (const p of patients) {
    if ((p.labs?.length ?? 0) > 0) continue; // already has labs
    const key = buildPatientKey(p);
    if (key) keyToPatientId.set(key, p.id);
  }

  if (keyToPatientId.size === 0) return result;

  // Batch fetch all matching keys
  const keys = [...keyToPatientId.keys()];
  // PostgREST IN filter: patient_key=in.(key1,key2,...)
  const inFilter = keys.map(k => `"${k}"`).join(",");

  try {
    const res = await fetch(
      `${config.url}/rest/v1/toranot_labs?user_id=eq.${TORANOT_USER_ID}&patient_key=in.(${encodeURIComponent(inFilter)})&select=patient_key,labs`,
      {
        headers: {
          "apikey": config.key,
          "Authorization": `Bearer ${config.key}`,
        },
      },
    );

    if (!res.ok) return result;

    const rows: Array<{ patient_key: string; labs: LabEntry[] }> = await res.json();

    for (const row of rows) {
      const patientId = keyToPatientId.get(row.patient_key);
      if (patientId && Array.isArray(row.labs) && row.labs.length > 0) {
        result.set(patientId, row.labs);
      }
    }
  } catch {
    // Network failure — return empty, don't crash
  }

  return result;
}

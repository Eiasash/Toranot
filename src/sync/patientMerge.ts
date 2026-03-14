/**
 * Per-patient merge logic for shared-shift sync (Phase 3)
 */

import type { PatientEntry } from "../types";

export function stablePatientHash(patient: PatientEntry): string {
  const { syncMeta: _s, ...clinical } = patient;
  void _s;
  const json = stableSortedJson(clinical);
  let hash = 5381;
  for (let i = 0; i < json.length; i++) hash = ((hash << 5) + hash + json.charCodeAt(i)) | 0;
  return String(hash >>> 0);
}

function stableSortedJson(val: unknown): string {
  return JSON.stringify(val, (_key, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
      );
    }
    return v;
  });
}

export interface PatientEnvelope {
  patientId: string;
  revision: number;
  updatedAt: string;
  updatedBy: string | null;
  hash: string;
  payload: PatientEntry;
}

export type PatientMergeResult =
  | { kind: "identical"; merged: PatientEnvelope }
  | { kind: "remote-newer"; merged: PatientEnvelope }
  | { kind: "local-newer"; merged: PatientEnvelope }
  | { kind: "conflict"; local: PatientEnvelope; remote: PatientEnvelope; reason: string };

export function mergePatient(
  local: PatientEnvelope | null,
  remote: PatientEnvelope | null,
): PatientMergeResult | null {
  if (!local && !remote) return null;
  if (!local && remote) return { kind: "remote-newer", merged: remote };
  if (!remote && local) return { kind: "local-newer", merged: local };

  if (local!.hash === remote!.hash) {
    const winner = local!.revision >= remote!.revision ? local! : remote!;
    return { kind: "identical", merged: winner };
  }

  if (local!.revision > remote!.revision) return { kind: "local-newer", merged: local! };
  if (remote!.revision > local!.revision) return { kind: "remote-newer", merged: remote! };

  return {
    kind: "conflict",
    local: local!,
    remote: remote!,
    reason: `Both devices wrote revision ${local!.revision} for patient "${local!.payload.name ?? local!.patientId}" with different content`,
  };
}

export interface WardMergeResult {
  toApplyLocally: PatientEntry[];
  toPushRemote: PatientEntry[];
  conflicts: Array<{ local: PatientEnvelope; remote: PatientEnvelope; reason: string }>;
}

export function mergeWard(
  localPatients: PatientEntry[],
  remoteEnvelopes: PatientEnvelope[],
  localUserId: string | null,
): WardMergeResult {
  const result: WardMergeResult = { toApplyLocally: [], toPushRemote: [], conflicts: [] };

  const localMap = new Map<string, PatientEnvelope>();
  for (const p of localPatients) localMap.set(p.id, patientToEnvelope(p, localUserId));

  const remoteMap = new Map<string, PatientEnvelope>();
  for (const env of remoteEnvelopes) remoteMap.set(env.patientId, env);

  const allIds = new Set([...localMap.keys(), ...remoteMap.keys()]);

  for (const id of allIds) {
    const mr = mergePatient(localMap.get(id) ?? null, remoteMap.get(id) ?? null);
    if (!mr) continue;
    switch (mr.kind) {
      case "identical": break;
      case "remote-newer": result.toApplyLocally.push(mr.merged.payload); break;
      case "local-newer": result.toPushRemote.push(mr.merged.payload); break;
      case "conflict": result.conflicts.push({ local: mr.local, remote: mr.remote, reason: mr.reason }); break;
    }
  }

  return result;
}

export function patientToEnvelope(patient: PatientEntry, userId: string | null): PatientEnvelope {
  return {
    patientId: patient.id,
    revision: patient.syncMeta?.revision ?? 1,
    updatedAt: patient.syncMeta?.lastModifiedAt ?? new Date().toISOString(),
    updatedBy: patient.syncMeta?.lastModifiedBy ?? userId,
    hash: stablePatientHash(patient),
    payload: patient,
  };
}

export function bumpRevision(patient: PatientEntry, userId: string | null): PatientEntry {
  return {
    ...patient,
    syncMeta: {
      revision: (patient.syncMeta?.revision ?? 0) + 1,
      lastModifiedAt: new Date().toISOString(),
      lastModifiedBy: userId,
    },
  };
}

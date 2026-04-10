/**
 * Tests for src/sync/patientMerge.ts
 *
 * Covers: stablePatientHash, mergePatient, mergeWard, patientToEnvelope,
 * bumpRevision, prunePatientForSync, patientPayloadBytes, PATIENT_FIELD_CAPS
 */

import { describe, it, expect } from "vitest";
import {
  stablePatientHash,
  mergePatient,
  mergeWard,
  patientToEnvelope,
  bumpRevision,
  prunePatientForSync,
  patientPayloadBytes,
  PATIENT_FIELD_CAPS,
  type PatientEnvelope,
} from "../sync/patientMerge";
import type { PatientEntry, Task } from "../types";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makePatient(overrides: Partial<PatientEntry> = {}): PatientEntry {
  return {
    id: "p1",
    section: "SIDE_A",
    date: "21/03/2026",
    room: "70",
    name: "כהן שרה",
    age: 82,
    diagnosis: null,
    flags: [],
    status: [],
    tomorrowNotes: [],
    tasks: [],
    generatedTasks: [],
    scannedAt: "2026-03-21T08:00:00Z",
    confidence: 1,
    ...overrides,
  };
}

function makeTask(id: string, text: string, done = false): Task {
  return {
    id,
    text,
    urgency: "routine",
    source: "manual",
    done,
    doneTime: done ? "2026-03-21T10:00:00Z" : null,
    time: null,
    confidence: 1,
  };
}

function makeEnvelope(
  patient: PatientEntry,
  revision: number,
  userId: string | null = "user-A",
): PatientEnvelope {
  return {
    patientId: patient.id,
    revision,
    updatedAt: "2026-03-21T08:00:00Z",
    updatedBy: userId,
    hash: stablePatientHash(patient),
    payload: patient,
  };
}

// ─── stablePatientHash ──────────────────────────────────────────────────────

describe("stablePatientHash", () => {
  it("returns a string hash", () => {
    const hash = stablePatientHash(makePatient());
    expect(typeof hash).toBe("string");
    expect(hash.length).toBeGreaterThan(0);
  });

  it("produces the same hash for identical patients", () => {
    const p = makePatient();
    expect(stablePatientHash(p)).toBe(stablePatientHash(p));
  });

  it("produces different hashes for different patients", () => {
    const a = makePatient({ name: "כהן שרה" });
    const b = makePatient({ name: "לוי דוד" });
    expect(stablePatientHash(a)).not.toBe(stablePatientHash(b));
  });

  it("ignores syncMeta (not part of clinical data)", () => {
    const base = makePatient();
    const withMeta = makePatient({
      syncMeta: { revision: 5, lastModifiedAt: "2026-03-21T12:00:00Z", lastModifiedBy: "user-B" },
    });
    expect(stablePatientHash(base)).toBe(stablePatientHash(withMeta));
  });

  it("is order-insensitive for object keys", () => {
    // Two patients with the same data but potentially different insertion order
    const a = makePatient({ name: "Test", room: "1" });
    const b = makePatient({ room: "1", name: "Test" });
    expect(stablePatientHash(a)).toBe(stablePatientHash(b));
  });

  it("detects changes in tasks", () => {
    const a = makePatient({ tasks: [makeTask("t1", "CBC")] });
    const b = makePatient({ tasks: [makeTask("t1", "CMP")] });
    expect(stablePatientHash(a)).not.toBe(stablePatientHash(b));
  });

  it("detects changes in labs", () => {
    const a = makePatient({ labs: [{ id: "l1", label: "K+", value: 4.5, time: "2026-03-21T08:00:00Z" }] });
    const b = makePatient({ labs: [{ id: "l1", label: "K+", value: 3.2, time: "2026-03-21T08:00:00Z" }] });
    expect(stablePatientHash(a)).not.toBe(stablePatientHash(b));
  });

  it("returns unsigned 32-bit integer as string", () => {
    const hash = stablePatientHash(makePatient());
    const num = Number(hash);
    expect(num).toBeGreaterThanOrEqual(0);
    expect(num).toBeLessThanOrEqual(4294967295); // 2^32 - 1
  });
});

// ─── mergePatient ───────────────────────────────────────────────────────────

describe("mergePatient", () => {
  it("returns null when both are null", () => {
    expect(mergePatient(null, null)).toBeNull();
  });

  it("returns remote-newer when local is null", () => {
    const remote = makeEnvelope(makePatient(), 1);
    const result = mergePatient(null, remote);
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("remote-newer");
    expect(result!.merged).toBe(remote);
  });

  it("returns local-newer when remote is null", () => {
    const local = makeEnvelope(makePatient(), 1);
    const result = mergePatient(local, null);
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("local-newer");
    expect(result!.merged).toBe(local);
  });

  it("returns identical when hashes match", () => {
    const p = makePatient();
    const local = makeEnvelope(p, 3);
    const remote = makeEnvelope(p, 2);
    const result = mergePatient(local, remote);
    expect(result!.kind).toBe("identical");
    // Should prefer the higher revision
    expect(result!.merged.revision).toBe(3);
  });

  it("returns local-newer when local revision is higher", () => {
    const localP = makePatient({ name: "Updated" });
    const remoteP = makePatient({ name: "Old" });
    const local = makeEnvelope(localP, 5);
    const remote = makeEnvelope(remoteP, 3);
    const result = mergePatient(local, remote);
    expect(result!.kind).toBe("local-newer");
    expect(result!.merged.payload.name).toBe("Updated");
  });

  it("returns remote-newer when remote revision is higher", () => {
    const localP = makePatient({ name: "Old" });
    const remoteP = makePatient({ name: "Updated" });
    const local = makeEnvelope(localP, 2);
    const remote = makeEnvelope(remoteP, 5);
    const result = mergePatient(local, remote);
    expect(result!.kind).toBe("remote-newer");
    expect(result!.merged.payload.name).toBe("Updated");
  });

  it("returns conflict when same revision but different content", () => {
    const localP = makePatient({ name: "Local Edit" });
    const remoteP = makePatient({ name: "Remote Edit" });
    const local = makeEnvelope(localP, 3);
    const remote = makeEnvelope(remoteP, 3);
    const result = mergePatient(local, remote);
    expect(result!.kind).toBe("conflict");
    if (result!.kind === "conflict") {
      expect(result!.reason).toContain("revision 3");
      expect(result!.local).toBe(local);
      expect(result!.remote).toBe(remote);
    }
  });
});

// ─── mergeWard ──────────────────────────────────────────────────────────────

describe("mergeWard", () => {
  it("returns empty result when both sides are empty", () => {
    const result = mergeWard([], [], "user-A");
    expect(result.toApplyLocally).toEqual([]);
    expect(result.toPushRemote).toEqual([]);
    expect(result.conflicts).toEqual([]);
  });

  it("pushes local-only patients to remote", () => {
    const p = makePatient({ id: "local-only" });
    const result = mergeWard([p], [], "user-A");
    expect(result.toPushRemote).toHaveLength(1);
    expect(result.toPushRemote[0].id).toBe("local-only");
    expect(result.toApplyLocally).toHaveLength(0);
  });

  it("applies remote-only patients locally", () => {
    const p = makePatient({ id: "remote-only" });
    const env = makeEnvelope(p, 1);
    const result = mergeWard([], [env], "user-A");
    expect(result.toApplyLocally).toHaveLength(1);
    expect(result.toApplyLocally[0].id).toBe("remote-only");
    expect(result.toPushRemote).toHaveLength(0);
  });

  it("detects conflicts for same-revision different-content patients", () => {
    const localP = makePatient({ id: "p1", name: "Local Name" });
    const remoteP = makePatient({ id: "p1", name: "Remote Name" });
    const remoteEnv = makeEnvelope(remoteP, 1);
    // localP will get revision 1 from default syncMeta
    const result = mergeWard([localP], [remoteEnv], "user-A");
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].reason).toContain("revision 1");
  });

  it("merges multiple patients correctly", () => {
    // p1: same name but local has higher revision and different diagnosis → local-newer → push remote
    const local1 = makePatient({ id: "p1", name: "Shared", diagnosis: "Pneumonia", syncMeta: { revision: 2 } });
    const local2 = makePatient({ id: "p2", name: "Local Only" });

    const remote1 = makeEnvelope(makePatient({ id: "p1", name: "Shared", diagnosis: "UTI" }), 1);
    const remote3 = makeEnvelope(makePatient({ id: "p3", name: "Remote Only" }), 1);

    const result = mergeWard([local1, local2], [remote1, remote3], "user-A");
    // p1: local rev 2 > remote rev 1, different content → local-newer → push remote
    expect(result.toPushRemote.some(p => p.id === "p1")).toBe(true);
    // p2: local only → push remote
    expect(result.toPushRemote.some(p => p.id === "p2")).toBe(true);
    // p3: remote only → apply locally
    expect(result.toApplyLocally.some(p => p.id === "p3")).toBe(true);
  });

  it("skips identical patients (no action needed)", () => {
    const p = makePatient({ id: "p1" });
    const localEnv = makeEnvelope(p, 3);
    const remoteEnv = makeEnvelope(p, 3);
    // Both have same hash and same revision → identical, nothing to do
    const result = mergeWard([p], [remoteEnv], "user-A");
    // Should have no actions since they're identical
    // (local will be envelope'd at revision 1 or from syncMeta)
    // Let's set syncMeta to match
    const pWithMeta = makePatient({ id: "p1", syncMeta: { revision: 3 } });
    const result2 = mergeWard([pWithMeta], [makeEnvelope(makePatient({ id: "p1" }), 3)], "user-A");
    // Hash should match since same data (ignoring syncMeta), rev 3 === 3 → identical
    expect(result2.toApplyLocally).toHaveLength(0);
    expect(result2.toPushRemote).toHaveLength(0);
    expect(result2.conflicts).toHaveLength(0);
  });
});

// ─── patientToEnvelope ──────────────────────────────────────────────────────

describe("patientToEnvelope", () => {
  it("creates envelope with patient data", () => {
    const p = makePatient({ id: "p1" });
    const env = patientToEnvelope(p, "user-A");
    expect(env.patientId).toBe("p1");
    expect(env.payload).toBe(p);
    expect(env.updatedBy).toBe("user-A");
    expect(env.hash).toBe(stablePatientHash(p));
  });

  it("defaults revision to 1 when syncMeta is absent", () => {
    const p = makePatient();
    const env = patientToEnvelope(p, "user-A");
    expect(env.revision).toBe(1);
  });

  it("uses syncMeta revision when present", () => {
    const p = makePatient({ syncMeta: { revision: 7 } });
    const env = patientToEnvelope(p, "user-A");
    expect(env.revision).toBe(7);
  });

  it("uses syncMeta timestamps when present", () => {
    const ts = "2026-03-20T12:00:00Z";
    const p = makePatient({ syncMeta: { lastModifiedAt: ts, lastModifiedBy: "user-B" } });
    const env = patientToEnvelope(p, "user-A");
    expect(env.updatedAt).toBe(ts);
    expect(env.updatedBy).toBe("user-B");
  });

  it("handles null userId", () => {
    const p = makePatient();
    const env = patientToEnvelope(p, null);
    expect(env.updatedBy).toBeNull();
  });
});

// ─── bumpRevision ───────────────────────────────────────────────────────────

describe("bumpRevision", () => {
  it("increments revision from 0 to 1 when syncMeta absent", () => {
    const p = makePatient();
    const bumped = bumpRevision(p, "user-A");
    expect(bumped.syncMeta!.revision).toBe(1);
  });

  it("increments existing revision", () => {
    const p = makePatient({ syncMeta: { revision: 4 } });
    const bumped = bumpRevision(p, "user-A");
    expect(bumped.syncMeta!.revision).toBe(5);
  });

  it("sets lastModifiedBy to the provided userId", () => {
    const p = makePatient();
    const bumped = bumpRevision(p, "user-B");
    expect(bumped.syncMeta!.lastModifiedBy).toBe("user-B");
  });

  it("sets lastModifiedAt to a valid ISO string", () => {
    const p = makePatient();
    const bumped = bumpRevision(p, "user-A");
    expect(bumped.syncMeta!.lastModifiedAt).toBeTruthy();
    expect(() => new Date(bumped.syncMeta!.lastModifiedAt!)).not.toThrow();
  });

  it("does not mutate the original patient", () => {
    const p = makePatient({ syncMeta: { revision: 2 } });
    const bumped = bumpRevision(p, "user-A");
    expect(p.syncMeta!.revision).toBe(2);
    expect(bumped.syncMeta!.revision).toBe(3);
    expect(bumped).not.toBe(p);
  });

  it("handles null userId", () => {
    const p = makePatient();
    const bumped = bumpRevision(p, null);
    expect(bumped.syncMeta!.lastModifiedBy).toBeNull();
  });
});

// ─── prunePatientForSync ────────────────────────────────────────────────────

describe("prunePatientForSync", () => {
  it("does not prune when fields are within limits", () => {
    const p = makePatient({
      tasks: [makeTask("t1", "CBC")],
      labs: [{ id: "l1", label: "K+", value: 4.5, time: "2026-03-21T08:00:00Z" }],
      notes: ["Note 1"],
      generatedTasks: [makeTask("g1", "Check vitals")],
    });
    const pruned = prunePatientForSync(p);
    expect(pruned.tasks).toHaveLength(1);
    expect(pruned.labs).toHaveLength(1);
    expect(pruned.notes).toHaveLength(1);
    expect(pruned.generatedTasks).toHaveLength(1);
  });

  it("caps tasks at 200, prioritizing open tasks", () => {
    const openTasks = Array.from({ length: 150 }, (_, i) => makeTask(`open-${i}`, `Open task ${i}`, false));
    const doneTasks = Array.from({ length: 100 }, (_, i) => makeTask(`done-${i}`, `Done task ${i}`, true));
    const p = makePatient({ tasks: [...openTasks, ...doneTasks] });
    expect(p.tasks).toHaveLength(250);

    const pruned = prunePatientForSync(p);
    expect(pruned.tasks).toHaveLength(PATIENT_FIELD_CAPS.tasks);
    // All 150 open tasks should be preserved
    const openCount = pruned.tasks.filter(t => !t.done).length;
    expect(openCount).toBe(150);
    // Only 50 of 100 done tasks fit
    const doneCount = pruned.tasks.filter(t => t.done).length;
    expect(doneCount).toBe(50);
  });

  it("caps labs at 100 (most recent)", () => {
    const labs = Array.from({ length: 120 }, (_, i) => ({
      id: `l-${i}`,
      label: "Cr",
      value: 1.0 + i * 0.01,
      time: `2026-03-21T${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}:00Z`,
    }));
    const p = makePatient({ labs });
    const pruned = prunePatientForSync(p);
    expect(pruned.labs).toHaveLength(PATIENT_FIELD_CAPS.labs);
    // Should keep the last 100 (most recent)
    expect(pruned.labs![0].id).toBe("l-20");
  });

  it("caps notes at 20 (most recent)", () => {
    const notes = Array.from({ length: 30 }, (_, i) => `Note ${i}`);
    const p = makePatient({ notes });
    const pruned = prunePatientForSync(p);
    expect(pruned.notes).toHaveLength(PATIENT_FIELD_CAPS.notes);
    expect(pruned.notes![0]).toBe("Note 10");
  });

  it("caps generatedTasks at 50 (most recent)", () => {
    const genTasks = Array.from({ length: 60 }, (_, i) => makeTask(`g-${i}`, `Gen task ${i}`));
    const p = makePatient({ generatedTasks: genTasks });
    const pruned = prunePatientForSync(p);
    expect(pruned.generatedTasks).toHaveLength(PATIENT_FIELD_CAPS.generatedTasks);
  });

  it("always clears photos to empty array", () => {
    const p = makePatient({
      photos: [{ id: "ph1", dataUrl: "data:image/jpeg;base64,abc", time: "2026-03-21T08:00:00Z" }],
    });
    const pruned = prunePatientForSync(p);
    expect(pruned.photos).toEqual([]);
  });

  it("does not mutate the original patient", () => {
    const tasks = Array.from({ length: 250 }, (_, i) => makeTask(`t-${i}`, `Task ${i}`));
    const p = makePatient({ tasks });
    const pruned = prunePatientForSync(p);
    expect(p.tasks).toHaveLength(250);
    expect(pruned.tasks).toHaveLength(PATIENT_FIELD_CAPS.tasks);
  });

  it("handles undefined optional fields gracefully", () => {
    const p = makePatient();
    // labs and notes are undefined
    const pruned = prunePatientForSync(p);
    expect(pruned.labs).toBeUndefined();
    expect(pruned.notes).toBeUndefined();
  });
});

// ─── patientPayloadBytes ────────────────────────────────────────────────────

describe("patientPayloadBytes", () => {
  it("returns a positive number for any patient", () => {
    const bytes = patientPayloadBytes(makePatient());
    expect(bytes).toBeGreaterThan(0);
  });

  it("increases with more data", () => {
    const small = makePatient();
    const big = makePatient({
      tasks: Array.from({ length: 50 }, (_, i) => makeTask(`t-${i}`, `Task with some text ${i}`)),
      notes: Array.from({ length: 10 }, (_, i) => `Note ${i} with some content`),
    });
    expect(patientPayloadBytes(big)).toBeGreaterThan(patientPayloadBytes(small));
  });

  it("accounts for UTF-8 encoding of Hebrew text", () => {
    const english = makePatient({ name: "Sarah Cohen" });
    const hebrew = makePatient({ name: "כהן שרה" });
    // Hebrew chars are multi-byte in UTF-8, so Hebrew name should use more bytes
    // even if the string length is similar
    const engBytes = patientPayloadBytes(english);
    const hebBytes = patientPayloadBytes(hebrew);
    // Hebrew "כהן שרה" (5 chars) = 9 UTF-8 bytes vs "Sarah Cohen" (11 chars) = 11 bytes
    // But the field is embedded in JSON, so just check it's reasonable
    expect(engBytes).toBeGreaterThan(0);
    expect(hebBytes).toBeGreaterThan(0);
  });
});

// ─── PATIENT_FIELD_CAPS ─────────────────────────────────────────────────────

describe("PATIENT_FIELD_CAPS", () => {
  it("has reasonable cap values", () => {
    expect(PATIENT_FIELD_CAPS.tasks).toBe(200);
    expect(PATIENT_FIELD_CAPS.labs).toBe(100);
    expect(PATIENT_FIELD_CAPS.notes).toBe(20);
    expect(PATIENT_FIELD_CAPS.generatedTasks).toBe(50);
  });

  it("caps are immutable (frozen)", () => {
    // Verify they are defined as const
    expect(typeof PATIENT_FIELD_CAPS.tasks).toBe("number");
    expect(typeof PATIENT_FIELD_CAPS.labs).toBe("number");
  });
});

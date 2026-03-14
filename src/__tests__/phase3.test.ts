/**
 * Phase 3 acceptance tests — per-patient revision sync
 *
 * Covers ACCEPTANCE_TEST_PLAN.md §Sync:
 * - Same patient edited on two simulated clients → conflict surfaced
 * - Different patients edited on two clients → clean merge (both survive)
 * - Reordering tasks/done state on one device is preserved after pull
 * - identical content → no conflict regardless of revision
 * - stablePatientHash is deterministic (key order insensitive)
 */

import { describe, it, expect } from "vitest";
import {
  mergePatient,
  mergeWard,
  stablePatientHash,
  patientToEnvelope,
  bumpRevision,
  type PatientEnvelope,
} from "../sync/patientMerge";
import type { PatientEntry } from "../types";

// ─── helpers ───────────────────────────────────────────────────────────────

function makePatient(overrides: Partial<PatientEntry> = {}): PatientEntry {
  return {
    id: "pt-1",
    section: "SIDE_A",
    date: "01/01/2025",
    room: "101",
    name: "כהן יוסף",
    age: 80,
    diagnosis: "CHF",
    flags: [],
    status: [],
    tomorrowNotes: [],
    tasks: [],
    generatedTasks: [],
    notes: [],
    scannedAt: "2025-01-01T08:00:00.000Z",  // fixed for deterministic hashing
    confidence: 1,
    syncMeta: { revision: 1, lastModifiedAt: "2025-01-01T08:00:00Z", lastModifiedBy: "user-A" },
    ...overrides,
  };
}

function envelope(patient: PatientEntry, userId = "user-A"): PatientEnvelope {
  return patientToEnvelope(patient, userId);
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. stablePatientHash
// ═══════════════════════════════════════════════════════════════════════════

describe("stablePatientHash", () => {
  it("produces the same hash for identical patients", () => {
    const a = makePatient();
    const b = makePatient();
    expect(stablePatientHash(a)).toBe(stablePatientHash(b));
  });

  it("is insensitive to object key insertion order", () => {
    const a = makePatient({ diagnosis: "CHF", room: "101" });
    // Manually create same patient but with flipped key order in diagnosis/room
    const b = { ...makePatient(), room: "101", diagnosis: "CHF" };
    expect(stablePatientHash(a)).toBe(stablePatientHash(b));
  });

  it("produces different hash when clinical content differs", () => {
    const a = makePatient({ diagnosis: "CHF" });
    const b = makePatient({ diagnosis: "COPD" });
    expect(stablePatientHash(a)).not.toBe(stablePatientHash(b));
  });

  it("excludes syncMeta from hash — revision bump does not change clinical hash", () => {
    const a = makePatient({ syncMeta: { revision: 1 } });
    const b = makePatient({ syncMeta: { revision: 99 } });
    expect(stablePatientHash(a)).toBe(stablePatientHash(b));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. mergePatient — two-patient comparisons
// ═══════════════════════════════════════════════════════════════════════════

describe("mergePatient", () => {
  it("null + null → null", () => {
    expect(mergePatient(null, null)).toBeNull();
  });

  it("null local + remote → remote-newer", () => {
    const p = makePatient();
    const r = envelope(p);
    const result = mergePatient(null, r);
    expect(result?.kind).toBe("remote-newer");
    if (result && 'merged' in result) expect(result.merged.patientId).toBe(p.id);
  });

  it("local + null remote → local-newer", () => {
    const p = makePatient();
    const l = envelope(p);
    const result = mergePatient(l, null);
    expect(result?.kind).toBe("local-newer");
  });

  it("identical content → identical, takes higher revision", () => {
    const p = makePatient({ syncMeta: { revision: 5 } });
    const local = envelope(p);
    const remote = envelope({ ...p, syncMeta: { revision: 3 } });
    const result = mergePatient(local, remote);
    expect(result?.kind).toBe("identical");
    if (result && 'merged' in result) expect(result.merged.revision).toBe(5);
  });

  it("remote has higher revision → remote-newer", () => {
    const base = makePatient({ diagnosis: "CHF" });
    const local = envelope({ ...base, syncMeta: { revision: 2 } });
    const remotePatient = { ...base, diagnosis: "CHF worsening", syncMeta: { revision: 5 } };
    const remote = envelope(remotePatient);
    const result = mergePatient(local, remote);
    expect(result?.kind).toBe("remote-newer");
    if (result && 'merged' in result) expect(result.merged.payload.diagnosis).toBe("CHF worsening");
  });

  it("local has higher revision → local-newer", () => {
    const base = makePatient({ diagnosis: "CHF" });
    const localPatient = { ...base, diagnosis: "CHF — improved", syncMeta: { revision: 7 } };
    const local = envelope(localPatient);
    const remote = envelope({ ...base, syncMeta: { revision: 3 } });
    const result = mergePatient(local, remote);
    expect(result?.kind).toBe("local-newer");
    if (result && 'merged' in result) expect(result.merged.payload.diagnosis).toBe("CHF — improved");
  });

  it("same revision, different content → conflict with reason", () => {
    const base = makePatient({ syncMeta: { revision: 4 } });
    const localPatient = { ...base, diagnosis: "CHF — device A" };
    const remotePatient = { ...base, diagnosis: "CHF — device B" };
    const result = mergePatient(envelope(localPatient), envelope(remotePatient));
    expect(result?.kind).toBe("conflict");
    if (result?.kind === "conflict") {
      expect(result.reason).toContain("revision 4");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. mergeWard — full ward reconciliation
// ═══════════════════════════════════════════════════════════════════════════

describe("mergeWard", () => {
  it("different patients edited on two devices → both survive in merge", () => {
    const ptA = makePatient({ id: "pt-A", name: "כהן", syncMeta: { revision: 3 } });
    const ptB = makePatient({ id: "pt-B", name: "לוי", syncMeta: { revision: 2 } });

    // Device 1 edited patient A; device 2 edited patient B
    const localPatients = [ptA]; // device 1 only knows A
    const remoteEnvelopes = [envelope(ptB)]; // device 2 pushed B

    const result = mergeWard(localPatients, remoteEnvelopes, "user-1");

    // B should come down (remote-newer — local doesn't have it)
    expect(result.toApplyLocally.some((p) => p.id === "pt-B")).toBe(true);
    // A should go up (local-newer — remote doesn't have it)
    expect(result.toPushRemote.some((p) => p.id === "pt-A")).toBe(true);
    // No conflicts
    expect(result.conflicts).toHaveLength(0);
  });

  it("same patient edited on two devices → conflict surfaces, no silent overwrite", () => {
    const base = makePatient({ id: "pt-C", syncMeta: { revision: 5 } });
    const localVersion = { ...base, diagnosis: "Stroke — device 1" };
    const remoteVersion = { ...base, diagnosis: "Stroke — device 2" };

    const result = mergeWard([localVersion], [envelope(remoteVersion)], "user-1");

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].reason).toContain("revision 5");
    // Nothing applied to local — conflict must be resolved first
    expect(result.toApplyLocally).toHaveLength(0);
  });

  it("task done state change is preserved (remote newer with done tasks)", () => {
    const base = makePatient({
      id: "pt-D",
      tasks: [{ id: "t1", text: "בדיקת דם", urgency: "routine", source: "manual", done: false, doneTime: null, time: null, confidence: 1 }],
      syncMeta: { revision: 2 },
    });
    // Remote has the task marked done (revision 3 — remote is newer)
    const remotePatient: PatientEntry = {
      ...base,
      tasks: [{ id: "t1", text: "בדיקת דם", urgency: "routine", source: "manual", done: true, doneTime: new Date().toISOString(), time: null, confidence: 1 }],
      syncMeta: { revision: 3 },
    };

    const result = mergeWard([base], [envelope(remotePatient)], "user-1");

    expect(result.toApplyLocally).toHaveLength(1);
    expect(result.toApplyLocally[0].tasks[0].done).toBe(true);
    expect(result.conflicts).toHaveLength(0);
  });

  it("empty local + remote patients → all remote applied locally", () => {
    const remote1 = makePatient({ id: "pt-X", name: "Remote 1" });
    const remote2 = makePatient({ id: "pt-Y", name: "Remote 2" });
    const result = mergeWard([], [envelope(remote1), envelope(remote2)], "user-1");
    expect(result.toApplyLocally).toHaveLength(2);
    expect(result.toPushRemote).toHaveLength(0);
    expect(result.conflicts).toHaveLength(0);
  });

  it("identical patient on both sides → no action on either side", () => {
    const p = makePatient({ id: "pt-Z", syncMeta: { revision: 3 } });
    const result = mergeWard([p], [envelope(p)], "user-1");
    expect(result.toApplyLocally).toHaveLength(0);
    expect(result.toPushRemote).toHaveLength(0);
    expect(result.conflicts).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. bumpRevision
// ═══════════════════════════════════════════════════════════════════════════

describe("bumpRevision", () => {
  it("increments revision from 1 to 2", () => {
    const p = makePatient({ syncMeta: { revision: 1 } });
    const bumped = bumpRevision(p, "user-A");
    expect(bumped.syncMeta?.revision).toBe(2);
  });

  it("sets lastModifiedBy to provided userId", () => {
    const p = makePatient();
    const bumped = bumpRevision(p, "user-B");
    expect(bumped.syncMeta?.lastModifiedBy).toBe("user-B");
  });

  it("sets lastModifiedAt to a recent ISO timestamp", () => {
    const before = Date.now();
    const p = makePatient();
    const bumped = bumpRevision(p, null);
    const after = Date.now();
    const ts = new Date(bumped.syncMeta!.lastModifiedAt!).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("starts from 0 when syncMeta is absent", () => {
    const p = makePatient({ syncMeta: undefined });
    const bumped = bumpRevision(p, null);
    expect(bumped.syncMeta?.revision).toBe(1);
  });

  it("does not mutate original patient", () => {
    const p = makePatient({ syncMeta: { revision: 5 } });
    bumpRevision(p, "x");
    expect(p.syncMeta?.revision).toBe(5);
  });
});

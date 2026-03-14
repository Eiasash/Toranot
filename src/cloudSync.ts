// src/cloudSync.ts
// Supabase cloud sync + OTP auth + pull-on-boot + debounced push + echo suppression.
// Works with your toranot_state table (user_id PK, state jsonb, updated_at timestamptz).
//
// Wiring needed (ONE LINE in your Provider):
//   useToranotCloudSync(state, dispatch);
//
// Your reducer must support:
//   { type: "IMPORT_CLOUD_STATE", state: ToranotCloudState }

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Action } from "./context/reducer";
import { safeSetItem } from "./utils/storage";
import { mergeWard, patientToEnvelope, type PatientEnvelope } from "./sync/patientMerge";
import type { PatientEntry } from "./types";

// ════════════════════════════════════════════════════════════
// SYNC OBSERVABILITY — conflict rate + merge outcome tracking
//
// Conflict retry rate = conflicts / writes
// Healthy: <5%  |  Contention: 5-15%  |  Problem: >15%
// ════════════════════════════════════════════════════════════

export interface SyncMetrics {
  writes: number;
  conflicts: number;
  retriesTotal: number;
  mergeOutcomes: {
    identical: number;
    remoteNewer: number;
    localNewer: number;
    conflict: number;
  };
  lastReset: number;
}

function makeFreshMetrics(): SyncMetrics {
  return {
    writes: 0,
    conflicts: 0,
    retriesTotal: 0,
    mergeOutcomes: { identical: 0, remoteNewer: 0, localNewer: 0, conflict: 0 },
    lastReset: Date.now(),
  };
}

const _metrics: SyncMetrics = makeFreshMetrics();

/** Returns the current conflict retry rate (0–1). Returns 0 when no writes yet. */
export function getConflictRate(): number {
  return _metrics.writes === 0 ? 0 : _metrics.conflicts / _metrics.writes;
}

/** Returns a snapshot of all sync metrics. */
export function getSyncMetrics(): Readonly<SyncMetrics> {
  return { ..._metrics, mergeOutcomes: { ..._metrics.mergeOutcomes } };
}

/** Reset metrics counters (e.g. on shift archive). */
export function resetSyncMetrics(): void {
  Object.assign(_metrics, makeFreshMetrics());
}

function recordWrite(): void { _metrics.writes++; }
function recordConflict(): void { _metrics.conflicts++; }
function recordRetry(): void { _metrics.retriesTotal++; }
function recordMergeOutcome(kind: "identical" | "remoteNewer" | "localNewer" | "conflict"): void {
  _metrics.mergeOutcomes[kind]++;
}

// Expose on window for devtools inspection during live shifts
// Usage: window.__toranotMetrics  or  window.__toranotMetrics.getConflictRate()
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__toranotMetrics = {
    get: () => getSyncMetrics(),
    rate: () => getConflictRate(),
    reset: () => resetSyncMetrics(),
  };
}

// Log conflict rate every 60s — only when actively syncing
let _metricsInterval: ReturnType<typeof setInterval> | null = null;
function startMetricsLogging(): void {
  if (_metricsInterval) return;
  _metricsInterval = setInterval(() => {
    if (_metrics.writes === 0) return;
    const rate = getConflictRate();
    const pct = (rate * 100).toFixed(1);
    if (rate > 0.15) {
      console.warn(`[Toranot sync] ⚠️ High conflict rate: ${pct}% (${_metrics.conflicts}/${_metrics.writes} writes). Check for concurrent editors.`);
    } else if (rate > 0.05) {
      console.info(`[Toranot sync] Elevated conflict rate: ${pct}% — normal during handoff bursts.`);
    } else {
      console.debug(`[Toranot sync] Conflict rate: ${pct}% — healthy.`);
    }
  }, 60_000);
}

export type ToranotCloudState = {
  patients: unknown[];
  shiftHistory: unknown[];
  events: unknown[];
  unassignedTasks: unknown[];
  darkMode?: boolean;
  scanMode?: boolean;
};

type CloudDispatch = (action: Action) => void;

const STORAGE_KEY_LAST_PULL = "toranot-cloud-last-pull";

// ── Sync status (exported for UI indicator) ──
export type SyncStatus = "off" | "syncing" | "synced" | "error" | "conflict";

// ── Supabase client (safe no-op if env missing)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined;

export const supabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_ANON
    ? createClient(SUPABASE_URL, SUPABASE_ANON, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;

// ── Auth helpers (optional UI can call these)
// Sign in with email+password. If user doesn't exist, auto sign-up.
// Requires "Confirm email" to be DISABLED in Supabase Auth settings.
export async function signInWithPassword(email: string, password: string) {
  if (!supabase) throw new Error("Supabase not configured");
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUpWithPassword(email: string, password: string) {
  if (!supabase) throw new Error("Supabase not configured");
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

// Keep old export name as alias so nothing else breaks
export const signInWithEmailOtp = (_email: string) => Promise.reject(new Error("Use signInWithPassword instead"));

export async function signOut() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

async function getUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

/**
 * Returns auth headers for proxy calls.
 * Priority: Supabase JWT > VITE_API_SECRET shared secret > null.
 */
export async function getProxyAuthHeaders(): Promise<Record<string, string> | null> {
  if (supabase) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) return { "Authorization": `Bearer ${session.access_token}` };
  }
  // Fallback: shared secret (set as VITE_API_SECRET in Netlify env vars)
  const apiSecret = import.meta.env.VITE_API_SECRET as string | undefined;
  if (apiSecret) return { "x-api-secret": apiSecret };
  return null;
}

/**
 * Async proxy availability check.
 * Returns true when user is logged in OR a shared API secret is configured.
 */
export async function isProxyAvailableAsync(): Promise<boolean> {
  if (import.meta.env.VITE_API_SECRET) return true;
  if (!supabase) return false;
  const { data: { session } } = await supabase.auth.getSession();
  return !!session?.access_token;
}

/** @internal — exported for testing */
export function stableJson(x: unknown): string {
  // Sort keys recursively so object field order doesn't cause false change detection.
  // Without sorting, two identical states with different key insertion order
  // produce different JSON strings → unnecessary cloud pushes every render.
  function sortedReplacer(key: string, val: unknown): unknown {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      return Object.keys(val as object).sort().reduce((acc: Record<string, unknown>, k) => {
        acc[k] = (val as Record<string, unknown>)[k];
        return acc;
      }, {});
    }
    return val;
  }
  return JSON.stringify(x, sortedReplacer);
}

async function pullCloud(): Promise<{
  state: ToranotCloudState | null;
  updatedAt: string | null;
}> {
  const uid = await getUserId();
  if (!supabase || !uid) return { state: null, updatedAt: null };

  const { data, error } = await supabase
    .from("toranot_state")
    .select("state, updated_at")
    .eq("user_id", uid)
    .maybeSingle();

  if (error) throw error;

  const raw = data?.state;
  // Validate that the cloud state has the expected structure before casting
  const state: ToranotCloudState | null =
    raw && typeof raw === "object" && !Array.isArray(raw) && Array.isArray((raw as Record<string, unknown>).patients)
      ? raw as ToranotCloudState
      : null;

  return {
    state,
    updatedAt: (data?.updated_at as string) ?? null,
  };
}

async function pushCloud(state: ToranotCloudState): Promise<void> {
  const uid = await getUserId();
  if (!supabase || !uid) return;

  const payload = {
    user_id: uid,
    state,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("toranot_state")
    .upsert(payload, { onConflict: "user_id" });
  if (error) throw error;
}

/**
 * ONE-LINE WIRING:
 *   const syncStatus = useToranotCloudSync(state, dispatch)
 *
 * - Pulls once on mount (if logged in)
 * - Pulls again on login/logout events
 * - Debounced push on state change (2.5s)
 * - Suppresses echo-push after a pull
 * - Returns sync status for UI indicator
 * - Conflict detection: if local has patients and cloud has different patients, asks user
 */
export function useToranotCloudSync(
  state: { patients?: unknown; shiftHistory?: unknown; events?: unknown; unassignedTasks?: unknown; darkMode?: unknown; scanMode?: unknown },
  dispatch: CloudDispatch,
): { status: SyncStatus; lastSync: Date | null; conflict: ConflictData | null; resolveConflict: (choice: "local" | "cloud") => void } {
  const lastPushedJson = useRef<string>("");
  const pushTimer = useRef<number | null>(null);
  const [status, setStatus] = useState<SyncStatus>(supabase ? "syncing" : "off");
  // Start conflict rate logging (no-op if already running)
  if (supabase) startMetricsLogging();
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [conflict, setConflict] = useState<ConflictData | null>(null);
  const pendingCloudState = useRef<ToranotCloudState | null>(null);

  const cloudState: ToranotCloudState = useMemo(
    () => ({
      patients: (state.patients ?? []) as unknown[],
      shiftHistory: (state.shiftHistory ?? []) as unknown[],
      events: (state.events ?? []) as unknown[],
      unassignedTasks: (state.unassignedTasks ?? []) as unknown[],
      darkMode: state.darkMode as boolean | undefined,
      scanMode: state.scanMode as boolean | undefined,
    }),
    [
      state.patients,
      state.shiftHistory,
      state.events,
      state.unassignedTasks,
      state.darkMode,
      state.scanMode,
    ],
  );

  // Use a ref so the callback doesn't depend on cloudState (avoids re-creation every render)
  const cloudStateRef = useRef(cloudState);
  cloudStateRef.current = cloudState;

  const resolveConflict = useCallback((choice: "local" | "cloud") => {
    if (choice === "cloud" && pendingCloudState.current) {
      lastPushedJson.current = stableJson(pendingCloudState.current);
      dispatch({ type: "IMPORT_CLOUD_STATE", state: pendingCloudState.current });
    } else if (choice === "local") {
      // Push local state immediately and stamp lastPushedJson so the debounced push is suppressed.
      const current = cloudStateRef.current;
      const json = stableJson(current);
      lastPushedJson.current = json;
      setStatus("syncing");
      pushCloud(current)
        .then(() => { setStatus("synced"); setLastSync(new Date()); })
        .catch((e) => { console.warn("[Toranot] conflict-resolve push failed", e); setStatus("error"); });
    }
    pendingCloudState.current = null;
    setConflict(null);
  }, [dispatch]);

  // Pull on mount (and on auth change)
  useEffect(() => {
    if (!supabase) return;

    let cancelled = false;

    const doPull = async () => {
      try {
        setStatus("syncing");
        const uid = await getUserId();
        if (!uid) { setStatus("off"); return; }

        const { state: remote, updatedAt } = await pullCloud();
        if (cancelled || !remote) { setStatus("synced"); setLastSync(new Date()); return; }

        safeSetItem(STORAGE_KEY_LAST_PULL, updatedAt ?? "");

        // Per-patient merge using revision-based conflict detection (Phase 3)
        // Each patient is merged independently — different patients edited on
        // two devices are reconciled without either overwriting the other.
        const localPatients = (state.patients ?? []) as PatientEntry[];
        const remotePatients = (remote.patients ?? []) as PatientEntry[];

        const remoteEnvelopes: PatientEnvelope[] = remotePatients.map((p) =>
          patientToEnvelope(p, null)
        );

        const mergeResult = mergeWard(localPatients, remoteEnvelopes, uid);

        // Surface per-patient conflicts — never silently overwrite
        if (mergeResult.conflicts.length > 0) {
          recordConflict();
          pendingCloudState.current = remote;
          setConflict({
            localCount: localPatients.length,
            cloudCount: remotePatients.length,
            cloudUpdatedAt: updatedAt,
            perPatientConflicts: mergeResult.conflicts.map((c) => ({
              patientId: c.local.patientId,
              patientName: c.local.payload.name ?? c.local.patientId,
              reason: c.reason,
            })),
          });
          setStatus("conflict");
          // Still apply non-conflicted remote patients silently
          if (mergeResult.toApplyLocally.length > 0) {
            dispatch({ type: "MERGE_PATIENTS_FROM_REMOTE", patients: mergeResult.toApplyLocally });
          }
          return;
        }

        // Record merge outcome distribution from ward merge results
        if (mergeResult.toApplyLocally.length > 0) recordMergeOutcome("remoteNewer");
        if (mergeResult.toPushRemote.length > 0) recordMergeOutcome("localNewer");
        if (mergeResult.conflicts.length > 0) recordMergeOutcome("conflict");
        // Apply patients that are newer on remote
        if (mergeResult.toApplyLocally.length > 0) {
          dispatch({ type: "MERGE_PATIENTS_FROM_REMOTE", patients: mergeResult.toApplyLocally });
        }

        // Sync non-patient state (shiftHistory, events, unassignedTasks, settings)
        const nonPatientRemote: ToranotCloudState = {
          ...remote,
          patients: [], // patients handled above via per-patient merge
        };
        lastPushedJson.current = stableJson(remote);
        dispatch({ type: "IMPORT_CLOUD_STATE", state: nonPatientRemote });
        setStatus("synced");
        setLastSync(new Date());
      } catch (e) {
        console.warn("[Toranot] cloud pull failed", e);
        setStatus("error");
      }
    };

    doPull();

    let lastUid: string | null = null;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user?.id ?? null;
      // Only pull when the user identity actually changes (sign-in/sign-out),
      // not on routine token refreshes which fire the same event.
      if (uid !== lastUid) {
        lastUid = uid;
        doPull();
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  // Debounced push on state change
  useEffect(() => {
    if (!supabase) return;
    // Never push while a conflict is pending — user hasn't decided yet.
    // Pushing local state during conflict would overwrite cloud before resolution.
    if (conflict !== null) return;

    getUserId().then((uid) => {
      if (!uid) return;

      const json = stableJson(cloudState);

      if (json === lastPushedJson.current) return;

      if (pushTimer.current) window.clearTimeout(pushTimer.current);
      pushTimer.current = window.setTimeout(async () => {
        // Retry with exponential backoff (2.5s, 5s, 10s) on transient failures
        const MAX_RETRIES = 3;
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          try {
            setStatus("syncing");
            recordWrite();
            await pushCloud(cloudState);
            lastPushedJson.current = json;
            setStatus("synced");
            setLastSync(new Date());
            return; // success — exit retry loop
          } catch (e) {
            console.warn(`[Toranot] cloud push failed (attempt ${attempt + 1}/${MAX_RETRIES})`, e);
            recordRetry();
            if (attempt < MAX_RETRIES - 1) {
              await new Promise(r => setTimeout(r, 2500 * Math.pow(2, attempt)));
            } else {
              setStatus("error");
            }
          }
        }
      }, 2500);
    });

    return () => {
      if (pushTimer.current) window.clearTimeout(pushTimer.current);
    };
  }, [cloudState, conflict]);

  return { status, lastSync, conflict, resolveConflict };
}

// ── Conflict data type ──
export type ConflictData = {
  localCount: number;
  cloudCount: number;
  cloudUpdatedAt: string | null;
  /** Phase 3: per-patient conflicts needing user resolution */
  perPatientConflicts?: Array<{
    patientId: string;
    patientName: string;
    reason: string;
  }>;
};

// ═══════════════════════════════════════════════════════════
// SHIFT HANDOFF — share current shift state with another doctor
// ═══════════════════════════════════════════════════════════

function generateHandoffCode(): string {
  // 8-character alphanumeric code (still easy to type/dictate, harder to brute-force)
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0/1/I confusion
  let code = "";
  const arr = crypto.getRandomValues(new Uint8Array(8));
  for (const byte of arr) code += chars[byte & 31]; // 32 chars = power of 2, no modulo bias
  return code;
}

export async function createHandoff(state: ToranotCloudState): Promise<{ code: string; expiresAt: string } | null> {
  if (!supabase) return null;
  const uid = await getUserId();
  if (!uid) return null;

  const code = generateHandoffCode();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  // Re-validate live session before insert — prevents 400 from stale auth state
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) return null;
  const verifiedUid = session.user.id;

  const { error } = await supabase.from("shared_shifts").insert({
    code,
    creator_id: verifiedUid,
    state,
    expires_at: expiresAt,
  });

  if (error) {
    console.warn("[Toranot] handoff create failed:", error.message, error.details);
    return null;
  }

  return { code, expiresAt };
}

export async function pullHandoff(code: string): Promise<ToranotCloudState | null> {
  if (!supabase) return null;

  // Require auth to reduce drive-by brute forcing.
  // (RLS should still be enabled server-side. This just avoids making it *too* easy.)
  const uid = await getUserId();
  if (!uid) return null;

  const { data, error } = await supabase
    .from("shared_shifts")
    .select("state, expires_at")
    .eq("code", code.toUpperCase().trim())
    .maybeSingle();

  if (error || !data) return null;

  // Check expiry
  if (new Date(data.expires_at) < new Date()) return null;

  return data.state as ToranotCloudState;
}

// ── Shared Shift (read-only multi-user ward sharing) ─────────────────────────

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  const arr = crypto.getRandomValues(new Uint8Array(6));
  for (const byte of arr) code += chars[byte & 31]; // 32 chars = power of 2, no modulo bias
  return code;
}

/** Create or refresh a shared snapshot of the current ward state. Returns the share code. */
export async function createSharedShift(state: ToranotCloudState): Promise<string> {
  if (!supabase) throw new Error("Not logged in");

  // Re-validate live session (not just cached uid) — prevents 400 from stale auth state
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) throw new Error("Session expired — please log in again");
  const uid = session.user.id;

  const code = generateCode();
  const expires = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(); // 8h

  const { error } = await supabase.from("shared_shifts").insert({
    code,
    creator_id: uid,
    state,
    expires_at: expires,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.error("[Toranot] shared_shifts insert failed:", error.message, error.details);
    throw error;
  }
  return code;
}

/** Update an existing shared shift with current state. */
export async function updateSharedShift(code: string, state: ToranotCloudState): Promise<void> {
  const uid = await getUserId();
  if (!supabase || !uid) return;
  const { error } = await supabase
    .from("shared_shifts")
    .update({ state, updated_at: new Date().toISOString() })
    .eq("code", code)
    .eq("creator_id", uid);
  if (error) {
    console.warn("[Toranot] updateSharedShift failed:", error.message);
    throw error;
  }
}

/**
 * Update a shared shift as a guest — no creator_id check.
 * Requires the "Guests can update shared shifts by code" RLS policy.
 */
export async function updateSharedShiftAsGuest(code: string, state: ToranotCloudState): Promise<void> {
  const uid = await getUserId();
  if (!supabase || !uid) return;
  const { error } = await supabase
    .from("shared_shifts")
    .update({ state, updated_at: new Date().toISOString() })
    .eq("code", code.toUpperCase().trim())
    .gt("expires_at", new Date().toISOString()); // safety: never update expired rows
  if (error) {
    console.warn("[Toranot] updateSharedShiftAsGuest failed:", error.message);
    throw error;
  }
}

/** Pull a shared shift by code. Returns null if not found / expired. */
export async function pullSharedShift(code: string): Promise<{ state: ToranotCloudState; updatedAt: string } | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("shared_shifts")
    .select("state, updated_at")
    .eq("code", code.toUpperCase().trim())
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error || !data) return null;
  return { state: data.state as ToranotCloudState, updatedAt: data.updated_at as string };
}

/** Delete a shared shift (cleanup). */
export async function deleteSharedShift(code: string): Promise<void> {
  const uid = await getUserId();
  if (!supabase || !uid) return;
  await supabase.from("shared_shifts").delete().eq("code", code).eq("creator_id", uid);
}


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
 * Returns Authorization headers carrying the current Supabase JWT.
 * Use for all proxy calls instead of the old x-api-secret / VITE_API_SECRET.
 * Returns null if user has no active session (not logged in).
 */
export async function getProxyAuthHeaders(): Promise<Record<string, string> | null> {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  return { "Authorization": `Bearer ${session.access_token}` };
}

/**
 * Async proxy availability check — replaces !!import.meta.env.VITE_API_SECRET.
 * Returns true when user is logged in (has an active Supabase session).
 */
export async function isProxyAvailableAsync(): Promise<boolean> {
  if (!supabase) return false;
  const { data: { session } } = await supabase.auth.getSession();
  return !!session?.access_token;
}

function stableJson(x: unknown): string {
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

  return {
    state: (data?.state as ToranotCloudState) ?? null,
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

  const resolveConflict = useCallback((choice: "local" | "cloud") => {
    if (choice === "cloud" && pendingCloudState.current) {
      lastPushedJson.current = stableJson(pendingCloudState.current);
      dispatch({ type: "IMPORT_CLOUD_STATE", state: pendingCloudState.current });
    } else if (choice === "local") {
      // BUG FIX: the push effect may have already completed before the user
      // resolved the conflict (race: push fires ~2.5s after mount, conflict dialog
      // can sit longer). That means lastPushedJson already matches local state, so
      // the push effect won't re-fire → cloud keeps the old version → conflict
      // reappears on every boot.
      // Fix: push immediately and stamp lastPushedJson so the debounced push is suppressed.
      const json = stableJson(cloudState);
      lastPushedJson.current = json; // suppress duplicate push
      setStatus("syncing");
      pushCloud(cloudState)
        .then(() => { setStatus("synced"); setLastSync(new Date()); })
        .catch((e) => { console.warn("[Toranot] conflict-resolve push failed", e); setStatus("error"); });
    }
    pendingCloudState.current = null;
    setConflict(null);
  }, [dispatch, cloudState]);

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

        try {
          localStorage.setItem(STORAGE_KEY_LAST_PULL, updatedAt ?? "");
        } catch {
          /* quota */
        }

        // Conflict detection: if local has patients and cloud has DIFFERENT patients
        // Compare by patient ID sets to avoid false conflicts from JSON key ordering
        const localPatients = (state.patients ?? []) as unknown[];
        const remotePatients = (remote.patients ?? []) as unknown[];
        const localHasData = Array.isArray(localPatients) && localPatients.length > 0;
        const cloudHasData = Array.isArray(remotePatients) && remotePatients.length > 0;

        const patientIds = (arr: unknown[]) =>
          new Set((arr as { id?: string }[]).map(p => p.id ?? "").filter(Boolean));
        const localIds = patientIds(localPatients);
        const remoteIds = patientIds(remotePatients);
        // Only conflict when BOTH sides have patients the other doesn't.
        // One-sided differences (cloud has more, or local has more) means one side
        // is simply behind — apply cloud silently. Conflicting on one-sided diffs
        // triggered a false "conflict" every boot on a second device, which is the
        // common case when a colleague opens the app before pulling.
        const localOnlyIds = [...localIds].filter(id => !remoteIds.has(id));
        const cloudOnlyIds = [...remoteIds].filter(id => !localIds.has(id));
        const isGenuineConflict = localHasData && cloudHasData
          && localOnlyIds.length > 0 && cloudOnlyIds.length > 0;

        if (isGenuineConflict) {
          // Both sides have unique patients — genuinely diverged, need user decision
          pendingCloudState.current = remote;
          setConflict({
            localCount: localPatients.length,
            cloudCount: remotePatients.length,
            cloudUpdatedAt: updatedAt,
          });
          setStatus("conflict");
          return;
        }

        // No conflict — apply cloud state
        lastPushedJson.current = stableJson(remote);
        dispatch({ type: "IMPORT_CLOUD_STATE", state: remote });
        setStatus("synced");
        setLastSync(new Date());
      } catch (e) {
        console.warn("[Toranot] cloud pull failed", e);
        setStatus("error");
      }
    };

    doPull();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      doPull();
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
        try {
          setStatus("syncing");
          await pushCloud(cloudState);
          lastPushedJson.current = json;
          setStatus("synced");
          setLastSync(new Date());
        } catch (e) {
          console.warn("[Toranot] cloud push failed", e);
          setStatus("error");
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
};

// ═══════════════════════════════════════════════════════════
// SHIFT HANDOFF — share current shift state with another doctor
// ═══════════════════════════════════════════════════════════

function generateHandoffCode(): string {
  // 8-character alphanumeric code (still easy to type/dictate, harder to brute-force)
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0/1/I confusion
  let code = "";
  const arr = crypto.getRandomValues(new Uint8Array(8));
  for (const byte of arr) code += chars[byte % chars.length];
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
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
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
  await supabase
    .from("shared_shifts")
    .update({ state, updated_at: new Date().toISOString() })
    .eq("code", code)
    .eq("creator_id", uid);
}

/**
 * Update a shared shift as a guest — no creator_id check.
 * Requires the "Guests can update shared shifts by code" RLS policy.
 */
export async function updateSharedShiftAsGuest(code: string, state: ToranotCloudState): Promise<void> {
  const uid = await getUserId();
  if (!supabase || !uid) return;
  await supabase
    .from("shared_shifts")
    .update({ state, updated_at: new Date().toISOString() })
    .eq("code", code.toUpperCase().trim())
    .gt("expires_at", new Date().toISOString()); // safety: never update expired rows
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


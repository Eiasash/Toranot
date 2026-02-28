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

export type ToranotCloudState = {
  patients: unknown[];
  shiftHistory: unknown[];
  events: unknown[];
  unassignedTasks: unknown[];
  darkMode?: boolean;
  scanMode?: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CloudDispatch = (action: any) => void;

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

function stableJson(x: unknown): string {
  return JSON.stringify(x);
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
    }
    // "local" = do nothing, next push will overwrite cloud
    pendingCloudState.current = null;
    setConflict(null);
    setStatus("synced");
    setLastSync(new Date());
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
        const setsEqual = localIds.size === remoteIds.size && [...localIds].every(id => remoteIds.has(id));

        if (localHasData && cloudHasData && !setsEqual) {
          // Conflict! Let user choose
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
  }, [cloudState]);

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
  // 6-character alphanumeric code (easy to type/dictate)
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0/1/I confusion
  let code = "";
  const arr = crypto.getRandomValues(new Uint8Array(6));
  for (const byte of arr) code += chars[byte % chars.length];
  return code;
}

export async function createHandoff(state: ToranotCloudState): Promise<{ code: string; expiresAt: string } | null> {
  if (!supabase) return null;
  const uid = await getUserId();
  if (!uid) return null;

  const code = generateHandoffCode();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase.from("shared_shifts").insert({
    code,
    creator_id: uid,
    state,
    expires_at: expiresAt,
  });

  if (error) {
    console.warn("[Toranot] handoff create failed", error);
    return null;
  }

  return { code, expiresAt };
}

export async function pullHandoff(code: string): Promise<ToranotCloudState | null> {
  if (!supabase) return null;

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

// src/cloudSync.ts
// Supabase cloud sync + OTP auth + pull-on-boot + debounced push + echo suppression.
// Works with your toranot_state table (user_id PK, state jsonb, updated_at timestamptz).
//
// Wiring needed (ONE LINE in your Provider):
//   useToranotCloudSync(state, dispatch);
//
// Your reducer must support:
//   { type: "IMPORT_CLOUD_STATE", state: ToranotCloudState }

import { useEffect, useMemo, useRef } from "react";
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

// ---- Supabase client (safe no-op if env missing)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined;

export const supabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_ANON
    ? createClient(SUPABASE_URL, SUPABASE_ANON)
    : null;

// ---- Auth helpers (optional UI can call these)
export async function signInWithEmailOtp(email: string) {
  if (!supabase)
    throw new Error("Supabase not configured (missing env vars)");
  const { error } = await supabase.auth.signInWithOtp({ email });
  if (error) throw error;
}

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
 *   useToranotCloudSync(state, dispatch)
 *
 * - Pulls once on mount (if logged in)
 * - Pulls again on login/logout events
 * - Debounced push on state change (2.5s)
 * - Suppresses echo-push after a pull
 */
export function useToranotCloudSync(
  state: { patients?: unknown; shiftHistory?: unknown; events?: unknown; unassignedTasks?: unknown; darkMode?: unknown; scanMode?: unknown },
  dispatch: CloudDispatch,
) {
  const lastPushedJson = useRef<string>("");
  const pushTimer = useRef<number | null>(null);

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

  // Pull on mount (and on auth change)
  useEffect(() => {
    if (!supabase) return;

    let cancelled = false;

    const doPull = async () => {
      try {
        const uid = await getUserId();
        if (!uid) return;

        const { state: remote, updatedAt } = await pullCloud();
        if (cancelled || !remote) return;

        try {
          localStorage.setItem(STORAGE_KEY_LAST_PULL, updatedAt ?? "");
        } catch {
          /* quota */
        }

        // Prevent immediate echo-push
        lastPushedJson.current = stableJson(remote);

        dispatch({ type: "IMPORT_CLOUD_STATE", state: remote });
      } catch (e) {
        console.warn("[Toranot] cloud pull failed", e);
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
          await pushCloud(cloudState);
          lastPushedJson.current = json;
        } catch (e) {
          console.warn("[Toranot] cloud push failed", e);
        }
      }, 2500);
    });

    return () => {
      if (pushTimer.current) window.clearTimeout(pushTimer.current);
    };
  }, [cloudState]);
}

/**
 * syncWrite — metered Supabase write wrapper.
 *
 * fn() accepts PromiseLike<T> (not just Promise<T>) because Supabase query
 * builders are thenables, not real Promises. Using Promise<T> causes a TS
 * error because PostgrestFilterBuilder does not implement .catch/.finally.
 * PromiseLike only requires .then(), which builders do implement.
 *
 * Usage:
 *   await syncWrite(() =>
 *     supabase.from("toranot_state").upsert(payload, { onConflict: "user_id" })
 *   );
 */

interface ToranotMetrics {
  recordWrite?: () => void;
  recordConflict?: () => void;
  recordLatency?: (ms: number) => void;
}

function getMetrics(): ToranotMetrics {
  if (typeof window === "undefined") return {};
  return (
    (window as unknown as Record<string, unknown>).__toranotMetrics as ToranotMetrics
  ) ?? {};
}

export async function syncWrite<T>(fn: () => PromiseLike<T>): Promise<T> {
  const start = typeof performance !== "undefined" ? performance.now() : Date.now();
  try {
    const result = await fn();
    const latencyMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - start;
    const m = getMetrics();
    if (typeof m.recordWrite === "function") m.recordWrite();
    if (typeof m.recordLatency === "function") m.recordLatency(latencyMs);
    if (latencyMs > 2000) {
      console.warn(`[syncWrite] slow write: ${Math.round(latencyMs)}ms`);
    }
    return result;
  } catch (err) {
    const m = getMetrics();
    if (typeof m.recordConflict === "function") m.recordConflict();
    throw err;
  }
}

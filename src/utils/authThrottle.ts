/**
 * Throttled Supabase auth.updateUser helper.
 *
 * The chaos test produced 429 Too Many Requests from PUT /auth/v1/user.
 * This helper enforces a minimum 60-second gap between updateUser calls.
 * Extra calls within the window are silently ignored — never throw.
 *
 * Usage:
 *   import { safeUpdateUser } from "../utils/authThrottle";
 *   await safeUpdateUser(supabase, { data: { key: value } });
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const AUTH_UPDATE_INTERVAL_MS = 60_000; // 1 minute
let lastAuthUpdate = 0;

/**
 * Call supabase.auth.updateUser at most once per minute.
 * Extra calls within the window are dropped silently.
 * Never throws — logs a warning on error.
 */
export async function safeUpdateUser(
  client: SupabaseClient,
  data: Parameters<SupabaseClient["auth"]["updateUser"]>[0],
): Promise<void> {
  const now = Date.now();
  if (now - lastAuthUpdate < AUTH_UPDATE_INTERVAL_MS) {
    // Within throttle window — drop silently
    return;
  }
  lastAuthUpdate = now;
  try {
    const { error } = await client.auth.updateUser(data);
    if (error) {
      console.warn("[authThrottle] auth.updateUser failed:", error.message);
    }
  } catch (err) {
    console.warn("[authThrottle] auth.updateUser threw unexpectedly:", err);
  }
}

/** Reset throttle timer (for testing only). */
export function _resetAuthThrottleForTest(): void {
  lastAuthUpdate = 0;
}

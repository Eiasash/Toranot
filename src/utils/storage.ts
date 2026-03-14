/**
 * Safe localStorage wrappers that log warnings instead of silently swallowing errors.
 */

export function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch (err) {
    console.warn(`Failed to read localStorage key "${key}":`, err);
    return null;
  }
}

export type SetItemResult =
  | { ok: true }
  | { ok: false; quotaExceeded: true; message: string }
  | { ok: false; quotaExceeded: false; message: string };

/**
 * Safe localStorage.setItem.
 * Returns a discriminated result — callers MUST check result.ok for clinical-data keys.
 * QuotaExceededError is surfaced separately so the UI can show a specific warning.
 */
export function safeSetItem(key: string, value: string): SetItemResult {
  try {
    localStorage.setItem(key, value);
    return { ok: true };
  } catch (err) {
    const isQuota =
      err instanceof DOMException &&
      (err.name === "QuotaExceededError" || err.name === "NS_ERROR_DOM_QUOTA_REACHED");
    const message = isQuota
      ? `אחסון מקומי מלא — לא ניתן לשמור "${key}". פנה מקום בדיסק או מחק משמרות ישנות.`
      : `שגיאת אחסון בלתי צפויה עבור "${key}": ${String(err)}`;
    console.warn(`[storage] ${message}`, err);
    return { ok: false, quotaExceeded: isQuota, message };
  }
}

/** Estimate current localStorage usage and quota (bytes). Returns null when API unavailable. */
export async function estimateStorage(): Promise<{ usage: number; quota: number } | null> {
  if (!("storage" in navigator && "estimate" in navigator.storage)) return null;
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usage, quota };
  } catch {
    return null;
  }
}

/** Returns true if localStorage appears writable (quick canary write). */
export function storageAvailable(): boolean {
  const canary = "__toranot_canary__";
  try {
    localStorage.setItem(canary, "1");
    localStorage.removeItem(canary);
    return true;
  } catch {
    return false;
  }
}

export function safeRemoveItem(key: string): boolean {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (err) {
    console.warn(`Failed to remove localStorage key "${key}":`, err);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Schema validation
//
// Partial write during a browser crash or battery death can leave a
// localStorage key with valid JSON that is structurally wrong — e.g.
// a string where an array was expected. Without validation, the app
// loads bad state silently and the doctor sees corrupted patient data.
//
// Strategy: validate the minimum shape we rely on. If the top-level
// structure is wrong, return null so the caller falls back to an empty
// state rather than crashing mid-render.
// ─────────────────────────────────────────────────────────────────────

export type ValidationResult =
  | { ok: true; data: unknown }
  | { ok: false; reason: string };

/**
 * Parse a JSON string and validate that it matches an expected top-level type.
 * Returns { ok: false } (with a reason) rather than throwing on any error.
 */
export function parseAndValidate(
  raw: string | null,
  expectedType: "array" | "object",
): ValidationResult {
  if (raw === null || raw.trim() === "") {
    // Empty storage is fine — return the correct empty value.
    return { ok: true, data: expectedType === "array" ? [] : {} };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "JSON parse error — data may be corrupt" };
  }

  if (expectedType === "array" && !Array.isArray(parsed)) {
    return {
      ok: false,
      reason: `Expected array, got ${typeof parsed}. Storage may be corrupt.`,
    };
  }

  if (expectedType === "object" && (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))) {
    return {
      ok: false,
      reason: `Expected object, got ${Array.isArray(parsed) ? "array" : typeof parsed}. Storage may be corrupt.`,
    };
  }

  return { ok: true, data: parsed };
}

/**
 * Validate that a loaded patient array has the minimum fields we rely on.
 * We do not deep-validate every field — that is normalizePatient's job.
 * This catches structural corruption (e.g. partially written JSON that
 * survived as valid JSON but truncated the patient list to a single
 * non-array value).
 */
export function validatePatientsShape(data: unknown): {
  valid: boolean;
  problems: string[];
} {
  const problems: string[] = [];

  if (!Array.isArray(data)) {
    problems.push("Patient store is not an array");
    return { valid: false, problems };
  }

  for (let i = 0; i < data.length; i++) {
    const p = data[i] as Record<string, unknown>;
    if (typeof p !== "object" || p === null) {
      problems.push(`Patient at index ${i} is not an object`);
      continue;
    }
    if (typeof p.id !== "string") problems.push(`Patient[${i}].id is not a string`);
    if (typeof p.section !== "string") problems.push(`Patient[${i}].section missing`);
    if (!Array.isArray(p.tasks)) {
      problems.push(`Patient[${i}].tasks is not an array`);
    } else {
      for (let j = 0; j < p.tasks.length; j++) {
        const t = (p.tasks as unknown[])[j] as Record<string, unknown>;
        if (typeof t !== "object" || t === null) {
          problems.push(`Patient[${i}].tasks[${j}] is not an object`);
        } else if (typeof t.id !== "string" || typeof t.text !== "string") {
          problems.push(`Patient[${i}].tasks[${j}] missing id or text`);
        }
      }
    }
    if (!Array.isArray(p.generatedTasks)) problems.push(`Patient[${i}].generatedTasks is not an array`);
  }

  return { valid: problems.length === 0, problems };
}

// ─────────────────────────────────────────────────────────────────────
// Shift export
//
// One-tap JSON export of the current shift state. Structured so the
// doctor can share it via WhatsApp or email as a backup, and so the
// app can re-import it if localStorage is cleared.
//
// The exported file is intentionally human-readable (pretty-printed)
// so a doctor could also paste it into the parser if needed.
// ─────────────────────────────────────────────────────────────────────

export interface ShiftExport {
  version: 1;
  exportedAt: string;    // ISO
  shiftDate: string;     // "DD/MM/YYYY"
  patientCount: number;
  patients: unknown[];
  shiftHistory?: unknown[];
}

/**
 * Build a downloadable JSON backup of the current shift.
 * Returns a Blob that can be passed to URL.createObjectURL.
 */
export function exportShiftAsJSON(
  patients: unknown[],
  shiftDate: string,
  shiftHistory?: unknown[],
): Blob {
  const payload: ShiftExport = {
    version: 1,
    exportedAt: new Date().toISOString(),
    shiftDate,
    patientCount: patients.length,
    patients,
    shiftHistory,
  };

  const json = JSON.stringify(payload, null, 2);
  return new Blob([json], { type: "application/json;charset=utf-8" });
}

/**
 * Trigger a browser download of the shift JSON.
 * Call this from a button click handler.
 *
 * @example
 *   downloadShiftBackup(patients, "19/02/2026", history);
 */
export function downloadShiftBackup(
  patients: unknown[],
  shiftDate: string,
  shiftHistory?: unknown[],
): void {
  const blob = exportShiftAsJSON(patients, shiftDate, shiftHistory);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  // Filename: "toranot-19-02-2026.json"
  const datePart = shiftDate.replace(/\//g, "-");
  a.href = url;
  a.download = `toranot-${datePart}.json`;
  document.body.appendChild(a);
  a.click();
  // Clean up synchronously — the browser has already captured the blob reference
  // from the click event, so revoking immediately is safe and avoids a leak if
  // the page unloads before the timeout fires.
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}


// ─────────────────────────────────────────────────────────────────────
// Quota-aware helpers with auto-recovery and write-disable circuit breaker
//
// MAX_PAYLOAD_BYTES: ~2MB safety ceiling. Payloads larger than this are
// rejected before write to prevent the QuotaExceededError entirely.
//
// storageDisabled: set true after repeated quota failures to stop
// further writes and log once. Resets on page reload. Reads still work.
// ─────────────────────────────────────────────────────────────────────

const MAX_PAYLOAD_BYTES = 2 * 1024 * 1024; // 2 MB
let storageDisabled = false;

/**
 * Attempt to trim shift-history to recover quota, then retry the write.
 * Returns true if recovery succeeded.
 */
function tryQuotaRecovery(key: string, value: string): boolean {
  const SK_SHIFT_HISTORY = "toranot-shift-history";
  try {
    // Trim shift history to 10 entries (half of cap) to free space
    const raw = localStorage.getItem(SK_SHIFT_HISTORY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 10) {
        localStorage.setItem(SK_SHIFT_HISTORY, JSON.stringify(parsed.slice(0, 10)));
      }
    }
    // Retry the original write
    localStorage.setItem(key, value);
    console.warn("[storage] Quota recovered by trimming shift history.");
    return true;
  } catch {
    return false;
  }
}

/**
 * Safe localStorage set with:
 *   - 2MB payload size guard (rejects before attempting write)
 *   - QuotaExceededError recovery (trims shift history and retries once)
 *   - storageDisabled circuit breaker after repeated failures
 *   - Never throws
 */
export function safeStorageSet(key: string, value: string): boolean {
  if (storageDisabled) return false;

  const byteSize = new Blob([value]).size;
  if (byteSize > MAX_PAYLOAD_BYTES) {
    console.warn(
      `[storage] safeStorageSet: payload for "${key}" is ${Math.round(byteSize / 1024)}KB — exceeds 2MB limit, skipping write.`,
    );
    return false;
  }

  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    const isQuota =
      err instanceof DOMException &&
      (err.name === "QuotaExceededError" || err.name === "NS_ERROR_DOM_QUOTA_REACHED");

    if (!isQuota) {
      console.warn(`[storage] safeStorageSet: unexpected error for "${key}":`, err);
      return false;
    }

    // Attempt quota recovery once
    const recovered = tryQuotaRecovery(key, value);
    if (recovered) return true;

    // Recovery failed — disable further writes to prevent error spam
    storageDisabled = true;
    console.warn(
      "[storage] localStorage quota exceeded and recovery failed — writes disabled for this session. " +
        "Restart the app or clear old shift history to re-enable.",
    );
    return false;
  }
}

/**
 * Safe localStorage get.
 * Returns null on any error (missing key, parse error, storage unavailable).
 * Never throws.
 */
export function safeStorageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch (err) {
    console.warn(`[storage] safeStorageGet: error reading "${key}":`, err);
    return null;
  }
}

/** Returns whether localStorage writes are currently disabled (quota circuit breaker). */
export function isStorageDisabled(): boolean {
  return storageDisabled;
}

/** Reset the storage disabled flag (for testing only). */
export function _resetStorageDisabledForTest(): void {
  storageDisabled = false;
}

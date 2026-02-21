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

export function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    console.warn(`Failed to write localStorage key "${key}":`, err);
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
    if (!Array.isArray(p.tasks)) problems.push(`Patient[${i}].tasks is not an array`);
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
  // Clean up — revoke after a short delay to allow the download to start
  setTimeout(() => {
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }, 1000);
}


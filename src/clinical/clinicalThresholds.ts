/**
 * Canonical lab thresholds — single source of truth.
 *
 * All dashboard badges, alert components, and acuity scoring must import
 * from here. No component may define its own raw threshold numbers.
 *
 * Creatinine policy: raw absolute Cr value is NOT a reliable AKI severity
 * indicator. Use mode: "delta_only" to enforce KDIGO delta logic instead.
 * Raw Cr may only be used for labeling chronic renal impairment burden,
 * never for AKI staging without a baseline.
 */

export interface LabThresholdBand {
  low?: number;
  high?: number;
}

export interface CanonicalLabThreshold {
  key: string;
  /** Regex patterns that match this lab's label string */
  labels: RegExp[];
  warning?: LabThresholdBand;
  critical?: LabThresholdBand;
  notes?: string;
  /**
   * "delta_only" = do not emit a critical badge on raw absolute value alone.
   * Consumers must use the KDIGO delta engine for AKI severity.
   */
  mode?: "raw" | "delta_only";
}

export const CANONICAL_LAB_THRESHOLDS: CanonicalLabThreshold[] = [
  {
    key: "K",
    labels: [/^K\+?$/i, /^potassium$/i],
    warning: { low: 3.0, high: 5.5 },
    critical: { low: 2.5, high: 6.0 },
  },
  {
    key: "Na",
    labels: [/^Na\+?$/i, /^sodium$/i],
    warning: { low: 125, high: 150 },
    critical: { low: 120, high: 160 },
  },
  {
    key: "Hb",
    labels: [/^Hb$/i, /^hemoglobin$/i, /^haemoglobin$/i],
    warning: { low: 8.0 },
    critical: { low: 7.0 },
  },
  {
    key: "Lactate",
    labels: [/^lactate$/i, /^lactic\s*acid$/i],
    warning: { high: 2.0 },
    critical: { high: 4.0 },
  },
  {
    key: "Cr",
    labels: [/^Cr$/i, /^creatinine$/i],
    // Raw creatinine is NOT a reliable AKI alert on its own.
    // Use KDIGO delta logic from labDelta.ts for AKI staging.
    // A badge on raw Cr may label CKD burden only — not AKI severity.
    mode: "delta_only",
    notes: "Use KDIGO delta logic (calculateLabDeltas), not raw absolute, for AKI staging.",
  },
];

/** Find the canonical threshold entry for a given lab label string. */
export function matchLabThreshold(label: string): CanonicalLabThreshold | null {
  const normalized = label.trim();
  for (const t of CANONICAL_LAB_THRESHOLDS) {
    if (t.labels.some((rx) => rx.test(normalized))) return t;
  }
  return null;
}

/**
 * Returns true if the raw lab value crosses the critical threshold.
 * For delta_only labs (Cr), always returns false — use KDIGO staging instead.
 */
export function isCriticalLabValue(label: string, value: number): boolean {
  const t = matchLabThreshold(label);
  if (!t || !t.critical || t.mode === "delta_only") return false;
  if (t.critical.low != null && value <= t.critical.low) return true;
  if (t.critical.high != null && value >= t.critical.high) return true;
  return false;
}

/**
 * Returns true if the raw lab value crosses the warning threshold.
 * For delta_only labs (Cr), always returns false.
 */
export function isWarningLabValue(label: string, value: number): boolean {
  const t = matchLabThreshold(label);
  if (!t || !t.warning || t.mode === "delta_only") return false;
  if (t.warning.low != null && value <= t.warning.low) return true;
  if (t.warning.high != null && value >= t.warning.high) return true;
  return false;
}

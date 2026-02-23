/**
 * CrCl Buckets for renal dose adjustment.
 *
 * These map to standard pharmacokinetic breakpoints used in
 * drug package inserts and antimicrobial dosing references.
 *
 *   gt50  → CrCl > 50 ml/min   (normal / mild impairment)
 *   10_50 → CrCl 10–50 ml/min  (moderate–severe)
 *   lt10  → CrCl < 10 ml/min   (pre-dialysis / ESRD)
 *   hd    → hemodialysis
 */
export type CrClBucket = "gt50" | "10_50" | "lt10" | "hd";

/** Classify a numeric CrCl into a dosing bucket */
export function crclToBucket(crcl: number, onDialysis?: boolean): CrClBucket {
  if (onDialysis) return "hd";
  if (crcl < 10) return "lt10";
  if (crcl <= 50) return "10_50";
  return "gt50";
}

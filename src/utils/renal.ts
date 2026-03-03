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

/**
 * Estimate CrCl using Cockcroft-Gault with a creatinine floor for frail elderly.
 *
 * In sarcopenic patients >75yo, serum Cr is often misleadingly low (0.4–0.7 mg/dL)
 * due to reduced muscle mass. Using raw Cr overestimates CrCl and leads to toxic
 * overdosing of renally cleared drugs (DOACs, aminoglycosides, vancomycin, etc.).
 *
 * Convention (endorsed by AGS/ASHP): floor serum Cr at 1.0 mg/dL for patients
 * aged ≥75 when calculating CG for drug dosing. This is intentionally conservative.
 *
 * @param ageYears  - patient age
 * @param weightKg  - actual body weight (use IBW if obese)
 * @param sexFemale - true if female (applies 0.85 correction factor)
 * @param serumCrMgDl - measured serum creatinine in mg/dL
 * @returns estimated CrCl in mL/min
 */
export function cockcroft(
  ageYears: number,
  weightKg: number,
  sexFemale: boolean,
  serumCrMgDl: number,
): number {
  // Apply creatinine floor for frail elderly (≥75yo) — prevents CrCl overestimation
  const cr = ageYears >= 75 && serumCrMgDl < 1.0 ? 1.0 : serumCrMgDl;
  const crcl = ((140 - ageYears) * weightKg) / (72 * cr) * (sexFemale ? 0.85 : 1.0);
  return Math.max(crcl, 0);
}

/**
 * Convenience: compute CrCl bucket directly from patient parameters.
 * Uses Cockcroft-Gault with frailty-adjusted creatinine floor (see above).
 */
export function patientCrClBucket(
  ageYears: number,
  weightKg: number,
  sexFemale: boolean,
  serumCrMgDl: number,
  onDialysis?: boolean,
): CrClBucket {
  if (onDialysis) return "hd";
  const crcl = cockcroft(ageYears, weightKg, sexFemale, serumCrMgDl);
  return crclToBucket(crcl);
}

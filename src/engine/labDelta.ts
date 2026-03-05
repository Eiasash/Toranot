/**
 * Lab Delta Alerts
 *
 * Compares lab trajectory and flags significant changes that need attention.
 *
 * Key design decisions:
 * 1. Creatinine uses KDIGO AKI criteria, not a flat absolute threshold.
 *    The old threshold (>=0.5 rise = warning) treated Cr 3.0->3.5 the same as
 *    0.8->1.3. KDIGO is the clinical standard — relative change matters more
 *    than absolute for most patients.
 *
 * 2. Peak tracking: we store the worst value seen, not just latest vs baseline.
 *    A Cr trajectory of 0.8->1.5->1.0 still fires an alert because the patient
 *    went through AKI Stage 1, even if "recovered". Missing the peak means
 *    missing the event for documentation and nephrotoxin management.
 *
 * 3. Haemoglobin uses percentage drop thresholds rather than absolute grams,
 *    because a 1g/dL drop at Hb 12 differs clinically from the same drop at Hb 8.
 */

import type { PatientEntry, LabEntry } from "../types";

export interface LabDelta {
  label: string;
  baseline: number;
  baselineTime: string;
  latest: number;
  latestTime: string;
  /** Peak value in the worrying direction (max for rising-bad labs, min for falling-bad labs) */
  peak: number;
  peakTime: string;
  /** true when the worst point was not the most recent measurement */
  peakWasPast: boolean;
  change: number;        // latest minus baseline (absolute)
  changePercent: number;  // percentage change from baseline
  direction: "up" | "down" | "stable";
  severity: "critical" | "warning" | "ok";
  /** Hebrew clinical note explaining the alert */
  message: string;
  /** For Cr: KDIGO AKI stage (1, 2, or 3), null for non-Cr labs */
  akiStage?: 1 | 2 | 3 | null;
}

// ─────────────────────────────────────────────────────────────────────
// Creatinine: KDIGO 2012 AKI Criteria
//
// Stage 1: >=1.5x baseline  OR  >=0.3 mg/dL rise within 48h
// Stage 2: >=2.0x baseline
// Stage 3: >=3.0x baseline  OR  >=4.0 mg/dL absolute value
//
// We always use the PEAK Cr value (not latest) for staging.
// Units assumed mg/dL (Israeli lab standard).
// ─────────────────────────────────────────────────────────────────────
function classifyAKI(
  baseline: number,
  peakCr: number,
  baselineTime: Date,
  peakTime: Date,
): { severity: LabDelta["severity"]; stage: 1 | 2 | 3; message: string } | null {
  // Guard against division by zero (medically impossible but possible via data corruption)
  if (baseline <= 0) return null;
  const ratio = peakCr / baseline;
  const absoluteRise = peakCr - baseline;
  const hoursElapsed = (peakTime.getTime() - baselineTime.getTime()) / 3.6e6;

  // KDIGO Stage 3
  if (ratio >= 3.0 || peakCr >= 4.0) {
    return {
      severity: "critical",
      stage: 3,
      message: `AKI Stage 3 (KDIGO) — Cr x${ratio.toFixed(1)} מהבסיס. שקול דיאליזה, הפסק נפרוטוקסיים, נפרולוג`,
    };
  }

  // KDIGO Stage 2
  if (ratio >= 2.0) {
    return {
      severity: "critical",
      stage: 2,
      message: `AKI Stage 2 (KDIGO) — Cr x${ratio.toFixed(1)} מהבסיס. הפסק נפרוטוקסיים, בדוק נפח, שקול נפרולוג`,
    };
  }

  // KDIGO Stage 1 — ratio criterion (>=1.5x)
  if (ratio >= 1.5) {
    return {
      severity: "warning",
      stage: 1,
      message: `AKI Stage 1 (KDIGO) — Cr x${ratio.toFixed(1)} מהבסיס. בדוק נפח, הפסק NSAIDs/ACEi אם AKI, מעקב Cr`,
    };
  }

  // KDIGO Stage 1 — 48h absolute criterion (>=0.3 mg/dL within 48h)
  if (absoluteRise >= 0.3 && hoursElapsed <= 48) {
    return {
      severity: "warning",
      stage: 1,
      message: `AKI Stage 1 (KDIGO) — עלייה >=0.3 ב-48ש. Cr x${ratio.toFixed(1)} מהבסיס. בדוק נפח, מעקב Cr`,
    };
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────
// Generic thresholds for non-Cr labs
// ─────────────────────────────────────────────────────────────────────
const DELTA_THRESHOLDS: Record<string, {
  criticalUp?: number;
  criticalDown?: number;
  warningUp?: number;
  warningDown?: number;
  /** When true, comparison values are percentages, not absolute deltas */
  usePercent?: boolean;
  messageUp?: string;
  messageDown?: string;
}> = {
  // Creatinine is handled entirely by classifyAKI — no entry here.

  "K+": {
    criticalUp: 1.0,
    criticalDown: -1.0,
    warningUp: 0.5,
    warningDown: -0.5,
    messageUp: "עלייה באשלגן — בדוק תרופות (ACEi, K-sparing), תפקוד כלייתי",
    messageDown: "ירידה באשלגן — בדוק דיורטיקה, הקאות, שלשולים",
  },
  "Na": {
    criticalUp: 8,
    criticalDown: -8,
    warningUp: 5,
    warningDown: -5,
    messageUp: "עלייה בנתרן — בדוק דהידרציה, DI",
    messageDown: "ירידה בנתרן — SIADH? תרופתי? בדוק אוסמולריות",
  },
  // Hb uses percentage thresholds: a 1.5g drop from Hb 14 is not the same
  // emergency as a 1.5g drop from Hb 8.
  // -15% = warning (approaching transfusion territory), -25% = critical.
  "Hb": {
    warningDown: -15,
    criticalDown: -25,
    usePercent: true,
    messageDown: "ירידה משמעותית בהמוגלובין — שקול מקור דימום, בדוק סימנים חיוניים",
    messageUp: "עלייה בהמוגלובין",
  },
  "WBC": {
    criticalUp: 10,
    warningUp: 5,
    criticalDown: -5,
    messageUp: "עלייה בWBC — בדוק מקור זיהום",
    messageDown: "ירידה בWBC — שקול neutropenia, השפעה תרופתית",
  },
  "PLT": {
    criticalDown: -50,
    warningDown: -30,
    messageDown: "ירידה בטסיות — שקול HIT, DIC, תרופות, ספסיס",
    messageUp: "עלייה בטסיות — תגובתי?",
  },
  "CRP": {
    warningUp: 50,
    criticalUp: 100,
    messageUp: "עלייה משמעותית בCRP — בדוק מקור דלקתי/זיהומי",
    messageDown: "ירידה בCRP — שיפור",
  },
  "Lactate": {
    criticalUp: 1.5,
    warningUp: 0.5,
    messageUp: "עלייה בלקטט — hypoperfusion? ספסיס? בדוק המודינמיקה",
    messageDown: "ירידה בלקטט — שיפור פרפוזיה",
  },
  "INR": {
    criticalUp: 1.0,
    warningUp: 0.5,
    messageUp: "עלייה בINR — בדוק אינטראקציות תרופתיות, תפקוד כבד",
    messageDown: "ירידה בINR — ייתכן שהמינון לא מספיק",
  },
  "Glucose": {
    criticalUp: 150,
    criticalDown: -100,
    warningUp: 80,
    messageUp: "עלייה משמעותית בסוכר — בדוק סטרואידים, זיהום, DKA",
    messageDown: "ירידה בסוכר — בדוק היפוגליקמיה, מינון אינסולין",
  },
};

/** Calculate lab deltas for a patient */
export function calculateLabDeltas(patient: PatientEntry): LabDelta[] {
  const labs = patient.labs ?? [];
  if (labs.length < 2) return [];

  // Group entries by lab label
  const grouped = new Map<string, LabEntry[]>();
  for (const l of labs) {
    const arr = grouped.get(l.label) ?? [];
    arr.push(l);
    grouped.set(l.label, arr);
  }

  const deltas: LabDelta[] = [];

  for (const [label, entries] of grouped) {
    if (entries.length < 2) continue;

    const sorted = [...entries].sort(
      (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
    );

    const baselineEntry = sorted[0];
    const latestEntry = sorted[sorted.length - 1];

    // Skip labs with zero or negative baseline — prevents division by zero
    // in percentage calculations and nonsensical peak tracking
    if (baselineEntry.value <= 0) continue;

    const change = latestEntry.value - baselineEntry.value;
    const changePercent = Math.round((change / baselineEntry.value) * 100);

    const direction: LabDelta["direction"] =
      change > 0 ? "up" : change < 0 ? "down" : "stable";

    // ── Peak tracking ──
    // Peak = the value furthest from baseline, regardless of direction.
    // This ensures a recovering patient (e.g. Cr 0.8->1.5->1.0) still
    // surfaces the worst point, not just the current "improved" value.
    const maxEntry = sorted.reduce((a, b) => (a.value >= b.value ? a : b));
    const minEntry = sorted.reduce((a, b) => (a.value <= b.value ? a : b));
    const maxDelta = Math.abs(maxEntry.value - baselineEntry.value);
    const minDelta = Math.abs(minEntry.value - baselineEntry.value);
    const peakEntry = maxDelta >= minDelta ? maxEntry : minEntry;
    const peakWasPast = peakEntry.id !== latestEntry.id;

    // ── Creatinine: KDIGO — handled separately ──
    if (label === "Cr") {
      const akiResult = classifyAKI(
        baselineEntry.value,
        maxEntry.value,           // always stage on the peak, not latest
        new Date(baselineEntry.time),
        new Date(maxEntry.time),
      );

      if (akiResult) {
        // Append a recovery note if Cr has improved since the peak
        let message = akiResult.message;
        if (peakWasPast && latestEntry.value < maxEntry.value) {
          const pct = Math.round(
            ((maxEntry.value - latestEntry.value) / maxEntry.value) * 100
          );
          message += ` — שיפור מאז השיא (${pct}% ירידה)`;
        }

        deltas.push({
          label,
          baseline: baselineEntry.value,
          baselineTime: baselineEntry.time,
          latest: latestEntry.value,
          latestTime: latestEntry.time,
          peak: maxEntry.value,
          peakTime: maxEntry.time,
          peakWasPast,
          change,
          changePercent,
          direction,
          severity: akiResult.severity,
          message,
          akiStage: akiResult.stage,
        });
      }
      continue;
    }

    // ── Generic threshold logic ──
    const thresholds = DELTA_THRESHOLDS[label];
    let severity: LabDelta["severity"] = "ok";
    let message = "";
    const usePercent = thresholds?.usePercent ?? false;

    if (thresholds) {
      // Use either percentage or absolute change for comparison
      const compareVal = usePercent ? changePercent : change;

      if (direction === "up" || compareVal > 0) {
        if (thresholds.criticalUp !== undefined && compareVal >= thresholds.criticalUp) {
          severity = "critical";
          message = thresholds.messageUp ?? "";
        } else if (thresholds.warningUp !== undefined && compareVal >= thresholds.warningUp) {
          severity = "warning";
          message = thresholds.messageUp ?? "";
        }
      }
      if (direction === "down" || compareVal < 0) {
        if (thresholds.criticalDown !== undefined && compareVal <= thresholds.criticalDown) {
          severity = "critical";
          message = thresholds.messageDown ?? "";
        } else if (thresholds.warningDown !== undefined && compareVal <= thresholds.warningDown) {
          severity = "warning";
          message = thresholds.messageDown ?? "";
        }
      }
    }

    if (severity !== "ok") {
      deltas.push({
        label,
        baseline: baselineEntry.value,
        baselineTime: baselineEntry.time,
        latest: latestEntry.value,
        latestTime: latestEntry.time,
        peak: peakEntry.value,
        peakTime: peakEntry.time,
        peakWasPast,
        change,
        changePercent,
        direction,
        severity,
        message,
        akiStage: null,
      });
    }
  }

  // Sort: critical first, then stable alphabetical order within each severity
  return deltas.sort((a, b) => {
    if (a.severity === "critical" && b.severity !== "critical") return -1;
    if (b.severity === "critical" && a.severity !== "critical") return 1;
    return a.label.localeCompare(b.label);
  });
}

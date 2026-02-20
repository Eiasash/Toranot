/**
 * Lab Delta Alerts
 * 
 * Compares latest lab value vs the first recorded value (admission baseline)
 * and flags significant changes that need attention.
 */

import type { PatientEntry, LabEntry } from "../types";

export interface LabDelta {
  label: string;
  baseline: number;
  baselineTime: string;
  latest: number;
  latestTime: string;
  change: number;        // absolute change
  changePercent: number;  // percentage change
  direction: "up" | "down" | "stable";
  severity: "critical" | "warning" | "ok";
  message: string;        // Hebrew clinical note
}

// Significant change thresholds (geriatric-appropriate)
const DELTA_THRESHOLDS: Record<string, {
  criticalUp?: number;
  criticalDown?: number;
  warningUp?: number;
  warningDown?: number;
  messageUp?: string;
  messageDown?: string;
}> = {
  "Cr": {
    criticalUp: 0.5,    // ≥0.5 rise = possible AKI
    warningUp: 0.3,
    messageUp: "עלייה בקריאטינין — שקול AKI. בדוק נפח, תרופות נפרוטוקסיות",
    messageDown: "שיפור בתפקוד כלייתי",
  },
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
  "Hb": {
    criticalDown: -2.0,
    warningDown: -1.0,
    messageDown: "ירידה בהמוגלובין — שקול דימום, בדוק סימנים ויטליים",
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

  // Group by label
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

    const baseline = sorted[0];
    const latest = sorted[sorted.length - 1];
    const change = latest.value - baseline.value;
    const changePercent = baseline.value !== 0 
      ? Math.round((change / baseline.value) * 100) 
      : 0;

    const direction: LabDelta["direction"] = 
      change > 0 ? "up" : change < 0 ? "down" : "stable";

    const thresholds = DELTA_THRESHOLDS[label];
    let severity: LabDelta["severity"] = "ok";
    let message = "";

    if (thresholds) {
      const absChange = Math.abs(change);
      if (direction === "up") {
        if (thresholds.criticalUp && change >= thresholds.criticalUp) {
          severity = "critical";
          message = thresholds.messageUp ?? "";
        } else if (thresholds.warningUp && change >= thresholds.warningUp) {
          severity = "warning";
          message = thresholds.messageUp ?? "";
        }
      } else if (direction === "down") {
        if (thresholds.criticalDown && change <= thresholds.criticalDown) {
          severity = "critical";
          message = thresholds.messageDown ?? "";
        } else if (thresholds.warningDown && change <= thresholds.warningDown) {
          severity = "warning";
          message = thresholds.messageDown ?? "";
        }
      }
    }

    if (severity !== "ok") {
      deltas.push({
        label,
        baseline: baseline.value,
        baselineTime: baseline.time,
        latest: latest.value,
        latestTime: latest.time,
        change,
        changePercent,
        direction,
        severity,
        message,
      });
    }
  }

  // Sort: critical first
  return deltas.sort((a, b) => {
    if (a.severity === "critical" && b.severity !== "critical") return -1;
    if (b.severity === "critical" && a.severity !== "critical") return 1;
    return 0;
  });
}

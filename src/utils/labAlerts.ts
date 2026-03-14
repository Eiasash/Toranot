/**
 * Lab Critical Value Alerts
 * 
 * Fires immediate browser/PWA notifications when a lab value enters
 * critical range. Runs when a lab is added (ADD_LAB action).
 * 
 * Thresholds based on standard clinical critical values.
 */

interface CriticalThreshold {
  label: RegExp;
  criticalHigh?: number;
  criticalLow?: number;
  /** Hebrew alert message */
  highMessage: string;
  lowMessage: string;
}

const CRITICAL_THRESHOLDS: CriticalThreshold[] = [
  {
    label: /^K\+?$/i,
    criticalHigh: 6.0,
    criticalLow: 2.5,
    highMessage: "היפרקלמיה קריטית — ECG + טיפול דחוף",
    lowMessage: "היפוקלמיה קריטית — השלמה IV + ניטור",
  },
  {
    label: /^Na\+?$/i,
    criticalHigh: 160,
    criticalLow: 120,
    highMessage: "היפרנתרמיה חמורה — בירור + תיקון מבוקר",
    lowMessage: "היפונתרמיה חמורה — הגבלת נוזלים, שקול NaCl 3%",
  },
  {
    label: /^Ca\+?$|^calcium$/i,
    criticalHigh: 13.0,
    criticalLow: 6.0,
    highMessage: "היפרקלצמיה חמורה — נוזלים + שקול Zoledronic acid",
    lowMessage: "היפוקלצמיה חמורה — Ca gluconate IV + Mg check",
  },
  {
    // NOTE: Raw Cr >= 5.0 notification is for very-high-CKD burden awareness only.
    // AKI staging must use KDIGO delta logic (calculateLabDeltas), not this threshold.
    label: /^Cr$|^creatinine$/i,
    criticalHigh: 5.0,
    criticalLow: undefined,
    highMessage: "Cr גבוה מאוד — אי ספיקה כלייתית חמורה / AKI — בדוק baseline ו-delta, הפסק נפרוטוקסיים",
    lowMessage: "",
  },
  {
    label: /^Hb$|^hemoglobin$/i,
    criticalHigh: undefined,
    criticalLow: 7.0,
    highMessage: "",
    lowMessage: "Hb קריטי — שקול עירוי דם, בדוק דימום פעיל",
  },
  {
    label: /^WBC$/i,
    criticalHigh: 30,
    criticalLow: 1.0,
    highMessage: "WBC קריטי — שקול sepsis, leukemia",
    lowMessage: "נויטרופניה חמורה — בידוד + ABx רחב טווח",
  },
  {
    label: /^PLT$|^platelets$/i,
    criticalHigh: undefined,
    criticalLow: 20,
    highMessage: "",
    lowMessage: "PLT קריטי — סיכון דימום, שקול עירוי טסיות",
  },
  {
    label: /^glucose$|^סוכר$|^BG$/i,
    criticalHigh: 500,
    criticalLow: 40,
    highMessage: "סוכר קריטי — בירור DKA/HHS, אינסולין IV",
    lowMessage: "היפוגליקמיה קריטית — D50W IV מיידי",
  },
  {
    label: /^INR$/i,
    criticalHigh: 5.0,
    criticalLow: undefined,
    highMessage: "INR קריטי — סיכון דימום, שקול Vit K / PCC",
    lowMessage: "",
  },
  {
    label: /^Mg\+?$|^magnesium$/i,
    criticalHigh: undefined,
    criticalLow: 1.0,
    highMessage: "",
    lowMessage: "היפומגנזמיה חמורה — השלמה IV, בדוק K+ ו-Ca",
  },
  {
    label: /^pH$/i,
    criticalHigh: 7.6,
    criticalLow: 7.1,
    highMessage: "אלקלוזיס קשה",
    lowMessage: "אצידוזיס קשה — בירור AG, lactate, ketones",
  },
  {
    label: /^lactate$/i,
    criticalHigh: 4.0,
    criticalLow: undefined,
    highMessage: "Lactate קריטי — שקול sepsis, hypoperfusion",
    lowMessage: "",
  },
  {
    label: /^troponin$/i,
    criticalHigh: 0.3,
    criticalLow: undefined,
    highMessage: "Troponin מוגבר — שקול ACS, קרדיולוג",
    lowMessage: "",
  },
];

/**
 * Check if a lab value is critical and fire a notification if so.
 * Returns the alert message if critical, null otherwise.
 */
export function checkCriticalLab(
  labLabel: string,
  value: number,
  patientName: string | null,
): string | null {
  for (const thresh of CRITICAL_THRESHOLDS) {
    if (!thresh.label.test(labLabel)) continue;

    if (thresh.criticalHigh != null && value >= thresh.criticalHigh) {
      const msg = thresh.highMessage;
      fireCriticalLabNotification(labLabel, value, patientName, msg);
      return msg;
    }
    if (thresh.criticalLow != null && value <= thresh.criticalLow) {
      const msg = thresh.lowMessage;
      fireCriticalLabNotification(labLabel, value, patientName, msg);
      return msg;
    }
  }
  return null;
}

function fireCriticalLabNotification(
  labLabel: string,
  value: number,
  patientName: string | null,
  message: string,
) {
  const title = `🔴 ${patientName ?? "מטופל"} — ${labLabel} ${value}`;
  const body = message;

  // Try native notification
  if ("Notification" in window && Notification.permission === "granted") {
    try {
      const n = new Notification(title, {
        body,
        icon: "/icon-192.png",
        tag: `lab-critical-${labLabel}-${Date.now()}`,
        requireInteraction: true,
      } as NotificationOptions);
      setTimeout(() => n.close(), 60000); // Keep for 1 minute
      return;
    } catch {
      // fallback below
    }
  }

  // Fallback: SW notification
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: "TASK_REMINDER",
      title,
      body,
    });
    return;
  }

  console.warn(`[Lab Critical] ${title}: ${body}`);
}

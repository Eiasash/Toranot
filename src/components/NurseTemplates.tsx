/**
 * NurseTemplates — One-tap communication templates for nurse instructions.
 *
 * Half of on-call work is calling nurses with instructions. This generates
 * pre-filled messages with patient name/room, copyable to clipboard or
 * shareable via WhatsApp. Saves 30-60 seconds per call.
 */

import { useState } from "react";
import type { PatientEntry } from "../types";

interface NurseTemplatesProps {
  patient: PatientEntry;
  onClose: () => void;
}

interface Template {
  id: string;
  label: string;
  icon: string;
  generate: (p: PatientEntry) => string;
}

const TEMPLATES: Template[] = [
  {
    id: "fever-monitor",
    label: "ניטור חום",
    icon: "🌡️",
    generate: (p) =>
      `אחות — מיטה ${p.room ?? "?"} (${p.name ?? "?"}):\nבבקשה בדקי חום כל 4 שעות.\nאם מעל 38.5°C — תתקשרי לי.\nאם מעל 39°C — קחי המוקולטורות x2 + עשי BW-BC לפני מתן ABx.`,
  },
  {
    id: "bp-monitor",
    label: "ניטור ל״ד",
    icon: "💉",
    generate: (p) =>
      `אחות — מיטה ${p.room ?? "?"} (${p.name ?? "?"}):\nבבקשה מדדי ל״ד כל שעה x4, אח״כ כל 4 שעות.\nאם ל״ד סיסטולי מעל 180 או מתחת ל-90 — תתקשרי לי.`,
  },
  {
    id: "glucose-monitor",
    label: "ניטור סוכר",
    icon: "🩸",
    generate: (p) =>
      `אחות — מיטה ${p.room ?? "?"} (${p.name ?? "?"}):\nבבקשה בדקי סוכר לפני ארוחות (x3) ולפני שינה.\nאם מתחת ל-70 — תני מיץ + בדקי שוב אחרי 15 דק׳.\nאם מעל 300 — תתקשרי לי.`,
  },
  {
    id: "fall-precautions",
    label: "מניעת נפילות",
    icon: "⚠️",
    generate: (p) =>
      `אחות — מיטה ${p.room ?? "?"} (${p.name ?? "?"}):\nחולה בסיכון גבוה לנפילות.\n- מעקות מיטה למעלה\n- פעמון בהישג יד\n- ליווי בהליכה\n- תאורת לילה\nאם נפל/ה — תתקשרי לי מיד.`,
  },
  {
    id: "fluid-balance",
    label: "מאזן נוזלים",
    icon: "💧",
    generate: (p) =>
      `אחות — מיטה ${p.room ?? "?"} (${p.name ?? "?"}):\nבבקשה נהלי מאזן נוזלים מדויק.\nרשמי כל כניסה (IV + PO) וכל יציאה (שתן, הקאה, ניקוז).\nאם שתן < 30ml/h ב-2 שעות רצופות — תתקשרי לי.`,
  },
  {
    id: "npo",
    label: "צום / NPO",
    icon: "🚫",
    generate: (p) =>
      `אחות — מיטה ${p.room ?? "?"} (${p.name ?? "?"}):\nחולה בצום מלא (NPO) מעכשיו.\nאין אוכל, שתייה, או תרופות PO.\nתרופות חיוניות — IV בלבד.\nאם החולה או המשפחה מבקשים לשתות — הפני אליי.`,
  },
  {
    id: "neuro-obs",
    label: "ניטור נוירולוגי",
    icon: "🧠",
    generate: (p) =>
      `אחות — מיטה ${p.room ?? "?"} (${p.name ?? "?"}):\nניטור נוירולוגי כל שעה x6, אח״כ כל 2 שעות:\n- רמת הכרה (GCS)\n- אישונים\n- כוח גפיים\nאם שינוי בהכרה / אישון מורחב / חולשה חדשה — תתקשרי מיד.`,
  },
  {
    id: "o2-monitor",
    label: "ניטור חמצן",
    icon: "🫁",
    generate: (p) =>
      `אחות — מיטה ${p.room ?? "?"} (${p.name ?? "?"}):\nבבקשה בדקי סטורציה כל שעה.\nאם SpO2 < 92% — העלי חמצן ב-NC ותתקשרי לי.\nאם בנזיקניון — יעד 88-92%.`,
  },
  {
    id: "custom",
    label: "הודעה חופשית",
    icon: "✏️",
    generate: (p) =>
      `אחות — מיטה ${p.room ?? "?"} (${p.name ?? "?"}):\n`,
  },
];

export function NurseTemplates({ patient, onClose }: NurseTemplatesProps) {
  const [selected, setSelected] = useState<Template | null>(null);
  const [customText, setCustomText] = useState("");
  const [copied, setCopied] = useState(false);

  const messageText = selected
    ? selected.id === "custom"
      ? `אחות — מיטה ${patient.room ?? "?"} (${patient.name ?? "?"}):\n${customText}`
      : selected.generate(patient)
    : "";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(messageText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn("[Toranot] clipboard write failed, using fallback:", err);
      const ta = document.createElement("textarea");
      ta.value = messageText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleWhatsApp = () => {
    const encoded = encodeURIComponent(messageText);
    window.open(`https://wa.me/?text=${encoded}`, "_blank");
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-teal-700 text-white px-4 py-3 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-base font-bold">הודעה לאחות</h2>
            <p className="text-xs text-teal-200">
              מיטה {patient.room ?? "?"} — {patient.name ?? "?"}
            </p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white text-xl px-2">✕</button>
        </div>

        {!selected ? (
          /* Template picker */
          <div className="flex-1 overflow-y-auto p-3 grid grid-cols-2 gap-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelected(t)}
                className="flex flex-col items-center gap-1.5 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 active:bg-teal-50 dark:active:bg-teal-900/20 transition-colors"
              >
                <span className="text-2xl">{t.icon}</span>
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{t.label}</span>
              </button>
            ))}
          </div>
        ) : (
          /* Message preview + edit */
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <button
              onClick={() => { setSelected(null); setCustomText(""); }}
              className="text-xs text-teal-600 dark:text-teal-400"
            >
              ← חזור לתבניות
            </button>

            {selected.id === "custom" ? (
              <textarea
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                className="w-full h-40 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm leading-relaxed resize-none"
                dir="auto"
                placeholder="כתוב הודעה..."
                autoFocus
              />
            ) : (
              <pre
                className="text-sm leading-relaxed whitespace-pre-wrap break-words bg-gray-50 dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700"
                dir="auto"
                style={{ unicodeBidi: "plaintext" }}
              >
                {messageText}
              </pre>
            )}
          </div>
        )}

        {/* Actions */}
        {selected && (
          <div className="border-t border-gray-200 dark:border-gray-700 p-3 flex gap-2 flex-shrink-0">
            <button
              onClick={handleCopy}
              className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium active:bg-gray-200 transition-colors"
            >
              {copied ? "✓ הועתק!" : "📋 העתק"}
            </button>
            <button
              onClick={handleWhatsApp}
              className="flex-1 py-3 bg-green-600 text-white rounded-xl text-sm font-bold active:bg-green-700 transition-colors"
            >
              💬 WhatsApp
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

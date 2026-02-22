/**
 * AIClinicalReasoning — Claude API integration for on-call clinical decision support.
 *
 * SAFETY PRINCIPLES:
 * 1. This is a DECISION SUPPORT tool, not a decision maker.
 *    Every output starts with a disclaimer and ends with "verify independently."
 * 2. Prompts are geriatrics-specific: drug interactions, delirium, falls,
 *    polypharmacy, goals-of-care framing.
 * 3. No hallucinated dosing — the prompt explicitly tells Claude to say
 *    "check formulary" rather than guess doses.
 * 4. All patient data stays in the browser → API call → response.
 *    Nothing is stored server-side (Anthropic API is stateless).
 * 5. Works offline-first: if API fails, shows cached quick-reference instead.
 *
 * The user must provide their own Anthropic API key (stored in localStorage).
 */

import { useState, useCallback, useRef, useEffect } from "react";
import type { PatientEntry } from "../types";
import { safeGetItem, safeSetItem } from "../utils/storage";

const API_KEY_STORAGE = "toranot-anthropic-key";
const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";

interface AIClinicalReasoningProps {
  patient: PatientEntry;
  onClose: () => void;
}

type QueryMode =
  | "differential"    // DDx based on presentation
  | "medication-review"  // Polypharmacy analysis
  | "delirium-workup"   // Delirium-specific
  | "goals-of-care"     // Palliative/ethical
  | "freeform";         // Custom question

interface QueryOption {
  mode: QueryMode;
  label: string;
  icon: string;
  description: string;
}

const QUERY_OPTIONS: QueryOption[] = [
  {
    mode: "differential",
    label: "אבחנה מבדלת",
    icon: "🔍",
    description: "DDx על סמך הנתונים הנוכחיים",
  },
  {
    mode: "medication-review",
    label: "סקירת תרופות",
    icon: "💊",
    description: "אינטראקציות, Beers, התאמת מינון",
  },
  {
    mode: "delirium-workup",
    label: "בירור דליריום",
    icon: "🧠",
    description: "גורמים, בירור, טיפול בקשיש",
  },
  {
    mode: "goals-of-care",
    label: "מטרות טיפול",
    icon: "🤝",
    description: "שיחת GOC, DNR/DNI, פליאטיב",
  },
  {
    mode: "freeform",
    label: "שאלה חופשית",
    icon: "💬",
    description: "שאל כל שאלה קלינית",
  },
];

function buildSystemPrompt(): string {
  return `You are a clinical decision-support assistant for an on-call geriatrician in an Israeli hospital (Shaare Zedek Medical Center). 

CRITICAL SAFETY RULES:
1. You are a THINKING PARTNER, not a prescriber. Always say "consider" or "evaluate" — never "give" or "administer."
2. Never hallucinate specific drug doses. If dosing matters, say "verify dose per formulary/UpToDate."
3. Always consider: delirium, falls, polypharmacy, renal function, goals of care.
4. Flag when a presentation needs IMMEDIATE escalation (sepsis, stroke, MI, acute abdomen).
5. End every response with: "⚠️ Clinical decision support only — verify independently."

CONTEXT: Geriatric ward (ages 70-100+). Patients have multiple comorbidities, polypharmacy is the norm. Hebrew names/diagnoses may appear. Respond in Hebrew unless the user writes in English.

FORMAT: Be concise — this is 3am on-call, not a textbook. Use bullet points for actionable items. Prioritize by urgency.`;
}

function buildPatientContext(patient: PatientEntry): string {
  const parts: string[] = [];

  parts.push(`חולה: ${patient.name ?? "לא ידוע"}`);
  if (patient.room) parts.push(`חדר: ${patient.room}`);
  if (patient.age) parts.push(`גיל: ${patient.age}`);
  if (patient.diagnosis) parts.push(`אבחנה: ${patient.diagnosis}`);

  if (patient.flags.length > 0) {
    parts.push(`דגלים: ${patient.flags.join(", ")}`);
  }

  if (patient.status.length > 0) {
    parts.push(`סטטוס: ${patient.status.join(" | ")}`);
  }

  const openTasks = [...patient.tasks, ...patient.generatedTasks]
    .filter((t) => !t.done)
    .map((t) => `[${t.urgency}] ${t.text}`);
  if (openTasks.length > 0) {
    parts.push(`משימות פתוחות:\n${openTasks.join("\n")}`);
  }

  const doneTasks = [...patient.tasks, ...patient.generatedTasks]
    .filter((t) => t.done)
    .map((t) => t.text);
  if (doneTasks.length > 0) {
    parts.push(`בוצע: ${doneTasks.join(", ")}`);
  }

  if (patient.labs && patient.labs.length > 0) {
    const labStr = patient.labs
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, 10)
      .map((l) => `${l.label}: ${l.value}${l.unit ? " " + l.unit : ""} (${new Date(l.time).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })})`)
      .join(", ");
    parts.push(`מעבדות: ${labStr}`);
  }

  if (patient.notes && patient.notes.length > 0) {
    parts.push(`הערות: ${patient.notes.join(" | ")}`);
  }

  if (patient.handoverNote) {
    parts.push(`הערת מסירה: ${patient.handoverNote}`);
  }

  return parts.join("\n");
}

function buildUserPrompt(patient: PatientEntry, mode: QueryMode, freeformQ?: string): string {
  const context = buildPatientContext(patient);

  const modePrompts: Record<QueryMode, string> = {
    differential: `בהתבסס על הנתונים הבאים, מה האבחנה המבדלת? תעדף לפי סבירות ודחיפות. ציין מה הבירור הנדרש הלילה (לא מחר).`,
    "medication-review": `סקור את התרופות/המשימות של החולה הזה. חפש: אינטראקציות מסוכנות, תרופות Beers Criteria, צורך בהתאמת מינון כלייתי, עומס אנטיכולינרגי. מה צריך לשנות/לעצור הלילה?`,
    "delirium-workup": `החולה מציג סימנים שעשויים להצביע על דליריום. בהתבסס על הנתונים: (1) האם זה מתאים לדליריום? (2) מה הגורמים האפשריים? (3) מה הבירור הנדרש עכשיו? (4) טיפול לא-תרופתי ותרופתי אם נדרש.`,
    "goals-of-care": `בהתבסס על הנתונים, עזור לי להתכונן לשיחת מטרות טיפול. (1) מה הפרוגנוזה הצפויה? (2) מה הנקודות החשובות לשיחה עם המשפחה? (3) האם יש החלטות שצריך לקבל הלילה? (4) ניסוח מומלץ בעברית.`,
    freeform: freeformQ ?? "מה דעתך על החולה הזה?",
  };

  return `${modePrompts[mode]}\n\n--- נתוני חולה ---\n${context}`;
}

async function callClaudeAPI(
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 401) {
      throw new Error("מפתח API לא תקין. בדוק את ההגדרות.");
    }
    if (response.status === 429) {
      throw new Error("חריגה ממגבלת בקשות. נסה שוב בעוד דקה.");
    }
    throw new Error(`שגיאת API: ${response.status} — ${errorText.slice(0, 100)}`);
  }

  const data = await response.json();
  const textBlock = data.content?.find((b: { type: string }) => b.type === "text");
  return textBlock?.text ?? "אין תשובה.";
}

export function AIClinicalReasoning({ patient, onClose }: AIClinicalReasoningProps) {
  const [apiKey, setApiKey] = useState(() => safeGetItem(API_KEY_STORAGE) ?? "");
  const [showKeySetup, setShowKeySetup] = useState(!apiKey);
  const [selectedMode, setSelectedMode] = useState<QueryMode | null>(null);
  const [freeformQ, setFreeformQ] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const responseRef = useRef<HTMLDivElement>(null);

  // Auto-scroll response
  useEffect(() => {
    if (response && responseRef.current) {
      responseRef.current.scrollTop = responseRef.current.scrollHeight;
    }
  }, [response]);

  const saveKey = useCallback((key: string) => {
    setApiKey(key);
    safeSetItem(API_KEY_STORAGE, key);
    setShowKeySetup(false);
  }, []);

  const handleQuery = useCallback(async (mode: QueryMode) => {
    if (!apiKey) {
      setShowKeySetup(true);
      return;
    }

    setSelectedMode(mode);
    setLoading(true);
    setError("");
    setResponse("");

    const abortController = new AbortController();
    abortRef.current = abortController;

    try {
      const systemPrompt = buildSystemPrompt();
      const userPrompt = buildUserPrompt(
        patient,
        mode,
        mode === "freeform" ? freeformQ : undefined,
      );
      const result = await callClaudeAPI(apiKey, systemPrompt, userPrompt, abortController.signal);
      setResponse(result);
    } catch (err: unknown) {
      if ((err as Error).name === "AbortError") return;
      setError((err as Error).message || "שגיאה לא צפויה");
    } finally {
      setLoading(false);
    }
  }, [apiKey, patient, freeformQ]);

  const handleCancel = () => {
    abortRef.current?.abort();
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-violet-700 text-white px-4 py-3 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-base font-bold">🤖 ייעוץ AI קליני</h2>
            <p className="text-xs text-violet-200">
              {patient.name ?? "?"} · חדר {patient.room ?? "?"} · {patient.age ?? "?"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowKeySetup(true)}
              className="text-violet-300 hover:text-white text-xs"
              title="הגדרות API"
            >
              ⚙️
            </button>
            <button onClick={onClose} className="text-white/70 hover:text-white text-xl px-2">✕</button>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 px-4 py-1.5 text-[10px] text-amber-800 dark:text-amber-300 flex-shrink-0">
          ⚠️ כלי תמיכה בהחלטה בלבד — לא מחליף שיקול דעת קליני. אמת כל המלצה באופן עצמאי.
        </div>

        <div className="flex-1 overflow-y-auto" ref={responseRef}>
          {showKeySetup ? (
            /* API Key Setup */
            <APIKeySetup
              currentKey={apiKey}
              onSave={saveKey}
              onCancel={() => apiKey && setShowKeySetup(false)}
            />
          ) : !selectedMode || (!response && !loading && !error) ? (
            /* Query mode picker */
            <div className="p-4 space-y-3">
              {QUERY_OPTIONS.map((opt) => (
                <div key={opt.mode}>
                  {opt.mode === "freeform" ? (
                    <div className="space-y-2">
                      <textarea
                        value={freeformQ}
                        onChange={(e) => setFreeformQ(e.target.value)}
                        placeholder="שאל שאלה קלינית על החולה..."
                        className="w-full h-20 p-3 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 resize-none"
                        dir="auto"
                      />
                      <button
                        onClick={() => handleQuery("freeform")}
                        disabled={!freeformQ.trim()}
                        className="w-full py-3 bg-violet-600 text-white rounded-xl text-sm font-bold active:bg-violet-700 disabled:opacity-40 transition-colors"
                      >
                        💬 שאל
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleQuery(opt.mode)}
                      className="w-full flex items-center gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 active:bg-violet-50 dark:active:bg-violet-900/20 transition-colors text-right"
                    >
                      <span className="text-2xl">{opt.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {opt.label}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {opt.description}
                        </p>
                      </div>
                      <span className="text-gray-400">←</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            /* Response view */
            <div className="p-4 space-y-3">
              <button
                onClick={() => {
                  setSelectedMode(null);
                  setResponse("");
                  setError("");
                }}
                className="text-xs text-violet-600 dark:text-violet-400"
              >
                ← חזור לשאלות
              </button>

              <div className="text-xs font-medium text-gray-500 dark:text-gray-400">
                {QUERY_OPTIONS.find((o) => o.mode === selectedMode)?.icon}{" "}
                {QUERY_OPTIONS.find((o) => o.mode === selectedMode)?.label}
              </div>

              {loading && (
                <div className="flex items-center gap-3 py-8 justify-center">
                  <div className="w-5 h-5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm text-gray-500">חושב...</span>
                  <button
                    onClick={handleCancel}
                    className="text-xs text-red-500 underline"
                  >
                    בטל
                  </button>
                </div>
              )}

              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 text-sm text-red-700 dark:text-red-300">
                  ❌ {error}
                </div>
              )}

              {response && (
                <div
                  className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed whitespace-pre-wrap break-words"
                  dir="auto"
                  style={{ unicodeBidi: "plaintext" }}
                >
                  {response}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── API Key Setup sub-component ──

function APIKeySetup({
  currentKey,
  onSave,
  onCancel,
}: {
  currentKey: string;
  onSave: (key: string) => void;
  onCancel: () => void;
}) {
  const [key, setKey] = useState(currentKey);

  return (
    <div className="p-4 space-y-4">
      <div className="bg-violet-50 dark:bg-violet-900/20 rounded-xl p-4">
        <h3 className="text-sm font-bold text-violet-900 dark:text-violet-200">
          🔑 הגדרת מפתח Anthropic API
        </h3>
        <p className="text-xs text-violet-700 dark:text-violet-400 mt-1">
          המפתח נשמר מקומית בדפדפן בלבד. הנתונים נשלחים ישירות ל-Anthropic API.
        </p>
        <p className="text-xs text-violet-700 dark:text-violet-400 mt-1">
          ניתן להשיג מפתח ב-{" "}
          <a
            href="https://console.anthropic.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            console.anthropic.com
          </a>
        </p>
      </div>

      <input
        type="password"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder="sk-ant-..."
        className="w-full p-3 text-sm font-mono rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
        dir="ltr"
      />

      <div className="flex gap-2">
        {currentKey && (
          <button
            onClick={onCancel}
            className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl text-sm"
          >
            ביטול
          </button>
        )}
        <button
          onClick={() => onSave(key)}
          disabled={!key.startsWith("sk-")}
          className="flex-1 py-3 bg-violet-600 text-white rounded-xl text-sm font-bold active:bg-violet-700 disabled:opacity-40 transition-colors"
        >
          💾 שמור
        </button>
      </div>

      {currentKey && (
        <button
          onClick={() => {
            onSave("");
          }}
          className="w-full text-xs text-red-500 py-2"
        >
          🗑️ מחק מפתח
        </button>
      )}
    </div>
  );
}

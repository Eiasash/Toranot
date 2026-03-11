// src/components/ECGInterpreter.tsx
// AI ECG interpreter — upload a strip image, Claude analyzes it.
// Uses the same /api/claude proxy as letter extraction.

import { useState, useRef, useCallback } from "react";
import { getProxyAuthHeaders, isProxyAvailableAsync } from "../cloudSync";
import { safeGetItem } from "../utils/storage";

const API_KEY_STORAGE = "toranot-anthropic-key";
const DIRECT_API_URL = "https://api.anthropic.com/v1/messages";

const ECG_SYSTEM = `You are an expert cardiologist analyzing ECG strips for a geriatric on-call doctor in Israel.

Analyze the ECG image and provide a structured interpretation. Be concise and clinically actionable.

Output ONLY valid JSON (no markdown, no fences):
{
  "rate": "HR estimate e.g. ~75 bpm",
  "rhythm": "rhythm description",
  "intervals": { "PR": "Xms or N/A", "QRS": "Xms", "QTc": "Xms or estimated" },
  "axis": "Normal/LAD/RAD/Extreme/unclear",
  "stChanges": "ST description per relevant leads, or 'No significant ST changes'",
  "otherFindings": ["finding1"],
  "interpretation": "2-3 sentence summary in Hebrew with English medical terms",
  "urgency": "STAT or Urgent or Routine or Normal",
  "urgencyReason": "brief reason in Hebrew",
  "treatment": ["step1 in Hebrew", "step2"],
  "ddx": ["Dx1", "Dx2"],
  "caveats": "image quality or interpretation limitations in Hebrew"
}`;

async function analyzeECG(imageFile: File): Promise<string> {
  const useProxy = await isProxyAvailableAsync();
  const storedKey = safeGetItem(API_KEY_STORAGE) ?? "";

  if (!useProxy && !storedKey) {
    throw new Error("נדרש מפתח API. הוסף אותו בתפריט ⋯ ← הגדרות API.");
  }

  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = () => reject(new Error("קריאת הקובץ נכשלה"));
    reader.readAsDataURL(imageFile);
  });

  const mediaType = (imageFile.type || "image/jpeg") as "image/jpeg" | "image/png" | "image/webp";

  let endpoint: string;
  const headers: Record<string, string> = { "content-type": "application/json" };

  if (useProxy) {
    endpoint = "/api/claude";
    const authHeaders = await getProxyAuthHeaders();
    if (authHeaders) Object.assign(headers, authHeaders);
  } else {
    endpoint = DIRECT_API_URL;
    headers["x-api-key"] = storedKey;
    headers["anthropic-version"] = "2023-06-01";
    headers["anthropic-dangerous-direct-browser-access"] = "true";
  }

  const body = {
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    system: ECG_SYSTEM,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
        { type: "text", text: "נתח את ה-ECG הזה עבור רופא תורן גריאטריה. JSON בלבד." },
      ],
    }],
  };

  const res = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });

  if (!res.ok) {
    if (res.status === 401) throw new Error("מפתח API לא תקין — בדוק הגדרות בתפריט ⋯.");
    if (res.status === 429) throw new Error("יותר מדי בקשות — נסה שוב בעוד דקה");
    if (res.status === 504) throw new Error("השרת לא הגיב בזמן — נסה שוב");
    throw new Error(`שגיאת שרת (${res.status})`);
  }

  const data = await res.json();
  const text = data.content?.map((c: { type: string; text?: string }) => c.type === "text" ? c.text : "").join("") ?? "";
  return text.replace(/```json|```/g, "").trim();
}

interface ECGResult {
  rate: string; rhythm: string;
  intervals: { PR: string; QRS: string; QTc: string };
  axis: string; stChanges: string; otherFindings: string[];
  interpretation: string;
  urgency: "STAT" | "Urgent" | "Routine" | "Normal";
  urgencyReason: string; treatment: string[]; ddx: string[]; caveats: string;
}

const urgencyColor: Record<string, string> = {
  STAT: "bg-red-600 text-white", Urgent: "bg-amber-500 text-white",
  Routine: "bg-blue-500 text-white", Normal: "bg-green-600 text-white",
};
const urgencyBorder: Record<string, string> = {
  STAT: "border-red-500 bg-red-50 dark:bg-red-900/20",
  Urgent: "border-amber-500 bg-amber-50 dark:bg-amber-900/20",
  Routine: "border-blue-500 bg-blue-50 dark:bg-blue-900/20",
  Normal: "border-green-500 bg-green-50 dark:bg-green-900/20",
};

export function ECGInterpreter() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<ECGResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    setFile(f); setResult(null); setError(null);
    setPreview(URL.createObjectURL(f));
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!file) return;
    setAnalyzing(true); setError(null);
    try {
      const raw = await analyzeECG(file);
      setResult(JSON.parse(raw));
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה לא ידועה");
    } finally {
      setAnalyzing(false);
    }
  }, [file]);

  const reset = useCallback(() => {
    setFile(null); setPreview(null); setResult(null); setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  return (
    <div dir="rtl" className="space-y-4 pb-8">
      <div className="bg-slate-100 dark:bg-slate-800/60 rounded-xl p-3 text-[11px] text-slate-500 dark:text-slate-400">
        ⚠️ כלי עזר קליני — אינו מחליף הערכת רופא. AI עלול לטעות.
      </div>

      {!preview && (
        <div
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-blue-300 dark:border-blue-700 rounded-xl p-8 text-center cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
        >
          <div className="text-5xl mb-3">🫀</div>
          <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">צלם / העלה תמונת ECG</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">צלם ישירות עם המצלמה או העלה קובץ</p>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">JPG · PNG · WEBP</p>
          <input ref={inputRef} type="file" accept="image/*" capture="environment"
            className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        </div>
      )}

      {preview && !result && (
        <div className="space-y-3">
          <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
            <img src={preview} alt="ECG" className="w-full object-contain max-h-56 bg-white dark:bg-gray-900" />
            <button onClick={reset}
              className="absolute top-2 left-2 bg-black/60 text-white text-xs rounded-lg px-2 py-1">
              × החלף
            </button>
          </div>
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-xl p-3 text-xs text-red-700 dark:text-red-300">
              ⚠️ {error}
            </div>
          )}
          <button onClick={handleAnalyze} disabled={analyzing}
            className="w-full py-3.5 bg-blue-600 text-white rounded-xl text-sm font-bold disabled:opacity-60 active:bg-blue-700 flex items-center justify-center gap-2">
            {analyzing ? (
              <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/>
              </svg>מנתח ECG...</>
            ) : "🔍 נתח ECG עם AI"}
          </button>
        </div>
      )}

      {result && (
        <div className="space-y-3">
          {preview && (
            <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
              <img src={preview} alt="ECG" className="w-full object-contain max-h-32 bg-white dark:bg-gray-900" />
            </div>
          )}

          <div className={`rounded-xl border-2 p-3 ${urgencyBorder[result.urgency] ?? urgencyBorder.Routine}`}>
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${urgencyColor[result.urgency] ?? ""}`}>
                {result.urgency}
              </span>
              <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">{result.urgencyReason}</span>
            </div>
            <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed">{result.interpretation}</p>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {[["HR", result.rate], ["PR", result.intervals.PR], ["QRS", result.intervals.QRS], ["QTc", result.intervals.QTc]]
              .map(([label, val]) => (
                <div key={label} className="bg-slate-100 dark:bg-slate-800 rounded-lg p-2 text-center">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">{label}</div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-0.5">{val}</div>
                </div>
              ))}
          </div>

          <div className="bg-slate-100 dark:bg-slate-800 rounded-xl p-3 space-y-1.5 text-xs">
            <div><span className="font-semibold text-slate-500 dark:text-slate-400">ריתמוס: </span><span className="text-slate-800 dark:text-slate-200">{result.rhythm}</span></div>
            <div><span className="font-semibold text-slate-500 dark:text-slate-400">ציר: </span><span className="text-slate-800 dark:text-slate-200">{result.axis}</span></div>
            {result.stChanges && <div><span className="font-semibold text-slate-500 dark:text-slate-400">ST: </span><span className="text-slate-800 dark:text-slate-200">{result.stChanges}</span></div>}
          </div>

          {result.otherFindings?.length > 0 && (
            <div className="bg-slate-100 dark:bg-slate-800 rounded-xl p-3">
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1.5">ממצאים נוספים</p>
              {result.otherFindings.map((f, i) => (
                <div key={i} className="flex gap-1.5 text-xs text-slate-700 dark:text-slate-300 mb-1">
                  <span className="shrink-0">•</span><span>{f}</span>
                </div>
              ))}
            </div>
          )}

          {result.ddx?.length > 0 && (
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 border border-blue-200 dark:border-blue-800">
              <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase mb-1">DDx</p>
              <p className="text-xs text-blue-800 dark:text-blue-200">{result.ddx.join(" | ")}</p>
            </div>
          )}

          {result.treatment?.length > 0 && (
            <div className={`rounded-xl border p-3 ${urgencyBorder[result.urgency] ?? urgencyBorder.Routine}`}>
              <p className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-2">טיפול</p>
              {result.treatment.map((t, i) => (
                <div key={i} className="flex gap-2 text-xs text-slate-700 dark:text-slate-300 mb-1.5">
                  <span className="shrink-0 w-4 h-4 rounded-full bg-blue-600 text-white text-[9px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                  <span>{t}</span>
                </div>
              ))}
            </div>
          )}

          {result.caveats && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-3 text-[11px] text-yellow-800 dark:text-yellow-300">
              ⚠️ {result.caveats}
            </div>
          )}

          <button onClick={reset}
            className="w-full py-2.5 text-xs text-slate-500 dark:text-slate-400 active:bg-slate-100 dark:active:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
            ← ECG חדש
          </button>
        </div>
      )}
    </div>
  );
}

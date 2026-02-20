import { useState, useRef } from "react";
import { safeGetItem, safeSetItem } from "../utils/storage";

// -----------------------------
// Constants
// -----------------------------
const API_KEY_STORAGE_KEY = "toranot_anthropic_key";
const OCR_MODEL = "claude-opus-4-5";
const OCR_MAX_TOKENS = 2048;
const IMAGE_MAX_EDGE = 2400;
const IMAGE_JPEG_QUALITY = 0.82;

// -----------------------------
// Types
// -----------------------------
interface ScannerProps {
  onTextExtracted: (text: string) => void;
  onCancel: () => void;
}

type ScanState =
  | { step: "idle" }
  | { step: "preview"; imageUrl: string; file: File }
  | { step: "batchPreview"; items: Array<{ imageUrl: string; file: File }> }
  | { step: "scanning"; imageUrl: string; progress?: { current: number; total: number } }
  | { step: "done"; imageUrl: string; text: string }
  | { step: "error"; message: string };

const OCR_PROMPT = `You are reading a Hebrew geriatrics ward shift sheet (דף תורן גריאטריה).
The sheet is a table with columns: room/bed (חדר), patient name (שם), age (גיל), diagnosis (אבחנה), status (סטטוס), TOREN (תורן), and MACHAR (מחר).

Extract ALL patients from the image. For each patient output ONE line in this exact format:
{room} {full_name} {age} {diagnosis} | {status_flags} | תורן: {oncall_tasks} | מחר: {tomorrow_notes}

Rules:
- room: e.g. 57/1, 49-3, ניטור 1, ניטור 3
- full_name: Hebrew name as written
- age: number only
- diagnosis: as written, keep English medical terms (PNEUMONIA, CHF, AKI, SEPTIC SHOCK, BIPAP, etc.)
- status_flags: DNR, DNI, NPO, BIPAP, ISOLATION, DNR/DNI etc. if present; if none leave empty (but keep the segment only if you have any flags)
- תורן: ONLY tasks that the on-call doctor should do tonight (orders, labs, imaging, consults, follow-ups). If the תורן cell is empty, output "תורן:" with nothing after it.
- מחר: plans for the morning/team (general plan), NOT tasks for the on-call doctor. If empty, output "מחר:" with nothing after it.
- Use | to separate segments.
- Output section headers exactly as: צד א / צד ב / צד ג / שיקום / ניטור
- Output ONLY the structured text, no explanations, no markdown
`;
interface ClaudeAPIResponse {
  content: Array<{ type: string; text?: string }>;
}

interface ClaudeAPIError {
  error?: { message?: string };
}

async function runClaudeOCR(file: File, apiKey: string): Promise<string> {
  const base64 = await fileToBase64(file);
  const VALID_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
  type ImageMediaType = (typeof VALID_TYPES)[number];
  const mediaType: ImageMediaType = VALID_TYPES.includes(file.type as ImageMediaType)
    ? (file.type as ImageMediaType)
    : "image/jpeg";

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      // NOTE: Direct browser access is required because this is a client-side PWA
      // without a backend server. The API key is user-provided and stored locally.
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: OCR_MODEL,
      max_tokens: OCR_MAX_TOKENS,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            { type: "text", text: OCR_PROMPT },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    let errBody: ClaudeAPIError = {};
    try {
      errBody = (await response.json()) as ClaudeAPIError;
    } catch (parseErr) {
      console.warn("Failed to parse API error response:", parseErr);
    }
    throw new Error(errBody.error?.message || `API error ${response.status}`);
  }

  const data = (await response.json()) as ClaudeAPIResponse;
  return data.content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n");
}

// Resize + compress image to stay under Anthropic's 5MB base64 limit
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      if (width > IMAGE_MAX_EDGE || height > IMAGE_MAX_EDGE) {
        if (width > height) { height = Math.round(height * IMAGE_MAX_EDGE / width); width = IMAGE_MAX_EDGE; }
        else { width = Math.round(width * IMAGE_MAX_EDGE / height); height = IMAGE_MAX_EDGE; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Failed to get canvas 2D context")); return; }
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      const dataUrl = canvas.toDataURL("image/jpeg", IMAGE_JPEG_QUALITY);
      resolve(dataUrl.split(",")[1]);
    };
    img.onerror = reject;
    img.src = url;
  });
}

function getStoredKey(): string {
  return safeGetItem(API_KEY_STORAGE_KEY) || "";
}
function saveKey(key: string) {
  safeSetItem(API_KEY_STORAGE_KEY, key);
}

function ApiKeySetup({ onSaved }: { onSaved: () => void }) {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");

  function handleSave() {
    const trimmed = key.trim();
    if (!trimmed.startsWith("sk-ant-")) {
      setError("המפתח צריך להתחיל עם sk-ant-");
      return;
    }
    saveKey(trimmed);
    onSaved();
  }

  return (
    <div className="flex flex-col gap-4 p-1">
      <div className="text-center space-y-1">
        <div className="text-3xl">🔑</div>
        <p className="font-medium text-gray-800">נדרש מפתח Anthropic API</p>
        <p className="text-xs text-gray-500 leading-relaxed">
          הסריקה משתמשת ב-Claude Vision לדיוק מקסימלי בעברית.<br />
          המפתח נשמר רק על המכשיר שלך.
        </p>
      </div>
      <input
        type="password"
        value={key}
        onChange={(e) => { setKey(e.target.value); setError(""); }}
        placeholder="sk-ant-api03-..."
        dir="ltr"
        className="w-full p-3 border border-gray-300 rounded-xl bg-white text-gray-900 placeholder:text-gray-400 text-sm font-mono whitespace-pre-wrap break-words focus:ring-2 focus:ring-blue-400 outline-none"
      />
      {error && <p className="text-xs text-red-500 text-center">{error}</p>}
      <a
        href="https://console.anthropic.com/settings/keys"
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-blue-500 text-center underline"
      >
        קבל מפתח מ-Anthropic Console
      </a>
      <button
        onClick={handleSave}
        disabled={!key.trim()}
        className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium active:bg-blue-700 disabled:opacity-40 disabled:pointer-events-none"
      >
        שמור ותמשיך
      </button>
    </div>
  );
}

export function Scanner({ onTextExtracted, onCancel }: ScannerProps) {
  const [state, setState] = useState<ScanState>({ step: "idle" });
  const [showKeySetup, setShowKeySetup] = useState(!getStoredKey());
  const [editingKey, setEditingKey] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    // Single image flow
    if (files.length === 1) {
      const file = files[0];
      setState({ step: "preview", imageUrl: URL.createObjectURL(file), file });
      return;
    }

    // Batch flow (gallery upload supports multiple)
    const items = files.map((file) => ({ file, imageUrl: URL.createObjectURL(file) }));
    setState({ step: "batchPreview", items });
  }

  function formatOcrError(err: unknown): string {
    const raw = err instanceof Error ? err.message : String(err);
    return raw === "Failed to fetch"
      ? "חיבור נכשל. בדוק חיבור לאינטרנט ושה-API Key תקין."
      : raw;
  }

  async function runOcr(file: File, imageUrl: string, progress?: { current: number; total: number }) {
    const apiKey = getStoredKey();
    if (!apiKey) { setShowKeySetup(true); return; }
    setState({ step: "scanning", imageUrl, progress });
    try {
      const text = await runClaudeOCR(file, apiKey);
      setState({ step: "done", imageUrl, text });
    } catch (err) {
      URL.revokeObjectURL(imageUrl);
      setState({ step: "error", message: formatOcrError(err) });
    }
  }

  function normalizeAndGroupBySection(rawText: string): string {
    const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const sections: Array<{ header: string; items: string[] }> = [
      { header: "צד א", items: [] },
      { header: "צד ב", items: [] },
      { header: "צד ג", items: [] },
      { header: "שיקום", items: [] },
      { header: "ניטור", items: [] },
    ];

    function matchHeader(line: string): number | null {
      const raw = line.trim();
      if (!raw) return null;

      // Strip separators like ":" / "-" and ignore digits.
      const cleaned = raw.replace(/[:：\-–—]+/g, " ").trim();
      if (/\d/.test(cleaned)) return null;

      const t = cleaned.replace(/\s+/g, "").toLowerCase();

      if (t === "צדא" || t === "sidea") return 0;
      if (t === "צדב" || t === "sideb") return 1;
      if (t === "צדג" || t === "sidec") return 2;

      if (t === "שיקום" || t === "שיקומי" || t === "rehab" || t === "rehabilitation") return 3;

      if (t === "ניטור" || t === "מוניטור" || t === "monitor" || t === "monitoring") return 4;

      return null;
    }

    let current = 0;
    for (const line of lines) {
      const h = matchHeader(line);
      if (h !== null) { current = h; continue; }
      sections[current].items.push(line);
    }

    // Rebuild with headers only for non-empty sections
    const out: string[] = [];
    for (const s of sections) {
      if (s.items.length === 0) continue;
      out.push(s.header);
      out.push(...s.items);
      out.push("");
    }
    return out.join("\n").trim();
  }

  async function runOcrBatch(items: Array<{ file: File; imageUrl: string }>) {
    const apiKey = getStoredKey();
    if (!apiKey) { setShowKeySetup(true); return; }

    const texts: string[] = [];
    const errors: string[] = [];
    for (let i = 0; i < items.length; i++) {
      const { file, imageUrl } = items[i];
      setState({ step: "scanning", imageUrl, progress: { current: i + 1, total: items.length } });
      try {
        const text = await runClaudeOCR(file, apiKey);
        texts.push(text);
      } catch (err) {
        console.warn(`OCR failed for page ${i + 1}:`, err);
        errors.push(`דף ${i + 1}: ${formatOcrError(err)}`);
      }
      URL.revokeObjectURL(imageUrl);
    }

    // If all pages failed, show error
    if (texts.length === 0) {
      setState({ step: "error", message: errors.join("\n") });
      return;
    }

    const merged = normalizeAndGroupBySection(texts.join("\n"));
    const warningPrefix = errors.length > 0
      ? `⚠️ ${errors.length} דפים נכשלו:\n${errors.join("\n")}\n\n`
      : "";
    // Show merged text for optional editing before import
    // Use the first image as thumbnail
    const thumb = items[0]?.imageUrl ?? "";
    setState({ step: "done", imageUrl: thumb, text: warningPrefix + merged });
  }

  function handleUseText(text: string) {
    onTextExtracted(text);
    cleanup();
  }

  function cleanup() {
    if (state.step === "preview" || state.step === "scanning" || state.step === "done") {
      URL.revokeObjectURL(state.imageUrl);
    }
    if (state.step === "batchPreview") {
      for (const it of state.items) URL.revokeObjectURL(it.imageUrl);
    }
    setState({ step: "idle" });
    if (cameraRef.current) cameraRef.current.value = "";
    if (galleryRef.current) galleryRef.current.value = "";
  }

  if (showKeySetup || editingKey) {
    return <ApiKeySetup onSaved={() => { setShowKeySetup(false); setEditingKey(false); }} />;
  }

  if (state.step === "idle") {
    return (
      <div className="flex flex-col gap-3">
        <button onClick={() => cameraRef.current?.click()}
          className="flex items-center justify-center gap-3 w-full py-5 bg-emerald-600 text-white rounded-xl text-lg font-medium active:bg-emerald-700 active:scale-[0.98] transition-transform">
          <CameraIcon size={28} /> צלם דף תורן
        </button>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handleFileChange} className="hidden" />

        <button onClick={() => galleryRef.current?.click()}
          className="flex items-center justify-center gap-3 w-full py-4 bg-gray-100 text-gray-700 rounded-xl text-base font-medium active:bg-gray-200 active:scale-[0.98] transition-transform">
          <GalleryIcon size={22} /> בחר תמונה מהגלריה
        </button>
        <input ref={galleryRef} type="file" accept="image/*" multiple onChange={handleFileChange} className="hidden" />

        <div className="flex items-center justify-between">
          <button onClick={onCancel} className="text-sm text-gray-400 py-2 px-2 active:text-gray-600">ביטול</button>
          <button onClick={() => setEditingKey(true)} className="text-xs text-gray-300 py-2 px-2 active:text-gray-500">🔑 API Key</button>
        </div>
      </div>
    );
  }

  if (state.step === "preview") {
    return (
      <div className="flex flex-col gap-3">
        <img src={state.imageUrl} alt="תצוגה מקדימה" className="w-full max-h-[40vh] rounded-xl border border-gray-200 object-contain bg-gray-50" />
        <button onClick={() => runOcr(state.file, state.imageUrl)}
          className="flex items-center justify-center gap-2 w-full py-4 bg-blue-600 text-white rounded-xl text-lg font-medium active:bg-blue-700 active:scale-[0.98] transition-transform">
          <ScanIcon size={22} /> סרוק עם Claude Vision
        </button>
        <button onClick={cleanup} className="w-full py-3 bg-gray-100 text-gray-600 rounded-xl text-base font-medium active:bg-gray-200">
          צלם שוב
        </button>
      </div>
    );
  }


  if (state.step === "batchPreview") {
    return (
      <div className="flex flex-col gap-3">
        <div className="text-sm text-gray-600">
          נבחרו <span className="font-medium">{state.items.length}</span> דפים לסריקה.
        </div>
        <div className="grid grid-cols-3 gap-2">
          {state.items.slice(0, 6).map((it, idx) => (
            <img key={idx} src={it.imageUrl} alt={`דף ${idx + 1}`} className="w-full h-20 rounded-lg border border-gray-200 object-cover bg-gray-50" />
          ))}
          {state.items.length > 6 && (
            <div className="w-full h-20 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center text-xs text-gray-500">
              +{state.items.length - 6}
            </div>
          )}
        </div>
        <button
          onClick={() => runOcrBatch(state.items)}
          className="flex items-center justify-center gap-2 w-full py-4 bg-blue-600 text-white rounded-xl text-lg font-medium active:bg-blue-700 active:scale-[0.98] transition-transform"
        >
          <ScanIcon size={22} /> סרוק הכל
        </button>
        <button onClick={cleanup} className="w-full py-3 bg-gray-100 text-gray-600 rounded-xl text-base font-medium active:bg-gray-200">
          ביטול
        </button>
      </div>
    );
  }

  if (state.step === "scanning") {
    return (
      <div className="flex flex-col gap-4 items-center py-6">
        <img src={state.imageUrl} alt="סורק..." className="w-full max-h-[30vh] rounded-xl border border-gray-200 object-contain opacity-50" />
        <div className="flex items-center gap-3 text-blue-700 font-medium">
          <Spinner /> <span>Claude Vision קורא את הדף...</span>
        </div>
        <p className="text-xs text-gray-400">בדרך כלל 5–10 שניות</p>
        {"progress" in state && state.progress && (
          <p className="text-xs text-gray-500">{state.progress.current}/{state.progress.total}</p>
        )}
      </div>
    );
  }

  if (state.step === "error") {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col items-center gap-3 py-6 px-2 text-center">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-2xl">⚠️</div>
          <p className="text-sm text-gray-700 leading-relaxed">{state.message}</p>
          <button onClick={() => setEditingKey(true)} className="text-xs text-blue-500 underline">עדכן API Key</button>
        </div>
        <button onClick={() => setState({ step: "idle" })} className="w-full py-3 bg-emerald-600 text-white rounded-xl text-sm font-medium">נסה שוב</button>
        <button onClick={() => { setState({ step: "idle" }); onCancel(); }} className="w-full py-3 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium">עבור להקלדת טקסט</button>
      </div>
    );
  }

  // done — state is narrowed to { step: "done"; imageUrl: string; text: string }
  const doneState = state;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-3">
        <img src={doneState.imageUrl} alt="תוצאה" className="w-20 h-20 rounded-lg border border-gray-200 object-cover shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-700 mb-1">טקסט שזוהה:</p>
          <p className="text-xs text-gray-400">ניתן לערוך לפני הייבוא</p>
        </div>
      </div>
      <textarea
        value={doneState.text}
        onChange={(e) => setState({ ...doneState, text: e.target.value })}
        dir="auto"
        rows={8}
        style={{ unicodeBidi: "plaintext" }}
        className="w-full p-3 border border-gray-300 rounded-xl text-base leading-relaxed resize-y focus:ring-2 focus:ring-blue-400 outline-none whitespace-pre-wrap break-words font-mono max-h-[40vh]"
      />
      <button
        onClick={() => handleUseText(doneState.text)}
        disabled={!doneState.text.trim()}
        className="w-full py-4 bg-blue-600 text-white rounded-xl text-lg font-medium active:bg-blue-700 active:scale-[0.98] transition-transform disabled:opacity-40 disabled:pointer-events-none"
      >
        ייבוא רשימה
      </button>
      <div className="flex gap-2">
        <button onClick={cleanup} className="flex-1 py-3 bg-amber-100 text-amber-800 rounded-xl text-sm font-medium">סרוק שוב</button>
        <button onClick={() => { cleanup(); onCancel(); }} className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium">ביטול</button>
      </div>
    </div>
  );
}

function CameraIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}
function GalleryIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 15l-5-5L5 21" />
    </svg>
  );
}
function ScanIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 5h6M9 14l2 2 4-4" />
    </svg>
  );
}
function Spinner() {
  return (
    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

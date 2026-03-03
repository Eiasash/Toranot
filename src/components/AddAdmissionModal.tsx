
import { useState, useCallback, useRef } from "react";
import type { PatientEntry, PatientSection } from "../types";
import { usePatientsState, usePatientsDispatch } from "../context/PatientsContext";
import { generateId } from "../utils/id";

const SIDE_TO_SECTION: Record<"A" | "B" | "C", PatientSection> = {
  A: "SIDE_A",
  B: "SIDE_B",
  C: "SIDE_C",
};

interface Props {
  onClose: () => void;
  onSuccess?: () => void;
}

// ── Freestyle parser ──
// "49/2 כהן יוסף 82 pneumonia DNR"
// "חדר 53 מיטה 1 לוי שרה בת 75 CHF"
function parseFreestyle(text: string): Partial<{
  room: string;
  bed: number;
  name: string;
  age: number;
  diagnosis: string;
  status: string;
}> {
  const result: ReturnType<typeof parseFreestyle> = {};
  let remaining = text.trim();

  // Extract DNR/DNI
  const statusMatch = remaining.match(/\b(DNR\s*\/?\s*DNI|DNR|DNI|FULL\s*CODE)\b/i);
  if (statusMatch) {
    const raw = statusMatch[1].toUpperCase().replace(/\s+/g, "");
    result.status = raw === "FULLCODE" ? "" : raw.replace("/", "/");
    remaining = remaining.replace(statusMatch[0], " ");
  }

  // Extract room/bed: "49/2", "49-2", "חדר 49 מיטה 2"
  const roomBedMatch = remaining.match(/(?:חדר\s*)?(\d{2,3})\s*[\/\-]\s*(\d)/);
  if (roomBedMatch) {
    result.room = roomBedMatch[1];
    result.bed = parseInt(roomBedMatch[2]);
    remaining = remaining.replace(roomBedMatch[0], " ");
  } else {
    const roomOnlyMatch = remaining.match(/(?:חדר\s+)(\d{2,3})/);
    if (roomOnlyMatch) {
      result.room = roomOnlyMatch[1];
      remaining = remaining.replace(roomOnlyMatch[0], " ");
    }
    const bedMatch = remaining.match(/(?:מיטה\s+)(\d)/);
    if (bedMatch) {
      result.bed = parseInt(bedMatch[1]);
      remaining = remaining.replace(bedMatch[0], " ");
    }
  }

  // Extract age: "בת/בן X" or standalone number 50-120
  const ageHebMatch = remaining.match(/(?:בת|בן)\s+(\d{2,3})/);
  if (ageHebMatch) {
    const a = parseInt(ageHebMatch[1]);
    if (a >= 18 && a <= 120) {
      result.age = a;
      remaining = remaining.replace(ageHebMatch[0], " ");
    }
  }
  if (!result.age) {
    const ageMatch = remaining.match(/\b(\d{2,3})\b/g);
    if (ageMatch) {
      for (const m of ageMatch) {
        const a = parseInt(m);
        if (a >= 50 && a <= 120 && String(a) !== result.room) {
          result.age = a;
          remaining = remaining.replace(new RegExp(`\\b${m}\\b`), " ");
          break;
        }
      }
    }
  }

  // Remaining: Hebrew name first, then diagnosis
  remaining = remaining.replace(/\s+/g, " ").trim();

  // Limit to 1-3 Hebrew words so diagnosis isn't swallowed into name
  const hebrewNameMatch = remaining.match(/^([\u0590-\u05FF][\u0590-\u05FF'"\\-]*(?:\s+[\u0590-\u05FF][\u0590-\u05FF'"\\-]*){0,2})(?:\s|$)/);
  if (hebrewNameMatch) {
    result.name = hebrewNameMatch[1].trim();
    remaining = remaining.slice(hebrewNameMatch[0].length).trim();
  } else {
    const latinNameMatch = remaining.match(/^([A-Za-z][\w\s'\-]{1,30}[A-Za-z])/);
    if (latinNameMatch) {
      result.name = latinNameMatch[1].trim();
      remaining = remaining.slice(latinNameMatch[0].length).trim();
    }
  }

  if (remaining.trim()) {
    result.diagnosis = remaining.trim();
  }

  return result;
}

// ── Common geriatric diagnoses for autocomplete ──
const COMMON_DIAGNOSES = [
  "Pneumonia", "Aspiration pneumonia", "UTI", "Urosepsis", "Sepsis",
  "Cellulitis", "Endocarditis", "Cholangitis", "Cholecystitis", "C. diff colitis", "COVID-19",
  "ACS", "NSTEMI", "STEMI", "AF with RVR", "Acute HF decompensation",
  "HFrEF exacerbation", "HFpEF exacerbation", "Hypertensive urgency", "Syncope",
  "COPD exacerbation", "Asthma exacerbation", "PE", "Pleural effusion",
  "Delirium", "Stroke", "TIA", "Seizure", "Altered mental status",
  "GI bleed", "Acute abdomen", "Bowel obstruction", "Liver failure", "Pancreatitis",
  "DKA", "HHS", "Hyponatremia", "Hyperkalemia", "AKI", "CKD exacerbation",
  "Hip fracture", "Falls", "DVT", "Anemia", "Functional decline", "Malignancy workup",
];

// Organised by category for the chip picker
const DX_CATEGORIES: { label: string; items: string[] }[] = [
  { label: "זיהום 🦠", items: ["Pneumonia", "Aspiration pneumonia", "UTI", "Urosepsis", "Sepsis", "Cellulitis", "C. diff", "COVID-19", "Cholangitis", "Endocarditis"] },
  { label: "לב ❤️", items: ["ACS", "NSTEMI", "AF with RVR", "Acute HF", "HFrEF", "HFpEF", "Hypertensive urgency", "Syncope", "PE", "DVT"] },
  { label: "ריאות 🫁", items: ["COPD exacerbation", "CO2 retention", "Pleural effusion", "Asthma", "Respiratory failure"] },
  { label: "נוירו 🧠", items: ["Delirium", "Stroke", "TIA", "Seizure", "SAH", "AMS"] },
  { label: "כליה/מטבולי 🧪", items: ["AKI", "AKI on CKD", "DKA", "HHS", "Hyponatremia", "Hyperkalemia", "Hypoglycemia"] },
  { label: "כירורגי/אורתו 🦴", items: ["Hip fracture", "GI bleed", "Bowel obstruction", "Acute abdomen", "Falls", "Calcaneal fracture"] },
  { label: "שונות", items: ["Anemia", "Malignancy", "Functional decline", "Cholecystitis", "Pancreatitis", "Liver failure"] },
];

// Common geriatric combos — one tap fills the whole diagnosis field
const DX_COMBOS = [
  "Pneumonia + AKI",
  "Sepsis + AKI",
  "COPD exacerbation + CO2 retention",
  "Acute HF + AF with RVR",
  "Pneumonia + Delirium",
  "UTI + Delirium",
  "ACS + Acute HF",
  "Hip fracture + Delirium",
  "Pleural effusion + Acute HF",
  "DKA + AKI",
  "Stroke + Aspiration pneumonia",
  "HHS + Pneumonia",
];

const QUICK_DX = ["Pneumonia", "UTI", "ACS", "Delirium", "AKI", "HF", "Sepsis", "Stroke", "COPD", "AF with RVR", "GI bleed", "Hip fracture"];

const COMMON_ADMISSION_MEDS = [
  "Warfarin", "Apixaban", "Rivaroxaban", "Aspirin",
  "Insulin", "Metformin", "Steroids (chronic)",
  "ACEi / ARB", "Beta-blocker", "Digoxin",
  "Furosemide", "Antiepileptics", "Opioids",
  "Benzodiazepines", "Antipsychotics",
];

// ── File → base64 helper ──
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip data URL prefix: "data:...;base64,"
      resolve(result.split(",")[1]);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

// ── DOCX text extractor (no dependency — reads raw XML from zip) ──
async function extractDocxText(file: File): Promise<string> {
  // DOCX is a zip; we unzip in browser using JSZip loaded from CDN
  try {
    const url = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js";
    if (!("JSZip" in window)) {
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement("script");
        s.src = url;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("JSZip load failed"));
        document.head.appendChild(s);
      });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const JSZip = (window as any).JSZip as { loadAsync: (data: ArrayBuffer) => Promise<{ files: Record<string, { async: (type: string) => Promise<string> }> }> };
    const ab = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(ab);
    const xml = await zip.files["word/document.xml"].async("string");
    return xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 15000);
  } catch {
    throw new Error("לא ניתן לקרוא קובץ DOCX. נסה להמיר ל-PDF.");
  }
}

// ── Structured extraction prompt ──
const EXTRACTION_SYSTEM = `You are a clinical data extraction assistant for a geriatric ward in Israel.
Extract structured information from this hospital admission letter and return ONLY valid JSON, no other text.

CRITICAL HALLUCINATION PREVENTION:
- Copy values EXACTLY as written. Do NOT interpret or reformat numbers.
- If a value is unclear, return null — never guess.
- age MUST be 18-120. Outside this range → null.
- bed MUST be 1, 2, or 3. If unclear → null.
- meds: only drugs explicitly named in document, max 8. Never infer unlisted drugs.

The JSON must have this exact shape:
{
  "name": "patient full name in Hebrew or as written",
  "age": number or null,
  "diagnosis": "primary + secondary diagnoses, comma separated, concise",
  "room": "room number as string e.g. 49 or null",
  "bed": number or null,
  "status": "" | "DNR" | "DNI" | "DNR/DNI",
  "meds": ["list of relevant chronic/home medications, max 8"],
  "morningPresentation": "Concise morning handover in English suitable for ward rounds. Format: [Name, Age] admitted [date if known] with [chief complaint]. PMH: [key comorbidities]. Presenting: [vitals/exam findings if available]. Workup: [key labs/imaging]. Assessment: [working diagnosis]. Plan: [key management steps]. Pending: [outstanding issues for morning team].",
  "remarks": "Any other clinically relevant info not captured above (e.g. social, functional status, allergies)"
}`;

interface ExtractedData {
  name?: string;
  age?: number | null;
  diagnosis?: string;
  room?: string | null;
  bed?: number | null;
  status?: "" | "DNR" | "DNI" | "DNR/DNI";
  meds?: string[];
  morningPresentation?: string;
  remarks?: string;
}

async function extractFromLetter(
  file: File,
): Promise<ExtractedData> {
  const fileType = file.type;
  const isImage = fileType.startsWith("image/");
  const isPdf = fileType === "application/pdf";
  const isDocx = fileType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    || file.name.endsWith(".docx");

  let messageContent: unknown;

  if (isImage) {
    const data = await fileToBase64(file);
    messageContent = [
      { type: "image", source: { type: "base64", media_type: fileType, data } },
      { type: "text", text: "Extract the clinical information from this admission letter." },
    ];
  } else if (isPdf) {
    const data = await fileToBase64(file);
    messageContent = [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data } },
      { type: "text", text: "Extract the clinical information from this admission letter." },
    ];
  } else if (isDocx) {
    const text = await extractDocxText(file);
    messageContent = `Extract the clinical information from this admission letter text:\n\n${text}`;
  } else {
    throw new Error("פורמט לא נתמך. יש להשתמש ב-PDF, תמונה (JPG/PNG) או DOCX.");
  }

  const endpoint = "/api/claude";
  const headers: Record<string, string> = { "content-type": "application/json" };
  const secret = import.meta.env.VITE_API_SECRET ?? "";
  if (secret) headers["x-api-secret"] = secret;

  const body = { model: "claude-sonnet-4-6", max_tokens: 1500, system: EXTRACTION_SYSTEM, messages: [{ role: "user", content: messageContent }] };

  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`API error ${res.status}: ${err.slice(0, 100)}`);
  }

  const data = await res.json();
  const text = (data?.content?.[0]?.text ?? "").trim();
  
  // Strip markdown code fences if present
  const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
  
  try {
    return JSON.parse(cleaned) as ExtractedData;
  } catch {
    throw new Error("לא ניתן לנתח את התשובה. נסה שוב.");
  }
}

export function AddAdmissionModal({ onClose, onSuccess }: Props) {
  const { patients } = usePatientsState();
  const dispatch = usePatientsDispatch();

  const [freestyle, setFreestyle] = useState("");
  const [showStructured, setShowStructured] = useState(false);
  const [side, setSide] = useState<"A" | "B" | "C">("A");
  const [room, setRoom] = useState("");
  const [bed, setBed] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [status, setStatus] = useState<"" | "DNR" | "DNI" | "DNR/DNI">("");
  const [remarks, setRemarks] = useState("");
  const [meds, setMeds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState(false);

  // ── Diagnosis picker state ──
  const [dxSearch, setDxSearch] = useState("");
  const [activeDxCat, setActiveDxCat] = useState(0);
  const [showDxPicker, setShowDxPicker] = useState(false);

  // Toggle a single diagnosis item in/out of the diagnosis string
  const toggleDx = (item: string) => {
    setDiagnosis(prev => {
      const parts = prev.split(" + ").map(s => s.trim()).filter(Boolean);
      if (parts.includes(item)) return parts.filter(p => p !== item).join(" + ");
      return [...parts, item].join(" + ");
    });
  };

  const activeDxParts = diagnosis.split(" + ").map(s => s.trim()).filter(Boolean);

  // ── Letter extraction state ──
  const [letterFile, setLetterFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [morningPresentation, setMorningPresentation] = useState("");
  const [showMorning, setShowMorning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFreestyleParse = useCallback(() => {
    if (!freestyle.trim()) return;
    const p = parseFreestyle(freestyle);
    if (p.room) setRoom(p.room);
    if (p.bed) setBed(p.bed as 1 | 2 | 3);
    if (p.name) setName(p.name);
    if (p.age) setAge(String(p.age));
    if (p.diagnosis) setDiagnosis(p.diagnosis);
    if (p.status) setStatus(p.status as typeof status);
    setParsed(true);
    setShowStructured(true);
  }, [freestyle]);

  // ── Letter upload handler ──
  const handleLetterExtract = useCallback(async () => {
    if (!letterFile) return;
    setExtracting(true);
    setError(null);
    try {
      const extracted = await extractFromLetter(letterFile);
      
      // Auto-fill fields from extraction
      if (extracted.name) setName(extracted.name);
      if (extracted.age) setAge(String(extracted.age));
      if (extracted.diagnosis) setDiagnosis(extracted.diagnosis);
      if (extracted.room) setRoom(extracted.room);
      if (extracted.bed) setBed(extracted.bed as 1 | 2 | 3);
      if (extracted.status) setStatus(extracted.status);
      if (extracted.meds && extracted.meds.length > 0) {
        setMeds(prev => Array.from(new Set([...prev, ...extracted.meds!])));
      }
      if (extracted.remarks) {
        setRemarks(prev => prev ? `${prev}\n${extracted.remarks}` : extracted.remarks!);
      }
      if (extracted.morningPresentation) {
        setMorningPresentation(extracted.morningPresentation);
        setShowMorning(true);
      }
      
      setShowStructured(true);
      setParsed(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בניתוח המכתב");
    } finally {
      setExtracting(false);
    }
  }, [letterFile]);

  function validate(): string | null {
    if (!side) return "יש לבחור צד";
    if (!room.trim() || isNaN(Number(room.trim()))) return "יש להזין מספר חדר תקין";
    if (!name.trim()) return "יש להזין שם מטופל";
    if (!diagnosis.trim()) return "יש להזין אבחנה";
    return null;
  }

  function isDuplicateBed(): boolean {
    const section = SIDE_TO_SECTION[side];
    const roomStr = room.trim().includes("/") ? room.trim() : `${room.trim()}/${bed}`;
    return patients.some((p: PatientEntry) => p.section === section && p.room === roomStr);
  }

  function handleSubmit() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    if (isDuplicateBed()) {
      setError(`מיטה ${bed} בחדר ${room} (צד ${side === "A" ? "א" : side === "B" ? "ב" : "ג"}) כבר תפוסה`);
      return;
    }

    const section = SIDE_TO_SECTION[side];
    const roomStr = room.trim().includes("/") ? room.trim() : `${room.trim()}/${bed}`;
    const parsedAge = age.trim() ? parseInt(age.trim()) : null;

    const patient: PatientEntry = {
      id: generateId("pt-"),
      section,
      date: (() => {
        const d = new Date();
        return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
      })(),
      room: roomStr,
      name: name.trim(),
      age: parsedAge && parsedAge >= 18 && parsedAge <= 120 ? parsedAge : null,
      diagnosis: diagnosis.trim(),
      status: status ? [status] : [],
      flags: [],
      tasks: [],
      generatedTasks: [],
      tomorrowNotes: [],
      planNotes: [],
      notes: [
        ...(remarks.trim() ? [remarks.trim()] : []),
        ...(meds.length > 0 ? [`מדים: ${meds.join(", ")}`] : []),
      ],
      labs: [],
      scannedAt: new Date().toISOString(),
      confidence: 1,
      order: Date.now(),
      // Morning presentation stored as handoverNote — shows in handoff sheet
      ...(morningPresentation.trim() ? { handoverNote: `📋 Morning: ${morningPresentation.trim()}` } : {}),
    } as PatientEntry;

    dispatch({ type: "NEW_ADMISSION", patient });
    onSuccess?.();
    onClose();
  }

  const inputCls = "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        className="bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto p-5 space-y-4 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">קבלה חדשה</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xl px-1">×</button>
        </div>

        {error && (
          <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</div>
        )}

        {/* ── Letter upload section ── */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/40 rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">📄 מכתב קבלה</span>
            <span className="text-xs text-blue-500 dark:text-blue-400">PDF · תמונה · DOCX</span>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 px-3 py-2 text-xs border-2 border-dashed border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors truncate"
            >
              {letterFile ? `✓ ${letterFile.name}` : "📎 בחר קובץ..."}
            </button>
            <button
              type="button"
              onClick={handleLetterExtract}
              disabled={!letterFile || extracting}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold disabled:opacity-40 active:bg-blue-700 whitespace-nowrap"
            >
              {extracting ? "⏳ מנתח..." : "נתח 🤖"}
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) { setLetterFile(f); setError(null); }
            }}
          />

          {/* Morning presentation preview */}
          {morningPresentation && (
            <div className="mt-1">
              <button
                type="button"
                onClick={() => setShowMorning(v => !v)}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1"
              >
                🌅 הצגת בוקר {showMorning ? "▲" : "▼"}
              </button>
              {showMorning && (
                <div className="mt-1.5 relative">
                  <textarea
                    value={morningPresentation}
                    onChange={e => setMorningPresentation(e.target.value)}
                    rows={6}
                    dir="ltr"
                    className="w-full px-2 py-1.5 text-xs border border-blue-200 dark:border-blue-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 resize-none font-mono leading-relaxed"
                  />
                  <button
                    type="button"
                    onClick={() => { navigator.clipboard.writeText(morningPresentation).catch(() => {}); }}
                    className="absolute top-1.5 left-1.5 text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded opacity-70 hover:opacity-100"
                  >
                    העתק
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Freestyle input ── */}
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">הקלד חופשי — הכל בשורה אחת</label>
          <div className="flex gap-2">
            <textarea
              value={freestyle}
              onChange={(e) => { setFreestyle(e.target.value); setParsed(false); }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleFreestyleParse(); } }}
              placeholder={"49/2 כהן יוסף 82 pneumonia DNR"}
              dir="auto"
              rows={2}
              autoFocus
              style={{ unicodeBidi: "plaintext" as const }}
              className={`flex-1 ${inputCls} resize-none placeholder:text-gray-400`}
            />
            <button
              onClick={handleFreestyleParse}
              disabled={!freestyle.trim()}
              className="self-end px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium active:bg-blue-700 disabled:opacity-40 whitespace-nowrap"
            >
              {parsed ? "✓ נותח" : "נתח →"}
            </button>
          </div>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
            דוגמאות: &quot;49/2 כהן יוסף 82 pneumonia DNR&quot; · &quot;חדר 53 מיטה 1 לוי שרה בת 75 CHF&quot;
          </p>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
          <button onClick={() => setShowStructured(!showStructured)} className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            {showStructured ? "▲ הסתר שדות" : "▼ ערוך שדות ידנית"}
          </button>
          <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
        </div>

        {/* ── Structured fields ── */}
        {showStructured && (
          <>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">צד *</label>
                <select value={side} onChange={(e) => setSide(e.target.value as "A" | "B" | "C")} className={inputCls}>
                  <option value="A">צד א</option>
                  <option value="B">צד ב</option>
                  <option value="C">צד ג</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">חדר *</label>
                <input type="number" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="49" className={inputCls} />
              </div>
              <div className="w-24">
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">מיטה *</label>
                <select value={bed} onChange={(e) => setBed(Number(e.target.value) as 1 | 2 | 3)} className={inputCls}>
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">שם מטופל *</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="כהן יוסף" dir="auto" className={inputCls} />
              </div>
              <div className="w-20">
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">גיל</label>
                <input type="number" value={age} onChange={(e) => setAge(e.target.value)} placeholder="82" min={18} max={120} className={inputCls} />
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">אבחנה *</label>

              {/* Active diagnoses display + free-text input */}
              <div
                className={`${inputCls} min-h-[40px] flex flex-wrap gap-1 items-center cursor-text`}
                onClick={() => setShowDxPicker(true)}
              >
                {activeDxParts.map(d => (
                  <span key={d} className="inline-flex items-center gap-1 bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full">
                    {d}
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); toggleDx(d); }}
                      className="opacity-70 hover:opacity-100 font-bold leading-none"
                    >×</button>
                  </span>
                ))}
                <input
                  type="text"
                  value={dxSearch}
                  onChange={e => { setDxSearch(e.target.value); setShowDxPicker(true); }}
                  onFocus={() => { if (!dxSearch) setShowDxPicker(true); }}
                  onKeyDown={e => {
                    if ((e.key === "Enter" || e.key === ",") && dxSearch.trim()) {
                      e.preventDefault();
                      toggleDx(dxSearch.trim().replace(/,+$/, ""));
                      setDxSearch("");
                    } else if (e.key === "Backspace" && !dxSearch && activeDxParts.length > 0) {
                      toggleDx(activeDxParts[activeDxParts.length - 1]);
                    }
                  }}
                  onBlur={() => {
                    // Auto-commit free text when user taps away — don't lose what they typed
                    if (dxSearch.trim()) {
                      toggleDx(dxSearch.trim().replace(/,+$/, ""));
                      setDxSearch("");
                    }
                    setTimeout(() => setShowDxPicker(false), 150);
                  }}
                  placeholder={activeDxParts.length === 0 ? "הקלד חופשי או חפש רשימה" : "+ הוסף אבחנה"}
                  className="flex-1 min-w-[80px] bg-transparent outline-none text-sm placeholder:text-gray-400"
                  dir="auto"
                />
              </div>

              {/* Combos row */}
              <div className="mt-1.5">
                <p className="text-[10px] text-gray-400 mb-1">קומבינציות נפוצות:</p>
                <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
                  {DX_COMBOS.map(combo => (
                    <button
                      key={combo}
                      type="button"
                      onClick={() => { setDiagnosis(combo); setDxSearch(""); setShowDxPicker(false); }}
                      className={"text-[10px] px-2 py-1 rounded-lg border whitespace-nowrap transition-colors flex-shrink-0 " +
                        (diagnosis === combo
                          ? "bg-purple-600 text-white border-purple-600"
                          : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 active:bg-purple-100")}
                    >
                      {combo}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quick-add free-text — tappable card when user types */}
              {dxSearch.trim() && (
                <button
                  type="button"
                  onMouseDown={e => { e.preventDefault(); toggleDx(dxSearch.trim()); setDxSearch(""); setShowDxPicker(false); }}
                  className="mt-1.5 w-full text-right px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-900/40 border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 text-sm font-medium active:bg-blue-100"
                >
                  ＋ הוסף &ldquo;{dxSearch.trim()}&rdquo;
                </button>
              )}
              {/* Picker panel */}
              {showDxPicker && (
                <div className="mt-1 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 shadow-lg overflow-hidden">
                  {/* Category tabs */}
                  <div className="flex gap-0.5 overflow-x-auto p-1.5 border-b border-gray-100 dark:border-gray-700 scrollbar-hide">
                    {DX_CATEGORIES.map((cat, i) => (
                      <button
                        key={cat.label}
                        type="button"
                        onClick={() => { setActiveDxCat(i); setDxSearch(""); }}
                        className={"text-[10px] px-2 py-1 rounded-lg whitespace-nowrap transition-colors flex-shrink-0 " +
                          (activeDxCat === i
                            ? "bg-blue-600 text-white"
                            : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700")}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>

                  {/* Items */}
                  <div className="flex flex-wrap gap-1 p-2 max-h-32 overflow-y-auto">
                    {(dxSearch.trim()
                      ? DX_CATEGORIES.flatMap(c => c.items).filter(item =>
                          item.toLowerCase().includes(dxSearch.toLowerCase())
                        )
                      : DX_CATEGORIES[activeDxCat].items
                    ).map(item => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => { toggleDx(item); setDxSearch(""); }}
                        className={"text-xs px-2 py-1 rounded-full border transition-colors " +
                          (activeDxParts.includes(item)
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600 active:bg-blue-50")}
                      >
                        {activeDxParts.includes(item) ? "✓ " : ""}{item}
                      </button>
                    ))}
                  </div>

                  <div className="flex justify-between items-center px-2 py-1.5 border-t border-gray-100 dark:border-gray-700">
                    <span className="text-[10px] text-gray-400">
                      {activeDxParts.length > 0 ? activeDxParts.join(" + ") : "לא נבחרה אבחנה"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowDxPicker(false)}
                      className="text-xs text-blue-600 font-semibold px-2 py-0.5"
                    >
                      סגור ✓
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                תרופות לדגל <span className="text-gray-400">(אופציונלי)</span>
              </label>
              <div className="flex flex-wrap gap-1">
                {COMMON_ADMISSION_MEDS.map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMeds(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])}
                    className={"text-[10px] px-2 py-0.5 rounded-full border transition-colors " + (meds.includes(m) ? "bg-amber-500 text-white border-amber-500" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600")}
                  >
                    {m}
                  </button>
                ))}
              </div>
              {/* Free-text drug entry */}
              <input
                type="text"
                placeholder="תרופה אחרת... (Enter להוספה)"
                dir="auto"
                className="mt-1.5 w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 outline-none focus:border-amber-400"
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const val = (e.target as HTMLInputElement).value.trim();
                    if (val && !meds.includes(val)) setMeds(prev => [...prev, val]);
                    (e.target as HTMLInputElement).value = "";
                  }
                }}
              />
            </div>

            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">סטטוס</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={inputCls}>
                <option value="">ללא</option>
                <option value="DNR">DNR</option>
                <option value="DNI">DNI</option>
                <option value="DNR/DNI">DNR/DNI</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">הערות</label>
              <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="הערות נוספות..." dir="auto" rows={2} className={`${inputCls} resize-none`} />
            </div>
          </>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button onClick={handleSubmit} className="flex-1 py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold active:bg-blue-700">
            הוסף מטופל
          </button>
          <button onClick={onClose} className="px-5 py-3 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl text-sm active:bg-gray-100 dark:active:bg-gray-700">
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}

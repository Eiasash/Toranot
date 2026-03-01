import { useState, useCallback } from "react";
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

  const hebrewNameMatch = remaining.match(/^([\u0590-\u05FF][\u0590-\u05FF\s'"\-]{1,40}[\u0590-\u05FF])/);
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

const QUICK_DX = ["Pneumonia", "UTI", "ACS", "Delirium", "AKI", "HF", "Sepsis", "Stroke", "COPD", "AF with RVR", "GI bleed", "Hip fracture"];

const COMMON_ADMISSION_MEDS = [
  "Warfarin", "Apixaban", "Rivaroxaban", "Aspirin",
  "Insulin", "Metformin", "Steroids (chronic)",
  "ACEi / ARB", "Beta-blocker", "Digoxin",
  "Furosemide", "Antiepileptics", "Opioids",
  "Benzodiazepines", "Antipsychotics",
];

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
    } as PatientEntry;

    dispatch({ type: "NEW_ADMISSION", patient });
    onSuccess?.();
    onClose();
  }

  const inputCls = "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto p-5 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">קבלה חדשה</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xl px-1">×</button>
        </div>

        {error && (
          <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">{error}</div>
        )}

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
              <input
                type="text"
                list="dx-suggestions"
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
                placeholder="Pneumonia / דלקת ריאות"
                dir="auto"
                className={inputCls}
              />
              <datalist id="dx-suggestions">
                {COMMON_DIAGNOSES.map(d => <option key={d} value={d} />)}
              </datalist>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {QUICK_DX.map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      const parts = diagnosis.split(/[,+\s]+/).map(s => s.trim()).filter(Boolean);
                      if (parts.includes(d)) {
                        setDiagnosis(parts.filter(p => p !== d).join(" + "));
                      } else {
                        setDiagnosis(diagnosis.trim() ? diagnosis.trim() + " + " + d : d);
                      }
                    }}
                    className={"text-[10px] px-2 py-0.5 rounded-full border transition-colors " + (diagnosis.split(/[,+\s]+/).map(s=>s.trim()).includes(d) ? "bg-blue-600 text-white border-blue-600" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600")}
                  >
                    {d}
                  </button>
                ))}
              </div>
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

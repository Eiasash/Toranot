/**
 * VoiceInput — Enhanced with structured Hebrew clinical command parsing.
 *
 * Supports two modes:
 *   1. Free-form: returns raw transcript (original behavior)
 *   2. Structured: parses "מיטה 42 חום 38.5 דחוף" → { room, task, urgency }
 *
 * Clinical command patterns recognized:
 *   - "מיטה X ..." / "חדר X ..." → patient lookup by room
 *   - "חום X.X" → fever task with temp
 *   - "סוכר XXX" → glucose monitoring task
 *   - "לחץ דם XXX/XX" → BP monitoring task
 *   - "דחוף" / "סטט" / "רגיל" → urgency
 *   - "נפילה" / "כאב" / "עירוי" / "דם" / "בדיקה" → keyword tasks
 */

import { useState, useRef, useCallback, useEffect, useMemo } from "react";

// ── Structured parse result ──
export interface VoiceParsedCommand {
  room: string | null;
  taskText: string;
  urgency: "stat" | "urgent" | "routine";
  rawTranscript: string;
  confidence: number;
}

interface VoiceInputProps {
  onResult: (text: string) => void;
  onStructuredResult?: (cmd: VoiceParsedCommand) => void;
  structured?: boolean;
}

interface SpeechRecognitionEvent {
  results: { [index: number]: { [index: number]: { transcript: string; confidence: number } } };
}

interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// ── Parse structured Hebrew clinical commands ──

const ROOM_PATTERN = /(?:מיטה|חדר|מטה|bed)\s*(\d{1,3}(?:[/\\]\d)?)/i;
const TEMP_PATTERN = /(?:חום|טמפרטורה|temp)\s*([\d]{2}[.,]?\d?)/i;
const GLUCOSE_PATTERN = /(?:סוכר|גלוקוז|sugar|glucose)\s*(\d{2,3})/i;
const BP_PATTERN = /(?:לחץ\s*(?:דם)?|BP)\s*(\d{2,3})[/\\](\d{2,3})/i;
const URGENCY_STAT = /\b(?:סטט|stat|מיידי|דחוף\s*מאוד|חירום)\b/i;
const URGENCY_URGENT = /\b(?:דחוף|urgent|מהר)\b/i;

const KEYWORD_MAP: Array<{ pattern: RegExp; task: string }> = [
  { pattern: /\bנפילה\b/i, task: "נפל/ה — בדיקה + תיעוד" },
  { pattern: /\bכאב(?:ים)?\b/i, task: "תלונת כאב — הערכה + טיפול" },
  { pattern: /\bעירוי\b/i, task: "בדוק עירוי" },
  { pattern: /\bדם\b/i, task: "בדיקת דם" },
  { pattern: /\bצילום\b/i, task: "צילום" },
  { pattern: /\bא\.?ק\.?ג\.?\b/i, task: "ECG" },
  { pattern: /\bקטטר\b/i, task: "בדיקת קטטר" },
  { pattern: /\bחמצן\b/i, task: "בדוק חמצן / סטורציה" },
  { pattern: /\bהקאה\b/i, task: "הקאות — הערכה" },
  { pattern: /\bשלשול\b/i, task: "שלשול — הערכה" },
  { pattern: /\bקוצר\s*נשימה\b/i, task: "קוצר נשימה — הערכה דחופה" },
  { pattern: /\bחוסר\s*הכרה\b/i, task: "שינוי בהכרה — הערכה דחופה" },
  { pattern: /\bדופק\b/i, task: "בדוק דופק" },
];

function parseCommand(transcript: string): VoiceParsedCommand {
  let room: string | null = null;
  let urgency: VoiceParsedCommand["urgency"] = "routine";
  const taskParts: string[] = [];
  let confidence = 0;

  const roomMatch = transcript.match(ROOM_PATTERN);
  if (roomMatch) {
    room = roomMatch[1];
    confidence += 0.3;
  }

  if (URGENCY_STAT.test(transcript)) {
    urgency = "stat";
    confidence += 0.1;
  } else if (URGENCY_URGENT.test(transcript)) {
    urgency = "urgent";
    confidence += 0.1;
  }

  const tempMatch = transcript.match(TEMP_PATTERN);
  if (tempMatch) {
    const temp = tempMatch[1].replace(",", ".");
    taskParts.push(`חום ${temp}°`);
    confidence += 0.3;
    const tempVal = parseFloat(temp);
    if (!isNaN(tempVal) && tempVal >= 38.0 && urgency === "routine") urgency = "urgent";
  }

  const glucoseMatch = transcript.match(GLUCOSE_PATTERN);
  if (glucoseMatch) {
    taskParts.push(`סוכר ${glucoseMatch[1]}`);
    confidence += 0.3;
    const val = parseInt(glucoseMatch[1]);
    if (!isNaN(val) && (val < 70 || val > 400) && urgency === "routine") urgency = "stat";
  }

  const bpMatch = transcript.match(BP_PATTERN);
  if (bpMatch) {
    taskParts.push(`לחץ דם ${bpMatch[1]}/${bpMatch[2]}`);
    confidence += 0.3;
    const sys = parseInt(bpMatch[1]);
    if (!isNaN(sys) && (sys < 90 || sys > 180) && urgency === "routine") urgency = "urgent";
  }

  for (const { pattern, task } of KEYWORD_MAP) {
    if (pattern.test(transcript)) {
      taskParts.push(task);
      confidence += 0.2;
      break;
    }
  }

  if (taskParts.length === 0) {
    let cleaned = transcript
      .replace(ROOM_PATTERN, "")
      .replace(URGENCY_STAT, "")
      .replace(URGENCY_URGENT, "")
      .trim();
    if (cleaned) {
      taskParts.push(cleaned);
      confidence += 0.1;
    }
  }

  return {
    room,
    taskText: taskParts.join(" · ") || transcript,
    urgency,
    rawTranscript: transcript,
    confidence: Math.min(confidence, 1),
  };
}

export function VoiceButton({ onResult, onStructuredResult, structured = false }: VoiceInputProps) {
  const [listening, setListening] = useState(false);
  const [lastParsed, setLastParsed] = useState<VoiceParsedCommand | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const supported = useMemo(
    () => typeof window !== "undefined" && getSpeechRecognition() !== null,
    [],
  );

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  useEffect(() => {
    return () => { recognitionRef.current?.abort(); };
  }, []);

  const start = useCallback(() => {
    const SR = getSpeechRecognition();
    if (!SR) return;

    const recognition = new SR();
    recognition.lang = "he-IL";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript;
      if (!transcript) return;

      if (structured && onStructuredResult) {
        const parsed = parseCommand(transcript);
        setLastParsed(parsed);
        onStructuredResult(parsed);
      } else {
        onResult(transcript);
      }
      setListening(false);
    };

    recognition.onerror = () => { setListening(false); };
    recognition.onend = () => { setListening(false); };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
    setLastParsed(null);
  }, [onResult, onStructuredResult, structured]);

  if (!supported) return null;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={listening ? stop : start}
        className={[
          "px-3 py-2 rounded-xl text-sm transition-colors flex items-center gap-1.5",
          listening
            ? "bg-red-600 text-white animate-pulse"
            : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600",
        ].join(" ")}
        title={listening ? "מקליט... לחץ להפסקה" : structured ? "פקודה קולית מובנית" : "הקלט משימה בקול"}
        aria-label={listening ? "הפסק הקלטה" : "הקלט משימה בקול"}
      >
        🎤
        {listening && <span className="text-xs">מקליט...</span>}
      </button>

      {structured && lastParsed && !listening && (
        <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
          {lastParsed.room && (
            <span className="font-mono bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1 rounded">
              🛏️ {lastParsed.room}
            </span>
          )}
          <span className="truncate max-w-[150px]">{lastParsed.taskText}</span>
          <span className={`px-1 rounded text-[10px] font-bold ${
            lastParsed.urgency === "stat" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" :
            lastParsed.urgency === "urgent" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" :
            "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
          }`}>
            {lastParsed.urgency === "stat" ? "סטט" : lastParsed.urgency === "urgent" ? "דחוף" : "רגיל"}
          </span>
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { usePatientsDispatch } from "../context/PatientsContext";
import { Scanner } from "./Scanner";

type InputMode = "closed" | "choose" | "scan" | "text";

const PLACEHOLDER = `הדביקו רשימת חולים כאן, לדוגמה:

צד א
101 כהן יוסף 72 דלקת ריאות DNR | משתחרר היום
102 לוי שרה 65 אי ספיקת לב NPO | א.ק.ג דחוף`;

export function InputArea() {
  const [mode, setMode] = useState<InputMode>("choose");
  const [text, setText] = useState("");
  const dispatch = usePatientsDispatch();

  function handleImport(importText?: string) {
    const t = importText ?? text;
    if (!t.trim()) return;
    dispatch({ type: "IMPORT_TEXT", text: t });
    setText("");
    setMode("closed");
  }

  function handleClear() {
    dispatch({ type: "CLEAR_ALL" });
    setText("");
    setMode("choose");
  }

  // --- Collapsed bar ---
  if (mode === "closed") {
    return (
      <div className="flex gap-2 p-3">
        <button
          onClick={() => setMode("choose")}
          className="flex-1 py-3 bg-blue-600 text-white rounded-xl text-sm font-medium active:bg-blue-700 active:scale-[0.98] transition-transform"
        >
          + הוסף חולים
        </button>
        <button
          onClick={handleClear}
          className="py-3 px-4 bg-red-50 text-red-600 rounded-xl text-sm font-medium active:bg-red-100"
        >
          נקה
        </button>
      </div>
    );
  }

  // --- Choose mode: scan or type ---
  if (mode === "choose") {
    return (
      <div className="p-4 space-y-3">
        <p className="text-center text-gray-500 text-sm">איך להזין חולים?</p>
        <button
          onClick={() => setMode("scan")}
          className="flex items-center justify-center gap-3 w-full py-5 bg-emerald-600 text-white rounded-xl text-lg font-medium active:bg-emerald-700 active:scale-[0.98] transition-transform"
        >
          <CameraIcon />
          צלם דף תורן
        </button>
        <button
          onClick={() => setMode("text")}
          className="flex items-center justify-center gap-3 w-full py-4 bg-gray-100 text-gray-700 rounded-xl text-base font-medium active:bg-gray-200 active:scale-[0.98] transition-transform"
        >
          <TextIcon />
          הקלד / הדבק טקסט
        </button>
      </div>
    );
  }

  // --- Scan mode ---
  if (mode === "scan") {
    return (
      <div className="p-4">
        <Scanner
          onTextExtracted={(t) => handleImport(t)}
          onCancel={() => setMode("choose")}
        />
      </div>
    );
  }

  // --- Text mode ---
  return (
    <div className="p-4 space-y-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={PLACEHOLDER}
        dir="auto"
        rows={8}
        autoFocus
        style={{ unicodeBidi: "plaintext" }}
        className="w-full p-3 border border-gray-300 rounded-xl bg-white text-gray-900 placeholder:text-gray-400 text-base leading-relaxed resize-y focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none whitespace-pre-wrap break-words"
      />
      <button
        onClick={() => handleImport()}
        disabled={!text.trim()}
        className="w-full py-4 bg-blue-600 text-white rounded-xl text-lg font-medium active:bg-blue-700 active:scale-[0.98] transition-transform disabled:opacity-40 disabled:pointer-events-none"
      >
        ייבוא רשימה
      </button>
      <button
        onClick={() => setMode("choose")}
        className="w-full py-3 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium active:bg-gray-200"
      >
        חזור
      </button>
    </div>
  );
}

function CameraIcon() {
  return (
    <svg width={28} height={28} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

function TextIcon() {
  return (
    <svg width={22} height={22} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 113 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

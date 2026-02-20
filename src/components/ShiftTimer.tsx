import { useState, useEffect } from "react";
import { safeGetItem, safeSetItem } from "../utils/storage";

const SHIFT_START_KEY = "toranot_shift_start";

function getShiftStart(): number {
  const stored = safeGetItem(SHIFT_START_KEY);
  if (stored) {
    const parsed = parseInt(stored, 10);
    if (!isNaN(parsed)) return parsed;
  }
  const now = Date.now();
  safeSetItem(SHIFT_START_KEY, String(now));
  return now;
}

export function resetShiftTimer() {
  safeSetItem(SHIFT_START_KEY, String(Date.now()));
}

function formatElapsed(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

export function ShiftTimer() {
  const [start] = useState(getShiftStart);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000); // update every minute
    return () => clearInterval(id);
  }, []);

  const elapsed = now - start;
  const hours = elapsed / 3600000;

  let colorClass = "text-slate-300";
  let flash = false;
  if (hours >= 26) {
    colorClass = "text-red-400";
    flash = true;
  } else if (hours >= 24) {
    colorClass = "text-amber-400";
  }

  return (
    <button
      onClick={() => {
        if (confirm("לאפס טיימר משמרת?")) {
          resetShiftTimer();
          setNow(Date.now());
        }
      }}
      className={`text-xs font-mono tabular-nums px-2 py-1 rounded-lg border border-slate-600 ${colorClass} ${flash ? "animate-pulse" : ""}`}
      title={`זמן משמרת: ${formatElapsed(elapsed)}\nלחץ לאיפוס`}
    >
      ⏱ {formatElapsed(elapsed)}
    </button>
  );
}

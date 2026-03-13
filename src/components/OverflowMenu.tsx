import { useState, useRef, useCallback } from "react";
import { usePatientsState, usePatientsDispatch } from "../context/PatientsContext";
import { CloudAuthPanel } from "./CloudAuthPanel";
import { supabase } from "../cloudSync";
import { safeGetItem, safeSetItem, safeRemoveItem } from "../utils/storage";
import { ConfirmModal, type ConfirmDialog } from "../App";
import { resetShiftTimer } from "./ShiftTimer";

export type OverflowModal = "history" | "qrsync" | "capture" | "morning" | "ivprotocols" | "handoff_cloud" | "shared_shift" | "debug_console";

export function OverflowMenu({ onOpenModal }: { onOpenModal: (m: OverflowModal) => void }) {
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<ConfirmDialog>({ type: "none" });
  const { darkMode, showTomorrow, scanMode, patients } = usePatientsState();
  const dispatch = usePatientsDispatch();

  const openArchiveDialog = (mode: "archive" | "end") => {
    setOpen(false);
    const now = new Date();
    const date = now.toLocaleDateString("he-IL");
    const hour = now.getHours();
    const shiftType = hour >= 7 && hour < 15 ? "בוקר" : hour >= 15 && hour < 23 ? "ערב" : "לילה";
    const label = `${date} — ${shiftType}`;

    // Collect incomplete stat/urgent tasks
    const incompleteTasks = patients.flatMap((p) =>
      [...p.tasks, ...p.generatedTasks.filter(t => !t.dismissed)]
        .filter((t) => !t.done && (t.urgency === "stat" || t.urgency === "urgent"))
        .map((t) => ({ name: p.name ?? "?", room: p.room ?? null, task: t.text })),
    );

    // Patients with zero tasks (possibly forgotten)
    const patientsNoTasks = patients
      .filter((p) => [...p.tasks, ...p.generatedTasks.filter(t => !t.dismissed)].length === 0)
      .map((p) => ({ name: p.name ?? "?", room: p.room ?? null }));

    // Abnormal labs without a follow-up task mentioning that lab
    const abnormalLabs: Array<{ name: string; room: string | null; lab: string }> = [];
    for (const p of patients) {
      for (const lab of p.labs ?? []) {
        const val = lab.value;
        if (isNaN(val)) continue;
        const abnormal =
          (lab.label === "K" && (val < 3.0 || val > 5.5)) ||
          (lab.label === "Na" && (val < 130 || val > 150)) ||
          (lab.label === "Cr" && val > 1.5) ||
          (lab.label === "Hb" && val < 8) ||
          (lab.label === "PLT" && val < 50) ||
          (lab.label === "WBC" && val > 20) ||
          (lab.label === "INR" && val > 3) ||
          (lab.label === "glucose" && (val < 70 || val > 400)) ||
          (lab.label === "Lac" && val > 4) ||
          (lab.label === "pH" && (val < 7.25 || val > 7.55));
        if (abnormal) {
          const allTasks = [...p.tasks, ...p.generatedTasks.filter(t => !t.dismissed)];
          const hasFollowUp = allTasks.some((t) => !t.done && t.text.toLowerCase().includes(lab.label.toLowerCase()));
          if (!hasFollowUp) {
            abnormalLabs.push({ name: p.name ?? "?", room: p.room ?? null, lab: `${lab.label}: ${val}` });
          }
        }
      }
    }

    const openStatCount = incompleteTasks.filter((t) =>
      patients.some((p) =>
        [...p.tasks, ...p.generatedTasks.filter(t => !t.dismissed)].some((pt) => pt.text === t.task && pt.urgency === "stat" && !pt.done)
      )
    ).length;

    setDialog({ type: "archive", mode, label, incompleteTasks, patientsNoTasks, abnormalLabs, openStatCount });
  };

  const handleArchiveClick = () => openArchiveDialog("archive");
  const handleEndShiftClick = () => openArchiveDialog("end");

  // ── Start New Shift ──
  const handleStartNewShift = useCallback(() => {
    setOpen(false);
    setDialog({
      type: "archive",
      mode: "end",
      label: (() => {
        const now = new Date();
        const date = now.toLocaleDateString("he-IL");
        const hour = now.getHours();
        const shiftType = hour >= 7 && hour < 15 ? "בוקר" : hour >= 15 && hour < 23 ? "ערב" : "לילה";
        return `${date} — ${shiftType}`;
      })(),
      incompleteTasks: patients.flatMap((p) =>
        [...p.tasks, ...p.generatedTasks.filter(t => !t.dismissed)]
          .filter((t) => !t.done && (t.urgency === "stat" || t.urgency === "urgent"))
          .map((t) => ({ name: p.name ?? "?", room: p.room ?? null, task: t.text })),
      ),
      patientsNoTasks: patients
        .filter((p) => [...p.tasks, ...p.generatedTasks.filter(t => !t.dismissed)].length === 0)
        .map((p) => ({ name: p.name ?? "?", room: p.room ?? null })),
      abnormalLabs: [],
      openStatCount: patients.flatMap((p) =>
        [...p.tasks, ...p.generatedTasks.filter(t => !t.dismissed)]
          .filter((t) => !t.done && t.urgency === "stat"),
      ).length,
    });
  }, [patients]);

  // ── Clear stale cache & update ──
  const [cacheCleared, setCacheCleared] = useState(false);
  const handleClearCache = useCallback(async () => {
    setOpen(false);
    try {
      // Unregister stale service workers
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          await reg.unregister();
        }
      }
      // Clear all caches
      if ("caches" in window) {
        const names = await caches.keys();
        for (const name of names) {
          await caches.delete(name);
        }
      }
      setCacheCleared(true);
      setTimeout(() => setCacheCleared(false), 3000);
      // Reload to fetch fresh assets
      setTimeout(() => window.location.reload(), 500);
    } catch (err) {
      console.error("[Toranot] Cache clear failed:", err);
    }
  }, []);

  const [shareCopied, setShareCopied] = useState(false);

  const handleShareClick = () => {
    setOpen(false);
    // Share base URL only — never include API keys in shared URLs
    const url = window.location.origin + window.location.pathname;

    if (navigator.share) {
      navigator.share({ title: "תורנות — ניהול משמרת", url }).catch(() => {
        navigator.clipboard.writeText(url);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2000);
      });
    } else {
      navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    }
  };

  const handleClearClick = () => {
    setOpen(false);
    setDialog({ type: "clear" });
  };

  const handleConfirm = () => {
    if (dialog.type === "archive") {
      dispatch({ type: "ARCHIVE_SHIFT", label: dialog.label });
      console.info("[Toranot] Shift archived:", dialog.label);
      if (dialog.mode === "end") {
        dispatch({ type: "CLEAR_ALL" });
        // Reset the shift timer for the new shift
        resetShiftTimer();
      }
    } else if (dialog.type === "clear") {
      dispatch({ type: "CLEAR_ALL" });
    }
    setDialog({ type: "none" });
  };

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-200 active:bg-slate-700 transition-colors text-lg"
          aria-label="תפריט נוסף"
        >
          ···
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute left-0 top-full mt-1 z-50 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden min-w-[220px] max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>

              {/* ── Shift Management ── */}
              <div className="px-3 pt-2 pb-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider">משמרת</div>

              {/* Start New Shift — always visible */}
              <button
                onClick={handleStartNewShift}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-emerald-300 active:bg-slate-700 text-right font-semibold"
              >
                <span className="text-base">🆕</span>
                התחל משמרת חדשה
              </button>

              {/* Archive shift */}
              {patients.length > 0 && (
                <button
                  onClick={handleArchiveClick}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-200 active:bg-slate-700 border-t border-slate-700 text-right"
                >
                  <span className="text-base">💾</span>
                  שמור משמרת
                </button>
              )}
              {/* End shift (archive + clear) */}
              {patients.length > 0 && (
                <button
                  onClick={handleEndShiftClick}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-200 active:bg-slate-700 border-t border-slate-700 text-right"
                >
                  <span className="text-base">🏁</span>
                  סיום משמרת
                </button>
              )}
              {/* History */}
              <button
                onClick={() => { onOpenModal("history"); setOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-200 active:bg-slate-700 border-t border-slate-700 text-right"
              >
                <span className="text-base">📁</span>
                היסטוריית משמרות
              </button>

              {/* ── Tools ── */}
              <div className="px-3 pt-3 pb-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-t border-slate-600">כלים</div>

              {/* Quick capture */}
              <button
                onClick={() => { onOpenModal("capture"); setOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-200 active:bg-slate-700 text-right"
              >
                <span className="text-base">📲</span>
                קליטה מהירה
              </button>
              {/* Morning report */}
              <button
                onClick={() => { onOpenModal("morning"); setOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-200 active:bg-slate-700 border-t border-slate-700 text-right"
              >
                <span className="text-base">☀️</span>
                דוח בוקר
              </button>
              {/* IV Protocols */}
              <button
                onClick={() => { onOpenModal("ivprotocols"); setOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-amber-300 active:bg-slate-700 border-t border-slate-700 text-right"
              >
                <span className="text-base">💉</span>
                פרוטוקולי IV
              </button>

              {/* ── View Settings ── */}
              <div className="px-3 pt-3 pb-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-t border-slate-600">תצוגה</div>

              {/* Tomorrow toggle */}
              <button
                onClick={() => { dispatch({ type: "TOGGLE_SHOW_TOMORROW" }); setOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-200 active:bg-slate-700 text-right"
              >
                <span className="text-base">📅</span>
                {showTomorrow ? "הסתר משימות מחר" : "הצג משימות מחר"}
              </button>
              {/* Scan mode */}
              <button
                onClick={() => { dispatch({ type: "TOGGLE_SCAN_MODE" }); setOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-200 active:bg-slate-700 border-t border-slate-700 text-right"
              >
                <span className="text-base">{scanMode ? "📋" : "👁️"}</span>
                {scanMode ? "תצוגה מלאה" : "מצב סקירה"}
              </button>
              {/* Dark mode */}
              <button
                onClick={() => { dispatch({ type: "TOGGLE_DARK_MODE" }); setOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-200 active:bg-slate-700 border-t border-slate-700 text-right"
              >
                <span className="text-base">{darkMode ? "☀️" : "🌙"}</span>
                {darkMode ? "מצב יום" : "מצב לילה"}
              </button>

              {/* ── Sync & Share ── */}
              <div className="px-3 pt-3 pb-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-t border-slate-600">סנכרון ושיתוף</div>

              {/* Share link */}
              <button
                onClick={handleShareClick}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-200 active:bg-slate-700 text-right"
              >
                <span className="text-base">{shareCopied ? "✅" : "🔗"}</span>
                {shareCopied ? "הקישור הועתק!" : "שתף קישור"}
              </button>
              {/* QR Sync */}
              {patients.length > 0 && (
                <button
                  onClick={() => { onOpenModal("qrsync"); setOpen(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-200 active:bg-slate-700 border-t border-slate-700 text-right"
                >
                  <span className="text-base">📲</span>
                  סנכרון QR
                </button>
              )}
              {/* Cloud Handoff */}
              {supabase && (
                <>
                  <button
                    onClick={() => { onOpenModal("handoff_cloud"); setOpen(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-200 active:bg-slate-700 border-t border-slate-700 text-right"
                  >
                    <span className="text-base">☁️</span>
                    סנכרון ענן
                  </button>
                  <button
                    onClick={() => { onOpenModal("shared_shift"); setOpen(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-emerald-300 active:bg-slate-700 border-t border-slate-700 text-right"
                  >
                    <span className="text-base">🤝</span>
                    שתף עם צוות
                  </button>
                </>
              )}

              {/* ── System ── */}
              <div className="px-3 pt-3 pb-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-t border-slate-600">מערכת</div>

              {/* Debug console */}
              <button
                onClick={() => { onOpenModal("debug_console"); setOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-200 active:bg-slate-700 text-right"
              >
                <span className="text-base">🐛</span>
                יומן שגיאות
              </button>
              {/* Clear cache & update */}
              <button
                onClick={handleClearCache}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-200 active:bg-slate-700 border-t border-slate-700 text-right"
              >
                <span className="text-base">{cacheCleared ? "✅" : "🔄"}</span>
                {cacheCleared ? "מטמון נוקה — טוען מחדש..." : "נקה מטמון ועדכן"}
              </button>
              {/* Clear all patients */}
              {patients.length > 0 && (
                <button
                  onClick={handleClearClick}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-300 active:bg-red-900/30 border-t border-slate-700 text-right"
                >
                  <span className="text-base">🗑️</span>
                  מחק הכל
                </button>
              )}

              {/* API key + Cloud auth */}
              <ApiKeyPanel />
              <CloudAuthPanel />

              {/* Build stamp */}
              <div className="px-4 py-2 text-[10px] text-slate-500 border-t border-slate-700 select-text">
                build {__GIT_SHA__} · {new Date(__BUILD_TIME__).toLocaleString("en-GB")}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Inline confirm modal — rendered outside the overflow container so z-index works */}
      <ConfirmModal
        dialog={dialog}
        onConfirm={handleConfirm}
        onCancel={() => setDialog({ type: "none" })}
      />
    </>
  );
}


// ─── API Key Panel ─────────────────────────────────────────
const API_KEY_STORAGE = "toranot-anthropic-key";

function ApiKeyPanel() {
  const stored = safeGetItem(API_KEY_STORAGE) ?? "";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasKey = stored.startsWith("sk-ant-");
  const masked = hasKey ? "sk-ant-•••" + stored.slice(-6) : "";

  const handleEdit = () => {
    setDraft("");
    setEditing(true);
    setSaved(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleSave = () => {
    const key = draft.trim();
    if (key.startsWith("sk-ant-") || key === "") {
      if (key) {
        safeSetItem(API_KEY_STORAGE, key);
        // Also push to cloud user metadata so it persists across logins/devices
        if (supabase) {
          supabase.auth.updateUser({ data: { anthropic_api_key: key } }).catch(() => {});
        }
      } else {
        safeRemoveItem(API_KEY_STORAGE);
      }
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const handleClear = () => {
    safeRemoveItem(API_KEY_STORAGE);
    setEditing(false);
    setSaved(false);
  };

  return (
    <div className="px-4 py-3 border-t border-slate-700 text-right">
      <div className="text-[11px] text-slate-400 mb-1.5 flex items-center justify-between">
        <span>🤖 מפתח Claude API</span>
        {hasKey && !editing && (
          <span className="text-slate-500 font-mono">{masked}</span>
        )}
      </div>

      {editing ? (
        <div className="space-y-1.5">
          <input
            ref={inputRef}
            type="text"
            dir="ltr"
            placeholder="sk-ant-api03-..."
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-slate-900 border border-slate-600 text-slate-200 text-xs px-2.5 py-2 rounded-lg placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
          />
          <div className="flex gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); handleSave(); }}
              disabled={!draft.trim().startsWith("sk-ant-")}
              className="flex-1 bg-blue-600 disabled:bg-slate-600 text-white text-xs py-1.5 rounded-lg active:bg-blue-700"
            >
              שמור
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setEditing(false); }}
              className="text-slate-400 text-xs px-3 py-1.5 rounded-lg active:bg-slate-700"
            >
              ביטול
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); handleEdit(); }}
            className="flex-1 bg-slate-700 text-slate-200 text-xs py-1.5 rounded-lg active:bg-slate-600"
          >
            {hasKey ? (saved ? "✓ נשמר" : "החלף מפתח") : "הזן מפתח"}
          </button>
          {hasKey && (
            <button
              onClick={(e) => { e.stopPropagation(); handleClear(); }}
              className="text-red-400 text-xs px-3 py-1.5 rounded-lg active:bg-slate-700"
            >
              מחק
            </button>
          )}
        </div>
      )}
    </div>
  );
}

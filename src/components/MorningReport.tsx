import { useMemo, useCallback, useState } from "react";
import { usePatientsState } from "../context/PatientsContext";
import { buildPhlebotomyList, buildPhlebotomyText, TUBE_EMOJI, TUBE_LABEL, type TubeColour } from "../utils/phlebotomy";
import { useSimpleToast, SimpleToast } from "./SimpleConfirm";
import { getShiftStart } from "../utils/shiftTime";

function fmt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}
function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function MorningReport({ onClose }: { onClose: () => void }) {
  const { patients, events } = usePatientsState();
  const { toast, showToast } = useSimpleToast();
  const [tab, setTab] = useState<"report" | "phlebotomy">("report");

  const now = useMemo(() => Date.now(), []);
  const h24ago = useMemo(() => new Date(now - 24 * 60 * 60 * 1000).toISOString(), [now]);
  const shiftStart = useMemo(() => getShiftStart(), []);

  const admissions = useMemo(() =>
    events.filter(e => e.type === "ADMISSION" && e.at >= h24ago),
    [events, h24ago]
  );
  const moves = useMemo(() =>
    events.filter(e => e.type === "MOVE" && e.at >= h24ago),
    [events, h24ago]
  );
  const openUrgent = useMemo(() =>
    patients.flatMap(p =>
      [...p.tasks, ...p.generatedTasks.filter(t => !t.dismissed)]
        .filter(t => !t.done && (t.urgency === "stat" || t.urgency === "urgent"))
        .map(t => ({ task: t, patient: p }))
    ).sort((a, b) => (a.task.urgency === "stat" ? -1 : 1) - (b.task.urgency === "stat" ? -1 : 1)),
    [patients]
  );
  const unassignedTasks = useMemo(() =>
    events.filter(e => e.type === "TASK_CREATED" && !("patientId" in e && e.patientId)),
    [events]
  );
  const phlebList = useMemo(() => buildPhlebotomyList(patients), [patients]);

  // Patients acted on this shift: completed tasks, manual tasks added, notes, handover note.
  // Excludes new admissions (already shown above) and scanned-only patients (no action taken).
  const shiftStartISO = shiftStart.toISOString();
  const actedon = useMemo(() => {
    const admissionIds = new Set(
      events.filter(e => e.type === "ADMISSION" && e.at >= h24ago).map(e => e.patientId)
    );
    return patients.filter(p => {
      if (admissionIds.has(p.id)) return false; // already in admissions
      const allTasks = [...p.tasks, ...p.generatedTasks];
      const completedThisShift = allTasks.some(t => t.done && t.doneTime && t.doneTime >= shiftStartISO);
      const manualTaskAdded = p.tasks.some(t => t.source === "manual");
      const hasNote = (p.notes ?? []).length > 0;
      const hasHandover = !!p.handoverNote;
      return completedThisShift || manualTaskAdded || hasNote || hasHandover;
    });
  }, [patients, events, h24ago, shiftStartISO]);

  // ── Copy handlers ──────────────────────────────────────────────────────────
  const buildReport = useCallback((): string => {
    const lines: string[] = [];
    const dateStr = new Date().toLocaleDateString("he-IL");
    lines.push(`📋 דוח בוקר — ${dateStr}`);
    lines.push("");
    lines.push(`🏥 קבלות (24ש׳ אחרונות): ${admissions.length}`);
    admissions.forEach(e => {
      if (e.type !== "ADMISSION") return;
      lines.push(`  • ${e.patientName ?? "?"} | חדר ${e.room ?? "?"} — ${fmtDate(e.at)}`);
    });
    lines.push("");
    lines.push(`🔄 מעברים: ${moves.length}`);
    moves.forEach(e => {
      if (e.type !== "MOVE") return;
      lines.push(`  • ${e.patientName ?? "?"}: ${e.from ?? "?"} → ${e.to} — ${fmtDate(e.at)}`);
    });
    lines.push("");
    lines.push(`⚠️ משימות דחופות פתוחות: ${openUrgent.length}`);
    openUrgent.forEach(({ task, patient }) => {
      const badge = task.urgency === "stat" ? "🔴 STAT" : "🟡 דחוף";
      lines.push(`  • ${badge} ${patient.name ?? "?"} [${patient.room ?? "?"}] — ${task.text}`);
    });
    if (actedon.length > 0) {
      lines.push("");
      lines.push(`🩺 חולים שטיפלת בהם: ${actedon.length}`);
      actedon.forEach(p => {
        const doneTasks = [...p.tasks, ...p.generatedTasks].filter(t => t.done);
        const manualPending = p.tasks.filter(t => t.source === "manual" && !t.done);
        const notes = p.notes ?? [];
        lines.push(`  • חד׳ ${p.room ?? "?"} ${p.name ?? "?"} ${p.diagnosis ? `— ${p.diagnosis}` : ""}`);
        doneTasks.forEach(t => {
          const noteStr = t.note ? ` → ${t.note}` : "";
          lines.push(`    ✅ ${t.text}${noteStr}`);
        });
        manualPending.forEach(t => lines.push(`    ✏️ ${t.text}`));
        if (notes.length > 0) {
          lines.push(`    📝 הערות:`);
          notes.forEach(n => lines.push(`      ${n}`));
        }
        if (p.handoverNote) lines.push(`    📌 מסירה: ${p.handoverNote}`);
      });
    }
    if (unassignedTasks.length > 0) {
      lines.push("");
      lines.push(`📌 משימות לא משוייכות: ${unassignedTasks.length}`);
      unassignedTasks.slice(0, 10).forEach(e => {
        if (e.type !== "TASK_CREATED") return;
        lines.push(`  • ${e.text} — ${fmtDate(e.at)}`);
      });
    }
    return lines.join("\n");
  }, [admissions, moves, openUrgent, unassignedTasks, actedon]);

  const handleCopyReport = useCallback(() => {
    navigator.clipboard.writeText(buildReport())
      .then(() => showToast("✓ הועתק ללוח"))
      .catch(() => showToast("לא ניתן להעתיק", "error"));
  }, [buildReport, showToast]);

  const handleCopyPhlebotomy = useCallback(() => {
    navigator.clipboard.writeText(buildPhlebotomyText(phlebList))
      .then(() => showToast("✓ רשימת שלילות הועתקה"))
      .catch(() => showToast("לא ניתן להעתיק", "error"));
  }, [phlebList, showToast]);

  // ── Tube colour grouping for display ──────────────────────────────────────
  const byTube = useMemo(() => {
    const map = new Map<TubeColour, typeof phlebList>();
    for (const e of phlebList) {
      for (const tube of e.tubes) {
        const arr = map.get(tube) ?? [];
        arr.push(e);
        map.set(tube, arr);
      }
    }
    return map;
  }, [phlebList]);

  const tubeOrder: TubeColour[] = ["red", "purple", "blue", "green", "yellow", "black"];

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex flex-col items-center justify-end sm:justify-center px-4 pb-4 sm:pb-0">
      <div className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-700 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-slate-800 shrink-0">
          <div>
            <h2 className="font-bold text-white text-sm">☀️ דוח בוקר</h2>
            <p className="text-xs text-slate-400">{new Date().toLocaleDateString("he-IL")} — {patients.length} מטופלים</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={tab === "report" ? handleCopyReport : handleCopyPhlebotomy}
              className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-medium active:bg-blue-700"
            >
              📋 העתק
            </button>
            <button onClick={onClose} className="text-slate-300 text-xl min-w-[44px] min-h-[44px] flex items-center justify-center">×</button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 shrink-0 bg-gray-50 dark:bg-gray-800">
          <button
            onClick={() => setTab("report")}
            className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${tab === "report" ? "text-slate-900 dark:text-white border-b-2 border-blue-500" : "text-gray-500"}`}
          >
            📋 דוח משמרת
          </button>
          <button
            onClick={() => setTab("phlebotomy")}
            className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${tab === "phlebotomy" ? "text-slate-900 dark:text-white border-b-2 border-red-500" : "text-gray-500"}`}
          >
            💉 שלילות בוקר {phlebList.length > 0 && <span className="bg-red-500 text-white rounded-full px-1.5 ml-1">{phlebList.length}</span>}
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          {tab === "report" ? (
            <>
              {/* Admissions */}
              <Section title={`🏥 קבלות — 24 שעות אחרונות (${admissions.length})`} color="blue">
                {admissions.length === 0 ? (
                  <p className="text-xs text-gray-400">אין קבלות</p>
                ) : admissions.map(e => {
                  if (e.type !== "ADMISSION") return null;
                  return (
                    <div key={e.id} className="text-xs flex gap-2 items-center">
                      <span className="text-gray-400 font-mono tabular-nums shrink-0">{fmt(e.at)}</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">{e.patientName ?? "?"}</span>
                      {e.room && <span className="text-blue-600 dark:text-blue-400 font-mono">חד׳ {e.room}</span>}
                    </div>
                  );
                })}
              </Section>

              {/* Moves */}
              <Section title={`🔄 מעברים (${moves.length})`} color="purple">
                {moves.length === 0 ? (
                  <p className="text-xs text-gray-400">אין מעברים</p>
                ) : moves.map(e => {
                  if (e.type !== "MOVE") return null;
                  return (
                    <div key={e.id} className="text-xs flex gap-2 items-center">
                      <span className="text-gray-400 font-mono tabular-nums shrink-0">{fmt(e.at)}</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">{e.patientName ?? "?"}</span>
                      <span className="text-gray-500">{e.from ?? "?"} → {e.to}</span>
                    </div>
                  );
                })}
              </Section>

              {/* Open urgent tasks */}
              <Section title={`⚠️ משימות פתוחות דחופות (${openUrgent.length})`} color="red">
                {openUrgent.length === 0 ? (
                  <p className="text-xs text-gray-400">✅ אין משימות דחופות פתוחות</p>
                ) : openUrgent.map(({ task, patient }) => (
                  <div key={task.id} className="text-xs flex gap-2 items-start">
                    <span className={`shrink-0 font-bold ${task.urgency === "stat" ? "text-red-600" : "text-amber-600"}`}>
                      {task.urgency === "stat" ? "STAT" : "דחוף"}
                    </span>
                    <span className="font-mono text-blue-600 dark:text-blue-400 shrink-0">{patient.room ?? "?"}</span>
                    <span className="text-gray-900 dark:text-gray-100 truncate">{patient.name ?? "?"}</span>
                    <span className="text-gray-500 truncate">— {task.text}</span>
                  </div>
                ))}
              </Section>

              {/* Patients acted on */}
              {actedon.length > 0 && (
                <Section title={`🩺 חולים שטיפלת בהם (${actedon.length})`} color="green">
                  {actedon.map(p => {
                    const doneTasks = [...p.tasks, ...p.generatedTasks].filter(t => t.done);
                    const manualTasks = p.tasks.filter(t => t.source === "manual" && !t.done);
                    const notes = p.notes ?? [];
                    return (
                      <div key={p.id} className="text-xs space-y-1.5 pb-3 border-b border-green-200/30 dark:border-green-700/30 last:border-0 last:pb-0">
                        {/* Patient header */}
                        <div className="flex gap-2 items-center flex-wrap">
                          <span className="font-mono text-blue-600 dark:text-blue-400 shrink-0">חד׳ {p.room ?? "?"}</span>
                          <span className="font-medium text-gray-900 dark:text-gray-100">{p.name ?? "?"}</span>
                          {p.age && <span className="text-gray-400">({p.age})</span>}
                          {p.diagnosis && <span className="text-gray-500 truncate">— {p.diagnosis}</span>}
                        </div>
                        {/* Summary badges */}
                        <div className="flex gap-1.5 flex-wrap">
                          {doneTasks.length > 0 && (
                            <span className="inline-flex items-center gap-1 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 rounded-full px-2 py-0.5 text-[10px] font-medium">
                              ✅ {doneTasks.length} בוצעו
                            </span>
                          )}
                          {manualTasks.length > 0 && (
                            <span className="inline-flex items-center gap-1 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded-full px-2 py-0.5 text-[10px] font-medium">
                              ✏️ משימה ידנית
                            </span>
                          )}
                          {notes.length > 0 && (
                            <span className="inline-flex items-center gap-1 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded-full px-2 py-0.5 text-[10px] font-medium">
                              📝 הערות
                            </span>
                          )}
                          {p.handoverNote && (
                            <span className="inline-flex items-center gap-1 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-full px-2 py-0.5 text-[10px] font-medium">
                              📌 מסירה
                            </span>
                          )}
                        </div>
                        {/* Detail: completed tasks — show WHAT was done */}
                        {doneTasks.length > 0 && (
                          <div className="pr-2 space-y-0.5">
                            {doneTasks.map(t => (
                              <div key={t.id} className="flex items-start gap-1 text-[11px]">
                                <span className="text-green-500 shrink-0">✓</span>
                                <span className="text-gray-700 dark:text-gray-300">{t.text}</span>
                                {t.note && <span className="text-green-600 dark:text-green-400 font-medium">→ {t.note}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Detail: pending manual tasks */}
                        {manualTasks.length > 0 && (
                          <div className="pr-2 space-y-0.5">
                            {manualTasks.map(t => (
                              <div key={t.id} className="flex items-start gap-1 text-[11px]">
                                <span className="text-amber-500 shrink-0">✏️</span>
                                <span className="text-gray-700 dark:text-gray-300">{t.text}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Detail: הערות — full text, prominent */}
                        {notes.length > 0 && (
                          <div className="bg-amber-50/50 dark:bg-amber-900/20 border border-amber-200/50 dark:border-amber-700/30 rounded-lg px-2 py-1.5 space-y-0.5">
                            {notes.map((n, i) => (
                              <div key={i} className="flex items-start gap-1 text-[11px]">
                                <span className="text-amber-500 shrink-0">📝</span>
                                <span className="text-amber-800 dark:text-amber-200">{n}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Detail: handover note */}
                        {p.handoverNote && (
                          <div className="bg-blue-50/50 dark:bg-blue-900/20 border border-blue-200/50 dark:border-blue-700/30 rounded-lg px-2 py-1.5">
                            <p className="text-blue-800 dark:text-blue-200 text-[11px]">📌 {p.handoverNote}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </Section>
              )}

              {/* Unassigned tasks */}
              {unassignedTasks.length > 0 && (
                <Section title={`📌 קריאות לא משוייכות (${unassignedTasks.length})`} color="amber">
                  {unassignedTasks.slice(0, 15).map(e => {
                    if (e.type !== "TASK_CREATED") return null;
                    return (
                      <div key={e.id} className="text-xs flex gap-2 items-center">
                        <span className="text-gray-400 font-mono tabular-nums shrink-0">{fmt(e.at)}</span>
                        <span className="text-gray-900 dark:text-gray-100 truncate">{e.text}</span>
                      </div>
                    );
                  })}
                </Section>
              )}
            </>
          ) : (
            /* ── Phlebotomy tab ── */
            <>
              {phlebList.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-3xl mb-2">✅</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">אין בדיקות דם מתוכננות לבוקר</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {phlebList.length} חולים · {phlebList.filter(e => e.isUrgent).length} דחוף
                    </p>
                  </div>
                  {tubeOrder.map(tube => {
                    const pts = byTube.get(tube);
                    if (!pts || pts.length === 0) return null;
                    return (
                      <div key={tube} className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                        <div className="bg-gray-100 dark:bg-gray-800 px-3 py-2 flex items-center gap-2">
                          <span className="text-base">{TUBE_EMOJI[tube]}</span>
                          <span className="text-xs font-bold text-gray-700 dark:text-gray-300">{TUBE_LABEL[tube]}</span>
                          <span className="mr-auto text-xs text-gray-400">{pts.length}</span>
                        </div>
                        <div className="divide-y divide-gray-100 dark:divide-gray-800">
                          {pts.map(e => (
                            <div key={e.patientId + tube} className="px-3 py-2 flex items-center gap-2">
                              <span className="text-xs font-mono text-blue-600 dark:text-blue-400 shrink-0 w-10">{e.room ?? "?"}</span>
                              <span className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">{e.patientName}</span>
                              {e.isUrgent && <span className="mr-auto text-xs text-red-500 font-bold shrink-0">⚡ דחוף</span>}
                              <span className="text-xs text-gray-400 truncate mr-auto" title={e.tests.join(", ")}>
                                {e.tests.slice(0, 3).join(", ")}{e.tests.length > 3 ? ` +${e.tests.length - 3}` : ""}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </>
          )}
        </div>
      </div>
      <SimpleToast state={toast} />
    </div>
  );
}

function Section({ title, color, children }: { title: string; color: "blue" | "red" | "amber" | "purple" | "green"; children: React.ReactNode }) {
  const colors = {
    blue: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700",
    red: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700",
    amber: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700",
    purple: "bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-700",
    green: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700",
  };
  return (
    <div className={`rounded-xl border p-3 space-y-1.5 ${colors[color]}`}>
      <p className="text-xs font-bold text-gray-700 dark:text-gray-300">{title}</p>
      {children}
    </div>
  );
}

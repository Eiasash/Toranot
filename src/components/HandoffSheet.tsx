import { useMemo, useState } from "react";
import { usePatientsState } from "../context/PatientsContext";
import { SECTION_LABEL, type PatientEntry, type Task } from "../types";
import { formatLabsForHandoff } from "./LabChart";
import {
  checkDrugInteractions,
  checkRenalDoseWarnings,
  checkBeersCriteria,
} from "../engine/drugSafety";
import { calculateLabDeltas } from "../engine/labDelta";

// ─── Text generation (copy/WhatsApp — unchanged) ────────────────────────────

function urgencyLabel(u: Task["urgency"]) {
  return u === "stat" ? "🔴" : u === "urgent" ? "🟡" : u === "extra" ? "🟣" : "";
}

function formatPatient(p: PatientEntry): string {
  const allTasks = [...p.tasks, ...p.generatedTasks];
  const pending = allTasks.filter((t) => !t.done);
  const done = allTasks.filter((t) => t.done);
  const notes = p.notes ?? [];
  const lines: string[] = [];
  const header = [p.room, p.name, p.age ? `(${p.age})` : null].filter(Boolean).join(" ");
  const dischargedMarker = p.discharged ? " 🏠 שוחרר" : "";
  lines.push(`■ ${header}${dischargedMarker}`);
  const severity = [p.diagnosis, ...p.flags].filter(Boolean).join(" | ");
  if (severity) lines.push(`  אבחנה: ${severity}`);
  if (p.status.length > 0) lines.push(`  מצב: ${p.status.join(", ")}`);
  const labSummary = formatLabsForHandoff(p);
  if (labSummary) lines.push(`  🔬 ${labSummary}`);
  if (pending.length > 0) {
    lines.push(`  לביצוע:`);
    for (const t of pending) {
      const flag = urgencyLabel(t.urgency);
      const due = t.dueAt ? ` ⏰${new Date(t.dueAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}` : "";
      lines.push(`    ${flag} ${t.text}${due}`.trimEnd());
    }
  }
  if (done.length > 0) {
    lines.push(`  בוצע (${done.length}):`);
    for (const t of done) {
      const noteStr = t.note ? ` → ${t.note}` : "";
      lines.push(`    ✅ ${t.text}${noteStr}`);
    }
  }
  if (notes.length > 0) lines.push(`  הערות: ${notes.join(", ")}`);
  if (p.tomorrowNotes.length > 0) lines.push(`  מחר: ${p.tomorrowNotes.join(", ")}`);
  if (p.handoverNote) lines.push(`  📌 ${p.handoverNote}`);
  const interactions = checkDrugInteractions(p);
  const renalWarnings = checkRenalDoseWarnings(p);
  const labDeltas = calculateLabDeltas(p);
  const beers = checkBeersCriteria(p);
  const critInteractions = interactions.filter(i => i.severity === "critical");
  const critRenal = renalWarnings.filter(w => w.severity === "critical");
  const critLabs = labDeltas.filter(d => d.severity === "critical");
  const critBeers = beers.filter(b => b.severity === "avoid");
  const totalCrit = critInteractions.length + critRenal.length + critLabs.length + critBeers.length;
  if (totalCrit > 0) {
    lines.push(`  ⚠️ התראות בטיחות:`);
    for (const ix of critInteractions) lines.push(`    🔴 ${ix.risk}: ${ix.detail}`);
    for (const w of critRenal) lines.push(`    🔴 ${w.drug} — ${w.adjustment}`);
    for (const d of critLabs) {
      const arrow = d.direction === "up" ? "↑" : d.direction === "down" ? "↓" : "→";
      lines.push(`    🔴 ${d.label}: ${d.baseline}${arrow}${d.latest}`);
    }
    for (const b of critBeers) lines.push(`    🚫 Beers: ${b.drug} — ${b.recommendation}`);
  }
  return lines.join("\n");
}

import { isOnCallTime, getShiftStart } from "../utils/shiftTime";

function isOncallRelevant(p: PatientEntry, shiftStart: Date): boolean {
  if (p.scannedAt && isOnCallTime(new Date(p.scannedAt)) && new Date(p.scannedAt) >= shiftStart) return true;
  if (p.tasks.some(t => t.source !== "generated")) return true;
  if ([...p.tasks, ...p.generatedTasks].some(t => t.done)) return true;
  if (p.handoverNote) return true;
  return false;
}

function buildTextHandoff(patients: PatientEntry[], filteredPatients: PatientEntry[], sections: Map<string, PatientEntry[]>, oncallOnly: boolean, shiftStart: Date): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString("he-IL");
  const timeStr = now.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  const newAdmissions = patients.filter(p => p.scannedAt && isOnCallTime(new Date(p.scannedAt)) && new Date(p.scannedAt) >= shiftStart);
  const lines: string[] = [
    `📋 ${oncallOnly ? "מסירת תורן" : "סיכום משמרת"} — ${dateStr} ${timeStr}`,
    `${"─".repeat(35)}`,
  ];
  if (newAdmissions.length > 0) {
    lines.push("");
    const shiftDateStr = shiftStart.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });
    lines.push(`🆕 קבלות תורן ${shiftDateStr} (${newAdmissions.length}):`);
    for (const p of newAdmissions) {
      const header = [p.room, p.name, p.age ? `(${p.age})` : null].filter(Boolean).join(" ");
      const dx = p.diagnosis ? ` — ${p.diagnosis}` : "";
      const st = p.status.length > 0 ? ` [${p.status.join("/")}]` : "";
      const admTime = p.scannedAt ? ` 🕐${new Date(p.scannedAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}` : "";
      lines.push(`  • ${header}${dx}${st}${admTime}`);
    }
    lines.push(`${"─".repeat(35)}`);
  }
  for (const [section, pts] of sections) {
    lines.push("");
    lines.push(`▸ ${SECTION_LABEL[section as keyof typeof SECTION_LABEL] ?? section} (${pts.length})`);
    lines.push("");
    for (const p of pts) { lines.push(formatPatient(p)); lines.push(""); }
  }
  const allTasks = filteredPatients.flatMap((p) => [...p.tasks, ...p.generatedTasks]);
  const totalDone = allTasks.filter((t) => t.done).length;
  const totalPending = allTasks.filter((t) => !t.done).length;
  const statPending = allTasks.filter((t) => !t.done && t.urgency === "stat").length;
  const statDone = allTasks.filter((t) => t.done && t.urgency === "stat").length;
  const urgentDone = allTasks.filter((t) => t.done && t.urgency === "urgent").length;
  let totalSafetyAlerts = 0, patientsWithAlerts = 0;
  for (const p of filteredPatients) {
    const count = checkDrugInteractions(p).length + checkRenalDoseWarnings(p).length + calculateLabDeltas(p).length + checkBeersCriteria(p).length;
    totalSafetyAlerts += count;
    if (count > 0) patientsWithAlerts++;
  }
  const patientsWithLabs = filteredPatients.filter(p => (p.labs ?? []).length > 0).length;
  lines.push(`${"─".repeat(35)}`);
  lines.push(`📊 סיכום משמרת:`);
  lines.push(`  חולים: ${filteredPatients.length} | ✅ ${totalDone} בוצעו | ⏳ ${totalPending} ממתינים`);
  if (statDone > 0 || statPending > 0) lines.push(`  🔴 סטט: ${statDone} בוצעו, ${statPending} ממתינים | 🟡 דחוף: ${urgentDone} בוצעו`);
  if (totalSafetyAlerts > 0) lines.push(`  ⚠️ ${totalSafetyAlerts} התראות בטיחות ב-${patientsWithAlerts} חולים`);
  if (patientsWithLabs > 0) lines.push(`  🔬 ${patientsWithLabs} חולים עם מעבדות מעודכנות`);
  return lines.join("\n");
}

// ─── Visual card renderer ───────────────────────────────────────────────────

function urgencyColor(u: Task["urgency"]) {
  if (u === "stat") return "bg-red-900/40 border-red-600 text-red-200";
  if (u === "urgent") return "bg-yellow-900/30 border-yellow-600 text-yellow-200";
  if (u === "extra") return "bg-purple-900/30 border-purple-600 text-purple-200";
  return "bg-gray-800 border-gray-700 text-gray-300";
}

function urgencyDot(u: Task["urgency"]) {
  if (u === "stat") return <span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1.5 flex-shrink-0" />;
  if (u === "urgent") return <span className="inline-block w-2 h-2 rounded-full bg-yellow-400 mr-1.5 flex-shrink-0" />;
  if (u === "extra") return <span className="inline-block w-2 h-2 rounded-full bg-purple-400 mr-1.5 flex-shrink-0" />;
  return <span className="inline-block w-2 h-2 rounded-full bg-gray-500 mr-1.5 flex-shrink-0" />;
}

function PatientCard({ p, isNew }: { p: PatientEntry; isNew: boolean }) {
  const allTasks = [...p.tasks, ...p.generatedTasks].filter(t => !t.dismissed);
  const pending = allTasks.filter(t => !t.done);
  const done = allTasks.filter(t => t.done);
  const labSummary = formatLabsForHandoff(p);

  // Safety alerts
  const interactions = checkDrugInteractions(p).filter(i => i.severity === "critical");
  const renalWarnings = checkRenalDoseWarnings(p).filter(w => w.severity === "critical");
  const labDeltas = calculateLabDeltas(p).filter(d => d.severity === "critical");
  const beers = checkBeersCriteria(p).filter(b => b.severity === "avoid");
  const hasSafety = interactions.length + renalWarnings.length + labDeltas.length + beers.length > 0;

  const statCount = pending.filter(t => t.urgency === "stat").length;

  return (
    <div className={`rounded-xl border mb-3 overflow-hidden ${
      p.discharged ? "border-gray-700 opacity-60" :
      statCount > 0 ? "border-red-700 shadow-red-900/30 shadow-md" :
      isNew ? "border-teal-600" :
      "border-gray-700"
    } bg-gray-900`}>
      {/* Patient header */}
      <div className={`px-3 py-2.5 flex items-start justify-between gap-2 ${
        p.discharged ? "bg-gray-800/50" :
        isNew ? "bg-teal-900/40" :
        statCount > 0 ? "bg-red-950/60" :
        "bg-gray-800/70"
      }`}>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            {p.room && <span className="text-xs font-bold text-gray-400 shrink-0">{p.room}</span>}
            <span className="font-bold text-white text-sm leading-tight">{p.name ?? "—"}</span>
            {p.age && <span className="text-xs text-gray-400">({p.age})</span>}
            {p.discharged && <span className="text-xs bg-gray-700 text-gray-300 rounded px-1.5 py-0.5">🏠 שוחרר</span>}
            {isNew && <span className="text-xs bg-teal-700 text-teal-100 rounded px-1.5 py-0.5 font-medium">קבלה חדשה</span>}
          </div>
          {p.diagnosis && (
            <p className="text-xs text-blue-300 mt-0.5 leading-snug">{p.diagnosis}</p>
          )}
          {p.flags.length > 0 && (
            <div className="flex gap-1 mt-1 flex-wrap">
              {p.flags.map((f, i) => (
                <span key={i} className="text-xs bg-orange-900/50 text-orange-300 border border-orange-700/50 rounded px-1.5 py-0">{f}</span>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {statCount > 0 && (
            <span className="text-xs bg-red-700 text-white rounded-full px-2 py-0.5 font-bold">
              {statCount} סטט
            </span>
          )}
          {p.scannedAt && isNew && (
            <span className="text-xs text-teal-400">
              {new Date(p.scannedAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
      </div>

      <div className="px-3 py-2 space-y-2">
        {/* Status chips */}
        {p.status.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {p.status.map((s, i) => (
              <span key={i} className="text-xs bg-gray-800 text-gray-300 border border-gray-700 rounded px-2 py-0.5">{s}</span>
            ))}
          </div>
        )}

        {/* Labs */}
        {labSummary && (
          <p className="text-xs text-cyan-300 bg-cyan-900/20 border border-cyan-800/40 rounded px-2 py-1">
            🔬 {labSummary}
          </p>
        )}

        {/* Handover note */}
        {p.handoverNote && (
          <p className="text-xs text-amber-200 bg-amber-900/20 border border-amber-700/40 rounded px-2 py-1">
            📌 {p.handoverNote}
          </p>
        )}

        {/* Pending tasks */}
        {pending.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">לביצוע</p>
            {pending.map(t => (
              <div key={t.id} className={`flex items-start gap-1.5 text-xs rounded px-2 py-1 border ${urgencyColor(t.urgency)}`}>
                {urgencyDot(t.urgency)}
                <span className="flex-1">{t.text}</span>
                {t.dueAt && (
                  <span className="text-gray-400 shrink-0">
                    ⏰{new Date(t.dueAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Done tasks — collapsed summary */}
        {done.length > 0 && (
          <div className="space-y-0.5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">בוצע ({done.length})</p>
            {done.map(t => (
              <div key={t.id} className="flex items-start gap-1.5 text-xs text-gray-500 line-through">
                <span className="text-green-500 no-underline shrink-0">✓</span>
                <span>{t.text}{t.note ? <span className="no-underline text-gray-400 not-italic"> → {t.note}</span> : null}</span>
              </div>
            ))}
          </div>
        )}

        {/* Tomorrow / plan notes */}
        {p.tomorrowNotes.length > 0 && (
          <p className="text-xs text-gray-400 border-t border-gray-800 pt-1.5">
            מחר: {p.tomorrowNotes.join(", ")}
          </p>
        )}

        {/* Safety alerts */}
        {hasSafety && (
          <div className="bg-red-950/40 border border-red-800/60 rounded px-2 py-1.5 space-y-0.5">
            <p className="text-xs font-bold text-red-400">⚠️ התראות בטיחות</p>
            {interactions.map((ix, i) => <p key={i} className="text-xs text-red-300">🔴 {ix.risk}: {ix.detail}</p>)}
            {renalWarnings.map((w, i) => <p key={i} className="text-xs text-red-300">🔴 {w.drug} — {w.adjustment}</p>)}
            {labDeltas.map((d, i) => {
              const arrow = d.direction === "up" ? "↑" : d.direction === "down" ? "↓" : "→";
              return <p key={i} className="text-xs text-red-300">🔴 {d.label}: {d.baseline}{arrow}{d.latest}</p>;
            })}
            {beers.map((b, i) => <p key={i} className="text-xs text-orange-300">🚫 Beers: {b.drug} — {b.recommendation}</p>)}
          </div>
        )}
      </div>
    </div>
  );
}

function SectionBlock({ label, patients, newIds }: { label: string; patients: PatientEntry[]; newIds: Set<string> }) {
  const pendingCount = patients.flatMap(p => [...p.tasks, ...p.generatedTasks]).filter(t => !t.done).length;
  const statCount = patients.flatMap(p => [...p.tasks, ...p.generatedTasks]).filter(t => !t.done && t.urgency === "stat").length;

  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-2 sticky top-0 bg-gray-950/95 py-1.5 z-10">
        <div className="flex-1 h-px bg-gray-700" />
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-bold text-gray-300 uppercase tracking-widest">{label}</span>
          <span className="text-xs text-gray-500">({patients.length})</span>
          {statCount > 0 && <span className="text-xs bg-red-800 text-red-200 rounded-full px-1.5">🔴 {statCount}</span>}
          {pendingCount > 0 && <span className="text-xs text-gray-500">⏳{pendingCount}</span>}
        </div>
        <div className="flex-1 h-px bg-gray-700" />
      </div>
      {patients.map(p => <PatientCard key={p.id} p={p} isNew={newIds.has(p.id)} />)}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function HandoffSheet({ onClose }: { onClose: () => void }) {
  const { patients } = usePatientsState();
  const [oncallOnly, setOncallOnly] = useState(false);
  const [view, setView] = useState<"visual" | "text">("visual");

  const shiftStart = useMemo(() => getShiftStart(), []);

  const filteredPatients = useMemo(() => {
    if (!oncallOnly) return patients;
    return patients.filter(p => isOncallRelevant(p, shiftStart));
  }, [patients, oncallOnly, shiftStart]);

  const newAdmissionIds = useMemo(() => {
    return new Set(
      patients
        .filter(p => p.scannedAt && isOnCallTime(new Date(p.scannedAt)) && new Date(p.scannedAt) >= shiftStart)
        .map(p => p.id)
    );
  }, [patients, shiftStart]);

  const sections = useMemo(() => {
    const map = new Map<string, PatientEntry[]>();
    for (const p of filteredPatients) {
      const arr = map.get(p.section) ?? [];
      arr.push(p);
      map.set(p.section, arr);
    }
    return map;
  }, [filteredPatients]);

  const text = useMemo(
    () => buildTextHandoff(patients, filteredPatients, sections, oncallOnly, shiftStart),
    [patients, filteredPatients, sections, oncallOnly, shiftStart]
  );

  // Summary stats
  const allTasks = filteredPatients.flatMap(p => [...p.tasks, ...p.generatedTasks]);
  const pendingCount = allTasks.filter(t => !t.done).length;
  const doneCount = allTasks.filter(t => t.done).length;
  const statCount = allTasks.filter(t => !t.done && t.urgency === "stat").length;
  const newCount = newAdmissionIds.size;

  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(text); alert("הועתק!"); }
    catch { alert("לא ניתן להעתיק אוטומטית."); }
  };
  const handleWhatsApp = () => window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  const handleNativeShare = async () => {
    if (navigator.share) {
      try { await navigator.share({ text }); return; }
      catch (err) { if (err instanceof Error && err.name === "AbortError") return; }
    }
    await handleCopy();
  };
  const handleExportJSON = () => {
    const blob = new Blob([JSON.stringify(patients, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `toranot-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-gray-950 w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl max-h-[93vh] flex flex-col overflow-hidden shadow-xl"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-label="מסירת תורן"
      >
        {/* Header */}
        <div className="bg-emerald-800 text-white px-4 py-3 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-bold">{oncallOnly ? "מסירת תורן" : "סיכום משמרת"}</h2>
            <p className="text-xs text-emerald-200 mt-0.5">
              {filteredPatients.length} חולים
              {newCount > 0 && <span className="text-teal-300"> · {newCount} קבלות חדשות</span>}
              {statCount > 0 && <span className="text-red-300"> · {statCount} סטט</span>}
              {pendingCount > 0 && <span> · ⏳{pendingCount}</span>}
              {doneCount > 0 && <span> · ✅{doneCount}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setOncallOnly(v => !v)}
              className={`text-xs px-2 py-1 rounded-lg font-medium border transition-colors ${oncallOnly ? "bg-white text-emerald-700 border-white" : "bg-emerald-700 text-emerald-100 border-emerald-600"}`}
            >
              {oncallOnly ? "🩺 תורן" : "📋 כולם"}
            </button>
            <button onClick={onClose} className="text-white/70 hover:text-white text-xl px-2">✕</button>
          </div>
        </div>

        {/* View toggle */}
        <div className="flex border-b border-gray-800 shrink-0 bg-gray-900">
          <button
            onClick={() => setView("visual")}
            className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${view === "visual" ? "text-emerald-400 border-b-2 border-emerald-400" : "text-gray-500"}`}
          >
            🗂️ תצוגת כרטיסיות
          </button>
          <button
            onClick={() => setView("text")}
            className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${view === "text" ? "text-emerald-400 border-b-2 border-emerald-400" : "text-gray-500"}`}
          >
            📄 טקסט להעתקה
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {view === "visual" ? (
            <div className="p-3">
              {/* New admissions banner */}
              {newCount > 0 && (
                <div className="mb-4 bg-teal-900/30 border border-teal-700/50 rounded-xl p-3">
                  <p className="text-xs font-bold text-teal-300 mb-2">🆕 קבלות תורן ({newCount})</p>
                  {filteredPatients
                    .filter(p => newAdmissionIds.has(p.id))
                    .map(p => (
                      <div key={p.id} className="flex items-baseline gap-2 py-1 border-t border-teal-800/40">
                        <span className="text-xs text-gray-400 shrink-0">{p.room}</span>
                        <span className="text-sm font-semibold text-white">{p.name}</span>
                        {p.age && <span className="text-xs text-gray-400">({p.age})</span>}
                        {p.diagnosis && <span className="text-xs text-teal-300 truncate">{p.diagnosis}</span>}
                        {p.scannedAt && (
                          <span className="text-xs text-gray-500 mr-auto shrink-0">
                            {new Date(p.scannedAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                      </div>
                    ))
                  }
                </div>
              )}

              {/* Section blocks */}
              {[...sections.entries()].map(([section, pts]) => (
                <SectionBlock
                  key={section}
                  label={SECTION_LABEL[section as keyof typeof SECTION_LABEL] ?? section}
                  patients={pts}
                  newIds={newAdmissionIds}
                />
              ))}

              {filteredPatients.length === 0 && (
                <div className="text-center py-16 text-gray-600">
                  <p className="text-4xl mb-3">🏥</p>
                  <p className="text-sm">אין חולים להצגה</p>
                </div>
              )}
            </div>
          ) : (
            <div className="p-4">
              <pre
                id="handoff-text"
                className="text-sm leading-relaxed whitespace-pre-wrap break-words font-mono text-gray-300"
                dir="auto"
                style={{ unicodeBidi: "plaintext" }}
              >
                {text}
              </pre>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="border-t border-gray-800 p-3 space-y-2 shrink-0 bg-gray-900">
          <div className="flex gap-2">
            <button onClick={handleCopy} className="flex-1 py-3 bg-emerald-600 text-white rounded-xl text-sm font-medium active:bg-emerald-700">
              📋 העתק
            </button>
            <button onClick={handleWhatsApp} className="flex-1 py-3 bg-green-600 text-white rounded-xl text-sm font-medium active:bg-green-700">
              💬 WhatsApp
            </button>
            <button onClick={handleNativeShare} className="flex-1 py-3 bg-blue-600 text-white rounded-xl text-sm font-medium active:bg-blue-700">
              📤 שתף
            </button>
          </div>
          <button onClick={handleExportJSON} className="w-full py-2 bg-gray-800 text-gray-400 rounded-xl text-xs font-medium active:bg-gray-700">
            💾 ייצא גיבוי (JSON)
          </button>
        </div>
      </div>
    </div>
  );
}

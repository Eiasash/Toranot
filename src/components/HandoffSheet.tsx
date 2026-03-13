import { useMemo, useState, useCallback } from "react";
import { useSimpleToast, SimpleToast } from "./SimpleConfirm";
import { usePatientsState, usePatientsDispatch } from "../context/PatientsContext";
import { SECTION_LABEL, type PatientEntry, type Task } from "../types";
import { formatLabsForHandoff } from "./LabChart";
import {
  checkDrugInteractions,
  checkRenalDoseWarnings,
  checkBeersCriteria,
  checkAllergyConflicts,
} from "../engine/drugSafety";
import { calculateLabDeltas } from "../engine/labDelta";
import { buildPhlebotomyList, buildPhlebotomyText, TUBE_EMOJI, TUBE_LABEL, type TubeColour } from "../utils/phlebotomy";

// ─── Text generation (copy/WhatsApp — unchanged) ────────────────────────────

function urgencyLabel(u: Task["urgency"]) {
  return u === "stat" ? "🔴" : u === "urgent" ? "🟡" : u === "extra" ? "🟣" : "";
}

function formatPatient(p: PatientEntry): string {
  const allTasks = [...p.tasks, ...p.generatedTasks.filter(t => !t.dismissed)];
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
  if (notes.length > 0) {
    lines.push(`  📝 הערות תורן:`);
    notes.forEach(n => lines.push(`    ${n}`));
  }
  if (p.tomorrowNotes.length > 0) lines.push(`  מחר: ${p.tomorrowNotes.join(", ")}`);
  if (p.handoverNote) lines.push(`  📌 ${p.handoverNote}`);
  // Per-patient safety alerts omitted from text handoff — see DrugSafetyAlerts view.
  // Aggregate alert count still shown in shift summary below.
  return lines.join("\n");
}

import { getShiftStart } from "../utils/shiftTime";

function isOncallRelevant(p: PatientEntry, shiftStart: Date): boolean {
  const shiftISO = shiftStart.toISOString();
  // New admission added this shift = always show
  if (p.isAdmission) return true;
  // On-call doc manually added a task = action taken
  if (p.tasks.some(t => t.source === "manual")) return true;
  // On-call doc completed a task THIS SHIFT = action taken
  if ([...p.tasks, ...p.generatedTasks.filter(t => !t.dismissed)].some(t => t.done && t.doneTime && t.doneTime >= shiftISO)) return true;
  // Handover note written = action taken
  if (p.handoverNote) return true;
  // Notes written = action taken
  if ((p.notes ?? []).length > 0) return true;
  // Scanned-only patients (no actions taken) are NOT on-call relevant
  // They appear in "כולם" (all patients) mode only
  return false;
}

function buildTextHandoff(patients: PatientEntry[], filteredPatients: PatientEntry[], sections: Map<string, PatientEntry[]>, oncallOnly: boolean, shiftStart: Date): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString("he-IL");
  const timeStr = now.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  // Only explicitly admitted patients count as "new admissions".
  // Patients from דף תורן scan (scannedAt) are existing ward patients — never new admissions.
  const newAdmissions = filteredPatients.filter(p => p.isAdmission);
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
  const allTasks = filteredPatients.flatMap((p) => [...p.tasks, ...p.generatedTasks.filter(t => !t.dismissed)]);
  const totalDone = allTasks.filter((t) => t.done).length;
  const totalPending = allTasks.filter((t) => !t.done).length;
  const statPending = allTasks.filter((t) => !t.done && t.urgency === "stat").length;
  const statDone = allTasks.filter((t) => t.done && t.urgency === "stat").length;
  const urgentDone = allTasks.filter((t) => t.done && t.urgency === "urgent").length;
  let totalSafetyAlerts = 0, patientsWithAlerts = 0;
  for (const p of filteredPatients) {
    const count = checkDrugInteractions(p).length + checkRenalDoseWarnings(p).length + calculateLabDeltas(p).length + checkBeersCriteria(p).length + checkAllergyConflicts(p).length;
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


// ─── ISBAR text generation ──────────────────────────────────────────────────

function buildISBAR(patients: PatientEntry[], filteredPatients: PatientEntry[], shiftStart: Date): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString("he-IL");
  const timeStr = now.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  const lines: string[] = [];

  lines.push(`🩺 מסירת תורן ISBAR — ${dateStr} ${timeStr}`);
  lines.push("═".repeat(38));

  // ── I: Identification ──────────────────────────────────────────
  lines.push("");
  lines.push("📋 I — זיהוי (Identification)");
  lines.push(`  מחלקה: גריאטריה | ${filteredPatients.length} חולים במסירה`);
  const newAdm = filteredPatients.filter(p => p.isAdmission);
  if (newAdm.length > 0) {
    lines.push(`  🆕 קבלות תורן: ${newAdm.map(p => `${p.room ?? "?"} ${p.name ?? "?"}`).join(" | ")}`);
  }

  // ── S: Situation ───────────────────────────────────────────────
  const statTasks = filteredPatients.flatMap(p =>
    [...p.tasks, ...p.generatedTasks.filter(t => !t.dismissed)]
      .filter(t => !t.done && t.urgency === "stat")
      .map(t => ({ p, t }))
  );
  const urgentTasks = filteredPatients.flatMap(p =>
    [...p.tasks, ...p.generatedTasks.filter(t => !t.dismissed)]
      .filter(t => !t.done && t.urgency === "urgent")
      .map(t => ({ p, t }))
  );
  lines.push("");
  lines.push("🚨 S — מצב נוכחי (Situation)");
  if (statTasks.length === 0 && urgentTasks.length === 0) {
    lines.push("  ✅ אין משימות STAT/דחוף פתוחות — משמרת יציבה");
  } else {
    if (statTasks.length > 0) {
      lines.push(`  🔴 STAT (${statTasks.length}):`);
      statTasks.forEach(({ p, t }) => lines.push(`    • חד׳ ${p.room ?? "?"} ${p.name ?? "?"} — ${t.text}`));
    }
    if (urgentTasks.length > 0) {
      lines.push(`  🟡 דחוף (${urgentTasks.length}):`);
      urgentTasks.slice(0, 6).forEach(({ p, t }) => lines.push(`    • חד׳ ${p.room ?? "?"} ${p.name ?? "?"} — ${t.text}`));
      if (urgentTasks.length > 6) lines.push(`    ... ועוד ${urgentTasks.length - 6}`);
    }
  }

  // ── B: Background ──────────────────────────────────────────────
  lines.push("");
  lines.push("📂 B — רקע (Background)");
  // Show patients with active flags/status worth knowing
  const flaggedPatients = filteredPatients.filter(p =>
    p.status.length > 0 || p.flags.length > 0
  );
  if (flaggedPatients.length > 0) {
    flaggedPatients.slice(0, 8).forEach(p => {
      const info = [p.room, p.name, p.age ? `(${p.age})` : null].filter(Boolean).join(" ");
      const details = [p.diagnosis, ...(p.status.length > 0 ? [p.status.join("/")] : []), ...(p.flags.length > 0 ? [p.flags.join(", ")] : [])].filter(Boolean).join(" | ");
      lines.push(`  • ${info} — ${details}`);
    });
    if (flaggedPatients.length > 8) lines.push(`  ... ועוד ${flaggedPatients.length - 8} חולים`);
  } else {
    lines.push("  אין דגלים פעילים");
  }

  // ── A: Assessment ──────────────────────────────────────────────
  lines.push("");
  lines.push("🔍 A — הערכה (Assessment)");
  const comfortPatients = filteredPatients.filter(p =>
    [...p.status, ...p.flags, p.diagnosis ?? ""].some(s => /comfort|palliative|DNR|נוחות|פליאטיב/i.test(s))
  );
  const allTasks = filteredPatients.flatMap(p => [...p.tasks, ...p.generatedTasks.filter(t => !t.dismissed)]);
  const donePct = allTasks.length > 0 ? Math.round((allTasks.filter(t => t.done).length / allTasks.length) * 100) : 100;
  lines.push(`  ✅ ביצוע משימות: ${donePct}% (${allTasks.filter(t => t.done).length}/${allTasks.length})`);
  if (comfortPatients.length > 0) lines.push(`  🕊️ Comfort care: ${comfortPatients.map(p => `${p.room ?? "?"} ${p.name ?? "?"}`).join(", ")}`);
  const patientsWithHandoverNote = filteredPatients.filter(p => p.handoverNote);
  if (patientsWithHandoverNote.length > 0) {
    lines.push(`  📝 הערות מסירה:`);
    patientsWithHandoverNote.slice(0, 5).forEach(p => {
      lines.push(`    חד׳ ${p.room ?? "?"} ${p.name ?? "?"}: ${p.handoverNote}`);
    });
  }
  const patientsWithNotes = filteredPatients.filter(p => (p.notes ?? []).length > 0);
  if (patientsWithNotes.length > 0) {
    lines.push(`  📝 הערות:`);
    patientsWithNotes.slice(0, 5).forEach(p => {
      lines.push(`    חד׳ ${p.room ?? "?"} ${p.name ?? "?"}: ${(p.notes ?? []).join("; ")}`);
    });
  }

  // ── R: Recommendation ─────────────────────────────────────────
  lines.push("");
  lines.push("💡 R — המלצות (Recommendation)");
  const pendingRoutine = allTasks.filter(t => !t.done && t.urgency === "routine");
  if (statTasks.length > 0) lines.push(`  ⚡ ${statTasks.length} משימות STAT — טפל מיידית`);
  if (urgentTasks.length > 0) lines.push(`  🎯 ${urgentTasks.length} משימות דחופות — תוך שעה`);
  if (pendingRoutine.length > 0) lines.push(`  📋 ${pendingRoutine.length} משימות שגרה — לפי סדר עדיפויות`);
  if (comfortPatients.length > 0) lines.push(`  🕊️ ${comfortPatients.length} חולי comfort — הערכת נוחות בלבד, לא החייאה`);
  if (newAdm.length > 0) lines.push(`  🆕 ${newAdm.length} קבלות — ודא הרשמה + מעבדות`);
  if (statTasks.length === 0 && urgentTasks.length === 0 && pendingRoutine.length === 0) {
    lines.push("  ✅ משמרת נקייה — עבודה יפה!");
  }

  lines.push("");
  lines.push("─".repeat(38));
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

function PatientCard({ p, isNew, dispatch }: { p: PatientEntry; isNew: boolean; dispatch?: ReturnType<typeof usePatientsDispatch> }) {
  const [morningExpanded, setMorningExpanded] = useState(false);
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState(p.handoverNote ?? "");
  const allTasks = [...p.tasks, ...p.generatedTasks].filter(t => !t.dismissed);
  const pending = allTasks.filter(t => !t.done);
  const done = allTasks.filter(t => t.done);
  const labSummary = formatLabsForHandoff(p);

  // Safety alerts suppressed in handoff view — they clutter the letter with
  // background/chronic medication warnings that are not on-call action items.
  // Alerts are available in the patient detail DrugSafetyAlerts view.

  const statCount = pending.filter(t => t.urgency === "stat").length;

  const saveSummary = () => {
    if (dispatch) {
      dispatch({ type: "SET_HANDOVER_NOTE", patientId: p.id, note: summaryDraft.trim() });
    }
    setEditingSummary(false);
  };

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
        {/* Inline editable summary for new admissions */}
        {isNew && dispatch && (
          <div className="bg-teal-900/20 border border-teal-700/40 rounded-lg p-2">
            {editingSummary ? (
              <div className="space-y-1.5">
                <textarea
                  value={summaryDraft}
                  onChange={e => setSummaryDraft(e.target.value)}
                  placeholder="סיכום קבלה למסירה (אבחנה, מה עשית, מה נשאר)..."
                  dir="auto"
                  rows={3}
                  autoFocus
                  className="w-full px-2.5 py-1.5 text-xs border border-teal-600 rounded-lg bg-gray-900 text-gray-200 resize-none placeholder:text-gray-500"
                />
                <div className="flex gap-1.5">
                  <button onClick={saveSummary} className="text-xs px-2.5 py-1 rounded-lg bg-teal-600 text-white active:bg-teal-700">שמור</button>
                  <button onClick={() => { setSummaryDraft(p.handoverNote ?? ""); setEditingSummary(false); }} className="text-xs px-2.5 py-1 rounded-lg border border-gray-600 text-gray-400">ביטול</button>
                </div>
              </div>
            ) : p.handoverNote ? (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-semibold text-teal-400 uppercase tracking-wide">📌 סיכום למסירה</span>
                  <button onClick={() => { setSummaryDraft(p.handoverNote ?? ""); setEditingSummary(true); }} className="text-[10px] text-teal-400 active:text-teal-300">✏️ ערוך</button>
                </div>
                <p className="text-xs text-teal-200 leading-relaxed whitespace-pre-wrap" dir="auto">{p.handoverNote}</p>
              </div>
            ) : (
              <button
                onClick={() => { setSummaryDraft(""); setEditingSummary(true); }}
                className="w-full text-xs text-teal-400 py-1 active:text-teal-300"
              >
                + הוסף סיכום קבלה למסירה
              </button>
            )}
          </div>
        )}

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

        {/* Morning presentation / handover note (for non-new patients) */}
        {!isNew && p.handoverNote && (
          <div className="border border-blue-700/40 rounded overflow-hidden">
            <button
              onClick={() => setMorningExpanded(v => !v)}
              className="w-full flex items-center justify-between px-2 py-1.5 bg-blue-900/30 text-xs text-blue-300 hover:bg-blue-900/50 transition-colors"
            >
              <span>🌅 הצגת בוקר</span>
              <span>{morningExpanded ? "▲" : "▼"}</span>
            </button>
            {morningExpanded && (
              <div className="px-2 py-2 bg-blue-950/20 space-y-1">
                {/* Strip the "📋 Morning: " prefix if present */}
                <p className="text-xs text-blue-200 whitespace-pre-wrap leading-relaxed" dir="ltr">
                  {p.handoverNote.replace(/^📋 Morning:\s*/i, "")}
                </p>
                <button
                  onClick={() => navigator.clipboard.writeText(p.handoverNote!.replace(/^📋 Morning:\s*/i, "")).catch(() => {})}
                  className="text-[10px] bg-blue-700 text-white px-2 py-0.5 rounded opacity-70 hover:opacity-100"
                >
                  העתק
                </button>
              </div>
            )}
          </div>
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

        {/* Doctor notes — prominent display */}
        {(p.notes ?? []).length > 0 && (
          <div className="bg-amber-900/30 border border-amber-700/50 rounded-lg px-2.5 py-2 space-y-1">
            <p className="text-xs font-bold text-amber-300">📝 הערות תורן</p>
            {(p.notes ?? []).map((n, i) => (
              <p key={i} className="text-xs text-amber-100 leading-relaxed">{n}</p>
            ))}
          </div>
        )}

        {/* Safety alerts removed from handoff — see DrugSafetyAlerts in patient detail view */}
      </div>
    </div>
  );
}

function SectionBlock({ label, patients, newIds, dispatch }: { label: string; patients: PatientEntry[]; newIds: Set<string>; dispatch: ReturnType<typeof usePatientsDispatch> }) {
  const pendingCount = patients.flatMap(p => [...p.tasks, ...p.generatedTasks.filter(t => !t.dismissed)]).filter(t => !t.done).length;
  const statCount = patients.flatMap(p => [...p.tasks, ...p.generatedTasks.filter(t => !t.dismissed)]).filter(t => !t.done && t.urgency === "stat").length;

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
      {patients.map(p => <PatientCard key={p.id} p={p} isNew={newIds.has(p.id)} dispatch={dispatch} />)}
    </div>
  );
}

// ─── Tube colour ordering for phlebotomy display ────────────────────────────
const TUBE_ORDER: TubeColour[] = ["red", "purple", "blue", "green", "yellow", "black"];

// ─── Main component ──────────────────────────────────────────────────────────

export type HandoffTab = "visual" | "text" | "isbar" | "report" | "phlebotomy";

export function HandoffSheet({ onClose, initialTab }: { onClose: () => void; initialTab?: HandoffTab }) {
  const { toast, showToast } = useSimpleToast();
  const { patients, events } = usePatientsState();
  const dispatch = usePatientsDispatch();
  const [oncallOnly, setOncallOnly] = useState(true);
  const [view, setView] = useState<HandoffTab>(initialTab ?? "visual");


  const shiftStart = useMemo(() => getShiftStart(), []);

  const filteredPatients = useMemo(() => {
    if (!oncallOnly) return patients;
    return patients.filter(p => isOncallRelevant(p, shiftStart));
  }, [patients, oncallOnly, shiftStart]);

  const newAdmissionIds = useMemo(() => {
    return new Set(
      patients
        .filter(p =>
          // Only explicitly admitted patients count — NOT patients from דף תורן scan
          p.isAdmission
        )
        .map(p => p.id)
    );
  }, [patients]);

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

  const isbarText = useMemo(
    () => buildISBAR(patients, filteredPatients, shiftStart),
    [patients, filteredPatients, shiftStart]
  );

  // ── Phlebotomy list (merged from MorningReport) ──
  const phlebList = useMemo(() => buildPhlebotomyList(patients), [patients]);
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

  // ── Shift report data (merged from MorningReport) ──
  const h24ago = useMemo(() => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), []);
  const shiftStartISO = shiftStart.toISOString();
  const admissionEvents = useMemo(() =>
    events.filter(e => e.type === "ADMISSION" && e.at >= h24ago), [events, h24ago]);
  const moveEvents = useMemo(() =>
    events.filter(e => e.type === "MOVE" && e.at >= h24ago), [events, h24ago]);
  const openUrgent = useMemo(() =>
    patients.flatMap(p =>
      [...p.tasks, ...p.generatedTasks.filter(t => !t.dismissed)]
        .filter(t => !t.done && (t.urgency === "stat" || t.urgency === "urgent"))
        .map(t => ({ task: t, patient: p }))
    ).sort((a, b) => (a.task.urgency === "stat" ? -1 : 1) - (b.task.urgency === "stat" ? -1 : 1)),
    [patients]);
  const actedon = useMemo(() => {
    const admissionIdSet = new Set(admissionEvents.map(e => e.patientId));
    return patients.filter(p => {
      if (admissionIdSet.has(p.id)) return false;
      const allT = [...p.tasks, ...p.generatedTasks.filter(t => !t.dismissed)];
      return allT.some(t => t.done && t.doneTime && t.doneTime >= shiftStartISO)
        || p.tasks.some(t => t.source === "manual")
        || (p.notes ?? []).length > 0
        || !!p.handoverNote;
    });
  }, [patients, admissionEvents, shiftStartISO]);

  // Summary stats
  const allTasks = filteredPatients.flatMap(p => [...p.tasks, ...p.generatedTasks.filter(t => !t.dismissed)]);
  const pendingCount = allTasks.filter(t => !t.done).length;
  const doneCount = allTasks.filter(t => t.done).length;
  const statCount = allTasks.filter(t => !t.done && t.urgency === "stat").length;
  const newCount = newAdmissionIds.size;

  const handleCopy = async () => {
    let content: string;
    if (view === "isbar") content = isbarText;
    else if (view === "phlebotomy") content = buildPhlebotomyText(phlebList);
    else content = text;
    try { await navigator.clipboard.writeText(content); showToast("✓ הועתק ללוח"); }
    catch { showToast("לא ניתן להעתיק אוטומטית", "error"); }
  };
  const handleWhatsApp = () => {
    let content: string;
    if (view === "isbar") content = isbarText;
    else if (view === "phlebotomy") content = buildPhlebotomyText(phlebList);
    else content = text;
    window.open(`https://wa.me/?text=${encodeURIComponent(content)}`, "_blank");
  };
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
              {oncallOnly ? "🩺 פעלתי" : "📋 כל המחלקה"}
            </button>
            <button onClick={onClose} className="text-white/70 hover:text-white text-xl px-2">✕</button>
          </div>
        </div>

        {/* View toggle — scrollable on narrow screens */}
        <div className="flex border-b border-gray-800 shrink-0 bg-gray-900 overflow-x-auto scrollbar-hide">
          {([
            ["visual", "🗂️ כרטיסיות"],
            ["report", "☀️ דוח משמרת"],
            ["phlebotomy", "🩸 שלילות"],
            ["text", "📄 טקסט"],
            ["isbar", "🩺 ISBAR"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setView(key as HandoffTab)}
              className={`shrink-0 px-3 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap ${view === key ? "text-emerald-400 border-b-2 border-emerald-400" : "text-gray-500"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {view === "visual" ? (
            <div className="p-3">
              {/* New admissions banner — removed compact list, now shown in section cards with editable summary */}

              {/* Section blocks */}
              {[...sections.entries()].map(([section, pts]) => (
                <SectionBlock
                  key={section}
                  label={SECTION_LABEL[section as keyof typeof SECTION_LABEL] ?? section}
                  patients={pts}
                  newIds={newAdmissionIds}
                  dispatch={dispatch}
                />
              ))}

              {filteredPatients.length === 0 && (
                <div className="text-center py-16 text-gray-600">
                  <p className="text-4xl mb-3">🏥</p>
                  <p className="text-sm">אין חולים להצגה</p>
                </div>
              )}
            </div>
          ) : view === "report" ? (
            /* ── Shift Report tab (merged from MorningReport) ── */
            <div className="p-3 space-y-3">
              {/* Open urgent tasks */}
              {openUrgent.length > 0 && (
                <div className="bg-red-900/20 border border-red-700/50 rounded-xl p-3 space-y-1.5">
                  <p className="text-xs font-bold text-red-300">⚠️ משימות דחופות פתוחות ({openUrgent.length})</p>
                  {openUrgent.map(({ task, patient }) => (
                    <div key={task.id} className="text-xs flex gap-2 items-center">
                      <span className={`shrink-0 font-bold ${task.urgency === "stat" ? "text-red-400" : "text-yellow-400"}`}>
                        {task.urgency === "stat" ? "🔴" : "🟡"}
                      </span>
                      <span className="text-gray-400 font-mono shrink-0">חד׳ {patient.room ?? "?"}</span>
                      <span className="text-gray-200">{patient.name ?? "?"}</span>
                      <span className="text-gray-400 truncate">— {task.text}</span>
                    </div>
                  ))}
                </div>
              )}
              {openUrgent.length === 0 && (
                <div className="bg-green-900/20 border border-green-700/50 rounded-xl p-3">
                  <p className="text-xs font-bold text-green-300">✅ אין משימות דחופות פתוחות</p>
                </div>
              )}

              {/* Admissions */}
              {admissionEvents.length > 0 && (
                <div className="bg-teal-900/20 border border-teal-700/50 rounded-xl p-3 space-y-1.5">
                  <p className="text-xs font-bold text-teal-300">🏥 קבלות 24 שעות ({admissionEvents.length})</p>
                  {admissionEvents.map(e => {
                    if (e.type !== "ADMISSION") return null;
                    return (
                      <div key={e.id} className="text-xs flex gap-2 items-center">
                        <span className="text-gray-400 font-mono shrink-0">חד׳ {e.room ?? "?"}</span>
                        <span className="text-gray-200">{e.patientName ?? "?"}</span>
                        <span className="text-gray-500 mr-auto shrink-0">
                          {new Date(e.at).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Moves */}
              {moveEvents.length > 0 && (
                <div className="bg-blue-900/20 border border-blue-700/50 rounded-xl p-3 space-y-1.5">
                  <p className="text-xs font-bold text-blue-300">🔄 מעברים ({moveEvents.length})</p>
                  {moveEvents.map(e => {
                    if (e.type !== "MOVE") return null;
                    return (
                      <div key={e.id} className="text-xs flex gap-2 items-center">
                        <span className="text-gray-200">{e.patientName ?? "?"}</span>
                        <span className="text-gray-400">{e.from ?? "?"} → {e.to}</span>
                        <span className="text-gray-500 mr-auto shrink-0">
                          {new Date(e.at).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Patients acted on */}
              {actedon.length > 0 && (
                <div className="bg-purple-900/20 border border-purple-700/50 rounded-xl p-3 space-y-2">
                  <p className="text-xs font-bold text-purple-300">🩺 חולים שטיפלת בהם ({actedon.length})</p>
                  {actedon.map(p => {
                    const doneTasks = [...p.tasks, ...p.generatedTasks.filter(t => !t.dismissed)].filter(t => t.done);
                    const notes = p.notes ?? [];
                    return (
                      <div key={p.id} className="space-y-1 border-t border-purple-800/40 pt-1.5 first:border-0 first:pt-0">
                        <div className="flex items-baseline gap-2 flex-wrap text-xs">
                          <span className="font-mono text-blue-400 shrink-0">חד׳ {p.room ?? "?"}</span>
                          <span className="font-medium text-gray-100">{p.name ?? "?"}</span>
                          {p.diagnosis && <span className="text-gray-500 truncate">— {p.diagnosis}</span>}
                        </div>
                        {doneTasks.map(t => (
                          <div key={t.id} className="flex items-start gap-1 text-[11px] text-gray-400">
                            <span className="text-green-500 shrink-0">✓</span>
                            <span>{t.text}</span>
                            {t.note && <span className="text-green-400">→ {t.note}</span>}
                          </div>
                        ))}
                        {notes.length > 0 && notes.map((n, i) => (
                          <div key={i} className="text-[11px] text-amber-300">📝 {n}</div>
                        ))}
                        {p.handoverNote && (
                          <div className="text-[11px] text-blue-300">📌 {p.handoverNote}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : view === "phlebotomy" ? (
            /* ── Phlebotomy tab (merged from MorningReport) ── */
            <div className="p-3 space-y-3">
              {phlebList.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-3xl mb-2">✅</p>
                  <p className="text-sm text-gray-400">אין בדיקות דם מתוכננות לבוקר</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-400">
                      {phlebList.length} חולים · {phlebList.filter(e => e.isUrgent).length} דחוף
                    </p>
                  </div>
                  {TUBE_ORDER.map(tube => {
                    const pts = byTube.get(tube);
                    if (!pts || pts.length === 0) return null;
                    return (
                      <div key={tube} className="rounded-xl border border-gray-700 overflow-hidden">
                        <div className="bg-gray-800 px-3 py-2 flex items-center gap-2">
                          <span className="text-base">{TUBE_EMOJI[tube]}</span>
                          <span className="text-xs font-bold text-gray-300">{TUBE_LABEL[tube]}</span>
                          <span className="mr-auto text-xs text-gray-500">{pts.length}</span>
                        </div>
                        <div className="divide-y divide-gray-800">
                          {pts.map(e => (
                            <div key={e.patientId + tube} className="px-3 py-2 flex items-center gap-2">
                              <span className="text-xs font-mono text-blue-400 shrink-0 w-10">{e.room ?? "?"}</span>
                              <span className="text-xs font-medium text-gray-100 truncate">{e.patientName}</span>
                              {e.isUrgent && <span className="mr-auto text-xs text-red-400 font-bold shrink-0">⚡ דחוף</span>}
                              <span className="text-xs text-gray-500 truncate mr-auto" title={e.tests.join(", ")}>
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
            </div>
          ) : view === "text" ? (
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
          ) : (
            <div className="p-4">
              <pre
                className="text-sm leading-relaxed whitespace-pre-wrap break-words font-mono text-gray-300"
                dir="auto"
                style={{ unicodeBidi: "plaintext" }}
              >
                {isbarText}
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
      <SimpleToast state={toast} />
    </div>
  );
}

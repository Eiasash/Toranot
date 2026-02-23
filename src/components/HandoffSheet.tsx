import { useMemo } from "react";
import { usePatientsState } from "../context/PatientsContext";
import { SECTION_LABEL, type PatientEntry, type Task } from "../types";
import { formatLabsForHandoff } from "./LabChart";
import {
  checkDrugInteractions,
  checkRenalDoseWarnings,
  checkBeersCriteria,
} from "../engine/drugSafety";
import { calculateLabDeltas } from "../engine/labDelta";

function urgencyLabel(u: Task["urgency"]) {
  return u === "stat" ? "🔴" : u === "urgent" ? "🟡" : u === "extra" ? "🟣" : "";
}

function formatPatient(p: PatientEntry): string {
  const allTasks = [...p.tasks, ...p.generatedTasks];
  const pending = allTasks.filter((t) => !t.done);
  const done = allTasks.filter((t) => t.done);
  const notes = p.notes ?? [];

  const lines: string[] = [];

  const header = [p.room, p.name, p.age ? `(${p.age})` : null]
    .filter(Boolean)
    .join(" ");
  lines.push(`■ ${header}`);

  const severity = [p.diagnosis, ...p.flags].filter(Boolean).join(" | ");
  if (severity) lines.push(`  אבחנה: ${severity}`);

  if (p.status.length > 0) {
    lines.push(`  מצב: ${p.status.join(", ")}`);
  }

  const labSummary = formatLabsForHandoff(p);
  if (labSummary) {
    lines.push(`  🔬 ${labSummary}`);
  }

  if (pending.length > 0) {
    lines.push(`  לביצוע:`);
    for (const t of pending) {
      const flag = urgencyLabel(t.urgency);
      const due = t.dueAt
        ? ` ⏰${new Date(t.dueAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}`
        : "";
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
    lines.push(`  הערות: ${notes.join(", ")}`);
  }

  if (p.tomorrowNotes.length > 0) {
    lines.push(`  מחר: ${p.tomorrowNotes.join(", ")}`);
  }

  if (p.handoverNote) {
    lines.push(`  📌 ${p.handoverNote}`);
  }

  // Safety alerts for morning team awareness
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
    for (const ix of critInteractions) {
      lines.push(`    🔴 ${ix.risk}: ${ix.detail}`);
    }
    for (const w of critRenal) {
      lines.push(`    🔴 ${w.drug} — ${w.adjustment}`);
    }
    for (const d of critLabs) {
      const arrow = d.direction === "up" ? "↑" : d.direction === "down" ? "↓" : "→";
      lines.push(`    🔴 ${d.label}: ${d.baseline}${arrow}${d.latest}`);
    }
    for (const b of critBeers) {
      lines.push(`    🚫 Beers: ${b.drug} — ${b.recommendation}`);
    }
  }

  return lines.join("\n");
}

export function HandoffSheet({ onClose }: { onClose: () => void }) {
  const { patients } = usePatientsState();

  const sections = useMemo(() => {
    const map = new Map<string, PatientEntry[]>();
    for (const p of patients) {
      const arr = map.get(p.section) ?? [];
      arr.push(p);
      map.set(p.section, arr);
    }
    return map;
  }, [patients]);

  const text = useMemo(() => {
    const now = new Date();
    const dateStr = now.toLocaleDateString("he-IL");
    const timeStr = now.toLocaleTimeString("he-IL", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const lines: string[] = [
      `📋 סיכום משמרת — ${dateStr} ${timeStr}`,
      `${"─".repeat(35)}`,
    ];

    for (const [section, pts] of sections) {
      lines.push("");
      lines.push(
        `▸ ${SECTION_LABEL[section as keyof typeof SECTION_LABEL] ?? section} (${pts.length})`,
      );
      lines.push("");
      for (const p of pts) {
        lines.push(formatPatient(p));
        lines.push("");
      }
    }

    const allTasks = patients.flatMap((p) => [...p.tasks, ...p.generatedTasks]);
    const totalDone = allTasks.filter((t) => t.done).length;
    const totalPending = allTasks.filter((t) => !t.done).length;
    const statPending = allTasks.filter(
      (t) => !t.done && t.urgency === "stat",
    ).length;
    const statDone = allTasks.filter(
      (t) => t.done && t.urgency === "stat",
    ).length;
    const urgentDone = allTasks.filter(
      (t) => t.done && t.urgency === "urgent",
    ).length;

    // Safety stats
    let totalSafetyAlerts = 0;
    let patientsWithAlerts = 0;
    for (const p of patients) {
      const count = checkDrugInteractions(p).length
        + checkRenalDoseWarnings(p).length
        + calculateLabDeltas(p).length
        + checkBeersCriteria(p).length;
      totalSafetyAlerts += count;
      if (count > 0) patientsWithAlerts++;
    }

    // Acuity breakdown
    const patientsWithLabs = patients.filter(p => (p.labs ?? []).length > 0).length;
    const patientsWithNotes = patients.filter(p => p.handoverNote).length;

    lines.push(`${"─".repeat(35)}`);
    lines.push(`📊 סיכום משמרת:`);
    lines.push(
      `  חולים: ${patients.length} | ✅ ${totalDone} בוצעו | ⏳ ${totalPending} ממתינים`,
    );
    if (statDone > 0 || statPending > 0) {
      lines.push(`  🔴 סטט: ${statDone} בוצעו, ${statPending} ממתינים | 🟡 דחוף: ${urgentDone} בוצעו`);
    }
    if (totalSafetyAlerts > 0) {
      lines.push(`  ⚠️ ${totalSafetyAlerts} התראות בטיחות ב-${patientsWithAlerts} חולים`);
    }
    if (patientsWithLabs > 0) {
      lines.push(`  🔬 ${patientsWithLabs} חולים עם מעבדות מעודכנות`);
    }

    return lines.join("\n");
  }, [patients, sections]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      alert("הועתק!");
    } catch {
      // Fallback: select text in <pre> element
      const pre = document.querySelector("#handoff-text");
      if (pre) {
        const range = document.createRange();
        range.selectNodeContents(pre);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
      alert("לא ניתן להעתיק אוטומטית. סמן ולחץ העתק.");
    }
  };

  const handleWhatsApp = () => {
    const encoded = encodeURIComponent(text);
    window.open(`https://wa.me/?text=${encoded}`, "_blank");
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }
    // Fallback to copy
    await handleCopy();
  };

  const handleExportJSON = () => {
    const blob = new Blob([JSON.stringify(patients, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const now = new Date();
    a.download = `toranot-backup-${now.toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="סיכום משמרת"
      >
        <div className="bg-emerald-700 text-white px-4 py-3 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold">סיכום משמרת (Sign-Out)</h2>
            <p className="text-xs text-emerald-200">
              IPASS format — העתק, שתף בוואטסאפ, או ייצא
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white text-xl px-2"
            aria-label="סגור"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <pre
            id="handoff-text"
            className="text-sm leading-relaxed whitespace-pre-wrap break-words font-mono text-gray-800 dark:text-gray-200"
            dir="auto"
            style={{ unicodeBidi: "plaintext" }}
          >
            {text}
          </pre>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 p-3 space-y-2">
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="flex-1 py-3 bg-emerald-600 text-white rounded-xl text-sm font-medium active:bg-emerald-700"
              aria-label="העתק סיכום"
            >
              📋 העתק
            </button>
            <button
              onClick={handleWhatsApp}
              className="flex-1 py-3 bg-green-600 text-white rounded-xl text-sm font-medium active:bg-green-700"
              aria-label="שלח בוואטסאפ"
            >
              💬 WhatsApp
            </button>
            <button
              onClick={handleNativeShare}
              className="flex-1 py-3 bg-blue-600 text-white rounded-xl text-sm font-medium active:bg-blue-700"
              aria-label="שתף"
            >
              📤 שתף
            </button>
          </div>
          <button
            onClick={handleExportJSON}
            className="w-full py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl text-xs font-medium active:bg-gray-200"
            aria-label="ייצא גיבוי"
          >
            💾 ייצא גיבוי (JSON)
          </button>
        </div>
      </div>
    </div>
  );
}

import { useMemo, useCallback } from "react";
import { usePatientsState } from "../context/PatientsContext";

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
  const now = useMemo(() => Date.now(), []);
  const h24ago = useMemo(() => new Date(now - 24 * 60 * 60 * 1000).toISOString(), [now]);

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
      [...p.tasks, ...p.generatedTasks.filter(t => !(t as any).dismissed)]
        .filter(t => !t.done && (t.urgency === "stat" || t.urgency === "urgent"))
        .map(t => ({ task: t, patient: p }))
    ).sort((a, b) => (a.task.urgency === "stat" ? -1 : 1) - (b.task.urgency === "stat" ? -1 : 1)),
    [patients]
  );

  const unassignedTasks = useMemo(() =>
    events.filter(e => e.type === "TASK_CREATED" && !("patientId" in e && e.patientId)),
    [events]
  );

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

    if (unassignedTasks.length > 0) {
      lines.push("");
      lines.push(`📌 משימות לא משוייכות: ${unassignedTasks.length}`);
      unassignedTasks.slice(0, 10).forEach(e => {
        if (e.type !== "TASK_CREATED") return;
        lines.push(`  • ${e.text} — ${fmtDate(e.at)}`);
      });
    }

    return lines.join("\n");
  }, [admissions, moves, openUrgent, unassignedTasks]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(buildReport()).catch(() => {});
  }, [buildReport]);

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
            <button onClick={handleCopy} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-medium active:bg-blue-700">
              📋 העתק
            </button>
            <button onClick={onClose} className="text-slate-300 text-xl min-w-[44px] min-h-[44px] flex items-center justify-center">×</button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4">
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
        </div>
      </div>
    </div>
  );
}

function Section({ title, color, children }: { title: string; color: "blue" | "red" | "amber" | "purple"; children: React.ReactNode }) {
  const colors = {
    blue: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700",
    red: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700",
    amber: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700",
    purple: "bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-700",
  };
  return (
    <div className={`rounded-xl border p-3 space-y-1.5 ${colors[color]}`}>
      <p className="text-xs font-bold text-gray-700 dark:text-gray-300">{title}</p>
      {children}
    </div>
  );
}

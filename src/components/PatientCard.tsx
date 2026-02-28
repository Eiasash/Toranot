import { useMemo, useState, useCallback, useEffect } from "react";
import type { PatientEntry, Task } from "../types";
import { SECTIONS, SECTION_LABEL } from "../types";
import { TaskItem } from "./TaskItem";
import { usePatientsDispatch, usePatientsState } from "../context/PatientsContext";
import { LabBadges, AddLabForm } from "./LabTracker";
import { LabChart } from "./LabChart";
import { DrugSafetyAlerts } from "./DrugSafetyAlerts";
import { IVProtocolAlerts } from "./IVProtocolAlerts";
import { PhotoAttachments } from "./PhotoAttachments";
import { QuickScenario } from "./QuickScenario";
import { MedFlagBadges } from "./MedFlags";
import { generateHints } from "../engine/hints";
import { showUndoToast } from "./UndoToast";
import { TaskTemplates } from "./TaskTemplates";
import { NurseTemplates } from "./NurseTemplates";
import { AIClinicalReasoning } from "./AIClinicalReasoning";
import { VoiceButton } from "./VoiceInput";
import { hapticSuccess } from "../utils/haptics";

// On-call shift: 16:00 → 08:00
function getShiftStart(): Date {
  const now = new Date();
  const s = new Date(now);
  s.setMinutes(0, 0, 0);
  s.setHours(16);
  if (now.getHours() < 16) s.setDate(s.getDate() - 1);
  return s;
}
function isNewThisShift(p: PatientEntry): boolean {
  if (!p.scannedAt) return false;
  return new Date(p.scannedAt) >= getShiftStart();
}

function NewBadge() {
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500 text-white leading-none shrink-0"
      title="קבלה חדשה בתורן"
    >
      🆕
    </span>
  );
}

function FlagBadge({ flag }: { flag: string }) {
  return (
    <span
      className={[
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold",
        flag.toUpperCase().includes("DNR") || flag.toUpperCase().includes("DNI")
          ? "bg-red-600 text-white"
          : "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
      ].join(" ")}
    >
      {flag}
    </span>
  );
}

function sortTasks(tasks: Task[]) {
  const weight: Record<Task["urgency"], number> = {
    stat: 0,
    urgent: 1,
    morning: 2,
    extra: 3,
    routine: 4,
  };
  const now = Date.now();
  return [...tasks].sort((a, b) => {
    // 1. Undone before done
    if (a.done !== b.done) return a.done ? 1 : -1;
    // 2. Urgency
    const uDiff = weight[a.urgency] - weight[b.urgency];
    if (uDiff !== 0) return uDiff;
    // 3. Tasks with approaching deadlines first
    const aDue = a.dueAt ? new Date(a.dueAt).getTime() - now : Infinity;
    const bDue = b.dueAt ? new Date(b.dueAt).getTime() - now : Infinity;
    return aDue - bDue;
  });
}

/** Calculate patient acuity score based on task urgency, lab flags, and clinical flags */
function calcAcuity(patient: PatientEntry): number {
  let score = 0;
  const allTasks = [...patient.tasks, ...patient.generatedTasks];
  for (const t of allTasks) {
    if (t.done) continue;
    if (t.urgency === "stat") score += 3;
    else if (t.urgency === "urgent") score += 2;
  }
  // Critical flags
  const flagUpper = patient.flags.map((f) => f.toUpperCase());
  if (flagUpper.some((f) => f.includes("ISO") || f.includes("ISOLATION"))) score += 2;
  if (flagUpper.some((f) => f.includes("NPO"))) score += 1;
  if (flagUpper.some((f) => f.includes("FALL"))) score += 1;
  // Critical labs
  for (const lab of patient.labs ?? []) {
    const l = lab.label.toLowerCase().replace(/[+\s]/g, "");
    const v = lab.value;
    if (
      (l === "k" && (v > 6 || v < 2.5)) ||
      (l === "na" && (v < 120 || v > 160)) ||
      (l === "hb" && v < 7) ||
      (l === "lactate" && v > 4)
    ) score += 3;
  }
  return score;
}

function AcuityBadge({ patient }: { patient: PatientEntry }) {
  const score = calcAcuity(patient);
  if (score === 0) return null;
  let colorClass: string;
  if (score >= 8) colorClass = "bg-red-600 text-white";
  else if (score >= 4) colorClass = "bg-orange-500 text-white";
  else colorClass = "bg-amber-400 text-amber-900";
  return (
    <span
      className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${colorClass}`}
      title={`ציון חומרה: ${score}`}
    >
      {score}
    </span>
  );
}

function TaskProgress({ done, total }: { done: number; total: number }) {
  return (
    <span className="inline-flex items-center justify-center px-2 py-1 rounded-lg bg-blue-600 text-white text-sm font-semibold tabular-nums">
      {done}/{total}
    </span>
  );
}

/** Inline handover note that persists across shifts */
function HandoverNoteInline({ patient }: { patient: PatientEntry }) {
  const dispatch = usePatientsDispatch();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(patient.handoverNote ?? "");
  const note = patient.handoverNote;

  // Sync draft when patient.handoverNote changes externally (e.g. after re-scan or cloud sync)
  useEffect(() => {
    if (!editing) {
      setDraft(patient.handoverNote ?? "");
    }
  }, [patient.handoverNote, editing]);

  if (!editing && !note) {
    return (
      <button
        onClick={() => { setDraft(""); setEditing(true); }}
        className="text-xs text-gray-400 dark:text-gray-500 active:text-gray-600"
      >
        + הוסף הערת מסירה
      </button>
    );
  }

  if (editing) {
    return (
      <div className="space-y-1">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="הערה למשמרת הבאה (נשמרת בין משמרות)..."
          dir="auto"
          rows={2}
          autoFocus
          className="w-full px-2.5 py-1.5 text-xs border border-emerald-300 dark:border-emerald-700 rounded-lg bg-emerald-50/50 dark:bg-emerald-900/20 text-gray-800 dark:text-gray-200 resize-none"
        />
        <div className="flex gap-1.5">
          <button
            onClick={() => {
              dispatch({ type: "SET_HANDOVER_NOTE", patientId: patient.id, note: draft.trim() });
              setEditing(false);
            }}
            className="text-xs px-2.5 py-1 rounded-lg bg-emerald-600 text-white"
          >
            שמור
          </button>
          <button
            onClick={() => { setDraft(patient.handoverNote ?? ""); setEditing(false); }}
            className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500"
          >
            ביטול
          </button>
          {note && (
            <button
              onClick={() => {
                dispatch({ type: "SET_HANDOVER_NOTE", patientId: patient.id, note: "" });
                setEditing(false);
              }}
              className="text-xs px-2.5 py-1 rounded-lg border border-red-200 dark:border-red-700 text-red-500"
            >
              מחק
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={() => { setDraft(note ?? ""); setEditing(true); }}
      className="text-xs px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 cursor-pointer active:opacity-70"
      dir="auto"
    >
      📌 {note}
    </div>
  );
}

export function PatientCard({ patient }: { patient: PatientEntry }) {
  const dispatch = usePatientsDispatch();
  const { showTomorrow, scanMode } = usePatientsState();

  const manualNotes = patient.notes ?? [];

  const allTasks = useMemo(
    () => sortTasks([...patient.tasks, ...patient.generatedTasks]),
    [patient.tasks, patient.generatedTasks],
  );

  const doneCount = allTasks.filter((t) => t.done).length;
  const totalCount = allTasks.length;

  const [addOpen, setAddOpen] = useState(false);
  const [addType, setAddType] = useState<"task" | "note">("task");
  const [draft, setDraft] = useState("");
  const [showScenario, setShowScenario] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showLabForm, setShowLabForm] = useState(false);
  const [showLabChart, setShowLabChart] = useState(false);
  const [showHints, setShowHints] = useState(false);
  const [showNurseTemplates, setShowNurseTemplates] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(patient.name ?? "");
  const [editRoom, setEditRoom] = useState(patient.room ?? "");
  const [editSection, setEditSection] = useState(patient.section);
  const [editDiagnosis, setEditDiagnosis] = useState(patient.diagnosis ?? "");

  const saveEdit = () => {
    const nextName = editName.trim() || undefined;
    const nextRoom = editRoom.trim() || undefined;
    const nextSection = editSection;
    const nextDx = editDiagnosis.trim() || undefined;

    const locationChanged = (nextRoom ?? null) !== (patient.room ?? null) || nextSection !== patient.section;
    if (locationChanged && nextRoom) {
      dispatch({ type: "MOVE_PATIENT", patientId: patient.id, toRoom: nextRoom, toSection: nextSection });
    }

    dispatch({
      type: "EDIT_PATIENT",
      patientId: patient.id,
      name: nextName,
      diagnosis: nextDx,
      // If we already dispatched MOVE_PATIENT, don't double-write room/section here.
      room: locationChanged ? undefined : nextRoom,
      section: locationChanged ? undefined : nextSection,
    });
    setEditing(false);
  };

  const startEdit = () => {
    setEditName(patient.name ?? "");
    setEditRoom(patient.room ?? "");
    setEditSection(patient.section);
    setEditDiagnosis(patient.diagnosis ?? "");
    setEditing(true);
  };

  const toggleTask = useCallback((task: Task) => {
    dispatch({ type: "TOGGLE_TASK", patientId: patient.id, taskId: task.id });
    if (!task.done) {
      hapticSuccess();
      showUndoToast({
        id: task.id,
        message: `✅ ${task.text.slice(0, 40)}${task.text.length > 40 ? "..." : ""}`,
        onUndo: () => dispatch({ type: "TOGGLE_TASK", patientId: patient.id, taskId: task.id }),
      });
    }
  }, [dispatch, patient.id]);

  const add = () => {
    const text = draft.trim();
    if (!text) return;

    if (addType === "task") {
      dispatch({ type: "ADD_TASK", patientId: patient.id, text });
    } else {
      dispatch({ type: "ADD_NOTE", patientId: patient.id, text });
    }

    setDraft("");
  };

  // Acuity score for left border
  const acuityScore = calcAcuity(patient);
  const borderColor =
    acuityScore >= 8 ? "border-l-red-500" :
    acuityScore >= 5 ? "border-l-yellow-400" :
    acuityScore >= 1 ? "border-l-orange-300" :
    "border-l-gray-200 dark:border-l-gray-700";

  // ── Scan Mode: compact card ──
  if (scanMode) {
    return (
      <div
        id={`patient-${patient.id}`}
        data-room={patient.room ?? undefined}
        className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 border-l-4 ${borderColor} px-3 flex items-center gap-3`}
        style={{ height: "52px", overflow: "hidden" }}
      >
        {acuityScore > 0 && <AcuityBadge patient={patient} />}
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="text-sm font-semibold truncate dark:text-gray-100 shrink-0 max-w-[120px]">
              {patient.name ?? "לא ידוע"}
            </span>
            {isNewThisShift(patient) && <NewBadge />}
            {patient.room && (
              <span className="shrink-0 text-xs bg-blue-600 text-white px-1.5 py-0.5 rounded">
                {patient.room}
              </span>
            )}
            {patient.age && (
              <span className="text-xs text-gray-500 tabular-nums shrink-0">{patient.age}</span>
            )}
            {patient.flags.filter(f => f.toUpperCase().includes("DNR") || f.toUpperCase().includes("DNI")).map(f => (
              <FlagBadge key={f} flag={f} />
            ))}
          </div>
          {patient.diagnosis && (
            <div className="text-xs text-gray-500 dark:text-gray-400 truncate" dir="auto" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {patient.diagnosis}
            </div>
          )}
        </div>
        <TaskProgress done={doneCount} total={totalCount} />
      </div>
    );
  }

  return (
    <div
      id={`patient-${patient.id}`}
      data-room={patient.room ?? undefined}
      className={`bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 border-l-4 ${borderColor} p-4 space-y-3 animate-card-in`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="שם"
                  dir="auto"
                  className="flex-1 min-w-0 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-100"
                />
                <input
                  value={editRoom}
                  onChange={(e) => setEditRoom(e.target.value)}
                  placeholder="חדר"
                  dir="auto"
                  className="w-20 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-100"
                />
              </div>
              <input
                value={editDiagnosis}
                onChange={(e) => setEditDiagnosis(e.target.value)}
                placeholder="אבחנה"
                dir="auto"
                className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-100"
              />
              <div className="flex items-center gap-2">
                <select
                  value={editSection}
                  onChange={(e) => setEditSection(e.target.value as typeof editSection)}
                  className="text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-100"
                >
                  {SECTIONS.map((s) => (
                    <option key={s} value={s}>{SECTION_LABEL[s]}</option>
                  ))}
                </select>
                <button onClick={saveEdit} className="text-xs px-3 py-1 rounded-lg bg-blue-600 text-white">שמור</button>
                <button onClick={() => setEditing(false)} className="text-xs px-3 py-1 rounded-lg bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200">ביטול</button>
                <button
                  onClick={() => {
                    if (confirm(`למחוק את ${patient.name ?? "מטופל"}?`)) {
                      dispatch({ type: "REMOVE_PATIENT", patientId: patient.id });
                    }
                  }}
                  className="text-xs px-3 py-1 rounded-lg bg-red-600 text-white mr-auto"
                >
                  🗑️ מחק
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <AcuityBadge patient={patient} />
                {isNewThisShift(patient) && <NewBadge />}
                <span className="text-lg font-semibold truncate dark:text-gray-100">
                  {patient.name ?? "לא ידוע"}
                </span>
                {patient.room && (
                  <span className="shrink-0 text-sm bg-blue-600 text-white px-2 py-0.5 rounded-lg">
                    {patient.room}
                  </span>
                )}
                <button
                  onClick={startEdit}
                  className="shrink-0 text-xs text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-1"
                  title="ערוך פרטי מטופל"
                >
                  ✏️
                </button>
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1" dir="auto">
                {patient.diagnosis ?? ""}
              </div>
            </>
          )}
        </div>

        <div className="text-right shrink-0 flex items-center gap-2">
          {/* Reorder buttons */}
          <div className="flex flex-col gap-0.5">
            <button
              onClick={() =>
                dispatch({
                  type: "REORDER_PATIENT",
                  patientId: patient.id,
                  direction: "up",
                })
              }
              className="text-xs text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-1"
              title="הזז למעלה"
            >
              ▲
            </button>
            <button
              onClick={() =>
                dispatch({
                  type: "REORDER_PATIENT",
                  patientId: patient.id,
                  direction: "down",
                })
              }
              className="text-xs text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-1"
              title="הזז למטה"
            >
              ▼
            </button>
          </div>
          <div>
            <TaskProgress done={doneCount} total={totalCount} />
            {patient.age && (
              <div className="text-xs text-gray-500 mt-1 tabular-nums">
                {patient.age}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Flags */}
      {patient.flags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {patient.flags.map((f) => (
            <FlagBadge key={f} flag={f} />
          ))}
        </div>
      )}

      {/* Status + tomorrow + manual notes */}
      {(patient.status.length > 0 ||
        (showTomorrow && patient.tomorrowNotes.length > 0) ||
        manualNotes.length > 0) && (
        <div className="space-y-2">
          {patient.status.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {patient.status.map((s, i) => (
                <span
                  key={i}
                  dir="auto"
                  className="text-xs bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 px-2 py-0.5 rounded"
                  style={{ unicodeBidi: "plaintext" }}
                >
                  {s}
                </span>
              ))}
            </div>
          )}

          {showTomorrow && patient.tomorrowNotes.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-green-700 dark:text-green-400">מחר</div>
              <div className="flex flex-wrap gap-1.5">
                {patient.tomorrowNotes.map((s, i) => (
                  <span
                    key={i}
                    dir="auto"
                    className="text-xs bg-green-50 text-green-900 dark:bg-green-900/30 dark:text-green-300 px-2 py-0.5 rounded border border-green-200 dark:border-green-800"
                    style={{ unicodeBidi: "plaintext" }}
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {(patient.planNotes?.length ?? 0) > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">תכנית</div>
              <div className="flex flex-wrap gap-1.5">
                {patient.planNotes!.map((s, i) => (
                  <span
                    key={i}
                    dir="auto"
                    className="text-xs bg-indigo-50 text-indigo-900 dark:bg-indigo-900/30 dark:text-indigo-300 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800"
                    style={{ unicodeBidi: "plaintext" }}
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {manualNotes.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {manualNotes.map((n, idx) => (
                <span
                  key={idx}
                  dir="auto"
                  className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-900 dark:bg-blue-900/30 dark:text-blue-300 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800"
                  style={{ unicodeBidi: "plaintext" }}
                  title="הערת תורן"
                >
                  {n}
                  <button
                    type="button"
                    onClick={() =>
                      dispatch({
                        type: "REMOVE_NOTE",
                        patientId: patient.id,
                        index: idx,
                      })
                    }
                    className="ml-1 text-blue-700 hover:text-blue-900"
                    aria-label="מחק הערה"
                    title="מחק"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Lab sparklines */}
      <LabBadges patient={patient} />

      {/* Medication safety flags */}
      <MedFlagBadges patient={patient} />

      {/* Drug interaction & renal dose warnings */}
      <DrugSafetyAlerts patient={patient} />

      {/* IV Protocol alerts — matched from patient data against SZMC protocols */}
      <IVProtocolAlerts patient={patient} />

      {/* Clinical hints — diagnosis-based FYI, NOT tasks */}
      {(() => {
        const hints = generateHints(patient);
        if (hints.length === 0) return null;
        return (
          <div>
            <button
              type="button"
              onClick={() => setShowHints((v) => !v)}
              className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 active:bg-gray-100"
              aria-expanded={showHints}
              aria-label="הנחיות רקע קליניות"
            >
              💡 הנחיות רקע ({hints.length}) {showHints ? "▴" : "▾"}
            </button>
            {showHints && (
              <div className="mt-2 space-y-2">
                {hints.map((h, i) => (
                  <div
                    key={i}
                    className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5"
                  >
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      {h.emoji} {h.title}
                    </div>
                    <ul className="space-y-0.5">
                      {h.tips.map((tip, j) => (
                        <li
                          key={j}
                          className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed pr-3"
                          dir="auto"
                          style={{ unicodeBidi: "plaintext" }}
                        >
                          • {tip}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* AI + key tools — always visible on desktop, inside כלים on mobile */}
      <div className="hidden sm:flex gap-1.5 flex-wrap">
        <button
          onClick={() => setShowAI(true)}
          className="text-xs px-2.5 py-1 rounded-lg border border-violet-200 dark:border-violet-700 bg-violet-50 dark:bg-violet-900/30 text-violet-800 dark:text-violet-300 active:bg-violet-100"
        >
          🤖 AI ייעוץ
        </button>
        <button
          onClick={() => setShowScenario(true)}
          className="text-xs px-2.5 py-1 rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 active:bg-amber-100"
        >
          ⚡ תרחיש
        </button>
        <button
          onClick={() => setShowLabForm(!showLabForm)}
          className="text-xs px-2.5 py-1 rounded-lg border border-purple-200 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 active:bg-purple-100"
        >
          📊 Lab
        </button>
        {(patient.labs?.length ?? 0) >= 2 && (
          <button
            onClick={() => setShowLabChart(!showLabChart)}
            className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
              showLabChart
                ? "bg-purple-600 text-white border-purple-600"
                : "border-purple-200 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300"
            } active:bg-purple-100`}
          >
            📈 Lab Trend
          </button>
        )}
      </div>

      {/* Quick action buttons — collapsed by default (mobile), all tools */}
      <details className="group sm:hidden">
        <summary className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 cursor-pointer active:bg-gray-100 list-none flex items-center gap-1">
          <span className="text-sm">🔧</span> כלים
          <span className="text-gray-400 group-open:rotate-180 transition-transform">▾</span>
        </summary>
        <div className="flex gap-1.5 mt-2 flex-wrap">
        <button
          onClick={() => setShowScenario(true)}
          className="text-xs px-2.5 py-1 rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 active:bg-amber-100"
        >
          ⚡ תרחיש
        </button>
        <button
          onClick={() => setShowTemplates(true)}
          className="text-xs px-2.5 py-1 rounded-lg border border-indigo-200 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-300 active:bg-indigo-100"
        >
          📋 תבנית
        </button>
        <button
          onClick={() => setShowLabForm(!showLabForm)}
          className="text-xs px-2.5 py-1 rounded-lg border border-purple-200 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 active:bg-purple-100"
        >
          📊 Lab
        </button>
        <button
          onClick={() => setShowNurseTemplates(true)}
          className="text-xs px-2.5 py-1 rounded-lg border border-green-200 dark:border-green-700 bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-300 active:bg-green-100"
        >
          📱 אחות
        </button>
        <button
          onClick={() => setShowAI(true)}
          className="text-xs px-2.5 py-1 rounded-lg border border-violet-200 dark:border-violet-700 bg-violet-50 dark:bg-violet-900/30 text-violet-800 dark:text-violet-300 active:bg-violet-100"
        >
          🤖 AI
        </button>
        {(patient.labs?.length ?? 0) >= 2 && (
          <button
            onClick={() => setShowLabChart(!showLabChart)}
            className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
              showLabChart
                ? "bg-purple-600 text-white border-purple-600"
                : "border-purple-200 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300"
            } active:bg-purple-100`}
          >
            📈 תרשים
          </button>
        )}
        </div>
      </details>

      {showLabForm && (
        <AddLabForm patient={patient} onClose={() => setShowLabForm(false)} />
      )}

      {/* Lab trend charts */}
      {showLabChart && (
        <LabChart patient={patient} />
      )}

      {/* Sticky handover note */}
      <HandoverNoteInline patient={patient} />

      {/* Photo attachments */}
      <PhotoAttachments patient={patient} />

      {/* Tasks */}
      <div className="space-y-2">
        {allTasks.length === 0 ? (
          <div className="text-sm text-gray-500 dark:text-gray-400">אין משימות תורן</div>
        ) : (
          allTasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              onToggle={() => toggleTask(task)}
              onSetDue={(dueAt) =>
                dispatch({
                  type: "SET_TASK_DUE",
                  patientId: patient.id,
                  taskId: task.id,
                  dueAt,
                })
              }
              onSetNote={(note) =>
                dispatch({
                  type: "SET_TASK_NOTE",
                  patientId: patient.id,
                  taskId: task.id,
                  note,
                })
              }
            />
          ))
        )}
      </div>

      {/* Add manual task / note */}
      <div className="pt-2 border-t border-gray-100 dark:border-gray-700 space-y-2">
        {!addOpen ? (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="w-full py-2 rounded-xl border border-gray-200 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300"
          >
            + הוסף משימה / הערה
          </button>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAddType("task")}
                className={[
                  "px-3 py-1 rounded-lg text-sm border",
                  addType === "task"
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600",
                ].join(" ")}
              >
                משימה
              </button>
              <button
                type="button"
                onClick={() => setAddType("note")}
                className={[
                  "px-3 py-1 rounded-lg text-sm border",
                  addType === "note"
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600",
                ].join(" ")}
              >
                הערה
              </button>

              <button
                type="button"
                onClick={() => {
                  setAddOpen(false);
                  setDraft("");
                }}
                className="ml-auto px-3 py-1 rounded-lg text-sm border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300"
              >
                סגור
              </button>
            </div>

            <div className="flex items-center gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") add();
                  if (e.key === "Escape") setAddOpen(false);
                }}
                dir="auto"
                style={{ unicodeBidi: "plaintext" }}
                placeholder={
                  addType === "task"
                    ? "משימה חדשה (למשל: BS)"
                    : "הערה (למשל: BS 250ml)"
                }
                className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-400 outline-none"
              />
              {addType === "task" && (
                <VoiceButton onResult={(text) => { setDraft(text); }} />
              )}
              <button
                type="button"
                onClick={add}
                className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm"
              >
                הוסף
              </button>
            </div>

            <div className="text-xs text-gray-500">
              הערה נשמרת אצל המטופל, משימה נספרת במונה תורן.
            </div>
          </div>
        )}
      </div>

      {showScenario && (
        <QuickScenario patient={patient} onClose={() => setShowScenario(false)} />
      )}
      {showTemplates && (
        <TaskTemplates patient={patient} onClose={() => setShowTemplates(false)} />
      )}
      {showNurseTemplates && (
        <NurseTemplates patient={patient} onClose={() => setShowNurseTemplates(false)} />
      )}
      {showAI && (
        <AIClinicalReasoning patient={patient} onClose={() => setShowAI(false)} />
      )}
    </div>
  );
}

export function PatientRow({ patient }: { patient: PatientEntry }) {
  const dispatch = usePatientsDispatch();
  const { showTomorrow } = usePatientsState();

  const [expanded, setExpanded] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addType, setAddType] = useState<"task" | "note">("task");
  const [draft, setDraft] = useState("");

  const manualNotes = patient.notes ?? [];

  const allTasks = sortTasks([...patient.tasks, ...patient.generatedTasks]);
  const doneCount = allTasks.filter((t) => t.done).length;
  const totalCount = allTasks.length;

  const toggleTask = useCallback((task: Task) => {
    dispatch({ type: "TOGGLE_TASK", patientId: patient.id, taskId: task.id });
    if (!task.done) {
      hapticSuccess();
      showUndoToast({
        id: task.id,
        message: `✅ ${task.text.slice(0, 40)}${task.text.length > 40 ? "..." : ""}`,
        onUndo: () => dispatch({ type: "TOGGLE_TASK", patientId: patient.id, taskId: task.id }),
      });
    }
  }, [dispatch, patient.id]);

  const add = () => {
    const text = draft.trim();
    if (!text) return;

    if (addType === "task") {
      dispatch({ type: "ADD_TASK", patientId: patient.id, text });
    } else {
      dispatch({ type: "ADD_NOTE", patientId: patient.id, text });
    }

    setDraft("");
  };

  return (
    <>
      <tr
        onClick={() => setExpanded(!expanded)}
        className={`
          border-b border-gray-100 dark:border-gray-700 transition-colors
          cursor-pointer
          ${expanded ? "bg-blue-50/30 dark:bg-blue-900/20" : "hover:bg-gray-50 dark:hover:bg-gray-800"}
        `}
      >
        <td className="py-2.5 px-4 font-mono font-bold text-blue-600 dark:text-blue-400 text-sm whitespace-nowrap">
          {patient.room ?? "—"}
        </td>
        <td className="py-2.5 px-4 font-semibold text-gray-900 dark:text-gray-100 text-sm whitespace-nowrap">
          <div className="flex items-center gap-1.5">
            {isNewThisShift(patient) && <NewBadge />}
            {patient.name ?? "לא ידוע"}
          </div>
        </td>
        <td className="py-2.5 px-4 text-gray-500 dark:text-gray-400 text-sm tabular-nums">
          {patient.age ?? "—"}
        </td>
        <td className="py-2.5 px-4 text-gray-600 dark:text-gray-300 text-sm max-w-xs truncate" dir="auto">
          {patient.diagnosis ?? "—"}
        </td>
        <td className="py-2.5 px-4">
          <div className="flex flex-wrap gap-1">
            {patient.flags.map((f) => (
              <FlagBadge key={f} flag={f} />
            ))}
          </div>
        </td>
        <td className="py-2.5 px-4 text-center">
          <div className="inline-flex items-center justify-center gap-2">
            <TaskProgress done={doneCount} total={totalCount} />
            <span className="text-gray-400 text-sm">{expanded ? "▴" : "▾"}</span>
          </div>
        </td>
      </tr>

      {expanded && (
        <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
          <td colSpan={6} className="px-8 py-3">
            <div className="space-y-3 max-w-3xl">
              {patient.status.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {patient.status.map((s, i) => (
                    <span
                      key={i}
                      dir="auto"
                      className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded"
                      style={{ unicodeBidi: "plaintext" }}
                    >
                      {s}
                    </span>
                  ))}
                </div>
              )}

              {showTomorrow && patient.tomorrowNotes.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-green-700 dark:text-green-400">מחר</div>
                  <div className="flex flex-wrap gap-1.5">
                    {patient.tomorrowNotes.map((s, i) => (
                      <span
                        key={i}
                        dir="auto"
                        className="text-xs bg-green-50 text-green-900 dark:bg-green-900/30 dark:text-green-300 px-2 py-0.5 rounded border border-green-200 dark:border-green-800"
                        style={{ unicodeBidi: "plaintext" }}
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {(patient.planNotes?.length ?? 0) > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">תכנית</div>
                  <div className="flex flex-wrap gap-1.5">
                    {patient.planNotes!.map((s, i) => (
                      <span
                        key={i}
                        dir="auto"
                        className="text-xs bg-indigo-50 text-indigo-900 dark:bg-indigo-900/30 dark:text-indigo-300 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800"
                        style={{ unicodeBidi: "plaintext" }}
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {manualNotes.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {manualNotes.map((n, idx) => (
                    <span
                      key={idx}
                      dir="auto"
                      className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-900 dark:bg-blue-900/30 dark:text-blue-300 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800"
                      style={{ unicodeBidi: "plaintext" }}
                      title="הערת תורן"
                    >
                      {n}
                      <button
                        type="button"
                        onClick={() =>
                          dispatch({
                            type: "REMOVE_NOTE",
                            patientId: patient.id,
                            index: idx,
                          })
                        }
                        className="ml-1 text-blue-700 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300"
                        aria-label="מחק הערה"
                        title="מחק"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {allTasks.length > 0 && (
                <div className="space-y-1.5">
                  {allTasks.map((task) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      onToggle={() => toggleTask(task)}
                      onSetDue={(dueAt) =>
                dispatch({
                  type: "SET_TASK_DUE",
                  patientId: patient.id,
                  taskId: task.id,
                  dueAt,
                })
              }
              onSetNote={(note) =>
                        dispatch({
                          type: "SET_TASK_NOTE",
                          patientId: patient.id,
                          taskId: task.id,
                          note,
                        })
                      }
                    />
                  ))}
                </div>
              )}

              {/* Add manual task / note */}
              <div className="pt-2 border-t border-gray-200 dark:border-gray-700 space-y-2">
                {!addOpen ? (
                  <button
                    type="button"
                    onClick={() => setAddOpen(true)}
                    className="w-full py-2 rounded-xl border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800"
                  >
                    + הוסף משימה / הערה
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setAddType("task")}
                        className={[
                          "px-3 py-1 rounded-lg text-sm border",
                          addType === "task"
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600",
                        ].join(" ")}
                      >
                        משימה
                      </button>
                      <button
                        type="button"
                        onClick={() => setAddType("note")}
                        className={[
                          "px-3 py-1 rounded-lg text-sm border",
                          addType === "note"
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600",
                        ].join(" ")}
                      >
                        הערה
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setAddOpen(false);
                          setDraft("");
                        }}
                        className="ml-auto px-3 py-1 rounded-lg text-sm border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300"
                      >
                        סגור
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") add();
                          if (e.key === "Escape") setAddOpen(false);
                        }}
                        dir="auto"
                        style={{ unicodeBidi: "plaintext" }}
                        placeholder={
                          addType === "task"
                            ? "משימה חדשה"
                            : "הערה (תורן)"
                        }
                        className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-400 outline-none"
                      />
                      <button
                        type="button"
                        onClick={add}
                        className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm"
                      >
                        הוסף
                      </button>
                    </div>

                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      הערה נשמרת אצל המטופל, משימה נספרת במונה תורן.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

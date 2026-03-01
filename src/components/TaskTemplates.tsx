import { useState } from "react";
import { usePatientsDispatch } from "../context/PatientsContext";
import type { PatientEntry, Urgency } from "../types";
import { safeGetItem, safeSetItem } from "../utils/storage";

const TEMPLATES_KEY = "toranot_task_templates";

interface TaskTemplate {
  id: string;
  name: string;
  tasks: Array<{ text: string; urgency: Urgency }>;
}

function loadTemplates(): TaskTemplate[] {
  const raw = safeGetItem(TEMPLATES_KEY);
  if (!raw) return defaultTemplates();
  try {
    const parsed = JSON.parse(raw) as TaskTemplate[];
    return Array.isArray(parsed) ? parsed : defaultTemplates();
  } catch {
    return defaultTemplates();
  }
}

function saveTemplates(templates: TaskTemplate[]) {
  safeSetItem(TEMPLATES_KEY, JSON.stringify(templates));
}

function defaultTemplates(): TaskTemplate[] {
  return [
    {
      id: "tpl-admission",
      name: "קבלה חדשה",
      tasks: [
        { text: "בדיקות קבלה: CBC, BMP, LFT, Coag", urgency: "stat" },
        { text: "צילום חזה + א.ק.ג", urgency: "urgent" },
        { text: "סקירת תרופות + פיוס תרופתי", urgency: "urgent" },
        { text: "הערכת סיכון נפילות + פצעי לחץ", urgency: "morning" },
        { text: "DVT prophylaxis", urgency: "routine" },
      ],
    },
    {
      id: "tpl-discharge",
      name: "שחרור",
      tasks: [
        { text: "סיכום שחרור", urgency: "morning" },
        { text: "מרשמים לבית", urgency: "morning" },
        { text: "הזמנת תור מעקב", urgency: "routine" },
        { text: "הסבר למטופל/משפחה", urgency: "routine" },
      ],
    },
    {
      id: "tpl-preop",
      name: "לפני ניתוח",
      tasks: [
        { text: "צום מחצות", urgency: "urgent" },
        { text: "CBC, BMP, Coag, T&S", urgency: "stat" },
        { text: "א.ק.ג + צילום חזה", urgency: "urgent" },
        { text: "הסכמה חתומה", urgency: "morning" },
        { text: "הפסק נוגדי קרישה", urgency: "stat" },
      ],
    },
  ];
}

export function TaskTemplates({
  patient,
  onClose,
}: {
  patient: PatientEntry;
  onClose: () => void;
}) {
  const dispatch = usePatientsDispatch();
  const [templates, setTemplates] = useState(loadTemplates);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const applyTemplate = (template: TaskTemplate) => {
    for (const t of template.tasks) {
      dispatch({
        type: "ADD_TASK",
        patientId: patient.id,
        text: t.text,
        urgency: t.urgency,
      });
    }
    onClose();
  };

  const saveCurrentAsTemplate = () => {
    const name = newName.trim();
    if (!name) return;
    const allTasks = [...patient.tasks, ...patient.generatedTasks].filter((t) => !t.done);
    if (allTasks.length === 0) return;

    const newTemplate: TaskTemplate = {
      id: `tpl-${Date.now()}`,
      name,
      tasks: allTasks.map((t) => ({ text: t.text, urgency: t.urgency })),
    };
    const updated = [...templates, newTemplate];
    setTemplates(updated);
    saveTemplates(updated);
    setCreating(false);
    setNewName("");
  };

  const deleteTemplate = (id: string) => {
    const updated = templates.filter((t) => t.id !== id);
    setTemplates(updated);
    saveTemplates(updated);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 w-full rounded-t-2xl max-h-[60vh] overflow-y-auto pb-safe shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
              תבניות משימות
            </h3>
            <p className="text-xs text-gray-500">בחר תבנית או שמור את הנוכחית</p>
          </div>
          <button onClick={onClose} className="text-gray-400 text-lg px-2">✕</button>
        </div>

        <div className="p-4 space-y-2">
          {templates.map((tpl) => (
            <div
              key={tpl.id}
              className="flex items-center gap-2 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
            >
              <button
                onClick={() => applyTemplate(tpl)}
                className="flex-1 text-right"
              >
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{tpl.name}</div>
                <div className="text-xs text-gray-500">{tpl.tasks.length} משימות</div>
              </button>
              {!tpl.id.startsWith("tpl-admission") && !tpl.id.startsWith("tpl-discharge") && !tpl.id.startsWith("tpl-preop") && (
                <button
                  onClick={() => deleteTemplate(tpl.id)}
                  className="text-xs text-red-500 px-2 py-1"
                  title="מחק תבנית"
                >
                  🗑️
                </button>
              )}
            </div>
          ))}

          {creating ? (
            <div className="flex items-center gap-2 p-3 rounded-xl border border-purple-300 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/20">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveCurrentAsTemplate(); }}
                placeholder="שם התבנית"
                dir="auto"
                autoFocus
                className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
              <button
                onClick={saveCurrentAsTemplate}
                className="px-3 py-1 text-xs bg-purple-600 text-white rounded-lg"
              >
                שמור
              </button>
              <button
                onClick={() => setCreating(false)}
                className="px-2 py-1 text-xs text-gray-500"
              >
                ביטול
              </button>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="w-full py-3 text-sm text-purple-600 dark:text-purple-400 border border-dashed border-purple-300 dark:border-purple-700 rounded-xl active:bg-purple-50 dark:active:bg-purple-900/20"
            >
              + שמור משימות נוכחיות כתבנית
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import type { PatientEntry, Section } from "../types";
import { usePatientsState, usePatientsDispatch } from "../context/PatientsContext";
import { generateId } from "../utils/id";

const SIDE_TO_SECTION: Record<"A" | "B" | "C", Section> = {
  A: "SIDE_A",
  B: "SIDE_B",
  C: "SIDE_C",
};

interface Props {
  onClose: () => void;
}

export function AddAdmissionModal({ onClose }: Props) {
  const { patients } = usePatientsState();
  const dispatch = usePatientsDispatch();

  const [side, setSide] = useState<"A" | "B" | "C">("A");
  const [room, setRoom] = useState("");
  const [bed, setBed] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [status, setStatus] = useState<"" | "DNR" | "DNI" | "DNR/DNI">("");
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState<string | null>(null);

  function validate(): string | null {
    if (!side) return "יש לבחור צד";
    if (!room.trim() || isNaN(Number(room.trim()))) return "יש להזין מספר חדר תקין";
    if (!name.trim()) return "יש להזין שם מטופל";
    if (!diagnosis.trim()) return "יש להזין אבחנה";
    return null;
  }

  function isDuplicateBed(): boolean {
    const section = SIDE_TO_SECTION[side as "A" | "B" | "C"];
    const roomStr = `${room.trim()}/${bed}`;
    return patients.some((p: PatientEntry) => p.section === section && p.room === roomStr);
  }

  function handleSubmit() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    if (isDuplicateBed()) {
      setError(`מיטה ${bed} בחדר ${room} (צד ${side}) כבר תפוסה`);
      return;
    }

    const section = SIDE_TO_SECTION[side as "A" | "B" | "C"];
    const roomStr = `${room.trim()}/${bed}`;

    const patient: PatientEntry = {
      id: generateId("pt-"),
      section,
      date: (() => {
        const d = new Date();
        return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
      })(),
      room: roomStr,
      bed: bed,
      name: name.trim(),
      age: undefined,
      diagnosis: diagnosis.trim(),
      status: status ? [status] : [],
      flags: [],
      tasks: [],
      generatedTasks: [],
      tomorrowNotes: [],
      planNotes: [],
      notes: remarks.trim() ? [remarks.trim()] : [],
      labs: [],
      scannedAt: new Date().toISOString(),
      confidence: 1,
      order: Date.now(),
    } as unknown as PatientEntry;

    dispatch({ type: "ADD_PATIENT", patient });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-5 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">קבלה חדשה</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xl px-1"
          >
            ×
          </button>
        </div>

        {error && (
          <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
            {error}
          </div>
        )}

        {/* Side + Room + Bed — one row */}
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">צד *</label>
            <select
              value={side}
              onChange={(e) => setSide(e.target.value as "A" | "B" | "C")}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            >
              <option value="A">צד א</option>
              <option value="B">צד ב</option>
              <option value="C">צד ג</option>
            </select>
          </div>

          <div className="flex-1">
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">חדר *</label>
            <input
              type="number"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              placeholder="49"
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            />
          </div>

          <div className="w-24">
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">מיטה *</label>
            <select
              value={bed}
              onChange={(e) => setBed(Number(e.target.value) as 1 | 2 | 3)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </div>
        </div>

        {/* Name */}
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">שם מטופל *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="כהן יוסף"
            dir="auto"
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          />
        </div>

        {/* Diagnosis */}
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">אבחנה *</label>
          <input
            type="text"
            value={diagnosis}
            onChange={(e) => setDiagnosis(e.target.value)}
            placeholder="דלקת ריאות"
            dir="auto"
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          />
        </div>

        {/* Status (optional) */}
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">סטטוס</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          >
            <option value="">ללא</option>
            <option value="DNR">DNR</option>
            <option value="DNI">DNI</option>
            <option value="DNR/DNI">DNR/DNI</option>
          </select>
        </div>

        {/* Remarks (optional) */}
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">הערות</label>
          <textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="הערות נוספות..."
            dir="auto"
            rows={2}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSubmit}
            className="flex-1 py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold active:bg-blue-700"
          >
            הוסף מטופל
          </button>
          <button
            onClick={onClose}
            className="px-5 py-3 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl text-sm active:bg-gray-100 dark:active:bg-gray-700"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}

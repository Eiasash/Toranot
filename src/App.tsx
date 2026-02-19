import { useState } from "react";
import { PatientsProvider } from "./context/PatientsContext";
import { SectionTabs } from "./components/SectionTabs";
import { InputArea } from "./components/InputArea";
import { PatientList } from "./components/PatientList";
import { QuickReference } from "./components/QuickReference";
import { usePatientsDispatch, usePatientsState } from "./context/PatientsContext";


function TomorrowToggle() {
  const { showTomorrow } = usePatientsState();
  const dispatch = usePatientsDispatch();
  return (
    <button
      onClick={() => dispatch({ type: "TOGGLE_SHOW_TOMORROW" })}
      className={
        "text-xs px-2 py-1 rounded-lg border transition-colors " +
        (showTomorrow
          ? "bg-amber-200 text-amber-900 border-amber-300"
          : "bg-slate-700 text-slate-200 border-slate-600 active:bg-slate-600")
      }
      title="הצג/הסתר משימות למחר"
    >
      מחר
    </button>
  );
}

function ShiftProgressBar() {
  const { patients, activeSection } = usePatientsState();
  const sectionPatients = patients.filter((p) => p.section === activeSection);

  let total = 0;
  let done = 0;
  for (const p of sectionPatients) {
    for (const t of p.tasks) {
      total++;
      if (t.done) done++;
    }
    for (const t of p.generatedTasks) {
      total++;
      if (t.done) done++;
    }
  }

  if (total === 0) return null;

  const pct = Math.round((done / total) * 100);

  return (
    <div className="h-1 bg-slate-700/50 w-full">
      <div
        className={
          "h-full transition-all duration-300 " +
          (pct === 100 ? "bg-green-400" : pct >= 50 ? "bg-blue-400" : "bg-amber-400")
        }
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function QuickRefButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-xs px-2 py-1 rounded-lg border transition-colors bg-slate-700 text-slate-200 border-slate-600 active:bg-slate-600 hover:bg-slate-600"
      title="עזר קליני מהיר"
    >
      עזר קליני
    </button>
  );
}

function AppContent() {
  const [showRef, setShowRef] = useState(false);

  return (
    <div className="min-h-dvh bg-white flex flex-col">
      <header className="bg-slate-800 text-white px-4 py-3 safe-top border-b border-slate-700">
        <div className="w-full lg:max-w-6xl lg:mx-auto flex items-baseline gap-3">
          <div className="ml-auto flex items-center gap-2">
            <QuickRefButton onClick={() => setShowRef(true)} />
            <TomorrowToggle />
          </div>
          <h1 className="text-lg font-bold tracking-tight">תורנות</h1>
          <p className="text-slate-400 text-xs">ניהול משמרת מחלקתי</p>
        </div>
      </header>

      <ShiftProgressBar />

      <div className="w-full lg:max-w-6xl lg:mx-auto">
        <InputArea />
      </div>

      <SectionTabs />

      <main className="flex-1 border-t border-gray-200 bg-gray-50 lg:bg-white">
        <div className="w-full lg:max-w-6xl lg:mx-auto">
          <PatientList />
        </div>
      </main>

      {showRef && <QuickReference onClose={() => setShowRef(false)} />}
    </div>
  );
}

export function App() {
  return (
    <PatientsProvider>
      <AppContent />
    </PatientsProvider>
  );
}

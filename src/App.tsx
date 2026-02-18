import { PatientsProvider } from "./context/PatientsContext";
import { SectionTabs } from "./components/SectionTabs";
import { InputArea } from "./components/InputArea";
import { PatientList } from "./components/PatientList";
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

export function App() {
  return (
    <PatientsProvider>
      <div className="min-h-dvh bg-white flex flex-col">
        <header className="bg-slate-800 text-white px-4 py-3 safe-top border-b border-slate-700">
          <div className="w-full lg:max-w-6xl lg:mx-auto flex items-baseline gap-3">
            <div className="ml-auto flex items-center gap-2">
              <TomorrowToggle />
            </div>
            <h1 className="text-lg font-bold tracking-tight">תורנות</h1>
            <p className="text-slate-400 text-xs">ניהול משמרת מחלקתי</p>
          </div>
        </header>

        <div className="w-full lg:max-w-6xl lg:mx-auto">
          <InputArea />
        </div>

        <SectionTabs />

        <main className="flex-1 border-t border-gray-200 bg-gray-50 lg:bg-white">
          <div className="w-full lg:max-w-6xl lg:mx-auto">
            <PatientList />
          </div>
        </main>
      </div>
    </PatientsProvider>
  );
}

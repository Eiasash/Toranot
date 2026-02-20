import { SECTIONS, SECTION_LABEL, type Section } from "../types";
import { usePatientsState, usePatientsDispatch } from "../context/PatientsContext";

export function SectionTabs() {
  const { activeSection, patients } = usePatientsState();
  const dispatch = usePatientsDispatch();

  function countForSection(section: Section): number {
    return patients.filter((p) => p.section === section).length;
  }

  return (
    <nav
      className="sticky top-0 z-20 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 shadow-sm"
      role="tablist"
      aria-label="מחלקות"
    >
      <div className="lg:max-w-6xl lg:mx-auto flex overflow-x-auto flex-nowrap scrollbar-hide">
        {SECTIONS.map((section) => {
          const count = countForSection(section);
          const isActive = section === activeSection;
          return (
            <button
              key={section}
              role="tab"
              aria-selected={isActive}
              aria-controls={`panel-${section}`}
              onClick={() => dispatch({ type: "SET_SECTION", section })}
              className={`
                flex-none min-w-[80px] py-3 px-4 text-sm font-medium whitespace-nowrap
                border-b-2 transition-colors
                ${isActive
                  ? "border-blue-600 text-blue-700 dark:text-blue-400"
                  : "border-transparent text-gray-500 active:bg-gray-50 dark:active:bg-gray-800"
                }
              `}
            >
              {SECTION_LABEL[section]}
              {count > 0 && (
                <span
                  className={`
                    mr-1.5 inline-flex items-center justify-center rounded-full text-xs
                    min-w-[1.25rem] h-5 px-1
                    ${isActive ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" : "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300"}
                  `}
                  aria-label={`${count} חולים`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

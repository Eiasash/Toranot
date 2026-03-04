import { describe, it, expect } from "vitest";
import { buildPatientPhlebEntry, buildPhlebotomyList, buildPhlebotomyText } from "../utils/phlebotomy";
import type { PatientEntry, Task } from "../types";

function makePatient(overrides: Partial<PatientEntry> = {}): PatientEntry {
  return {
    id: "p-1", name: "כהן דוד", room: "12", age: 78,
    section: "GENERAL", diagnosis: "", flags: [], status: [], notes: [],
    tasks: [], generatedTasks: [], labs: [], photos: [],
    handoverNote: "", isAdmission: false, discharged: false,
    scannedAt: null, tomorrowNotes: [],
    ...overrides,
  };
}

function makeTask(text: string, category: Task["category"] = "labs"): Task {
  return {
    id: "t-1", text, urgency: "routine", source: "manual",
    done: false, doneTime: null, time: null, category,
  };
}

describe("buildPatientPhlebEntry", () => {
  it("returns null when no pending lab tasks", () => {
    expect(buildPatientPhlebEntry(makePatient())).toBeNull();
  });

  it("returns null when lab task is done", () => {
    const p = makePatient({ tasks: [{ ...makeTask("CBC"), done: true, doneTime: new Date().toISOString() }] });
    expect(buildPatientPhlebEntry(p)).toBeNull();
  });

  it("classifies CBC → purple tube", () => {
    const p = makePatient({ tasks: [makeTask("CBC")] });
    const entry = buildPatientPhlebEntry(p);
    expect(entry).not.toBeNull();
    expect(entry!.tubes).toContain("purple");
    expect(entry!.tests).toContain("CBC");
  });

  it("classifies PT/INR → blue tube", () => {
    const p = makePatient({ tasks: [makeTask("PT/INR check")] });
    const entry = buildPatientPhlebEntry(p);
    expect(entry!.tubes).toContain("blue");
  });

  it("classifies blood cultures → yellow tube", () => {
    const p = makePatient({ tasks: [makeTask("blood cultures x2")] });
    const entry = buildPatientPhlebEntry(p);
    expect(entry!.tubes).toContain("yellow");
  });

  it("classifies lactate → green tube", () => {
    const p = makePatient({ tasks: [makeTask("lactate level")] });
    const entry = buildPatientPhlebEntry(p);
    expect(entry!.tubes).toContain("green");
  });

  it("classifies CMP → red tube", () => {
    const p = makePatient({ tasks: [makeTask("CMP")] });
    const entry = buildPatientPhlebEntry(p);
    expect(entry!.tubes).toContain("red");
  });

  it("multi-panel task assigns multiple tubes", () => {
    const p = makePatient({ tasks: [makeTask("CBC, CMP, PT/INR")] });
    const entry = buildPatientPhlebEntry(p);
    expect(entry!.tubes).toContain("purple"); // CBC
    expect(entry!.tubes).toContain("red");    // CMP
    expect(entry!.tubes).toContain("blue");   // PT/INR
  });

  it("isUrgent=true for stat lab task", () => {
    const p = makePatient({ tasks: [{ ...makeTask("Troponin"), urgency: "stat" }] });
    expect(buildPatientPhlebEntry(p)!.isUrgent).toBe(true);
  });

  it("isUrgent=false for routine lab task", () => {
    const p = makePatient({ tasks: [makeTask("TSH")] });
    expect(buildPatientPhlebEntry(p)!.isUrgent).toBe(false);
  });

  it("ignores non-lab category tasks", () => {
    const p = makePatient({ tasks: [makeTask("IV access", "procedure")] });
    expect(buildPatientPhlebEntry(p)).toBeNull();
  });

  it("ignores dismissed generated tasks", () => {
    const p = makePatient({
      generatedTasks: [{ ...makeTask("CBC"), id: "g-1", source: "generated", confidence: 1, generatedFrom: "sepsis", dismissed: true }],
    });
    expect(buildPatientPhlebEntry(p)).toBeNull();
  });

  it("falls back to red tube for unrecognised lab text", () => {
    const p = makePatient({ tasks: [makeTask("special immunology panel X17")] });
    const entry = buildPatientPhlebEntry(p);
    expect(entry!.tubes).toContain("red");
  });
});

describe("buildPhlebotomyList", () => {
  it("returns empty array for no patients with labs", () => {
    expect(buildPhlebotomyList([makePatient()])).toHaveLength(0);
  });

  it("sorts urgent patients first", () => {
    const urgent = makePatient({ id: "u", room: "20", tasks: [{ ...makeTask("Troponin"), urgency: "stat" }] });
    const routine = makePatient({ id: "r", room: "5", tasks: [makeTask("TSH")] });
    const list = buildPhlebotomyList([routine, urgent]);
    expect(list[0].patientId).toBe("u");
  });

  it("deduplicates — only patients with lab tasks included", () => {
    const withLab = makePatient({ id: "l", tasks: [makeTask("CBC")] });
    const noLab = makePatient({ id: "n" });
    expect(buildPhlebotomyList([withLab, noLab])).toHaveLength(1);
  });
});

describe("buildPhlebotomyText", () => {
  it("returns no-labs message for empty list", () => {
    expect(buildPhlebotomyText([])).toContain("אין בדיקות");
  });

  it("includes patient name and room in output", () => {
    const p = makePatient({ name: "לוי שרה", room: "7", tasks: [makeTask("CBC")] });
    const text = buildPhlebotomyText(buildPhlebotomyList([p]));
    expect(text).toContain("לוי שרה");
    expect(text).toContain("7");
  });

  it("marks urgent patients with ⚡", () => {
    const p = makePatient({ tasks: [{ ...makeTask("Troponin"), urgency: "stat" }] });
    const text = buildPhlebotomyText(buildPhlebotomyList([p]));
    expect(text).toContain("⚡");
  });
});

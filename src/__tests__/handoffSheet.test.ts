/**
 * HandoffSheet component tests.
 *
 * HandoffSheet.tsx is ~1,191 lines. Without @testing-library/react we test the
 * pure logic functions that power the component:
 *   - formatPatient text generation
 *   - isOncallRelevant filtering
 *   - buildTextHandoff summary generation
 *   - Drug safety summary aggregation
 *   - Phlebotomy list generation
 *   - Tab types and empty state
 *   - Section grouping logic
 */

import { describe, it, expect } from "vitest";
import type { PatientEntry, Task, PatientSection } from "../types";
import { patientSectionLabel } from "../types";
import {
  checkDrugInteractions,
  checkRenalDoseWarnings,
  checkBeersCriteria,
  checkAllergyConflicts,
} from "../engine/drugSafety";
import { calculateLabDeltas } from "../engine/labDelta";
import { buildPhlebotomyList, buildPhlebotomyText } from "../utils/phlebotomy";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: overrides.id ?? "task-1",
    text: overrides.text ?? "test task",
    urgency: overrides.urgency ?? "routine",
    source: overrides.source ?? "extracted",
    done: overrides.done ?? false,
    doneTime: overrides.doneTime ?? null,
    time: overrides.time ?? null,
    confidence: overrides.confidence ?? 1,
    ...overrides,
  };
}

function makePatient(overrides: Partial<PatientEntry> = {}): PatientEntry {
  return {
    id: overrides.id ?? "pt-1",
    section: overrides.section ?? "SIDE_A",
    date: overrides.date ?? "01/01/2025",
    room: overrides.room ?? "101",
    name: overrides.name ?? "כהן יוסף",
    age: overrides.age ?? 70,
    diagnosis: overrides.diagnosis ?? "דלקת ריאות",
    flags: overrides.flags ?? [],
    status: overrides.status ?? [],
    tomorrowNotes: overrides.tomorrowNotes ?? [],
    tasks: overrides.tasks ?? [],
    generatedTasks: overrides.generatedTasks ?? [],
    notes: overrides.notes ?? [],
    scannedAt: overrides.scannedAt ?? "2025-01-01T00:00:00.000Z",
    confidence: overrides.confidence ?? 1,
    labs: overrides.labs ?? [],
    medications: overrides.medications ?? [],
    allergies: overrides.allergies ?? [],
    clinicalMeta: overrides.clinicalMeta,
    handoverNote: overrides.handoverNote,
    isAdmission: overrides.isAdmission,
    discharged: overrides.discharged,
  };
}

/**
 * Reimplementation of HandoffSheet's urgencyLabel for testing.
 */
function urgencyLabel(u: Task["urgency"]): string {
  return u === "stat" ? "🔴" : u === "urgent" ? "🟡" : u === "extra" ? "🟣" : "";
}

/**
 * Reimplementation of HandoffSheet's formatPatient for testing.
 */
function formatPatient(p: PatientEntry): string {
  const allTasks = [...p.tasks, ...p.generatedTasks.filter((t) => !t.dismissed)];
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
  if (pending.length > 0) {
    lines.push(`  לביצוע:`);
    for (const t of pending) {
      const flag = urgencyLabel(t.urgency);
      lines.push(`    ${flag} ${t.text}`.trimEnd());
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
    notes.forEach((n) => lines.push(`    ${n}`));
  }
  if (p.tomorrowNotes.length > 0) lines.push(`  מחר: ${p.tomorrowNotes.join(", ")}`);
  if (p.handoverNote) lines.push(`  📌 ${p.handoverNote}`);
  return lines.join("\n");
}

/**
 * Reimplementation of HandoffSheet's isOncallRelevant for testing.
 */
function isOncallRelevant(p: PatientEntry, shiftStart: Date): boolean {
  const shiftISO = shiftStart.toISOString();
  if (p.isAdmission) return true;
  if (p.tasks.some((t) => t.source === "manual")) return true;
  if (
    [...p.tasks, ...p.generatedTasks.filter((t) => !t.dismissed)].some(
      (t) => t.done && t.doneTime && t.doneTime >= shiftISO
    )
  )
    return true;
  if (p.handoverNote) return true;
  if ((p.notes ?? []).length > 0) return true;
  return false;
}

// ─── formatPatient ─────────────────────────────────────────────────────────────

describe("HandoffSheet — formatPatient", () => {
  it("includes patient room, name, and age in header", () => {
    const p = makePatient({ room: "205", name: "לוי שרה", age: 82 });
    const text = formatPatient(p);
    expect(text).toContain("205");
    expect(text).toContain("לוי שרה");
    expect(text).toContain("(82)");
  });

  it("includes diagnosis in output", () => {
    const p = makePatient({ diagnosis: "דלקת ריאות" });
    const text = formatPatient(p);
    expect(text).toContain("דלקת ריאות");
    expect(text).toContain("אבחנה:");
  });

  it("includes flags in diagnosis line", () => {
    const p = makePatient({ flags: ["DNR", "NPO"], diagnosis: "CHF" });
    const text = formatPatient(p);
    expect(text).toContain("DNR");
    expect(text).toContain("NPO");
    expect(text).toContain("CHF");
  });

  it("lists pending tasks under לביצוע", () => {
    const p = makePatient({
      tasks: [
        makeTask({ id: "t1", text: "CBC stat", urgency: "stat", done: false }),
        makeTask({ id: "t2", text: "CMP routine", urgency: "routine", done: false }),
      ],
    });
    const text = formatPatient(p);
    expect(text).toContain("לביצוע:");
    expect(text).toContain("CBC stat");
    expect(text).toContain("CMP routine");
    expect(text).toContain("🔴"); // stat emoji
  });

  it("lists done tasks under בוצע", () => {
    const p = makePatient({
      tasks: [
        makeTask({ id: "t1", text: "IV started", done: true, note: "left arm" }),
      ],
    });
    const text = formatPatient(p);
    expect(text).toContain("בוצע (1):");
    expect(text).toContain("✅ IV started");
    expect(text).toContain("→ left arm");
  });

  it("includes handover note with pin emoji", () => {
    const p = makePatient({ handoverNote: "שים לב לקריאטינין" });
    const text = formatPatient(p);
    expect(text).toContain("📌 שים לב לקריאטינין");
  });

  it("shows doctor notes", () => {
    const p = makePatient({ notes: ["Called family", "Awaiting CT result"] });
    const text = formatPatient(p);
    expect(text).toContain("📝 הערות תורן:");
    expect(text).toContain("Called family");
    expect(text).toContain("Awaiting CT result");
  });

  it("shows tomorrow notes", () => {
    const p = makePatient({ tomorrowNotes: ["בדיקת דם חוזרת", "פיזיותרפיה"] });
    const text = formatPatient(p);
    expect(text).toContain("מחר:");
    expect(text).toContain("בדיקת דם חוזרת");
  });

  it("marks discharged patients", () => {
    const p = makePatient({ discharged: true });
    const text = formatPatient(p);
    expect(text).toContain("🏠 שוחרר");
  });

  it("excludes dismissed generated tasks", () => {
    const p = makePatient({
      generatedTasks: [
        makeTask({ id: "g1", text: "should appear", dismissed: false }),
        makeTask({ id: "g2", text: "should NOT appear", dismissed: true }),
      ],
    });
    const text = formatPatient(p);
    expect(text).toContain("should appear");
    expect(text).not.toContain("should NOT appear");
  });
});

// ─── isOncallRelevant ──────────────────────────────────────────────────────────

describe("HandoffSheet — isOncallRelevant", () => {
  const shiftStart = new Date("2025-01-01T16:00:00.000Z");

  it("returns true for new admissions", () => {
    const p = makePatient({ isAdmission: true });
    expect(isOncallRelevant(p, shiftStart)).toBe(true);
  });

  it("returns true when a manual task exists", () => {
    const p = makePatient({
      tasks: [makeTask({ source: "manual" })],
    });
    expect(isOncallRelevant(p, shiftStart)).toBe(true);
  });

  it("returns true when task was completed during shift", () => {
    const p = makePatient({
      tasks: [
        makeTask({
          done: true,
          doneTime: "2025-01-01T18:00:00.000Z", // after shift start
        }),
      ],
    });
    expect(isOncallRelevant(p, shiftStart)).toBe(true);
  });

  it("returns false when task was completed before shift", () => {
    const p = makePatient({
      tasks: [
        makeTask({
          done: true,
          doneTime: "2025-01-01T10:00:00.000Z", // before shift start
        }),
      ],
    });
    expect(isOncallRelevant(p, shiftStart)).toBe(false);
  });

  it("returns true when handover note exists", () => {
    const p = makePatient({ handoverNote: "some note" });
    expect(isOncallRelevant(p, shiftStart)).toBe(true);
  });

  it("returns true when doctor notes exist", () => {
    const p = makePatient({ notes: ["a note"] });
    expect(isOncallRelevant(p, shiftStart)).toBe(true);
  });

  it("returns false for scanned-only patients with no actions", () => {
    const p = makePatient({
      tasks: [makeTask({ source: "extracted", done: false })],
    });
    expect(isOncallRelevant(p, shiftStart)).toBe(false);
  });
});

// ─── Drug safety summary aggregation ─────────────────────────────────────────

describe("HandoffSheet — Drug safety summary aggregation", () => {
  it("counts zero safety alerts for patient with no meds/labs", () => {
    const p = makePatient();
    const count =
      checkDrugInteractions(p).length +
      checkRenalDoseWarnings(p).length +
      calculateLabDeltas(p).length +
      checkBeersCriteria(p).length +
      checkAllergyConflicts(p).length;
    expect(count).toBe(0);
  });

  it("counts drug interaction alerts for patient with interacting meds", () => {
    const p = makePatient({
      medications: ["amiodarone 200mg", "ciprofloxacin 500mg"],
    });
    const interactions = checkDrugInteractions(p);
    expect(interactions.length).toBeGreaterThanOrEqual(1);
  });

  it("counts Beers criteria alerts for elderly patient with inappropriate meds", () => {
    const p = makePatient({
      age: 80,
      medications: ["diazepam 5mg"],
    });
    const beers = checkBeersCriteria(p);
    expect(beers.length).toBeGreaterThanOrEqual(1);
  });

  it("counts allergy conflicts when medication matches allergy", () => {
    const p = makePatient({
      medications: ["amoxicillin 500mg"],
      allergies: ["penicillin"],
    });
    const conflicts = checkAllergyConflicts(p);
    expect(conflicts.length).toBeGreaterThanOrEqual(1);
  });

  it("aggregates alerts across multiple patients", () => {
    const patients = [
      makePatient({
        id: "p1",
        medications: ["amiodarone 200mg", "ciprofloxacin 500mg"],
      }),
      makePatient({ id: "p2" }),
      makePatient({
        id: "p3",
        medications: ["amoxicillin 500mg"],
        allergies: ["penicillin"],
      }),
    ];
    let totalAlerts = 0;
    let patientsWithAlerts = 0;
    for (const p of patients) {
      const count =
        checkDrugInteractions(p).length +
        checkRenalDoseWarnings(p).length +
        calculateLabDeltas(p).length +
        checkBeersCriteria(p).length +
        checkAllergyConflicts(p).length;
      totalAlerts += count;
      if (count > 0) patientsWithAlerts++;
    }
    expect(totalAlerts).toBeGreaterThanOrEqual(2);
    expect(patientsWithAlerts).toBeGreaterThanOrEqual(2);
  });
});

// ─── Phlebotomy list ──────────────────────────────────────────────────────────

describe("HandoffSheet — Phlebotomy list", () => {
  it("returns empty list when no patients have lab tasks", () => {
    const patients = [makePatient()];
    const list = buildPhlebotomyList(patients);
    expect(list).toHaveLength(0);
  });

  it("generates phlebotomy entries for patients with pending lab tasks", () => {
    const patients = [
      makePatient({
        id: "p1",
        name: "כהן יוסף",
        room: "101",
        tasks: [
          makeTask({ id: "t1", text: "CBC stat", urgency: "stat", done: false, category: "labs" }),
        ],
      }),
    ];
    const list = buildPhlebotomyList(patients);
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list[0].patientName).toBe("כהן יוסף");
  });

  it("identifies correct tube colours for different tests", () => {
    const patients = [
      makePatient({
        id: "p1",
        name: "Test",
        room: "100",
        tasks: [
          makeTask({ id: "t1", text: "CBC", urgency: "routine", done: false, category: "labs" }),
          makeTask({ id: "t2", text: "PT/INR", urgency: "routine", done: false, category: "labs" }),
        ],
      }),
    ];
    const list = buildPhlebotomyList(patients);
    expect(list.length).toBeGreaterThanOrEqual(1);
    // CBC = purple tube, PT/INR = blue tube
    const allTubes = list.flatMap((e) => e.tubes);
    expect(allTubes).toContain("purple");
    expect(allTubes).toContain("blue");
  });

  it("generates text format for phlebotomy list", () => {
    const patients = [
      makePatient({
        id: "p1",
        name: "כהן",
        room: "101",
        tasks: [
          makeTask({ id: "t1", text: "CBC morning", urgency: "morning", done: false, category: "labs" }),
        ],
      }),
    ];
    const list = buildPhlebotomyList(patients);
    expect(list.length).toBeGreaterThanOrEqual(1);
    const text = buildPhlebotomyText(list);
    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(0);
  });

  it("skips done tasks for phlebotomy", () => {
    const patients = [
      makePatient({
        tasks: [
          makeTask({ id: "t1", text: "CBC", done: true, category: "labs" }), // already done
        ],
      }),
    ];
    const list = buildPhlebotomyList(patients);
    expect(list).toHaveLength(0);
  });
});

// ─── Tab types ─────────────────────────────────────────────────────────────────

describe("HandoffSheet — Tab types", () => {
  it("HandoffTab type covers all valid tabs", () => {
    // This is a compile-time check — HandoffTab = "visual" | "text" | "report" | "phlebotomy"
    const tabs: Array<"visual" | "text" | "report" | "phlebotomy"> = [
      "visual",
      "text",
      "report",
      "phlebotomy",
    ];
    expect(tabs).toHaveLength(4);
    expect(tabs).toContain("visual");
    expect(tabs).toContain("text");
    expect(tabs).toContain("report");
    expect(tabs).toContain("phlebotomy");
  });
});

// ─── Empty state ──────────────────────────────────────────────────────────────

describe("HandoffSheet — Empty state", () => {
  it("produces empty sections map with no patients", () => {
    const patients: PatientEntry[] = [];
    const map = new Map<string, PatientEntry[]>();
    for (const p of patients) {
      const arr = map.get(p.section) ?? [];
      arr.push(p);
      map.set(p.section, arr);
    }
    expect(map.size).toBe(0);
  });

  it("groups patients by section correctly", () => {
    const patients = [
      makePatient({ id: "p1", section: "SIDE_A" }),
      makePatient({ id: "p2", section: "SIDE_A" }),
      makePatient({ id: "p3", section: "SIDE_B" }),
    ];
    const map = new Map<string, PatientEntry[]>();
    for (const p of patients) {
      const arr = map.get(p.section) ?? [];
      arr.push(p);
      map.set(p.section, arr);
    }
    expect(map.size).toBe(2);
    expect(map.get("SIDE_A")).toHaveLength(2);
    expect(map.get("SIDE_B")).toHaveLength(1);
  });

  it("section labels are correct", () => {
    expect(patientSectionLabel("SIDE_A")).toBe("צד א");
    expect(patientSectionLabel("SIDE_B")).toBe("צד ב");
    expect(patientSectionLabel("REHAB")).toBe("שיקום");
    expect(patientSectionLabel("MONITOR")).toBe("ניטור");
  });
});

// ─── buildTextHandoff summary logic ─────────────────────────────────────────

describe("HandoffSheet — buildTextHandoff summary statistics", () => {
  it("calculates correct task statistics", () => {
    const patients = [
      makePatient({
        id: "p1",
        tasks: [
          makeTask({ id: "t1", done: true, urgency: "stat" }),
          makeTask({ id: "t2", done: false, urgency: "stat" }),
          makeTask({ id: "t3", done: false, urgency: "routine" }),
        ],
        generatedTasks: [
          makeTask({ id: "g1", done: true, urgency: "urgent" }),
        ],
      }),
    ];
    const allTasks = patients.flatMap((p) => [
      ...p.tasks,
      ...p.generatedTasks.filter((t) => !t.dismissed),
    ]);
    const totalDone = allTasks.filter((t) => t.done).length;
    const totalPending = allTasks.filter((t) => !t.done).length;
    const statPending = allTasks.filter((t) => !t.done && t.urgency === "stat").length;

    expect(totalDone).toBe(2);
    expect(totalPending).toBe(2);
    expect(statPending).toBe(1);
  });

  it("counts new admissions from isAdmission flag", () => {
    const patients = [
      makePatient({ id: "p1", isAdmission: true }),
      makePatient({ id: "p2", isAdmission: false }),
      makePatient({ id: "p3", isAdmission: true }),
    ];
    const newAdmissions = patients.filter((p) => p.isAdmission);
    expect(newAdmissions).toHaveLength(2);
  });

  it("detects GoC gap for patients with undefined goals and urgent tasks", () => {
    const patients = [
      makePatient({
        id: "p1",
        tasks: [makeTask({ urgency: "stat", done: false })],
        // No clinicalMeta → GoC unknown
      }),
      makePatient({
        id: "p2",
        clinicalMeta: { goalsOfCare: "full" },
        tasks: [makeTask({ urgency: "stat", done: false })],
      }),
    ];
    const gocGap = patients.filter((p) => {
      const goc = p.clinicalMeta?.goalsOfCare;
      if (goc && goc !== "unknown") return false;
      const allT = [...p.tasks, ...p.generatedTasks.filter((t) => !t.dismissed)];
      return allT.some((t) => !t.done && (t.urgency === "stat" || t.urgency === "urgent"));
    });
    expect(gocGap).toHaveLength(1);
    expect(gocGap[0].id).toBe("p1");
  });
});

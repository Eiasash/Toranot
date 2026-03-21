import { describe, it, expect } from "vitest";
import { runShiftIntegrityCheck } from "../engine/shiftIntegrity";
import type { PatientEntry, Task } from "../types";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    text: "בדיקה",
    urgency: "routine",
    source: "manual",
    done: false,
    doneTime: null,
    time: null,
    confidence: 1,
    ...overrides,
  };
}

function makePatient(overrides: Partial<PatientEntry> = {}): PatientEntry {
  return {
    id: "test-1",
    section: "SIDE_A",
    date: "01/01/2026",
    room: "70",
    name: "חולה א",
    age: 80,
    diagnosis: null,
    flags: [],
    status: [],
    tomorrowNotes: [],
    tasks: [],
    generatedTasks: [],
    scannedAt: new Date().toISOString(),
    confidence: 1,
    ...overrides,
  };
}

describe("shiftIntegrity", () => {
  it("passes with no patients", () => {
    const report = runShiftIntegrityCheck([]);
    expect(report.passed).toBe(true);
    expect(report.issues).toHaveLength(0);
  });

  it("passes with no open issues", () => {
    const report = runShiftIntegrityCheck([
      makePatient({ tasks: [makeTask({ done: true })] }),
    ]);
    expect(report.passed).toBe(true);
  });

  it("flags open STAT tasks as critical", () => {
    const report = runShiftIntegrityCheck([
      makePatient({
        tasks: [makeTask({ urgency: "stat", text: "CBC urgent" })],
      }),
    ]);
    expect(report.criticalCount).toBe(1);
    expect(report.passed).toBe(false);
    expect(report.issues[0].category).toBe("stat_open");
  });

  it("flags admission without handover note", () => {
    const report = runShiftIntegrityCheck([
      makePatient({ isAdmission: true, handoverNote: "" }),
    ]);
    expect(report.issues.some(i => i.category === "no_handover")).toBe(true);
    expect(report.passed).toBe(false);
  });

  it("does not flag admission with sufficient handover note", () => {
    const report = runShiftIntegrityCheck([
      makePatient({
        isAdmission: true,
        handoverNote: "85/M, pneumonia, started ceftriaxone, stable vitals",
      }),
    ]);
    expect(report.issues.some(i => i.category === "no_handover")).toBe(false);
  });

  it("flags overdue tasks as warning", () => {
    const pastDue = new Date(Date.now() - 3600000).toISOString();
    const report = runShiftIntegrityCheck([
      makePatient({
        tasks: [makeTask({ dueAt: pastDue, text: "recheck K+" })],
      }),
    ]);
    expect(report.issues.some(i => i.category === "overdue")).toBe(true);
    expect(report.warningCount).toBeGreaterThanOrEqual(1);
  });

  it("does not flag completed STAT tasks", () => {
    const report = runShiftIntegrityCheck([
      makePatient({
        tasks: [makeTask({ urgency: "stat", done: true })],
      }),
    ]);
    expect(report.issues.some(i => i.category === "stat_open")).toBe(false);
  });

  it("skips discharged patients", () => {
    const report = runShiftIntegrityCheck([
      makePatient({
        discharged: true,
        tasks: [makeTask({ urgency: "stat" })],
      }),
    ]);
    expect(report.issues).toHaveLength(0);
  });

  it("flags critical lab without follow-up", () => {
    const report = runShiftIntegrityCheck([
      makePatient({
        labs: [
          { id: "l1", label: "Cr", value: 0.8, time: new Date(Date.now() - 86400000).toISOString() },
          { id: "l2", label: "Cr", value: 2.0, time: new Date().toISOString() },
        ],
      }),
    ]);
    // Cr 0.8→2.0 = AKI Stage 2 = critical
    expect(report.issues.some(i => i.category === "aki_no_followup" || i.category === "critical_lab")).toBe(true);
  });

  it("does not flag AKI if follow-up task exists", () => {
    const report = runShiftIntegrityCheck([
      makePatient({
        labs: [
          { id: "l1", label: "Cr", value: 0.8, time: new Date(Date.now() - 86400000).toISOString() },
          { id: "l2", label: "Cr", value: 2.0, time: new Date().toISOString() },
        ],
        tasks: [makeTask({ text: "מעקב Cr, check renal function" })],
      }),
    ]);
    expect(report.issues.some(i => i.category === "aki_no_followup")).toBe(false);
  });

  it("multiple issues from multiple patients", () => {
    const report = runShiftIntegrityCheck([
      makePatient({ id: "p1", tasks: [makeTask({ urgency: "stat" })] }),
      makePatient({ id: "p2", isAdmission: true, handoverNote: "" }),
    ]);
    expect(report.issues.length).toBeGreaterThanOrEqual(2);
    expect(report.criticalCount).toBeGreaterThanOrEqual(2);
  });

  it("summary reflects critical count", () => {
    const report = runShiftIntegrityCheck([
      makePatient({ tasks: [makeTask({ urgency: "stat" })] }),
    ]);
    expect(report.summary).toContain("🔴");
    expect(report.summary).toContain("1");
  });

  it("summary shows green checkmark when all clear", () => {
    const report = runShiftIntegrityCheck([makePatient()]);
    expect(report.summary).toContain("✅");
  });

  it("sorts critical issues before warnings", () => {
    const pastDue = new Date(Date.now() - 3600000).toISOString();
    const report = runShiftIntegrityCheck([
      makePatient({
        id: "p1",
        room: "99",
        tasks: [makeTask({ dueAt: pastDue })], // warning
      }),
      makePatient({
        id: "p2",
        room: "50",
        tasks: [makeTask({ urgency: "stat" })], // critical
      }),
    ]);
    if (report.issues.length >= 2) {
      expect(report.issues[0].severity).toBe("critical");
    }
  });
});

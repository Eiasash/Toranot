import { describe, it, expect } from "vitest";
import { parsePatientList } from "../parser/parsePatientList";
import { mergeScan } from "../engine/mergeScan";
import type { PatientEntry, Task } from "../types";

function makeManualTask(text: string): Task {
  return {
    id: "manual-1",
    text,
    urgency: "routine",
    source: "manual",
    done: false,
    doneTime: null,
    time: null,
    confidence: 1,
  };
}

const SCAN_TEXT = `צד א
101 כהן יוסף 72 דלקת ריאות | תורן: בדיקת דם בבוקר
102 לוי שרה 65 אי ספיקת לב`;

describe("mergeScan", () => {
  it("importing the same scan twice does NOT duplicate patients", () => {
    const first = parsePatientList(SCAN_TEXT);
    expect(first).toHaveLength(2);

    const second = parsePatientList(SCAN_TEXT);
    const merged = mergeScan(first, second);

    expect(merged).toHaveLength(2);
    expect(merged[0].name).toBe("כהן יוסף");
    expect(merged[1].name).toBe("לוי שרה");
  });

  it("preserves stable patient id across rescans", () => {
    const first = parsePatientList(SCAN_TEXT);
    const originalId = first[0].id;

    const second = parsePatientList(SCAN_TEXT);
    const merged = mergeScan(first, second);

    expect(merged[0].id).toBe(originalId);
  });

  it("manual task persists after a rescan", () => {
    const first = parsePatientList(SCAN_TEXT);
    // Add a manual task to the first patient
    first[0].tasks.push(makeManualTask("בדוק לחץ דם"));

    const second = parsePatientList(SCAN_TEXT);
    const merged = mergeScan(first, second);

    const manualTasks = merged[0].tasks.filter((t) => t.source === "manual");
    expect(manualTasks).toHaveLength(1);
    expect(manualTasks[0].text).toBe("בדוק לחץ דם");
  });

  it("extracted task done-state persists after a rescan", () => {
    const first = parsePatientList(SCAN_TEXT);
    // Mark the extracted task as done
    const task = first[0].tasks.find((t) => t.source === "extracted");
    expect(task).toBeDefined();
    task!.done = true;
    task!.doneTime = "2024-01-01T12:00:00.000Z";

    const second = parsePatientList(SCAN_TEXT);
    const merged = mergeScan(first, second);

    const extractedTask = merged[0].tasks.find(
      (t) => t.source === "extracted" && t.text === task!.text,
    );
    expect(extractedTask).toBeDefined();
    expect(extractedTask!.done).toBe(true);
    expect(extractedTask!.doneTime).toBe("2024-01-01T12:00:00.000Z");
  });

  it("generated task done-state persists after a rescan", () => {
    const scanWithNPO = "101 כהן יוסף 72 NPO";
    const first = parsePatientList(scanWithNPO);
    expect(first[0].generatedTasks.length).toBeGreaterThan(0);

    // Mark first generated task as done
    first[0].generatedTasks[0].done = true;
    first[0].generatedTasks[0].doneTime = "2024-01-01T12:00:00.000Z";

    const second = parsePatientList(scanWithNPO);
    const merged = mergeScan(first, second);

    expect(merged[0].generatedTasks[0].done).toBe(true);
    expect(merged[0].generatedTasks[0].doneTime).toBe(
      "2024-01-01T12:00:00.000Z",
    );
  });

  it("keeps patients from other sections not in the new scan", () => {
    const firstScan = parsePatientList(`צד א
101 כהן יוסף 72`);

    const secondScan = parsePatientList(`צד ב
201 לוי שרה 65`);

    const merged = mergeScan(firstScan, secondScan);
    // Both should be present: side A patient kept, side B patient added
    expect(merged).toHaveLength(2);
    expect(merged.map((p) => p.name).sort()).toEqual(
      ["כהן יוסף", "לוי שרה"].sort(),
    );
  });

  it("treats a bed/room move as the same patient (stable name+age match)", () => {
    const firstScan = parsePatientList(`צד א
101 כהן יוסף 72 דלקת ריאות`);
    firstScan[0].tasks.push(makeManualTask("התקשר לבן"));
    const originalId = firstScan[0].id;

    const secondScan = parsePatientList(`צד ב
202 כהן יוסף 72 דלקת ריאות`);

    const merged = mergeScan(firstScan, secondScan);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe(originalId);
    expect(merged[0].section).toBe("SIDE_B");
    expect(merged[0].room).toBe("202");
    expect(merged[0].tasks.some((t) => t.text === "התקשר לבן")).toBe(true);
  });

  // ─── New edge case tests ───

  it("new patient with no existing match is added fresh", () => {
    const existing = parsePatientList("101 כהן יוסף 72");
    const incoming = parsePatientList("102 לוי שרה 65");

    const merged = mergeScan(existing, incoming);
    expect(merged).toHaveLength(2);
    expect(merged.map((p) => p.name).sort()).toEqual(["כהן יוסף", "לוי שרה"].sort());
  });

  it("empty incoming scan keeps all existing patients", () => {
    const existing = parsePatientList(`צד א
101 כהן יוסף 72
102 לוי שרה 65`);

    const merged = mergeScan(existing, []);
    expect(merged).toHaveLength(2);
  });

  it("empty existing state accepts all incoming patients", () => {
    const incoming = parsePatientList("101 כהן יוסף 72");
    const merged = mergeScan([], incoming);
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe("כהן יוסף");
  });

  it("preserves notes across rescans (deduplication)", () => {
    const first = parsePatientList(SCAN_TEXT);
    first[0].notes = ["note A", "note B"];

    const second = parsePatientList(SCAN_TEXT);
    const merged = mergeScan(first, second);

    // Notes from old entry should be preserved
    expect(merged[0].notes).toContain("note A");
    expect(merged[0].notes).toContain("note B");
  });

  it("chained rescans preserve accumulated manual tasks", () => {
    // Scan 1
    const scan1 = parsePatientList("101 כהן יוסף 72");
    scan1[0].tasks.push(makeManualTask("task from scan 1"));

    // Scan 2 — merge into scan1
    const scan2 = parsePatientList("101 כהן יוסף 72");
    const after2 = mergeScan(scan1, scan2);
    after2[0].tasks.push(makeManualTask("task from scan 2"));

    // Scan 3 — merge into after2
    const scan3 = parsePatientList("101 כהן יוסף 72");
    const after3 = mergeScan(after2, scan3);

    const manualTasks = after3[0].tasks.filter((t) => t.source === "manual");
    expect(manualTasks).toHaveLength(2);
    expect(manualTasks.map((t) => t.text)).toContain("task from scan 1");
    expect(manualTasks.map((t) => t.text)).toContain("task from scan 2");
  });

  it("preserves task note across rescans", () => {
    const first = parsePatientList(SCAN_TEXT);
    const extractedTask = first[0].tasks.find((t) => t.source === "extracted");
    expect(extractedTask).toBeDefined();
    (extractedTask as any).note = "BS 250ml";

    const second = parsePatientList(SCAN_TEXT);
    const merged = mergeScan(first, second);

    const mergedTask = merged[0].tasks.find(
      (t) => t.source === "extracted" && t.text === extractedTask!.text,
    );
    expect(mergedTask).toBeDefined();
    expect((mergedTask as any).note).toBe("BS 250ml");
  });

  it("preserves original scannedAt across rescans (so isNewThisShift doesn't reset)", () => {
    const originalTime = "2026-01-01T10:00:00.000Z";
    const first = parsePatientList(SCAN_TEXT);
    first[0].scannedAt = originalTime;

    const second = parsePatientList(SCAN_TEXT);
    second[0].scannedAt = new Date(Date.now() + 60000).toISOString(); // later timestamp

    const merged = mergeScan(first, second);

    // mergeScan intentionally preserves oldP.scannedAt so re-imports
    // don't reset the "new this shift" detection for existing patients.
    expect(merged[0].scannedAt).toBe(originalTime);
  });

  // ─── Order preservation tests ───

  describe("order preservation", () => {
    it("merged patients get order from the new scan", () => {
      const first = parsePatientList(SCAN_TEXT);
      first[0].order = 10;
      first[1].order = 20;

      const second = parsePatientList(SCAN_TEXT);
      const merged = mergeScan(first, second);

      // New scan assigns order 0, 1 — those should win
      expect(merged[0].order).toBe(0);
      expect(merged[1].order).toBe(1);
    });

    it("unmatched existing patients get trailing orders after incoming", () => {
      const existing = parsePatientList(`צד א
101 כהן יוסף 72
102 לוי שרה 65
103 אברהם דוד 80`);

      const incoming = parsePatientList("101 כהן יוסף 72");
      const merged = mergeScan(existing, incoming);

      expect(merged).toHaveLength(3);
      const cohen = merged.find(p => p.name === "כהן יוסף")!;
      expect(cohen.order).toBe(0);

      const unmatched = merged.filter(p => p.name !== "כהן יוסף");
      for (const p of unmatched) {
        expect(p.order).toBeGreaterThanOrEqual(incoming.length);
      }
    });

    it("no order collisions between matched and unmatched patients", () => {
      const existing = parsePatientList(`צד א
101 כהן יוסף 72
צד ב
201 לוי שרה 65`);

      const incoming = parsePatientList("101 כהן יוסף 72");
      const merged = mergeScan(existing, incoming);

      const orders = merged.map(p => p.order);
      const uniqueOrders = new Set(orders);
      expect(uniqueOrders.size).toBe(orders.length);
    });

    it("patients sort correctly by order after merge", () => {
      const existing = parsePatientList(`צד א
101 כהן יוסף 72
102 לוי שרה 65`);

      // Reversed order in new scan
      const incoming = parsePatientList(`צד א
102 לוי שרה 65
101 כהן יוסף 72`);

      const merged = mergeScan(existing, incoming);
      const sorted = [...merged].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

      expect(sorted[0].name).toBe("לוי שרה");
      expect(sorted[1].name).toBe("כהן יוסף");
    });

    it("falls back to old order when new patient has no order", () => {
      const existing = parsePatientList(SCAN_TEXT);
      existing[0].order = 5;

      const incoming: PatientEntry[] = [{
        id: "new-1",
        section: "SIDE_A",
        date: "01/01/2025",
        room: "101",
        name: "כהן יוסף",
        age: 72,
        diagnosis: "דלקת ריאות",
        flags: [],
        status: [],
        tomorrowNotes: [],
        tasks: [],
        generatedTasks: [],
        notes: [],
        scannedAt: new Date().toISOString(),
        confidence: 1,
      }];

      const merged = mergeScan(existing, incoming);
      const cohen = merged.find(p => p.name === "כהן יוסף")!;
      expect(cohen.order).toBe(5);
    });
  });
});

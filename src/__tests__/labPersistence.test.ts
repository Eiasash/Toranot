import { describe, it, expect } from "vitest";
import { buildPatientKey } from "../persistence/labPersistence";
import type { PatientEntry } from "../types";

function makePatient(overrides: Partial<PatientEntry> = {}): PatientEntry {
  return {
    id: "test-1",
    section: "SIDE_A",
    date: "21/03/2026",
    room: "70",
    name: "כהן שרה",
    age: 82,
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

describe("labPersistence", () => {
  describe("buildPatientKey", () => {
    it("builds key from name + room", () => {
      const key = buildPatientKey(makePatient({ name: "כהן שרה", room: "70" }));
      expect(key).toBe("כהן שרה|70");
    });

    it("lowercases English names", () => {
      const key = buildPatientKey(makePatient({ name: "Cohen Sarah", room: "70" }));
      expect(key).toBe("cohen sarah|70");
    });

    it("falls back to name-only when room is null", () => {
      const key = buildPatientKey(makePatient({ name: "כהן שרה", room: null }));
      expect(key).toBe("כהן שרה");
    });

    it("falls back to name-only when room is empty", () => {
      const key = buildPatientKey(makePatient({ name: "כהן שרה", room: "" }));
      expect(key).toBe("כהן שרה");
    });

    it("returns null when name is null", () => {
      const key = buildPatientKey(makePatient({ name: null }));
      expect(key).toBeNull();
    });

    it("returns null when name is empty", () => {
      const key = buildPatientKey(makePatient({ name: "" }));
      expect(key).toBeNull();
    });

    it("trims whitespace from name and room", () => {
      const key = buildPatientKey(makePatient({ name: "  כהן שרה  ", room: " 70 " }));
      expect(key).toBe("כהן שרה|70");
    });

    it("handles Hebrew letter room prefix", () => {
      const key = buildPatientKey(makePatient({ name: "לוי דוד", room: "א-92" }));
      expect(key).toBe("לוי דוד|א-92");
    });

    it("same patient produces same key across shifts", () => {
      const key1 = buildPatientKey(makePatient({ id: "shift1-p1", name: "כהן שרה", room: "70" }));
      const key2 = buildPatientKey(makePatient({ id: "shift2-p1", name: "כהן שרה", room: "70" }));
      expect(key1).toBe(key2);
    });

    it("different rooms produce different keys", () => {
      const key1 = buildPatientKey(makePatient({ name: "כהן שרה", room: "70" }));
      const key2 = buildPatientKey(makePatient({ name: "כהן שרה", room: "80" }));
      expect(key1).not.toBe(key2);
    });
  });
});

/**
 * Admission Intake Processor
 *
 * Takes a raw intake payload (from AddAdmissionModal or OCR) and hydrates the
 * record into a full PatientEntry with geriatric baselines computed up front:
 *
 *   - ACB (anticholinergic burden) — Boustani 2008 scale
 *   - Falls risk composite — age, psychotropics, polypharmacy, mobility
 *
 * Golden Rule: a fresh admission NEVER gets auto-generated tasks. The on-call
 * doctor decides what's actionable. `generatedTasks` is always [] here; the
 * user can trigger REAPPLY_RULES from the patient card later if they want.
 *
 * MOH surrogate-consent flag: elderly patients (age >= 65) with ACB >= 3 are
 * flagged for capacity assessment, since the anticholinergic load itself can
 * impair decision-making and the Ministry of Health requires a surrogate
 * evaluation before advance-directive discussions in that population.
 */

import { calculateACB } from "./anticholinergicBurden";
import { calculateFallsRisk } from "./fallsRisk";
import type { PatientEntry, PatientSection } from "../types";

function today(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function hydrate(raw: Partial<PatientEntry>): PatientEntry {
  return {
    id: raw.id ?? `pt-${Date.now()}`,
    section: (raw.section ?? "UNKNOWN_SECTION") as PatientSection,
    date: raw.date ?? today(),
    room: raw.room ?? null,
    name: raw.name ?? null,
    age: raw.age ?? null,
    diagnosis: raw.diagnosis ?? null,
    flags: raw.flags ?? [],
    status: raw.status ?? [],
    tomorrowNotes: raw.tomorrowNotes ?? [],
    planNotes: raw.planNotes ?? [],
    tasks: raw.tasks ?? [],
    generatedTasks: [],
    notes: raw.notes ?? [],
    scannedAt: new Date().toISOString(),
    confidence: raw.confidence ?? 1,
    labs: raw.labs ?? [],
    handoverNote: raw.handoverNote,
    discharged: raw.discharged,
    photos: raw.photos,
    photoIds: raw.photoIds,
    allergies: raw.allergies ?? [],
    medications: raw.medications ?? [],
    order: raw.order ?? Date.now(),
    clinicalMeta: raw.clinicalMeta ?? {},
    syncMeta: raw.syncMeta,
    isAdmission: true,
  };
}

export function processIntake(rawInput: Partial<PatientEntry>): PatientEntry {
  const hydrated = hydrate(rawInput);

  // Baseline geriatric scores — computed once at intake so the UI has
  // them ready without re-running on every render. They are re-derived
  // live by PatientCardAlerts when medications change, so we don't persist
  // the score values on the record — only the capacity-assessment flag,
  // which drives a discrete UX reminder.
  const acb = calculateACB(hydrated);
  // Compute falls risk to warm any future caching / surface a console hint
  // during dev. The badge UI recomputes from the stored patient fields,
  // so the value itself isn't persisted on the record.
  void calculateFallsRisk(hydrated);

  const needsCapacityAssessment = (hydrated.age ?? 0) >= 65 && acb.totalScore >= 3;

  return {
    ...hydrated,
    isAdmission: true,
    generatedTasks: [],
    needsCapacityAssessment,
    scannedAt: new Date().toISOString(),
  };
}

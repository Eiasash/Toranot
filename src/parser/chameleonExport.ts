/**
 * Chameleon EMR — Rounds Note Synthesizer
 *
 * Output is a plain-text, RTL-friendly rounds note ready to paste into the
 * SZMC Chameleon EMR "rounds / progress note" field. Follows the institutional
 * format (see SZMC-Clinical-Notes-Project-Knowledge.md).
 *
 * Strict output rules — the Chameleon EMR auto-formats its own printout, so
 * we must NEVER inject our own formatting:
 *
 *   • Plain text only. No Markdown bold / asterisks / underscores.
 *   • Section headers use a plain `#` prefix (e.g. `# מטופל בקבלה`).
 *   • Lab transitions use a bare `>` with spaces (e.g. `קריאטינין: 1.55 > 1.03`).
 *     No Unicode arrows (→ ↗ ↘) — they break RTL cursor handling in Chameleon.
 *   • Active diagnoses ALWAYS in UPPERCASE English.
 *   • Medications: numbered list (1..N) in SZMC format. Translate English
 *     frequency abbreviations (`q8h`, `qd`, ...) to Hebrew.
 */

import type { PatientEntry, LabEntry } from "../types";

// ─── Frequency / route translation ─────────────────────────────────────

const FREQUENCY_MAP: Array<[RegExp, string]> = [
  [/\bq\s*4\s*h\b/gi, "כל 4 שעות"],
  [/\bq\s*6\s*h\b/gi, "כל 6 שעות"],
  [/\bq\s*8\s*h\b/gi, "כל 8 שעות"],
  [/\bq\s*12\s*h\b/gi, "כל 12 שעות"],
  [/\bq\s*24\s*h\b/gi, "פעם ביום"],
  [/\bqd\b/gi, "פעם ביום"],
  [/\bod\b/gi, "פעם ביום"],
  [/\bbid\b/gi, "פעמיים ביום"],
  [/\btid\b/gi, "שלוש פעמים ביום"],
  [/\bqid\b/gi, "ארבע פעמים ביום"],
  [/\bprn\b/gi, "לפי הצורך"],
  [/\bqhs\b/gi, "בלילה"],
  [/\bstat\b/gi, "מיידי"],
];

function translateFrequency(line: string): string {
  let out = line;
  for (const [pattern, hebrew] of FREQUENCY_MAP) {
    out = out.replace(pattern, hebrew);
  }
  return out;
}

// ─── Section builders ──────────────────────────────────────────────────

function buildHeader(patient: PatientEntry): string[] {
  const lines: string[] = [];
  lines.push("# מטופל בקבלה");
  const demographics: string[] = [];
  if (patient.name) demographics.push(patient.name);
  if (patient.age != null) demographics.push(`גיל ${patient.age}`);
  if (patient.room) demographics.push(`חדר ${patient.room}`);
  if (demographics.length > 0) lines.push(demographics.join(", "));
  if (patient.date) lines.push(`תאריך קבלה: ${patient.date}`);
  return lines;
}

function splitDiagnosisList(diagnosis: string | null | undefined): string[] {
  if (!diagnosis) return [];
  return diagnosis
    .split(/[,;،/]|\s\+\s|\s\|\s/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildActiveDiagnoses(patient: PatientEntry): string[] {
  const items = splitDiagnosisList(patient.diagnosis);
  if (items.length === 0) return [];
  const lines: string[] = ["# אבחנות פעילות"];
  for (const item of items) {
    lines.push(item.toUpperCase());
  }
  return lines;
}

function buildAllergies(patient: PatientEntry): string[] {
  const allergies = patient.allergies ?? [];
  if (allergies.length === 0) return ["# רגישויות", "לא ידוע על רגישות"];
  return ["# רגישויות", ...allergies];
}

// ─── תפקוד (functional status) ────────────────────────────────────────

const MOBILITY_LABEL: Record<string, string> = {
  independent: "עצמאי",
  walker: "הולך בעזרת הליכון",
  wheelchair: "כיסא גלגלים",
  bedbound: "מרותק למיטה",
};

const COGNITION_LABEL: Record<string, string> = {
  oriented: "מתמצא",
  mci: "ירידה קוגניטיבית קלה",
  dementia: "דמנציה",
  unknown: "לא ידוע",
};

const LIVING_LABEL: Record<string, string> = {
  independent: "מתגורר בבית",
  with_family: "מתגורר עם משפחה",
  assisted_living: "דיור מוגן",
  nursing_home: "בית אבות",
};

function buildFunctional(patient: PatientEntry): string[] {
  const meta = patient.clinicalMeta ?? {};
  const rows: Array<[string, string | undefined]> = [
    ["מגורים", meta.livingArrangement ? LIVING_LABEL[meta.livingArrangement] : undefined],
    ["ניידות", meta.baselineMobility ? MOBILITY_LABEL[meta.baselineMobility] : undefined],
    ["התמצאות", meta.baselineCognition ? COGNITION_LABEL[meta.baselineCognition] : undefined],
  ];
  const filled = rows.filter((r): r is [string, string] => !!r[1]);
  if (filled.length === 0) return [];
  const lines: string[] = ["# תפקוד"];
  for (const [label, value] of filled) {
    lines.push(`${label}: ${value}`);
  }
  return lines;
}

// ─── Labs ──────────────────────────────────────────────────────────────

function latestByLabel(labs: LabEntry[]): Map<string, LabEntry[]> {
  const grouped = new Map<string, LabEntry[]>();
  for (const l of labs) {
    const arr = grouped.get(l.label) ?? [];
    arr.push(l);
    grouped.set(l.label, arr);
  }
  for (const [label, arr] of grouped) {
    arr.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    grouped.set(label, arr);
  }
  return grouped;
}

const LAB_HE: Record<string, string> = {
  Cr: "קריאטינין",
  "K+": "אשלגן",
  K: "אשלגן",
  Na: "נתרן",
  Hb: "המוגלובין",
  WBC: "לויקוציטים",
  PLT: "טסיות",
  CRP: "CRP",
  INR: "INR",
  Lactate: "לקטט",
  Glucose: "גלוקוז",
  BUN: "BUN",
  eGFR: "eGFR",
};

function formatNumber(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? rounded.toString() : rounded.toString();
}

function buildLabs(patient: PatientEntry): string[] {
  const labs = patient.labs ?? [];
  if (labs.length === 0) return [];
  const grouped = latestByLabel(labs);
  const lines: string[] = ["# מעבדה"];
  for (const [label, entries] of grouped) {
    const heLabel = LAB_HE[label] ?? label;
    if (entries.length === 1) {
      lines.push(`${heLabel}: ${formatNumber(entries[0].value)}`);
    } else {
      const previous = entries[entries.length - 2];
      const latest = entries[entries.length - 1];
      lines.push(`${heLabel}: ${formatNumber(previous.value)} > ${formatNumber(latest.value)}`);
    }
  }
  return lines;
}

// ─── Medications ───────────────────────────────────────────────────────

function buildMedications(patient: PatientEntry): string[] {
  const meds = (patient.medications ?? []).filter((m) => m && m.trim().length > 0);
  if (meds.length === 0) return [];
  const lines: string[] = ["# תרופות בבית"];
  meds.forEach((raw, i) => {
    lines.push(`${i + 1}. ${translateFrequency(raw.trim())}`);
  });
  return lines;
}

// ─── Plan / Notes / Handover ──────────────────────────────────────────

function buildPlan(patient: PatientEntry): string[] {
  const tasks = patient.tasks.filter((t) => !t.done);
  const planItems = patient.planNotes ?? [];
  if (tasks.length === 0 && planItems.length === 0) return [];
  const lines: string[] = ["# תוכנית"];
  for (const t of tasks) lines.push(t.text);
  for (const p of planItems) lines.push(p);
  return lines;
}

function buildHandover(patient: PatientEntry): string[] {
  if (!patient.handoverNote || !patient.handoverNote.trim()) return [];
  return ["# הערת מסירה", patient.handoverNote.trim()];
}

// ─── Capacity flag ─────────────────────────────────────────────────────

function buildCapacityFlag(patient: PatientEntry): string[] {
  if (!patient.needsCapacityAssessment) return [];
  return ["# הערה", "נדרשת הערכת כשירות לפי הנחיות משרד הבריאות"];
}

// ─── Entry point ───────────────────────────────────────────────────────

export function generateChameleonRoundsNote(patient: PatientEntry): string {
  const sections: string[][] = [
    buildHeader(patient),
    buildActiveDiagnoses(patient),
    buildAllergies(patient),
    buildFunctional(patient),
    buildLabs(patient),
    buildMedications(patient),
    buildPlan(patient),
    buildHandover(patient),
    buildCapacityFlag(patient),
  ];

  return sections
    .filter((s) => s.length > 0)
    .map((s) => s.join("\n"))
    .join("\n\n");
}

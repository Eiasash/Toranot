/**
 * Morning phlebotomy list generator.
 *
 * Scans all patients' pending lab tasks and categorises them by tube colour
 * so the morning phlebotomist (or night doctor calling the order) can pull
 * the right tubes in one pass per patient.
 *
 * Tube mapping follows standard Israeli hospital colour conventions:
 *   🔴 Red (gel serum)  — biochemistry, CMP, LFTs, thyroid, troponin, CRP, CK
 *   🟣 Purple (EDTA)    — CBC, blood film, HbA1c
 *   🔵 Blue (citrate)   — PT/INR, APTT, fibrinogen, coags, D-dimer
 *   🟢 Green (lithium)  — ammonia, lactic acid, lactate
 *   🟡 Yellow (SST/ACD) — blood cultures, cross-match, type & screen
 *   ⬛ Black (ESR)      — ESR / sed rate
 */

export type TubeColour = "red" | "purple" | "blue" | "green" | "yellow" | "black";

export interface PhlebEntry {
  patientId: string;
  patientName: string;
  room: string | null;
  tubes: TubeColour[];
  tests: string[];        // human-readable list, e.g. ["CBC", "CMP", "PT/INR"]
  isUrgent: boolean;      // stat/urgent task → draw first
}

// ── Keyword → tube colour map ─────────────────────────────────────────────

const TUBE_RULES: Array<{ pattern: RegExp; tube: TubeColour; label: string }> = [
  // Red — serum / biochemistry
  { pattern: /\bCMP\b|BMP\b|metabolic\b|chem\b/i,                                            tube: "red",    label: "CMP" },
  { pattern: /\bLFT|liver.*func|ALT\b|AST\b|bili/i,                                          tube: "red",    label: "LFTs" },
  { pattern: /\btroponin\b/i,                                                                  tube: "red",    label: "Troponin" },
  { pattern: /\bCRP\b|c.?reactive/i,                                                          tube: "red",    label: "CRP" },
  { pattern: /\bProca?lcitonin\b|PCT\b/i,                                                     tube: "red",    label: "Procalcitonin" },
  { pattern: /\bcreatinine\b|\bCr\b|\bCrea\b/i,                                               tube: "red",    label: "Cr" },
  { pattern: /\bpotassium\b|\bK\+|\bK\b(?! ?\+?.*blue)/i,                                    tube: "red",    label: "K+" },
  { pattern: /\bsodium\b|\bNa\+|\bNa\b/i,                                                     tube: "red",    label: "Na" },
  { pattern: /\bglucose\b|\bגלוקוז/i,                                                         tube: "red",    label: "Glucose" },
  { pattern: /\bmagnesium\b|\bMg\b|\bMg2\+/i,                                                 tube: "red",    label: "Mg" },
  { pattern: /\bphosphate\b|\bPO4\b|\bPhos\b/i,                                               tube: "red",    label: "PO4" },
  { pattern: /\bcalcium\b|\bCa\b|\bCa2\+/i,                                                   tube: "red",    label: "Ca" },
  { pattern: /\buric acid\b|\burate\b/i,                                                       tube: "red",    label: "Uric acid" },
  { pattern: /\bBNP\b|\bNT.?pro.?BNP\b/i,                                                     tube: "red",    label: "BNP" },
  { pattern: /\bTSH\b|\bthyroid\b|\bT3\b|\bT4\b/i,                                           tube: "red",    label: "TSH" },
  { pattern: /\bCK\b|\bCPK\b|\bcreatine kinase\b/i,                                           tube: "red",    label: "CK" },
  { pattern: /\bLDH\b/i,                                                                       tube: "red",    label: "LDH" },
  { pattern: /\burea\b|\bBUN\b/i,                                                               tube: "red",    label: "BUN/Urea" },
  { pattern: /\balbum[ui]n\b/i,                                                                 tube: "red",    label: "Albumin" },
  { pattern: /\bhaptoglobin\b/i,                                                                tube: "red",    label: "Haptoglobin" },
  { pattern: /\blipase\b|\bamylase\b/i,                                                         tube: "red",    label: "Lipase" },
  { pattern: /\blactate\b|\blactic acid\b|\blaktat\b/i,                                        tube: "green",  label: "Lactate" },
  { pattern: /\bammonia\b|\bNH3\b/i,                                                            tube: "green",  label: "Ammonia" },
  // Purple — haematology
  { pattern: /\bCBC\b|\bדם מלא\b|blood count|haematol/i,                                       tube: "purple", label: "CBC" },
  { pattern: /\bretic\b|reticulocyte/i,                                                         tube: "purple", label: "Retic" },
  { pattern: /\bHbA1c\b|glycated haem/i,                                                        tube: "purple", label: "HbA1c" },
  { pattern: /\bblood film\b|peripheral smear/i,                                                tube: "purple", label: "Blood film" },
  // Blue — coagulation
  { pattern: /\bPT\b|\bINR\b|\bProthrombin/i,                                                   tube: "blue",   label: "PT/INR" },
  { pattern: /\bAPTT\b|\bPTT\b/i,                                                               tube: "blue",   label: "APTT" },
  { pattern: /\bfibrinogen\b/i,                                                                  tube: "blue",   label: "Fibrinogen" },
  { pattern: /\bD.?dimer\b/i,                                                                    tube: "blue",   label: "D-dimer" },
  { pattern: /\bcoag/i,                                                                          tube: "blue",   label: "Coags" },
  // Yellow — cultures / blood bank
  { pattern: /\bblood cult/i,                                                                    tube: "yellow", label: "Blood cultures" },
  { pattern: /\bcross.?match\b|\btype.{0,5}screen\b|\bgroup and screen/i,                       tube: "yellow", label: "XM/T&S" },
  { pattern: /\bHLA\b|\btissue type/i,                                                           tube: "yellow", label: "HLA" },
  // Black — ESR
  { pattern: /\bESR\b|\bsedimentation\b/i,                                                      tube: "black",  label: "ESR" },
];

const TUBE_EMOJI: Record<TubeColour, string> = {
  red: "🔴",
  purple: "🟣",
  blue: "🔵",
  green: "🟢",
  yellow: "🟡",
  black: "⬛",
};

const TUBE_LABEL: Record<TubeColour, string> = {
  red:    "אדום (ביוכימיה)",
  purple: "סגול (CBC/המטולוגיה)",
  blue:   "כחול (קרישה)",
  green:  "ירוק (לקטט/אמוניה)",
  yellow: "צהוב (תרביות/T&S)",
  black:  "שחור (ESR)",
};

export { TUBE_EMOJI, TUBE_LABEL };

import type { PatientEntry } from "../types";

/**
 * Extract phlebotomy requirements from a patient's pending lab tasks.
 * Returns null if the patient needs no morning bloods.
 */
export function buildPatientPhlebEntry(p: PatientEntry): PhlebEntry | null {
  // Collect all pending lab-category tasks (manual + generated, not dismissed, not done)
  const labTasks = [
    ...p.tasks,
    ...p.generatedTasks.filter(t => !t.dismissed),
  ].filter(t => !t.done && t.category === "labs");

  if (labTasks.length === 0) return null;

  const allText = labTasks.map(t => t.text).join(" ");
  const tubeSet = new Set<TubeColour>();
  const testSet = new Set<string>();

  for (const rule of TUBE_RULES) {
    if (rule.pattern.test(allText)) {
      tubeSet.add(rule.tube);
      testSet.add(rule.label);
    }
  }

  // If we matched no tubes from the text, still flag it as "unclassified"
  // using red as default so it shows up rather than silently dropped
  if (tubeSet.size === 0 && labTasks.length > 0) {
    tubeSet.add("red");
    // Extract first meaningful word of first task as label
    testSet.add(labTasks[0].text.slice(0, 40));
  }

  const isUrgent = labTasks.some(t => t.urgency === "stat" || t.urgency === "urgent");

  return {
    patientId: p.id,
    patientName: p.name ?? "?",
    room: p.room ?? null,
    tubes: [...tubeSet].sort(),
    tests: [...testSet],
    isUrgent,
  };
}

/**
 * Build the full ward phlebotomy list, sorted urgent-first then by room.
 */
export function buildPhlebotomyList(patients: PatientEntry[]): PhlebEntry[] {
  return patients
    .map(buildPatientPhlebEntry)
    .filter((e): e is PhlebEntry => e !== null)
    .sort((a, b) => {
      if (a.isUrgent !== b.isUrgent) return a.isUrgent ? -1 : 1;
      return (a.room ?? "").localeCompare(b.room ?? "", "he");
    });
}

/**
 * Generate text summary grouped by tube colour (for copy/WhatsApp).
 */
export function buildPhlebotomyText(entries: PhlebEntry[]): string {
  if (entries.length === 0) return "אין בדיקות דם מתוכננות לבוקר.";

  const lines: string[] = [
    `💉 רשימת שלילות בוקר — ${new Date().toLocaleDateString("he-IL")}`,
    `${entries.length} חולים | ${entries.filter(e => e.isUrgent).length} דחוף`,
    "─".repeat(32),
  ];

  // Group by tube
  const byTube = new Map<TubeColour, PhlebEntry[]>();
  for (const e of entries) {
    for (const tube of e.tubes) {
      const arr = byTube.get(tube) ?? [];
      arr.push(e);
      byTube.set(tube, arr);
    }
  }

  const tubeOrder: TubeColour[] = ["red", "purple", "blue", "green", "yellow", "black"];
  for (const tube of tubeOrder) {
    const pts = byTube.get(tube);
    if (!pts) continue;
    lines.push("");
    lines.push(`${TUBE_EMOJI[tube]} ${TUBE_LABEL[tube]} (${pts.length}):`);
    for (const e of pts) {
      const urgent = e.isUrgent ? " ⚡" : "";
      lines.push(`  חד׳ ${e.room ?? "?"} ${e.patientName}${urgent}`);
    }
  }

  return lines.join("\n");
}

import type { PatientEntry } from "../types";

/**
 * IV Protocol match result.
 * Returned when a patient's data suggests an active IV drug protocol is relevant.
 */
export interface IVProtocolMatch {
  protocolId: string;
  icon: string;
  drug: string;
  drugHe: string;
  /** Why it matched — the text snippet that triggered it */
  trigger: string;
  /** Quick action reminders relevant to on-call */
  actions: string[];
  highRisk: boolean;
}

interface MatchRule {
  protocolId: string;
  icon: string;
  drug: string;
  drugHe: string;
  pattern: RegExp;
  highRisk: boolean;
  /** What the on-call doc should keep in mind / do */
  actions: string[];
}

const MATCH_RULES: MatchRule[] = [
  {
    protocolId: "insulin",
    icon: "💉",
    drug: "IV Insulin",
    drugHe: "אינסולין IV",
    pattern: /אינסולין\s*(מתמשך|בווריד|IV|gtt|drip|infusion)|insulin\s*(gtt|drip|infusion|iv)|actrapid\s*(gtt|drip|50|iv)|סוכרת.*(?:DKA|hyperosmolar|היפר.?אוסמולר)|DKA|hyperosmolar|HHS\b|סוכר\s*(גבוה|לא מאוזן)|glucose.*(?:>300|uncontrolled)/i,
    highRisk: true,
    actions: [
      "BG q2h during titration, q4h once stable",
      "Target 140-180 mg/dL",
      "If <70 → STOP + D50% 50ml IV",
      "בקרה כפולה required",
    ],
  },
  {
    protocolId: "noradrenaline",
    icon: "🔴",
    drug: "Noradrenaline",
    drugHe: "נוראדרנלין",
    pattern: /נוראדרנלין|noradrenaline|norepinephrine|levophed|vasopressor|ואזופרסור|הלם\s*ספטי|septic\s*shock|hemodynamic.*instab/i,
    highRisk: true,
    actions: [
      "D5% ONLY — NOT NaCl",
      "Dedicated IV line",
      "MAP target ≥65",
      "Art line for continuous BP",
      "Replace bag IMMEDIATELY when finishing",
    ],
  },
  {
    protocolId: "dopamine",
    icon: "🔴",
    drug: "Dopamine",
    drugHe: "דופמין",
    pattern: /דופמין|dopamine\s*(gtt|drip|iv|infusion)/i,
    highRisk: true,
    actions: [
      "IV pump required",
      "Monitor HR, BP continuously",
      "בקרה כפולה required",
    ],
  },
  {
    protocolId: "heparin",
    icon: "🩸",
    drug: "Heparin IV",
    drugHe: "הפרין IV",
    pattern: /הפרין\s*(iv|בווריד|gtt|drip|infusion)|heparin\s*(gtt|drip|infusion|iv|protocol)|UFH|unfractionated/i,
    highRisk: true,
    actions: [
      "aPTT q6h (target 1.5-2.5× control)",
      "Platelets daily — watch for HIT (>50% drop)",
      "100 units/ml concentration",
      "Reversal: Protamine 1mg/100u",
    ],
  },
  {
    protocolId: "propofol",
    icon: "🫧",
    drug: "Propofol",
    drugHe: "פרופופול",
    pattern: /פרופופול|propofol|diprivan/i,
    highRisk: true,
    actions: [
      "Max 50 mcg/kg/min, PRIS risk >48h",
      "CK + TG + pH + lactate q24h",
      "Change syringe q12h",
      "Use Adjusted Body Weight if BMI >30",
    ],
  },
  {
    protocolId: "fentanyl",
    icon: "💊",
    drug: "Fentanyl IV",
    drugHe: "פנטניל IV",
    pattern: /פנטניל\s*(iv|בווריד|gtt|drip|infusion)|fentanyl\s*(gtt|drip|infusion|iv|pump)|fentanyl\s*\d+\s*mcg/i,
    highRisk: true,
    actions: [
      "10 mcg/ml concentration (syringe pump)",
      "Maintenance 20-50 mcg/hr",
      "Titrate q30-60min, max +10 mcg/hr/step",
    ],
  },
  {
    protocolId: "morphine",
    icon: "💊",
    drug: "Morphine IV",
    drugHe: "מורפין IV",
    pattern: /מורפין\s*(iv|בווריד|gtt|drip|infusion|pump)|morphine\s*(gtt|drip|infusion|iv|pump|continuous)/i,
    highRisk: true,
    actions: [
      "1 mg/ml concentration",
      "Monitor sedation + respiratory rate",
      "בקרה כפולה required",
    ],
  },
  {
    protocolId: "dormicum",
    icon: "🧪",
    drug: "Dormicum IV",
    drugHe: "דורמיקום IV",
    pattern: /דורמיקום|מידזולם\s*(iv|בווריד|gtt|drip)|midazolam\s*(gtt|drip|infusion|iv|continuous)|dormicum\s*(gtt|drip|iv)/i,
    highRisk: true,
    actions: [
      "1 mg/ml concentration",
      "Titrate to target sedation",
      "בקרה כפולה required",
    ],
  },
  {
    protocolId: "amiodarone",
    icon: "⚡",
    drug: "Amiodarone IV",
    drugHe: "אמיודרון IV",
    pattern: /אמיודרון|amiodarone\s*(iv|load|gtt|drip|bolus)|procor|פרוקור|cordarone/i,
    highRisk: true,
    actions: [
      "Loading: 300mg/100ml D5% over 30min",
      "Maint: 900mg/500ml D5% at 43ml/hr (12h) or 22ml/hr (24h)",
      "Monitor QTc, HR, BP",
      "Phlebitis risk — use 500ml dilution",
    ],
  },
  {
    protocolId: "lidocaine",
    icon: "⚡",
    drug: "Lidocaine IV",
    drugHe: "לידוקאין IV",
    pattern: /לידוקאין\s*(iv|בווריד|gtt|drip)|lidocaine\s*(gtt|drip|infusion|iv)/i,
    highRisk: false,
    actions: [
      "4 mg/ml (2000mg in 500ml NS)",
      "Loading: 1-1.5 mg/kg over 5min",
      "Toxicity: numbness → tinnitus → seizures → CV collapse",
    ],
  },
  {
    protocolId: "magnesium",
    icon: "🧂",
    drug: "IV MgSO₄",
    drugHe: "מגנזיום IV",
    pattern: /מגנזיום\s*(iv|בווריד|סולפט)|magnesium\s*(sulfate|iv|infusion)|MgSO4|Mg\s*(?:replace|correct|supplement)|hypomagnes|torsade/i,
    highRisk: false,
    actions: [
      "Infuse over ~2 hours",
      "Check Mg before repeat dose",
      "Watch DTR — loss = early toxicity",
      "Antidote: Ca Gluconate 10% 10ml IV/10min",
    ],
  },
  {
    protocolId: "kphosphate",
    icon: "🧪",
    drug: "K-Phosphate IV",
    drugHe: "אשלגן זרחתי IV",
    pattern: /אשלגן\s*זרחתי|potassium\s*phosphat|K\s*phosphat|hypophosphat/i,
    highRisk: true,
    actions: [
      "Peripheral: 15mmol/500ml over 6h",
      "Central: 15mmol/250ml over 4h",
      "בקרה כפולה required",
    ],
  },
];

/**
 * Scan a patient's data and return matching IV protocol IDs.
 * Checks: diagnosis, flags, status, tasks (text), generatedTasks, notes, handoverNote.
 */
export function matchIVProtocols(patient: PatientEntry): IVProtocolMatch[] {
  // Build a single searchable blob from all patient text fields
  const blobs: string[] = [];
  if (patient.diagnosis) blobs.push(patient.diagnosis);
  if (patient.flags.length) blobs.push(patient.flags.join(" "));
  if (patient.status.length) blobs.push(patient.status.join(" "));
  for (const t of patient.tasks) blobs.push(t.text + (t.note || ""));
  for (const t of patient.generatedTasks) blobs.push(t.text + (t.note || ""));
  if (patient.notes?.length) blobs.push(patient.notes.join(" "));
  if (patient.handoverNote) blobs.push(patient.handoverNote);
  if (patient.tomorrowNotes.length) blobs.push(patient.tomorrowNotes.join(" "));

  const text = blobs.join(" ");
  if (!text.trim()) return [];

  const matches: IVProtocolMatch[] = [];
  const seen = new Set<string>();

  for (const rule of MATCH_RULES) {
    if (seen.has(rule.protocolId)) continue;
    const m = text.match(rule.pattern);
    if (m) {
      seen.add(rule.protocolId);
      matches.push({
        protocolId: rule.protocolId,
        icon: rule.icon,
        drug: rule.drug,
        drugHe: rule.drugHe,
        trigger: m[0],
        actions: rule.actions,
        highRisk: rule.highRisk,
      });
    }
  }

  return matches;
}

import type { PatientEntry } from "../types";

/**
 * Two-tier IV protocol matching:
 *
 * ACTIVE  — Drug is explicitly mentioned (e.g. "הפרין IV", "heparin gtt", "actrapid drip").
 *           The team wrote it on the toren for you. Show as actionable badge.
 *
 * SUGGEST — A clinical condition in the diagnosis/background *implies* a protocol
 *           may become relevant (e.g. "septic shock" → norepi protocol, "DKA" → insulin).
 *           NOT your task unless explicitly ordered. Show as a soft sidebar suggestion.
 */

export type MatchTier = "active" | "suggest";

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
  /** active = drug explicitly written for you · suggest = diagnosis context only */
  tier: MatchTier;
}

interface MatchRule {
  protocolId: string;
  icon: string;
  drug: string;
  drugHe: string;
  highRisk: boolean;
  actions: string[];
  /** Matches explicit drug mentions → tier "active" */
  activePattern: RegExp;
  /** Matches diagnosis/context → tier "suggest". Optional. */
  contextPattern?: RegExp;
}

const MATCH_RULES: MatchRule[] = [
  {
    protocolId: "insulin",
    icon: "💉",
    drug: "IV Insulin",
    drugHe: "אינסולין IV",
    highRisk: true,
    activePattern: /אינסולין\s*(מתמשך|בווריד|IV|gtt|drip|infusion)|insulin\s*(gtt|drip|infusion|iv)|actrapid\s*(gtt|drip|50|iv)/i,
    contextPattern: /DKA|hyperosmolar|HHS\b|סוכרת.*(?:DKA|היפר.?אוסמולר)|סוכר\s*(גבוה|לא מאוזן)|glucose.*(?:>300|uncontrolled)/i,
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
    highRisk: true,
    activePattern: /נוראדרנלין|noradrenaline|norepinephrine|levophed|vasopressor|ואזופרסור/i,
    contextPattern: /הלם\s*ספטי|septic\s*shock|hemodynamic.*instab/i,
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
    highRisk: true,
    activePattern: /דופמין|dopamine\s*(gtt|drip|iv|infusion)/i,
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
    highRisk: true,
    activePattern: /הפרין\s*(iv|בווריד|gtt|drip|infusion)|heparin\s*(gtt|drip|infusion|iv|protocol)|UFH|unfractionated/i,
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
    highRisk: true,
    activePattern: /פרופופול|propofol|diprivan/i,
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
    highRisk: true,
    activePattern: /פנטניל\s*(iv|בווריד|gtt|drip|infusion)|fentanyl\s*(gtt|drip|infusion|iv|pump)|fentanyl\s*\d+\s*mcg/i,
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
    highRisk: true,
    activePattern: /מורפין\s*(iv|בווריד|gtt|drip|infusion|pump)|morphine\s*(gtt|drip|infusion|iv|pump|continuous)/i,
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
    highRisk: true,
    activePattern: /דורמיקום|מידזולם\s*(iv|בווריד|gtt|drip)|midazolam\s*(gtt|drip|infusion|iv|continuous)|dormicum\s*(gtt|drip|iv)/i,
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
    highRisk: true,
    activePattern: /אמיודרון\s*(iv|load|gtt|drip|bolus)|amiodarone\s*(iv|load|gtt|drip|bolus)|procor|פרוקור|cordarone/i,
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
    highRisk: false,
    activePattern: /לידוקאין\s*(iv|בווריד|gtt|drip)|lidocaine\s*(gtt|drip|infusion|iv)/i,
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
    highRisk: false,
    activePattern: /מגנזיום\s*(iv|בווריד|סולפט)|magnesium\s*(sulfate|iv|infusion)|MgSO4|Mg\s*(?:replace|correct|supplement)/i,
    contextPattern: /hypomagnes|torsade/i,
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
    highRisk: true,
    activePattern: /אשלגן\s*זרחתי|potassium\s*phosphat|K\s*phosphat/i,
    contextPattern: /hypophosphat/i,
    actions: [
      "Peripheral: 15mmol/500ml over 6h",
      "Central: 15mmol/250ml over 4h",
      "בקרה כפולה required",
    ],
  },
];

/**
 * Scan a patient's data and return matching IV protocols with tier.
 *
 * - activePattern matched → tier "active" (drug is explicitly in play)
 * - contextPattern matched but activePattern didn't → tier "suggest"
 * - Both match → "active" wins (dedup)
 */
export function matchIVProtocols(patient: PatientEntry): IVProtocolMatch[] {
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

    // Active: drug explicitly named
    const activeHit = text.match(rule.activePattern);
    if (activeHit) {
      seen.add(rule.protocolId);
      matches.push({
        protocolId: rule.protocolId,
        icon: rule.icon,
        drug: rule.drug,
        drugHe: rule.drugHe,
        trigger: activeHit[0],
        actions: rule.actions,
        highRisk: rule.highRisk,
        tier: "active",
      });
      continue;
    }

    // Suggest: clinical context implies it
    if (rule.contextPattern) {
      const ctxHit = text.match(rule.contextPattern);
      if (ctxHit) {
        seen.add(rule.protocolId);
        matches.push({
          protocolId: rule.protocolId,
          icon: rule.icon,
          drug: rule.drug,
          drugHe: rule.drugHe,
          trigger: ctxHit[0],
          actions: rule.actions,
          highRisk: rule.highRisk,
          tier: "suggest",
        });
      }
    }
  }

  return matches;
}

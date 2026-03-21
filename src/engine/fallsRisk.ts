/**
 * Falls Risk Composite Engine
 *
 * Computes a falls risk score from data already on the patient record.
 * This is NOT a task generator — it's a passive badge/alert.
 * The on-call doc doesn't do fall prevention at 3am, but should KNOW
 * a patient is high-risk before prescribing another benzo or z-drug.
 *
 * Score components (evidence-based, geriatric-weighted):
 *   - Age ≥80                           +1
 *   - Age ≥90                           +1 (additional)
 *   - ACB ≥3                            +2
 *   - ≥2 psychotropics                  +2
 *   - Any benzodiazepine                +2
 *   - Any opioid                        +1
 *   - Acute delirium / confusion        +2
 *   - Mobility impairment mentioned     +1
 *   - Recent fall documented            +2
 *   - Orthostatic hypotension           +1
 *   - ≥5 total medications (polypharmacy proxy) +1
 *
 * Classification:
 *   0-2  → low
 *   3-5  → moderate
 *   ≥6   → high
 */

import type { PatientEntry } from "../types";
import { calculateACB } from "./anticholinergicBurden";

export interface FallsRiskResult {
  score: number;
  severity: "low" | "moderate" | "high";
  components: Array<{ label: string; points: number }>;
  message: string;
}

// ── Pattern detection ──────────────────────────────────────────────

const BENZO_PATTERN = /benzo|lorazepam|לוראזפם|diazepam|דיאזפם|midazolam|מידזולם|clonazepam|קלונזפם|oxazepam|nitrazepam|ניטרזפם|bromazepam|ברומזפם/i;
const OPIOID_PATTERN = /morphine|מורפין|oxycodone|אוקסיקודון|fentanyl|פנטניל|tramadol|טרמדול|codeine|קודאין|buprenorphine|hydromorphone/i;
const PSYCHOTROPIC_PATTERNS = [
  BENZO_PATTERN,
  OPIOID_PATTERN,
  /SSRI|sertraline|סרטרלין|paroxetine|פרוקסטין|fluoxetine|escitalopram|cipralex|ציפרלקס/i,
  /SNRI|venlafaxine|ונלפקסין|duloxetine|דולוקסטין|cymbalta/i,
  /mirtazapine|מירטזפין|remeron|רמרון|trazodone|טרזודון/i,
  /quetiapine|קווטיאפין|seroquel|סרוקוול|olanzapine|אולנזפין|zyprexa|זיפרקסה|risperidone|ריספרידון|haloperidol|הלופרידול/i,
  /zolpidem|זולפידם|zopiclone|stilnox|סטילנוקס/i,
];

const DELIRIUM_PATTERN = /deliri|דליריום|בלבול|confusion|confused|acute confusion|altered mental|חוסר שקט|agitat|אגיטציה/i;
const MOBILITY_PATTERN = /immobil|wheelchair|כיסא גלגלים|walker|הליכון|bed.?bound|מרותק|תלוי בניידות|dependent.*mobil|ניידות מוגבלת|non.?ambulat/i;
const RECENT_FALL_PATTERN = /נפילה|fall|נפל|fell|ground.?level|found.?on.?floor|מצא.*רצפה/i;
const ORTHOSTATIC_PATTERN = /orthostatic|אורתוסטטי|postural.*hypotension|ירידת לחץ.*עמידה/i;

function buildCorpus(patient: PatientEntry): string {
  const parts: string[] = [];
  if (patient.diagnosis) parts.push(patient.diagnosis);
  if (patient.handoverNote) parts.push(patient.handoverNote);
  for (const s of patient.status) parts.push(s);
  for (const f of patient.flags) parts.push(f);
  for (const t of patient.tasks) parts.push(t.text);
  for (const t of patient.generatedTasks) parts.push(t.text);
  if (patient.notes) for (const n of patient.notes) parts.push(n);
  if (patient.medications) for (const m of patient.medications) parts.push(m);
  return parts.join(" ");
}

function countPsychotropics(corpus: string): number {
  let count = 0;
  for (const pattern of PSYCHOTROPIC_PATTERNS) {
    if (pattern.test(corpus)) count++;
  }
  return count;
}

/**
 * Rough med-count estimate: count distinct drug-like words.
 * Not perfect — but a polypharmacy proxy when we don't have a formal med list.
 */
function estimateMedCount(corpus: string): number {
  // Count distinct drug pattern matches across all drugSafety patterns
  // Simplified: count lines/entries that look like medication orders
  const drugPatterns = [
    /aspirin|אספירין/i, /clopidogrel|קלופידוגרל|plavix/i,
    /warfarin|וורפרין|coumadin/i, /enoxaparin|clexane|קלקסן/i,
    /omeprazole|אומפרזול|losec/i, /pantoprazole|פנטופרזול|controloc/i,
    /metoprolol|מטופרולול/i, /bisoprolol|ביזופרולול/i,
    /amlodipine|אמלודיפין|norvasc/i, /ramipril|רמיפריל/i,
    /furosemide|פורוסמיד|lasix|לאסיקס/i, /spironolactone|ספירונולקטון/i,
    /atorvastatin|אטורבסטטין|lipitor/i, /rosuvastatin|רוזובסטטין|crestor/i,
    /metformin|מטפורמין|glucophage/i, /insulin|אינסולין/i,
    /levothyroxine|אלטרוקסין|eltroxin/i,
    /paracetamol|פרצטמול|acamol|אקמול/i,
    /pregabalin|פרגבלין|lyrica|ליריקה/i,
    BENZO_PATTERN, OPIOID_PATTERN,
    /quetiapine|קווטיאפין|seroquel/i, /haloperidol|הלופרידול/i,
  ];
  let count = 0;
  for (const p of drugPatterns) {
    if (p.test(corpus)) count++;
  }
  return count;
}

export function calculateFallsRisk(patient: PatientEntry): FallsRiskResult {
  const corpus = buildCorpus(patient);
  const components: FallsRiskResult["components"] = [];
  let score = 0;

  // Age
  if (patient.age != null && patient.age >= 80) {
    components.push({ label: "גיל ≥80", points: 1 });
    score += 1;
    if (patient.age >= 90) {
      components.push({ label: "גיל ≥90", points: 1 });
      score += 1;
    }
  }

  // ACB
  const acb = calculateACB(patient);
  if (acb.totalScore >= 3) {
    components.push({ label: `ACB ${acb.totalScore}`, points: 2 });
    score += 2;
  }

  // Psychotropic count
  const psychoCount = countPsychotropics(corpus);
  if (psychoCount >= 2) {
    components.push({ label: `${psychoCount} פסיכוטרופיים`, points: 2 });
    score += 2;
  }

  // Any benzodiazepine
  if (BENZO_PATTERN.test(corpus)) {
    components.push({ label: "בנזודיאזפין", points: 2 });
    score += 2;
  }

  // Any opioid
  if (OPIOID_PATTERN.test(corpus)) {
    components.push({ label: "אופיואיד", points: 1 });
    score += 1;
  }

  // Acute delirium
  if (DELIRIUM_PATTERN.test(corpus)) {
    components.push({ label: "דליריום / בלבול", points: 2 });
    score += 2;
  }

  // Mobility impairment
  if (MOBILITY_PATTERN.test(corpus)) {
    components.push({ label: "ניידות מוגבלת", points: 1 });
    score += 1;
  }

  // Recent fall
  if (RECENT_FALL_PATTERN.test(corpus)) {
    components.push({ label: "נפילה אחרונה", points: 2 });
    score += 2;
  }

  // Orthostatic hypotension
  if (ORTHOSTATIC_PATTERN.test(corpus)) {
    components.push({ label: "אורתוסטטיזם", points: 1 });
    score += 1;
  }

  // Polypharmacy (≥5 meds estimated)
  const medCount = estimateMedCount(corpus);
  if (medCount >= 5) {
    components.push({ label: `פוליפרמקולוגיה (~${medCount} תרופות)`, points: 1 });
    score += 1;
  }

  let severity: FallsRiskResult["severity"];
  let message: string;

  if (score <= 2) {
    severity = "low";
    message = score === 0 ? "" : `סיכון נפילה נמוך (${score})`;
  } else if (score <= 5) {
    severity = "moderate";
    message = `⚠️ סיכון נפילה בינוני (${score}) — זהירות בתרופות סדטיביות`;
  } else {
    severity = "high";
    message = `🔴 סיכון נפילה גבוה (${score}) — הימנע מבנזו/אופיואיד! שקול ליווי`;
  }

  return { score, severity, components, message };
}

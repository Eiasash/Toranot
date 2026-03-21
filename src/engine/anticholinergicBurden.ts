/**
 * Anticholinergic Burden (ACB) Scoring Engine
 *
 * Cumulative anticholinergic burden is a geriatric safety metric.
 * Individual anticholinergic drugs are graded 1-3 (Boustani 2008 scale).
 * Total ACB ≥ 3 → clinically significant delirium/cognitive risk.
 *
 * This is NOT the same as pairwise drug interaction detection (drugSafety.ts).
 * drugSafety flags "oxybutynin + amitriptyline = bad"; this engine says
 * "total anticholinergic load across ALL drugs = 5 → delirium risk".
 *
 * Design: scan all text fields (diagnosis, status, flags, tasks, handoverNote)
 * for drug mentions. Sum scores. Return breakdown + total + severity.
 */

import type { PatientEntry } from "../types";

export interface ACBDrug {
  name: string;        // English display name
  nameHe?: string;     // Hebrew name for display
  score: 1 | 2 | 3;   // Boustani ACB scale
  pattern: RegExp;     // detection pattern
}

export interface ACBResult {
  totalScore: number;
  severity: "none" | "low" | "moderate" | "high";
  detectedDrugs: Array<{ name: string; nameHe?: string; score: 1 | 2 | 3 }>;
  message: string;     // Hebrew clinical note
}

/**
 * ACB drug database — Boustani 2008 / AGS 2023 Beers update.
 * Score 1 = possible anticholinergic; 2 = clinically relevant; 3 = definite high.
 */
export const ACB_DRUGS: ACBDrug[] = [
  // ── Score 3: Definite anticholinergic (strongest) ──
  { name: "Amitriptyline",     nameHe: "אמיטריפטילין",     score: 3, pattern: /amitriptyline|אמיטריפטילין|elatrol|אלטרול/i },
  { name: "Oxybutynin",        nameHe: "אוקסיבוטינין",      score: 3, pattern: /oxybutynin|אוקסיבוטינין|ditropan|דיטרופן/i },
  { name: "Tolterodine",       nameHe: "טולטרודין",          score: 3, pattern: /tolterodine|טולטרודין|detrol|דטרול/i },
  { name: "Solifenacin",       nameHe: "סוליפנצין",          score: 3, pattern: /solifenacin|סוליפנצין|vesicare|וזיקר/i },
  { name: "Hydroxyzine",       nameHe: "הידרוקסיזין",        score: 3, pattern: /hydroxyzine|הידרוקסיזין|atarax|אטרקס/i },
  { name: "Diphenhydramine",   nameHe: "דיפנהידרמין",        score: 3, pattern: /diphenhydramine|דיפנהידרמין|benadryl|בנדריל|nytol/i },
  { name: "Chlorphenamine",    nameHe: "כלורפנאמין",         score: 3, pattern: /chlorphenamine|chlorphenir|כלורפנאמין|piriton/i },
  { name: "Promethazine",      nameHe: "פרומתזין",           score: 3, pattern: /promethazine|פרומתזין|phenergan/i },
  { name: "Clomipramine",      nameHe: "קלומיפרמין",         score: 3, pattern: /clomipramine|קלומיפרמין|anafranil/i },
  { name: "Imipramine",        nameHe: "אימיפרמין",          score: 3, pattern: /imipramine|אימיפרמין|tofranil/i },
  { name: "Doxepin (>6mg)",    nameHe: "דוקסאפין",           score: 3, pattern: /doxepin|דוקסאפין|sinequan/i },
  { name: "Trihexyphenidyl",   nameHe: "טריהקסיפנידיל",      score: 3, pattern: /trihexyphenidyl|טריהקסיפנידיל|artane|ארטן/i },
  { name: "Benztropine",       nameHe: "בנזטרופין",          score: 3, pattern: /benztropine|בנזטרופין|cogentin/i },
  { name: "Scopolamine",       nameHe: "סקופולמין",          score: 3, pattern: /scopolamine|סקופולמין|buscopan|בוסקופן/i },

  // ── Score 2: Clinically relevant ──
  { name: "Olanzapine",        nameHe: "אולנזפין",           score: 2, pattern: /olanzapine|אולנזפין|zyprexa|זיפרקסה/i },
  { name: "Quetiapine",        nameHe: "קווטיאפין",          score: 2, pattern: /quetiapine|קווטיאפין|seroquel|סרוקוול/i },
  { name: "Clozapine",         nameHe: "קלוזפין",            score: 2, pattern: /clozapine|קלוזפין|clozaril/i },
  { name: "Nortriptyline",     nameHe: "נורטריפטילין",       score: 2, pattern: /nortriptyline|נורטריפטילין/i },
  { name: "Loperamide",        nameHe: "לופרמיד",            score: 2, pattern: /loperamide|לופרמיד|imodium|אימודיום/i },
  { name: "Cetirizine",        nameHe: "צטיריזין",           score: 2, pattern: /cetirizine|צטיריזין|zyrtec|זירטק/i },

  // ── Score 1: Possible anticholinergic (mild but cumulative) ──
  { name: "Ranitidine",        nameHe: "רניטידין",           score: 1, pattern: /ranitidine|רניטידין/i },
  { name: "Furosemide",        nameHe: "פורוסמיד",           score: 1, pattern: /furosemide|פורוסמיד|lasix|לאסיקס/i },
  { name: "Digoxin",           nameHe: "דיגוקסין",           score: 1, pattern: /digoxin|דיגוקסין|lanoxin/i },
  { name: "Metoprolol",        nameHe: "מטופרולול",          score: 1, pattern: /metoprolol|מטופרולול/i },
  { name: "Risperidone",       nameHe: "ריספרידון",          score: 1, pattern: /risperidone|ריספרידון|risperdal|ריספרדל/i },
  { name: "Mirtazapine",       nameHe: "מירטזפין",           score: 1, pattern: /mirtazapine|מירטזפין|remeron|רמרון/i },
  { name: "Trazodone",         nameHe: "טרזודון",            score: 1, pattern: /trazodone|טרזודון|desyrel/i },
  { name: "Prednisone",        nameHe: "פרדניזון",           score: 1, pattern: /prednisone|prednisolone|פרדניזון|פרדניזולון/i },
  { name: "Warfarin",          nameHe: "וורפרין",            score: 1, pattern: /warfarin|וורפרין|coumadin|קומדין/i },
  { name: "Codeine",           nameHe: "קודאין",             score: 1, pattern: /codeine|קודאין/i },
  { name: "Fentanyl",          nameHe: "פנטניל",             score: 1, pattern: /fentanyl|פנטניל/i },
  { name: "Morphine",          nameHe: "מורפין",             score: 1, pattern: /morphine|מורפין/i },
  { name: "Tramadol",          nameHe: "טרמדול",             score: 1, pattern: /tramadol|טרמדול/i },
  { name: "Paroxetine",        nameHe: "פרוקסטין",           score: 1, pattern: /paroxetine|פרוקסטין/i },
];

/**
 * Build the text corpus to scan for drug mentions.
 * Mirrors drugSafety.ts approach — all patient text fields combined.
 */
function buildTextCorpus(patient: PatientEntry): string {
  const parts: string[] = [];
  if (patient.diagnosis) parts.push(patient.diagnosis);
  if (patient.handoverNote) parts.push(patient.handoverNote);
  for (const s of patient.status) parts.push(s);
  for (const f of patient.flags) parts.push(f);
  for (const t of patient.tasks) parts.push(t.text);
  for (const t of patient.generatedTasks) parts.push(t.text);
  if (patient.notes) for (const n of patient.notes) parts.push(n);
  if (patient.tomorrowNotes) for (const n of patient.tomorrowNotes) parts.push(n);
  if (patient.planNotes) for (const n of patient.planNotes) parts.push(n);
  return parts.join(" ");
}

/**
 * Calculate anticholinergic burden for a patient.
 *
 * Returns total score, detected drugs, and severity classification:
 *   0       → none
 *   1-2     → low (monitor)
 *   3-4     → moderate (consider reducing)
 *   ≥5      → high (active delirium risk)
 */
export function calculateACB(patient: PatientEntry): ACBResult {
  const corpus = buildTextCorpus(patient);
  if (!corpus.trim()) return { totalScore: 0, severity: "none", detectedDrugs: [], message: "" };

  const detected: ACBResult["detectedDrugs"] = [];

  for (const drug of ACB_DRUGS) {
    if (drug.pattern.test(corpus)) {
      detected.push({ name: drug.name, nameHe: drug.nameHe, score: drug.score });
    }
  }

  const totalScore = detected.reduce((sum, d) => sum + d.score, 0);

  let severity: ACBResult["severity"];
  let message: string;

  if (totalScore === 0) {
    severity = "none";
    message = "";
  } else if (totalScore <= 2) {
    severity = "low";
    message = `ACB ${totalScore} — נטל אנטיכולינרגי נמוך. מעקב`;
  } else if (totalScore <= 4) {
    severity = "moderate";
    message = `⚠️ ACB ${totalScore} — סיכון דליריום ובלבול. שקול הפחתת תרופות אנטיכולינרגיות`;
  } else {
    severity = "high";
    message = `🔴 ACB ${totalScore} — נטל אנטיכולינרגי גבוה! סיכון דליריום, נפילות, אצירת שתן. הפחתה מיידית`;
  }

  return { totalScore, severity, detectedDrugs: detected, message };
}

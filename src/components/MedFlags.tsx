import { memo } from "react";
import type { PatientEntry } from "../types";

// ─── Geriatric medication hazard databases ─────────────────

const ANTICHOLINERGIC_HIGH = new Set([
  "amitriptyline", "nortriptyline", "clomipramine", "imipramine", "doxepin",
  "chlorpromazine", "thioridazine", "clozapine", "olanzapine",
  "hydroxyzine", "promethazine", "diphenhydramine", "dimenhydrinate",
  "oxybutynin", "tolterodine", "solifenacin", "darifenacin",
  "benztropine", "trihexyphenidyl", "scopolamine",
  "paroxetine", "cyclobenzaprine",
]);

const ANTICHOLINERGIC_MODERATE = new Set([
  "cetirizine", "loratadine", "ranitidine", "cimetidine",
  "quetiapine", "risperidone", "haloperidol",
  "metoclopramide", "loperamide", "codeine", "tramadol",
  "prednisone", "prednisolone", "theophylline",
  "carbamazepine", "oxcarbazepine",
]);

const QTC_PROLONGING = new Set([
  "amiodarone", "sotalol", "dronedarone",
  "haloperidol", "chlorpromazine", "thioridazine", "ziprasidone",
  "methadone", "erythromycin", "clarithromycin", "azithromycin",
  "ciprofloxacin", "levofloxacin", "moxifloxacin",
  "ondansetron", "domperidone", "metoclopramide",
  "citalopram", "escitalopram",
  "fluconazole", "ketoconazole",
  "hydroxychloroquine",
]);

const NEPHROTOXIC = new Set([
  "gentamicin", "tobramycin", "amikacin", "vancomycin",
  "amphotericin", "acyclovir",
  "ibuprofen", "naproxen", "diclofenac", "indomethacin", "celecoxib", "meloxicam",
  "metformin", "lithium",
  "cyclosporine", "tacrolimus",
  "methotrexate",
]);

const FALL_RISK = new Set([
  "lorazepam", "diazepam", "clonazepam", "alprazolam", "midazolam", "nitrazepam",
  "zolpidem", "zopiclone",
  "doxazosin", "prazosin", "tamsulosin",
  "amitriptyline", "nortriptyline", "trazodone", "mirtazapine",
  "haloperidol", "quetiapine", "risperidone", "olanzapine",
  "oxycodone", "morphine", "fentanyl", "tramadol", "codeine",
  "gabapentin", "pregabalin",
]);

const BEERS_AVOID = new Set([
  "glibenclamide", "glyburide", "chlorpropamide", // hypoglycemia risk
  "meperidine", // neurotoxic metabolite
  "indomethacin", // highest GI/renal risk
  "nitrofurantoin", // if CrCl < 30
  "nifedipine", // immediate-release
]);

// ─── Flag analysis ─────────────────────────────────────────

export interface MedFlag {
  emoji: string;
  label: string;
  color: string; // tailwind color key
  meds: string[];
}

function extractMedNames(patient: PatientEntry): string[] {
  // Gather text from tasks and notes that might contain medication names
  const texts = [
    ...(patient.tasks ?? []).map((t) => t.text),
    ...(patient.generatedTasks ?? []).map((t) => t.text),
    ...(patient.notes ?? []),
    patient.diagnosis ?? "",
  ];

  const combined = texts.join(" ").toLowerCase();
  const words = combined.split(/[\s,;/\-\(\)\[\]]+/).filter(Boolean);

  // Return unique words (crude but effective for matching against drug databases)
  return [...new Set(words)];
}

function matchSet(words: string[], drugSet: Set<string>): string[] {
  return words.filter((w) => drugSet.has(w));
}

export function analyzeMeds(patient: PatientEntry): MedFlag[] {
  const words = extractMedNames(patient);
  const flags: MedFlag[] = [];

  const achHigh = matchSet(words, ANTICHOLINERGIC_HIGH);
  const achMod = matchSet(words, ANTICHOLINERGIC_MODERATE);
  const achTotal = achHigh.length * 3 + achMod.length; // crude burden score

  if (achTotal >= 3) {
    flags.push({
      emoji: "🧠",
      label: `עומס אנטיכולינרגי (${achTotal})`,
      color: achTotal >= 6 ? "red" : "amber",
      meds: [...achHigh, ...achMod],
    });
  }

  const qtc = matchSet(words, QTC_PROLONGING);
  if (qtc.length >= 2) {
    flags.push({
      emoji: "💓",
      label: `QTc — ${qtc.length} תרופות`,
      color: "red",
      meds: qtc,
    });
  } else if (qtc.length === 1) {
    flags.push({
      emoji: "💓",
      label: "QTc — עקוב",
      color: "amber",
      meds: qtc,
    });
  }

  const nephro = matchSet(words, NEPHROTOXIC);
  if (nephro.length > 0) {
    flags.push({
      emoji: "💧",
      label: `נפרוטוקסי (${nephro.length})`,
      color: nephro.length >= 2 ? "red" : "amber",
      meds: nephro,
    });
  }

  const falls = matchSet(words, FALL_RISK);
  if (falls.length >= 2) {
    flags.push({
      emoji: "⚠️",
      label: `סיכון נפילה (${falls.length})`,
      color: falls.length >= 3 ? "red" : "amber",
      meds: falls,
    });
  }

  const beers = matchSet(words, BEERS_AVOID);
  if (beers.length > 0) {
    flags.push({
      emoji: "🔴",
      label: "Beers — הימנע",
      color: "red",
      meds: beers,
    });
  }

  return flags;
}

// ─── Component ─────────────────────────────────────────────

const colorMap: Record<string, string> = {
  red: "bg-red-50 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800",
  amber:
    "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700",
};

export const MedFlagBadges = memo(function MedFlagBadges({ patient }: { patient: PatientEntry }) {
  const flags = analyzeMeds(patient);
  if (flags.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {flags.map((f, i) => (
        <span
          key={i}
          className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border ${colorMap[f.color] ?? colorMap.amber}`}
          title={f.meds.join(", ")}
        >
          <span>{f.emoji}</span>
          <span className="font-medium">{f.label}</span>
        </span>
      ))}
    </div>
  );
});

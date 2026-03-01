/**
 * Antimicrobial Renal Dosing Database
 *
 * Covers antibiotics used in the QuickReference empiric protocols.
 * Buckets follow standard pharmacokinetic breakpoints:
 *   normal   → CrCl > 50 ml/min
 *   crcl_10_50 → CrCl 10–50 ml/min
 *   crcl_lt10  → CrCl < 10 ml/min
 *   hd         → hemodialysis (dose after session)
 *
 * Sources: Sanford Guide, SZMC DAG, package inserts.
 * This is a CLINICAL DECISION SUPPORT tool — always verify.
 */

export interface DrugDosingEntry {
  label: string;
  normal: string;
  crcl_10_50: string;
  crcl_lt10: string;
  hd: string;
  notes?: string;
}

export const DRUG_DOSING: Record<string, DrugDosingEntry> = {
  // ── Beta-lactams ──
  pip_tazo: {
    label: "Piperacillin/Tazobactam",
    normal: "4.5g IV q6h",
    crcl_10_50: "4.5g IV q8h (CrCl 20-40) · 2.25g IV q6h (CrCl <20)",
    crcl_lt10: "2.25g IV q8h",
    hd: "2.25g IV q8h + 0.75g after HD",
    notes: "Extended infusion (4h) preferred for serious infections",
  },
  ceftriaxone: {
    label: "Ceftriaxone",
    normal: "1-2g IV q24h",
    crcl_10_50: "1-2g IV q24h (no adjustment)",
    crcl_lt10: "1-2g IV q24h (no adjustment)",
    hd: "1-2g IV q24h (no adjustment, not dialyzed)",
    notes: "Biliary excretion — no renal adjustment needed",
  },
  cefazolin: {
    label: "Cefazolin",
    normal: "2g IV q8h",
    crcl_10_50: "1-2g IV q12h (CrCl 35-54) · 1g IV q12h (CrCl 10-34)",
    crcl_lt10: "1g IV q24h",
    hd: "1g IV q24h + 1g after HD",
  },
  cephalexin: {
    label: "Cephalexin",
    normal: "500mg PO q6h",
    crcl_10_50: "500mg PO q8-12h",
    crcl_lt10: "250mg PO q12h",
    hd: "250mg PO q12h + 250mg after HD",
  },
  cefepime: {
    label: "Cefepime",
    normal: "2g IV q8h",
    crcl_10_50: "2g IV q12h (CrCl 30-50) · 1g IV q12h (CrCl 10-29)",
    crcl_lt10: "1g IV q24h",
    hd: "1g IV q24h + 1g after HD",
    notes: "⚠ Neurotoxicity risk in elderly with CrCl <30 — monitor for AMS/seizures",
  },
  meropenem: {
    label: "Meropenem",
    normal: "1g IV q8h",
    crcl_10_50: "1g IV q12h (CrCl 26-50) · 500mg IV q12h (CrCl 10-25)",
    crcl_lt10: "500mg IV q24h",
    hd: "500mg IV q24h + 500mg after HD",
    notes: "Extended infusion (3h) improves PK/PD for resistant organisms",
  },
  aztreonam: {
    label: "Aztreonam",
    normal: "1-2g IV q8h",
    crcl_10_50: "1-2g IV q12h",
    crcl_lt10: "1g IV q12h",
    hd: "500mg IV q8h (supplement after HD)",
    notes: "Safe in severe beta-lactam allergy. Covers GNR incl. Pseudomonas but NOT ESBL",
  },
  amox_clav: {
    label: "Amoxicillin/Clavulanate",
    normal: "875/125mg PO q12h",
    crcl_10_50: "500/125mg PO q12h (CrCl 10-30)",
    crcl_lt10: "500/125mg PO q24h",
    hd: "500/125mg PO q24h + dose after HD",
  },

  // ── Fluoroquinolones ──
  ciprofloxacin: {
    label: "Ciprofloxacin",
    normal: "400mg IV q12h / 500mg PO q12h",
    crcl_10_50: "400mg IV q12h / 250-500mg PO q12h (CrCl 30-50) · 200mg IV q12h (CrCl <30)",
    crcl_lt10: "200mg IV q12h / 250mg PO q12h",
    hd: "250mg PO q12h (give after HD)",
  },
  levofloxacin: {
    label: "Levofloxacin",
    normal: "750mg IV/PO q24h",
    crcl_10_50: "750mg load → 500mg q24h (CrCl 20-49) · 750mg load → 250mg q24h (CrCl <20)",
    crcl_lt10: "750mg load → 250mg q48h",
    hd: "750mg load → 250mg q48h (not removed by HD)",
  },

  // ── Aminoglycosides ──
  gentamicin: {
    label: "Gentamicin",
    normal: "5mg/kg IV q24h (extended-interval) / 1mg/kg IV q8h (traditional)",
    crcl_10_50: "Traditional: 1mg/kg q12-24h. Extended-interval: use Hartford nomogram",
    crcl_lt10: "1mg/kg load → redose by levels",
    hd: "1mg/kg load → redose by levels post-HD",
    notes: "⚠ Avoid >5d in elderly if possible. Monitor levels: peak/trough or AUC",
  },
  amikacin: {
    label: "Amikacin",
    normal: "15mg/kg IV q24h",
    crcl_10_50: "15mg/kg load → redose q24-48h by levels",
    crcl_lt10: "15mg/kg load → redose by levels",
    hd: "7.5mg/kg load → redose by levels post-HD",
    notes: "⚠ Nephro/ototoxic. Monitor levels",
  },

  // ── Glycopeptides ──
  vancomycin: {
    label: "Vancomycin (IV)",
    normal: "15-20mg/kg IV q8-12h (load 25-30mg/kg)",
    crcl_10_50: "15mg/kg IV q24h (CrCl 30-50) · 15mg/kg IV q48h (CrCl 10-29)",
    crcl_lt10: "15mg/kg load → redose by levels (q48-72h)",
    hd: "15-20mg/kg load → 500mg after each HD session (target trough 15-20)",
    notes: "AUC/MIC-guided dosing preferred over trough-only",
  },

  // ── Other ──
  metronidazole: {
    label: "Metronidazole",
    normal: "500mg IV/PO q8h",
    crcl_10_50: "500mg IV/PO q8h (no adjustment)",
    crcl_lt10: "500mg IV/PO q12h (some reduce for severe CKD)",
    hd: "500mg IV/PO q8h (removed by HD — dose after session)",
    notes: "Hepatic metabolism. Reduce only in severe hepatic impairment",
  },
  clindamycin: {
    label: "Clindamycin",
    normal: "600mg IV q8h / 300mg PO q6h",
    crcl_10_50: "No renal adjustment",
    crcl_lt10: "No renal adjustment",
    hd: "No renal adjustment (not removed by HD)",
    notes: "Hepatic metabolism — no renal dose adjustment",
  },
  azithromycin: {
    label: "Azithromycin",
    normal: "500mg IV/PO q24h",
    crcl_10_50: "No renal adjustment",
    crcl_lt10: "No renal adjustment",
    hd: "No renal adjustment",
    notes: "Hepatic/biliary — no renal adjustment",
  },
  nitrofurantoin: {
    label: "Nitrofurantoin",
    normal: "100mg PO q12h (macrocrystal)",
    crcl_10_50: "⚠ CrCl <30: AVOID — ineffective (poor urinary concentration) + toxicity risk",
    crcl_lt10: "CONTRAINDICATED",
    hd: "CONTRAINDICATED",
    notes: "Only effective with adequate GFR for urinary excretion",
  },
  fidaxomicin: {
    label: "Fidaxomicin",
    normal: "200mg PO q12h x10d",
    crcl_10_50: "No renal adjustment (minimal systemic absorption)",
    crcl_lt10: "No renal adjustment",
    hd: "No renal adjustment",
  },
  vancomycin_po: {
    label: "Vancomycin (PO — C.diff)",
    normal: "125mg PO q6h x10-14d",
    crcl_10_50: "No renal adjustment (not absorbed)",
    crcl_lt10: "No renal adjustment (not absorbed)",
    hd: "No renal adjustment (not absorbed)",
    notes: "PO Vancomycin is NOT systemically absorbed — no renal adjustment needed",
  },
};

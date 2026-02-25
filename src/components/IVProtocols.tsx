import { useState, useMemo, useCallback } from "react";

// ─── SZMC IV Protocol Data ─────────────────────────────────
interface RateRow { dose: string; rates: Record<string, string> }
interface DosingRow { range: string; cols: string[] }
interface Protocol {
  id: string;
  drug: string;
  titleHe: string;
  titleEn: string;
  icon: string;
  highRisk: boolean;
  setting?: string;
  preparation?: { steps: string[]; concentration: string };
  monitoring?: string[];
  contraindications?: string[];
  dosingNotes?: string[];
  dosingTable?: { headers: string[]; rows: DosingRow[] };
  rateTable?: { weights: string[]; rows: RateRow[] };
  simpleRateTable?: { headers: string[]; rows: string[][] };
  warnings?: string[];
  notes?: string[];
}

const PROTOCOLS: Protocol[] = [
  {
    id: "insulin", drug: "Insulin (Actrapid)", icon: "💉",
    titleHe: "אינסולין מתמשך בווריד", titleEn: "IV Continuous Insulin",
    highRisk: true, setting: "ICU / טיפול מוגבר",
    preparation: {
      steps: ["ACTRAPID 50 units + NaCl 0.9% 50ml"],
      concentration: "1 unit / ml (1:1)",
    },
    monitoring: ["Titration: BG q2h", "After rate change/bolus: 2 checks, 2h apart", "Stable: BG q4h"],
    contraindications: ["Glucose <70", "DKA", "Hyperosmolar Coma"],
    dosingNotes: ["Target glucose: 140-180 mg/dL"],
    dosingTable: {
      headers: ["mg/dL", "No DM", "DM", "High Req"],
      rows: [
        { range: "<70", cols: ["STOP. D50% 50ml IV. Check q15min.", "—", "—"] },
        { range: "70-99", cols: ["Stop", "Stop", "→ MD"] },
        { range: "100-140", cols: ["Stop", "0.5 cc/hr", "→ MD"] },
        { range: "141-180", cols: ["Stop", "1 cc/hr", "2 cc/hr"] },
        { range: "181-200", cols: ["1 cc/hr", "2cc bol + 1cc/hr", "2cc bol + 2cc/hr"] },
        { range: "201-250", cols: ["2cc bol + 2cc/hr", "2cc bol + 3cc/hr", "2cc bol + 5cc/hr"] },
        { range: "251-300", cols: ["2cc bol + 2cc/hr", "2cc bol + 4cc/hr", "2cc bol + 6cc/hr"] },
        { range: "301-350", cols: ["4cc bol + 4cc/hr", "4cc bol + 6cc/hr", "4cc bol + 8cc/hr"] },
        { range: "351-400", cols: ["4cc bol + 6cc/hr", "4cc bol + 6cc/hr", "6cc bol + 8cc/hr"] },
        { range: ">400", cols: ["2x consecutive → High Req column. Call MD.", "—", "—"] },
      ],
    },
  },
  {
    id: "propofol", drug: "Propofol 2%", icon: "🫧",
    titleHe: "פרופופול 2% — הרדמה למונשם", titleEn: "IV Propofol 2% (Ventilated)",
    highRisk: true, setting: "ICU Only / מונשמים בלבד",
    preparation: {
      steps: ["20 mg/ml ready-to-use", "Syringe pump (TCI-3) preferred"],
      concentration: "20 mg / ml",
    },
    dosingNotes: [
      "Start: 5 mcg/kg/min",
      "Titrate: +5-10 mcg/kg/min q10min",
      "Max: 50 mcg/kg/min",
      "Target: Ramsay 3-5",
      "Change syringe q12h",
      "Use Adjusted Body Weight if BMI >30",
    ],
    rateTable: {
      weights: ["40", "50", "60", "70", "80", "90"],
      rows: [
        { dose: "5", rates: { "40":"0.6","50":"0.8","60":"0.9","70":"1.1","80":"1.2","90":"1.4" } },
        { dose: "10", rates: { "40":"1.2","50":"1.5","60":"1.8","70":"2.1","80":"2.4","90":"2.7" } },
        { dose: "15", rates: { "40":"1.8","50":"2.3","60":"2.7","70":"3.2","80":"3.6","90":"4.1" } },
        { dose: "20", rates: { "40":"2.4","50":"3.0","60":"3.6","70":"4.2","80":"4.8","90":"5.4" } },
        { dose: "30", rates: { "40":"3.6","50":"4.5","60":"5.4","70":"6.3","80":"7.2","90":"8.1" } },
        { dose: "40", rates: { "40":"4.8","50":"6.0","60":"7.2","70":"8.4","80":"9.6","90":"10.8" } },
        { dose: "50", rates: { "40":"6.0","50":"7.5","60":"9.0","70":"10.5","80":"12.0","90":"13.5" } },
      ],
    },
    warnings: [
      "⚠️ PRIS: Risk ↑ if >50 mcg/kg/min or >48h",
      "Monitor: CK, pH, TG, lactate q24h",
      "Signs: acidosis, rhabdomyolysis, hyperK, cardiac failure → STOP immediately",
    ],
    contraindications: ["Non-ventilated patients"],
    notes: ["Y-set with Fentanyl or dedicated line", "NOT for ward sedation"],
  },
  {
    id: "fentanyl", drug: "Fentanyl", icon: "💊",
    titleHe: "פנטניל בווריד", titleEn: "IV Fentanyl",
    highRisk: true,
    preparation: {
      steps: ["1 amp Fentanyl (0.5mg/10ml)", "+ 40 ml NaCl 0.9%", "Total: 50 ml"],
      concentration: "10 mcg / 1 ml",
    },
    dosingNotes: [
      "Loading: 12.5-25 mcg over 2 min",
      "May repeat after 5 min peak",
      "Maintenance: 20-50 mcg/hr",
      "Titrate q30-60 min, max +10 mcg/hr/step",
    ],
    simpleRateTable: {
      headers: ["mcg/hr", "ml/hr"],
      rows: [["10","1"], ["20","2"], ["30","3"], ["50","5"]],
    },
  },
  {
    id: "dormicum", drug: "Dormicum (Midazolam)", icon: "🧪",
    titleHe: "דורמיקום — מידזולם", titleEn: "IV Dormicum (Midazolam)",
    highRisk: true,
    preparation: {
      steps: ["NaCl 0.9% 100ml — remove 20ml", "Add Dormicum 100mg (20ml concentrate)"],
      concentration: "1 mg / 1 ml",
    },
    dosingNotes: ["Rate per physician order", "Titrate to target sedation"],
  },
  {
    id: "morphine", drug: "Morphine", icon: "💊",
    titleHe: "מורפין בווריד", titleEn: "IV Morphine",
    highRisk: true,
    preparation: {
      steps: ["NaCl 0.9% 100ml — remove 5ml", "Add Morphine 100mg/5cc (1 amp)"],
      concentration: "1 mg / 1 ml",
    },
    dosingNotes: ["Rate per physician order", "Continuous infusion or bolus as prescribed"],
  },
  {
    id: "noradrenaline", drug: "Noradrenaline", icon: "🔴",
    titleHe: "נוראדרנלין", titleEn: "IV Noradrenaline (Norepinephrine)",
    highRisk: true, setting: "Shock / הלם",
    preparation: {
      steps: ["D5% 100ml — remove 4ml", "Add 1 amp Noradrenaline (4mg/4ml)"],
      concentration: "40 mcg / ml",
    },
    dosingNotes: [
      "Start: ~0.05-0.1 mcg/kg/min",
      "Titrate to MAP ≥65",
      "Continuous BP monitoring (art line preferred)",
    ],
    warnings: [
      "⚡ D5% ONLY (NOT NaCl)",
      "Dedicated separate IV line",
      "Very short T½ — replace bag IMMEDIATELY",
      "Extravasation → tissue necrosis!",
    ],
    contraindications: ["Central line preferred", "Peripheral only temporarily, large-bore, patent"],
  },
  {
    id: "dopamine", drug: "Dopamine", icon: "🔴",
    titleHe: "דופמין", titleEn: "IV Dopamine",
    highRisk: true,
    preparation: {
      steps: ["D5% or NaCl 100ml base", "Add 5 amps Dopamine (200mg/5ml each)"],
      concentration: "~5 mg / ml",
    },
    contraindications: ["VF (post-resuscitation)", "Hemodynamic instability", "Symptomatic bradyarrhythmia"],
    dosingNotes: ["Rate per physician order", "IV pump required"],
  },
  {
    id: "amiodarone", drug: "Procor (Amiodarone)", icon: "⚡",
    titleHe: "פרוקור — אמיודרון", titleEn: "IV Procor (Amiodarone)",
    highRisk: true,
    preparation: {
      steps: ["Loading: 300mg in D5% 100ml over 30min", "Maintenance: 900-1200mg in D5% 500ml"],
      concentration: "Loading: 3mg/ml · Maint: 1.8-2.4mg/ml",
    },
    simpleRateTable: {
      headers: ["Dose", "12hr", "24hr"],
      rows: [
        ["900mg/500ml", "75mg/hr = 43ml/hr", "38mg/hr = 22ml/hr"],
        ["1200mg/500ml", "101mg/hr = 43ml/hr", "50mg/hr = 22ml/hr"],
      ],
    },
    contraindications: ["Amiodarone allergy", "Bradycardia <50", "AV block (no pacer)"],
    warnings: ["Phlebitis risk with peripheral IV — use 500ml dilution"],
  },
  {
    id: "heparin", drug: "Heparin (UFH)", icon: "🩸",
    titleHe: "הפרין לא מפורק", titleEn: "IV Heparin (Unfractionated)",
    highRisk: true,
    preparation: {
      steps: ["10,000 units per ampoule", "Add to NaCl 0.9% per total units ordered"],
      concentration: "100 units / 1 ml",
    },
    monitoring: [
      "aPTT q6h initially (target 1.5-2.5x control)",
      "CBC + platelets daily (HIT watch: >50% drop)",
      "Signs of bleeding: hematomas, retroperitoneal, GI, CNS",
    ],
    contraindications: ["HIT (type II)", "DIC (relative)", "Active major bleeding"],
    notes: ["Reversal: Protamine 1mg per 100 units heparin (last 2-3h)"],
  },
  {
    id: "lidocaine", drug: "Lidocaine", icon: "⚡",
    titleHe: "לידוקאין", titleEn: "IV Lidocaine",
    highRisk: false,
    preparation: {
      steps: ["2000mg Lidocaine in NaCl 0.9% 500ml"],
      concentration: "4 mg / ml",
    },
    dosingNotes: [
      "Loading: 1-1.5 mg/kg over 5 min. May repeat x1.",
      "Maintenance: 1-4 mg/min (~15-60 ml/hr by weight)",
    ],
    warnings: ["Toxicity: perioral numbness → tinnitus → confusion → seizures → CV collapse"],
  },
  {
    id: "magnesium", drug: "Magnesium Sulfate", icon: "🧂",
    titleHe: "מגנזיום סולפט", titleEn: "IV Magnesium Sulfate",
    highRisk: false,
    preparation: {
      steps: ["MgSO4 50% ampoules into NaCl 0.9% 100ml"],
      concentration: "Per order — infuse over ~2 hours",
    },
    monitoring: [
      "Check Mg level before repeat",
      "Watch: loss of DTR (early toxicity), resp depression, hypotension",
    ],
    notes: ["Antidote: Ca Gluconate 10% 10ml IV over 10min"],
  },
  {
    id: "kphosphate", drug: "Potassium Phosphate", icon: "🧪",
    titleHe: "אשלגן זרחתי", titleEn: "IV Potassium Phosphate",
    highRisk: true,
    dosingNotes: [
      "Peripheral: 15mmol in 500ml over 6 hours",
      "Central: 15mmol in 250ml over 4 hours",
      "Diluent: D5% / NaCl 0.45% / NaCl 0.9% (per serum Na)",
    ],
  },
  {
    id: "sbe", drug: "SBE Antibiotics", icon: "🦠",
    titleHe: "אנדוקרדיטיס חיידקית", titleEn: "Bacterial Endocarditis (SBE)",
    highRisk: false,
    simpleRateTable: {
      headers: ["Pathogen", "First Line", "Duration"],
      rows: [
        ["Strep (native)", "Ampicillin + Gent", "4-6w + 2w"],
        ["Staph MSSA", "Cloxacillin", "6w"],
        ["Staph (prosthetic)", "Vanc + Rifampin + Gent", "≥6w"],
        ["Enterococcus", "Ampicillin + Gent", "4-6w"],
      ],
    },
    notes: ["3 blood cultures before ABx", "TTE → TEE if needed", "ID consult"],
  },
];

const KEYWORDS: Record<string, string> = {
  insulin: "אינסולין actrapid glucose סוכר dka",
  propofol: "פרופופול sedation הרדמה ventilator pris",
  fentanyl: "פנטניל pain כאב opioid",
  dormicum: "מידזולם דורמיקום midazolam benzodiazepine",
  morphine: "מורפין pain כאב opioid palliative",
  noradrenaline: "נוראדרנלין norepinephrine vasopressor shock הלם",
  dopamine: "דופמין vasopressor shock bradycardia",
  amiodarone: "פרוקור procor אמיודרון arrhythmia הפרעת קצב",
  heparin: "הפרין anticoagulation dvt pe נוגד קרישה",
  lidocaine: "לידוקאין arrhythmia vt vf",
  magnesium: "מגנזיום torsades hypomagnesemia",
  kphosphate: "אשלגן זרחן phosphate hypophosphatemia",
  sbe: "אנדוקרדיטיס endocarditis antibiotic vancomycin",
};

// ─── Component ─────────────────────────────────────────────
export function IVProtocols({ onClose }: { onClose: () => void }) {
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return PROTOCOLS;
    const q = search.toLowerCase();
    return PROTOCOLS.filter((p) => {
      const blob = `${p.drug} ${p.titleHe} ${p.titleEn} ${KEYWORDS[p.id] || ""}`.toLowerCase();
      return blob.includes(q);
    });
  }, [search]);

  const toggle = useCallback((id: string) => {
    setOpenId((prev) => (prev === id ? null : id));
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 bg-slate-800 border-b border-slate-700 safe-top">
        <button onClick={onClose} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-300 active:bg-slate-700 rounded-lg" aria-label="סגור">✕</button>
        <div className="flex-1">
          <h2 className="text-base font-bold text-white">💉 פרוטוקולי IV — שערי צדק</h2>
          <p className="text-[11px] text-slate-400">SZMC IV Drug Protocols · May 2024</p>
        </div>
      </header>

      {/* Search */}
      <div className="px-3 py-2 bg-slate-800/50">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 חפש תרופה... Search drug..."
          className="w-full px-3 py-2.5 rounded-lg bg-slate-900 border border-slate-600 text-slate-200 text-sm placeholder:text-slate-500 outline-none focus:border-blue-500"
        />
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto px-3 pb-6 space-y-2 pt-2">
        {filtered.length === 0 && (
          <p className="text-center text-slate-500 py-10 text-sm">לא נמצאו תוצאות</p>
        )}
        {filtered.map((p) => (
          <ProtocolCard key={p.id} protocol={p} isOpen={openId === p.id} onToggle={() => toggle(p.id)} />
        ))}
        <div className="text-center text-[10px] text-slate-600 pt-4">
          Dr. D.S. Shapira (32398) · Geriatrics Dept · SZMC · May 2024
        </div>
      </div>
    </div>
  );
}

// ─── Single Protocol Card ───────────────────────────────────
function ProtocolCard({ protocol: p, isOpen, onToggle }: { protocol: Protocol; isOpen: boolean; onToggle: () => void }) {
  return (
    <div className={`rounded-xl border overflow-hidden ${p.highRisk ? "border-red-800/70" : "border-slate-700"} bg-slate-800`}>
      {/* Header */}
      <button onClick={onToggle} className="w-full flex items-center gap-2 px-4 py-3 text-right active:bg-slate-700/50">
        <span className="text-lg">{p.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-100 truncate">{p.drug}</div>
          <div className="text-[11px] text-slate-400 truncate">{p.titleHe}</div>
        </div>
        {p.highRisk && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-900/80 text-red-300 font-bold whitespace-nowrap">High Risk</span>}
        {p.setting && <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-900/60 text-blue-300 whitespace-nowrap hidden sm:inline">{p.setting}</span>}
        <span className={`text-slate-500 text-xs transition-transform ${isOpen ? "rotate-180" : ""}`}>▼</span>
      </button>

      {/* Body */}
      {isOpen && (
        <div className="px-4 pb-4 space-y-3 text-[13px] text-slate-300 leading-relaxed border-t border-slate-700/50">
          {/* Preparation */}
          {p.preparation && (
            <Section title="הכנה — Preparation">
              {p.preparation.steps.map((s, i) => (
                <div key={i} className="bg-slate-900 px-3 py-1.5 rounded-md border-r-[3px] border-blue-500 text-[12px] mb-1">{s}</div>
              ))}
              <div className="text-center font-bold text-emerald-400 bg-emerald-900/30 rounded-lg py-2 mt-1 text-[13px]">
                {p.preparation.concentration}
              </div>
              {p.highRisk && <DoubleCheck />}
            </Section>
          )}

          {/* Dosing notes */}
          {p.dosingNotes && p.dosingNotes.length > 0 && (
            <Section title="מינון — Dosing">
              {p.dosingNotes.map((n, i) => <div key={i} className="text-[12px]">• {n}</div>)}
            </Section>
          )}

          {/* Full dosing table (insulin-style) */}
          {p.dosingTable && (
            <Section title="טבלת מינון">
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-[10px] border-collapse min-w-[340px]">
                  <thead>
                    <tr>{p.dosingTable.headers.map((h, i) => <th key={i} className="bg-slate-700 text-blue-300 px-2 py-1.5 text-center font-semibold sticky top-0">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {p.dosingTable.rows.map((r, i) => (
                      <tr key={i} className={i % 2 === 0 ? "bg-slate-900" : "bg-slate-800"}>
                        <td className="px-2 py-1.5 text-center font-bold text-blue-400 border-l border-slate-700">{r.range}</td>
                        {r.cols.map((c, j) => <td key={j} className="px-2 py-1.5 text-center border-l border-slate-700/50">{c}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* Weight-based rate table (propofol) */}
          {p.rateTable && (
            <Section title="קצב עירוי (ml/hr) לפי משקל">
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-[10px] border-collapse min-w-[340px]">
                  <thead>
                    <tr>
                      <th className="bg-slate-700 text-blue-300 px-2 py-1.5 text-center sticky top-0">mcg/kg/min</th>
                      {p.rateTable.weights.map((w) => <th key={w} className="bg-slate-700 text-blue-300 px-2 py-1.5 text-center sticky top-0">{w}kg</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {p.rateTable.rows.map((r, i) => (
                      <tr key={i} className={i % 2 === 0 ? "bg-slate-900" : "bg-slate-800"}>
                        <td className="px-2 py-1.5 text-center font-bold text-blue-400">{r.dose}</td>
                        {p.rateTable!.weights.map((w) => <td key={w} className="px-2 py-1.5 text-center">{r.rates[w]}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* Simple table (fentanyl rates, amiodarone, SBE) */}
          {p.simpleRateTable && (
            <Section title="טבלה">
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-[11px] border-collapse">
                  <thead>
                    <tr>{p.simpleRateTable.headers.map((h, i) => <th key={i} className="bg-slate-700 text-blue-300 px-2 py-1.5 text-center font-semibold">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {p.simpleRateTable.rows.map((r, i) => (
                      <tr key={i} className={i % 2 === 0 ? "bg-slate-900" : "bg-slate-800"}>
                        {r.map((c, j) => <td key={j} className="px-2 py-1.5 text-center border-l border-slate-700/50">{c}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* Monitoring */}
          {p.monitoring && p.monitoring.length > 0 && (
            <Section title="ניטור — Monitoring">
              {p.monitoring.map((m, i) => <div key={i} className="text-[12px]">• {m}</div>)}
            </Section>
          )}

          {/* Contraindications */}
          {p.contraindications && p.contraindications.length > 0 && (
            <Section title="התוויות נגד">
              <div className="flex flex-wrap gap-1">
                {p.contraindications.map((c, i) => (
                  <span key={i} className="text-[10px] bg-slate-900 border border-slate-600 rounded px-2 py-0.5 text-slate-400">{c}</span>
                ))}
              </div>
            </Section>
          )}

          {/* Warnings */}
          {p.warnings && p.warnings.length > 0 && (
            <div className="bg-amber-950/40 border border-amber-800/50 rounded-lg p-3 text-[12px] text-amber-300 space-y-1">
              {p.warnings.map((w, i) => <div key={i}>{w}</div>)}
            </div>
          )}

          {/* Notes */}
          {p.notes && p.notes.length > 0 && (
            <Section title="הערות">
              {p.notes.map((n, i) => <div key={i} className="text-[12px] text-slate-400">• {n}</div>)}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pt-2">
      <div className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-1.5 pb-1 border-b border-slate-700/50">{title}</div>
      {children}
    </div>
  );
}

function DoubleCheck() {
  return (
    <div className="inline-flex items-center gap-1 bg-red-900/60 text-red-300 px-3 py-1 rounded-md text-[11px] font-bold mt-1">
      ⚠️ בקרה כפולה — Double Check Required
    </div>
  );
}

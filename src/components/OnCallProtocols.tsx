// src/components/OnCallProtocols.tsx
// Internal medicine on-call protocols — practical "what to do at 3am" guides.
// Each protocol is a standalone reference for a common on-call scenario.

import { useState } from "react";

// ─── Shared UI helpers ────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-1.5 border-b border-slate-200 dark:border-slate-700 pb-1">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 mb-1.5">
      <span className="shrink-0 w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center mt-0.5">
        {n}
      </span>
      <div className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{children}</div>
    </div>
  );
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-2 text-xs text-red-800 dark:text-red-300 mb-2">
      ⚠️ {children}
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-2 text-xs text-blue-800 dark:text-blue-300 mb-2">
      💡 {children}
    </div>
  );
}

function Drug({ name, dose, route, notes }: { name: string; dose: string; route: string; notes?: string }) {
  return (
    <div className="bg-slate-50 dark:bg-slate-800/50 rounded px-2 py-1 mb-1 text-xs">
      <span className="font-semibold text-slate-800 dark:text-slate-200">{name}</span>
      <span className="text-slate-500 dark:text-slate-400"> — {dose} {route}</span>
      {notes && <span className="text-slate-500 dark:text-slate-400 block text-[11px]">{notes}</span>}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// PROTOCOLS
// ════════════════════════════════════════════════════════════

export function ChestPainProtocol() {
  return (
    <div className="space-y-3" dir="rtl">
      <Warn>STEMI = קתטור תוך 90 דקות. אל תמתין!</Warn>

      <Section title="הערכה ראשונית (0-10 דקות)">
        <Step n={1}>ECG תוך 10 דקות מהגעה — חפש ST elevation, depression, new LBBB</Step>
        <Step n={2}>טרופונין STAT (חזור אחרי 3h אם שלילי ויש חשד)</Step>
        <Step n={3}>סיפור: אופי הכאב, הקרנה, משך, גורמים מחמירים/מקלים, סיכון (DM, HTN, smoking, family)</Step>
        <Step n={4}>בדיקה: BP בשתי ידיים (דיסקציה?), JVP, שמיעת ריאות, דפקים פריפריים</Step>
      </Section>

      <Section title="טיפול מיידי (MONA — בשינוי)">
        <Drug name="Aspirin" dose="300mg" route="PO (ללעוס)" notes="אלא אם אלרגיה / דימום פעיל" />
        <Drug name="Nitroglycerin" dose="0.5mg SL" route="כל 5 דק' x3" notes="❌ אם SBP<90, Viagra/Cialis ב-24-48h, RV infarct" />
        <Drug name="Morphine" dose="2-4mg IV" route="q5-15min" notes="אם כאב לא מגיב ל-NTG. זהירות: hypotension" />
        <Drug name="Heparin" dose="60U/kg bolus → 12U/kg/h" route="IV" notes="NSTEMI/UA — לאחר התייעצות קרדיולוג" />
        <Drug name="Oxygen" dose="2-4L NC" route="" notes="רק אם SpO2 <94%" />
      </Section>

      <Section title="אבחנה מבדלת — אל תפספס">
        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
          <div>🔴 <strong>תסחיף ריאתי</strong> — D-dimer, CTPA אם סיכון גבוה</div>
          <div>🔴 <strong>דיסקציה של אאורטה</strong> — BP asymmetry, CXR mediastinum רחב, CT angio</div>
          <div>🔴 <strong>pneumothorax</strong> — קולות נשימה חד-צדדיים, CXR</div>
          <div>🟡 <strong>פריקרדיטיס</strong> — כאב pleuritic, diffuse ST elevation, PR depression</div>
          <div>🟡 <strong>GI</strong> — GERD, esophageal spasm, peptic ulcer</div>
          <div>🟡 <strong>musculoskeletal</strong> — reproducible on palpation</div>
        </div>
      </Section>

      <Tip>בקשישים ACS יכול להיות ללא כאב — רק קוצר נשימה, בלבול, בחילה, הזעה</Tip>
    </div>
  );
}

export function AcuteDyspneaProtocol() {
  return (
    <div className="space-y-3" dir="rtl">
      <Section title="הערכה ראשונית — ABC">
        <Step n={1}>SpO2, RR, BP, HR — אם SpO2 {"<"}88% → O2 מיידי (NC → mask → NRB)</Step>
        <Step n={2}>שמיעת ריאות: crackles (בצקת), wheezing (COPD/asthma), absent (pneumothorax)</Step>
        <Step n={3}>Labs: ABG/VBG, troponin, BNP, CBC, CRP, D-dimer (אם חשד PE)</Step>
        <Step n={4}>CXR STAT — בצקת? infiltrate? effusion? pneumothorax?</Step>
      </Section>

      <Section title="בצקת ריאות (Acute Pulmonary Edema)">
        <Drug name="Furosemide" dose="40-80mg" route="IV bolus" notes="אם כבר על lasix → כפלת PO dose ב-IV" />
        <Drug name="NTG" dose="SL 0.5mg → drip 10-200mcg/min" route="" notes="הכי אפקטיבי! ❌ אם SBP<90" />
        <Drug name="Morphine" dose="2-4mg IV" route="" notes="מפחית preload + חרדה. זהירות: דיכוי נשימתי" />
        <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
          ישיבה 90°. BiPAP אם לא מגיב (IPAP 10-15, EPAP 5-8). אם DNI — תעד ceiling of care.
        </div>
      </Section>

      <Section title="COPD exacerbation">
        <Drug name="Salbutamol" dose="2.5-5mg" route="nebulizer q20min x3" />
        <Drug name="Ipratropium" dose="0.5mg" route="nebulizer + salbutamol" />
        <Drug name="Methylprednisolone" dose="40mg" route="IV" notes="או Prednisone 40mg PO x5 ימים" />
        <Drug name="Antibiotics" dose="" route="" notes="אם purulent sputum / CRP↑: Azithromycin 500mg PO או Amoxicillin-Clav" />
        <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
          SpO2 יעד: 88-92%! לא 100%. BiPAP אם pH {"<"}7.35 + CO2 {">"} 45.
        </div>
      </Section>

      <Section title="PE — חשוד?">
        <div className="text-xs text-slate-600 dark:text-slate-400">
          Wells score → אם סיכון גבוה: CTPA מיידי. טכיקרדיה + hypoxia לא מוסברת = PE עד שהוכח אחרת.
          אם massive PE (shock) → thrombolysis: tPA 100mg IV over 2h. התייעץ קרדיולוג/מכשירים.
        </div>
      </Section>
    </div>
  );
}

export function GIBleedProtocol() {
  return (
    <div className="space-y-3" dir="rtl">
      <Warn>דימום GI עליון + hemodynamic instability = גסטרו דחוף + ICU</Warn>

      <Section title="הערכה ראשונית">
        <Step n={1}>ABCs — 2 IV lines (16-18G), crossmatch, type & screen</Step>
        <Step n={2}>Labs: CBC, BMP, INR/PT, fibrinogen, lactate, group + cross 2-4 units</Step>
        <Step n={3}>סיווג: hematemesis / coffee grounds = upper. מלנה = upper (בד"כ). דם אדום מהרקטום = lower (או massive upper)</Step>
        <Step n={4}>Rectal exam — צבע צואה, hemorrhoids, mass</Step>
      </Section>

      <Section title="החייאה">
        <Drug name="NaCl 0.9%" dose="1-2L bolus" route="IV" notes="Lactated Ringer's OK" />
        <Drug name="pRBC" dose="Transfuse if Hb <7" route="IV" notes="Hb <8 אם cardiac / unstable. MTP אם massive" />
        <Drug name="PPI" dose="Omeprazole 80mg bolus → 8mg/h drip" route="IV" notes="Upper GI bleed — תן לפני gastro" />
        <Drug name="Octreotide" dose="50mcg bolus → 50mcg/h" route="IV" notes="אם חשד variceal (שחמת)" />
        <Drug name="Ceftriaxone" dose="1g IV" route="" notes="ABx prophylaxis אם cirrhosis + GI bleed" />
      </Section>

      <Section title="Anticoagulation reversal">
        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
          <div><strong>Warfarin:</strong> Vitamin K 10mg IV slow + FFP 2-4U (or PCC 25-50U/kg for rapid reversal)</div>
          <div><strong>Dabigatran:</strong> Idarucizumab 5g IV (2 doses of 2.5g)</div>
          <div><strong>Rivaroxaban/Apixaban:</strong> Andexanet alfa (אם זמין), אחרת PCC 50U/kg</div>
          <div><strong>Heparin:</strong> Protamine 1mg per 100U heparin (max 50mg)</div>
          <div><strong>Enoxaparin:</strong> Protamine 1mg per 1mg enoxaparin (תוך 8h, 60% reversal)</div>
        </div>
      </Section>

      <Tip>Glasgow-Blatchford Score ≥1 = צריך endo. Score 0 = שקול שחרור עם F/U.</Tip>
    </div>
  );
}

export function AnaphylaxisProtocol() {
  return (
    <div className="space-y-3" dir="rtl">
      <Warn>אפינפרין IM ירך = הטיפול! אל תחכה. אל תתן IV אלא אם shock ממש.</Warn>

      <Section title="טיפול מיידי">
        <Step n={1}><strong>Epinephrine 0.3-0.5mg IM</strong> (1:1000) — ירך anterolateral. חזור כל 5-15 דק' אם אין שיפור.</Step>
        <Step n={2}>שכב שטוח + הרם רגליים (אם hypotension). ישיבה אם stridor.</Step>
        <Step n={3}>O2 high-flow (NRB 15L). מוניטור.</Step>
        <Step n={4}>NaCl 0.9% 1L bolus IV (אם hypotension)</Step>
      </Section>

      <Section title="קו שני (אחרי אפינפרין)">
        <Drug name="Diphenhydramine (H1)" dose="50mg" route="IV/IM" notes="לא מציל חיים — רק לגרד/urticaria" />
        <Drug name="Ranitidine (H2)" dose="50mg" route="IV" notes="או Famotidine 20mg IV" />
        <Drug name="Methylprednisolone" dose="125mg" route="IV" notes="מניעת biphasic reaction (4-12h)" />
        <Drug name="Salbutamol" dose="2.5-5mg neb" route="" notes="אם bronchospasm" />
      </Section>

      <Section title="אחרי ייצוב">
        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
          <div>• מעקב 6-12 שעות (biphasic reaction ב-5-20% מהמקרים)</div>
          <div>• מאסטוציטוזיס? → tryptase</div>
          <div>• שחרור עם EpiPen + הפניה לאלרגולוג</div>
          <div>• תעד הגורם (תרופה, מזון, עקיצה)</div>
        </div>
      </Section>
    </div>
  );
}

export function HypertensiveProtocol() {
  return (
    <div className="space-y-3" dir="rtl">
      <Section title="הבדל קריטי">
        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
          <div>🔴 <strong>חירום (Emergency)</strong> — BP מאוד גבוה + end-organ damage (ACS, stroke, aortic dissection, pulmonary edema, AKI, encephalopathy) → IV meds, ICU</div>
          <div>🟡 <strong>דחוף (Urgency)</strong> — BP {">"} 180/120 ללא end-organ damage → PO meds, הורדה הדרגתית</div>
        </div>
      </Section>

      <Section title="יל״ד דחוף (Urgency) — PO">
        <Drug name="Captopril" dose="25mg" route="PO" notes="onset 15-30 דק'. ❌ K+>5.5, AKI, pregnancy" />
        <Drug name="Amlodipine" dose="5-10mg" route="PO" notes="onset 30-60 דק'. בטוח יחסית" />
        <Drug name="Clonidine" dose="0.1mg" route="PO" notes="חזור כל שעה עד 0.3mg. rebound hypertension אם הפסקה פתאומית" />
        <Tip>יעד: הורדה של 25% ב-BP תוך שעות. לא לנרמל מיד — סכנת hypoperfusion!</Tip>
      </Section>

      <Section title="יל״ד חירום (Emergency) — IV">
        <Drug name="Labetalol" dose="20mg IV → 40mg → 80mg" route="q10min" notes="מקס 300mg. ❌ asthma, bradycardia, CHF severe" />
        <Drug name="NTG drip" dose="5-200mcg/min" route="IV" notes="ACS / pulmonary edema" />
        <Drug name="Nicardipine" dose="5mg/h → titrate 2.5mg/h q5min" route="IV" notes="max 15mg/h. stroke / general" />
        <Drug name="Hydralazine" dose="10-20mg" route="IV q4-6h" notes="eclampsia. לא ראשון לרוב מצבים אחרים" />
      </Section>

      <Warn>דיסקציה של אאורטה: יעד HR {"<"}60 + SBP {"<"}120 — Esmolol / Labetalol IV. אם לא מספיק → הוסף NTG. ❌ לא NTG לפני beta-blocker!</Warn>
    </div>
  );
}

export function RapidAFProtocol() {
  return (
    <div className="space-y-3" dir="rtl">
      <Section title="הערכה ראשונית">
        <Step n={1}>ECG 12-lead — ודא AF (irregularly irregular, no P waves). שלול flutter, SVT, WPW.</Step>
        <Step n={2}>המודינמית: SBP, HR, symptoms (כאב חזה, קוצר נשימה, סחרחורת, syncope)</Step>
        <Step n={3}>חפש trigger: זיהום, חום, PE, thyroid, אלקוהול, postop, dehydration</Step>
        <Step n={4}>Labs: TSH, K+, Mg2+, troponin, CBC</Step>
      </Section>

      <Section title="Unstable (shock, ACS, pulmonary edema)">
        <Warn>Synchronized cardioversion 120-200J biphasic. אל תמתין!</Warn>
      </Section>

      <Section title="Stable — Rate Control (יעד HR <110)">
        <Drug name="Metoprolol" dose="5mg IV q5min x3" route="→ 25-50mg PO q6h" notes="❌ asthma, CHF acute decompensated, AV block" />
        <Drug name="Diltiazem" dose="0.25mg/kg IV over 2min → 5-15mg/h drip" route="" notes="אלטרנטיבה ל-BB. ❌ HFrEF (EF<40%)" />
        <Drug name="Digoxin" dose="0.5mg IV → 0.25mg q6h x2" route="" notes="CHF + AF. onset איטי (6h). שמור K+>4" />
        <Drug name="Amiodarone" dose="300mg IV over 1h → 900mg over 23h" route="" notes="AF + HFrEF. גם rate + rhythm control" />
      </Section>

      <Section title="Rhythm Control (שקול אם <48h / anticoagulated)">
        <div className="text-xs text-slate-600 dark:text-slate-400">
          AF {"<"}48h → cardioversion בטוח (chemical or electrical). AF {">"} 48h or unknown → TEE לפני cardioversion או anticoagulate 3 שבועות.
          Chemical: Amiodarone 300mg IV over 1h. Flecainide/Propafenone → pill-in-pocket (only if no structural heart disease).
        </div>
      </Section>

      <Tip>בקשישים: rate control is usually enough. Don't chase sinus rhythm at 3am.</Tip>
    </div>
  );
}

export function SyncopeProtocol() {
  return (
    <div className="space-y-3" dir="rtl">
      <Section title="מיון מהיר — high risk vs low risk">
        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
          <div>🔴 <strong>High risk (admit):</strong> cardiac history, exertional, abnormal ECG, Hb drop, age {">"} 60 + no prodrome, family hx sudden death</div>
          <div>🟢 <strong>Low risk (observe/d/c):</strong> prodrome (warmth, nausea, tunnel vision), positional, young, normal ECG, normal vitals</div>
        </div>
      </Section>

      <Section title="בירור">
        <Step n={1}>ECG — AV block, long QT, Brugada, WPW, arrhythmia</Step>
        <Step n={2}>Orthostatic vitals — ירידה {">"} 20 systolic or {">"} 10 diastolic = positive</Step>
        <Step n={3}>Labs: CBC (אנמיה), glucose, troponin (אם חשד cardiac), BMP</Step>
        <Step n={4}>בדיקה נוירולוגית — שלילת CVA/TIA (לא syncope אמיתי!)</Step>
      </Section>

      <Section title="סיבות נפוצות בקשישים">
        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
          <div>• <strong>Orthostatic hypotension</strong> — תרופות (alpha-blockers, diuretics, antihypertensives), dehydration</div>
          <div>• <strong>Vasovagal</strong> — prodrome + trigger (כאב, חרדה, עמידה ממושכת)</div>
          <div>• <strong>Cardiac</strong> — arrhythmia, AS, HCM, PE</div>
          <div>• <strong>Carotid sinus hypersensitivity</strong> — שכיח בגריאטריה, trigger: גילוח, סיבוב ראש</div>
          <div>• <strong>Situational</strong> — micturition, defecation, cough</div>
        </div>
      </Section>

      <Warn>Syncope + anticoagulation + head injury → CT head STAT</Warn>
    </div>
  );
}

export function FeverWorkupProtocol() {
  return (
    <div className="space-y-3" dir="rtl">
      <Section title="פרוטוקול חום בתורנות">
        <Step n={1}>חום {">"} 38°C → 2 סטים תרביות דם (מ-2 אתרים שונים) לפני ABx</Step>
        <Step n={2}>תרבית שתן + U/A (קטטר? → תרבית מהפורט)</Step>
        <Step n={3}>CXR אם יש קוצר נשימה / שיעול / crackles</Step>
        <Step n={4}>Labs: CBC + diff, CRP, Procalcitonin, lactate, BMP, LFTs</Step>
        <Step n={5}>בדיקה פיזיקלית: עור (cellulitis, wound, decubitus), בטן, ריאות, line sites, joints</Step>
      </Section>

      <Section title="מתי ABx אמפירי מיידי?">
        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
          <div>🔴 <strong>Sepsis / qSOFA ≥ 2</strong> → ABx תוך שעה</div>
          <div>🔴 <strong>Neutropenic fever</strong> (ANC {"<"} 500) → ABx מיידי (Cefepime / Meropenem)</div>
          <div>🔴 <strong>Meningitis</strong> (חשד) → Ceftriaxone 2g IV + LP</div>
          <div>🟡 <strong>ידוע מקור</strong> → ABx ממוקד</div>
          <div>🟢 <strong>ללא מקור, stable</strong> → תרביות + מעקב. ABx בבוקר אם עדיין חם</div>
        </div>
      </Section>

      <Section title="חום פוסט-ניתוחי — 5 W's (by day)">
        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
          <div><strong>Day 1-2:</strong> Wind (atelectasis) → incentive spirometry</div>
          <div><strong>Day 3-5:</strong> Water (UTI) → U/A + remove catheter</div>
          <div><strong>Day 5-7:</strong> Wound (SSI) → inspect surgical site</div>
          <div><strong>Day 7+:</strong> Walk (DVT/PE) → D-dimer, US</div>
          <div><strong>Any day:</strong> Wonder drugs (drug fever) → check new meds</div>
        </div>
      </Section>

      <Tip>בקשישים: חום יכול להיות absent (hypothermia = worse sign). שינוי הכרה + WBC↑ = ספסיס גם ללא חום!</Tip>
    </div>
  );
}

export function SeizureProtocol() {
  return (
    <div className="space-y-3" dir="rtl">
      <Warn>Status epilepticus = פרכוס {">"} 5 דקות or פרכוסים רצופים ללא חזרת הכרה. חירום!</Warn>

      <Section title="פרכוס פעיל — טיפול מיידי">
        <Step n={1}>שמור נתיב אוויר — שכב על הצד (recovery position). אל תכניס כלום לפה!</Step>
        <Step n={2}>O2, מוניטור, IV access, glucose fingerstick</Step>
        <Step n={3}>
          <strong>0-5 דק':</strong> Lorazepam 2-4mg IV (או Midazolam 10mg IM אם אין IV)
        </Step>
        <Step n={4}>
          <strong>5-20 דק' (no response):</strong> Levetiracetam 60mg/kg IV (max 4.5g) over 15min — OR Phenytoin 20mg/kg IV (max rate 50mg/min, מוניטור!)
        </Step>
        <Step n={5}>
          <strong>{">"} 20 דק' (RSE):</strong> ICU — intubation + Propofol / Midazolam drip. התקשר לנוירולוג.
        </Step>
      </Section>

      <Section title="אחרי הפרכוס — בירור">
        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
          <div>• Labs: glucose, Na, Ca, Mg, BUN/Cr, toxicology screen, anticonvulsant levels</div>
          <div>• CT head ללא חומר ניגוד (first seizure, trauma, anticoagulation, focal)</div>
          <div>• LP אם חשד CNS infection (חום + meningismus)</div>
          <div>• EEG (לא חירום — בבוקר, אלא אם altered MS ממושך)</div>
        </div>
      </Section>

      <Section title="סיבות שכיחות בקשישים">
        <div className="text-xs text-slate-600 dark:text-slate-400">
          CVA (שכיח!), metabolic (Na+, glucose, Ca2+), medication withdrawal (benzos, alcohol, anticonvulsants), 
          infection (meningitis, encephalitis), brain tumor/mets, uremia
        </div>
      </Section>
    </div>
  );
}

export function DKA_HHS_Protocol() {
  return (
    <div className="space-y-3" dir="rtl">
      <Section title="זיהוי — DKA vs HHS">
        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
          <div><strong>DKA:</strong> glucose {">"} 250, pH {"<"} 7.3, bicarb {"<"} 18, anion gap {">"} 12, ketones +</div>
          <div><strong>HHS:</strong> glucose {">"} 600, osm {">"} 320, no significant ketosis, altered MS. שכיח יותר בקשישים!</div>
        </div>
      </Section>

      <Section title="טיפול — DKA">
        <Step n={1}><strong>נוזלים:</strong> NaCl 0.9% 1L/h x 1-2h → 250-500ml/h. עבור ל-0.45% אם Na מתוקן {">"} 140</Step>
        <Step n={2}><strong>אינסולין:</strong> Regular insulin 0.1U/kg/h IV (או 0.14U/kg/h ללא bolus). יעד: ירידת BS 50-70mg/dL/h</Step>
        <Step n={3}><strong>אשלגן:</strong> אם K {"<"} 5.3 → 20-40mEq/L בנוזלים. אם K {"<"} 3.3 → תקן K לפני אינסולין!</Step>
        <Step n={4}><strong>Bicarb:</strong> רק אם pH {"<"} 6.9 → 100mEq NaHCO3 in 400ml over 2h</Step>
        <Step n={5}><strong>D5:</strong> כש-BS מגיע ל-200-250 → הוסף D5 לנוזלים, המשך אינסולין עד AG נסגר</Step>
      </Section>

      <Section title="מעקב">
        <div className="text-xs text-slate-600 dark:text-slate-400">
          BS כל שעה. BMP (K+, bicarb, AG) כל 2-4h. I/O כל שעה. 
          יעד DKA resolution: pH {">"} 7.3, bicarb {">"} 15, AG {"<"} 12, BS {"<"} 200.
          מעבר ל-SC insulin: overlap 2h עם drip. המשך IV fluids.
        </div>
      </Section>

      <Warn>HHS — נוזלים הם הטיפול העיקרי! אינסולין low-dose (0.02-0.05U/kg/h). הורדה מהירה מדי → cerebral edema.</Warn>
    </div>
  );
}

export function TransfusionReactionProtocol() {
  return (
    <div className="space-y-3" dir="rtl">
      <Section title="תגובת עירוי — עצור מיידית!">
        <Step n={1}><strong>עצור עירוי</strong> — אל תשלוף IV (שמור access)</Step>
        <Step n={2}>V/S: BP, HR, temp, SpO2, RR</Step>
        <Step n={3}>שלח: CBC, Coombs, haptoglobin, LDH, bilirubin, UA (hemoglobinuria), repeat crossmatch</Step>
        <Step n={4}>שלח את השקית + set לבנק הדם</Step>
      </Section>

      <Section title="סוגי תגובות">
        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-2">
          <div>
            <strong>🔴 Hemolytic (acute)</strong> — חום, צמרמורת, כאב גב/חזה, hypotension, דם בשתן<br/>
            → NaCl 0.9% bolus, Furosemide 40mg IV (שמור UO), הדבק דגימות. ICU אם unstable.
          </div>
          <div>
            <strong>🟡 Febrile non-hemolytic</strong> — חום + צמרמורת ללא hemolysis<br/>
            → Paracetamol 1g. שקול המשך עירוי לאט (אחרי שלילת hemolytic).
          </div>
          <div>
            <strong>🟡 Allergic (mild)</strong> — urticaria, גרד<br/>
            → Diphenhydramine 50mg IV. שקול המשך אחרי טיפול.
          </div>
          <div>
            <strong>🔴 Anaphylaxis</strong> — hypotension, bronchospasm, angioedema<br/>
            → Epinephrine 0.3mg IM + standard anaphylaxis protocol.
          </div>
          <div>
            <strong>🔴 TRALI</strong> — קוצר נשימה חריף + CXR bilateral infiltrates תוך 6h<br/>
            → O2, supportive. עלול להצריך intubation. דווח לבנק דם.
          </div>
          <div>
            <strong>🟡 TACO</strong> — fluid overload (CHF patients) — crackles, BNP↑<br/>
            → Furosemide, upright position, O2.
          </div>
        </div>
      </Section>
    </div>
  );
}

export function PainProtocol() {
  return (
    <div className="space-y-3" dir="rtl">
      <Section title="סולם כאב — WHO Ladder (מותאם גריאטריה)">
        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-2">
          <div>
            <strong>שלב 1 — כאב קל (NRS 1-3):</strong><br/>
            Paracetamol 1g PO/IV q6h (max 4g/day, 2g אם כבד)<br/>
            ❌ NSAIDs — הימנע בקשישים (AKI, GI bleed, CHF)
          </div>
          <div>
            <strong>שלב 2 — כאב בינוני (NRS 4-6):</strong><br/>
            Paracetamol קבוע + Tramadol 50mg PO q6h (max 200mg/day בקשישים)<br/>
            ⚠️ Tramadol: seizure risk, serotonin syndrome with SSRIs, ❌ CrCl {"<"} 30
          </div>
          <div>
            <strong>שלב 3 — כאב חזק (NRS 7-10):</strong><br/>
            Morphine 2-4mg IV q4h PRN (1-2mg בקשישים / CKD)<br/>
            או Oxycodone 2.5-5mg PO q4-6h<br/>
            + Bowel protocol חובה (Senna + Docusate)
          </div>
        </div>
      </Section>

      <Section title="כאב ספציפי">
        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
          <div><strong>שבר / Post-op:</strong> Paracetamol קבוע + opioid PRN. Nerve block אם אפשר.</div>
          <div><strong>קוליק כלייתי:</strong> Paracetamol IV 1g + Diclofenac 75mg IM (אם GFR OK). Morphine 2-4mg IV.</div>
          <div><strong>כאב נוירופתי:</strong> Pregabalin 25-75mg PO HS (קשישים: start low).</div>
          <div><strong>כאב שרירי-שלדי:</strong> Paracetamol + Orphenadrine 100mg PO q8h (❌ בקשישים — anticholinergic!).</div>
          <div><strong>Palliative:</strong> Morphine SC 2.5-5mg q4h PRN. שקול Fentanyl patch אם stable pain.</div>
        </div>
      </Section>

      <Warn>בקשישים: התחל במינון הנמוך ביותר. "Start low, go slow." עקוב RR + sedation.</Warn>
    </div>
  );
}

export function AnticoagReversalProtocol() {
  return (
    <div className="space-y-3" dir="rtl">
      <Warn>דימום מסכן חיים + anticoagulation = reversal מיידי. אל תחכה ל-INR.</Warn>

      <Section title="Warfarin / Coumadin">
        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
          <div><strong>INR 3-5, no bleed:</strong> Hold warfarin. שקול Vitamin K 1-2.5mg PO.</div>
          <div><strong>INR 5-9, no bleed:</strong> Hold + Vitamin K 2.5-5mg PO.</div>
          <div><strong>INR {">"} 9, no bleed:</strong> Vitamin K 5-10mg PO.</div>
          <div><strong>Serious bleed:</strong> Vitamin K 10mg IV slow (over 10min) + PCC 25-50U/kg (4-factor). FFP 10-15ml/kg אם אין PCC.</div>
          <div><strong>Life-threatening:</strong> PCC + Vitamin K IV. בדוק INR אחרי 15-30 דק'.</div>
        </div>
      </Section>

      <Section title="DOACs">
        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
          <div><strong>Dabigatran:</strong> Idarucizumab (Praxbind) 5g IV (2 doses x 2.5g). Dialyzable.</div>
          <div><strong>Rivaroxaban / Apixaban:</strong> Andexanet alfa (אם זמין). אם לא → PCC 50U/kg.</div>
          <div><strong>כללי לכל DOACs:</strong> activated charcoal אם {"<"} 2h מנטילה. TXA 1g IV.</div>
        </div>
      </Section>

      <Section title="Heparin">
        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
          <div><strong>UFH:</strong> Protamine 1mg per 100U heparin (last dose). Max 50mg. Give slow IV.</div>
          <div><strong>Enoxaparin ({"<"}8h):</strong> Protamine 1mg per 1mg enoxaparin (~60% reversal).</div>
          <div><strong>Enoxaparin ({">"} 8h):</strong> Protamine 0.5mg per 1mg enoxaparin.</div>
        </div>
      </Section>

      <Section title="Anti-platelets">
        <div className="text-xs text-slate-600 dark:text-slate-400">
          Aspirin / Clopidogrel: platelets transfusion (אם דימום active + PLT {"<"} 50). Desmopressin (DDAVP) 0.3mcg/kg IV — improves platelet function.
        </div>
      </Section>
    </div>
  );
}

export function AcuteStrokeProtocol() {
  return (
    <div className="space-y-3" dir="rtl">
      <Warn>Stroke = Time is Brain! CT head STAT → tPA decision within 60 min of arrival.</Warn>

      <Section title="זיהוי — BE FAST">
        <div className="text-xs text-slate-600 dark:text-slate-400">
          <strong>B</strong>alance (אי-יציבות) · <strong>E</strong>yes (ראייה כפולה/שדה) · <strong>F</strong>ace (צניחה) · <strong>A</strong>rm (חולשה) · <strong>S</strong>peech (דיבור) · <strong>T</strong>ime (זמן התחלה!)
        </div>
      </Section>

      <Section title="פעולות מיידיות">
        <Step n={1}>Last known well time — קריטי!</Step>
        <Step n={2}>CT head ללא contrast STAT (שלילת hemorrhage)</Step>
        <Step n={3}>Labs: glucose (חובה לפני tPA!), CBC, INR, PTT, troponin</Step>
        <Step n={4}>BP — אם לא tPA candidate: הורד רק אם {">"} 220/120. אם tPA → BP {"<"} 185/110 לפני מתן.</Step>
        <Step n={5}>NPO — dysphagia assessment before anything PO</Step>
      </Section>

      <Section title="tPA — Alteplase 0.9mg/kg (max 90mg)">
        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
          <div>⏱️ Window: {"<"} 4.5h מ-last known well</div>
          <div>❌ Exclude: hemorrhage on CT, recent surgery/bleeding, INR {">"} 1.7, PLT {"<"} 100K, glucose {"<"} 50</div>
          <div>📋 Protocol: 10% bolus over 1min → 90% over 60min</div>
          <div>⚡ Neurochecks q15min x 24h. CT if deterioration. No anticoag/antiplatelet x 24h.</div>
        </div>
      </Section>

      <Section title="Hemorrhagic Stroke">
        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
          <div>• Reverse anticoagulation immediately (see reversal protocol)</div>
          <div>• BP target {"<"} 140 systolic (Nicardipine or Labetalol drip)</div>
          <div>• Neurosurgery consult (IVH, posterior fossa, cerebellar {">"} 3cm)</div>
          <div>• HOB 30°, seizure prophylaxis if lobar</div>
        </div>
      </Section>
    </div>
  );
}

export function HyponatremiaProtocol() {
  return (
    <div className="space-y-3" dir="rtl">
      <Warn>תיקון מהיר מדי → ODS (Osmotic Demyelination). מקסימום 10 mEq/24h. אם חמור סימפטומטי → 4-6 mEq ב-6 שעות ראשונות.</Warn>

      <Section title="חומרה">
        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
          <div><strong>קלה (130-134):</strong> בד"כ אסימפטומטי. בירור + טיפול בסיבה.</div>
          <div><strong>בינונית (125-129):</strong> בחילה, כאב ראש, בלבול. תקן סיבה + שקול NaCl.</div>
          <div><strong>חמורה ({"<"}125) או סימפטומטית:</strong> פרכוסים, coma → Hypertonic saline 3% 100ml IV over 10min. חזור x2 PRN.</div>
        </div>
      </Section>

      <Section title="בירור — Volume Status">
        <Step n={1}><strong>Serum osm:</strong> {"<"}280 = true hyponatremia. {">"}280 = pseudohyponatremia (glucose, mannitol)</Step>
        <Step n={2}><strong>Urine Na + Osm:</strong> UNa {"<"} 20 + low Uosm = hypovolemic. UNa {">"} 20 + Uosm {">"} 100 = SIADH or cortisol deficiency</Step>
        <Step n={3}>
          Volume status:
          <div className="mr-4 mt-1 space-y-0.5">
            <div>• <strong>Hypovolemic:</strong> dehydration, diuretics, vomiting, diarrhea → NaCl 0.9%</div>
            <div>• <strong>Euvolemic:</strong> SIADH, hypothyroid, adrenal insufficiency → fluid restrict 1-1.2L/d</div>
            <div>• <strong>Hypervolemic:</strong> CHF, cirrhosis, nephrotic → fluid restrict + treat underlying</div>
          </div>
        </Step>
      </Section>

      <Section title="SIADH — טיפול">
        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
          <div>1. הגבלת נוזלים 800ml-1L/d</div>
          <div>2. Salt tablets 3g PO TID (אם נסבל)</div>
          <div>3. Furosemide 20mg PO (paradoxical — מעלה free water excretion)</div>
          <div>4. Tolvaptan (שמור לאשפוז, מוניטור Na q6h) — ❌ עם hypertonic saline</div>
        </div>
      </Section>

      <Tip>תרופות שגורמות SIADH: SSRIs, carbamazepine, oxcarbazepine, thiazides, opioids, PPIs</Tip>
    </div>
  );
}

export function HyperkalemiaProtocol() {
  return (
    <div className="space-y-3" dir="rtl">
      <Warn>K+ {">"} 6.5 או שינויי ECG = חירום. Calcium Gluconate מיד!</Warn>

      <Section title="ECG Changes (לפי חומרה)">
        <div className="text-xs text-slate-600 dark:text-slate-400">
          Peaked T waves → PR prolongation → P wave loss → QRS widening → sine wave → VF/asystole
        </div>
      </Section>

      <Section title="טיפול — שלבים">
        <Step n={1}>
          <strong>הגנת לב (אם ECG∆ או K {">"} 6.5):</strong><br/>
          Calcium Gluconate 10% 10ml IV over 2-3 min. חזור אחרי 5 דק' אם ECG לא משתפר.
        </Step>
        <Step n={2}>
          <strong>Shift (הכנס K לתוך תאים):</strong><br/>
          • Insulin 10U Regular IV + D50W 50ml (= 25g glucose). עקוב BS q1h x 4h!<br/>
          • Salbutamol 10-20mg nebulizer (4-8x dose רגילה!)<br/>
          • NaHCO3 50mEq IV אם pH {"<"} 7.2 (only works in acidosis)
        </Step>
        <Step n={3}>
          <strong>Removal (הוצא K מהגוף):</strong><br/>
          • Kayexalate (SPS) 30g PO in sorbitol (or 50g PR)<br/>
          • Furosemide 40mg IV (אם יש function)<br/>
          • Dialysis אם refractory / K {">"} 7 / anuric
        </Step>
        <Step n={4}>
          <strong>סיבה:</strong> הפסק ACEi/ARB, K-sparing diuretics, NSAIDs. בדוק: AKI, rhabdomyolysis, hemolysis, adrenal insufficiency.
        </Step>
      </Section>

      <Tip>Pseudohyperkalemia: hemolyzed sample, tourniquet too long, thrombocytosis. חזור על דגימה אם לא מתאים קלינית!</Tip>
    </div>
  );
}

export function HypoglycemiaProtocol() {
  return (
    <div className="space-y-3" dir="rtl">
      <Section title="הגדרה והערכה">
        <div className="text-xs text-slate-600 dark:text-slate-400">
          BS {"<"} 70 mg/dL = hypoglycemia. Whipple's triad: symptoms + low glucose + resolution with treatment.
          בקשישים: סימנים לא טיפוסיים — בלבול, נפילה, דיבור לא ברור (מחקה CVA!).
        </div>
      </Section>

      <Section title="טיפול">
        <Step n={1}>
          <strong>בהכרה (PO):</strong> 15-20g glucose (3-4 סוכריות, חצי כוס מיץ). בדוק BS אחרי 15 דק'. חזור אם עדיין {"<"} 70.
        </Step>
        <Step n={2}>
          <strong>ללא הכרה / NPO:</strong> D50W 25-50ml IV push. בדוק BS אחרי 15 דק'.
        </Step>
        <Step n={3}>
          <strong>אין IV:</strong> Glucagon 1mg IM/SC. onset 10-15 min.
        </Step>
      </Section>

      <Section title="אחרי ייצוב — חקור סיבה">
        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
          <div>🔴 <strong>Sulfonylureas</strong> (Glibenclamide, Gliclazide) — #1 cause! Admission 24-48h, D10 drip.</div>
          <div>🔴 <strong>Insulin overdose</strong> — D10 drip + glucose monitoring.</div>
          <div>🟡 <strong>Renal failure</strong> — clearance reduced. Adjust doses!</div>
          <div>🟡 <strong>NPO without adjusting insulin/OHAs</strong> — very common mistake!</div>
          <div>🟡 <strong>Sepsis / liver failure</strong> — impaired gluconeogenesis.</div>
        </div>
      </Section>

      <Warn>Sulfonylurea hypoglycemia = אשפוז חובה 24-48h. D10% drip 75-100ml/h. Rebound שכיח!</Warn>
    </div>
  );
}

export function AlteredMentalStatusProtocol() {
  return (
    <div className="space-y-3" dir="rtl">
      <Section title="AEIOU-TIPS — אבחנה מבדלת">
        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
          <div><strong>A</strong>lcohol / Acidosis</div>
          <div><strong>E</strong>lectrolytes / Encephalopathy (hepatic, uremic, hypertensive, Wernicke)</div>
          <div><strong>I</strong>nfection (UTI, pneumonia, meningitis, sepsis)</div>
          <div><strong>O</strong>verdose / Oxygen (hypoxia, CO)</div>
          <div><strong>U</strong>remia</div>
          <div><strong>T</strong>rauma / Temperature (hypo/hyperthermia)</div>
          <div><strong>I</strong>nsulin (hypo/hyperglycemia)</div>
          <div><strong>P</strong>sychiatric / Poison / Post-ictal</div>
          <div><strong>S</strong>troke / Shock / Subdural</div>
        </div>
      </Section>

      <Section title="בירור מיידי">
        <Step n={1}>ABCs + glucose fingerstick NOW (D50 אם {"<"} 70)</Step>
        <Step n={2}>V/S: BP, HR, temp, SpO2, RR</Step>
        <Step n={3}>Labs: CBC, BMP, LFTs, ammonia, TSH, ABG/VBG, lactate, tox screen</Step>
        <Step n={4}>CT head (first seizure, focal neuro, trauma, anticoag, no clear cause)</Step>
        <Step n={5}>U/A + CXR (infection screen)</Step>
      </Section>

      <Section title="Empiric treatment">
        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
          <div>🟢 <strong>Opioid OD:</strong> Naloxone 0.4mg IV q2-3min</div>
          <div>🟢 <strong>Wernicke:</strong> Thiamine 500mg IV x3/d</div>
          <div>🟢 <strong>Hepatic enceph:</strong> Lactulose 30ml q2h till BM</div>
          <div>🟢 <strong>Meningitis:</strong> Ceftriaxone 2g IV + Dexamethasone 10mg IV</div>
        </div>
      </Section>

      <Tip>בקשישים: #1 cause = delirium (UTI, constipation, medications, pain). Review medication list!</Tip>
    </div>
  );
}

export function FallProtocolOnCall() {
  return (
    <div className="space-y-3" dir="rtl">
      <Section title="הערכה מיידית אחרי נפילה">
        <Step n={1}>V/S + neuro check. אובדן הכרה? כאב ראש?</Step>
        <Step n={2}><strong>Anticoagulation?</strong> warfarin/DOAC/heparin → CT head STAT (גם אם אסימפטומטי!)</Step>
        <Step n={3}>בדיקה: ראש, צוואר, גפיים (שבר, ROM), neuro (GCS, focal signs)</Step>
        <Step n={4}>Orthostatic vitals</Step>
      </Section>

      <Section title="מתי CT ראש?">
        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
          <div>🔴 <strong>חובה:</strong> anticoag, LOC, focal neuro, GCS {"<"} 15, vomiting, seizure</div>
          <div>🟡 <strong>שקול:</strong> גיל {">"} 65 + head strike, amnesia, dangerous mechanism</div>
          <div>🟢 <strong>לא צריך:</strong> GCS 15, no anticoag, no head strike, no LOC</div>
        </div>
      </Section>

      <Section title="מתי צילום?">
        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
          <div>• כאב ירך + קיצור + סיבוב חוצה → X-ray hip</div>
          <div>• כאב שורש כף יד → X-ray wrist (Colles')</div>
          <div>• Ottawa rules לקרסול/רגל/ברך</div>
        </div>
      </Section>

      <Warn>שבר ירך occult — clinical suspicion + negative X-ray → MRI בבוקר. אל תשלח!</Warn>
    </div>
  );
}

export function DVTPEProtocol() {
  return (
    <div className="space-y-3" dir="rtl">
      <Section title="DVT">
        <div className="text-xs text-slate-600 dark:text-slate-400">
          Wells DVT: ≥2 = likely → US doppler. {"<"}2 → D-dimer first.
          נפיחות חד-צדדית, כאב בשוק, אודם, חום.
        </div>
      </Section>

      <Section title="PE — זיהוי">
        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
          <div>Wells PE: ≥5 → CTPA. {"<"}5 → D-dimer.</div>
          <div>Tachycardia + unexplained hypoxia = PE until proven otherwise.</div>
          <div>ECG: sinus tach, S1Q3T3, RBBB, RV strain</div>
        </div>
      </Section>

      <Section title="טיפול">
        <Drug name="Enoxaparin" dose="1mg/kg SC q12h" route="" notes="CrCl <30 → 1mg/kg q24h" />
        <Drug name="UFH" dose="80U/kg bolus → 18U/kg/h" route="IV" notes="CrCl<30, obesity, high bleed risk" />
        <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
          Bridge to DOAC or Warfarin. Duration: provoked 3mo, unprovoked ≥6mo.
        </div>
      </Section>

      <Warn>Massive PE (SBP {"<"} 90) → tPA 100mg IV over 2h. Fluids carefully (RV overload).</Warn>
    </div>
  );
}

export function LiverProtocol() {
  return (
    <div className="space-y-3" dir="rtl">
      <Section title="Hepatic Encephalopathy">
        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
          <div><strong>Grade 1:</strong> sleep disturbance, impaired concentration</div>
          <div><strong>Grade 2:</strong> lethargy, disorientation, asterixis</div>
          <div><strong>Grade 3:</strong> somnolent but arousable, confusion</div>
          <div><strong>Grade 4:</strong> coma</div>
        </div>
        <Drug name="Lactulose" dose="30ml PO q2h" route="" notes="יעד: 3-4 BM/day. PR 300ml+700ml water אם NPO" />
        <Drug name="Rifaximin" dose="550mg PO BID" route="" notes="adjunct to lactulose" />
        <Tip>Triggers: GI bleed, infection, constipation, AKI, hypoK, benzos/opioids, dehydration</Tip>
      </Section>

      <Section title="SBP — Spontaneous Bacterial Peritonitis">
        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
          <div>PMN {">"} 250 in ascites → SBP.</div>
          <div>Ceftriaxone 2g IV daily x 5-7d. Albumin 1.5g/kg day 1, 1g/kg day 3.</div>
        </div>
      </Section>

      <Warn>Cirrhosis + AKI = suspect HRS. Stop diuretics, albumin 1g/kg x2d. No NSAIDs!</Warn>
    </div>
  );
}

export function CorticosteroidProtocol() {
  return (
    <div className="space-y-3" dir="rtl">
      <Section title="Stress Dose — מתי?">
        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
          <div>🔴 סטרואידים {">"} 3 שבועות (Pred ≥ 5mg/d) + acute illness/surgery/shock</div>
          <div>🔴 Known adrenal insufficiency + physiological stress</div>
          <div>🔴 Septic shock not responding to fluids + vasopressors</div>
        </div>
      </Section>

      <Section title="מינונים">
        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
          <div><strong>Minor:</strong> Hydrocortisone 50mg IV x1</div>
          <div><strong>Moderate:</strong> Hydrocortisone 50mg IV q8h x 1-2d</div>
          <div><strong>Major / Adrenal crisis:</strong> Hydrocortisone 100mg IV stat → 50mg q6-8h</div>
        </div>
      </Section>

      <Section title="Equivalencies">
        <div className="text-xs text-slate-600 dark:text-slate-400 font-mono bg-slate-100 dark:bg-slate-800 p-2 rounded">
          HC 20mg = Pred 5mg = Methylpred 4mg = Dexa 0.75mg
        </div>
      </Section>

      <Warn>לעולם אל תפסיק סטרואידים בפתאומיות אחרי {">"} 3 שבועות! Taper הדרגתי.</Warn>
    </div>
  );
}

export function InsomniaBehaviorProtocol() {
  return (
    <div className="space-y-3" dir="rtl">
      <Section title="קו ראשון (לא תרופתי)">
        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
          <div>• הפחת אור ורעש, אטמי אוזניים, מסכת עיניים</div>
          <div>• הימנע VS checks מיותרים בלילה</div>
          <div>• כאב = סיבה #1 — טפל בכאב!</div>
          <div>• שלול: דליריום, חרדה, קוצר נשימה, retention</div>
        </div>
      </Section>

      <Section title="קו שני — תרופות">
        <Drug name="Melatonin" dose="3-5mg" route="PO HS" notes="קו ראשון בקשישים. בטוח." />
        <Drug name="Trazodone" dose="25-50mg" route="PO HS" notes="אלטרנטיבה. orthostatic!" />
        <Drug name="Quetiapine" dose="12.5-25mg" route="PO HS" notes="אם דליריום + insomnia" />
      </Section>

      <Section title="❌ הימנע בקשישים">
        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
          <div>❌ Benzodiazepines — falls, confusion, paradoxical agitation</div>
          <div>❌ Zolpidem / Zopiclone — falls, complex sleep behaviors</div>
          <div>❌ Diphenhydramine — anticholinergic → delirium</div>
          <div>❌ Hydroxyzine — anticholinergic, QTc</div>
        </div>
      </Section>
    </div>
  );
}

export function UrinaryRetentionProtocol() {
  return (
    <div className="space-y-3" dir="rtl">
      <Section title="זיהוי">
        <div className="text-xs text-slate-600 dark:text-slate-400">
          Bladder scan {">"} 300-400ml + inability to void. בקשישים: דליריום = often retention!
        </div>
      </Section>

      <Section title="טיפול">
        <Step n={1}>Foley 16-18Fr. לא עובר → Coude tip. עדיין לא → אורולוג.</Step>
        <Step n={2}>אם residual {">"} 1500ml → clamp q200ml unclamped q30min (prevent decompression hematuria)</Step>
        <Step n={3}><Drug name="Tamsulosin" dose="0.4mg" route="PO daily" notes="Onset 48-72h. orthostatic!" /></Step>
      </Section>

      <Section title="סיבות">
        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
          <div>💊 Anticholinergics, opioids, antihistamines, TCAs</div>
          <div>🔴 BPH (#1 בגברים)</div>
          <div>🔴 Constipation / fecal impaction → disimpact!</div>
          <div>🟡 Post-op / post-anesthesia</div>
        </div>
      </Section>

      <Warn>Cauda Equina: retention + saddle anesthesia + bilateral leg weakness = MRI STAT!</Warn>
    </div>
  );
}

export function BloodProductsProtocol() {
  return (
    <div className="space-y-3" dir="rtl">
      <Section title="סף עירוי">
        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
          <div><strong>pRBC:</strong> Hb {"<"} 7 (restrictive). Hb {"<"} 8 cardiac/ACS. 1 unit ↑ Hb ~1g/dL.</div>
          <div><strong>PLT:</strong> {"<"} 10K prophylactic. {"<"} 50K bleeding/procedure. {"<"} 100K neurosurgery.</div>
          <div><strong>FFP:</strong> INR {">"} 1.5 + bleeding/procedure. 10-15ml/kg.</div>
          <div><strong>Cryo:</strong> Fibrinogen {"<"} 100-150. 10 units.</div>
        </div>
      </Section>

      <Section title="Massive Transfusion Protocol">
        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
          <div>Ratio: 1:1:1 (pRBC : FFP : PLT). TXA 1g IV within 3h.</div>
          <div>Targets: Hb {">"} 7, PLT {">"} 50K, Fib {">"} 150, INR {"<"} 1.5, iCa {">"} 1.1</div>
          <div>Warm products. Replace Ca (citrate chelation).</div>
        </div>
      </Section>

      <Section title="דחיפות הזמנה">
        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
          <div><strong>Emergency:</strong> O-neg (women) / O-pos — no wait</div>
          <div><strong>Urgent (15-30 min):</strong> Type-specific, no crossmatch</div>
          <div><strong>Routine (45-60 min):</strong> Full crossmatch</div>
        </div>
      </Section>
    </div>
  );
}

export function AcuteAbdomenProtocol() {
  return (
    <div className="space-y-3" dir="rtl">
      <Section title="הערכה ראשונית">
        <Step n={1}>V/S — signs of sepsis/peritonitis? Tachycardia, fever, hypotension</Step>
        <Step n={2}>History: location, onset (sudden vs gradual), radiation, nausea/vomiting, bowel habits, last meal, surgery hx</Step>
        <Step n={3}>בדיקה: rigidity, rebound, guarding, bowel sounds, hernial orifices, DRE</Step>
        <Step n={4}>Labs: CBC, BMP, LFTs, lipase, lactate, UA, β-hCG (women), blood gas</Step>
      </Section>

      <Section title="Red Flags — צריך הדמיה/ניתוח דחוף">
        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
          <div>🔴 Peritonitis (rigid abdomen) → surgical consult STAT</div>
          <div>🔴 Free air on CXR upright → perforation → OR</div>
          <div>🔴 Mesenteric ischemia (pain out of proportion, lactate↑, AF) → CT angio STAT</div>
          <div>🔴 AAA rupture (hypotension + back pain + pulsatile mass) → vascular surgery STAT</div>
          <div>🔴 Bowel obstruction (distension, vomiting, no flatus) → NGT + CT abdomen</div>
        </div>
      </Section>

      <Section title="לפי מיקום">
        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
          <div><strong>RUQ:</strong> cholecystitis (Murphy's), hepatitis, bile duct stone, Fitz-Hugh-Curtis</div>
          <div><strong>Epigastric:</strong> pancreatitis (lipase), PUD, ACS (!), AAA</div>
          <div><strong>RLQ:</strong> appendicitis, Crohn's, ovarian torsion, ectopic</div>
          <div><strong>LLQ:</strong> diverticulitis, sigmoid volvulus</div>
          <div><strong>Diffuse:</strong> SBO, mesenteric ischemia, peritonitis, DKA</div>
        </div>
      </Section>

      <Tip>בקשישים: presentation אטיפי! כאב קל + WBC תקין לא שולל ניתוחי בטן. סף נמוך ל-CT.</Tip>
    </div>
  );
}

export function AcuteKidneyInjuryProtocol() {
  return (
    <div className="space-y-3" dir="rtl">
      <Section title="KDIGO Staging">
        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
          <div><strong>Stage 1:</strong> Cr x1.5-1.9 or ↑ ≥ 0.3 or UO {"<"} 0.5ml/kg/h x 6-12h</div>
          <div><strong>Stage 2:</strong> Cr x2.0-2.9 or UO {"<"} 0.5ml/kg/h x ≥12h</div>
          <div><strong>Stage 3:</strong> Cr x3 or {">"} 4 or anuria x 12h</div>
        </div>
      </Section>

      <Section title="בירור — Pre / Renal / Post">
        <Step n={1}><strong>Pre-renal:</strong> FENa {"<"} 1%, BUN:Cr {">"} 20:1 → fluid challenge</Step>
        <Step n={2}><strong>Renal (ATN):</strong> FENa {">"} 2%, muddy brown casts. Nephrotoxins, ischemia.</Step>
        <Step n={3}><strong>Post-renal:</strong> US → hydronephrosis? Bladder scan {">"} 300ml → catheter</Step>
      </Section>

      <Section title="טיפול">
        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
          <div>✅ Stop nephrotoxins: NSAIDs, aminoglycosides, ACEi/ARB, contrast, metformin</div>
          <div>✅ Fluids if pre-renal (watch for CHF)</div>
          <div>✅ K+ monitoring q4-6h. Hyperkalemia protocol if K {">"} 5.5</div>
          <div>✅ I/O: catheter + q1h UO</div>
          <div>✅ Adjust all med doses to current GFR</div>
          <div>🔴 Dialysis: K {">"} 6.5 refractory, fluid overload refractory, pH {"<"} 7.1, uremic symptoms</div>
        </div>
      </Section>
    </div>
  );
}

export function DeathPronouncementProtocol() {
  return (
    <div className="space-y-3" dir="rtl">
      <Section title="קביעת מוות — פרוטוקול">
        <Step n={1}>ודא שהצוות קרא לך. תעד שעת הגעה.</Step>
        <Step n={2}>זהה את המטופל (צמיד, תיק)</Step>
        <Step n={3}>
          בדיקה פיזיקלית:
          <div className="mr-4 mt-1 space-y-0.5">
            <div>• אין תגובה לכאב (sternal rub)</div>
            <div>• אין נשימות ספונטניות (צפה 30-60 שניות)</div>
            <div>• אין קולות לב (שמע 60 שניות רצופות)</div>
            <div>• אין דופק קרוטיד (מישוש 60 שניות)</div>
            <div>• אישונים מורחבים, קבועים, ללא תגובה לאור</div>
          </div>
        </Step>
        <Step n={4}>תעד שעת מוות (שעת הקביעה שלך, לא שעת הקריאה)</Step>
      </Section>

      <Section title="תיעוד בתיק">
        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
          <div>• שעת הגעה ובדיקה</div>
          <div>• ממצאים: no pulse, no heart sounds, no spontaneous respirations, fixed dilated pupils</div>
          <div>• שעת קביעת מוות</div>
          <div>• שיחה עם משפחה (מי, מתי, מה נאמר)</div>
          <div>• אם DNR — ציין שלא בוצעה החייאה בהתאם לטופס</div>
        </div>
      </Section>

      <Section title="אחרי קביעת מוות">
        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
          <div>• הודע למשפחה (אם לא נוכחים)</div>
          <div>• הודע לרופא הבכיר</div>
          <div>• הסר קטטרים, IV, מוניטור (אלא אם נתיחה)</div>
          <div>• בדוק אם צריך נתיחה שלאחר המוות (מוות לא צפוי, {"<"}24h מקבלה, חשד לרשלנות)</div>
          <div>• מלא טופס פטירה</div>
          <div>• עדכן צוות סיעוד + עובדת סוציאלית (אם רלוונטי)</div>
        </div>
      </Section>
    </div>
  );
}

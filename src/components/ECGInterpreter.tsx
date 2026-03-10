// src/components/ECGInterpreter.tsx
// Interactive ECG interpreter — algorithmic, no API. Runs entirely client-side.
// Input ECG parameters → get interpretation + urgency + treatment suggestions.

import { useState, useMemo } from "react";

// ─── Types ────────────────────────────────────────────────
interface ECGInput {
  rate: string;
  rhythm: string;
  prInterval: string;
  qrsDuration: string;
  qtc: string;
  axis: string;
  stV1: string; stV2: string; stV3: string; stV4: string; stV5: string; stV6: string;
  stI: string; stII: string; stIII: string; staVL: string; staVF: string; staVR: string;
  tWaves: string;
  qWaves: string;
  deltaWave: string;
  lbbb: string;
  rbbb: string;
  lvh: string;
  rvh: string;
  otherFindings: string;
}

type Urgency = "STAT" | "Urgent" | "Routine" | "Normal";

interface Finding {
  label: string;
  details: string;
  urgency: Urgency;
  treatment: string[];
  ddx?: string[];
}

// ─── Interpreter logic ─────────────────────────────────────
function interpret(inp: ECGInput): { findings: Finding[]; summary: string; overallUrgency: Urgency } {
  const findings: Finding[] = [];
  const rate = parseFloat(inp.rate) || 0;

  // ── Rate ────────────────────────────────────
  if (rate > 0) {
    if (rate > 150) {
      findings.push({
        label: "טכיקרדיה קיצונית",
        details: `HR ${rate} — unstable territory`,
        urgency: "STAT",
        treatment: ["זיהוי ריתמוס: narrow=SVT/AF, wide=VT", "12-lead ECG STAT", "אם hemodynamically unstable → cardioversion מיידי"],
        ddx: ["VT", "SVT with aberrancy", "AF with rapid ventricular response", "Preexcitation (WPW)"],
      });
    } else if (rate > 100) {
      findings.push({
        label: "טכיקרדיה סינוס",
        details: `HR ${rate}`,
        urgency: "Urgent",
        treatment: ["חפש גורם: כאב, חום, היפובולמיה, PE, תירוטוקסיקוזיס, אנמיה, תרופות", "טפל בגורם — לא בריתמוס"],
        ddx: ["Sinus tachycardia (reactive)", "AF/AFL", "SVT"],
      });
    } else if (rate < 40) {
      findings.push({
        label: "ברדיקרדיה קיצונית",
        details: `HR ${rate}`,
        urgency: "STAT",
        treatment: ["Atropine 0.5mg IV — ניתן לחזור כל 3-5 דק' (max 3mg)", "אם לא מגיב → Isoproterenol infusion / transcutaneous pacing", "התייעצות קרדיולוגיה STAT"],
        ddx: ["Complete heart block", "Sinus bradycardia (medications/hypothyroidism/vagal)", "Junctional rhythm"],
      });
    } else if (rate < 60) {
      findings.push({
        label: "ברדיקרדיה",
        details: `HR ${rate}`,
        urgency: "Routine",
        treatment: ["בדוק תרופות: beta-blockers, CCBs, digoxin, amiodarone", "בדוק: TSH, לחץ תוך-גולגולתי", "אם סימפטומטי → Atropine 0.5mg IV"],
      });
    }
  }

  // ── Rhythm ─────────────────────────────────
  if (inp.rhythm === "af") {
    const isRapid = rate > 110;
    findings.push({
      label: "פרפור פרוזדורים (AF)",
      details: isRapid ? "עם תגובה חדרית מהירה" : "עם תגובה חדרית מבוקרת",
      urgency: isRapid ? "Urgent" : "Routine",
      treatment: isRapid
        ? [
            "Rate control: Metoprolol 5mg IV slow (ניתן x3) | Diltiazem 0.25mg/kg IV",
            "אם hemodynamically unstable → DC cardioversion מיידי",
            "אם onset <48h ומבחינה מצב → שקול rhythm control",
            "Anticoagulation: LMWH ל-CHADS-VASc ≥2 (בקשישים כמעט תמיד)",
          ]
        : [
            "ודא anticoagulation מתאים (CHADS-VASc)",
            "Rate control: יעד <80 במנוחה",
            "שקול cause: תירוטוקסיקוזיס, CHF, PE, זיהום, אלכוהול",
          ],
    });
  }

  if (inp.rhythm === "afl") {
    findings.push({
      label: "רפרוף פרוזדורים (AFL)",
      details: "P-waves בצורת שן מסור (sawtooth) — typically 2:1 or 4:1 block",
      urgency: rate > 120 ? "Urgent" : "Routine",
      treatment: [
        "Rate control: Diltiazem IV / Metoprolol IV",
        "Cardioversion: AFL converts easily at low energy (50-100J)",
        "Anticoagulation בדומה ל-AF",
      ],
    });
  }

  if (inp.rhythm === "svt") {
    findings.push({
      label: "SVT — Narrow Complex Tachycardia",
      details: "Regular narrow-complex tachycardia",
      urgency: "Urgent",
      treatment: [
        "Vagal maneuvers: Valsalva (lying, legs elevated 45°)",
        "Adenosine 6mg IV rapid push + flush — ניתן לחזור 12mg x2",
        "אם לא מגיב: Verapamil 5-10mg IV slow / Metoprolol IV",
        "❌ Adenosine contraindicated in WPW+AF, severe asthma",
      ],
      ddx: ["AVNRT", "AVRT", "Atrial tachycardia"],
    });
  }

  if (inp.rhythm === "vt") {
    findings.push({
      label: "🔴 VT — Ventricular Tachycardia",
      details: "Wide-complex regular tachycardia — assume VT until proven otherwise",
      urgency: "STAT",
      treatment: [
        "🔴 אם pulse-less: VF protocol — CPR + defibrillation",
        "אם stable + pulse: Amiodarone 150mg IV over 10 min → 1mg/min x6h → 0.5mg/min x18h",
        "אם unstable + pulse: Synchronized cardioversion STAT",
        "Procainamide 17mg/kg IV alternative (אם QT normal)",
        "❌ לא Verapamil ב-VT! — גורם collapse",
      ],
    });
  }

  if (inp.rhythm === "vf") {
    findings.push({
      label: "🔴 VF — Ventricular Fibrillation",
      details: "מצב קטסטרופלי — דורש טיפול מיידי",
      urgency: "STAT",
      treatment: [
        "CPR מיידי",
        "Defibrillation 200J biphasic STAT",
        "Epinephrine 1mg IV q3-5min",
        "Amiodarone 300mg IV",
        "חפש גורם הפיך: 4Hs + 4Ts",
      ],
    });
  }

  if (inp.rhythm === "junctional") {
    findings.push({
      label: "ריתמוס צמתי (Junctional rhythm)",
      details: "HR 40-60, absent/retrograde P waves",
      urgency: rate < 40 ? "Urgent" : "Routine",
      treatment: ["בדוק תרופות (digoxin toxicity, beta-blocker excess)", "אם סימפטומטי → Atropine"],
    });
  }

  if (inp.rhythm === "idioventricular") {
    findings.push({
      label: "Accelerated Idioventricular Rhythm (AIVR)",
      details: "Wide complex, HR 60-100, often post-MI reperfusion",
      urgency: "Routine",
      treatment: ["לרוב אינו דורש טיפול — ריתמוס reperfusion", "מעקב ב-telemetry", "אם מהיר יותר → שקול VT"],
    });
  }

  // ── PR Interval ───────────────────────────
  const pr = parseFloat(inp.prInterval) || 0;
  if (pr > 200) {
    if (inp.rhythm === "3av") {
      findings.push({
        label: "🔴 Complete Heart Block (3rd degree AV block)",
        details: "Dissociation מלאה בין P waves ל-QRS",
        urgency: "STAT",
        treatment: [
          "Transcutaneous pacing STAT",
          "Atropine 0.5mg IV (עלול לא לעזור ב-infranodal block)",
          "Isoproterenol 2-10 µg/min drip",
          "Transvenous pacing בהקדם — התייעצות קרדיולוגיה",
        ],
      });
    } else if (inp.rhythm === "2mobitz2") {
      findings.push({
        label: "🔴 2nd Degree AV Block — Mobitz II",
        details: "PR קבוע + dropped beats פתאומי — high-risk for complete block",
        urgency: "STAT",
        treatment: [
          "Transcutaneous pacing כוננות",
          "התייעצות קרדיולוגיה להשתלת קוצב",
          "הימנע מ-Atropine — עלול להאיץ ventricular rate בלי לשפר AV conduction",
        ],
      });
    } else if (inp.rhythm === "2mobitz1") {
      findings.push({
        label: "2nd Degree AV Block — Wenckebach (Mobitz I)",
        details: "PR מתארך עד dropout — לרוב nodal, ברוב המקרים שפיר",
        urgency: "Routine",
        treatment: ["בדוק גורמים: digoxin, inferior MI, vagal tone", "אם סימפטומטי → Atropine / consult"],
      });
    } else {
      findings.push({
        label: "1st Degree AV Block",
        details: `PR ${pr}ms`,
        urgency: "Routine",
        treatment: ["בד״כ שפיר — בדוק תרופות", "מעקב אם מחמיר"],
      });
    }
  }

  // ── QRS Duration ──────────────────────────
  const qrs = parseFloat(inp.qrsDuration) || 0;

  if (inp.lbbb === "yes") {
    findings.push({
      label: "LBBB",
      details: `QRS ${qrs}ms — New LBBB with symptoms = STEMI-equivalent`,
      urgency: "Urgent",
      treatment: [
        "אם LBBB חדש + כאב חזה → STEMI equivalent — התייעצות קרדיולוגיה STAT",
        "Sgarbossa criteria לאיתור STEMI בנוכחות LBBB",
        "אם LBBB ישן/כרוני + א-סימפטומטי → בדוק סיבה (CHF, cardiomyopathy)",
      ],
    });
  }

  if (inp.rbbb === "yes") {
    const isNew = true; // can't determine from form, assume possible new
    findings.push({
      label: "RBBB",
      details: `QRS ${qrs}ms`,
      urgency: "Routine",
      treatment: [
        "RBBB לבד בד״כ שפיר",
        "אם חדש + right heart strain → שקול PE (RBBB + S1Q3T3)",
        "אם חדש + anterior MI → שקול bifascicular block",
      ],
    });
  }

  if (qrs > 120 && inp.lbbb !== "yes" && inp.rbbb !== "yes") {
    findings.push({
      label: "Wide QRS ללא BBB ספציפי",
      details: `QRS ${qrs}ms`,
      urgency: "Urgent",
      treatment: [
        "שקול: hyperkalemia (peaked T + wide QRS), drug toxicity (TCA, Flecainide), VT",
        "בדוק אלקטרוליטים STAT — K+, Ca2+",
        "Review מדינות: class IC/III antiarrhythmics, TCAs, chloroquine",
      ],
    });
  }

  // ── QTc ───────────────────────────────────
  const qtc = parseFloat(inp.qtc) || 0;
  if (qtc >= 500) {
    findings.push({
      label: "🔴 QTc מוארך מסוכן",
      details: `QTc ${qtc}ms — risk of Torsades de Pointes`,
      urgency: "STAT",
      treatment: [
        "הפסק תרופות מאריכות QT: Haloperidol, Azithromycin, Ondansetron, Sotalol, class III",
        "Mg2+ IV: MgSO4 2g IV over 15 min — גם אם Mg נורמלי ב-TdP",
        "תקן K+ ל->4.5 mEq/L (K+ נמוך מחמיר QT)",
        "אם TdP: override bradycardia עם pacing HR 80-100 או Isoproterenol",
      ],
    });
  } else if (qtc >= 460) {
    findings.push({
      label: "QTc מוארך",
      details: `QTc ${qtc}ms`,
      urgency: "Urgent",
      treatment: [
        "Review תרופות QT-prolonging",
        "תקן אלקטרוליטים: K+, Mg2+, Ca2+",
        "מעקב — חזור ECG אחרי תיקון",
      ],
    });
  }

  // ── ST Changes ────────────────────────────
  // Anterior STEMI
  const v1Elev = ["elev_1", "elev_2"].includes(inp.stV1);
  const v2Elev = ["elev_1", "elev_2"].includes(inp.stV2);
  const v3Elev = ["elev_1", "elev_2"].includes(inp.stV3);
  const v4Elev = ["elev_1", "elev_2"].includes(inp.stV4);
  const v5Elev = ["elev_1", "elev_2"].includes(inp.stV5);
  const v6Elev = ["elev_1", "elev_2"].includes(inp.stV6);

  const inferiorElev = ["elev_1", "elev_2"].includes(inp.stII) &&
    ["elev_1", "elev_2"].includes(inp.stIII) &&
    ["elev_1", "elev_2"].includes(inp.staVF);

  const lateralElev = (["elev_1", "elev_2"].includes(inp.stI) || ["elev_1", "elev_2"].includes(inp.staVL)) &&
    (v5Elev || v6Elev);

  const anteriorElev = (v1Elev || v2Elev) && (v3Elev || v4Elev);
  const anteroseptalElev = (v2Elev || v3Elev || v4Elev);

  if (inferiorElev) {
    findings.push({
      label: "🔴 STEMI — גפה תחתונה (Inferior)",
      details: "ST elevation ב-II, III, aVF — RCA territory",
      urgency: "STAT",
      treatment: [
        "🔴 Cath lab activation — door-to-balloon <90 min",
        "Aspirin 300mg PO (ללעוס) STAT",
        "Heparin 5000U IV bolus",
        "❗ RV infarct שכיח ב-inferior MI: בדוק V4R — NTG/diuretics contraindicated אם RV אינפארקט!",
        "בדוק reciprocal depression: ST depression ב-I, aVL",
        "התייעצות קרדיולוגיה STAT",
      ],
    });
  }

  if (anteriorElev || anteroseptalElev) {
    findings.push({
      label: "🔴 STEMI — קדמי (Anterior/Anteroseptal)",
      details: "ST elevation ב-V1-V4 — LAD territory",
      urgency: "STAT",
      treatment: [
        "🔴 Cath lab activation — door-to-balloon <90 min",
        "Aspirin 300mg PO STAT",
        "Heparin IV bolus",
        "Monitor: Anterior MI → risk of complete block, VT, pump failure",
        "התייעצות קרדיולוגיה STAT",
      ],
    });
  }

  if (lateralElev && !anteriorElev && !inferiorElev) {
    findings.push({
      label: "🔴 STEMI — צדדי (Lateral)",
      details: "ST elevation ב-I, aVL, V5-V6 — LCx territory",
      urgency: "STAT",
      treatment: [
        "🔴 Cath lab activation",
        "Aspirin + Heparin STAT",
        "התייעצות קרדיולוגיה STAT",
      ],
    });
  }

  // aVR elevation (LMCA / proximal LAD)
  if (["elev_1", "elev_2"].includes(inp.staVR) &&
    ["dep_1", "dep_2"].includes(inp.stII)) {
    findings.push({
      label: "🔴 ST Elevation ב-aVR עם Depression מפוזר",
      details: "דפוס LMCA stenosis או proximal LAD — STEMI equivalent",
      urgency: "STAT",
      treatment: [
        "🔴 LMCA/proximal LAD occlusion עד הוכחת אחרת",
        "Cath lab activation / urgent PCI or CABG",
        "Aspirin + Heparin STAT",
        "Anti-ischemic: morphine PRN, O2 אם SpO2<94%",
      ],
    });
  }

  // Diffuse ST elevation (pericarditis)
  const diffuseElev = [inp.stI, inp.stII, inp.stV3, inp.stV4, inp.stV5, inp.stV6].filter(s => ["elev_1", "elev_2"].includes(s)).length >= 4;
  if (diffuseElev && !inferiorElev && !anteriorElev && !lateralElev) {
    findings.push({
      label: "ST Elevation מפוזר — Pericarditis vs STEMI",
      details: "Concave ST elevation מפוזר ≠ focal STEMI",
      urgency: "Urgent",
      treatment: [
        "אם concave (saddle-shaped) → Pericarditis: NSAID (Aspirin 650mg q6h) + Colchicine 0.5mg BID",
        "PR depression תומך בפריקרדיטיס",
        "שלול MI: Troponin, Echo",
        "❌ Anticoagulation בזהירות רבה בפריקרדיטיס",
      ],
    });
  }

  // ST Depression (ischemia/NSTEMI)
  const depLeads = [inp.stI, inp.stII, inp.stV4, inp.stV5, inp.stV6].filter(s => ["dep_1", "dep_2"].includes(s)).length;
  if (depLeads >= 2 && !diffuseElev && !inferiorElev && !anteriorElev) {
    findings.push({
      label: "ST Depression — NSTEMI / Ischemia",
      details: `Depression ב-${depLeads} גפות/הובלות`,
      urgency: "Urgent",
      treatment: [
        "Aspirin 300mg PO STAT",
        "Troponin T0 + T3-6h",
        "Heparin IV (UFH 60U/kg bolus → 12U/kg/h) — TIMI score לפי risk",
        "Beta-blocker אם HR מהיר ואין contraindication",
        "NTG SL אם כאב, SBP>90",
        "GRACE score → שקול urgent cath",
      ],
    });
  }

  // ── T Waves ─────────────────────────────
  if (inp.tWaves === "peaked") {
    findings.push({
      label: "Peaked T Waves — היפרקלמיה?",
      details: "T גבוהים וצרים — הסימן הראשון של היפרקלמיה",
      urgency: "Urgent",
      treatment: [
        "K+ STAT",
        "אם K>6.0: ECG findings → Calcium Gluconate 10ml IV immediately",
        "Insulin 10U IV + D50% 50ml IV",
        "Kayexalate / Sodium Bicarbonate לפי severity",
        "שקול dialysis אם K>7 או עם ECG changes",
      ],
    });
  }

  if (inp.tWaves === "inverted") {
    findings.push({
      label: "T-Wave Inversions",
      details: "שלילת MI, ischemia, strain, Wellens syndrome",
      urgency: "Urgent",
      treatment: [
        "Wellens pattern (V2-V3 deep symmetric T inversions) = LAD critical stenosis post-pain",
        "Troponin + Echo",
        "אם Wellens: stress test CONTRAINDICATED — לcath",
        "T inversions ב-V1-V3 + S1Q3T3 → שקול PE",
        "RV strain: T inversions V1-V4 + RBBB",
      ],
    });
  }

  if (inp.tWaves === "flattened") {
    findings.push({
      label: "T-Wave Flattening — היפוקלמיה?",
      details: "T שטוחים ± U waves ← היפוקלמיה, digoxin, ischemia",
      urgency: "Routine",
      treatment: [
        "בדוק K+ + Mg2+",
        "אם U waves בולטים → K<3.0 בד״כ",
        "תיקון K+ IV/PO לפי severity",
        "בדוק digoxin level אם רלוונטי",
      ],
    });
  }

  // ── Q Waves ──────────────────────────────
  if (inp.qWaves === "pathological") {
    findings.push({
      label: "Q Waves פתולוגיים",
      details: "Pathological Q waves — MI ישן / אחר",
      urgency: "Routine",
      treatment: [
        "Q waves >40ms רחב / >25% R amplitude = pathological",
        "מיקום: inferior = RCA, anterior = LAD, lateral = LCx",
        "אם חדשים + כאב → STEMI!",
        "אם ישנים → תעד, בדוק function (Echo)",
      ],
    });
  }

  // ── Delta Wave (WPW) ────────────────────
  if (inp.deltaWave === "yes") {
    findings.push({
      label: "Delta Wave — WPW (Pre-excitation)",
      details: "Short PR + delta wave + wide QRS",
      urgency: inp.rhythm === "af" ? "STAT" : "Urgent",
      treatment: [
        inp.rhythm === "af"
          ? "🔴 WPW + AF = מסוכן! — ❌ Adenosine, Verapamil, Digoxin, Amiodarone → VF!"
          : "הפנה לקרדיולוגיה לאבחון accessory pathway",
        "WPW + AF stable: Procainamide 17mg/kg IV",
        "WPW + AF unstable: Synchronized cardioversion",
        "WPW + SVT stable: Procainamide / Flecainide (לא Adenosine!)",
      ],
    });
  }

  // ── LVH ──────────────────────────────────
  if (inp.lvh === "yes") {
    findings.push({
      label: "LVH — Sokolow-Lyon / Cornell",
      details: "Voltage criteria + strain pattern",
      urgency: "Routine",
      treatment: [
        "LVH strain: ST depression + T inversion ב-lateral leads — לא ischemia",
        "בדוק BP ממוצע + ECHO לאישור ולvalvular disease",
        "Optimize BP control",
      ],
    });
  }

  // ── RVH / Pulmonary Pattern ────────────
  if (inp.rvh === "yes") {
    findings.push({
      label: "RVH / Pulmonary Pattern",
      details: "R>S ב-V1, Right axis, T inversions V1-V3",
      urgency: "Urgent",
      treatment: [
        "S1Q3T3 + sinus tachycardia + RBBB → שקול PE",
        "בדוק: Echo, BNP, D-dimer, CT-PA",
        "אם כרוני: Pulmonary HTN, COPD, MS",
      ],
    });
  }

  // ── Axis ─────────────────────────────────
  if (inp.axis === "extreme") {
    findings.push({
      label: "Extreme Axis Deviation (Northwest axis)",
      details: "Negative ב-I + aVF",
      urgency: "Urgent",
      treatment: ["VT עד הוכחת אחרת", "Wide complex + extreme axis = VT", "שקול Hyperkalemia"],
    });
  }

  if (inp.axis === "right") {
    findings.push({
      label: "Right Axis Deviation",
      details: "שקול: RVH, PE, LPHB, lateral MI",
      urgency: "Routine",
      treatment: ["בשילוב עם S1Q3T3 → PE", "בשילוב עם RBBB + LPHB → bifascicular block"],
    });
  }

  // ── Brugada pattern ─────────────────────
  if (inp.otherFindings.toLowerCase().includes("brugada")) {
    findings.push({
      label: "🔴 Brugada Pattern",
      details: "Coved ST elevation V1-V2 — risk of sudden cardiac death",
      urgency: "STAT",
      treatment: [
        "ICD evaluation",
        "הימנע מחום גבוה, תרופות מסוג I (Sodium channel blockers)",
        "Quinidine לפי התייעצות קרדיולוג",
        "Family screening",
      ],
    });
  }

  // ── Digoxin toxicity ─────────────────────
  if (inp.otherFindings.toLowerCase().includes("digoxin") || inp.otherFindings.toLowerCase().includes("דיגוקסין")) {
    findings.push({
      label: "Digoxin Toxicity Pattern",
      details: "Scooped ST depression (reverse tick sign), PR prolongation, slow ventricular rate",
      urgency: "Urgent",
      treatment: [
        "Digoxin level STAT",
        "K+ — Digoxin toxicity מחמיר עם Hypokalemia",
        "אם life-threatening arrhythmia: Digibind (Digoxin Immune Fab)",
        "Atropine לברדיקרדיה סימפטומטית",
        "❌ Calcium — contraindicated בדיגוקסין טוקסיסיטי",
      ],
    });
  }

  // ── Normal ECG ────────────────────────────
  if (findings.length === 0) {
    findings.push({
      label: "תקין — Normal Sinus Rhythm",
      details: "לא זוהו ממצאים פתולוגיים ברורים על בסיס הנתונים שהוזנו",
      urgency: "Normal",
      treatment: ["אם קליני חשד → אל תתבסס על ECG בלבד", "חזור ב-6-12h אם כאב חזה ממשיך"],
    });
  }

  // ── Overall urgency ───────────────────────
  let overallUrgency: Urgency = "Normal";
  if (findings.some(f => f.urgency === "STAT")) overallUrgency = "STAT";
  else if (findings.some(f => f.urgency === "Urgent")) overallUrgency = "Urgent";
  else if (findings.some(f => f.urgency === "Routine")) overallUrgency = "Routine";

  const summary = findings.map(f => f.label).join(" | ");
  return { findings, summary, overallUrgency };
}

// ─── UI helpers ────────────────────────────────────────────
const urgencyColor: Record<Urgency, string> = {
  STAT: "bg-red-600 text-white",
  Urgent: "bg-amber-500 text-white",
  Routine: "bg-blue-500 text-white",
  Normal: "bg-green-600 text-white",
};

const urgencyBorder: Record<Urgency, string> = {
  STAT: "border-red-400 bg-red-50 dark:bg-red-900/20",
  Urgent: "border-amber-400 bg-amber-50 dark:bg-amber-900/20",
  Routine: "border-blue-400 bg-blue-50 dark:bg-blue-900/20",
  Normal: "border-green-400 bg-green-50 dark:bg-green-900/20",
};

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">{children}</label>;
}

function Select({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
    >
      {children}
    </select>
  );
}

function NumInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      type="number"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
    />
  );
}

const ST_OPTIONS = (
  <>
    <option value="">—</option>
    <option value="normal">תקין</option>
    <option value="elev_1">↑ 0.5-1mm</option>
    <option value="elev_2">↑ ≥2mm</option>
    <option value="dep_1">↓ 0.5-1mm</option>
    <option value="dep_2">↓ ≥1mm</option>
  </>
);

// ─── Main Component ────────────────────────────────────────
export function ECGInterpreter() {
  const defaultInput: ECGInput = {
    rate: "", rhythm: "", prInterval: "", qrsDuration: "", qtc: "", axis: "",
    stV1: "", stV2: "", stV3: "", stV4: "", stV5: "", stV6: "",
    stI: "", stII: "", stIII: "", staVL: "", staVF: "", staVR: "",
    tWaves: "", qWaves: "", deltaWave: "", lbbb: "", rbbb: "", lvh: "", rvh: "",
    otherFindings: "",
  };

  const [inp, setInp] = useState<ECGInput>(defaultInput);
  const [interpreted, setInterpreted] = useState(false);

  const set = (key: keyof ECGInput) => (val: string) => setInp(prev => ({ ...prev, [key]: val }));

  const result = useMemo(() => {
    if (!interpreted) return null;
    return interpret(inp);
  }, [interpreted, inp]);

  const hasAnyInput = inp.rate || inp.rhythm || inp.stV1 || inp.stV2 || inp.stV3 || inp.stI || inp.stII || inp.tWaves;

  return (
    <div dir="rtl" className="space-y-4 pb-8">
      <div className="bg-slate-100 dark:bg-slate-800/60 rounded-xl p-3 text-[11px] text-slate-500 dark:text-slate-400">
        ⚠️ כלי עזר — אינו מחליף הערכה קלינית. הזן ממצאים לפי מה שיש, אל תנחש.
      </div>

      {/* ── Rate & Rhythm ── */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>קצב לב (BPM)</Label>
          <NumInput value={inp.rate} onChange={set("rate")} placeholder="72" />
        </div>
        <div>
          <Label>ריתמוס</Label>
          <Select value={inp.rhythm} onChange={set("rhythm")}>
            <option value="">— בחר —</option>
            <option value="sinus">Sinus rhythm</option>
            <option value="af">AF</option>
            <option value="afl">Atrial flutter</option>
            <option value="svt">SVT (narrow)</option>
            <option value="vt">VT (wide regular)</option>
            <option value="vf">VF / pulse-less</option>
            <option value="junctional">Junctional</option>
            <option value="idioventricular">AIVR</option>
            <option value="2mobitz1">2° AV Block Mobitz I</option>
            <option value="2mobitz2">2° AV Block Mobitz II</option>
            <option value="3av">Complete Heart Block (3°)</option>
          </Select>
        </div>
      </div>

      {/* ── Intervals ── */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label>PR (ms)</Label>
          <NumInput value={inp.prInterval} onChange={set("prInterval")} placeholder="160" />
        </div>
        <div>
          <Label>QRS (ms)</Label>
          <NumInput value={inp.qrsDuration} onChange={set("qrsDuration")} placeholder="90" />
        </div>
        <div>
          <Label>QTc (ms)</Label>
          <NumInput value={inp.qtc} onChange={set("qtc")} placeholder="440" />
        </div>
      </div>

      {/* ── Axis ── */}
      <div>
        <Label>ציר (Axis)</Label>
        <Select value={inp.axis} onChange={set("axis")}>
          <option value="">—</option>
          <option value="normal">תקין (-30° to +90°)</option>
          <option value="left">Left axis deviation (&lt;-30°)</option>
          <option value="right">Right axis deviation (&gt;+90°)</option>
          <option value="extreme">Extreme / Northwest (&gt;±180°)</option>
        </Select>
      </div>

      {/* ── ST Segments ── */}
      <div>
        <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">שינויי ST</p>
        <div className="grid grid-cols-3 gap-1.5">
          {([
            ["V1", "stV1"], ["V2", "stV2"], ["V3", "stV3"],
            ["V4", "stV4"], ["V5", "stV5"], ["V6", "stV6"],
            ["I", "stI"], ["II", "stII"], ["III", "stIII"],
            ["aVL", "staVL"], ["aVF", "staVF"], ["aVR", "staVR"],
          ] as [string, keyof ECGInput][]).map(([label, key]) => (
            <div key={key}>
              <Label>{label}</Label>
              <Select value={inp[key]} onChange={set(key)}>
                {ST_OPTIONS}
              </Select>
            </div>
          ))}
        </div>
      </div>

      {/* ── T Waves & Q Waves ── */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>גל T</Label>
          <Select value={inp.tWaves} onChange={set("tWaves")}>
            <option value="">—</option>
            <option value="normal">תקין</option>
            <option value="peaked">Peaked / גבוה</option>
            <option value="inverted">Inverted / הפוך</option>
            <option value="flattened">Flat / שטוח</option>
            <option value="biphasic">Biphasic (Wellens)</option>
          </Select>
        </div>
        <div>
          <Label>גלי Q</Label>
          <Select value={inp.qWaves} onChange={set("qWaves")}>
            <option value="">—</option>
            <option value="none">ללא</option>
            <option value="septal">Septal Q (תקינים)</option>
            <option value="pathological">פתולוגיים</option>
          </Select>
        </div>
      </div>

      {/* ── Conduction ── */}
      <div className="grid grid-cols-2 gap-2">
        {([
          ["LBBB", "lbbb"],
          ["RBBB", "rbbb"],
          ["Delta Wave (WPW)", "deltaWave"],
          ["LVH", "lvh"],
          ["RVH", "rvh"],
        ] as [string, keyof ECGInput][]).map(([label, key]) => (
          <div key={key}>
            <Label>{label}</Label>
            <Select value={inp[key]} onChange={set(key)}>
              <option value="">—</option>
              <option value="yes">כן</option>
              <option value="no">לא</option>
            </Select>
          </div>
        ))}
      </div>

      {/* ── Other ── */}
      <div>
        <Label>ממצאים נוספים (Brugada, digoxin pattern, Osborn waves...)</Label>
        <input
          type="text"
          value={inp.otherFindings}
          onChange={e => set("otherFindings")(e.target.value)}
          placeholder="Brugada, digoxin, Osborn..."
          className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
          dir="auto"
        />
      </div>

      {/* ── Interpret button ── */}
      <button
        onClick={() => setInterpreted(true)}
        disabled={!hasAnyInput}
        className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-bold disabled:opacity-40 active:bg-blue-700"
      >
        🔍 פרש ECG
      </button>

      {result && (
        <div className="space-y-3">
          {/* Summary banner */}
          <div className={`rounded-xl p-3 ${urgencyBorder[result.overallUrgency]} border-2`}>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${urgencyColor[result.overallUrgency]}`}>
                {result.overallUrgency}
              </span>
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">סיכום</span>
            </div>
            <p className="text-xs text-slate-700 dark:text-slate-300">{result.summary}</p>
          </div>

          {/* Findings */}
          {result.findings.map((f, i) => (
            <div key={i} className={`rounded-xl border p-3 space-y-2 ${urgencyBorder[f.urgency]}`}>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${urgencyColor[f.urgency]}`}>
                  {f.urgency}
                </span>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{f.label}</span>
              </div>
              {f.details && <p className="text-[11px] text-slate-600 dark:text-slate-400">{f.details}</p>}
              {f.ddx && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  <strong>DDx:</strong> {f.ddx.join(" | ")}
                </p>
              )}
              <div className="space-y-1 border-t border-slate-200 dark:border-slate-700 pt-2">
                <p className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide">טיפול</p>
                {f.treatment.map((t, j) => (
                  <div key={j} className="flex gap-1.5 text-[11px] text-slate-700 dark:text-slate-300">
                    <span className="shrink-0 mt-0.5">•</span>
                    <span>{t}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <button
            onClick={() => { setInterpreted(false); setInp(defaultInput); }}
            className="w-full py-2 text-xs text-slate-500 dark:text-slate-400 active:bg-slate-100 dark:active:bg-slate-800 rounded-xl"
          >
            ← ECG חדש
          </button>
        </div>
      )}
    </div>
  );
}

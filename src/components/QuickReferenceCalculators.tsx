/**
 * Clinical calculators and reference components extracted from QuickReference.
 * CrClCalculator, CURB65Calculator, NEWS2Calculator, ElectrolyteReference, InsulinReference
 */
import { useState, useMemo, useEffect } from "react";
import { crclToBucket, cockcroft } from "../utils/renal";

// ─────────────────────────────────────────────────────────
// CrCl CALCULATOR (Cockcroft-Gault)
// ─────────────────────────────────────────────────────────

export function CrClCalculator({ onCrClChange }: { onCrClChange?: (crcl: number | null, isHD?: boolean) => void }) {
  const [age, setAge] = useState("");
  const [weight, setWeight] = useState("");
  const [creatinine, setCr] = useState("");
  const [female, setFemale] = useState(false);
  const [isHD, setIsHD] = useState(false);

  const crcl = useMemo(() => {
    if (isHD) return 0; // HD overrides
    const a = parseFloat(age);
    const w = parseFloat(weight);
    const c = parseFloat(creatinine);
    if (!a || !w || !c || c <= 0) return null;
    // cockcroft() applies AGS/ASHP creatinine floor (≥75yo, Cr<1.0 → 1.0)
    return Math.round(cockcroft(a, w, female, c));
  }, [age, weight, creatinine, female, isHD]);

  // Report CrCl to parent
  useEffect(() => {
    onCrClChange?.(crcl, isHD);
  }, [crcl, isHD, onCrClChange]);

  const bucket = crcl !== null ? crclToBucket(crcl, isHD) : null;

  return (
    <div className="space-y-3">
      <h3 className="font-bold text-sm">מחשבון CrCl (Cockcroft-Gault)</h3>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-gray-600 dark:text-gray-400">
          גיל
          <input type="number" value={age} onChange={(e) => setAge(e.target.value)}
            className="w-full mt-0.5 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" placeholder="75" />
        </label>
        <label className="text-xs text-gray-600 dark:text-gray-400">
          משקל (kg)
          <input type="number" value={weight} onChange={(e) => setWeight(e.target.value)}
            className="w-full mt-0.5 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" placeholder="70" />
        </label>
        <label className="text-xs text-gray-600 dark:text-gray-400">
          Creatinine (mg/dL)
          <input type="number" step="0.1" value={creatinine} onChange={(e) => setCr(e.target.value)}
            className="w-full mt-0.5 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" placeholder="1.2" />
        </label>
        <div className="flex flex-col gap-1 text-xs text-gray-600 dark:text-gray-400 justify-end pb-1.5">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={female} onChange={() => setFemale(!female)}
              className="h-4 w-4 rounded accent-blue-600" />
            נקבה (×0.85)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={isHD} onChange={() => setIsHD(!isHD)}
              className="h-4 w-4 rounded accent-purple-600" />
            דיאליזה (HD)
          </label>
        </div>
      </div>
      {(crcl !== null || isHD) && (
        <div className={`text-center text-lg font-bold p-3 rounded-xl ${
          isHD ? "bg-purple-100 text-purple-800 dark:text-purple-300" :
          crcl! > 60 ? "bg-green-100 text-green-800 dark:text-green-300" :
          crcl! > 30 ? "bg-yellow-100 text-yellow-800" :
          crcl! > 15 ? "bg-orange-100 text-orange-800" :
          "bg-red-100 text-red-800 dark:text-red-300"
        }`}>
          {isHD ? "HD — דיאליזה" : `CrCl = ${crcl} ml/min`}
          {bucket && (
            <div className="text-xs font-normal mt-1">
              {isHD ? "מינונים מותאמים להמודיאליזה" :
               crcl! > 60 ? "תקין / ירידה קלה" :
               crcl! > 30 ? "ירידה בינונית — התאם מינונים" :
               crcl! > 15 ? "ירידה חמורה — הפחת משמעותית" :
               "אי-ספיקת כליות קשה — שקול דיאליזה"}
            </div>
          )}
          {bucket && bucket !== "gt50" && (
            <div className="text-xs font-semibold mt-2 bg-white/50 dark:bg-gray-700/50 rounded-lg p-1.5">
              💊 חזור ללשונית ABx לראות מינונים מותאמים
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// CURB-65 CALCULATOR
// ─────────────────────────────────────────────────────────

export function CURB65Calculator() {
  const [c, setC] = useState(false);
  const [u, setU] = useState(false);
  const [r, setR] = useState(false);
  const [b, setB] = useState(false);
  const [age65, setAge65] = useState(false);

  const score = [c, u, r, b, age65].filter(Boolean).length;

  const interpretation = score <= 1
    ? { text: "סיכון נמוך — שקול טיפול אמבולטורי", color: "bg-green-100 text-green-800 dark:text-green-300" }
    : score === 2
    ? { text: "סיכון בינוני — אשפוז קצר / מעקב צמוד", color: "bg-yellow-100 text-yellow-800" }
    : { text: "סיכון גבוה — אשפוז. ≥4 שקול ICU", color: "bg-red-100 text-red-800 dark:text-red-300" };

  return (
    <div className="space-y-3">
      <h3 className="font-bold text-sm">CURB-65 (חומרת דלקת ריאות)</h3>
      <div className="space-y-2">
        {[
          { val: c, set: setC, label: "C — Confusion (בלבול חדש)" },
          { val: u, set: setU, label: "U — Urea > 7 mmol/L (BUN > 19)" },
          { val: r, set: setR, label: "R — Respiratory Rate ≥ 30" },
          { val: b, set: setB, label: "B — Blood Pressure: SBP<90 / DBP≤60" },
          { val: age65, set: setAge65, label: "65 — גיל ≥ 65" },
        ].map((item) => (
          <label key={item.label} className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={item.val} onChange={() => item.set(!item.val)}
              className="h-4 w-4 rounded accent-blue-600" />
            {item.label}
          </label>
        ))}
      </div>
      <div className={`text-center p-3 rounded-xl font-bold ${interpretation.color}`}>
        CURB-65 = {score}/5
        <div className="text-xs font-normal mt-1">{interpretation.text}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// NEWS2 EARLY WARNING SCORE
// ─────────────────────────────────────────────────────────

export function NEWS2Calculator() {
  const [rr, setRR] = useState("");
  const [spo2, setSpO2] = useState("");
  const [isType2, setIsType2] = useState(false);
  const [onO2, setOnO2] = useState(false);
  const [temp, setTemp] = useState("");
  const [sbp, setSBP] = useState("");
  const [hr, setHR] = useState("");
  const [avpu, setAVPU] = useState("A");

  const score = useMemo(() => {
    let s = 0;
    const rrVal = parseFloat(rr);
    const spo2Val = parseFloat(spo2);
    const tempVal = parseFloat(temp);
    const sbpVal = parseFloat(sbp);
    const hrVal = parseFloat(hr);

    if (rrVal) {
      if (rrVal <= 8) s += 3;
      else if (rrVal <= 11) s += 1;
      else if (rrVal <= 20) s += 0;
      else if (rrVal <= 24) s += 2;
      else s += 3;
    }

    if (spo2Val) {
      if (!isType2) {
        if (spo2Val <= 91) s += 3;
        else if (spo2Val <= 93) s += 2;
        else if (spo2Val <= 95) s += 1;
        else s += 0;
      } else {
        if (spo2Val <= 83) s += 3;
        else if (spo2Val <= 85) s += 2;
        else if (spo2Val <= 87) s += 1;
        else if (spo2Val <= 92) s += 0;
        else if (spo2Val <= 94 && onO2) s += 1;
        else if (spo2Val <= 96 && onO2) s += 2;
        else if (spo2Val >= 97 && onO2) s += 3;
      }
    }

    if (onO2) s += 2;

    if (tempVal) {
      if (tempVal <= 35.0) s += 3;
      else if (tempVal <= 36.0) s += 1;
      else if (tempVal <= 38.0) s += 0;
      else if (tempVal <= 39.0) s += 1;
      else s += 2;
    }

    if (sbpVal) {
      if (sbpVal <= 90) s += 3;
      else if (sbpVal <= 100) s += 2;
      else if (sbpVal <= 110) s += 1;
      else if (sbpVal <= 219) s += 0;
      else s += 3;
    }

    if (hrVal) {
      if (hrVal <= 40) s += 3;
      else if (hrVal <= 50) s += 1;
      else if (hrVal <= 90) s += 0;
      else if (hrVal <= 110) s += 1;
      else if (hrVal <= 130) s += 2;
      else s += 3;
    }

    if (avpu === "V" || avpu === "P" || avpu === "U") s += 3;

    return s;
  }, [rr, spo2, isType2, onO2, temp, sbp, hr, avpu]);

  const interpretation = score >= 7
    ? { text: "🔴 גבוה מאוד — שקול ICU. ניטור רציף. רופא בכיר!", color: "bg-red-100 text-red-800 dark:text-red-300 border-red-300" }
    : score >= 5
    ? { text: "🟠 בינוני-גבוה — הערכה דחופה. שקול escalation", color: "bg-orange-100 text-orange-800 border-orange-300" }
    : score >= 1
    ? { text: "🟡 נמוך — הערכה ע\"י אחות. שקול הגברת ניטור", color: "bg-yellow-100 text-yellow-800 border-yellow-300" }
    : { text: "🟢 0 — ניטור שגרתי", color: "bg-green-100 text-green-800 dark:text-green-300 border-green-300" };

  return (
    <div className="space-y-3">
      <h3 className="font-bold text-sm">NEWS2 (National Early Warning Score 2)</h3>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-gray-600 dark:text-gray-400">
          קצב נשימה (RR)
          <input type="number" value={rr} onChange={(e) => setRR(e.target.value)}
            className="w-full mt-0.5 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" placeholder="16" />
        </label>
        <label className="text-xs text-gray-600 dark:text-gray-400">
          SpO2 (%)
          <input type="number" value={spo2} onChange={(e) => setSpO2(e.target.value)}
            className="w-full mt-0.5 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" placeholder="96" />
        </label>
        <label className="text-xs text-gray-600 dark:text-gray-400">
          חום (°C)
          <input type="number" step="0.1" value={temp} onChange={(e) => setTemp(e.target.value)}
            className="w-full mt-0.5 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" placeholder="37.0" />
        </label>
        <label className="text-xs text-gray-600 dark:text-gray-400">
          SBP (mmHg)
          <input type="number" value={sbp} onChange={(e) => setSBP(e.target.value)}
            className="w-full mt-0.5 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" placeholder="120" />
        </label>
        <label className="text-xs text-gray-600 dark:text-gray-400">
          דופק (HR)
          <input type="number" value={hr} onChange={(e) => setHR(e.target.value)}
            className="w-full mt-0.5 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" placeholder="80" />
        </label>
        <label className="text-xs text-gray-600 dark:text-gray-400">
          AVPU
          <select value={avpu} onChange={(e) => setAVPU(e.target.value)}
            className="w-full mt-0.5 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
            <option value="A">A — ערני</option>
            <option value="V">V — מגיב לקול</option>
            <option value="P">P — מגיב לכאב</option>
            <option value="U">U — לא מגיב</option>
          </select>
        </label>
      </div>
      <div className="flex gap-3 text-xs">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={onO2} onChange={() => setOnO2(!onO2)}
            className="h-3.5 w-3.5 rounded accent-blue-600" />
          על חמצן
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={isType2} onChange={() => setIsType2(!isType2)}
            className="h-3.5 w-3.5 rounded accent-blue-600" />
          COPD (Scale 2)
        </label>
      </div>
      <div className={`text-center p-3 rounded-xl font-bold border ${interpretation.color}`}>
        NEWS2 = {score}
        <div className="text-xs font-normal mt-1">{interpretation.text}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// ELECTROLYTE REPLACEMENT PROTOCOLS
// ─────────────────────────────────────────────────────────

export function ElectrolyteReference() {
  return (
    <div className="space-y-4">
      <h3 className="font-bold text-sm">פרוטוקולי תיקון אלקטרוליטים</h3>

      <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-3 space-y-2">
        <div className="font-bold text-sm text-purple-800 dark:text-purple-300">🔋 אשלגן (K+)</div>
        <div className="text-xs space-y-1.5">
          <div className="bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded-lg">
            <span className="font-semibold">K+ 3.0-3.4:</span> KCl 40mEq PO x2-3/d
          </div>
          <div className="bg-orange-50 dark:bg-orange-900/20 p-2 rounded-lg">
            <span className="font-semibold">K+ 2.5-2.9:</span> KCl 10mEq/h IV (max 20mEq/h peripheral, 40 central) + PO
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 p-2 rounded-lg">
            <span className="font-semibold">K+ &lt;2.5 / ECG∆:</span> KCl 20mEq/h IV (monitor!) + MgSO4 2g IV
          </div>
          <div className="text-gray-600 dark:text-gray-400 italic">💡 תמיד בדוק Mg — היפומגנזמיה = K+ לא מתתקן!</div>
        </div>
      </div>

      <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-3 space-y-2">
        <div className="font-bold text-sm text-blue-800 dark:text-blue-300">🧲 מגנזיום (Mg2+)</div>
        <div className="text-xs space-y-1.5">
          <div className="bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded-lg">
            <span className="font-semibold">Mg 1.2-1.6:</span> MgO 400mg PO x2/d (אם כליות תקינות)
          </div>
          <div className="bg-orange-50 dark:bg-orange-900/20 p-2 rounded-lg">
            <span className="font-semibold">Mg &lt;1.2 / סימפטומטי:</span> MgSO4 2g IV over 1h → 4-6g over 24h
          </div>
          <div className="text-gray-600 dark:text-gray-400 italic">💡 חיוני לתיקון היפוקלמיה והיפוקלצמיה</div>
        </div>
      </div>

      <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-3 space-y-2">
        <div className="font-bold text-sm text-green-800 dark:text-green-300">🦴 סידן (Ca2+)</div>
        <div className="text-xs space-y-1.5">
          <div className="bg-gray-50 dark:bg-gray-800/60 p-2 rounded-lg">
            <span className="font-semibold">תיקון לאלבומין:</span> Ca_corrected = Ca + 0.8 × (4.0 − Albumin)
          </div>
          <div className="bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded-lg">
            <span className="font-semibold">קל:</span> CaCO3 500mg PO x3/d + Vitamin D
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 p-2 rounded-lg">
            <span className="font-semibold">חמור / סימפטומטי:</span> Ca Gluconate 10% 10-20ml IV over 10min → gtt
          </div>
          <div className="text-gray-600 dark:text-gray-400 italic">💡 אם גם היפומגנזמיה — תקן Mg קודם!</div>
        </div>
      </div>

      <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-3 space-y-2">
        <div className="font-bold text-sm text-amber-800 dark:text-amber-300">⚡ זרחן (PO4)</div>
        <div className="text-xs space-y-1.5">
          <div className="bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded-lg">
            <span className="font-semibold">PO4 1.5-2.5:</span> Phospho-Soda 5ml PO x2-3/d
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 p-2 rounded-lg">
            <span className="font-semibold">PO4 &lt;1.5:</span> KPhos/NaPhos 15-30mmol IV over 6h
          </div>
          <div className="text-gray-600 dark:text-gray-400 italic">💡 שכיח ב-refeeding, DKA, ספסיס. עלול לגרום חולשת שרירים ואי"נ נשימתית</div>
        </div>
      </div>

      <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-3 space-y-2">
        <div className="font-bold text-sm text-indigo-800 dark:text-indigo-300">💧 נתרן (Na+)</div>
        <div className="text-xs space-y-1.5">
          <div className="bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded-lg">
            <span className="font-semibold">Na 125-130 אסימפטומטי:</span> הגבלת נוזלים 1-1.5L/d + בדוק SIADH
          </div>
          <div className="bg-orange-50 dark:bg-orange-900/20 p-2 rounded-lg">
            <span className="font-semibold">Na 120-125 סימפטומטי:</span> NaCl 0.9% IV + Furosemide אם SIADH
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 p-2 rounded-lg">
            <span className="font-semibold">Na &lt;120 / seizures:</span> NaCl 3% 100ml IV over 10min (bolus x3 max)
          </div>
          <div className="text-gray-600 dark:text-gray-400 italic">🔴 מקסימום תיקון: 8 mEq/L / 24h! (סכנת ODS)</div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// INSULIN SLIDING SCALE & INPATIENT GLUCOSE MANAGEMENT
// ─────────────────────────────────────────────────────────

export function InsulinReference() {
  const [weight, setWeight] = useState("");
  const [sensitivity, setSensitivity] = useState<"low" | "medium" | "high">("medium");

  const basalDose = useMemo(() => {
    const w = parseFloat(weight);
    if (!w) return null;
    const tdd = sensitivity === "low" ? w * 0.2 : sensitivity === "medium" ? w * 0.3 : w * 0.4;
    return {
      tdd: Math.round(tdd),
      basal: Math.round(tdd * 0.5),
      bolus: Math.round(tdd * 0.5 / 3),
    };
  }, [weight, sensitivity]);

  return (
    <div className="space-y-4">
      <h3 className="font-bold text-sm">ניהול סוכר באשפוז</h3>

      <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-3 space-y-2">
        <div className="font-bold text-sm text-blue-800 dark:text-blue-300">📊 Sliding Scale — תיקון מהיר</div>
        <div className="text-xs">
          <table className="w-full text-right">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="py-1 px-1">סוכר (mg/dL)</th>
                <th className="py-1 px-1">Low</th>
                <th className="py-1 px-1">Medium</th>
                <th className="py-1 px-1">High</th>
              </tr>
            </thead>
            <tbody className="text-gray-700 dark:text-gray-300">
              <tr><td className="py-0.5 px-1">150-199</td><td>0</td><td>1</td><td>2</td></tr>
              <tr className="bg-yellow-50 dark:bg-yellow-900/20"><td className="py-0.5 px-1">200-249</td><td>1</td><td>2</td><td>4</td></tr>
              <tr><td className="py-0.5 px-1">250-299</td><td>2</td><td>4</td><td>6</td></tr>
              <tr className="bg-orange-50 dark:bg-orange-900/20"><td className="py-0.5 px-1">300-349</td><td>3</td><td>5</td><td>8</td></tr>
              <tr className="bg-red-50 dark:bg-red-900/20"><td className="py-0.5 px-1">&gt;350</td><td>4</td><td>7</td><td>10</td></tr>
            </tbody>
          </table>
          <div className="text-gray-500 dark:text-gray-400 mt-1.5 italic">* יחידות Regular insulin SC. Low = רגיש/רזה/קשיש, High = שמן/סטרואידים</div>
        </div>
      </div>

      <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-3 space-y-2">
        <div className="font-bold text-sm text-green-800 dark:text-green-300">💉 חישוב Basal-Bolus</div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-gray-600 dark:text-gray-400">
            משקל (kg)
            <input type="number" value={weight} onChange={(e) => setWeight(e.target.value)}
              className="w-full mt-0.5 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" placeholder="70" />
          </label>
          <label className="text-xs text-gray-600 dark:text-gray-400">
            רגישות לאינסולין
            <select value={sensitivity} onChange={(e) => setSensitivity(e.target.value as "low" | "medium" | "high")}
              className="w-full mt-0.5 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
              <option value="low">נמוכה (0.2U/kg) — קשיש/רזה/CKD</option>
              <option value="medium">בינונית (0.3U/kg)</option>
              <option value="high">גבוהה (0.4U/kg) — השמנה/סטרואידים</option>
            </select>
          </label>
        </div>
        {basalDose && (
          <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-xl text-sm space-y-1">
            <div><span className="font-semibold">TDD:</span> ~{basalDose.tdd}U/day</div>
            <div><span className="font-semibold">Basal (50%):</span> Glargine {basalDose.basal}U SC HS</div>
            <div><span className="font-semibold">Bolus (50%÷3):</span> Lispro ~{basalDose.bolus}U SC AC x3</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">+ Correction factor ≈ 1700 ÷ TDD = {Math.round(1700 / basalDose.tdd)} mg/dL per unit</div>
          </div>
        )}
      </div>

      <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-3 space-y-2">
        <div className="font-bold text-sm text-red-800 dark:text-red-300">⚠️ כללי זהב</div>
        <div className="text-xs space-y-1.5">
          <div className="bg-red-50 dark:bg-red-900/20 p-2 rounded-lg">🔴 <span className="font-semibold">אף פעם לא עוצרים basal insulin!</span> אפילו NPO — תן 50-80% מהמינון</div>
          <div className="bg-orange-50 dark:bg-orange-900/20 p-2 rounded-lg">🟠 <span className="font-semibold">Type 1:</span> חייב basal — אחרת DKA תוך שעות</div>
          <div className="bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded-lg">🟡 <span className="font-semibold">Sliding scale alone:</span> לא מספיק! תמיד שלב basal</div>
          <div className="bg-blue-50 dark:bg-blue-900/20 p-2 rounded-lg">🔵 <span className="font-semibold">יעד:</span> 140-180 mg/dL (קשישים: עד 200 מותר)</div>
          <div className="bg-purple-50 dark:bg-purple-900/20 p-2 rounded-lg">🟣 <span className="font-semibold">Hold metformin:</span> CrCl&lt;30, contrast, surgery, sepsis</div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// DELIRIUM — CAM + Prevention + Management
// ─────────────────────────────────────────────────────────

export function DeliriumReference() {
  const [cam1, setCam1] = useState(false); // Acute onset / fluctuating
  const [cam2, setCam2] = useState(false); // Inattention
  const [cam3, setCam3] = useState(false); // Disorganized thinking
  const [cam4, setCam4] = useState(false); // Altered consciousness

  // CAM positive = (1 AND 2) AND (3 OR 4)
  const camPositive = cam1 && cam2 && (cam3 || cam4);

  return (
    <div className="space-y-4">
      <h3 className="font-bold text-sm">🧠 דליריום — הערכה וניהול</h3>

      {/* CAM Tool */}
      <div className="border border-gray-200 dark:border-[#1a1a2e] rounded-xl p-3 space-y-2">
        <div className="font-bold text-sm text-purple-800 dark:text-purple-300 dark:text-purple-300">CAM — Confusion Assessment Method</div>
        <div className="space-y-2">
          {[
            { val: cam1, set: setCam1, num: "1", label: "שינוי חריף / תנודתי", desc: "האם מצב ההכרה השתנה בצורה חריפה? האם משתנה במהלך היום?" },
            { val: cam2, set: setCam2, num: "2", label: "חוסר קשב", desc: "האם המטופל מתקשה לשמור ריכוז? לספור לאחור? לעקוב אחרי שיחה?" },
            { val: cam3, set: setCam3, num: "3", label: "חשיבה מפוזרת", desc: "דיבור לא מאורגן, קפיצות בין נושאים, תשובות לא רלוונטיות" },
            { val: cam4, set: setCam4, num: "4", label: "שינוי רמת הכרה", desc: "היפראלרט, לתרגי, סטופורוזי, או קומטוזי (כל דבר שאינו Alert)" },
          ].map((item) => (
            <label key={item.num} className="flex items-start gap-2 text-sm cursor-pointer p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-[#111]">
              <input type="checkbox" checked={item.val} onChange={() => item.set(!item.val)}
                className="h-4 w-4 mt-0.5 rounded accent-purple-600 shrink-0" />
              <div>
                <span className="font-medium">{item.num}. {item.label}</span>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{item.desc}</div>
              </div>
            </label>
          ))}
        </div>
        <div className={`text-center p-3 rounded-xl font-bold ${
          camPositive ? "bg-red-100 text-red-800 dark:text-red-300 dark:bg-red-950/30 dark:text-red-300" : "bg-green-100 text-green-800 dark:text-green-300 dark:bg-green-950/30 dark:text-green-300"
        }`}>
          CAM {camPositive ? "חיובי ✓ — דליריום" : "שלילי"}
          <div className="text-xs font-normal mt-1">
            {camPositive
              ? "נדרש: (1) + (2) + (3 או 4). בצע בירור סיבתי!"
              : "חובה: קריטריונים 1+2, ולפחות 3 או 4"}
          </div>
        </div>
      </div>

      {/* Prevention — HELP protocol */}
      <div className="border border-gray-200 dark:border-[#1a1a2e] rounded-xl p-3 space-y-2">
        <div className="font-bold text-sm text-blue-800 dark:text-blue-300 dark:text-blue-300">מניעה — פרוטוקול HELP</div>
        <div className="text-xs space-y-1.5">
          <div className="bg-blue-50 dark:bg-blue-950/20 p-2 rounded-lg">🕐 <span className="font-semibold">אוריינטציה:</span> שעון, לוח שנה, תמונות משפחה, חלון. הסבר לחולה איפה הוא ומה קורה.</div>
          <div className="bg-blue-50 dark:bg-blue-950/20 p-2 rounded-lg">😴 <span className="font-semibold">שינה:</span> Melatonin 3-5mg HS. ❌ אוזניות/מסכת עיניים. הפחתת רעש/אור בלילה.</div>
          <div className="bg-blue-50 dark:bg-blue-950/20 p-2 rounded-lg">🚶 <span className="font-semibold">ניידות:</span> קום מהמיטה x3/יום. פיזיותרפיה מוקדמת. הורד קתטרים מיותרים.</div>
          <div className="bg-blue-50 dark:bg-blue-950/20 p-2 rounded-lg">👓 <span className="font-semibold">חושים:</span> ודא משקפיים + שמיעה. תאורה מספקת ביום.</div>
          <div className="bg-blue-50 dark:bg-blue-950/20 p-2 rounded-lg">💧 <span className="font-semibold">תזונה/הידרציה:</span> עודד שתייה. בדוק עצירות. תקן אלקטרוליטים.</div>
        </div>
      </div>

      {/* Workup */}
      <div className="border border-gray-200 dark:border-[#1a1a2e] rounded-xl p-3 space-y-2">
        <div className="font-bold text-sm text-orange-800 dark:text-orange-300">בירור — Think D-E-L-I-R-I-U-M-S</div>
        <div className="text-xs space-y-1 text-gray-700 dark:text-gray-300">
          <div><span className="font-bold">D</span>rugs — תרופות חדשות? BZD, אופיואידים, אנטיכולינרגיים, סטרואידים</div>
          <div><span className="font-bold">E</span>lectrolytes — Na, K, Ca, Mg, גלוקוז, כליות, כבד</div>
          <div><span className="font-bold">L</span>ack of drugs — גמילה מאלכוהול/BZD/אופיואידים?</div>
          <div><span className="font-bold">I</span>nfection — UTI, CAP, cellulitis, C.diff, COVID</div>
          <div><span className="font-bold">R</span>etention — עצירות חמורה, אצירת שתן (SCAN!)</div>
          <div><span className="font-bold">I</span>ntracranial — CVA, SDH (בעיקר אחרי נפילה!)</div>
          <div><span className="font-bold">U</span>nstable — MI, PE, hypo/hyperthyroid, hypoxia</div>
          <div><span className="font-bold">M</span>etabolic — Uremia, הפטיק, DKA, CO2</div>
          <div><span className="font-bold">S</span>ensory — כאב לא מטופל, עצירות, אצירה</div>
        </div>
      </div>

      {/* Management */}
      <div className="border border-gray-200 dark:border-[#1a1a2e] rounded-xl p-3 space-y-2">
        <div className="font-bold text-sm text-red-800 dark:text-red-300 dark:text-red-300">טיפול באגיטציה</div>
        <div className="text-xs space-y-1.5">
          <div className="bg-green-50 dark:bg-green-950/20 p-2 rounded-lg">🟢 <span className="font-semibold">קו ראשון:</span> De-escalation מילולי. הסבר רגוע. נוכחות משפחה. הורד restraints!</div>
          <div className="bg-yellow-50 dark:bg-yellow-950/20 p-2 rounded-lg">🟡 <span className="font-semibold">קו שני:</span> Haloperidol 0.5-1mg PO/IV (❌ לא בפרקינסון/DLB!)</div>
          <div className="bg-orange-50 dark:bg-orange-950/20 p-2 rounded-lg">🟠 <span className="font-semibold">אלטרנטיבה:</span> Quetiapine 12.5-25mg PO (מועדף ב-PD/DLB)</div>
          <div className="bg-red-50 dark:bg-red-950/20 p-2 rounded-lg">🔴 <span className="font-semibold">Last resort:</span> Lorazepam 0.5mg IV (רק גמילת אלכוהול/BZD!)</div>
          <div className="text-gray-500 italic mt-1">⚠ כל אנטיפסיכוטי בקשישים עם דמנציה = ↑ סיכון למוות (FDA Black Box)</div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// FALLS — Risk Assessment + Prevention
// ─────────────────────────────────────────────────────────

export function FallsReference() {
  const [history, setHistory] = useState(false);
  const [secondaryDx, setSecondaryDx] = useState(false);
  const [ambulatoryAid, setAmbulatoryAid] = useState(false);
  const [ivLine, setIvLine] = useState(false);
  const [gait, setGait] = useState<0 | 10 | 20>(0);
  const [mental, setMental] = useState<0 | 15>(0);

  // Morse Fall Scale
  const score = (history ? 25 : 0) + (secondaryDx ? 15 : 0) + (ambulatoryAid ? 15 : 0)
    + (ivLine ? 20 : 0) + gait + mental;

  const risk = score >= 45 ? { label: "סיכון גבוה", color: "bg-red-100 text-red-800 dark:text-red-300 dark:bg-red-950/30 dark:text-red-300" }
    : score >= 25 ? { label: "סיכון בינוני", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-300" }
    : { label: "סיכון נמוך", color: "bg-green-100 text-green-800 dark:text-green-300 dark:bg-green-950/30 dark:text-green-300" };

  return (
    <div className="space-y-4">
      <h3 className="font-bold text-sm">🦴 נפילות — הערכה ומניעה</h3>

      {/* Morse Fall Scale */}
      <div className="border border-gray-200 dark:border-[#1a1a2e] rounded-xl p-3 space-y-2">
        <div className="font-bold text-sm text-orange-800 dark:text-orange-300">Morse Fall Scale</div>
        <div className="space-y-2 text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={history} onChange={() => setHistory(!history)} className="h-4 w-4 rounded accent-orange-600" />
            היסטוריה של נפילה (3 חודשים אחרונים) — 25
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={secondaryDx} onChange={() => setSecondaryDx(!secondaryDx)} className="h-4 w-4 rounded accent-orange-600" />
            אבחנה משנית (≥2 אבחנות) — 15
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={ambulatoryAid} onChange={() => setAmbulatoryAid(!ambulatoryAid)} className="h-4 w-4 rounded accent-orange-600" />
            עזר הליכה (קביים/ווקר/רהיטים) — 15
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={ivLine} onChange={() => setIvLine(!ivLine)} className="h-4 w-4 rounded accent-orange-600" />
            עירוי IV / Heparin Lock — 20
          </label>
          <label className="text-xs text-gray-600 dark:text-gray-400 dark:text-gray-400">
            הליכה
            <select value={gait} onChange={(e) => setGait(Number(e.target.value) as 0|10|20)}
              className="w-full mt-0.5 px-2 py-1.5 text-sm border border-gray-300 dark:border-[#1a1a2e] rounded-lg bg-white dark:bg-[#111]">
              <option value={0}>תקינה / מרותק למיטה / כיסא גלגלים — 0</option>
              <option value={10}>חלשה — 10</option>
              <option value={20}>מוגבלת / אחיזה ברהיטים — 20</option>
            </select>
          </label>
          <label className="text-xs text-gray-600 dark:text-gray-400 dark:text-gray-400">
            מצב מנטלי
            <select value={mental} onChange={(e) => setMental(Number(e.target.value) as 0|15)}
              className="w-full mt-0.5 px-2 py-1.5 text-sm border border-gray-300 dark:border-[#1a1a2e] rounded-lg bg-white dark:bg-[#111]">
              <option value={0}>מודע למגבלות — 0</option>
              <option value={15}>שוכח / מעריך יתר את יכולותיו — 15</option>
            </select>
          </label>
        </div>
        <div className={`text-center p-3 rounded-xl font-bold ${risk.color}`}>
          Morse = {score} — {risk.label}
          <div className="text-xs font-normal mt-1">
            {score >= 45 ? "התערבות מלאה: מיטה נמוכה, אזעקה, ליווי, הערכת סביבה" :
             score >= 25 ? "התערבות בסיסית: תדרוך, נעליים מתאימות, מוט אחיזה" :
             "אמצעי זהירות סטנדרטיים"}
          </div>
        </div>
      </div>

      {/* Prevention checklist */}
      <div className="border border-gray-200 dark:border-[#1a1a2e] rounded-xl p-3 space-y-2">
        <div className="font-bold text-sm text-blue-800 dark:text-blue-300 dark:text-blue-300">מניעה — צ׳קליסט</div>
        <div className="text-xs space-y-1.5">
          <div className="bg-blue-50 dark:bg-blue-950/20 p-2 rounded-lg">🛏️ <span className="font-semibold">סביבה:</span> מיטה נמוכה, מעקות למעלה, אור לילה, רצפה יבשה, פעמון בהישג יד</div>
          <div className="bg-blue-50 dark:bg-blue-950/20 p-2 rounded-lg">👟 <span className="font-semibold">נעליים:</span> סגורות, נגד החלקה. ❌ לא גרביים בלבד!</div>
          <div className="bg-blue-50 dark:bg-blue-950/20 p-2 rounded-lg">💊 <span className="font-semibold">תרופות:</span> הפחת BZD, אופיואידים, אנטיהיסטמינים. בדוק יל"ד אורתוסטטי</div>
          <div className="bg-blue-50 dark:bg-blue-950/20 p-2 rounded-lg">👁️ <span className="font-semibold">ראייה:</span> ודא משקפיים. תאורה מספקת</div>
          <div className="bg-blue-50 dark:bg-blue-950/20 p-2 rounded-lg">🚽 <span className="font-semibold">שירותים:</span> ליווי/כיסא שירותים ליד מיטה. הגב לפעמון מהר!</div>
          <div className="bg-orange-50 dark:bg-orange-950/20 p-2 rounded-lg">📋 <span className="font-semibold">Vitamin D:</span> 800-1000 IU/d מוריד סיכון נפילה בקשישים (Cochrane)</div>
        </div>
      </div>

      {/* Post-fall protocol */}
      <div className="border border-gray-200 dark:border-[#1a1a2e] rounded-xl p-3 space-y-2">
        <div className="font-bold text-sm text-red-800 dark:text-red-300 dark:text-red-300">אחרי נפילה — פרוטוקול</div>
        <div className="text-xs space-y-1.5">
          <div className="bg-red-50 dark:bg-red-950/20 p-2 rounded-lg">1. בדיקה גופנית + vital signs + GCS</div>
          <div className="bg-red-50 dark:bg-red-950/20 p-2 rounded-lg">2. על אנטיקואגולציה? → CT ראש (SDH!)</div>
          <div className="bg-red-50 dark:bg-red-950/20 p-2 rounded-lg">3. צילום אגן + כל אזור כואב</div>
          <div className="bg-red-50 dark:bg-red-950/20 p-2 rounded-lg">4. תיעוד: מנגנון, עדים, פציעות, vital signs</div>
          <div className="bg-red-50 dark:bg-red-950/20 p-2 rounded-lg">5. בירור סיבה: יל"ד אורתוסטטי? סינקופה? מכנית?</div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// BEERS CRITERIA — Potentially Inappropriate Meds in Elderly
// ─────────────────────────────────────────────────────────

export function BeersReference() {
  const [searchText, setSearchText] = useState("");

  const BEERS_LIST = [
    { drug: "Benzodiazepines", drugHe: "בנזודיאזפינים", examples: "Lorazepam, Diazepam, Clonazepam", reason: "↑ נפילות, שברים, דליריום, תלות", alt: "Melatonin, Trazodone 25mg, היגיינת שינה" },
    { drug: "First-gen Antihistamines", drugHe: "אנטיהיסטמינים דור 1", examples: "Diphenhydramine, Promethazine, Chlorpheniramine", reason: "אנטיכולינרגי חזק → בלבול, עצירות, אצירה", alt: "Cetirizine, Loratadine" },
    { drug: "Anticholinergics", drugHe: "אנטיכולינרגיים", examples: "Oxybutynin, Tolterodine, Amitriptyline", reason: "בלבול, יובש, עצירות, אצירת שתן, QTc", alt: "Mirabegron (OAB), Duloxetine/Nortriptyline (pain)" },
    { drug: "Long-acting Sulfonylureas", drugHe: "סולפונילאוריאות ארוכות", examples: "Glibenclamide (Glyburide)", reason: "היפוגליקמיה ממושכת — מסוכן בקשישים!", alt: "Gliclazide, DPP4i, SGLT2i" },
    { drug: "NSAIDs — chronic", drugHe: "NSAIDs כרוני", examples: "Ibuprofen, Diclofenac, Naproxen", reason: "GI bleed, AKI, HTN, CHF exacerbation", alt: "Paracetamol, Topical NSAIDs, Duloxetine" },
    { drug: "PPIs > 8 weeks", drugHe: "PPI מעל 8 שבועות", examples: "Omeprazole, Pantoprazole", reason: "C.diff, שברים ירך, היפומגנזמיה, CKD", alt: "הפסק אם אין אינדיקציה. H2RA?" },
    { drug: "Metoclopramide", drugHe: "מטוקלופרמיד", examples: "Pramin, Reglan", reason: "EPS, tardive dyskinesia, פרקינסוניזם", alt: "Domperidone (בזהירות), Ondansetron" },
    { drug: "Alpha-blockers (for HTN)", drugHe: "חוסמי אלפא ליל\"ד", examples: "Doxazosin, Prazosin, Terazosin", reason: "יל\"ד אורתוסטטי → נפילות!", alt: "ACEI, ARB, CCB, Thiazide (for HTN)" },
    { drug: "Sliding scale only", drugHe: "Sliding scale בלבד", examples: "Regular insulin PRN ללא basal", reason: "ניהול סוכר גרוע, תנודות, ❌ לא מספיק", alt: "Basal-bolus regimen" },
    { drug: "Digoxin > 0.125mg", drugHe: "דיגוקסין מעל 0.125mg", examples: "Digoxin 0.25mg", reason: "רעילות! CrCl↓ = T½↑↑. יעד 0.5-0.9 ng/ml", alt: "מינון 0.0625-0.125mg. בדוק רמות + K+" },
    { drug: "Meperidine", drugHe: "מפרידין (Demerol)", examples: "Pethidine", reason: "מטבוליט נוירוטוקסי, פרכוסים", alt: "Morphine (מינון מופחת), Oxycodone" },
  ];

  const filtered = searchText.trim()
    ? BEERS_LIST.filter(b =>
        b.drug.toLowerCase().includes(searchText.toLowerCase()) ||
        b.drugHe.includes(searchText) ||
        b.examples.toLowerCase().includes(searchText.toLowerCase()) ||
        b.alt.toLowerCase().includes(searchText.toLowerCase())
      )
    : BEERS_LIST;

  return (
    <div className="space-y-3">
      <h3 className="font-bold text-sm">💊 Beers Criteria — תרופות בעייתיות בקשישים (AGS 2023)</h3>
      <input
        type="search"
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        placeholder="חפש תרופה..."
        dir="auto"
        className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-[#1a1a2e] rounded-xl bg-gray-50 dark:bg-[#111] dark:text-gray-200 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500 outline-none"
      />
      <div className="space-y-2">
        {filtered.map((b, i) => (
          <div key={i} className="border border-red-200 dark:border-red-900/30 rounded-xl p-3 space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <span className="font-bold text-sm text-red-800 dark:text-red-300 dark:text-red-300">{b.drug}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400 mr-2">{b.drugHe}</span>
              </div>
              <span className="text-[10px] bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-300 px-1.5 py-0.5 rounded-full shrink-0">PIM</span>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400" dir="ltr">{b.examples}</div>
            <div className="text-xs text-red-700 dark:text-red-400">⚠ {b.reason}</div>
            <div className="text-xs text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/20 p-1.5 rounded-lg">✅ חלופה: {b.alt}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// PRESSURE INJURY — Staging + Braden + Prevention
// ─────────────────────────────────────────────────────────

export function PressureInjuryReference() {
  return (
    <div className="space-y-4">
      <h3 className="font-bold text-sm">🛏️ פצעי לחץ — דירוג ומניעה</h3>

      {/* Staging */}
      <div className="border border-gray-200 dark:border-[#1a1a2e] rounded-xl p-3 space-y-2">
        <div className="font-bold text-sm text-purple-800 dark:text-purple-300 dark:text-purple-300">דירוג (NPUAP)</div>
        <div className="text-xs space-y-1.5">
          <div className="bg-yellow-50 dark:bg-yellow-950/20 p-2 rounded-lg"><span className="font-bold">Stage 1:</span> אודם שלא נעלם בלחיצה (non-blanchable erythema). עור שלם.</div>
          <div className="bg-orange-50 dark:bg-orange-950/20 p-2 rounded-lg"><span className="font-bold">Stage 2:</span> אובדן עור חלקי — שלפוחית / שחיקה. דרמיס חשוף. אדום/ורוד.</div>
          <div className="bg-red-50 dark:bg-red-950/20 p-2 rounded-lg"><span className="font-bold">Stage 3:</span> אובדן מלא של עובי העור. שומן תת-עורי נראה. ❌ שריר/עצם לא חשופים.</div>
          <div className="bg-red-100 dark:bg-red-950/30 p-2 rounded-lg"><span className="font-bold">Stage 4:</span> אובדן מלא — שריר, גיד, או עצם חשופים. סכנת אוסטאומיאליטיס!</div>
          <div className="bg-gray-100 dark:bg-gray-800 p-2 rounded-lg"><span className="font-bold">Unstageable:</span> כיסוי מלא ע"י eschar/slough. לא ניתן לדרג.</div>
          <div className="bg-purple-50 dark:bg-purple-950/20 p-2 rounded-lg"><span className="font-bold">DTPI:</span> Deep Tissue Pressure Injury — שינוי צבע כהה/סגול. עור שלם אבל נזק עמוק.</div>
        </div>
      </div>

      {/* Prevention */}
      <div className="border border-gray-200 dark:border-[#1a1a2e] rounded-xl p-3 space-y-2">
        <div className="font-bold text-sm text-blue-800 dark:text-blue-300 dark:text-blue-300">מניעה</div>
        <div className="text-xs space-y-1.5">
          <div className="bg-blue-50 dark:bg-blue-950/20 p-2 rounded-lg">🔄 <span className="font-semibold">הפיכות:</span> כל 2 שעות. תיעוד!</div>
          <div className="bg-blue-50 dark:bg-blue-950/20 p-2 rounded-lg">🛏️ <span className="font-semibold">מזרן:</span> מזרן הפחתת לחץ (alternating pressure / foam)</div>
          <div className="bg-blue-50 dark:bg-blue-950/20 p-2 rounded-lg">🧴 <span className="font-semibold">עור:</span> שמור יבש ונקי. קרם מגן. בדוק עקבים + סקרום + אוזניים</div>
          <div className="bg-blue-50 dark:bg-blue-950/20 p-2 rounded-lg">🍖 <span className="font-semibold">תזונה:</span> חלבון 1.25-1.5g/kg/d. Vitamin C 500mg x2. Zinc 220mg/d</div>
          <div className="bg-blue-50 dark:bg-blue-950/20 p-2 rounded-lg">🩹 <span className="font-semibold">חיכוך:</span> הרם ראש מיטה ≤30°. סדין חלק. הגנה על עקבים</div>
        </div>
      </div>

      {/* Treatment by stage */}
      <div className="border border-gray-200 dark:border-[#1a1a2e] rounded-xl p-3 space-y-2">
        <div className="font-bold text-sm text-green-800 dark:text-green-300 dark:text-green-300">טיפול לפי שלב</div>
        <div className="text-xs space-y-1.5">
          <div className="bg-green-50 dark:bg-green-950/20 p-2 rounded-lg"><span className="font-bold">Stage 1-2:</span> הסר לחץ. חבישה לחה (hydrocolloid / foam). ❌ אל תעשה debridement</div>
          <div className="bg-yellow-50 dark:bg-yellow-950/20 p-2 rounded-lg"><span className="font-bold">Stage 3-4:</span> ניקוי + debridement. חבישה לחה. שקול VAC therapy. ייעוץ פלסטיקה</div>
          <div className="bg-red-50 dark:bg-red-950/20 p-2 rounded-lg"><span className="font-bold">זיהום:</span> ABx סיסטמי רק אם cellulitis/ספסיס/אוסטאומיאליטיס. ❌ לא ABx טופיקלי שגרתי!</div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// DISCHARGE CHECKLIST — Geriatric-focused
// ─────────────────────────────────────────────────────────

export function DischargeChecklist() {
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const toggle = (key: string) => setChecks(prev => ({ ...prev, [key]: !prev[key] }));

  const ITEMS = [
    { key: "meds", icon: "💊", text: "ריקונסיליאציה תרופתית — עדכון רשימת תרופות, הפסקת תרופות מיותרות" },
    { key: "beers", icon: "⚠️", text: "בדיקת Beers — הסר/החלף PIMs שהתווספו באשפוז" },
    { key: "followup", icon: "📅", text: "תור מעקב — רופא משפחה תוך 7 ימים, מומחה אם צריך" },
    { key: "labs", icon: "🧪", text: "מעקב מעבדה — מתי לבדוק שוב (Cr, K, INR, CBC...)" },
    { key: "pt", icon: "🚶", text: "פיזיותרפיה / שיקום — הפניה לשיקום בקהילה/יום אם צריך" },
    { key: "fall_prev", icon: "🦴", text: "מניעת נפילות — Vitamin D, הערכת בית, עזרי הליכה" },
    { key: "nutrition", icon: "🍽️", text: "תזונה — הוראות דיאטה, תוספים, דיאטנית קהילתית" },
    { key: "cognitive", icon: "🧠", text: "מצב קוגניטיבי — האם יש דליריום? התייחסות לירידה תפקודית חדשה" },
    { key: "goals", icon: "🎯", text: "יעדי טיפול — שיחת GOC אם יש ירידה משמעותית. יפוי כוח?" },
    { key: "caregiver", icon: "👨‍👩‍👧", text: "הדרכת משפחה/מטפל — תרופות, סימני אזהרה, למי לפנות" },
    { key: "home", icon: "🏠", text: "תנאי בית — מדרגות? מקלחת? עזרה 24/7? סידור סיעודי?" },
    { key: "letter", icon: "📝", text: "מכתב שחרור — עם רשימת תרופות, סיכום, המלצות ברורות" },
  ];

  const doneCount = Object.values(checks).filter(Boolean).length;

  return (
    <div className="space-y-3">
      <h3 className="font-bold text-sm">🏥 צ׳קליסט שחרור — גריאטרי</h3>
      <div className={`text-center text-xs font-medium px-3 py-2 rounded-xl ${
        doneCount === ITEMS.length ? "bg-green-100 text-green-800 dark:text-green-300 dark:bg-green-950/30 dark:text-green-300" :
        doneCount > 0 ? "bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-300" :
        "bg-gray-100 text-gray-500 dark:bg-[#111] dark:text-gray-400"
      }`}>
        {doneCount}/{ITEMS.length} בוצע
      </div>
      <div className="space-y-1.5">
        {ITEMS.map((item) => (
          <label
            key={item.key}
            className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-colors ${
              checks[item.key]
                ? "bg-green-50 dark:bg-green-950/10 border-green-200 dark:border-green-900/30"
                : "bg-white dark:bg-[#111] border-gray-200 dark:border-[#1a1a2e]"
            }`}
          >
            <input
              type="checkbox"
              checked={!!checks[item.key]}
              onChange={() => toggle(item.key)}
              className="h-4 w-4 mt-0.5 rounded accent-green-600 shrink-0"
            />
            <div className={`text-xs ${checks[item.key] ? "text-green-800 dark:text-green-300 dark:text-green-300" : "text-gray-700 dark:text-gray-300"}`}>
              <span className="mr-1">{item.icon}</span> {item.text}
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// ORTHOGERIATRIC ADMISSION CHECKLIST
// Dr. Zeidan Gued (152608) · SZMC
// ─────────────────────────────────────────────────────────

interface OrthoCheckItem {
  key: string;
  icon: string;
  text: string;
  sub?: string;
}

interface OrthoSection {
  id: string;
  title: string;
  items: OrthoCheckItem[];
}

const ORTHO_SECTIONS: OrthoSection[] = [
  {
    id: "ortho",
    title: "1) אורתופדית",
    items: [
      { key: "fx_type", icon: "🦴", text: "סוג שבר" },
      { key: "surgery", icon: "🔪", text: "סוג ניתוח אם כבר בוצע" },
    ],
  },
  {
    id: "fall",
    title: "2) נפילה",
    items: [
      { key: "fall_where", icon: "📍", text: "איפה נפלת? מתי? אתה זוכר את הנפילה?" },
      { key: "fall_before", icon: "🕐", text: "מה עשית לפני הנפילה?" },
      { key: "fall_prodrome", icon: "⚡", text: "תחושה מקדימה? חוסר יציבות? סחרחורת? כאב בחזה? פלפיטציות?" },
      { key: "fall_how", icon: "🔍", text: "איך נפלת? מעדת? נתקלת במשהו על הרצפה?" },
      { key: "fall_head", icon: "🤕", text: "האם הייתה חבלת ראש? איבוד הכרה?" },
      { key: "fall_floor", icon: "⏱️", text: "כמה זמן היית על הרצפה לאחר הנפילה?" },
      { key: "fall_hx", icon: "📋", text: "נפילות בעבר? כמה? איפה? מתי האחרונה? דומות או שונות?" },
      { key: "fall_ddx", icon: "🧠", text: "חשוב: הפרעות קצב, פרקינסון, נוירופתיה, בעיית ראייה, תרופות וכו'" },
    ],
  },
  {
    id: "pain",
    title: "3) כאבים",
    items: [
      { key: "pain_level", icon: "😣", text: "רמת כאב" },
      { key: "pain_rx", icon: "💊", text: "משככי כאבים — לא לתת TRAMADOL", sub: "מתן אקמול ואופטלגין קבוע" },
      { key: "pain_severe", icon: "🩹", text: "אם כואב מאוד → מדבקת BUTRANS או TARGIN פעמיים ביום" },
      { key: "pain_prn", icon: "💉", text: "אפשר להוסיף פרקוסט 5 לפי צורך" },
    ],
  },
  {
    id: "osteo",
    title: "4) אוסטיאופורוזיס",
    items: [
      { key: "osteo_rule", icon: "⚠️", text: "שבר צוואר ירך לאחר נפילה מגובה עצמית = אוסטיאופורוזיס" },
      { key: "osteo_dx", icon: "❓", text: "האם אובחנת עם אוסטיאופורוזיס בעבר?" },
      { key: "osteo_tx_hx", icon: "📝", text: "האם קיבלת טיפול? איזה? מתי המינון האחרון?" },
      { key: "osteo_fx_tx", icon: "🎯", text: "שבר תחת טיפול מכוון → לציין בשל טיפולי, להמליץ על טיפול אחר" },
      { key: "osteo_labs", icon: "🧪", text: "מעבדה כולל אנדו לבדוק Vit D" },
      { key: "osteo_vitd", icon: "☀️", text: "Vitamin D 2000 יח' (יתכן ונוריד ל-1000 לאחר תוצאות)" },
      { key: "osteo_ca", icon: "🥛", text: "Calcium Carbonate 600mg כל יום" },
    ],
  },
  {
    id: "function",
    title: "5) תפקוד",
    items: [
      { key: "func_adl", icon: "🧑‍🦯", text: "ADLs" },
      { key: "func_mobility", icon: "🚶", text: "ניידות קודמת — אביזרי עזר?" },
      { key: "func_help", icon: "👨‍👩‍👧", text: "עזרה בבית?" },
      { key: "func_home", icon: "🏠", text: "בית באיזה קומה? מדרגות מחוץ/בתוך הבית?" },
    ],
  },
  {
    id: "constipation",
    title: "6) עצירות",
    items: [
      { key: "const_hx", icon: "🔄", text: "נטייה לעצירות? מקבל טיפול באופן קבוע?" },
      { key: "const_last", icon: "📅", text: 'מתי פ"מ אחרונה?' },
      { key: "const_xr", icon: "🩻", text: "עדות לעצירות בצילום אגן?" },
      { key: "const_tx", icon: "💊", text: "לשקול נורמלקס +/- נר" },
    ],
  },
  {
    id: "other",
    title: "7) בעיות פעילות אחרות",
    items: [
      { key: "other_issues", icon: "📝", text: "בעיות רפואיות פעילות נוספות שיש לטפל בהן" },
    ],
  },
];

export function OrthoGeriatricAdmission() {
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setChecks((prev) => ({ ...prev, [k]: !prev[k] }));

  const total = ORTHO_SECTIONS.reduce((n, s) => n + s.items.length, 0);
  const done = Object.values(checks).filter(Boolean).length;

  return (
    <div className="space-y-4">
      <h3 className="font-bold text-sm">🦴 קבלות אורתוגריאטריה</h3>
      <div className="text-[10px] text-slate-400">ד"ר זיידאן גואד (152608) · שערי צדק</div>

      <div className={`text-center text-xs font-medium px-3 py-2 rounded-xl ${
        done === total
          ? "bg-green-100 text-green-800 dark:text-green-300 dark:bg-green-950/30 dark:text-green-300"
          : done > 0
          ? "bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-300"
          : "bg-gray-100 text-gray-500 dark:bg-[#111] dark:text-gray-400"
      }`}>{done}/{total} בוצע</div>

      {ORTHO_SECTIONS.map((sec) => (
        <div key={sec.id} className="space-y-1">
          <div className="text-xs font-bold text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 pb-1">
            {sec.title}
          </div>
          {sec.items.map((item) => (
            <label
              key={item.key}
              className={`flex items-start gap-2.5 p-2 rounded-xl border cursor-pointer transition-colors ${
                checks[item.key]
                  ? "bg-green-50 dark:bg-green-950/10 border-green-200 dark:border-green-900/30"
                  : "bg-white dark:bg-[#111] border-gray-200 dark:border-[#1a1a2e]"
              }`}
            >
              <input
                type="checkbox"
                checked={!!checks[item.key]}
                onChange={() => toggle(item.key)}
                className="h-4 w-4 mt-0.5 rounded accent-green-600 shrink-0"
              />
              <div className={`text-xs ${
                checks[item.key] ? "text-green-800 dark:text-green-300 dark:text-green-300" : "text-gray-700 dark:text-gray-300"
              }`}>
                <span className="mr-1">{item.icon}</span> {item.text}
                {item.sub && <div className="text-[10px] text-slate-400 mt-0.5">{item.sub}</div>}
              </div>
            </label>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// SZMC PHONE DIRECTORY
// ─────────────────────────────────────────────────────────

interface PhoneEntry {
  name: string;
  nameHe: string;
  ext: string;
  category: "lab" | "consult" | "support";
}

const PHONE_DIR: PhoneEntry[] = [
  { name: "Micro (Blood+Sputum)", nameHe: "מיקרו (דם+ליחה)", ext: "66723", category: "lab" },
  { name: "Micro (Urine)", nameHe: "מיקרו (שתן)", ext: "66623", category: "lab" },
  { name: "Micro (Body Fluid)", nameHe: "מיקרו (תרבית נוזל גוף)", ext: "66523", category: "lab" },
  { name: "Biochemistry", nameHe: "ביוכימיה", ext: "55522/66422/55291/64121", category: "lab" },
  { name: "Hematology", nameHe: "מעבדת המוטולוגיה", ext: "55983", category: "lab" },
  { name: "Endocrine Lab", nameHe: "מעבדת אנדו", ext: "55042", category: "lab" },
  { name: "Blood Bank", nameHe: "בנק הדם", ext: "66221", category: "lab" },
  { name: "Dialysis", nameHe: "דיאליזה", ext: "55545", category: "lab" },
  { name: "CT", nameHe: "מכון CT", ext: "68724/55595/68187", category: "lab" },
  { name: "Gastro On-Call", nameHe: "תורן גסטרו", ext: "68611", category: "consult" },
  { name: "ICU On-Call", nameHe: "תורן ICU", ext: "68236", category: "consult" },
  { name: "CCU On-Call", nameHe: "תורן CCU", ext: "68339/55583", category: "consult" },
  { name: "Radiology On-Call", nameHe: "תורן רדיולוגי", ext: "68435", category: "consult" },
  { name: "Anesthesia On-Call", nameHe: "תורן מרדם", ext: "68704", category: "consult" },
  { name: "Ortho On-Call", nameHe: "תורן אורתופדיה", ext: "68482", category: "consult" },
  { name: "Surgery On-Call", nameHe: "תורן כירורגיה", ext: "68483", category: "consult" },
  { name: "Ophthalmology On-Call", nameHe: "תורן עיניים", ext: "68182", category: "consult" },
  { name: "Neurosurgery On-Call", nameHe: "תורן נוירוכירורגי", ext: "68621", category: "consult" },
  { name: "Cardiothoracic On-Call", nameHe: "תורן לב חזה", ext: "68069", category: "consult" },
  { name: "Urology On-Call", nameHe: "תורן אורולוגי", ext: "68543", category: "consult" },
  { name: "Plastic Surgery On-Call", nameHe: "תורן פלסטיקה", ext: "68165", category: "consult" },
  { name: "Emergency Admission", nameHe: "אישורי אלישע", ext: "66223", category: "support" },
];

export function PhoneDirectory() {
  const [filter, setFilter] = useState("");
  const cats = ["lab", "consult", "support"] as const;
  const catLabels: Record<string, string> = {
    lab: "🧪 מעבדות ומכונים",
    consult: "📞 תורנים / ייעוצים",
    support: "🏥 שירותים",
  };

  const filtered = filter.trim()
    ? PHONE_DIR.filter(
        (e) =>
          e.nameHe.includes(filter) ||
          e.name.toLowerCase().includes(filter.toLowerCase()) ||
          e.ext.includes(filter)
      )
    : PHONE_DIR;

  return (
    <div className="space-y-3">
      <h3 className="font-bold text-sm">📞 שלוחות שערי צדק</h3>
      <input
        type="search"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="חפש שלוחה..."
        dir="auto"
        className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-[#1a1a2e] rounded-xl bg-gray-50 dark:bg-[#111] dark:text-gray-200 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500 outline-none"
      />

      {cats.map((cat) => {
        const items = filtered.filter((e) => e.category === cat);
        if (items.length === 0) return null;
        return (
          <div key={cat}>
            <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1.5">
              {catLabels[cat]}
            </div>
            <div className="space-y-1">
              {items.map((e) => (
                <div
                  key={e.ext + e.nameHe}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-gray-200 dark:border-[#1a1a2e] bg-white dark:bg-[#111]"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">{e.nameHe}</div>
                    <div className="text-[10px] text-slate-400 truncate">{e.name}</div>
                  </div>
                  <a
                    href={`tel:*${e.ext.split("/")[0]}`}
                    className="shrink-0 text-xs font-mono font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 px-2.5 py-1.5 rounded-lg active:bg-blue-100 dark:active:bg-blue-900/50"
                    dir="ltr"
                  >
                    {e.ext}
                  </a>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// OSTEOPOROSIS TREATMENT PROTOCOL — SZMC
// ─────────────────────────────────────────────────────────

export function OsteoporosisProtocol() {
  return (
    <div className="space-y-4">
      <h3 className="font-bold text-sm">🦴 אוסטאופורוזיס — פרוטוקול טיפול</h3>
      <div className="text-[10px] text-slate-400">שערי צדק — אורתוגריאטריה</div>

      {/* General rules */}
      <div className="border border-blue-200 dark:border-blue-900/30 rounded-xl p-3 space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
        <div className="font-bold text-blue-700 dark:text-blue-300">עקרונות כלליים</div>
        <div>• הטיפול מבוסס על: תוספי ויטמין D, סידן, וטיפול מכוון לאוסטיאופורוזיס</div>
        <div>• לכל מטופל עם שבר אוסטיאופורוטי → לבדוק באשפוז: <span className="font-semibold">סידן (מתוקן לאלבומין), פוספור, ויטמין D</span></div>
        <div>• מומלץ סידן + ויטמין D לכל מטופל מעל גיל 50 (ללא קשר לאבחנה)</div>
        <div>• <span className="font-semibold">CrCl&lt;45 ml/min</span> → בדוק PTH, שלול היפרקלצמיה לפני תוספת</div>
        <div>• <span className="font-semibold">CrCl&lt;30 ml/min</span> → התייעץ נפרולוג לפני טיפול מכוון</div>
        <div className="text-red-600 dark:text-red-400">❌ היפרקלצמיה (מעל 10.5 mg/dL) → אין תוספי סידן/ויטמין D, הפנה לאנדוקרינולוג</div>
        <div>• סידן + ויטמין D — להתחיל כבר באשפוז</div>
        <div>• טיפול מכוון — להמליץ בשחרור, יינתן בקהילה</div>
      </div>

      {/* 1. Calcium + Vitamin D */}
      <div className="border border-green-200 dark:border-green-900/30 rounded-xl p-3 space-y-2">
        <div className="font-bold text-sm text-green-700 dark:text-green-300">1. תוספי סידן וויטמין D</div>

        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
          <div className="font-semibold text-red-600 dark:text-red-400">⚠️ אין לתת תרופה מכוונת אם:</div>
          <div>• סידן מתחת ל-8.5 mg/dL</div>
          <div>• ויטמין D מתחת ל-10 ng/mL (25 nmol/L)</div>
          <div>מומלץ: סידן &gt;9 mg/dL + Vit D &gt;20 ng/mL לפני טיפול מכוון</div>
          <div>• זהירות: נוטלים ביספוספונטים (אקלסטה) או פרוליה + אי-ספיקת כליות → סיכון להיפוקלצמיה</div>
        </div>

        <div className="bg-green-50 dark:bg-green-950/20 rounded-lg p-2.5 text-xs">
          <div className="font-bold text-green-800 dark:text-green-300 dark:text-green-300">סידן:</div>
          <div className="text-slate-700 dark:text-slate-300">
            Calcium Carbonate 600 מ"ג/יום + 600 מ"ג מהדיאטה (חלב, טחינה). ייעוץ דיאטנית במידת הצורך.
          </div>
        </div>

        <div className="bg-yellow-50 dark:bg-yellow-950/20 rounded-lg p-2.5 text-xs">
          <div className="font-bold text-yellow-800 dark:text-yellow-300 mb-1.5">ויטמין D — מינון לפי רמה:</div>
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr>
                <th className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 px-2 py-1.5 text-right font-semibold">ערכים</th>
                <th className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 px-2 py-1.5 text-right font-semibold">טיפול מומלץ</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-yellow-200 dark:border-yellow-800/30">
                <td className="px-2 py-1.5 font-semibold">&lt;20 ng/mL</td>
                <td className="px-2 py-1.5">
                  <div>העמסה 50,000 יח' לפני שחרור</div>
                  <div>המשך 2000 יח'/יום (או 14,000/שבוע)</div>
                </td>
              </tr>
              <tr className="border-t border-yellow-200 dark:border-yellow-800/30 bg-yellow-50/50 dark:bg-yellow-950/10">
                <td className="px-2 py-1.5 font-semibold">20-30 ng/mL</td>
                <td className="px-2 py-1.5">2000 יח'/יום (או 14,000/שבוע)</td>
              </tr>
              <tr className="border-t border-yellow-200 dark:border-yellow-800/30">
                <td className="px-2 py-1.5 font-semibold">&gt;30 ng/mL</td>
                <td className="px-2 py-1.5">1000 יח'/יום (או 7000/שבוע)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. Directed Treatment */}
      <div className="border border-purple-200 dark:border-purple-900/30 rounded-xl p-3 space-y-2">
        <div className="font-bold text-sm text-purple-700 dark:text-purple-300">2. טיפול מכוון לאוסטיאופורוזיס</div>

        <div className="bg-purple-50 dark:bg-purple-950/20 rounded-lg p-2.5 text-xs space-y-1.5">
          <div className="font-bold text-purple-800 dark:text-purple-300 dark:text-purple-300">שבר צוואר ירך:</div>
          <div className="text-slate-700 dark:text-slate-300 space-y-1">
            <div>• <span className="font-semibold">קו ראשון:</span> Zolendronic Acid (<span className="font-semibold">Aclasta</span>)</div>
            <div>• <span className="font-semibold">קו שני:</span> Denosumab (<span className="font-semibold">Prolia</span>)</div>
            <div>• <span className="font-semibold">קו שלישי:</span> Teriparatide (<span className="font-semibold">Forteo</span>) — במקרים:</div>
            <div className="pr-4 text-[11px] space-y-0.5">
              <div>- לא יכולים לקבל Aclasta או Prolia</div>
              <div>- שבר קרה על טיפול אחר</div>
              <div>- טיפול כרוני בסטרואידים</div>
            </div>
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-800/30 rounded-lg p-2.5 text-xs space-y-1">
          <div className="font-bold text-slate-700 dark:text-slate-300">שבר אוסטיאופורוטי אחר (לא צוואר ירך):</div>
          <div className="text-slate-600 dark:text-slate-400">
            <div>• נאיבי → ביספוספונטים פומיים</div>
            <div>• כבר על טיפול מכוון → להתייעץ</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// UNIFIED ELECTROLYTES HUB — all electrolyte protocols in one place
// ─────────────────────────────────────────────────────────

import { HyponatremiaProtocol, HyperkalemiaProtocol, HypercalcemiaProtocol, HypernatremiaProtocol, HypermagnesemiaProtocol } from "./OnCallProtocols";

const LYTE_TABS = [
  { key: "k",   icon: "🔋", label: "K+" },
  { key: "na",  icon: "🧂", label: "Na" },
  { key: "mg",  icon: "🧲", label: "Mg" },
  { key: "ca",  icon: "🦴", label: "Ca" },
  { key: "po4", icon: "⚡", label: "PO4" },
];

function KSection() {
  return (
    <div className="space-y-3">
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-3 space-y-2">
        <div className="font-bold text-sm text-purple-800 dark:text-purple-300">היפוקלמיה — תיקון</div>
        <div className="text-xs space-y-1.5">
          <div className="bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded-lg"><span className="font-semibold">K+ 3.0–3.4:</span> KCl 40mEq PO x2-3/d</div>
          <div className="bg-orange-50 dark:bg-orange-900/20 p-2 rounded-lg"><span className="font-semibold">K+ 2.5–2.9:</span> KCl 10mEq/h IV + PO (max 20mEq/h peripheral)</div>
          <div className="bg-red-50 dark:bg-red-900/20 p-2 rounded-lg"><span className="font-semibold">K+ &lt;2.5 / ECG∆:</span> KCl 20mEq/h IV + MgSO4 2g IV</div>
          <div className="text-gray-600 dark:text-gray-400 italic">💡 תמיד בדוק Mg — היפומגנזמיה = K+ לא מתתקן!</div>
        </div>
      </div>
      <HyperkalemiaProtocol />
    </div>
  );
}

function NaSection() {
  return (
    <div className="space-y-3">
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-3 space-y-2">
        <div className="font-bold text-sm text-indigo-800 dark:text-indigo-300">היפונתרמיה — תיקון מהיר</div>
        <div className="text-xs space-y-1.5">
          <div className="bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded-lg"><span className="font-semibold">Na 125–130 א-סימפטומטי:</span> הגבלת נוזלים 1-1.5L/d + בדוק SIADH</div>
          <div className="bg-orange-50 dark:bg-orange-900/20 p-2 rounded-lg"><span className="font-semibold">Na 120–125 סימפטומטי:</span> NaCl 0.9% IV + Furosemide אם SIADH</div>
          <div className="bg-red-50 dark:bg-red-900/20 p-2 rounded-lg"><span className="font-semibold">Na &lt;120 / seizures:</span> NaCl 3% 100ml IV over 10min (x3 max)</div>
          <div className="text-red-700 dark:text-red-400 font-semibold text-xs">🔴 מקסימום תיקון: 8 mEq/L / 24h! (סכנת ODS)</div>
        </div>
      </div>
      <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
        <div className="font-bold text-xs text-gray-600 dark:text-gray-400 uppercase mb-2">היפרנתרמיה</div>
        <HypernatremiaProtocol />
      </div>
    </div>
  );
}

function MgSection() {
  return (
    <div className="space-y-3">
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-3 space-y-2">
        <div className="font-bold text-sm text-blue-800 dark:text-blue-300">היפומגנזמיה — תיקון</div>
        <div className="text-xs space-y-1.5">
          <div className="bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded-lg"><span className="font-semibold">Mg 1.2–1.6:</span> MgO 400mg PO x2/d</div>
          <div className="bg-orange-50 dark:bg-orange-900/20 p-2 rounded-lg"><span className="font-semibold">Mg &lt;1.2 / סימפטומטי:</span> MgSO4 2g IV over 1h → 4-6g over 24h</div>
          <div className="text-gray-600 dark:text-gray-400 italic">💡 חיוני לתיקון היפוקלמיה והיפוקלצמיה</div>
        </div>
      </div>
      <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
        <div className="font-bold text-xs text-gray-600 dark:text-gray-400 uppercase mb-2">היפרמגנסמיה</div>
        <HypermagnesemiaProtocol />
      </div>
    </div>
  );
}

function CaSection() {
  return (
    <div className="space-y-3">
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-3 space-y-2">
        <div className="font-bold text-sm text-green-800 dark:text-green-300">היפוקלצמיה — תיקון</div>
        <div className="text-xs space-y-1.5">
          <div className="bg-gray-50 dark:bg-gray-800/60 p-2 rounded-lg"><span className="font-semibold">תיקון לאלבומין:</span> Ca_corrected = Ca + 0.8 × (4.0 − Albumin)</div>
          <div className="bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded-lg"><span className="font-semibold">קל:</span> CaCO3 500mg PO x3/d + Vitamin D</div>
          <div className="bg-red-50 dark:bg-red-900/20 p-2 rounded-lg"><span className="font-semibold">חמור / סימפטומטי:</span> Ca Gluconate 10% 10-20ml IV over 10min → gtt</div>
          <div className="text-gray-600 dark:text-gray-400 italic">💡 אם גם היפומגנזמיה — תקן Mg קודם!</div>
        </div>
      </div>
      <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
        <div className="font-bold text-xs text-gray-600 dark:text-gray-400 uppercase mb-2">היפרקלצמיה</div>
        <HypercalcemiaProtocol />
      </div>
    </div>
  );
}

function PO4Section() {
  return (
    <div className="space-y-3">
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-3 space-y-2">
        <div className="font-bold text-sm text-amber-800 dark:text-amber-300">היפופוספטמיה — תיקון</div>
        <div className="text-xs space-y-1.5">
          <div className="bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded-lg"><span className="font-semibold">PO4 1.5–2.5:</span> Phospho-Soda 5ml PO x2-3/d</div>
          <div className="bg-red-50 dark:bg-red-900/20 p-2 rounded-lg"><span className="font-semibold">PO4 &lt;1.5:</span> KPhos/NaPhos 15-30mmol IV over 6h</div>
          <div className="text-gray-600 dark:text-gray-400 italic">💡 שכיח ב-refeeding, DKA, ספסיס. עלול לגרום חולשת שרירים ואי"ן נשימתית</div>
        </div>
      </div>
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-3 space-y-2">
        <div className="font-bold text-sm text-amber-800 dark:text-amber-300">היפרפוספטמיה</div>
        <div className="text-xs space-y-1.5">
          <div className="bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded-lg"><span className="font-semibold">גורמים:</span> AKI/CKD, Rhabdomyolysis, Hypoparathyroidism</div>
          <div className="bg-slate-50 dark:bg-slate-800/60 p-2 rounded-lg"><span className="font-semibold">טיפול:</span> Phosphate binders (Calcium carbonate AC), תיקון AKI, דיאטה</div>
          <div className="text-gray-600 dark:text-gray-400 italic">💡 Hyperphosphatemia + Hypocalcemia = AKI עד הוכחת אחרת</div>
        </div>
      </div>
    </div>
  );
}

export function UnifiedElectrolytesHub() {
  const [activeTab, setActiveTab] = useState<string>("k");
  return (
    <div className="space-y-3" dir="rtl">
      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800/60 rounded-xl p-1">
        {LYTE_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              activeTab === tab.key
                ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-sm"
                : "text-slate-500 dark:text-slate-400"
            }`}
          >
            <div>{tab.icon}</div>
            <div className="text-[10px] mt-0.5">{tab.label}</div>
          </button>
        ))}
      </div>
      {/* Content */}
      {activeTab === "k"   && <KSection />}
      {activeTab === "na"  && <NaSection />}
      {activeTab === "mg"  && <MgSection />}
      {activeTab === "ca"  && <CaSection />}
      {activeTab === "po4" && <PO4Section />}
    </div>
  );
}

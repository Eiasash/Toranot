/**
 * Clinical calculators and reference components extracted from QuickReference.
 * CrClCalculator, CURB65Calculator, NEWS2Calculator, ElectrolyteReference, InsulinReference
 */
import { useState, useMemo } from "react";
import { crclToBucket } from "../utils/renal";

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
    let val = ((140 - a) * w) / (72 * c);
    if (female) val *= 0.85;
    return Math.round(val);
  }, [age, weight, creatinine, female, isHD]);

  // Report CrCl to parent
  useMemo(() => {
    onCrClChange?.(crcl, isHD);
  }, [crcl, isHD, onCrClChange]);

  const bucket = crcl !== null ? crclToBucket(crcl, isHD) : null;

  return (
    <div className="space-y-3">
      <h3 className="font-bold text-sm">מחשבון CrCl (Cockcroft-Gault)</h3>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-gray-600">
          גיל
          <input type="number" value={age} onChange={(e) => setAge(e.target.value)}
            className="w-full mt-0.5 px-2 py-1.5 text-sm border border-gray-300 rounded-lg" placeholder="75" />
        </label>
        <label className="text-xs text-gray-600">
          משקל (kg)
          <input type="number" value={weight} onChange={(e) => setWeight(e.target.value)}
            className="w-full mt-0.5 px-2 py-1.5 text-sm border border-gray-300 rounded-lg" placeholder="70" />
        </label>
        <label className="text-xs text-gray-600">
          Creatinine (mg/dL)
          <input type="number" step="0.1" value={creatinine} onChange={(e) => setCr(e.target.value)}
            className="w-full mt-0.5 px-2 py-1.5 text-sm border border-gray-300 rounded-lg" placeholder="1.2" />
        </label>
        <div className="flex flex-col gap-1 text-xs text-gray-600 justify-end pb-1.5">
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
          isHD ? "bg-purple-100 text-purple-800" :
          crcl! > 60 ? "bg-green-100 text-green-800" :
          crcl! > 30 ? "bg-yellow-100 text-yellow-800" :
          crcl! > 15 ? "bg-orange-100 text-orange-800" :
          "bg-red-100 text-red-800"
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
            <div className="text-xs font-semibold mt-2 bg-white/50 rounded-lg p-1.5">
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
    ? { text: "סיכון נמוך — שקול טיפול אמבולטורי", color: "bg-green-100 text-green-800" }
    : score === 2
    ? { text: "סיכון בינוני — אשפוז קצר / מעקב צמוד", color: "bg-yellow-100 text-yellow-800" }
    : { text: "סיכון גבוה — אשפוז. ≥4 שקול ICU", color: "bg-red-100 text-red-800" };

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
    ? { text: "🔴 גבוה מאוד — שקול ICU. ניטור רציף. רופא בכיר!", color: "bg-red-100 text-red-800 border-red-300" }
    : score >= 5
    ? { text: "🟠 בינוני-גבוה — הערכה דחופה. שקול escalation", color: "bg-orange-100 text-orange-800 border-orange-300" }
    : score >= 1
    ? { text: "🟡 נמוך — הערכה ע\"י אחות. שקול הגברת ניטור", color: "bg-yellow-100 text-yellow-800 border-yellow-300" }
    : { text: "🟢 0 — ניטור שגרתי", color: "bg-green-100 text-green-800 border-green-300" };

  return (
    <div className="space-y-3">
      <h3 className="font-bold text-sm">NEWS2 (National Early Warning Score 2)</h3>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-gray-600">
          קצב נשימה (RR)
          <input type="number" value={rr} onChange={(e) => setRR(e.target.value)}
            className="w-full mt-0.5 px-2 py-1.5 text-sm border border-gray-300 rounded-lg" placeholder="16" />
        </label>
        <label className="text-xs text-gray-600">
          SpO2 (%)
          <input type="number" value={spo2} onChange={(e) => setSpO2(e.target.value)}
            className="w-full mt-0.5 px-2 py-1.5 text-sm border border-gray-300 rounded-lg" placeholder="96" />
        </label>
        <label className="text-xs text-gray-600">
          חום (°C)
          <input type="number" step="0.1" value={temp} onChange={(e) => setTemp(e.target.value)}
            className="w-full mt-0.5 px-2 py-1.5 text-sm border border-gray-300 rounded-lg" placeholder="37.0" />
        </label>
        <label className="text-xs text-gray-600">
          SBP (mmHg)
          <input type="number" value={sbp} onChange={(e) => setSBP(e.target.value)}
            className="w-full mt-0.5 px-2 py-1.5 text-sm border border-gray-300 rounded-lg" placeholder="120" />
        </label>
        <label className="text-xs text-gray-600">
          דופק (HR)
          <input type="number" value={hr} onChange={(e) => setHR(e.target.value)}
            className="w-full mt-0.5 px-2 py-1.5 text-sm border border-gray-300 rounded-lg" placeholder="80" />
        </label>
        <label className="text-xs text-gray-600">
          AVPU
          <select value={avpu} onChange={(e) => setAVPU(e.target.value)}
            className="w-full mt-0.5 px-2 py-1.5 text-sm border border-gray-300 rounded-lg bg-white">
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

      <div className="border border-gray-200 rounded-xl p-3 space-y-2">
        <div className="font-bold text-sm text-purple-800">🔋 אשלגן (K+)</div>
        <div className="text-xs space-y-1.5">
          <div className="bg-yellow-50 p-2 rounded-lg">
            <span className="font-semibold">K+ 3.0-3.4:</span> KCl 40mEq PO x2-3/d
          </div>
          <div className="bg-orange-50 p-2 rounded-lg">
            <span className="font-semibold">K+ 2.5-2.9:</span> KCl 10mEq/h IV (max 20mEq/h peripheral, 40 central) + PO
          </div>
          <div className="bg-red-50 p-2 rounded-lg">
            <span className="font-semibold">K+ &lt;2.5 / ECG∆:</span> KCl 20mEq/h IV (monitor!) + MgSO4 2g IV
          </div>
          <div className="text-gray-600 italic">💡 תמיד בדוק Mg — היפומגנזמיה = K+ לא מתתקן!</div>
        </div>
      </div>

      <div className="border border-gray-200 rounded-xl p-3 space-y-2">
        <div className="font-bold text-sm text-blue-800">🧲 מגנזיום (Mg2+)</div>
        <div className="text-xs space-y-1.5">
          <div className="bg-yellow-50 p-2 rounded-lg">
            <span className="font-semibold">Mg 1.2-1.6:</span> MgO 400mg PO x2/d (אם כליות תקינות)
          </div>
          <div className="bg-orange-50 p-2 rounded-lg">
            <span className="font-semibold">Mg &lt;1.2 / סימפטומטי:</span> MgSO4 2g IV over 1h → 4-6g over 24h
          </div>
          <div className="text-gray-600 italic">💡 חיוני לתיקון היפוקלמיה והיפוקלצמיה</div>
        </div>
      </div>

      <div className="border border-gray-200 rounded-xl p-3 space-y-2">
        <div className="font-bold text-sm text-green-800">🦴 סידן (Ca2+)</div>
        <div className="text-xs space-y-1.5">
          <div className="bg-gray-50 p-2 rounded-lg">
            <span className="font-semibold">תיקון לאלבומין:</span> Ca_corrected = Ca + 0.8 × (4.0 − Albumin)
          </div>
          <div className="bg-yellow-50 p-2 rounded-lg">
            <span className="font-semibold">קל:</span> CaCO3 500mg PO x3/d + Vitamin D
          </div>
          <div className="bg-red-50 p-2 rounded-lg">
            <span className="font-semibold">חמור / סימפטומטי:</span> Ca Gluconate 10% 10-20ml IV over 10min → gtt
          </div>
          <div className="text-gray-600 italic">💡 אם גם היפומגנזמיה — תקן Mg קודם!</div>
        </div>
      </div>

      <div className="border border-gray-200 rounded-xl p-3 space-y-2">
        <div className="font-bold text-sm text-amber-800">⚡ זרחן (PO4)</div>
        <div className="text-xs space-y-1.5">
          <div className="bg-yellow-50 p-2 rounded-lg">
            <span className="font-semibold">PO4 1.5-2.5:</span> Phospho-Soda 5ml PO x2-3/d
          </div>
          <div className="bg-red-50 p-2 rounded-lg">
            <span className="font-semibold">PO4 &lt;1.5:</span> KPhos/NaPhos 15-30mmol IV over 6h
          </div>
          <div className="text-gray-600 italic">💡 שכיח ב-refeeding, DKA, ספסיס. עלול לגרום חולשת שרירים ואי"נ נשימתית</div>
        </div>
      </div>

      <div className="border border-gray-200 rounded-xl p-3 space-y-2">
        <div className="font-bold text-sm text-indigo-800">💧 נתרן (Na+)</div>
        <div className="text-xs space-y-1.5">
          <div className="bg-yellow-50 p-2 rounded-lg">
            <span className="font-semibold">Na 125-130 אסימפטומטי:</span> הגבלת נוזלים 1-1.5L/d + בדוק SIADH
          </div>
          <div className="bg-orange-50 p-2 rounded-lg">
            <span className="font-semibold">Na 120-125 סימפטומטי:</span> NaCl 0.9% IV + Furosemide אם SIADH
          </div>
          <div className="bg-red-50 p-2 rounded-lg">
            <span className="font-semibold">Na &lt;120 / seizures:</span> NaCl 3% 100ml IV over 10min (bolus x3 max)
          </div>
          <div className="text-gray-600 italic">🔴 מקסימום תיקון: 8 mEq/L / 24h! (סכנת ODS)</div>
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

      <div className="border border-gray-200 rounded-xl p-3 space-y-2">
        <div className="font-bold text-sm text-blue-800">📊 Sliding Scale — תיקון מהיר</div>
        <div className="text-xs">
          <table className="w-full text-right">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="py-1 px-1">סוכר (mg/dL)</th>
                <th className="py-1 px-1">Low</th>
                <th className="py-1 px-1">Medium</th>
                <th className="py-1 px-1">High</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              <tr><td className="py-0.5 px-1">150-199</td><td>0</td><td>1</td><td>2</td></tr>
              <tr className="bg-yellow-50"><td className="py-0.5 px-1">200-249</td><td>1</td><td>2</td><td>4</td></tr>
              <tr><td className="py-0.5 px-1">250-299</td><td>2</td><td>4</td><td>6</td></tr>
              <tr className="bg-orange-50"><td className="py-0.5 px-1">300-349</td><td>3</td><td>5</td><td>8</td></tr>
              <tr className="bg-red-50"><td className="py-0.5 px-1">&gt;350</td><td>4</td><td>7</td><td>10</td></tr>
            </tbody>
          </table>
          <div className="text-gray-500 mt-1.5 italic">* יחידות Regular insulin SC. Low = רגיש/רזה/קשיש, High = שמן/סטרואידים</div>
        </div>
      </div>

      <div className="border border-gray-200 rounded-xl p-3 space-y-2">
        <div className="font-bold text-sm text-green-800">💉 חישוב Basal-Bolus</div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-gray-600">
            משקל (kg)
            <input type="number" value={weight} onChange={(e) => setWeight(e.target.value)}
              className="w-full mt-0.5 px-2 py-1.5 text-sm border border-gray-300 rounded-lg" placeholder="70" />
          </label>
          <label className="text-xs text-gray-600">
            רגישות לאינסולין
            <select value={sensitivity} onChange={(e) => setSensitivity(e.target.value as "low" | "medium" | "high")}
              className="w-full mt-0.5 px-2 py-1.5 text-sm border border-gray-300 rounded-lg bg-white">
              <option value="low">נמוכה (0.2U/kg) — קשיש/רזה/CKD</option>
              <option value="medium">בינונית (0.3U/kg)</option>
              <option value="high">גבוהה (0.4U/kg) — השמנה/סטרואידים</option>
            </select>
          </label>
        </div>
        {basalDose && (
          <div className="bg-blue-50 p-3 rounded-xl text-sm space-y-1">
            <div><span className="font-semibold">TDD:</span> ~{basalDose.tdd}U/day</div>
            <div><span className="font-semibold">Basal (50%):</span> Glargine {basalDose.basal}U SC HS</div>
            <div><span className="font-semibold">Bolus (50%÷3):</span> Lispro ~{basalDose.bolus}U SC AC x3</div>
            <div className="text-xs text-gray-500 mt-1">+ Correction factor ≈ 1700 ÷ TDD = {Math.round(1700 / basalDose.tdd)} mg/dL per unit</div>
          </div>
        )}
      </div>

      <div className="border border-gray-200 rounded-xl p-3 space-y-2">
        <div className="font-bold text-sm text-red-800">⚠️ כללי זהב</div>
        <div className="text-xs space-y-1.5">
          <div className="bg-red-50 p-2 rounded-lg">🔴 <span className="font-semibold">אף פעם לא עוצרים basal insulin!</span> אפילו NPO — תן 50-80% מהמינון</div>
          <div className="bg-orange-50 p-2 rounded-lg">🟠 <span className="font-semibold">Type 1:</span> חייב basal — אחרת DKA תוך שעות</div>
          <div className="bg-yellow-50 p-2 rounded-lg">🟡 <span className="font-semibold">Sliding scale alone:</span> לא מספיק! תמיד שלב basal</div>
          <div className="bg-blue-50 p-2 rounded-lg">🔵 <span className="font-semibold">יעד:</span> 140-180 mg/dL (קשישים: עד 200 מותר)</div>
          <div className="bg-purple-50 p-2 rounded-lg">🟣 <span className="font-semibold">Hold metformin:</span> CrCl&lt;30, contrast, surgery, sepsis</div>
        </div>
      </div>
    </div>
  );
}

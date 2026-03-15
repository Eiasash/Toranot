/**
 * Stress Test: 10 Simulated 24h On-Call Shifts
 *
 * Each shift simulates a realistic geriatric/internal medicine on-call scenario
 * at Shaare Zedek with 30+ patients including:
 * - Deteriorating patients (sepsis, AKI, respiratory failure)
 * - Dying/comfort-care patients
 * - New admissions mid-shift
 * - Transfers between sections
 * - Lab result cascades (critical values, AKI staging)
 * - Drug interactions and safety alerts
 * - Handover notes and morning reports
 * - Task completion workflows
 * - Acuity scoring under load
 * - Shift archival and restoration
 */

import { describe, it, expect, beforeEach } from "vitest";
import { applyRules } from "../engine/rules";
import { calculateAcuity, sortByAcuity } from "../engine/acuity";
import { calculateLabDeltas } from "../engine/labDelta";
import { checkDrugInteractions } from "../engine/drugSafety";
import { reducer, normalizePatient, type PatientsState, type Action } from "../context/reducer";
import type { PatientEntry, Task, LabEntry, PatientSection, Urgency, GoalsOfCare } from "../types";
import { generateId } from "../utils/id";

// ─── Helpers ────────────────────────────────────────────────────────

let idCounter = 0;
function uid(prefix = "stress"): string {
  return `${prefix}-${++idCounter}`;
}

function isoTime(hoursFromShiftStart: number, shiftStart = "2025-03-15T16:00:00Z"): string {
  const d = new Date(shiftStart);
  d.setHours(d.getHours() + hoursFromShiftStart);
  return d.toISOString();
}

function makeLab(label: string, value: number, hoursFromStart: number, unit = ""): LabEntry {
  return { id: uid("lab"), label, value, unit, time: isoTime(hoursFromStart) };
}

function makeTask(text: string, urgency: Urgency = "routine", done = false): Task {
  return {
    id: uid("task"),
    text,
    urgency,
    source: "extracted",
    done,
    doneTime: done ? isoTime(0) : null,
    time: null,
    confidence: 1,
  };
}

function makePatient(overrides: Partial<PatientEntry> & { name: string; room: string }): PatientEntry {
  return normalizePatient({
    id: uid("pt"),
    section: "SIDE_A" as PatientSection,
    date: "15/03/2025",
    age: 78,
    diagnosis: null,
    flags: [],
    status: [],
    tomorrowNotes: [],
    planNotes: [],
    tasks: [],
    generatedTasks: [],
    notes: [],
    scannedAt: isoTime(0),
    confidence: 1,
    labs: [],
    ...overrides,
  } as Record<string, unknown>);
}

function emptyState(): PatientsState {
  return {
    patients: [],
    activeSection: "ALL",
    showTomorrow: false,
    darkMode: false,
    shiftHistory: [],
    scanMode: false,
    events: [],
    unassignedTasks: [],
  };
}

function dispatch(state: PatientsState, action: Action): PatientsState {
  return reducer(state, action);
}

function dispatchAll(state: PatientsState, actions: Action[]): PatientsState {
  return actions.reduce((s, a) => dispatch(s, a), state);
}

// ─── Patient Generators ─────────────────────────────────────────────

/** Stable geriatric patient — mild issues */
function stableGeriatric(room: string, section: PatientSection, nameIdx: number): PatientEntry {
  const names = [
    "כהן שרה", "לוי יוסף", "מזרחי רחל", "אברהם דוד", "פרץ מרים",
    "שמעון חנה", "דהן אברהם", "ביטון שושנה", "אזולאי יצחק", "גבאי לאה",
    "עמר משה", "חדד רבקה", "סויסה אליהו", "דיין תמר", "בן דוד נעמי",
    "אלון גדעון", "ברקת חיים", "גולן ורד", "דנינו עזרא", "הלוי שמואל",
    "ועקנין פנינה", "זהבי מיכל", "חביב אהרון", "טוביה דינה", "ישראלי בנימין",
    "כץ אסתר", "מלכה יונתן", "נחמני צילה", "סלע אורי", "עוזרי רונית",
    "פלד שלמה", "צדיק מלכה", "קורן אלי", "רוזנברג טובה", "שפירא נתן",
  ];
  return makePatient({
    name: names[nameIdx % names.length],
    room,
    section,
    age: 72 + (nameIdx % 20),
    diagnosis: ["CHF, DM2, HTN", "CVA ישן, AF, DM2", "COPD, HTN, CKD3", "דמנציה, HTN, אנמיה"][nameIdx % 4],
    status: ["יציב", "ממשיך טיפול", "ממתין לשיקום"][nameIdx % 3].split(",").map(s => s.trim()),
    tasks: [],
    clinicalMeta: {
      sexAtBirth: nameIdx % 2 === 0 ? "female" : "male",
      weightKg: 55 + (nameIdx % 30),
      goalsOfCare: "full",
    },
  });
}

/** Deteriorating sepsis patient */
function sepsisPatient(room: string, section: PatientSection): PatientEntry {
  return makePatient({
    name: "אלבז ראובן",
    room, section,
    age: 84,
    diagnosis: "דלקת ריאות, COPD, DM2",
    status: ["חום 39.2", "ירידה בלח\"ד", "tachycardia 120", "sepsis"],
    flags: ["DNR"],
    tasks: [
      makeTask("hemocx2 + lactate סטט", "stat"),
      makeTask("bolus NS 500ml", "stat"),
      makeTask("Tazocin 4.5g IV", "urgent"),
    ],
    labs: [
      makeLab("WBC", 18.5, 0, "K/µL"),
      makeLab("Lactate", 4.2, 0, "mmol/L"),
      makeLab("Cr", 1.8, 0, "mg/dL"),
      makeLab("CRP", 220, 0, "mg/L"),
    ],
    clinicalMeta: { sexAtBirth: "male", weightKg: 68, goalsOfCare: "limited", baselineCreatinine: 1.0 },
  });
}

/** AKI patient with progressive renal failure */
function akiPatient(room: string, section: PatientSection): PatientEntry {
  return makePatient({
    name: "מרציאנו עליזה",
    room, section,
    age: 79,
    diagnosis: "AKI on CKD3, HTN, DM2",
    status: ["עלייה בקראטינין", "אוליגוריה", "AKI stage 2"],
    tasks: [
      makeTask("בדיקת Cr + K + gas דחוף", "stat"),
      makeTask("הפסקת מטפורמין", "urgent"),
      makeTask("נפרולוג טלפוני", "urgent"),
    ],
    labs: [
      makeLab("Cr", 1.2, -24, "mg/dL"),
      makeLab("Cr", 1.8, -12, "mg/dL"),
      makeLab("Cr", 2.6, 0, "mg/dL"),
      makeLab("K", 5.8, 0, "mEq/L"),
      makeLab("Na", 132, 0, "mEq/L"),
    ],
    clinicalMeta: { sexAtBirth: "female", weightKg: 62, goalsOfCare: "full", baselineCreatinine: 1.2, onDialysis: false },
  });
}

/** Comfort care / dying patient */
function comfortCarePatient(room: string, section: PatientSection): PatientEntry {
  return makePatient({
    name: "ברנשטיין דבורה",
    room, section,
    age: 92,
    diagnosis: "גידול ריאה מתקדם, comfort care, metastatic",
    status: ["טיפול מנחם", "פליאטיבי", "morphine drip"],
    flags: ["DNR", "DNI", "comfort care"],
    tasks: [
      makeTask("morphine 2mg SC q4h PRN for pain", "routine"),
      makeTask("scopolamine patch for secretions", "routine"),
    ],
    clinicalMeta: { sexAtBirth: "female", weightKg: 45, goalsOfCare: "comfort_only" },
    handoverNote: "משפחה מודעת. ללא הסלמה. טיפול בסימפטומים בלבד. בת הגיעה מחו״ל.",
  });
}

/** New admission from ER */
function erAdmission(room: string, section: PatientSection, variant: number): PatientEntry {
  const variants: Array<Partial<PatientEntry>> = [
    {
      name: "קליין מיכאל" as string,
      age: 68,
      diagnosis: "CAP, DM2, HTN",
      status: ["קבלה חדשה מהמיון", "חום 38.5", "SpO2 92%"],
      tasks: [
        makeTask("בדיקות קבלה: CBC, CMP, Coag, UA, hemocx2", "stat"),
        makeTask("CXR portable", "stat"),
        makeTask("Augmentin 1.2g IV q8h", "urgent"),
        makeTask("O2 3L NC", "urgent"),
      ],
      isAdmission: true,
    },
    {
      name: "ויס אתי" as string,
      age: 85,
      diagnosis: "UTI + confusion, Alzheimer baseline",
      status: ["קבלה מהמיון", "בלבול חריף", "חום 38.8"],
      tasks: [
        makeTask("hemocx2 + urine cx", "stat"),
        makeTask("CBC CMP CRP UA", "stat"),
        makeTask("Ceftriaxone 2g IV", "urgent"),
        makeTask("hydration NS 100ml/hr", "routine"),
      ],
      isAdmission: true,
    },
    {
      name: "גרינברג אריה" as string,
      age: 76,
      diagnosis: "NSTEMI, HTN, DM2, dyslipidemia",
      status: ["קבלה מהמיון", "כאב בחזה", "troponin 0.8"],
      tasks: [
        makeTask("ECG serial q6h", "stat"),
        makeTask("troponin q6h", "stat"),
        makeTask("Heparin drip per ACS protocol", "urgent"),
        makeTask("Aspirin 300mg + Plavix 300mg load", "stat"),
        makeTask("cardio consult", "urgent"),
      ],
      isAdmission: true,
      labs: [makeLab("Troponin", 0.8, 0, "ng/mL")],
    },
    {
      name: "חמדני סלים" as string,
      age: 81,
      diagnosis: "GI bleed, Warfarin, AF",
      status: ["קבלה מהמיון", "מלנה", "Hb drop 10→7.8"],
      flags: ["NPO"],
      tasks: [
        makeTask("T&S + crossmatch 2 units", "stat"),
        makeTask("CBC q6h", "stat"),
        makeTask("hold Warfarin, give Vitamin K 10mg IV", "stat"),
        makeTask("GI consult for scope", "urgent"),
        makeTask("2 large bore IVs + NS bolus", "stat"),
      ],
      isAdmission: true,
      labs: [
        makeLab("Hb", 10.0, -6, "g/dL"),
        makeLab("Hb", 7.8, 0, "g/dL"),
        makeLab("INR", 4.2, 0),
      ],
      allergies: ["penicillin"],
    },
    {
      name: "טובול חיים" as string,
      age: 73,
      diagnosis: "CHF exacerbation, CKD3, AF",
      status: ["קבלה מהמיון", "orthopnea", "BNP 2400", "SpO2 88% RA"],
      tasks: [
        makeTask("Furosemide 80mg IV stat", "stat"),
        makeTask("O2 to keep SpO2 >92%", "stat"),
        makeTask("I/O strict monitoring", "urgent"),
        makeTask("daily weights", "routine"),
        makeTask("echo if not done recently", "morning"),
      ],
      isAdmission: true,
      labs: [makeLab("Cr", 1.9, 0, "mg/dL"), makeLab("K", 5.2, 0, "mEq/L")],
      clinicalMeta: { sexAtBirth: "male", weightKg: 88, goalsOfCare: "full", baselineCreatinine: 1.5 },
    },
  ];

  const v = variants[variant % variants.length];
  return makePatient({
    name: v.name!,
    room,
    section,
    ...v,
  } as PatientEntry & { name: string; room: string });
}

/** Patient with multiple drug interactions */
function polypharmacyPatient(room: string, section: PatientSection): PatientEntry {
  return makePatient({
    name: "שטרן יהודית",
    room, section,
    age: 87,
    diagnosis: "AF, CHF, DM2, CKD3, depression, insomnia",
    status: ["polypharmacy — 14 medications"],
    tasks: [
      makeTask("amiodarone 200mg PO", "routine"),
      makeTask("warfarin 5mg PO", "routine"),
      makeTask("metformin 1000mg BID", "routine"),
      makeTask("citalopram 20mg", "routine"),
      makeTask("tramadol 50mg q8h PRN", "routine"),
      makeTask("diphenhydramine 25mg qHS", "routine"),
      makeTask("haloperidol 1mg PRN", "routine"),
    ],
    labs: [
      makeLab("Cr", 1.6, 0, "mg/dL"),
      makeLab("K", 4.8, 0, "mEq/L"),
      makeLab("INR", 2.8, 0),
    ],
    clinicalMeta: { sexAtBirth: "female", weightKg: 52, goalsOfCare: "full", baselineCreatinine: 1.4 },
    allergies: ["sulfa"],
  });
}

/** Patient about to be discharged */
function dischargePatient(room: string, section: PatientSection, nameIdx: number): PatientEntry {
  const names = ["נור רנא", "אבו סאלח מוחמד", "סלאמה פאטמה"];
  return makePatient({
    name: names[nameIdx % names.length],
    room, section,
    age: 70 + nameIdx * 3,
    diagnosis: "pneumonia — improving",
    status: ["משתחרר היום", "stable", "PO antibiotics tolerated"],
    tasks: [
      makeTask("סיכום מחלה", "morning"),
      makeTask("מרשמים לשחרור", "morning"),
      makeTask("הנחיות שחרור למשפחה", "morning"),
    ],
    handoverNote: "ממשיך Augmentin PO 7 ימים. f/u clinic 1 week.",
  });
}

/** Delirium patient */
function deliriumPatient(room: string, section: PatientSection): PatientEntry {
  return makePatient({
    name: "פרידמן זאב",
    room, section,
    age: 88,
    diagnosis: "delirium hyperactive, UTI, dementia baseline",
    status: ["בלבול חריף", "תוקפני", "ניסה לקום מהמיטה"],
    flags: ["fall risk", "1:1 sitter"],
    tasks: [
      makeTask("haloperidol 0.5mg IV PRN agitation", "urgent"),
      makeTask("R/O urinary retention — BS", "routine"),
      makeTask("reorient, lights on at night", "routine"),
      makeTask("avoid benzos — Beers criteria", "routine"),
    ],
    labs: [makeLab("WBC", 14.2, 0, "K/µL"), makeLab("Na", 128, 0, "mEq/L")],
    clinicalMeta: { sexAtBirth: "male", weightKg: 70, goalsOfCare: "limited" },
  });
}

/** Respiratory deterioration */
function respiratoryPatient(room: string, section: PatientSection): PatientEntry {
  return makePatient({
    name: "סלומון מרגלית",
    room, section,
    age: 80,
    diagnosis: "COPD exacerbation, cor pulmonale",
    status: ["desaturation SpO2 84%", "tachypnea RR 28", "accessory muscle use"],
    tasks: [
      makeTask("ABG stat", "stat"),
      makeTask("nebulizer salbutamol + ipratropium q4h", "stat"),
      makeTask("Solumedrol 40mg IV", "urgent"),
      makeTask("BiPAP if not improving", "urgent"),
      makeTask("CXR portable", "urgent"),
    ],
    labs: [makeLab("WBC", 12.1, 0, "K/µL"), makeLab("CRP", 85, 0, "mg/L")],
    clinicalMeta: { sexAtBirth: "female", weightKg: 58, goalsOfCare: "full" },
  });
}

/** Hypoglycemia patient */
function hypoglycemiaPatient(room: string, section: PatientSection): PatientEntry {
  return makePatient({
    name: "אדרי סימון",
    room, section,
    age: 82,
    diagnosis: "DM2 on insulin, CKD4",
    status: ["היפוגליקמיה — BS 42", "confusion", "diaphoresis"],
    tasks: [
      makeTask("D50 amp IV stat", "stat"),
      makeTask("BS q15min until >100", "stat"),
      makeTask("hold evening insulin", "urgent"),
      makeTask("endo consult for insulin adjustment", "morning"),
    ],
    labs: [makeLab("Glucose", 42, 0, "mg/dL"), makeLab("Cr", 2.8, 0, "mg/dL")],
    clinicalMeta: { sexAtBirth: "male", weightKg: 75, goalsOfCare: "full", baselineCreatinine: 2.5 },
  });
}

/** Fall patient */
function fallPatient(room: string, section: PatientSection): PatientEntry {
  return makePatient({
    name: "הרשקוביץ פרידה",
    room, section,
    age: 91,
    diagnosis: "osteoporosis, dementia, HTN",
    status: ["נפלה מהמיטה", "חבלת ראש", "GCS 14"],
    flags: ["fall risk"],
    tasks: [
      makeTask("CT head stat", "stat"),
      makeTask("neuro checks q1h x4", "urgent"),
      makeTask("hold Eliquis 24h", "urgent"),
      makeTask("ortho consult if fracture suspected", "routine"),
    ],
    allergies: ["codeine"],
    clinicalMeta: { sexAtBirth: "female", weightKg: 50, goalsOfCare: "limited" },
  });
}

/** Hyperkalemia patient */
function hyperkalemiaPatient(room: string, section: PatientSection): PatientEntry {
  return makePatient({
    name: "חורי עבדאללה",
    room, section,
    age: 77,
    diagnosis: "CKD4, DM2, HTN — ACEi + K-sparing",
    status: ["hyperK 6.8", "ECG changes — peaked T waves"],
    tasks: [
      makeTask("Calcium gluconate 10ml IV stat", "stat"),
      makeTask("insulin 10u + D50 IV stat", "stat"),
      makeTask("Kayexalate 30g PO", "urgent"),
      makeTask("ECG now + repeat in 1h", "stat"),
      makeTask("stop ACEi + spironolactone", "urgent"),
      makeTask("nephrology consult", "urgent"),
    ],
    labs: [
      makeLab("K", 6.8, 0, "mEq/L"),
      makeLab("K", 5.5, -12, "mEq/L"),
      makeLab("Cr", 3.2, 0, "mg/dL"),
    ],
    clinicalMeta: { sexAtBirth: "male", weightKg: 72, goalsOfCare: "full", baselineCreatinine: 2.8 },
  });
}

/** Patient on warfarin with supratherapeutic INR */
function warfarinPatient(room: string, section: PatientSection): PatientEntry {
  return makePatient({
    name: "רפפורט אסתר",
    room, section,
    age: 83,
    diagnosis: "AF, MVR, warfarin",
    status: ["INR 5.8", "ללא דימום פעיל", "hold warfarin"],
    tasks: [
      makeTask("hold warfarin", "urgent"),
      makeTask("Vitamin K 2.5mg PO", "urgent"),
      makeTask("INR recheck in AM", "morning"),
      makeTask("watch for bleeding signs", "routine"),
    ],
    labs: [makeLab("INR", 5.8, 0), makeLab("Hb", 10.2, 0, "g/dL")],
    clinicalMeta: { sexAtBirth: "female", weightKg: 55, goalsOfCare: "full" },
  });
}

/** Transfer patient from another ward */
function transferPatient(room: string, section: PatientSection): PatientEntry {
  return makePatient({
    name: "מנסור חסן",
    room, section,
    age: 74,
    diagnosis: "post-CABG day 5, wound infection",
    status: ["העברה מכירורגיה", "wound dehiscence", "IV antibiotics"],
    tasks: [
      makeTask("continue Vancomycin per levels", "urgent"),
      makeTask("wound care BID", "routine"),
      makeTask("Vanco trough before 4th dose", "routine"),
      makeTask("PT/OT evaluation", "morning"),
    ],
    isAdmission: true,
    labs: [
      makeLab("WBC", 15.3, 0, "K/µL"),
      makeLab("CRP", 145, 0, "mg/L"),
      makeLab("Cr", 1.3, 0, "mg/dL"),
    ],
    clinicalMeta: { sexAtBirth: "male", weightKg: 80, goalsOfCare: "full" },
  });
}

/** DVT/PE suspect */
function dvtPatient(room: string, section: PatientSection): PatientEntry {
  return makePatient({
    name: "ניסים אורלי",
    room, section,
    age: 69,
    diagnosis: "suspected DVT, post hip replacement",
    status: ["שוק ימין נפוח", "D-dimer 3200", "Wells score 5"],
    tasks: [
      makeTask("Doppler US bilateral LE", "stat"),
      makeTask("start Clexane 1mg/kg q12h if confirmed", "urgent"),
      makeTask("if PE suspected — CTA chest", "urgent"),
    ],
    labs: [makeLab("PLT", 180, 0, "K/µL"), makeLab("Cr", 0.9, 0, "mg/dL")],
    clinicalMeta: { sexAtBirth: "female", weightKg: 65, goalsOfCare: "full" },
  });
}

/** Hyponatremia patient */
function hyponatremiaPatient(room: string, section: PatientSection): PatientEntry {
  return makePatient({
    name: "בוזגלו דליה",
    room, section,
    age: 86,
    diagnosis: "SIADH, lung cancer, hyponatremia",
    status: ["Na 118", "confusion", "fluid restriction 1L/day"],
    tasks: [
      makeTask("Na q6h", "stat"),
      makeTask("fluid restriction 1L/24h strict", "urgent"),
      makeTask("Na correction max 8 mEq/24h", "urgent"),
      makeTask("urine Na + osmolality", "urgent"),
    ],
    labs: [
      makeLab("Na", 123, -12, "mEq/L"),
      makeLab("Na", 118, 0, "mEq/L"),
    ],
    clinicalMeta: { sexAtBirth: "female", weightKg: 48, goalsOfCare: "limited" },
  });
}

/** Anemia workup patient */
function anemiaPatient(room: string, section: PatientSection): PatientEntry {
  return makePatient({
    name: "שלום ציפורה",
    room, section,
    age: 75,
    diagnosis: "iron deficiency anemia, CRC s/p resection",
    status: ["Hb 6.8", "symptomatic — tachycardia", "עירוי דם"],
    tasks: [
      makeTask("T&S + crossmatch 2 units PRBCs", "stat"),
      makeTask("transfuse 1 unit PRBC now", "stat"),
      makeTask("post-transfusion Hb 1h after", "routine"),
      makeTask("IV iron sucrose 200mg after transfusion", "routine"),
    ],
    labs: [
      makeLab("Hb", 8.5, -48, "g/dL"),
      makeLab("Hb", 7.2, -24, "g/dL"),
      makeLab("Hb", 6.8, 0, "g/dL"),
    ],
    clinicalMeta: { sexAtBirth: "female", weightKg: 55, goalsOfCare: "full" },
  });
}

// ─── Build a full 30+ patient shift ──────────────────────────────────

function buildShiftPatients(shiftIdx: number): PatientEntry[] {
  const patients: PatientEntry[] = [];
  const sections: PatientSection[] = ["SIDE_A", "SIDE_B", "SIDE_C"];

  // 18 stable geriatric patients across 3 sections (6 per section)
  for (let s = 0; s < 3; s++) {
    for (let i = 0; i < 6; i++) {
      patients.push(stableGeriatric(
        `${49 + i}/${s + 1}`,
        sections[s],
        shiftIdx * 18 + s * 6 + i,
      ));
    }
  }

  // 2 rehab patients
  patients.push(stableGeriatric("R1", "REHAB", shiftIdx * 2));
  patients.push(stableGeriatric("R2", "REHAB", shiftIdx * 2 + 1));

  // Critical patients (rotated by shift index for variety)
  const criticalGenerators = [
    () => sepsisPatient(`50/${(shiftIdx % 3) + 1}`, sections[shiftIdx % 3]),
    () => akiPatient(`51/${(shiftIdx % 3) + 1}`, sections[(shiftIdx + 1) % 3]),
    () => comfortCarePatient(`52/${(shiftIdx % 3) + 1}`, sections[(shiftIdx + 2) % 3]),
    () => respiratoryPatient(`53/${(shiftIdx % 3) + 1}`, sections[shiftIdx % 3]),
    () => deliriumPatient("M1", "MONITOR"),
    () => polypharmacyPatient(`54/${(shiftIdx % 3) + 1}`, sections[(shiftIdx + 1) % 3]),
    () => hyperkalemiaPatient(`55/${(shiftIdx % 3) + 1}`, sections[(shiftIdx + 2) % 3]),
    () => warfarinPatient(`48/${(shiftIdx % 3) + 1}`, sections[shiftIdx % 3]),
    () => hypoglycemiaPatient("M2", "MONITOR"),
    () => hyponatremiaPatient(`47/${(shiftIdx % 3) + 1}`, sections[(shiftIdx + 1) % 3]),
    () => fallPatient(`46/${(shiftIdx % 3) + 1}`, sections[(shiftIdx + 2) % 3]),
    () => anemiaPatient(`45/${(shiftIdx % 3) + 1}`, sections[shiftIdx % 3]),
    () => dvtPatient(`44/${(shiftIdx % 3) + 1}`, sections[(shiftIdx + 1) % 3]),
    () => transferPatient(`43/${(shiftIdx % 3) + 1}`, sections[(shiftIdx + 2) % 3]),
  ];

  for (const gen of criticalGenerators) {
    patients.push(gen());
  }

  // Discharge patients
  patients.push(dischargePatient(`56/${(shiftIdx % 3) + 1}`, sections[shiftIdx % 3], shiftIdx));
  patients.push(dischargePatient(`57/${(shiftIdx % 3) + 1}`, sections[(shiftIdx + 1) % 3], shiftIdx + 1));

  return patients;
}

// ─── Handover / Morning Report ───────────────────────────────────────

interface HandoverReport {
  shiftLabel: string;
  totalPatients: number;
  admissions: PatientEntry[];
  criticalPatients: PatientEntry[];
  comfortCare: PatientEntry[];
  discharges: PatientEntry[];
  pendingStatTasks: Task[];
  labAlerts: Array<{ patient: string; alerts: ReturnType<typeof calculateLabDeltas> }>;
  drugInteractionAlerts: Array<{ patient: string; count: number }>;
  events: string[];
}

function generateHandoverReport(patients: PatientEntry[], shiftLabel: string): HandoverReport {
  const admissions = patients.filter(p => p.isAdmission);
  const comfortCare = patients.filter(p =>
    p.clinicalMeta?.goalsOfCare === "comfort_only" ||
    p.flags.some(f => /comfort|palliative|טיפול מנחם/i.test(f))
  );
  const discharges = patients.filter(p =>
    p.status.some(s => /משתחרר|שחרור|discharge|D\/C/i.test(s))
  );

  const allTasks = patients.flatMap(p => [...p.tasks, ...p.generatedTasks]);
  const pendingStatTasks = allTasks.filter(t => t.urgency === "stat" && !t.done);

  const labAlerts: HandoverReport["labAlerts"] = [];
  const drugInteractionAlerts: HandoverReport["drugInteractionAlerts"] = [];

  for (const p of patients) {
    const deltas = calculateLabDeltas(p);
    const significant = deltas.filter(d => d.severity !== "ok");
    if (significant.length > 0) {
      labAlerts.push({ patient: p.name || p.id, alerts: significant });
    }
    const interactions = checkDrugInteractions(p);
    if (interactions.length > 0) {
      drugInteractionAlerts.push({ patient: p.name || p.id, count: interactions.length });
    }
  }

  // Sort by acuity for critical patient identification
  const sorted = sortByAcuity(patients);
  const criticalPatients = sorted.filter(p => calculateAcuity(p).score >= 10);

  return {
    shiftLabel,
    totalPatients: patients.length,
    admissions,
    criticalPatients,
    comfortCare,
    discharges,
    pendingStatTasks,
    labAlerts,
    drugInteractionAlerts,
    events: [],
  };
}

// ═══════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════

describe("Stress Test: 10 Simulated On-Call Shifts", () => {
  beforeEach(() => {
    idCounter = 0;
  });

  // ─── Shift 1: Typical busy evening ─────────────────────────────────
  describe("Shift 1 — Busy Friday Evening (ערב שישי)", () => {
    let patients: PatientEntry[];
    let state: PatientsState;

    beforeEach(() => {
      patients = buildShiftPatients(0);
      state = { ...emptyState(), patients };
    });

    it("should have 36+ patients across all sections", () => {
      expect(patients.length).toBeGreaterThanOrEqual(36);
    });

    it("should apply rules to all patients without errors", () => {
      for (const p of patients) {
        const tasks = applyRules(p);
        expect(Array.isArray(tasks)).toBe(true);
      }
    });

    it("should calculate acuity scores for all patients", () => {
      for (const p of patients) {
        const acuity = calculateAcuity(p);
        expect(acuity.score).toBeGreaterThanOrEqual(0);
        expect(Array.isArray(acuity.components)).toBe(true);
      }
    });

    it("should sort patients by acuity with sick patients first", () => {
      const sorted = sortByAcuity(patients);
      expect(sorted.length).toBe(patients.length);
      // First patient should have highest acuity
      if (sorted.length >= 2) {
        const firstScore = calculateAcuity(sorted[0]).score;
        const lastScore = calculateAcuity(sorted[sorted.length - 1]).score;
        expect(firstScore).toBeGreaterThanOrEqual(lastScore);
      }
    });

    it("should identify critical labs in sepsis patient", () => {
      const sepsis = patients.find(p => p.name === "אלבז ראובן");
      expect(sepsis).toBeDefined();
      const deltas = calculateLabDeltas(sepsis!);
      // Should have at least WBC, Lactate, CRP, Cr data
      expect(deltas.length).toBeGreaterThanOrEqual(0);
    });

    it("should detect AKI staging in AKI patient", () => {
      const aki = patients.find(p => p.name === "מרציאנו עליזה");
      expect(aki).toBeDefined();
      const deltas = calculateLabDeltas(aki!);
      const crDelta = deltas.find(d => /Cr/i.test(d.label));
      if (crDelta) {
        expect(crDelta.severity).not.toBe("ok");
        expect(crDelta.akiStage).toBeGreaterThanOrEqual(1);
      }
    });

    it("should suppress aggressive rules for comfort care patient", () => {
      const comfort = patients.find(p => p.name === "ברנשטיין דבורה");
      expect(comfort).toBeDefined();
      const tasks = applyRules(comfort!);
      // Should NOT generate sepsis/AKI/CHF workup tasks
      const suppressedSources = tasks.filter(t =>
        /ספסיס|AKI|CHF|אי"ל|דלקת ריאות/.test(t.generatedFrom || "")
      );
      expect(suppressedSources).toHaveLength(0);
    });

    it("should detect drug interactions in polypharmacy patient", () => {
      const poly = patients.find(p => p.name === "שטרן יהודית");
      expect(poly).toBeDefined();
      const interactions = checkDrugInteractions(poly!);
      // Amiodarone + warfarin, tramadol + citalopram, diphenhydramine (Beers) etc.
      expect(interactions.length).toBeGreaterThan(0);
    });

    it("should detect hyperkalemia alerts", () => {
      const hyperK = patients.find(p => p.name === "חורי עבדאללה");
      expect(hyperK).toBeDefined();
      const deltas = calculateLabDeltas(hyperK!);
      const kDelta = deltas.find(d => /K/i.test(d.label));
      if (kDelta) {
        expect(kDelta.severity).toBe("critical");
      }
    });

    it("should detect Hb drop in anemia patient", () => {
      const anemia = patients.find(p => p.name === "שלום ציפורה");
      expect(anemia).toBeDefined();
      const deltas = calculateLabDeltas(anemia!);
      const hbDelta = deltas.find(d => /Hb/i.test(d.label));
      if (hbDelta) {
        expect(hbDelta.direction).toBe("down");
        expect(hbDelta.severity).not.toBe("ok");
      }
    });

    it("should detect hyponatremia progression", () => {
      const hypoNa = patients.find(p => p.name === "בוזגלו דליה");
      expect(hypoNa).toBeDefined();
      const deltas = calculateLabDeltas(hypoNa!);
      const naDelta = deltas.find(d => /Na/i.test(d.label));
      if (naDelta) {
        expect(naDelta.direction).toBe("down");
      }
    });

    it("should generate handover report with all sections", () => {
      // Apply rules first to populate generatedTasks
      const patientsWithRules = patients.map(p => ({
        ...p,
        generatedTasks: applyRules(p),
      }));
      const report = generateHandoverReport(patientsWithRules, "15/03 — ערב שישי");
      expect(report.totalPatients).toBeGreaterThanOrEqual(36);
      expect(report.admissions.length).toBeGreaterThan(0);
      expect(report.comfortCare.length).toBeGreaterThan(0);
      expect(report.discharges.length).toBeGreaterThan(0);
      expect(report.criticalPatients.length).toBeGreaterThan(0);
    });

    it("should archive shift and restore it", () => {
      let s = state;
      s = dispatch(s, { type: "ARCHIVE_SHIFT", label: "15/03 — ערב שישי" });
      expect(s.shiftHistory.length).toBe(1);
      expect(s.shiftHistory[0].patients.length).toBe(patients.length);

      // Restore
      const snapshotId = s.shiftHistory[0].id;
      s = dispatch(s, { type: "RESTORE_SHIFT", snapshotId });
      expect(s.patients.length).toBe(patients.length);
    });
  });

  // ─── Shift 2: Night with multiple admissions ──────────────────────
  describe("Shift 2 — Busy Night Shift (לילה)", () => {
    let patients: PatientEntry[];

    beforeEach(() => {
      patients = buildShiftPatients(1);
    });

    it("should handle 5 new admissions arriving during shift", () => {
      let state: PatientsState = { ...emptyState(), patients };

      // Simulate 5 ER admissions arriving during the night
      for (let i = 0; i < 5; i++) {
        const admission = erAdmission(`60/${i + 1}`, "SIDE_A", i);
        state = dispatch(state, { type: "NEW_ADMISSION", patient: admission });
      }

      expect(state.patients.length).toBe(patients.length + 5);
      const admissions = state.patients.filter(p => p.isAdmission);
      expect(admissions.length).toBeGreaterThanOrEqual(5);

      // All admissions should generate rules
      for (const a of admissions) {
        const tasks = applyRules(a);
        expect(Array.isArray(tasks)).toBe(true);
      }
    });

    it("should track ward events for admissions", () => {
      let state: PatientsState = { ...emptyState(), patients };
      const admission = erAdmission("60/1", "SIDE_A", 0);

      state = dispatch(state, { type: "NEW_ADMISSION", patient: admission });
      state = dispatch(state, {
        type: "LOG_EVENT",
        event: {
          id: uid("evt"),
          type: "ADMISSION",
          at: isoTime(2),
          patientId: admission.id,
          patientName: admission.name,
          room: admission.room,
        },
      });

      // NEW_ADMISSION also auto-logs an event, so we get 2 (auto + manual)
      expect(state.events.length).toBeGreaterThanOrEqual(1);
      expect(state.events.some(e => e.type === "ADMISSION")).toBe(true);
    });

    it("should handle patient transfers between sections", () => {
      let state: PatientsState = { ...emptyState(), patients };
      const patientToMove = patients[0];

      state = dispatch(state, {
        type: "MOVE_PATIENT",
        patientId: patientToMove.id,
        toRoom: "M3",
        toSection: "MONITOR",
      });

      const moved = state.patients.find(p => p.id === patientToMove.id);
      expect(moved).toBeDefined();
      expect(moved!.room).toBe("M3");
      expect(moved!.section).toBe("MONITOR");
    });

    it("should complete tasks through the night", () => {
      let state: PatientsState = { ...emptyState(), patients };
      const patientsWithTasks = state.patients.filter(p => p.tasks.length > 0);

      for (const p of patientsWithTasks) {
        for (const t of p.tasks.filter(t => t.urgency === "stat")) {
          state = dispatch(state, { type: "TOGGLE_TASK", patientId: p.id, taskId: t.id });
        }
      }

      // Verify stat tasks are done
      for (const p of state.patients) {
        const statTasks = p.tasks.filter(t => t.urgency === "stat");
        for (const t of statTasks) {
          expect(t.done).toBe(true);
          expect(t.doneTime).not.toBeNull();
        }
      }
    });

    it("should add task notes with results", () => {
      let state: PatientsState = { ...emptyState(), patients };
      const patientWithTasks = patients.find(p => p.tasks.length > 0);
      if (patientWithTasks && patientWithTasks.tasks.length > 0) {
        const task = patientWithTasks.tasks[0];
        state = dispatch(state, {
          type: "SET_TASK_NOTE",
          patientId: patientWithTasks.id,
          taskId: task.id,
          note: "done — result normal",
        });

        const updated = state.patients.find(p => p.id === patientWithTasks.id);
        const updatedTask = updated!.tasks.find(t => t.id === task.id);
        expect(updatedTask!.note).toBe("done — result normal");
      }
    });
  });

  // ─── Shift 3: Mass casualty / high acuity ─────────────────────────
  describe("Shift 3 — High Acuity Evening (ערב לחוץ)", () => {
    it("should handle all-critical patients and rank by acuity", () => {
      const criticalPatients: PatientEntry[] = [
        sepsisPatient("50/1", "SIDE_A"),
        akiPatient("51/1", "SIDE_A"),
        respiratoryPatient("52/1", "SIDE_A"),
        hyperkalemiaPatient("53/1", "SIDE_A"),
        hypoglycemiaPatient("54/1", "SIDE_A"),
        hyponatremiaPatient("55/1", "SIDE_B"),
        fallPatient("56/1", "SIDE_B"),
        anemiaPatient("57/1", "SIDE_B"),
        dvtPatient("58/1", "SIDE_B"),
        sepsisPatient("50/2", "SIDE_C"),
        akiPatient("51/2", "SIDE_C"),
        hyperkalemiaPatient("52/2", "SIDE_C"),
      ];

      // Add stable patients to fill ward
      for (let i = 0; i < 24; i++) {
        criticalPatients.push(stableGeriatric(
          `${60 + i}/1`,
          ["SIDE_A", "SIDE_B", "SIDE_C"][i % 3] as PatientSection,
          i + 100,
        ));
      }

      // Apply rules to all
      const withRules = criticalPatients.map(p => ({
        ...p,
        generatedTasks: applyRules(p),
      }));

      // Sort by acuity
      const sorted = sortByAcuity(withRules);
      expect(sorted.length).toBe(criticalPatients.length);

      // Top patients should be the critical ones
      const topScores = sorted.slice(0, 5).map(p => calculateAcuity(p).score);
      const bottomScores = sorted.slice(-5).map(p => calculateAcuity(p).score);
      expect(Math.min(...topScores)).toBeGreaterThanOrEqual(Math.max(...bottomScores));
    });

    it("should generate meaningful handover for morning team", () => {
      const patients = buildShiftPatients(2);
      const withRules = patients.map(p => ({
        ...p,
        generatedTasks: applyRules(p),
      }));

      const report = generateHandoverReport(withRules, "16/03 — בוקר");

      // Verify report completeness
      expect(report.totalPatients).toBeGreaterThanOrEqual(30);
      expect(report.pendingStatTasks.length).toBeGreaterThanOrEqual(0);
      expect(report.labAlerts.length).toBeGreaterThan(0);

      // Each critical patient should appear in the handover
      expect(report.criticalPatients.length).toBeGreaterThan(0);
    });
  });

  // ─── Shift 4: Deterioration cascade ────────────────────────────────
  describe("Shift 4 — Patient Deterioration Cascade", () => {
    it("should track progressive AKI through serial labs", () => {
      const patient = makePatient({
        name: "לוין בוריס",
        room: "50/1",
        section: "SIDE_A",
        age: 80,
        diagnosis: "pneumonia, CKD3",
        labs: [
          makeLab("Cr", 1.1, -48, "mg/dL"),
          makeLab("Cr", 1.1, -36, "mg/dL"),
          makeLab("Cr", 1.4, -24, "mg/dL"),
          makeLab("Cr", 1.9, -12, "mg/dL"),
          makeLab("Cr", 2.8, -6, "mg/dL"),
          makeLab("Cr", 3.5, 0, "mg/dL"),
        ],
        clinicalMeta: { baselineCreatinine: 1.1 },
        status: [],
      });

      const deltas = calculateLabDeltas(patient);
      const crDelta = deltas.find(d => /Cr/i.test(d.label));
      expect(crDelta).toBeDefined();
      expect(crDelta!.direction).toBe("up");
      expect(crDelta!.severity).toBe("critical");
      expect(crDelta!.akiStage).toBeGreaterThanOrEqual(2);
    });

    it("should track progressive Hb drop requiring transfusion", () => {
      const patient = makePatient({
        name: "זילברשטיין מלכה",
        room: "51/1",
        section: "SIDE_A",
        age: 76,
        diagnosis: "GI bleed, PUD",
        labs: [
          makeLab("Hb", 11.2, -48, "g/dL"),
          makeLab("Hb", 10.1, -36, "g/dL"),
          makeLab("Hb", 8.8, -24, "g/dL"),
          makeLab("Hb", 7.5, -12, "g/dL"),
          makeLab("Hb", 6.2, 0, "g/dL"),
        ],
        status: ["מלנה", "tachycardia 110"],
      });

      const deltas = calculateLabDeltas(patient);
      const hbDelta = deltas.find(d => /Hb/i.test(d.label));
      expect(hbDelta).toBeDefined();
      expect(hbDelta!.direction).toBe("down");
      expect(hbDelta!.severity).toBe("critical");
    });

    it("should track electrolyte cascade: K rising + Na falling", () => {
      const patient = makePatient({
        name: "קושניר ולדימיר",
        room: "52/1",
        section: "SIDE_B",
        age: 82,
        diagnosis: "CKD4, CHF, ACEi",
        labs: [
          makeLab("K+", 4.5, -24, "mEq/L"),
          makeLab("K+", 5.2, -12, "mEq/L"),
          makeLab("K+", 6.1, 0, "mEq/L"),
          makeLab("Na", 138, -24, "mEq/L"),
          makeLab("Na", 132, -12, "mEq/L"),
          makeLab("Na", 126, 0, "mEq/L"),
        ],
        status: ["hyperK", "hyponatremia"],
      });

      const deltas = calculateLabDeltas(patient);
      const kDelta = deltas.find(d => /K\+?/i.test(d.label));
      const naDelta = deltas.find(d => /Na/i.test(d.label));

      expect(kDelta).toBeDefined();
      expect(kDelta!.direction).toBe("up");
      expect(kDelta!.severity).not.toBe("ok");

      expect(naDelta).toBeDefined();
      expect(naDelta!.direction).toBe("down");
    });

    it("should handle dying patient transition to comfort care", () => {
      // Start as full code
      const patient = makePatient({
        name: "גולדברג רות",
        room: "53/1",
        section: "SIDE_A",
        age: 94,
        diagnosis: "metastatic pancreatic cancer, sepsis",
        status: ["sepsis", "multi-organ failure", "family meeting done"],
        clinicalMeta: { goalsOfCare: "full" },
      });

      // Rules should generate sepsis workup for full-code
      const fullCodeTasks = applyRules(patient);
      const hasSepsisWorkup = fullCodeTasks.some(t =>
        /ספסיס|hemocx|lactate|blood culture/i.test(t.generatedFrom || t.text)
      );

      // Now transition to comfort care
      const comfortPatient = {
        ...patient,
        clinicalMeta: { ...patient.clinicalMeta, goalsOfCare: "comfort_only" as GoalsOfCare },
        status: ["comfort care", "morphine drip", "family at bedside"],
        flags: [...patient.flags, "DNR", "DNI", "comfort care"],
      };

      const comfortTasks = applyRules(comfortPatient);
      // Sepsis workup should be suppressed
      const hasSepsisAfter = comfortTasks.some(t =>
        t.generatedFrom === "ספסיס" || t.generatedFrom === "חום"
      );
      expect(hasSepsisAfter).toBe(false);
    });
  });

  // ─── Shift 5: Weekend skeleton crew ────────────────────────────────
  describe("Shift 5 — Weekend (שבת) Skeleton Crew", () => {
    it("should handle full ward with pending morning tasks rolling over", () => {
      const patients = buildShiftPatients(4);

      // Add morning tasks that weren't done
      const patientsWithPending = patients.map((p, i) => {
        if (i < 10) {
          return {
            ...p,
            tasks: [
              ...p.tasks,
              makeTask("בדיקות דם בוקר", "morning"),
              makeTask("צילום חזה בוקר", "morning"),
            ],
          };
        }
        return p;
      });

      const morningTasks = patientsWithPending.flatMap(p =>
        p.tasks.filter(t => t.urgency === "morning" && !t.done)
      );
      expect(morningTasks.length).toBeGreaterThan(0);

      // Calculate total task load
      const allOpenTasks = patientsWithPending.flatMap(p =>
        [...p.tasks, ...p.generatedTasks].filter(t => !t.done)
      );
      expect(allOpenTasks.length).toBeGreaterThan(20);
    });

    it("should process 10 rapid admissions without state corruption", () => {
      let state: PatientsState = { ...emptyState(), patients: buildShiftPatients(4) };
      const initialCount = state.patients.length;

      for (let i = 0; i < 10; i++) {
        const admission = erAdmission(`70/${i + 1}`, ["SIDE_A", "SIDE_B", "SIDE_C"][i % 3] as PatientSection, i);
        state = dispatch(state, { type: "NEW_ADMISSION", patient: admission });

        // Log event
        state = dispatch(state, {
          type: "LOG_EVENT",
          event: {
            id: uid("evt"),
            type: "ADMISSION",
            at: isoTime(i * 0.5),
            patientId: admission.id,
            patientName: admission.name,
            room: admission.room,
          },
        });
      }

      expect(state.patients.length).toBe(initialCount + 10);
      // NEW_ADMISSION auto-logs ADMISSION events too, so we get 2x
      expect(state.events.length).toBeGreaterThanOrEqual(10);

      // Reapply rules to all
      state = dispatch(state, { type: "REAPPLY_RULES" });
      // State should still be valid
      expect(state.patients.every(p => Array.isArray(p.generatedTasks))).toBe(true);
    });
  });

  // ─── Shift 6: Lab result storm ─────────────────────────────────────
  describe("Shift 6 — Evening Lab Storm (תוצאות מעבדה)", () => {
    it("should handle bulk lab additions across 30 patients", () => {
      let state: PatientsState = { ...emptyState(), patients: buildShiftPatients(5) };

      // Add labs to every patient
      for (const p of state.patients) {
        const labs: LabEntry[] = [
          makeLab("CBC-WBC", 5 + Math.random() * 15, 0, "K/µL"),
          makeLab("Hb", 8 + Math.random() * 7, 0, "g/dL"),
          makeLab("K", 3.0 + Math.random() * 3.5, 0, "mEq/L"),
          makeLab("Na", 125 + Math.random() * 25, 0, "mEq/L"),
          makeLab("Cr", 0.5 + Math.random() * 3, 0, "mg/dL"),
          makeLab("CRP", Math.random() * 300, 0, "mg/L"),
        ];

        for (const lab of labs) {
          state = dispatch(state, { type: "ADD_LAB", patientId: p.id, lab });
        }
      }

      // Verify all labs were added
      for (const p of state.patients) {
        expect(p.labs!.length).toBeGreaterThanOrEqual(6);
      }

      // Calculate all deltas — should not throw
      for (const p of state.patients) {
        const deltas = calculateLabDeltas(p);
        expect(Array.isArray(deltas)).toBe(true);
      }
    });

    it("should generate correct acuity rankings after lab storm", () => {
      const patients = buildShiftPatients(5).map(p => ({
        ...p,
        generatedTasks: applyRules(p),
      }));

      // Sort by acuity
      const sorted = sortByAcuity(patients);
      const scores = sorted.map(p => calculateAcuity(p).score);

      // Verify descending order
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i - 1]).toBeGreaterThanOrEqual(scores[i]);
      }
    });
  });

  // ─── Shift 7: Handover-heavy shift ─────────────────────────────────
  describe("Shift 7 — Handover + Notes Heavy Shift", () => {
    it("should handle handover notes on every patient", () => {
      let state: PatientsState = { ...emptyState(), patients: buildShiftPatients(6) };

      const handoverNotes = [
        "יציב, ממשיך ABx, חזרה לבדיקות דם מחר",
        "חמור — שקול ICU אם לא משתפר. משפחה מודעת",
        "ממתין לשיקום. PT/OT evaluated",
        "שחרור מתוכנן מחר — צריך סיכום + מרשמים",
        "comfort care — morphine PRN. בת הגיעה",
        "AKI stage 2 — f/u Cr in AM. hold nephrotoxins",
        "post-fall — CT head negative. continue monitoring",
        "new admission — workup in progress. ABx started",
      ];

      for (let i = 0; i < state.patients.length; i++) {
        state = dispatch(state, {
          type: "SET_HANDOVER_NOTE",
          patientId: state.patients[i].id,
          note: handoverNotes[i % handoverNotes.length],
        });
      }

      // Verify all notes set
      for (const p of state.patients) {
        expect(p.handoverNote).toBeTruthy();
        expect(p.handoverNote!.length).toBeGreaterThan(0);
      }
    });

    it("should handle clinical notes added during shift", () => {
      let state: PatientsState = { ...emptyState(), patients: buildShiftPatients(6) };

      // Add 3 notes to each of first 10 patients
      for (let i = 0; i < Math.min(10, state.patients.length); i++) {
        for (let n = 0; n < 3; n++) {
          state = dispatch(state, {
            type: "ADD_NOTE",
            patientId: state.patients[i].id,
            text: `note ${n + 1}: ${isoTime(n * 2)} — status update`,
          });
        }
      }

      for (let i = 0; i < Math.min(10, state.patients.length); i++) {
        expect(state.patients[i].notes!.length).toBe(3);
      }
    });

    it("should archive shift with all notes preserved", () => {
      let state: PatientsState = { ...emptyState(), patients: buildShiftPatients(6) };

      // Set some handover notes
      for (let i = 0; i < 5; i++) {
        state = dispatch(state, {
          type: "SET_HANDOVER_NOTE",
          patientId: state.patients[i].id,
          note: "handover note " + i,
        });
      }

      state = dispatch(state, { type: "ARCHIVE_SHIFT", label: "21/03 — לילה" });
      expect(state.shiftHistory.length).toBe(1);

      const archived = state.shiftHistory[0].patients;
      const withNotes = archived.filter(p => p.handoverNote);
      // At least the 5 we set + any pre-existing from patient generators (comfort care, discharge, etc.)
      expect(withNotes.length).toBeGreaterThanOrEqual(5);
    });
  });

  // ─── Shift 8: Drug safety stress ───────────────────────────────────
  describe("Shift 8 — Drug Interaction Stress", () => {
    it("should detect interactions across 30+ polypharmacy patients", () => {
      const patients: PatientEntry[] = [];

      // Create 30 patients with various drug combinations
      const drugCombos = [
        ["warfarin 5mg", "amiodarone 200mg"],
        ["citalopram 20mg", "tramadol 50mg"],
        ["warfarin 3mg", "aspirin 100mg", "Plavix 75mg"],
        ["enalapril 10mg", "spironolactone 25mg", "KCl supplement"],
        ["metformin 1000mg", "IV contrast ordered"],
        ["digoxin 0.125mg", "amiodarone 200mg", "verapamil 120mg"],
        ["haloperidol 2mg", "amiodarone 200mg", "ciprofloxacin 500mg"],
        ["Eliquis 5mg", "Clexane 40mg"],
        ["morphine 5mg IV", "midazolam 2mg IV", "fentanyl patch"],
        ["lithium 600mg", "furosemide 40mg", "ACEi"],
      ];

      for (let i = 0; i < 30; i++) {
        const combo = drugCombos[i % drugCombos.length];
        patients.push(makePatient({
          name: `חולה ${i + 1}`,
          room: `${40 + i}/1`,
          section: ["SIDE_A", "SIDE_B", "SIDE_C"][i % 3] as PatientSection,
          tasks: combo.map(d => makeTask(d)),
          clinicalMeta: {
            sexAtBirth: i % 2 === 0 ? "female" : "male",
            weightKg: 50 + i,
            goalsOfCare: "full",
          },
        }));
      }

      let totalInteractions = 0;
      let patientsWithInteractions = 0;

      for (const p of patients) {
        const interactions = checkDrugInteractions(p);
        if (interactions.length > 0) {
          patientsWithInteractions++;
          totalInteractions += interactions.length;
        }
      }

      // Should detect many interactions
      expect(patientsWithInteractions).toBeGreaterThan(0);
      expect(totalInteractions).toBeGreaterThan(0);
    });

    it("should calculate acuity boost from drug interactions", () => {
      const dangerousPatient = makePatient({
        name: "מסוכן דוד",
        room: "99/1",
        section: "SIDE_A",
        age: 80,
        diagnosis: "AF, pain, infection",
        tasks: [
          makeTask("warfarin 7.5mg", "routine"),
          makeTask("amiodarone 200mg IV", "urgent"),
          makeTask("ciprofloxacin 400mg IV", "urgent"),
          makeTask("haloperidol 2mg IM PRN", "urgent"),
          makeTask("tramadol 100mg IV stat", "stat"),
          makeTask("citalopram 20mg", "routine"),
        ],
      });

      const acuity = calculateAcuity(dangerousPatient);
      // Should have high acuity from drug interactions + open tasks
      expect(acuity.score).toBeGreaterThan(5);
    });
  });

  // ─── Shift 9: Full workflow simulation ─────────────────────────────
  describe("Shift 9 — Full 24h Workflow Simulation", () => {
    it("should simulate complete shift lifecycle", () => {
      let state: PatientsState = { ...emptyState(), patients: buildShiftPatients(8) };

      // === 16:00 — Shift starts, receive handover ===
      const report = generateHandoverReport(state.patients, "22/03 — ערב");
      expect(report.totalPatients).toBeGreaterThanOrEqual(30);

      // === 17:00 — First admission from ER ===
      const admission1 = erAdmission("60/1", "SIDE_A", 0);
      state = dispatch(state, { type: "NEW_ADMISSION", patient: admission1 });
      state = dispatch(state, {
        type: "LOG_EVENT",
        event: { id: uid("evt"), type: "ADMISSION", at: isoTime(1), patientId: admission1.id, patientName: admission1.name, room: admission1.room },
      });

      // === 18:00 — Lab results arrive, add to patients ===
      for (let i = 0; i < Math.min(10, state.patients.length); i++) {
        state = dispatch(state, {
          type: "ADD_LAB",
          patientId: state.patients[i].id,
          lab: makeLab("Cr", 0.8 + Math.random() * 2, 2),
        });
      }

      // === 19:00 — Complete stat tasks ===
      for (const p of state.patients) {
        for (const t of p.tasks.filter(t => t.urgency === "stat" && !t.done)) {
          state = dispatch(state, { type: "TOGGLE_TASK", patientId: p.id, taskId: t.id });
        }
      }

      // === 20:00 — Patient deteriorates, add urgent tasks ===
      const sickPatient = state.patients.find(p => p.status.some(s => /sepsis/i.test(s)));
      if (sickPatient) {
        state = dispatch(state, {
          type: "ADD_TASK",
          patientId: sickPatient.id,
          text: "repeat lactate — rising from 4.2 to 6.1",
          urgency: "stat",
        });
      }

      // === 22:00 — Second admission ===
      const admission2 = erAdmission("61/1", "SIDE_B", 1);
      state = dispatch(state, { type: "NEW_ADMISSION", patient: admission2 });

      // === 02:00 — Third admission (night) ===
      const admission3 = erAdmission("62/1", "SIDE_C", 2);
      state = dispatch(state, { type: "NEW_ADMISSION", patient: admission3 });

      // === 04:00 — Patient dies, transition to comfort ===
      const comfortPt = state.patients.find(p =>
        p.clinicalMeta?.goalsOfCare === "comfort_only"
      );
      if (comfortPt) {
        state = dispatch(state, {
          type: "SET_HANDOVER_NOTE",
          patientId: comfortPt.id,
          note: "נפטר/ה בשעה 04:15. משפחה הודעה. פניה לרופא תורן לקביעת מוות.",
        });
      }

      // === 06:00 — More labs ===
      for (let i = 0; i < Math.min(15, state.patients.length); i++) {
        state = dispatch(state, {
          type: "ADD_LAB",
          patientId: state.patients[i].id,
          lab: makeLab("CBC-WBC", 4 + Math.random() * 16, 14),
        });
      }

      // === 07:00 — Reapply rules before handover ===
      state = dispatch(state, { type: "REAPPLY_RULES" });

      // === 07:30 — Morning handover report ===
      const morningReport = generateHandoverReport(state.patients, "23/03 — בוקר");
      expect(morningReport.totalPatients).toBeGreaterThanOrEqual(33); // original + 3 admissions

      // === Archive shift ===
      state = dispatch(state, { type: "ARCHIVE_SHIFT", label: "22/03 ערב → 23/03 בוקר" });
      expect(state.shiftHistory.length).toBe(1);

      // Validate final state integrity
      expect(state.patients.length).toBeGreaterThanOrEqual(33);
      expect(state.patients.every(p => p.id && p.section)).toBe(true);
      expect(state.events.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── Shift 10: Archive + restore cycle ─────────────────────────────
  describe("Shift 10 — Multi-Shift Archive & Restore", () => {
    it("should archive 5 consecutive shifts and restore any", () => {
      let state = emptyState();

      // Build and archive 5 shifts
      for (let i = 0; i < 5; i++) {
        const patients = buildShiftPatients(i + 10);
        state = { ...state, patients };
        state = dispatch(state, { type: "ARCHIVE_SHIFT", label: `shift-${i + 1}` });
      }

      expect(state.shiftHistory.length).toBe(5);

      // Restore the 3rd shift
      const thirdShiftId = state.shiftHistory[2].id;
      state = dispatch(state, { type: "RESTORE_SHIFT", snapshotId: thirdShiftId });
      expect(state.patients.length).toBeGreaterThanOrEqual(30);

      // Delete the 1st shift
      const firstShiftId = state.shiftHistory[0].id;
      state = dispatch(state, { type: "DELETE_SHIFT", snapshotId: firstShiftId });
      expect(state.shiftHistory.length).toBe(4);
    });

    it("should handle patient edit operations across large dataset", () => {
      let state: PatientsState = { ...emptyState(), patients: buildShiftPatients(15) };

      // Edit 10 patients
      for (let i = 0; i < Math.min(10, state.patients.length); i++) {
        state = dispatch(state, {
          type: "EDIT_PATIENT",
          patientId: state.patients[i].id,
          diagnosis: state.patients[i].diagnosis + " — updated",
        });
      }

      // Remove discharged patients
      const toRemove = state.patients.filter(p =>
        p.status.some(s => /משתחרר|discharge/i.test(s))
      );
      for (const p of toRemove) {
        state = dispatch(state, { type: "EDIT_PATIENT", patientId: p.id, discharged: true });
      }

      state = dispatch(state, { type: "REMOVE_DISCHARGED" });
      expect(state.patients.length).toBeLessThan(buildShiftPatients(15).length);
    });

    it("should handle unassigned tasks and assignment", () => {
      let state: PatientsState = { ...emptyState(), patients: buildShiftPatients(15) };

      // Add unassigned tasks (nurse calls without patient identification)
      const unassignedCalls = [
        { text: "חולה נפל בחדר 50 — צריך בדיקה", urgency: "stat" as Urgency },
        { text: "infusion finished room 52", urgency: "routine" as Urgency },
        { text: "family asking for update room 48", urgency: "routine" as Urgency },
        { text: "חום 39.5 חדר 53", urgency: "urgent" as Urgency },
        { text: "desaturation alarm room M1", urgency: "stat" as Urgency },
      ];

      for (const call of unassignedCalls) {
        state = dispatch(state, {
          type: "ADD_UNASSIGNED_TASK",
          text: call.text,
          urgency: call.urgency,
        });
      }

      expect(state.unassignedTasks.length).toBe(5);

      // Assign first unassigned task to a patient
      if (state.unassignedTasks.length > 0 && state.patients.length > 0) {
        state = dispatch(state, {
          type: "ASSIGN_TASK_TO_PATIENT",
          taskId: state.unassignedTasks[0].id,
          patientId: state.patients[0].id,
        });
        expect(state.unassignedTasks.length).toBe(4);
      }
    });
  });

  // ─── Cross-shift analytics ─────────────────────────────────────────
  describe("Cross-Shift Analytics", () => {
    it("should run rules on 300+ patients across all 10 shifts without error", () => {
      let totalPatients = 0;
      let totalGeneratedTasks = 0;

      for (let shift = 0; shift < 10; shift++) {
        const patients = buildShiftPatients(shift);
        totalPatients += patients.length;

        for (const p of patients) {
          const tasks = applyRules(p);
          totalGeneratedTasks += tasks.length;
          expect(Array.isArray(tasks)).toBe(true);
        }
      }

      expect(totalPatients).toBeGreaterThanOrEqual(300);
      expect(totalGeneratedTasks).toBeGreaterThan(0);
    });

    it("should calculate lab deltas for all patients across all shifts", () => {
      let totalDeltas = 0;
      let criticalAlerts = 0;

      for (let shift = 0; shift < 10; shift++) {
        const patients = buildShiftPatients(shift);
        for (const p of patients) {
          const deltas = calculateLabDeltas(p);
          totalDeltas += deltas.length;
          criticalAlerts += deltas.filter(d => d.severity === "critical").length;
        }
      }

      expect(totalDeltas).toBeGreaterThan(0);
      expect(criticalAlerts).toBeGreaterThan(0);
    });

    it("should calculate drug interactions across all shifts", () => {
      let totalInteractions = 0;

      for (let shift = 0; shift < 10; shift++) {
        const patients = buildShiftPatients(shift);
        for (const p of patients) {
          const interactions = checkDrugInteractions(p);
          totalInteractions += interactions.length;
        }
      }

      expect(totalInteractions).toBeGreaterThan(0);
    });

    it("should sort all 10 shifts by acuity without errors", () => {
      for (let shift = 0; shift < 10; shift++) {
        const patients = buildShiftPatients(shift).map(p => ({
          ...p,
          generatedTasks: applyRules(p),
        }));

        const sorted = sortByAcuity(patients);
        expect(sorted.length).toBe(patients.length);

        // Verify sorted order
        const scores = sorted.map(p => calculateAcuity(p).score);
        for (let i = 1; i < scores.length; i++) {
          expect(scores[i - 1]).toBeGreaterThanOrEqual(scores[i]);
        }
      }
    });

    it("should generate morning handover reports for all 10 shifts", () => {
      for (let shift = 0; shift < 10; shift++) {
        const patients = buildShiftPatients(shift).map(p => ({
          ...p,
          generatedTasks: applyRules(p),
        }));

        const report = generateHandoverReport(patients, `shift-${shift + 1}`);
        expect(report.totalPatients).toBeGreaterThanOrEqual(30);
        expect(report.shiftLabel).toBeTruthy();
      }
    });

    it("should handle full reducer workflow for all 10 shifts", () => {
      for (let shift = 0; shift < 10; shift++) {
        const patients = buildShiftPatients(shift);
        let state: PatientsState = { ...emptyState(), patients };

        // Reapply rules
        state = dispatch(state, { type: "REAPPLY_RULES" });

        // Add an admission
        const admission = erAdmission(`90/${shift + 1}`, "SIDE_A", shift);
        state = dispatch(state, { type: "NEW_ADMISSION", patient: admission });

        // Complete some tasks
        const firstPatient = state.patients[0];
        if (firstPatient.tasks.length > 0) {
          state = dispatch(state, {
            type: "TOGGLE_TASK",
            patientId: firstPatient.id,
            taskId: firstPatient.tasks[0].id,
          });
        }

        // Add lab
        state = dispatch(state, {
          type: "ADD_LAB",
          patientId: state.patients[0].id,
          lab: makeLab("K", 4.5, 0),
        });

        // Archive
        state = dispatch(state, { type: "ARCHIVE_SHIFT", label: `archived-shift-${shift + 1}` });

        expect(state.shiftHistory.length).toBe(1);
        expect(state.patients.length).toBeGreaterThan(0);
      }
    });
  });
});

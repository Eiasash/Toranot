# Toranot (תורנות)

**[Live App — Netlify](https://toranot.netlify.app)** · **[Mirror — GitHub Pages](https://eiasash.github.io/Toranot)**

Hospital ward shift management app for on-call doctors at Shaare Zedek Medical Center. Import patient lists via camera OCR or text input, track tasks per patient, and let the rule engine generate follow-up tasks automatically.

Built as a mobile-first PWA with Hebrew RTL support so it works directly from a phone on the ward floor.

## Features

- **Patient import** -- Scan a physical ward sheet with the camera (OCR via Claude Vision), pick an image from the gallery, or paste/type text manually. Parse preview screen lets you verify before committing.
- **Section tabs** -- Patients organized into Side A, Side B, Side C, Rehabilitation, Monitor, and an "All" view across sections
- **Task extraction** -- Tasks, urgency levels, and medical flags (DNR, NPO, ISO, FALL, etc.) are parsed automatically from the input text. Only tasks prefixed with `תורן:` are assigned to the on-call doctor.
- **Rule engine (47 rules)** -- Generates additional tasks based on detected conditions: discharge, pre-surgery, blood transfusion, diabetes, isolation, catheter, fall risk, sepsis, AKI, PE/DVT, delirium with a full treatment ladder, and more
- **IV protocol monitoring** -- Detects active IV drips (insulin, heparin, noradrenaline, dopamine, amiodarone, propofol, opioids, midazolam, magnesium, K-phosphate) and generates appropriate monitoring tasks
- **Delirium management** -- Full pharmacotherapy ladder: workup → non-pharmacological → Quetiapine → Haloperidol IM → Olanzapine → Lorazepam IV rescue. With drug-specific monitoring for each antipsychotic.
- **Clinical hints (36 conditions)** -- Background awareness tips based on diagnosis: PE, DVT, CHF, COPD, CKD, diabetes, dementia, Parkinson's, sepsis, AKI, falls, hyponatremia, hyperkalemia, C.diff, alcohol withdrawal, and more
- **Drug safety alerts** -- Checks for dangerous drug interactions (QT prolongation, bleeding risk, hyperkalemia, serotonin syndrome), renal dose adjustments based on Cockcroft-Gault CrCl, and Beers 2023 criteria for geriatric patients
- **Lab trend monitoring** -- Tracks lab value trajectories with KDIGO AKI staging for creatinine, percentage-based Hb drop alerts, and threshold alerts for K+, Na, WBC, PLT, CRP, Lactate, INR, Glucose
- **Comfort care awareness** -- Patients flagged as palliative/comfort care get aggressive workup tasks suppressed, while comfort drugs (opioids, sedatives, agitation management) remain active
- **Bed collision prevention** -- Prevents two patients from occupying the same room+section across all entry points
- **Smart rescan** -- Re-importing a section preserves manually added tasks and completion state; detects patient transfers between sections
- **AI clinical reasoning** -- Claude-powered differential diagnosis and workup recommendations per patient
- **Urgency color coding** -- Tasks are color-coded by urgency: stat, urgent, morning, routine, extra
- **Dark mode** -- Toggle between light and dark themes for comfortable viewing
- **Task timers** -- Set countdown timers with notifications for time-sensitive tasks
- **Shift history** -- Save and restore previous shift snapshots, import/export backups
- **WhatsApp integration** -- Share shift summaries via WhatsApp in IPASS format

## Getting Started

### Prerequisites

- Node.js (v18+)
- npm

### Install

```bash
npm install
```

### Run locally

```bash
npm run dev
```

Open the URL shown in the terminal (usually `http://localhost:5173/`).

### Build for production

```bash
npm run build
```

Output goes to the `dist/` directory.

### Run tests

```bash
npm run test
```

### Type check

```bash
npm run typecheck
```

## How to Use

### 1. Import patients

Open the app and choose an input method:

- **Camera** -- Point at a printed ward sheet and capture. The OCR engine reads Hebrew and English text from the image.
- **Gallery** -- Select an existing photo of a ward sheet.
- **Text** -- Paste or type the patient list directly.

The expected text format is flexible. Section headers and patient lines look like this:

```
צד א
101 כהן יוסף 72 דלקת ריאות DNR NPO | משתחרר היום | בדיקת דם בבוקר
102 לוי שרה 65 אי ספיקת לב | מוניטור רציף

צד ב
201 דוד מרים 80 סוכרת | מדידת סוכר בבוקר | עירוי
```

Each patient line: `room  name  age  diagnosis  flags | tasks separated by pipes`

Room formats supported: `101`, `49-3`, `55/1`, `ניטור 1`, `חדר-5`.

### 2. Browse patients

After importing, use the section tabs (Side A / Side B / Side C / Rehab) to navigate between wards. Each patient card shows:

- Room number, name, age
- Diagnosis
- Medical flags (color-coded badges)
- Status notes

### 3. Manage tasks

Each patient card lists tasks with urgency indicators. You can:

- **Check off tasks** as you complete them -- completion state is preserved even if you rescan the section later.
- **Add manual tasks** to any patient.
- **Review generated tasks** -- the rule engine automatically adds tasks when it detects conditions like discharge, NPO, pre-surgery, isolation, diabetes, fall risk, etc.

Tasks are sorted with incomplete items first, then by urgency level.

### 4. Rescan

You can rescan a section at any time. The merge logic will:

- Match existing patients by room and name
- Preserve all manual tasks and completion state
- Detect patients who moved between sections
- Add any new patients or tasks from the updated scan

## Tech Stack

| Layer | Technology |
|-------|------------|
| UI | React 19, Tailwind CSS 4 |
| Language | TypeScript (strict) |
| OCR | Claude Vision API |
| Build | Vite 7 |
| Tests | Vitest |
| Deploy | Netlify + GitHub Pages |

## Project Structure

```
src/
  components/    UI components (PatientCard, Scanner, InputArea, etc.)
  context/       React context + useReducer state management
  engine/        Rule engine (47 rules), clinical hints (36 conditions),
                 drug safety, lab deltas, rescan merge
  parser/        Hebrew patient list text parser
  types/         TypeScript type definitions
  utils/         ID generation and patient key helpers
  __tests__/     Unit tests (635+)
```

## License

ISC

# Toranot (תורנות)

**[Live App — Netlify](https://toranot.netlify.app)** · **[Mirror — GitHub Pages](https://eiasash.github.io/Toranot)**

Hospital ward shift management PWA for on-call doctors at Shaare Zedek Medical Center. Import patient lists via camera OCR or text, track tasks per patient, and let the clinical rule engine generate on-call follow-up tasks automatically.

Built as a mobile-first PWA with Hebrew RTL support — works directly from a phone on the ward floor, installable, offline-capable.

---

## Features

### Patient Import
- **Camera OCR** — Point at a printed ward sheet and capture. Claude Vision reads Hebrew + English text from the image.
- **Gallery** — Select an existing photo.
- **Text paste** — Paste or type a patient list directly.
- Parse preview screen for verification before committing.

### Clinical Rule Engine (54 rules)
Generates on-call tasks automatically based on detected conditions:
- Discharge / pre-discharge prep
- Pre-surgery (NPO, consent, blood type)
- Blood transfusion protocol
- IV drip monitoring: insulin, heparin, noradrenaline, dopamine, amiodarone, propofol, opioids, midazolam, magnesium, K-phosphate
- Fall risk, isolation, catheter care
- Sepsis → cultures + antibiotics
- AKI (KDIGO staging), PE/DVT
- Delirium pharmacotherapy ladder: workup → non-pharm → Quetiapine → Haloperidol IM → Olanzapine → Lorazepam IV rescue
- Comfort care awareness: suppresses aggressive workup for palliative patients while keeping comfort medications active

> **Golden rule:** planNotes and tomorrowNotes (morning team context) never trigger on-call tasks. Only explicit action text fires the engine.

### Clinical Decision Support
- **Drug safety alerts** — Dangerous interactions (QT prolongation, bleeding, hyperkalemia, serotonin syndrome), renal dose adjustments (Cockcroft-Gault CrCl), Beers 2023 criteria for geriatric patients
- **Lab trend monitoring** — KDIGO AKI creatinine staging, Hb drop %, K+/Na/WBC/PLT/CRP/Lactate/INR/Glucose threshold alerts
- **Clinical hints (36 conditions)** — Background awareness for PE, DVT, CHF, COPD, CKD, diabetes, dementia, Parkinson's, sepsis, falls, C.diff, alcohol withdrawal, and more
- **AI clinical reasoning** — Claude-powered differential diagnosis and workup recommendations per patient

### Ward Operations
- **New admission modal** — Add on-call admissions manually with freestyle text parsing (`49/2 כהן יוסף 82 pneumonia DNR`). Clinical rules fire immediately on admission.
- **Bed collision prevention** — Prevents two patients sharing the same room+section across all entry points
- **Smart rescan** — Re-importing preserves manual tasks, completion state, notes. Detects patient transfers between sections.
- **Patient movement tracking** — Log bed moves with timestamps
- **Event log** — Timestamped record of admissions, task completions, moves, and nurse calls

### On-Call Handoff Sheet
- Visual card view + plain text for WhatsApp/copy
- **On-call filter** — Shows only patients with explicit manual tasks, done tasks, or new admissions. Ignores OCR-extracted background text.
- **New admission banner** — Highlights all on-call admissions (both OCR-scanned during shift and manually added via modal), regardless of time of day
- Aggregate drug safety alert count in shift summary
- IPASS-style text export

### Cloud Sync & Collaboration
- **Supabase cloud sync** — Debounced push (2.5s), pull on boot, echo suppression
- **Conflict detection** — Only prompts when both devices have exclusive patients the other doesn't. One-sided differences (device is simply behind) apply silently.
- **Shift sharing** — Generate a 6-character code to share the current ward state with a colleague. Codes expire after 8 hours.
- **Cross-tab sync** — localStorage events propagate state to other open browser tabs

### UX
- Section tabs: Side A / Side B / Side C / Rehab / Monitor / All
- Urgency color coding: stat 🔴, urgent 🟡, extra 🟣, routine
- Dark mode
- Task due-time timers with notifications
- Shift history: save, restore, export snapshots
- WhatsApp share

---

## Getting Started

### Prerequisites
- Node.js v18+
- npm

### Install
```bash
npm install
```

### Run locally
```bash
npm run dev
```
Open `http://localhost:5173/`.

### Build for production
```bash
npm run build
```
Output → `dist/`.

### Run tests
```bash
npm test
```
636 tests across 20 test files.

### Type check
```bash
npm run typecheck
```

---

## Input Format

Section headers and patient lines:

```
צד א
101 כהן יוסף 72 דלקת ריאות DNR NPO | תורן: עירוי דם | בדיקת דם בבוקר
102 לוי שרה 65 אי ספיקת לב | מוניטור רציף

צד ב
201 דוד מרים 80 סוכרת | מדידת סוכר בבוקר
```

- Room formats: `101`, `49-3`, `55/1`, `ניטור 1`, `חדר-5`
- Flags: `DNR`, `DNI`, `NPO`, `ISO`, `FALL` — parsed automatically
- Tasks prefixed with `תורן:` are assigned to the on-call doctor
- Tasks without prefix are informational context (planNotes) and do not generate on-call alerts

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| UI | React 19, Tailwind CSS 4 |
| Language | TypeScript (strict) |
| OCR / AI | Claude Vision + Claude Sonnet |
| Cloud | Supabase (auth + sync + sharing) |
| Build | Vite 7 |
| Tests | Vitest (636 tests) |
| Deploy | Netlify + GitHub Pages |

---

## Project Structure

```
src/
  components/    UI (PatientCard, Scanner, HandoffSheet, AddAdmissionModal, ...)
  context/       React context + useReducer state + cloud sync wiring
  engine/        Rule engine (54 rules), clinical hints (36 conditions),
                 drug safety, lab deltas, rescan merge, smart OCR diff
  parser/        Hebrew patient list text parser
  types/         TypeScript type definitions
  utils/         ID generation, patient key, shift time, sort, storage
  __tests__/     Unit tests (636 across 20 files)
cloudSync.ts     Supabase sync, conflict resolution, shift sharing
```

---

## License

ISC

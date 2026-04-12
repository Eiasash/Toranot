# CLAUDE.md — Toranot (תורנות)

Hospital ward shift management PWA for on-call doctors at Shaare Zedek Medical Center (geriatric/internal medicine). Hebrew-first, RTL design.

Live: https://toranot.netlify.app

## Quick Commands

```bash
npm run dev          # Dev server at http://localhost:5173/Toranot/
npm test             # Run all tests (vitest, 2,052 tests)
npm run build        # TypeScript check + Vite build → dist/
npm run typecheck    # tsc --noEmit (strict mode)
```

Requires Node.js >= 22.0.0.

## Tech Stack

- **React 19.2** + **TypeScript 5.4** (strict mode)
- **Zustand 5** — state management (source of truth, localStorage-backed)
- **Tailwind CSS 4.1** — styling with dark mode
- **Vite 7.3** — build tool with manual chunk splitting + SW version stamping
- **Vitest 4** — testing framework (jsdom environment)
- **Supabase 2.49** — optional cloud sync + OTP auth
- **Netlify Functions** — serverless API proxies (Claude, Gemini, OCR, GitHub PAT)
- **Dexie 4 (IndexedDB)** — photo blob storage
- **DOMPurify** — AI-generated HTML sanitization

## Project Structure

```
src/
├── App.tsx                    # Main app component
├── main.tsx                   # React root + service worker registration
├── store/patientsStore.ts     # Zustand store (source of truth)
├── context/
│   ├── PatientsContext.tsx     # React Context wrapper (backward compat)
│   └── reducer.ts             # State reducer + Action types (extracted to break circular imports)
├── types/patient.ts           # PatientEntry, Task, LabEntry, PatientSection, etc.
├── engine/                    # Deterministic business logic (12 files)
│   ├── rules.ts               # 57 rule groups for task generation
│   ├── drugSafety.ts          # Beers Criteria 2023, drug interactions, renal dosing
│   ├── labDelta.ts            # KDIGO AKI / Hb delta alerting
│   ├── acuity.ts              # Patient acuity scoring
│   ├── anticholinergicBurden.ts # ACB scoring
│   ├── fallsRisk.ts           # Falls risk assessment
│   ├── hints.ts               # Clinical hints engine
│   ├── ivProtocolMatch.ts     # IV protocol matching
│   ├── mergeScan.ts           # OCR/parser deduplication
│   ├── shiftContinuity.ts     # Cross-shift task continuity
│   ├── shiftIntegrity.ts      # Shift data integrity checks
│   └── smartOCR.ts            # Diff reporting
├── clinical/
│   └── clinicalThresholds.ts  # Canonical lab thresholds (single source of truth)
├── parser/
│   └── parsePatientList.ts    # WhatsApp/nurse-call text → PatientEntry[]
├── data/
│   ├── dosing.ts              # Renal dosing table (19 antibiotics, CrCl buckets)
│   └── drugHazards.json       # Drug hazard databases
├── utils/                     # Utility functions
│   ├── renal.ts               # Cockcroft-Gault with frailty creatinine floor
│   ├── patientKey.ts          # Room+name → stable patient ID
│   ├── labAlerts.ts           # Critical lab push notifications
│   ├── sortPatients.ts        # Sort by section/room/bed
│   └── ...                    # storage, shiftTime, haptics, taskReminders, etc.
├── reminders/                 # Task reminder scheduling
├── sync/patientMerge.ts       # Cloud sync conflict detection + merge
├── persistence/photoStore.ts  # IndexedDB for photo blobs
├── cloudSync.ts               # Supabase cloud sync + OTP auth
├── components/                # 46 React components
│   ├── PatientCard.tsx        # Main patient display (~1500 lines)
│   ├── PatientList.tsx        # Patient list with filtering
│   ├── HandoffSheet.tsx       # Shift handoff document (5 tabs)
│   ├── AIClinicalReasoning.tsx # Claude-powered clinical reasoning
│   ├── Scanner.tsx            # Camera OCR via Anthropic Vision API
│   ├── AddAdmissionModal.tsx  # Admission workflow
│   ├── OnCallProtocols.tsx    # IV/clinical protocol reference
│   └── ...                    # 38+ more components (many lazy-loaded)
└── __tests__/                 # 65 test files, 2,052 tests
    ├── phase1.test.ts         # Acceptance tests
    ├── rules.test.ts          # 146 rule engine tests
    ├── drugSafety.test.ts     # 56 drug safety tests
    └── ...                    # labDelta, dosing, renal, mergeScan, etc.

netlify/functions/             # Serverless API proxies
├── claude.ts                  # Claude API proxy (vision + document support)
├── gemini.ts                  # Gemini API proxy for OCR
├── ocr-proxy.ts               # PDF OCR pipeline
├── github-pat.ts              # GitHub token proxy
└── _utils.ts                  # Shared auth, rate limiting, validation

public/
├── sw.js                      # Service Worker (offline + caching)
├── manifest.json              # PWA manifest (Hebrew RTL)
├── iv-protocols.json          # IV protocol data
└── szmc-iv-protocols.json     # Shaare Zedek specific protocols
```

**Codebase size**: ~154 TypeScript/TSX files (88 source + 65 test + 1 index).

## Architecture

### State Management
- **Zustand store** (`store/patientsStore.ts`) is the single source of truth
- **React Context** (`context/PatientsContext.tsx`) wraps Zustand for backward compatibility
- **Reducer** (`context/reducer.ts`) extracted separately to break circular imports between Context and Store
- State persists to **localStorage** via Zustand subscriptions; optional **Supabase** cloud sync

### Engine (Business Logic)
All clinical logic lives in `src/engine/` — deterministic, pure functions, heavily tested:
- **rules.ts**: 57 rule groups that generate tasks from patient data (sepsis, AKI, CHF, electrolytes, DVT/PE, GI bleed, etc.)
- **drugSafety.ts**: Beers Criteria 2023, drug-drug interactions, renal dose adjustments
- **labDelta.ts**: KDIGO AKI staging, hemoglobin trend alerting
- **clinicalThresholds.ts**: Canonical lab thresholds shared across the app
- **anticholinergicBurden.ts**: ACB scoring for medications
- **fallsRisk.ts**: Falls risk assessment logic
- **shiftContinuity.ts**: Cross-shift task continuity tracking
- **shiftIntegrity.ts**: Shift data integrity validation

### Cloud Sync
- Debounced push with write coalescing
- Echo suppression (ignore own changes)
- Conflict detection + merge strategy (remote-newer, local-newer, identical)
- Per-patient revision tracking
- Retry with exponential backoff + jitter

### Serverless Functions (Netlify)
- Proxy Claude/Gemini APIs to keep keys server-side
- JWT auth via Supabase (fail-closed on timeout)
- Rate limiting via Upstash Redis (30/min AI, 10/min OCR; fail-open if Redis unavailable)
- Content-type whitelist for upstream responses
- Scheduled functions: `toranot-keepalive` (every 5 days), `self-audit` (weekly Monday)

## Testing

```bash
npm test                                    # All tests
npm test -- src/__tests__/rules.test.ts     # Single file
npm test -- --reporter=verbose              # Verbose output
```

**2,052 tests across 65 files** — run `npm test` to see current count.

Always run `npm test` before every push. ALL tests must pass.

**Auto-expand rule:** Every feature, improvement, or bug fix MUST include new or updated tests:
- New engine rule → tests for happy path + edge cases + comfort care suppression
- Bug fix → regression test that reproduces the bug before the fix
- New clinical logic → boundary tests + property tests
- Modified thresholds → edge case tests at boundary values
- After adding tests, update the test count in this section

### Test file inventory (65 files, 2,052 tests)

```
src/__tests__/
  acuity.test.ts                 21 tests — patient acuity scoring
  acuity.edge.test.ts            13 tests — acuity edge cases
  allergyConflicts.test.ts       28 tests — allergy conflict detection
  anticholinergicBurden.test.ts  14 tests — ACB scoring for medications
  authThrottle.test.ts            6 tests — auth rate limiting
  bulkLabs.test.ts               13 tests — bulk lab entry processing
  calculateCockcroftGault.test.ts 18 tests — Cockcroft-Gault calculation
  clinicalThresholds.test.ts     40 tests — canonical lab threshold validation
  cloudSync.test.ts              39 tests — Supabase sync, conflict detection, merge
  comfortCare.test.ts            36 tests — comfort care / goals of care suppression
  dosing.test.ts                  8 tests — renal dosing table (19 antibiotics)
  drugSafety.test.ts             56 tests — Beers criteria, drug interactions, renal adjustment
  drugSafety.beers.test.ts       38 tests — Beers criteria 2023 detailed validation
  drugSafety.edge.test.ts        34 tests — drug safety edge cases
  drugSafetyAlerts.test.ts       33 tests — drug safety alert generation
  fallsRisk.test.ts              13 tests — falls risk assessment
  generateId.test.ts             10 tests — stable ID generation
  handoffSheet.test.ts           34 tests — shift handoff document generation
  hints.test.ts                  58 tests — clinical hints engine
  ivProtocolMatch.test.ts        39 tests — IV protocol matching
  ivProtocolMatch.edge.test.ts   27 tests — IV protocol edge cases
  labAlerts.test.ts              36 tests — critical lab push notifications
  labDelta.test.ts               38 tests — KDIGO AKI staging, Hb delta alerting
  labDelta.edge.test.ts          29 tests — lab delta edge cases
  labPersistence.test.ts         10 tests — lab data persistence
  labTrends.test.ts              14 tests — lab trend analysis
  medFlags.test.ts               22 tests — medication flag detection
  medicationIntegration.test.ts  11 tests — lab persistence + med integration
  mergeScan.test.ts              23 tests — OCR/parser deduplication
  netlifyFunctions.test.ts       59 tests — serverless function handlers (Claude, Gemini, OCR)
  oncallShiftsStress.test.ts    113 tests — on-call shift stress/load testing
  parseFreestyle.test.ts         19 tests — freestyle text parsing
  parsePatientList.test.ts       71 tests — WhatsApp/nurse-call text → PatientEntry[]
  parsePatientList.edge.test.ts  21 tests — parser edge cases
  parserFuzz.test.ts             21 tests — parser fuzz testing
  parserNormalize.test.ts        42 tests — parser normalization
  patientCard.test.ts            35 tests — patient card component logic
  patientKey.test.ts             30 tests — room+name → stable patient ID
  patientMerge.test.ts           45 tests — cloud sync conflict merge
  patientsStore.test.ts          25 tests — Zustand store operations
  patientsStoreExpanded.test.ts  32 tests — expanded store operations
  phase1.test.ts                 39 tests — acceptance tests
  phase3.test.ts                 21 tests — phase 3 feature tests
  phlebotomy.test.ts             19 tests — phlebotomy scheduling
  reducer.test.ts               111 tests — state reducer + action types
  reminderScheduler.test.ts      17 tests — task reminder scheduling
  renal.test.ts                  15 tests — Cockcroft-Gault with frailty floor
  renal.edge.test.ts             32 tests — renal calculation edge cases
  renalDosing.test.ts            15 tests — renal dose adjustments
  roomFormat.simulation.test.ts  64 tests — room format simulation
  rules.test.ts                 146 tests — 57 clinical rule groups
  rules.comfort.test.ts          22 tests — comfort care rule suppression
  rules.cross.test.ts             7 tests — cross-rule interactions
  sectionDetection.test.ts       29 tests — ward section detection
  shiftContinuity.test.ts        11 tests — cross-shift task continuity
  shiftIntegrity.test.ts         14 tests — shift data integrity checks
  shiftTime.test.ts              21 tests — shift time calculations
  smartOCR.test.ts               16 tests — diff reporting
  sortPatients.test.ts            9 tests — patient sort by section/room/bed
  sortStability.test.ts          15 tests — sort stability guarantees
  storage.test.ts                30 tests — localStorage persistence
  storageExport.test.ts          13 tests — storage export/import
  stressOncallShifts.test.ts     44 tests — on-call shift stress scenarios
  syncWrite.test.ts               9 tests — sync write operations
  taskReminders.test.ts          22 tests — task reminder logic
```

### Test coverage by area

| Area | Tests | Coverage | Notes |
|------|-------|----------|-------|
| Engine (rules, drugSafety, labDelta) | ~530 | Strong | Core clinical logic, Beers, AKI staging |
| Clinical utilities (renal, acuity, falls, hints) | ~190 | Strong | Cockcroft-Gault, ACB, thresholds |
| Parser (patient list, freestyle, normalize) | ~195 | Strong | Section detection, fuzz testing |
| Reducer + store | ~168 | Strong | State transitions, Zustand ops |
| IV protocols + dosing | ~74 | Good | Protocol matching, renal dosing |
| Lab processing (alerts, trends, persistence) | ~73 | Good | Critical labs, bulk entry, deltas |
| Cloud sync + merge | ~84 | Good | Conflict detection, merge, write ops |
| Shift management (continuity, integrity, time) | ~46 | Good | Cross-shift tasks, data integrity |
| On-call scheduling | ~157 | Strong | Stress testing, shift scenarios |
| Serverless functions | ~59 | Good | Claude, Gemini, OCR proxies |
| Handoff sheet | ~34 | Good | Document generation |
| Patient card component | ~35 | Good | Component logic |
| Storage + export | ~43 | Good | localStorage, export/import |

**Gaps — areas not tested:**
- 45 of 46 React components (only PatientCard has tests)
- UI interactions, navigation, modal workflows
- Service worker (offline caching, background sync)
- Supabase real-time subscriptions (tested via mocks only)

## Environment Variables

Create `.env.local` from `.env.example`:

```bash
# Client-side (bundled by Vite)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbG...
VITE_BASE_PATH=/Toranot/              # Optional, for GitHub Pages

# Server-side (Netlify Functions only — never in bundle)
ANTHROPIC_API_KEY=sk-ant-...          # Required for AI features
GEMINI_API_KEY=AIza...                # Optional OCR alternative
CLAUDE_MODEL=...                      # Optional model override
GEMINI_MODEL=...                      # Optional model override
UPSTASH_REDIS_REST_URL=https://...    # Optional rate limiting
UPSTASH_REDIS_REST_TOKEN=AX...
API_SECRET=...                        # Legacy local dev fallback
```

## CI/CD

**GitHub Actions** (`.github/workflows/deploy.yml`):
1. **test**: `npm ci` → `typecheck` → `test` (runs on all pushes/PRs, Node 22)
2. **build**: `vite build` with `VITE_BASE_PATH=/Toranot/` (push to main only, after tests pass)
3. **deploy**: GitHub Pages (push to main only)

**Netlify**: Auto-deploys from main; functions bundled with esbuild.
- API routes: `/api/claude`, `/api/gemini`, `/api/ocr`, `/api/ocr-proxy`, `/api/github-pat`, `/api/self-audit`
- CSP headers configured (camera/microphone restrictions)
- Static asset caching: 1 year (31536000s)

## Build Configuration

**vite.config.ts** highlights:
- React + Tailwind CSS plugins
- Custom SW version stamping plugin
- Manual chunk splitting: `vendor-react`, `vendor-supabase`, `vendor-qr`, `vendor-dompurify`, `app-engine`, `app-context`, `app-utils`
- Build-time defines: `__BUILD_TIME__`, `__GIT_SHA__`
- Hidden source maps in production

**tsconfig.json**: Target ES2022, ESNext modules, bundler resolution, strict mode.

## Code Conventions

### General
- **Language**: TypeScript strict mode — no `any` unless absolutely necessary
- **UI text**: Hebrew (RTL). All user-facing strings are in Hebrew
- **Styling**: Tailwind CSS classes; dark mode via class-based toggling
- **Components**: Functional React components with hooks
- **Heavy modals**: Code-split via `React.lazy` for bundle size
- **Dialogs**: Use `useSimpleConfirm` hook (not `window.confirm` — breaks on Android PWA)

### State Changes
- Dispatch actions through the reducer (`context/reducer.ts`)
- Action types defined as a union type in reducer.ts
- New patient fields must be optional with defaults (forward compatibility)
- Normalize patients/tasks via `normalizePatient`/`normalizeTask` helpers

### Engine Rules
- Each rule group in `rules.ts` follows a pattern: check conditions → generate Task objects
- Rules must respect `goalsOfCare === 'comfort'` (suppress non-comfort tasks)
- Lab thresholds must come from `clinical/clinicalThresholds.ts` (single source of truth)
- All engine functions must be pure — no side effects, no API calls

### Patient Sections
- Sections: `SIDE_A`, `SIDE_B`, `SIDE_C`, `REHAB`, `MONITOR`
- Section aliases defined in `src/types/patient.ts` for flexible matching

### Testing
- Test files go in `src/__tests__/`
- Name pattern: `featureName.test.ts`
- Engine/utility tests are highest priority
- Use descriptive test names in Hebrew context where relevant

### Security
- Never expose API keys client-side; all AI/OCR calls go through Netlify function proxies
- Sanitize AI-generated HTML with DOMPurify before rendering
- Auth is fail-closed (Supabase JWT timeout → require API_SECRET, not open access)
- Validate content types from upstream responses

## Key Files to Know

| File | Why It Matters |
|------|---------------|
| `src/store/patientsStore.ts` | Zustand store — app state source of truth |
| `src/context/reducer.ts` | All actions + reducer logic + normalizers |
| `src/engine/rules.ts` | 57 clinical rule groups (~1,077 lines) |
| `src/engine/drugSafety.ts` | Drug safety checks (Beers, interactions, renal) |
| `src/engine/shiftContinuity.ts` | Cross-shift task continuity |
| `src/clinical/clinicalThresholds.ts` | Canonical lab thresholds |
| `src/types/patient.ts` | Core type definitions (PatientEntry, Task, LabEntry, etc.) |
| `src/parser/parsePatientList.ts` | Text → PatientEntry[] parser |
| `src/components/PatientCard.tsx` | Main UI component (~1,500 lines) |
| `src/components/HandoffSheet.tsx` | Shift handoff document |
| `src/components/OnCallProtocols.tsx` | Clinical protocol reference |
| `src/cloudSync.ts` | Supabase sync with conflict resolution |
| `netlify/functions/_utils.ts` | Shared serverless auth + rate limiting |
| `vite.config.ts` | Build config, chunk splitting, defines |
| `netlify.toml` | Deployment, redirects, CSP headers, scheduled functions |

## Claude Code Integration

### Slash Commands (`.claude/commands/`)

| Command | Description |
|---------|-------------|
| `/toranot-audit` | Full audit of app — bugs, UX issues, clinical logic |
| `/toranot-audit-fix-deploy` | Full audit → fix → push cycle |
| `/toranot-fix` | Fix specific issues |
| `/toranot-test` | Run and verify test suite |
| `/toranot-deploy` | Build and deploy |
| `/toranot-update-skill` | Update Claude skill definitions |
| `/szmc-clinical-notes` | Clinical notes workflow |

### Dev Server
Configured in `.claude/launch.json`: `npm run dev` on port 5173.

## Common Tasks

### Adding a new clinical rule
1. Add rule group in `src/engine/rules.ts`
2. Respect comfort care: check `goalsOfCare` before generating tasks
3. Use thresholds from `src/clinical/clinicalThresholds.ts`
4. Add tests in `src/__tests__/rules.test.ts`
5. Run `npm test` to verify

### Adding a new patient field
1. Add optional field to `PatientEntry` in `src/types/patient.ts`
2. Update `normalizePatient` in `src/context/reducer.ts` with a default value
3. Update relevant components
4. Field must be optional (backward compat with existing localStorage data)

### Adding a new component
1. Create in `src/components/`
2. For heavy/infrequently-used components, use `React.lazy` for code splitting
3. Use Tailwind for styling; support dark mode
4. Use `useSimpleConfirm` instead of `window.confirm`
5. All UI text in Hebrew

### Modifying serverless functions
1. Edit in `netlify/functions/`
2. Shared utilities in `_utils.ts`
3. Auth: verify Supabase JWT or fall back to API_SECRET
4. Always validate and sanitize inputs
5. Test locally with `netlify dev` (requires Netlify CLI)

## Branch Policy

- `main` — production branch, auto-deployed to Netlify + GitHub Pages
- Feature branches: `claude/<description>-<id>` convention
- All PRs target `main`
- CI must pass before merging

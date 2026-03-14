# CLAUDE.md — Toranot (תורנות)

Hospital ward shift management PWA for on-call doctors at Shaare Zedek Medical Center (geriatric/internal medicine). Hebrew-first, RTL design.

Live: https://toranot.netlify.app

## Quick Commands

```bash
npm run dev          # Dev server at http://localhost:5173/Toranot/
npm test             # Run all tests (vitest, 826+ tests)
npm run build        # TypeScript check + Vite build → dist/
npm run typecheck    # tsc --noEmit (strict mode)
```

## Tech Stack

- **React 19** + **TypeScript 5.4** (strict mode)
- **Zustand 5** — state management (source of truth, localStorage-backed)
- **Tailwind CSS 4.1** — styling with dark mode
- **Vite 7.3** — build tool with manual chunk splitting
- **Vitest** — testing framework (jsdom environment)
- **Supabase** — optional cloud sync + OTP auth
- **Netlify Functions** — serverless API proxies (Claude, Gemini, OCR)
- **Dexie (IndexedDB)** — photo blob storage

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
├── engine/                    # Deterministic business logic
│   ├── rules.ts               # 58+ rule groups for task generation
│   ├── drugSafety.ts          # Beers Criteria 2023, drug interactions, renal dosing
│   ├── labDelta.ts            # KDIGO AKI / Hb delta alerting
│   ├── acuity.ts              # Patient acuity scoring
│   ├── ivProtocolMatch.ts     # IV protocol matching
│   ├── mergeScan.ts           # OCR/parser deduplication
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
├── sync/patientMerge.ts       # Cloud sync conflict detection + merge
├── persistence/photoStore.ts  # IndexedDB for photo blobs
├── cloudSync.ts               # Supabase cloud sync + OTP auth
├── components/                # 41 React components
│   ├── PatientCard.tsx        # Main patient display (~1500 lines)
│   ├── PatientList.tsx        # Patient list with filtering
│   ├── HandoffSheet.tsx       # Shift handoff document (5 tabs)
│   ├── AIClinicalReasoning.tsx # Claude-powered clinical reasoning
│   ├── Scanner.tsx            # Camera OCR via Anthropic Vision API
│   └── ...                    # 35+ more components (many lazy-loaded)
└── __tests__/                 # 32 test files
    ├── phase1.test.ts         # 39 acceptance tests
    ├── rules.test.ts          # 151 rule engine tests
    ├── drugSafety.test.ts     # 73 drug safety tests
    └── ...                    # labDelta, dosing, renal, mergeScan, etc.

netlify/functions/             # Serverless API proxies
├── claude.ts                  # Claude API proxy (vision + document support)
├── gemini.ts                  # Gemini API proxy for OCR
├── ocr-proxy.ts               # PDF OCR pipeline
└── _utils.ts                  # Shared auth, rate limiting, validation

public/
├── sw.js                      # Service Worker (offline + caching)
├── manifest.json              # PWA manifest (Hebrew RTL)
├── iv-protocols.json          # IV protocol data
└── szmc-iv-protocols.json     # Shaare Zedek specific protocols
```

## Architecture

### State Management
- **Zustand store** (`store/patientsStore.ts`) is the single source of truth
- **React Context** (`context/PatientsContext.tsx`) wraps Zustand for backward compatibility
- **Reducer** (`context/reducer.ts`) extracted separately to break circular imports between Context and Store
- State persists to **localStorage** via Zustand subscriptions; optional **Supabase** cloud sync

### Engine (Business Logic)
All clinical logic lives in `src/engine/` — deterministic, pure functions, heavily tested:
- **rules.ts**: 58+ rule groups that generate tasks from patient data (sepsis, AKI, CHF, electrolytes, etc.)
- **drugSafety.ts**: Beers Criteria 2023, drug-drug interactions, renal dose adjustments
- **labDelta.ts**: KDIGO AKI staging, hemoglobin trend alerting
- **clinicalThresholds.ts**: Canonical lab thresholds shared across the app

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

## Testing

```bash
npm test                                    # All tests
npm test -- src/__tests__/rules.test.ts     # Single file
npm test -- --reporter=verbose              # Verbose output
```

**Test coverage by area:**
| Area | Coverage | Notes |
|------|----------|-------|
| Engine (rules, drugSafety, labDelta) | Strong (~430 tests) | Core clinical logic |
| Utilities (renal, sort, patientKey) | Moderate (~100 tests) | |
| Parser | Moderate (37 tests) | Section detection, patient parsing |
| Reducer | Good (105 tests) | State transitions |
| Components | None | 41 components untested |
| Zustand store | None | localStorage persistence untested |

**Known**: ~8% of tests may fail (pre-existing; mostly cloud sync race conditions). Core engine tests should always pass.

## Environment Variables

Create `.env.local` from `.env.example`:

```bash
# Client-side (bundled by Vite)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbG...

# Server-side (Netlify Functions only — never in bundle)
ANTHROPIC_API_KEY=sk-ant-...          # Required for AI features
GEMINI_API_KEY=AIza...                # Optional OCR alternative
UPSTASH_REDIS_REST_URL=https://...    # Optional rate limiting
UPSTASH_REDIS_REST_TOKEN=AX...
API_SECRET=...                        # Legacy local dev fallback
```

## CI/CD

**GitHub Actions** (`.github/workflows/deploy.yml`):
1. **test**: `npm ci` → `typecheck` → `test` (runs on all pushes/PRs)
2. **build**: `vite build` (push to main only, after tests pass)
3. **deploy**: GitHub Pages (push to main only)

**Netlify**: Auto-deploys from main; functions bundled with esbuild.

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
| `src/engine/rules.ts` | 58+ clinical rule groups (~1200 lines) |
| `src/engine/drugSafety.ts` | Drug safety checks (Beers, interactions, renal) |
| `src/clinical/clinicalThresholds.ts` | Canonical lab thresholds |
| `src/types/patient.ts` | Core type definitions |
| `src/parser/parsePatientList.ts` | Text → PatientEntry[] parser |
| `src/components/PatientCard.tsx` | Main UI component (~1500 lines) |
| `src/cloudSync.ts` | Supabase sync with conflict resolution |
| `netlify/functions/_utils.ts` | Shared serverless auth + rate limiting |
| `vite.config.ts` | Build config, chunk splitting, defines |
| `netlify.toml` | Deployment, redirects, CSP headers |

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

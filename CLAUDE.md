# CLAUDE.md — Toranot (תורנות)

<!-- working-rules-v1:start -->
## Working Rules (user-mandated, non-negotiable)

These four rules are the floor. They override any conflicting guidance later in this file. If a rule conflicts with what you're about to do, stop and surface it before proceeding.

1. **Don't assume. Don't hide confusion. Surface tradeoffs.**
2. **Minimum code that solves the problem. Nothing speculative.**
3. **Touch only what you must. Clean up only your own mess.**
4. **Define success criteria. Loop until verified.**
<!-- working-rules-v1:end -->

Hospital ward shift management PWA for on-call doctors at Shaare Zedek Medical Center (geriatric/internal medicine). Hebrew-first, RTL design.

Live: https://toranot.netlify.app

## Quick Commands

```bash
npm run dev          # Dev server at http://localhost:5173/Toranot/
npm test             # Run all tests (vitest, ~2,150 tests across 69 files)
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
├── engine/                    # Deterministic business logic (13 files)
│   ├── rules.ts               # 57 rule groups for task generation
│   ├── drugSafety.ts          # Beers Criteria 2023, drug interactions, renal dosing
│   ├── labDelta.ts            # KDIGO AKI / Hb delta alerting
│   ├── acuity.ts              # Patient acuity scoring
│   ├── admissionProcessor.ts  # Intake → structured admission pipeline
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
│   ├── parsePatientList.ts    # WhatsApp/nurse-call text → PatientEntry[]
│   └── chameleonExport.ts     # Rounds-note exporter for Chameleon EMR paste
├── data/
│   ├── dosing.ts              # Renal dosing table (19 antibiotics, CrCl buckets)
│   └── drugHazards.json       # Drug hazard databases
├── components/                # 46 React components
│   ├── PatientCard.tsx        # Main patient display (~1500 lines)
│   ├── PatientList.tsx        # Patient list with filtering
│   ├── HandoffSheet.tsx       # Shift handoff document (5 tabs)
│   ├── AIClinicalReasoning.tsx # Claude-powered clinical reasoning
│   ├── Scanner.tsx            # Camera OCR via Anthropic Vision API
│   ├── AddAdmissionModal.tsx  # Admission workflow
│   ├── OnCallProtocols.tsx    # IV/clinical protocol reference
│   └── ...                    # 38+ more components (many lazy-loaded)
└── __tests__/                 # 69 test files, ~2,150 tests

netlify/functions/             # Serverless API proxies + ops helpers
├── claude.ts, gemini.ts, ocr-proxy.ts, github-pat.ts  # AI/auth proxies
├── self-audit.js, skill-snapshot.js, toranot-keepalive.js  # ops/scheduled
└── _utils.ts                  # Shared auth, rate limiting, validation

public/
├── sw.js, manifest.json, iv-protocols.json, szmc-iv-protocols.json
```

**Codebase size**: ~162 TypeScript/TSX files (~92 source + 69 test + 1 index).

## Architecture

### State Management
- **Zustand store** (`store/patientsStore.ts`) is the single source of truth
- **React Context** wraps Zustand for backward compatibility
- **Reducer** extracted separately to break circular imports
- State persists to **localStorage**; optional **Supabase** cloud sync

### Engine (Business Logic)
All clinical logic in `src/engine/` — deterministic, pure functions, heavily tested.

### Cloud Sync
- Debounced push, echo suppression, conflict detection + merge
- Per-patient revision tracking, retry with exponential backoff + jitter

### Serverless Functions (Netlify)
- Proxy Claude/Gemini APIs (keys server-side), JWT auth, rate limiting

## Testing

**~2,150 tests across 69 files** — run `npm test` to see current count.

Always run `npm test` before every push. ALL tests must pass.

**Auto-expand rule:** Every feature or bug fix MUST include new or updated tests.

### Test coverage by area

| Area | Tests | Status |
|------|-------|--------|
| Engine (rules, drugSafety, labDelta) | ~530 | Strong |
| Clinical utils (renal, acuity, falls, hints) | ~190 | Strong |
| Parser (patient list, freestyle, normalize) | ~195 | Strong |
| Reducer + store | ~168 | Strong |
| On-call scheduling | ~157 | Strong |
| Cloud sync + merge | ~84 | Good |
| IV protocols + dosing | ~74 | Good |
| Lab processing | ~73 | Good |
| Serverless functions | ~59 | Good |
| Shift management | ~46 | Good |
| Storage + export | ~43 | Good |
| Patient card component | ~35 | Moderate |
| Handoff sheet | ~34 | Good |

**Gaps — areas not tested:**
- 45 of 46 React components (only PatientCard has tests)
- UI interactions, navigation, modal workflows
- Service worker (offline caching, background sync)
- Supabase real-time subscriptions (tested via mocks only)

## Environment Variables

```bash
# Client-side (Vite)
VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_BASE_PATH=/Toranot/
# Server-side (Netlify Functions)
ANTHROPIC_API_KEY, GEMINI_API_KEY, CLAUDE_MODEL, GEMINI_MODEL
UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, API_SECRET
```

## CI/CD

**GitHub Actions**: test → build → deploy (GitHub Pages). Node 22.
**Netlify**: Auto-deploys from main; API routes, CSP headers, scheduled functions.

## Code Conventions

- **TypeScript strict mode** — no `any` unless necessary
- **UI text**: Hebrew (RTL)
- **Tailwind CSS**; dark mode via class toggling
- **React.lazy** for heavy modals; `useSimpleConfirm` not `window.confirm`
- Engine rules must respect `goalsOfCare === 'comfort'`
- Lab thresholds from `clinical/clinicalThresholds.ts` (single source)
- All engine functions must be pure — no side effects

## Key Files

| File | Why It Matters |
|------|---------------|
| `src/store/patientsStore.ts` | App state source of truth |
| `src/context/reducer.ts` | All actions + normalizers |
| `src/engine/rules.ts` | 57 clinical rule groups |
| `src/engine/drugSafety.ts` | Beers, interactions, renal |
| `src/clinical/clinicalThresholds.ts` | Canonical lab thresholds |
| `src/types/patient.ts` | Core type definitions |
| `src/parser/parsePatientList.ts` | Text → PatientEntry[] |
| `src/components/PatientCard.tsx` | Main UI (~1,500 lines) |
| `netlify/functions/_utils.ts` | Shared auth + rate limiting |

## Common Tasks

### Adding a new clinical rule
1. Add rule group in `src/engine/rules.ts`
2. Respect comfort care: check `goalsOfCare`
3. Use thresholds from `clinicalThresholds.ts`
4. Add tests in `src/__tests__/rules.test.ts`

### Adding a new patient field
1. Add optional field to `PatientEntry` in `src/types/patient.ts`
2. Update `normalizePatient` in `src/context/reducer.ts`
3. Field must be optional (backward compat)

---

## Codebase Metrics

| Metric | Value |
|--------|-------|
| Source files (TS/TSX) | ~92 |
| Test files | 69 |
| Total tests | ~2,150 |
| Components | 46 |
| Engine modules | 13 |
| Clinical rule groups | 57 |
| Renal dosing drugs | 19 |
| Netlify functions | 7 (+1 shared utils) |
| Patient sections | 5 (SIDE_A–C, REHAB, MONITOR) |

---

## Test Coverage Recommendations

### Recommended Additions (Priority Order)

1. **Component testing expansion** — Only PatientCard tested (1/46). Priority:
   - `AddAdmissionModal.tsx` — form validation, templates, geriatric baselines
   - `HandoffSheet.tsx` — all 5 tab renders, export formatting
   - `Scanner.tsx` — OCR trigger, confidence, error states
   - `MedicationInput.tsx` — structured entry, ACB preview, validation
   - `PatientList.tsx` — filtering, sorting, section grouping
2. **Service worker tests** — offline caching, background sync, auto-update
3. **Supabase real-time subscription tests** — integration-style lifecycle tests
4. **Error boundary coverage** — `InlineErrorBoundary` fallback rendering
5. **Voice input tests** — `VoiceInput.tsx` speech-to-text
6. **Photo persistence tests** — Dexie IndexedDB blob storage
7. **Rate limiting boundary tests** — Upstash Redis at 29th vs 31st request
8. **Room format edge cases** — SZMC-specific numbering
9. **Shift handoff cross-patient tests** — 10+ patients, mixed sections/acuity
10. **AI clinical reasoning tests** — mock Claude responses, DOMPurify sanitization

### Long-Term Goal
Reach **2,500+ tests** with at least 10 component test files.

---

## TODO / Improvement Roadmap

### High Priority
- [ ] **Component test coverage** — top 5 critical components
- [ ] **Service worker test file** — caching, version sync, background sync
- [ ] **Coverage thresholds** — target Lines >=50%, Branches >=40%
- [ ] **PatientCard refactoring** — continue extracting sub-components

### Medium Priority
- [ ] **Structured medication database** — expand drugHazards.json
- [ ] **Lab trend visualization** — sparkline/mini-charts
- [ ] **Multi-ward support** — extend PatientSection
- [ ] **Admission template expansion** — beyond current 8
- [ ] **Push notification reliability** — test and improve delivery

### Low Priority
- [ ] **Performance optimization** — PatientCard re-render profiling
- [ ] **Offline resilience testing** — offline → online transitions
- [ ] **i18n preparation** — extract Hebrew strings for future locales
- [ ] **Accessibility audit** — WCAG compliance
- [ ] **Bundle size monitoring** — track chunk sizes

### Clinical Content Roadmap
- [ ] **Rule expansion** — delirium screening (4AT/CAM), pressure injury (Braden), nutrition (MNA)
- [ ] **Drug database expansion** — more Beers drugs, STOPP/START v3
- [ ] **Protocol library** — more SZMC-specific protocols
- [ ] **Clinical calculators** — GDS-15, Norton, Morse Fall, CFS

---

## Branch Policy

- `main` — production, auto-deployed to Netlify + GitHub Pages
- Feature branches: `claude/<description>-<id>` convention
- CI must pass before merging

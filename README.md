# תורנות — Toranot

## Recent Changes

### Phase 1 — Clinical correctness and parser safety ($(date))

**AKI staging fix (KDIGO correctness)**
- `peakCr >= 4.0` alone no longer labels stable CKD-5 as AKI Stage 3
- Stage 3 now requires `ratio >= 3` OR `(peakCr >= 4.0 AND acuteRise >= 0.3 mg/dL)`
- IEEE-754 float epsilon (1e-9) prevents rounding artifacts in the 0.3 threshold

**Renal dosing — new structured API**
- Added `calculateCockcroftGault()` in `src/utils/renal.ts`
- Returns `indeterminate` with a Hebrew reason when sex/weight/age are absent
- No creatinine floor — uses measured values directly
- Legacy `cockcroft()` preserved for existing callers

**Drug interactions — linezolid and TMP-SMX coverage**
- `linezolid + SSRI/SNRI/tramadol` → critical serotonin syndrome warnings
- `trimethoprim/SMX + spironolactone` → critical hyperkalemia (ENaC dual blockade)
- `TMP-SMX` pattern extended to match `TMP-SMX`, `co-trimoxazole`, `septra`

**Comfort care suppression**
- Task text now included in comfort-signal scan (was: diagnosis/flags/notes only)
- `clinicalMeta.goalsOfCare === "comfort_only"` suppresses aggressive workup directly
- `isComfortCarePatient()` exported as a shared helper
- DNR/DNI alone confirmed non-suppressing

**Parser — no more silent section assignment**
- Default section changed from `SIDE_A` to `UNKNOWN_SECTION`
- Patients without a section header are explicitly marked — never silently placed in צד א
- `patientSectionLabel()` helper handles `UNKNOWN_SECTION` in all UI label sites

**Canonical lab thresholds**
- New `src/clinical/clinicalThresholds.ts` — single source of truth for K, Na, Hb, Lactate
- Creatinine marked `mode: "delta_only"` — raw Cr cannot trigger AKI badge without delta
- `isCriticalLabValue()` and `isWarningLabValue()` exported for component use

**Type system**
- `PatientClinicalMeta` (sexAtBirth, weightKg, onDialysis, baselineCreatinine, goalsOfCare)
- `PatientSyncMeta` (revision, lastModifiedAt, lastModifiedBy) — forward-compat for Phase 4
- `UNKNOWN_SECTION` added to `PATIENT_SECTIONS` and `PatientSection` union
- `normalizePatient()` defaults `clinicalMeta: {}` and `syncMeta` on boot — no crashes from old localStorage

**PatientCard acuity**
- Deleted local `calcAcuity()` duplicate
- Now uses `calculateAcuity(patient).score` from `src/engine/acuity.ts` everywhere

**Tests**
- 39 new Phase 1 acceptance tests in `src/__tests__/phase1.test.ts`
- Total: 992 passing (was 953)


Hebrew-language PWA for on-call geriatric ward shift management at Shaare Zedek Medical Center.

Live: **[toranot.netlify.app](https://toranot.netlify.app)**

## Recent Changes

- **feat(rules): DOAC bleeding/reversal rule** — New rule for rivaroxaban/apixaban/dabigatran: hold, CBC/coags, Andexanet/PCC for Xa-inhibitors, Idarucizumab for dabigatran, GI/ICH escalation paths.
- **feat(rules): hemoptysis workup rule** — New rule: CXR stat, CBC/coags, CTPA, anticoag review, massive threshold → bronchoscopy + ICU.
- **feat(ai): STOPP-START v3 in system prompt** — AI clinical reasoning now explicitly applies STOPP-START v3 alongside Beers 2023 for medication review.

- **fix(proxy): raise AI timeout** — Default upstream timeout raised 9s → 20s; clinical reasoning requests (max_tokens ≥ 2000) now use 23s long-timeout, fixing "תם הזמן המוקצב" errors in AIClinicalReasoning.
- **feat(handoff): kabalah morning summary** — Each admission in דוח משמרת now has ✨ סכם לבוקר AI button generating a 2-3 line Hebrew morning report summary.
- **fix(rules): remove nursing-scope rules** — Deleted aspiration_risk (3 tasks), pressure_ulcer (3 tasks), and delirium_nonpharm_bundle (5 tasks). These are nursing standing orders, not on-call doctor tasks. Delirium main rule collapsed from 15 → 6 actionable tasks; medication ladder consolidated into single reference line.
- **feat(sort): pending tasks sort** — New "⏳ לפי משימות" sort option. Patients with the most pending undone tasks float to top.
- **fix(handoff): new admissions first** — Admissions sort to top within each section in card view.
- **fix(handoff): report tab respects פעלתי filter** — Open urgent tasks and acted-on patients now filter correctly.
- **refactor(handoff): merge MorningReport into HandoffSheet** — Eliminated redundant modal. 5 tabs: כרטיסיות, דוח משמרת, שלילות, טקסט, ISBAR.
- **feat(handoff): editable admission summary** — Inline editor on new admissions in card view.
- **perf(scroll): content-visibility auto on patient cards** — Skip layout/paint for off-screen cards.
- **perf(re-renders): granular Zustand selectors for PatientCard**
- **perf(bundle): lazy-load PatientCard sub-panels** — Main bundle −15%.
- **ux(modals): animated transitions + prefers-reduced-motion**

---

## Architecture

```
src/
  context/
    reducer.ts          — state reducer + all Action types (extracted to break circular dep)
    PatientsContext.tsx  — thin React context shim over Zustand store
  store/
    patientsStore.ts    — Zustand store (source of truth, subscribeWithSelector middleware)
  engine/
    rules.ts            — geriatric task generation rules engine
    drugSafety.ts       — Beers Criteria 2023 + drug interaction alerts + allergy cross-check
    labDelta.ts         — KDIGO AKI / Hb delta alerting
    acuity.ts           — patient acuity scoring
    antibiotic/         — empiric antibiotic engine with SZMC DAG guidelines
  data/
    dosing.ts           — renal dosing table (19 antibiotics, CrCl bucket-based)
  parser/
    parsePatientList.ts — WhatsApp/nurse-call text → PatientEntry[]
  utils/
    renal.ts            — Cockcroft-Gault with frailty creatinine floor (≥75yo)
    labAlerts.ts        — critical lab value push notifications
  components/
    SimpleConfirm.tsx   — useSimpleConfirm + useSimpleToast (PWA-safe, replaces window.confirm/alert)
    InlineErrorBoundary.tsx — per-feature error boundary for Scanner/AI/Admission
  cloudSync.ts          — Supabase cloud sync, handoff codes, shared shifts, JWT auth helpers
netlify/functions/
  _utils.ts             — Supabase JWT verification (async checkAuth), rate limiting
  claude.ts             — Claude proxy
  gemini.ts             — Gemini OCR proxy
  ocr-proxy.ts          — PDF OCR pipeline
```

### Key architectural decisions

- **Zustand + React Context coexist**: `patientsStore` is the source of truth. `PatientsContext` wraps it for backward compatibility with 19 existing consumers. New code can use `usePatientsStore(selector)` for fine-grained subscriptions.
- **reducer.ts extracted**: Breaking `PatientsContext ↔ patientsStore` circular import. Both import from `reducer.ts`; neither imports the other.
- **No VITE_API_SECRET in bundle**: All Netlify function calls authenticated via Supabase JWT (`Authorization: Bearer <token>`). Legacy `API_SECRET` fallback for local dev only.
- **SPA redirect**: `netlify.toml` has `[[redirects]] /* → /index.html 200` for direct URL navigation.
- **Android PWA confirm/alert**: `window.confirm()` and `window.alert()` silently fail in standalone mode. All confirm dialogs use `useSimpleConfirm()` (inline React modal); all toasts use `useSimpleToast()`.

---

## Clinical Safety Features

### Beers Criteria 2023 (age ≥65)
- Z-drugs (zolpidem, zopiclone)
- Benzodiazepines
- Tramadol
- TCAs (amitriptyline, nortriptyline, doxepin)
- 1st-gen antihistamines (diphenhydramine, hydroxyzine, promethazine)
- 1st-gen antipsychotics (haloperidol, chlorpromazine)
- Sulfonylureas (glibenclamide, gliclazide, glipizide)
- NSAIDs
- Muscle relaxants (baclofen, cyclobenzaprine, tizanidine)
- Digoxin >0.125mg/d
- PPIs long-term >8 weeks (C.diff, fracture, hypomagnesaemia risk)
- Metoclopramide long-term (tardive dyskinesia)

### Drug interactions
- Benzo + Opioid (respiratory depression — critical)
- SSRI + Tramadol (serotonin syndrome)
- Triple Whammy: NSAID + ACEi/ARB + Furosemide (AKI — critical)
- Anticholinergic burden combos (delirium — per Beers 2023)
- QTc-prolonging drug combinations

### Renal dosing (CrCl buckets: normal / 10–50 / <10 / HD)
pip-tazo, ceftriaxone, cefazolin, cephalexin, cefepime, meropenem, aztreonam,
amox-clav, ciprofloxacin, levofloxacin, gentamicin, amikacin, vancomycin,
metronidazole, clindamycin, azithromycin, nitrofurantoin, fidaxomicin,
vancomycin PO, **TMP-SMX, ertapenem, linezolid, doxycycline**

**Frailty correction**: CrCl floored at 1.0 mg/dL for patients ≥75yo (AGS/ASHP — prevents overdosing from sarcopenic low creatinine).

### Rules engine (58 rule groups)
Auto-generates on-call tasks from patient diagnosis/flags/meds/status. Key groups:
`sepsis`, `aki`, `chf`, `delirium` (+ non-pharm bundle), `aspiration_risk`, `pressure_ulcer`,
`dvtpe`, `uti`, `pneumonia`, `comfort_sedation_symptom` (comfortCareOnly — qualitative checks only),
`fall`, `isolation`, `warfarin`, `iv_heparin`, `iv_insulin`, `iv_opioid/midazolam` (suppressed for comfort patients), and more.

---

## Security

- **JWT auth**: Netlify functions verify Supabase JWT via `/auth/v1/user` endpoint (3s timeout, fail-open on network error).
- **Rate limiting**: Upstash Redis sliding window — 30 req/min/IP for AI, 10 req/min/IP for OCR.
- **Content-Security-Policy**: set in `netlify.toml` headers.
- **Source maps**: `hidden` — deployed but no `sourceMappingURL` in JS bundles.
- **npm audit**: 0 vulnerabilities.

---

## Bundle sizes (gzipped)

| Chunk | Size |
|-------|------|
| vendor-react | 60 KB |
| index (main UI) | ~53 KB |
| app-engine (rules + drug safety) | ~41 KB |
| QuickReference | ~38 KB |
| app-context (Zustand store) | ~5 KB |
| app-utils (parser/utils) | ~4 KB |
| 11 lazy modals | 3–15 KB each |

---

## Development

```bash
npm install
npm run dev       # Vite dev server
npm test          # vitest run (706 tests)
npm run build     # tsc --noEmit + vite build
```

Requires Node ≥22. See `netlify.toml` for function configuration and CSP headers.

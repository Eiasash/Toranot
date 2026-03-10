# תורנות — Toranot

Hebrew-language PWA for on-call geriatric ward shift management at Shaare Zedek Medical Center.

Live: **[toranot.netlify.app](https://toranot.netlify.app)**

## Recent Changes

- **fix(SEO/BP):** Added valid `robots.txt` and explicit `Content-Type: text/plain` header — SPA catch-all was serving `index.html` for `/robots.txt`, causing 31 Lighthouse errors and Best Practices score of 91.

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
    drugSafety.ts       — Beers Criteria 2023 + drug interaction alerts
    labDelta.ts         — KDIGO AKI / Hb delta alerting
    acuity.ts           — patient acuity scoring
    antibiotic/         — empiric antibiotic engine with SZMC DAG guidelines
  data/
    dosing.ts           — renal dosing table (19 antibiotics, CrCl bucket-based)
  parser/
    parsePatientList.ts — WhatsApp/nurse-call text → PatientEntry[]
  utils/
    renal.ts            — Cockcroft-Gault with frailty creatinine floor (≥75yo)
  components/
    SimpleConfirm.tsx   — useSimpleConfirm + useSimpleToast (PWA-safe, replaces window.confirm/alert)
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

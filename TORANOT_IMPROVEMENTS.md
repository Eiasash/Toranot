# Toranot Auto-Generated Improvement Proposals
Generated: 2026-03-20
Audit session: claude/toranot-audit-fix-deploy-UcE0i

## Audit Summary
- TypeScript: CLEAN (0 errors)
- Tests: 1640 passed / 47 files (up from 1588 / 46)
- Bundle: 138.72 kB (target <140 kB) — reduced from 143.44 kB
- Rules: 57 groups, all unique, comfort care present
- Drug safety: All 4 exports present (checkDrugInteractions, checkRenalDoseWarnings, checkBeersCriteria, checkAllergyConflicts)
- Drug interactions: 38 interactions across 6 severity categories
- Beers Criteria 2023: 15 alert rules for ≥65yo patients
- Renal dosing: 24 antibiotics covered (all empiric protocols)

## Issues Fixed This Session

### 1. Dismissed task filter gaps (Clinical)
- `AIClinicalReasoning.tsx`: Open/done task aggregations now exclude `dismissed` tasks
- `ParsePreview.tsx`: Total task count, stat count, and per-patient task list now filter dismissed
- Root cause: generatedTasks were spread without `.filter(t => !t.dismissed)`, inflating counts and including suppressed tasks in AI reasoning context

### 2. Bundle size over 140 kB target
- `index.js` was 143.44 kB due to `DebugConsole.tsx` being pulled into main chunk
- Extracted debug interceptors into `src/utils/debugLog.ts` (lightweight, no React dependency)
- `main.tsx` now imports from `utils/debugLog` instead of `components/DebugConsole`
- DebugConsole remains lazy-loaded, saving ~4.7 kB from main chunk
- Result: 138.72 kB (under target)

### 3. Infrastructure additions
- Added `netlify/functions/toranot-keepalive.js` — pings Supabase every 5 days to prevent free-tier hibernation
- Added `.github/workflows/toranot-weekly-audit.yml` — Monday 7am Jerusalem automated audit (typecheck + tests + bundle guard)
- Updated `netlify.toml` with keepalive schedule

## Clinical Coverage Gaps

**Geriatric conditions not covered by any rule (by design — on-call acute focus):**

| Condition | Why Not Covered | Potential Rule? |
|-----------|----------------|-----------------|
| New-onset atrial fibrillation | No RVR management rule | **YES** — rate control (Metoprolol IV/PO), anticoag decision, ECG |
| Opioid-related constipation | No bowel protocol | **YES** — Senna + Docusate prophylaxis when opioid detected |
| Bradycardia / AV block | Not covered | **MAYBE** — atropine if symptomatic, pacing if high-grade |
| Hypothermia | Not covered | Low priority — rare in geriatric ward |
| Pain management (Paracetamol) | No standing orders | Low priority — nursing-driven |
| Chronic HTN management | Only emergency covered | No — chronic management is daytime work |
| Dementia baseline | Only in delirium/Beers context | No — admission workup, not on-call |
| Mild dehydration | Only under specific conditions | No — covered by existing rules (sepsis, AKI, etc.) |

**Recommended new rules (require human approval):**
1. `af_rvr` — New-onset AF with rapid ventricular response: rate control, ECG, anticoag assessment
2. `opioid_bowel` — Bowel protocol prophylaxis when opioid medications detected in patient data

*Never auto-add clinical rules — patient safety constraint.*

## Over-Triggering Rules
*Requires live dismissed-task analysis from Supabase — run Phase 4B queries against production data.*

Known design overlaps (handled by deduplication):
- Fever + Sepsis both generate "blood cultures x2" — caught by `applyRules()` dedup (line 1066-1072)
- Delirium + specific drugs (e.g., haloperidol) — intentional overlap; generic workup vs. drug-specific monitoring

## Drug Safety Coverage

### Drug Interactions (38 total)
| Category | Count | Key Examples |
|----------|-------|-------------|
| QT Prolongation | 8 | Amiodarone+Cipro, Haloperidol+Ondansetron |
| Bleeding Risk | 9 | Warfarin+NSAID (critical), DOAC+NSAID (critical) |
| Hyperkalemia | 6 | ACEi+Spironolactone, TMP-SMX+Spironolactone (critical) |
| Serotonin Syndrome | 4 | Linezolid+SSRI (critical), SSRI+Tramadol |
| Respiratory Depression | 1 | Benzodiazepine+Opioid (critical) |
| Nephrotoxicity | 8 | NSAID+ACEi/ARB Triple Whammy (critical) |

### Beers Criteria 2023 (15 rules)
Full coverage of high-risk geriatric medications: Zolpidem, benzodiazepines, tramadol, TCAs, first-gen antihistamines, first-gen antipsychotics, sulfonylureas, NSAIDs ≥75yo, muscle relaxants, digoxin, PPIs >8wk, metoclopramide, anticholinergic burden.

### Renal Dosing (24 antibiotics)
All empiric DAG antibiotics covered. Extended-infusion notes for Pip-Tazo and Meropenem.

**No gaps identified in drug safety coverage.**

## Bundle Size Trend
| Date | index.js | Status |
|------|----------|--------|
| 2026-03-20 (before) | 143.44 kB | OVER |
| 2026-03-20 (after) | 138.72 kB | OK |

## Proposed Next Session
1. **New rule: `af_rvr`** — Atrial fibrillation with rapid ventricular response (rate control, ECG, anticoag). Requires human review.
2. **New rule: `opioid_bowel`** — Bowel protocol prophylaxis when opioids detected. Requires human review.
3. **Dynamic import reminderScheduler in App.tsx** — still causes a Vite warning about mixed static/dynamic imports; could save another ~2-3 kB from main chunk
4. **Room simulation test expansion** — currently only 2 scenarios vs target of ≥104; add comprehensive room format test suite
5. **Component test coverage** — 41 components with 0 tests; prioritize PatientCard, PatientList, HandoffSheet

*All clinical rule additions require human review before implementation — patient safety constraint.*

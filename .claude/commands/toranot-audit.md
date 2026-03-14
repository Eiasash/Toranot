---
description: Full Toranot codebase audit — types, engine, security, state, tests, build
allowed-tools: Read, Bash, Grep, Edit, Write
---

You are auditing the Toranot codebase. Be brutal and precise. No sugar-coating.

## Step 1 — Run typecheck, tests, and build

!`npm run typecheck 2>&1 | tail -5`
!`npm test 2>&1 | tail -8`
!`npm run build 2>&1 | tail -5`

## Step 2 — Audit checklist

Work through each section. For every failure, note the file, line, root cause, and fix.

### 2a. Clinical engine correctness
- `src/engine/labDelta.ts` — KDIGO AKI staging: baseline guard (<=0), ratio math, float precision, peak tracking
- `src/engine/rules.ts` — comfort care suppression: every rule group respects `goalsOfCare === 'comfort'`
- `src/engine/drugSafety.ts` — Beers Criteria patterns use word boundaries, no false positives from partial matches
- `src/clinical/clinicalThresholds.ts` — thresholds match rules.ts usage (single source of truth, no hardcoded duplicates)
- `src/engine/mergeScan.ts` — 3-tier matching: strict → loose → stable key, whitespace normalization

### 2b. State management & reducer
- `src/context/reducer.ts` — all action types handled, normalizePatient/normalizeTask cover all fields with defaults
- `src/store/patientsStore.ts` — Zustand subscriptions persist all state slices, storage-full event dispatched on quota errors
- Bed collision: EDIT_PATIENT, MOVE_PATIENT, NEW_ADMISSION, ADD_PATIENT all check bedOccupiedBy
- REAPPLY_RULES preserves done state, dismissals survive across multiple calls
- ARCHIVE_SHIFT strips photos before saving (no localStorage explosion)

### 2c. Security
- `src/components/AIClinicalReasoning.tsx` — API key not stored when proxy available, DOMPurify sanitizes AI output
- `netlify/functions/_utils.ts` — auth is fail-closed (Supabase timeout → require API_SECRET, not open)
- `netlify/functions/claude.ts` — model/max_tokens clamped, content-type whitelist
- No API keys in client bundle (check `VITE_` prefixed env vars)
- CSP headers in `netlify.toml`

### 2d. Type safety
- `src/types/patient.ts` — WardEvent union covers all event types used in reducer
- No `as any` or unsafe casts in engine/ or context/ directories
- All new patient fields have defaults in normalizePatient

### 2e. Cloud sync
- `src/cloudSync.ts` — echo suppression, debounce, retry with backoff, conflict detection
- `src/sync/patientMerge.ts` — revision tracking, bumpRevision called correctly
- REVISION_EXEMPT_ACTIONS covers all non-patient-mutating actions

### 2f. Test coverage gaps
- Count tests: `grep -c "it\|test(" src/__tests__/*.test.ts | awk -F: '{s+=$2}END{print s}'`
- Engine tests (rules, drugSafety, labDelta) — highest priority, should be comprehensive
- Reducer tests — all action types covered?
- Any untested critical paths?

## Step 3 — Summary

Produce a table:

| Area | Status | Issues found |
|------|--------|-------------|
| Typecheck | pass/fail | |
| Tests | N/N passing | |
| Build | pass/fail | |
| Clinical engine | pass/fail | |
| State management | pass/fail | |
| Security | pass/fail | |
| Type safety | pass/fail | |
| Cloud sync | pass/fail | |

Then list every fix needed with: **file → exact problem → fix required**.

Do NOT apply fixes in this command. Use `/toranot-fix` for that.

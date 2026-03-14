---
description: Apply a targeted fix to Toranot. Arg: area to fix (e.g. engine, reducer, security, types, all)
argument-hint: [area: engine|reducer|security|types|sync|all]
allowed-tools: Read, Bash, Edit, Write, Grep
---

Fix area: **$ARGUMENTS**

Read CLAUDE.md for full constraints before touching anything.

## Pre-fix

1. Run typecheck: `npm run typecheck 2>&1 | tail -5`
2. Run tests: `npm test 2>&1 | tail -5`
3. Note current pass count and error count.

## Fix protocol

For the area **$ARGUMENTS**, apply ALL needed fixes from the audit. Rules:

- TypeScript strict mode — no `any`, no unsafe casts
- All UI text in Hebrew
- Engine functions must be pure — no side effects, no API calls
- Lab thresholds come from `src/clinical/clinicalThresholds.ts` (single source of truth)
- New patient fields must be optional with defaults in normalizePatient
- New WardEvent types must be added to the union in `src/types/patient.ts`
- After every file edit, verify the change is correct by reading it back

### For `engine`:
- `src/engine/labDelta.ts`: KDIGO staging, float precision, peak tracking
- `src/engine/rules.ts`: comfort care suppression, threshold source of truth
- `src/engine/drugSafety.ts`: pattern precision, Beers criteria, renal dosing
- `src/engine/mergeScan.ts`: patient matching, whitespace normalization

### For `reducer`:
- `src/context/reducer.ts`: bed collision feedback, action handling, normalization
- `src/store/patientsStore.ts`: persistence subscriptions, photo migration

### For `security`:
- `src/components/AIClinicalReasoning.tsx`: API key handling, output sanitization
- `netlify/functions/_utils.ts`: auth fail-closed, rate limiting
- `netlify/functions/claude.ts`: input validation, content-type whitelist

### For `types`:
- `src/types/patient.ts`: WardEvent union, PatientEntry fields
- `src/context/reducer.ts`: normalizePatient, normalizeTask defaults

### For `sync`:
- `src/cloudSync.ts`: echo suppression, conflict resolution
- `src/sync/patientMerge.ts`: revision bumping
- `src/context/reducer.ts`: REVISION_EXEMPT_ACTIONS

### For `all`:
Apply all of the above in sequence.

## Post-fix

Run in this exact order:
```bash
npm run typecheck 2>&1 | tail -5
npm test 2>&1 | tail -8
npm run build 2>&1 | tail -5
```

ALL must pass. If typecheck fails: fix type errors first. If tests fail: diagnose and fix.

Report what was changed and the final test/typecheck status.
Do NOT push — use `/toranot-deploy` for that.

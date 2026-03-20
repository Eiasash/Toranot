# Toranot Auto-Generated Improvement Proposals
Generated: 2026-03-20
Audit session: claude/toranot-audit-fix-deploy-UcE0i

## Audit Summary
- TypeScript: CLEAN (0 errors)
- Tests: 1640 passed / 47 files (up from 1588 / 46)
- Bundle: 138.72 kB (target <140 kB) — reduced from 143.44 kB
- Rules: 57 groups, all unique, comfort care present
- Drug safety: All 4 exports present (checkDrugInteractions, checkRenalDoseWarnings, checkBeersCriteria, checkAllergyConflicts)

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
*Requires Supabase query against live patient data — see Phase 4A of audit skill.*
*No patient data available in this environment for diagnosis-level analysis.*

## Over-Triggering Rules
*Requires live dismissed-task analysis from Supabase — see Phase 4B of audit skill.*

## Drug Safety Gaps
*Pending detailed analysis — agent running.*

## Bundle Size Trend
| Date | index.js | Status |
|------|----------|--------|
| 2026-03-20 (before) | 143.44 kB | OVER |
| 2026-03-20 (after) | 138.72 kB | OK |

## Proposed Next Session
1. **Dynamic import reminderScheduler in App.tsx** — still causes a Vite warning about mixed static/dynamic imports; could save another ~2-3 kB from main chunk
2. **Room simulation test expansion** — currently only 2 scenarios vs target of ≥104; add comprehensive room format test suite
3. **Scanner.tsx room normalization** — Scanner delegates to parser (by design), but adding explicit room normalization in Scanner's `normalizeAndGroupBySection` would catch OCR formatting issues earlier
4. **Component test coverage** — 41 components with 0 tests; prioritize PatientCard, PatientList, HandoffSheet
5. **Supabase clinical analysis** — run Phase 4A/4B queries against live data to find diagnosis coverage gaps and over-triggering rules

*All clinical rule additions require human review before implementation — patient safety constraint.*

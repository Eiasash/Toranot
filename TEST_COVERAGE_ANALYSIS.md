# Test Coverage Analysis

**Date:** 2026-03-10
**Current state:** 826 tests across 24 test files (824 passing, 2 pre-existing failures in cloudSync)

## Overview

| Category | Source files | Test files | Tests | Coverage Quality |
|----------|-------------|------------|-------|-----------------|
| Engine / Business Logic | 8 | 8 | ~430 | Good |
| Utilities | 9 | 8 | ~100 | Moderate |
| Parser | 1 | 1 | 37 | Moderate |
| State Management (reducer) | 1 | 1 | 105 | Good |
| State Management (store) | 1 | 0 | 0 | **None** |
| Components | 41 | 0 | 0 | **None** |
| Cloud Sync | 1 | 1 | 19 | Gaps |

---

## Areas to Improve

### 1. Zustand Store (`src/store/patientsStore.ts`) — No tests at all

This is the most critical gap. The store is the central persistence layer wrapping the reducer with Zustand middleware. It handles:

- **`loadSavedPatients()`** — Hydrating state from localStorage on startup
- **`loadShiftHistory()`, `loadDarkMode()`, `loadShowTomorrow()`** — Individual key loaders
- **Persistence subscriptions** — Auto-saving state changes back to localStorage
- **Selector helpers** — `usePatientById`, `useActiveSection`, etc.

**Why it matters:** The test runner already emits `localStorage is not defined` warnings from this module, proving it's exercised indirectly but never tested directly. A corrupted localStorage, a quota exceeded error, or a Zustand hydration failure would silently break the app.

**Suggested tests:**
- Each loader function with valid, corrupt, and missing localStorage data
- Persistence round-trip (dispatch → localStorage → reload → state matches)
- `safeGetItem`/`safeSetItem` behavior when localStorage throws (quota exceeded)
- Selector stability (selectors return referentially equal values when unrelated state changes)

---

### 2. Component tests — 41 components, 0 tests

No React component has any test coverage. Key components with significant logic:

| Component | Logic worth testing |
|-----------|-------------------|
| `DrugSafetyAlerts` | Renders interaction warnings; filters by severity |
| `LabTracker` | Contains `parseBulkLabs` (tested indirectly) but rendering logic untested |
| `PatientCard` | Displays acuity badge, task counts, flags — core UX surface |
| `ParsePreview` | Shows parsed patient data before import — user-facing validation step |
| `HandoffSheet` | Generates shift handoff documents — clinical safety concern |
| `TaskItem` | Task completion toggle, countdown timers, urgency indicators |
| `ShiftHandoffModal` | QR code generation, code display, cloud push |
| `MorningReport` | Aggregates overnight events — must be accurate for clinical handoff |

**Suggested approach:** Add `@testing-library/react` + `jsdom` environment, then start with smoke/render tests for the most safety-critical components (`DrugSafetyAlerts`, `HandoffSheet`, `MorningReport`).

---

### 3. Cloud Sync (`src/cloudSync.ts`) — 2 failing tests + missing scenarios

**Pre-existing failures:**
- `getProxyAuthHeaders` returns a key even when no Supabase session exists (env variable leaking into test)
- `isProxyAvailableAsync` returns true when it should return false for the same reason

**Missing coverage:**
- Conflict detection with diverged patient lists (currently mocked away)
- Push retry with exponential backoff (timing not verified)
- Echo suppression logic (`lastPushedJson` comparison)
- Concurrent push/pull race conditions
- Shared shift expiry at exact boundary (`expires_at = now`)
- Cloud import with corrupted or schema-incompatible data

---

### 4. Parser edge cases (`src/parser/parsePatientList.ts`)

The parser has 37 tests but handles complex free-text input (WhatsApp messages, nurse calls). Missing scenarios:

- **Invalid/missing age**: What happens with `"ABC"` instead of `"72"`?
- **Incomplete patient lines**: Room-only lines with no patient name
- **Multiple `tomorrowNotes`** in a single line
- **Whitespace-only sections** between patients
- **Very long input**: Performance with 500+ patients in one paste
- **Mixed language edge cases**: Hebrew condition names with English medication names in the same line

---

### 5. Rules engine cross-interactions (`src/engine/rules.ts`)

The rules engine has 151 tests covering 29+ rule groups individually, but:

- **No multi-rule interaction tests**: A real patient may trigger sepsis + AKI + AF + CKD simultaneously. No test verifies what happens when 5+ rule groups fire at once (task deduplication, ordering stability, total task count).
- **Not all 58 rule groups have positive+negative tests**: Some rules are only tested via the comfort-care suppression suite.
- **`planNotes` vs `status` distinction edge cases**: The parser routes text to different fields, and rules match on different fields — but no test verifies that a keyword in `planNotes` does NOT incorrectly trigger a rule that should only match `status`.

---

### 6. Drug Safety — brand names & edge cases (`src/engine/drugSafety.ts`)

73 tests cover the core interaction engine well, but:

- **Brand name variants**: Only generic names are tested. Real clinical data uses brand names (Rocephin = ceftriaxone, Tazocin = piperacillin/tazobactam). If `DRUG_PATTERNS` includes brand names, they need test coverage.
- **Dialysis patients**: `onDialysis` flag should force CrCl bucket to `"hd"` — not tested.
- **Age boundary for Beers Criteria**: The cutoff is age >= 65. No test verifies that age 64 does NOT trigger Beers alerts.
- **Null/undefined patient age**: What happens when age is missing? Could cause NaN propagation in CrCl.

---

### 7. Renal calculations (`src/utils/renal.ts`) — Only 4 tests

The Cockcroft-Gault calculation is clinically critical (medication dosing depends on it) but has minimal coverage:

- No test for CrCl = 0 or negative creatinine
- No test for extreme ages (e.g., age 110)
- No test verifying the frailty creatinine floor value
- No test for weight = 0 or undefined

---

### 8. Sort stability (`src/utils/sortPatients.ts`) — Only 8 tests

- No stability test (patients with equal room/bed should maintain insertion order)
- No test with non-standard room formats (`"ICU-A"`, `"Rehab-3"`)
- No test for null/undefined room field

---

## Priority Ranking

| Priority | Area | Impact | Effort |
|----------|------|--------|--------|
| **P0** | Zustand store persistence tests | High — silent data loss risk | Medium |
| **P0** | Fix 2 failing cloudSync tests | High — CI is red | Low |
| **P1** | Component smoke tests (top 5 safety-critical) | High — clinical UX | Medium |
| **P1** | Multi-rule interaction tests | High — task correctness | Low |
| **P1** | Renal calculation edge cases | High — dosing safety | Low |
| **P2** | Parser robustness (malformed input) | Medium — import reliability | Low |
| **P2** | Drug safety brand names + dialysis | Medium — alert completeness | Low |
| **P2** | Cloud sync conflict/race conditions | Medium — data integrity | Medium |
| **P3** | Sort stability | Low — cosmetic ordering | Low |
| **P3** | Performance benchmarks (large patient lists) | Low — rare scenario | Medium |

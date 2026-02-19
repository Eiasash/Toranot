# Test Coverage Analysis — Toranot

## Current State

**Test framework:** Vitest 4.0.18
**Test files:** 3
**Test cases:** 19 (all passing)
**Source files:** 22 (excluding CSS/env declarations)
**Files with tests:** 3 (~14% file coverage)

### What's tested

| File | Tests | Cases |
|------|-------|-------|
| `src/parser/parsePatientList.ts` | `parsePatientList.test.ts` | 10 — room parsing (6 formats), section headers, task extraction, task source |
| `src/engine/mergeScan.ts` | `mergeScan.test.ts` | 6 — dedup, stable IDs, manual task persistence, done-state preservation, cross-section retention |
| `src/engine/rules.ts` | `rules.test.ts` | 3 — BS rule trigger, BS categorization, BS/DM disambiguation |

### What's NOT tested

| File | Size | Risk |
|------|------|------|
| `src/engine/rules.ts` (remaining rules) | 20,849B | **High** — only 1 of 26 rules is tested |
| `src/context/PatientsContext.tsx` (reducer) | 12,129B | **High** — all state mutations untested |
| `src/utils/patientKey.ts` | 680B | **Medium** — dedup correctness depends on this |
| `src/utils/id.ts` | 192B | **Low** — simple, but uniqueness guarantees unverified |
| `src/types/patient.ts` (section detection) | 3,973B | **Medium** — `detectSectionFromHeader` and `detectSectionFromRoom` have branchy logic |
| All 13 components | — | Out of scope for unit tests (would need React Testing Library) |

---

## Proposed Improvements — Priority Order

### 1. Expand rules engine coverage (HIGH PRIORITY)

**File:** `src/engine/rules.ts`
**Current state:** Only the BS (Bladder Scan) rule is tested. There are **26 rules** total.
**Risk:** Rule regex patterns are complex and handle Hebrew + English + medical abbreviations. Silent regressions are likely.

**Recommended tests:**
- **Each rule triggers correctly** — at minimum one positive test per rule (discharge, NPO, pre-op, blood transfusion, diabetes, fall risk, isolation, catheter, pneumonia, UTI, sepsis, cellulitis, C. diff, fever, AKI, hyperkalemia, hypokalemia, chest pain/ACS, CHF, DVT/PE, delirium, GI bleed, warfarin/INR, COPD, hypoglycemia, new admission, hyponatremia, stroke/TIA)
- **Group deduplication** — verify that two rules in the same group don't double-fire (e.g., a patient with both "cellulitis" and "צלוליטיס" should only get one set of tasks)
- **Negative cases** — verify rules don't trigger on similar but unrelated text (like the existing BS/DM disambiguation test)
- **Task metadata** — verify urgency, category, and generatedFrom are set correctly for each rule
- **Combined triggers** — a patient with multiple conditions (e.g., "סוכרת" + "NPO") should generate tasks from both rules

**Estimated new tests:** ~35-45

### 2. Test the reducer / state management (HIGH PRIORITY)

**File:** `src/context/PatientsContext.tsx`
**Current state:** Zero tests. The reducer has 17 action types handling all app state mutations.
**Risk:** Every user interaction flows through this reducer. Bugs here affect all functionality.

**Recommended tests (extract reducer as a pure function and test directly):**
- `IMPORT_TEXT` — parsing + merge integration
- `TOGGLE_TASK` — toggles done/doneTime on both `tasks` and `generatedTasks`
- `SET_TASK_NOTE` — sets note on correct task
- `SET_TASK_DUE` — sets dueAt on correct task
- `ADD_TASK` — adds manual task with correct urgency inference, rejects empty text
- `ADD_NOTE` / `REMOVE_NOTE` — add/remove with dedup and bounds checking
- `ADD_LAB` — appends lab entry
- `REORDER_PATIENT` — up/down swap within section, boundary behavior
- `EDIT_PATIENT` — partial updates (name, room, section, diagnosis)
- `REMOVE_PATIENT` — removes correct patient
- `ARCHIVE_SHIFT` — creates snapshot, limits history to 5
- `RESTORE_SHIFT` — restores with normalization
- `DELETE_SHIFT` — removes correct snapshot
- `CLEAR_ALL` — empties patients array
- `TOGGLE_DARK_MODE` / `TOGGLE_SHOW_TOMORROW` — boolean toggles

**Also test the helper functions:**
- `normalizeTask` — handles missing/malformed fields gracefully
- `normalizePatient` — handles missing arrays, non-array values
- `inferUrgencyFromText` — Hebrew and English urgency keywords

**Estimated new tests:** ~25-30

### 3. Test patientKey utilities (MEDIUM PRIORITY)

**File:** `src/utils/patientKey.ts`
**Current state:** Zero tests. Used by `mergeScan` for dedup.
**Risk:** If normalization breaks, rescans create duplicate patients or lose data.

**Recommended tests:**
- `normalize` handles null, undefined, empty string
- `normalize` strips whitespace, lowercases, removes non-alphanumeric
- `normalize` preserves Hebrew characters
- `buildPatientKey` produces correct `section|room|name` format
- `buildPatientLooseKey` produces correct `room|name` format (no section)
- Two patients differing only by whitespace/case produce the same key
- Two genuinely different patients produce different keys

**Estimated new tests:** ~8-10

### 4. Test section detection functions (MEDIUM PRIORITY)

**File:** `src/types/patient.ts`
**Current state:** Indirectly tested via `parsePatientList` section header test. No direct unit tests.
**Risk:** Incorrect section detection misassigns patients to wrong ward sections.

**Recommended tests for `detectSectionFromHeader`:**
- All Hebrew section names: "צד א", "צד ב", "צד ג", "שיקום", "ניטור"
- English variants: "side a", "rehab", "monitor"
- With trailing separators: "צד א:", "צד ב -"
- Rejects lines with digits (patient rows, not headers)
- Returns null for unknown text

**Recommended tests for `detectSectionFromRoom`:**
- "ניטור1" → MONITOR
- "מוניטור 3" → MONITOR
- "101" → null
- null → null

**Estimated new tests:** ~12-15

### 5. Test parsePatientList edge cases (MEDIUM PRIORITY)

**File:** `src/parser/parsePatientList.ts`
**Current state:** 10 tests covering the basics. Key gaps remain.

**Recommended additional tests:**
- **Multi-patient parsing** — a full multi-line document with all sections
- **Diagnosis extraction** — verify diagnosis field is populated from remaining tokens
- **Age parsing** — valid ages, edge cases (0, 150, non-numeric)
- **Flag extraction** — DNR, DNI, NPO, FALL, ISO, MRSA, VRE, ESBL, C.DIFF
- **Urgency detection** — "דחוף", "סטט", "STAT", "אורגנטי", "בוקר", "שגרה"
- **Time extraction** — "16:30", "8:00", no time present
- **Task classification** — imaging ("CT", "צילום"), labs ("בדיקת דם"), procedure ("BS"), discharge ("שחרור"), consult ("ייעוץ")
- **Tomorrow notes** — segments with "מחר" or "לבוקר" go to `tomorrowNotes`, not `tasks`
- **Column-labeled input** — "תורן: ..." format
- **Empty/malformed input** — empty string, whitespace-only lines, very short lines
- **Confidence calculation** — verify confidence score based on present fields

**Estimated new tests:** ~15-20

### 6. Add mergeScan edge cases (LOW PRIORITY)

**File:** `src/engine/mergeScan.ts`
**Current state:** 6 solid tests. Some edge cases missing.

**Recommended additional tests:**
- **Transfer detection** — patient moves from SIDE_A to SIDE_B (same room+name, different section)
- **Notes merging** — dedup of notes across old and new entries
- **New patient addition** — incoming patient with no existing match is added fresh
- **Multiple rescans** — chain of 3+ scans preserves accumulated state
- **Empty incoming scan** — all existing patients are kept

**Estimated new tests:** ~5-8

---

## Infrastructure Recommendations

### Add tests to CI/CD

The GitHub Actions deploy workflow (`deploy.yml`) currently does **not** run tests. The build step should include `npm run test` before `npm run build` to prevent regressions from reaching production.

### Enable coverage reporting

Add a coverage script to `package.json`:
```json
"test:coverage": "vitest run --coverage"
```
Install `@vitest/coverage-v8` and add a coverage threshold configuration to prevent coverage regression.

---

## Summary

| Priority | Area | Estimated Tests | Impact |
|----------|------|-----------------|--------|
| HIGH | Rules engine (remaining 25 rules) | 35-45 | Prevents silent rule regressions |
| HIGH | Reducer / state management | 25-30 | Guards all user-facing state mutations |
| MEDIUM | patientKey utilities | 8-10 | Prevents dedup failures on rescan |
| MEDIUM | Section detection | 12-15 | Prevents ward misassignment |
| MEDIUM | Parser edge cases | 15-20 | Improves OCR parsing robustness |
| LOW | mergeScan edge cases | 5-8 | Covers transfer and multi-scan scenarios |
| **Total** | | **~100-128** | |

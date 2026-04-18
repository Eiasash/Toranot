---
name: handoff-format
description: Canonical format for Toranot `.cowork/<slug>.md` handoff files. Load whenever writing or reading a handoff. Enforces the five required sections and what belongs in each.
---

# cowork handoff format (Toranot)

Handoff files live at `.cowork/<slug>.md`, one per active cowork branch, committed to the branch.

## Required sections, in order

### Header
```
# <slug>

**Branch:** cowork/<slug>
**Last session:** YYYY-MM-DD (model)
**Status:** in-progress | blocked: <reason> | ready-to-land
```

### Goal
One paragraph. What is this branch trying to achieve, in the language of the rules engine / clinical note / SZMC workflow. Never rewrite after the first session — this is the anchor.

### Done
Bulleted, grouped by concern. Each bullet names a concrete artifact:
- `src/engine/rules.ts` — added rule `polypharmacy-anticoag-v2` (group: polypharmacy-anticoag).
- `src/engine/__tests__/rules.test.ts` — 3 new cases, all pass.
- NOT allowed: `cleaned up some stuff`, `improved error handling`. Be specific or omit.

### Next
One or two bullets, each a concrete next action. Use imperative voice that names the file and the change.
- `[ ] Add test for comfort-care suppression in src/engine/__tests__/rules.test.ts`.
- NOT allowed: `[ ] Continue the work`, `[ ] Review`.

### Tests
One line per suite, current state:
- `npm test -- rules` : PASS
- `npm run typecheck` : PASS
- `npm test -- drugSafety` : FAIL (1 pre-existing, unrelated)

### Notes for the next Claude
Only non-obvious things. If a future reader would ask "why?", answer here. Examples:
- Why a test is `.skip`ped and under what condition to re-enable.
- A rule you deliberately did NOT add because it overlaps with drugSafety.ts.
- A half-finished Hebrew rewrite waiting on glossary clarification.

## What NOT to include
- A summary of the conversation with the user — use commit messages.
- Restatements of the diff — use `git diff`.
- Plans that could be follow-up branches — use GitHub issues.

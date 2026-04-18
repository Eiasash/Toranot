---
description: Resume a cowork session by reading its handoff and verifying state
---

You are picking up a cowork session cold. Do NOT ask the user what was going on — read the handoff.

1. `git rev-parse --abbrev-ref HEAD`. If not `cowork/*`, ask which branch to check out, then `git checkout` it.
2. Read `.cowork/<slug>.md`. Print **Goal**, **Next**, **Notes for the next Claude** verbatim.
3. Verify state hasn't drifted since handoff:
   - `git log --oneline -5`
   - `git status --porcelain` (uncommitted stuff is suspicious — flag it)
   - `npm test --silent` and `npm run typecheck`. If any suite that was PASS in the handoff is now FAIL, STOP and flag the regression before doing new work.
4. State in one sentence what you are about to do, mapped to the **Next** bullet.

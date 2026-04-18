---
description: Write or refresh the handoff file for the current cowork branch
---

Refresh `.cowork/<slug>.md` for the current branch so the next Claude session can resume cold.

1. `git rev-parse --abbrev-ref HEAD` — must start with `cowork/`. If not, stop.
2. `git status --porcelain`, `git diff --stat main...HEAD`, `git log --oneline main..HEAD`.
3. Run `npm test --silent` and `npm run typecheck` (if present). Capture pass/fail per suite — do NOT paste full output.
4. Update the handoff file:
   - **Status** — `in-progress` unless all tests pass and diff looks landable (`ready-to-land`), or unless you hit an unresolved error (`blocked: <one line>`).
   - **Done** — bullet what got added/changed since the previous handoff, grouped by concern (rule, test, UI, supabase).
   - **Next** — one concrete next action. Must be a tool call or file path, not a vague verb.
   - **Tests** — one line per suite with PASS/FAIL.
   - **Notes for the next Claude** — ONLY include non-obvious things: intentional workarounds, half-finished refactors, why a test is skipped, a rules-engine invariant you almost broke.
5. `git add .cowork/ && git commit -m "cowork: handoff"`. Do not push.
6. Print the updated file so the user can read it.

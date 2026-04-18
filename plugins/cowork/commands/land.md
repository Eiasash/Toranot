---
description: Land the current cowork branch onto main — enforce golden-rule invariant, tests, typecheck, then prep a squash message
---

You are about to merge a cowork branch. Be slow and careful — this affects shared state.

1. Branch check: `git rev-parse --abbrev-ref HEAD` must start with `cowork/`. Abort otherwise.
2. `git fetch origin main && git rebase origin/main`. If conflicts, STOP and print them. Do not auto-resolve clinical rule conflicts.
3. Golden-rule invariant check (Toranot-specific): if `src/engine/rules.ts` changed, grep the diff for every new `id:` and confirm each has (a) a unique group, (b) a comfort-care suppression branch, (c) a matching test in `src/engine/__tests__/`. Missing any → block and list what's missing.
4. `npm test --silent` — all suites must pass. `npm run typecheck`. `npm run build` if fast.
5. Read `.cowork/<slug>.md`. Draft a squash-merge message: first line `<type>(scope): <goal>`, body = the **Done** bullets, footer = `Cowork-branch: cowork/<slug>`.
6. Print the draft message and the commands the user needs to run (`git checkout main`, `git merge --squash cowork/<slug>`, etc.). Do NOT merge or push yourself — this is a confirmation step.

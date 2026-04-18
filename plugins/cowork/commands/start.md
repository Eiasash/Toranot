---
description: Cut a new cowork/<slug> branch off main and scaffold its handoff file
argument-hint: <slug>  (kebab-case topic, e.g. polypharmacy-v3)
---

You are starting a new Toranot cowork session.

1. Read the current branch with `git rev-parse --abbrev-ref HEAD`. If it is not `main`, stop and ask — do not stack cowork branches.
2. `git fetch origin main && git checkout -b cowork/$ARGUMENTS origin/main`.
3. Create `.cowork/$ARGUMENTS.md` using the template in `plugins/cowork/README.md`. Fill in:
   - **Goal** — ask the user one sentence if you can't infer it.
   - **Done** — empty.
   - **Next** — `[ ] define scope`.
   - **Tests** — run `npm test --silent 2>&1 | tail -20` and paste the result.
4. `git add .cowork/$ARGUMENTS.md && git commit -m "cowork: start $ARGUMENTS"`.
5. Print the branch name and the path to the handoff file. Do not push — let the user review first.

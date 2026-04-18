---
description: List all cowork/* branches with ahead/behind, handoff status, and rule-count delta
---

Survey all cowork branches so the user can decide which to land, resume, or abandon.

1. `git fetch origin --prune`.
2. `git for-each-ref --format='%(refname:short)' refs/heads/cowork refs/remotes/origin/cowork` — dedupe.
3. For each branch, compute in parallel:
   - `git rev-list --left-right --count origin/main...<branch>` → ahead/behind main.
   - Read `.cowork/<slug>.md` if present; extract **Status** and **Last session** lines.
   - Rule-count delta: `git show <branch>:src/engine/rules.ts 2>/dev/null | grep -c "id:"` minus same on main.
4. Print a markdown table: `branch | status | ahead/behind | rule delta | last session`.
5. End with a one-line recommendation: which branch to land first (smallest diff + `ready-to-land`), which looks stale (>14 days old handoff).

---
name: "source-command-toranot-update-skill"
description: "Auto-update SKILL.md (toranot-dev) with current ground truth. Run after every deploy or when skill feels stale."
---

# source-command-toranot-update-skill

Use this skill when the user asks to run the migrated source command `toranot-update-skill`.

## Command Template

You are updating the toranot-dev SKILL.md file to reflect current ground truth.
Do NOT make any code changes. Only update the skill file.

## STEP 1 — Pull live state from snapshot endpoint
```
GET https://toranot.netlify.app/api/skill-snapshot
# Direct path equivalent: /.netlify/functions/skill-snapshot
```
Extract: patientCount, lastStateUpdate, backupCount, errorCount, health status.
If endpoint is down, proceed with manual checks.

## STEP 2 — Manual verification (always run)
```bash
# Test count
npx vitest run 2>&1 | grep -E "passed|failed"

# Test file count
ls src/__tests__/*.test.ts | wc -l

# Bundle size
npx vite build 2>&1 | grep "dist/index" | grep -oP '\d+\.\d+ kB'

# Rules count
grep -c "group:" src/engine/rules.ts

# Component count
ls src/components/*.tsx | wc -l

# Current package version
cat package.json | grep '"version"'

# TypeScript clean
npx tsc --noEmit && echo "TS: clean" || echo "TS: ERRORS"
```

## STEP 3 — Update SKILL.md

Patch exactly these fields (leave everything else untouched):

| Field | Location in skill | Source |
|-------|------------------|--------|
| Test count | §1 Overview table + §9 Gotchas | vitest run output |
| Test file count | §1 Overview table | ls count |
| Bundle size | §1 Overview table | vite build output |
| Rules count | §4 engine section | grep count |
| Component count | §1 repo structure | ls count |
| Last audited date | Top of relevant section | today's date |

## STEP 4 — Commit via branch + PR (single-lane AGENTS.md)
```bash
git add SKILL.md 2>/dev/null || true
# If skill file is in project knowledge, note the updates needed manually
if ! git diff --cached --quiet; then
  # Branch name uses full date+time AND short HEAD sha. The HHMMSS
  # component guarantees uniqueness on reruns (the prior date-only +
  # short_sha pattern still collided when HEAD had not moved between
  # the failed run and its retry — Codex P1 on PR #99). Two runs would
  # have to fire in the same wall-clock second to collide.
  short_sha=$(git rev-parse --short HEAD)
  git checkout -b "Codex/skill-currency-$(date +%Y%m%d-%H%M%S)-${short_sha}"
  git commit -m "docs: auto-update toranot skill $(date +%Y-%m-%d) [skip ci]"
  git push -u origin HEAD
  gh pr create --base main \
    --title "docs: refresh skill currency $(date +%Y-%m-%d)" \
    --body "Auto-opened by /toranot-update-skill. Docs-only, no source changes."
fi
```
Per audit-fix-deploy SKILL § D.5, this docs-only PR is eligible for self-merge
after Codex green (or after a meaningful Codex absence with override rationale).

If nothing changed, say "Skill file already up to date — no commit needed."

## IMPORTANT NOTES
- Hebrew files may contain invisible U+200F characters — use Python subprocess for str_replace if tool fails
- Never modify clinical rule logic or drug safety logic in this command — read-only skill update only
- If test count changed, verify reason before updating — unexpected change = possible regression

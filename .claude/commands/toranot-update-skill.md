---
description: Auto-update SKILL.md (toranot-dev) with current ground truth. Run after every deploy or when skill feels stale.
---

You are updating the toranot-dev SKILL.md file to reflect current ground truth.
Do NOT make any code changes. Only update the skill file.

## STEP 1 — Pull live state from snapshot endpoint
```
GET https://toranot.netlify.app/.netlify/functions/skill-snapshot
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

## STEP 4 — Commit
```bash
git add SKILL.md 2>/dev/null || true
# If skill file is in project knowledge, note the updates needed manually
git diff --cached --quiet || git commit -m "docs: auto-update toranot skill $(date +%Y-%m-%d) [skip ci]"
git push origin main
```

If nothing changed, say "Skill file already up to date — no commit needed."

## IMPORTANT NOTES
- Hebrew files may contain invisible U+200F characters — use Python subprocess for str_replace if tool fails
- Never modify clinical rule logic or drug safety logic in this command — read-only skill update only
- If test count changed, verify reason before updating — unexpected change = possible regression

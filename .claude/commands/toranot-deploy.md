---
description: Typecheck, test, build, branch+commit, push, and open a PR for Toranot
argument-hint: [commit/PR message]
allowed-tools: Bash, Read
---

Ship the current working-tree changes as a PR with message: **$ARGUMENTS**

Per repo `CLAUDE.md` single-lane operating model — **never push to main directly**.
All work goes through `claude/<slug>` → PR → CI green + Codex review → self-merge.

## Pre-deploy checks (abort if any fail)

### 1. TypeScript check
!`npm run typecheck 2>&1`

If any errors: STOP. Do not proceed. Report the error and suggest using `/toranot-fix`.

### 2. Tests
!`npm test 2>&1`

If any test fails: STOP. Do not proceed. Report the failure and suggest using `/toranot-fix`.

### 3. Build
!`npm run build 2>&1`

If build fails: STOP. Report the error.

### 4. No sensitive data
!`grep -rn "sk-ant-\|ANTHROPIC_API_KEY\|GEMINI_API_KEY" src/ --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "placeholder\|example\|comment\|\.env" | head -5`

If matches found: WARN — potential API key in source.

## Branch + push + PR

```bash
# Derive a short kebab-case slug from $ARGUMENTS
slug=$(echo "$ARGUMENTS" | tr '[:upper:]' '[:lower:]' \
  | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g' | cut -c1-40)
git checkout -b "claude/${slug}"

git add -A
git status

git commit -m "$ARGUMENTS"
git push -u origin "claude/${slug}"

gh pr create --base main \
  --title "$ARGUMENTS" \
  --body "Auto-opened by /toranot-deploy. CI + Codex review required before self-merge."
```

## Post-PR

After CI + Codex green (see audit-fix-deploy SKILL § D.5 for override criteria
on trivial/additive/config-only PRs):
```bash
gh pr merge <n> --squash --delete-branch
```
Then verify Netlify deploy state == "ready" AND live URL serves the new commit.

Report:
- Branch + PR URL
- Commit SHA
- TypeScript: clean / N errors
- Tests: N/~2,310 passing
- Build: success / fail
- CI/CD: GitHub Actions will run typecheck → test → build
- Live URL: https://toranot.netlify.app

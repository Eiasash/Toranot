---
description: Typecheck, test, build, commit, and push Toranot to trigger deploy
argument-hint: [commit message]
allowed-tools: Bash, Read
---

Deploy Toranot with commit message: **$ARGUMENTS**

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

## Deploy

```bash
git add -A
git status
```

Review staged changes. Then commit:

```bash
git commit -m "$ARGUMENTS"
```

Then push:
```bash
git pull --rebase origin main && git push origin main
```

## Post-deploy

Report:
- Commit SHA
- TypeScript: clean / N errors
- Tests: N/1038 passing
- Build: success / fail
- CI/CD: GitHub Actions will run typecheck → test → build → deploy
- Live URL: https://toranot.netlify.app

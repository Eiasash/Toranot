---
description: Run Toranot tests + typecheck and diagnose failures with root cause
allowed-tools: Bash, Read, Grep
---

Run the full test suite and typecheck, then diagnose any failures.

## Run typecheck

!`npm run typecheck 2>&1`

## Run tests

!`npm test 2>&1`

## Analysis

For each failing test:

1. **Which test file and test name** failed?
2. **What assertion failed?** (expected vs received)
3. **Root cause** — trace back to the actual code bug, not just the symptom
4. **File and line** that needs fixing
5. **Proposed fix** (code snippet, not applied — use `/toranot-fix` to apply)

## TypeScript errors

For each TS error:

1. **File and line**
2. **Error code** (e.g. TS2322, TS2345)
3. **Root cause** — type mismatch, missing field, wrong union variant
4. **Fix** — what type or code change resolves it

## Report format

```
Typecheck: PASS/FAIL (N errors)
Tests: N/~2,310 passing

FAILURES:
1. [test name]
   File: src/__tests__/xxx.test.ts:line
   Assertion: expected X, got Y
   Root cause: [specific code problem in src/]
   Fix: [exact change needed]
```

If all pass: confirm with test count and build status.

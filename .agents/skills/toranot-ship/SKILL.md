---
name: toranot-ship
description: End-to-end Toranot ship pipeline. Runs the mandatory 7-step workflow (tsc, vitest, vite build, README update, git push with PAT rotation, Netlify deploy verification, auditor sweep). Use when user says "push", "push Toranot", "deploy", "ship Toranot", "ship it", "release", or any variant asking to ship Toranot to production. DO NOT use for watch-advisor2 or Shlav A Mega — this is Toranot-specific.
disable-model-invocation: true
---

# Toranot Ship Pipeline

Single-command production ship for `github.com/Eiasash/Toranot` → `toranot.netlify.app`.

This skill is **user-invokable only** — Codex will not auto-run it, because it pushes to production and touches a live PAT.

## Preconditions (ask the user if unclear)

1. Working tree is in the Toranot repo root (usually `/home/Codex/Toranot`).
2. User has provided a **fresh GitHub PAT** for this session. Never store it. Paste into the `$GH_PAT` environment variable only.
3. There are real, staged or unstaged changes worth shipping (`git status` not clean).
4. User has edited the `README.md` Recent Changes section OR authorized this skill to add a terse one-liner.

If any precondition is unmet, stop and ask.

## Pipeline (Strict Order)

Each step MUST pass before the next runs. On any failure: stop, surface the exact error, and do not proceed.

### Step 1 — TypeScript gate
```
npx tsc --noEmit
```
Zero errors required. No suppressions.

### Step 2 — Full vitest suite
```
npx vitest run --reporter=dot
```
All 2271 tests across 72 files must pass (last audited: 2026-05-01). If a new test was added, the new count is fine — but it must match the README/AGENTS.md claim (update both in the same commit if the number moves).

### Step 3 — Production build + bundle gate
```
npx vite build
```
Then assert main bundle stays under 150KB:
```
bash scripts/preflight.sh --bundle-gate
```
(Falls back to `du -sb dist/assets/index-*.js | awk '{ if ($1 > 153600) exit 1 }'`.)

### Step 4 — README touch-up
If the user did not update `README.md` Recent Changes, prompt for a one-line entry:
```
- YYYY-MM-DD: <short summary> (<short hash will go here>)
```
Commit it in the same commit as the feature.

### Step 5 — Push with PAT rotation
Uses `scripts/push-with-pat.sh`:
1. `git remote set-url origin https://$GH_PAT@github.com/Eiasash/Toranot.git`
2. `git config user.email "eias@toranot.app"`
3. `git config user.name "Eias"`
4. `git add -A && git commit -m "<type>: <description>" && git push origin main`
5. **Immediately** `git remote set-url origin https://github.com/Eiasash/Toranot.git` (scrubs PAT)
6. Print reminder: `Revoke at https://github.com/settings/tokens`

Commit message convention: `feat:`, `fix:`, `refactor:`, `test:`, `chore:`, `docs:`.

### Step 6 — Netlify deploy verification
Uses `scripts/verify-deploy.sh`:
- Poll `https://api.netlify.com/api/v1/sites/85d12386-b960-4f65-bee8-80e210ecd683/deploys?per_page=1`
- Wait up to 5 minutes. State progression: `uploading → building → ready`.
- On `ready`: assert `commit_ref` matches the just-pushed SHA.
- On `error`: surface the build log URL, stop, do NOT mark success.

### Step 7 — Post-deploy audit sweep
Delegate to the `toranot-auditor` subagent with a fresh context. It checks:
- Dismissed tasks leaking into aggregations
- `RULES.length` assertion still matches `rules.ts`
- Banned patterns (`transition-all`, `confirm()`, mid-file imports, `will-change` on `animate-card-in`)
- `console.log` leaks
- Test count drift between README/AGENTS.md and actual vitest output
- Bundle size still <150KB on the deployed build

If the auditor flags anything, surface it as a follow-up — do not auto-fix on the same ship.

## Failure modes + recovery

| Failure | Action |
|---------|--------|
| tsc errors | Stop. Surface errors. Do NOT skip. |
| vitest fails | Stop. Surface failing test names. Do NOT skip. |
| Bundle >150KB | Stop. Run `npx vite-bundle-visualizer` or check lazy() coverage. |
| Push rejected (non-fast-forward) | `git pull --rebase origin main`, resolve, retry. Never force-push `main`. |
| Netlify stuck `building` >5 min | Trigger retry via Netlify MCP, re-poll. |
| Netlify `error` | Fetch build logs, surface to user, do NOT declare success. |
| Auditor findings | Surface as a `toranot-followups.md` note. User decides whether to ship a follow-up. |

## Never do

- Never `git push --force` to `main`.
- Never leave the PAT in the git remote — always scrub immediately after push.
- Never skip steps 1–3 to "just get it out".
- Never edit `sw.js` `CACHE_VERSION` manually — Vite plugin stamps it.
- Never merge changes that edited 1-of-5 room-format files without the other 4 (see `hooks/room-format-drift.js`).

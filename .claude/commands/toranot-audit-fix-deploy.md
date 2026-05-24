---
description: Full audit → fix → improve → self-tune cycle for Toranot. Run after any major session or when the app feels off. Covers clinical engine, drug safety, rules, bundle size, and autonomous improvement.
---

You are the sole developer of Toranot, a Hebrew RTL PWA for geriatric on-call shift
management at Shaare Zedek Medical Center. Read SKILL.md (toranot-dev) in full before
touching any code.

Repo: github.com/Eiasash/Toranot
Live: https://toranot.netlify.app
Netlify site ID: 85d12386-b960-4f65-bee8-80e210ecd683
Stack: React 19 + TypeScript + Tailwind CSS 4 + Zustand 5 + Vite 7
Tests: ~2,310 tests, 73 files (query live: `npx vitest run | tail -3`)
Bundle target: <150KB (main chunk gzipped; currently ~146KB / 37.7KB gzipped)

## OPERATING MODEL — single lane (binding)

Per repo `CLAUDE.md`, all non-trivial work goes through branch + PR + CI/Codex green
+ self-merge. **Never push to main directly.** Workflow each cycle:
```
git checkout -b claude/<slug>
# ... edits, npm run typecheck, npm test, npm run build ...
git add -A && git commit -m "<type>: <root cause>"
git push -u origin claude/<slug>
gh pr create --base main ...
# Wait for CI green + Codex review (D.5 of audit-fix-deploy SKILL allows override
# for trivial/additive/config-only PRs after a meaningful Codex wait)
gh pr merge <n> --squash --delete-branch
```
The direct-push pattern shown in older versions of this command is superseded.

---

## MANDATORY WORKFLOW — AFTER EVERY CHANGE
```
1. npx tsc --noEmit                    — zero TypeScript errors
2. npx vitest run                      — ALL ~2,310 tests must pass, zero failures
3. npx vite build                      — must succeed, main chunk must be <150KB gzipped
4. git checkout -b claude/<slug>       — never edit main directly
5. git add -A && git commit -m "..."   — root-cause commit message
6. git push -u origin claude/<slug>    — push to feature branch
7. gh pr create --base main ...        — open PR
8. Wait CI + Codex green, then `gh pr merge <n> --squash --delete-branch`
9. Verify Netlify deploy state = "ready" AND live URL serves the new commit
```

### Token / push procedure
For PAT fetch, identity, and one-shot push procedure see
`/mnt/skills/user/deploy-primitives.md § 5`. Do not embed token-injection scripts
here — they rotate, and a stale literal silently mis-points the next reader.
Push targets a `claude/<slug>` branch, never `main`.

### Deploy Verification
```
Netlify:netlify-project-services-reader
  operation: "get-project"
  params: { siteId: "85d12386-b960-4f65-bee8-80e210ecd683" }
```
Check `currentDeploy.state === "ready"` AND `currentDeploy.commit_ref` matches push.

---

## PHASE 1 — FULL AUDIT

Run all checks. Document every finding before fixing anything.

### A. Static analysis
```bash
# TypeScript clean
npx tsc --noEmit

# No mid-file imports (crashes Vite)
grep -rn "^import" src/ | awk -F: '{print $1}' | sort -u | while read f; do
  awk '/^import/{last=NR} NR>last && /^import/{print FILENAME": mid-file import at line "NR}' "$f"
done

# No transition-all (banned)
grep -rn "transition-all" src/
# Must return zero results

# No animate-card-in with will-change (banned)
grep -rn "animate-card-in" src/ | xargs grep -l "will-change" 2>/dev/null
# Must return zero results

# No window.confirm() calls (silently fails on Android PWA)
# Look for `window.confirm(` only in code (not comments — JSDoc and `//`
# comments in `App.tsx` and `SimpleConfirm.tsx` legitimately mention the
# banned API while documenting the ban).
grep -rEn "\bwindow\.confirm\(" src/ \
  --include="*.ts" --include="*.tsx" \
  | grep -vE ':\s*(//|\*)'
# Must return zero results — use React modals (useSimpleConfirm) instead.
# The earlier regex `(^|[^/*[:space:]])window\.confirm\(` had a P1 bug
# (Codex flagged on PR #99): it required `window` to be at column 1 OR
# preceded by a non-whitespace char, which meant common indented usages
# like `  const ok = window.confirm(x)` or `  return window.confirm(x)`
# would NOT match — silently allowing banned calls past the audit gate.
# The current regex uses `\b` (word boundary) so `window.confirm(`
# matches anywhere it's a complete identifier (won't catch `mywindow`),
# and the single grep -v drops lines whose first non-whitespace token
# is `//` or `*` (line comments and JSDoc continuation lines, which
# legitimately mention the banned API while documenting the ban).

# No console.log leaks in prod paths
grep -rn "console\.log" src/ --include="*.ts" --include="*.tsx" \
  | grep -v "src/utils/debugLog.ts" \
  | grep -v "src/__tests__/"
# Gate behind: if (import.meta.env.DEV). The debugLog wrapper itself and
# test fixtures that intentionally exercise the wrapper are excluded above.

# Dismissed tasks filter — surface aggregations for review
# This grep is a candidate-surfacing check, NOT a hard bug indicator.
# Lines that filter via `!t.dismissed` / `!.*\.dismissed` are legitimate
# but don't contain the literal "filter" or "dismissed:" tokens — they
# show up here and a human reviews them. Treat zero output as "all
# aggregations are obvious filters"; treat any output as "look at each".
grep -rn "dismissed" src/components/ \
  | grep -v "filter\|dismissed:\|!.*\.dismissed\|!.*dismissed)"
```

### B. Clinical engine integrity
```bash
# Rules count — must match test assertion
grep "RULES.length" src/__tests__/rules.test.ts
grep -c "group:" src/engine/rules.ts
# These must be consistent

# All rule groups must be unique
grep "group:" src/engine/rules.ts | sort | uniq -d
# Must return zero results — duplicates = silent dedup failures

# Comfort care suppression present
grep -n "COMFORT_CARE_PATTERN\|comfort\|palliative" src/engine/rules.ts | head -5
# Must exist — suppresses aggressive workup for EOL patients

# planNotes/tomorrowNotes NOT in trigger matching
grep -n "planNotes\|tomorrowNotes" src/engine/rules.ts
# Must return zero results — these fields are excluded from triggers

# Drug safety engine exports
grep "export" src/engine/drugSafety.ts | grep -E "checkDrug|checkRenal|checkBeers|checkAllergy"
# Must export all 4 functions

# Dismissed tasks always filtered
grep -rn "generatedTasks\|tasks\." src/ --include="*.ts" --include="*.tsx" | grep -v "filter\|dismissed\|__tests__" | head -20
# Review any aggregation not filtering dismissed tasks
```

### C. Room format coverage
```bash
# All 5 input paths handle room formats
grep -n "ROOM_PATTERN\|parseFreestyle\|normRoom\|extractRoom" \
  src/parser/parsePatientList.ts \
  src/components/AddAdmissionModal.tsx \
  src/components/Scanner.tsx \
  src/components/VoiceInput.tsx \
  src/components/QuickCaptureSheet.tsx
# All 5 files must have room normalization logic

# Room simulation test suite
grep "scenario\|test(" src/__tests__/roomFormat.simulation.test.ts | wc -l
# Must be ≥104 scenarios
```

### D. Bundle size check
```bash
npx vite build 2>&1 | grep -E "dist/index|kB|KB"
# Main chunk must be <150KB gzipped (current baseline ~146KB / ~37.7KB gzipped).
# If main chunk grows past 150KB — find what grew and tree-shake or lazy-load it.
```

### E. Test suite
```bash
npx vitest run 2>&1 | tail -20
# Must show: ~2,310 passed, 0 failed
# If count changed — update SKILL.md test count and the baselines in this file.
```

### F. Skill snapshot endpoint
```
GET https://toranot.netlify.app/api/skill-snapshot
# Equivalent direct path: /.netlify/functions/skill-snapshot
# Both routes return JSON since PR #98 (May 2026).
```
Verify it returns: rulesCount, testCount, bundleSize, supabaseHealth, lastUpdated.
If endpoint missing — add it (see PHASE 3).

### G. Supabase health
```sql
-- Patient state exists
SELECT id, jsonb_array_length(state->'patients') as patient_count,
       updated_at
FROM toranot_state
WHERE id = '3f37c881-6e38-443b-a32d-f5eb9bd426cc';

-- Backup table present
SELECT COUNT(*) FROM toranot_patients_backup;

-- App config seeded
SELECT * FROM toranot_config;
```

---

## PHASE 2 — FIX ALL FINDINGS

Fix every issue found in Phase 1. Priority order:
1. TypeScript errors (blocks build)
2. Clinical engine bugs (patient safety risk)
3. Duplicate rule groups (silent dedup)
4. Dismissed task filter gaps (wrong task counts)
5. Room format gaps (parser failures)
6. Bundle size violations (>140KB)
7. Console.log leaks
8. Minor issues

For each fix:
- State root cause in commit message
- Run full check sequence (tsc → vitest → build) after each fix
- Never skip the TypeScript check even for "minor" fixes

---

## PHASE 3 — IMPROVEMENTS

After all fixes pass, implement these:

### 1. Skill snapshot Netlify function (if missing)
Create `netlify/functions/skill-snapshot.js`:
```js
import { createClient } from '@supabase/supabase-js';

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS };

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  );

  // Patient state
  const { data: state } = await supabase
    .from('toranot_state')
    .select('state, updated_at')
    .eq('id', '3f37c881-6e38-443b-a32d-f5eb9bd426cc')
    .single();

  // App config
  const { data: config } = await supabase
    .from('toranot_config')
    .select('key, value');

  // Backup count
  const { count: backupCount } = await supabase
    .from('toranot_patients_backup')
    .select('*', { count: 'exact', head: true });

  // Error log (last 10)
  const { data: recentErrors } = await supabase
    .from('toranot_errors')
    .select('level, message, created_at')
    .order('created_at', { ascending: false })
    .limit(10);

  const patientCount = state?.state?.patients?.length ?? 0;

  return {
    statusCode: 200,
    headers: { ...CORS, "Content-Type": "application/json" },
    body: JSON.stringify({
      snapshotAt: new Date().toISOString(),
      appUrl: "https://toranot.netlify.app",
      netliftSiteId: "85d12386-b960-4f65-bee8-80e210ecd683",
      patientCount,
      lastStateUpdate: state?.updated_at ?? null,
      backupCount: backupCount ?? 0,
      configCount: config?.length ?? 0,
      recentErrors: recentErrors ?? [],
      errorCount: recentErrors?.length ?? 0,
      health: {
        supabase: state ? "ok" : "ERROR: no state row",
        backup: (backupCount ?? 0) > 0 ? "ok" : "WARN: no backups",
        errors: (recentErrors?.length ?? 0) === 0 ? "ok" : `WARN: ${recentErrors.length} recent errors`,
      },
      skillFileNote: "Run /update-skill in Claude Code to sync SKILL.md with this snapshot"
    }, null, 2)
  };
}
```

### 2. Toranot config table (if missing)
Run migration:
```sql
CREATE TABLE IF NOT EXISTS toranot_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz DEFAULT NOW()
);

INSERT INTO toranot_config (key, value) VALUES
  ('claude_model', '"claude-sonnet-4-6"'),
  ('monthly_token_usage', '{"input":0,"output":0,"month":"2026-05","cost_usd":0}'),
  ('payload_schema_version', '"v1"'),
  ('keepalive_last', '"2026-03-20T00:00:00Z"'),
  ('app_version', '"current"')
ON CONFLICT (key) DO NOTHING;
```

### 3. Error logging table (if missing)
```sql
CREATE TABLE IF NOT EXISTS toranot_errors (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  level text NOT NULL DEFAULT 'error',
  source text,
  message text NOT NULL,
  payload jsonb,
  app_version text,
  created_at timestamptz DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS toranot_errors_created_at ON toranot_errors(created_at DESC);
```

### 4. Supabase keep-alive cron
Create `netlify/functions/toranot-keepalive.js`:
```js
// [functions.toranot-keepalive]
// schedule = "0 6 */5 * *"
import { createClient } from '@supabase/supabase-js';
export async function handler() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  await supabase.from('toranot_config')
    .update({ value: `"${new Date().toISOString()}"`, updated_at: new Date() })
    .eq('key', 'keepalive_last');
  return { statusCode: 200 };
}
```
Add to `netlify.toml`:
```toml
[functions.toranot-keepalive]
  schedule = "0 6 */5 * *"
```

### 5. Claude model version from config
In `netlify/functions/claude.js` (or wherever `/api/claude` is handled):
- On cold start, read `claude_model` from `toranot_config`
- Fall back to hardcoded default if read fails
- Cache in module scope (one read per cold start)
- Update model: `UPDATE toranot_config SET value = '"claude-sonnet-4-5"' WHERE key = 'claude_model'`
- No deploy needed for model updates

### 6. Token usage logging
After every `/api/claude` response, fire-and-forget:
```js
const usage = response.usage;
supabase.rpc('toranot_increment_token_usage', {
  input: usage.input_tokens,
  output: usage.output_tokens
});
```
Show monthly cost in DebugConsole — single line from `toranot_config`.

### 7. Bundle size guard
Add to CI / pre-push hook:
```bash
SIZE=$(npx vite build 2>&1 | grep "dist/index" | grep -oP '\d+\.\d+ kB' | head -1)
echo "Bundle: $SIZE"
# Fail if >140KB
```

---

## PHASE 4 — CLINICAL ENGINE SELF-IMPROVEMENT

After Phase 3, run this analysis cycle autonomously.

### A. Rules coverage analysis
```bash
# Find diagnoses in patient history not covered by any rule
# Requires reading toranot_state patients array
# Look for diagnosis strings that match zero rule triggers
```

Query history from Supabase:
```sql
SELECT DISTINCT 
  jsonb_array_elements(state->'patients')->>'diagnosis' as diagnosis
FROM toranot_state
WHERE id = '3f37c881-6e38-443b-a32d-f5eb9bd426cc';
```

For each diagnosis — test against all rule triggers. Any diagnosis with zero rule matches = coverage gap. Propose new rules (do NOT auto-add — require approval).

### B. Task dismissal pattern analysis
```sql
-- Which task categories are most dismissed? (indicates over-triggering)
SELECT 
  jsonb_array_elements(state->'patients')->'generatedTasks' as tasks
FROM toranot_state
WHERE id = '3f37c881-6e38-443b-a32d-f5eb9bd426cc';
```
Parse dismissed tasks. If any category >50% dismissed → rule is over-triggering. Flag for review.

### C. Drug safety false positive detection
Review `drugSafety.ts` alerts against Beers 2023 updates:
- Check if any Beers criteria entries are outdated (2023 revision)
- Check if renal dosing table (`data/dosing.ts`) has coverage for the 19 antibiotics
- Flag any missing antibiotics

### D. Auto-generated improvement proposals
Generate `TORANOT_IMPROVEMENTS.md` in repo root:

```markdown
# Toranot Auto-Generated Improvement Proposals
Generated: {today's date}
Snapshot: {skill-snapshot result}

## Clinical Coverage Gaps
{list diagnoses with zero rule coverage}

## Over-Triggering Rules
{list rules with >50% task dismissal rate}

## Drug Safety Gaps
{any missing Beers criteria or dosing entries}

## Bundle Size Trend
{current vs last known size}

## Proposed Next Session
{3-5 ranked improvements — require human approval before implementing}
```

Commit:
```bash
git add TORANOT_IMPROVEMENTS.md
git commit -m "docs: auto-improvement proposals $(date +%Y-%m-%d) [skip ci]"
git push origin main
```

### E. Weekly GitHub Action
Create `.github/workflows/toranot-weekly-audit.yml`:
```yaml
name: Toranot Weekly Audit
on:
  schedule:
    - cron: '0 5 * * 1'  # Monday 5am UTC (7am Jerusalem)
  workflow_dispatch:

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: anthropics/claude-code-action@beta
        with:
          prompt: |
            Run /toranot-audit-fix-deploy — full autonomous cycle.
            Focus on Phase 4 clinical self-improvement.
            Never auto-add clinical rules without flagging them in TORANOT_IMPROVEMENTS.md.
            Commit all findings. Push all changes.
          allowed_tools: "Bash,Read,Write,Edit"
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

## PHASE 5 — SKILL FILE UPDATE

After all changes committed and deployed, update `SKILL.md` (toranot-dev):
- Update test count if changed (currently ~2,310 / 73 files)
- Update bundle size if changed (currently main chunk ~146KB / ~37.7KB gzipped)
- Add any new gotchas discovered
- Add new components to §1 repo structure
- Add new clinical rules to §4 engine section
- Update "Last audited" date

Then run `/toranot-update-skill` to verify self-consistency.

---

## HARD CONSTRAINTS — NEVER VIOLATE
- Never auto-add clinical rules without flagging for human review — patient safety
- Never skip `npx tsc --noEmit` — TypeScript errors = silent clinical bugs
- Never use `confirm()` — silently fails on Android PWA standalone
- Never add `transition-all` — banned
- Never add `will-change` to `animate-card-in` — layer explosion
- Never put imports mid-file — crashes Vite
- Never mix Netlify site IDs: `85d12386` = Toranot, `4d21d73c` = watch-advisor2
- Never drop UNKNOWN_SECTION patients — valid section
- Never assign section from room letter prefix — only from headers
- Never filter planNotes/tomorrowNotes into trigger matching
- Never count dismissed tasks in aggregations
- Never store GitHub PAT — remove from remote URL immediately after push
- Never push direct to main — branch + PR + Codex review per single-lane CLAUDE.md
- Test count must be verified after every change — ~2,310 is the baseline
- The dual `netlify/functions/claude.ts` + `netlify/edge-functions/claude.ts` is
  INTENTIONAL (functions version is the emergency-rollback target, hit directly
  at `/.netlify/functions/claude` per `netlify.toml` comments). The previous
  `/api/claude-legacy` alias was removed in PR #103 — the `/api/claude*` prefix
  collided with the edge function's `config.path` and silently 404'd. Audit
  grep checks must not flag the dual files as duplication.

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
Tests: ~1,727 tests, 54 files
Bundle target: <140KB

---

## MANDATORY WORKFLOW — AFTER EVERY CHANGE
```
1. npx tsc --noEmit                    — zero TypeScript errors
2. npx vitest run                      — ALL ~1,727 tests must pass, zero failures
3. npx vite build                      — must succeed, bundle must be <140KB
4. Update README.md                    — Recent Changes section
5. git add -A && git commit -m "..."   — see push procedure
6. git push origin main                — triggers auto-deploy
7. Verify Netlify deploy state = "ready"
```

### Push Procedure
```bash
cd /home/claude/Toranot
git remote set-url origin https://<TOKEN>@github.com/Eiasash/Toranot.git
git config user.email "eias@toranot.app"
git config user.name "Eias"
git add -A && git commit -m "<type>: <description with root cause>"
git push origin main
# IMMEDIATELY after push — remove token from remote URL:
git remote set-url origin https://github.com/Eiasash/Toranot.git
```
Remind user to revoke token at https://github.com/settings/tokens

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

# No confirm() calls (silently fails on Android PWA)
grep -rn "confirm(" src/
# Must return zero results — use React modals instead

# No console.log leaks in prod paths
grep -rn "console\.log" src/ --include="*.ts" --include="*.tsx"
# Gate behind: if (import.meta.env.DEV)

# Dismissed tasks filter — ensure aggregations exclude dismissed
grep -rn "dismissed" src/components/ | grep -v "filter\|dismissed:"
# Any aggregation not filtering dismissed = bug
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
npx vite build 2>&1 | grep -E "dist/|kB|KB"
# Total bundle must be <140KB
# If >140KB — find what grew and tree-shake or lazy-load it
```

### E. Test suite
```bash
npx vitest run 2>&1 | tail -20
# Must show: ~1,727 passed, 0 failed
# If count changed — update SKILL.md test count
```

### F. Skill snapshot endpoint
```
GET https://toranot.netlify.app/.netlify/functions/skill-snapshot
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
  ('claude_model', '"claude-sonnet-4-20250514"'),
  ('monthly_token_usage', '{"input":0,"output":0,"month":"2026-03","cost_usd":0}'),
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
- Update test count if changed (currently ~1,727 / 54 files)
- Update bundle size if changed (currently ~138KB)
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
- Test count must be verified after every change — ~1,727 is the baseline

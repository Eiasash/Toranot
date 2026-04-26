/**
 * skill-snapshot.js — Toranot
 * Returns live ground truth about Toranot app state.
 * GET /.netlify/functions/skill-snapshot
 */
import { createClient } from '@supabase/supabase-js';
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
const TORANOT_USER_ID = '3f37c881-6e38-443b-a32d-f5eb9bd426cc';
export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS };
  }
  // Validate env vars before attempting Supabase connection
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY
    || process.env.SUPABASE_ANON_KEY
    || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return {
      statusCode: 503,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Supabase env vars not configured on this Netlify site.",
        missing: [
          !supabaseUrl && "SUPABASE_URL",
          !supabaseKey && "SUPABASE_SERVICE_KEY",
        ].filter(Boolean),
        fix: "Go to Netlify dashboard → toranot site → Environment variables → Add SUPABASE_URL and SUPABASE_SERVICE_KEY",
        snapshotAt: new Date().toISOString(),
      })
    };
  }
  const supabase = createClient(supabaseUrl, supabaseKey);
  try {
    // Patient state
    const { data: stateRow, error: stateErr } = await supabase
      .from('toranot_state')
      .select('state, updated_at')
      .eq('user_id', TORANOT_USER_ID)
      .single();
    const patients = stateRow?.state?.patients ?? [];
    const patientCount = patients.length;
    // Section breakdown
    const sectionCounts = patients.reduce((acc, p) => {
      const s = p.section ?? 'UNKNOWN';
      acc[s] = (acc[s] ?? 0) + 1;
      return acc;
    }, {});
    // Task stats
    const totalTasks = patients.reduce((acc, p) => {
      const tasks = p.generatedTasks ?? [];
      const active = tasks.filter(t => !(t.done && t.dismissed)).length;
      const dismissed = tasks.filter(t => t.done && t.dismissed).length;
      return { active: acc.active + active, dismissed: acc.dismissed + dismissed };
    }, { active: 0, dismissed: 0 });
    // Backup count
    const { count: backupCount } = await supabase
      .from('toranot_patients_backup')
      .select('*', { count: 'exact', head: true });
    // App config
    const { data: config } = await supabase
      .from('toranot_config')
      .select('key, value');
    const configMap = (config ?? []).reduce((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});
    // Recent errors
    let recentErrors = [];
    try {
      const { data: errData } = await supabase
        .from('toranot_errors')
        .select('level, source, message, created_at')
        .order('created_at', { ascending: false })
        .limit(10);
      recentErrors = errData ?? [];
    } catch {
      // table may not exist yet — non-fatal
    }
    // ── Compute real token usage ─────────────────────────────────────────
    // The legacy `monthly_token_usage` key has been frozen since 2026-03-20
    // because the proxy now writes per-month-per-provider keys
    // (token_usage_YYYY-MM_provider). Compute current-month + all-time
    // totals from those rows. This snapshot used to silently emit zero.
    const tokenUsageRows = Object.entries(configMap)
      .filter(([k]) => k.startsWith('token_usage_'))
      .map(([k, v]) => ({ key: k, ...v }));
    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const sumField = (arr, field) =>
      arr.reduce((a, r) => a + Number(r?.[field] ?? 0), 0);
    const currentMonthRows = tokenUsageRows.filter((r) => r.month === currentMonthKey);
    const tokenUsage = tokenUsageRows.length === 0
      ? null
      : {
          currentMonth: currentMonthKey,
          currentMonthTotals: {
            input_tokens: sumField(currentMonthRows, 'input_tokens'),
            output_tokens: sumField(currentMonthRows, 'output_tokens'),
            call_count: sumField(currentMonthRows, 'call_count'),
          },
          allTimeTotals: {
            input_tokens: sumField(tokenUsageRows, 'input_tokens'),
            output_tokens: sumField(tokenUsageRows, 'output_tokens'),
            call_count: sumField(tokenUsageRows, 'call_count'),
          },
        };

    // Filter token_usage_* keys out of configKeys to keep the list bounded.
    // Otherwise it grows by one entry per month per provider.
    const stableConfigKeys = Object.keys(configMap).filter(
      (k) => !k.startsWith('token_usage_'),
    );

    return {
      statusCode: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({
        snapshotAt: new Date().toISOString(),
        appUrl: "https://toranot.netlify.app",
        netlifyId: "85d12386-b960-4f65-bee8-80e210ecd683",
        patientCount,
        sectionBreakdown: sectionCounts,
        lastStateUpdate: stateRow?.updated_at ?? null,
        activeTasks: totalTasks.active,
        dismissedTasks: totalTasks.dismissed,
        dismissalRate: totalTasks.active + totalTasks.dismissed > 0
          ? ((totalTasks.dismissed / (totalTasks.active + totalTasks.dismissed)) * 100).toFixed(1) + '%'
          : 'N/A',
        backupCount: backupCount ?? 0,
        configKeys: stableConfigKeys,
        claudeModel: configMap['claude_model'] ?? 'not set',
        tokenUsage,
        keepaliveLast: configMap['keepalive_last'] ?? null,
        recentErrorCount: recentErrors.length,
        recentErrors,
        health: {
          supabaseState: stateErr ? `ERROR: ${stateErr.message}` : "ok",
          backup: (backupCount ?? 0) > 0 ? "ok" : "WARN: no backups",
          config: (config?.length ?? 0) > 0 ? "ok" : "WARN: toranot_config empty — run migration",
          errors: recentErrors.length === 0 ? "ok" : `WARN: ${recentErrors.length} recent errors`,
        },
        skillFileNote: "Run /toranot-update-skill in Claude Code to sync SKILL.md"
      }, null, 2)
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message, snapshotAt: new Date().toISOString() })
    };
  }
}

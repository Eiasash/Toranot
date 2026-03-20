/**
 * skill-snapshot.js — Toranot
 * Returns live ground truth about Toranot app state.
 * Used by Claude Code /toranot-update-skill to keep SKILL.md accurate.
 *
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

  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  );

  try {
    // Patient state
    const { data: stateRow, error: stateErr } = await supabase
      .from('toranot_state')
      .select('state, updated_at')
      .eq('id', TORANOT_USER_ID)
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

    // Backup table
    const { count: backupCount, error: backupErr } = await supabase
      .from('toranot_patients_backup')
      .select('*', { count: 'exact', head: true });

    // App config
    const { data: config, error: configErr } = await supabase
      .from('toranot_config')
      .select('key, value');

    const configMap = (config ?? []).reduce((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});

    // Recent errors (last 10)
    let recentErrors = [];
    try {
      const { data: errData } = await supabase
        .from('toranot_errors')
        .select('level, source, message, created_at')
        .order('created_at', { ascending: false })
        .limit(10);
      recentErrors = errData ?? [];
    } catch {
      // table may not exist yet
    }

    const snapshot = {
      snapshotAt: new Date().toISOString(),
      appUrl: "https://toranot.netlify.app",
      netlifyId: "85d12386-b960-4f65-bee8-80e210ecd683",
      supabaseUserId: TORANOT_USER_ID,

      // Patient state
      patientCount,
      sectionBreakdown: sectionCounts,
      lastStateUpdate: stateRow?.updated_at ?? null,

      // Task stats
      activeTasks: totalTasks.active,
      dismissedTasks: totalTasks.dismissed,
      dismissalRate: totalTasks.active + totalTasks.dismissed > 0
        ? ((totalTasks.dismissed / (totalTasks.active + totalTasks.dismissed)) * 100).toFixed(1) + '%'
        : 'N/A',

      // Infrastructure
      backupCount: backupCount ?? 0,
      configKeys: Object.keys(configMap),
      claudeModel: configMap['claude_model'] ?? 'not set',
      monthlyTokenUsage: configMap['monthly_token_usage'] ?? null,
      keepaliveLast: configMap['keepalive_last'] ?? null,

      // Errors
      recentErrorCount: recentErrors.length,
      recentErrors,

      // Health checks
      health: {
        supabaseState: stateErr ? `ERROR: ${stateErr.message}` : "ok",
        backup: backupErr ? `ERROR: ${backupErr.message}` : (backupCount ?? 0) > 0 ? "ok" : "WARN: no backups",
        config: configErr ? `ERROR: ${configErr.message}` : (config?.length ?? 0) > 0 ? "ok" : "WARN: config empty — run setup migration",
        errors: recentErrors.length === 0 ? "ok" : `WARN: ${recentErrors.length} recent errors`,
      },

      skillFileNote: "Run /toranot-update-skill in Claude Code to sync SKILL.md with this snapshot"
    };

    return {
      statusCode: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify(snapshot, null, 2)
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({
        error: err.message,
        snapshotAt: new Date().toISOString()
      })
    };
  }
}

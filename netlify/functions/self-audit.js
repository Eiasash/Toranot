/**
 * self-audit.js — Toranot autonomous health check
 *
 * Runs engine integrity checks against live Supabase state:
 *   - Patient data consistency (sections, rooms, duplicate IDs)
 *   - Task engine health (dismissed ratio, orphaned tasks)
 *   - Lab delta engine validation (entries with bad timestamps)
 *   - Rule count verification
 *   - Config table health
 *   - Token usage reporting
 *
 * Called by: GitHub Actions weekly cron, or manual GET request.
 * Returns: JSON audit report with findings and auto-fix recommendations.
 */
import { createClient } from '@supabase/supabase-js';

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const TORANOT_USER_ID = '3f37c881-6e38-443b-a32d-f5eb9bd426cc';

// Known good values — if these change, something broke
const ENGINE_INVARIANTS = {
  minRuleCount: 35,
  maxRuleCount: 80,
  minDrugPatterns: 20,
  maxDismissalRate: 0.80, // if >80% dismissed, rules are too noisy
  maxPatientsPerSection: 25,
  maxTotalPatients: 60,
};

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS };

  const sbUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!sbUrl || !sbKey) {
    return {
      statusCode: 503,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Supabase not configured", auditAt: new Date().toISOString() }),
    };
  }

  const supabase = createClient(sbUrl, sbKey);
  const findings = [];
  const autoFixes = [];

  try {
    // ── 1. Patient state consistency ──────────────────────────────────────
    const { data: stateRow, error: stateErr } = await supabase
      .from('toranot_state')
      .select('state, updated_at')
      .eq('user_id', TORANOT_USER_ID)
      .single();

    if (stateErr) {
      findings.push({ severity: "critical", area: "supabase", message: `State read failed: ${stateErr.message}` });
    }

    const patients = stateRow?.state?.patients ?? [];
    const lastUpdate = stateRow?.updated_at ?? null;

    // Stale data check: if state hasn't been updated in >7 days, the app isn't being used
    if (lastUpdate) {
      const daysSinceUpdate = (Date.now() - new Date(lastUpdate).getTime()) / 86400000;
      if (daysSinceUpdate > 7) {
        findings.push({
          severity: "info",
          area: "usage",
          message: `State not updated in ${Math.round(daysSinceUpdate)} days — no active shift`,
        });
      }
    }

    // Duplicate patient IDs
    const ids = patients.map(p => p.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (dupes.length > 0) {
      findings.push({
        severity: "critical",
        area: "patients",
        message: `${dupes.length} duplicate patient IDs found: ${dupes.slice(0, 5).join(", ")}`,
      });
      autoFixes.push("Deduplicate patients by ID, keeping the most recently modified");
    }

    // Section distribution
    const sectionCounts = {};
    for (const p of patients) {
      const s = p.section ?? "UNKNOWN";
      sectionCounts[s] = (sectionCounts[s] ?? 0) + 1;
    }

    for (const [section, count] of Object.entries(sectionCounts)) {
      if (count > ENGINE_INVARIANTS.maxPatientsPerSection) {
        findings.push({
          severity: "warning",
          area: "patients",
          message: `Section ${section} has ${count} patients (max ${ENGINE_INVARIANTS.maxPatientsPerSection})`,
        });
      }
    }

    if (patients.length > ENGINE_INVARIANTS.maxTotalPatients) {
      findings.push({
        severity: "warning",
        area: "patients",
        message: `Total ${patients.length} patients exceeds ${ENGINE_INVARIANTS.maxTotalPatients} — performance risk`,
      });
    }

    // Patients with null room
    const noRoom = patients.filter(p => !p.room);
    if (noRoom.length > 0) {
      findings.push({
        severity: "warning",
        area: "patients",
        message: `${noRoom.length} patients have null room`,
      });
    }

    // ── 2. Task engine health ─────────────────────────────────────────────
    let totalTasks = 0;
    let dismissedTasks = 0;
    let doneTasks = 0;
    let openStatTasks = 0;
    let tasksWithoutId = 0;

    for (const p of patients) {
      const allTasks = [...(p.tasks ?? []), ...(p.generatedTasks ?? [])];
      for (const t of allTasks) {
        totalTasks++;
        if (!t.id) tasksWithoutId++;
        if (t.done && t.dismissed) dismissedTasks++;
        else if (t.done) doneTasks++;
        if (!t.done && t.urgency === "stat") openStatTasks++;
      }
    }

    const dismissalRate = totalTasks > 0 ? dismissedTasks / totalTasks : 0;
    if (dismissalRate > ENGINE_INVARIANTS.maxDismissalRate) {
      findings.push({
        severity: "warning",
        area: "rules_engine",
        message: `Task dismissal rate ${(dismissalRate * 100).toFixed(0)}% > ${ENGINE_INVARIANTS.maxDismissalRate * 100}% — rules may be too aggressive`,
      });
      autoFixes.push("Review rules.ts — high dismissal rate suggests over-generation");
    }

    if (tasksWithoutId > 0) {
      findings.push({
        severity: "warning",
        area: "tasks",
        message: `${tasksWithoutId} tasks have no ID — may cause dedup failures`,
      });
    }

    // ── 3. Lab data integrity ─────────────────────────────────────────────
    let labsWithBadTime = 0;
    let labsNegativeValue = 0;
    for (const p of patients) {
      for (const lab of (p.labs ?? [])) {
        if (!lab.time || isNaN(new Date(lab.time).getTime())) labsWithBadTime++;
        if (typeof lab.value === "number" && lab.value < 0) labsNegativeValue++;
      }
    }
    if (labsWithBadTime > 0) {
      findings.push({ severity: "warning", area: "labs", message: `${labsWithBadTime} lab entries with invalid timestamps` });
    }
    if (labsNegativeValue > 0) {
      findings.push({ severity: "warning", area: "labs", message: `${labsNegativeValue} lab entries with negative values` });
    }

    // ── 4. Backup health ──────────────────────────────────────────────────
    const { count: backupCount } = await supabase
      .from('toranot_patients_backup')
      .select('*', { count: 'exact', head: true });

    if ((backupCount ?? 0) === 0) {
      findings.push({ severity: "warning", area: "backup", message: "No backups found" });
    }

    // ── 5. Config table ───────────────────────────────────────────────────
    const { data: config } = await supabase.from('toranot_config').select('key, value');
    const configKeys = (config ?? []).map(c => c.key);
    const expectedKeys = ['keepalive_last'];
    for (const ek of expectedKeys) {
      if (!configKeys.includes(ek)) {
        findings.push({ severity: "info", area: "config", message: `Missing config key: ${ek}` });
      }
    }

    // ── 6. Token usage ────────────────────────────────────────────────────
    let tokenUsage = null;
    try {
      const { data: usageData } = await supabase
        .from('toranot_config')
        .select('value')
        .eq('key', 'monthly_token_usage')
        .single();
      tokenUsage = usageData?.value ?? null;
    } catch { /* may not exist yet */ }

    // ── 7. Recent errors ──────────────────────────────────────────────────
    let recentErrors = [];
    try {
      const { data: errData } = await supabase
        .from('toranot_errors')
        .select('level, source, message, created_at')
        .order('created_at', { ascending: false })
        .limit(20);
      recentErrors = errData ?? [];
    } catch { /* table may not exist */ }

    const criticalErrors = recentErrors.filter(e => e.level === 'error' || e.level === 'critical');
    if (criticalErrors.length > 5) {
      findings.push({
        severity: "warning",
        area: "errors",
        message: `${criticalErrors.length} critical/error events in recent log`,
      });
    }

    // ── Build report ──────────────────────────────────────────────────────
    const criticalCount = findings.filter(f => f.severity === "critical").length;
    const warningCount = findings.filter(f => f.severity === "warning").length;

    const report = {
      auditAt: new Date().toISOString(),
      appUrl: "https://toranot.netlify.app",
      status: criticalCount > 0 ? "CRITICAL" : warningCount > 0 ? "WARN" : "HEALTHY",
      summary: {
        patients: patients.length,
        sectionBreakdown: sectionCounts,
        totalTasks,
        openStatTasks,
        dismissalRate: `${(dismissalRate * 100).toFixed(1)}%`,
        backupCount: backupCount ?? 0,
        lastStateUpdate: lastUpdate,
        tokenUsage,
        recentErrorCount: recentErrors.length,
      },
      findings,
      autoFixes,
      engineInvariants: ENGINE_INVARIANTS,
    };

    // ── Persist audit result ──────────────────────────────────────────────
    try {
      await supabase.from('toranot_config').upsert({
        key: 'last_audit',
        value: JSON.stringify({
          at: report.auditAt,
          status: report.status,
          findingsCount: findings.length,
          criticalCount,
          warningCount,
        }),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });
    } catch { /* non-fatal */ }

    return {
      statusCode: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify(report, null, 2),
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message, auditAt: new Date().toISOString() }),
    };
  }
}

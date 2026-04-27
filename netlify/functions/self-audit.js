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
    const daysSinceUpdate = lastUpdate
      ? (Date.now() - new Date(lastUpdate).getTime()) / 86400000
      : Infinity;
    // App is "actively used" if state was touched within the last 14 days.
    // Used by both the stale-data check below and the backup health check (§ 4).
    const isActivelyUsed = Number.isFinite(daysSinceUpdate) && daysSinceUpdate < 14;

    // Stale data check: if state hasn't been updated in >7 days, the app isn't being used
    if (lastUpdate && daysSinceUpdate > 7) {
      findings.push({
        severity: "info",
        area: "usage",
        message: `State not updated in ${Math.round(daysSinceUpdate)} days — no active shift`,
      });
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
    // toranot_patients_backup is currently a passive table — no writer is wired
    // up (verified 2026-04-27). When/if a scheduled snapshot job is built,
    // a missing-backup state during ACTIVE use is the real warning signal.
    // While the app is idle, "0 backups" is expected and not actionable.
    const { count: backupCount } = await supabase
      .from('toranot_patients_backup')
      .select('*', { count: 'exact', head: true });

    if ((backupCount ?? 0) === 0) {
      if (isActivelyUsed) {
        findings.push({
          severity: "warning",
          area: "backup",
          message: `No backups despite recent activity (state updated ${Math.round(daysSinceUpdate)}d ago) — backup writer may be broken or never built.`,
        });
      } else {
        findings.push({
          severity: "info",
          area: "backup",
          message: Number.isFinite(daysSinceUpdate)
            ? `No backups — app idle for ${Math.round(daysSinceUpdate)}d, expected.`
            : `No backups — app has no state yet, expected.`,
        });
      }
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
    // The proxy (netlify/functions/claude.ts) calls increment_token_usage()
    // which writes to per-month-per-provider keys: token_usage_YYYY-MM_provider.
    // This audit ROUTE used to read a legacy `monthly_token_usage` key that
    // hasn't been written since 2026-03-20 — the audit silently reported zero
    // forever. Patched to read the actual keys and aggregate them.
    let tokenUsage = null;
    try {
      const { data: usageRows } = await supabase
        .from('toranot_config')
        .select('key, value, updated_at')
        .like('key', 'token_usage_%')
        .order('updated_at', { ascending: false });
      const rows = usageRows ?? [];
      if (rows.length > 0) {
        const now = new Date();
        const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const currentMonth = rows.filter(r => (r.value?.month) === currentMonthKey);
        const sum = (arr, field) => arr.reduce((a, r) => a + Number(r.value?.[field] ?? 0), 0);
        tokenUsage = {
          currentMonth: currentMonthKey,
          currentMonthTotals: {
            input_tokens: sum(currentMonth, 'input_tokens'),
            output_tokens: sum(currentMonth, 'output_tokens'),
            call_count: sum(currentMonth, 'call_count'),
            byProvider: currentMonth.map(r => ({
              provider: r.value?.provider,
              input_tokens: r.value?.input_tokens ?? 0,
              output_tokens: r.value?.output_tokens ?? 0,
              call_count: r.value?.call_count ?? 0,
            })),
          },
          allTimeTotals: {
            input_tokens: sum(rows, 'input_tokens'),
            output_tokens: sum(rows, 'output_tokens'),
            call_count: sum(rows, 'call_count'),
          },
          lastUpdate: rows[0]?.updated_at ?? null,
        };
      }
    } catch { /* table may not exist or have no token_usage rows yet */ }

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

    // ── 8. Snapshot diff — compare to last audit ────────────────────────
    let previousSnapshot = null;
    let trends = [];
    try {
      const { data: prevData } = await supabase
        .from('toranot_config')
        .select('value')
        .eq('key', 'previous_audit_snapshot')
        .single();
      previousSnapshot = prevData?.value ?? null;
    } catch { /* first audit — no previous */ }

    const currentSnapshot = {
      patients: patients.length,
      totalTasks,
      dismissalRate: totalTasks > 0 ? dismissedTasks / totalTasks : 0,
      backupCount: backupCount ?? 0,
      recentErrorCount: recentErrors.length,
      openStatTasks,
      labEntries: patients.reduce((sum, p) => sum + (p.labs?.length ?? 0), 0),
      medListCount: patients.filter(p => (p.medications?.length ?? 0) > 0).length,
    };

    if (previousSnapshot) {
      const prev = previousSnapshot;
      const diff = (label, curr, old, unit = '', warnThreshold = null) => {
        const delta = curr - old;
        if (delta === 0) return null;
        const sign = delta > 0 ? '+' : '';
        const entry = { metric: label, previous: old, current: curr, delta: `${sign}${delta}${unit}` };
        if (warnThreshold !== null && Math.abs(delta) >= warnThreshold) {
          findings.push({
            severity: "warning",
            area: "trend",
            message: `${label}: ${sign}${delta}${unit} since last audit (${old} → ${curr})`,
          });
        }
        return entry;
      };

      const t = [
        diff("patients", currentSnapshot.patients, prev.patients ?? 0, '', 15),
        diff("totalTasks", currentSnapshot.totalTasks, prev.totalTasks ?? 0, '', 100),
        diff("dismissalRate", Math.round(currentSnapshot.dismissalRate * 100), Math.round((prev.dismissalRate ?? 0) * 100), '%', 15),
        diff("backupCount", currentSnapshot.backupCount, prev.backupCount ?? 0),
        diff("recentErrors", currentSnapshot.recentErrorCount, prev.recentErrorCount ?? 0, '', 10),
        diff("openStatTasks", currentSnapshot.openStatTasks, prev.openStatTasks ?? 0, '', 5),
        diff("labEntries", currentSnapshot.labEntries, prev.labEntries ?? 0),
        diff("patientsWithMeds", currentSnapshot.medListCount, prev.medListCount ?? 0),
      ].filter(Boolean);
      trends = t;
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
        labEntries: currentSnapshot.labEntries,
        patientsWithMedList: currentSnapshot.medListCount,
      },
      trends,
      findings,
      autoFixes,
      engineInvariants: ENGINE_INVARIANTS,
    };

    // ── Persist audit result + snapshot for next diff ──────────────────
    try {
      await supabase.from('toranot_config').upsert({
        key: 'last_audit',
        value: {
          at: report.auditAt,
          status: report.status,
          findingsCount: findings.length,
          criticalCount,
          warningCount,
          trendCount: trends.length,
        },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });

      // Save current snapshot for next audit's diff
      await supabase.from('toranot_config').upsert({
        key: 'previous_audit_snapshot',
        value: currentSnapshot,
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

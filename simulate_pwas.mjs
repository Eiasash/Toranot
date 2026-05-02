// Simulate app usage for medical PWAs via jsdom — captures console errors,
// runtime exceptions, and invariant violations during static load + key flows.
//
// "Debug console" interpretation: collect any console.error/warn,
// uncaught exceptions, and missing-asset signals that would surface in
// the runtime debug console (Geri/IM/FM 5-tap feature).

import { JSDOM, VirtualConsole } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';

const REPOS = [
  { name: 'Geriatrics',       html: 'C:/Users/User/repos/Geriatrics/shlav-a-mega.html', kind: 'standalone' },
  { name: 'InternalMedicine', html: 'C:/Users/User/repos/InternalMedicine/dist/pnimit-mega.html', kind: 'built' },
  { name: 'FamilyMedicine',   html: 'C:/Users/User/repos/FamilyMedicine/dist/mishpacha-mega.html', kind: 'built' },
];

const findings = [];

function log(repo, type, msg, extra = '') {
  findings.push({ repo, type, msg: String(msg).slice(0, 300), extra });
}

async function simulate(repo) {
  console.log(`\n=== ${repo.name} (${repo.kind}) ===`);
  if (!fs.existsSync(repo.html)) {
    log(repo.name, 'ERROR', `HTML file missing: ${repo.html}`);
    return;
  }

  const html = fs.readFileSync(repo.html, 'utf-8');
  const baseDir = path.dirname(repo.html);

  // Quick static checks
  const stats = {
    bytes: html.length,
    scriptTags: (html.match(/<script/g) || []).length,
    linkTags: (html.match(/<link\b/g) || []).length,
    inlineScripts: (html.match(/<script>(?![^<]*src=)/g) || []).length,
  };
  log(repo.name, 'INFO', `Static: ${stats.bytes} bytes, ${stats.scriptTags} script, ${stats.linkTags} link, ${stats.inlineScripts} inline`);

  // Look for obvious issues in static HTML
  if (html.includes('undefined') && !html.includes('typeof undefined')) {
    const matches = [...html.matchAll(/[\s>]undefined[\s<]/g)].slice(0, 3);
    if (matches.length) log(repo.name, 'WARN', `'undefined' string in HTML at offsets: ${matches.map(m=>m.index).join(', ')}`);
  }

  // Check for common bug patterns: onerror= attribute (XSS), eval(), document.write
  if (/onerror\s*=\s*['"]/.test(html)) {
    log(repo.name, 'WARN', `inline onerror= attribute found (XSS risk)`);
  }
  if (/document\.write/.test(html)) {
    log(repo.name, 'WARN', `document.write usage`);
  }

  // Check version-trinity: extract APP_VERSION from html, compare to package.json
  const verMatch = html.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
  if (verMatch) {
    log(repo.name, 'INFO', `APP_VERSION=${verMatch[1]} (from HTML)`);
  }

  // Now load via jsdom — but disable resources to avoid net fetches
  const vc = new VirtualConsole();
  vc.on('error', (err) => log(repo.name, 'CONSOLE.ERROR', err.message ?? err));
  vc.on('warn', (msg) => log(repo.name, 'CONSOLE.WARN', msg));
  vc.on('jsdomError', (err) => log(repo.name, 'JSDOM_ERROR', err.message ?? err));

  const errors = [];

  try {
    const dom = new JSDOM(html, {
      url: `file:///${repo.html.replace(/\\/g,'/').replace('C:/','c:/')}`,
      virtualConsole: vc,
      runScripts: 'outside-only',  // don't auto-execute external scripts (avoids net fetch)
      pretendToBeVisual: true,
      resources: undefined,
    });

    const { window } = dom;

    // Check that key DOM elements exist
    const keyIds = ['app', 'main', 'tabs', 'quiz', 'q-stage', 'quiz-stage'];
    const present = keyIds.filter(id => window.document.getElementById(id)).join(', ');
    if (present) log(repo.name, 'INFO', `Key elements present: ${present}`);

    // Check title
    const title = window.document.title || '(none)';
    log(repo.name, 'INFO', `Title: ${title}`);

    // Look for any inline scripts that might error
    const inlineScripts = [...window.document.querySelectorAll('script:not([src])')];
    log(repo.name, 'INFO', `Found ${inlineScripts.length} inline script blocks`);

    // Check service worker registration code
    const hasSwReg = html.includes('navigator.serviceWorker') || html.includes('register(');
    if (!hasSwReg) log(repo.name, 'WARN', 'No service worker registration code detected');

    // Look for the debug console (5-tap feature)
    const hasDebug = html.includes('__debug') || html.includes('debug-panel') || html.includes('5 taps');
    if (hasDebug) log(repo.name, 'INFO', 'Built-in debug console (__debug API) detected');
    else log(repo.name, 'WARN', 'No built-in debug console detected');

    // Try to load and parse questions.json (the data the app uses)
    const dataPath = path.join(path.dirname(repo.html), 'data/questions.json');
    const fallback = repo.kind === 'built' ? path.join(path.dirname(path.dirname(repo.html)), 'data/questions.json') : null;
    const dataFile = fs.existsSync(dataPath) ? dataPath : (fallback && fs.existsSync(fallback) ? fallback : null);
    if (dataFile) {
      try {
        const raw = fs.readFileSync(dataFile, 'utf-8');
        const arr = JSON.parse(raw);
        log(repo.name, 'DATA', `questions.json: ${arr.length} questions`);

        // Sanity-check: c must be valid index, c_accept must contain c if present.
        // Option count: 2026-05-02 — relaxed from `!== 4` to a 3-6 range. The
        // medical PWAs render variable-length options dynamically (q.o.forEach
        // with Hebrew letters String.fromCharCode(1488+i) → א/ב/ג/ד/ה). The
        // 4-option assumption broke when GRS8 questions (5 options each) were
        // imported into Geri — the simulator was reporting them as bugs but
        // they actually render fine. cInvalid catches the real problem
        // (c-index out of range), so missingFields is now scoped to genuinely
        // broken questions: missing fields, or option counts so far outside
        // the medical-MCQ norm that something is structurally wrong.
        let cInvalid = 0, cAcceptMissingC = 0, missingFields = 0;
        for (let i = 0; i < arr.length; i++) {
          const q = arr[i];
          if (typeof q.c !== 'number' || q.c < 0 || q.c >= (q.o?.length ?? 0)) cInvalid++;
          if (Array.isArray(q.c_accept) && !q.c_accept.includes(q.c)) cAcceptMissingC++;
          if (!q.q || !q.o || !Array.isArray(q.o) || q.o.length < 3 || q.o.length > 6) missingFields++;
        }
        if (cInvalid) log(repo.name, 'BUG', `${cInvalid} questions have invalid c index (out of options range)`);
        if (cAcceptMissingC) log(repo.name, 'BUG', `${cAcceptMissingC} questions: c not in c_accept (regression invariant violated)`);
        if (missingFields) log(repo.name, 'BUG', `${missingFields} questions: missing q/o, or option count outside 3-6 range (structurally broken)`);

        // Find any questions where e contains "המפתח הרשמי" (the legacy artifact pattern)
        const artifactCount = arr.filter(q => (q.e || '').includes('המפתח הרשמי')).length;
        if (artifactCount > 0) log(repo.name, 'BUG', `${artifactCount} questions still contain "המפתח הרשמי" legacy artifact in explanation`);

        // Find questions where explanation contains "התשובה הנכונה" + a different option marker than c
        // i.e., explanation defends a different answer
        const c2letter = ['א', 'ב', 'ג', 'ד'];
        let mismatchCount = 0;
        const mismatchSamples = [];
        for (let i = 0; i < arr.length; i++) {
          const q = arr[i];
          const e = q.e || '';
          if (typeof q.c !== 'number') continue;
          const expectedLetter = c2letter[q.c];
          // Check for explicit "התשובה הנכונה היא X" claims that differ from c
          const claimMatch = e.match(/התשובה הנכונה (?:היא |)([אבגד])\b/);
          if (claimMatch && claimMatch[1] !== expectedLetter) {
            mismatchCount++;
            if (mismatchSamples.length < 5) mismatchSamples.push({i, claimed: claimMatch[1], actual: expectedLetter});
          }
        }
        if (mismatchCount > 0) {
          log(repo.name, 'BUG', `${mismatchCount} questions: explanation claims a Hebrew-letter answer that differs from c`);
          mismatchSamples.forEach(s => log(repo.name, '  detail', `  idx ${s.i}: e claims ${s.claimed}, c=${s.actual}`));
        }
      } catch (err) {
        log(repo.name, 'DATA_ERROR', `questions.json parse failed: ${err.message}`);
      }
    } else {
      log(repo.name, 'WARN', `questions.json not found at ${dataPath}`);
    }

    dom.window.close();
  } catch (err) {
    log(repo.name, 'EXCEPTION', err.message);
    errors.push(err);
  }
}

console.log('Simulating PWAs...');
for (const repo of REPOS) {
  await simulate(repo);
}

console.log('\n=================== FINDINGS ===================');
const byRepo = {};
for (const f of findings) {
  (byRepo[f.repo] ||= []).push(f);
}
for (const [repo, list] of Object.entries(byRepo)) {
  console.log(`\n--- ${repo} ---`);
  for (const f of list) {
    console.log(`  [${f.type}] ${f.msg}`);
  }
}

console.log('\n=================== SUMMARY ===================');
const bugs = findings.filter(f => f.type === 'BUG');
const warns = findings.filter(f => f.type === 'WARN');
console.log(`Bugs: ${bugs.length}, Warnings: ${warns.length}, Info: ${findings.filter(f=>f.type==='INFO').length}`);
fs.writeFileSync('C:/Users/User/simulation_findings.json', JSON.stringify(findings, null, 2));
console.log('Findings written to C:/Users/User/simulation_findings.json');

#!/usr/bin/env node
// PreToolUse hook for Toranot — blocks the exact foot-guns the skill file calls out.
//
// Triggers on Edit / Write / MultiEdit. Reads tool input on stdin.
// Exit 0 = allow; exit 2 = block (Claude sees the stderr output and cannot proceed).
//
// Banned patterns (from toranot-dev SKILL.md):
//   1. `transition-all`  — banned CSS utility (causes layout jank)
//   2. `will-change`-on-`animate-card-in` rules (layer explosion)
//   3. `confirm(`        — silently fails in Android PWA standalone
//   4. mid-file `import` statements (crashes Vite)
//
// Scoped to src/**/*.{ts,tsx,css} and public/**/*.css by default.
// Skips test files (intentional test fixtures may reference the strings).

const fs = require("fs");

let input;
try {
  input = JSON.parse(fs.readFileSync(0, "utf8"));
} catch {
  process.exit(0); // no input, nothing to check
}

const { tool_name, tool_input } = input || {};
if (!tool_name || !tool_input) process.exit(0);
if (!["Edit", "Write", "MultiEdit"].includes(tool_name)) process.exit(0);

const path = tool_input.file_path || "";
if (!path) process.exit(0);

// Only scope to source files inside Toranot repo. Skip tests + node_modules + dist.
// Match both absolute paths (/repo/src/...) and relative (src/...)
const inScope = /(^|\/)(src|public)\//.test(path) &&
                /\.(ts|tsx|js|jsx|css|html)$/.test(path) &&
                !/__tests__|\.test\.|\.spec\.|node_modules|dist/.test(path);
if (!inScope) process.exit(0);

// Aggregate the new content across Edit/Write/MultiEdit shapes
const chunks = [];
if (tool_input.content) chunks.push(tool_input.content);
if (tool_input.new_string) chunks.push(tool_input.new_string);
if (Array.isArray(tool_input.edits)) {
  for (const e of tool_input.edits) if (e && e.new_string) chunks.push(e.new_string);
}
const text = chunks.join("\n");
if (!text) process.exit(0);

const findings = [];

// 1. `transition-all` — always banned in Tailwind class context
if (/\btransition-all\b/.test(text)) {
  findings.push("`transition-all` is banned — use specific transitions like `transition-[width]`, `transition-colors`. See toranot-dev SKILL §3 CSS/Performance.");
}

// 2. will-change on animate-card-in — banned combo
if (/animate-card-in[^\n]*will-change|will-change[^\n]*animate-card-in/.test(text)) {
  findings.push("`will-change` on `animate-card-in` is banned (causes layer explosion). See toranot-dev SKILL §3.");
}

// 3. confirm() in PWA components — silently fails on Android standalone
if (path.match(/\.(tsx|jsx|ts|js)$/) && /\bconfirm\s*\(/.test(text)) {
  // Allow confirm in netlify/functions (server) and obvious lint/test utility
  if (!/netlify\/functions/.test(path)) {
    findings.push("`confirm()` is banned in PWA code (silently fails on Android standalone). Use a React state modal instead. See toranot-dev SKILL §9.");
  }
}

// 4. Mid-file import statement (Vite crashes on these)
if (path.match(/\.(tsx|jsx|ts|js)$/)) {
  const lines = text.split("\n");
  let seenNonImport = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("//") || line.startsWith("/*") || line.startsWith("*") || line.startsWith("'use ")) continue;
    if (line.startsWith("import ") && line.includes("from ")) {
      if (seenNonImport) {
        findings.push(`mid-file \`import\` at line ~${i+1} — move all imports to the top of the file (Vite will crash otherwise). See toranot-dev SKILL §9.`);
        break;
      }
    } else {
      seenNonImport = true;
    }
  }
}

if (findings.length === 0) process.exit(0);

console.error("\n[ban-patterns] Edit blocked — fix the following before writing to " + path + ":\n");
for (const f of findings) console.error("  • " + f);
console.error("");
process.exit(2);

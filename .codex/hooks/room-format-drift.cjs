#!/usr/bin/env node
// PostToolUse hook for Toranot — warns when a room-format file was edited
// without touching the others. Room format lives in 5 files + 1 test suite;
// missing any of them causes silent parser drift.
//
// Emits advisory output on stdout (does NOT block). Claude will see the
// warning in the next turn's tool_result and can surface it to the user.
//
// Tracked files (from toranot-dev SKILL §3 + §10):
//   src/parser/parsePatientList.ts          (ROOM_PATTERN + letter-prefix handling)
//   src/components/AddAdmissionModal.tsx    (parseFreestyle, validation)
//   src/components/Scanner.tsx              (OCR prompt normalization)
//   src/components/VoiceInput.tsx           (ROOM_PATTERN for speech)
//   src/components/QuickCaptureSheet.tsx    (extractRoom, normRoom)
//   src/__tests__/roomFormat.simulation.test.ts  (104-scenario suite)

const fs = require("fs");

let input;
try { input = JSON.parse(fs.readFileSync(0, "utf8")); }
catch { process.exit(0); }

const { tool_name, tool_input } = input || {};
if (!["Edit", "Write", "MultiEdit"].includes(tool_name)) process.exit(0);
const path = (tool_input && tool_input.file_path) || "";
if (!path) process.exit(0);

const TRACKED = [
  { key: "parser",    match: /parsePatientList\.ts$/ },
  { key: "admission", match: /AddAdmissionModal\.tsx$/ },
  { key: "scanner",   match: /Scanner\.tsx$/ },
  { key: "voice",     match: /VoiceInput\.tsx$/ },
  { key: "capture",   match: /QuickCaptureSheet\.tsx$/ },
  { key: "tests",     match: /roomFormat\.simulation\.test\.ts$/ },
];

const hit = TRACKED.find(t => t.match.test(path));
if (!hit) process.exit(0);

// Check whether the edit actually touched the ROOM_PATTERN or room-parsing logic.
// Heuristic: look at the new content for room-format signals.
const newText = [
  tool_input.content,
  tool_input.new_string,
  ...(tool_input.edits || []).map(e => e?.new_string || ""),
].filter(Boolean).join("\n");

const roomSignals = [
  /ROOM_PATTERN/,
  /parseFreestyle/,
  /extractRoom/,
  /normRoom/,
  /\bניטור\b/,
  /ROOM|[Rr]oom/,
  /א-\d+|ב-\d+|ג-\d+|\d+-א/,
];
const touchedRoomLogic = roomSignals.some(r => r.test(newText));
if (!touchedRoomLogic) process.exit(0);

const others = TRACKED.filter(t => t.key !== hit.key).map(t => {
  const display = {
    parser:    "src/parser/parsePatientList.ts",
    admission: "src/components/AddAdmissionModal.tsx",
    scanner:   "src/components/Scanner.tsx",
    voice:     "src/components/VoiceInput.tsx",
    capture:   "src/components/QuickCaptureSheet.tsx",
    tests:     "src/__tests__/roomFormat.simulation.test.ts",
  }[t.key];
  return display;
});

// Non-blocking advisory output (PostToolUse)
console.log("\n[room-format-drift] Heads up — you edited a room-format file (" + path + ").");
console.log("[room-format-drift] Room format logic must stay in sync across all 6 touchpoints.");
console.log("[room-format-drift] Verify you also updated (or intentionally skipped) each of these:");
for (const o of others) console.log("  • " + o);
console.log("[room-format-drift] Reference: toranot-dev SKILL §3 'Room Format' + §10 'Update room format'.\n");
process.exit(0);

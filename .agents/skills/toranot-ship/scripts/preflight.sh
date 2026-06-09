#!/usr/bin/env bash
# Toranot preflight: tsc → vitest → vite build → bundle size gate.
# Exit codes:
#   0 = all gates passed
#   1 = tsc failed
#   2 = vitest failed
#   3 = vite build failed
#   4 = bundle size gate failed
#
# Usage:
#   bash .claude/skills/toranot-ship/scripts/preflight.sh          # full preflight
#   bash .claude/skills/toranot-ship/scripts/preflight.sh --bundle-gate   # only the bundle gate
set -euo pipefail

BUNDLE_BUDGET_BYTES=${BUNDLE_BUDGET_BYTES:-153600}  # 150 * 1024

bundle_gate() {
  local max_size
  if [[ ! -d dist ]]; then
    echo "[preflight] no dist/ yet — run vite build first" >&2
    return 4
  fi
  # Find the largest JS chunk (the main bundle), ignoring pre-gzipped .gz/.br
  max_size=$(find dist/assets -name 'index-*.js' -not -name '*.gz' -not -name '*.br' -printf '%s\n' 2>/dev/null | sort -nr | head -1)
  if [[ -z "$max_size" ]]; then
    echo "[preflight] could not find dist/assets/index-*.js" >&2
    return 4
  fi
  if (( max_size > BUNDLE_BUDGET_BYTES )); then
    printf "[preflight] bundle %d bytes exceeds budget %d bytes\n" "$max_size" "$BUNDLE_BUDGET_BYTES" >&2
    return 4
  fi
  printf "[preflight] bundle %d bytes OK (budget %d)\n" "$max_size" "$BUNDLE_BUDGET_BYTES"
  return 0
}

if [[ "${1:-}" == "--bundle-gate" ]]; then
  bundle_gate
  exit $?
fi

echo "[preflight] step 1/4 — tsc --noEmit"
if ! npx tsc --noEmit; then
  echo "[preflight] tsc failed — fix type errors before shipping" >&2
  exit 1
fi

echo "[preflight] step 2/4 — vitest run"
if ! npx vitest run --reporter=dot; then
  echo "[preflight] vitest failed — fix broken tests before shipping" >&2
  exit 2
fi

echo "[preflight] step 3/4 — vite build"
if ! npx vite build; then
  echo "[preflight] vite build failed" >&2
  exit 3
fi

echo "[preflight] step 4/4 — bundle size gate"
bundle_gate || exit 4

echo "[preflight] OK — safe to push"

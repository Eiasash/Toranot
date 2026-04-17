#!/usr/bin/env bash
# Poll Netlify API until the latest deploy for toranot.netlify.app is ready.
# Asserts the deployed commit matches the just-pushed HEAD SHA.
#
# Usage:
#   bash .claude/skills/toranot-ship/scripts/verify-deploy.sh
#   NETLIFY_AUTH_TOKEN is optional — works without it (public site info),
#   but authenticated polling gets higher rate limits.
#
# Exit codes:
#   0 = deploy ready and commit_ref matches HEAD
#   20 = timeout waiting for ready
#   21 = deploy state = error
#   22 = commit_ref mismatch
set -euo pipefail

SITE_ID="85d12386-b960-4f65-bee8-80e210ecd683"
TIMEOUT_SEC=${TIMEOUT_SEC:-300}
POLL_INTERVAL_SEC=${POLL_INTERVAL_SEC:-10}
DEPLOYS_URL="https://api.netlify.com/api/v1/sites/${SITE_ID}/deploys?per_page=1"

EXPECTED_SHA=$(git rev-parse HEAD)
SHORT_SHA=${EXPECTED_SHA:0:7}
echo "[verify] waiting for Netlify to deploy $SHORT_SHA …"

AUTH_HEADER=()
if [[ -n "${NETLIFY_AUTH_TOKEN:-}" ]]; then
  AUTH_HEADER=(-H "Authorization: Bearer ${NETLIFY_AUTH_TOKEN}")
fi

deadline=$(( $(date +%s) + TIMEOUT_SEC ))
while :; do
  now=$(date +%s)
  if (( now > deadline )); then
    echo "[verify] TIMEOUT after ${TIMEOUT_SEC}s — deploy did not reach 'ready'" >&2
    exit 20
  fi

  body=$(curl -fsS "${AUTH_HEADER[@]}" "$DEPLOYS_URL" 2>/dev/null || echo "[]")
  # Cheap JSON field extraction without jq dependency
  state=$(echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0].get('state','?') if d else '?')" 2>/dev/null || echo "?")
  commit=$(echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0].get('commit_ref','') if d else '')" 2>/dev/null || echo "")

  printf "[verify] state=%s commit=%s\n" "$state" "${commit:0:7}"

  case "$state" in
    ready)
      if [[ "$commit" == "$EXPECTED_SHA" ]]; then
        echo "[verify] OK — deployed commit matches HEAD"
        exit 0
      fi
      # It's possible a newer push is still in flight; keep polling briefly
      echo "[verify] ready but commit mismatch (expected $SHORT_SHA, got ${commit:0:7}) — may be a prior deploy, polling again" >&2
      ;;
    error)
      echo "[verify] Netlify deploy failed — state=error — check build logs in dashboard" >&2
      exit 21
      ;;
    new|uploading|uploaded|preparing|prepared|building|processing|enqueued|"")
      : # keep polling
      ;;
    *)
      echo "[verify] unknown state: $state — continuing to poll" >&2
      ;;
  esac

  sleep "$POLL_INTERVAL_SEC"
done

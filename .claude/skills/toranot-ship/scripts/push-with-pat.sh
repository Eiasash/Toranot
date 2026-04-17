#!/usr/bin/env bash
# Safe push to Eiasash/Toranot with PAT rotation.
# The PAT is injected into the remote URL only for the push, then scrubbed
# back to a tokenless HTTPS URL IMMEDIATELY — even on failure.
#
# Usage:
#   GH_PAT=ghp_xxx bash .claude/skills/toranot-ship/scripts/push-with-pat.sh "feat: description"
#
# Fails (non-zero exit) if:
#   - GH_PAT is unset
#   - commit message is missing
#   - branch is not main
#   - push fails
#
# On any exit path, scrub the remote.
set -uo pipefail

REPO_URL="https://github.com/Eiasash/Toranot.git"
COMMITTER_NAME="Eias"
COMMITTER_EMAIL="eias@toranot.app"

scrub_remote() {
  git remote set-url origin "$REPO_URL" 2>/dev/null || true
}
trap scrub_remote EXIT

if [[ -z "${GH_PAT:-}" ]]; then
  echo "[push] GH_PAT env var is required — paste your fresh PAT into the environment, do not commit it" >&2
  exit 10
fi

COMMIT_MSG="${1:-}"
if [[ -z "$COMMIT_MSG" ]]; then
  echo "[push] commit message required as argument 1" >&2
  exit 11
fi

# Enforce commit convention (feat:/fix:/refactor:/test:/chore:/docs:)
if ! [[ "$COMMIT_MSG" =~ ^(feat|fix|refactor|test|chore|docs|perf|style)(\(.+\))?:\  ]]; then
  echo "[push] commit message must start with type: — got: $COMMIT_MSG" >&2
  exit 12
fi

CUR_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$CUR_BRANCH" != "main" ]]; then
  echo "[push] refusing to ship from branch '$CUR_BRANCH' — switch to main first" >&2
  exit 13
fi

if [[ -z "$(git status --porcelain)" ]]; then
  echo "[push] nothing to commit — working tree clean" >&2
  exit 14
fi

git config user.email "$COMMITTER_EMAIL"
git config user.name "$COMMITTER_NAME"

# Inject PAT ONLY for the push
git remote set-url origin "https://${GH_PAT}@github.com/Eiasash/Toranot.git"

git add -A
if ! git commit -m "$COMMIT_MSG"; then
  echo "[push] commit failed" >&2
  exit 15
fi

if ! git push origin main; then
  echo "[push] push failed — remote is scrubbed via trap; resolve and retry" >&2
  exit 16
fi

SHA=$(git rev-parse --short HEAD)
echo "[push] OK — pushed $SHA to main"
echo "[push] REMINDER: revoke this PAT at https://github.com/settings/tokens"

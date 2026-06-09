#!/usr/bin/env bash
# Safe branch-push to Eiasash/Toranot with PAT rotation.
# The PAT is injected into the remote URL only for the push, then scrubbed
# back to a tokenless HTTPS URL IMMEDIATELY — even on failure.
#
# Ships via the AGENTS.md release path: branch -> PR -> CI green + Codex
# review -> merge. This script NEVER pushes main directly.
#
# Usage:
#   GH_PAT=ghp_xxx bash .agents/skills/toranot-ship/scripts/push-with-pat.sh "feat: description" [branch-name]
#
# If branch-name is omitted and HEAD is on main, a codex/ship-<utc-stamp>
# branch is created. If HEAD is already on a non-main branch, it is reused.
#
# Resume: if a previous run committed but the push failed, rerun the same
# command from the ship branch — unpushed commits are detected and re-pushed
# (no new commit is created when the tree is clean).
#
# Fails (non-zero exit) if:
#   - GH_PAT is unset
#   - commit message is missing
#   - the resolved ship branch is main
#   - nothing to ship (clean tree AND no unpushed commits)
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
SHIP_BRANCH="${2:-}"
if [[ -z "$SHIP_BRANCH" ]]; then
  if [[ "$CUR_BRANCH" == "main" ]]; then
    SHIP_BRANCH="codex/ship-$(date -u +%Y%m%d-%H%M%S)"
  else
    SHIP_BRANCH="$CUR_BRANCH"
  fi
fi

if [[ "$SHIP_BRANCH" == "main" ]]; then
  echo "[push] refusing to push main directly — release path is branch -> PR -> CI + Codex review -> merge (AGENTS.md)" >&2
  exit 13
fi

# Ship-needed check: dirty tree (fresh run) OR unpushed commits on the ship
# branch (resume after a failed push — rerun from the ship branch itself).
DIRTY=$(git status --porcelain)
if git rev-parse --verify -q "origin/$SHIP_BRANCH" >/dev/null 2>&1; then
  UNPUSHED=$(git rev-list --count "origin/$SHIP_BRANCH..HEAD" 2>/dev/null || echo 0)
else
  UNPUSHED=$(git rev-list --count "origin/main..HEAD" 2>/dev/null || echo 0)
fi
if [[ -z "$DIRTY" && "$UNPUSHED" -eq 0 ]]; then
  echo "[push] nothing to ship — working tree clean and no unpushed commits" >&2
  exit 14
fi

if [[ "$CUR_BRANCH" != "$SHIP_BRANCH" ]]; then
  if ! git checkout -b "$SHIP_BRANCH"; then
    echo "[push] could not create branch $SHIP_BRANCH" >&2
    exit 17
  fi
fi

git config user.email "$COMMITTER_EMAIL"
git config user.name "$COMMITTER_NAME"

# Inject PAT ONLY for the push
git remote set-url origin "https://${GH_PAT}@github.com/Eiasash/Toranot.git"

if [[ -n "$DIRTY" ]]; then
  git add -A
  if ! git commit -m "$COMMIT_MSG"; then
    echo "[push] commit failed" >&2
    exit 15
  fi
else
  echo "[push] resuming — re-pushing $UNPUSHED stranded local commit(s) on $SHIP_BRANCH"
fi

if ! git push -u origin "$SHIP_BRANCH"; then
  echo "[push] push failed — remote is scrubbed via trap; resolve and retry" >&2
  exit 16
fi

scrub_remote

SHA=$(git rev-parse --short HEAD)
echo "[push] OK — pushed $SHA to $SHIP_BRANCH"

# Open the PR (gh if authenticated, otherwise print the compare URL)
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  gh pr create --base main --head "$SHIP_BRANCH" --title "$COMMIT_MSG" \
    --body "Shipped via toranot-ship. Merge requires CI green + Codex review per AGENTS.md." \
    || echo "[push] gh pr create failed — open manually: https://github.com/Eiasash/Toranot/compare/main...$SHIP_BRANCH" >&2
else
  echo "[push] open the PR: https://github.com/Eiasash/Toranot/compare/main...$SHIP_BRANCH"
fi

echo "[push] REMINDER: revoke this PAT at https://github.com/settings/tokens"

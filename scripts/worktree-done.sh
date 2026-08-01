#!/usr/bin/env bash
# worktree-done.sh
#
# Canonical end-of-session worktree cleanup, per CLAUDE.md's Session Isolation
# policy. Run from the BASE repository checkout, not from inside the worktree.
#
# Usage: worktree-done.sh <worktree-path> [branch]
#
# - Refuses to remove a worktree with uncommitted changes.
# - Handles the initialized-wiki-submodule case (git worktree remove refuses
#   it; falls back to rm -rf + git worktree prune).
# - Deletes the local branch only when a merged PR for it is found (squash
#   merges require -D). Set FORCE_BRANCH_DELETE=1 to delete regardless.

set -euo pipefail

WT_PATH="${1:?usage: worktree-done.sh <worktree-path> [branch]}"
REPO="${REPO:-steilerDev/cornerstone}"

if ! git worktree list --porcelain | grep -qx "worktree $(cd "$WT_PATH" && pwd)"; then
  echo "worktree-done: '$WT_PATH' is not a registered worktree of this repository." >&2
  exit 1
fi

if [ -n "$(git -C "$WT_PATH" status --porcelain)" ]; then
  echo "worktree-done: '$WT_PATH' has uncommitted changes -- refusing to remove." >&2
  exit 1
fi

BRANCH="${2:-$(git -C "$WT_PATH" branch --show-current)}"

if ! git worktree remove "$WT_PATH" 2>/dev/null; then
  # Initialized submodules (wiki/) make `git worktree remove` refuse even when
  # clean. The tree is verified clean above, so force-remove and prune.
  echo "worktree-done: git worktree remove refused (likely wiki submodule) -- using rm -rf + prune."
  rm -rf "$WT_PATH"
  git worktree prune
fi
echo "worktree-done: removed worktree $WT_PATH"

if [ -z "$BRANCH" ]; then
  echo "worktree-done: no branch detected; nothing to delete."
  exit 0
fi

if [ "${FORCE_BRANCH_DELETE:-0}" = "1" ] \
  || [ -n "$(gh pr list --repo "$REPO" --head "$BRANCH" --state merged --json number -q '.[0].number' 2>/dev/null)" ]; then
  git branch -D "$BRANCH" && echo "worktree-done: deleted branch $BRANCH"
else
  echo "worktree-done: no merged PR found for '$BRANCH' -- keeping the branch (FORCE_BRANCH_DELETE=1 to override)."
fi

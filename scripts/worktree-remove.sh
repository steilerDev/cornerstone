#!/usr/bin/env bash
# Remove a git worktree created by worktree-create.sh.
#
# Usage: worktree-remove.sh <branch-name> [--delete-branch]
#
# - <branch-name>: The branch whose worktree should be removed
# - --delete-branch: Also delete the local branch after removing the worktree
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MAIN_WORKTREE="$(dirname "$SCRIPT_DIR")"

BRANCH="${1:?Usage: worktree-remove.sh <branch-name> [--delete-branch]}"
DELETE_BRANCH=false
if [ "${2:-}" = "--delete-branch" ]; then
  DELETE_BRANCH=true
fi

# Find the worktree path for this branch
WORKTREE_PATH=$(git -C "$MAIN_WORKTREE" worktree list --porcelain | grep -A0 "^worktree " | awk '{print $2}' | while read -r dir; do
  if [ "$dir" = "$MAIN_WORKTREE" ]; then continue; fi
  if git -C "$dir" rev-parse --abbrev-ref HEAD 2>/dev/null | grep -qx "$BRANCH"; then
    echo "$dir"
    break
  fi
done)

if [ -z "$WORKTREE_PATH" ]; then
  echo "Error: No worktree found for branch '${BRANCH}'" >&2
  echo "Active worktrees:"
  git -C "$MAIN_WORKTREE" worktree list
  exit 1
fi

echo "Removing worktree at: ${WORKTREE_PATH}"
git -C "$MAIN_WORKTREE" worktree remove "$WORKTREE_PATH" --force

if [ "$DELETE_BRANCH" = true ]; then
  echo "Deleting local branch '${BRANCH}'..."
  git -C "$MAIN_WORKTREE" branch -d "$BRANCH" 2>/dev/null || \
    git -C "$MAIN_WORKTREE" branch -D "$BRANCH"
fi

echo ""
echo "Remaining worktrees:"
git -C "$MAIN_WORKTREE" worktree list

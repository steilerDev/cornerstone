#!/usr/bin/env bash
# Create a new git worktree for parallel coding sessions.
#
# Usage: worktree-create.sh <branch-name> [slot]
#
# - <branch-name>: The branch to check out in the new worktree (created from beta if new)
# - [slot]: Port slot 1-3 (auto-detected if omitted)
#
# Each slot maps to a unique pair of server/client ports:
#   Slot 0: PORT=3000, CLIENT_DEV_PORT=5173 (main worktree, default)
#   Slot 1: PORT=3001, CLIENT_DEV_PORT=5174
#   Slot 2: PORT=3002, CLIENT_DEV_PORT=5175
#   Slot 3: PORT=3003, CLIENT_DEV_PORT=5176
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MAIN_WORKTREE="$(dirname "$SCRIPT_DIR")"

BRANCH="${1:?Usage: worktree-create.sh <branch-name> [slot]}"
SLOT="${2:-}"

# Require gwq
if ! command -v gwq &>/dev/null; then
  echo "Error: gwq is not installed. Run: scripts/install-gwq.sh" >&2
  exit 1
fi

# Auto-detect next free slot (1-3) by checking which .env.worktree files exist
if [ -z "$SLOT" ]; then
  WORKTREE_DIRS=$(git -C "$MAIN_WORKTREE" worktree list --porcelain | grep '^worktree ' | awk '{print $2}')
  USED_SLOTS=()
  for dir in $WORKTREE_DIRS; do
    if [ -f "$dir/.env.worktree" ]; then
      s=$(grep '^PORT=' "$dir/.env.worktree" 2>/dev/null | head -1 | sed 's/PORT=300//')
      if [ -n "$s" ] && [ "$s" -ge 1 ] && [ "$s" -le 3 ]; then
        USED_SLOTS+=("$s")
      fi
    fi
  done
  for candidate in 1 2 3; do
    found=0
    for used in "${USED_SLOTS[@]+"${USED_SLOTS[@]}"}"; do
      if [ "$candidate" = "$used" ]; then found=1; break; fi
    done
    if [ "$found" = "0" ]; then
      SLOT="$candidate"
      break
    fi
  done
  if [ -z "$SLOT" ]; then
    echo "Error: All slots (1-3) are in use. Remove a worktree first." >&2
    exit 1
  fi
  echo "Auto-selected slot ${SLOT}"
fi

if [ "$SLOT" -lt 1 ] || [ "$SLOT" -gt 3 ]; then
  echo "Error: Slot must be 1-3 (slot 0 is the main worktree)" >&2
  exit 1
fi

SERVER_PORT=$((3000 + SLOT))
CLIENT_PORT=$((5173 + SLOT))

# Create worktree via gwq (creates branch from current HEAD if it doesn't exist)
echo "Creating worktree for branch '${BRANCH}' (slot ${SLOT}: ports ${SERVER_PORT}/${CLIENT_PORT})..."

# If the branch doesn't exist, create it from beta
if ! git -C "$MAIN_WORKTREE" rev-parse --verify "$BRANCH" &>/dev/null; then
  echo "Branch '${BRANCH}' does not exist, creating from beta..."
  git -C "$MAIN_WORKTREE" branch "$BRANCH" beta
fi

cd "$MAIN_WORKTREE"
gwq add "$BRANCH"

# Find the worktree path
WORKTREE_PATH=$(git -C "$MAIN_WORKTREE" worktree list --porcelain | grep -A0 "^worktree " | awk '{print $2}' | while read -r dir; do
  if git -C "$dir" rev-parse --abbrev-ref HEAD 2>/dev/null | grep -qx "$BRANCH"; then
    echo "$dir"
    break
  fi
done)

if [ -z "$WORKTREE_PATH" ]; then
  echo "Error: Could not find worktree path after creation" >&2
  exit 1
fi

echo "Worktree created at: ${WORKTREE_PATH}"

# Write .env.worktree
cat > "${WORKTREE_PATH}/.env.worktree" <<EOF
PORT=${SERVER_PORT}
CLIENT_DEV_PORT=${CLIENT_PORT}
DATABASE_URL=./data/cornerstone.db
NODE_ENV=development
SECURE_COOKIES=false
EOF
echo "Created .env.worktree (PORT=${SERVER_PORT}, CLIENT_DEV_PORT=${CLIENT_PORT})"

# Symlink agent memory from main worktree so learnings are shared
AGENT_MEMORY_SRC="${MAIN_WORKTREE}/.claude/agent-memory"
AGENT_MEMORY_DST="${WORKTREE_PATH}/.claude/agent-memory"
if [ -d "$AGENT_MEMORY_SRC" ]; then
  mkdir -p "${WORKTREE_PATH}/.claude"
  if [ ! -L "$AGENT_MEMORY_DST" ]; then
    ln -s "$AGENT_MEMORY_SRC" "$AGENT_MEMORY_DST"
    echo "Symlinked .claude/agent-memory/ from main worktree"
  fi
fi

# Symlink cagent memory from main worktree so learnings are shared
CAGENT_MEMORY_SRC="${MAIN_WORKTREE}/.cagent/memory"
CAGENT_MEMORY_DST="${WORKTREE_PATH}/.cagent/memory"
if [ -d "$CAGENT_MEMORY_SRC" ]; then
  mkdir -p "${WORKTREE_PATH}/.cagent"
  if [ ! -L "$CAGENT_MEMORY_DST" ]; then
    ln -s "$CAGENT_MEMORY_SRC" "$CAGENT_MEMORY_DST"
    echo "Symlinked .cagent/memory/ from main worktree"
  fi
fi

# Bootstrap: install dependencies and build shared
echo "Bootstrapping worktree (npm install + build shared)..."
cd "$WORKTREE_PATH"
npm install
npm rebuild better-sqlite3 2>/dev/null || true
npm run build -w shared

echo ""
echo "Worktree ready at: ${WORKTREE_PATH}"
echo "To start development:"
echo "  cd ${WORKTREE_PATH}"
echo "  source .env.worktree && npm run dev"

#!/usr/bin/env bash
# board.sh
#
# Single source of truth for GitHub Projects board mutations. The opaque
# project / field / option IDs live HERE and nowhere else -- skills call this
# script instead of inlining `gh project item-edit` blocks.
#
# Usage: board.sh <issue-number> <backlog|todo|in-progress|done|wont-do>
#
# Adds the issue to the board first if it is not on it yet.

set -euo pipefail

ISSUE="${1:?usage: board.sh <issue-number> <backlog|todo|in-progress|done|wont-do>}"
STATUS="${2:?usage: board.sh <issue-number> <backlog|todo|in-progress|done|wont-do>}"

OWNER="steilerDev"
REPO="steilerDev/cornerstone"
PROJECT_NUMBER=4
PROJECT_ID="PVT_kwHOAGtLQM4BOlve"
STATUS_FIELD_ID="PVTSSF_lAHOAGtLQM4BOlvezg9P0yo"

case "$STATUS" in
  backlog)     OPTION_ID="7404f88c" ;;
  todo)        OPTION_ID="dc74a3b0" ;;
  in-progress) OPTION_ID="296eeabe" ;;
  done)        OPTION_ID="c558f50d" ;;
  wont-do)     OPTION_ID="90c1bc33" ;;
  *)
    echo "board: unknown status '$STATUS' (use backlog|todo|in-progress|done|wont-do)" >&2
    exit 1
    ;;
esac

ITEMS_JSON=$(gh project item-list "$PROJECT_NUMBER" --owner "$OWNER" --format json --limit 1000)
ITEM_COUNT=$(printf '%s' "$ITEMS_JSON" | jq '.items | length')
if [ "$ITEM_COUNT" -ge 1000 ]; then
  echo "board: item-list returned $ITEM_COUNT items (the --limit) -- the board may be truncated and the lookup unreliable. Raise the limit in board.sh." >&2
  exit 1
fi
ITEM_ID=$(printf '%s' "$ITEMS_JSON" \
  | jq -r --argjson n "$ISSUE" '.items[] | select(.content.number == $n) | .id' | head -1)

if [ -z "$ITEM_ID" ]; then
  echo "board: issue #$ISSUE not on the board -- adding it."
  ITEM_ID=$(gh project item-add "$PROJECT_NUMBER" --owner "$OWNER" \
    --url "https://github.com/$REPO/issues/$ISSUE" --format json | jq -r '.id')
fi

gh project item-edit --id "$ITEM_ID" --project-id "$PROJECT_ID" \
  --field-id "$STATUS_FIELD_ID" --single-select-option-id "$OPTION_ID" > /dev/null

echo "board: issue #$ISSUE -> $STATUS"

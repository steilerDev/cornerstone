#!/usr/bin/env bash
# squash-merge.sh
#
# Canonical squash-merge with agent-trailer preservation. Rebuilds the squash
# commit's subject and body explicitly so trailers survive GitHub's varying
# default squash behavior, deduplicated and case-normalized. Single source of
# truth -- skills call this instead of inlining the trailer-rebuild block.
#
# Usage: squash-merge.sh <pr-number> <subject> [body-file]
#
#   <subject>    clean conventional-commit title. Must NOT contain a literal
#                skip-ci directive (see CLAUDE.md's CI Skip-Directive Quirks).
#   [body-file]  optional file whose contents become the body above the
#                trailers (summary bullets, "Fixes #N" lines).

set -euo pipefail

PR="${1:?usage: squash-merge.sh <pr-number> <subject> [body-file]}"
SUBJECT="${2:?usage: squash-merge.sh <pr-number> <subject> [body-file]}"
BODY_FILE="${3:-}"
REPO="${REPO:-steilerDev/cornerstone}"

# Guard: a skip-ci directive in the squash subject suppresses ALL workflows on
# the merged commit, including promotion-PR syncs.
if printf '%s' "$SUBJECT" | grep -qiE '\[(skip ci|ci skip|skip actions|actions skip|skip-checks: true)\]'; then
  echo "squash-merge: subject contains a CI-skip directive -- rewrite it (use a code span or prose instead)." >&2
  exit 1
fi

# Collect Co-Authored-By trailers from every commit on the PR, normalize the
# label casing, and deduplicate.
TRAILERS=$(gh pr view "$PR" --repo "$REPO" --json commits -q '.commits[].messageBody' \
  | grep -iE '^co-authored-by:' \
  | sed -E 's/^[Cc]o-[Aa]uthored-[Bb]y:/Co-Authored-By:/' \
  | sort -u || true)

BODY=""
if [ -n "$BODY_FILE" ]; then
  BODY=$(cat "$BODY_FILE")
fi
if [ -n "$TRAILERS" ]; then
  if [ -n "$BODY" ]; then
    BODY="$BODY

$TRAILERS"
  else
    BODY="$TRAILERS"
  fi
fi

gh pr merge "$PR" --repo "$REPO" --squash --subject "$SUBJECT" --body "$BODY"
echo "squash-merge: PR #$PR merged."

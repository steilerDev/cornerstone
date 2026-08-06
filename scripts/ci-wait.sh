#!/usr/bin/env bash
# ci-wait.sh
#
# Canonical CI-gate wait for a PR. Single source of truth for CI polling --
# skills and CLAUDE.md reference this script instead of inlining bash loops.
#
# Usage: ci-wait.sh <pr-number> [beta|main]
#
# Gate mode defaults to the PR's base branch: beta waits for "Quality Gates"
# (timeout 600s), main waits for "Quality Gates" + "E2E Gates" (timeout 900s).
# Override the timeout with CI_WAIT_TIMEOUT=<seconds>.
#
# NOTE: `gh pr checks --json` does not support the required-checks / Rulesets
# setup of this repo and silently fails -- this script polls the commit
# check-runs API instead.

set -euo pipefail

PR="${1:?usage: ci-wait.sh <pr-number> [beta|main]}"
REPO="${REPO:-steilerDev/cornerstone}"

# --- Step 1: mergeability precheck (CI may not run, or silently hang, on a
# conflicted PR). UNKNOWN means GitHub is still computing -- retry briefly.
for attempt in 1 2 3 4 5; do
  state=$(gh pr view "$PR" --repo "$REPO" --json mergeable -q '.mergeable')
  [ "$state" != "UNKNOWN" ] && break
  sleep 5
done
if [ "$state" = "CONFLICTING" ]; then
  echo "ci-wait: PR #$PR is CONFLICTING -- rebase onto the target branch before waiting for CI." >&2
  exit 1
fi

BASE=$(gh pr view "$PR" --repo "$REPO" --json baseRefName -q '.baseRefName')
MODE="${2:-}"
if [ -z "$MODE" ]; then
  [ "$BASE" = "main" ] && MODE=main || MODE=beta
fi

if [ "$MODE" = "main" ]; then
  CHECKS=("Quality Gates" "E2E Gates")
  TIMEOUT="${CI_WAIT_TIMEOUT:-900}"
else
  CHECKS=("Quality Gates")
  TIMEOUT="${CI_WAIT_TIMEOUT:-600}"
fi

SHA=$(gh pr view "$PR" --repo "$REPO" --json headRefOid -q '.headRefOid')
echo "ci-wait: PR #$PR head=$SHA mode=$MODE timeout=${TIMEOUT}s -- waiting for: ${CHECKS[*]}"

# --- Step 2: poll the check-runs API for the required check names.
# Transient gh/API failures back off (rate-limit policy: 30->60->120->240->480s).
SECONDS=0
backoff=30
while true; do
  if [ "$SECONDS" -ge "$TIMEOUT" ]; then
    echo "ci-wait: TIMEOUT -- required checks did not complete within ${TIMEOUT}s." >&2
    echo "ci-wait: if no check-runs exist at all, check for a [skip ci] directive on the head commit (see CLAUDE.md's CI Skip-Directive Quirks)." >&2
    exit 1
  fi

  if ! runs=$(gh api "repos/$REPO/commits/$SHA/check-runs" --paginate \
      -q '.check_runs[] | "\(.name)\t\(.status)\t\(.conclusion)\t\(.started_at)"' 2>&1); then
    if echo "$runs" | grep -qiE 'rate limit|abuse detection|was blocked|HTTP 403|HTTP 429'; then
      echo "ci-wait: rate-limited, backing off ${backoff}s"
      sleep "$backoff"
      backoff=$(( backoff < 480 ? backoff * 2 : 480 ))
      continue
    fi
    echo "ci-wait: gh api failed: $runs" >&2
    sleep 30
    continue
  fi
  backoff=30

  all_passed=true
  for check in "${CHECKS[@]}"; do
    # A re-run creates a second check-run with the same name; always judge the
    # most recently started one so a stale failure can't shadow a green re-run.
    line=$(printf '%s\n' "$runs" | awk -F'\t' -v c="$check" '$1 == c' | sort -t "$(printf '\t')" -k4,4r | head -n 1)
    if [ -z "$line" ]; then
      all_passed=false
      continue
    fi
    status=$(printf '%s' "$line" | cut -f2)
    conclusion=$(printf '%s' "$line" | cut -f3)
    if [ "$status" = "completed" ]; then
      case "$conclusion" in
        success|skipped|neutral) ;;
        *)
          echo "ci-wait: '$check' FAILED (conclusion: $conclusion)." >&2
          exit 1
          ;;
      esac
    else
      all_passed=false
    fi
  done

  if [ "$all_passed" = true ]; then
    echo "ci-wait: all required checks passed (${CHECKS[*]})."
    exit 0
  fi
  sleep 30
done

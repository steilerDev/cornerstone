#!/usr/bin/env bash
# check-trailers.sh
#
# Verifies that commits in a given range carry the Co-Authored-By agent
# trailers required by CLAUDE.md's "Delegation Enforcement" rules (2-6),
# based on which paths changed in that range.
#
# Usage: check-trailers.sh <base-ref> <head-ref>
#
# Skip condition (exit 0, no checks run): the range contains NO
# "Claude <agent> ... <noreply@anthropic.com>" trailer at all. That's the
# signal this range is human-authored / outside the agent workflow --
# agent trailer rules don't apply to humans. (Dependabot PRs are skipped
# one level up, at the CI job's `if:`, by PR author login.)
#
# Detection is case-insensitive (format drift like "co-authored-by" vs
# "Co-Authored-By" must still be caught as present). Writing trailers is
# always canonical-case per CLAUDE.md's Canonical Agent Trailers table --
# this script only reads.

set -euo pipefail

BASE_REF="${1:?usage: check-trailers.sh <base-ref> <head-ref>}"
HEAD_REF="${2:?usage: check-trailers.sh <base-ref> <head-ref>}"

CHANGED=$(git diff --name-only "${BASE_REF}...${HEAD_REF}")
TRAILERS=$(git log "${BASE_REF}..${HEAD_REF}" --format="%B" | grep -iE '^co-authored-by:' || true)

# Human-authored range: no Claude agent trailers anywhere -- skip entirely.
if ! echo "$TRAILERS" | grep -qiE 'claude[[:space:]]+[a-z0-9-]+.*<noreply@anthropic\.com>'; then
  echo "check-trailers: no Claude agent trailers found in range -- treating as human-authored, skipping."
  exit 0
fi

FAILED=0

require() {
  local agent="$1" label="$2"
  if ! echo "$TRAILERS" | grep -qiE "claude[[:space:]]+${agent}[[:space:]]*\("; then
    echo "ERROR: files matching '${label}' changed but no 'Co-Authored-By: Claude ${agent} (...)' trailer found in range ${BASE_REF}..${HEAD_REF}." >&2
    FAILED=1
  fi
}

# Rule 2: server/ or shared/, excluding co-located tests -> backend-developer
BACKEND_NONTEST=$(echo "$CHANGED" | grep -E '^(server|shared)/' | grep -vE '\.test\.tsx?$' || true)
if [[ -n "$BACKEND_NONTEST" ]]; then
  require "backend-developer" "server/**, shared/** (non-test)"
fi

# Rule 3: client/, excluding i18n/de/, glossary.json, and co-located tests -> frontend-developer
FRONTEND_NONTEST=$(echo "$CHANGED" | grep -E '^client/' \
  | grep -vE '^client/src/i18n/de/|^client/src/i18n/glossary\.json$' \
  | grep -vE '\.test\.tsx?$' || true)
if [[ -n "$FRONTEND_NONTEST" ]]; then
  require "frontend-developer" "client/** (non-i18n-de, non-glossary, non-test)"
fi

# Rule 4: client/src/i18n/de/ or glossary.json -> translator
TRANSLATOR_FILES=$(echo "$CHANGED" | grep -E '^client/src/i18n/de/|^client/src/i18n/glossary\.json$' || true)
if [[ -n "$TRANSLATOR_FILES" ]]; then
  require "translator" "client/src/i18n/de/**, glossary.json"
fi

# Rule 5: e2e/ -> e2e-test-engineer
E2E_FILES=$(echo "$CHANGED" | grep -E '^e2e/' || true)
if [[ -n "$E2E_FILES" ]]; then
  require "e2e-test-engineer" "e2e/**"
fi

# Rule 6: co-located unit/integration tests outside e2e/ -> qa-integration-tester
QA_FILES=$(echo "$CHANGED" | grep -vE '^e2e/' | grep -E '\.test\.tsx?$' || true)
if [[ -n "$QA_FILES" ]]; then
  require "qa-integration-tester" "*.test.ts(x) outside e2e/"
fi

if [[ $FAILED -ne 0 ]]; then
  echo "" >&2
  echo "See CLAUDE.md's 'Delegation Enforcement' and 'Canonical Agent Trailers' sections." >&2
  exit 1
fi

echo "check-trailers: all required agent trailers present for ${BASE_REF}..${HEAD_REF}."

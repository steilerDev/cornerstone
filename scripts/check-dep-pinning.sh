#!/usr/bin/env bash
# check-dep-pinning.sh
#
# Verifies that all entries in "dependencies" and "devDependencies" in a
# package.json file use exact pinned versions (no ^ or ~ ranges).
#
# Usage: check-dep-pinning.sh <path-to-package.json> [...]
#
# Exits non-zero and prints a helpful error if any unpinned ranges are found.
# Ignores "peerDependencies" (caret ranges are idiomatic there).
# Ignores workspace cross-references (values of "*" or "workspace:*").

set -euo pipefail

FAILED=0

for PACKAGE_JSON in "$@"; do
  if [[ ! -f "$PACKAGE_JSON" ]]; then
    echo "check-dep-pinning: skipping missing file: $PACKAGE_JSON" >&2
    continue
  fi

  # Extract dependencies and devDependencies values, then look for ^ or ~
  # We use a small node snippet so we don't need jq and handle JSON correctly.
  VIOLATIONS=$(node --input-type=module <<EOF
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('${PACKAGE_JSON}', 'utf8'));
const sections = ['dependencies', 'devDependencies'];
const violations = [];

for (const section of sections) {
  const deps = pkg[section];
  if (!deps) continue;
  for (const [name, version] of Object.entries(deps)) {
    // Skip workspace cross-references (e.g. "*", "workspace:*")
    if (version === '*' || version.startsWith('workspace:')) continue;
    // Flag any version that starts with ^ or ~
    if (version.startsWith('^') || version.startsWith('~')) {
      violations.push(\`  \${section}["\${name}"]: "\${version}"\`);
    }
  }
}

if (violations.length > 0) {
  process.stdout.write(violations.join('\\n') + '\\n');
}
EOF
)

  if [[ -n "$VIOLATIONS" ]]; then
    echo ""
    echo "ERROR: Unpinned dependency ranges found in ${PACKAGE_JSON}:" >&2
    echo "$VIOLATIONS" >&2
    echo "" >&2
    echo "  The project requires exact pinned versions in 'dependencies' and" >&2
    echo "  'devDependencies'. Replace caret (^) and tilde (~) ranges with" >&2
    echo "  the exact version number. For example:" >&2
    echo "    \"some-package\": \"^1.2.3\"  ->  \"some-package\": \"1.2.3\"" >&2
    echo "" >&2
    FAILED=1
  fi
done

if [[ $FAILED -ne 0 ]]; then
  exit 1
fi

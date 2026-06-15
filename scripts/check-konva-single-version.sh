#!/usr/bin/env bash
# check-konva-single-version.sh
#
# Verifies that exactly one version of konva is resolved across the entire
# npm workspace tree by inspecting package-lock.json.
#
# A duplicate konva installation causes mutually incompatible Shape<ShapeConfig>
# interfaces between 9.x and 10.x, leading to TS2322 type errors.
#
# Usage: check-konva-single-version.sh <path-to-package-lock.json>
#
# Exits non-zero with a clear error message if more than one distinct konva
# version is found.

set -euo pipefail

LOCKFILE="${1:-package-lock.json}"

if [[ ! -f "$LOCKFILE" ]]; then
  echo "check-konva-single-version: lockfile not found: $LOCKFILE" >&2
  exit 1
fi

RESULT=$(LOCKFILE="$LOCKFILE" node --input-type=module <<'EOF'
import { readFileSync } from 'fs';

const lock = JSON.parse(readFileSync(process.env.LOCKFILE, 'utf8'));
const packages = lock.packages ?? {};

// Collect every resolved konva entry: hoisted (node_modules/konva) and
// any nested installation (*/node_modules/konva).
const entries = Object.entries(packages)
  .filter(([k]) => k === 'node_modules/konva' || k.endsWith('/node_modules/konva'));

const versions = [...new Set(entries.map(([, v]) => v.version))];

if (versions.length === 0) {
  // konva not installed at all — not this script's concern
  process.exit(0);
}

if (versions.length > 1) {
  process.stdout.write('MULTIPLE:' + versions.join(',') + '\n');
} else {
  process.stdout.write('OK:' + versions[0] + '\n');
}
EOF
)

if [[ "$RESULT" == MULTIPLE:* ]]; then
  VERSIONS="${RESULT#MULTIPLE:}"
  echo "" >&2
  echo "ERROR: Multiple konva versions found in ${LOCKFILE}:" >&2
  echo "  ${VERSIONS//,/  }" >&2
  echo "" >&2
  echo "  Incompatible konva versions cause TS2322 type-collision errors" >&2
  echo "  (Shape<ShapeConfig> interfaces are mutually incompatible between" >&2
  echo "  the 9.x and 10.x series)." >&2
  echo "" >&2
  echo "  Fix: ensure the root package.json 'overrides' block pins konva to" >&2
  echo "  exactly one version, then run 'npm install' to regenerate the lockfile." >&2
  echo "" >&2
  exit 1
fi

if [[ "$RESULT" == OK:* ]]; then
  echo "check-konva-single-version: OK (konva ${RESULT#OK:})"
fi

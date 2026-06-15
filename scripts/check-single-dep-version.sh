#!/usr/bin/env bash
# check-single-dep-version.sh
#
# Verifies that exactly one version of each named package resolves across the
# entire workspace dependency tree. A second copy of a package (often pulled in
# transitively at a different major/minor) can cause duplicate type definitions
# and runtime type-collision bugs (e.g. konva surfacing two incompatible sets of
# .d.ts files).
#
# Usage: check-single-dep-version.sh <package-name> [<package-name> ...]
#
# For each package:
#   - exits 0 with a confirmation line when exactly one version (or zero, for a
#     package that does not resolve at all) is present
#   - records a failure and prints an error block (the resolved versions plus a
#     remediation hint) when more than one version resolves
#
# Exits 1 if any named package resolves to more than one version.

set -euo pipefail

FAILED=0

for PKG in "$@"; do
  # Collect the dependency tree as JSON. `npm ls <pkg> --all --json` emits the
  # full tree; a small node walker flattens it and prints the unique resolved
  # versions, one per line. The JSON is written to a temp file (the tree can be
  # large, exceeding argv/env size limits) and its path plus the package name
  # are passed to node as arguments, leaving stdin free for the script body.
  LS_FILE=$(mktemp)
  npm ls "$PKG" --all --json >"$LS_FILE" 2>/dev/null || true

  VERSIONS=$(node --input-type=module - "$PKG" "$LS_FILE" <<'EOF'
import { readFileSync } from 'fs';

const target = process.argv[2];
const lsFile = process.argv[3];

let tree;
try {
  tree = JSON.parse(readFileSync(lsFile, 'utf8'));
} catch {
  // No parseable output (e.g. empty) => no versions resolved.
  process.exit(0);
}

const versions = new Set();

const walk = (node) => {
  if (!node || typeof node !== 'object') return;
  const deps = node.dependencies;
  if (!deps) return;
  for (const [name, child] of Object.entries(deps)) {
    if (name === target && child && typeof child.version === 'string') {
      versions.add(child.version);
    }
    walk(child);
  }
};

walk(tree);

for (const v of versions) {
  process.stdout.write(v + '\n');
}
EOF
)

  rm -f "$LS_FILE"

  # Count distinct versions (filter out blank lines).
  COUNT=$(printf '%s\n' "$VERSIONS" | grep -c . || true)

  if [[ "$COUNT" -le 1 ]]; then
    if [[ "$COUNT" -eq 1 ]]; then
      echo "OK: $PKG resolves to a single version: $(printf '%s' "$VERSIONS" | tr -d '\n')"
    else
      echo "OK: $PKG does not resolve in the workspace tree (no versions found)"
    fi
  else
    echo "" >&2
    echo "ERROR: Multiple versions of '$PKG' resolve across the workspace tree:" >&2
    while IFS= read -r v; do
      [[ -n "$v" ]] && echo "  - $PKG@$v" >&2
    done <<< "$VERSIONS"
    echo "" >&2
    echo "  Multiple copies of the same package can cause duplicate type" >&2
    echo "  definitions and runtime type-collision bugs. Pin a single version" >&2
    echo "  by adding an entry to the \"overrides\" block in the root" >&2
    echo "  package.json, for example:" >&2
    echo "    \"overrides\": { \"$PKG\": \"<exact-version>\" }" >&2
    echo "" >&2
    FAILED=1
  fi
done

if [[ $FAILED -ne 0 ]]; then
  exit 1
fi

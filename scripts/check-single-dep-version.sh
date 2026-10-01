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
#     remediation hint) when more than one version resolves. The hint is the
#     root-anchor fix (align root devDependency with the workspace pin) when the
#     package is a root hoisting anchor, and an "overrides" pin otherwise.
#
# Run from the repository root (it reads ./package.json and the workspaces').
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
    echo "  definitions and runtime type-collision bugs." >&2
    echo "" >&2
    # A root hoisting anchor (CLAUDE.md > Dependency Policy) is a package that the
    # root package.json declares as a devDependency AND a workspace declares too.
    # It is fixed by aligning the two pins, never by an override: Dependabot does
    # not move override pins, so an override becomes a third, silently stale pin.
    # Prints "<root-spec>\t<workspace>=<spec> ..." for an anchor, nothing otherwise.
    ANCHOR=$(node --input-type=module - "$PKG" <<'EOF'
import { readFileSync } from 'fs';

const target = process.argv[2];
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const root = read('package.json');
const rootSpec = root.devDependencies?.[target];
if (rootSpec) {
  const pins = [];
  for (const ws of root.workspaces ?? []) {
    let pkg;
    try {
      pkg = read(`${ws}/package.json`);
    } catch {
      continue;
    }
    const spec = pkg.dependencies?.[target] ?? pkg.devDependencies?.[target];
    if (spec) pins.push(`${ws}=${spec}`);
  }
  if (pins.length > 0) process.stdout.write(`${rootSpec}\t${pins.join(' ')}`);
}
EOF
)
    if [[ -n "$ANCHOR" ]]; then
      echo "  '$PKG' is a root hoisting anchor (CLAUDE.md > Dependency Policy >" >&2
      echo "  Root hoisting anchors). Set the root package.json devDependency to" >&2
      echo "  the workspace's exact version, then run a full 'npm install'." >&2
      echo "  Do NOT add an \"overrides\" entry: Dependabot never moves override pins." >&2
      echo "    root devDependencies: \"$PKG\": \"${ANCHOR%%$'\t'*}\"" >&2
      echo "    workspace pins:       ${ANCHOR#*$'\t'}" >&2
    else
      echo "  Pin a single version by adding an entry to the \"overrides\" block" >&2
      echo "  in the root package.json, for example:" >&2
      echo "    \"overrides\": { \"$PKG\": \"<exact-version>\" }" >&2
    fi
    echo "" >&2
    FAILED=1
  fi
done

if [[ $FAILED -ne 0 ]]; then
  exit 1
fi

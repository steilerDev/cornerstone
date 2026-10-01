---
name: npm-overrides-reresolution
description: After editing root package.json overrides, plain `npm install` does NOT re-resolve already-locked nodes — use `npm update <names>`; never hand-delete lockfile entries; re-run npm audit because advisories land daily
metadata:
  type: feedback
---

Changing an override's bound/pin and running a full `npm install` leaves the old locked versions in
place (npm 11.19): `npm ls` flags them `invalid: "<new pin>" from <parent>` / `ELSPROBLEMS`, yet
install reports success. Seen 2026-09-30 on fast-uri, ip-address, joi, webpack-dev-server — only an
unscoped key (`"js-yaml"`) got rewritten.

- **Fix that works:** `npm update <pkg> [<pkg>...]` (only the named packages), then a plain `npm install`,
  then the CLAUDE.md residual sweep must print nothing:
  `npm ls --all 2>&1 | grep -oE '"[^"]+" from [^ ,]+' | sort -u | grep -v 'from node_modules/babel-preset-current-node-syntax/node_modules/@babel/plugin-syntax-'`.
  Do not use `npm ls --all | grep -Ei 'invalid|ELSPROBLEM'`: since Babel 8 (#1823) it always matches the
  accepted `invalid: @babel/core@8.x` problem (Jest's 15 `@babel/plugin-syntax-*@7` peers), and `invalid`
  also false-matches the package name `character-reference-invalid`. `npm ls --all` exits 1 by design now.
- **Does NOT work:** popping the entries out of `package-lock.json` (+ deleting `node_modules/<pkg>` and
  even `node_modules/.package-lock.json`). npm then silently omits the dependency: no UNMET, no
  invalid, and `require.resolve` fails. The tree is broken but reports clean.
- **Re-run `npm audit` after pinning.** Dependabot alerts lag the GHSA feed. In the same session,
  new advisories (published 1 day earlier) made every "first patched" pin in the spec vulnerable
  again. Re-derive pins from `gh api /advisories/<GHSA>` at edit time, not from the alert text.
- `npm audit` reports `fixAvailable: true` for copies under `node_modules/npm/node_modules/*` (`inBundle`)
  even when no in-range npm release bundles a fix. Verify it yourself: `npm pack npm@<latest-in-range> --pack-destination /tmp/x`
  and read the bundled `package.json` versions. Until a fixed npm ships, those copies are the only acceptable residuals.
- An override pin swap can collapse a whole subtree: webpack-dev-server 6→5.2.6 swapped express 5→4
  and ~100 lockfile nodes. Summarize by diffing the `packages` maps (added/removed/changed), not by
  line count.

**Why:** a spec's "run npm install and verify" step passes its own exit code while leaving the
vulnerable versions installed. Only the `npm ls` invalid-edge sweep exposes it.
**How to apply:** use this in any Dependabot/overrides review or remediation, with the CLAUDE.md
residual sweep (the `"<range>" from <parent>` grep that excludes `babel-preset-current-node-syntax`)
as the check, never `npm ls` exit codes. Pair it with dev-team-lead's
`dependency-overrides-pitfalls.md` (stale unscoped pins, dead keys, bundled deps unoverridable).

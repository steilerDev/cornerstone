---
name: dependency-overrides-pitfalls
description: Root package.json overrides traps found during Dependabot orphan-alert remediation (unscoped pins going stale, workspace deps silently overridden, bundled deps unoverridable)
metadata:
  type: project
---

Lessons from the 2026-09-30 `/dependabot` orphan-alert spec:

- **Unscoped overrides go stale and can pin the vuln themselves.** `"js-yaml": "4.3.1"` was once a fix and later _was_ the vulnerable version. Range-scoped overrides (`pkg@>=X <patched`) need their upper bound moved on each new advisory. Always diff the override bounds against GHSA ranges (`gh api /advisories/<GHSA>`); exact-match advisories (e.g. `= 3.1.6`) can fall outside an old range.
- **Global overrides silently beat workspace direct deps.** npm raises EOVERRIDE only for root direct deps. A workspace (`client`) declaring `^6.0.0` got 5.2.6 from a global `"webpack-dev-server": "5.2.6"`, with no error. The same trap applied to `http-proxy-middleware`, where a global 3.0.7 pin broke 6.x's `^4.1.1`. When bumping a workspace dep across majors, grep the root `overrides` for it _and for its dependencies_.
- **Bundled deps (`inBundle: true`, e.g. under `node_modules/npm/`) cannot be overridden.** The only remedy is an upstream release that bundles a fixed version; otherwise recommend a dismissal. Verify with `npm pack npm@<v>` and read the bundled `package.json`.
- **Dependabot never moves single-version override pins.** `konva`/`react`/`react-dom` are pinned in root `overrides` (guarded by `scripts/check-single-dep-version.sh`). A grouped bump (#2095/#2115) raised the workspace specifiers but left the overrides, so npm forced react 19.2.8 under react-konva 19.3.0 → client render crash in E2E. Any bump of a pinned package must move its override in the same commit.
- **Dead override keys exist.** `"gray-matter": {...}` matched nothing (only `@11ty/gray-matter` is installed). Check that an override's key appears in the lockfile before keeping it.

**Why:** these pitfalls turned a "bump 4 transitive deps" task into a cascade across 3 other override entries.
**How to apply:** in any dependency or Dependabot spec, audit the full `overrides` block, not just the alerted package.

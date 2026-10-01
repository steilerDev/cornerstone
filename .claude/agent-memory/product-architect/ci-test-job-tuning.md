---
name: ci-test-job-tuning
description: How the CI Jest test job is sized and balanced — duration-packed shards, 2 workers on 2-core runners, no testTimeout override, how to diagnose a slow shard, and what hardcodes the shard count (nothing)
metadata:
  type: project
---

# CI Jest shard tuning (settled on PR #2114, #2078)

**Current shape:** 6 shards x `--maxWorkers=2`, ~8 min per job (~1m45s setup + ~6.5 min tests),
no `--testTimeout` override (Jest's default 5 s). Shards are packed by recorded per-file runtime
(`scripts/jest-shard-sequencer.mjs` + `scripts/jest-timings.json`, refreshed with
`node scripts/update-jest-timings.mjs <run-id>`), not Jest's default path hash.

**Why:**

- The path-hash split ignored runtime; with runtime packing, **shard count is a real lever** again
  — total worker-time / (2 x shards) predicts per-shard test time well. A single file still can't
  be split across shards, so keep every file well under a shard's budget.
- `ubuntu-latest` has 4 vCPUs but only 2 physical cores. 3 workers measured ~2x slower per file and
  ~30% more total CPU (run 36722807521) — stay at 2.
- `--coverage` costs ~0.3% (A/B on WorkItemPicker) — not worth optimising.
- The earlier "CI runner is ~1.8x slower than the dev box", "contention", and 60-240 s timeout
  stopgaps were all built on a misdiagnosis: the picker-family suites were slow because of an
  nwsapi 2.2.27 bug (`:modal` recursion, ~281 ms per floating-ui positioning check), fixed in
  2.2.28. See the qa-integration-tester note `pr2070-searchpicker-dropdown-timeout.md`.

**How to apply:**

- **Profile a slow test file before touching CI knobs:** `node --cpu-prof --cpu-prof-dir=<dir>
--experimental-vm-modules node_modules/.bin/jest <file> -i` and tally self-time by package.
- **Diagnose a shard by its timeline**: `gh api repos/<r>/actions/jobs/<id>/logs`, compare the last
  `PASS` timestamp against the slow suite's to see whether one file is the critical path.
- A test needing more than the 5 s default is a performance bug to find, not a timeout to raise.
  If a raise is ever justified, `testTimeout` must be top-level in `jest.config.ts` (or the
  `--testTimeout` CLI flag) — `projects[].testTimeout` is silently ignored by jest-circus.

**Nothing hardcodes the shard count**, verified: rulesets require only `Quality Gates`,
`E2E Gates`, `Require head branch == beta` (never per-shard names); `merge-coverage.mjs` globs
`*.json`; `download-artifact` uses `coverage-shard-*`; `quality-gates` reads `needs.test.result`,
which aggregates a matrix. `coverage-report` is **not** in the `quality-gates` needs list, so
coverage is informational and non-gating.

See also [[recurring-patterns]].

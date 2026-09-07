---
name: ci-test-job-tuning
description: How to reason about Jest CI shard slowness/timeouts — the runner-vs-dev-box speed ratio, why maxWorkers/shardTotal are near-useless levers here, and where testTimeout belongs
metadata:
  type: project
---

# CI Jest shard tuning (established on #2076/#2078, promotion PR #2075)

**GitHub-hosted `ubuntu-latest` is ~1.8x slower single-threaded than the Apple-Silicon dev
sandbox.** Measured two ways on run `34154456691`: `SearchPicker.test.tsx` 2326 s on CI vs
1330 s locally (60 tests); `WorkItemPicker.test.tsx` 435.6 s vs 224 s (14 tests). A wall-clock
budget calibrated on a dev box has roughly *half* the headroom it appears to have in CI.

**Why:** the sandbox runs on the user's M-series Mac; GitHub's standard runners are Azure
D-series vCPUs. This is expected, not a defect — but it is invisible until measured, and it
gets misdiagnosed as contention or as a dependency regression.

**How to apply:**

- **Diagnose a shard by its timeline before theorising.** `gh api
  repos/<r>/actions/jobs/<id>/logs`, then compare the timestamp of the *last* `PASS` line
  against the failing suite's. On shard 5, 77 of 78 suites finished at 19:23:29 and the
  failing file then ran **alone for 25m54s** and still blew a 60 s per-test ceiling. That
  single comparison falsifies every contention hypothesis in one step. Do it first.
- **`--maxWorkers` and `shardTotal` are almost never the lever.** `--shard` splits by *file*;
  when one file is 2326 s of a shard's 2366 s, no shard count subdivides it and the critical
  path is fixed. More shards only buy more `npm ci` overhead (~45 s fixed cost each).
- **`--coverage` is free here.** Full-suite A/B: 223.7 s without vs 224.4 s with (0.3%).
  babel/istanbul instrumentation is *not* a multiplier on render-heavy jsdom suites in this
  repo. Don't spend a cycle on `coverageProvider: 'v8'` expecting a win.
- **`testTimeout` belongs in two different places for two different jobs.** Keep
  `jest.config.ts`'s value tight — it is the *regression detector* devs run against. Put the
  machine-speed headroom in the CI invocation as `--testTimeout=<ms>`, which is a real jest 30
  CLI flag and — verified via `--showConfig` — lands in **globalConfig**, so it dodges the
  `projects[].testTimeout`-is-silently-ignored trap documented in `jest.config.ts`.

**Nothing hardcodes the shard count**, verified: rulesets require only `Quality Gates`,
`E2E Gates`, `Require head branch == beta` (never per-shard names); `merge-coverage.mjs` globs
`*.json`; `download-artifact` uses `coverage-shard-*`; `quality-gates` reads `needs.test.result`,
which aggregates a matrix. `coverage-report` is **not** in the `quality-gates` needs list, so
coverage is informational and non-gating.

**`scripts/ci-wait.sh` defaults were below a healthy run** (600 s beta / 900 s main) while
Quality Gates routinely runs 15-40 min. Raised to 2400/3600. A too-short wait reports
`TIMEOUT`, which reads as a CI fault rather than "still running".

See also [[recurring-patterns]].

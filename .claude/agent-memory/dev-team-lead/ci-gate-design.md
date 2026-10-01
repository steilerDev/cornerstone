---
name: ci-gate-design
description: Hazards when speccing changes to .github/workflows/ci.yml gates — path-filtered repo-wide checks, skipped-vs-passed aggregation, validation without a runner
metadata:
  type: project
---

Lessons from #2111/#2043/#2024 (2026-09-30), speccing the CI-gates bundle.

- **A repo-wide check must not sit behind a narrower path filter.** `static-analysis` ran only when
  `detect-changes.outputs.app` was true, but ESLint and Prettier cover `e2e/`, `scripts/`,
  `.claude/**/*.md` and root configs too. Once gated, drift merged through a PR the filter skipped
  would fail the next unrelated app PR. 45 of the 61 Prettier-unclean files were `.claude/` memory. Put
  repo-wide checks in an always-running job, and gate only the expensive app checks per step.
- **Skipped is not passed.** Any aggregator that treats `skipped` as ok must also require
  `detect-changes` itself to be `success`. Otherwise a failed detect-changes skips everything and
  the gate goes green. Derive the _expected_ result (`success` vs `skipped`) from the filter outputs
  and compare for equality.
- **ADR-008 had mandated `lint` + `format:check` in CI.** They were silently dropped at some point,
  so the gap was a wiki deviation as well as a missing feature.
- **How to validate YAML gate logic with no runner:** run actionlint via Docker (baseline on
  54084499: 9 pre-existing shellcheck findings, none in the gate jobs). Then extract each gate's
  `run:` script into /tmp and drive it through an env-var truth table, asserting exit codes.

Related: [[review-round-discipline]], [[sandbox-environment]]

---
sidebar_position: 4
title: Workflow
---

# PR Review and Release Workflow

Every PR follows a consistent review and merge cycle. Releases follow a two-tier model where features integrate on `beta` and then promote to `main` after epic completion.

## PR Review Gate

Every story/bug PR is reviewed by the applicable subset of agents:

| Reviewer | When | Focus |
|----------|------|-------|
| **product-architect** | Always | Architecture compliance, code quality, test coverage |
| **security-engineer** | Conditional | Auth, API routes with data access, Dockerfile, dependency manifests |
| **product-owner** | User story PRs only | Requirements coverage, acceptance criteria |
| **ux-designer** | Frontend PRs only | Token adherence, visual consistency, dark mode, accessibility |

- Reviews run **in parallel** with CI, not after it
- All requested reviewers must approve before merge
- Skipped only when the reviewer is the PR's own author

## Reviewer Verdict Policy

One verdict matrix for all reviewers: **fix-or-block, no deferrals**. Every finding is fixed in-session.

### Approval (`--approve`)

- **Only with zero findings.** An approval listing findings is a policy violation.

### Request Changes (`--request-changes`)

- **Any finding, of any severity** (Critical through Low, nits included)
- Label findings `fix-in-session`
- Fix in-session: in this PR if it touches this PR's files, otherwise in a separate fix PR that the orchestrator schedules immediately (before the next story)
- Findings that need a schema change or dependency go through the architect first but still fix in-session

### Comment (Last Resort)

- Only when GitHub rejects `--approve`/`--request-changes` from the PR's own author token
- Post as a comment; **first line must be `VERDICT: APPROVE` or `VERDICT: REQUEST_CHANGES`**
- Treated identically to the corresponding review action

## The 2-Round Cap and Escalation

- Reviewers get a **maximum of 2 rounds** to iterate on a PR
- If findings remain after round 2, escalate to the human in-session instead of looping further
- Escalation means: stop, document the findings, and let the human decide

## Branching Strategy

| Branch | Purpose | Release Type |
|--------|---------|-------------|
| `main` | Stable releases | Full release (e.g., `1.7.0`) |
| `beta` | Integration branch | Beta pre-release (e.g., `1.7.0-beta.1`) |
| `feat/<issue>-<desc>` | Feature branches | (merged to beta) |
| `fix/<issue>-<desc>` | Bug fix branches | (merged to beta) |

Feature branches are created from `beta` and merged back to `beta` via **squash merge**. When an epic is complete, `beta` is promoted to `main` via **merge commit** (preserves individual commits for semantic-release analysis).

## Merge Strategy

- **Feature PR → `beta`**: Squash merge (clean history)
  - Uses `scripts/squash-merge.sh` to preserve agent trailers
  - Subject checked for CI-skip directives

- **`beta` → `main`** (epic promotion): Merge commit (preserves individual commits)
  - Semantic-release analyzes commit types to determine version bump
  - Each agent's contribution is visible in history

## CI Gates

**Quality Gates** run on all PRs to `beta` and `main`:

- ESLint (zero errors)
- Prettier format check
- TypeScript type checking
- Stylelint
- Full application build (shared → client → server)
- 6 runtime-balanced Jest shards (unit/integration tests)
- Docker build
- E2E smoke tests (desktop Chromium only)

**E2E Gates** run on PRs to `main` only:

- All 16 E2E shards × 3 viewports (desktop/tablet/mobile)
- All shards must pass; fail-fast enabled (first unrecoverable failure stops the shard)

For details on gates and enforcement, see [CI & Guardrails](quality-gates).

## Release Model

Cornerstone follows a two-tier release model:

| Branch | Purpose | Release Type | Docker Tags |
|--------|---------|-------------|-------------|
| `beta` | Integration branch -- feature PRs land here | Beta pre-release (e.g., `1.7.0-beta.1`) | `1.7.0-beta.1`, `beta` |
| `main` | Stable releases -- `beta` promoted after epic completion | Full release (e.g., `1.7.0`) | `1.7.0`, `1.7`, `latest` |

## Epic Promotion

After all stories in an epic are merged to `beta`:

1. **Refinement** -- Address non-blocking review feedback in a dedicated refinement PR (optional)
2. **E2E Validation** -- Confirm all E2E tests pass
3. **Documentation** -- Docs-writer updates this site with new feature guides
4. **UAT** -- Human performs manual testing and approves
5. **Promotion PR** -- Create PR from `beta` to `main` with change inventory and acceptance criteria
6. **User Approval** -- Human reviews the promotion PR and gives final approval (only human gate in the system)
7. **Merge** -- After approval, merge the promotion PR (merge commit, not squash)
8. **Merge-back** -- Merge `main` back into `beta` so the release tag is reachable from beta's history
9. **Release** -- Tag the commit, sync Docker images to DockerHub

## Hotfixes

A critical fix to `main` is merged and then **cherry-picked back to `beta`** immediately, so `beta` stays ahead of `main` (or at least not behind on critical fixes).

## Learn More

- [Skills](skills) -- Orchestration skill (`/epic-start`, `/develop`, `/epic-close`, `/release`)
- [CI & Guardrails](quality-gates) -- Quality gates, enforcement, and the trailer-check CI job
- [Agent Team](agent-team) -- Who reviews what and how attribution works

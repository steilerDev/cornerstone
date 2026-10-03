---
sidebar_position: 3
title: Skills
---

# Skills

Work flows through **skills** -- Claude Code slash commands (defined in `.claude/skills/`) that the orchestrator follows to drive the agent team. Each skill is a complete operational checklist with exact commands, agent coordination, and task tracking.

## Epic Lifecycle

A typical epic follows this path:

```
/epic-start (once) → /develop (once per story) → /epic-close (once) → /release (once)
```

Or take the autonomous path:

```
/epic-run (autonomously with pause for promotion)
```

## Planning Phase

### `/epic-start`

**Input**: Epic description or issue number

**Purpose**: Break down an epic into user stories with acceptance criteria; architect the schema and API changes.

**Workflow**:
- Product owner creates detailed user stories with acceptance criteria
- Product architect designs schema additions, API endpoints, and ADRs
- Human reviews and approves the plan

**Output**: Story issues linked to the epic, acceptance criteria on each story, architectural design on wiki pages.

## Implementation Phase

### `/develop`

**Input**: Issue number, description, semicolon-separated list, or file reference

**Purpose**: Complete one or more related user stories end-to-end (implementation → testing → review → merge).

**Workflow**:
1. UX designer posts a visual spec for UI-touching stories
2. Dev-team-lead classifies work as S/M/L and writes implementation spec(s)
3. Implementing agents (backend-developer, frontend-developer, translator) execute the specs
4. Test agents (qa-integration-tester, e2e-test-engineer) write the tests
5. Dev-team-lead reviews the result; fix loops continue the same agents
6. Dev-team-lead commits with all agent trailers and creates the PR
7. Reviewer agents (product-architect, security-engineer, product-owner, ux-designer -- whichever apply) review in parallel with CI
8. Blocking findings are fixed in the same PR, then CI is gated once and the PR is squash-merged to `beta`

**CI Gates**: Quality Gates (lint, format, typecheck, build, unit tests, Docker build, E2E smoke)

**Output**: Feature branch with commits, PR to `beta`

### `/mini-epic`

**Input**: Inline spec, file, or issue number

**Purpose**: Analyze a spec and decompose it into 2--6 related work items; hand off to `/batch-develop`.

**Workflow**:
- Analyze the requirement and propose a decomposition
- Challenge assumptions with the human
- Hand off the work items to `/batch-develop` for sequential execution

**When to use**: Multi-item work that does not warrant full epic planning (e.g., feature enhancements, cohesive bug fixes).

### `/batch-develop`

**Input**: Issue number list or `/tmp/batch-queue.md`

**Purpose**: Execute a queue of independent work items sequentially, with each item getting its own branch and PR (vs. bundling into one).

**Workflow**:
- Process the queue in order
- For each item: create a feature branch, complete the full /develop cycle, merge to `beta`
- Move to the next item

**When to use**: Related but independent bug fixes or small features that each deserve their own PR.

**Contrast**: `/develop` bundles multiple small items into one PR; `/batch-develop` gives each its own PR.

## Validation and Release Phase

### `/epic-close`

**Input**: Epic issue number

**Purpose**: Refinement, E2E validation, UAT, then delegate to `/release`.

**Workflow**:
1. Verify every story of the epic is merged
2. Collect leftover refinement items and fix them in a refinement PR
3. Confirm E2E coverage and that all E2E tests pass
4. Run UAT validation against the acceptance criteria
5. Delegate to `/release` for promotion

**Gate**: All stories merged to `beta`, E2E tests passing, UAT approval

**Output**: Delegation to `/release` (or user feedback loop to fix)

### `/release`

**Input**: Optional epic issue number

**Purpose**: Promote `beta` to `main` (stable release), sync tags, update docs site.

**Workflow**:
1. Sync `beta` with `main`
2. Create the promotion PR from `beta` to `main` with a change inventory
3. Wait for the CI gates, including E2E Gates (16 shards × 3 viewports)
4. Human reviews and approves -- feedback loops back into fixes until approved
5. Docs-writer updates the docs site, README highlights, and release summary
6. Lessons learned are synced back into the agent checklists
7. Merge commit to `main` (preserves individual commits for semantic-release), then post-merge sync

**Gate**: E2E Gates (all 16 shards × 3 viewports passing), human approval

**Output**: Release tagged on `main`, Docker image on `latest`/`1.x`/`1.x.x` tags

## Autonomous Mode

### `/epic-run`

**Input**: Epic description or issue number

**Purpose**: Run a complete epic end-to-end (plan → develop all stories → close) autonomously, pausing only for promotion approval.

**Workflow**:
1. Run the `/epic-start` planning phase and post the plan (no approval pause)
2. Run `/develop` for each story sequentially
3. Run `/epic-close` (refinement, E2E validation, UAT)
4. Hand off to `/release`, which pauses for the human promotion approval

**When to use**: Well-scoped epics where you want to automate the full cycle.

## Maintenance Skills

### `/dependabot`

**Input**: None (always processes full queue)

**Purpose**: Process every open Dependabot PR and security alert.

**Workflow**:
- Review changelog for breaking changes and security implications
- Merge or request fixes
- Handle orphaned adoptions (code that relied on the old dependency)

### `/fix-e2e`

**Input**: GitHub Actions run URL or ID

**Purpose**: Iteratively analyze and fix failing E2E tests until all shards pass.

**Workflow**:
1. Download the E2E failure artifacts
2. Diagnose the root cause (test or code)
3. Fix the issue (code fix or test fix)
4. Push and wait for CI to rerun
5. Repeat until all shards pass

### `/review-pr`

**Input**: PR number

**Purpose**: Comprehensive full-team review of a PR not created by `/develop` (external contributions, Dependabot, re-reviews).

**Workflow**:
- Product architect reviews for architecture compliance
- Security engineer reviews for vulnerabilities (if applicable)
- Product owner reviews for requirements coverage (if user story)
- UX designer reviews for design system compliance (if frontend)
- Return all findings in one round

## Story Sizing (Spec-Lite)

The dev-team-lead classifies work as:

- **S (Small)**: Single file or trivially scoped (e.g., add a config option, fix a bug in one function)
  - Gets a 5--10 line Spec-Lite
  - One implementing agent
  - QA writes tests in parallel

- **M/L (Medium/Large)**: Multi-layer or broad scope (e.g., new entity with CRUD endpoints, new page with filtering)
  - Gets a full implementation spec (Backend Spec, Frontend Spec, QA Spec, E2E Spec)
  - Multiple agents fan out in parallel

## Task Tracking

Every skill execution creates a task list (one task per step) and tracks progress live:

- Create the task list up front before starting step 1
- Mark each task `in_progress` before starting its step
- Mark `completed` immediately after finishing
- If the session resumes, pick up from the earliest non-completed task
- Discovered work (fix loops, follow-ups) gets appended to the list dynamically

This keeps work visible and resumable across session boundaries.

## Shared Mechanics Scripts

Deterministic git/GitHub operations are centralized in scripts (tools and agents call these instead of inlining bash):

| Script | Purpose |
|--------|---------|
| `scripts/ci-wait.sh <pr> [beta\|main]` | Canonical CI-gate wait: mergeability precheck, check-runs polling, timeouts, rate-limit backoff |
| `scripts/board.sh <issue> <status>` | GitHub Projects board mutations (owns the board field IDs) |
| `scripts/squash-merge.sh <pr> "<subject>" [body-file]` | Squash merge with trailer preservation and CI-skip-directive guard |
| `scripts/worktree-done.sh <path> [branch]` | Worktree + branch cleanup (run from base repo; refuses dirty worktrees) |
| `scripts/check-trailers.sh <base> <head>` | Trailer verification for a commit range |
| `scripts/update-jest-timings.mjs <run-id>` | Refresh jest-timings.json (Jest shard balancing) from a CI run |

These scripts are the single source of truth for IDs, merge strategies, and CI polling logic. Skills and agents call them, never duplicate their logic.

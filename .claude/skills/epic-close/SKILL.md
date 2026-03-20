---
name: epic-close
description: 'Close an epic: refinement, E2E validation, UAT, documentation, and promotion from beta to main. Use after all stories in an epic are merged to beta.'
---

# Epic Close — Refinement, UAT & Promotion Workflow

You are the orchestrator running the closing phase for a completed epic. Follow these 13 steps in order. **Do NOT skip steps.** The orchestrator delegates all work — never write production code, tests, or architectural artifacts directly.

**When to use:** After all user stories in an epic have been merged to `beta` and are closed. This skill handles refinement, E2E validation, UAT, documentation, and promotion to `main`.
**When NOT to use:** Planning a new epic (use `/epic-start`). Implementing a single story or bug fix (use `/develop`).

## Input

`$ARGUMENTS` contains the epic issue number. If empty, ask the user to provide the epic issue number before proceeding.

## Task Tracking

At the start of each `/epic-close` invocation, create tasks to track progress. These tasks survive context compression and let you recover your place if context is lost.

**Create these tasks upfront** (using `TaskCreate`):

1. **Rebase** — Fetch and rebase worktree branch onto origin/beta
2. **Verify all stories merged** — Confirm all sub-issues are closed
3. **Epic metrics + lint check** — Generate metrics report (step 2a) and lint health check (step 2b)
4. **Collect refinement items** — Review story PRs for non-blocking observations
5. **Refinement PR** — Address refinement items via implementation agents (skip if none)
6. **E2E validation** — Launch e2e-test-engineer to verify coverage and pass rate
7. **UAT validation** — Launch product-owner for UAT scenarios
8. **Release** — Delegate to /release for promotion, approval, docs, and merge

**Progress rule:** Before starting each step, mark its task `in_progress`. After completing, mark it `completed`. If a step is skipped (conditional), mark it `completed` with a note in the description.

**Recovery rule:** If you lose track of progress (e.g., after context compression), run `TaskList` to see which tasks are completed and resume from the first pending task.

**Dynamic task rule:** When a UAT fix round or E2E fix cycle starts, create a new task for each round (e.g., "UAT Fix Round 1", "E2E Fix Round 1") so iterations are tracked.

## Steps

### 1. Rebase

Fetch and rebase the worktree branch onto `origin/beta`:

```
git fetch origin beta && git rebase origin/beta
```

If already rebased at session start, skip.

### 2. Verify All Stories Merged

Confirm all sub-issues of the epic are closed and merged to `beta`:

```bash
gh issue view <epic-number>
# Check the sub-issues section — all should be closed
```

If any story is still open, stop and inform the user. All stories must be complete before proceeding.

### 2a. Generate Epic Metrics Report

Read `.claude/metrics/review-metrics.jsonl` and filter for records matching this epic. Generate a summary table:

| Agent | PRs Reviewed | Approved | Req. Changes | Findings (C/H/M/L/I) | Fix Loops Caused |
| ----- | ------------ | -------- | ------------ | -------------------- | ---------------- |

Include:

- Total PRs, average fix loops per PR, % of PRs requiring fix loops
- Total findings breakdown by severity

Post this report as a comment on the epic GitHub Issue. Include it in the promotion PR body (Step 8).

### 2b. Lint Health Check

Check the most recent auto-fix workflow run for unfixable lint issues:

```bash
# Get the latest auto-fix run ID
RUN_ID=$(gh run list --workflow=auto-fix.yml --limit=1 --json databaseId --jq '.[0].databaseId')
# Extract lint errors and warnings
gh run view "$RUN_ID" --log 2>/dev/null | grep -E '##\[(warning|error)\]' | grep -v 'Process completed'
```

If there are unfixable lint errors or warnings, include them in the refinement items (step 3). These should be addressed in the refinement PR alongside any review observations.

### 3. Collect Refinement Items

Review all story PRs for non-blocking review comments — observations that were noted during review but not required for merge. Collect these into a list of refinement items.

Search for review comments on the story PRs:

```bash
# List merged PRs for the epic's stories
gh pr list --state merged --search "label:user-story" --json number,title
```

### 4. Refinement PR

If there are refinement items to address:

1. Rename the branch: `git branch -m chore/<epic-number>-refinement`
2. Launch the **dev-team-lead** in `[MODE: spec]` with the refinement observations to produce targeted fix specs
3. Route fix specs to the appropriate implementation agents:
   - Backend fixes → **backend-developer** (Haiku)
   - Frontend fixes → **frontend-developer** (Haiku)
   - Unit/integration test fixes → **qa-integration-tester**
   - E2E test fixes → **e2e-test-engineer**
4. Launch the **dev-team-lead** in `[MODE: review]` with the original refinement items + changed files
5. If `VERDICT: CHANGES_REQUIRED`, iterate fixes (route to agents, re-review)
6. Launch the **dev-team-lead** in `[MODE: commit]` with contributing agents list, branch name, and no issue number (refinement)
7. Verify PR exists. If not, create a PR targeting `beta`:
   ```
   gh pr create --base beta --title "chore: address refinement items for epic #<epic-number>" --body "..."
   ```
8. Wait for CI using the **CI Gate Polling** pattern from `CLAUDE.md` (beta variant — wait for `Quality Gates` only)
9. Squash merge: `gh pr merge --squash <pr-url>`

If no refinement items exist, skip to step 5.

### 5. E2E Validation

#### 5a. Coverage Verification

Launch the **e2e-test-engineer** agent to:

- **Triage prior E2E failures** from recent beta PRs (the agent does this automatically per its "Before Starting Any Work" checklist — review the triage report before proceeding). If real regressions are found, address them before continuing.
- Verify every approved UAT scenario (from story issues) has E2E coverage
- Write new E2E tests on a branch if coverage gaps exist
- Ensure dependent system containers are included in the E2E environment (not just `page.route()` mocks)
- Expand smoke tests if the epic introduced new major capabilities
- Open a PR targeting `beta` to trigger the full sharded E2E suite in CI (if it does not yet exist)
- Wait for the full E2E suite to pass (not just smoke tests)

If the e2e-test-engineer's PR passes all E2E shards, squash merge it and proceed to step 6.

#### 5b. Fix Failing E2E Tests

**If E2E shards fail**: Use `/fix-e2e <run-id>` to iteratively analyze, fix, and verify failing tests. The `/fix-e2e` skill handles the full fix cycle — root cause analysis, agent delegation, push, CI wait, and iteration — and merges its own PR when all shards pass.

This approval is **required** before proceeding to UAT validation.

### 6. UAT Validation

Launch the **product-owner** agent to produce UAT scenarios. The e2e-test-engineer must have already covered these scenarios in step 5. E2E pass + e2e-test-engineer report = sufficient validation. Post the UAT report as a comment on the epic issue and proceed to step 7.

The UAT scenarios are included in the promotion PR (step 8) as a manual validation checklist so the user can spot-check during the promotion gate.

### 7. Delegate to `/release`

Invoke `/release <epic-number>` to handle the remaining steps: branch sync, promotion PR, CI gate, user approval loop, documentation, lessons learned, and merge.

Before invoking, prepare the **epic context** that `/release` will use to enrich the promotion PR body:

1. **Stories completed** — list of all sub-issues with titles
2. **Metrics report** — from step 2a
3. **UAT scenarios** — from step 6, formatted as a manual validation checklist
4. **Refinement summary** — from step 4 (if applicable)
5. **E2E validation summary** — from step 5
6. **Security findings summary** — resolved/outstanding from story PR reviews

The `/release` skill uses this context to build the promotion PR body (see `/release` step 2b, epic-enriched variant). It also handles:

- Branch sync (main->beta if diverged)
- Creating the promotion PR with the epic-enriched body
- Posting detailed UAT validation criteria per story
- CI gate polling (Quality Gates + E2E Gates)
- User approval loop with autonomous feedback fix rounds
- Documentation & env drift check (after user approval)
- Lessons learned sync
- Merge to main, epic closure, and post-merge verification

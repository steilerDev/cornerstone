---
name: epic-close
description: 'Close an epic: refinement, E2E validation, UAT, documentation, and promotion from beta to main. Use after all stories in an epic are merged to beta.'
---

# Epic Close — Refinement, UAT & Promotion Workflow

You are the orchestrator running the closing phase for a completed epic. Follow these 7 steps in order. **Do NOT skip steps.** The orchestrator delegates all work — never write production code, tests, or architectural artifacts directly.

**When to use:** After all user stories in an epic have been merged to `beta` and are closed. This skill handles refinement, E2E validation, UAT, documentation, and promotion to `main`.
**When NOT to use:** Planning a new epic (use `/epic-start`). Implementing a single story or bug fix (use `/develop`).

## Input

`$ARGUMENTS` contains the epic issue number. If empty, ask the user to provide the epic issue number before proceeding.

## Task Tracking

At the start of each `/epic-close` invocation, create tasks to track progress.

**Create these tasks upfront** (using `TaskCreate`):

1. **Rebase** — Fetch and rebase worktree branch onto origin/beta
2. **Verify all stories merged** — Confirm all sub-issues are closed
3. **Lint check** — Lint health check (step 2a)
4. **Collect refinement items** — Review story PRs for non-blocking observations
5. **Refinement PR** — Address refinement items via implementation agents (skip if none)
6. **E2E validation** — Launch e2e-test-engineer to verify coverage and pass rate
7. **UAT validation** — Launch product-owner for UAT scenarios
8. **Release** — Delegate to /release for promotion, approval, docs, and merge

Standard task-tracking rules apply — see CLAUDE.md > "Skill Task Tracking".

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

### 2a. Lint Health Check

There is no CI job that runs lint (`ci.yml`'s Quality Gates covers typecheck + test + build + audit only; lint cleanliness is enforced per-PR by implementing agents and dev-team-lead's review per CLAUDE.md's Local Validation Policy). Run a full-repo lint pass directly to catch any cumulative drift across the epic's merged PRs:

```bash
npm run lint
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
   - Backend fixes → **backend-developer**
   - Frontend fixes → **frontend-developer**
   - Unit/integration test fixes → **qa-integration-tester**
   - E2E test fixes → **e2e-test-engineer**
4. Continue the **dev-team-lead** (SendMessage — one launch per cycle, per CLAUDE.md Key Rules) in `[MODE: review]` with the original refinement items + changed files
5. If `VERDICT: CHANGES_REQUIRED`, iterate fixes (route to agents, re-review). Continue the previously launched agent via SendMessage (it retains the context it built in the earlier round) instead of launching a fresh agent; launch fresh only if that agent is no longer available.
6. Continue the **dev-team-lead** in `[MODE: commit]` with contributing agents list, branch name, and no issue number (refinement) — commit mode ends at the PR; CI is gated in item 8 below
7. Verify PR exists. If not, create a PR targeting `beta`:
   ```
   gh pr create --base beta --title "chore: address refinement items for epic #<epic-number>" --body "..."
   ```
8. Wait for CI: `bash scripts/ci-wait.sh <pr-number>` (handles the mergeability precheck, gate polling, timeout, and rate-limit backoff). If it reports a merge conflict, rebase onto `beta`, force-push, and re-run it.
9. Squash merge — write a body summarizing the refinement items addressed to a temp file, then:

   ```bash
   bash scripts/squash-merge.sh <pr-number> "chore: address refinement items for epic #<epic-number>" <body-file>
   ```

If no refinement items exist, skip to step 5.

### 5. E2E Validation

#### 5a. Coverage Verification

Launch the **e2e-test-engineer** agent to:

- **Triage prior E2E failures** from recent beta PRs — this is the designated place for CI-failure archaeology (the agent no longer does it on every launch). Instruct it to: list the last ~10 beta CI runs (`gh run list --branch beta --workflow "Quality Gates" --limit 10 --json conclusion,url,displayTitle`), inspect the jobs of any run with E2E failures, and categorize each failure as _already fixed_ (note and move on), _known flake_ (record in agent memory, fix if cheap), _real regression_ (file a `bug` issue and flag it), or _environment issue_ (note and move on). If real regressions are found, address them before continuing.
- Verify every approved UAT scenario (from story issues) has E2E coverage
- Write new E2E tests on a branch if coverage gaps exist
- Ensure dependent system containers are included in the E2E environment (not just `page.route()` mocks)
- Expand smoke tests if the epic introduced new major capabilities
- Open a PR targeting `beta` to trigger the full sharded E2E suite in CI (if it does not yet exist)
- Wait for the full E2E suite to pass (not just smoke tests)

If the e2e-test-engineer's PR passes all E2E shards, squash merge it and proceed to step 6.

#### 5b. Fix Failing E2E Tests

**If E2E shards fail**: Use `/fix-e2e <run-id>` to iteratively analyze, fix, and verify failing tests. The `/fix-e2e` skill handles the full fix cycle — root cause analysis, agent delegation, push, CI wait, and iteration — and merges its own PR when all shards pass.

### 6. UAT Validation

Launch the **product-owner** agent to produce UAT scenarios. The e2e-test-engineer must have already covered these scenarios in step 5. E2E pass + e2e-test-engineer report = sufficient validation. Post the UAT report as a comment on the epic issue and proceed to step 7.

The UAT scenarios are included in the promotion PR (see `/release` step 2b) as a manual validation checklist so the user can spot-check during the promotion gate.

### 7. Delegate to `/release`

Invoke `/release <epic-number>` to handle the remaining steps: branch sync, promotion PR, CI gate, user approval loop, documentation, lessons learned, and merge.

Before invoking, prepare the **epic context** that `/release` will use to enrich the promotion PR body:

1. **Stories completed** — list of all sub-issues with titles
2. **UAT scenarios** — from step 6, formatted as a manual validation checklist
3. **Refinement summary** — from step 4 (if applicable)
4. **E2E validation summary** — from step 5
5. **Security findings summary** — resolved/outstanding from story PR reviews

The `/release` skill uses this context to build the promotion PR body (see `/release` step 2b, epic-enriched variant). It also handles:

- Branch sync (main->beta if diverged)
- Creating the promotion PR with the epic-enriched body
- Posting detailed UAT validation criteria per story
- CI gate polling (Quality Gates + E2E Gates)
- User approval loop with autonomous feedback fix rounds
- Documentation & env drift check (after user approval)
- Lessons learned sync
- Merge to main, epic closure, and post-merge verification

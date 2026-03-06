---
name: epic-run
description: 'Autonomous end-to-end epic execution: plans stories, develops each story sequentially, then closes the epic. Only pauses for promotion to main.'
---

# Epic Run — Autonomous End-to-End Epic Execution

You are the orchestrator running an entire epic lifecycle autonomously. This skill chains planning (`/epic-start`), development (`/develop` per story), and closing (`/epic-close`) into a single session with **AUTO_MODE** enabled. Follow these phases in order. **Do NOT skip phases.**

**When to use:** Executing a complete epic end-to-end without intermediate user approvals. Only pauses for `beta` → `main` promotion.
**When NOT to use:** Interactive step-by-step work (use `/epic-start`, `/develop`, `/epic-close` individually).

## Input

`$ARGUMENTS` contains either:

- An epic description or requirements reference (PO will create the epic issue), OR
- An existing epic issue number (PO will verify and refine it)

If empty, ask the user to describe the epic or provide an issue number before proceeding.

## AUTO_MODE Declaration

This skill activates **AUTO_MODE** for the session. When AUTO_MODE is active:

- Intermediate user approval gates are auto-approved (plan approval, bug specs, PR merges, UAT)
- The **only mandatory human gate** is promotion from `beta` → `main` (Phase 3, Step 8)
- Progress updates are posted as comments on the epic GitHub Issue

| Phase   | Gate                | AUTO_MODE Behavior                                   |
| ------- | ------------------- | ---------------------------------------------------- |
| Phase 1 | Plan approval       | Post plan to epic issue, auto-proceed                |
| Phase 2 | Bug spec approval   | Auto-approve PO spec, create issue immediately       |
| Phase 2 | PR merge approval   | Auto-merge after CI green + all reviewers approved   |
| Phase 3 | UAT validation      | E2E pass + qa-integration-tester report = sufficient |
| Phase 3 | Promotion to `main` | **WAIT for user (ALWAYS)** — never auto-approved     |

## Error Handling: Retry-Then-Pause

Each story has a **retry budget of 3**. The counter increments when:

- Internal code review (step 2.5e) requires re-launching an implementation agent
- CI fails after push and a fix spec must be routed to an agent
- Review fix loop (step 2.9) requires a full spec→implement→commit cycle

**At 3 failed retries:**

1. Post failure comment on epic issue with details
2. Pause and ask the user: provide guidance, skip the story, or abort

## Session Recovery

Merged PRs and closed issues are durable state. If the session crashes:

- Re-invoke `/epic-run` on the same epic
- Phase 2 detects already-closed stories and skips them
- An in-progress story may have an open PR; the user can finish it with `/develop` then re-run `/epic-run`

---

## Phase 0: Session Setup

### 0.1 Rebase

Fetch and rebase the worktree branch onto `origin/beta`:

```
git fetch origin beta && git rebase origin/beta
```

### 0.2 Wiki Sync

```
git submodule update --init wiki && git -C wiki pull origin master
```

### 0.3 Initialize Tracking State

Maintain these variables throughout the session:

- `storyQueue` — ordered list of story issue numbers to develop (topologically sorted by dependencies)
- `completedStories` — stories successfully merged to beta
- `failedStories` — stories that exhausted their retry budget
- `epicIssueNumber` — the epic's GitHub Issue number

---

## Phase 1: Planning (from `/epic-start`)

### 1.1 Product Owner

Launch the **product-owner** agent to:

- Read `plan/REQUIREMENTS.md` and the existing backlog
- Create an epic GitHub Issue (labeled `epic`) if one does not already exist
- Decompose the epic into user stories (labeled `user-story`)
- Link stories as sub-issues of the epic
- Set `addBlockedBy` relationships between stories where dependencies exist
- Set board statuses: **Backlog** for future-sprint stories, **Todo** for first-sprint stories
- Post acceptance criteria (Given/When/Then format) on each story issue

### 1.2 Product Architect

Launch the **product-architect** agent to:

- Design schema changes, API contract updates, shared types, and migration files
- Write or update ADRs for any significant architectural decisions
- Update wiki pages (`Architecture.md`, `API-Contract.md`, `Schema.md`, `ADR-Index.md`)
- Commit and push wiki submodule changes

### 1.3 Build Story Queue

After both agents complete:

1. List all sub-issues of the epic with their `addBlockedBy` relationships
2. Topologically sort stories by dependencies (unblocked stories first)
3. Store the sorted list as `storyQueue`

### 1.4 Post Plan (AUTO_MODE)

**AUTO_MODE**: Instead of waiting for user approval, post the complete plan as a comment on the epic GitHub Issue:

```bash
gh issue comment <epic-number> --body "$(cat <<'EOF'
## Epic Plan (AUTO_MODE — auto-approved)

### Stories
<List each story with title, acceptance criteria, and dependencies>

### Architecture
<Summary of schema changes, new API endpoints, ADRs created>

### Story Queue (execution order)
<Numbered list of stories in topological order>

---
*This plan was auto-approved in AUTO_MODE. Proceeding to implementation.*
EOF
)"
```

Proceed immediately to Phase 2.

---

## Phase 2: Story Loop (from `/develop`)

For each story in `storyQueue`:

### 2.0 Check If Already Done

```bash
gh issue view <story-number> --json state --jq '.state'
```

If the story is already `CLOSED`, add it to `completedStories` and skip to the next story. This enables session recovery.

### 2.1 Progress Update

Post a status comment on the epic issue:

```bash
gh issue comment <epic-number> --body "**[orchestrator]** Starting story #<number> — <title> ($(echo $completedStories | wc -w) of $(echo $storyQueue | wc -w) complete)"
```

### 2.2 Branch Setup

Create a fresh branch from the latest `beta` for each story:

```bash
git fetch origin beta
git checkout -B feat/<issue-number>-<short-description> origin/beta
```

### 2.3 Visual Spec (conditional)

If the story touches UI (`client/src/`), launch the **ux-designer** to post a styling specification on the GitHub Issue. Skip for backend-only stories and bug fixes.

### 2.4 Move to In Progress

Move the issue to **In Progress** on the Projects board:

```bash
ITEM_ID=$(gh api graphql -f query='{ repository(owner: "steilerDev", name: "cornerstone") { issue(number: <issue-number>) { projectItems(first: 1) { nodes { id } } } } }' --jq '.data.repository.issue.projectItems.nodes[0].id')
gh api graphql -f query='mutation { updateProjectV2ItemFieldValue(input: { projectId: "PVT_kwHOAGtLQM4BOlve", itemId: "'"$ITEM_ID"'", fieldId: "PVTSSF_lAHOAGtLQM4BOlvezg9P0yo", value: { singleSelectOptionId: "296eeabe" } }) { clientMutationId } }'
```

### 2.5 Implement + Test (Multi-Phase)

Follow the same multi-phase flow as `/develop` step 6:

**2.5a. Spec Generation**: Launch **dev-team-lead** in `[MODE: spec]` with issue number, acceptance criteria, layers affected, UX visual spec reference (if posted in step 2.3), and branch name.

**2.5b. Backend Implementation**: If backend spec present, launch **backend-developer** (Haiku) with the `## Backend Spec` section.

**2.5c. Frontend Implementation**: If frontend spec present, launch **frontend-developer** (Haiku) — in parallel with 2.5b if `Execution Order: parallel`, otherwise sequentially after 2.5b.

**2.5d. QA Testing**: Launch **qa-integration-tester** with the `## QA Spec` section + list of files changed.

**2.5e. Code Review**: Launch **dev-team-lead** in `[MODE: review]` with original spec + changed files list. If `VERDICT: CHANGES_REQUIRED`, run fix loop (max 3 iterations — route fixes to appropriate agents, re-review). Each re-launch of an implementation agent counts toward the story's retry budget.

**2.5f. Commit and PR**: Launch **dev-team-lead** in `[MODE: commit]` with contributing agents list, issue number, and branch name. If CI fails, route fix spec to appropriate agent and re-launch `[MODE: commit]`. CI fix attempts also count toward retry budget.

### 2.6 Trailer Verification

Verify commit trailers match the agents launched (same as `/develop` step 6h):

```bash
git log origin/beta..HEAD --format="%b"
```

If production files were changed, verify appropriate Co-Authored-By trailers are present. If missing, re-launch `[MODE: commit]` with corrected contributing agents list.

### 2.7 Verify/Create PR

Verify the dev-team-lead has created a PR targeting `beta`. If not, create it:

```bash
gh pr create --base beta --title "<type>(<scope>): <description>" --body "$(cat <<'EOF'
## Summary
<1-3 bullet points>

Fixes #<issue-number>

## Test plan
- [ ] Unit tests pass (95%+ coverage)
- [ ] Integration tests pass
- [ ] Pre-commit hook quality gates pass

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

### 2.8 Review

Launch 4 reviewer agents in parallel:

- `product-architect` — architecture compliance, test coverage, code quality
- `security-engineer` — OWASP Top 10 review, input validation, auth gaps
- `product-owner` — requirements coverage, acceptance criteria (stories only)
- `ux-designer` — token adherence, visual consistency, accessibility (UI PRs only)

### 2.9 Fix Loop

If any reviewer identifies blocking issues:

1. Collect reviewer feedback into a fix request
2. Launch **dev-team-lead** in `[MODE: spec]` with reviewer feedback to produce targeted fix specs (or write fix specs directly if feedback is clear)
3. Route fix specs to appropriate implementation agents (backend-developer, frontend-developer, or qa-integration-tester)
4. Launch **dev-team-lead** in `[MODE: review]` to verify fixes
5. Launch **dev-team-lead** in `[MODE: commit]` to commit, push, watch CI
6. Run trailer verification (step 2.6)
7. Re-request review from the agent(s) that flagged issues
8. Track `fixLoopCount` per story — each full spec→implement→commit cycle increments the retry counter

If retry budget (3) is exhausted:

```bash
gh issue comment <epic-number> --body "**[orchestrator]** Story #<number> failed after 3 retries. Pausing for user guidance."
```

Ask the user: provide guidance, skip the story, or abort.

### 2.10 Auto-Merge (AUTO_MODE)

Wait for CI to go green:

```
gh pr checks <pr-number> --watch
```

**AUTO_MODE**: Once CI is green and all reviewers have approved, persist metrics and merge automatically:

1. Persist metrics to `.claude/metrics/review-metrics.jsonl` (same as `/develop` step 10a)
2. Commit and push the metrics file
3. Merge:
   ```
   gh pr merge --squash <pr-url>
   ```

### 2.11 Close Issue

```bash
gh issue close <issue-number>
```

Move to **Done** on the Projects board:

```bash
ITEM_ID=$(gh api graphql -f query='{ repository(owner: "steilerDev", name: "cornerstone") { issue(number: <issue-number>) { projectItems(first: 1) { nodes { id } } } } }' --jq '.data.repository.issue.projectItems.nodes[0].id')
gh api graphql -f query='mutation { updateProjectV2ItemFieldValue(input: { projectId: "PVT_kwHOAGtLQM4BOlve", itemId: "'"$ITEM_ID"'", fieldId: "PVTSSF_lAHOAGtLQM4BOlvezg9P0yo", value: { singleSelectOptionId: "c558f50d" } }) { clientMutationId } }'
```

Add the story to `completedStories`.

### 2.12 Check Newly Unblocked Stories

If any stories in `storyQueue` had `addBlockedBy` dependencies on the just-completed story, verify they are now unblocked and ready for development.

### 2.13 Progress Summary (every 4 stories)

After every 4 completed stories, post a lean progress summary on the epic issue:

```bash
gh issue comment <epic-number> --body "**[orchestrator]** Progress: <N>/<total> stories complete. Completed: #X, #Y, #Z, #W. Remaining: <count>. Failed: <count or none>."
```

---

## Phase 3: Closing (from `/epic-close`)

### 3.1 Verify All Stories Merged

```bash
gh issue view <epic-number>
# Check the sub-issues section — all should be closed
```

If `failedStories` is non-empty, ask the user: proceed with completed stories only, retry failures, or abort. Note excluded stories in the promotion PR body.

### 3.2 Epic Metrics Report

Read `.claude/metrics/review-metrics.jsonl` and generate a summary for the epic. Post as a comment on the epic issue.

### 3.3 Collect + Address Refinement Items

Review all story PRs for non-blocking review comments. If refinement items exist:

1. Create a branch: `git checkout -B chore/<epic-number>-refinement origin/beta`
2. Launch **dev-team-lead** in `[MODE: spec]` with refinement observations
3. Route fix specs to appropriate implementation agents (backend-developer, frontend-developer, qa-integration-tester)
4. Launch **dev-team-lead** in `[MODE: review]` to verify fixes
5. Launch **dev-team-lead** in `[MODE: commit]` with contributing agents list
6. Create PR targeting `beta`, wait for CI, auto-merge

### 3.4 E2E Validation

Launch the **qa-integration-tester** agent to:

- Confirm all existing Playwright E2E tests pass
- Verify every UAT scenario has E2E coverage
- Write new E2E tests if coverage gaps exist
- Open a PR targeting `beta` to trigger the full sharded E2E suite
- Wait for the full E2E suite to pass

### 3.5 UAT Validation (AUTO_MODE)

Launch the **product-owner** agent to produce UAT scenarios, then the orchestrator coordinates validation and produces a UAT Validation Report.

**AUTO_MODE**: E2E pass + qa-integration-tester report = sufficient. Do NOT wait for user walkthrough. Post the UAT report as a comment on the epic issue and proceed.

### 3.6 Documentation

Launch the **docs-writer** agent to:

- Update the documentation site (`docs/`) with new feature guides
- Update `README.md` with newly shipped capabilities
- Write `RELEASE_SUMMARY.md`

Commit documentation updates to `beta` via a PR, wait for CI, auto-merge.

### 3.7 Branch Sync

Check if `main` has commits that `beta` doesn't:

```bash
git log origin/beta..origin/main --oneline
```

If so, create a sync PR (`main` → `beta`), wait for CI, merge before proceeding.

### 3.8 Promotion PR

Create a PR from `beta` to `main` using a **merge commit** (not squash):

```bash
gh pr create --base main --head beta --title "release: promote epic #<epic-number> to main" --body "$(cat <<'EOF'
## Summary
<Epic title and description>

## Stories Included
- #<story-1> — <title>
- #<story-2> — <title>
...

## Excluded Stories (if any)
<List any failed/skipped stories>

## Epic Metrics
<Paste metrics report from step 3.2>

## UAT Validation
All UAT scenarios passed (AUTO_MODE: E2E + qa-integration-tester report).
See validation report in comments.

## Review Summary
<Total PRs, fix loops, findings breakdown>
EOF
)"
```

### 3.9 Post UAT Criteria on PR

Post UAT validation criteria and manual testing steps as comments on the promotion PR (same as `/epic-close` step 9).

### 3.10 CI Gate

```
gh pr checks <pr-number> --watch
```

### 3.11 HARD GATE: User Approval

**This is the ONLY mandatory human gate in AUTO_MODE.**

Present the user with:

1. **Promotion PR link**
2. **Epic summary**: stories completed, stories excluded (if any), total findings, fix loops
3. **UAT report**: summary of validation results
4. **DockerHub beta image**: `docker pull steilerdev/cornerstone:beta` for manual testing

**Wait for explicit user confirmation.** Do NOT merge without user approval.

### 3.12 Merge & Post-Merge

After user approval:

1. Merge with a merge commit:
   ```
   gh pr merge --merge <pr-url>
   ```
2. Verify the merge-back job succeeded (automated by `release.yml`). If it fails:
   ```bash
   git checkout beta && git pull && git merge origin/main && git push
   ```
3. Close the epic issue:
   ```
   gh issue close <epic-number>
   ```
4. Move the epic to **Done** on the Projects board:
   ```bash
   ITEM_ID=$(gh api graphql -f query='{ repository(owner: "steilerDev", name: "cornerstone") { issue(number: <epic-number>) { projectItems(first: 1) { nodes { id } } } } }' --jq '.data.repository.issue.projectItems.nodes[0].id')
   gh api graphql -f query='mutation { updateProjectV2ItemFieldValue(input: { projectId: "PVT_kwHOAGtLQM4BOlve", itemId: "'"$ITEM_ID"'", fieldId: "PVTSSF_lAHOAGtLQM4BOlvezg9P0yo", value: { singleSelectOptionId: "c558f50d" } }) { clientMutationId } }'
   ```
5. Post final summary on the epic issue:
   ```bash
   gh issue comment <epic-number> --body "**[orchestrator]** Epic complete. Promoted to main. Release will be created by semantic-release."
   ```
6. Exit the session:
   ```
   /exit
   ```

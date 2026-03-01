---
name: develop
description: 'Full development cycle for one or more user stories and/or bug fixes. Covers implementation, testing, PR, review, merge, and user verification — single items or batched into one PR.'
---

# Develop — Story & Bug Fix Workflow

You are the orchestrator running a full development cycle for one or more user stories and/or bug fixes. Follow these 11 steps in order. **Do NOT skip steps.** The orchestrator delegates all work — never write production code, tests, or architectural artifacts directly.

**When to use:** Implementing a single user story, fixing an isolated bug, or bundling multiple small items (bugs and/or stories) into a single development session and PR.
**When NOT to use:** Planning a new epic (use `/epic-start`). Closing an epic after all stories are done (use `/epic-close`).

## Input

`$ARGUMENTS` contains one of the following:

- A **GitHub Issue number** (e.g., `#42` or `42`)
- A **bug description** (PO will create the issue)
- A **semicolon-separated list** of issue numbers and/or descriptions (e.g., `#42; #55`, `42; the login page crashes`, `#42; #55; the budget total is wrong`)
- A **file path** prefixed with `@` (e.g., `@/tmp/bugs.txt`) — the file contains one item per line (issue number or description); empty lines and lines starting with `#` are ignored

If empty, ask the user to provide an issue number, description, or list before proceeding.

### Mode Detection

After parsing `$ARGUMENTS`:

1. **Parse entries**: Split by `;` for inline input, or read lines from the `@`-prefixed file path. Trim each entry.
2. **Classify each entry**: Digits (with optional `#` prefix) → issue number. Everything else → description.
3. **Determine mode**:
   - **1 entry** → **single-item mode** (existing flow)
   - **2+ entries** → **multi-item mode** (batched flow)

In multi-item mode, maintain an ordered **items list** throughout the workflow. Each item tracks: issue number, title, label (`user-story` or `bug`), source (existing issue or newly created), and **original line text** (the raw line from the file or inline input that produced this item).

If the input was a `@`-prefixed file path, also store the **source file path** (without the `@` prefix) for use during cleanup in step 11.

## Steps

### 1. Rebase

Fetch and rebase the worktree branch onto `origin/beta` to ensure development starts from the latest integration state:

```
git fetch origin beta && git rebase origin/beta
```

If already rebased at session start, skip.

### 2. Resolve Issues

#### Single-item mode

Determine if `$ARGUMENTS` is an issue number or a description:

**Issue number** — Read the issue:

```
gh issue view <issue-number>
```

Confirm the issue exists, note its labels (`user-story` or `bug`), and proceed to step 3.

**Bug description** — Launch the **product-owner** agent to:

- Analyze the bug description
- Draft a bug specification:
  - **Problem**: What is broken
  - **Expected behavior**: What should happen
  - **Actual behavior**: What currently happens
  - **Reproduction steps**: How to trigger the bug
  - **Acceptance criteria**: Given/When/Then format
- Present the spec to the user for review and discussion
- **Only after user approval**: Create a GitHub Issue labeled `bug`, add to Projects board in "Todo", and link as sub-issue of the parent epic if applicable

**Important:** Do NOT create the GitHub Issue until the user explicitly approves the spec.

#### Multi-item mode

Process each entry in the items list:

1. **Issue numbers**: Resolve each with `gh issue view <number>`. Record title, labels, and acceptance criteria.
2. **Descriptions**: For each description entry, launch the **product-owner** agent to draft a spec (same format as single-item). Present each spec to the user for approval.
   - **Approved**: Create a GitHub Issue immediately (labeled `bug` or `user-story`), add to Projects board, link to parent epic if applicable. Record the new issue number in the items list.
   - **Rejected**: Drop the item from the items list.

If all items are rejected, abort the session. If at least one remains, continue.

Print a summary table before proceeding:

```
| #   | Issue | Title                          | Label      |
| --- | ----- | ------------------------------ | ---------- |
| 1   | #42   | Tooltip positioning is wrong   | bug        |
| 2   | #55   | Budget rounding error          | bug        |
| 3   | #61   | Add export button to Gantt     | user-story |
```

### 3. Visual Spec (conditional)

#### Single-item mode

**Skip this step for bug fixes** (issues labeled `bug`).

If the story touches UI (`client/src/`), launch the **ux-designer** to post a styling specification on the GitHub Issue — which tokens, interactive states, responsive behavior, animations, and accessibility requirements.

Skip for backend-only stories (no `client/src/` changes expected).

#### Multi-item mode

Run for any UI-touching stories (`user-story` label) in the items list. Launch the **ux-designer** once, covering all UI stories in the batch, posting specs on each story's GitHub Issue.

Skip entirely if all items are bugs or all are backend-only.

### 4. Branch

#### Single-item mode

Rename the worktree branch based on the issue label:

- `user-story` label → `git branch -m feat/<issue-number>-<short-description>`
- `bug` label → `git branch -m fix/<issue-number>-<short-description>`

#### Multi-item mode

Determine the branch type and name:

- **All bugs** → `fix/<lowest-issue>-<highest-issue>-<short-description>`
- **Any stories** → `feat/<lowest-issue>-<highest-issue>-<short-description>`

Where `<lowest-issue>` and `<highest-issue>` are the smallest and largest issue numbers in the batch, and `<short-description>` is a brief summary of the batch (e.g., `gantt-budget-fixes`).

Skip if the branch is already named correctly.

### 5. Move to In Progress

Move the issue(s) to **In Progress** on the Projects board.

#### Single-item mode

```bash
ITEM_ID=$(gh api graphql -f query='{ repository(owner: "steilerDev", name: "cornerstone") { issue(number: <issue-number>) { projectItems(first: 1) { nodes { id } } } } }' --jq '.data.repository.issue.projectItems.nodes[0].id')
gh api graphql -f query='mutation { updateProjectV2ItemFieldValue(input: { projectId: "PVT_kwHOAGtLQM4BOlve", itemId: "'"$ITEM_ID"'", fieldId: "PVTSSF_lAHOAGtLQM4BOlvezg9P0yo", value: { singleSelectOptionId: "296eeabe" } }) { clientMutationId } }'
```

#### Multi-item mode

Run the same GraphQL mutation for **each issue** in the items list.

### 6. Implement + Test

Launch the **dev-team-lead** agent to coordinate all implementation, testing, commits, and CI monitoring.

#### Single-item mode

Provide the dev-team-lead with:

- Issue number and acceptance criteria
- Layers affected: backend-only, frontend-only, or full-stack
- UX visual spec reference (if posted in step 3)
- Branch name

The dev-team-lead internally:

1. Decomposes work into backend/frontend tasks
2. Writes detailed implementation specs for Haiku developer agents
3. Launches `backend-developer` (Haiku) and/or `frontend-developer` (Haiku)
4. Reviews all code produced by developer agents
5. Launches `qa-integration-tester` (Sonnet) for unit/integration tests (95%+ coverage)
6. Iterates on any issues found during review
7. Commits with conventional commit message and all contributing agent trailers
8. Pushes to the branch
9. Creates the PR targeting `beta`
10. Watches CI and fixes any failures

#### Multi-item mode

Provide the dev-team-lead with the **full items list** — all issue numbers, titles, acceptance criteria, and UX specs. The dev-team-lead addresses all items in a single coordinated pass.

### 7. Verify PR

Verify the dev-team-lead has committed, pushed, and created the PR. If the PR doesn't exist yet, create it:

#### Single-item mode

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

Include `Fixes #<issue-number>` in the PR body. Use `feat(scope):` for stories, `fix(scope):` for bugs.

#### Multi-item mode

**PR title**: Descriptive conventional commit summary with issue refs:

- **All bugs** → `fix(<scope>): <description> (#42, #55)`
- **Any stories** → `feat(<scope>): <description> (#42, #55, #61)`

Scope is optional but encouraged — cover the affected areas (e.g., `gantt, budget`).

**PR body**: Per-item summary bullets, then one `Fixes #N` line per issue:

```bash
gh pr create --base beta --title "<type>(<scope>): <description> (#42, #55)" --body "$(cat <<'EOF'
## Summary

- **#42** — Fixed tooltip positioning in Gantt chart
- **#55** — Corrected budget rounding for decimal values
- **#61** — Added export button to Gantt toolbar

Fixes #42
Fixes #55
Fixes #61

## Test plan
- [ ] Unit tests pass (95%+ coverage on all items)
- [ ] Integration tests pass
- [ ] Pre-commit hook quality gates pass

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

### 8. Review

The dev-team-lead has already ensured CI is green. Launch agent reviews (in parallel - make sure to keep the review short if the changes are minimal):

- `product-architect` — architecture compliance, test coverage, code quality
- `security-engineer` — OWASP Top 10 review, input validation, auth gaps
- `product-owner` — requirements coverage, acceptance criteria (**stories only**; skip if all items are bugs)
- `ux-designer` — token adherence, visual consistency, accessibility (only for PRs touching `client/src/`, skip otherwise)

Review results are posted as **comments on the PR**. All review agents must prefix their comments with their agent name (e.g., `**[product-architect]**`).

After all reviews are posted, note each reviewer's verdict and finding counts from their `REVIEW_METRICS` block. Track this as review round 1.

In multi-item mode, reviewers must validate that **all items** in the batch are addressed.

### 9. Fix Loop

Track `fixLoopCount` (starts at 0). Each fix-and-re-review iteration increments this counter. Record which agent(s) triggered each round.

If any reviewer identifies blocking issues:

1. Re-launch the **dev-team-lead** with the reviewer feedback — the dev-team-lead delegates targeted fixes to the appropriate Haiku agent(s) and/or QA, commits, pushes, and watches CI until green
2. Re-request review from the agent(s) that flagged issues
3. Increment `fixLoopCount` and record the new round's `REVIEW_METRICS`
4. Repeat until all reviewers approve

### 10. User Approval & Merge

Once all reviews are clean, wait for CI to go green before presenting the PR to the user:

```
gh pr checks <pr-number> --watch
```

After CI is green, present the user with:

1. **PR link**: The PR URL
2. **DockerHub PR image**: `docker pull steilerdev/cornerstone:pr-<pr-number>` — the PR-specific image published by the `docker-pr-release` CI job
3. **CI status**: Confirm all checks are passing
4. **Implementation summary**: A concise summary of what was changed, which files were modified, and how the issue(s) were resolved
5. **Review summary**: N agents reviewed, N blocking findings, N total findings, N fix loops

In multi-item mode, present a **per-item summary table**:

```
| Issue | Title                          | Status   |
| ----- | ------------------------------ | -------- |
| #42   | Tooltip positioning is wrong   | Resolved |
| #55   | Budget rounding error          | Resolved |
| #61   | Add export button to Gantt     | Resolved |
```

Ask the user to approve the PR for merge. **Do NOT merge until the user explicitly approves.** Wait for explicit confirmation:

- **User approves** → proceed to step 10a (persist metrics), then merge
- **User reports issues** → take the user's feedback as new input and loop back to **step 6** (Implement + Test) on a new branch to address it

### 10a. Persist Metrics

After user approval and **before merging**, collect PR metadata and append a record to `.claude/metrics/review-metrics.jsonl`:

1. Fetch PR data:

   ```bash
   gh pr view <pr-number> --json number,additions,deletions,changedFiles
   ```

2. Append a single JSON line (do not overwrite the file):

   ```json
   {
     "pr": <number>,
     "issues": [<issue-numbers>],
     "epic": <epic-number-or-null>,
     "type": "<feat|fix|chore>",
     "mergedAt": "<ISO-8601>",
     "filesChanged": <N>,
     "linesChanged": <additions+deletions>,
     "fixLoopCount": <N>,
     "reviews": [
       { "agent": "<name>", "verdict": "<verdict>", "findings": { "critical": 0, "high": 0, "medium": 0, "low": 0, "informational": 0 }, "round": <N> }
     ],
     "totalFindings": { "critical": 0, "high": 0, "medium": 0, "low": 0, "informational": 0 }
   }
   ```

3. Commit and push the updated metrics file: `chore: update review metrics for PR #<N>`

### 10b. Merge

After metrics are persisted, merge to beta:

```
gh pr merge --squash <pr-url>
```

### 11. Close Issues & Clean Up

After merge:

#### Single-item mode

1. Close the issue:
   ```
   gh issue close <issue-number>
   ```
2. Move the issue to **Done** on the Projects board:
   ```bash
   ITEM_ID=$(gh api graphql -f query='{ repository(owner: "steilerDev", name: "cornerstone") { issue(number: <issue-number>) { projectItems(first: 1) { nodes { id } } } } }' --jq '.data.repository.issue.projectItems.nodes[0].id')
   gh api graphql -f query='mutation { updateProjectV2ItemFieldValue(input: { projectId: "PVT_kwHOAGtLQM4BOlve", itemId: "'"$ITEM_ID"'", fieldId: "PVTSSF_lAHOAGtLQM4BOlvezg9P0yo", value: { singleSelectOptionId: "c558f50d" } }) { clientMutationId } }'
   ```
3. **Remove resolved line from source file** (only when input was a `@`-prefixed file path):
   - Remove the line from the source file that produced the resolved item (matched by original text).
   - Preserve comments (`#`-prefixed lines) and empty lines.
4. Clean up the branch:
   ```
   git checkout beta && git pull && git branch -d <branch-name>
   ```
5. Exit the session and remove the worktree:
   ```
   /exit
   ```

#### Multi-item mode

1. Close **each issue** in the items list:
   ```
   gh issue close <issue-number>
   ```
2. Move **each issue** to **Done** on the Projects board (run the GraphQL mutation for each).
3. **Remove resolved lines from source file** (only when input was a `@`-prefixed file path):
   - For each closed issue, remove the line from the source file that produced it (matched by original text — the issue number or description as it appeared in the file).
   - Preserve comments (`#`-prefixed lines) and empty lines that were not part of the resolved items.
   - If all non-comment, non-empty lines have been removed, leave the file with only its comments (or empty).
4. Clean up the branch:
   ```
   git checkout beta && git pull && git branch -d <branch-name>
   ```
5. Exit the session and remove the worktree:
   ```
   /exit
   ```

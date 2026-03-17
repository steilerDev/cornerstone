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
- Create a GitHub Issue labeled `bug`, add to Projects board in "Todo", and link as sub-issue of the parent epic if applicable

#### Multi-item mode

Process each entry in the items list:

1. **Issue numbers**: Resolve each with `gh issue view <number>`. Record title, labels, and acceptance criteria.
2. **Descriptions**: For each description entry, launch the **product-owner** agent to draft a spec (same format as single-item) and create a GitHub Issue immediately (labeled `bug` or `user-story`), add to Projects board, link to parent epic if applicable. Record the new issue number in the items list.

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

### 6. Implement + Test (Multi-Phase)

Implementation uses a flat delegation model. The orchestrator launches all agents directly — the dev-team-lead produces specs and reviews but never launches sub-agents.

#### 6a. Spec Generation

Launch the **dev-team-lead** in `[MODE: spec]` with:

- Issue number(s) and acceptance criteria (single-item or full items list for multi-item mode)
- Layers affected: backend-only, frontend-only, or full-stack
- UX visual spec reference (if posted in step 3)
- Branch name
- Reminder to read `.claude/checklists/implementation-checklist.md` and include a `## Compliance Checklist` section per spec

The dev-team-lead returns a structured spec document with `## Backend Spec`, `## Frontend Spec`, `## QA Spec`, and `## E2E Spec` sections (each with a `### Compliance Checklist` subsection). Store the full spec — you will pass sections to implementation agents and the full spec to review.

#### 6b. Backend Implementation (if backend spec present)

Launch **backend-developer** (Haiku) with the `## Backend Spec` section from the spec document. The prompt should include the full backend spec section verbatim.

#### 6c. Frontend Implementation (if frontend spec present)

Check the `Execution Order` field in the spec metadata:

- **`parallel`** → Launch **frontend-developer** (Haiku) simultaneously with step 6b
- **`sequential`** → Wait for step 6b to complete first (frontend depends on new shared types)

Launch **frontend-developer** (Haiku) with the `## Frontend Spec` section from the spec document.

#### 6d. QA + E2E Testing

After implementation agents complete, launch both test agents in parallel:

**qa-integration-tester** with:

- The `## QA Spec` section from the spec document
- List of files created/modified by the backend and frontend agents

**e2e-test-engineer** (skip if no `## E2E Spec` section in the spec) with:

- The `## E2E Spec` section from the spec document
- List of files created/modified by the backend and frontend agents
- Reminder to triage prior E2E failures from recent beta PRs before writing new tests (the agent does this automatically per its "Before Starting Any Work" checklist)

**If test agents report failures**: Collect structured failure reports (see the agents' "Test Failure Reporting Format" sections) and include them verbatim in the review input for step 6e. This triggers the dev-team-lead's diagnostic protocol.

#### 6e. Code Review

Launch the **dev-team-lead** in `[MODE: review]` with:

- The original full spec document
- List of all files changed by implementation and test agents (from 6b, 6c, 6d)
- Any error output or concerns reported by implementation agents

**If `VERDICT: APPROVED`** → proceed to step 6g

**If `VERDICT: CHANGES_REQUIRED`** → proceed to step 6f

**If `VERDICT: ESCALATE_TO_ARCHITECT`** → The spec is ambiguous. Launch the **product-architect** agent to clarify the spec (provide the ambiguous spec reference and the dev-team-lead's reasoning). After the architect clarifies, re-launch the **dev-team-lead** in `[MODE: review]` with the clarified spec. Then proceed based on the new verdict.

#### 6f. Fix Loop (max 3 iterations)

Track `internalFixCount` (starts at 0). For each iteration:

1. Parse the fix specs from the review verdict — each fix specifies which agent should handle it and includes a `Diagnosis` classification when test failures are involved
2. Route fixes based on diagnosis:
   - `CODE_BUG` → production code fix to **backend-developer** or **frontend-developer** (Haiku)
   - `TEST_BUG` → test fix to **qa-integration-tester** or **e2e-test-engineer**
   - `BOTH_WRONG` → apply production code fixes **first**, then test fixes (two sequential rounds)
   - `TEST_ENVIRONMENT` → test setup fix to **qa-integration-tester** or **e2e-test-engineer**
   - Non-test issues (no diagnosis) → route as before:
     - Backend fixes → **backend-developer** (Haiku)
     - Frontend fixes → **frontend-developer** (Haiku)
     - Unit/integration test fixes → **qa-integration-tester**
     - E2E test fixes → **e2e-test-engineer**
3. After fixes complete, re-launch **dev-team-lead** in `[MODE: review]` with updated file list
4. Increment `internalFixCount`
5. If `VERDICT: APPROVED` → proceed to step 6g
6. If `VERDICT: CHANGES_REQUIRED` and `internalFixCount < 3` → repeat from step 1
7. If `internalFixCount >= 3` → escalate to the user with the remaining issues

#### 6g. Commit and PR

Launch the **dev-team-lead** in `[MODE: commit]` with:

- Contributing agents list: list every agent that was launched in steps 6b-6d (and 6f if applicable). Include `backend-developer`, `frontend-developer`, `qa-integration-tester`, and/or `e2e-test-engineer` as appropriate.
- Issue number(s) for `Fixes #N` lines
- Branch name

The dev-team-lead stages files, commits with conventional message + all agent trailers, pushes, creates the PR targeting `beta`, and watches CI.

**If CI fails**: The dev-team-lead returns a CI fix spec. Route the fix to the specified agent, then re-launch the dev-team-lead in `[MODE: commit]` (it will amend or create a new commit). Repeat until CI is green or escalate after 3 CI fix attempts.

#### 6h. Trailer Verification

After the commit is created, verify that commit trailers match the agents launched:

```bash
git log origin/beta..HEAD --format="%b"
```

If production files were changed (`git diff --name-only origin/beta..HEAD | grep -E '^(server|client|shared)/'`), verify the commit body contains the appropriate Co-Authored-By trailers:

- Files under `server/` or `shared/` → must have `Co-Authored-By: Claude backend-developer (Haiku`
- Files under `client/` → must have `Co-Authored-By: Claude frontend-developer (Haiku`
- Files under `e2e/` → must have `Co-Authored-By: Claude e2e-test-engineer (Sonnet`

If trailers are missing, the dev-team-lead missed an agent in the contributing list. Re-launch `[MODE: commit]` with the corrected list.

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
- `security-engineer` — **conditional**: only launch if the PR touches security-relevant files (see Security Review Trigger Rules below). Skip for frontend-only, test-only, or CSS-only PRs.
- `product-owner` — requirements coverage, acceptance criteria (**stories only**; skip if all items are bugs)
- `ux-designer` — token adherence, visual consistency, accessibility (only for PRs touching `client/src/`, skip otherwise)

#### Security Review Trigger Rules

Launch `security-engineer` only if the PR changes files matching ANY of these patterns:

- `server/src/routes/**` — API endpoint handlers
- `server/src/plugins/auth*` or `server/src/plugins/session*` — authentication/authorization plugins
- `Dockerfile` or `docker-compose.yml` — deployment configuration
- `**/package.json` or `**/package-lock.json` — dependency changes
- Any file path containing `sql`, `crypto`, `cookie`, `session`, `token`, `auth`, or `secret`

If none of these patterns match, skip the security review. The full security audit at `/epic-close` covers all code.

Review results are posted as **comments on the PR**. All review agents must prefix their comments with their agent name (e.g., `**[product-architect]**`).

After all reviews are posted, note each reviewer's verdict and finding counts from their `REVIEW_METRICS` block. Track this as review round 1.

In multi-item mode, reviewers must validate that **all items** in the batch are addressed.

### 9. Fix Loop

Track `fixLoopCount` (starts at 0). Each fix-and-re-review iteration increments this counter. Record which agent(s) triggered each round in `fixLoopTriggers`.

If any reviewer identifies blocking issues:

1. Collect all reviewer feedback into a fix request
2. Launch the **dev-team-lead** in `[MODE: spec]` with the reviewer feedback to produce targeted fix specs (or write the fix specs yourself if the feedback is clear enough to route directly)
3. Route fix specs to the appropriate implementation agent(s):
   - Backend fixes → **backend-developer** (Haiku)
   - Frontend fixes → **frontend-developer** (Haiku)
   - Unit/integration test fixes → **qa-integration-tester**
   - E2E test fixes → **e2e-test-engineer**
4. After fixes, launch **dev-team-lead** in `[MODE: review]` to verify the fixes
5. Launch **dev-team-lead** in `[MODE: commit]` to commit, push, and watch CI
6. Run **trailer verification** (same as step 6h)
7. Re-request review from the agent(s) that flagged issues
8. Increment `fixLoopCount` and record the new round's `REVIEW_METRICS`
9. **Update the implementation checklist**: If the fix loop was caused by a recurring pattern not yet in `.claude/checklists/implementation-checklist.md`, add the new pattern. This creates a flywheel where each fix loop reduces future occurrences.
10. Repeat until all reviewers approve

### 10. Merge

Once all reviews are clean, wait for CI to go green:

Use the **CI Gate Polling** pattern from `CLAUDE.md` (beta variant — wait for `Quality Gates` only).

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

Once CI is green and all reviewers have approved, proceed to step 10a (persist metrics) and then merge.

If the user reports issues with a merged PR, take the user's feedback as new input and start a new `/develop` cycle to address it.

### 10a. Persist Metrics

**Before merging**, collect PR metadata and append a record to `.claude/metrics/review-metrics.jsonl`:

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
     "createdAt": "<ISO-8601 of PR creation>",
     "mergedAt": "<ISO-8601 of merge>",
     "filesChanged": <N>,
     "linesChanged": <additions+deletions>,
     "touchesClient": <true|false>,
     "touchesServer": <true|false>,
     "fixLoopCount": <N>,
     "internalFixLoopCount": <N from step 6f>,
     "fixLoopTriggers": [{"round": 1, "agents": ["agent-name"]}],
     "reviews": [
       { "agent": "<name>", "verdict": "<approve|request-changes>", "findings": { "critical": 0, "high": 0, "medium": 0, "low": 0, "informational": 0 }, "round": <N> }
     ],
     "totalFindings": { "critical": 0, "high": 0, "medium": 0, "low": 0, "informational": 0 }
   }
   ```

   **Schema rules:**
   - `verdict` must be `"approve"` or `"request-changes"` — never `"comment"` (agents that would comment should approve with findings noted)
   - `createdAt` is the PR creation timestamp; `mergedAt` is only set after actual merge
   - `touchesClient` / `touchesServer` indicate whether files under `client/` or `server/`+`shared/` were changed
   - `internalFixLoopCount` tracks pre-PR review cycles (step 6f); `fixLoopCount` tracks post-PR review cycles (step 9)
   - `fixLoopTriggers` records which agent(s) caused each fix loop round

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

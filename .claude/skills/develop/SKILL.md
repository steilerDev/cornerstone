---
name: develop
description: 'Full development cycle for a single user story or bug fix. Covers implementation, testing, PR, review, merge, and user verification.'
---

# Develop — Story & Bug Fix Workflow

You are the orchestrator running a full development cycle for a single user story or bug fix. Follow these 11 steps in order. **Do NOT skip steps.** The orchestrator delegates all work — never write production code, tests, or architectural artifacts directly.

**When to use:** Implementing a single user story from an epic, or fixing an isolated bug/defect/UAT failure.
**When NOT to use:** Planning a new epic (use `/epic-start`). Closing an epic after all stories are done (use `/epic-close`).

## Input

`$ARGUMENTS` contains either:

- A **GitHub Issue number** (existing story or bug), OR
- A **bug description** (PO will create the issue)

If empty, ask the user to provide an issue number or describe the bug before proceeding.

## Steps

### 1. Rebase

Fetch and rebase the worktree branch onto `origin/beta` to ensure development starts from the latest integration state:

```
git fetch origin beta && git rebase origin/beta
```

If already rebased at session start, skip.

### 2. Resolve Issue

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

### 3. Visual Spec (conditional)

**Skip this step for bug fixes** (issues labeled `bug`).

If the story touches UI (`client/src/`), launch the **ux-designer** to post a styling specification on the GitHub Issue — which tokens, interactive states, responsive behavior, animations, and accessibility requirements.

Skip for backend-only stories (no `client/src/` changes expected).

### 4. Branch

Rename the worktree branch based on the issue label:

- `user-story` label → `git branch -m feat/<issue-number>-<short-description>`
- `bug` label → `git branch -m fix/<issue-number>-<short-description>`

Skip if the branch is already named correctly.

### 5. Move to In Progress

Move the issue to **In Progress** on the Projects board:

```bash
ITEM_ID=$(gh api graphql -f query='{ repository(owner: "steilerDev", name: "cornerstone") { issue(number: <issue-number>) { projectItems(first: 1) { nodes { id } } } } }' --jq '.data.repository.issue.projectItems.nodes[0].id')
gh api graphql -f query='mutation { updateProjectV2ItemFieldValue(input: { projectId: "PVT_kwHOAGtLQM4BOlve", itemId: "'"$ITEM_ID"'", fieldId: "PVTSSF_lAHOAGtLQM4BOlvezg9P0yo", value: { singleSelectOptionId: "296eeabe" } }) { clientMutationId } }'
```

### 6. Implement + Test (parallel)

Launch agents in parallel:

- **Developer(s)**: Launch `backend-developer` and/or `frontend-developer` — in parallel if the work spans both layers, single agent if isolated to one. Frontend developers reference the ux-designer's visual spec (if posted in step 3). Both use the specification from the Github issue created for this task.
- **QA**: Launch `qa-integration-tester` to write unit tests (95%+ coverage target) and integration tests covering the acceptance criteria in the Github issue.

### 7. Commit & PR

Stage and commit all changes (the pre-commit hook runs all quality gates automatically). Push the branch and create a PR targeting `beta`:

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

### 8. CI + Review (parallel)

Launch CI watch and agent reviews **at the same time**:

- **CI**: `gh pr checks <pr-number> --watch` (run in background)
- **Reviews** (launch in parallel - make sure to keep the review short if the changes are minimal):
  - `product-architect` — architecture compliance, test coverage, code quality
  - `security-engineer` — OWASP Top 10 review, input validation, auth gaps
  - `product-owner` — requirements coverage, acceptance criteria (stories only, skip for bugs)
  - `ux-designer` — token adherence, visual consistency, accessibility (only for PRs touching `client/src/`, skip otherwise)

Review results are posted as **comments on the PR**. All review agents must prefix their comments with their agent name (e.g., `**[product-architect]**`).

If CI fails, fix the issues on the branch and push again.

### 9. Fix Loop & Merge

If any reviewer identifies blocking issues:

1. Re-launch the implementing agent(s) to address feedback
2. Push fixes
3. Re-request review from the agent(s) that flagged issues
4. Repeat until all reviewers approve

Once reviews are clean and CI is green, merge:

```
gh pr merge --squash <pr-url>
```

### 10. User Verification

After the PR is merged, present the user with:

1. **PR link**: The merged PR URL
2. **DockerHub PR image**: `docker pull steilerdev/cornerstone:pr-<pr-number>` — the PR-specific image published by the `docker-pr-release` CI job
3. **CI links**: Links to the latest GitHub Actions runs (quality gates, beta pre-release):
   ```
   gh run list --limit 5
   ```
4. **Implementation summary**: A concise summary of what was changed, which files were modified, and how the issue was resolved

Ask the user to verify the changes. Wait for explicit confirmation:

- **User confirms** → proceed to step 11
- **User reports issues** → take the user's feedback as new input and loop back to **step 6** (Implement + Test) on a new branch to address it

### 11. Close Issue & Clean Up

After user confirmation:

1. Close the issue:
   ```
   gh issue close <issue-number>
   ```
2. Move the issue to **Done** on the Projects board:
   ```bash
   ITEM_ID=$(gh api graphql -f query='{ repository(owner: "steilerDev", name: "cornerstone") { issue(number: <issue-number>) { projectItems(first: 1) { nodes { id } } } } }' --jq '.data.repository.issue.projectItems.nodes[0].id')
   gh api graphql -f query='mutation { updateProjectV2ItemFieldValue(input: { projectId: "PVT_kwHOAGtLQM4BOlve", itemId: "'"$ITEM_ID"'", fieldId: "PVTSSF_lAHOAGtLQM4BOlvezg9P0yo", value: { singleSelectOptionId: "c558f50d" } }) { clientMutationId } }'
   ```
3. Clean up the branch:
   ```
   git checkout beta && git pull && git branch -d <branch-name>
   ```
4. Exit the session and remove the worktree:
   ```
   /exit
   ```

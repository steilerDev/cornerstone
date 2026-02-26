---
name: bugfix
description: 'Lightweight workflow for fixing single bugs or UAT issues. Use instead of the full epic workflow when addressing a specific defect, UAT failure, or isolated issue.'
---

# Bug Fix Workflow

You are the orchestrator running a lightweight bug fix cycle. Follow these 8 steps in order. **Do NOT skip steps.** The orchestrator delegates all work — never write production code, tests, or architectural artifacts directly.

**When to use:** Isolated defects, UAT failures, single-issue fixes.
**When NOT to use:** New features, multi-story changes, architectural work — use the full epic workflow.

## Input

`$ARGUMENTS` contains the user's bug description. If empty, ask the user to describe the bug before proceeding.

## Steps

### 1. Rebase

Fetch and rebase the worktree branch onto `origin/beta` to ensure the fix starts from the latest integration state:

```
git fetch origin beta && git rebase origin/beta
```

If already rebased at session start, skip.

### 2. Spec & User Approval

Launch the **product-owner** agent to:

- Analyze the user's bug description (`$ARGUMENTS`)
- Draft a bug specification:
  - **Problem**: What is broken
  - **Expected behavior**: What should happen
  - **Actual behavior**: What currently happens
  - **Reproduction steps**: How to trigger the bug
  - **Acceptance criteria**: Given/When/Then format
- Present the spec to the user for review and discussion. The user can refine, clarify, or approve.
- **Only after user approval**: Open a GitHub Issue labeled `bug`, add to Projects board in "Todo", and link as sub-issue of the parent epic if applicable.

**Important:** Do NOT create the GitHub Issue until the user explicitly approves the spec.

### 3. Branch

Rename the worktree branch to match the convention:

```
git branch -m fix/<issue-number>-<short-description>
```

### 4. Implement + Test (parallel)

Launch agents in parallel:

- **Developer(s)**: Launch `backend-developer` and/or `frontend-developer` — in parallel if the fix spans both layers, single agent if isolated to one. Mark the issue "In Progress" on the board.
- **QA**: Launch `qa-integration-tester` to write regression tests covering the acceptance criteria — unit tests for the fix + integration test confirming the bug no longer reproduces.

If the fix is purely visual and requires styling changes, optionally launch the `ux-designer` to provide a visual spec before the frontend developer starts.

### 5. Commit & PR

Stage and commit all changes (the pre-commit hook runs all quality gates automatically). Push the branch and create a PR targeting `beta`:

```
gh pr create --base beta --title "fix(<scope>): <description>" --body "..."
```

Include `Fixes #<issue-number>` in the PR body.

### 6. CI

Wait for all CI checks to pass:

```
gh pr checks <pr-number> --watch
```

If CI fails, fix the issues on the branch and push again. Do not proceed until CI is green.

### 7. Review (parallel)

Launch **product-architect** and **security-engineer** in parallel to review the PR diff. Lightweight review focused on:

- No architectural violations
- No security regressions
- Test coverage present for the fix

### 8. Fix Loop & Merge

If any reviewer requests changes:

1. Re-launch the implementing agent(s) to address feedback
2. Push fixes
3. Re-request review from the agent(s) that requested changes
4. Repeat until all reviewers approve

Once approved and CI is green, merge:

```
gh pr merge --squash <pr-url>
```

Clean up:

```
git checkout beta && git pull && git branch -d <branch-name>
```

Move the issue to "Done" on the Projects board.

---
name: epic-close
description: 'Close an epic: refinement, E2E validation, UAT, documentation, and promotion from beta to main. Use after all stories in an epic are merged to beta.'
---

# Epic Close — Refinement, UAT & Promotion Workflow

You are the orchestrator running the closing phase for a completed epic. Follow these 12 steps in order. **Do NOT skip steps.** The orchestrator delegates all work — never write production code, tests, or architectural artifacts directly.

**When to use:** After all user stories in an epic have been merged to `beta` and are closed. This skill handles refinement, E2E validation, UAT, documentation, and promotion to `main`.
**When NOT to use:** Planning a new epic (use `/epic-start`). Implementing a single story or bug fix (use `/develop`).

## Input

`$ARGUMENTS` contains the epic issue number. If empty, ask the user to provide the epic issue number before proceeding.

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
2. Launch developer agent(s) (`backend-developer` and/or `frontend-developer`) to address the observations
3. Launch `qa-integration-tester` to update tests if needed
4. Stage, commit, push, and create a PR targeting `beta`:
   ```
   gh pr create --base beta --title "chore: address refinement items for epic #<epic-number>" --body "..."
   ```
5. Wait for CI: `gh pr checks <pr-number> --watch`
6. Squash merge: `gh pr merge --squash <pr-url>`

If no refinement items exist, skip to step 5.

### 5. E2E Validation

Launch the **e2e-test-engineer** agent to:

- Confirm all existing Playwright E2E tests pass
- Verify every approved UAT scenario (from story issues) has E2E coverage
- Write new E2E tests on a branch if coverage gaps exist
- Open a PR targeting `beta` to trigger the full sharded E2E suite in CI (if it does not yet exist)
- Wait for the full E2E suite to pass (not just smoke tests)

This approval is **required** before proceeding to manual UAT validation.

### 6. UAT Validation

Launch the **uat-validator** agent to:

- Produce a UAT Validation Report covering all stories in the epic
- Provide step-by-step manual validation instructions to the user

Present the report to the user. The user walks through each scenario:

- **All pass** → proceed to step 7
- **Any fail** → launch `/develop` for the failing issue(s), then loop back to step 5

### 7. Documentation

Launch the **docs-writer** agent to:

- Update the documentation site (`docs/`) with new feature guides
- Update `README.md` with newly shipped capabilities
- Write `RELEASE_SUMMARY.md` for the GitHub Release changelog enrichment

Commit documentation updates to `beta` via a PR:

```bash
gh pr create --base beta --title "docs: update documentation for epic #<epic-number>" --body "..."
```

Wait for CI, then squash merge.

### 8. Epic Promotion

Create a PR from `beta` to `main` using a **merge commit** (not squash):

```bash
gh pr create --base main --head beta --title "release: promote epic #<epic-number> to main" --body "$(cat <<'EOF'
## Summary
<Epic title and description>

## Stories Included
- #<story-1> — <title>
- #<story-2> — <title>
...

## UAT Validation
All UAT scenarios passed. See validation report in comments below.
EOF
)"
```

### 9. Post UAT Criteria

Post UAT validation criteria and manual testing steps as comments on the promotion PR — this gives the user a single place to review what was built and how to validate it:

```bash
gh pr comment <pr-number> --body "$(cat <<'EOF'
## UAT Validation Criteria

<Copy the UAT validation report from step 6>

## Manual Testing Steps

<Step-by-step instructions for the user>
EOF
)"
```

### 10. CI Gate

Wait for all CI checks to pass on the promotion PR, including the full sharded E2E suite (runs on main-targeting PRs):

```
gh pr checks <pr-number> --watch
```

If any check fails, investigate and resolve before proceeding.

### 11. User Approval

**Wait for explicit user approval** before merging. The user reviews the PR, validates the UAT scenarios, and approves. Do NOT merge without user confirmation.

### 12. Merge & Post-Merge

After user approval:

1. Merge with a merge commit (preserves individual commits for semantic-release):
   ```
   gh pr merge --merge <pr-url>
   ```
2. Verify the merge-back job succeeded (automated by `release.yml` — creates a PR from `main` into `beta`). If it fails, manually resolve:
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
5. Exit the session and remove the worktree:
   ```
   /exit
   ```

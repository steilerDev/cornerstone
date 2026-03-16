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

Launch the **e2e-test-engineer** agent to:

- **Triage prior E2E failures** from recent beta PRs (the agent does this automatically per its "Before Starting Any Work" checklist — review the triage report before proceeding). If real regressions are found, address them before continuing.
- Confirm all existing Playwright E2E tests pass
- Verify every approved UAT scenario (from story issues) has E2E coverage
- Write new E2E tests on a branch if coverage gaps exist
- Ensure dependent system containers are included in the E2E environment (not just `page.route()` mocks)
- Expand smoke tests if the epic introduced new major capabilities
- Open a PR targeting `beta` to trigger the full sharded E2E suite in CI (if it does not yet exist)
- Wait for the full E2E suite to pass (not just smoke tests)

**If the e2e-test-engineer reports failures**: Collect the structured E2E failure reports and launch the **dev-team-lead** in `[MODE: review]` with the failure reports and the relevant spec/acceptance criteria. The dev-team-lead's diagnostic protocol will classify each failure and produce targeted fix specs. Route fixes based on the diagnosis (same routing as `/develop` step 6f).

This approval is **required** before proceeding to UAT validation.

### 6. UAT Validation

Launch the **product-owner** agent to produce UAT scenarios. The e2e-test-engineer must have already covered these scenarios in step 5. E2E pass + e2e-test-engineer report = sufficient validation. Post the UAT report as a comment on the epic issue and proceed to step 7.

The UAT scenarios are included in the promotion PR (step 8) as a manual validation checklist so the user can spot-check during the promotion gate.

### 7. Branch Sync

Check if `main` has commits that `beta` doesn't (e.g., hotfixes cherry-picked to main):

```bash
git log origin/beta..origin/main --oneline
```

If so, create a sync PR (`main` → `beta`), wait for CI, merge before proceeding. This ensures the promotion PR merges cleanly.

If no divergence, skip to step 8.

### 8. Epic Promotion

Create a PR from `beta` to `main` using a **merge commit** (not squash). The promotion PR is the single human checkpoint — include a comprehensive summary:

```bash
gh pr create --base main --head beta --title "release: promote epic #<epic-number> to main" --body "$(cat <<'EOF'
## Epic Summary
<Epic title and description>

### Stories Completed
- #<story-1> — <title>
- #<story-2> — <title>
...

### Findings & Fix Loops
- Total PRs: N | Fix loops: N | Total findings: N (C/H/M/L/I breakdown)

## Change Inventory

### Backend (`server/`, `shared/`)
<List of changed files grouped by area>

### Frontend (`client/`)
<List of changed files grouped by area>

### E2E Tests (`e2e/`)
<List of changed files>

### Docs / Config
<List of changed files>

## Validation Report
- E2E test results: <pass/fail summary>
- Agent review metrics: <summary from epic metrics report>
- Security findings: <summary of resolved/outstanding>

## Manual Validation Checklist
<UAT scenarios from step 6, presented as a checklist the user can walk through to spot-check>

- [ ] <Scenario 1: page to visit, action to take, expected result>
- [ ] <Scenario 2: ...>
- ...

## Testing
- **DockerHub beta image**: `docker pull steilerdev/cornerstone:beta`
- **PR-specific image**: `docker pull steilerdev/cornerstone:pr-<pr-number>`
EOF
)"
```

### 9. Post Detailed UAT Criteria

Post detailed UAT validation criteria as a comment on the promotion PR — step-by-step instructions the user can follow to validate each story:

```bash
gh pr comment <pr-number> --body "$(cat <<'EOF'
## Detailed UAT Validation

### Story #<N>: <title>
<Step-by-step manual validation instructions>

### Story #<N>: <title>
<Step-by-step manual validation instructions>

...
EOF
)"
```

### 10. CI Gate

Wait for all required CI gates to pass on the promotion PR using the **CI Gate Polling** pattern from `CLAUDE.md` (main variant — wait for both `Quality Gates` + `E2E Gates`).

If any gate fails, investigate and resolve before proceeding.

### 11. Promotion Approval Loop

Initialize `uatFeedbackRound = 0`. This step loops until the user explicitly approves.

#### 11a. Present for Approval

Present the user with:

1. **Promotion PR link** — with the comprehensive summary, change inventory, and validation checklist
2. **DockerHub beta image** — `docker pull steilerdev/cornerstone:beta` for manual testing
3. **E2E + review summary** — confirmation that all automated validation passed

If `uatFeedbackRound > 0`, also include a summary of changes made in the previous feedback round (issues created, PRs merged, what was fixed).

Tell the user:

- **To approve**: say "approved" (or similar confirmation) → proceed to step 12
- **To provide feedback**: write feedback to `/tmp/notes.md` and say "feedback in notes" → fixes will be applied autonomously

Do NOT merge without explicit user confirmation.

#### 11b. Await Response

Wait for the user's response. Branch:

- If the user **approves** → proceed to step 12 (Documentation & Env Drift Check)
- If the user says **"feedback in notes"** (or similar) → continue to 11c

#### 11c. Read Feedback

Read `/tmp/notes.md` and parse non-empty, non-comment lines. Print a numbered summary of the feedback items for the user to confirm.

#### 11d. PO Grouping

Launch the **product-owner** agent to:

- Analyze the feedback items
- Group related items that should be fixed together
- Create a GitHub Issue for each group, labeled `bug`, linked as a sub-issue of the epic, and added to the Projects board in **Todo** status
- Return the list of created issue numbers and their groupings

#### 11e. Execute Fixes

For each group of issues from 11d:

1. Create a fresh branch from `origin/beta`: `git checkout -B fix/<issue-number>-<short-description> origin/beta`
2. Execute `/develop` steps 2–11 (skipping step 1 Rebase and step 4 Branch — branch is already created)
3. **UAT fix batches MUST go through the standard review pipeline.** Launch at minimum:
   - `product-architect` review
   - `product-owner` review (if any items are user-story-adjacent or touch acceptance criteria)
   - `ux-designer` review (if the fix touches `client/src/`)
   - `security-engineer` review may be skipped for frontend-only UAT fixes (per Security Review Trigger Rules in `/develop` step 8)
4. Track success/failure for each group

If any group fails after retry budget exhaustion, report the failure to the user and ask whether to continue with remaining groups or pause.

**Important**: Never bypass reviews for UAT fix batches regardless of urgency. Large unreviewed PRs are the highest-risk code path.

#### 11f. Update Promotion PR

After all fix groups are merged to `beta`:

1. Close the current promotion PR: `gh pr close <pr-number>`
2. Re-run Branch Sync (step 7) to ensure `main` and `beta` are aligned
3. Create a new promotion PR with:
   - Updated change inventory reflecting all fixes
   - A **Feedback Rounds** section listing each round's issues and PRs
   - Reference to the superseded PR: `Supersedes #<old-pr-number>`
4. Post updated detailed UAT criteria (step 9) on the new PR

#### 11g. CI Gate

Wait for all required CI gates to pass on the new promotion PR using the **CI Gate Polling** pattern from `CLAUDE.md` (main variant — wait for both `Quality Gates` + `E2E Gates`).

If any gate fails, investigate and resolve before proceeding.

#### 11h. Loop

Increment `uatFeedbackRound`. Go to **11a** with the new promotion PR.

### 12. Documentation & Env Drift Check

Launch the **docs-writer** agent to:

- Update the documentation site (`docs/`) with new feature guides
- Update `README.md` with newly shipped capabilities
- Write `RELEASE_SUMMARY.md` for the GitHub Release changelog enrichment
- **Verify `.env.example` freshness**: Scan server source code for all `process.env.*` references (primarily `server/src/plugins/config.ts`), compare against `.env.example` entries, and fix any drift. Rules:
  - Optional features (OIDC, Paperless, etc.) must remain **commented out** with example placeholder values
  - Preserve inline `# Optional: ...` documentation comments
  - Update the Environment Variables table in `CLAUDE.md` if new vars were added

Commit documentation updates to `beta` via a PR:

```bash
gh pr create --base beta --title "docs: update documentation for epic #<epic-number>" --body "..."
```

Wait for CI, then squash merge.

**Note:** Documentation runs after user approval (step 11) to ensure docs reflect the final state, including any changes from UAT feedback rounds.

### 13. Lessons Learned Sync

After user approval and before merging, update the implementation checklist with patterns learned during this epic:

1. Read agent memory files for reviewing agents:
   - `product-owner/MEMORY.md` — recurring acceptance criteria gaps
   - `ux-designer/MEMORY.md` — recurring token/pattern violations
   - `product-architect/MEMORY.md` — recurring architecture deviations
2. Read `.claude/metrics/review-metrics.jsonl` filtered for this epic's PRs
3. Identify any new recurring patterns from this epic's fix loops that are NOT yet in `.claude/checklists/implementation-checklist.md`
4. If new patterns found, add them to the checklist and commit:
   ```bash
   git add .claude/checklists/implementation-checklist.md
   git commit -m "chore: update implementation checklist with lessons from epic #<epic-number>

   Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
   git push
   ```
5. If no new patterns, skip the commit

This creates a flywheel: each epic's review findings reduce fix loops in subsequent epics.

### 14. Merge & Post-Merge

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

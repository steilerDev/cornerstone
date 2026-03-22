---
name: release
description: 'Promote beta to main: branch sync, promotion PR, CI gate, user approval loop, documentation, merge. Works standalone or as part of /epic-close.'
---

# Release — Promote Beta to Main

You are the orchestrator promoting the `beta` branch to `main`. This skill handles branch sync, the promotion PR, CI gates, user approval (with optional feedback fix loops), documentation, and merge. Follow these steps in order. **Do NOT skip steps.** The orchestrator delegates all work — never write production code, tests, or architectural artifacts directly.

**When to use:** Promoting `beta` to `main` — either standalone (no prior epic) or delegated from `/epic-close`.
**When NOT to use:** Planning a new epic (use `/epic-start`). Implementing stories (use `/develop`). Running the full epic closing workflow (use `/epic-close`, which delegates to this skill).

## Input

`$ARGUMENTS` may contain:

- **Nothing** — standalone release of whatever is on `beta` beyond `main`
- **An epic issue number** — passed from `/epic-close` to enrich the promotion PR with epic context

When invoked from `/epic-close`, the calling skill provides **epic context** (stories completed, metrics report, UAT scenarios, refinement summary). Use this context to enrich the promotion PR body. When invoked standalone, generate the PR body from the git log diff between `main` and `beta`.

## Task Tracking

At the start of each `/release` invocation, create tasks to track progress. These tasks survive context compression and let you recover your place if context is lost.

**Create these tasks upfront** (using `TaskCreate`):

1. **Branch sync** — Sync main->beta if diverged (skip if no divergence)
2. **Promotion PR** — Create promotion PR (beta->main) with change summary
3. **CI gate** — Wait for Quality Gates + E2E Gates
4. **Promotion approval** — Present to user, handle feedback rounds if needed
5. **Documentation** — Launch docs-writer to update docs site, README, RELEASE_SUMMARY, and .env.example
6. **Lessons learned** — Update implementation checklist with patterns from this release
7. **Merge & post-merge** — Merge to main, verify merge-back, close epic (if applicable)

**Progress rule:** Before starting each step, mark its task `in_progress`. After completing, mark it `completed`. If a step is skipped (conditional), mark it `completed` with a note in the description.

**Recovery rule:** If you lose track of progress (e.g., after context compression), run `TaskList` to see which tasks are completed and resume from the first pending task.

**Dynamic task rule:** When a UAT fix round starts, create a new task for each round (e.g., "UAT Fix Round 1") so iterations are tracked.

## Steps

### 1. Branch Sync

Check if `main` has commits that `beta` doesn't (e.g., hotfixes cherry-picked to main):

```bash
git fetch origin main beta
git log origin/beta..origin/main --oneline
```

If so, create a sync PR (`main` -> `beta`), wait for CI, merge before proceeding. This ensures the promotion PR merges cleanly.

If no divergence, skip to step 2.

### 2. Promotion PR

Create a PR from `beta` to `main` using a **merge commit** (not squash). The promotion PR is the single human checkpoint.

#### 2a. Build Change Summary

Generate the change summary from the git log:

```bash
# Commits on beta not yet on main
git log origin/main..origin/beta --oneline --no-merges
```

Group changes by type (features, fixes, chores, docs, tests) and by area (backend, frontend, E2E, docs/config).

#### 2b. Create the PR

**If epic context is provided** (invoked from `/epic-close`):

Use the epic-enriched body provided by the calling skill — it includes stories completed, metrics report, validation report, and UAT scenarios as a manual validation checklist.

```bash
gh pr create --base main --head beta --title "release: promote epic #<epic-number> to main" --body "$(cat <<'EOF'
<epic-enriched body from /epic-close — see epic-close step 8 for format>
EOF
)"
```

**If standalone** (no epic context):

```bash
gh pr create --base main --head beta --title "release: promote beta to main" --body "$(cat <<'EOF'
## Release Summary

<One-line summary of what this release includes>

## Changes

### Features
- <list from git log, grouped>

### Fixes
- <list from git log, grouped>

### Chores / Refactoring
- <list from git log, grouped>

## Change Inventory

### Backend (`server/`, `shared/`)
<List of changed files grouped by area>

### Frontend (`client/`)
<List of changed files grouped by area>

### E2E Tests (`e2e/`)
<List of changed files>

### Docs / Config
<List of changed files>

## Manual Validation Checklist
<Key user-facing changes presented as a checklist the user can walk through to spot-check>

- [ ] <Scenario 1: page to visit, action to take, expected result>
- [ ] <Scenario 2: ...>
- ...

## Testing
- **DockerHub beta image**: `docker pull steilerdev/cornerstone:beta`
- **PR-specific image**: `docker pull steilerdev/cornerstone:pr-<pr-number>`
EOF
)"
```

#### 2c. Post Detailed Validation Criteria

Post detailed validation criteria as a comment on the promotion PR — step-by-step instructions the user can follow to validate key changes:

```bash
gh pr comment <pr-number> --body "$(cat <<'EOF'
## Detailed Validation

<Step-by-step manual validation instructions for each major change>
EOF
)"
```

**If epic context is provided**, use the UAT scenarios from `/epic-close` step 6.
**If standalone**, derive validation steps from the feature/fix commits in the diff.

### 3. CI Gate

After creating/pushing the promotion PR, **wait 5 seconds** for GitHub to compute merge status, then check mergeability: `gh pr view <PR> --repo steilerDev/cornerstone --json mergeable -q '.mergeable'`. **Only continue if the result is `MERGEABLE`.** If `CONFLICTING`, rebase onto `main`, force-push, and re-check. If `UNKNOWN`, wait a few more seconds and retry. Once mergeability is confirmed, use the **CI Gate Polling** pattern from `CLAUDE.md` (main variant — wait for `Quality Gates` + `E2E Gates` + `CLA`).

If any gate fails, investigate and resolve before proceeding.

### 4. Promotion Approval Loop

Initialize `feedbackRound = 0`. This step loops until the user explicitly approves.

#### 4a. Present for Approval

Present the user with:

1. **Promotion PR link** — with the comprehensive summary, change inventory, and validation checklist
2. **DockerHub beta image** — `docker pull steilerdev/cornerstone:beta` for manual testing
3. **E2E + review summary** — confirmation that all automated validation passed

If `feedbackRound > 0`, also include a summary of changes made in the previous feedback round (issues created, PRs merged, what was fixed).

Tell the user:

- **To approve**: say "approved" (or similar confirmation) -> proceed to step 5
- **To provide feedback**: write feedback to `/tmp/notes.md` and say "feedback in notes" -> fixes will be applied autonomously

Do NOT merge without explicit user confirmation.

#### 4b. Await Response

Wait for the user's response. Branch:

- If the user **approves** -> proceed to step 5 (Documentation & Env Drift Check)
- If the user says **"feedback in notes"** (or similar) -> continue to 4c

#### 4c. Read Feedback

Read `/tmp/notes.md` and parse non-empty, non-comment lines. Print a numbered summary of the feedback items for the user to confirm.

#### 4d. PO Grouping

Launch the **product-owner** agent to:

- Analyze the feedback items
- Group related items that should be fixed together
- Create a GitHub Issue for each group, labeled `bug`, and added to the Projects board in **Todo** status
- If an epic is in context, link issues as sub-issues of the epic
- Return the list of created issue numbers and their groupings

#### 4e. Execute Fixes

For each group of issues from 4d:

1. Create a fresh branch from `origin/beta`: `git checkout -B fix/<issue-number>-<short-description> origin/beta`
2. Execute `/develop` steps 2-11 (skipping step 1 Rebase and step 4 Branch — branch is already created)
3. **Fix batches MUST go through the standard review pipeline.** Launch at minimum:
   - `product-architect` review
   - `product-owner` review (if any items are user-story-adjacent or touch acceptance criteria)
   - `ux-designer` review (if the fix touches `client/src/`)
   - `security-engineer` review may be skipped for frontend-only fixes (per Security Review Trigger Rules in `/develop` step 8)
4. Track success/failure for each group

If any group fails after retry budget exhaustion, report the failure to the user and ask whether to continue with remaining groups or pause.

**Important**: Never bypass reviews for fix batches regardless of urgency. Large unreviewed PRs are the highest-risk code path.

#### 4f. Update Promotion PR

After all fix groups are merged to `beta`:

1. Close the current promotion PR: `gh pr close <pr-number>`
2. Re-run Branch Sync (step 1) to ensure `main` and `beta` are aligned
3. Create a new promotion PR with:
   - Updated change inventory reflecting all fixes
   - A **Feedback Rounds** section listing each round's issues and PRs
   - Reference to the superseded PR: `Supersedes #<old-pr-number>`
4. Post updated detailed validation criteria (step 2c) on the new PR

#### 4g. CI Gate

After creating/pushing the new promotion PR, **wait 5 seconds** for GitHub to compute merge status, then check mergeability: `gh pr view <PR> --repo steilerDev/cornerstone --json mergeable -q '.mergeable'`. **Only continue if the result is `MERGEABLE`.** If `CONFLICTING`, rebase onto `main`, force-push, and re-check. If `UNKNOWN`, wait a few more seconds and retry. Once mergeability is confirmed, use the **CI Gate Polling** pattern from `CLAUDE.md` (main variant — wait for `Quality Gates` + `E2E Gates` + `CLA`).

If any gate fails, investigate and resolve before proceeding.

#### 4h. Loop

Increment `feedbackRound`. Go to **4a** with the new promotion PR.

### 5. Documentation & Env Drift Check

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
gh pr create --base beta --title "docs: update documentation for release" --body "..."
```

Wait for CI, then squash merge.

**Note:** Documentation runs after user approval (step 4) to ensure docs reflect the final state, including any changes from feedback rounds.

### 6. Lessons Learned Sync

Update the implementation checklist with patterns learned:

1. Read agent memory files for reviewing agents:
   - `product-owner/MEMORY.md` — recurring acceptance criteria gaps
   - `ux-designer/MEMORY.md` — recurring token/pattern violations
   - `product-architect/MEMORY.md` — recurring architecture deviations
2. Read `.claude/metrics/review-metrics.jsonl` filtered for recent PRs
3. Identify any new recurring patterns that are NOT yet in `.claude/checklists/implementation-checklist.md`
4. If new patterns found, add them to the checklist and commit:

   ```bash
   git add .claude/checklists/implementation-checklist.md
   git commit -m "chore: update implementation checklist with lessons learned

   Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
   git push
   ```

5. If no new patterns, skip the commit

### 7. Merge & Post-Merge

After user approval:

1. Merge with a merge commit (preserves individual commits for semantic-release):
   ```
   gh pr merge --merge <pr-url>
   ```
2. Verify the merge-back job succeeded (automated by `release.yml` — creates a PR from `main` into `beta`). If it fails, manually resolve:
   ```bash
   git checkout beta && git pull && git merge origin/main && git push
   ```
3. **If epic context is provided**, close the epic issue and move to Done on the Projects board:
   ```bash
   gh issue close <epic-number>
   ITEM_ID=$(gh project item-list 4 --owner steilerDev --format json --limit 1 --query "is:issue #<epic-number>" --jq '.items[0].id')
   gh project item-edit --id "$ITEM_ID" --project-id PVT_kwHOAGtLQM4BOlve --field-id PVTSSF_lAHOAGtLQM4BOlvezg9P0yo --single-select-option-id c558f50d
   ```
4. Exit the session and remove the worktree:
   ```
   /exit
   ```

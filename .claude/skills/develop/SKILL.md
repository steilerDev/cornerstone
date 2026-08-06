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
- A **file path** prefixed with `@` (e.g., `@<path-to-file>`) — the file contains one item per line (issue number or description); empty lines and lines starting with `#` are ignored. `/tmp/batch-queue.md` is reserved for `/batch-develop`'s queue and `/tmp/notes.md` for `/release` user feedback — use any other path for ad-hoc lists.

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

## Task Tracking

At the start of each `/develop` invocation, create tasks to track progress.

**Create these tasks upfront** (using `TaskCreate`):

1. **Rebase onto beta** — Fetch and rebase worktree branch onto origin/beta
2. **Resolve issues** — Read/create GitHub Issues for all items
3. **Visual spec** — Launch ux-designer for UI-touching stories (skip if all bugs or backend-only)
4. **Create branch** — Rename worktree branch to conventional name
5. **Move to In Progress** — Update Projects board status
6. **Implement + Test** — Full multi-phase cycle: spec → backend → frontend → QA/E2E → review → fix loop → commit → trailer verification
7. **Verify PR** — Confirm PR exists targeting beta
8. **Agent reviews** — Launch product-architect, security-engineer, product-owner, ux-designer reviews
9. **Fix loop** — Address blocking reviewer findings (skip if none)
10. **Merge** — Wait for CI, squash merge to beta
11. **Close issues & clean up** — Close issues, move to Done, clean up worktree and branch

Standard task-tracking rules apply — see CLAUDE.md > "Skill Task Tracking".

## Steps

### 1. Rebase & Sync

Fetch and rebase the worktree branch onto `origin/beta` to ensure development starts from the latest integration state:

```
git fetch origin beta && git rebase origin/beta
```

If already rebased at session start, skip the rebase.

Then sync the wiki submodule **once for the whole run** — agents must not re-sync it themselves (CLAUDE.md > Agent Context Discipline):

```
git submodule update --init wiki && git -C wiki pull origin master
```

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

Move the issue(s) to **In Progress** on the Projects board:

```bash
bash scripts/board.sh <issue-number> in-progress
```

In multi-item mode, run the command for **each issue** in the items list.

### 6. Implement + Test (Multi-Phase)

Implementation uses a flat delegation model. The orchestrator launches all agents directly — the dev-team-lead produces specs and reviews but never launches sub-agents.

#### 6a. Spec Generation

Launch the **dev-team-lead** in `[MODE: spec]`. **This is the only cold start of the dev-team-lead for the whole item** — every later `[MODE: review]` / `[MODE: commit]` invocation (6e, 6f, 6g, and step 9) continues this same agent via SendMessage so it keeps the spec, checklist, and file context it already holds; launch fresh only if the agent is no longer available. Provide:

- Issue number(s) and acceptance criteria (single-item or full items list for multi-item mode)
- Layers affected: backend-only, frontend-only, or full-stack
- UX visual spec reference (if posted in step 3)
- Branch name
- Reminder to read `.claude/checklists/implementation-checklist.md` and include a `## Compliance Checklist` section per spec

The dev-team-lead returns a structured spec document with `## Backend Spec`, `## Frontend Spec`, `## QA Spec`, and `## E2E Spec` sections (each with a `### Compliance Checklist` subsection). Store the full spec — you will pass sections to implementation agents and the full spec to review.

**Story sizing:** The dev-team-lead `[MODE: spec]` classifies each item **S / M / L** in the spec metadata:

- **S** (single-file / trivially scoped) — the dev-team-lead returns a "Spec-Lite" (5–10 lines) instead of the full spec document. Skip the multi-agent fan-out: launch **one** implementer (**backend-developer** or **frontend-developer**, as appropriate) with the Spec-Lite, plus **qa-integration-tester**, then continue at step 6e.
- **M / L** — follow the full flow (6b–6d) unchanged.

#### 6b. Backend Implementation (if backend spec present)

Launch **backend-developer** with the `## Backend Spec` section from the spec document. The prompt should include the full backend spec section verbatim.

#### 6c. Frontend Implementation (if frontend spec present)

Check the `Execution Order` field in the spec metadata:

- **`parallel`** → Launch **frontend-developer** simultaneously with step 6b
- **`sequential`** → Wait for step 6b to complete first (frontend depends on new shared types)

Launch **frontend-developer** with the `## Frontend Spec` section from the spec document.

#### 6c-ii. Translation (if Translator Spec present)

If the spec document contains a `## Translator Spec` section (new i18n keys were added), launch the **translator** with the `## Translator Spec` section. Skip if no Translator Spec section exists (backend-only changes, no new UI strings).

The translator translates new English keys into all supported non-English locales and validates glossary compliance across affected namespaces.

#### 6d. QA + E2E Testing

After implementation agents complete, launch both test agents in parallel:

**qa-integration-tester** with:

- The `## QA Spec` section from the spec document
- List of files created/modified by the backend and frontend agents

**e2e-test-engineer** (skip if no `## E2E Spec` section in the spec) with:

- The `## E2E Spec` section from the spec document
- List of files created/modified by the backend and frontend agents

**If test agents report failures**: Collect structured failure reports (see the agents' "Test Failure Reporting Format" sections) and include them verbatim in the review input for step 6e. This triggers the dev-team-lead's diagnostic protocol.

#### 6e. Code Review

Continue the **dev-team-lead** (SendMessage) in `[MODE: review]` with:

- The original full spec document
- List of all files changed by implementation and test agents (from 6b, 6c, 6d)
- Any error output or concerns reported by implementation agents

**If `VERDICT: APPROVED`** → proceed to step 6g

**If `VERDICT: CHANGES_REQUIRED`** → proceed to step 6f

**If `VERDICT: ESCALATE_TO_ARCHITECT`** → The spec is ambiguous. Launch the **product-architect** agent to clarify the spec (provide the ambiguous spec reference and the dev-team-lead's reasoning). After the architect clarifies, continue the **dev-team-lead** in `[MODE: review]` with the clarified spec. Then proceed based on the new verdict.

#### 6f. Fix Loop (max 3 iterations)

Track `internalFixCount` (starts at 0). When routing a fix to an agent that already worked on this item, continue the previously launched agent via SendMessage (it retains the context it built in the earlier round) instead of launching a fresh agent; launch fresh only if that agent is no longer available. For each iteration:

1. Parse the fix specs from the review verdict — each fix specifies which agent should handle it and includes a `Diagnosis` classification when test failures are involved
2. Route fixes based on diagnosis:
   - `CODE_BUG` → production code fix to **backend-developer** or **frontend-developer**
   - `TEST_BUG` → test fix to **qa-integration-tester** or **e2e-test-engineer**
   - `BOTH_WRONG` → apply production code fixes **first**, then test fixes (two sequential rounds)
   - `TEST_ENVIRONMENT` → test setup fix to **qa-integration-tester** or **e2e-test-engineer**
   - Non-test issues (no diagnosis) → route as before:
     - Backend fixes → **backend-developer**
     - Frontend fixes → **frontend-developer**
     - Unit/integration test fixes → **qa-integration-tester**
     - E2E test fixes → **e2e-test-engineer**
3. After fixes complete, continue the **dev-team-lead** (SendMessage) in `[MODE: review]` with the updated file list
4. Increment `internalFixCount`
5. If `VERDICT: APPROVED` → proceed to step 6g
6. If `VERDICT: CHANGES_REQUIRED` and `internalFixCount < 3` → repeat from step 1
7. If `internalFixCount >= 3` → escalate to the user with the remaining issues

#### 6g. Commit and PR

Continue the **dev-team-lead** (SendMessage) in `[MODE: commit]` with:

- Contributing agents list: list every agent that was launched in steps 6b-6d (and 6f if applicable). Include `backend-developer`, `frontend-developer`, `translator`, `qa-integration-tester`, and/or `e2e-test-engineer` as appropriate.
- Issue number(s) for `Fixes #N` lines
- Branch name

The dev-team-lead stages files, commits with conventional message + all agent trailers, pushes, creates the PR targeting `beta`, and returns the PR URL. **It does not wait for CI** — CI is gated once, at step 10, and reviews (step 8) start immediately.

#### 6h. Trailer Verification

Trailer correctness is enforced at commit time by the bash-guard hook and authoritatively by CI's `trailer-check` job — no manual check needed here. If the CI job fails at step 10, continue the dev-team-lead in `[MODE: commit]` with the corrected agent list.

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

🤖 Generated with [Claude Code](https://claude.com/claude-code)
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

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### 8. Review

**Start reviews immediately after the PR exists — do not wait for CI.** Reviews and CI run in parallel; CI is gated once at step 10. Determine the applicable reviewers:

- `product-architect` — architecture compliance, test coverage, code quality (always)
- `security-engineer` — **conditional**: only include if the PR touches security-relevant files (see Security Review Trigger Rules below). Skip for frontend-only, test-only, or CSS-only PRs.
- `product-owner` — requirements coverage, acceptance criteria (**stories only**; skip if all items are bugs)
- `ux-designer` — token adherence, visual consistency, accessibility (only for PRs touching `client/src/`, skip otherwise)

Before invoking the workflow, pre-fetch the diff once and compute per-reviewer file scopes:

```bash
gh pr diff <n> > /tmp/pr-<n>.diff
gh pr diff <n> --name-only   # source for the per-reviewer file lists
```

Scopes: `ux-designer` → files under `client/src/`; `security-engineer` → the files matching the Security Review Trigger Rules; `product-architect` and `product-owner` → the full file list.

Then invoke the Workflow tool with `{name: "pr-review", args: {pr: <n>, diffPath: "/tmp/pr-<n>.diff", reviewers: [{agent: "product-architect", files: [...]}, {agent: "security-engineer", files: [...]}, ...]}}` — one entry per applicable reviewer. If the Workflow tool is unavailable, fall back to launching the applicable reviewer agents in parallel with the Agent tool, passing the same diffPath and file scopes (keep each review short if the changes are minimal).

#### Security Review Trigger Rules

Launch `security-engineer` only if the PR changes files matching ANY of these patterns:

- `server/src/routes/**` — API endpoint handlers
- `server/src/plugins/auth*` or `server/src/plugins/session*` — authentication/authorization plugins
- `Dockerfile` or `docker-compose.yml` — deployment configuration
- `**/package.json` or `**/package-lock.json` — dependency changes
- Any file path containing `sql`, `crypto`, `cookie`, `session`, `token`, `auth`, or `secret`

If none of these patterns match, skip the security review. The full security audit at `/epic-close` covers all code.

Review results are posted as **comments on the PR**. All review agents must prefix their comments with their agent name (e.g., `**[product-architect]**`).

After all reviews are posted, note each reviewer's verdict. Track this as review round 1.

In multi-item mode, reviewers must validate that **all items** in the batch are addressed.

### 9. Fix Loop (max 2 rounds)

Reviewers operate **fix-or-block** (CLAUDE.md > Reviewer Verdict Policy): low-effort findings are fixed in this PR before merge — never deferred — and any deferral must arrive as a filed, justified GitHub issue in the review body. Never merge with unfixed `fix-in-session` findings, and never accept an unfiled deferral.

Track fix loop iterations. Each fix-and-re-review cycle counts as one round.

If any reviewer identifies blocking issues:

1. Collect all reviewer feedback into a fix request
2. Continue the **dev-team-lead** (SendMessage) in `[MODE: spec]` with the reviewer feedback to produce targeted fix specs (or write the fix specs yourself if the feedback is clear enough to route directly)
3. Route fix specs to the appropriate implementation agent(s). Continue the previously launched agent via SendMessage (it retains the context it built in the earlier round) instead of launching a fresh agent; launch fresh only if that agent is no longer available:
   - Backend fixes → **backend-developer**
   - Frontend fixes → **frontend-developer**
   - Unit/integration test fixes → **qa-integration-tester**
   - E2E test fixes → **e2e-test-engineer**
4. After fixes, continue the **dev-team-lead** in `[MODE: review]` to verify the fixes, then in `[MODE: commit]` to commit and push (no CI wait — step 10 gates it)
5. Re-request review from the agent(s) that flagged issues
6. **Update the implementation checklist**: If the fix loop was caused by a recurring pattern not yet in `.claude/checklists/implementation-checklist.md`, add the new pattern. This creates a flywheel where each fix loop reduces future occurrences.
7. If reviewers still report blocking findings after **round 2**, stop looping — present the remaining findings to the user in this session and let them decide (fix per their direction, or merge with explicitly accepted findings).

### 10. Merge

Once all reviews are clean, wait for CI to go green — **this is the single CI gate of the whole cycle**:

```bash
bash scripts/ci-wait.sh <pr-number>
```

The script handles the mergeability precheck, gate polling, timeouts, and rate-limit backoff. If it reports a merge conflict, rebase onto `beta`, force-push, and re-run it.

**If CI fails**: continue the **dev-team-lead** with the failure logs — it returns a CI fix spec (diagnosis + target agent). Route the fix, have the dev-team-lead re-commit in `[MODE: commit]`, and re-run `ci-wait.sh`. Escalate to the user after 3 CI fix attempts.

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

**Left-shifted verification**: in an interactive session, offer the user the PR image (`docker pull steilerdev/cornerstone:pr-<n>`) and ask whether they want to verify before the merge; treat any feedback as a step 9 fix round **before** merging — catching it here is one commit, catching it at epic UAT is a new session. In autonomous contexts (`/epic-run`, `/batch-develop`, background runs), merge without waiting.

Once CI is green and all reviewers have approved, merge to beta. Write the body (1-3 summary bullets reused from the PR body, plus one `Fixes #<issue-number>` line per issue in multi-item mode) to a temp file, then:

```bash
bash scripts/squash-merge.sh <pr-number> "<the same conventional title used in step 7's PR creation>" <body-file>
```

The script rebuilds trailers from the PR's commits (case-normalized, deduped), guards against skip-ci directives in the subject, and merges.

If the user reports issues with a merged PR, take the user's feedback as new input and start a new `/develop` cycle to address it.

### 11. Close Issues & Clean Up

After merge (in multi-item mode, run items 1–2 for **each issue** in the items list):

1. Close the issue:
   ```
   gh issue close <issue-number>
   ```
2. Move the issue to **Done** on the Projects board:
   ```bash
   bash scripts/board.sh <issue-number> done
   ```
3. **Remove resolved line(s) from source file** (only when input was a `@`-prefixed file path):
   - For each closed issue, remove the line from the source file that produced it (matched by original text — the issue number or description as it appeared in the file).
   - Preserve comments (`#`-prefixed lines) and empty lines that were not part of the resolved items.
   - If all non-comment, non-empty lines have been removed, leave the file with only its comments (or empty).
4. Clean up the worktree and branch — run from the **base repository**, only once the PR is merged and the worktree has no uncommitted changes:
   ```bash
   bash scripts/worktree-done.sh <worktree-path> <branch>
   ```
   The script verifies the tree is clean, removes the worktree (handling the wiki-submodule refusal), and deletes the branch only when a merged PR exists. This must be the last action of the session (the working directory it started from no longer exists afterward).

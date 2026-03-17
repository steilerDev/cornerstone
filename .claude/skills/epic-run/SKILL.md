---
name: epic-run
description: 'Autonomous end-to-end epic execution: plans stories, develops each story sequentially, then closes the epic. Only pauses for promotion to main.'
---

# Epic Run — Autonomous End-to-End Epic Execution

You are the orchestrator running an entire epic lifecycle autonomously. This skill chains planning (`/epic-start`), development (`/develop` per story), and closing (`/epic-close`) into a single session. Follow these phases in order. **Do NOT skip phases.**

**When to use:** Executing a complete epic end-to-end in a single session. Only pauses for `beta` → `main` promotion.
**When NOT to use:** When you want to run individual phases separately (use `/epic-start`, `/develop`, `/epic-close`).

**Delegation principle:** Each phase delegates to the corresponding sub-skill's steps. When this skill says "Execute `/develop` steps 2–11", read and follow those exact steps from the `/develop` skill file (`.claude/skills/develop/SKILL.md`). Do not re-implement or paraphrase them.

## Input

`$ARGUMENTS` contains either:

- An epic description or requirements reference (PO will create the epic issue), OR
- An existing epic issue number (PO will verify and refine it)

If empty, ask the user to describe the epic or provide an issue number before proceeding.

## Error Handling: Retry-Then-Pause

Each story has a **retry budget of 3**. The counter increments when:

- Internal code review (step 6e in `/develop`) requires re-launching an implementation agent
- CI fails after push and a fix spec must be routed to an agent
- Review fix loop (step 9 in `/develop`) requires a full spec→implement→commit cycle

**At 3 failed retries:**

1. Post failure comment on epic issue with details
2. Pause and ask the user: provide guidance, skip the story, or abort

## Session Recovery

Merged PRs and closed issues are durable state. If the session crashes:

- Re-invoke `/epic-run` on the same epic
- Phase 2 detects already-closed stories and skips them
- An in-progress story may have an open PR; the user can finish it with `/develop` then re-run `/epic-run`

## Task Tracking

Use tasks to track progress across the entire epic lifecycle. Tasks survive context compression — after any compression event, run `TaskList` to recover your place.

**Phase 0 — create these tasks immediately:**

1. **Session setup** — Rebase onto beta + wiki sync + initialize tracking state
2. **Planning phase** — Execute /epic-start steps 3–5 (PO + architect + present to user)
3. **Build story queue** — Topologically sort stories and post execution order

**After story queue is built** — create one task per story:

4–N. **Story #\<number\>: \<title\>** — Full /develop cycle for this story

**After all stories complete** — create closing tasks:

- **Pre-check** — Handle failed stories (if any)
- **Verify all stories merged** — Confirm all sub-issues closed
- **Epic metrics + lint check** — Generate metrics report and lint health check
- **Refinement PR** — Address refinement items (skip if none)
- **E2E validation** — Confirm E2E coverage and pass rate
- **UAT validation** — Product-owner UAT scenarios
- **Branch sync + promotion** — Sync main→beta if needed, create promotion PR + UAT criteria
- **CI gate + promotion approval** — Wait for CI, present to user, handle feedback rounds
- **Documentation + lessons learned** — Update docs/README/RELEASE_SUMMARY, sync implementation checklist
- **Merge & post-merge** — Merge to main, close epic

**Progress rule:** Before starting each step, mark its task `in_progress`. After completing, mark it `completed`. If a step is skipped, mark it `completed` with a note.

**Recovery rule:** If you lose track of progress (e.g., after context compression), run `TaskList` to see which tasks are completed and resume from the first pending task.

**Dynamic task rule:** When fix loops, UAT rounds, or E2E fix cycles start, create a new task for each round so iterations are tracked.

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

## Phase 1: Planning (delegates to `/epic-start`)

Execute `/epic-start` steps 3–5 (Product Owner, Product Architect, Present to User). Steps 1–2 (Rebase, Wiki Sync) are already handled by Phase 0.

Specifically:

1. **Execute `/epic-start` step 3** (Plan: Product Owner) — launches the PO agent to create the epic issue, decompose into stories, link sub-issues, set board statuses, and post acceptance criteria.

2. **Execute `/epic-start` step 4** (Plan: Product Architect) — launches the architect agent to design schema/API/ADRs and update wiki pages.

3. **Execute `/epic-start` step 5** (Present to User) — post the plan as a comment on the epic issue and present it to the user. Skip the step 6 handoff instructions (the user is not invoking `/develop` manually — Phase 2 handles it).

### 1.4 Build Story Queue

After both agents complete:

1. List all sub-issues of the epic with their `addBlockedBy` relationships
2. Topologically sort stories by dependencies (unblocked stories first)
3. Store the sorted list as `storyQueue`

Post the execution order as a comment on the epic issue and proceed immediately to Phase 2.

---

## Phase 2: Story Loop (delegates to `/develop`)

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

Note: This replaces `/develop` step 1 (Rebase) and step 4 (Branch). The branch is created directly from `origin/beta` rather than renaming the worktree branch — since `/epic-run` processes multiple stories sequentially, each needs a fresh branch.

### 2.3–2.11 Execute `/develop` steps 2–11

Execute `/develop` steps 2 through 11 for the current story, using **single-item mode** throughout:

- **Step 2** (Resolve Issues) — resolve the story issue
- **Step 3** (Visual Spec) — conditional, for UI-touching stories
- **Step 4** (Branch) — **skip**, already handled in 2.2 above
- **Step 5** (Move to In Progress) — move issue to In Progress
- **Step 6** (Implement + Test) — full multi-phase implementation cycle (spec → backend → frontend → QA/E2E → review → fix loop → commit → trailer verification)
- **Step 7** (Verify PR) — verify or create PR targeting `beta`
- **Step 8** (Review) — launch 4 reviewer agents in parallel
- **Step 9** (Fix Loop) — fix loop if reviewers flag blocking issues
- **Step 10** (Merge) — wait for CI, persist metrics, present summary, squash merge
- **Step 11** (Close Issues & Clean Up) — close issue, move to Done on board. **Skip the branch cleanup and `/exit`** — the session continues with the next story.

After step 11 completes, add the story to `completedStories`.

### 2.12 Check Newly Unblocked Stories

If any stories in `storyQueue` had `addBlockedBy` dependencies on the just-completed story, verify they are now unblocked and ready for development.

### 2.13 Progress Summary (every 4 stories)

After every 4 completed stories, post a lean progress summary on the epic issue:

```bash
gh issue comment <epic-number> --body "**[orchestrator]** Progress: <N>/<total> stories complete. Completed: #X, #Y, #Z, #W. Remaining: <count>. Failed: <count or none>."
```

---

## Phase 3: Closing (delegates to `/epic-close`)

### 3.0 Pre-Check

If `failedStories` is non-empty, ask the user: proceed with completed stories only, retry failures, or abort. Note excluded stories for inclusion in the promotion PR body.

### 3.1 Execute `/epic-close` steps 2–13

Execute `/epic-close` steps 2 through 13 in order. Step 1 (Rebase) is skipped — the worktree is already on the latest beta from the story loop.

- **Step 2** (Verify All Stories Merged)
- **Step 2a** (Generate Epic Metrics Report)
- **Step 2b** (Lint Health Check)
- **Step 3** (Collect Refinement Items)
- **Step 4** (Refinement PR)
- **Step 5** (E2E Validation)
- **Step 6** (UAT Validation)
- **Step 7** (Branch Sync)
- **Step 8** (Epic Promotion)
- **Step 9** (Post Detailed UAT Criteria)
- **Step 10** (CI Gate)
- **Step 11** (Promotion Approval Loop) — **mandatory human gate** with autonomous feedback fix loop
- **Step 12** (Documentation & Env Drift Check) — runs after user approval
- **Step 13** (Merge & Post-Merge)

If any step in `/epic-close` references "failed stories" or "excluded stories", use the `failedStories` list from Phase 2.

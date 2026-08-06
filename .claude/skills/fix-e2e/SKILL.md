---
name: fix-e2e
description: 'Iteratively fix failing E2E tests from a CI run. Analyzes failures, plans fixes, implements them, pushes, and repeats until all E2E tests pass.'
---

# Fix E2E — Iterative E2E Test Failure Resolution

You are the orchestrator running an iterative E2E test fix cycle. Follow these steps in order. **Do NOT skip steps.** The orchestrator delegates all implementation work — never write production code, tests, or architectural artifacts directly.

**When to use:** When a CI run has failing E2E tests that need to be fixed. This skill analyzes failures, determines root causes (test code vs production code vs spec), implements fixes via the appropriate agents, pushes, and iterates until all E2E tests pass.
**When NOT to use:** For new feature development (use `/develop`). For full epic validation (use `/epic-close`).

## Input

`$ARGUMENTS` contains one of the following:

- A **GitHub Actions run URL** (e.g., `https://github.com/owner/repo/actions/runs/12345`)
- A **GitHub Actions run ID** (e.g., `12345`)

If empty, ask the user to provide a run URL or ID before proceeding.

### Input Parsing

Extract the run ID from the input:

- If a URL: extract the numeric run ID from the path
- If a number: use directly as the run ID

## Task Tracking

At the start of each `/fix-e2e` invocation, create tasks to track progress.

**Create these tasks upfront** (using `TaskCreate`):

1. **Analyze CI failures** — Fetch logs, categorize failures, identify root causes
2. **Plan fixes** — Enter plan mode, design fix approach for each failure category
3. **Implement fixes** — Delegate to appropriate agents (e2e-test-engineer for test fixes, backend-developer/frontend-developer for production code fixes)
4. **Push and verify** — Commit, push, wait for full E2E CI to complete
5. **Iterate or complete** — If failures remain, loop back to step 1; otherwise, done

Standard task-tracking rules apply — see CLAUDE.md > "Skill Task Tracking".

## Steps

### 1. Analyze CI Failures

Fetch the failed run details:

```bash
# Get run summary
gh run view <RUN_ID> --repo steilerDev/cornerstone

# Get unique failed test names
gh run view <RUN_ID> --repo steilerDev/cornerstone --log-failed 2>&1 | grep -E "✘" | sed 's/.*✘/✘/' | sort -u

# Get error details for each failure pattern
gh run view <RUN_ID> --repo steilerDev/cornerstone --log-failed 2>&1 | grep -E "(Error:|expect\(|Expected:|Received:|Timeout)" | head -100
```

**Categorize failures** into distinct groups:

- Group by test file and failure pattern (same error = same root cause)
- Note which viewports are affected (desktop/tablet/mobile — all = likely production issue, one = likely responsive/test issue)
- Note retry behavior (fails on retry too = deterministic, passes on retry = flaky)

**Determine root cause classification** for each group using the test failure debugging protocol:

- **Test bug**: Test expectations don't match current production behavior (e.g., test references a renamed field, uses a stale locator, has wrong selector)
- **Production bug**: Production code behavior is incorrect per the spec/contract (e.g., missing field, broken feature, regression)
- **Spec mismatch**: Spec/contract changed but tests weren't updated

### 2. Plan Fixes (Enter Plan Mode)

Enter plan mode (`EnterPlanMode`) and write a structured fix plan covering:

For each failure group:

1. **Failure description**: What test fails and what the error is
2. **Root cause**: Test bug, production bug, or spec mismatch
3. **Fix approach**: What needs to change and in which files
4. **Agent assignment**: Which agent implements the fix

The plan must identify the specific files to modify and the exact changes needed. Read the relevant test files, page objects, and production code before finalizing the plan.

**Critical**: Read the actual test code, page object models, and production code (API routes, components, schema) to understand the mismatch. Do not guess — verify by reading files.

Exit plan mode (`ExitPlanMode`) once the plan is approved.

### 3. Implement Fixes

Delegate fixes to the appropriate agents based on the plan:

- **E2E test fixes** (test selectors, assertions, page objects): Launch `e2e-test-engineer` agent
- **Backend production fixes** (API, services, schema): Launch `backend-developer` agent
- **Frontend production fixes** (components, pages, hooks): Launch `frontend-developer` agent
- **Translation fixes**: Launch `translator` agent

Provide each agent with:

- The specific failure details and error messages
- The exact files to modify
- The expected behavior
- Any relevant context from the production code or spec

**Delegation rules** (per CLAUDE.md):

- The orchestrator NEVER writes production code or tests directly
- Each agent gets a clear, self-contained spec
- Multiple independent fixes can be delegated in parallel

### 4. Commit, Push, and Wait for CI

#### 4a. Commit

Ensure the branch name follows conventions. This skill's input is a CI run URL/ID, not an issue — there is no issue number to slot into the standard `<type>/<issue-number>-<short-description>` pattern. Use the run ID in its place (mirroring the precedent in `/dependabot` step 6d, which substitutes a GHSA ID for the same reason):

```bash
git branch -m fix/e2e-<run-id>-<short-description>
```

Where `<short-description>` is a 2–4 word kebab-case summary of the dominant failure category identified in step 1 (e.g., `fix/e2e-48213021-gantt-selector`).

Commit with appropriate trailers based on which agents contributed:

```bash
git add <specific-files>
git commit -m "$(cat <<'EOF'
fix(e2e): <concise description of fixes>

<details of what was fixed and why>

Co-Authored-By: Claude e2e-test-engineer <noreply@anthropic.com>
EOF
)"
```

Use the exact per-agent string from CLAUDE.md's **Canonical Agent Trailers** table — this commit is authored directly by this skill (not via `dev-team-lead [MODE: commit]`), so there is no automated normalization; get the casing right the first time. If `backend-developer` or `frontend-developer` also contributed a fix (per step 3's classification table), include their canonical trailers too.

#### 4b. Verify locally, then push

Before burning a full CI round on an unverified fix, run **only the failing spec files** locally where the environment permits (Docker available for testcontainers):

```bash
npx playwright test <failing-spec-file> [<failing-spec-file> ...] --project=desktop-chromium
```

Run just the affected files/projects — never the full suite locally; the full sharded suite runs exactly once per iteration, in CI (step 4c), which stays authoritative. If the local environment cannot run E2E, push and let CI verify.

```bash
git push -u origin <branch-name>
```

If no PR exists, create one targeting `beta`:

```bash
gh pr create --base beta --title "fix(e2e): resolve failing E2E tests" --body "$(cat <<'EOF'
## Summary
- <bullet points describing fixes>

## Test plan
- [ ] All E2E shards pass in CI
- [ ] Quality Gates pass

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

#### 4c. Wait for full E2E results

```bash
bash scripts/ci-wait.sh <pr-number> main
```

Even though this PR targets `beta`, use the `main` gate variant — fixing E2E requires waiting for the full E2E suite, not just `Quality Gates`. For long runs, extend the timeout with `CI_WAIT_TIMEOUT=<seconds>`. The script also handles the mergeability precheck and rate-limit backoff.

### 5. Iterate or Complete

After CI completes:

**If all E2E tests passed**:

1. The `ci-wait.sh` run in step 4c already confirmed `Quality Gates` alongside the E2E shards — no separate wait is needed.
2. Squash merge the PR — write a body summarizing the E2E fixes applied to a temp file, then:

   ```bash
   bash scripts/squash-merge.sh <pr-number> "<the PR title>" <body-file>
   ```

3. Mark all tasks completed. Report success to the user with:
   - Total iterations needed
   - Summary of all fixes applied
   - PR URL (now merged)

**If E2E tests still fail**:

1. Create new iteration tasks (e.g., "Iteration 2: Analyze", "Iteration 2: Fix", "Iteration 2: Verify")
2. Fetch the NEW run ID from the latest PR check:
   ```bash
   SHA=$(gh pr view <PR> --repo steilerDev/cornerstone --json headRefOid -q '.headRefOid')
   gh run list --repo steilerDev/cornerstone --commit "$SHA" --workflow "Quality Gates" --json databaseId -q '.[0].databaseId'
   ```
3. Go back to **Step 1** with the new run's failures
4. Enter plan mode again to analyze remaining failures and plan the next round of fixes
5. When delegating repeat fix rounds, continue the previously launched agent via SendMessage (it retains the context it built in the earlier round) instead of launching a fresh agent; launch fresh only if that agent is no longer available
6. Repeat until all E2E tests pass

**Iteration cap**: If after 5 iterations E2E tests still fail, stop and report the remaining failures to the user for manual review. Include:

- Which tests still fail
- What was tried
- Hypotheses for remaining issues

## Key Principles

1. **Investigate before fixing**: Always read the actual test code, page objects, and production code before planning fixes. Never guess at root causes.
2. **Smallest fix wins**: Prefer minimal, targeted fixes over broad refactors.
3. **Test failure debugging protocol**: Follow the source-of-truth hierarchy (Spec/Contract > Production code > Test code). Don't weaken correct tests to accommodate buggy code.
4. **Plan between iterations**: Enter plan mode between each iteration to analyze new failures with fresh eyes. Each iteration may reveal different root causes.
5. **Track progress**: Use tasks to maintain state across context compressions. Each iteration should have its own task set.

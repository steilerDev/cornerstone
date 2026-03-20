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

At the start of each `/fix-e2e` invocation, create tasks to track progress. These tasks survive context compression and let you recover your place if context is lost.

**Create these tasks upfront** (using `TaskCreate`):

1. **Analyze CI failures** — Fetch logs, categorize failures, identify root causes
2. **Plan fixes** — Enter plan mode, design fix approach for each failure category
3. **Implement fixes** — Delegate to appropriate agents (e2e-test-engineer for test fixes, backend-developer/frontend-developer for production code fixes)
4. **Push and verify** — Commit, push, wait for full E2E CI to complete
5. **Iterate or complete** — If failures remain, loop back to step 1; otherwise, done

**Progress rule:** Before starting each step, mark its task `in_progress`. After completing, mark it `completed`. If a step is skipped (conditional), mark it `completed` with a note.

**Recovery rule:** If you lose track of progress (e.g., after context compression), run `TaskList` to see which tasks are completed and resume from the first pending task.

**Dynamic task rule:** For each fix-and-verify iteration beyond the first, create new tasks (e.g., "Iteration 2: Analyze", "Iteration 2: Fix", "Iteration 2: Verify").

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

Ensure the branch name follows conventions. If on a worktree branch, rename it:

```bash
git branch -m fix/<issue-number>-e2e-fixes
```

Commit with appropriate trailers based on which agents contributed:

```bash
git add <specific-files>
git commit -m "$(cat <<'EOF'
fix(e2e): <concise description of fixes>

<details of what was fixed and why>

Co-Authored-By: Claude <agent-name> (<model>) <noreply@anthropic.com>
EOF
)"
```

#### 4b. Push and create/update PR

```bash
git push -u origin <branch-name>
```

If no PR exists, create one targeting `beta`:

```bash
gh pr create --title "fix(e2e): resolve failing E2E tests" --body "$(cat <<'EOF'
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

**First**, check mergeability:

```bash
state=$(gh pr view <PR> --repo steilerDev/cornerstone --json mergeable -q '.mergeable')
if [ "$state" != "MERGEABLE" ]; then echo "PR is not mergeable (state: $state)"; exit 1; fi
```

**Then**, wait for ALL E2E shards to complete (not just Quality Gates):

```bash
echo "Waiting for Quality Gates + all E2E shards..."
SECONDS=0
while true; do
  if [ $SECONDS -ge 900 ]; then echo "TIMEOUT"; exit 1; fi

  qg=$(gh pr checks <PR> --repo steilerDev/cornerstone --json name,bucket -q '.[] | select(.name == "Quality Gates") | .bucket' 2>/dev/null)

  # Check if ANY E2E shard failed
  e2e_fail=$(gh pr checks <PR> --repo steilerDev/cornerstone --json name,bucket -q '.[] | select(.name | startswith("E2E Tests")) | select(.bucket == "fail") | .name' 2>/dev/null | head -1)

  # Check if ALL E2E shards completed
  e2e_total=$(gh pr checks <PR> --repo steilerDev/cornerstone --json name,bucket -q '.[] | select(.name | startswith("E2E Tests")) | .name' 2>/dev/null | wc -l)
  e2e_done=$(gh pr checks <PR> --repo steilerDev/cornerstone --json name,bucket -q '.[] | select(.name | startswith("E2E Tests")) | select(.bucket == "pass" or .bucket == "fail") | .name' 2>/dev/null | wc -l)

  if [ "$qg" = "fail" ]; then echo "Quality Gates FAILED"; exit 1; fi
  if [ -n "$e2e_fail" ]; then echo "E2E shard failed: $e2e_fail"; break; fi
  if [ "$qg" = "pass" ] && [ "$e2e_total" -gt 0 ] && [ "$e2e_done" -eq "$e2e_total" ]; then echo "All $e2e_total E2E shards passed!"; break; fi

  echo "Progress: QG=$qg, E2E=$e2e_done/$e2e_total done"
  sleep 30
done
```

### 5. Iterate or Complete

After CI completes:

**If all E2E tests passed**:

1. Wait for `Quality Gates` to pass (beta variant from CLAUDE.md):
   ```bash
   echo "Waiting for Quality Gates..."
   SECONDS=0
   while true; do
     if [ $SECONDS -ge 300 ]; then echo "TIMEOUT"; exit 1; fi
     bucket=$(gh pr checks <PR> --repo steilerDev/cornerstone --json name,bucket -q '.[] | select(.name == "Quality Gates") | .bucket' 2>/dev/null)
     case "$bucket" in pass) echo "Quality Gates passed"; break ;; fail) echo "Quality Gates FAILED"; exit 1 ;; *) sleep 30 ;; esac
   done
   ```
2. Squash merge the PR:
   ```bash
   gh pr merge <PR> --squash --repo steilerDev/cornerstone
   ```
3. Mark all tasks completed. Report success to the user with:
   - Total iterations needed
   - Summary of all fixes applied
   - PR URL (now merged)

**If E2E tests still fail**:

1. Create new iteration tasks (e.g., "Iteration 2: Analyze", "Iteration 2: Fix", "Iteration 2: Verify")
2. Fetch the NEW run ID from the latest PR check:
   ```bash
   gh pr checks <PR> --repo steilerDev/cornerstone --json name,link -q '.[] | select(.name == "Quality Gates") | .link' 2>/dev/null
   ```
3. Go back to **Step 1** with the new run's failures
4. Enter plan mode again to analyze remaining failures and plan the next round of fixes
5. Repeat until all E2E tests pass

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

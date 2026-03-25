---
name: review-pr
description: 'Comprehensive PR review using the full agent team. Reviews for duplicates, suspicious changes, dependency changes, architecture violations, and spec compliance. Approves or rejects with consolidated findings.'
---

# Review PR — External & Internal PR Review Workflow

You are the orchestrator running a comprehensive review of a pull request using the full agent team. Follow these 7 steps in order. **Do NOT skip steps.** The orchestrator delegates all reviews — never post review comments directly. The orchestrator reads the diff independently to produce a behavior change summary.

**When to use:** Reviewing any PR — external contributions, Dependabot PRs, or re-reviewing after contributor pushes fixes.
**When NOT to use:** PRs created by the `/develop` skill (those are reviewed inline during development).

## Input

`$ARGUMENTS` contains the PR number (e.g., `#581` or `581`). If empty, ask the user to provide a PR number before proceeding.

## Steps

### 1. PR Context Gathering

Fetch full PR metadata and diff:

```bash
gh pr view <pr-number> --json title,body,author,baseRefName,headRefName,files,url,labels,number,closingIssuesReferences
```

```bash
gh pr diff <pr-number>
```

Store the full diff — you will use it in Step 6 to produce an independent behavior change summary.

**Classify affected areas** by inspecting the changed files list:

- `BACKEND` — any files under `server/` or `shared/`
- `CLIENT` — any files under `client/`
- `TESTS` — any files under `e2e/` or files matching `*.test.*`
- `DOCS` — any files under `docs/`

Record all affected areas for use in Step 3 conditional agent launches.

**Base branch enforcement** — if the PR does not target `beta`, retarget it:

```bash
gh pr edit <pr-number> --base beta
```

### 2. Duplicate / Redundancy Check

Launch the **product-owner** agent to:

- Check if the feature or fix introduced by this PR is already implemented in the codebase
- Search GitHub Issues and the Projects board for overlapping or conflicting work
- Return one of:
  - `UNIQUE` — no overlap found, proceed
  - `DUPLICATE` — feature/fix already exists or is tracked by another issue. **Stop the review.** Post a comment on the PR explaining the duplication with references, then present the finding to the user
  - `OVERLAPS` — partial overlap with existing work. Flag the overlap and continue with the review

If `DUPLICATE`, skip all remaining steps.

### 3. Parallel Agent Reviews

Launch all applicable review agents simultaneously. Each agent posts its own `gh pr review` on the PR.

**Always launch (every PR):**

- **product-architect** — architecture compliance, API contract adherence, schema conventions, naming conventions, dependency policy
- **security-engineer** — **conditional**: only launch if the PR touches security-relevant files. Launch if changed files match ANY of: `server/src/routes/**`, `server/src/plugins/auth*`, `server/src/plugins/session*`, `Dockerfile`, `docker-compose.yml`, `**/package.json`, `**/package-lock.json`, or any path containing `sql`, `crypto`, `cookie`, `session`, `token`, `auth`, or `secret`. Skip for frontend-only, test-only, docs-only, or CSS-only PRs.
- **dev-team-lead** `[MODE: review]` — code quality, TypeScript strictness, ESM conventions, consistent-type-imports, test co-location

**Conditional launches (based on affected areas from Step 1):**

- `CLIENT` affected → **ux-designer** (token adherence, visual consistency, dark mode, responsive, accessibility) + **frontend-developer** (React patterns, hook conventions, component structure)
- `BACKEND` affected → **backend-developer** (Fastify patterns, Drizzle conventions, service layer structure, error handling)
- `TESTS` affected or test coverage gaps expected → **qa-integration-tester** (unit/integration test quality, coverage) + **e2e-test-engineer** (Playwright patterns, page objects, viewport coverage)
- `DOCS` affected → **docs-writer** (Docusaurus conventions, content accuracy, cross-references)

Each agent receives:

- The PR number and URL
- The list of changed files relevant to their domain
- Instruction to post a `gh pr review` with their findings

### 4. Aggregate Reviews

After all agents complete, fetch all reviews:

```bash
gh api repos/steilerDev/cornerstone/pulls/<pr-number>/reviews
```

Parse each review to determine the agent's verdict (`approve`, `request-changes`, or `comment`) and summarize their findings.

**Determine overall verdict:**

- **BLOCK**: any agent posted `request-changes`
- **APPROVE**: all agents approved or commented

### 5. Verdict Action

#### If BLOCK

Post a consolidated `gh pr review --request-changes` comment on the PR listing all blocking findings grouped by agent. Include specific file references and remediation guidance from each agent's review.

Present the blocking findings to the user. **Do NOT wait for CI.**

#### If APPROVE

Post a consolidated `gh pr review --approve` comment on the PR summarizing the review outcome.

**Wait 5 seconds**, then check mergeability: `gh pr view <PR> --repo steilerDev/cornerstone --json mergeable -q '.mergeable'`. **Only continue if `MERGEABLE`.** If `CONFLICTING`, report the conflict to the user — do not attempt to resolve. Once mergeability is confirmed, wait for CI using the **CI Gate Polling** pattern from `CLAUDE.md` (use the beta or main variant based on the PR's target branch).

If CI fails, report the specific failures to the user. **Do NOT merge.**

### 6. User Report

Present to the user:

1. **Agent Review Summary** — the table from Step 4
2. **Independent Behavior Change Summary** — read the diff stored from Step 1 and describe what actually changed in user-visible terms, independent of the PR description or changelog. Flag any discrepancies between what the PR claims to do and what the code actually does.
3. **CI Status** — pass/fail for each required check (`Quality Gates`, `Docker`, `Merge E2E Reports`), or "skipped" if review was blocked
4. **Overall Verdict** — `APPROVED` or `BLOCKED` with specific next steps:
   - If approved: user can merge at their discretion (`gh pr merge --squash <pr-number>`)
   - If blocked: list what the contributor needs to fix, suggest re-running `/review-pr <number>` after fixes are pushed

**The orchestrator never merges.** The user decides when to merge.


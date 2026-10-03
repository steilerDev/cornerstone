---
sidebar_position: 5
title: CI & Guardrails
---

# CI & Guardrails

Quality and consistency are enforced through multiple layers: automated CI checks, trailer verification, lint and format enforcement, branch protection, and an isolated execution environment with clear restrictions.

## Quality Gates (All PRs)

Every PR targeting `beta` or `main` must pass these automated checks:

### Lint & Format

- **ESLint**: Zero errors (warnings fail the gate). Covers TypeScript files under `client/`, `server/`, `shared/`, and `e2e/`
- **Prettier**: Format check passes. Auto-fixable with `npm run format`
- **Stylelint**: CSS modules adhere to token usage. Auto-fixable with `npm run lint:fix`

### Type Safety

- **TypeScript**: Full type-checking across all packages. Must compile without errors.

### Build Verification

- **Build**: Full application build succeeds: `shared` → `client` → `server` (in order)
- **Docker**: Dockerfile builds successfully with DHI Alpine base image

### Test Coverage

- **Unit & Integration Tests** (Jest): 6 runtime-balanced shards
  - Target: **95%+ coverage** on all new and modified code
  - Coverage reports uploaded to CI artifacts
  - Timeout: 5 seconds per test (performance issues fail the gate)

### End-to-End Smoke Tests

- **E2E Smoke** (Playwright): Desktop Chromium only. Full 16-shard × 3-viewport suite runs in the background for visibility.

### Trailer Check

- **Commits on production files** (`server/`, `client/`, `shared/`, `e2e/`) must include appropriate `Co-Authored-By` trailers
- Uses `scripts/check-trailers.sh` to verify agents who touched each file
- Blocks PRs with missing trailers (e.g., a commit that modifies `server/` must list `backend-developer`)

## E2E Gates (Main Only)

PRs targeting `main` must additionally pass:

- **All 16 E2E shards × 3 viewports**: Desktop, tablet, and mobile
- **Fail-fast enabled**: First non-recoverable failure stops the shard and cancels remaining shards
- **Timeout**: 15 minutes per shard

This extra rigor on `main` ensures stable releases.

## Branch Protection Rules

Both `main` and `beta` have the following branch protection rules:

- **Pull requests required**: No direct pushes to either branch
- **Required status checks**: Quality Gates (all PRs), E2E Gates (main only)
- **Force pushes and deletions blocked**

## Trailer Verification and Enforcement

Agent attribution is enforced at three layers:

### 1. Pre-Commit Hook (`scripts/hooks/bash-guard.mjs`)

A `PreToolUse` bash hook runs before every git command:

- **Blocks pushes to `main` or `beta`** (must use feature branch + PR)
- **Blocks pushes of `worktree-*` branches** (rename before pushing)
- **Pre-checks commit trailers** at commit time
  - If staged files require agent trailers (per Delegation Enforcement rules), the commit message must include them
  - Commits with no Claude trailer are treated as human-authored and skipped

This prevents accidental violations from reaching GitHub.

### 2. CI Trailer Check Job

The `trailer-check` job in CI runs `scripts/check-trailers.sh`:

- Verifies all commits in the PR carry required agent trailers for the files they changed
- Runs on all PRs touching production code (server/, client/, shared/, e2e/)
- Blocks merge if trailers are missing or incorrect

### 3. Orchestrator Pre-Merge Verification

Before merging, the orchestrator runs `scripts/check-trailers.sh` over the PR's commit range. Commits with missing trailers are rejected and re-committed with the correct ones. The squash merge itself goes through `scripts/squash-merge.sh`, which carries every agent trailer over into the final commit.

## Coverage Enforcement

Target: **95%+ coverage** on all new and modified code.

Three mechanisms enforce this:

- **CI Coverage Reports**: 6 Jest shards upload coverage artifacts (retained 30 days). Inspect via the CI run for per-file percentages.
- **Test File Parity**: Dev-team-lead rejects production files without corresponding test files (exceptions: type-only files, re-export barrels, configs).
- **QA Pre-Commit Validation**: QA integration tester runs `npx jest path/to/file.test.ts --coverage` before committing.

## Docker Sandbox Isolation

Agents run inside [Docker Sandboxes](https://docs.docker.com/ai/sandboxes/) rather than directly on the host:

- **Contained workspace**: An agent sees the project it was started for, not the rest of the host machine
- **Network policy**: Outbound traffic is default-deny; hosts must be explicitly allowed, and new hosts require an approval from the human
- **Credential injection**: GitHub credentials are injected by the sandbox proxy at the network level, so agents never handle the token itself

This limits the blast radius if an agent misbehaves or tries to circumvent restrictions (a genuine risk with capable LLMs). An agent cannot accidentally break the host or other work.

## Git Worktrees and Parallel Development

Multiple development sessions run in parallel using git worktrees:

- Each session works in its own worktree and branch, isolated from the base checkout and from other sessions
- Sessions rebase onto `beta` at start and never edit the base checkout directly
- Critical for throughput: while one session waits for CI, another can start on the next story

Worktrees are cleaned up after work completes via `bash scripts/worktree-done.sh <path>`.

## Dependabot Security Alerts

Dependabot submits PRs for dependency updates and security alerts:

- The `/dependabot` skill processes the queue
- Reviews changelogs for breaking changes and security implications
- Merges or requests fixes
- Zero known fixable CVEs in production (runtime image) dependencies; dev and docs tooling residuals are accepted when the only fix is a downgrade or brittle pinning

## Dependency Policy

- **Pin versions**: Exact versions (`1.2.3`), not caret ranges (`^1.2.3`)
- **No native frontend binaries**: Tools like esbuild, SWC, and Tailwind v4 ship platform-specific binaries that fail in certain environments. Use pure JavaScript alternatives (Webpack, Babel, PostCSS, CSS Modules)
- **Lockfile regeneration**: After `package.json` changes, run full `npm install` (not `npm install --package-lock-only`) to ensure correct hoisting

## Performance Budgets

- **Jest shard test timeout**: 5 seconds per test
  - A slow test is a performance bug
  - Profile with `node --cpu-prof` instead of raising timeout
  - Shard imbalance due to slow test file? Refresh jest-timings.json via `node scripts/update-jest-timings.mjs <run-id>`

## Learn More

- [PR Review and Workflow](workflow) -- Review gate and verdict policy
- [Skills](skills) -- CI gate polling via `scripts/ci-wait.sh`
- [Agent Team](agent-team) -- Agent attribution and trailers
- [CLAUDE.md](https://github.com/steilerDev/cornerstone/blob/main/CLAUDE.md) -- Full CI and enforcement details

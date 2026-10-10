# Cornerstone - Project Guide

## Project Overview

Cornerstone is a web-based home building project management application designed to help homeowners manage their construction project. It tracks work items, budgets (with multiple financing sources and subsidies), timelines (Gantt chart), and household item purchases.

- **Target Users**: 1-5 homeowners per instance (self-hosted)
- **Deployment**: Single Docker container with SQLite
- **Requirements**: GitHub Issues (epics and stories) are the source of truth for current requirements. `plan/REQUIREMENTS.md` is the historical founding requirements document — consult it for original intent only.

## Agent Team

This project uses a team of 11 specialized Claude Code agents defined in `.claude/agents/`. Models are the `haiku`/`sonnet`/`opus` aliases (they resolve to the latest model of that tier); spend follows judgment density — opus for spec/verdict/design reasoning, haiku for mechanical roles:

| Agent                   | Model  | Role                                                                                                                           |
| ----------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `product-owner`         | sonnet | Defines epics, user stories, and acceptance criteria; manages the backlog                                                      |
| `product-architect`     | opus   | Tech stack, schema, API contract, project structure, ADRs, Dockerfile                                                          |
| `ux-designer`           | sonnet | Design tokens, brand identity, component styling specs, dark mode, accessibility                                               |
| `dev-team-lead`         | opus   | Spec-writer, reviewer, and committer: decomposes work into implementation specs, reviews agent output, commits and creates PRs |
| `backend-developer`     | sonnet | API endpoints, business logic, auth, database operations (launched by orchestrator with dev-team-lead specs)                   |
| `frontend-developer`    | sonnet | UI components, pages, interactions, API client (launched by orchestrator with dev-team-lead specs)                             |
| `translator`            | haiku  | Non-English translations, glossary enforcement (launched by orchestrator with dev-team-lead Translator Specs)                  |
| `qa-integration-tester` | sonnet | Unit test coverage (95%+ target), integration tests, performance testing, bug reports                                          |
| `e2e-test-engineer`     | sonnet | Playwright E2E browser tests, page objects, smoke tests, responsive testing, dependent system integration testing              |
| `security-engineer`     | sonnet | Security audits, vulnerability reports, remediation guidance                                                                   |
| `docs-writer`           | haiku  | Documentation site (`docs/`), lean README.md, user-facing guides after UAT approval                                            |

### Agent Context Discipline

Agent context is the dominant cost of a development cycle — scale it to the task, never to a ritual:

- **The orchestrator syncs the wiki once per skill run** (`git submodule update --init wiki && git -C wiki pull origin master`). Agents never run the sync themselves.
- **Read sections, not documents.** `wiki/API-Contract.md` and `wiki/Schema.md` are thousands of lines — grep/search for the endpoints, tables, or components your task touches and read those sections only. Never read either file whole.
- **Scale reading to task size.** S-sized items need the issue, the spec, and the affected files — nothing else. Reserve broad context reads (architecture pages, style guide, existing test suites) for M/L work that genuinely spans layers.
- **Specs carry the context.** When launched with a dev-team-lead spec, the spec plus its listed reference files is your context — do not re-derive it from the wiki.

## GitHub Tools Strategy

| Concern                                                  | Tool                                             |
| -------------------------------------------------------- | ------------------------------------------------ |
| Backlog, epics, stories, bugs                            | **GitHub Projects** board + **GitHub Issues**    |
| Architecture, API contract, schema, ADRs, security audit | **GitHub Wiki**                                  |
| Code review                                              | **GitHub Pull Requests**                         |
| Source tree                                              | Code, configs, `Dockerfile`, `CLAUDE.md` only    |
| User-facing docs site                                    | **`docs/` workspace** (Docusaurus, GitHub Pages) |

The GitHub Wiki is checked out as a git submodule at `wiki/` in the project root. All architecture documentation lives as markdown files in this submodule. The GitHub Projects board is the single source of truth for backlog management.

### GitHub Wiki Pages (owned by product-architect, except Security Audit and Style Guide)

- **Architecture** — system design, tech stack, conventions
- **API Contract** — REST API endpoint specifications
- **Schema** — database schema documentation
- **ADR Index** — links to all architectural decision records
- **ADR-NNN-Title** — individual ADR pages
- **Security Audit** — security findings and remediation status (owned by `security-engineer`)
- **Style Guide** — design system, tokens, color palette, typography, component patterns, dark mode (owned by `ux-designer`)

### Wiki Submodule

Wiki pages are markdown files in `wiki/`. The orchestrator syncs once per skill run (`git submodule update --init wiki && git -C wiki pull origin master`); agents read the checked-out files directly without re-syncing. See skill files for writing workflows and page naming conventions.

**Wiki Accuracy** (applies to every agent): when reading wiki content, verify it matches the actual implementation. On a deviation: flag it explicitly (PR description or GitHub comment), determine the source of truth (wiki outdated vs code wrong), fix the wiki with a "Deviation Log" entry at the bottom of the affected page, and log it on the relevant GitHub Issue. Never silently diverge from wiki documentation.

### GitHub Repo

- **Repository**: `steilerDev/cornerstone`
- **Default branch**: `main`
- **Integration branch**: `beta` (feature PRs land here; promoted to `main` after epic completion)

### Board & Issue Relationships

The GitHub Projects board uses 5 statuses: Backlog, Todo, In Progress, Done, Wont-Do. All stories must be linked as sub-issues of their parent epic, and dependency relationships must be maintained. **Board status changes go through `bash scripts/board.sh <issue-number> <backlog|todo|in-progress|done|wont-do>`** — the script owns the opaque project/field/option IDs (the only place they live) and adds the issue to the board if it isn't on it yet. GraphQL mutations are still needed for `addSubIssue` and `addBlockedBy` (see `/epic-start`).

## Agile Workflow

**Important: Planning agents run first.** Always launch the `product-owner` and `product-architect` agents BEFORE implementing any code. Planning only needs to run for the first story of an epic — subsequent stories reuse the established plan.

**One user story per development cycle.** Each cycle completes a single story end-to-end (architecture → implementation → tests → PR → review → merge) before starting the next.

**Compact context between stories.** After completing each story (merged and moved to Done), compact context before starting the next. Only agent memory persists between stories.

**Mark stories in-progress before starting work.** When beginning a story, immediately move its GitHub Issue to "In Progress" on the Projects board.

**The orchestrator delegates, never implements.** Must NEVER write production code, tests, or architectural artifacts. Route all work per the Agent Team table above.

### Orchestration Skills

The orchestrator uses the following skills to drive work. Each skill contains the full operational checklist with exact commands and agent coordination.

| Skill            | Purpose                                                                                                                                                                 | Input                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `/epic-start`    | Planning: PO creates stories, architect designs schema/API/ADRs                                                                                                         | Epic description or issue number                                |
| `/develop`       | Full dev cycle for one or more stories/bug fixes, bundled into a single PR                                                                                              | Issue number, description, semicolon-separated list, or `@file` |
| `/epic-close`    | Refinement, E2E validation, UAT, then delegates to `/release`                                                                                                           | Epic issue number                                               |
| `/release`       | Promote `beta` to `main`: sync, PR, CI, approval loop, docs, merge                                                                                                      | Optional epic issue number (standalone if omitted)              |
| `/epic-run`      | Autonomous end-to-end epic: plan, develop all stories, close                                                                                                            | Epic description or issue number                                |
| `/batch-develop` | Sequential development from a list/file: **each item gets its own branch and PR** (not bundled — contrast with `/develop`'s multi-item mode, which bundles into one PR) | Issue number list, or falls back to `/tmp/batch-queue.md`       |
| `/mini-epic`     | Analyze a spec, decompose into 2–6 work items, challenge assumptions with the user, hand off to `/batch-develop`                                                        | Inline spec, `@file`, or issue number                           |
| `/dependabot`    | Process every open Dependabot PR and security alert: changelog review, merge, fix, remediate orphans, implement or report adoptions                                     | None (always processes the full queue)                          |
| `/fix-e2e`       | Iteratively analyze and fix failing E2E tests from a CI run until all shards pass                                                                                       | GitHub Actions run URL or ID                                    |
| `/review-pr`     | Comprehensive full-team review of a PR not created by `/develop` (external contributions, Dependabot, re-reviews)                                                       | PR number                                                       |

See the skill files (`.claude/skills/`) for the full operational checklists. The typical lifecycle is: `/epic-start` (once per epic) → `/develop` (once per story, or batched for multiple small items) → `/epic-close` (once per epic after all stories merged). Alternatively, `/epic-run` chains all three phases in a single session (only pauses for promotion approval). Use `/release` standalone to promote `beta` to `main` without a prior epic definition. `/mini-epic` and `/batch-develop` are the mid-size workflow for cohesive multi-item work that doesn't warrant full epic planning. `/dependabot`, `/fix-e2e`, and `/review-pr` are maintenance/support workflows invoked on demand.

### Skill Task Tracking

Execution skills track their steps with the harness task tools. The standard rules (referenced by each skill as "Standard task-tracking rules"):

- **Create the task list up front** (one task per skill step) before executing step 1, and keep it 1:1 with the skill's step numbering.
- **Mark progress live**: set a task `in_progress` before starting its step and `completed` immediately after finishing it — never batch updates.
- **Recovery**: after context compaction or session resume, call `TaskList` first and continue from the earliest non-completed task instead of restarting the skill.
- **Dynamic tasks**: work discovered mid-skill (fix loops, in-session fix PRs) gets its own task appended at the point of discovery, so the list stays a faithful record.

### Shared Mechanics Scripts

Deterministic git/GitHub mechanics live in `scripts/` — skills and agents call these instead of inlining bash:

| Script                                                 | Purpose                                                                                         |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `scripts/ci-wait.sh <pr> [beta\|main]`                 | Canonical CI-gate wait: mergeability precheck, check-runs polling, timeouts, rate-limit backoff |
| `scripts/board.sh <issue> <status>`                    | GitHub Projects board mutations (owns the board IDs)                                            |
| `scripts/squash-merge.sh <pr> "<subject>" [body-file]` | Squash merge with trailer preservation and skip-ci guard                                        |
| `scripts/worktree-done.sh <path> [branch]`             | End-of-session worktree + branch cleanup (run from the base repo)                               |
| `scripts/check-trailers.sh <base> <head>`              | Trailer verification for a commit range                                                         |
| `scripts/update-jest-timings.mjs <run-id>`             | Refresh `scripts/jest-timings.json` (Jest shard balancing weights) from a CI run's artifacts    |

### Acceptance & Validation

Every epic has two phases: **Development** (`/develop`) where QA and E2E write and run tests for each story and the applicable PR reviewers approve per the **PR Review Gate** below; and **Epic validation** (`/epic-close`) where E2E coverage is confirmed and UAT runs before promotion. The only human gate is `beta` → `main` — the user approves after reviewing the change inventory. Feedback goes to `/tmp/notes.md`; fixes loop autonomously until approved. This is the release/promotion feedback channel specifically — the `/batch-develop` work queue uses a separate file, `/tmp/batch-queue.md`, to avoid the two protocols colliding on one path.

### Key Rules

- **User approval required for promotion** — the user is the final authority on `beta` → `main` promotion
- **Automated before manual** — all automated tests must be green before the user validates
- **Iterate until right** — failed validation triggers a fix-and-revalidate loop (user writes feedback to `/tmp/notes.md`, system fixes autonomously and re-presents)
- **Acceptance criteria live on GitHub Issues** — stored on story issues, summarized on promotion PRs
- **Security review conditional** — the `security-engineer` reviews PRs touching security-relevant files per the **PR Review Gate**; not every story PR requires it (see Security Review Trigger Rules)
- **Test agents own all tests** — `qa-integration-tester` owns unit and integration tests; `e2e-test-engineer` owns Playwright E2E browser tests. Developer agents do not write tests.
- **Flat delegation model** — the orchestrator launches all agents directly. The `dev-team-lead` produces implementation specs, reviews agent output, and handles commits/PR creation. The orchestrator routes specs to `backend-developer`, `frontend-developer`, `translator`, `qa-integration-tester`, and `e2e-test-engineer`.
- **Story sizing (Spec-Lite)** — `dev-team-lead [MODE: spec]` classifies each work item S/M/L. S-sized items (single-file or trivially scoped) get a 5–10 line Spec-Lite and a single implementer plus QA instead of the full multi-agent fan-out; M/L get the full spec pipeline.
- **Continue agents through fix loops** — fix iterations continue the previously launched agent via SendMessage (it keeps the context it built) instead of launching a fresh agent each round.
- **dev-team-lead is launched once per story** — the `[MODE: spec]` launch is the only cold start; all subsequent `[MODE: review]` and `[MODE: commit]` invocations for that story continue the same agent via SendMessage, so it never re-reads the spec, the checklist, or the changed files it already holds.
- **CI is gated once, at merge time** — `[MODE: commit]` ends when the PR exists; reviews run in parallel with CI, and the single `scripts/ci-wait.sh` call happens right before merge.
- **EPIC-21 restructure stories follow extra rules** — capability map, IA placement, single route source, pattern baseline, glossary canon, full E2E gating and no real data; see **UX Restructure Rules (EPIC-21)** below.

### PR Review Gate

Every story/bug PR is reviewed by the applicable subset of:

- `product-architect` — always (architecture compliance, test coverage, code quality). Skipped only when product-architect is the PR's own author.
- `security-engineer` — conditional: only when the PR touches security-relevant files (auth, API routes with data access, Dockerfile, dependency manifests). See Security Review Trigger Rules in `.claude/skills/develop/SKILL.md`. Skipped for frontend-only, test-only, or CSS-only PRs.
- `product-owner` — user-story PRs only (requirements coverage, acceptance criteria). Skipped for bug-only PRs.
- `ux-designer` — only for PRs touching `client/src/` (token adherence, visual consistency, dark mode, accessibility).

All requested reviewers must approve per the Reviewer Verdict Policy below before merge. Reviews start as soon as the PR exists — they run in parallel with CI, not after it.

### Reviewer Verdict Policy

One verdict matrix for all reviewer agents (product-architect, security-engineer, product-owner, ux-designer) — **fix-or-block, no deferrals**: every finding is fixed in the session that found it, and the session ends with no new open issues or PRs.

- **`gh pr review --approve`** — **only with zero findings.** An approval that lists findings is a policy violation.
- **`gh pr review --request-changes`** — **any finding, of any severity** (Critical through Low, nits included), including out-of-scope findings in touched or adjacent code. Label each finding `fix-in-session`. It is fixed in-session: in this PR when it touches this PR's files or their immediate neighbours, otherwise as a **separate fix PR in the same session** that the orchestrator schedules immediately (before the next story or batch item) and drives to merge. A finding that needs a schema change or a new dependency is still fixed in-session — it just goes through the architect first.
- **Never file follow-up, deferral, or "tech-debt later" issues** — this applies to every agent, not just reviewers. There is no "approve and track it in an issue" path. Creating issues remains allowed only for **new work the user asks for** and **bugs the user reports** (e.g. `/develop` description entries, `/release` feedback grouping, `/mini-epic` work items).
- **Findings that need a product decision** (ambiguous requirement, conflicting AC, a trade-off only the user can make) are escalated to the user **in-session** with the options laid out — never filed as an issue for later.
- **Never use `--comment` as a verdict** — with one mechanical exception: GitHub rejects `--approve`/`--request-changes` from the token that authored the PR. When that happens, post the review as a comment whose **first line** is `VERDICT: APPROVE` or `VERDICT: REQUEST_CHANGES`; the orchestrator treats it identically.
- **The external review loop is capped at 2 rounds.** If findings remain after round 2, stop and escalate them to the user in-session instead of looping further — never convert them into issues.

### UX Restructure Rules (EPIC-21)

A **restructure story** is any sub-issue of EPIC-21 (#2190) — list them with `gh api repos/steilerDev/cornerstone/issues/2190/sub_issues --paginate --jq '.[].number'`. Its PR is a **restructure PR**. These rules add to, and where they conflict override, the rest of this file:

- **NavConfig is the only route source.** Navigation (sidebar, phone shell, title menus, command-search destinations) comes from NavConfig (`client/src/navigation/navConfig.ts`), which references route ids (property `route`, never paths) of the shared route map (`shared/src/routes/`, exported from `@cornerstone/shared`). App URLs — client and server (vCard, iCal, OIDC redirects) — are built only with `routeUrl(id, params?, query?)`: no hand-written tab arrays, no string-literal app paths (`client/src/navigation/routeSource.test.ts` fails on them; `/api/…` paths are exempt). A route is added or changed in `shared/src/routes/routeMap.ts` **and** `plan/restructure/routemap.json` in the same PR — `npm run plan:check` fails when they disagree; `client/src/App.tsx` declares pages with `routePattern(id)` and generates redirects from `LIVE_REDIRECT_ROUTES`, never hand-written `<Navigate>` routes. The story that builds a target page flips its route-map `stage` to `done` and deletes `interim` (ADR-038 §2, wiki Route Map › Rollout stage).
- **Capability-map rule.** Each story names the capability ids it touches (in the issue and the PR body) and updates `plan/restructure/capmap.json` (plus `routemap.json` on any route change) in the same PR. Capabilities may be moved, merged or tucked away, never removed; demoted ones stay at most 2 clicks from their object's page (ADR-038 §4–§5). `npm run plan:check` runs on every PR and enforces placement and the click bound for every capability, capmap ↔ inventory consistency, route coverage and drift against `client/src/App.tsx`, the pattern baseline and privacy. It cannot see a removal (a capability deleted from both files, or a permanent route-map entry deleted together with its route), so reviewers check the diffs of `plan/restructure/capabilities.json`, `capmap.json` and `routemap.json` for removed entries.
- **IA placement named per story.** Every touched capability states its placement as `Section › view › surface`, consistent with NavConfig and the route map.
- **Glossary English canon.** English terms in `client/src/i18n/glossary.json` are the canonical UI words: `en` labels use them verbatim, other locales use the approved translation. Retired words survive only as search aliases ("formerly …"). Plain words over jargon — "Gantt" is an alias, never a label.
- **Full E2E gating.** Restructure PRs wait on `bash scripts/ci-wait.sh <pr> main` (Quality Gates + E2E Gates) even though they target `beta`.
- **Pattern baseline.** No count in `plan/restructure/baseline.json` may rise. The dev-team-lead checks it in every `[MODE: review]`; lowered counts, new screens and consumed planned components are re-baselined in the same PR. Glossary exemption (#2192): a new money label equal to an English form of a term in `client/src/i18n/glossary.json` is not a rise — it is reported as "baseline is behind" and recorded by `npm run plan:build` in the same PR.
- **Synthetic fixtures only** — tests, E2E fixtures, seeds, docs screenshots and examples use invented data.
- **No real data in the repo, wiki, issues or PRs.** No real names, phone numbers, e-mail addresses, street addresses, real money figures or real record titles — in code, fixtures, `plan/restructure/`, wiki/ADRs, issue and PR titles/bodies/comments, or commit messages. Quote results and aggregates, never rows. Backups, restore folders and `.mockups/` stay git-ignored. Check text with `node plan/restructure/scripts/scan-privacy.mjs` (`--stdin` for issue/PR text); CI runs the generic profile, and locally `--denylist-db <local backup>` additionally catches real names and amounts.
- **No follow-up issues.** Every finding is fixed in the story that raised it — by reviewers and implementers alike.

### Delegation Enforcement

The orchestrator launches all implementation agents directly using specs produced by the `dev-team-lead`. The dev-team-lead never launches sub-agents — it operates in three modes (spec, review, commit) and never modifies production files.

The orchestrator runs a **trailer verification** after every commit:

1. Commit trailers must include appropriate co-authors for production file changes
2. Files under `server/` or `shared/`, excluding `*.test.ts`/`*.test.tsx` → must have `backend-developer` trailer
3. Files under `client/` (except `client/src/i18n/de/`, `client/src/i18n/glossary.json`, and `*.test.ts`/`*.test.tsx`) → must have `frontend-developer` trailer
4. Files under `client/src/i18n/de/` or `client/src/i18n/glossary.json` → must have `translator` trailer
5. Files under `e2e/` → must have `e2e-test-engineer` trailer
6. Files matching `*.test.ts` or `*.test.tsx` outside `e2e/` (co-located unit/integration tests) → must have `qa-integration-tester` trailer

Commits that change production files without the appropriate co-author trailers (see the Canonical Agent Trailers table below) are rejected and re-committed with corrected trailers.

Production files: any file under `server/`, `client/`, or `shared/`.

### Agent Attribution

All agents must clearly identify themselves:

- **Commits**: `Co-Authored-By: Claude <agent-name> <noreply@anthropic.com>` — the agent name only; trailers carry **no model version** (models are selected via aliases in agent frontmatter and change over time).
- **GitHub comments**: prefix with `**[agent-name]**` (e.g., `**[backend-developer]** This endpoint...`)
- **Orchestrator**: when committing work produced by an agent, use that agent's name in the trailer.

### Canonical Agent Trailers

The canonical trailer is the agent name with **no model version**:

```
Co-Authored-By: Claude <agent-name> <noreply@anthropic.com>
```

e.g. `Co-Authored-By: Claude backend-developer <noreply@anthropic.com>`. Valid `<agent-name>` values are exactly the 11 agents in the Agent Team table. Models are selected via aliases (`haiku`/`sonnet`/`opus`) in each agent's frontmatter and resolve to the latest model of that tier — embedding a version in the trailer only creates drift, so don't. Legacy trailers with a parenthesized model (`Claude backend-developer (Haiku 4.5)`) exist throughout history and remain valid for verification purposes; never write new ones.

## Git & Branching

### Commit Conventions

All commits follow [Conventional Commits](https://www.conventionalcommits.org/):

- **Types**: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `build:`, `ci:`
- **Scope** optional but encouraged: `feat(work-items):`, `fix(budget):`, `docs(adr):`
- **Breaking changes**: Use `!` suffix or `BREAKING CHANGE:` footer
- Every completed task gets its own commit with a meaningful description
- **Link commits to issues**: When a commit resolves work tracked in a GitHub Issue, include `Fixes #<issue-number>` in the commit message body (one per line for multiple issues). Note: `Fixes #N` only auto-closes issues when the commit reaches `main` (not `beta`).
- **Always commit, push to a feature branch, and create a PR after work is complete.** Do not leave work uncommitted or unpushed. Never push directly to `main` or `beta`.

### Branching Strategy

**Never commit directly to `main` or `beta`.** All changes go through feature branches and pull requests.

- **Branch naming**: `<type>/<issue-number>-<short-description>` (e.g., `feat/42-work-item-crud`, `fix/55-budget-calc`)
- **Never push a `worktree-<anything>` branch.** Sessions run in git worktrees with auto-generated branch names. Before pushing, always rename the branch to match the naming convention above: `git branch -m <type>/<issue-number>-<short-description>`. If the scope of work is not yet clear, determine it before pushing — do not publish placeholder branch names.

### Session Isolation (Worktrees)

**Sessions run in git worktrees.** The user starts each session in a worktree manually.

**Rebase onto `beta` at session start.** Worktrees are created from `main`. Before doing any work in a fresh session, rebase to `beta`: `git rebase origin/beta`. Skip only if the branch is already based on `beta`.

**NEVER `cd` to the base project directory to modify files.** All file edits, git operations, and commands must be performed from within the git worktree assigned at session start. The base project directory may have other sessions' uncommitted changes. This applies to subagents too — all file reads, writes, and exploration must use the worktree path.

**Agent-memory updates must be committed from session worktrees.** Never leave `.claude/agent-memory/` edits uncommitted in the base checkout — commit them as part of the session's own PR (riding along with the production-code changes), matching current practice.

**Clean up worktrees when work is complete.** Once a session's work is finished — its PR is merged (or the work is deliberately abandoned) and the worktree has no uncommitted changes — run `bash scripts/worktree-done.sh <path> [branch]` from the base repository. It refuses dirty worktrees, handles the wiki-submodule removal quirk, and deletes the local branch only when a merged PR exists (squash merges make `-d` refuse, so it uses `-D` behind that check). Never remove a worktree another active session may be using — when in doubt, leave it and note it for manual cleanup.

### Release Model

Cornerstone uses a two-tier release model:

| Branch | Purpose                                                 | Release Type                            | Docker Tags              |
| ------ | ------------------------------------------------------- | --------------------------------------- | ------------------------ |
| `beta` | Integration branch — feature PRs land here              | Beta pre-release (e.g., `1.7.0-beta.1`) | `1.7.0-beta.1`, `beta`   |
| `main` | Stable releases — `beta` promoted after epic completion | Full release (e.g., `1.7.0`)            | `1.7.0`, `1.7`, `latest` |

**Merge strategies:**

- **Feature PR -> `beta`**: Squash merge (clean history)
- **`beta` -> `main`** (epic promotion): Merge commit (preserves individual commits so semantic-release can analyze them)

- **Hotfixes:** Cherry-pick any `main` hotfix back to `beta` immediately. See `/release` for merge-back, release summary, and DockerHub sync details.

### Branch Protection

Both `main` and `beta` require PRs with passing `Quality Gates`. `main` additionally requires `E2E Gates`. Force pushes and deletions are blocked on both branches.

Full E2E tests (16 shards × 3 viewports) run on all PRs for visibility. `Quality Gates` covers ESLint (zero warnings), the Prettier format check, typecheck, Stylelint, build, unit tests, Docker build, and E2E smoke tests — ESLint and the format check run on every PR regardless of path filter — it does **not** wait for full E2E shards, so beta PRs can merge quickly. `E2E Gates` is a separate required check on `main` only — it waits for all E2E shards and blocks promotion if any fail. On `main`-targeted PRs, E2E shards also use fail-fast: the first non-recoverable failure stops the shard (`maxFailures: 1`) and cancels remaining shards.

### Local Validation Policy

**Before handing back to the dev-team-lead, implementing agents MUST run lint and format and verify they are clean:**

```bash
npm run lint:fix    # auto-fix all fixable issues
npm run format      # apply Prettier formatting
npm run lint        # must report zero warnings or errors (CI-enforced)
```

If `npm run lint` still reports warnings or errors after auto-fix, they must be resolved before handback. Repo-wide `npm run format` is drift-free (`wiki/` is Prettier-ignored). The dev-team-lead validates lint cleanliness as part of `[MODE: review]` — work with outstanding lint issues is returned for fixes.

**Do NOT run `npm test`, `npm run typecheck`, or `npm run build` manually.** CI Quality Gates (typecheck + test + build) run on every PR and own full validation.

To validate your work: **commit and push**. After pushing, **always wait for the required CI gates to pass** before proceeding to the next step. When running tests locally: only run specific files (`npx jest path/to/specific.test.ts --maxWorkers=1`), never the full suite — the sandbox is resource-constrained and CI owns full validation.

The only exception is the QA agent running a specific test file it just wrote (e.g., `npx jest path/to/new.test.ts`) to verify correctness before committing — but never `npm test` (the full suite).

### CI Gate Polling (canonical pattern)

**Use `bash scripts/ci-wait.sh <pr-number> [beta|main]`** — the single canonical CI wait. It performs the mergeability precheck (CI may not run, or silently hang, on a conflicted PR), then polls the required gate checks (`Quality Gates` on beta PRs, plus `E2E Gates` on main PRs) with timeouts (600s / 900s, override via `CI_WAIT_TIMEOUT=<seconds>`) and rate-limit backoff.

**CI is gated once per PR, at merge time.** Reviews and CI run in parallel after the PR is created; the single `ci-wait.sh` call happens right before merging. Do not wait for CI before starting reviews, and do not re-wait on a SHA that already passed.

Do **not** hand-roll polling loops, and do **not** use `gh pr checks --watch` or `gh pr checks --json` — neither works with this repo's GitHub Rulesets setup (`--json` silently returns nothing). The script polls the commit check-runs API (`gh api repos/<repo>/commits/<sha>/check-runs`) instead, which is the reliable source.

If the script reports `CONFLICTING`, rebase onto the target branch, force-push, and re-run it. If it times out with **no check-runs at all**, suspect a `[skip ci]` directive on the head commit (see CI Skip-Directive Quirks below).

### CI Skip-Directive Quirks (two failure modes when CI stops firing)

A GitHub Actions quirk can leave a PR `MERGEABLE` but `BLOCKED` because the required `Quality Gates` / `E2E Gates` checks did not run on the current HEAD. Diagnose with `gh pr view <PR> --json mergeable,mergeStateStatus,headRefOid` (state `BLOCKED`/`MERGEABLE`) and `gh api repos/steilerDev/cornerstone/commits/<sha>/check-runs` (empty or missing the required check names).

**Squash title containing a `[skip ci]` directive**

GitHub Actions parses **any commit's first line** for `[skip ci]` (and equivalents: `[ci skip]`, `[skip actions]`, `[actions skip]`, `[skip-checks: true]`). When a PR's title or body intentionally references `[skip ci]` (e.g., a docs PR explaining the directive), the squash-merge to `beta` picks up that title as the merged commit's first line. The directive then suppresses **all** workflows that would otherwise fire on that push, including `pull_request:synchronize` runs on any open `beta -> main` PR — the promotion PR is blocked.

Detect: head commit's first line literally contains `[skip ci]`; `gh run list --commit <sha>` is empty.

**Prevention:** `scripts/squash-merge.sh` refuses subjects containing a skip directive — always merge through it with a clean subject. Likewise, do not include `[skip ci]` (or equivalents) verbatim in PR titles — reference them with code spans (`` `[skip ci]` ``) or rewrite as "the CI-skip directive".

**Recovery if it already happened:** push another commit to `beta` via a fresh tiny PR with a clean title (e.g., `chore: retrigger promotion CI`). That advances HEAD with a clean message, fires `pull_request:synchronize` on the promotion PR, and CI runs normally.

### Squash-Merge Trailer Preservation (canonical pattern)

GitHub's default `--squash` merge body varies with commit count and shape and cannot be relied on
to preserve agent trailers. **Every squash merge goes through
`bash scripts/squash-merge.sh <pr-number> "<subject>" [body-file]`**, which rebuilds the squash
commit's subject and body explicitly: it collects `Co-Authored-By:` trailers from all of the PR's
commits, normalizes label casing, deduplicates, appends them under the body, and refuses subjects
containing a CI-skip directive.

Write the body (1–3 summary bullets plus `Fixes #<issue-number>` lines) to a temp file and pass it
as the third argument.

**Note**: this only applies to squash merges carrying agent trailers. It does not apply to the
`beta` → `main` promotion merge (`gh pr merge --merge`), which preserves individual commits (and
their trailers) natively by design — see the Release Model table above.

### Trailer Verification Script

`scripts/check-trailers.sh <base-ref> <head-ref>` is the single source of truth for "does this
commit range carry the trailers CLAUDE.md's Delegation Enforcement rules require." It is used in
two places:

1. **`/develop` step 6h / step 9** (orchestrator, before merging) — run it directly instead of
   hand-checking with grep.
2. **CI's `trailer-check` job** (automated, on every PR touching production paths, including `e2e/`) — see
   `.github/workflows/ci.yml`.

Detection inside the script is case-insensitive and accepts both the current de-versioned trailer
form (`Claude <agent> <noreply@anthropic.com>`) and the legacy parenthesized-model form
(`Claude <agent> (Model X.Y) <noreply@anthropic.com>`) so history-spanning ranges still verify.
Writing trailers is always the canonical de-versioned form. The rules apply only to files changed
by non-merge commits that themselves carry a Claude agent trailer — files changed solely by commits
without one (human edits, or Dependabot bumps aggregated into a `beta` → `main` promotion PR) are not
subject to them, while a required trailer on any commit in the range still satisfies a rule.

### Enforcement Hooks

`.claude/settings.json` registers a `PreToolUse` hook on the Bash tool
(`scripts/hooks/bash-guard.mjs`) that enforces two rules at the harness level:

1. **Protected pushes are blocked** — `git push` targeting `main`/`beta`, and any push of a
   `worktree-*` branch, is rejected before it runs.
2. **Trailer pre-check on commit** — when staged files require agent trailers per Delegation
   Enforcement rules 2–6, a `git commit` whose message misses a required trailer is rejected at
   commit time (mirrors `scripts/check-trailers.sh`; commits with no Claude trailer at all are
   treated as human-authored and skipped, matching CI).

### GitHub Rate-Limit Retry Policy

When `gh` or `git push` commands fail with a GitHub rate-limit error (primary API limit, secondary abuse limit, or `HTTP 403`/`HTTP 429` with a rate-limit message), retry with **exponential backoff** instead of aborting:

- Detect: stderr contains `rate limit`, `secondary rate limit`, `abuse detection`, `was blocked`, `HTTP 403`, or `HTTP 429`
- Backoff schedule: 30s → 60s → 120s → 240s → 480s (cap 480s, max 6 attempts)
- Honor `Retry-After` / `X-RateLimit-Reset` headers when present (use the larger of the header value and the current backoff step)
- Only retry transient rate-limit failures. Permission errors, merge conflicts, and other non-transient failures must not be retried
- Log each retry attempt with its wait duration so the user can see progress

`scripts/ci-wait.sh` implements this backoff for CI-gate polling; apply the same policy manually for other `gh` operations.

## Tech Stack

| Layer                      | Technology              | Version           | ADR     |
| -------------------------- | ----------------------- | ----------------- | ------- |
| Server                     | Fastify                 | 5.x               | ADR-001 |
| Client                     | React                   | 19.x              | ADR-002 |
| Client Routing             | React Router            | 7.x               | ADR-002 |
| Database                   | SQLite (better-sqlite3) | --                | ADR-003 |
| ORM                        | Drizzle ORM             | 0.45.x            | ADR-003 |
| Bundler (client)           | Webpack                 | 5.x               | ADR-004 |
| Styling                    | CSS Modules             | --                | ADR-006 |
| Testing (unit/integration) | Jest (ts-jest)          | 30.x              | ADR-005 |
| Testing (E2E)              | Playwright              | 1.63.x            | ADR-005 |
| Language                   | TypeScript              | ~6.0              | --      |
| Runtime                    | Node.js                 | 24 LTS (>= 24.11) | --      |
| Container                  | Docker (DHI Alpine)     | --                | --      |
| Monorepo                   | npm workspaces          | --                | ADR-007 |

Full rationale for each decision is in the corresponding ADR on the GitHub Wiki.

## Project Structure

```
cornerstone/
  package.json              # Root workspace config, shared dev dependencies
  CLAUDE.md                 # This file
  Dockerfile                # Multi-stage Docker build
  plan/                     # Requirements document
    restructure/            # EPIC-21 capability map, route map, pattern baseline + plan:check scripts
  wiki/                     # GitHub Wiki (git submodule) — architecture, ADRs, API contract
  shared/                   # @cornerstone/shared — TypeScript types
    src/types/              # API types, entity types
  server/                   # @cornerstone/server — Fastify REST API
    src/
      routes/               # Route handlers by domain
      plugins/              # Fastify plugins (auth, db, etc.)
      services/             # Business logic
      db/schema.ts          # Drizzle schema definitions
      db/migrations/        # SQL migration files
  client/                   # @cornerstone/client — React SPA
    src/
      components/           # Reusable UI components
      pages/                # Route-level pages
      hooks/                # Custom React hooks
      lib/                  # Utilities, API client
  e2e/                      # @cornerstone/e2e — Playwright E2E tests
    containers/             # Testcontainers setup
    fixtures/               # Test fixtures and helpers
    pages/                  # Page Object Models
    tests/                  # Test files by feature/epic
  docs/                     # @cornerstone/docs — Docusaurus site
    src/                    # Markdown content (guides, getting-started, development)
```

## Dependency Policy

- **Always use the latest stable (LTS if applicable) version** of a package when adding or upgrading dependencies
- **Pin dependency versions to a specific release** — use exact versions rather than caret ranges (`^`) to prevent unexpected upgrades
- **Avoid native binary dependencies for frontend tooling.** Tools like esbuild, SWC, Lightning CSS, and Tailwind CSS v4 (oxide engine) ship platform-specific native binaries that crash on ARM64 emulation environments. Prefer pure JavaScript alternatives (Webpack, Babel, PostCSS, CSS Modules). Native addons for the server (e.g., better-sqlite3) are acceptable since the Docker builder can install build tools. esbuild has been fully eliminated from the dependency tree.
- **Zero known fixable vulnerabilities in the runtime image.** Run `npm audit --omit=dev` before committing dependency changes. It covers the npm packages that ship: the Dockerfile installs with `npm ci --omit=dev`, `client` `dependencies` are both bundled into `client/dist` and installed in the image, and `docs/` and `e2e/` declare only devDependencies. This holds only while every package imported by shipped code (`server/src`, `shared/src`, non-test `client/src`) is declared in that workspace's `dependencies` — webpack bundles whatever client code imports regardless of dependency type, so an undeclared or devDependency import ships unaudited. Base-image OS packages are outside `npm audit` and covered by the Docker Scout scan in `release.yml`. It must report 0, and any fixable runtime vulnerability is resolved in-session (bump, or a range-scoped `overrides` entry).
- **Non-runtime vulnerabilities may be accepted.** Dev tooling, test, release and docs packages (anything excluded by `--omit=dev`) may carry known vulnerabilities when the only fix would cost capability or stability: a downgrade (e.g. `npm audit fix --force` proposing an older major), or complex, brittle override/pinning chains. Fix them when a clean path exists: a normal in-range or latest-version bump, or a single simple override. Otherwise record the residual in the PR or report, and the matching Dependabot alert may be dismissed as `tolerable_risk` with user approval. Never weaken a runtime package to fix a dev-only finding.
- **Always regenerate the lockfile with `npm install`, not `npm install --package-lock-only`** — `--package-lock-only` can silently nest a dependency under a workspace directory instead of hoisting it to the root `node_modules/`, breaking TypeScript type resolution for other workspace consumers. After any `package.json` edit, run a full `npm install` to produce a correct lockfile.
- **Root hoisting anchors for CLI-loaded tools.** `webpack-cli` resolves `webpack` and `webpack-dev-server`, and `babel-loader` resolves its `@babel/core` peer, from their own root-hoisted location. So whenever the root slot holds a different version than the workspace pins (a different major forced by `docs/` (Docusaurus), or just a different minor), the workspace's nested copy is never used. Declare the workspace's exact version as a **root devDependency** too (currently `webpack`, `webpack-dev-server`, `@babel/core`), keep it identical to the workspace pin, and range-scope any root override (`pkg@>=X <Y`) so it never matches the anchored major. CI's `check-single-dep-version.sh konva webpack` step enforces the `webpack` anchor. `webpack-dev-server` and `@babel/core` intentionally keep a second, nested copy (Docusaurus and Jest stay on the old major).
- **Node engine floor `>=24.11.0`** (Babel 8 requires `^22.18.0 || >=24.11.0`; the project is 24-only). Root `engines` declares it and the Dockerfile's `npm ci --engine-strict` enforces it. `.nvmrc` and the Docker base tags stay at the bare major `24`, which floats to the latest 24.x; pinning a minor would freeze or downgrade it.
- **Accepted `npm ls` residual (Babel 8, #1823).** Jest's `babel-preset-current-node-syntax` depends on 15 `@babel/plugin-syntax-*@7` packages with peer `@babel/core ^7`, and no 8.x of them will ever exist. With the root `@babel/core@8` anchor, every `npm install`/`npm ci` prints 15 `ERESOLVE overriding peer dependency` warnings, and any `npm ls` that reaches `@babel/core` (including `npm ls --all`) exits 1 with exactly one problem, `invalid: @babel/core@8.x …/node_modules/@babel/core`. This is runtime-harmless: Jest transforms with ts-jest, and its Babel internals keep a nested core 7. Never treat that exit code alone as a failure. To sweep for _new_ invalid edges, run `npm ls --all 2>&1 | grep -oE '"[^"]+" from [^ ,]+' | sort -u | grep -v 'from node_modules/babel-preset-current-node-syntax/node_modules/@babel/plugin-syntax-'`. It must print nothing. Remove this bullet once Jest drops those 7.x syntax plugins.
- **Accepted `npm audit` residual (bundled in `npm`).** `semantic-release` → `@semantic-release/npm` (`npm ^11.6.2`) installs the `npm` package, which _bundles_ `brace-expansion@5.0.9`, `ip-address@10.5.0` and `undici@6.28.0` (`inBundle`, under `node_modules/npm/node_modules/`). These match GHSA-q2hr-2g5m-vwhr / -qhr7-859c-m2p7 / -6j4f-fj2g-mc7p (brace-expansion <5.0.12), GHSA-rpw4-54j3-4h4q / -2vr4-cq9g-pvrc / -j6r3-76f7-8jcv / -h3mg-xc3c-68pw (ip-address <=10.7.0) and GHSA-3wwx-pv8p-q78v / -r53p-7pc4-xj5r / -rfgv-xxqx-mfg5 (undici <6.28.1). `overrides` cannot reach bundled deps, and as of 2026-10-01 no npm release bundles fixed versions (checked 11.19.1, 11.20.0, 11.21.0 and latest 12.2.0 with `npm pack`); `semantic-release` 25.0.9 and `@semantic-release/npm` 13.2.0 are already latest. They are an accepted non-runtime residual under the rule above: they can't be fixed in-repo, and the code is the release-time `npm` CLI, never shipped in the Docker image. Re-check on each `/dependabot` run: `npm pack npm@<latest in @semantic-release/npm's range>` and read the three bundled `package.json` versions; when a fixed npm ships, move the root `npm@…` override to it and delete this bullet.

## Coding Standards

### Naming Conventions

| Context                        | Convention                   | Example                                     |
| ------------------------------ | ---------------------------- | ------------------------------------------- |
| Database columns               | snake_case                   | `created_at`, `budget_category_id`          |
| TypeScript variables/functions | camelCase                    | `createdAt`, `getBudgetCategory`            |
| TypeScript types/interfaces    | PascalCase                   | `WorkItem`, `BudgetCategory`                |
| File names (TS modules)        | camelCase                    | `workItem.ts`, `budgetService.ts`           |
| File names (React components)  | PascalCase                   | `WorkItemCard.tsx`, `GanttChart.tsx`        |
| API endpoints                  | kebab-case with /api/ prefix | `/api/work-items`, `/api/budget-categories` |
| Environment variables          | UPPER_SNAKE_CASE             | `DATABASE_URL`, `LOG_LEVEL`                 |

### TypeScript

- Strict mode enabled (`"strict": true` in tsconfig)
- Use `type` imports: `import type { Foo } from './foo.js'` (enforced by ESLint `consistent-type-imports`)
- ESM throughout (`"type": "module"` in all package.json files)
- Include `.js` extension in import paths (required for ESM Node.js)
- No `any` types without justification (ESLint `@typescript-eslint/no-explicit-any` warns, and CI fails on any warning)
- Prefer `interface` for object shapes, `type` for unions/intersections

### Linting & Formatting

- **ESLint**: Flat config (`eslint.config.js`), TypeScript-ESLint rules, React plugin for client code
- **Prettier**: 100 char line width, single quotes, trailing commas, 2-space indent
- Run `npm run lint` to check, `npm run lint:fix` to auto-fix
- Run `npm run format` to format, `npm run format:check` to verify

### API Conventions

- All endpoints under `/api/` prefix
- Standard error response shape:
  ```json
  { "error": { "code": "MACHINE_READABLE_CODE", "message": "Human-readable", "details": {} } }
  ```
- HTTP status codes: 200 (OK), 201 (Created), 204 (Deleted), 400 (Validation), 401 (Unauthed), 403 (Forbidden), 404 (Not Found), 409 (Conflict), 500 (Server Error)

### Component Reuse Policy

Before creating a new UI component, check if an existing shared component can be used or extended. The shared component library lives in `client/src/components/` and shared styles in `client/src/styles/shared.module.css`.

**Shared components** (must be used instead of creating alternatives):

- `Badge` — status indicators, severity badges, outcome badges (parameterized by variant map). Status chips get their colour only from the shared `useStatusBadgeVariants` hook (`client/src/hooks/`), built on `client/src/components/Badge/statusBadgeVariants.tsx` (one variant map per status vocabulary) — no local status colour maps and no per-page status CSS classes.
- `SearchPicker` — search-as-you-type dropdowns for entity selection (work items, household items, etc.)
- `Modal` — dialog overlays with backdrop, escape key, focus management
- `Skeleton` — loading placeholder with configurable line count
- `EmptyState` — empty data display with icon, message, and optional action
- `FormError` — consistent error banner and field-level error display
- `Breadcrumbs` — location trail of a page's parents plus the "Back to ‹origin›" link; renders anchors via `useHref` + `useLinkClickHandler`, never a react-router `Link`. Pages use it through `navigation/PageBreadcrumbs` (parents from the route map and NavConfig, origin from router state via `readOrigin`), together with `useDocumentTitle` for the tab title (wiki Architecture › Page identity).
- `InfiniteScrollFooter` — scroll-driven batch loading footer: sentinel, loading/error/end-of-list states, load-more/retry button; parameterized by label props and `testIdPrefix`, no hardcoded namespace. Paired with the `useInfiniteScroll` hook (`client/src/hooks/`), which owns the `IntersectionObserver`/state-machine logic, and the `useInfiniteScrollAnnouncements` hook (`client/src/hooks/`), which owns the live-region announcement bookkeeping.
- `SpotThumbnail` — photo-spot thumbnail link with count overlay and date (`cell`/`card` variants), or a dashed empty placeholder; all text via props, parameterized by `testId`
- `FilterChipGroup` — pick-one chip group (`aria-pressed` toggle buttons, horizontally scrollable); parameterized by `options`/`ariaLabel`/`testIdPrefix`
- `FileList` — list of generated files with a per-file action, status badges and a detail line; all strings come from props, `testIdPrefix` parameterized (used by the report wizard's multi-PDF step)

**Rules:**

1. New UI that resembles an existing shared component MUST use or extend that component
2. If a shared component doesn't quite fit, extend it with new props — don't create a parallel implementation
3. **Every new component must be built as a reusable shared component** — no one-off implementations. If a UI pattern doesn't fit an existing shared component, create a new shared component in `client/src/components/` that can be reused by future features
4. New shared components require UX designer visual spec approval
5. All CSS values must use design tokens from `tokens.css` — no hardcoded colors, spacing, radii, or font sizes
6. Stylelint enforces token usage automatically (via `npm run lint` locally and the CI `static-analysis` job's `Stylelint` step; covers `client/src/**/*.css` and `client/src/**/*.module.css`, not `docs/`)
7. **DataTable testids**: any `data-testid` emitted from `ColumnDef.render` or `renderActions` must be built with `dataTableTestId(prefix, id, surface)` — DataTable mounts the table and the mobile cards simultaneously (see wiki Architecture › Frontend Conventions).

### Internationalization & Translation

The application supports multiple locales (English and German) via `i18next` and `react-i18next`. All agents must follow these conventions:

- **Frontend**: All user-facing strings must use `t()` — never hardcode text in JSX. Translation files: `client/src/i18n/{lang}/{namespace}.json`. Dev agents write English (`en`) keys only; never write non-English translations.
- **Translator owns non-English locales**: `translator` agent translates new keys and enforces glossary compliance.
- **Glossary** (`client/src/i18n/glossary.json`, schema v2, glossary v1 approved by the owner): domain terms and fixed UI words only. `_meta` holds `schemaVersion: 2`, `glossaryVersion`, `locales`, `lastUpdated`, `approval` (owner decision and the translator's sign-off) and `transition`. Each key of `terms` is the **English canon**. A term has:
  - `groups` (`primaryNoun`, `supportingNoun`, `view`, `diaryType`, `scheduleWord`, `statusWord`, `figureWord`, `homeWord`, `historyEventType`, `tabWord`, `verb`, `photoMarkup`, `general`);
  - `en` and `de` forms (`singular`, `plural`, `verb`, `noun`, `chip`, `sentence`, `shortForm`, `shortFormNote`, `note`);
  - `deSource` (`approved` | `shipped`);
  - a one-line English `definition`, the source of term hints and empty-state wording;
  - `doNotUse` (`{ word, locale, context? }`, the banned synonyms; a banned word that is also a valid canon carries a `context`);
  - `formerly`: former names, which are **permanent search aliases** and are never removed.

  Read it only through `client/src/i18n/glossary.ts` (`GLOSSARY`, `getSearchAliases`, `findTermsByAlias`, `getBannedSynonyms`), which validates the schema. Status labels come from the canonical `statusVocabulary.*` key sets in `I18N_UNION_KEYS` (namespace `common`), one per status vocabulary. During EPIC-21, words in `formerly` or `doNotUse` stay in existing strings until the story that renames that label. The translator proposes new terms and the product owner (or the owner) approves them. To add a locale: update `glossary.json` `_meta.locales` and every term's forms, create `client/src/i18n/{locale}/` namespace files, register them in `client/src/i18n/index.ts`, and in `client/src/i18n/glossary.ts` add the locale to `GLOSSARY_LOCALES` and add its forms field to `GlossaryTerm` and `parseTerm`.

- **Backend**: API error responses use `ErrorCode` enum values; frontend translates via `translateApiError()`. `CURRENCY` env var (default: `EUR`) exposed via `GET /api/config`.
- **Formatting**: Use `formatDate`, `formatCurrency`, `formatPercent`, `formatWeekdayShort`, `formatFileSize`, `formatFileSizeDecimal` (1 MB = 1,000,000 B; used for the report size limit and the sizes shown beside it), and `formatHours` from `client/src/lib/formatters.ts` — never raw `toLocaleDateString()` or `Intl.NumberFormat`.
- **Union-derived keys**: A union enumerated at runtime is an exported `as const` tuple (in `shared/`, or client-local when only the client enumerates it, e.g. `REPORT_SKIP_REASONS`) with its type derived from it (`export type X = (typeof XS)[number]`). Any i18n key built from a union member goes through a key set in `I18N_UNION_KEYS` (`client/src/i18n/unionKeys.ts`, `set.key(member)`) — never a template-literal key — so `unionKeys.test.ts` fails when a member lacks a key in any locale (#2029), and `templateLiteralKeys.test.ts` fails on a new template-literal key outside its allow-list.
- **Testing**: QA verifies keys exist in both locales. E2E verifies locale detection and switching.
- **Specs**: Dev-team-lead specs must include translation namespace, English keys to add, and a Translator Spec section.

## Testing

### Testing Approach

- **Unit & integration tests**: Jest with ts-jest (co-located with source: `foo.test.ts` next to `foo.ts`)
- **API integration tests**: Fastify's `app.inject()` method (no HTTP server needed)
- **E2E tests**: Playwright (runs against built app)
  - E2E test files live in `e2e/tests/` (separate workspace, not co-located with source)
  - E2E tests run against **desktop, tablet, and mobile** viewports via Playwright projects
  - Test environment managed by **testcontainers**: app, OIDC provider, upstream proxy
- **Test command**: `npm test` (runs all Jest tests across all workspaces via `--experimental-vm-modules` for ESM)
- **Coverage**: `npm run test:coverage` — **95% unit test coverage target** on all new and modified code
- Test files use `.test.ts` / `.test.tsx` extension
- No separate `__tests__/` directories -- tests live next to the code they test
- **E2E page coverage requirement**: Every page/route in the application must have E2E test coverage. Fully implemented pages need comprehensive tests (CRUD flows, validation, responsive layout, dark mode). Stub/placeholder pages need at minimum a smoke test verifying the page loads and renders its heading.

### Coverage Enforcement

Coverage is enforced through three mechanisms:

- **CI**: 6 Jest shards (2 workers each — the 4-vCPU runners have only 2 physical cores; 3 workers measured ~2x slower per file) upload a `coverage-report` artifact (retained 30 days) — inspect via the CI run for per-file percentages. Shards are packed by recorded per-file runtime (`scripts/jest-shard-sequencer.mjs` + `scripts/jest-timings.json`), not path hash. When shard durations drift apart (e.g. after adding or splitting a slow test file), refresh the weights from a green run with `node scripts/update-jest-timings.mjs <run-id>` and commit the JSON. Keep any single test file well under a shard's ~6 minute test budget — `--shard` cannot subdivide a file, so one slow file sets its shard's floor. CI uses Jest's default 5 s `testTimeout`; a test needing more is a performance bug to profile (`node --cpu-prof`), not a timeout to raise.
- **Test file parity**: dev-team-lead `[MODE: review]` rejects production files without a corresponding test file (`VERDICT: CHANGES_REQUIRED` → routed to `qa-integration-tester`) — type-only files, pure re-export barrels, and configuration are exempt (see `.claude/checklists/implementation-checklist.md`).
- **Local**: QA runs `npx jest path/to/file.test.ts --coverage --coverageReporters=text --maxWorkers=1` before committing; 95%+ required.

### Test Failure Debugging Protocol

When tests fail during development, a structured diagnostic protocol determines whether the failure is in the test, the production code, or the spec — preventing wasted fix loops (e.g., weakening a correct test to make broken code pass).

- **Source-of-truth hierarchy**: Spec/Contract > Production code > Test code
- **Rule**: Correct tests must not be weakened to accommodate buggy code; correct code must not be broken to satisfy a wrong test
- **Protocol owner**: The `dev-team-lead` runs the diagnostic decision tree during `[MODE: review]` when test failures are present in the review input. See the dev-team-lead agent definition for the full classification table and escalation rules.
- **Test agents report, not diagnose**: `qa-integration-tester` and `e2e-test-engineer` submit structured failure reports but do not determine whether the fault lies in code or tests — that judgment belongs to the dev-team-lead.

## Development Workflow

### Getting Started

```bash
git submodule update --init   # Initialize wiki submodule
npm install                   # Install all workspace dependencies
npm run dev                   # Start server (port 3000) + client dev server (port 5173)
```

### Common Commands

| Command                    | Description                                                    |
| -------------------------- | -------------------------------------------------------------- |
| `npm run dev`              | Start both server and client in watch mode                     |
| `npm run dev:server`       | Start only the Fastify server (node --watch)                   |
| `npm run dev:client`       | Start only the Webpack dev server                              |
| `npm run build`            | Build all packages (shared -> client -> server)                |
| `npm test`                 | Run all tests                                                  |
| `npm run test:collect`     | List all tests (suites + names) without executing them         |
| `npm run lint`             | Lint all code                                                  |
| `npm run format`           | Format all code                                                |
| `npm run typecheck`        | Type-check all packages (shared, server, client, e2e)          |
| `npm run test:e2e:smoke`   | Run E2E smoke tests (desktop/Chromium only)                    |
| `npm run db:migrate`       | Run pending SQL migrations                                     |
| `npm run docs:dev`         | Start docs site dev server (port 3001)                         |
| `npm run docs:build`       | Build docs site to `docs/build/`                               |
| `npm run docs:screenshots` | Capture app screenshots into `docs/static/img/screenshots/`    |
| `npm run plan:check`       | Validate the EPIC-21 capability/route map and pattern baseline |
| `npm run plan:build`       | Regenerate derived `plan/restructure/` JSON                    |
| `npm run test:plan`        | Run the `plan/restructure/scripts` test suites                 |

### Documentation Site

Docusaurus site in `docs/` deployed to GitHub Pages on stable releases via `.github/workflows/release.yml`.

### Database Migrations

Hand-written SQL files in `server/src/db/migrations/` with a numeric prefix (e.g., `0001_create_users.sql`). Run `npm run db:migrate` to apply. The runner (`server/src/db/migrate.ts`) tracks applied migrations in `_migrations` and runs new ones in a transaction.

### Environment Variables

| Variable                     | Default                    | Description                                                                                                          |
| ---------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `PORT`                       | `3000`                     | Server port                                                                                                          |
| `HOST`                       | `0.0.0.0`                  | Server bind address                                                                                                  |
| `DATABASE_URL`               | `/app/data/cornerstone.db` | SQLite database path                                                                                                 |
| `LOG_LEVEL`                  | `info`                     | Log level (trace/debug/info/warn/error/fatal)                                                                        |
| `NODE_ENV`                   | `production`               | Environment                                                                                                          |
| `SESSION_DURATION`           | `604800`                   | Session duration in seconds (default: 7 days)                                                                        |
| `SECURE_COOKIES`             | `true`                     | Enable HTTPS-only cookie flag                                                                                        |
| `TRUST_PROXY`                | `false`                    | Trust X-Forwarded-\* headers from a reverse proxy                                                                    |
| `AUTH_RATE_LIMIT_MAX`        | `20`                       | Login endpoint rate limit: max requests per IP per window (positive integer)                                         |
| `AUTH_RATE_LIMIT_WINDOW`     | `15 minutes`               | Login endpoint rate limit: time window (ms library format, e.g. `15 minutes`, `1h`, `30s`)                           |
| `OIDC_ISSUER`                | (none)                     | OpenID Connect issuer URL                                                                                            |
| `OIDC_CLIENT_ID`             | (none)                     | OIDC application client ID                                                                                           |
| `OIDC_CLIENT_SECRET`         | (none)                     | OIDC application client secret                                                                                       |
| `OIDC_JIT_PROVISIONING`      | `false`                    | Opt-in: create a `member` account on first OIDC login with a verified email that matches no account. Off = link-only |
| `EXTERNAL_URL`               | (none)                     | Public-facing base URL (e.g., `https://myhouse.example.com`) for reverse-proxy setups                                |
| `PHOTO_MAX_FILE_SIZE_MB`     | `20`                       | Maximum photo upload size in MB                                                                                      |
| `PHOTO_STORAGE_PATH`         | `{DB_DIR}/photos`          | Directory for photo storage                                                                                          |
| `DIARY_AUTO_EVENTS`          | `true`                     | Enable automatic diary event creation                                                                                |
| `CURRENCY`                   | `EUR`                      | ISO 4217 currency code for formatting (exposed via `GET /api/config`)                                                |
| `VAT_RATE`                   | `0.19`                     | VAT/sales-tax rate as a fraction (e.g. `0.19` = 19%) for budget-line gross-up math (exposed via `GET /api/config`)   |
| `PAPERLESS_URL`              | (none)                     | Paperless-ngx instance base URL                                                                                      |
| `PAPERLESS_API_TOKEN`        | (none)                     | Paperless-ngx API authentication token                                                                               |
| `PAPERLESS_EXTERNAL_URL`     | (none)                     | Browser-facing URL for Paperless-ngx links (falls back to `PAPERLESS_URL` if unset)                                  |
| `PAPERLESS_FILTER_TAG`       | (none)                     | Tag name for automatic document pre-filtering                                                                        |
| `BACKUP_DIR`                 | `/backups`                 | Backup destination directory (must be outside app data directory)                                                    |
| `BACKUP_CADENCE`             | (none)                     | Cron expression for automatic backups (e.g., `0 2 * * *` for daily at 2 AM)                                          |
| `BACKUP_RETENTION`           | (none)                     | Maximum number of backup archives to retain (oldest deleted when exceeded)                                           |
| `DIARY_DRAFT_RETENTION_DAYS` | `30`                       | Days a draft diary entry can sit untouched before the daily orphan cleanup deletes it (set to `0` to disable)        |
| `LLM_BASE_URL`               | (none)                     | Base URL for OpenAI-compatible LLM API (e.g., `https://api.openai.com/v1`)                                           |
| `LLM_API_KEY`                | (none)                     | API key for LLM provider authentication                                                                              |
| `LLM_MODEL`                  | (none)                     | LLM model identifier (e.g., `gpt-4-turbo`, `claude-3-opus-20240229`)                                                 |
| `LLM_REQUEST_TIMEOUT_MS`     | `30000`                    | Timeout in milliseconds for LLM requests (must be positive integer)                                                  |
| `LLM_MAX_TOKENS`             | `16384`                    | Maximum output tokens per LLM call. Increase if extractions truncate (see `finishReason: "length"`)                  |
| `LLM_PROVIDER`               | auto-detect                | Optional: `openai`, `anthropic`, `gemini`, `ollama`, or `generic`. Auto-detected from `LLM_BASE_URL` if unset        |

Production images use Docker Hardened Images (DHI). See `Dockerfile` and `docker-compose.yml` for build/deploy details.

## Cross-Team Convention

Any agent making a decision that affects other agents (e.g., a new naming convention, a shared pattern, a configuration change) must update this file so the convention is documented in one place.

### Agent Memory Maintenance

Every agent has persistent memory in `.claude/agent-memory/<agent-name>/` (project-scope, shared via version control). `MEMORY.md` is auto-loaded into that agent's system prompt and truncated after 200 lines — keep it a concise index of one-line hooks linking to topic files for detail. Consult it before starting work; update it (or its topic files) whenever your work invalidates recorded facts or teaches something durable and generalizable.

- When a code change invalidates information in agent memory (e.g., fixing a bug documented in memory, changing a public API, updating routes), the implementing agent must update the relevant agent memory files.
- When policy or process changes, **delete or correct contradicted entries** — never leave an old instruction standing next to a new one.
- Do not record session-scoped status (issue progress, one-off timelines) — memory is for durable facts only.

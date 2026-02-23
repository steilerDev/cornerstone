# Cornerstone - Project Guide

## Project Overview

Cornerstone is a web-based home building project management application designed to help homeowners manage their construction project. It tracks work items, budgets (with multiple financing sources and subsidies), timelines (Gantt chart), and household item purchases.

- **Target Users**: 1-5 homeowners per instance (self-hosted)
- **Deployment**: Single Docker container with SQLite
- **Requirements**: See `plan/REQUIREMENTS.md` for the full requirements document

## Agent Team

This project uses a team of 10 specialized Claude Code agents defined in `.claude/agents/`:

| Agent                   | Role                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------- |
| `product-owner`         | Defines epics, user stories, and acceptance criteria; manages the backlog             |
| `product-architect`     | Tech stack, schema, API contract, project structure, ADRs, Dockerfile                 |
| `ux-designer`           | Design tokens, brand identity, component styling specs, dark mode, accessibility      |
| `backend-developer`     | API endpoints, business logic, auth, database operations, backend tests               |
| `frontend-developer`    | UI components, pages, interactions, API client, frontend tests                        |
| `qa-integration-tester` | Unit test coverage (95%+ target), integration tests, performance testing, bug reports |
| `e2e-test-engineer`     | Playwright E2E browser tests, test container infrastructure, UAT scenario coverage    |
| `security-engineer`     | Security audits, vulnerability reports, remediation guidance                          |
| `uat-validator`         | UAT scenarios, manual validation steps, user sign-off per epic                        |
| `docs-writer`           | Documentation site (`docs/`), lean README.md, user-facing guides after UAT approval  |

## GitHub Tools Strategy

| Concern                                                  | Tool                                          |
| -------------------------------------------------------- | --------------------------------------------- |
| Backlog, epics, stories, bugs                            | **GitHub Projects** board + **GitHub Issues** |
| Architecture, API contract, schema, ADRs, security audit | **GitHub Wiki**                               |
| Code review                                              | **GitHub Pull Requests**                      |
| Source tree                                              | Code, configs, `Dockerfile`, `CLAUDE.md` only |
| User-facing docs site                                    | **`docs/` workspace** (Docusaurus, GitHub Pages) |

The GitHub Projects board is the single source of truth for backlog management.

### GitHub Wiki Pages (managed by product-architect, security-engineer, and ux-designer)

- **Architecture** — system design, tech stack, conventions
- **API Contract** — REST API endpoint specifications
- **Schema** — database schema documentation
- **ADR Index** — links to all architectural decision records
- **ADR-NNN-Title** — individual ADR pages
- **Security Audit** — security findings and remediation status
- **Style Guide** — design system, tokens, color palette, typography, component patterns, dark mode

### GitHub Repo

- **Repository**: `steilerDev/cornerstone`
- **Default branch**: `main`
- **Integration branch**: `beta` (feature PRs land here; promoted to `main` after epic completion)

### Board Status Categories

The GitHub Projects board uses 4 status categories:

| Status          | Option ID  | Color  | Purpose                                      |
| --------------- | ---------- | ------ | -------------------------------------------- |
| **Backlog**     | `7404f88c` | Gray   | Epics and future-sprint stories              |
| **Todo**        | `dc74a3b0` | Blue   | Current sprint stories ready for development |
| **In Progress** | `296eeabe` | Yellow | Stories actively being developed             |
| **Done**        | `c558f50d` | Green  | Completed and accepted                       |

Project ID: `PVT_kwHOAGtLQM4BOlve`
Status Field ID: `PVTSSF_lAHOAGtLQM4BOlvezg9P0yo`

### Issue Relationships

All agents must maintain GitHub's native issue relationships:

- **Sub-issues**: Every user story must be linked as a sub-issue of its parent epic. Use the `addSubIssue` GraphQL mutation.
- **Blocked-by/Blocking**: When a story or epic has dependencies, create `addBlockedBy` relationships. This populates the "Blocked by" section in the issue sidebar.

**Node ID lookup** (required for GraphQL mutations):

```bash
gh api graphql -f query='{ repository(owner: "steilerDev", name: "cornerstone") { issue(number: <N>) { id } } }'
```

## Agile Workflow

We follow an incremental, agile approach:

1. **Product Owner** defines epics and breaks them into user stories with acceptance criteria
2. **UAT Validator** drafts acceptance test scenarios for each story and presents them to the user for approval before development begins
3. **Product Architect** designs schema additions and API endpoints for the epic incrementally
4. **UX Designer** produces visual specs for stories with UI components (which tokens, states, responsive behavior, accessibility)
5. **Backend Developer** implements API and business logic per-epic
6. **Frontend Developer** implements UI per-epic (references UX Designer's visual specs)
7. **Security Engineer** reviews every PR for security vulnerabilities
8. **QA Tester** validates integrated features; all automated tests must pass
9. **UAT Validator** provides step-by-step manual validation instructions for the user; iterates with developers if any scenario fails

Schema and API contract evolve incrementally as each epic is implemented, rather than being designed all at once upfront.

**Consistency check at epic start.** Before beginning any new epic, the orchestrator must verify repository consistency against the latest `CLAUDE.md` instructions:

- Agent definitions (`.claude/agents/`) align with current conventions (branch refs, attribution, responsibilities)
- CI/CD workflows match the current release model (branch triggers, Docker tags)
- `CLAUDE.md` conventions are internally consistent (agent team table, workflow steps, delegation list)
- Stale references (e.g., outdated branch names, deprecated tools, wrong tech stack mentions) are identified and fixed
- Any inconsistencies are corrected in a dedicated `chore/consistency-cleanup` PR before epic work begins

**Important: Planning agents run first.** Always launch the `product-owner` and `product-architect` agents BEFORE implementing any code. These agents must coordinate with the user and validate or adjust the plan before development begins. This catches inconsistencies early and avoids rework.

**One user story per development cycle.** Each cycle completes a single story end-to-end (architecture → implementation → tests → PR → review → merge) before starting the next. This keeps work focused and reduces context-switching.

**Compact context between stories.** After completing each story (merged and moved to Done), the orchestrator must compact its context before starting the next story. Stories are independent units of work — prior conversation history is not needed, only agent memory persists. This prevents context window exhaustion during multi-story epics.

**Mark stories in-progress before starting work.** When beginning work on a story, immediately move its GitHub Issue to "In Progress" on the Projects board. This prevents other agents from picking up the same story concurrently.

**The orchestrator delegates, never implements.** The orchestrating Claude coordinates the agent team but must NEVER write production code, tests, or architectural artifacts itself. Every implementation task must be delegated to the appropriate specialized agent:

- **Backend code** → `backend-developer` agent
- **Frontend code** → `frontend-developer` agent
- **Visual specs, design tokens, brand assets, CSS files** → `ux-designer` agent
- **Schema/API design, ADRs, wiki** → `product-architect` agent
- **Unit tests & test coverage** → `qa-integration-tester` agent
- **E2E tests** → `e2e-test-engineer` agent
- **UAT scenarios** → `uat-validator` agent
- **Story definitions** → `product-owner` agent
- **Security reviews** → `security-engineer` agent
- **User-facing documentation** (docs site + README) → `docs-writer` agent

The orchestrator's role is to: sequence agent launches, pass context between agents, manage the feature branch and PR lifecycle, and ensure the full agile cycle is followed for every story.

## Acceptance & Validation

Every epic follows a four-phase validation lifecycle managed by the `uat-validator` agent.

### Planning Phase

Before development begins on any story:

1. The **product-owner** defines user stories with acceptance criteria
2. The **uat-validator** translates acceptance criteria into concrete UAT scenarios (Given/When/Then)
3. The **qa-integration-tester** reviews the draft UAT scenarios for unit/integration testability, and the **e2e-test-engineer** reviews for browser automation feasibility, both suggesting adjustments where needed
4. The **uat-validator** incorporates QA and E2E feedback and posts the final scenarios to the story's GitHub Issue
5. UAT scenarios are presented to the user for review and approval
6. Development does NOT proceed until the user approves the UAT plan

### Development Phase

While implementation is in progress:

- Developers reference the approved UAT scenarios to understand expected behavior
- The **qa-integration-tester** owns unit tests and integration tests
- The **qa-integration-tester** must achieve **95% unit test coverage** on all new and modified code
- The **qa-integration-tester** writes automated integration tests covering the approved UAT scenarios
- The **e2e-test-engineer** writes Playwright E2E tests covering the approved UAT scenarios during the story's development cycle
- The **security-engineer** reviews the PR for security vulnerabilities after implementation
- All automated tests (unit + integration + E2E) must pass before requesting manual validation

### Refinement Phase

After all stories in an epic are merged, but before manual UAT validation:

1. The orchestrator collects all **non-blocking review comments** from PR reviews across the epic (observations, suggestions, and minor improvements that were noted but not required for merge)
2. A refinement task is created on a dedicated branch (e.g., `chore/<epic-number>-refinement`) to address these items
3. The appropriate developer agent(s) implement the refinements
4. The **qa-integration-tester** updates tests if needed
5. Standard quality gates must pass, then the refinement PR is merged before proceeding to UAT

This ensures that quality feedback from reviews is not lost, while keeping individual story PRs focused on their acceptance criteria.

### Validation Phase

After the refinement task is complete and all automated tests pass:

1. The **e2e-test-engineer** confirms all Playwright E2E tests pass and every approved UAT scenario has E2E coverage. This approval is required before proceeding to manual validation.
2. The **uat-validator** runs all automated checks and produces a UAT Validation Report
3. Step-by-step manual validation instructions are provided to the user
4. The user walks through each scenario and marks it pass or fail
5. If any scenario fails, developers fix the issue and the cycle repeats from the automated test step
6. After user approval, the **docs-writer** updates the docs site (`docs/`) and `README.md` to reflect the newly shipped features
7. The epic is complete only after explicit user approval and documentation is updated

### Key Rules

- **No story ships without UAT approval** — the user is the final authority
- **Automated before manual** — all automated tests must be green before the user validates manually
- **Iterate until right** — failed manual validation triggers a fix-and-revalidate loop
- **UAT documents live on GitHub Issues** — stored as comments on relevant story issues
- **Security review required** — the `security-engineer` must review every PR before the `product-owner` can approve
- **Product owner gates the PR** — the `product-owner` agent only approves a PR after verifying that ALL agent responsibilities were fulfilled: implementation by developer agents, 95%+ test coverage by QA, UAT scenarios by uat-validator, architecture sign-off by product-architect, security review by security-engineer, and visual spec/review by ux-designer (for frontend PRs)
- **QA and E2E split test ownership** — the `qa-integration-tester` agent owns unit tests and integration tests; the `e2e-test-engineer` agent owns Playwright E2E browser tests. Developer agents do not write tests.
- **E2E gate before manual UAT** — the `e2e-test-engineer` must confirm all E2E tests pass and all UAT scenarios have coverage before the `uat-validator` presents manual validation to the user.

## Git & Commit Conventions

All commits follow [Conventional Commits](https://www.conventionalcommits.org/):

- **Types**: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `build:`, `ci:`
- **Scope** optional but encouraged: `feat(work-items):`, `fix(budget):`, `docs(adr):`
- **Breaking changes**: Use `!` suffix or `BREAKING CHANGE:` footer
- Every completed task gets its own commit with a meaningful description
- **Link commits to issues**: When a commit resolves work tracked in a GitHub Issue, include `Fixes #<issue-number>` in the commit message body (one per line for multiple issues). Note: `Fixes #N` only auto-closes issues when the commit reaches `main` (not `beta`).
- **Always commit, push to a feature branch, and create a PR after verification passes.** When a work session completes and all quality gates (`lint`, `typecheck`, `test`, `format:check`, `build`, `npm audit`) pass, commit, push to the feature branch, and create a PR before ending the session. Do not leave verified work uncommitted or unpushed. Never push directly to `main` or `beta`.

### Agent Attribution

All agents must clearly identify themselves in commits and GitHub interactions:

- **Commits**: Include the agent name in the `Co-Authored-By` trailer:

  ```
  Co-Authored-By: Claude <agent-name> (<model>) <noreply@anthropic.com>
  ```

  Replace `<agent-name>` with one of: `backend-developer`, `frontend-developer`, `ux-designer`, `product-architect`, `product-owner`, `qa-integration-tester`, `e2e-test-engineer`, `security-engineer`, `uat-validator`, `docs-writer`, or `orchestrator` (when the orchestrating Claude commits directly). Replace `<model>` with the agent's actual model (e.g., `Opus 4.6`, `Sonnet 4.5`). Each agent's definition file specifies the exact trailer to use.

- **GitHub comments** (on issues, PRs, or discussions): Prefix the first line with the agent name in bold brackets:

  ```
  **[backend-developer]** This endpoint has been implemented...
  ```

- When the orchestrator commits work produced by a specific agent, it must use that agent's name in the `Co-Authored-By` trailer, not its own.

### Branching Strategy

**Never commit directly to `main` or `beta`.** All changes go through feature branches and pull requests.

- **Branch naming**: `<type>/<issue-number>-<short-description>`
  - Examples: `feat/42-work-item-crud`, `fix/55-budget-calc`, `ci/18-dependabot-auto-merge`
  - Use the conventional commit type as the prefix
  - Include the GitHub Issue number when one exists

- **Workflow** (full agent cycle for each user story):
  1. **Plan**: Launch `product-owner` (verify story + acceptance criteria) and `product-architect` (design schema/API/architecture) agents
  2. **UAT Plan**: Launch `uat-validator` to draft UAT scenarios from acceptance criteria; launch `qa-integration-tester` to review unit/integration testability and `e2e-test-engineer` to review browser automation feasibility; present to user for approval
  3. **Visual Spec** (stories with UI only): Launch `ux-designer` to post a styling specification on the GitHub Issue — which tokens, interactive states, responsive behavior, animations, and accessibility requirements. Backend-only stories skip this step.
  4. **Branch**: Create a feature branch from `beta`: `git checkout -b <branch-name> beta`
  5. **Implement**: Launch the appropriate developer agent (`backend-developer` and/or `frontend-developer`) to write the production code. Frontend developers reference the ux-designer's visual spec.
  6. **Test**: Launch `qa-integration-tester` to write unit tests (95%+ coverage target) and integration tests; launch `e2e-test-engineer` to write Playwright E2E tests covering UAT scenarios. Both agents work during the story's development cycle.
  7. **Quality gates**: Run `lint`, `typecheck`, `test`, `format:check`, `build`, `npm audit` — all must pass
  8. **Commit & PR**: Commit, push the branch, create a PR targeting `beta`: `gh pr create --base beta --title "..." --body "..."`
  9. **CI**: Wait for CI: `gh pr checks <pr-number> --watch`
  10. **Review**: After CI passes, launch review agents **in parallel**:
      - `product-owner` — verifies requirements coverage, acceptance criteria, UAT alignment, and that all agent responsibilities were fulfilled (QA coverage, UAT scenarios, security review, visual spec, etc.). Only approves if all agents have completed their work.
      - `product-architect` — verifies architecture compliance, test coverage, and code quality
      - `security-engineer` — reviews for security vulnerabilities, input validation, authentication/authorization gaps
      - `ux-designer` — reviews frontend PRs (those touching `client/src/`) for token adherence, visual consistency, and accessibility. Skipped for backend-only PRs.
        All agents review the PR diff and comment via `gh pr review`.
  11. **Fix loop**: If any reviewer requests changes:
      a. The reviewer posts specific feedback on the PR (`gh pr review --request-changes`)
      b. The orchestrator launches the original implementing agent on the same branch to address the feedback
      c. The implementing agent pushes fixes, then the orchestrator re-requests review from the agent(s) that requested changes
      d. Repeat until all reviewers approve
  12. **Merge**: Once all agents approve and CI is green, merge immediately: `gh pr merge --squash <pr-url>`
  13. After merge, clean up: `git checkout beta && git pull && git branch -d <branch-name>`
  14. **Documentation**: Launch `docs-writer` to update the docs site (`docs/`) and `README.md` with newly shipped features. Commit to `beta`.
  15. **Epic promotion**: After all stories in an epic are complete (merged to `beta`), refinement is done, and documentation is updated:
      a. Create a PR from `beta` to `main` using a **merge commit** (not squash): `gh pr create --base main --head beta --title "..." --body "..."`
      b. Post UAT validation criteria and manual testing steps as comments on the promotion PR — this gives the user a single place to review what was built and how to validate it
      c. Wait for all CI checks to pass on the PR. If any check fails, investigate and resolve before proceeding
      d. Once CI is green and the UAT criteria are posted, **wait for user approval** before merging. The user reviews the PR, validates the UAT scenarios, and approves
      e. After user approval, merge: `gh pr merge --merge <pr-url>`. Merge commits preserve individual commits for semantic-release analysis.
  16. **Merge-back**: After the stable release is published on `main`, merge `main` back into `beta` so the release tag is reachable from beta's history. This is automated by the `merge-back` job in `release.yml`, which creates a PR from `main` into `beta`. If the automated PR fails (e.g., merge conflicts), manually resolve: create a branch from `beta`, merge `origin/main`, push, and PR to `beta`. **Without this step, semantic-release on beta cannot see the stable tag and keeps incrementing the old pre-release version.**

Note: Dependabot auto-merge (`.github/workflows/dependabot-auto-merge.yml`) targets `beta` — it handles automated dependency updates, not agent work.

### Release Model

Cornerstone uses a two-tier release model:

| Branch | Purpose                                                 | Release Type                            | Docker Tags              |
| ------ | ------------------------------------------------------- | --------------------------------------- | ------------------------ |
| `beta` | Integration branch — feature PRs land here              | Beta pre-release (e.g., `1.7.0-beta.1`) | `1.7.0-beta.1`, `beta`   |
| `main` | Stable releases — `beta` promoted after epic completion | Full release (e.g., `1.7.0`)            | `1.7.0`, `1.7`, `latest` |

**Merge strategies:**

- **Feature PR -> `beta`**: Squash merge (clean history)
- **`beta` -> `main`** (epic promotion): Merge commit (preserves individual commits so semantic-release can analyze them)

**Merge-back after promotion:** After each epic promotion (`beta` -> `main`), `main` must be merged back into `beta`. This ensures the stable release tag (e.g., `v1.7.0`) is reachable from beta's git history. Without this, semantic-release on beta continues incrementing the old pre-release series. The `release.yml` workflow automates this via a `merge-back` job.

**Hotfixes:** If a critical fix must go directly to `main`, immediately cherry-pick the fix back to `beta` to keep branches in sync.

### Branch Protection

Both `main` and `beta` have branch protection rules enforced on GitHub:

| Setting                           | `main`                    | `beta`                    |
| --------------------------------- | ------------------------- | ------------------------- |
| PR required                       | Yes                       | Yes                       |
| Required approving reviews        | 0                         | 0                         |
| Required status checks            | `Quality Gates`, `Docker` | `Quality Gates`, `Docker` |
| Strict status checks (up-to-date) | Yes                       | No                        |
| Enforce admins                    | No                        | Yes                       |
| Force pushes                      | Blocked                   | Blocked                   |
| Deletions                         | Blocked                   | Blocked                   |

**Why strict differs:** `main` requires branches to be up-to-date before merging, guaranteeing CI ran against the exact merge base for stable releases. `beta` does not require this — as a high-traffic integration branch receiving parallel feature PRs and Dependabot updates, strict mode would create merge queue bottlenecks.

**Why enforce admins differs:** Admin bypass is allowed on `main` for emergency hotfixes. `beta` enforces rules for all users, including admins, to maintain integration branch integrity.

## Parallel Coding Sessions

Multiple Claude Code sessions can run in parallel using [gwq](https://github.com/d-kuro/gwq) for git worktree management. Each session gets its own worktree directory with isolated `node_modules/`, database, and dev server ports.

### Setup

gwq is pre-installed in the sandbox Dockerfile. For existing sandboxes, run `scripts/install-gwq.sh`.

### Port Allocation

Each worktree uses a unique port slot to avoid conflicts:

| Slot | Server (`PORT`) | Client (`CLIENT_DEV_PORT`) | Usage                   |
| ---- | --------------- | -------------------------- | ----------------------- |
| 0    | 3000            | 5173                       | Main worktree (default) |
| 1    | 3001            | 5174                       | Session 1               |
| 2    | 3002            | 5175                       | Session 2               |
| 3    | 3003            | 5176                       | Session 3               |

### Worktree Lifecycle

```bash
# Create a worktree (auto-selects next free slot)
scripts/worktree-create.sh feat/42-work-item-crud

# Create with explicit slot
scripts/worktree-create.sh feat/42-work-item-crud 2

# Start dev servers in a worktree
cd <worktree-path>
source .env.worktree && npm run dev

# Remove a worktree
scripts/worktree-remove.sh feat/42-work-item-crud

# Remove worktree and delete local branch
scripts/worktree-remove.sh feat/42-work-item-crud --delete-branch
```

### Key Details

- **gwq config**: `.gwq.toml` at repo root sets worktree basedir to `~/worktrees`
- **Database isolation**: Each worktree has its own `data/cornerstone.db` (data/ is in `.gitignore`)
- **Agent memory sharing**: `worktree-create.sh` symlinks `.claude/agent-memory/` from the main worktree so learnings persist across sessions
- **Bootstrap**: `worktree-create.sh` runs `npm install`, `npm rebuild better-sqlite3`, and `npm run build -w shared` automatically
- **Main worktree**: Stays on `beta` as home base; slot 0 ports are the default
- **Quick reference**: `gwq list` (show worktrees), `gwq remove <branch>` (remove worktree)

## Tech Stack

| Layer                      | Technology              | Version | ADR     |
| -------------------------- | ----------------------- | ------- | ------- |
| Server                     | Fastify                 | 5.x     | ADR-001 |
| Client                     | React                   | 19.x    | ADR-002 |
| Client Routing             | React Router            | 7.x     | ADR-002 |
| Database                   | SQLite (better-sqlite3) | --      | ADR-003 |
| ORM                        | Drizzle ORM             | 0.45.x  | ADR-003 |
| Bundler (client)           | Webpack                 | 5.x     | ADR-004 |
| Styling                    | CSS Modules             | --      | ADR-006 |
| Testing (unit/integration) | Jest (ts-jest)          | 30.x    | ADR-005 |
| Testing (E2E)              | Playwright              | 1.58.x  | ADR-005 |
| Language                   | TypeScript              | ~5.9    | --      |
| Runtime                    | Node.js                 | 24 LTS  | --      |
| Container                  | Docker (DHI Alpine)     | --      | --      |
| Monorepo                   | npm workspaces          | --      | ADR-007 |

Full rationale for each decision is in the corresponding ADR on the GitHub Wiki.

## Project Structure

```
cornerstone/
  .sandbox/                 # Dev sandbox template (Dockerfile for Claude Code sandbox)
  package.json              # Root workspace config, shared dev dependencies
  .nvmrc                    # Node.js version pin (24 LTS)
  tsconfig.base.json        # Base TypeScript config
  eslint.config.js          # ESLint flat config (all packages)
  .prettierrc               # Prettier config
  jest.config.ts            # Jest config (all packages)
  Dockerfile                # Multi-stage Docker build
  docker-compose.yml        # Docker Compose for end-user deployment
  .env.example              # Example environment variables
  .releaserc.json           # semantic-release configuration
  CLAUDE.md                 # This file
  plan/                     # Requirements document
  shared/                   # @cornerstone/shared - TypeScript types
    package.json
    tsconfig.json
    src/
      types/                # API types, entity types
      index.ts              # Re-exports
  server/                   # @cornerstone/server - Fastify REST API
    package.json
    tsconfig.json
    src/
      app.ts                # Fastify app factory
      server.ts             # Entry point
      routes/               # Route handlers by domain
      plugins/              # Fastify plugins (auth, db, etc.)
      services/             # Business logic
      db/
        schema.ts           # Drizzle schema definitions
        migrations/         # SQL migration files
      types/                # Server-only types
  client/                   # @cornerstone/client - React SPA
    package.json
    tsconfig.json
    webpack.config.cjs
    index.html
    src/
      main.tsx              # Entry point
      App.tsx               # Root component
      components/           # Reusable UI components
      pages/                # Route-level pages
      hooks/                # Custom React hooks
      lib/                  # Utilities, API client
      types/                # Type declarations (CSS modules, etc.)
      styles/               # Global CSS (index.css)
  e2e/                      # @cornerstone/e2e - Playwright E2E tests
    package.json
    tsconfig.json
    playwright.config.ts    # Playwright configuration
    auth.setup.ts           # Authentication setup for tests
    containers/             # Testcontainers setup modules
    fixtures/               # Test fixtures and helpers
    pages/                  # Page Object Models
    tests/                  # Test files organized by feature/epic
  docs/                     # @cornerstone/docs - Docusaurus documentation site
    package.json
    tsconfig.json
    docusaurus.config.ts    # Site configuration
    sidebars.ts             # Sidebar navigation
    theme/
      custom.css            # Brand colors
    static/
      img/                  # Favicon, logo, screenshots
    src/                    # Documentation content (Markdown)
      intro.md              # Landing page
      roadmap.md            # Feature roadmap
      getting-started/      # Deployment guides
      guides/               # Feature user guides
      development/          # Agentic development docs
```

### Package Dependency Graph

```
@cornerstone/shared  <--  @cornerstone/server
                     <--  @cornerstone/client
@cornerstone/e2e     (standalone — runs against built app via testcontainers)
@cornerstone/docs    (standalone — Docusaurus, deployed to GitHub Pages)
```

### Build Order

`shared` (tsc) -> `client` (webpack build) -> `server` (tsc)

The `docs` workspace is NOT part of the application build (`npm run build`). Build it separately with `npm run docs:build`.

## Dependency Policy

- **Always use the latest stable (LTS if applicable) version** of a package when adding or upgrading dependencies
- **Pin dependency versions to a specific release** — use exact versions rather than caret ranges (`^`) to prevent unexpected upgrades
- **Avoid native binary dependencies for frontend tooling.** Tools like esbuild, SWC, Lightning CSS, and Tailwind CSS v4 (oxide engine) ship platform-specific native binaries that crash on ARM64 emulation environments. Prefer pure JavaScript alternatives (Webpack, Babel, PostCSS, CSS Modules). Native addons for the server (e.g., better-sqlite3) are acceptable since the Docker builder can install build tools. esbuild has been fully eliminated from the dependency tree.
- **Zero known fixable vulnerabilities.** Run `npm audit` before committing dependency changes. All fixable vulnerabilities must be resolved.

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
- No `any` types without justification (ESLint warns on `@typescript-eslint/no-explicit-any`)
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

## Testing Approach

Unit and integration testing is owned by the `qa-integration-tester` agent. E2E browser testing is owned by the `e2e-test-engineer` agent. Developer agents write production code; the QA and E2E agents write and maintain all tests.

- **Unit & integration tests**: Jest with ts-jest (co-located with source: `foo.test.ts` next to `foo.ts`)
- **API integration tests**: Fastify's `app.inject()` method (no HTTP server needed)
- **E2E tests**: Playwright (owned by `e2e-test-engineer` agent, runs against built app)
  - E2E test files live in `e2e/tests/` (separate workspace, not co-located with source)
  - E2E tests run against **desktop, tablet, and mobile** viewports via Playwright projects
  - Test environment managed by **testcontainers**: app, OIDC provider, upstream proxy
- **Test command**: `npm test` (runs all Jest tests across all workspaces via `--experimental-vm-modules` for ESM)
- **Coverage**: `npm run test:coverage` — **95% unit test coverage target** on all new and modified code
- Test files use `.test.ts` / `.test.tsx` extension
- No separate `__tests__/` directories -- tests live next to the code they test

## Development Workflow

### Prerequisites

- Node.js >= 24
- npm >= 11
- Docker (for container builds)

### Getting Started

```bash
npm install                   # Install all workspace dependencies
npm run dev                   # Start server (port 3000) + client dev server (port 5173)
```

In development, the Webpack dev server at `http://localhost:5173` proxies `/api/*` requests to the Fastify server at `http://localhost:3000`.

### Common Commands

| Command              | Description                                     |
| -------------------- | ----------------------------------------------- |
| `npm run dev`        | Start both server and client in watch mode      |
| `npm run dev:server` | Start only the Fastify server (node --watch)    |
| `npm run dev:client` | Start only the Webpack dev server               |
| `npm run build`      | Build all packages (shared -> client -> server) |
| `npm test`           | Run all tests                                   |
| `npm run lint`       | Lint all code                                   |
| `npm run format`     | Format all code                                 |
| `npm run typecheck`  | Type-check all packages                         |
| `npm run db:migrate`   | Run pending SQL migrations                      |
| `npm run docs:dev`     | Start docs site dev server (port 3001)          |
| `npm run docs:build`   | Build docs site to `docs/build/`                |
| `npm run docs:screenshots` | Capture app screenshots into `docs/static/img/screenshots/` |

### Documentation Site

The `docs/` workspace is a Docusaurus 3.x site deployed to GitHub Pages at `https://steilerDev.github.io/cornerstone/`.

**Content hierarchy:**

| Location | Content | Audience |
|----------|---------|----------|
| Docs site (`docs/src/`) | User guides, deployment, development process | End users |
| GitHub Wiki (`wiki/`) | Architecture, API contract, schema, ADRs, security audit | Agents + contributors |
| `README.md` | Lean pointer: tagline, quick start, roadmap, links | GitHub visitors |
| `CLAUDE.md` | Agent instructions, conventions, workflow rules | AI agents |

**Deployment:** Automated via `.github/workflows/docs.yml` — triggers on push to `main` with changes in `docs/**`.

**Screenshots:** Run `npm run docs:screenshots` to capture app screenshots into `docs/static/img/screenshots/`. This requires the app to be running via testcontainers (same as E2E tests). Screenshots are named `<feature>-<view>-<theme>.png` (e.g., `work-items-list-light.png`).

### Database Migrations

Migrations are hand-written SQL files in `server/src/db/migrations/`, named with a numeric prefix for ordering (e.g., `0001_create_users.sql`). There is no auto-generation tool — developers write the SQL by hand. Run `npm run db:migrate` to apply pending migrations. The migration runner (`server/src/db/migrate.ts`) tracks applied migrations in a `_migrations` table and applies new ones inside a transaction.

### Docker Build

Production images use [Docker Hardened Images](https://hub.docker.com/r/dhi.io/node) (DHI) for minimal attack surface and near-zero CVEs. The builder stage uses `dhi.io/node:24-alpine3.23-dev` (includes npm + build tools) and the production stage uses `dhi.io/node:24-alpine3.23` (minimal runtime only).

```bash
# Standard build
docker build -t cornerstone .

# Behind a proxy with CA cert
docker build \
  --build-arg HTTP_PROXY=$HTTP_PROXY --build-arg HTTPS_PROXY=$HTTPS_PROXY \
  --secret id=proxy-ca,src=$SSL_CERT_FILE -t cornerstone .

# Run
docker run -p 3000:3000 -v cornerstone-data:/app/data cornerstone
```

### Docker Compose (Recommended for Deployment)

For end-user deployment, use the provided `docker-compose.yml` with the published image:

```bash
cp .env.example .env       # Copy and customize environment variables
docker compose up -d        # Start the application
```

The `docker-compose.yml` references the published `steilerdev/cornerstone:latest` image (not a local build). See `.env.example` for all available configuration options.

### Environment Variables

| Variable          | Default                    | Description                                   |
| ----------------- | -------------------------- | --------------------------------------------- |
| `PORT`            | `3000`                     | Server port                                   |
| `HOST`            | `0.0.0.0`                  | Server bind address                           |
| `DATABASE_URL`    | `/app/data/cornerstone.db` | SQLite database path                          |
| `LOG_LEVEL`       | `info`                     | Log level (trace/debug/info/warn/error/fatal) |
| `NODE_ENV`        | `production`               | Environment                                   |
| `CLIENT_DEV_PORT` | `5173`                     | Webpack dev server port (development only)    |

Additional variables for OIDC, Paperless-ngx, and sessions will be added as those features are implemented.

## Protected Files

- **`README.md`**: The `> [!NOTE]` block at the top of `README.md` is a personal note from the repository owner. Agents must NEVER modify, remove, or rewrite this note block. Other sections of `README.md` may be edited as needed.

## Cross-Team Convention

Any agent making a decision that affects other agents (e.g., a new naming convention, a shared pattern, a configuration change) must update this file so the convention is documented in one place.

### Agent Memory Maintenance

When a code change invalidates information in agent memory (e.g., fixing a bug documented in memory, changing a public API, updating routes), the implementing agent must update the relevant agent memory files. During the refinement phase, the orchestrator should verify that no stale memory entries exist for completed work.

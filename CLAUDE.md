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
| `docs-writer`           | Documentation site (`docs/`), lean README.md, user-facing guides after UAT approval   |

## GitHub Tools Strategy

| Concern                                                  | Tool                                             |
| -------------------------------------------------------- | ------------------------------------------------ |
| Backlog, epics, stories, bugs                            | **GitHub Projects** board + **GitHub Issues**    |
| Architecture, API contract, schema, ADRs, security audit | **GitHub Wiki**                                  |
| Code review                                              | **GitHub Pull Requests**                         |
| Source tree                                              | Code, configs, `Dockerfile`, `CLAUDE.md` only    |
| User-facing docs site                                    | **`docs/` workspace** (Docusaurus, GitHub Pages) |

The GitHub Wiki is checked out as a git submodule at `wiki/` in the project root. All architecture documentation lives as markdown files in this submodule. The GitHub Projects board is the single source of truth for backlog management.

### GitHub Wiki Pages (managed by product-architect and security-engineer)

- **Architecture** — system design, tech stack, conventions
- **API Contract** — REST API endpoint specifications
- **Schema** — database schema documentation
- **ADR Index** — links to all architectural decision records
- **ADR-NNN-Title** — individual ADR pages
- **Security Audit** — security findings and remediation status
- **Style Guide** — design system, tokens, color palette, typography, component patterns, dark mode

### Wiki Submodule

Wiki pages are markdown files in `wiki/` (e.g., `wiki/Architecture.md`, `wiki/API-Contract.md`). Ensure up to date before reading: `git submodule update --init wiki && git -C wiki pull origin master`

**Writing:** Edit `wiki/` → `git -C wiki add -A && git -C wiki commit -m "docs: ..."` → `git -C wiki push origin master` → `git add wiki` and commit the parent ref.

**Page naming:** `Architecture.md`, `API-Contract.md`, `Schema.md`, `Style-Guide.md`, `ADR-001-Server-Framework.md`, `ADR-Index.md`, `Security-Audit.md`

**Deviation workflow:** Flag in the PR; determine source of truth; get product-architect approval for wiki changes (`security-engineer` owns `Security-Audit.md`); fix and wiki update land together; add a Deviation Log entry to the wiki page and log on the relevant GitHub Issue.

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

**Important: Planning agents run first.** Always launch the `product-owner` and `product-architect` agents BEFORE implementing any code. Planning only needs to run for the first story of an epic — subsequent stories reuse the established plan.

**One user story per development cycle.** Each cycle completes a single story end-to-end (architecture → implementation → tests → PR → review → merge) before starting the next.

**Compact context between stories.** After completing each story (merged and moved to Done), compact context before starting the next. Only agent memory persists between stories.

**Mark stories in-progress before starting work.** When beginning a story, immediately move its GitHub Issue to "In Progress" on the Projects board.

**The orchestrator delegates, never implements.** Must NEVER write production code, tests, or architectural artifacts. Delegate all implementation:

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

## Acceptance & Validation

Every epic follows a two-phase validation lifecycle.

### Development Phase

During each story's development cycle:

- The **product-owner** defines stories with acceptance criteria and UAT scenarios (Given/When/Then) posted on the story's GitHub Issue
- The **qa-integration-tester** owns unit + integration tests (95%+ coverage); the **e2e-test-engineer** owns Playwright E2E tests; the **security-engineer** reviews the PR for vulnerabilities
- All automated tests (unit + integration + E2E) must pass before merge

### Epic Validation Phase

After all stories in an epic are merged to `beta`:

1. The orchestrator collects all **non-blocking review comments** (observations noted but not required for merge) and creates a refinement task on `chore/<epic-number>-refinement`
2. Developer agent(s) implement the refinements; **qa-integration-tester** updates tests if needed
3. Standard quality gates must pass, then the refinement PR is merged before proceeding to UAT

### Validation Phase

After the refinement task is complete and all automated tests pass:

1. The **e2e-test-engineer** confirms all Playwright E2E tests pass and every approved UAT scenario has E2E coverage. This approval is required before proceeding to manual validation.
2. The **uat-validator** produces a UAT Validation Report and provides step-by-step manual validation instructions to the user
3. The user walks through each scenario; if any fail, developers fix and the cycle repeats from step 1
4. After user approval, the **docs-writer** updates the docs site (`docs/`) and `README.md`
5. The epic is complete only after explicit user approval and documentation is updated

### Key Rules

- **User approval required for promotion** — the user is the final authority on `beta` → `main` promotion
- **Automated before manual** — all automated tests must be green before the user validates
- **Iterate until right** — failed validation triggers a fix-and-revalidate loop
- **Acceptance criteria live on GitHub Issues** — stored on story issues, summarized on promotion PRs
- **Security review required** — the `security-engineer` must review every story PR
- **Test agents own all tests** — `qa-integration-tester` owns unit + integration tests; `e2e-test-engineer` owns Playwright E2E tests. Developer agents do not write tests.

## Git & Commit Conventions

All commits follow [Conventional Commits](https://www.conventionalcommits.org/):

- **Types**: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `build:`, `ci:`
- **Scope** optional but encouraged: `feat(work-items):`, `fix(budget):`, `docs(adr):`
- **Breaking changes**: Use `!` suffix or `BREAKING CHANGE:` footer
- Every completed task gets its own commit with a meaningful description
- **Link commits to issues**: When a commit resolves work tracked in a GitHub Issue, include `Fixes #<issue-number>` in the commit message body (one per line for multiple issues). Note: `Fixes #N` only auto-closes issues when the commit reaches `main` (not `beta`).
- **Always commit, push to a feature branch, and create a PR after work is complete.** The pre-commit hook automatically runs all quality gates (selective lint/format/tests on staged files + full typecheck/build/audit). Just commit — the hook validates. If the hook fails, fix the issues and commit again. Do not leave work uncommitted or unpushed. Never push directly to `main` or `beta`.

### Local Validation Policy

**Do NOT run `npm test`, `npm run lint`, `npm run typecheck`, or `npm run build` manually.** The pre-commit hook runs all quality gates automatically:

- Selective lint + format + related tests on staged files (via lint-staged)
- Full typecheck across all workspaces
- Full build (shared → client → server)
- Dependency security audit

To validate your work: **stage and commit**. If the hook fails, fix the issues and commit again. After pushing, **always wait for CI to go green** (`gh pr checks <pr-number> --watch`) before proceeding to the next step.

The only exception is the QA agent running a specific test file it just wrote (e.g., `npx jest path/to/new.test.ts`) to verify correctness before committing — but never `npm test` (the full suite).

### Agent Attribution

All agents must clearly identify themselves:

- **Commits**: `Co-Authored-By: Claude <agent-name> (<model>) <noreply@anthropic.com>` — see each agent's definition file for the exact trailer.
- **GitHub comments**: prefix with `**[agent-name]**` (e.g., `**[backend-developer]** This endpoint...`)
- **Orchestrator**: when committing work produced by an agent, use that agent's name in the trailer.

### Branching Strategy

**Never commit directly to `main` or `beta`.** All changes go through feature branches and pull requests.

- **Branch naming**: `<type>/<issue-number>-<short-description>` (e.g., `feat/42-work-item-crud`, `fix/55-budget-calc`)
- **Never push a `worktree-<anything>` branch.** Worktree branches carry auto-generated names. Before pushing, always rename the branch to match the naming convention above: `git branch -m <type>/<issue-number>-<short-description>`. If the scope of work is not yet clear, determine it before pushing — do not publish placeholder branch names.

### Session Isolation (Worktrees)

**Sessions run in git worktrees.** The user starts each session in a worktree manually. If the branch has a randomly generated name, rename it once scope is clear: `git branch -m <type>/<issue-number>-<short-description>`.

**Rebase onto `beta` at session start.** Worktrees are created from `main`. Before doing any work in a fresh session, rebase to `beta`: `git rebase origin/beta`. Skip only if the branch is already based on `beta`.

**NEVER `cd` to the base project directory to modify files.** All file edits, git operations, and commands must be performed from within the git worktree assigned at session start. The base project directory may have other sessions' uncommitted changes. This applies to subagents too — all file reads, writes, and exploration must use the worktree path.

- **Workflow** (full agent cycle for each user story):
  1. **Plan**: Launch `product-owner` (verify story + acceptance criteria) and `product-architect` (design schema/API/architecture) agents
  2. **UAT Plan**: Launch `uat-validator` to draft UAT scenarios from acceptance criteria; launch `qa-integration-tester` to review unit/integration testability and `e2e-test-engineer` to review browser automation feasibility; present to user for approval
  3. **Visual Spec** (stories with UI only): Launch `ux-designer` to post a styling specification on the GitHub Issue — which tokens, interactive states, responsive behavior, animations, and accessibility requirements. Backend-only stories skip this step.
  4. **Branch**: The session runs in a worktree. If the branch has a random name, rename it once work scope is clear: `git branch -m <type>/<issue-number>-<short-description>`. If the branch already has a meaningful name, skip this step.
  5. **Implement**: Launch the appropriate developer agent (`backend-developer` and/or `frontend-developer`) to write the production code. Frontend developers reference the ux-designer's visual spec.
  6. **Test**: Launch `qa-integration-tester` to write unit tests (95%+ coverage target) and integration tests; launch `e2e-test-engineer` to write Playwright E2E tests covering UAT scenarios. Both agents work during the story's development cycle.
  7. **Commit & PR**: Commit (the pre-commit hook runs all quality gates automatically — selective lint/format/tests on staged files + full typecheck/build/audit), push the branch, create a PR targeting `beta`: `gh pr create --base beta --title "..." --body "..."`. E2E smoke tests run automatically in CI (see `e2e-smoke` job in `.github/workflows/ci.yml`) — do not run them locally.
  8. **CI (mandatory)**: Wait for all CI checks to pass: `gh pr checks <pr-number> --watch`. **Do not proceed** to review or any next step until CI is fully green. If CI fails, fix the issues on the branch and push again.
  9. **Review**: After CI passes, launch review agents **in parallel**:
     - `product-owner` — verifies requirements coverage, acceptance criteria, UAT alignment, and that all agent responsibilities were fulfilled (QA coverage, UAT scenarios, security review, visual spec, etc.). Only approves if all agents have completed their work.
     - `product-architect` — verifies architecture compliance, test coverage, and code quality
     - `security-engineer` — reviews for security vulnerabilities, input validation, authentication/authorization gaps
     - `ux-designer` — reviews frontend PRs (those touching `client/src/`) for token adherence, visual consistency, and accessibility. Skipped for backend-only PRs.
       All agents review the PR diff and comment via `gh pr review`.
  10. **Fix loop**: If any reviewer requests changes:
      a. The reviewer posts specific feedback on the PR (`gh pr review --request-changes`)
      b. The orchestrator launches the original implementing agent on the same branch to address the feedback
      c. The implementing agent pushes fixes, then the orchestrator re-requests review from the agent(s) that requested changes
      d. Repeat until all reviewers approve
  11. **Merge**: Once all agents approve and CI is green, merge immediately: `gh pr merge --squash <pr-url>`
  12. After merge, clean up: `git checkout beta && git pull && git branch -d <branch-name>`

- **Post-merge E2E**: After each story is merged to `beta`, a non-blocking E2E workflow (`.github/workflows/e2e.yml`) runs the full suite. If it fails, the next story cycle should include E2E fixes before new feature work. The orchestrator should check E2E status on `beta` before starting a new story: `gh run list --workflow=e2e.yml --branch=beta --limit=1`.

- **Epic-level steps** (after all stories in an epic are complete, merged to `beta`, and refinement is done):
  1. **Documentation**: Launch `docs-writer` to update the docs site (`docs/`) and `README.md` with newly shipped features. Commit to `beta`.
  2. **Epic promotion**: Create a PR from `beta` to `main` using a **merge commit** (not squash): `gh pr create --base main --head beta --title "..." --body "..."`
     a. Post UAT validation criteria and manual testing steps as comments on the promotion PR — this gives the user a single place to review what was built and how to validate it
     b. Wait for all CI checks to pass on the PR. If any check fails, investigate and resolve before proceeding
     c. Once CI is green and the UAT criteria are posted, **wait for user approval** before merging. The user reviews the PR, validates the UAT scenarios, and approves
     d. After user approval, merge: `gh pr merge --merge <pr-url>`. Merge commits preserve individual commits for semantic-release analysis.
  3. **Merge-back**: Automated by the `merge-back` job in `release.yml` (creates a PR from `main` into `beta`). If it fails, manually resolve: branch from `beta`, merge `origin/main`, push, PR to `beta`.

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

- **Merge-back after promotion:** `release.yml` automates a `main` → `beta` PR after each epic promotion. If it fails, manually resolve so the stable tag is reachable from beta's history.
- **Hotfixes:** Cherry-pick any `main` hotfix back to `beta` immediately.

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
  wiki/                     # GitHub Wiki (git submodule) - architecture docs, API contract, schema, ADRs
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

## Development Workflow

### Prerequisites

- Node.js >= 24
- npm >= 11
- Docker (for container builds)

### Getting Started

```bash
git submodule update --init   # Initialize wiki submodule
npm install                   # Install all workspace dependencies
chmod +x .husky/pre-commit    # Ensure pre-commit hook is executable (sandbox environments may reset this)
npm run dev                   # Start server (port 3000) + client dev server (port 5173)
```

### Common Commands

| Command                    | Description                                                 |
| -------------------------- | ----------------------------------------------------------- |
| `npm run dev`              | Start both server and client in watch mode                  |
| `npm run dev:server`       | Start only the Fastify server (node --watch)                |
| `npm run dev:client`       | Start only the Webpack dev server                           |
| `npm run build`            | Build all packages (shared -> client -> server)             |
| `npm test`                 | Run all tests                                               |
| `npm run lint`             | Lint all code                                               |
| `npm run format`           | Format all code                                             |
| `npm run typecheck`        | Type-check all packages                                     |
| `npm run test:e2e:smoke`   | Run E2E smoke tests (desktop/Chromium only)                 |
| `npm run db:migrate`       | Run pending SQL migrations                                  |
| `npm run docs:dev`         | Start docs site dev server (port 3001)                      |
| `npm run docs:build`       | Build docs site to `docs/build/`                            |
| `npm run docs:screenshots` | Capture app screenshots into `docs/static/img/screenshots/` |

### Documentation Site

Docusaurus 3.x site deployed to GitHub Pages at `https://steilerDev.github.io/cornerstone/`. Deployed via `.github/workflows/docs.yml` on push to `main` with changes in `docs/**`. Content: `docs/src/` (user guides, end users) · `wiki/` (architecture/ADRs, agents) · `README.md` (GitHub visitors) · `CLAUDE.md` (AI agents).

### Database Migrations

Hand-written SQL files in `server/src/db/migrations/` with a numeric prefix (e.g., `0001_create_users.sql`). Run `npm run db:migrate` to apply. The runner (`server/src/db/migrate.ts`) tracks applied migrations in `_migrations` and runs new ones in a transaction.

### Docker Build

Production images use [Docker Hardened Images](https://hub.docker.com/r/dhi.io/node) (DHI). **Docker build does not work in the sandbox** (no Docker daemon available).

```bash
docker build -t cornerstone .
docker run -p 3000:3000 -v cornerstone-data:/app/data cornerstone
```

### Docker Compose (Recommended for Deployment)

```bash
cp .env.example .env
docker compose up -d
```

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

When a code change invalidates information in agent memory (e.g., fixing a bug documented in memory, changing a public API, updating routes), the implementing agent must update the relevant agent memory files.

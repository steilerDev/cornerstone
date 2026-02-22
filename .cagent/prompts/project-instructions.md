# Cornerstone - Project Instructions

This file provides shared project context for all agents. It is loaded via `add_prompt_files` in `cagent.yaml`.

## Project Overview

Cornerstone is a web-based home building project management application designed to help homeowners manage their construction project. It tracks work items, budgets (with multiple financing sources and subsidies), timelines (Gantt chart), and household item purchases.

- **Target Users**: 1-5 homeowners per instance (self-hosted)
- **Deployment**: Single Docker container with SQLite
- **Requirements**: See `plan/REQUIREMENTS.md` for the full requirements document

## Agent Team

This project uses a team of 6 specialized agents plus an orchestrator:

| Agent                   | Role                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| `product-owner`         | Epics, user stories, acceptance criteria, UAT scenarios, backlog management, README updates      |
| `product-architect`     | Tech stack, schema, API contract, project structure, ADRs, Dockerfile                            |
| `backend-developer`     | API endpoints, business logic, auth, database operations                                         |
| `frontend-developer`    | UI components, pages, interactions, API client                                                   |
| `qa-integration-tester` | All automated tests: unit (95%+ coverage), integration, Playwright E2E, performance, bug reports |
| `security-engineer`     | Security audits, vulnerability reports, remediation guidance                                     |

## GitHub Tools Strategy

| Concern                                                  | Tool                                          |
| -------------------------------------------------------- | --------------------------------------------- |
| Backlog, epics, stories, bugs                            | **GitHub Projects** board + **GitHub Issues** |
| Architecture, API contract, schema, ADRs, security audit | **GitHub Wiki**                               |
| Code review                                              | **GitHub Pull Requests**                      |
| Source tree                                              | Code, configs, `Dockerfile`, `CLAUDE.md` only |

The GitHub Wiki is checked out as a git submodule at `wiki/` in the project root. All architecture documentation lives as markdown files in this submodule. The GitHub Projects board is the single source of truth for backlog management.

### GitHub Wiki Pages (managed by product-architect and security-engineer)

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

1. **Product Owner** defines epics and breaks them into user stories with acceptance criteria and UAT scenarios
2. **Product Architect** designs schema additions and API endpoints for the epic incrementally
3. **Backend Developer** implements API and business logic per-story
4. **Frontend Developer** implements UI per-story (references `tokens.css` and Style Guide wiki)
5. **QA Tester** writes and runs all automated tests (unit, integration, E2E); all must pass
6. **Security Engineer** reviews every PR for security vulnerabilities

Schema and API contract evolve incrementally as each epic is implemented, rather than being designed all at once upfront.

**Important: Planning agents run first.** Always run the `product-owner` and `product-architect` agents BEFORE implementing any code. These agents must coordinate with the user and validate or adjust the plan before development begins. This catches inconsistencies early and avoids rework. Planning only needs to run for the first story of an epic — subsequent stories reuse the established plan.

**One user story per development cycle.** Each cycle completes a single story end-to-end (architecture -> implementation -> tests -> PR -> review -> merge) before starting the next.

**Mark stories in-progress before starting work.** When beginning work on a story, immediately move its GitHub Issue to "In Progress" on the Projects board.

**The orchestrator delegates, never implements.** The orchestrator coordinates the agent team but must NEVER write production code, tests, or architectural artifacts itself. Every implementation task must be delegated to the appropriate specialized agent.

## Acceptance & Validation

Every epic follows a two-phase validation lifecycle.

### Development Phase

During each story's development cycle:

- The **product-owner** defines stories with acceptance criteria and UAT scenarios (Given/When/Then) posted on the story's GitHub Issue
- Developers reference the acceptance criteria to understand expected behavior
- The **qa-integration-tester** owns all automated tests: unit tests (95%+ coverage), integration tests, and Playwright E2E tests
- The **security-engineer** reviews the PR for security vulnerabilities after implementation
- All automated tests (unit + integration + E2E) must pass before merge

### Epic Validation Phase

After all stories in an epic are merged to `beta`:

1. The **product-owner** updates `README.md` to reflect newly shipped features
2. A promotion PR is created from `beta` to `main`
3. Acceptance criteria from each story's GitHub Issue serve as validation criteria — posted on the promotion PR
4. The user validates against the acceptance criteria and approves
5. If any scenario fails, developers fix the issue and the cycle repeats
6. The epic is complete only after explicit user approval

### Key Rules

- **User approval required for promotion** — the user is the final authority on `beta` -> `main` promotion
- **Automated before manual** — all automated tests must be green before the user validates
- **Iterate until right** — failed validation triggers a fix-and-revalidate loop
- **Acceptance criteria live on GitHub Issues** — stored on story issues, summarized on promotion PRs
- **Security review required** — the `security-engineer` must review every story PR
- **One test agent owns everything** — the `qa-integration-tester` agent owns unit tests, integration tests, and Playwright E2E browser tests. Developer agents do not write tests.

## Git & Commit Conventions

All commits follow [Conventional Commits](https://www.conventionalcommits.org/):

- **Types**: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `build:`, `ci:`
- **Scope** optional but encouraged: `feat(work-items):`, `fix(budget):`, `docs(adr):`
- **Breaking changes**: Use `!` suffix or `BREAKING CHANGE:` footer
- Every completed task gets its own commit with a meaningful description
- **Link commits to issues**: When a commit resolves work tracked in a GitHub Issue, include `Fixes #<issue-number>` in the commit message body (one per line for multiple issues). Note: `Fixes #N` only auto-closes issues when the commit reaches `main` (not `beta`).
- **Always commit, push to a feature branch, and create a PR after verification passes.** Never push directly to `main` or `beta`.

### Agent Attribution

All agents must clearly identify themselves in commits and GitHub interactions:

- **Commits**: Include the agent name in the `Co-Authored-By` trailer:

  ```
  Co-Authored-By: Claude <agent-name> (<model>) <noreply@anthropic.com>
  ```

  Replace `<agent-name>` with one of: `backend-developer`, `frontend-developer`, `product-architect`, `product-owner`, `qa-integration-tester`, `security-engineer`, or `orchestrator`. Replace `<model>` with the agent's actual model (e.g., `Opus 4.6`, `Sonnet 4.5`). Each agent's prompt file specifies the exact trailer to use.

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

- **Workflow** (per-story cycle):
  1. **Plan** (first story of epic only): Run `product-owner` (verify story + acceptance criteria + UAT scenarios) and `product-architect` (design schema/API/architecture)
  2. **Branch**: Create a feature branch from `beta`: `git checkout -b <branch-name> beta`
  3. **Implement**: Delegate to the appropriate developer agent (`backend-developer` and/or `frontend-developer`)
  4. **Test**: Delegate to `qa-integration-tester` to write unit tests (95%+ coverage target), integration tests, and Playwright E2E tests
  5. **Commit & PR**: Commit (the pre-commit hook runs all quality gates automatically — selective lint/format/tests on staged files + full typecheck/build/audit), push the branch, create a PR targeting `beta`: `gh pr create --base beta --title "..." --body "..."`
  6. **CI**: Wait for CI: `gh pr checks <pr-number> --watch`
  7. **Review**: After CI passes, run review agents:
     - `product-architect` — verifies architecture compliance, test coverage, and code quality
     - `security-engineer` — reviews for security vulnerabilities, input validation, authentication/authorization gaps
       Both agents review the PR diff and comment via `gh pr review`.
  8. **Fix loop**: If any reviewer requests changes:
     a. The reviewer posts specific feedback on the PR (`gh pr review --request-changes`)
     b. The orchestrator delegates to the original implementing agent on the same branch to address the feedback
     c. The implementing agent pushes fixes, then the orchestrator re-requests review
     d. Repeat until all reviewers approve
  9. **Merge**: Once all agents approve and CI is green, merge: `gh pr merge --squash <pr-url>`
  10. After merge, clean up: `git checkout beta && git pull && git branch -d <branch-name>`

- **Epic-level steps** (after all stories in an epic are merged to `beta`):
  1. **Documentation**: Delegate to `product-owner` to update `README.md` with newly shipped features if significant
  2. **Epic promotion**: Create a PR from `beta` to `main` using a **merge commit** (not squash): `gh pr create --base main --head beta --title "..." --body "..."`
     a. Post acceptance criteria from each story as validation criteria on the promotion PR
     b. Wait for all CI checks to pass on the PR
     c. If the E2E tests are failing, perform an analysis of the failures and either have tests fixed by qa-engineer or code fixed by backend/frontend developer
     d. Once CI is green and validation criteria are posted, **wait for user approval** before merging
     e. After user approval, merge: `gh pr merge --merge <pr-url>`
  3. **Merge-back**: After the stable release is published on `main`, merge `main` back into `beta` so the release tag is reachable from beta's history.

### Release Model

Cornerstone uses a two-tier release model:

| Branch | Purpose                                                 | Release Type                            | Docker Tags              |
| ------ | ------------------------------------------------------- | --------------------------------------- | ------------------------ |
| `beta` | Integration branch — feature PRs land here              | Beta pre-release (e.g., `1.7.0-beta.1`) | `1.7.0-beta.1`, `beta`   |
| `main` | Stable releases — `beta` promoted after epic completion | Full release (e.g., `1.7.0`)            | `1.7.0`, `1.7`, `latest` |

**Merge strategies:**

- **Feature PR -> `beta`**: Squash merge (clean history)
- **`beta` -> `main`** (epic promotion): Merge commit (preserves individual commits so semantic-release can analyze them)

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
  CLAUDE.md                 # Project guide (Claude Code)
  cagent.yaml               # Agent configuration (cagent)
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
```

### Package Dependency Graph

```
@cornerstone/shared  <--  @cornerstone/server
                     <--  @cornerstone/client
@cornerstone/e2e     (standalone — runs against built app via testcontainers)
```

### Build Order

`shared` (tsc) -> `client` (webpack build) -> `server` (tsc)

## Dependency Policy

- **Always use the latest stable (LTS if applicable) version** of a package when adding or upgrading dependencies
- **Pin dependency versions to a specific release** — use exact versions rather than caret ranges (`^`)
- **Avoid native binary dependencies for frontend tooling.** Tools like esbuild, SWC, Lightning CSS, and Tailwind CSS v4 (oxide engine) ship platform-specific native binaries that crash on ARM64 emulation environments. Prefer pure JavaScript alternatives (Webpack, Babel, PostCSS, CSS Modules). Native addons for the server (e.g., better-sqlite3) are acceptable.
- **Zero known fixable vulnerabilities.** Run `npm audit` before committing dependency changes.

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

All automated testing is owned by the `qa-integration-tester` agent. Developer agents write production code; the QA agent writes and maintains all tests.

- **Unit & integration tests**: Jest with ts-jest (co-located with source: `foo.test.ts` next to `foo.ts`)
- **API integration tests**: Fastify's `app.inject()` method (no HTTP server needed)
- **E2E tests**: Playwright (runs against built app)
  - E2E test files live in `e2e/tests/` (separate workspace, not co-located with source)
  - E2E tests run against **desktop, tablet, and mobile** viewports via Playwright projects
  - Test environment managed by **testcontainers**: app, OIDC provider, upstream proxy
- **Test command**: `npm test` (runs all Jest tests across all workspaces via `--experimental-vm-modules` for ESM)
- **Coverage**: `npm run test:coverage` — **95% unit test coverage target** on all new and modified code
- Test files use `.test.ts` / `.test.tsx` extension
- No separate `__tests__/` directories — tests live next to the code they test

## Development Workflow

### Prerequisites

- Node.js >= 24
- npm >= 11
- Docker (for container builds)

### Getting Started

```bash
git submodule update --init   # Initialize wiki submodule
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
| `npm run db:migrate` | Run pending SQL migrations                      |

### Database Migrations

Migrations are hand-written SQL files in `server/src/db/migrations/`, named with a numeric prefix for ordering (e.g., `0001_create_users.sql`). There is no auto-generation tool — developers write the SQL by hand. Run `npm run db:migrate` to apply pending migrations. The migration runner (`server/src/db/migrate.ts`) tracks applied migrations in a `_migrations` table and applies new ones inside a transaction.

### Docker Build

Production images use Docker Hardened Images (DHI) for minimal attack surface and near-zero CVEs.

```bash
docker build -t cornerstone .
docker run -p 3000:3000 -v cornerstone-data:/app/data cornerstone
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

## Protected Files

- **`README.md`**: The `> [!NOTE]` block at the top of `README.md` is a personal note from the repository owner. Agents must NEVER modify, remove, or rewrite this note block. Other sections of `README.md` may be edited as needed.

## Cross-Team Convention

Any agent making a decision that affects other agents (e.g., a new naming convention, a shared pattern, a configuration change) must update `CLAUDE.md` so the convention is documented in one place.

## Memory

Use the `memory` tool to store and retrieve persistent knowledge across sessions. Record architectural decisions, discovered patterns, debugging insights, and project-specific conventions.

On your first session, check if legacy memory files exist at `.claude/agent-memory/<your-agent-name>/`. If they do and you haven't seeded yet, read `MEMORY.md` and all topic files from that directory, then store the key knowledge in your memory tool. Record that seeding is complete to avoid re-processing.

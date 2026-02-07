# Cornerstone - Project Guide

## Project Overview

Cornerstone is a web-based home building project management application designed to help homeowners manage their construction project. It tracks work items, budgets (with multiple financing sources and subsidies), timelines (Gantt chart), and household item purchases.

- **Target Users**: 1-5 homeowners per instance (self-hosted)
- **Deployment**: Single Docker container with SQLite
- **Requirements**: See `plan/REQUIREMENTS.md` for the full requirements document

## Agent Team

This project uses a team of 6 specialized Claude Code agents defined in `.claude/agents/`:

| Agent                   | Role                                                                      |
| ----------------------- | ------------------------------------------------------------------------- |
| `product-owner`         | Defines epics, user stories, and acceptance criteria; manages the backlog |
| `product-architect`     | Tech stack, schema, API contract, project structure, ADRs, Dockerfile     |
| `backend-developer`     | API endpoints, business logic, auth, database operations, backend tests   |
| `frontend-developer`    | UI components, pages, interactions, API client, frontend tests            |
| `qa-integration-tester` | E2E tests, integration tests, bug reports                                 |
| `security-engineer`     | Security audits, vulnerability reports, remediation guidance              |

## GitHub Tools Strategy

| Concern                                                  | Tool                                          |
| -------------------------------------------------------- | --------------------------------------------- |
| Backlog, epics, stories, bugs                            | **GitHub Projects** board + **GitHub Issues** |
| Architecture, API contract, schema, ADRs, security audit | **GitHub Wiki**                               |
| Code review                                              | **GitHub Pull Requests**                      |
| Source tree                                              | Code, configs, `Dockerfile`, `CLAUDE.md` only |

No `docs/` directory in the source tree. All documentation lives on the GitHub Wiki. The GitHub Projects board is the single source of truth for backlog management.

### GitHub Wiki Pages (managed by product-architect and security-engineer)

- **Architecture** — system design, tech stack, conventions
- **API Contract** — REST API endpoint specifications
- **Schema** — database schema documentation
- **ADR Index** — links to all architectural decision records
- **ADR-NNN-Title** — individual ADR pages
- **Security Audit** — security findings and remediation status

### GitHub Repo

- **Repository**: `steilerDev/cornerstone`
- **Default branch**: `main`

## Agile Workflow

We follow an incremental, agile approach:

1. **Product Owner** defines epics covering all requirements, then breaks each epic into user stories during sprint planning
2. **Product Architect** designs schema additions and API endpoints for each epic incrementally (not all upfront)
3. **Backend Developer** implements API and business logic per-epic
4. **Frontend Developer** implements UI per-epic
5. **Security Engineer** reviews periodically
6. **QA Tester** validates integrated features

Schema and API contract evolve incrementally as each epic is implemented, rather than being designed all at once upfront.

## Git & Commit Conventions

All commits follow [Conventional Commits](https://www.conventionalcommits.org/):

- **Types**: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `build:`, `ci:`
- **Scope** optional but encouraged: `feat(work-items):`, `fix(budget):`, `docs(adr):`
- **Breaking changes**: Use `!` suffix or `BREAKING CHANGE:` footer
- Every completed task gets its own commit with a meaningful description

## Tech Stack

| Layer                      | Technology              | Version | ADR     |
| -------------------------- | ----------------------- | ------- | ------- |
| Server                     | Fastify                 | 5.x     | ADR-001 |
| Client                     | React                   | 19.x    | ADR-002 |
| Client Routing             | React Router            | 7.x     | ADR-002 |
| Database                   | SQLite (better-sqlite3) | --      | ADR-003 |
| ORM                        | Drizzle ORM             | 0.38.x  | ADR-003 |
| Bundler (client)           | Vite                    | 6.x     | ADR-004 |
| Styling                    | Tailwind CSS            | 4.x     | ADR-006 |
| Testing (unit/integration) | Vitest                  | 3.x     | ADR-005 |
| Testing (E2E)              | Playwright              | TBD     | ADR-005 |
| Language                   | TypeScript              | ~5.7    | --      |
| Runtime                    | Node.js                 | 20 LTS  | --      |
| Container                  | Docker (Alpine)         | --      | --      |
| Monorepo                   | npm workspaces          | --      | ADR-007 |

Full rationale for each decision is in the corresponding ADR on the GitHub Wiki.

## Project Structure

```
cornerstone/
  package.json              # Root workspace config, shared dev dependencies
  tsconfig.base.json        # Base TypeScript config
  eslint.config.js          # ESLint flat config (all packages)
  .prettierrc               # Prettier config
  vitest.config.ts          # Vitest config (all packages)
  Dockerfile                # Multi-stage Docker build
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
    drizzle.config.ts       # Drizzle-kit config
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
    vite.config.ts
    index.html
    src/
      main.tsx              # Entry point
      App.tsx               # Root component
      components/           # Reusable UI components
      pages/                # Route-level pages
      hooks/                # Custom React hooks
      lib/                  # Utilities, API client
      styles/               # Tailwind entry (index.css)
```

### Package Dependency Graph

```
@cornerstone/shared  <--  @cornerstone/server
                     <--  @cornerstone/client
```

### Build Order

`shared` (tsc) -> `client` (vite build) -> `server` (tsc)

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

- **Unit & integration tests**: Vitest (co-located with source: `foo.test.ts` next to `foo.ts`)
- **API integration tests**: Fastify's `app.inject()` method (no HTTP server needed)
- **E2E tests**: Playwright (configured by QA agent, runs against built app)
- **Test command**: `npm test` (runs all Vitest tests across all workspaces)
- **Coverage**: `npm run test:coverage` (V8 provider)
- Test files use `.test.ts` / `.test.tsx` extension
- No separate `__tests__/` directories -- tests live next to the code they test

## Development Workflow

### Prerequisites

- Node.js >= 20
- npm >= 9
- Docker (for container builds)

### Getting Started

```bash
npm install                   # Install all workspace dependencies
npm run dev                   # Start server (port 3000) + client dev server (port 5173)
```

In development, the Vite dev server at `http://localhost:5173` proxies `/api/*` requests to the Fastify server at `http://localhost:3000`.

### Common Commands

| Command               | Description                                     |
| --------------------- | ----------------------------------------------- |
| `npm run dev`         | Start both server and client in watch mode      |
| `npm run dev:server`  | Start only the Fastify server (tsx watch)       |
| `npm run dev:client`  | Start only the Vite dev server                  |
| `npm run build`       | Build all packages (shared -> client -> server) |
| `npm test`            | Run all tests                                   |
| `npm run lint`        | Lint all code                                   |
| `npm run format`      | Format all code                                 |
| `npm run typecheck`   | Type-check all packages                         |
| `npm run db:generate` | Generate Drizzle migrations from schema changes |
| `npm run db:migrate`  | Run pending database migrations                 |

### Docker Build

```bash
docker build -t cornerstone .
docker run -p 3000:3000 -v cornerstone-data:/app/data cornerstone
```

### Environment Variables

| Variable       | Default                    | Description                                   |
| -------------- | -------------------------- | --------------------------------------------- |
| `PORT`         | `3000`                     | Server port                                   |
| `HOST`         | `0.0.0.0`                  | Server bind address                           |
| `DATABASE_URL` | `/app/data/cornerstone.db` | SQLite database path                          |
| `LOG_LEVEL`    | `info`                     | Log level (trace/debug/info/warn/error/fatal) |
| `NODE_ENV`     | `production`               | Environment                                   |

Additional variables for OIDC, Paperless-ngx, and sessions will be added as those features are implemented.

## Cross-Team Convention

Any agent making a decision that affects other agents (e.g., a new naming convention, a shared pattern, a configuration change) must update this file so the convention is documented in one place.

# Product Architect Memory

## Tech Stack (Accepted)

- Server: Fastify 5.x (ADR-001), Client: React 19 + React Router 7 (ADR-002)
- DB: SQLite via better-sqlite3 + Drizzle ORM (ADR-003), Bundler: Webpack 5.x (ADR-004)
- Tests: Jest 30.x + Playwright (ADR-005), Styling: CSS Modules (ADR-006)
- Structure: npm workspaces monorepo (ADR-007), TypeScript ~5.9, Node.js 24 LTS

## Project Layout

- `shared/` -> `client/` -> `server/` (build order)
- All plugins use `fastify-plugin` (fp), registration: config -> errorHandler -> compress -> cookie -> db -> auth -> routes -> static

## Key Patterns

- All API endpoints under `/api/` prefix, error shape: `{ error: { code, message, details? } }`
- Offset pagination: page (1-indexed), pageSize (default 25, max 100)
- Tags/users NOT paginated (small collections)
- PATCH with tagIds replaces entire tag set (set-semantics)
- Junction tables use composite PKs (no surrogate id)

## Naming Conventions

- DB: snake_case | TS vars: camelCase | TS types: PascalCase | Files: camelCase.ts (React: PascalCase.tsx) | API: kebab-case | Env: UPPER_SNAKE_CASE

## Migrations (10 total)

- 0001: users + sessions (EPIC-01)
- 0002: work_items + tags + notes + subtasks + dependencies (EPIC-03)
- 0003: budget_categories + vendors + invoices + budget_sources + subsidy_programs + junctions (EPIC-05)
- 0004: flat budget fields on work_items (SUPERSEDED by 0005)
- 0005: work_item_budgets table (budget rework) (EPIC-05)
- 0006: milestones + milestone_work_items + lead_lag_days (EPIC-06)
- 0007: work_item_milestone_deps (EPIC-06) -- NOT documented in Schema.md wiki
- 0008: actual_start/end_date, blocked->not_started migration (EPIC-06)
- 0009: document_links polymorphic table (EPIC-08)
- 0010: household_items + 5 supporting tables (EPIC-04) -- DESIGNED, not yet implemented

## ADRs (ADR-001 through ADR-016)

- ADR-001-009: Tech stack + error handling
- ADR-010: Auth (sessions + OIDC + scrypt)
- ADR-011: E2E (Playwright + Testcontainers)
- ADR-012: Pagination conventions
- ADR-013: Gantt chart (custom SVG)
- ADR-014: Scheduling engine (server-side CPM)
- ADR-015: Paperless-ngx integration (proxy + polymorphic links)
- ADR-016: Household items (separate entity with parallel structure)

## EPIC Status

- EPIC-01 Auth: Complete (promoted to main)
- EPIC-03 Work Items: Complete (promoted to main)
- EPIC-05 Budget: Complete (promoted to main, v1.9.0)
- EPIC-06 Timeline/Gantt: Complete (promoted to main, v1.10.0)
- EPIC-08 Documents: Complete (promoted to main, v1.11.0)
- EPIC-04 Household Items: Architecture designed (PR #395), implementation pending

## GitHub Wiki

- Wiki is git submodule at `wiki/`. Sync: `git submodule update --init wiki && git -C wiki pull origin master`
- ADR-001 through ADR-016, Architecture, Schema, API-Contract, Home, ADR-Index, Style-Guide, Security-Audit
- **Always push wiki before creating PR** -- submodule ref must be committed in feature branch

### Wiki Update Discipline (CRITICAL)

The wiki MUST be updated as part of story implementation, not caught at review time.

- New endpoint -> API-Contract.md
- New/changed table/column -> Schema.md
- Architectural decision -> ADR-NNN-\*.md + ADR-Index.md

## EPIC-04 Household Items (Latest Work)

See `epic04-household-items.md` for full details.

- 6 new tables, 20 API endpoints, ADR-016
- Reuses shared tags, vendors, budget_categories, budget_sources, subsidy_programs
- document_links already supports household_item entity_type
- Budget overview must aggregate both work_item_budgets and household_item_budgets

## Known Wiki Documentation Gaps

- Migration 0007 (work_item_milestone_deps) not documented in Schema.md
- Wiki sandbox worktrees have persistent permission issues with `.git/objects/pack/`

## Sandbox Limitations (not real project issues)

- esbuild SIGILL on emulated aarch64; Docker build fails due to TLS firewall
- 4GB RAM: Jest OOM mitigated with --maxWorkers=2, --max-old-space-size=2048

## N+1 Queries (Accepted at Current Scale)

- `getAllMilestones`: per-row countLinkedWorkItems + getCreatedByUser (acceptable <50 milestones)

## PR Review Notes

- Cannot `gh pr review --approve` own PRs -- use `--comment` instead
- Root `typecheck` script builds shared first

## Config Files

- Root: package.json, tsconfig.base.json, eslint.config.js, .prettierrc, jest.config.ts
- Server: schema in src/db/schema.ts, migrations in src/db/migrations/
- Client: webpack.config.cjs (proxies /api to localhost:3000)

## CI/CD (ADR-008)

- GitHub Actions + semantic-release + Docker Hub + Docker Scout + Dependabot
- Feature PR -> beta (squash merge); beta -> main (merge commit)

## Topic Files

- `story-reviews.md` -- detailed review notes per story
- `epic03-refinement.md` -- 40 consolidated refinement items from EPIC-03
- `epic05-budget.md` -- EPIC-05 budget management details
- `epic04-household-items.md` -- EPIC-04 household items architecture

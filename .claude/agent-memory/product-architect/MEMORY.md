# Product Architect Memory

## Topic Files

- [Recurring patterns & traps](recurring-patterns.md) — polymorphic FK cleanup, XOR CHECK vs SET NULL, forked-function drift, test smells, cross-layer contract drift, ajv `anyOf`, N+1 sites, async writes surviving state resets, cross-reference rot in documented-bound comments (#1939)
- [Dual-rail aggregation](dual-rail-aggregation.md) — Rail A/B tagged-deposit invariants (#1891/PR #1894), residual-denominator rule, isSplit UNION
- [Source-report split inference](source-report-split-inference.md) — budgetLines[]/deposits[] are this-source-scoped, so †/‡ classification is a proxy; proposed `splitKind`; pdfmake `'2*'` width trap
- [Story reviews](story-reviews.md) — per-story and per-PR review log
- [Client PDF pipeline](client-pdf-pipeline.md) — ADR-034 report PDF generation + the reportContent content/layout split (#1900)
- [Diary drafts pattern](diary-drafts-pattern.md) — ADR-022 draft lifecycle via status column on parent table
- [EPIC-03 refinement](epic03-refinement.md) — 40 consolidated refinement items
- [EPIC-04 household items](epic04-household-items.md) · [EPIC-05 budget](epic05-budget.md) · [EPIC-17 i18n](epic17-i18n.md) · [EPIC-18 areas & trades](epic18-areas-trades.md)

## Tech Stack (Accepted)

- Fastify 5.x (ADR-001) · React 19 + React Router 7 (ADR-002) · SQLite/better-sqlite3 + Drizzle (ADR-003)
- Webpack 5.x (ADR-004) · Jest 30.x + Playwright (ADR-005) · CSS Modules (ADR-006) · npm workspaces (ADR-007)
- TypeScript ~6.0, Node.js 24 LTS. Canonical table lives in CLAUDE.md — trust it over this file.

## Project Layout

- Build order `shared/` -> `client/` -> `server/`
- All plugins use `fastify-plugin` (fp). Registration: config -> errorHandler -> compress -> cookie -> db -> auth -> routes -> static
- Root: package.json, tsconfig.base.json, eslint.config.js, .prettierrc, jest.config.ts
- Server: `src/db/schema.ts`, migrations in `src/db/migrations/`. Client: `webpack.config.cjs` (proxies /api to :3000)

## Key Conventions

- All endpoints under `/api/`; error shape `{ error: { code, message, details? } }`
- Offset pagination: `page` (1-indexed), `pageSize` (default 25, max 100). Small collections (areas, trades, users) NOT paginated
- Junction tables use composite PKs — EXCEPT `invoice_budget_lines` (surrogate UUID: carries `itemized_amount`, needs individual CRUD)
- Naming: DB snake_case | TS vars camelCase | TS types PascalCase | files camelCase.ts (React PascalCase.tsx) | API kebab-case | env UPPER_SNAKE_CASE

## GitHub Wiki

- Git submodule at `wiki/`. Sync: `git submodule update --init wiki && git -C wiki pull origin master`
- Submodule is normally in **detached HEAD** at origin/master — push with `git push origin HEAD:master`
- Pages: Architecture, Schema, API-Contract, Home, ADR-Index, ADR-NNN-*, Style-Guide (ux-designer), Security-Audit (security-engineer)
- **Always push wiki before creating the PR** — the submodule ref must be committed on the feature branch. If you push wiki content outside the branch, flag that the PR's ref needs bumping.

### Wiki Update Discipline (CRITICAL)

Update the wiki as part of story implementation, never as a review catch:
new endpoint -> API-Contract.md · new/changed table or column -> Schema.md · decision -> ADR-NNN-*.md + ADR-Index.md.
On any wiki/implementation divergence, fix the wiki and append a **Deviation Log** row (each page has one at the bottom).

## ADRs

ADR-001..034. Notable: 010 auth (sessions + OIDC + scrypt) · 011 E2E (Playwright + Testcontainers) · 012 pagination ·
013 Gantt (custom SVG) · 014 scheduling (server-side CPM) · 015 Paperless-ngx (proxy + polymorphic links) ·
016 household items · 018 invoice_budget_lines (M:N, XOR CHECK, ON DELETE CASCADE) · 022 diary drafts ·
028 areas & trades · 034 client-side report PDF. Wiki ADR-Index is authoritative.

## Migrations

Sequential SQL in `server/src/db/migrations/`, currently through **0044** (deposit `budget_source_id`).
Read the directory rather than trusting a list here. Known gap: migration 0007 (`work_item_milestone_deps`)
is still undocumented in Schema.md.

## CI/CD (ADR-008)

- GitHub Actions + semantic-release + Docker Hub + Docker Scout + Dependabot
- Feature PR -> `beta` (squash merge); `beta` -> `main` (merge commit)
- Beta PRs gate on `Quality Gates` only; `main` also requires `E2E Gates`

## PR Review Notes

- Cannot `gh pr review --approve` your own PR — use `gh pr comment` instead
- Root `typecheck` script builds `shared` first
- Verdicts: `--request-changes` for critical/high only; `--approve` with findings noted for medium/low

## Sandbox Limitations (not real project issues)

- esbuild SIGILL on emulated aarch64; Docker build fails behind the TLS firewall
- 4GB RAM: Jest OOM mitigated with `--maxWorkers=2 --max-old-space-size=2048`
- Stale worktrees under `.claude/worktrees/` cause jest-haste-map duplicate-package failures.
  Work around with `npx jest <file> --modulePathIgnorePatterns='/.claude/worktrees/'`

# Product Architect Memory

## Topic Files

- [Recurring patterns & traps](recurring-patterns.md) — polymorphic FK cleanup, XOR CHECK vs SET NULL, forked-function drift, test smells, cross-layer contract drift, ajv `anyOf`, N+1 sites, async writes surviving state resets, the revert test for fixes that only relax an invariant — re-run it yourself on round 2 (#1968/PR #2002), cross-reference rot in documented-bound comments (#1939), usePreferences per-instance store + serialized-write-queue review (#1955), capability-retained-but-producer-removed (#1959), reinstated-producer-vs-negative-guards (#1965), AC reversal by a polish issue (#1959), amount-threshold booleans narrowing status-existence booleans (#1897), prettier is not CI-gated, single-occurrence delimiter guard tests + German ordinals vs list markers + pre-validating regex fix specs (#1952), `Pick<>` is not a forcing function + caller-supplied monotonic seq reintroduces the ref + cascade tables smuggle behaviour changes + neutralised-trigger-left-in-code (#1947), tier factory only forces the cases that spread it (#1988), regex mirroring a third-party grammar + `parseInt` trailing garbage + env vars documented in four places (#1970, PR #1989), guard-deleted-because-it-looked-like-the-bug + rate-limit identity-check gate + `request.ip` nullability types-lie + CVE test needs a negative control (#1995, PR #1998), prettier config resolution is path-based so /tmp baseline checks lie + wiki is not prettier-ignored + document the invariant not the absence-of-code (#1998 wiki pass), comment-refreshed-but-assertion-left-behind + contract inversion makes pre-existing negatives unconditional + surgical tagging misses read-only value nodes (#1910, PR #2004 r2), the-prop-landed-is-not-the-prop-is-wired + redundant-tag-a-test-asserts + `aria-label` cannot be language-tagged (#1910, PR #2004 r3), `count >= 1` + all-match is a per-instance assertion masquerading as coverage — revert each call site individually, use `toBe(N)` (#1910, PR #2004 r4)
- [Dual-rail aggregation](dual-rail-aggregation.md) — Rail A/B tagged-deposit invariants (#1891/PR #1894), residual-denominator rule, isSplit UNION
- [Source-report split inference](source-report-split-inference.md) — budgetLines[]/deposits[] are this-source-scoped, so †/‡ classification is a proxy; proposed `splitKind`; pdfmake `'2*'` width trap; wiki + shared type JSDoc both fixed (API-Contract #1914, sourceReport.ts #1917/PR #1994)
- [Story reviews](story-reviews.md) — per-story and per-PR review log
- [Client PDF pipeline](client-pdf-pipeline.md) — ADR-034 report PDF generation, reportContent content/layout split (#1900), `dontBreakRows` silent-drop rule, document-level deduplicated legend (#1965) — ADR-034 B4 rule + legend addendum landed in PR #1979; per-locale header character budget + "no interface `t` in header/footer" (#1937/#1938, PR #1982); pdfmake `Content` is unspreadable (TS2698) but `Object.assign` needs no cast, and per-item `wordBreak`/newline-only-run facts (#1968, PR #2002). **ADR-034 debt fully PAID 2026-08-04 (#1914)**: width rule #1 (`max(horizontalRatio) <= 1`, not `_minWidth`), module table, override keys, dontBreakRows/height-bound section, injection-only locale contract. Still-open code defect: `merge.ts:134` footer uses interface `t` — needs an issue. **ADR-034 rule #1 is documented but unenforced (`horizontalRatio`: 0 hits in `client/`) → issue #2003, mine**
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
- **Verify published-ness with `git -C wiki ls-remote origin master` vs `git ls-tree HEAD wiki`**, never with
  `git -C wiki log` (shows unpushed commits as HEAD) or a refspec-less `fetch` (leaves origin/master stale)
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
  Work around with `npx jest <file> --modulePathIgnorePatterns='/.claude/worktrees/'` — **but only from
  the base checkout.** Inside a worktree that pattern matches the cwd itself, so jest reports
  `0 files checked across 3 projects` / `Pattern: <path> - 0 matches` and exits 1. That looks like a
  missing/misnamed test file, not a config problem, and can be misread as "the tests don't exist".
  When running from a worktree, drop the flag entirely.
- Confirm a run actually executed something: `Tests: N passed` — a `--maxWorkers=1 -t <filter>` run that
  matched nothing still exits 0 in some invocations, so a silent pass is not evidence.
- **`.claude/agent-memory/` exists in BOTH the base checkout and every worktree, at diverging lengths.**
  An "absolute" path that omits the `.claude/worktrees/<name>/` segment silently reads/edits the _base_
  copy — no error, just stale content and an edit that never reaches the PR. Hit this on 2026-08-04
  (base 263 lines vs worktree 416). Build memory paths off the cwd shown in the env block, and if a
  `Read` offset unexpectedly reports "file is shorter than offset", suspect the wrong copy before
  assuming the memory is wrong. `wc -l` both paths to confirm.

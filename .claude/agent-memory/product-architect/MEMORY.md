# Product Architect Memory

## Topic Files

- [Recurring patterns & traps](recurring-patterns.md) — review traps by PR: forked-function drift, vacuous negatives after contract inversion, revert tests, DataTable dual-DOM testids, env-var drift sweep, wiki gitlink checks; full entry index at the bottom of the file
- [AJV strips unknown props; ADR-010 scrypt drift](recurring-patterns.md) — `additionalProperties:false` never 400s here; probe with inject (#2122)
- [Tuple migration leaves a second derivation](recurring-patterns.md) — after a badge map moves to a tuple, grep the same file for hand-listed enumOptions/<option> lists (PR #2171)
- [fs.stat vs readability; pre-reply validation](recurring-patterns.md) — `stat` proves existence only, use `fs.access(R_OK)`; moving a check before the reply makes its error copy live, so re-read it (PR #2168)
- [Phantom imports escape --omit=dev audit](recurring-patterns.md) — sweep shipped-source imports vs `dependencies`; nanoid case (PR #2180)
- ["One map" consolidation PRs](recurring-patterns.md) — grep enum class names + undefined `--color-status-*` tokens; canonicalising one surface splits a vocabulary (PR #2270)
- ["Every X" claims](recurring-patterns.md) — grep the old idiom repo-wide; the diff only shows converted sites (LIKE escaping, PR #2272)
- [Column meaning change orphans readers](recurring-patterns.md) — grep all reads of a re-defined field (planned vs floored dates, PR #2274)
- [Scanner-blind spots in source guards](recurring-patterns.md) — query appended to routeUrl() escapes the literal guard; generator extractors must check attr wiring (PR #2276)
- [Plan checks vs the router](recurring-patterns.md) — a rule checked against resolveLocation can accept what the router never serves (page-base query maps, PR #2278)
- [Re-runnable crash recovery](recurring-patterns.md) — flip the marker between a rollback's destructive and restoring loops; side effects before a fallible start step (ADR-037)
- [Recovery steps on a full disk](recurring-patterns.md) — re-assert persisted state only when it differs; free regenerable space before any write (PR #2169)
- [Dual-rail aggregation](dual-rail-aggregation.md) — Rail A/B tagged-deposit invariants (#1891/PR #1894), residual-denominator rule, isSplit UNION
- [Source-report split inference](source-report-split-inference.md) — budgetLines[]/deposits[] are this-source-scoped so array-shape gates are proxies; **`splitKind` SHIPPED #1911/PR #2015** incl. the ≠S-per-arm predicate, the residual arithmetic proving `(less deposit)` in both directions, the UNION-dedup/`COUNT(*)` trap, and why `isSplit` must be retained as an independent cross-check; pdfmake `'2*'` width trap; wiki + shared type JSDoc fixed (#1914, #1917/PR #1994); **principle now ADR-036 (scope-matching rule + converse); fields renamed `budgetLinesForSource`/`depositsVisibleToSource` (#2017); `aiError` write-backs = error-display carve-out, not a tier opt-out (Architecture, #2014)**
- [Story reviews](story-reviews.md) — per-story and per-PR review log. PR #2152: "legacy NULL status" predicate branch vs a NOT NULL column — see recurring-patterns
- [Client PDF pipeline](client-pdf-pipeline.md) — ADR-034 report PDF: content/layout split, per-cell `_minWidth` width rule, computed column geometry (`columns.ts`), injection-only locale contract, open ADR-034 follow-ups; status summary at the bottom of the file
- [Release toolchain](release-toolchain.md) — ccc preset major must match the conventional-changelog-writer engine (hold ccc at v9 until release-notes-generator@15); empty release notes hid for months; a crash-fix can restore the _silent_ bug, judge on output not on the error going away (#2082)
- [npm overrides re-resolution](npm-overrides-reresolution.md) — `npm install` keeps stale locked nodes after an override edit; use `npm update <names>`; re-audit pins; `npm ls --all` exits 1 by design since Babel 8 — use the CLAUDE.md sweep
- [CI Jest shard tuning](ci-test-job-tuning.md) — 6 duration-packed shards x 2 workers (2-core runners), no testTimeout override; profile slow files with --cpu-prof before touching CI knobs; nothing hardcodes the shard count
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

- Git submodule at `wiki/`. The orchestrator syncs it once per skill run (CLAUDE.md > Agent Context Discipline) — read the checked-out files directly, don't re-sync
- Submodule is normally in **detached HEAD** at origin/master — push with `git push origin HEAD:master`
- **Verify published-ness with `git -C wiki ls-remote origin master` vs `git ls-tree HEAD wiki`**, never with
  `git -C wiki log` (shows unpushed commits as HEAD) or a refspec-less `fetch` (leaves origin/master stale)
- Pages: Architecture, Schema, API-Contract, Home, ADR-Index, ADR-NNN-*, Style-Guide (ux-designer), Security-Audit (security-engineer)
- **Always push wiki before creating the PR** — the submodule ref must be committed on the feature branch. If you push wiki content outside the branch, flag that the PR's ref needs bumping.
- **No workflow in `.github/workflows/` checks out submodules** — an unpushed wiki commit recorded as the
  parent's submodule ref keeps CI fully green and merges silently, then breaks `git submodule update` on
  `beta`. Recurred on PR #2008 (recorded `da1324b`, remote at `b12ebb1`; I pushed it during re-review).
  **Make the ls-remote-vs-ls-tree check a standing step of every PR review that touches `wiki`**, not just
  of your own wiki pushes — a later commit in the same branch can advance local HEAD past what was pushed.

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
- Verdicts (per CLAUDE.md > Reviewer Verdict Policy): `--approve` only with zero findings; any finding of any severity is `--request-changes` + `fix-in-session`; never file follow-up issues

## Sandbox Limitations (not real project issues)

- esbuild SIGILL on emulated aarch64; Docker build fails behind the TLS firewall
- 4GB RAM: Jest OOM mitigated with `--maxWorkers=2 --max-old-space-size=2048`
- Stale worktrees under `.claude/worktrees/` cause jest-haste-map duplicate-package failures.
  Work around with `npx jest <file> --modulePathIgnorePatterns='/.claude/worktrees/'` — **but only from
  the base checkout.** Inside a worktree that pattern matches the cwd itself, so jest reports
  `0 files checked across 3 projects` / `Pattern: <path> - 0 matches` and exits 1. That looks like a
  missing/misnamed test file, not a config problem, and can be misread as "the tests don't exist".
  When running from a worktree, drop the flag entirely.
- **Run client Jest with `NODE_OPTIONS=--experimental-vm-modules`** (the root `npm test` does this). Without it,
  `jest.unstable_mockModule` silently does not apply, and the DataTable suites fail with `useToast must be used within
a ToastProvider`. That looks like a PR regression but is not one (PR #2137).
- Confirm a run actually executed something: `Tests: N passed` — a `--maxWorkers=1 -t <filter>` run that
  matched nothing still exits 0 in some invocations, so a silent pass is not evidence.
- **Worktree-isolation guard** refuses Bash commands mixing `git -C <other dir>` with pipes/subshells or a
  runtime variable in an option slot (`sed -n … $F`). Run each git command plainly from its own `cd`, write
  diffs to `/tmp` files, then scan/process them in a separate call.
- **`.claude/agent-memory/` exists in BOTH the base checkout and every worktree, at diverging lengths.**
  An "absolute" path that omits the `.claude/worktrees/<name>/` segment silently reads/edits the _base_
  copy — no error, just stale content and an edit that never reaches the PR. Hit this on 2026-08-04
  (base 263 lines vs worktree 416). Build memory paths off the cwd shown in the env block, and if a
  `Read` offset unexpectedly reports "file is shorter than offset", suspect the wrong copy before
  assuming the memory is wrong. `wc -l` both paths to confirm.

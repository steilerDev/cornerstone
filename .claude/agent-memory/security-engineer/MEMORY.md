# Security Engineer Memory

> Detailed findings per story/PR live in `review-history.md`. This index stays under 200 lines.

## Repo & Process

- **Repo**: `steilerDev/cornerstone`, beta → main model
- **Auth comment**: All comments must start with `**[security-engineer]**`
- **Commit trailer**: `Co-Authored-By: Claude security-engineer (Sonnet 4.6) <noreply@anthropic.com>`
- **PR review**: Post as `--comment` (NOT `--approve` — same token can't approve own PRs)
- **npm audit**: Run `npm audit --omit=dev` for production vuln check (dev audit includes npm's own bundled tools which have 39 vulns unrelated to app)

## Established Baseline Security Controls

Verified across EPIC-01/02/03/05 — all confirmed STRONG:

- **Argon2id** password hashing (N=65536, t=3, p=4) — OWASP-compliant
- **Session tokens**: 256-bit crypto.randomBytes(32), HttpOnly+Secure+SameSite=strict cookies
- **OIDC**: openid-client@6.x, 256-bit state param, server-side Map, 10-min TTL, one-time use
- **RBAC**: requireRole() preHandler, fresh DB lookup every request (no caching)
- **SQL injection**: Drizzle ORM parameterized queries throughout; `sql\`\`` tagged templates also safe
- **XSS**: Zero dangerouslySetInnerHTML/innerHTML/eval in any client code across all EPICs
- **CSRF**: SameSite=strict session cookies (no token needed)
- **Sensitive data**: toUserResponse() strips passwordHash/oidcSubject; toBudgetCategory() explicit field mapping
- **Dockerfile**: DHI images (near-zero CVEs), non-root user, multi-stage, no shell in prod
- **Dependencies**: 0 production vulnerabilities (npm audit --omit=dev)

## Review Status by Story/PR

See `review-history.md` for detailed findings per PR.

| PR   | Story                                                                             | Status                                                                                                                        | Date       |
| ---- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------- |
| #55  | #28 Schema                                                                        | APPROVED                                                                                                                      | 2026-02-16 |
| #56  | #30 Local Auth                                                                    | APPROVED                                                                                                                      | 2026-02-16 |
| #57  | #32 Sessions                                                                      | APPROVED w/ medium findings                                                                                                   | 2026-02-16 |
| #60  | #37 RBAC                                                                          | APPROVED                                                                                                                      | 2026-02-16 |
| #61  | #34 OIDC                                                                          | APPROVED                                                                                                                      | 2026-02-16 |
| #62  | #36 User Profile                                                                  | APPROVED                                                                                                                      | 2026-02-16 |
| #63  | #38 Admin Mgmt                                                                    | APPROVED                                                                                                                      | 2026-02-16 |
| #69  | #68 Logout UI                                                                     | APPROVED                                                                                                                      | 2026-02-16 |
| #82  | EPIC-01 Promo                                                                     | APPROVED                                                                                                                      | 2026-02-16 |
| #97  | EPIC-03 Schema                                                                    | APPROVED                                                                                                                      | 2026-02-17 |
| #98  | 3.2 Work Items CRUD                                                               | APPROVED                                                                                                                      | 2026-02-17 |
| #101 | 3.3 Tag Mgmt                                                                      | APPROVED                                                                                                                      | 2026-02-17 |
| #102 | 3.4 Notes/Subtasks                                                                | APPROVED w/ medium                                                                                                            | 2026-02-17 |
| #103 | 3.7 Dependencies                                                                  | APPROVED w/ medium                                                                                                            | 2026-02-17 |
| #104 | 3.5 Work Items List                                                               | APPROVED                                                                                                                      | 2026-02-17 |
| #105 | 3.6 Work Item Detail                                                              | APPROVED                                                                                                                      | 2026-02-17 |
| #106 | 3.8 Keyboard Shortcuts                                                            | APPROVED                                                                                                                      | 2026-02-17 |
| #150 | #142 Budget Categories                                                            | APPROVED                                                                                                                      | 2026-02-20 |
| #151 | #143 Vendor Mgmt                                                                  | APPROVED w/ low findings                                                                                                      | 2026-02-20 |
| #152 | #144 Invoice Mgmt                                                                 | APPROVED w/ low findings                                                                                                      | 2026-02-20 |
| #153 | #145 Budget Sources                                                               | APPROVED w/ low findings                                                                                                      | 2026-02-20 |
| #157 | #148 Budget Overview                                                              | APPROVED                                                                                                                      | 2026-02-20 |
| #158 | #149 Budget Sub-Nav                                                               | APPROVED                                                                                                                      | 2026-02-20 |
| #187 | EPIC-05 Stories 5.9-5.12 Budget Rework                                            | APPROVED w/ low finding                                                                                                       | 2026-02-21 |
| #193 | #186 5.12 Budget Frontend Rework                                                  | APPROVED w/ low findings                                                                                                      | 2026-02-22 |
| #195 | Budget Hero Bar + Category Filter                                                 | APPROVED                                                                                                                      | 2026-02-22 |
| #203 | Standalone Invoices View                                                          | APPROVED w/ informational                                                                                                     | 2026-02-23 |
| #247 | EPIC-06 Milestones Backend                                                        | APPROVED w/ low/informational                                                                                                 | 2026-02-24 |
| #248 | EPIC-06 Scheduling Engine (CPM)                                                   | APPROVED w/ informational                                                                                                     | 2026-02-24 |
| #249 | EPIC-06 Timeline Data API                                                         | APPROVED                                                                                                                      | 2026-02-24 |
| #250 | EPIC-06 Gantt Chart Core                                                          | APPROVED                                                                                                                      | 2026-02-24 |
| #253 | EPIC-06 Gantt Interactive Features                                                | APPROVED                                                                                                                      | 2026-02-24 |
| #254 | EPIC-06 Milestones Frontend — CRUD Panel & Diamond Markers                        | APPROVED                                                                                                                      | 2026-02-24 |
| #263 | EPIC-06 UAT Fixes (projected dates, WorkItemSelector portal)                      | APPROVED w/ informational                                                                                                     | 2026-02-25 |
| #267 | EPIC-06 UAT Feedback Fixes (column zoom, milestone rows, back-to-timeline nav)    | APPROVED (no findings)                                                                                                        | 2026-02-25 |
| #306 | Gantt dependency highlighting on hover — frontend-only, Issue #295                | APPROVED (no findings)                                                                                                        | 2026-02-26 |
| #308 | EPIC-07 Actual dates, delay tracking, blocked-status removal                      | COMMENTED (no blocking findings)                                                                                              | 2026-02-26 |
| #316 | Retro improvements — dep pinning, shared CSS, formatDate, invoiceService refactor | COMMENTED (1 low finding: heredoc path injection in shell script)                                                             | 2026-02-27 |
| #320 | Bug fixes #318 (login logo) + #319 (scheduling engine rules/isLate)               | COMMENTED (no findings)                                                                                                       | 2026-02-27 |
| #396 | EPIC-04 Story 4.1 — Household Items Schema & Migration                            | COMMENTED (2 informational)                                                                                                   | 2026-03-02 |
| #397 | EPIC-04 Story 4.2 — Household Items CRUD API                                      | COMMENTED (2 informational)                                                                                                   | 2026-03-02 |
| #398 | EPIC-04 Story 4.3 — Household Items List Page (frontend)                          | COMMENTED (no findings)                                                                                                       | 2026-03-03 |
| #400 | EPIC-04 Story #391 — Household Item Detail Page                                   | COMMENTED (1 low: javascript: URL protocol not validated)                                                                     | 2026-03-03 |
| #401 | EPIC-04 Story 4.6 — Household Items Budget Integration                            | COMMENTED (2 informational)                                                                                                   | 2026-03-03 |
| #414 | EPIC-04 Story 4.9 — Invoice Linking for Household Item Budget Lines               | COMMENTED (2 informational)                                                                                                   | 2026-03-03 |
| #416 | EPIC-04 Story 4.10 — HI Timeline Dependencies & Delivery Date Scheduling          | COMMENTED (2 informational)                                                                                                   | 2026-03-03 |
| #451 | Bug fix #449 — HI Timeline Navigation (frontend-only Gantt interaction)           | APPROVED (no findings)                                                                                                        | 2026-03-04 |
| #460 | Bug fix #458 — Inline status selector with auto-set delivery date                 | APPROVED (no findings)                                                                                                        | 2026-03-04 |
| #466 | EPIC-05 Story 5.13 — Budget Breakdown Table (`GET /api/budget/breakdown`)         | COMMENTED (2 informational: no route schema, unbounded SELECT)                                                                | 2026-03-05 |
| #516 | EPIC-09 Story #509 — Unified Tags & Categories Management Page                    | COMMENTED (3 informational: householdItemCount 409 details, no response schema on GET list, describe.skip on breakdown tests) | 2026-03-06 |
| #612 | EPIC-15 Story 15.1 — Invoice-Budget-Line Junction Schema & Migration              | COMMENTED (2 informational)                                                                                                   | 2026-03-08 |
| #614 | EPIC-15 Story 15.2 — Invoice cost basis for subsidy reductions                    | COMMENTED (1 informational: pending invoices count toward cost basis — product design choice, not security risk)              | 2026-03-08 |
| #615 | EPIC-15 Story #606 — Invoice Budget Lines Frontend (InvoiceBudgetLinesSection)    | COMMENTED (no findings)                                                                                                       | 2026-03-08 |
| #708 | EPIC-09 Story #470 — User Preferences Infrastructure                              | COMMENTED (2 informational: value no maxLength, DELETE key param no bounds)                                                   | 2026-03-09 |

## Known Open Recommendations (Low Priority)

These have been noted in previous reviews. **GitHub Issue #315** tracks items 1-6 (security hygiene backlog story). Items 7-17 remain as informational tracking.

1. **Rate limiting** (Medium): Add @fastify/rate-limit to login/setup/password endpoints
2. **Security headers** (Low): Install @fastify/helmet for CSP, HSTS, X-Frame-Options
3. **Account lockout** (Low): After N failed login attempts
4. **Case-insensitive DB unique index** (Low): For budget_categories.name (PR #150)
5. **409 error detail suppression** (Low): Remove counts from CATEGORY_IN_USE/VENDOR_IN_USE/BUDGET_SOURCE_IN_USE/BUDGET_LINE_IN_USE 409 details fields (PRs #150, #151, #152, #187)
6. **Vendor email format validation** (Low): Add `format: 'email'` to vendor schema (PR #151)
7. **Missing server-side maxLength** (Low): budget_sources.terms/notes, any future text fields (PR #151, #152)
8. **workItemBudgetId cross-vendor boundary** (Low): invoiceService.ts doesn't verify budget line's work item is vendor-related (PR #187)
9. **Swallowed promise rejection in budget line fetch** (Low): VendorDetailPage.tsx:1037,1256 — no .catch() on fetchWorkItemBudgets (PR #193) [NEW pages in PR #203 fixed this for InvoicesPage/InvoiceDetailPage]
10. **pageSize 200 exceeds server maximum** (Low): RESOLVED in PR #203 — new InvoicesPage/InvoiceDetailPage use pageSize: 100 correctly
11. **getInvoiceByIdSchema missing additionalProperties: false** (Informational): standaloneInvoices.ts params schema — no exploit path (PR #203)
12. **Milestone color field lacks schema-layer pattern constraint** (Low): milestones.ts createMilestoneSchema/updateMilestoneSchema — service validates correctly but schema doesn't (PR #247)
13. **leadLagDays field has no magnitude bound** (Informational): dependencies.ts schema — extreme values flow into CPM arithmetic (PR #247, also relevant for PR #248 scheduling engine)
14. **CircularDependencyError cycle field exposes internal work item IDs** (Informational): schedule.ts 409 details — acceptable in single-tenant model (PR #248)
15. **anchorWorkItemId schema lacks minLength: 1** (Informational): schedule.ts schema — empty string caught by handler not schema (PR #248)
16. **workItemIds schema lacks maxItems/maxLength** (Informational): milestones.ts createMilestoneSchema — array and items have no size bounds; N+1 DB loop in milestoneService (PR #263)
17. **actualStartDate/actualEndDate cross-field ordering** (Informational): workItems.ts — no validation that actualEndDate >= actualStartDate at schema or service layer; same gap as existing startDate/endDate pair (PR #308)
18. **leadLagDays no magnitude bound on HI dep endpoints** (Informational): householdItems.ts createHouseholdItemDepSchema — mirrors finding #13 for WI deps (PR #416)
19. **GET /api/work-items/:id/dependent-household-items no work item existence check** (Informational): workItems.ts handler — returns 200+empty array for non-existent WI IDs instead of 404; listDependentHouseholdItemsForWorkItem service also lacks assertWorkItemExists guard (PR #416)
20. **Preferences value field no maxLength** (Informational): preferences.ts upsertPreferenceSchema — `value: { type: 'string' }` with no maxLength; ThemeContext correctly validates enum before applying; future consumers of other keys may not (PR #708)
21. **DELETE preferences key param no bounds** (Informational): preferences.ts deletePreferenceSchema params — `key: { type: 'string' }` missing minLength:1/maxLength:100 that PATCH schema has; empty-string always 404 so no exploit path (PR #708)

## Key Architecture Patterns (Security-Relevant)

- **Public routes exempted from auth**: `/api/auth/setup`, `/api/auth/login`, `/api/auth/me`, `/api/health`, static files
- **Fastify AJV**: Does NOT enforce `additionalProperties: false` even when specified — extra body fields silently ignored (accepted risk, low impact)
- **SQLite**: Foreign keys disabled by default — enabled at connection init via `db.pragma('foreign_keys = ON')`
- **better-sqlite3**: Synchronous, serialized — race conditions not possible for single-writer operations
- **Error codes**: `INVALID_CREDENTIALS` used for both user-not-found and wrong-password (prevents enumeration)
- **OIDC error codes**: Whitelisted map in frontend — no reflection of unknown codes
- **Work items pageSize max**: Server enforces `maximum: 100` on pageSize for GET /api/work-items — client must not exceed this
- **CSS class from server enum**: `styles[\`status\_\${invoice.status}\`]` pattern is safe — CSS Modules scopes at build time; server validates enum
- **location.state navigation pattern** (PR #267 WorkItemDetailPage): `?.from === 'timeline'` strict-equality check against a literal. All `navigate()` targets are hardcoded strings. No open redirect risk from this pattern.
- **Ctrl+scroll / keyboard zoom** (PR #267 TimelinePage): Raw wheel deltaY/keyboard events reduced to ±1 direction sign before arithmetic. Column width clamped to [COLUMN_WIDTH_MIN, COLUMN_WIDTH_MAX]. Clean pattern.
- **createPortal to document.body** (PR #263 WorkItemSelector): Safe pattern — renders React virtual DOM tree; all dynamic content remains in React's controlled rendering pipeline (no raw HTML injection). Outside-click handled via `document.querySelector('[data-work-item-selector-dropdown]')` data attribute — legitimate pattern.
- **GanttChart hover state (PR #306)**: hoveredItemId set exclusively from DOM event handlers. Arrow keys (`${predId}-${succId}-${dep.dependencyType}`) used only for Set.has() lookups — no execution path. All user data in tooltip dependency list rendered as JSX text nodes. No dangerouslySetInnerHTML anywhere in GanttChart component tree. ARIA labels with user titles safe — React escapes JSX attributes.
- **Wiki submodule detached HEAD**: After `git submodule update --init`, the wiki is in detached HEAD. Must `git -C wiki checkout master` before committing. Always `git -C wiki pull --rebase origin master` before pushing to handle concurrent wiki edits from other PRs.
- **Wiki submodule commit on virtiofs FAILS**: The sandbox uses a virtiofs mount — git's tmp-file write pattern for objects is incompatible with virtiofs write semantics. `git -C wiki add` always fails with "insufficient permission for adding an object to repository database". Workaround: `git clone /path/to/wiki /tmp/wiki-tmp` → edit in /tmp/wiki-tmp → commit → `git remote set-url origin <token-url-from-wiki/.git/config>` → push. Token URL is in `wiki/.git/config` under `[remote "origin"] url`.
- **check-dep-pinning.sh heredoc injection (Low)**: The shell script uses an unquoted `<<EOF` heredoc embedding `${PACKAGE_JSON}` in a JS string literal. Exploitation is negligible in practice (lint-staged controls paths), but the fix is trivial: use `<<'EOF'` and pass path via `process.argv[1]`. Documented in PR #316 review.
- **WorkItemStatus enum**: As of PR #308, is `'not_started' | 'in_progress' | 'completed'` — `blocked` removed. Migration 0008 migrated existing blocked rows to not_started.
- **Actual dates (PR #308)**: `actualStartDate` and `actualEndDate` added to work_items. Auto-populated on status transitions (not_started→in_progress sets actualStartDate; in_progress→completed sets actualEndDate; not_started→completed sets both). Both fields use `format: 'date'` schema validation. No cross-field ordering validation — open informational finding #17.
- **Category color rendering**: Always via React style object `{ backgroundColor: color }`, never string interpolation — CSS injection impossible
- **Scheduling engine (PR #248)**: Pure function, O(V+E) Kahn's algorithm — no DoS risk at construction project scale. Cycle detection as byproduct of Kahn's. Unbounded SELECT of all work items/deps is acceptable at target scale. Drizzle ORM throughout. POST /api/schedule is read-only (no DB writes).
- **household_items.url field (PR #396, #400)**: Stores user-provided retailer URLs — stored as text only, never fetched server-side. Frontend renders with rel="noopener noreferrer" (correct). However, no protocol allowlist — `javascript:` URIs accepted. Low finding in PR #400. Fix: validate `new URL(url).protocol` is `http:` or `https:` before rendering as href, OR add `^https?://` regex to server-side schema.
- **EPIC-04 household_items schema (PR #396)**: migration 0010, 6 tables. planned_amount >= 0 CHECK correctly included (unlike PR #187 gap on work_item_budgets). sortBy in HouseholdItemListQuery uses snake_case literals — API implementation must whitelist before use in ORDER BY clause.
- **household_item_deps polymorphic FK pattern (PR #416)**: predecessor_id has NO FK constraint (intentional — references either work_items or milestones). Referential integrity enforced at service layer via ensureWorkItemExists/ensureMilestoneExists. DB-level CHECK constrains predecessor_type and dependency_type enums. Composite PK prevents duplicate deps. This is the accepted pattern for polymorphic refs in this codebase.
- **HI dependency cycle detection (PR #416)**: DFS with MAX_ITERATIONS=10000 guard. HIs are correctly identified as terminal sinks — cycles are structurally impossible in current model. Logic complete for future extensibility.
- **`predecessorType` enum-validated in DELETE params** (PR #416): Explicitly included in deleteHouseholdItemDepSchema — closes the enum bypass pattern noted in earlier reviews. Service layer casts to typed union after route validation.
- **Household item timeline navigation (PR #451)**: Frontend-only click handlers for household item circles and sidebar rows in Gantt chart. Route path `/household-items/{id}` is hardcoded with dynamic ID from API-sourced TimelineResponse. Follows established two-tap touch pattern (hover → show tooltip → navigate). Navigation state `{ from: 'timeline' }` is hardcoded literal matching work item pattern.
- **EPIC-15 invoice_budget_lines junction table (PR #612)**: Migration 0017 replaces 1:1 FK (invoices.work_item_budget_id / household_item_budget_id) with M:N junction. XOR CHECK constraint enforces mutual exclusivity at DB layer. Both FK columns use ON DELETE CASCADE (not SET NULL — Bug #611 confirmed SQLite enforces CHECKs when SET NULL fires, making SET NULL incompatible with XOR CHECK). Partial UNIQUE indexes on both FK columns (WHERE IS NOT NULL) enforce 1-invoice-per-budget-line. `toInvoice()` shim returns `budgetLines: [], remainingAmount: row.amount` as compilation placeholder — Story #604 must replace this with actual junction row queries.
- **EPIC-15 subsidy cost basis (PR #614)**: `budgetOverviewService.ts` now uses `lineInvoiceMap` (ALL invoice statuses, no status filter) as cost basis for subsidy reductions. `Math.min(perLineAmount, costBasis)` cap for fixed subsidies is a positive hardening. `.has()` + `.get()!` pattern is safe. Cache key `${entityId}:${subsidyId}` is UUID-only, no user input.
- **User preferences pattern (PR #708)**: `/api/users/me/preferences` — IDOR is structurally impossible because `userId` comes exclusively from `request.user.id` (session-bound). All three handlers (GET/PATCH/DELETE) use session identity only. ThemeContext.tsx validates `theme` value against closed enum before applying to `document.documentElement.dataset.theme` — XSS impossible for this key. localStorage used only for non-sensitive UI preference (theme); theme preference also migratable to server on auth. `encodeURIComponent(key)` in DELETE URL construction — correct.

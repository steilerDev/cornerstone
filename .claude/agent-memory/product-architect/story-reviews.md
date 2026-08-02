# Story Review Details

Detailed review notes for individual stories. Referenced from MEMORY.md.

## Story #29: Client Responsive Layout (PR #48, reviewed)

- AppShell owns sidebar state (`useState`), passes `isOpen`/`onClose` to Sidebar
- CSS-first responsive: `@media (max-width: 1024px)` for mobile/tablet, `(min-width: 1025px)` for desktop
- Sidebar: `position: fixed` + `translateX(-100%)` on mobile/tablet, `position: static` on desktop
- Overlay: conditionally rendered in React, CSS `display: none` by default, `display: block` on mobile/tablet
- Escape key: `useEffect` with `keydown` listener on `document`, guarded by `isSidebarOpen`
- Touch targets: `min-height: 44px` on navLinks (mobile/tablet), `min-width/min-height: 44px` on menuButton
- Nav link clicks call `onClose` to auto-close sidebar on navigation
- z-index layering: sidebar=100, overlay=50
- Menu button hidden on desktop via `display: none`
- No new dependencies added

## Story #33: Performance Architecture (PR #49, reviewed)

- `@fastify/compress`: Approved + implemented -- pure JS, uses Node.js built-in zlib
- `css-minimizer-webpack-plugin`: Approved + implemented -- pure JS (cssnano + postcss), client devDep
- Cache strategy: `max-age=31536000, immutable` for hashed assets, `no-cache` for HTML
- @fastify/compress registration order: config -> errorHandler -> compress -> db -> routes -> static
- React.lazy + Suspense for route-based code splitting; all pages use dynamic import()
- Suspense fallback: `<div className={styles.loading}>Loading...</div>` in AppShell
- Webpack `splitChunks: { chunks: 'all' }` for vendor chunk extraction
- CssMinimizerPlugin production-only (isProduction conditional with `'...'` spread to keep TerserPlugin)
- Source maps (.map files) served with immutable cache -- acceptable for self-hosted <5 users app
- No Dockerfile changes needed, no new ADR needed
- Refinement items: fix caret range on css-minimizer-webpack-plugin (should be pinned "7.0.2")

## Story #30: Local Admin Auth (PR #56, reviewed -- approved)

- Implements GET /api/auth/me, POST /api/auth/setup, POST /api/auth/login
- userService.ts: createLocalUser, verifyPassword, findByEmail, countUsers, countActiveUsers, toUserResponse
- toUserResponse uses positive field selection (explicit safe fields) -- correct pattern for sensitive exclusion
- Timing attack prevention: dummy argon2 hash when user not found or OIDC user
- Deactivation check before password check (reveals account status -- intentional per API Contract)
- JSON schema validation (AJV) at route level, additionalProperties: false
- Config additions: sessionDuration (number), secureCookies (boolean) in AppConfig
- argon2@0.43.0 added to server deps (native addon, acceptable per policy)
- Webpack extensionAlias added for ESM .js -> .ts resolution
- 65 tests (31 unit + 34 integration)
- Refinement items: CSS duplication between SetupPage/LoginPage, missing autoComplete on SetupPage, config validation test gaps

## Story #32: Session Management (PR #57, reviewed -- approved with observations)

- sessionService.ts: generateSessionToken, createSession, validateSession, destroySession, destroyUserSessions, cleanupExpiredSessions
- auth plugin (`server/src/plugins/auth.ts`): preValidation hook, public route exemption Set, hourly cleanup interval
- @fastify/cookie@11.0.2 added for cookie parsing
- Plugin registration: config -> errorHandler -> compress -> cookie -> db -> auth -> routes -> static
- validateSession: single JOIN query checking session expiry + user deactivation
- Logout endpoint: POST /api/auth/logout returns 204, clears cookie
- Auth hook uses `preValidation` (not `preHandler` as ADR-010 says) -- works correctly
- Wildcard route detection prevents 401 shadowing 404 for non-existent routes

### Refinement items from PR #57 review:

- O1: Pin `@fastify/cookie` to exact `"11.0.2"` (currently uses caret `^11.0.2`)
- O2: Extract `COOKIE_NAME` constant to shared location (duplicated in auth.ts and routes/auth.ts)
- O3: `request.url` includes query strings -- PUBLIC_ROUTES.has() could miss routes with query params
- O4: Redundant sessionId check in logout handler (auth hook already validated)
- O5: ADR-010 says "preHandler" but implementation uses "preValidation" -- update ADR or Architecture wiki
- O6: Stale JSDoc "NOTE: Session creation will be added in Story #32" in login route

## Story #37: Role-Based Access Control (PR #60, reviewed -- approved)

- `requireRole(...roles: string[]): preHandlerHookHandler` factory function in auth.ts
- Exported as named export (not a Fastify plugin/decorator)
- Returns async preHandler that checks `request.user.role` against allowed roles
- Uses established AppError subclasses: UnauthorizedError (401), ForbiddenError (403)
- Hook lifecycle: preValidation (auth) runs before preHandler (RBAC) -- 401 before 403 guaranteed
- 7 integration tests covering all 6 acceptance criteria from Story #37
- Tests use `app.inject()` with temp routes (`/api/test-admin`, `/api/test-multi-role`)
- "Role changes take effect immediately" test verifies fresh DB reads per request
- CI: Quality Gates + Docker pass

### Non-blocking observations from PR #60 review:

- O1: `roles` param typed as `string[]` -- could use `UserRole` from @cornerstone/shared for compile-time safety
- O2: `requireRole()` with zero args denies everyone (empty array `.includes()` returns false) -- not a real risk but could add runtime guard

## Story #36: User Profile Management (PR #62, reviewed -- approved)

- **Backend**: GET /api/users/me (user profile), PATCH /api/users/me (update displayName), POST /api/users/me/password (change password)
- **Services**: updateDisplayName() returns updated user, updatePassword() is void, both update timestamps
- **Validation**: Server-side JSON schema: displayName 1-100 chars, newPassword min 12 chars
- **Error Codes**: UNAUTHORIZED (401, no auth), INVALID_CREDENTIALS (401, wrong password), FORBIDDEN (403, OIDC users can't change password), VALIDATION_ERROR (400, bad input)
- **Frontend**: ProfilePage component with two forms (display name + password), lazy-loaded route
- **Styling**: CSS Modules with responsive design (@media max-width 767px), navSeparator in Sidebar
- **Accessibility**: aria-invalid, aria-describedby on inputs, role="alert" on banners, autoComplete attributes
- **Tests**: 70+ new tests total:
  - Backend: 21 integration tests (auth, validation, OIDC restrictions, persistence)
  - Frontend: 25+ component tests (loading, display, validation, both auth providers)
  - API Client: 6+ tests (mocked endpoints)
  - Services: 12+ tests (updateDisplayName, updatePassword)
- **Type Safety**: UserResponse returned directly, no unnecessary `any`, proper Drizzle typing
- **Auth Protection**: All endpoints require preValidation hook session auth
- **OIDC Handling**: OIDC users blocked from password change with 403, message references identity provider
- **CI**: Quality Gates PASSING, Docker PASSING
- **Status**: Architecture compliant, ready for product-owner + security-engineer approvals

## Story #142: Budget Categories CRUD (PR #150, reviewed -- approved)

- **EPIC-05 first story** -- creates all 8 budget tables in migration 0003, implements CRUD for budget_categories only
- **Migration**: Exact match to Wiki Schema -- 8 tables, 10 seeded categories, all indexes, composite PKs, rollback comments
- **Drizzle schema**: 7 new table definitions in schema.ts, added `real` import for REAL columns
- **Shared types**: BudgetCategory, CreateBudgetCategoryRequest, UpdateBudgetCategoryRequest, BudgetCategoryListResponse, BudgetCategoryResponse
- **New error code**: CATEGORY_IN_USE (409) with details { subsidyProgramCount, workItemCount }
- **Service layer**: budgetCategoryService.ts follows workItemService pattern (typed DbType, mapper fn, validation, case-insensitive LOWER() uniqueness check, randomUUID, ISO timestamps)
- **Routes**: 5 endpoints under /api/budget-categories, AJV schemas with additionalProperties:false, auth via request.user
- **Client**: budgetCategoriesApi.ts using apiClient helpers, route changed /budget -> /budget/categories with parent redirect
- **Tests**: 181 new tests (597 schema + 806 service + 797 route integration + client tests)
- **Non-blocking refinement items**:
  - O1: BudgetCategoriesPage.tsx is 619 lines -- consider extracting sub-components
  - O2: CSS button variant repetition -- consider shared base class
  - O3: Seeded IDs are deterministic strings (bc-materials etc.) not UUIDs -- intentional per design

## Story 4.10 Review (PR #416): HI Timeline Dependencies & Delivery Date Scheduling

**Verdict:** Request Changes -- 3 high, 3 medium, 2 low

### Architecture Quality

- Migration 0012: clean ALTER TABLE + CREATE + INSERT...SELECT + DROP pattern
- CPM extension: HIs as zero-duration nodes with floor rules follows ADR-014
- Polymorphic `predecessor_id` (no FK): same pattern as `document_links`
- Route consolidation under `/api/household-items/:id/dependencies` is cleaner
- Shared types well-structured: `HouseholdItemDepDetail`, `TimelineHouseholdItem`, etc.
- Comprehensive new tests: dep service (680), scheduling engine HI (484), timeline service (335)

### Issues Found

1. **HIGH:** Orphaned `household_item_deps` rows on WI/milestone delete. No cleanup in `deleteWorkItem()` or `deleteMilestone()`. `listDeps()` will crash with NotFoundError.
2. **HIGH:** `householdItemService.test.ts` (1060 lines of core CRUD tests) deleted entirely with no replacement.
3. **HIGH:** Wiki not updated -- no Schema.md, API-Contract.md, or ADR-017 (referenced in migration).
4. **MEDIUM:** `isLate` computed precisely in scheduling engine but re-derived with lossy heuristic in timelineService.
5. **MEDIUM:** `detectCycle` queries `householdItemDeps.householdItemId = workItemId` -- wrong column, always no-op.
6. **MEDIUM:** `as any` casts for category/status in depService and timelineService.
7. **LOW:** EPIC-09 referenced throughout but story is EPIC-04 Story 4.10.
8. **LOW:** Migration 0010 test modified to expect post-0012 state.

### Polymorphic FK Cleanup Pattern

When using polymorphic FKs (no DB-level constraint), ALL services that delete the referenced entity must manually clean up the referencing table. This applies to:

- `document_links` (entity_type/entity_id) -- cleanup in deleteWorkItem, deleteVendor
- `household_item_deps` (predecessor_type/predecessor_id) -- **MISSING** cleanup in deleteWorkItem, deleteMilestone

## PR #615: Invoice Budget-Line Linking UI (Story #606)

**Verdict:** Request Changes (2 critical, 1 medium, 2 low)

### Critical

1. `@extend .td` in CSS -- Sass directive, invalid in plain CSS Modules. 5 occurrences in `InvoiceBudgetLinesSection.module.css`. Fix: use `composes: td;` or inline the padding property.
2. Double-fire on WorkItemPicker -- both `onChange` and `onSelectItem` fire on selection, causing duplicate `handleSelectItem` calls (duplicate API requests). Fix: remove `onChange`, use only `onSelectItem`.

### Medium

3. `itemTitle: itemId` shows UUID in modal header instead of item name.

### Low

4. Client allows `itemizedAmount >= 0` but API requires `> 0`.
5. `loadBudgetLines` not memoized -- eslint exhaustive-deps warning risk.

---

# Review Log (migrated from MEMORY.md index, 2026-07-30)

## EPIC-04 Household Items

- PR #399 (4.4): Request Changes -- missing quantity field
- PR #401 (4.6): Request Changes -- confidence margin display bug (fractions not percentages)
- PR #402 (4.7): Comment -- 1 medium (wiki gap, resolved; `GET /api/work-items/:id/household-items` added to API-Contract.md)
- PR #414 (4.9): Request Changes -- missing invoice delete guard, wiki gaps
- PR #416 (4.10): Request Changes -- orphaned deps on WI/milestone delete, deleted 1060-line test file, wiki not updated

## PR #460 (2026-03-04) -- inline status selector

Auto-sets `actualDeliveryDate` when status -> 'arrived' and date is null. Backend/frontend/tests correct;
API Contract wiki not updated to document the auto-set behaviour. Doc gap flagged.

## PR #612 (2026-03-08) -- EPIC-15 Story 15.1, invoice_budget_lines (migration 0017)

Request changes:

- CRITICAL: broken test assertions -- `MutuallyExclusiveBudgetLinkError` tests retained but validation removed from service. CI red.
- HIGH: wiki Schema.md said ON DELETE SET NULL for budget FKs; migration/Drizzle/ADR-018 use ON DELETE CASCADE.
- MEDIUM: `InvoiceBudgetLineSummary` shared type diverged from wiki API Contract shape. Deferred to Story 15.2.

## PR #1150 (2026-03-22) -- EPIC-19 Backup & Restore

Request changes (2 critical, 3 high, 2 medium):

- CRITICAL: wiki not updated (API-Contract.md, Architecture.md) -- zero wiki changes in PR
- CRITICAL: CLAUDE.md env var table missing BACKUP_DIR, BACKUP_CADENCE, BACKUP_RETENTION
- HIGH: `stopScheduler()` never called on app close -- needs onClose hook
- HIGH: module-level mutable state (`operationInProgress`, `cronTask`) -- testing concern
- MEDIUM: `process.exit(0)` bypasses Fastify graceful shutdown
- MEDIUM: `createError` state set but never rendered in UI (bug #1164)

## PR #1894 (2026-07-30) -- Story #1891 dual-rail deposit aggregation

Round 1 CHANGES_REQUIRED (1 critical: Rail A/B double-count), round 2 APPROVED after commit 86a9770a.
Full invariants and review heuristics in `dual-rail-aggregation.md`.

## PR #1903 (2026-07-31) -- Story #1899 report-language Settings step (5-step wizard)

APPROVED (2 medium, 3 low). Architecture verified sound; see `client-pdf-pipeline.md` for the
locale-decoupling contract this established.

- **M1**: `reportLanguage` seeded once via `useState(resolvedLocale)`. `LocaleContext.syncWithServer`
  sets `resolvedLocale` _asynchronously_ after auth AND deletes the `locale` localStorage key when
  the server has a preference -- so every load starts at `detectBrowserLocale()` and flips later.
  Any component seeding state from `resolvedLocale` at mount has this bug. **Reusable review check:
  never `useState(resolvedLocale)` / `useState(currency)` / `useState(vatRate)` without a
  seed-until-touched effect.** jsdom tests can't catch it (LocaleProvider's async paths never resolve).
- **M2**: `resolvedLocale === 'de' ? 'de-DE' : 'en-US'` duplicated in `formatters.ts` and the page.
  Needs one exported `resolvedLocaleToIntlTag()` -- silent divergence risk on a 3rd locale.
- L: `.step4Body/.step4Layout/.step4Column` class names + `stepper.options` key left off-by-one
  after the renumber; `createFormatters` return type written inline instead of a named interface;
  filename AC vacuously satisfied (ISO date + raw enum, nothing locale-dependent -- flag to PO).
- CI: Quality Gates green; E2E shard 5/16 red (known recurring flake in this wizard area -- must be
  triaged before beta->main, not before the beta merge).

## PR #1909 — Story #1900 editable HTML report preview (REQUEST-CHANGES, 2026-07-31)

Posted as a `gh pr comment` with an explicit `**Verdict:**` line — `gh pr review --request-changes` is
rejected on a self-authored PR.

Approved as designed: the `reportContent/` content-model split (see [[client-pdf-pipeline]]), pure
`applyOverrides`, `guardedUpdate` discard flow, and the `realRender.test.ts` override→rendered-PDF chain
(the strongest test file in the repo — real pdfmake, real en/de bundles, field-isolation test).

Blockers, all in the presentation layer:

- **B1/B2** `EditableField.module.css` styled the field through `:global(.input)` — dead under hashed
  CSS Modules, and 13 stylelint errors turned `Static Analysis` red. Edited-dot was permanently
  `opacity: 0`. See [[recurring-patterns]].
- **B3** `ReportContentEditor` got the chrome `t` instead of `reportT` → preview in UI locale, PDF in
  report language (AC #5). Also made `ReportContentRow.statusText` dead — the Badge label came from the
  chrome-locale variant map instead.
- **B4** `var(--color-refund-text)` in an inline `style={{}}` — token defined nowhere, refund highlight
  silently dead. Sibling `ReportInvoiceList.module.css` `.refund` is the correct pattern.
- **B5** `field: 'usage'` / `'attachmentsNote'` raw identifiers interpolated into a translated aria-label.

Lesson worth repeating: 407 green tests, and the three highest-severity defects were all "the code runs
but does nothing" — dead CSS selector, undefined token, wrong `t`. None are catchable by assertions on DOM
presence. Read the CSS and trace which `t` each consumer receives.

## PR #1935 — Bug #1929 report PDF layout (CHANGES_REQUIRED, 2026-08-02)

Again posted via `gh pr comment` (self-authored PR blocks `--request-changes`).

Three-defect layout fix (`dontBreakRows`, fixed column widths, `PAGE_TOP_MARGIN = 75`) with 84 green
unit tests and 100%-ish coverage on all three touched files — and **two of the three defects were not
actually fixed**. Every finding came from reading pdfmake's source in `node_modules/` and running real
renders, none from reading the diff. Details in [[client-pdf-pipeline]] "Table geometry traps".

- **C1** `dontBreakRows` was added to `TABLE_LAYOUT` (passed as `layout:`); pdfmake reads it from
  `table:`. Byte-identical output. AC4 unfixed, and its unit test pinned a property nothing reads.
- **C2** The right-edge overflow (the headline defect) still reproduces: a `'*'` column floors at its
  longest word, so German compounds push the 7-col table to 574pt on a 515.28pt page.
- **H3** The new width-derivation comment was off by 2.7x (claimed Usage = 185.28pt, actual 69.28pt) —
  it omitted pdfmake's 116pt of per-column padding/border offsets. The test bound built on it
  (`fixedSum <= 515.28`) admits a 673pt table.
- **H4** Fixing C1 as written would have traded split rows for *silent whole-row deletion* at ~475 chars
  of usage text.

Lesson: this is the [[recurring-patterns]] "code runs but does nothing" family again, one layer down —
a config key on the wrong object, and a derivation whose arithmetic omitted an input. When a fix is a
set of magic numbers justified by a prose comment, **recompute the comment** before reviewing anything
else; both wrong numbers here were in comments that existed specifically to justify the constants.

### Round 2 (CHANGES_REQUIRED again, 2026-08-02)

`pageGeometry.ts` landed as recommended; C1, H3(offsets), M5, M6, M7 and AC14 genuinely closed. **C2 and
H4 were not** — and both survived for the same reason they were filed: a *character count* substituted
for a *typographic measurement*, calibrated on an average glyph width instead of a worst case. Round 1's
lesson ("recompute the comment") repeated at the next level of precision: the round-2 comments were
arithmetically correct but rested on optimistic inputs (0.495em average advance, perfect line packing).

- **C2** threshold `floor(130 / (8·0.495)) = 32` chars. All-caps German runs at 0.60em and `M`/`W` at
  0.873em: a 32-char all-caps token renders a 538.57pt table on a 515.28pt page; `M`×32 → 600.5pt.
  `BAUSTELLENEINRICHTUNGSKOSTEN` (real word, 28 chars) clears by **3.6pt**.
- **H4** `MAX_SAFE_USAGE_CHUNK_CHARS = 1200` claimed ~40% margin; measured **684pt against a ~663pt**
  effective budget (the repeated header row is subtracted from an unbreakable fragment's height).
- **New HIGH**: converting 6 columns from `auto`/`*` to fixed points broke the **German header row**
  deterministically — fixed columns never grow, so `Auftragnehmer`/`Rechnungsbetrag` paint over their
  neighbours while every table-level width assertion still passes.

Recommended cure for the whole class: **drop the `'*'` column** — pdfmake never sets `elasticWidth`, so
numeric widths are absolute and the table width becomes constant by construction. See
[[client-pdf-pipeline]] "Round-2 measurements".

Reviewer lesson: when round 1's finding is "this estimate is wrong", round 2's job is not to check the
new estimate's arithmetic — it is to ask **what the estimate is an estimate _of_**, and whether a
construction exists that removes the need to estimate at all.

### Round 3 (CHANGES_REQUIRED, 2026-08-02) — structural cure adopted, one residual

The `'*'` column was dropped as recommended and **width overflow is now structurally impossible**
(22 pathological inputs, both shapes, all exactly 515.28pt). H1 per-cell containment closed; the
0.89em worst-case advance closed for all realistic content. Verified by re-rendering, not by reading.

Residual HIGH: `MAX_SAFE_USAGE_CHUNK_CHARS` chunks `usageText`, but `areaText` and `attachmentsNote`
stack into the **same cell** uncapped — 691pt / 665.8pt against a 634.89pt budget, with silent drop
confirmed by page-count saturation. The 836-char "measured ceiling" was measured with that cell
holding usage text only.

Three-round arc worth remembering: **round 1 capped nothing, round 2 capped the wrong quantity
(average glyphs, perfect packing), round 3 capped the right quantity in the wrong scope.** Each round
the fix moved one level closer without arriving. The reviewer move that finally worked was checking
the *input bounds* (`maxLength` in the route schemas) rather than arguing about plausibility — that
retired the vendor concern outright and isolated the two genuinely uncapped channels.

Downgrade discipline: the glyph-advance finding went HIGH (round 2) -> MEDIUM (round 3) **because the
structural fix changed its blast radius**, not because the numbers improved. Re-derive severity from
the current architecture, not from the previous round's ranking.

### Round 4 (APPROVED, 2026-08-02)

Cell-scope fix verified by rendering: all three round-3 drop scenarios closed (665.8/691.0/1119.4pt
-> 404/404/264pt), page counts now grow instead of saturating, width still exactly 515.28pt across
20 cases. Caps 650/450 re-measured at a glyph 13% wider than the team used — still 13.3%/27.0% margin.

Fourth channel found as asked: **`markerText`** (one `*N` per skipped document, unbounded, no chunk,
no break-all) — break-even ~250 skipped docs on one invoice. Not blocking; noted as follow-up.

Two review lessons worth keeping:

1. **Severity must be re-derived from the current architecture each round, not carried forward.** The
   glyph-advance finding went HIGH -> MEDIUM -> non-blocking across rounds 2/3/4 while the *numbers
   got worse* (0.89 -> 1.04 claimed, 1.18 actual). What changed was blast radius: once the `'*'`
   column died, under-flagging could only paint outside a cell. Ranking a finding by its measured
   error rather than its consequence would have blocked a correct PR.
2. **A comment that overclaims is its own recurring defect.** "Safely above every character scanned"
   was wrong at 0.89 and again at 1.04. The durable fix is to make the bound *name its own scope*
   ("widest in the Latin/German/punctuation set scanned") rather than to keep raising the number.

Four rounds total. Trajectory was right each time; each round bounded something real and revealed the
next layer. Worth remembering before pushing for a five-round rewrite: the arc converged.

## Story #1930 — Attachment tier rules per report type (PR #1942, APPROVED 2026-08-02)

Per-invoice stage matching (invoice status slice + deposit split + `targetStatuses`) replaced by a
pure two-arg predicate in `server/src/services/shared/attachmentTierUtils.ts`:
tier `quotation`1 < `deposit`2 < `invoice`3; floors budget-overview 1 / claim 2 / proof-of-funds 3.
`attachmentType: null` = tier 3 (product ruling — nulls are legacy/ambiguous, and a silently-dropped
attachment is unrecoverable while an over-included one is deselectable).

Three durable conclusions:

1. **Server-local vs `@cornerstone/shared` — the relocation trigger.** #1916's drift came from *two
   implementations*, not from server-local placement. Relocating a rule with one implementation and
   zero client callers reduces nothing and adds build-order coupling. Sharper: for the client to need
   this predicate, the server would have to ship *unfiltered* documents — which AC7 forbids. So
   client-side need is a contract violation, not a future extension. Rule to reuse:
   **move to `@cornerstone/shared` iff a client module must evaluate the rule against data the server
   has not already filtered.**
2. **`Record<Union, T>` object literal is the right exhaustiveness mechanism** (fails the build when
   the union grows; `Partial<>` degrades to `undefined`, `switch` needs a `never` guard). Its residual
   hole — an out-of-enum DB value indexing to `undefined`, and `undefined >= floor` silently excluding
   from *every* report — is closed here by a real `CHECK` in migration `0042`, not by Drizzle's
   compile-time `text(..., {enum})`. **Always check whether the migration has the CHECK before calling
   a cast-fed `Record` lookup safe.**
3. **Reports are computed on read** — no report table in `schema.ts`, PDF built client-side per
   invocation (ADR-034). Changing report filtering has no persisted blast radius, no cache, no backfill.

Findings posted: MEDIUM (pre-existing, follow-up) `ReportWizardPage.handleUseCaseChange` never clears
`report`/`sourceId`, so changing the use case and clicking straight through step 2 reaches step 3 with
a report fetched under the *previous* use case — the tier rule is right, the wizard just holds output
from the wrong invocation. LOW: `wiki/API-Contract.md:3625` still says "Document stage" four lines
above the tier tables that retire that word.

---

## PR #1944 — #1931 "Enhance with AI" single action + purpose-focused prompt — CHANGES_REQUIRED

Removed the step-4 `aiEnabled` opt-in (step 5 now gated on `llmEnabled` alone), rewrote
`REPORT_CONTENT_SYSTEM_PROMPT` to ask *why* a cost was incurred, and unified the length caps into
`server/src/services/budgetExtraction/contentLimits.ts`. Fixed an inverted language ternary that emitted
"German construction project" for `en` and "Konstruktionsprojekt" for `de` (wrong in both branches) — the
domain phrase is now fixed literal text for both, with a `not.toContain('Konstruktionsprojekt')` regression
guard. Good instinct; copy that negative-assertion shape.

**Blocked on:** `wiki/API-Contract.md` L3795–97/L3830 still documenting the removed 200/3000/300 tier as
deliberate. See the "single source of truth" entry in [recurring-patterns.md](recurring-patterns.md) for the
sweep checklist and the trap at L3806.

**Rulings worth reusing:**

1. **Server-local constants beat `@cornerstone/shared` when the constant is not on the wire.** These caps
   govern the *model's* output; the response carries already-truncated strings and the client neither
   validates nor re-enforces them. Promoting them would invite a UI `maxLength` that the PO explicitly
   rejected — the step-5 fields stay user-editable after generation, and a hand-typed 400-char description
   is legal. Extends the #1930 rule: **not "no second consumer yet" but "a client consumer would be a
   contract change, not an extension."**
2. **"Structurally impossible to disagree" holds only for the runtime path.** Verified clean here:
   `providerProfiles.ts`'s `REPORT_CONTENT_SCHEMA` sends bare `{type:'string'}` with no `maxLength`, the
   Fastify route schema bounds request fields only, `shared/src/types/sourceReport.ts` has no zod, and the
   client editor has zero `maxLength`. Structural ends where TypeScript ends — wiki prose always needs a
   manual sweep.
3. **Removing a UI opt-in in front of an already-configured capability has ~zero privacy/cost delta.** The
   consent gate is operator-level (`LLM_*` env → `config.llmEnabled`), and the same gateway already ships
   more data via auto-itemization. What *is* lost is the visible pre-click warning: replacing a checkbox
   helper with an `srOnly` + `aria-describedby` span leaves sighted users with no warning until the
   overwrite-confirm modal, which only fires when `overrides` is non-empty. Asymmetry in the wrong
   direction — prefer a visible muted helper line. (Flagged to ux-designer, not blocking.)
4. **#1916 numeric guards survived** — `prompts.ts` L152/L166 `.toFixed(2)` are context lines, the
   `amount formatting (major units …)` describe block is unmodified, and `reportContentGenerationService.ts`
   is untouched. Risk direction is *lower*: rule 2 now forbids emitting amounts in descriptions, so the only
   number left in the output is the letter-body total.

Findings: HIGH wiki caps drift · MEDIUM toothless prompt alternation guards · MEDIUM no guard for AC 3.5's
"never invent or alter amounts or dates" · LOW `prompts.test.ts` L596–598 bare `/150 char/` literals ·
LOW srOnly-only overwrite warning · INFO stale "300 validator cap" in product-owner memory · INFO
`reachStep5WithAiConfigured` has an implicit `mockLlmEnabled` precondition.

E2E rewrite (unexecuted — Chromium download blocked in sandbox) reads correct: sr-only span is a *sibling*
of the button so the accessible name is unaffected; `toBeAttached()` (not `toBeVisible()`) is right for
`.srOnly` (`1px` + `clip-path: inset(50%)` makes Playwright's visibility heuristic ambiguous); expected
literal is byte-identical to `en/budget.json`; `#enhanceWithAiDescription` and `aiGenerateRow` each have
exactly one render site, so no strict-mode risk from the page's desktop/mobile dual DOM tree.

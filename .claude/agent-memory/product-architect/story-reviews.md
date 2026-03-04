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

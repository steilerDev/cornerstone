# Product Owner Agent Memory

## Backlog State (as of 2026-03-02)

- 12 epics, 75+ user stories across all epics
- Sprint 1 COMPLETE: EPIC-01, EPIC-02, EPIC-11
- Sprint 2 COMPLETE: EPIC-03, EPIC-12
- Sprint 3 COMPLETE: EPIC-05 (v1.9.0), EPIC-06 (v1.10.0)
- Sprint 4 IN PROGRESS: EPIC-08 COMPLETE (v1.11.0), EPIC-04 stories created (#387-#394)
- Security hygiene backlog: Issue #315 (rate limiting, headers, lockout, etc.)
- GitHub Projects board: "Cornerstone Backlog" (project #4, owner steilerDev)

## Completed Epics

- EPIC-02 (#2): App Shell & Infrastructure -- CLOSED 2026-02-08
- EPIC-11 (#12): CI/CD Infrastructure -- CLOSED 2026-02-08
- EPIC-01 (#1): Auth & User Mgmt -- CLOSED 2026-02-16, promoted via PR #82
- EPIC-03 (#3): Work Items CRUD -- CLOSED 2026-02-17, promoted via PR #110
- EPIC-12 (#115): Design System Bootstrap -- CLOSED 2026-02-18, promoted with EPIC-03 via PR #110
- EPIC-05 (#5): Budget Management -- CLOSED (v1.9.0), all 12 stories
- EPIC-06 (#6): Timeline & Gantt -- CLOSED (v1.10.0), all 9 stories
- EPIC-08 (#8): Paperless-ngx Document Integration -- CLOSED (v1.11.0), all 6 stories

## Epic Quick Reference

- EPIC-01 (#1): Auth & User Mgmt [Must, Sprint 1] -- no deps, foundation
- EPIC-02 (#2): App Shell & Infra [Must, Sprint 1] -- no deps, foundation
- EPIC-03 (#3): Work Items CRUD [Must, Sprint 2] -- depends on 01, 02
- EPIC-04 (#4): Household Items [Must, Sprint 4] -- depends on 01, 02, 05
- EPIC-05 (#5): Budget Mgmt [Must, Sprint 3] -- depends on 01, 02, 03
- EPIC-06 (#6): Gantt/Timeline [Must, Sprint 3] -- depends on 02, 03
- EPIC-07 (#7): Reporting [Should, Sprint 5] -- depends on 05, 08
- EPIC-08 (#8): Paperless-ngx [Must, Sprint 4] -- depends on 02, 03, 04, 05
- EPIC-09 (#9): Dashboard [Should, Sprint 5] -- depends on 02, 03, 05
- EPIC-10 (#10): UX Polish [Could, Sprint 5] -- depends on all
- EPIC-11 (#12): CI/CD Infrastructure [Must, Sprint 1] -- depends on EPIC-02
- EPIC-12 (#115): Design System Bootstrap [Must, Sprint 2] -- depends on EPIC-02, blocks EPIC-10

## Completed Sprint Story References (condensed)

- EPIC-11 stories: #13-#18 (CI/CD, Sprint 1)
- EPIC-01 stories: #28, #30, #32, #34-#38, #68 (Auth, Sprint 1)
- EPIC-02 stories: #24-#27, #29, #31, #33 (App Shell, Sprint 1)
- EPIC-12 stories: #116-#120 (Design System, Sprint 2)

## EPIC-03 Stories (Work Items CRUD) — COMPLETE

All 8 stories merged to beta. Promotion PR #110 (beta -> main) merged. See [epic-03-details.md](epic-03-details.md) for details.

## EPIC-06 — COMPLETE (v1.10.0, promoted 2026-03-01)

All 9 stories + refinement + E2E tests + UAT fixes merged and promoted to main.

## EPIC-08 — COMPLETE (v1.11.0, promoted 2026-03-02)

All 6 stories merged and promoted to main. Story 8.6 (#359) remains open, blocked by EPIC-04. See [epic-08-planning.md](epic-08-planning.md).

## EPIC-04 Stories (Household Items & Furniture) — IN PROGRESS

8 stories created (#387-#394). See [epic-04-planning.md](epic-04-planning.md) for full details.
Story 4.1 (#387): PR #396 reviewed APPROVED. Architect refined schema: flat planned_cost/actual_cost/notes replaced by household_item_budgets/household_item_notes tables (mirrors EPIC-05 pattern). Extra columns: url, quantity. Category enum expanded to 8 values. 6 tables total in migration 0010. Document link cascade is application-layer (Story 4.2).
Story 4.2 (#388): PR #397 reviewed APPROVED. 5 CRUD endpoints, 90 tests (46 service + 44 route). Search uses `q` param (consistent with work items). Vendor summary includes `specialty` (superset of AC). documentLinkService updated to validate household_item entity type.
Story 8.6 (#359, EPIC-08) linked as sub-issue, blocked by #391 (detail page).

## EPIC-05 — COMPLETE (v1.9.0, promoted)

All 12 stories merged. Paperless-ngx links for invoices are EPIC-08; budget reporting exports are EPIC-07.

## Key Prioritization Decisions

- Sprints 1-2 complete. Sprint 3: EPIC-05 (Budget) + EPIC-06 (Gantt) in parallel
- Sprint 4: EPIC-04 (Household Items) + EPIC-08 (Paperless-ngx)
- Sprint 5: EPIC-07 (Reporting), EPIC-09 (Dashboard), EPIC-10 (UX Polish)

## Requirements Coverage

- Full coverage tracked via GitHub Issues (epic issues reference requirements sections)
- Section 2.6 (Reporting) has empty body in requirements -- EPIC-07 covers bank exports
- Household Items are explicitly NOT work items (Section 5, Key Decisions)
- Budget has 4 sub-domains: categories, vendors, creditors, subsidies -- all in EPIC-05
- EPIC-11 covers cross-cutting non-functional: testing, Docker deployment, security

## GitHub Projects Board

- Board name: "Cornerstone Backlog", project number 4, owner steilerDev
- Project ID: `PVT_kwHOAGtLQM4BOlve`
- Status Field ID: `PVTSSF_lAHOAGtLQM4BOlvezg9P0yo`
- Status Option IDs: Backlog=`7404f88c`, Todo=`dc74a3b0`, In Progress=`296eeabe`, Done=`c558f50d`
- GraphQL: `addBlockedBy` uses `blockingIssueId` (NOT `blockedByIssueId`)
- Epic node IDs: EPIC-05=`I_kwDORK8WYc7pGysn`, EPIC-06=`I_kwDORK8WYc7pGy3a`

## User Feedback Batch (2026-02-27)

Created 11 issues (#328-#338) from user feedback:

- EPIC-06 sub-issues: #328 (autosave feedback), #329 (date clearing mobile), #330 (remove work item delay), #331 (mobile touch tooltip), #332 (milestone tooltip items), #333 (duration in tooltip), #334 (calendar tooltip parity), #335 (calendar tag colors)
- EPIC-05 sub-issues: #336 (subsidy default categories), #337 (budget range display), #338 (invoice edit link)
- #334 blocked by #332
- All set to Todo status on board
- Classification: 6 bugs (#329, #330, #332, #334, #337, #338), 5 user-stories (#328, #331, #333, #335, #336)

## Patterns and Conventions

- Epic issues use format: "EPIC-NN: Title"
- Story issues use format: "NN.X: Title" (e.g., "11.1: Automated Quality Checks")
- Labels: `epic`, `user-story`, `priority: must have/should have/could have`, `sprint-N`
- Epic body contains task list linking to story issues
- Story body references parent epic with `**Parent Epic**: #NN`
- IMPORTANT: GitHub issue numbers don't always match epic numbers (EPIC-11 is issue #12)
- See detailed topic file: [epic-patterns.md](epic-patterns.md)

## PR Review Patterns

### Three-Phase Validation (per CLAUDE.md)

1. **Planning Phase**: uat-validator drafts scenarios → qa-integration-tester reviews for testability → user approves
2. **Development Phase**: developers implement → qa-integration-tester writes all tests (95%+ coverage target)
3. **Validation Phase**: product-owner reviews PR → checks all ACs + UAT alignment + test coverage

### PO Review Checklist

- Verify ALL acceptance criteria from the story are met (line-by-line check)
- Verify UAT scenarios are addressed (cross-reference uat-validator comment on issue)
- Verify qa-integration-tester wrote the tests (check commit author, not developer)
- Verify 95%+ test coverage on new/modified code (run coverage or review test files)
- Verify all agent responsibilities fulfilled (QA wrote tests, architect reviewed, UAT scenarios exist)
- Check quality gates: lint, typecheck, test, build, npm audit all pass
- Look for common accessibility gaps: missing :focus styles, missing aria-labels, semantic HTML

### Common Issues Found

> **RECURRING VIOLATIONS** (check these FIRST — they have appeared in 3+ PRs):
>
> - **Dependency pinning**: check all package.json changes for `^` or `~` ranges — must use exact versions. Found in PRs #49, #57, others.
> - **Missing keyboard focus indicators**: check :focus or :focus-visible styles on all interactive elements (WCAG 2.1 AA). Recurring across multiple PRs.
> - **Test authorship**: developer agents MUST NOT write tests. Check `Co-Authored-By` trailer in test commits. Caused BLOCKING in PR #152.
> - **E2E gate**: any UAT scenario marked "Automated (E2E)" MUST have Playwright test coverage before PO approval. Caused BLOCKING in PR #157.

- **Missing keyboard focus indicators** — always check for :focus or :focus-visible styles (WCAG 2.1 AA requirement)
- **Test authorship** — verify qa-integration-tester wrote tests, not developer (Co-Authored-By trailer in commit)
- **Incomplete UAT coverage** — check if all scenarios from uat-validator are addressed in implementation
- **Dependency pinning** — always check new deps use exact versions (no `^` or `~`). Found caret range on css-minimizer-webpack-plugin in PR #49 and @fastify/cookie in PR #57. This is a recurring issue.
- **Scope creep in CLAUDE.md** — process/convention changes should be separate PRs, not bundled with feature work
- **Schema migrations with sessions table** — it's correct to include `sessions` table in the same migration as `users` if both are part of the same auth infrastructure (avoids fragmented migrations). Verified in PR #55.
- **AC vs UAT scenario discrepancy** — PR #56 had AC #6 specifying `ACCOUNT_DEACTIVATED` error code but UAT scenario 13 said "generic error message (no indication)". ACs are the source of truth; flag discrepancy as non-blocking observation for security review.
- **Fastify `additionalProperties: false` behavior** — AJV strips extra properties silently by default rather than rejecting 400. Tests correctly assert 201/200. Not a bug, just Fastify's default behavior.
- **Fastify `request.url` includes query strings** — when checking routes against a Set, use `routeUrl` (route pattern) not `request.url` (which includes `?code=abc&state=xyz`). Fixed in PR #61 for auth plugin PUBLIC_ROUTES check.
- **COOKIE_NAME duplication** — now triplicated across `plugins/auth.ts`, `routes/auth.ts`, `routes/oidc.ts`. Flagged as non-blocking in PRs #57 and #61. Should be extracted to shared constant in refinement.
- **Transitive dependency caret ranges in lockfile** — when a direct dependency (e.g., `openid-client: "6.8.2"`) is pinned but its transitive deps in the lockfile show caret ranges (e.g., `jose: "^6.1.3"`), this is normal and acceptable. The lockfile controls exact versions installed.
- **AuthGuard/AuthContext disconnect** — AuthGuard has its own independent state (calls getAuthMe directly, useEffect([],[])). It does NOT subscribe to AuthContext. This means clearing AuthContext.user (e.g., on logout) does NOT trigger AuthGuard to redirect to /login. Found in PR #69 review. Pre-existing design issue but causes AC failures when features depend on reactive auth state changes.
- **UAT scenarios exceeding ACs** — UAT scenarios sometimes add constraints not in the ACs (e.g., UAT-3.4-03 max 10k chars for notes, UAT-3.4-26 max 500 chars for subtask titles, UAT-3.4-43 requiring ALL subtask IDs for reorder). ACs are the source of truth; flag UAT gaps as non-blocking refinement items, not blockers.
- **Multi-select vs single-select filters** — AC #4 of Story 3.5 specified "multi-select dropdown" for status and tag filters, but implementation used single-select `<select>`. Flagged as non-blocking refinement item. When writing ACs, be explicit about "multi-select" vs "single-select" to avoid ambiguity.
- **Shared React ref across mapped elements** — When a single `useRef` is assigned to elements inside `.map()`, only the last element gets the ref. This affects click-outside detection for action menus. Flag for E2E verification.
- **Duplicate fetch logic in components** — `useEffect` fetch body duplicated as standalone function for re-fetch after delete. Refinement candidate to extract shared fetch logic.
- **TODO comments in production code** — PR #105 had `{/* TODO: Load all work items and filter out self */}` in dependency dropdown, meaning the feature was incomplete. Always check for TODO/FIXME comments that indicate unfinished work.
- **`alert()` and `confirm()` in React components** — PR #105 used browser `alert()` for inline edit errors and `confirm()` for note/subtask deletion, while work item deletion used a proper modal. Flag inconsistency for refinement.
- **Color-coded status badge gap** — AC #2 asked for color-coded status (green/yellow/red/gray) but implementation used plain white dropdown. When ACs specify visual styling, verify CSS implements the colors.
- **Server-side error parsing** — Generic error banners ("Failed to create...") don't parse API field-level validation errors. This is a recurring pattern in form pages; flag for refinement.
- **Missing modifier key guards on keyboard shortcuts** — `useKeyboardShortcuts` hook does not check `event.ctrlKey`/`event.altKey`/`event.metaKey`. Ctrl+N sends `event.key: 'n'` with `ctrlKey: true`, incorrectly triggering the `n` shortcut instead of the browser's "new window". Shift+N works by accident (uppercase `N` !== `n`). Flag for refinement.
- **Keyboard selection initial state** — `selectedIndex` starts at 0 instead of -1. Flag for refinement.
- **Dead placeholder pages after route refactoring** — PR #150 replaced BudgetPage import with BudgetCategoriesPage but did not delete the old file. Flag for refinement cleanup.
- **CSS token deviation from UX spec** — Error banner used `--color-danger-active` instead of `--color-danger-text-on-light`. Both are danger tokens but spec should match. Non-blocking. Recurred in PR #151 (VendorsPage + VendorDetailPage). Now a known pattern to watch.
- **specialty/field maxLength mismatch** — PR #151: frontend edit form used `maxLength={100}` for specialty but backend/spec allows 200. Always verify frontend maxLength attributes match backend schema validation. Flag as refinement.
- **Notes field missing empty-state placeholder** — PR #151: VendorDetailPage conditionally renders Notes row only when `vendor.notes` is truthy. Other optional fields show "—" placeholder. All optional fields should show "—" for null/empty values consistently. Flag for refinement.
- **409 error message specificity** — PR #151: VendorDetailPage handleDelete 409 message mentioned only invoices, not work items. When backend returns `{ invoiceCount, workItemCount }` in error details, the frontend message should cover both cases or use the details to construct a precise message.
- **Test authorship enforcement** — PR #152: All 211 tests (service unit, route integration, API client, component) written by frontend-developer, not qa-integration-tester. CLAUDE.md is explicit: "Developer agents do not write tests." Always check commit authors on test commits against Co-Authored-By trailer. Flag as BLOCKING.
- **E2E gate for per-story merges** — PR #152: No Playwright E2E tests in e2e/tests/ for Story #144. UAT scenarios 1,2,6,7,8,10 were marked "Automated (E2E)" but had no coverage. Missing E2E is a BLOCKING issue.
- **UX token deviation: borrowed status tokens** — PR #152: Used `--color-status-not-started-bg/text` (work item status tokens) for pending invoice badge instead of adding dedicated yellow/amber tokens per UX spec. When ux-designer spec calls for NEW palette tokens, verify tokens.css was actually updated. Missing yellow tokens = BLOCKING UX token deviation.
- **UAT scenario vs implementation gap (minor)** — PR #152: UAT Scenario 1 said outstanding balance shown as $0.00 when empty. Implementation hides the badge entirely when no invoices. Unit test confirms implementation behavior. Flag as non-blocking refinement item (implementation tested, just differs from UAT wording).
- **computeUsedAmount placeholder pattern** — Story 5.4 (PR #153): `computeUsedAmount` returns 0 until Story 5.6 adds budget_source_id FK to work_items. This is an ACCEPTED pattern for cross-story dependencies — document with TODO (Story 6) comment and the AC is considered CONDITIONAL PASS. The delete protection is similarly a placeholder and will be wired up in Story 5.6.
- **Frontend totalAmount validation boundary** — PR #153: Frontend allows totalAmount = 0 (min={0}, checks `< 0`), but backend uses `exclusiveMinimum: 0`. Server rejects 0 with 400. Flag for refinement so client-side validation is consistent with server.
- **statusExhausted badge semantic color** — PR #153: "Exhausted" status badge uses gray (`--color-status-not-started-bg`) instead of yellow/amber. Semantically "exhausted" should signal warning. Flag for UX review.
- **E2E test gate is MANDATORY** — PR #157 (Story #148) had all 7 ACs met and 99 unit/integration tests passing, but CI showed "E2E Tests: SKIPPED". This is a BLOCKING issue per CLAUDE.md. When UAT scenarios are marked "Automated (E2E)", Playwright test coverage is mandatory before PO can approve. Requested changes and asked e2e-test-engineer to write tests in e2e/tests/budget/.

### Chore/Maintenance PR Patterns

- Chore PRs with no user stories do not require UAT scenarios.
- Always verify PR description claims match the actual diff. PR #316 claimed MEMORY.md/SKILL.md changes that were not in the diff.
- Function removal (e.g., formatDeadline) can leave double blank lines that Prettier flags. Check for this pattern.
- Dep-pinning is now enforced via pre-commit hook (`scripts/check-dep-pinning.sh`).
- Shared CSS utilities: `client/src/styles/shared.module.css` (CSS Modules `composes:` pattern).
- Shared formatting: `client/src/lib/formatters.ts` (formatCurrency, formatPercent, formatDate).

### When to Request Changes vs Approve

- **Request changes**: AC not met, critical accessibility missing, or tests not written by QA
- **Conditionally approve**: All ACs pass but security-engineer or product-architect reviews pending
- **Approve**: All ACs met, all agent reviews present, minor improvements as comments only

# QA & Integration Tester — Agent Memory (Index)

> This file is an index only — one line per topic. Full detail lives in the linked topic/archive files.

## Reference (evergreen, not story-specific)

- [Test patterns reference](test-patterns-reference.md) — Jest/ts-jest/Fastify/Drizzle infra patterns: sqlite sync errors, ESM mock shape, worktree jest execution, key file locations
- [E2E POM anti-patterns](e2e-pom-patterns.md) — hardcoded waitFor timeouts, `[class*=]` strict-mode collisions, mobile CSS-hidden tables
- [E2E parallel isolation](e2e-parallel-isolation.md) — `testPrefix` fixture for unique per-worker test data, serial-mode for shared-state tests
- [Drag-and-drop jsdom patterns](drag-drop-jsdom-patterns.md) — testing drag-and-drop logic under jsdom

## Story-specific topic files (chronological)

- [Story #1804 — node-cron 4.5 adoption](story-1804-node-cron-45.md) (2026-07-07) — real `task.execute()` pattern (no mocking node-cron); BACKUP_NOT_CONFIGURED 503 is intentionally unreachable since PR #1202 (not a bug) — don't re-add that test; wiki/docstring are stale
- [June 2026 archive](archive-2026-06.md) — #1786 paymentStatus filter, #1693 AutoItemize VAT/inline-draft (×3), #1775 VAT sync, #1705 PhotoAnnotator touch, #1568 ESM mock ordering, #1677/#1679 Paperless-first invoices, #1672 diary vendor fields, #1723 picker hierarchy
- [May 2026 archive](archive-2026-05.md) — React19 iframe onError, #1551 origin field, #1482/#1569 PhotoViewer/konva, #1603 EditBudgetLineModal, #1600 AutoItemize dialog, #1596 categoryMapping, #1557 new shared type in worktree, #1553 EditAndMove, #1547/#1546/#1545 auto-itemize/LLM services, Konva CJS mocking, LocaleProvider wrapper pattern, #1478 PhotoAnnotator polish, #1435 diary UX, XHR/ToastProvider patterns, #1426 diary drafts, #1401 InvoiceBudgetLinesSection
- [April 2026 archive](archive-2026-04.md) — CostBreakdownTable source-filter refactor chain (#1354/#1356/#1358/#1360), BudgetBar mock anti-pattern, JSX unicode escapes, CSS module selectors, de/budget.json smart-quote bug, ESM `jest.spyOn` anti-pattern, Fastify AJV `removeAdditional`
- [March 2026 gap-sprint archive](archive-2026-03-gaps.md) — coverage Gaps 2/3/4/5/6/7, backup/restore #1146+#1201, useSearchParams debounce anti-patterns, ManagePage #1035, work items/HI rework #1033/#1034, areas+trades #1031/#1032, #1010, CalDAV/CardDAV #933, i18n #916, Modal component, dashboard UAT #729-731, dashboard cards #476, invoice budget lines #606, junction-table migration #603/#611, budget service factories #497/#498, #509, #482, #390, worktree symlink fixes
- [Feb-March 2026 feature archive](archive-2026-02-03-features.md) — vendors/invoices/budget-sources/subsidy-programs pages (#143-#148), scheduling engine CPM (Story 6.1-6.4), dashboard/calendar/gantt polish, budget overview refinement #480, milestone CPM #484, work item linking 4.7
- [Story #1030 — Areas & Trades migration](story-1030-areas-trades.md) — migration 0028 test updates (specialty→tradeId, room→areaId, tags removed)
- [Story #1143 — translationKey field](story-1143-translation-keys.md) — testing patterns for translationKey on trades/budgetCategories/householdItemCategories
- [Story #1271/1272/1273 — Area enrichment](story-1271-area-enrichment.md) — sourceEntityArea/parentItemArea/predecessor.area across diary, invoice budget lines, HI deps
- [Story #493 — Cost Breakdown Table improvements](story-493-cost-breakdown.md) (PR #503) — rawProjectedMin/Max, minSubsidyPayback fields
- [Story #509 — Category schema change](story-509-category-schema-change.md) — `category` → `categoryId` migration 0016 test fixes
- [Story #509 — ManagePage rewrite](story-509-manage-page.md) — Unified Tags & Categories management page
- [Story #566 — HI unified budget view](story-566-hi-budget-unified.md) — HouseholdItemDetailPage budget-unified tests
- [Story #470 — User Preferences infrastructure](story-470-preferences.md) — preferencesService + routes tests
- [Story #471 — Dashboard](story-471-dashboard.md)
- [Story #415 — HI timeline dependencies](story-415-household-item-timeline-deps.md) (PR #416) — SVG className in jsdom, autoReschedule HI delivery dates
- [Story #358 — Document linking](story-358-document-linking.md) (PR #378) — waitFor race conditions, duplicate status badge text
- [Story #360 — Document responsive & a11y](story-360-document-a11y.md) — DocumentCard aria-label, focus via setTimeout
- [Diary UAT fixes](story-diary-uat-fixes.md) — sourceEntityTitle, export removal, RecentDiaryCard, detail page changes
- [Story #38 — Test coverage summary](story-38-learnings.md) (2026-02-13)
- [Sentence Builder testing](sentence-builder-testing.md) (feat/dependency-sentence-builder) — dependencyVerbs + DependencySentenceDisplay
- [EPIC-03 UAT review](epic03-uat-review.md) (2026-02-16) — 366 UAT scenarios across 8 stories, 95%+ automatable
- [EPIC-14 E2E validation](epic14-e2e-validation.md) (2026-03-07) — refactoring epic, no new features
- [EPIC-08 E2E](story-epic08-e2e.md)
- [Budget Categories (Story #142)](budget-categories-story-142.md) — seeded category names to avoid in tests, `SEEDED_CATEGORY_COUNT` constant, BudgetCategoriesPage behavior notes

## Known ambient environment quirks (check before assuming a test failure is real)

- Server tests transitively importing `migrate.ts`/`app.ts` may fail locally with `TS1343` (`import.meta.url` under NodeNext) depending on local Node/tsconfig version — CI (Node 24) is authoritative.
- `@cornerstone/shared` must be built (`cd shared && npx tsc`) before running server-side Jest tests in a fresh worktree checkout (no moduleNameMapper fallback for the server project, unlike the client project).
- Client jsdom test suites can fail entirely on local Node 20 (`clearMocksOnScope` missing) — CI (Node 24) passes.

# QA & Integration Tester — Agent Memory (Index)

> One line per topic file below — no detail here. Recent/active work is listed first; older
> per-story notes are grouped chronologically into `archive-*.md` (each has its own dated index).
> NOTE: two sessions compacted the original 1588-line MEMORY.md in parallel (2026-07-07), producing
> two overlapping archive sets (`archive-2026-06/-04-to-05/-02-to-03.md` AND
> `archive-2026-05/-04/-03-gaps/-02-03-features.md`) plus two reference docs each. All files exist;
> content overlaps — dedupe on next compaction.

## Active reference docs (living — update in place)

- [test-infra-reference.md](test-infra-reference.md) — quick-reference conventions, key file locations, renderHook/Drizzle/auth/circular-dep patterns, test count history
- [test-patterns-reference.md](test-patterns-reference.md) — Jest/ts-jest/Fastify/Drizzle infra patterns: sqlite sync errors, ESM mock shape, worktree jest execution, key file locations (overlaps test-infra-reference.md)
- [environment-setup.md](environment-setup.md) — worktree/sandbox gotchas: ARM64 crashes, `@cornerstone/shared` symlink issues, definitive jest invocation pattern, schema quirks

## Recent bug/story notes (2026-07)

- [issue-1811-fastify-error-code-mapping.md](issue-1811-fastify-error-code-mapping.md) (2026-07-07) — FST_* → ErrorCode mapping test pattern (realistic body-limit/malformed-JSON routes + synthetic fallback-path errors); TOCTOU branch in davTokens.ts /profile route not independently testable, coverage-check-only per spec
- [issue-1809-transaction-rollback-tests.md](issue-1809-transaction-rollback-tests.md) — db.transaction rollback test pattern via jest.spyOn(db, 'update'/'insert'/'delete') mid-sequence throw; verify call counts empirically not from spec guesses; console.log is globally mocked in setupTests.ts
- [bug-1807-transitive-mock-drift.md](bug-1807-transitive-mock-drift.md) — grepping for a component tag misses transitive renderers; when a shared component (BudgetLineForm) gains a new required hook field, sweep by grepping for mocks of the _hook's module_ and actually run every match; never restate a prior pass count without re-running it
- [bug-1833-retry-safety.md](bug-1833-retry-safety.md) — auto-itemize save retry-safety: `MaterializeErr.lines` + `mergeMaterializedLines()`, named budget-create mocks added to both AutoItemizePage/PaperlessInvoiceReviewPage test files
- [Story #1805 — budget breakdown VAT gross-up](story-1805-vat-breakdown-gross-up.md) (2026-07-07) — fixed-subsidy `Math.min(perLineAmount,costBasis)` cap lives in overview.ts not breakdown.ts; CONFIDENCE_MARGINS.own_estimate is 20% not 0%; NOT NULL includes_vat is unreachable-null
- [Bug #1808 — totalReductions maximumAmount cap](bug-1808-totalreductions-cap.md) (2026-07-07) — `applySubsidyCaps` fed the same point-estimate as min/max input to collapse to a capped scalar; fixed-subsidy range invariant (`minTotalPayback <= totalReductions`) breaks for multi-line/category-restricted fixed subsidies — pre-existing engine quirk, don't generalize scenario coverage to it
- [Story #1804 — node-cron 4.5 adoption](story-1804-node-cron-45.md) (2026-07-07) — real `task.execute()` pattern (no mocking node-cron); BACKUP_NOT_CONFIGURED 503 is intentionally unreachable since PR #1202 (not a bug) — don't re-add that test; wiki/docstring are stale

## Known ambient environment quirks (check before assuming a test failure is real)

- Server tests transitively importing `migrate.ts`/`app.ts` may fail locally with `TS1343` (`import.meta.url` under NodeNext) depending on local Node/tsconfig version — CI (Node 24) is authoritative.
- `@cornerstone/shared` must be built (`cd shared && npx tsc`) before running server-side Jest tests in a fresh worktree checkout (no moduleNameMapper fallback for the server project, unlike the client project).
- Client jsdom test suites can fail entirely on local Node 20 (`clearMocksOnScope` missing) — CI (Node 24) passes.

## Curated topic files (stable patterns, one story/feature per file)

- [budget-categories-story-142.md](budget-categories-story-142.md) — Budget Categories CRUD test coverage
- [drag-drop-jsdom-patterns.md](drag-drop-jsdom-patterns.md) — drag-and-drop testing patterns/anti-patterns under jsdom
- [e2e-parallel-isolation.md](e2e-parallel-isolation.md) — E2E parallel test data isolation patterns
- [e2e-pom-patterns.md](e2e-pom-patterns.md) — E2E page-object-model conventions
- [epic03-uat-review.md](epic03-uat-review.md) — EPIC-03 UAT review learnings
- [epic14-e2e-validation.md](epic14-e2e-validation.md) — EPIC-14 E2E validation notes
- [sentence-builder-testing.md](sentence-builder-testing.md) — dependency sentence-builder test coverage
- [story-1030-areas-trades.md](story-1030-areas-trades.md) — EPIC-18 areas & trades migration (0028) test updates
- [story-1143-translation-keys.md](story-1143-translation-keys.md) — `translationKey` field testing patterns
- [story-1271-area-enrichment.md](story-1271-area-enrichment.md) — area enrichment tests (diary/invoice/HI deps)
- [story-358-document-linking.md](story-358-document-linking.md) — document linking tests
- [story-360-document-a11y.md](story-360-document-a11y.md) — document responsive & a11y tests
- [story-38-learnings.md](story-38-learnings.md) — Story #38 test coverage summary
- [story-415-household-item-timeline-deps.md](story-415-household-item-timeline-deps.md) — HI timeline dependency tests
- [story-470-preferences.md](story-470-preferences.md) — user preferences infrastructure tests
- [story-471-dashboard.md](story-471-dashboard.md) — dashboard tests
- [story-493-cost-breakdown.md](story-493-cost-breakdown.md) — cost breakdown table improvements
- [story-509-category-schema-change.md](story-509-category-schema-change.md) — `category` → `categoryId` schema change fix notes
- [story-509-manage-page.md](story-509-manage-page.md) — unified tags & categories management page tests
- [story-566-hi-budget-unified.md](story-566-hi-budget-unified.md) — HI unified budget view tests
- [story-diary-uat-fixes.md](story-diary-uat-fixes.md) — diary UAT fixes test patterns
- [story-epic08-e2e.md](story-epic08-e2e.md) — EPIC-08 E2E tests

## Archived chronological logs (per-story/bug notes, dated)

- [archive-2026-06.md](archive-2026-06.md) — auto-itemize inline-draft/VAT/merge-lines, PhotoAnnotator touch, diary vendor fields (Stories #1551-#1786, #1672, #1677, #1679, #1693, #1705, #1723; Bug #1775; Issue #1568)
- [archive-2026-04-to-05.md](archive-2026-04-to-05.md) — budget-extraction/auto-itemize services, CostBreakdownTable filters, PhotoAnnotator polish, diary drafts, Konva/locale/XHR mock patterns (Stories #1354-#1603; PR #1496)
- [archive-2026-02-to-03.md](archive-2026-02-to-03.md) — Gantt/scheduling (Story 6.x), budget junction migration, EPIC-06 E2E, household items, areas/trades CRUD, vendor/subsidy/budget-source page behavior notes (Stories #358-#1201, #390-#498, #603-#933, #1010-#1146; Bugs #482/#484/#1201; EPIC-04/06)
- [archive-2026-05.md](archive-2026-05.md) — React19 iframe onError, #1551 origin field, #1482/#1569 PhotoViewer/konva, #1603 EditBudgetLineModal, #1600 AutoItemize dialog, #1596 categoryMapping, #1557 new shared type in worktree, #1553 EditAndMove, #1547/#1546/#1545 auto-itemize/LLM services, Konva CJS mocking, LocaleProvider wrapper pattern, #1478 PhotoAnnotator polish, #1435 diary UX, XHR/ToastProvider patterns, #1426 diary drafts, #1401 InvoiceBudgetLinesSection (parallel compaction — overlaps archive-2026-04-to-05.md)
- [archive-2026-04.md](archive-2026-04.md) — CostBreakdownTable source-filter refactor chain (#1354/#1356/#1358/#1360), BudgetBar mock anti-pattern, JSX unicode escapes, CSS module selectors, de/budget.json smart-quote bug, ESM `jest.spyOn` anti-pattern, Fastify AJV `removeAdditional` (parallel compaction — overlaps archive-2026-04-to-05.md)
- [archive-2026-03-gaps.md](archive-2026-03-gaps.md) — coverage Gaps 2/3/4/5/6/7, backup/restore #1146+#1201, useSearchParams debounce anti-patterns, ManagePage #1035, work items/HI rework #1033/#1034, areas+trades #1031/#1032, #1010, CalDAV/CardDAV #933, i18n #916, Modal component, dashboard UAT #729-731, dashboard cards #476, invoice budget lines #606, junction-table migration #603/#611, budget service factories #497/#498, #509, #482, #390, worktree symlink fixes (parallel compaction — overlaps archive-2026-02-to-03.md)
- [archive-2026-02-03-features.md](archive-2026-02-03-features.md) — vendors/invoices/budget-sources/subsidy-programs pages (#143-#148), scheduling engine CPM (Story 6.1-6.4), dashboard/calendar/gantt polish, budget overview refinement #480, milestone CPM #484, work item linking 4.7 (parallel compaction — overlaps archive-2026-02-to-03.md)

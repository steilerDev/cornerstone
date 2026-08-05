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

## Recent bug/story notes (2026-08)

- [Issue #2001 — remove TFunction from reportPdf](story-2001-remove-tfunc-reportpdf.md) (2026-08-05, 2 rounds) — 7 test files total; realRender.test.ts has renderOverviewPdfContent (KEEP its t) vs buildOverviewContent/generateReportPdf (REMOVE); perl regex targets `{ attachDocuments: }` context to avoid removing renderOverviewPdfContent args; comment on same line blocks regex → explicit Edit; 218 tests pass round 2.

- [Bug #1897 — deposit-blind drill-down fix](bug-1897-deposit-blind-drilldown.md) (2026-08-04) — `getBudgetSourceBudgetLines` was deposit-blind; fix routes through `getInvoiceAggregates`; 7 tests in new `describe('deposit-aware drill-down')` block appended to `budgetSourceService.test.ts`; local WI/HI/deposit helpers; AC1 is the reproduction case.

- [PR #1959 — inline meta content loss + `it.failing` tripwires](pr-1959-inline-meta-content-loss.md) (2026-08-03, RESOLVED) — prod defect found+fixed (unchunked meta in a `dontBreakRows` cell silently drops pages); **a tripwire is worthless if a shared helper bakes in the buggy assumption** — mine nearly stayed green through the fix; channel-equivalence is the threshold-free assertion; tree-level assertions cannot see this bug class; **write NBSP as `\u00A0` in test expectations, never a literal** (I smuggled one into the guard against it); keep literal+invariant at different levels; non-positive chunk budgets HANG not throw; `grep` silently returns nothing on these test files (use `awk`).
- [Bug #1955 — echo-race harness + mutation probes](bug-1955-echo-race-harness.md) (2026-08-03) — echo must fire on the write's _resolve_ (not the call) or the queue fix masks the guard and the test passes pre-fix; `rerender()` stands in for the optimistic `setPreferences`; 4 perl mutation probes prove each test guards a distinct part of the fix; never run repo-wide `npm run format` (38 unrelated files drift).

- [Story #1930 — attachment tier rules](story-1930-attachment-tier.md) (2026-08-02) — new `attachmentTierUtils.test.ts` (100% cov, table+explicit-null pattern); sourceReportService.test.ts 16a/b/c/e → AC1/AC2/AC3/AC5; cross-report-type test needs a fresh invoice per report type; round 2 added a genuinely discriminating proof-of-funds fixture (deposit-only invoice, tagged+claimed deposit) after PO flagged the original AC3/16 pof blocks weren't change-detecting — inline-swap isolation technique to prove it fails on old logic.
- [Issue #1929 round 2 — real-render pdfmake technique](story-1929-round2-real-render-technique.md) (2026-08-02, PR #1935) — `_calcWidth`/`.positions[].pageNumber` are readable after a real `getBlob()` on a held content reference (round-1's "inaccessible" comment was wrong, verified against pdfmake@0.3.11 source); measured Usage column widths (138.28pt/186.78pt, both locales, both shapes); git-stash/backup technique to prove tests genuinely fail on unpatched code; tighter layouts break old page-count fixture assumptions (scale fixtures up, don't weaken assertions); `expect(async () => {}).not.toThrow()` is a no-op anti-pattern.
- [Story #1923 — report table cleanup](story-1923-report-table-cleanup.md) (2026-08-02) — unnumbered shared †/‡ markers, isDeposit/isClaim/areaText fixture ripple across 8 report test files, overviewPdf allocated-cell-is-always-an-array-of-runs gotcha, worktree `node_modules/@cornerstone/shared` symlink pointing at a differently-branched base repo (false-positive `tsc` errors; trust jest).
- [Bugs #1895/#1896/#1918 — claim/deposit scope fixes](bugs-1895-1896-1918-claim-deposit-scope.md) (2026-08-01) — `markInvoicesClaimed` gained `sourceId`+required `depositIds` params (cross-source claim guard, decoupled sweep, quotation+sweepable-deposit no longer 409s); `getSourceReport` drops zero-portion `budgetLines[]` on `claim` reports only; text-content query collision gotcha (banner text contains data also shown elsewhere on page).

## Recent bug/story notes (2026-07)

- [Story #1901 — AI-generated report content](story-1901-ai-report-content.md) (2026-07-31) — Blocker bug #1915 (reportContentGenerationService.ts imports non-existent `work_items`/`household_items` schema exports — crashes `buildApp()` app-wide via app.ts's static import chain); wrote both server test files correctly per spec, blocked but not weakened; fixed pre-existing ReportWizardPage.test.tsx breakage from concurrent prod changes; fake-timer-leak lesson (`jest.isMockFunction(setInterval)` unreliable — always unconditional `jest.useRealTimers()` in afterEach); llmEnabled ripple across 8 server files + LocaleContext.test.tsx.
- [Story #1900 — editable report preview](story-1900-editable-report-preview.md) (2026-07-31, RESOLVED) — Retry button needed 2 fix rounds (don't trust "fix landed" without re-reading the ternary); dual-tree desktop/mobile query-scoping pattern; mock-queue-pollution and call-count-vs-continuation race gotchas.
- [CI fix: timeline.test.ts calendar drift](ci-fix-timeline-calendar-drift.md) (2026-07-31, PR #1902) — fake-timers freeze desyncs schedulingEngine.ts's module-level `lastRescheduleDate` gate; fixed via relative-date fixtures.
- [Story #1898 — report table refinements](story-1898-report-table-refinements.md) (2026-07-31, RESOLVED) — CRITICAL prod bug: pdfmake has no "N*" weighted-star width syntax, crashed real rendering (type-checker didn't catch it); fixture-audit gotcha when a marker rule adds a new required field.
- [Story #1891 — bank report wizard follow-up](story-1891-report-wizard-followup.md) (2026-07-30) — 2 confirmed prod bugs (isSplit hardcoded false regression; runaway PDF-regen loop); AJV `coerceTypes:true` silently stringifies numbers; byte-identical Rail-A/B regression-proof pattern; `flushBudgetDataLoad()` extra-act() pattern.
- [Story #1879 — report wizard frontend](story-1879-report-wizard-frontend.md) (2026-07-29 → 07-30, 7 rounds) — pdfmake loader/vfs/font blockers (resolved via real addVirtualFileSystem/addFonts API); i18next dot-vs-colon cross-namespace bug family (recurred 4 rounds); `createPdf()` is lazy, wrap rejects in `await expect(...).rejects.toThrow()` not sync `expect(()=>).toThrow()`; final: ReportWizardPage regen-effect infinite-loop bug still open at round 7.
- [Story #1878 — source report backend](story-1878-source-report-backend.md) (2026-07-29) — 6 confirmed prod bugs incl. `for (const doc of docs)` iterating Map tuples instead of `.values()` (issue #1884); branch-coverage-ceiling reasoning for Record<Status,...>-guaranteed unreachable fallbacks.
- [Story #1876 — deposit refunds](story-1876-deposit-refunds.md) (2026-07-29) — Wiki Accuracy bug confirmed (spec said 400, actual 200 silent strip); diff-vs-baseline coverage triage technique for large legacy files.
- [archive-2026-07-early.md](archive-2026-07-early.md) — Issues #1816/#1815/#1814/#1813/#1812/#1811/#1809, Bugs #1807/#1833/#1808, Stories #1805/#1804 (all 2026-07-07)

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

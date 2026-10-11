# QA & Integration Tester — Agent Memory (Index)

> One line per topic file; detail lives in the files. Newest work first; older per-story notes are in
> dated `archive-*.md` files. The archive sets `archive-2026-06/-04-to-05/-02-to-03.md` and
> `archive-2026-05/-04/-03-gaps/-02-03-features.md` overlap (parallel compaction 2026-07-07) — dedupe when next touched.

## Living reference docs (update in place)

- [test-infra-reference.md](test-infra-reference.md) — conventions, key file locations, renderHook/Drizzle/auth/circular-dep patterns, test count history
- [test-patterns-reference.md](test-patterns-reference.md) — Jest/ts-jest/Fastify/Drizzle patterns: sqlite sync errors, ESM mock shape (overlaps test-infra-reference)
- [environment-setup.md](environment-setup.md) — worktree/sandbox gotchas, jest invocation, shared symlink/dist; current sandbox has real node_modules: never `rm -rf node_modules` for one package

## Stories and bugs, newest first

- [Story #2209 client tests](story-2209-client-tests.md) (2026-10-10) — host-page mock plumbing (deleteImpact/toast/formatDayMonth), blocked-only-on-409 mutant, Escape-swallow + focus-to-body prod bugs, mutation script
- [Story #2209 undo/delete-impact server tests](story-2209-undo-delete-impact.md) (2026-10-10) — undoStore captures Date.now, milestone-delay repro, mutation-script pattern, equivalent mutants
- [Story #2207 phone/tablet shell](story-2207-phone-tablet-shell.md) (2026-10-10) — matchMedia control, resetModules vs RTL, previousPath by idx
- [Story #2206 top bar / user menu](story-2206-top-bar-user-menu.md) (2026-10-10) — matchMedia not configurable, noTabRows, OverflowMenu classes
- [Issue #2132 in-place restore](issue-2132-restore-in-place-tests.md) (2026-10) — renameSync spy, non-WAL fixtures, lock-leak cascade
- [Story #2202 page identity](story-2202-page-identity.md) (2026-10) — OriginProbe helper, title/breadcrumb patterns
- [Story #2204 deep links](story-2204-deep-links.md) (2026-10) — jsdom hash trick, title hook needs Router
- [Story #2199 scheduler truth](story-2199-scheduler-truth.md) (2026-10) — planned vs forecast, fake timers for real-clock services
- [PR #2168 error-message hardening](issue-2168-error-hardening-tests.md) (2026-10) — ApiClientError.message=code, duplicate banners
- [Wizard rAF focus-steal flake](gotcha-wizard-raf-focus-steal.md) (2026-10) — settle h2 focus before typing; mockReset once-queues
- [Issue #2101 Paperless infinite scroll](issue-2101-infinite-scroll-tests.md) (2026-09-29) — ts-node-less jest, command-complexity guard, act warnings
- [Picker slowness — RESOLVED](pr2070-searchpicker-dropdown-timeout.md) — nwsapi 2.2.27 `:modal` recursion; `--cpu-prof` first; `projects[].testTimeout` is a no-op
- [Issue #2056 jest.fn<any>() never fix](issue-2056-jest-fn-any-never-bump.md) (2026-09-07) — typed-generic fix hierarchy, stale Vendor fixtures
- [Issue #1950 derived ceiling guard](issue-1950-derived-ceiling-guard.md) (2026-08-06) — char/line/pt formula, stale AC flagged via it.todo
- [Issue #1991 strict int parsing](issue-1991-strict-int-parsing.md) (2026-08-06) — coverage judged against the diff; grep the coverage table
- [Issue #1953 independent pinning](story-1953-independent-pinning.md) (2026-08-06) — duplicate assertions, titles vs bodies
- [Issue #1941 EditableField maxLength](story-1941-editable-field-maxlength.md) (2026-08-06) — jsdom does not clamp maxlength; a failing DOM-shape test can be right
- [Issue #1940 continuation marker](story-1940-continuation-marker-runt-merge.md) (2026-08-06) — stripContinuationMarker, fontkit glyph-0, revert proof
- [Issue #1912 ESM mock blast radius](issue-1912-esm-mock-blast-radius.md) (2026-08-06) — new shared export breaks other files' partial mock factories
- [Issue #1911 splitKind](story-1911-splitkind.md) (2026-08-05) — UNION origin-column trap, queryChunks introspection, stash anti-vacuity proof
- [Issue #2001 remove TFunction from reportPdf](story-2001-remove-tfunc-reportpdf.md) (2026-08-05) — keep t in renderOverviewPdfContent only
- [Bug #1897 deposit-blind drill-down](bug-1897-deposit-blind-drilldown.md) (2026-08-04) — fix via getInvoiceAggregates
- [PR #1959 inline meta content loss](pr-1959-inline-meta-content-loss.md) (2026-08-03) — it.failing tripwires, channel equivalence, NBSP as  , grep vs awk
- [Bug #1955 echo-race harness](bug-1955-echo-race-harness.md) (2026-08-03) — echo on resolve, perl mutation probes, never repo-wide format
- [Story #1930 attachment tier](story-1930-attachment-tier.md) (2026-08-02) — table+null pattern, discriminating proof-of-funds fixture
- [Issue #1929 real-render pdfmake](story-1929-round2-real-render-technique.md) (2026-08-02) — _calcWidth/positions readable after getBlob
- [Story #1923 report table cleanup](story-1923-report-table-cleanup.md) (2026-08-02) — shared markers, fixture ripple, stale shared symlink
- [Bugs #1895/#1896/#1918 claim scope](bugs-1895-1896-1918-claim-deposit-scope.md) (2026-08-01) — markInvoicesClaimed sourceId/depositIds
- [Story #1901 AI report content](story-1901-ai-report-content.md) (2026-07-31) — blocker #1915, unconditional useRealTimers
- [Story #1900 editable report preview](story-1900-editable-report-preview.md) (2026-07-31) — re-read fixes, dual-tree query scoping
- [CI fix timeline calendar drift](ci-fix-timeline-calendar-drift.md) (2026-07-31) — fake timers vs lastRescheduleDate gate
- [Story #1898 report table refinements](story-1898-report-table-refinements.md) (2026-07-31) — pdfmake has no "N*" widths
- [Story #1891 report wizard follow-up](story-1891-report-wizard-followup.md) (2026-07-30) — AJV coerceTypes, Rail-A/B regression proof
- [Story #1879 report wizard frontend](story-1879-report-wizard-frontend.md) (2026-07-29) — pdfmake loader, i18next dot-vs-colon, lazy createPdf
- [Story #1878 source report backend](story-1878-source-report-backend.md) (2026-07-29) — Map iteration bug #1884, branch-ceiling reasoning
- [Story #1876 deposit refunds](story-1876-deposit-refunds.md) (2026-07-29) — wiki deviation, diff-vs-baseline coverage
- [archive-2026-07-early.md](archive-2026-07-early.md) — Issues #1809-#1816, Bugs #1807/#1808/#1833, Stories #1804/#1805
- [gotcha-esm-mock-static-import-order.md](gotcha-esm-mock-static-import-order.md) — lazy-import formatters/i18n in LocaleContext-mocked tests; big heredocs refused

## Ambient environment quirks (check before assuming a failure is real)

- Server tests importing `migrate.ts`/`app.ts` may fail locally with `TS1343` (`import.meta.url`); CI (Node 24) is authoritative.
- Build `@cornerstone/shared` (`cd shared && npx tsc`) before server Jest in a fresh worktree (server project has no moduleNameMapper fallback).
- Client jsdom suites can fail entirely on local Node 20 (`clearMocksOnScope` missing); CI passes.
- Full-directory jest runs can SIGKILL a worker (sandbox memory); rerun the killed file alone before treating it as a failure.

## Curated topic files (stable patterns)

- [budget-categories-story-142.md](budget-categories-story-142.md) — Budget Categories CRUD
- [drag-drop-jsdom-patterns.md](drag-drop-jsdom-patterns.md) — drag-and-drop under jsdom
- [e2e-parallel-isolation.md](e2e-parallel-isolation.md) — E2E parallel data isolation
- [e2e-pom-patterns.md](e2e-pom-patterns.md) — E2E page-object conventions
- [epic03-uat-review.md](epic03-uat-review.md) — EPIC-03 UAT review
- [epic14-e2e-validation.md](epic14-e2e-validation.md) — EPIC-14 E2E validation
- [sentence-builder-testing.md](sentence-builder-testing.md) — dependency sentence builder
- [story-1030-areas-trades.md](story-1030-areas-trades.md) — EPIC-18 areas & trades migration 0028
- [story-1143-translation-keys.md](story-1143-translation-keys.md) — `translationKey` patterns
- [story-1271-area-enrichment.md](story-1271-area-enrichment.md) — area enrichment (diary/invoice/HI deps)
- [story-358-document-linking.md](story-358-document-linking.md) — document linking
- [story-360-document-a11y.md](story-360-document-a11y.md) — document responsive & a11y
- [story-38-learnings.md](story-38-learnings.md) — Story #38 coverage summary
- [story-415-household-item-timeline-deps.md](story-415-household-item-timeline-deps.md) — HI timeline deps
- [story-470-preferences.md](story-470-preferences.md) — user preferences
- [story-471-dashboard.md](story-471-dashboard.md) — dashboard
- [story-493-cost-breakdown.md](story-493-cost-breakdown.md) — cost breakdown table
- [story-509-category-schema-change.md](story-509-category-schema-change.md) — `category` to `categoryId` change
- [story-509-manage-page.md](story-509-manage-page.md) — tags & categories manage page
- [story-566-hi-budget-unified.md](story-566-hi-budget-unified.md) — HI unified budget view
- [story-diary-uat-fixes.md](story-diary-uat-fixes.md) — diary UAT fixes
- [story-epic08-e2e.md](story-epic08-e2e.md) — EPIC-08 E2E

## Archived chronological logs

- [archive-2026-06.md](archive-2026-06.md) — auto-itemize, PhotoAnnotator touch, diary vendor fields (#1551-#1786)
- [archive-2026-04-to-05.md](archive-2026-04-to-05.md) — budget-extraction/auto-itemize, CostBreakdownTable filters, Konva/locale/XHR mocks (#1354-#1603)
- [archive-2026-02-to-03.md](archive-2026-02-to-03.md) — Gantt/scheduling, budget junction migration, areas/trades, vendor/subsidy pages (#358-#1201)
- [archive-2026-05.md](archive-2026-05.md) — React19 iframe, PhotoViewer/konva, EditBudgetLineModal, AutoItemize dialog, LLM services (overlaps 04-to-05)
- [archive-2026-04.md](archive-2026-04.md) — CostBreakdownTable chain, BudgetBar mock anti-pattern, ESM spyOn anti-pattern, AJV removeAdditional (overlaps 04-to-05)
- [archive-2026-03-gaps.md](archive-2026-03-gaps.md) — coverage gaps 2-7, backup/restore, ManagePage, CalDAV/CardDAV, i18n, Modal, dashboards (overlaps 02-to-03)
- [archive-2026-02-03-features.md](archive-2026-02-03-features.md) — vendors/invoices/budget-sources/subsidies pages, CPM engine, calendar/gantt (overlaps 02-to-03)

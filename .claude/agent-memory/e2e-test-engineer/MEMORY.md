# E2E Test Engineer — Agent Memory (Index)

> Detailed notes live in topic files. This index is a one-line-per-topic pointer; do not add bulk content here — append to (or create) a topic file and add one line below.

## Topic files

- [general-e2e-patterns.md](general-e2e-patterns.md) — cross-cutting waits/timing, viewport timeouts, strict-mode anti-patterns, DataTable migration fallout, Gantt touch, breadcrumbs, print, dashboard cards, headless-shell PDF-iframe limitation → CSP header+console verification pattern (blob-fetch leg removed, connect-src pitfall), key file locations.
- [e2e-pom-patterns.md](e2e-pom-patterns.md) — Page Object Model conventions and stable-locator strategies.
- [e2e-parallel-isolation.md](e2e-parallel-isolation.md) — `testPrefix` fixture, parallel-safe data isolation, serial-mode tests (serial is **superseded** for preference rows — see next line).
- [isolated-user-fixture.md](isolated-user-fixture.md) — `e2e/fixtures/isolatedUser.ts` dedicated-user opt-in for preference-mutating specs (#1957); **`test.use()` reshuffles shard membership suite-wide → unrelated shards go red**; login rate limit 20/15min, soft user delete, worker-scoped-option-in-describe ban, `--list` as the only local validation.
- [known-flakes-and-regressions.md](known-flakes-and-regressions.md) — triaged log of flaky tests, pre-existing CI failures, and production regressions caught by E2E. **Check this before re-triaging a failure.**
- [flake-patterns.md](flake-patterns.md) — flake-avoidance patterns moved from the implementation checklist: Konva canvas coordinates, `test.slow()` timeout negation, locale timing after reload, shard redistribution, stale cache-warmup CI. Check when writing timing-sensitive tests or adding spec files.
- [auto-itemize-and-invoices-e2e.md](auto-itemize-and-invoices-e2e.md) — AutoItemizePage, PaperlessInvoiceReviewPage, invoice budget lines, Paperless mocking, vendor reassignment.
- [bug-1833-materialize-retry-dedup.md](bug-1833-materialize-retry-dedup.md) — retry-after-real-commit-failure regression pattern (Bug #1833).
- [document-linking-and-photos-e2e.md](document-linking-and-photos-e2e.md) — document-linking (Paperless), photo picker/upload flows, orientations.
- [photo-annotator-e2e.md](photo-annotator-e2e.md) — Konva canvas annotator (post-SVG-migration rewrite, touch/pointer-event handling).
- [diary-e2e.md](diary-e2e.md) — Construction Diary feature: drafts, forms, list/detail, mode filters, UAT-fix history.
- [issue-2060-diary-infinite-scroll.md](issue-2060-diary-infinite-scroll.md) — Diary pager → IntersectionObserver infinite scroll: footer DOM shape/render conditions, POM additions, 11-scenario test breakdown.
- [print-and-i18n.md](print-and-i18n.md) — print-mode E2E and i18n locale-switch testing.
- [milestones-e2e.md](milestones-e2e.md) — Milestones feature POM and selectors.
- [searchpicker-mobile-1708.md](searchpicker-mobile-1708.md) — SearchPicker mobile dropdown-anchor regression (Issue #1708).
- [story-933-dav-vendor-contacts.md](story-933-dav-vendor-contacts.md) — vendor contacts / CardDAV story notes.
- [story-1248-mass-move.md](story-1248-mass-move.md) — mass-move budget line story notes.
- [story-epic08-e2e.md](story-epic08-e2e.md) — EPIC-08 Paperless integration (no testcontainer yet — all document tests validate "not configured" state only).
- [bug-1829-shard3-flakes.md](bug-1829-shard3-flakes.md) — root cause + fix for the shard-3 diary flakes blocking main promotions; also proves `maxFailures` already tolerates one retry-passing test (Playwright source citation).
- [story-1876-deposit-refunds.md](story-1876-deposit-refunds.md) — deposit `entryType` refunds; DataTable hidden-column read pattern (`getColumnCellText`), table+card dual-DOM visible-filter pitfall.
- [story-1879-report-wizard.md](story-1879-report-wizard.md) — Bank Report Wizard POM/spec; Blocker bug #1886 (budgetSources envelope crash blocks all progress past step 1) + compile errors/missing i18n keys found via `tsc`; source-report E2E seeding pattern (WI budget → invoice-budget-line link); Story #1899 added a 5th step ("Settings" — report language + moved toggles), preview iframe only exists on step 5 now. Issue #1933: `.headerCheckbox` class removed → `selectAllCheckbox` rescoped via `.listHeader`; `openInvoiceLink()` new-tab affordance; no mobile card layout exists for invoice rows. Parallel-worktree "Scenario N" numbering collision vs #1943 resolved via snapshot-and-reappend (see file) — reusable pattern for same-insertion-point conflicts.
- [story-1891-wizard-followup.md](story-1891-wizard-followup.md) — expandable invoice rows, CSP `blob:` frame-src hardened preview check (SUPERSEDED TWICE — `page.frames()` proof, then in-page blob fetch → now header+console-only, see general-e2e-patterns.md), deposit budget-source tagging; 2 filed bugs (#1892 full-exclusion display, #1893 missing deposit-default heuristic); sandbox CAN now build+boot the full container stack (see `sandbox-live-verification.md`) but browser binary download is still network-policy-blocked.
- [sandbox-live-verification.md](sandbox-live-verification.md) — **live E2E runs WORK** (since #2212): run the Playwright CLI inside the local `mcr.microsoft.com/playwright:v1.63.0-noble` image with the host docker socket, after building `cornerstone:e2e` from a node_modules-free copy; full recipe + gotchas at the end of the file. Older sections describe the pre-recipe blockers.
- [story-2212-new-menu-objectform.md](story-2212-new-menu-objectform.md) — #2212 New menu + ObjectForm dialog: `ObjectFormDialog`/`CreateMenu` POMs, Modal-vs-Sheet measuring, migrated create suites, 5 live-run production defects to re-check before blaming tests.
- [story-1901-ai-report-generation.md](story-1901-ai-report-generation.md) — AI-generated usage descriptions/cover letter: new `reportWizardAiGeneration.spec.ts` + POM AI locators; llmEnabled-mock pattern; overwrite-modal-guard-checks-overrides-not-aiContent gotcha; cover-letter-fields-need-contactAddress/reference seed trap; reused auto-itemize LLM error strings.
- [story-1900-editable-report-preview.md](story-1900-editable-report-preview.md) — step 5 reworked from always-present auto-regenerating iframe → live editable surface + on-demand PDF Modal; POM rename `waitForPreviewReady/Regenerated` → `openPdfPreviewModal`/`closePdfPreviewModal` (must close before another modal-opening action); 4 filed bugs (#1904-#1907, all now FIXED+CLOSED, see file's re-verification section); deliberate deviation editing a file explicitly marked "do not touch" because leaving it broke `tsc` workspace-wide — see file for the general lesson; `footnoteFetchFailed` skip note naturally reachable with no Paperless container, no mock needed; re-verification added `mobileCard()`/`mobileUsageField()` POM locators + Scenario 15 (#1907 regression guard) + found/filed NEW bug #1908 (mobile-card fallback visible on desktop, no default `display:none`) with its own expected-to-fail Scenario 1b.

- [issue-1959-inline-meta-and-labels.md](issue-1959-inline-meta-and-labels.md) — #1959 reversed #1923's †/‡ footnotes → inline `(partial)`/`(less deposit)` and merged area+attachments into one `.usageMetaText` line; POM renames, rewritten scenarios 2/17/18/20 + AI 8, attachment-tier facts, untested column toggles.
- [claim-deposit-scope-1922.md](claim-deposit-scope-1922.md) — PR #1922 invoice/deposit claim-scope split: `handleMarkClaimed`'s two-array submit, server-truth success-banner counts, the three "deposit surfaces the invoice" shapes, `claimNothingClaimable` guard.
- [issue-1973-column-visibility-pdf.md](issue-1973-column-visibility-pdf.md) — column-visibility toggles wired to the PDF (supersedes #1966): reducer reset facts (use-case change resets `hiddenColumns`, `SET_ATTACH_DOCUMENTS` doesn't), Scenarios 28-33, size-diff PDF-consequence proof pattern, `goBack()` viewport-independent multi-step walk, new `columnToggleGroup`/`usageHiddenAttachmentsWarning` POM locators.
- [issue-1911-splitkind-e2e.md](issue-1911-splitkind-e2e.md) — #1911 `splitKind` field: incoming spec said "no E2E changes needed", was wrong — fixed Scenario 18's mis-seeded fixture AND found Scenario 17 independently affected (zero-contribution-line case) by cross-referencing unit-test ACs; new AC-3.2 regression-guard sibling test; POM docblock corrections.
- [story-2201-route-map-walk.md](story-2201-route-map-walk.md) — #2201: POMs build URLs via shared `routeUrl`; legacy-url-walk spec design (frozen 26 redirects, hop log, strict param seeding).

- [story-2211-command-search.md](story-2211-command-search.md) — #2211 palette POM/spec, Back-reopens-palette defect, list-search text collision, sandbox run notes.
- [story-2215-project-setup.md](story-2215-project-setup.md) — #2215 Project setup POM (ReferenceListControl), mocked global-list reorder, anchors, live-run traps.
- [story-2238-invoices-list.md](story-2238-invoices-list.md) — #2238 Invoices ObjectList POM (surface-agnostic locators), chip/URL rules, footer-vs-server comparison, empty-state and chip-URL rules.

## Open follow-ups to flag to orchestrator

- No Paperless-ngx testcontainer exists yet (story-epic08-e2e.md) — all Paperless E2E coverage is `page.route()` mocked, not real integration. Add the container when Paperless work resumes.
- **Filed bugs from Story #1891, unresolved**: #1892 (fully-excluding all budget lines on an invoice removes it from the report wizard's step-3 list instead of showing €0.00 — display-only, PDF/claim unaffected) and #1893 (deposit budget-source auto-default 0/1/>1-source heuristic is entirely unimplemented — `InvoiceDepositsSection.tsx` never receives the invoice's budget lines).
- **Filed bug from Story #1900 re-verification, unresolved**: #1908 (Major — `.mobileCardList` has no default `display:none`, so the #1904 mobile-card fix also renders duplicated on desktop/tablet; one-line CSS fix, regression-guard test already in place as Scenario 1b in `reportWizardEditableContent.spec.ts`, currently expected-to-fail until fixed).
- Containerized E2E verification capability varies by sandbox instance — **do not assume the old "no dhi.io creds" note still applies**; re-attempt `docker build -t cornerstone:e2e .` each session before falling back to static-only verification. See `sandbox-live-verification.md` for the current state and the remaining browser-binary blocker.
- [issue-2101-paperless-infinite-scroll.md](issue-2101-paperless-infinite-scroll.md) — Paperless picker infinite-scroll E2E: page-aware mock fixture, POM scroll/footer helpers, scroller quirks, diary regression review.
- [story-2205-sidebar-navconfig.md](story-2205-sidebar-navconfig.md) — #2205 sidebar test ids/POM API, sidebar clicks push, 'Go to Home' strict-mode collision, every-page sweep, defect-id tagging.
- [story-2207-phone-tablet-shell.md](story-2207-phone-tablet-shell.md) — #2207 bottom bar/More sheet/title menu: AppShellPage shims, check-mark text trap, compact single-link breadcrumb, sign-out mocking.
- [story-2206-top-bar.md](story-2206-top-bar.md) — #2206 top bar/user menu: 1024 breakpoint, viewport-aware logout(), shared isolated user, Gantt-origin Back.
- [story-2213-companies-trades.md](story-2213-companies-trades.md) — #2213 Companies list/Trades sheet/company pickers: POMs, `localeUser` fixture, 6 live-run defects, patched-image verification trick.
- [story-2209-grammar-foundations.md](story-2209-grammar-foundations.md) — #2209 StatusMenu/UndoToast/ConfirmDialog: component POMs, test-id conventions, disabled-fallback focus hazard, sandbox python-heredoc quirk.
- [story-2214-account-relayout.md](story-2214-account-relayout.md) — #2214 Account POM/testids, token+preference mocking, aria-disabled assertion traps, DAV lock, phone gutter defect.
- [fix-search-capped-choosers.md](fix-search-capped-choosers.md) — SearchPicker-chooser fix PR: SearchPickerControl/CompanyFilterControl POMs, settle-then-ArrowDown pick helper, focus-on-body defects A/B/C.
- [story-2217-integrations.md](story-2217-integrations.md) — #2217 Integrations POM/test ids, Paperless-off Documents rules, shared mock helpers, run traps.
- [story-2218-areas-index.md](story-2218-areas-index.md) — #2218 Areas index POM/test ids, per-test tag + cleanup order, 200 {undo} delete, skeleton locator.
- [story-2221-capture-screen.md](story-2221-capture-screen.md) — #2221 DiaryCapturePage POM + tap counter, arm64 media crash/stubs, shutter cooldown, 3 live defects.
- [story-2222-entry-points.md](story-2222-entry-points.md) — #2222 Log now tiles/?start=/Log today: POM additions, Q1-Q11 spec, verified facts.
- [story-2223-system-events.md](story-2223-system-events.md) — #2223 system events: FeedRow ids, v1 mock builders, History filter, payment link, phone-hidden chip trap.
- [story-2224-history-page.md](story-2224-history-page.md) — #2224 History POM/ids, per-test uniq tag, moved diary filters, 1.64.1 image + docker disk, checkbox quirk.
- [story-2225-diary-feed-row.md](story-2225-diary-feed-row.md) — #2225 diary feed rows/Filters/entry page POMs, mock stubs, sequential-run rule, 2 production defects.
- [story-2226-photos-spots.md](story-2226-photos-spots.md) — #2226 Photos spots/No area/viewer POMs, phone Details sheet rules, D-31 defects.json, Escape defect, chrome opacity.
- [story-2227-rapid-camera.md](story-2227-rapid-camera.md) — #2227 camera tap budgets 12/15/20/13, POM camera API, shutter-before-frame trap, fake device works on arm64.
- [story-2230-home.md](story-2230-home.md) — #2230 Home spec/POM/stateful homeMocks, StatusMenu action has no option step, set-up-mode trap for real-data specs, 2 live defects.
- [story-2233-documents-panel.md](story-2233-documents-panel.md) — #2233 Documents panel POM/hosts, real-server Unlink+Undo recipe, slide-in box trap, Escape-in-menu defect.
- [story-2232-consistency-test.md](story-2232-consistency-test.md) — #2232 figureSurfaces registry, FC1-FC5 spec, overview mocks must carry `money` (moneyMocks), holdsUp tooltip mock.
- [story-2236-entity-picker.md](story-2236-entity-picker.md) — #2236 EntityPicker/Undo POM facts, triage of 160 failures, Undo focus rule, child-step test ids, test.fail-pinned defects.
- [feedback_cleanup_scope.md](feedback_cleanup_scope.md) — post-run cleanup: only git clean docs/static/img/screenshots; never revert docs/src or others' tracked files.
- [story-2235-cost-lines.md](story-2235-cost-lines.md) — #2235 cost lines: CostLinesPanel/Form/Grid POMs, costLineSeed, old UI mapping, click-budget spec, live-run defects.
- [story-2237-money-overview.md](story-2237-money-overview.md) — #2237 Money overview POM/test ids, mockMoneyOverview + buildMockBreakdown, table-vs-list container query, live-run traps.
- [story-2239-offer-invoice-page.md](story-2239-offer-invoice-page.md) — #2239 invoice page POM composition, test ids, changed behaviours, static-only verification.
- [story-2241-invoice-dialog.md](story-2241-invoice-dialog.md) — #2241 InvoiceFormDialog POM, company child step, removed picker scenarios, static-only verification.
- [story-2242-financing.md](story-2242-financing.md) — #2242 Financing/source/grant POMs, seed helpers, grant-delete cleanup trap, strip fact order.

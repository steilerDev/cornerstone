# E2E Test Engineer — Agent Memory (Index)

> Detailed notes live in topic files. This index is a one-line-per-topic pointer; do not add bulk content here — append to (or create) a topic file and add one line below.

## Topic files

- [general-e2e-patterns.md](general-e2e-patterns.md) — cross-cutting waits/timing, viewport timeouts, strict-mode anti-patterns, DataTable migration fallout, Gantt touch, breadcrumbs, print, dashboard cards, headless-shell PDF-iframe limitation → CSP header+console verification pattern (blob-fetch leg removed, connect-src pitfall), key file locations.
- [e2e-pom-patterns.md](e2e-pom-patterns.md) — Page Object Model conventions and stable-locator strategies.
- [e2e-parallel-isolation.md](e2e-parallel-isolation.md) — `testPrefix` fixture, parallel-safe data isolation, serial-mode tests.
- [known-flakes-and-regressions.md](known-flakes-and-regressions.md) — triaged log of flaky tests, pre-existing CI failures, and production regressions caught by E2E. **Check this before re-triaging a failure.**
- [flake-patterns.md](flake-patterns.md) — flake-avoidance patterns moved from the implementation checklist: Konva canvas coordinates, `test.slow()` timeout negation, locale timing after reload, shard redistribution, stale cache-warmup CI. Check when writing timing-sensitive tests or adding spec files.
- [auto-itemize-and-invoices-e2e.md](auto-itemize-and-invoices-e2e.md) — AutoItemizePage, PaperlessInvoiceReviewPage, invoice budget lines, Paperless mocking, vendor reassignment.
- [bug-1833-materialize-retry-dedup.md](bug-1833-materialize-retry-dedup.md) — retry-after-real-commit-failure regression pattern (Bug #1833).
- [document-linking-and-photos-e2e.md](document-linking-and-photos-e2e.md) — document-linking (Paperless), photo picker/upload flows, orientations.
- [photo-annotator-e2e.md](photo-annotator-e2e.md) — Konva canvas annotator (post-SVG-migration rewrite, touch/pointer-event handling).
- [diary-e2e.md](diary-e2e.md) — Construction Diary feature: drafts, forms, list/detail, mode filters, UAT-fix history.
- [print-and-i18n.md](print-and-i18n.md) — print-mode E2E and i18n locale-switch testing.
- [milestones-e2e.md](milestones-e2e.md) — Milestones feature POM and selectors.
- [searchpicker-mobile-1708.md](searchpicker-mobile-1708.md) — SearchPicker mobile dropdown-anchor regression (Issue #1708).
- [story-933-dav-vendor-contacts.md](story-933-dav-vendor-contacts.md) — vendor contacts / CardDAV story notes.
- [story-1248-mass-move.md](story-1248-mass-move.md) — mass-move budget line story notes.
- [story-epic08-e2e.md](story-epic08-e2e.md) — EPIC-08 Paperless integration (no testcontainer yet — all document tests validate "not configured" state only).
- [bug-1829-shard3-flakes.md](bug-1829-shard3-flakes.md) — root cause + fix for the shard-3 diary flakes blocking main promotions; also proves `maxFailures` already tolerates one retry-passing test (Playwright source citation).
- [story-1876-deposit-refunds.md](story-1876-deposit-refunds.md) — deposit `entryType` refunds; DataTable hidden-column read pattern (`getColumnCellText`), table+card dual-DOM visible-filter pitfall.
- [story-1879-report-wizard.md](story-1879-report-wizard.md) — Bank Report Wizard POM/spec; Blocker bug #1886 (budgetSources envelope crash blocks all progress past step 1) + compile errors/missing i18n keys found via `tsc`; source-report E2E seeding pattern (WI budget → invoice-budget-line link); Story #1899 added a 5th step ("Settings" — report language + moved toggles), preview iframe only exists on step 5 now.
- [story-1891-wizard-followup.md](story-1891-wizard-followup.md) — expandable invoice rows, CSP `blob:` frame-src hardened preview check (SUPERSEDED TWICE — `page.frames()` proof, then in-page blob fetch → now header+console-only, see general-e2e-patterns.md), deposit budget-source tagging; 2 filed bugs (#1892 full-exclusion display, #1893 missing deposit-default heuristic); sandbox CAN now build+boot the full container stack (see `sandbox-live-verification.md`) but browser binary download is still network-policy-blocked.
- [sandbox-live-verification.md](sandbox-live-verification.md) — **dhi.io build access is sandbox-dependent, re-check each session**: this session successfully built `cornerstone:e2e` and booted the full container stack (app+OIDC+proxy all healthy), a first — but Playwright's own browser binary download (`playwright.download.prss.microsoft.com`/`cdn.playwright.dev`) is blocked by network policy, and Ubuntu's `chromium-browser` apt package is a non-functional snap stub (no snapd) — no way found yet to get an actual live browser run in this sandbox class.
- [story-1901-ai-report-generation.md](story-1901-ai-report-generation.md) — AI-generated usage descriptions/cover letter: new `reportWizardAiGeneration.spec.ts` + POM AI locators; llmEnabled-mock pattern; overwrite-modal-guard-checks-overrides-not-aiContent gotcha; cover-letter-fields-need-contactAddress/reference seed trap; reused auto-itemize LLM error strings.
- [story-1900-editable-report-preview.md](story-1900-editable-report-preview.md) — step 5 reworked from always-present auto-regenerating iframe → live editable surface + on-demand PDF Modal; POM rename `waitForPreviewReady/Regenerated` → `openPdfPreviewModal`/`closePdfPreviewModal` (must close before another modal-opening action); 4 filed bugs (#1904-#1907, all now FIXED+CLOSED, see file's re-verification section); deliberate deviation editing a file explicitly marked "do not touch" because leaving it broke `tsc` workspace-wide — see file for the general lesson; `footnoteFetchFailed` skip note naturally reachable with no Paperless container, no mock needed; re-verification added `mobileCard()`/`mobileUsageField()` POM locators + Scenario 15 (#1907 regression guard) + found/filed NEW bug #1908 (mobile-card fallback visible on desktop, no default `display:none`) with its own expected-to-fail Scenario 1b.

- [claim-deposit-scope-1922.md](claim-deposit-scope-1922.md) — PR #1922 invoice/deposit claim-scope split: `handleMarkClaimed`'s two-array submit, server-truth success-banner counts, the three "deposit surfaces the invoice" shapes, `claimNothingClaimable` guard.

## Open follow-ups to flag to orchestrator

- No Paperless-ngx testcontainer exists yet (story-epic08-e2e.md) — all Paperless E2E coverage is `page.route()` mocked, not real integration. Add the container when Paperless work resumes.
- **Filed bugs from Story #1891, unresolved**: #1892 (fully-excluding all budget lines on an invoice removes it from the report wizard's step-3 list instead of showing €0.00 — display-only, PDF/claim unaffected) and #1893 (deposit budget-source auto-default 0/1/>1-source heuristic is entirely unimplemented — `InvoiceDepositsSection.tsx` never receives the invoice's budget lines).
- **Filed bug from Story #1900 re-verification, unresolved**: #1908 (Major — `.mobileCardList` has no default `display:none`, so the #1904 mobile-card fix also renders duplicated on desktop/tablet; one-line CSS fix, regression-guard test already in place as Scenario 1b in `reportWizardEditableContent.spec.ts`, currently expected-to-fail until fixed).
- Containerized E2E verification capability varies by sandbox instance — **do not assume the old "no dhi.io creds" note still applies**; re-attempt `docker build -t cornerstone:e2e .` each session before falling back to static-only verification. See `sandbox-live-verification.md` for the current state and the remaining browser-binary blocker.

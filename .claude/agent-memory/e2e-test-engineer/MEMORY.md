# E2E Test Engineer — Agent Memory (Index)

> Detailed notes live in topic files. This index is a one-line-per-topic pointer; do not add bulk content here — append to (or create) a topic file and add one line below.

## Topic files

- [general-e2e-patterns.md](general-e2e-patterns.md) — cross-cutting waits/timing, viewport timeouts, strict-mode anti-patterns, DataTable migration fallout, Gantt touch, breadcrumbs, print, dashboard cards, key file locations.
- [e2e-pom-patterns.md](e2e-pom-patterns.md) — Page Object Model conventions and stable-locator strategies.
- [e2e-parallel-isolation.md](e2e-parallel-isolation.md) — `testPrefix` fixture, parallel-safe data isolation, serial-mode tests.
- [known-flakes-and-regressions.md](known-flakes-and-regressions.md) — triaged log of flaky tests, pre-existing CI failures, and production regressions caught by E2E. **Check this before re-triaging a failure.**
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
- [story-1877-contact-fields-attachment-typing.md](story-1877-contact-fields-attachment-typing.md) — budget-source contact fields, household settings singleton (needs `mode:'serial'`, not just try/finally), document-link attachment typing; route-mock last-registered-runs-first ordering hazard; sandbox lint/tsc caveats.
- [story-1879-report-wizard.md](story-1879-report-wizard.md) — Bank Report Wizard POM/spec; Blocker bug #1886 (budgetSources envelope crash blocks all progress past step 1) + compile errors/missing i18n keys found via `tsc`; source-report E2E seeding pattern (WI budget → invoice-budget-line link).

## Open follow-ups to flag to orchestrator

- No Paperless-ngx testcontainer exists yet (story-epic08-e2e.md) — all Paperless E2E coverage is `page.route()` mocked, not real integration. Add the container when Paperless work resumes.
- Full containerized E2E verification is not possible in sandboxes without `dhi.io` (Docker Hardened Images) registry credentials — building `cornerstone:e2e` fails with `401 Unauthorized`. This is an environment limitation, not a code issue; verification in such sandboxes must fall back to static checks (lint/prettier/tsc-diff/`playwright --list`) plus post-merge CI observation.

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

## Open follow-ups to flag to orchestrator

- Diary shard-3 E2E Gates flakiness recurred with NEW failure signatures as of 2026-07-07 despite fix PRs #1790/#1792/#1793 — see known-flakes-and-regressions.md. Needs dedicated investigation before more diary work.
- No Paperless-ngx testcontainer exists yet (story-epic08-e2e.md) — all Paperless E2E coverage is `page.route()` mocked, not real integration. Add the container when Paperless work resumes.

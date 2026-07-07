---
name: known-flakes-and-regressions
description: Triaged log of known-flaky E2E tests, pre-existing CI failures, and production regressions caught by E2E — with resolution status. Consult before re-triaging a failure that might already be known.
metadata:
  type: project
---

## Currently open / unresolved

- **Diary shard-3 flakiness NOT fully resolved by fix PRs #1790/#1792/#1793** (triaged 2026-07-07): on beta PR #1803, `diary-r2-uat.spec.ts:599` "Manual mode API parameter (Scenario 10)" fails with `expect(lastRequest).toBeDefined()` (empty-requests-array race, a NEW failure mode); `diary-drafts.spec.ts:854` "Draft card click navigates to edit page (Scenario 14)" fails via `apiRequestContext.delete: Test timeout of 45000ms exceeded` in teardown (also a NEW failure mode vs. the original nav-timing flake). Same shard-3 pattern seen across PRs #1780/#1782/#1788/#1803 (2026-06-22 → 2026-07-06) — pre-existing, not caused by any single story. `gh run view --log`/`--log-failed` returns empty for these matrix jobs; use `gh api repos/.../actions/jobs/<id>/logs` instead. Non-blocking on beta (E2E Gates informational there) but needs dedicated follow-up — flag to orchestrator before picking up diary work.
- `i18n/i18n.spec.ts` "German text does not overflow navigation sidebar on desktop" — pre-existing locale-init race, needs separate investigation.
- `i18n.spec.ts` "Key page headings render in German" — intermittent ~10-20%: concurrent worker `afterEach(resetToEnglish)` races with another test's `setLanguage('de')`. Pre-existing.
- `i18n-categories.spec.ts` "German locale: Manage trades tab shows 'Sanitär'..." — intermittent, locale doesn't initialize before English page renders. Pre-existing (seen before PR #1186 too).
- `budget-overview-print.spec.ts` "Dark mode: print resets CSS variables" — HARD FAIL, production bug #1451 (`:global(@media print)` dropped by bundler).
- `budget-overview-print.spec.ts` "On-screen expansion state restored after afterprint" — HARD FAIL, production bug #1450 (`usePrintExpansion` closure loses snapshot on effect re-run).
- `AutoItemizePage.test.tsx:1953` `findByRole('region', /PDF preview unavailable/)` — unit test flake/timing, NOT E2E scope, report to qa-integration-tester (first seen PR #1612 after commit `75c11f24`).
- `auto-itemize-discretionary.spec.ts` Scenario 3 — test design gap, marked `test.fixme()`: `create-new` auto-itemize lines have `work_item_id=NULL` (excluded from breakdown INNER JOIN); `assign-existing` doesn't set `origin='auto'`. Needs backend fix, not a test fix.
- `invoice-auto-itemize-page.spec.ts` Scenario 35 — `autoCreatedBadge` absent on WebKit tablet/mobile only, filed as bug #1613; passes on Chromium (Scenario 34). Test not weakened.

## Resolved / fixed

- Diary Scenario 14 (`diary-drafts.spec.ts` draft-card-click-navigates) — was a persistent flake even after an earlier partial fix (PR #1671); root-caused and properly fixed via `fix/diary-scenario14-e2e-flake` (register `waitForResponse` before the click, not after). **Note (2026-07-07): recurred on shard 3 with a DIFFERENT failure signature** — see "Currently open" above; the original nav-timing bug is fixed but a new teardown-timeout flake has appeared since.
- `invoice-budget-line-create-and-link.spec.ts` Scenarios 1–4 — REAL production regression from PR #1566 (`eagerLinkInvoice:false`), filed as bug #1611. Tests were NOT weakened; they assert correct behavior.
- Shard 3 promotion blocker (`budget-source-filter.spec.ts`, 2026-06-12): "Rapid debounce coalesces requests" flaked on strict request-count assertions vs. CI click serialization beyond the 50ms debounce (fixed PR #1665); "Perspective toggle changes Cost value" flaked on reading `textContent()` immediately after a radio click without waiting for React re-render on WebKit (fixed PR #1666). **General fix pattern**: after any click triggering a React state update, `await expect(locator).not.toHaveText(previousValue)` before `textContent()` — never read immediately post-click on WebKit. Remove `page.on('request', ...)` listeners you add (persist for the page's lifetime otherwise); prefer state assertions (`aria-pressed`, URL params) over raw request counting.
- `dashboard.spec.ts:566` "Customize button appears when card dismissed" — fixed PR #1445 (`expect.poll` for preference state). Was issue #1431.
- `invoice-budget-line-create-and-link.spec.ts:210` "Create Budget Line button below existing lines" — fixed PR #1445 (waitFor visible before click). Was issue #1430.
- `invoice-deposits-ux.spec.ts:259` "Portal clipping — last row kebab" — fixed PR #1444 (backend quotation-deposit support + regression guard). Was issue #1432.
- `invoice-deposits.spec.ts:665` [mobile] "Mark paid flow on mobile" — fixed PR #1444 (OverflowMenu portal z-index elevated). Was issue #1433.
- `App.test.tsx:383` redirect lazy-import timeout — fixed PR #1445 (pre-resolve DashboardPage). Was issue #1438.
- `budget-overview-print.spec.ts` "Print forces full expansion" — fixed PR #1447 (selector was `locator('span')` for the WI row; should be `locator('a')`).

## Environment/infrastructure noise (not test or product bugs)

- Milestones `getErrorBannerText()` returning null on beta/main promotion + Dependabot-bump runs (seen 2026-04-16, 2026-04-25) — pre-existing flaky/broken test unrelated to the feature work in those PRs.
- `budget-source-lines.spec.ts` failures on a feature branch (2026-04-17) — caused by a _different_, not-yet-merged feature branch (`fix/source-lines-layout-links`), not a regression from the branch under test.
- `vendors.spec.ts` shard 5 failure (run 24531406436, 2026-04-18): milestones `getErrorBannerText()` returning null — unrelated to vendors work.

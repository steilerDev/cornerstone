---
name: story-1879-report-wizard
description: Story #1879 Bank Report Wizard (/budget/reports) — POM/spec authored against a frontend implementation with a Blocker runtime crash (filed #1886); orientations.spec.ts and invoices.spec.ts:395 known-flake fixes confirmed self-healed on beta before this story.
metadata:
  type: project
---

## Files

- `e2e/pages/ReportWizardPage.ts` — new POM. `e2e/tests/budget/reportWizard.spec.ts` — 11
  scenarios (claim walk, budget-overview/proof-of-funds smoke, empty state, Paperless
  upload configured/unconfigured, `?sourceId=` prefill, route smoke @responsive, forward-lock,
  mobile stepper, refund cross-story integration). `e2e/fixtures/testData.ts` — added
  `ROUTES.budgetReports` and `API.sourceReports`/`sourceReportsMarkClaimed`/`paperlessStatus`/
  `paperlessDocuments`.

## Blocker bug found during authoring — filed as GitHub issue #1886

`ReportWizardPage.tsx` does `setBudgetSources(sources)` with the raw `fetchBudgetSources()`
envelope (`{ budgetSources: BudgetSource[] }`), not the array itself. Every
`budgetSources.map/.find/.sort` call throws at runtime — the FIRST one fires inside
`handleUseCaseChange`, i.e. the very first Step 1 use-case click. Since the exception is thrown
mid-handler (after `setMaxReachedStep(2)`/`setStep2Loading(true)` already queued but before the
`Promise.all(...).finally(() => setStep2Loading(false))` chain is ever constructed), Step 2
renders a **permanent skeleton loader** — the wizard cannot progress past Step 1 for any user.
This blocks essentially all 11 E2E scenarios from ever passing until fixed.

Also confirmed via `tsc --noEmit -p client/tsconfig.json` (NOT gated by the Docker/webpack build —
webpack uses `babel-loader`, type-agnostic, so the app runs despite these): ~30 compile errors
across `ReportWizardPage/`, `reportPdf/`, `components/reports/` — notably `PageLayout` has no
`subtitle` prop (silently dropped), `TriStateCheckbox` prop is `label` not `ariaLabel` (select-all
checkbox has NO accessible name), `SelectionActionBar` is missing required `clearLabel`/`children`
("Clear selection" button renders empty), `FormError` has no `onRetry` prop (Step 3 error state
has literally no retry button), `HouseholdSettings` has no `name`/`address` (cover letter sender
block never renders), `SourceReportDocument` has no `id` field (`merge.ts` document-embed path
always `undefined`).

Plus: `WizardStepper.tsx`'s own strings (`reportWizard.stepOfTotal`/`stepperAriaLabel`) and
`ReportWizardPage.tsx`'s `t('common.button.next'|'back'|'cancel'|'confirm'|'retry')` all resolve
to **missing i18n keys** — no `reportWizard` namespace exists anywhere, and `budget.json`'s own
`common` object is FLAT (`{retry, cancel, ...}`), not nested under `button`. Every wizard nav
button and the mobile stepper text render broken/missing-key strings. `SubNav`'s `ariaLabel`
uses `t('common.subnav.budget')` which is an OBJECT key in `common.json`, not a string — also
broken, and inconsistent with sibling budget pages' hardcoded literal `"Budget section
navigation"`. Claim success banner hardcodes `{count: 0}` (always shows "0 invoice(s)...") and has
NO link to `/budget/invoices` despite both the Frontend Spec and this story's E2E spec explicitly
calling for one. "Mark N invoices as claimed" button omits the `{count}` interpolation param
entirely (renders the literal `{{count}}` placeholder).

**Handling approach**: wrote the POM/spec against the SPEC-CONFORMANT behavior per the
test-failure-debugging protocol (don't weaken correct tests for buggy code) rather than
contorting assertions to match broken output. `ReportWizardPage.ts`'s `markClaimedButton` locator
uses a tolerant regex (`/Mark .+ invoices as claimed/i`) so the button is still _clickable_ despite
the missing-interpolation bug, while a separate assertion checks the intended digit rendering (and
is expected to fail until fixed). Every scenario past Step 1 is expected to fail in CI until #1886
is fixed — that's correct/intended, not a test-authoring defect.

## Verification note (same sandbox limitation as prior stories)

No `dhi.io` credentials in this sandbox → cannot build/run the `cornerstone:e2e` container, so no
live run was possible. Verified via `npx playwright test --list` (16 new tests across
desktop/tablet/mobile, full suite still lists cleanly at 2609 tests/105 files),
`npx eslint --fix` + `npx prettier --write` (clean), `npx tsc --noEmit -p e2e/tsconfig.json`
(clean after fixing one narrow-vs-wide `status` union mismatch in a local helper). Real
pass/fail must come from CI post-PR, and per the bug above, will legitimately show failures
until #1886 lands.

## Reusable setup pattern for source-report E2E data

To get an invoice INTO a `GET /api/source-reports` result: (1) `createBudgetSourceViaApi`
(fixtures/apiHelpers.ts), (2) `createWorkItemViaApi` (parent for a budget line), (3)
`POST /api/work-items/:id/budgets` with `{budgetSourceId, plannedAmount}` → `budget.id`, (4)
`POST /api/invoices/:invoiceId/budget-lines` with `{workItemBudgetId, itemizedAmount}`. No
shared `fixtures/apiHelpers.ts` entry yet for steps 3/4 or for invoice creation itself — every
existing spec file (`invoices.spec.ts`, `invoice-deposits.spec.ts`,
`invoice-budget-line-area-breadcrumb.spec.ts`) duplicates these inline; `reportWizard.spec.ts`
follows the same established local-helper convention rather than refactoring shared fixtures.
Report-type → included invoice statuses (`server/src/services/sourceReportService.ts`):
`budget-overview` = quotation+pending+paid+claimed (all 4), `claim` = pending+paid,
`proof-of-funds` = claimed only. A refund entry (`entryType:'refund'`, via
`POST /api/invoices/:id/deposits`) only surfaces as its own `lineKind:'refund-adjustment'` row
in a report if the REFUND'S OWN status is in the report type's target status set (e.g. a `paid`
refund shows up in a `claim` report).

## Fix-round triage (PR #1887, commit fdba5cd8) — 5 E2E failures after #1886 landed

`ReportWizardPage.tsx` now correctly unwraps `fetchBudgetSources()` (`setBudgetSources(sources.budgetSources)`)
and the missing-i18n-key/markClaimed-interpolation bugs from the original authoring round are
also fixed — the wizard now genuinely progresses past step 1. Triaged the 5 remaining shard
failures (shard 2/16 desktop scenarios 1/4/9/11, shard 13/16 mobile scenario 10):

- **Scenario 1 (claim walk) — TEST_BUG, fixed.** `expect(previewLoadingOverlay).toBeVisible()`
  after each Step 4 checkbox toggle is a transient-state assertion: regeneration is a 400ms
  debounce (`ReportWizardPage.tsx:258`) then CPU-bound `pdfmake`/`pdf-lib` work with NO network
  I/O for attachment-less test invoices (`reportPdf/merge.ts` — the document-fetch loop is
  skipped entirely when `invoice.documents` is empty), so the whole regen can complete fast
  enough that the overlay's "visible" window is never reliably observed by Playwright's
  polling. The suite's own established convention elsewhere
  (`invoice-auto-itemize-page.spec.ts:1589`) only ever asserts the overlay's terminal *hidden*
  state, never its transient appearance — same lesson applies here. Fixed by adding
  `ReportWizardPage.getPreviewSrc()` / `waitForPreviewRegenerated(previousSrc)` to the POM,
  which prove a regeneration happened via the iframe's `blob:` src actually changing (every
  `URL.createObjectURL()` call yields a unique URL) instead of racing the spinner.
- **Scenario 4 (empty state) — TEST_BUG, fixed.** `ReportInvoiceList.tsx`'s `<EmptyState>` only
  renders when BOTH this source's allocated invoices AND the *household-wide* unallocated list
  are empty — `sourceReportService.ts`'s `unallocRows` query has **no** `budget_source_id`
  filter at all (confirmed by reading the SQL), so it's global across every vendor/spec file.
  Under full 8-worker parallel CI this is essentially always non-zero, making the EmptyState
  branch unreachable most runs. Fixed by branching on whichever of the two valid renders
  actually occurred (`emptyState.or(selectAllCheckbox).waitFor()` first to avoid a
  skeleton-false-pass, then check `emptyState.isVisible()`) rather than assuming one is always
  reachable.
- **Scenario 9 (forward-lock) — CODE_BUG, reported, NOT fixed (production code).**
  `ReportWizardPage.tsx:243-277`'s PDF-generation effect calls `setMaxReachedStep(4)`
  (line ~252) as soon as `reportStatus === 'ready'` — which fires right after Step 2's source
  selection resolves, **not** gated on the user having reached/completed Step 3. This lets the
  desktop stepper's Step 4 item render as an interactive `<button>` (bypassing the intended
  forward-lock) before the user has ever seen the invoice list. Fix should move
  `setMaxReachedStep(4)` to the Step 3 "Next" button's `onClick` (`ReportWizardPage.tsx:528`
  `onClick={() => setCurrentStep(4)}`) instead of the background data-ready effect.
- **Scenario 10 (mobile stepper) — TEST_BUG, fixed.** `WizardStepper.tsx` renders BOTH the
  desktop `<ol class="stepList">` and the mobile `stepperMobile` tree unconditionally
  (confirmed in `WizardStepper.module.css:197-205` — a `@media (max-width:767px)` rule toggles
  `display`, nothing is conditionally mounted). `toHaveCount(0)` on the desktop tree at mobile
  viewport was wrong from authoring (assumed structural exclusivity that was never true) —
  changed to `not.toBeVisible()`. Corrected the POM's own docstring (previously described the
  two trees as viewport-exclusive) to document the dual-tree-plus-CSS pattern explicitly, so
  future scenarios don't repeat the same wrong assumption.
- **Scenario 11 (refund) — TEST_BUG, fixed.** The original seed put BOTH a positive invoice
  (`status:'paid'`, amount 1000) and its own refund (200) on the SAME invoice — but
  `sourceReportService.ts` computes exactly ONE row per invoice as the NET contribution across
  the report's target-status set (`computeStatusContributionByInvoice`), and `lineKind` only
  flips to `'refund-adjustment'` when that net goes negative (documented at
  `wiki/API-Contract.md:3606-3607`, proven by `sourceReportService.test.ts` "scenario 14"). A
  refund that merely reduces an already-in-scope invoice's contribution stays merged into that
  SAME positive row — it does NOT spawn a second row. Fixed by seeding TWO invoices: one plain
  in-scope invoice (`status:'pending'`, positive row) and a separate OUT-of-scope invoice
  (`status:'claimed'` — outside `claim`'s {pending,paid} set, so its own residual is 0) that
  carries an in-scope refund (`status:'paid'`), giving it a purely negative net → a genuine
  `refund-adjustment` row. This preserves the original 800/1,000 running-total assertions
  unchanged while matching the documented contract. Mirrors a real "already-claimed invoice,
  partially refunded during the current claim period" scenario, which is also a nice
  confirmation the design is intentional, not a shortcut.

Files touched this round: `e2e/pages/ReportWizardPage.ts` (added `getPreviewSrc`/
`waitForPreviewRegenerated`, corrected stepper docstring), `e2e/tests/budget/reportWizard.spec.ts`
(scenarios 1/4/10/11 rewritten per above; scenario 9 left unchanged — it correctly encodes
spec-conformant behavior and is expected to keep failing until the CODE_BUG above is fixed).
Verified via `npx eslint --fix` + `npx prettier --write` (clean), `npx playwright test --list`
(16 tests, same count/scenario shape), `npx tsc --noEmit -p e2e/tsconfig.json` scoped diff
(zero new errors in the two touched files; the ~123 pre-existing errors across ~20 unrelated
files are the same sandbox/stale-build noise documented in
`story-1877-contact-fields-attachment-typing.md`). No live CI run performed by me — awaiting
the next push.

## Prior-PR triage confirms two previously-known flakes are ALREADY self-healed on beta

Checked the 3 most recent beta merges before this story (#1885/#1883/#1880, all merged
2026-07-29): all showed E2E shard failures matching already-documented known flakes —
`invoices.spec.ts:841` "Effective Amount"/"Remaining Amount" column race and
`invoices.spec.ts:395` "Invoice row click navigation" (both in `known-flakes-and-regressions.md`)
recurred on the PR HEADs, but the fixes for both (already landed in an earlier commit) were
confirmed present at my branch's actual base commit (`fc7f6ad2`) — i.e. these are stale CI
snapshots from before the fix, not currently-reproducing flakes. Also found (and separately
confirmed already-fixed at HEAD): `orientations.spec.ts:380` "ManagePage now has 5 tabs" failed
with "received 6" on PR #1883 (desktop/tablet/mobile) — PR #1883 added a 6th "Household" tab to
`ManagePage.tsx` without updating the tab-count assertion; the fix (test updated to "6 tabs
(Household, Areas, ...)") landed in the very next commit (`fc7f6ad2`, PR #1885) and is present at
my branch's HEAD. No new regressions from this triage — see `known-flakes-and-regressions.md` for
the canonical entries; this file only records the fresh confirmation.

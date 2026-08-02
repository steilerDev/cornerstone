---
name: story-1879-report-wizard
description: Story #1879 Bank Report Wizard (/budget/reports) — POM/spec authored against a frontend implementation with a Blocker runtime crash (filed #1886); orientations.spec.ts and invoices.spec.ts:395 known-flake fixes confirmed self-healed on beta before this story. Story #1899 added a 5th step (Settings — report language + moved toggles).
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
  (`invoice-auto-itemize-page.spec.ts:1589`) only ever asserts the overlay's terminal _hidden_
  state, never its transient appearance — same lesson applies here. Fixed by adding
  `ReportWizardPage.getPreviewSrc()` / `waitForPreviewRegenerated(previousSrc)` to the POM,
  which prove a regeneration happened via the iframe's `blob:` src actually changing (every
  `URL.createObjectURL()` call yields a unique URL) instead of racing the spinner.
- **Scenario 4 (empty state) — TEST_BUG, fixed.** `ReportInvoiceList.tsx`'s `<EmptyState>` only
  renders when BOTH this source's allocated invoices AND the _household-wide_ unallocated list
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

## Story #1899 — 5th step inserted ("Settings"), old step 4 renumbered to step 5

`ReportWizardPage.tsx` gained a NEW step 4 ("Settings" — `Step4Settings.tsx`): a report-language
radio group (`input[name="reportLanguage"][value="en"|"de"]`, plain/visible, literal
"English"/"Deutsch" labels NOT wrapped in `t()`) PLUS the `#attachDocuments`/`#includeCoverLetter`
toggles relocated verbatim from the old step 4 (same DOM ids). The old step 4 (preview iframe +
`Step4Options.tsx`) was renamed `Step5Actions.tsx` and pushed to step 5, content byte-identical
minus the toggle props/JSX. **Key consequence for every E2E scenario that used to do
`goNextFromStep3(); waitForPreviewReady();`**: the preview `<iframe>`/`ReportPdfPreview` component
is now ONLY mounted at step 5 — there is no way to observe `previewLoadingOverlay`/
`previewIframe`/`getPreviewSrc()` while on the new step 4. Every such call site became
`goNextFromStep3(); step4NextButton.click(); waitForPreviewReady();` (12 call sites across
`reportWizard.spec.ts` + `reportWizardExpansion.spec.ts`). One consequence: Scenario 1's old
"toggle attach/cover-letter, verify regeneration via `waitForPreviewRegenerated` after EACH
individual toggle" pattern no longer works (nothing to observe on step 4) — simplified to
"toggle all options on step 4 (asserting only checkbox check-state, not regeneration), advance
once, single `waitForPreviewReady()` on step 5". The still-valid multi-step regeneration proof
(`getPreviewSrc()` before, `waitForPreviewRegenerated(previousSrc)` after) now requires reaching
step 5 fully (via step 4) each time, and going back now needs TWO `goBack()` calls (step 5 → step
4 → step 3) instead of one — `goBack()` itself needed NO change since it's a generic
`[class*="buttonRow"] [class*="btnSecondary"]` re-query (works for whichever step is currently
mounted; only one `buttonRow` div is ever in the DOM at a time across all 5 steps, confirmed via
grep — this is also why `step2BackButton`/`step3BackButton`/`step4BackButton` are literally the
same object reference, and `.first()`/`.last()` are never load-bearing disambiguators, just
defensive tie-breakers).

Added `reportLanguageRadio(lang)`/`selectReportLanguage(lang)` (POM) and a new Scenario 12
(`reportWizard.spec.ts`) proving a `reportLanguage` change on step 4 regenerates the preview
(blob src change, via `waitForPreviewRegenerated`) while the wizard's OWN chrome (heading,
stepper labels, Back/Next button text) stays English — `reportLanguage` only feeds
`generateReportPdf`'s fixed-locale `i18n.getFixedT(reportLanguage, 'budget')`/`createFormatters()`
pair, completely independent of the app's `resolvedLocale`/normal `t`. Deliberately did NOT
assert on PDF byte content (that's the Jest `realRender.test.ts` unit test's job per the QA
spec) — only the blob-src-changed proof + suggestedFilename pattern (still untranslated:
`${useCase}-${slug}-${date}.pdf`, confirmed unaffected).

Verified via `npx eslint`, `npx prettier --check`, `npx tsc --noEmit -p e2e/tsconfig.json`
(zero errors referencing ReportWizard files; the ~123 pre-existing errors in ~22 unrelated files,
mostly `capture-docs-screenshots.spec.ts`'s `TestDetails` type mismatch, are the same
sandbox/stale-@playwright/test-version noise as prior stories — confirm this is still true each
session rather than assuming). No live Playwright run — browser binary download is blocked by
network policy in this sandbox (`cdn.playwright.dev`/`playwright.download.prss.microsoft.com`
both 403 "blocked by network policy: domain ... — no matching allow rule"), consistent with
`sandbox-live-verification.md`'s finding. CI's full E2E matrix is the real verification gate.

## Issue #1933 — Select Invoices step: open-invoice affordance, select-all alignment fix

`.headerCheckbox` CSS class was REMOVED entirely (both TSX and CSS module) as part of the
select-all alignment fix — the header's checkbox wrapper is now a bare `.checkboxWithContent`
div, identical to each row's own `.checkboxWithContent` label. This broke the pre-existing
`selectAllCheckbox` POM locator (`[class*="headerCheckbox"] input[type="checkbox"]"`, which no
longer matches anything) — fixed to scope via the still-present `.listHeader` container class
instead (`[class*="listHeader"] input[type="checkbox"]`). **If a future story removes/renames
`.listHeader` too, `selectAllCheckbox` needs a matching update** — it's the only thing
disambiguating the header checkbox from every row's own `.checkboxWithContent` checkbox (both
literally share the same class name by design now).

New 7th grid column: a shared `IconLinkButton` (`client/src/components/IconLinkButton/`, a new
shared component — react-router `Link` styled as an icon button, `newTab` prop bakes in
`target="_blank" rel="noopener noreferrer"`, requires a non-bare `ariaLabel` prop) opens
`/budget/invoices/:id` in a new tab from each invoice row. It's a DOM sibling of
`.attachmentColumn`, deliberately NOT nested inside the row's `<label class="checkboxWithContent">`
— so activating it structurally cannot toggle the row's own inclusion checkbox. Added
`ReportWizardPage.openInvoiceLink(vendorName, invoiceNumber)` — `getByRole('link', { name:
/vendor.*invoiceNumber/ })` scoped to `invoiceRow()`, following the same
vendor-name+invoice-number disambiguation convention as `invoiceRowCheckbox()`. New-tab proof
pattern: `Promise.all([page.context().waitForEvent('page'), link.click()])` — this event firing
is the only headless-safe proof of a genuine new browsing context (vs. an in-tab SPA nav); don't
try to assert anything about OS-level tabs.

No mobile card layout exists for the invoice row at any viewport — `.invoiceRow`/`.listHeader`'s
grid-template-columns has no `@media` override anywhere in the CSS module, confirmed by grep. A
"mobile card" AC wording for this component is a product-owner documentation error, not a
missing implementation — don't go looking for one.

Alignment regression-guard pattern (AC 3.1, genuinely unreachable from unit tests — no layout
engine in jsdom): compare `boundingBox().x` of `selectAllCheckbox` vs. a row's
`invoiceRowCheckbox()`, asserting they match within 1px. `TriStateCheckbox` renders a real
(non-visually-hidden, fixed-size) native `<input type="checkbox">`, so `boundingBox()` returns a
meaningful, non-null rect for it.

New tests added: `reportWizard.spec.ts` "Report wizard — open-invoice affordance (Issue #1933)"
(new-tab + wizard-state-preserved combined into one test since the prompt's AC 2.2/2.5 flow is
naturally sequential; accessible-name; select-all alignment — all desktop-only by omission of
`@responsive`, matching the file's established "untagged tests only run on the `desktop`
project" convention, see playwright.config.ts's per-project `grep`) plus a separate
`@responsive`-tagged "mobile repeat" describe block using the same
`test.skip(test.info().project.name !== 'mobile', ...)` pattern as Scenario 10.

## Parallel-worktree "Scenario N" numbering collision (post-merge conflict, resolved without a live browser)

Two bug-fix PRs (#1933, #1943) ran in parallel worktrees, both editing
`reportWizard.spec.ts`, both inserting a NEW `test.describe` block at the exact same point
(right after the last existing scenario) and both independently numbering their own addition
"Scenario 13" — a pure numbering/insertion-point collision, not a logic conflict. #1943 merged
to `beta` first; #1933's branch then had `git rebase origin/beta` produce deeply INTERLEAVED
line-level conflict markers (diff3 got confused because both patches touch the same context
lines) that were not practical to resolve by editing hunks in place.

**Working resolution pattern** (reusable for any future same-insertion-point collision):
1. `git rebase --abort` immediately rather than trying to hand-splice interleaved `<<<<<<<`
   blocks — the two patches share too much context for a clean 3-way merge.
2. Snapshot both full versions to `/tmp`: `git show origin/beta:<file>` (the side that already
   merged) and `git show HEAD:<file>` (this branch's own unrebased commit).
3. Diff line counts against the pre-conflict shared ancestor to confirm the insertion point:
   ancestor 979 lines, beta tip 1099 (+120 for #1943), own branch 1220 (+241 for #1933) — both
   additions start at the same ancestor line, confirming a pure insertion-point collision (not a
   real edit conflict).
4. Copy the ALREADY-MERGED side's file over the working tree file wholesale (it's already
   correct and shouldn't be hand-edited), then re-append this branch's own addition as a plain
   text block extracted from the pre-rebase snapshot — renumbering scenario numbers/headers to
   continue sequentially, and updating the top-of-file docblock scenario list to match.
5. Verify via `diff` against the original pre-rebase addition that ONLY numbering/comment text
   changed, never test logic — the coordinator's constraint ("don't change either side's test
   logic") should be independently checkable, not just asserted.
6. `npx playwright test --list` on the resolved file to confirm both PRs' tests are present
   (by full title) and total count matches sum of both sides — this is the check available
   when a live browser run isn't possible in-sandbox (see `sandbox-live-verification.md`).
7. Left uncommitted (per orchestrator instruction) — the commit goes through `dev-team-lead`.

Numbering convention followed: each distinct `test.describe` block = its own scenario number
(matches how Scenario 9/10/11/12 are each their own number even when Scenario 5/6 share one
block for two closely related tests) — so #1933's single original "Scenario 13" bullet
(covering 2 describe blocks / 4 tests) split into Scenario 15 (3 desktop tests, one describe)
and Scenario 16 (1 mobile-repeat test, separate describe), landing after #1943's 13/14.

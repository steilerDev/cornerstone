# Story #1891 — Bank report wizard follow-up (CSP blob:, chip sizing, expandable rows, deposit budget source)

Date: 2026-07-30. Branch `feat/1891-wizard-followup` (work already in place from backend/frontend
when QA started — production files pre-existed and were edited by a concurrent process AGAIN
mid-session, same pattern as story #1879 round 1 — see below).

## Two confirmed production bugs (structured failure reports filed, tests NOT weakened)

1. **`sourceReportService.ts` `getSourceReport`: `isSplit` hardcoded to `false`.** The #1891
   backend rewrite removed the entire `isSplitMap`/`splitRows` query (which counted distinct
   budget sources per invoice) and replaced the field with a literal `isSplit: false` plus a
   comment "isSplit stays line-derived only" — but never restored the computation. Confirmed via
   the PRE-EXISTING (unmodified) test `sourceReportService.test.ts` scenario 11 ("invoice split
   across two sources → isSplit true"), which now fails deterministically:
   `expect(result.invoices[0]!.isSplit).toBe(true)` receives `false`. Left this test untouched
   (per protocol) — it is correct and pins the real behavior. This breaks the "split" badge in
   `ReportInvoiceList.tsx` for every invoice, permanently.
2. **`ReportWizardPage.tsx`: runaway PDF-regeneration loop, still unresolved across multiple
   rounds.** The pre-existing (not authored this round) test
   `'does not keep re-triggering generateReportPdf once settled (no runaway regeneration loop)'`
   still fails — `mockGenerateReportPdf` called 3-4 times instead of pinned at 1, over a 1300ms
   idle window. Root cause (per prior round's investigation, still true): `regeneratePdf`
   (`useCallback`) depends on `effectiveReport`, and the debounced regen `useEffect` also depends
   on `effectiveReport` + `regeneratePdf` — some render path re-creates `effectiveReport`'s
   identity even with zero exclusions (`applyLineExclusions` returns the same object when
   `excludedLineIds.size===0`, so the loop source must be state churn elsewhere, e.g.
   `previewBlob`/`isRegenerating` toggling causing a re-render that indirectly changes a
   `useCallback` dep — not fully re-diagnosed this round, just reconfirmed still broken). Left the
   test untouched (it's correct, from a prior QA round, documenting a real unresolved bug).

## CRITICAL: production files were edited by a concurrent process mid-session (2nd time this story)

Read `InvoiceDepositsSection.tsx` early in the session (per spec/diff) and it had NO auto-default
logic wired — the "3-case default" behavior described in the dev-team-lead spec (group
`invoice.budgetLines` by `budgetSourceId`, sum `itemizedAmount`, default null/single/largest) was
entirely absent (`openAddModal` just called `getEmptyForm()` unconditionally, no
`fetchInvoiceBudgetLines` import, no `sourceStats`). Was about to file this as a bug. Before
writing the bug report, ran the test file and got `setBudgetLines is not a function` / act()
warnings referencing code that didn't exist in my read — re-read the file and found the frontend
agent had ADDED the entire feature (imports, `budgetLines` state, `sourceStats` computation,
`openAddModal` 3-case logic, picker JSX with 3 hint variants) in the time between my first read and
running tests. **Lesson (reconfirmed): always re-read a production file immediately before writing
its bug report or its final test pass — do not trust an earlier read in a long QA session,
especially on files under active frontend development.** Wasted ~10 min chasing a phantom bug;
caught it via the test-run error stack trace naming a function (`setBudgetLines`) that "shouldn't
exist" per my stale read.

## AJV `coerceTypes: true` gotcha (new, not previously documented)

Fastify's schema compiler defaults to `coerceTypes: true` (in addition to the previously-documented
`removeAdditional: true`). A JSON **number** payload value for a `type: ['string', 'null']` field
(e.g. `budgetSourceId: 12345`) is **silently coerced to the string `"12345"`** and PASSES AJV
validation — it does NOT produce a 400. If the coerced string isn't a real FK target and the
service performs no existence check (the documented "FK-reliant, no existence validation"
convention used here and in `workItemBudgetService`), the request proceeds to the DB layer and
trips the SQLite FK constraint, which is **unhandled** and surfaces as a raw `500` (not a clean
400/404 API error) — verified via a throwaway probe test capturing the actual server log
(`SqliteError: FOREIGN KEY constraint failed`, `code: SQLITE_CONSTRAINT_FOREIGNKEY`, unhandled
error handler emits 500). **To reliably test "wrong type" rejection for a nullable-string field,
use an object or array payload, not a number** — those are not coercible and correctly 400. Pin the
number-coercion case as its own test asserting 500 (documents current behavior), not lump it in
with the "rejected" test.

## Byte-identical regression proof pattern for additive Rail A/B refactors

When a service is rewired to add a parallel "Rail B" computation path (deposits tagged directly to
a budget source) alongside an existing "Rail A" (line-derived pro-rata split), and the new
functions are literal copies of the old ones with one extra filter branch
(`splitByDepositsExcludingTagged` vs `splitByDeposits`), the most convincing regression proof is a
**direct comparison test**: run the SAME untagged fixture through both the legacy fn and the new
`*ExcludingTagged` sibling (adding `deposit_budget_source_id: null` to every row) and assert
`toEqual`/`toBeCloseTo` equality — not just "the old tests still pass unmodified" (which only
proves the OLD function wasn't touched, not that the NEW function behaves identically on the
untagged subset). Did this for `splitByDepositsExcludingTagged` vs `splitByDeposits`,
`computeStatusContributionExcludingTagged` vs `computeStatusContribution`, and
`computeLineContributionsExcludingTagged`'s per-ibl sum vs `computeStatusContributionByInvoice`'s
per-invoice sum (grouped after the fact). Got depositAggregateUtils.ts to 100%/95.33%/100%/100%.

## Test infra gotchas specific to this story

- `InvoiceDepositsSection.tsx` gained TWO new async data dependencies this round
  (`fetchBudgetSources` — already existed from an earlier story but was unmocked in the test file
  until now — and NEW `fetchInvoiceBudgetLines`). Both needed fresh `jest.unstable_mockModule`
  blocks; missing either causes real network calls through the mocked (but unimplemented)
  `apiClient.get` which the component's own `try/catch` swallows silently — tests still pass but
  with `act()` warnings and stale/empty picker state.
- **Race condition**: `await waitFor(() => expect(mockFetchInvoiceBudgetLines).toHaveBeenCalled())`
  is NOT sufficient to guarantee the subsequent `setBudgetSources`/`setBudgetLines` state updates
  have landed — `waitFor` resolves on its first successful check, which can fire before the mocked
  promise's `.then` continuation (the `Promise.all(...)` in the component) has actually run. Since
  `openAddModal`'s auto-default is computed **synchronously at click time** from already-rendered
  state (not reactively), opening the modal too early captures a stale (empty) `sourceStats` and
  the default silently comes out wrong — intermittently, not on every run. Fixed by adding a
  `flushBudgetDataLoad()` helper: `await act(async () => { await Promise.resolve(); await
  Promise.resolve(); await Promise.resolve(); });` called AFTER the mock-called `waitFor`, before
  opening the modal. Use this pattern (extra microtask-flushing `act()`) whenever a component reads
  async-loaded state synchronously inside a click handler.
- `OverflowMenu`'s trigger button accessible name is exactly `triggerAriaLabel` (no literal "menu"
  substring) — for `InvoiceDepositsSection`'s deposit row menu it resolves to `"Deposit actions for
  {description-or-entryTypeLabel}"` (e.g. `"Deposit actions for Deposit"` for a null-description
  deposit-type deposit). Don't guess `/menu/i` — check the real i18n string and the component's
  `triggerAriaLabel={...}` expression first.
- Real i18n (not a fake `t`) is used in `ReportWizardPage.test.tsx` — cross-referenced exact English
  strings via `python3 -c "import json; ..."` against `client/src/i18n/en/budget.json` rather than
  guessing (e.g. `sourceReports.expand.excludeItemAriaLabel` → `"Exclude {{name}} from report"`).
- `ReportInvoiceList.tsx`'s expand/collapse chevron `<button>` has **no accessible name at all**
  (no `aria-label`, the SVG child is `aria-hidden`) despite the translator having added
  `sourceReports.expand.expandInvoice`/`collapseInvoice` keys per the dev-team-lead spec's
  Translator Spec section — those two keys are dead/unwired. Queried the button via
  `container.querySelector('[aria-controls="invoice-expand-${id}"]')` instead of
  `getByRole('button', {name})`. Worth a minor a11y note if asked, not filed as a blocking bug
  (spec's Compliance section didn't explicitly require an aria-label on this element).
- `formatCurrency` test mocks in this codebase are typically `(n) => \`€${n.toFixed(2)}...\`` —
  for a negative number this produces `"€-75.00"` (minus AFTER the currency symbol), not
  `"-€75.00"`. Don't assume sign placement; check the mock's actual `toFixed` composition.
- Migration 0044 test followed the established `0043_app_settings.test.ts` dynamic
  pre-migration-file-list pattern exactly (see `test-infra-reference.md`) — added FK-specific
  cases (invalid FK → `FOREIGN KEY constraint failed`, `ON DELETE SET NULL` → row survives with
  null, not cascade-deleted) since this migration's column is the first `invoice_deposits` FK
  besides `invoice_id`.

## Coverage achieved (final, all touched files)

| File | Stmts | Branch | New tests |
|---|---|---|---|
| `depositAggregateUtils.ts` | 100% | 95.33% | +59 (106 total in file) |
| migration `0044...test.ts` (new) | n/a (SQL) | — | 8 |
| `reportExclusions.ts` (new) | 100% | 100% | 12 |
| `sourceReportService.ts` | 100% | 91.3% (defensive FK-guard branches only) | +12 (44 total, 1 known pre-existing fail) |
| `budgetSourceService.ts` | modified fns (114-400) fully covered; file-wide 67% (huge pre-existing untested surface, out of scope) | — | +11 (172 total) |
| `invoiceDepositService.ts` | 97.31% | 89.47% | +9 (90 total) |
| `invoiceDeposits.ts` route | 85.71% (gaps are pre-existing `!request.user` guards) | 50% | +14 (41 total) |
| `sourceReports.ts` route | n/a | — | +1 (15 total) |
| `helmetPlugin.ts` | 100% | 100% | +2 (8 total) |
| `ReportInvoiceList.tsx` | 100% | 92.77% | +26 (51 total) |
| `ReportWizardPage.tsx` | 97.02% | 86.3% | +8 (41 total, 1 known pre-existing fail) |
| `InvoiceDepositsSection.tsx` | 84.92% file-wide (new code 104-200/1007-1044 fully covered; gaps are pre-existing form-validation branches) | 80.39% | +19 (87 total) |
| `SelectionActionBar.tsx` | 100% | 100% | +2 (9 total) |
| Ripple fixture-only fixes (no new tests) | — | — | `invoiceDepositsApi.test.ts`, `reportPdf/{merge,overviewPdf,realRender}.test.ts` |

All server tsc (`--noEmit`) and client tsc (`--noEmit`) clean at session end. i18n parity
(`i18n.parity.test.ts`) 46/46 green — translator had already landed full en/de parity for all new
`sourceReports.expand.*`/`invoiceDetail.deposits.form.budgetSource*` keys before QA started.

---
name: story-1876-deposit-refunds
description: Deposit refunds (Story #1876) — PATCH-immutability spec vs actual-behavior mismatch, wiki inaccuracy found, refund/negative-fraction test patterns, DataTable column-visibility test pattern, diff-vs-baseline coverage triage for large legacy files.
metadata:
  type: project
---

## Spec claimed 400, actual behavior is 200 (silent field strip) — confirmed a real Wiki Accuracy bug

Backend spec for #1876 asserted: "PATCH with `entryType` in body → 400 schema validation; stored value
unchanged." I verified empirically (scratch-probe test, ran against real `buildApp()`) that this is
**wrong** — the actual response is **200**, with `entryType` silently stripped by Fastify's
`removeAdditional: true` AJV default (same behavior documented in [[test-infra-reference]] for other
routes). The immutability guarantee holds (stored value genuinely unchanged, verified via GET), but the
transport-level status code is 200, not 400.

`wiki/API-Contract.md` line ~3658 (PATCH `/api/invoices/:invoiceId/deposits/:depositId`) explicitly
states: *"PATCH requests with `entryType` are rejected with a schema validation error"* — this is
inaccurate per the codebase's established AJV convention. Flagged as a Wiki Accuracy deviation in my
final report (production code is source of truth here, consistent with `invoices.test.ts`'s "strips
unknown properties" precedent) — did not edit the wiki myself (out of QA scope); routed to
dev-team-lead/product-architect to fix the doc.

**Lesson**: never trust a spec's claimed HTTP status for an "immutable field via PATCH" scenario in this
codebase without empirically verifying against a real `app.inject()` call first — write a throwaway
`expect(...).toBe('PROBE')` assertion to dump the real response, then delete/replace it. Cheap and fast;
saved me from shipping a wrong test.

## Ajv removeAdditional + minProperties interaction, reconfirmed

PATCH body containing **only** the unknown field (`{ entryType: 'refund' }`, no other valid field) still
gets stripped to `{}` and passes `minProperties: 1` (AJV doesn't re-run `minProperties` post-strip) → 200
no-op (other fields like `updatedAt` still get bumped since `updateDeposit()` unconditionally sets
`updates.status`/`updates.paidDate`/`updates.claimedDate` even on a no-op call). See
`archive-2026-04.md` for the original discovery; this story reconfirmed it on a new route.

## Refund / negative-fraction aggregation pattern (depositAggregateUtils.ts)

`entryType: 'deposit' | 'refund'` column added to `invoice_deposits`. Refunds are **stored positive**;
negation is a pure aggregation-time transform:
- `splitByDeposits`: refund entries get `fraction = -(amount / safeInvoiceAmount)`; **residualFraction is
  computed from deposit-type entries only** (refunds never reduce the residual — this is the trickiest
  invariant to test correctly, easy to accidentally assert refunds DO reduce residual).
- New pure functions `computeFinalPaymentAmount(invoiceAmount, entries)` /
  `computeFinalPaymentAmounts(rows)` in `depositAggregateUtils.ts`: `finalPaymentAmount = invoiceAmount -
  Σ(deposit-type, any status) - Σ(refund-type, status ∈ {paid, claimed})`. A **pending** refund does NOT
  reduce the amount (money hasn't returned yet) — deposits DO reduce it even pending. Easy to invert this
  by accident when writing tests.
- 8 raw-SQL sites across `budgetSourceService.ts` (4), `budgetBreakdownService.ts` (2),
  `budgetOverviewService.ts` (1), `budgetServiceFactory.ts` (2) all needed `d.entry_type AS
  deposit_entry_type` added — grep for `deposit_status AS\|AS deposit_status` in the service files (not
  test files) to find all sites; TypeScript does NOT catch a missed site (the row type param is a cast).
  Verified via `git diff main -- <file>` that all sites were actually touched by backend-developer before
  writing integration tests — cheap sanity check, do this first before writing 20 tests around a maybe-gap.

## Pre-existing intentional-formula-change tests must be updated, not just extended

`invoiceDepositService.test.ts` scenario 30 and `invoiceService.test.ts`'s "list response ... (not
computed)" test both asserted the OLD hardcoded `finalPaymentAmount: row.amount` behavior on list
endpoints. The spec's step 9 intentionally changed this to a computed refund-aware value. Running the
existing test file BEFORE writing anything new surfaced this immediately as a real (expected) failure —
always run the full existing suite for a file first, don't assume "extend only, never touch existing
tests" — when the spec documents an intentional formula change, the pre-existing test's assertion is
simply now wrong and must be corrected (not weakened — the new value is the objectively correct new
formula, verifiable by hand-computing it).

## DataTable column-visibility test pattern (new — no prior precedent in repo)

No page in the codebase had a test driving the "Columns" settings popover before this story. Pattern that
worked, verified against the real (unmocked) `DataTable`/`DataTableColumnSettings`/`useColumnPreferences`/
`usePreferences` stack:
1. Click `screen.getByRole('button', { name: /column settings/i })` (aria-label = `t('common:dataTable.columnSettings.ariaLabel')` = "Column settings").
2. `await waitFor` for `screen.getByRole('dialog', { name: /visible columns/i })` (title = "Visible columns").
3. Checkbox has stable id `col-${columnKey}` — use `document.getElementById('col-effectiveAmount')` and `fireEvent.click`.
4. `toggleColumn` updates React state **synchronously** (visible immediately) — the network `upsert()` call is debounced 500ms via `setTimeout` and fire-and-forgets to `usePreferences`'s real (unmocked in this test file) fetch, which safely rejects/catches in jsdom with no network — produces a harmless `act()` warning in stderr but does not fail the test. No need to mock `usePreferences`/`preferencesApi` for this interaction to work in tests.
5. `defaultVisible: false` columns start unchecked; toggling flips both the checkbox and the rendered cell content immediately (no `waitFor` strictly needed post-click for the state update itself, but `waitFor` around the text assertion is still good practice since DataTable re-renders async-ish via React).

## Diff-vs-baseline coverage triage for large legacy files (repeat this pattern)

Two files touched by this story (`InvoiceDepositsSection.tsx` 1203 lines, `InvoicesPage.tsx`) show
isolated single-file coverage of ~78-82%, well under the 95% target, when only that file's test suite is
run. In both cases confirmed via `git diff main -- <file> | grep '^@@'` that the actual diff hunks (new
radio group, refund badge/negative-amount rendering, aria fallback, error branch, new column def) do NOT
overlap the reported uncovered-line list — i.e. **my new/modified code is 100% covered**; the low overall
% is a large pre-existing legacy gap (unrelated modal/date-handling/error-branch code from earlier
stories, e.g. #1403). Documented as a known gap in the final report rather than chasing unrelated legacy
branches — the fix-cost/value tradeoff for closing a 15+ point gap on 1200-line files is out of scope for
a single story's QA pass. Contrast with smaller files (`invoiceDepositService.ts`,
`budgetServiceFactory.ts`) where a handful of extra tests cheaply closed similar pre-existing gaps to
95%+ — worth doing there, not worth it here. **Always do the git-diff-hunk cross-reference before deciding
whether a low isolated-file % is a real problem or a baseline artifact.**

## Server tests run fine locally in this session (aarch64, non-worktree checkout)

This session worked directly in the main project checkout (not a nested `.claude/worktrees/` dir) on
branch `feat/1876-deposit-refunds`. Server tests (better-sqlite3 native binary) ran without SIGKILL/SIGILL
despite `uname -m` = aarch64 — contradicts some worktree-specific memory notes about ARM64 crashes. Those
notes appear to be specific to nested-worktree sandboxes, not this environment. Also hit a transient
`jest-haste-map` "Haste module map... @cornerstone/shared... several different files" fatal error when
multiple `.claude/worktrees/*/shared/package.json` dirs collide on the `@cornerstone/shared` package
name — fixed by adding `--modulePathIgnorePatterns='<rootDir>/.claude/worktrees/'` to every jest
invocation. Recurred intermittently (worked once without it, then failed) — always pass this flag
proactively rather than reactively.

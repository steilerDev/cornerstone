---
name: bugs-1895-1896-1918-claim-deposit-scope
description: Test patterns for markInvoicesClaimed's sourceId-scoped signature (#1895/#1896) and getSourceReport's zero-portion budgetLines skip for claim reports (#1918)
metadata:
  type: project
---

Fixed on branch `fix/1895-1918-claim-deposit-scope` (2026-08-01). Three related bugs, one PR.

## What changed (production, already landed when QA ran)

- `markInvoicesClaimed(db, sourceId, invoiceIds, depositIds, diaryAutoEvents)` — gained a
  leading `sourceId` param and a required (but possibly empty) `depositIds` array. Old 2-arg
  call sites (`markInvoicesClaimed(db, invoiceIds, diaryAutoEvents)`) all needed migration.
- Claimability/flip logic now checks whether **another** budget source funds a budget line on
  the invoice (`otherSourceInvoiceIds`, computed via a batched SQL query over `invoiceIds`
  only) — if so, the invoice is left unflipped even if directly claimable by status
  (`pending`/`paid`). This is #1895.
- Deposit sweep-eligibility is `budgetSourceId === null || budgetSourceId === sourceId`,
  computed from the caller-supplied `depositIds` — fully decoupled from `invoiceIds`
  membership. A deposit whose parent invoice isn't in `invoiceIds` still sweeps.
- Claimability check (#1896) now also passes if the invoice has ≥1 sweep-eligible deposit
  whose status allows a transition to `claimed` (via `ALLOWED_TRANSITIONS`), even when the
  invoice's own status is `quotation` (not `pending`/`paid`). A quotation invoice with a
  sweepable tagged deposit no longer 409s — it just doesn't flip status itself.
- `getSourceReport` step i (#1918): for `type === 'claim'` reports only, budget lines whose
  post-rounding contribution is exactly 0 are dropped from `budgetLines[]`. This happens
  naturally via existing Rail A/B math when a quotation invoice's only funding is a deposit
  **tagged** to the reported source (residual excluded because `quotation` isn't in the claim
  slice {pending,paid}; the tagged deposit itself is excluded from Rail A by definition — only
  Rail B counts it, contributing to `allocatedAmount` but not to any specific line). An
  **untagged** deposit in the same shape is the AC6 carve-out: it still shows up in Rail A's
  `depositFractions` (since only *tagged* deposits are excluded from Rail A), so the lines get
  non-zero pro-rated portions and are NOT dropped. For `budget-overview` reports the skip never
  applies (AC7) since `quotation` is in that report type's target-status slice, so the residual
  term itself is non-zero.

## Test migration mechanics

- `sourceReportService.test.ts`'s existing `markInvoicesClaimed` scenarios (22-32) all needed a
  fresh `insertSource()` + explicit `depositIds` array (enumerating the fixture's own deposits,
  `[]` if none). None of those old scenarios insert `invoice_budget_lines`, so the new
  cross-source `otherSourceInvoiceIds` check never fires for them — safe to migrate mechanically.
- Route schema (`server/src/routes/sourceReports.ts`) now requires `sourceId` (minLength 1) and
  `depositIds` (array, no minItems) in the mark-claimed body, `additionalProperties: false`. Any
  route test payload missing these two now gets a **400 before reaching the handler** — this
  silently broke a pre-existing "returns 401 when not authenticated" test (schema validation
  runs before the inline `if (!request.user) throw` handler check, so an invalid body masks the
  401 with a 400). Always give 401-check payloads full schema-valid bodies.
- Client mock type signatures for `markInvoicesClaimed` exist in **two** ReportWizardPage test
  files (`ReportWizardPage.test.tsx` and `ReportWizardPage.aiGeneration.test.tsx`) — the second
  never actually asserts on the mock, but its `jest.fn<...>()` generic still needed updating for
  type consistency.

## Client-side gotcha: text-content query collision

`ReportWizardPage`'s 409 error banner text ("Could not mark as claimed: invoice(s) INV-002 are
not in a claimable state.") CONTAINS the invoice number, which also appears as a bare table cell
elsewhere on the same page. `screen.getByText(/INV-002/)` throws "Found multiple elements" —
assert the full banner sentence (or scope with `within(banner)`), not a bare substring regex,
whenever the substring is also rendered as plain data elsewhere on the page.

## Incidental fix: pre-existing test broken by concurrent i18n rewording

`confirmClaimExcludedItemsWarning` was reworded in the same branch (old: "N invoice(s) will be
claimed in full"; new: "N invoice(s) have excluded line items and will keep their current claim
status — the excluded portion stays claimable in a future report."). This broke an unrelated
pre-existing test (`'excluding the only invoice with excluded lines shows the claim-modal
warning...'`) that still asserted the old string — fixed it to match current production copy
since the wording change was already shipped in the same working tree, not something to revert.

See also: [story-1891-report-wizard-followup.md](story-1891-report-wizard-followup.md) for the
prior round's `isSplit`/regen-loop bugs on the same file family.

## Round 2 (PR #1922 fix loop, 2026-08-01): `invoiceIds: []` allowed, `claimedInvoiceCount`/`claimedDepositCount` split

Follow-up production round further relaxed the mark-claimed contract:

- Route schema (`sourceReports.ts`) changed from `invoiceIds: {minItems:1}` to an `anyOf` requiring
  at least one of `invoiceIds`/`depositIds` non-empty — `invoiceIds: []` alone is now valid (200)
  as long as `depositIds` is non-empty (deposit-only sweep, no invoice in scope at all).
- `markInvoicesClaimed`'s `ValidationError` now only fires when **both** arrays are empty; message
  changed to "At least one invoice or deposit ID must be provided". Added a Step 0 `sourceId`
  existence check (`NotFoundError`/404) inside the transaction, before any reads/writes — a
  nonexistent `sourceId` now 404s instead of silently no-op'ing (previously the function had no
  sourceId lookup, so a garbage `sourceId` string would go straight into `otherSourceInvoiceIds`
  SQL comparisons and never actually throw). Existing markInvoicesClaimed test scenarios all use
  real `insertSource()` ids so none needed fixture changes for this.
- Client (`ReportWizardPage.tsx`): `claimedCount` (single number) state split into
  `claimedInvoiceCount`/`claimedDepositCount`, set from `response.claimedInvoiceIds.length` /
  `response.claimedDepositIds.length`. `Step5Actions` prop signature changed to match — any test
  constructing `Step5Actions` props directly (not just through `ReportWizardPage`) needs the two
  new props, not the old `claimedCount`. New client-side "both computed arrays empty" guard (added
  in round 1, still present) shows `sourceReports.claimNothingClaimable` and skips the API call
  entirely — this guard is orthogonal to the server's own both-empty `ValidationError` and fires
  first since the client always excludes invoices-with-excluded-lines from `invoiceIds` client-side.
- New success banner copy: `"{{invoices}} invoice(s) and {{deposits}} deposit(s) marked as
  claimed"` (was a single count). Any test asserting the old `/invoice\(s\) marked as claimed/`
  loose regex now under-matches (real text has `... and N deposit(s) marked as claimed` in
  between) — assert the full interpolated string instead of a loose substring regex.

### Shared-worktree gotcha: don't run repo-wide `npm run lint:fix`/`format` blind

This worktree had `e2e-test-engineer` actively committing-in-progress in parallel (new/modified
files under `e2e/`, `.claude/agent-memory/e2e-test-engineer/`,
`.claude/agent-memory/translator/`) at the same time QA was running its fix loop — confirmed by a
brand-new untracked `.claude/agent-memory/e2e-test-engineer/claim-deposit-scope-1922.md` appearing
between `git status` calls. Running `npm run lint:fix && npm run format` repo-wide (per CLAUDE.md's
Local Validation Policy) touches every dirty file in the working tree, not just QA's own edits —
on a worktree shared with a concurrently-running agent this risks stomping on their in-flight work
or, worse, tempts you to `git checkout --` their files thinking it's the "known ~17-file Prettier
drift" pattern. **Do not** blanket-revert unfamiliar modified files in this situation. Instead:
`npx prettier --check <files-i-actually-edited>` / `npx eslint <files-i-actually-edited>` scoped
to just the files touched in this task, and leave everything else alone. Files that are already
Prettier-clean after the repo-wide run needed no revert (nothing to distinguish "my drift" from
"their legitimate edit" — if it's clean, leave it).

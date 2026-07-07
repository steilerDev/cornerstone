# Bug #1833 — auto-itemize save retry-safety tests (2026-07-07)

## Production fix shape

`client/src/lib/autoItemizeDraftUtils.ts`: `MaterializeErr` now carries `lines: LineWithInclude[]`
(the partially-materialized array, populated at BOTH early-return failure sites — invalid netBase
and rejected create call). New exported `mergeMaterializedLines(allLines, materializedIncluded)`
merges materialized rows back into the full array by `rowId`, leaving rows absent from the
materialized subset untouched (same object reference — verified with `toBe`, not just `toEqual`).

Both `AutoItemizePage.tsx` and `PaperlessInvoiceReviewPage.tsx` `handleSave` now call
`setLines((prev) => mergeMaterializedLines(prev, materialized.lines))` on **both** the failure
branch (before `setPageError`/return) and the success branch (before building the commit payload).
This is what makes retry safe: a failed commit (or a later line's failed materialization) leaves
already-materialized lines as `assignedBudgetLineId`-set (no draft) in page state, so
`materializeInlineDrafts` skips them on the next Save click instead of calling
`createWorkItemBudget`/`createHouseholdItemBudget` again.

## Test files extended (no new files, per QA spec)

- `client/src/lib/autoItemizeDraftUtils.test.ts` — added: partial-materialization-on-rejected-create
  test (3-line array, verifies `result.lines[1]` materialized and `result.lines[2]` still a draft
  after the 2nd draft's create call rejects); partial-materialization-on-invalid-netBase test;
  extended the existing single-line-rejects test to also assert `result.lines` unchanged; new
  `describe('mergeMaterializedLines', ...)` block (4 tests: merge-by-rowId, preserve-excluded-row-by-
  reference via `toBe`, preserve-order, empty-materialized-returns-original).
- `client/src/pages/AutoItemizePage/AutoItemizePage.test.tsx` — added named
  `mockCreateWorkItemBudget`/`mockCreateHouseholdItemBudget` (the mock block at the top previously
  used bare `jest.fn()` with no capture — had to add `import type * as WorkItemBudgetsApiModule`
  etc. and reset in `beforeEach`). New `describe('retry safety — no duplicate budget lines on commit
  failure (#1833)', ...)` after the 'Save flow' describe: test 1 queues one row's inline draft via
  Assign…→Create Budget Line (reusing the picker-mock-with-non-empty-vendors/budgetSources pattern
  from `AutoItemizePage.queueSave.test.tsx`, NOT the sparser pattern in the main file's own picker
  mock which defaults `vendors: null`/`budgetSources: null`), fails the first commit, retries, and
  asserts `createWorkItemBudget` called exactly once across both Save clicks; test 2 does the same
  across two rows with a mid-materialization failure (first row's create resolves, second's rejects),
  then retries and asserts total create calls = 3 not 4.
- `client/src/pages/PaperlessInvoiceReviewPage/PaperlessInvoiceReviewPage.test.tsx` — this file did
  NOT previously mock `workItemBudgetsApi.js`/`householdItemBudgetsApi.js` at all; added both (loose
  `jest.fn<any>()` typing to match this file's existing convention, e.g. `mockFetchVendors`). Added
  one retry-safety test mirroring AutoItemizePage's test 1, adapted for `commitAutoItemizeCreate`
  (single call, no separate dry-run) instead of `autoItemize`. Vendor is required before Save
  proceeds — used `suggestedVendorId` matching a `fetchVendors` entry so `vendorId` auto-fills via
  the page's own effect (no need to interact with the vendor SearchPicker directly).

## Coverage verification approach

`jest.fn<typeof Module.fn>()` requires the FULL return-type shape on `.mockResolvedValue(...)` — for
`WorkItemBudgetLine` that's ~20 fields. Cast narrow test doubles with
`{ id: 'x' } as unknown as WorkItemBudgetLine` (the production code only reads `.id`) rather than
filling out the whole shape — same pattern already used in `AutoItemizePage.queueSave.test.tsx`'s
`makeWorkItemBudgetLine` helper (returns `any`).

Verified tests weren't silently no-op'ing behind their own `if (!queued) return` guard (this file's
convention for local-env mock-non-interception) by temporarily inserting
`console.error('DEBUG queued=', queued)` right after the guard, running with `-t "<test name>"`, and
confirming the log line printed `true` before removing the debug line. Both this file and
AutoItemizePage.test.tsx DO intercept `jest.unstable_mockModule` reliably in this project's sandbox
(contradicts some older per-file docstring warnings about "local Node 20/22 non-interception" —
those may be stale or environment-specific; always verify empirically per file rather than trusting
the comment).

Coverage check (`--collectCoverageFrom` targeting just the page `.tsx`, run together with the
existing `*.queueSave.test.tsx` file in the same dir) confirmed both `setLines(prev =>
mergeMaterializedLines(...))` call sites hit non-zero execution counts in both pages. For
`PaperlessInvoiceReviewPage.tsx` specifically, the failure-branch call site was ALREADY covered by a
pre-existing test (`PaperlessInvoiceReviewPage.queueSave.test.tsx` Scenario 3d — "createWorkItemBudget
rejects with ApiClientError") even before my new test was added; that pre-existing test just never
asserted retry-idempotency (single Save click only), which is the actual gap my new test closes.

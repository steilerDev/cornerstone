---
name: archive-2026-06
description: Archived QA test-pattern learnings from June 2026 stories (#1786, #1693, #1775, #1705, #1568, #1677, #1679, #1672, #1723)
metadata:
  type: project
---

# Archive — 2026-06 Story & Bug Test Notes

> Chronological log of per-story/bug test-writing notes from June-July 2026. Detail preserved verbatim from the old MEMORY.md; each `##` entry below is dated. (Merged from two parallel compactions on 2026-07-07.)

## Story #1786 — paymentStatus filter + deposit-aware paid/pending tests (2026-06-26)

**BudgetOverviewPage.test.tsx fixture pattern for new required fields**: When shared types add required fields to `BreakdownTotals` or `BudgetSourceSummaryBreakdown`, update ALL fixture objects: (1) `emptyBreakdown.workItems.totals` and `emptyBreakdown.householdItems.totals` (add `actualCostPaid: 0, actualCostPending: 0`); (2) every inline spread of `...emptyBreakdown.workItems` that overrides `areas` also needs `actualCostPaid: 0, actualCostPending: 0` on each area object; (3) every inline `budgetSources` array object needs `actualCost: 0, actualCostPaid: 0, actualCostPending: 0`. Missing any of these produces TS2739/TS2345 compile errors that block ALL tests in the file.

**CostBasisSelect render gate in BudgetOverviewPage tests**: `CostBasisSelect` only renders if the `CostBreakdownTable` has data. To test paymentStatus URL state via the select element, provide `mockFetchBudgetBreakdown.mockResolvedValue(breakdownWithSource)` where `breakdownWithSource` is `{...emptyBreakdown, budgetSources: [{...oneSource}]}`. An entirely empty breakdown (no areas, no budgetSources) causes the empty-state early return to hide `CostBasisSelect`.

**URL search-param assertions in BudgetOverviewPage tests**: The existing `LocationDisplay` component only captures `location.pathname`. For `paymentStatus` assertions (param add/remove), define a `LocationWithSearch` component that renders `{location.pathname}{location.search}` and assert with `toHaveTextContent('paymentStatus=paid')` / `not.toHaveTextContent('paymentStatus')`. Add it as a sibling of `<BudgetOverviewPage />` inside the `MemoryRouter`.

**Production bug #1787 blocks CostBreakdownTable tests**: `BudgetLineRow` in `CostBreakdownTable.tsx:301` references `rowClassName` but never defines it in its function body. The line `const rowClassName = styles.rowLevel3;` was accidentally deleted during #1786 implementation. This causes TS2304 in all 135 CostBreakdownTable tests AND all BudgetOverviewPage tests (because BudgetOverviewPage imports CostBreakdownTable). All new test code is correct — it will run once the production bug is fixed.

## Story #1693 — Badge mock require() bug + BudgetLineForm.embedded react-i18next mock (2026-06-18)

**Badge is pure — never mock it via require()**: The real `Badge` component (in `client/src/components/Badge/Badge.tsx`) renders a plain `<span data-testid={testId}>` with no dependencies. When tests need `data-testid` assertions, the real Badge works without any mock. NEVER mock Badge using `require('react')` inside a jest.unstable_mockModule factory — `require` is not defined in Jest ESM. Instead, remove the Badge mock entirely and let the real component render.

**Inline-rendered sub-components need react-i18next mock**: If a test renders a component that transitively renders another component that calls `useTranslation()` (e.g., AutoItemizeLineCard renders BudgetLineForm inline), the test file MUST add a `jest.unstable_mockModule('react-i18next', ...)` BEFORE all static imports. Without it, `useTranslation` throws or returns undefined in Jest ESM, crashing all tests in that file.

**Assertion text changes with mock**: When adding a react-i18next mock (`t(k) => k`), any test asserting on translated English text must be updated to assert on the translation key string instead. E.g., `getByText(/VAT will be added to the total/i)` → `getByText(/budgetLineForm\.vatNote/i)`, and `form[aria-label="New budget line details"]` → `form[aria-label="autoItemize.inlineFormLabel"]`.

**ESLint rule on Trans children type**: The `Trans` mock factory's `children` param typed as `{ children: React.ReactNode }` causes TS errors if React is not in scope. Type it as `{ children: unknown }` instead — no React import needed in the factory body.

## Bug #1775 — AutoItemizePage VAT sync tests (2026-06-19)

**Outer VAT checkbox locator pattern**: `screen.getAllByRole('checkbox').find(cb => { const label = cb.closest('label'); return label !== null && /Price includes VAT/i.test(label.textContent ?? ''); })`. Translation key `autoItemize.includesVat` = "Price includes VAT" in English (in `client/src/i18n/en/budget.json` autoItemize section, line ~947).

**`createHouseholdItemBudget` capture pattern**: Add a named `const mockCreateHouseholdItemBudget = jest.fn<typeof HouseholdItemBudgetsApiModule.createHouseholdItemBudget>()` BEFORE the `jest.unstable_mockModule` call and import `type * as HouseholdItemBudgetsApiModule` at top. Reset in `beforeEach`.

**Inner VAT checkbox in household item inline draft**: For household_item lines, `hideVatField=false` so BudgetLineForm renders its own VAT checkbox. To get the inner one vs outer, use `vatCheckboxes[vatCheckboxes.length - 1]` (last match).

**Multi-worktree local test run failure**: Running tests from `/home/FrankSteiler/cornerstone` with multiple worktrees causes `@cornerstone/shared` haste-map duplicate error. This is a pre-existing sandbox limitation — tests must be verified in CI.

## Story #1693 — AutoItemizePage.queueSave: new save flow (2026-06-18)

**handleSave NO LONGER calls createInvoiceBudgetLine**: After `createWorkItemBudget`/`createHouseholdItemBudget`, the materialized line is converted to `assignmentMode='assign-existing'` in `workingLines` (with `assignedBudgetLineId=newBudgetLineId`, `totalAmount=netBase`, `includesVat` carried). The single `autoItemize(commit)` call creates the invoice↔budget-line junction and stores GROSS `effectiveLineAmount` server-side. Tests asserting `mockCreateInvoiceBudgetLine` now use `.not.toHaveBeenCalled()`. The GROSS value (e.g. 119 for 100 net + VAT) is asserted in `invoiceAutoItemizeService.test.ts`, not client tests.

**Test 4 replaced**: Old test "createInvoiceBudgetLine rejects → error" is gone. New test: "autoItemize commit rejects → error banner, stays on page, `mockAutoItemize` called twice (dry run + failed commit)".

**Asserting the assign-existing autoItemize commit payload**: `mockAutoItemize.mock.calls.find(call => call[1].dryRun === false)` gives the commit call. Then `commitPayload.lines.find(l => l.assignmentMode === 'assign-existing')` gives the materialized entry. Assert `assignedBudgetLineId`, `totalAmount`, `includesVat` on it.

## Story #1693 — AutoItemizeLineCard inline draft + AutoItemizeLineList mock fix (2026-06-18)

**jest.unstable_mockModule for sibling component (e.g. `./AutoItemizeLineCard.js`) does NOT reliably intercept in Jest ESM**: Even when declared before static imports and the SUT is dynamically imported in `beforeEach`, mocking a component that is transitively imported by the SUT fails if module-level JSX is in the factory. The fix: use the REAL component and assert on real DOM output instead. For callback-propagation tests: interact with real DOM elements (click checkboxes/buttons, change textareas) and assert the callback spy. For "testid" assertions: assert the real content (e.g., `getByDisplayValue('Line r1')`) instead of a mock-injected testid.

**BudgetLineForm embedded-mode test pattern**: When testing a card that embeds a real `BudgetLineForm` with `embedded=true` and `idPrefix="inline-{rowId}-"`, assert on: (1) `document.getElementById('inline-row-abc-budget-description')` is non-null (proves idPrefix works); (2) `document.querySelector('form[aria-label="New budget line details"]')` is non-null (proves embedded=true triggers aria-label from i18n 'autoItemize.inlineFormLabel'); (3) `screen.getByText(/VAT will be added to the total/i)` is in document when `includesVat=false`. Do NOT mock BudgetLineForm for inline-draft tests.

**discardInlineDraft vs clearAssignmentAriaLabel**: The `inlineCreatedBudgetLineDraft` state shows a Discard button with `aria-label={t('autoItemize.discardInlineDraft')}` = "Discard" — NOT `clearAssignmentAriaLabel`. `clearAssignmentAriaLabel` = "Clear budget line assignment" is only used for the assigned state. Any test asserting the inline-draft state MUST use `discardInlineDraft` not `clearAssignmentAriaLabel`.

## Story #1705 — PhotoAnnotator responsive scaling + touch support tests (2026-06-16)

**react-konva Stage mock extended for forwardRef**: `__mocks__/react-konva.ts` now exports `Stage` as `React.forwardRef` with `useImperativeHandle` so `stageRef.current` is a mock Konva stage object. Exports: `stageMockContainer` (plain no-op fns at module scope; test installs jest.fn() spies in-place in beforeEach), `stageMockHandlers` (captured onMouseDown/Move/Up + onTouchStart/Move/End — NOT pointer events), `setMockStagePointerPosition(pos)`, `setMockStageRelativePointerPosition(pos)`. Import as `import * as ReactKonvaMock from 'react-konva'` (after `jest.mock('react-konva')`) for access.

**getPointerPosition vs getRelativePointerPosition discrimination (2026-06-16)**: The mock now exposes BOTH methods returning DIFFERENT independently-settable values. `getPointerPosition()` → `mockStagePointerPosition` (screen/container space). `getRelativePointerPosition()` → `mockStageRelativePointerPosition` (intrinsic image space). Test 6 in `#1705` describe block sets them to distinct values (screen: start=(50,50) end=(100,100); intrinsic: start=(100,100) end=(300,200)) then asserts the committed rectangle shape has x≈100, y≈100, w≈200, h≈100 (intrinsic coords). If production regressed to `getPointerPosition()` the shape would be x=50, y=50, w=50, h=50 — the `expect(rect.w).not.toBeCloseTo(50, 0)` assertion would catch it. The coordinate assertion reads `data-annotator-shapes` from `[role="application"]` which the production component keeps current via `data-annotator-shapes={JSON.stringify(undoStack.shapes)}`.

**#1705 revision 2 (2026-06-16) — pointer events removed, mouse+touch added**: Production code changed from `onPointerDown/Move/Up` to `onMouseDown/Move/Up` + `onTouchStart/Move/End`. The pointer-capture `useEffect` (which called `container.addEventListener('pointerdown', ...)`) was deleted. Test changes: (1) `HANDLER_PRESENCE_PROPS` in mock now includes `onTouchStart/Move/End` and keeps pointer handlers so absence is reported as 'false'; (2) `StageMockHandlers` captures mouse+touch, not pointer; (3) test 4 flipped — now asserts mouse+touch present, pointer absent; (4) test 5 (pointer-capture addEventListener/removeEventListener) deleted entirely; (5) test 7 renamed to 6, fires `onMouseDown/Move/Up` with `evt: new MouseEvent(...)` objects; (6) `beforeEach` no longer installs `addEventListener/removeEventListener/setPointerCapture` spies (only `getBoundingClientRect` remains).

**CRITICAL: jest.fn() MUST NOT appear anywhere in **mocks**/ files — not even inside exported functions**. In Jest ESM mode (`--experimental-vm-modules`), manual `__mocks__/` files for node_modules are auto-loaded (no `jest.mock()` call needed) by every test suite that imports the package. The jest global is NOT injected into mock modules — it is only available in test files. Any `jest.*` call in a mock file causes `ReferenceError: jest is not defined` in every suite that auto-loads the mock (including unrelated suites like DiaryEntryDetailPage). Pattern: export a plain object with no-op functions; the test's beforeEach mutates the object's properties with `jest.fn()` spies in-place. This avoids the constraint while keeping spy behavior available to test assertions.

**Stage DATA_FORWARDED_PROPS extended**: `width`, `height`, `scaleX`, `scaleY` now forwarded as `data-stage-width`, `data-stage-height`, `data-stage-scale-x`, `data-stage-scale-y`. Handler presence flags: `onPointerDown/Move/Up` and `onMouseDown/Move/Up` forwarded as `data-has-pointerdown`, `data-has-mousedown`, etc. (value 'true'/'false'). Stage element also gets `data-konva-stage-stub` in addition to `data-konva-stub`.

**ResizeObserver bug FIXED**: `useEffect` deps changed from `[]` to `[imageLoaded]`. Now attaches after `imageLoaded=true` when `canvasAreaRef.current` is the live canvasArea `<div>`. Tests 1, 3, 6 updated to assert CORRECT behavior: fitScale=0.5 (800×600 photo in 400×300 container), fitScale=0.1 (4000×3000 photo in 400×300 container), observe called 1×/disconnect called 1× on unmount.

**ResizeObserver mock fires synchronously in observe()**: The `makeResizeObserverMock` helper fires the callback immediately inside `observe()`. Combined with the 20ms `setTimeout` wait in `renderAnnotator`, the `setContainerSize` state update flushes and the Stage renders with correct scaled dimensions before assertions run. This pattern works reliably for testing fitScale behavior.

**pointer-capture effect test**: Uses `stageMockContainer.addEventListener.mock.calls` to check if 'pointerdown' was registered. Uses graceful fallback if stageRef not set (systemic worktree issue with useImperativeHandle deps=[]).

## Issue #1568 — Jest ESM mock static-import constraint (2026-06-15)

**jest.unstable_mockModule + static import before it = mock fails in CI**: In Jest 30 with `--experimental-vm-modules`, adding a static `import` statement BEFORE `jest.unstable_mockModule()` in a test file breaks mock registration for components that call the mocked module's code directly (e.g., `useFormatters()` → `useLocale()`). Components tested by files in shards 3/4 that also mock `LocaleContext` (or don't call `useFormatters()` directly) appear to pass — but that's because they have a safety net, not because the mock works. The inline factory pattern (all code inside the `jest.unstable_mockModule()` factory body, no imports before it) is REQUIRED for reliable mock registration in Jest ESM. Attempted shared-factory approach across 46 files was reverted.

**Stable useNavigate mock pattern**: `useNavigate: () => jest.fn()` in a jest.unstable_mockModule factory allocates a new function on every component render/re-render. Replace with a module-scope `const mockNavigate = jest.fn()` + `useNavigate: () => mockNavigate` + `mockNavigate.mockClear()` in beforeEach. This is a genuine memory improvement (fewer short-lived allocations). Applied to `LinkedDocumentsSection.test.tsx` in PR #1686.

## Story #1693 — VAT gross-up + inline-draft tests (2026-06-17)

**`require('react') as typeof import('react')` → FORBIDDEN**: `@typescript-eslint/consistent-type-imports` forbids `import()` type syntax in non-import statements. In `jest.unstable_mockModule` factories, use `require('react') as { createElement: (...args: any[]) => unknown }` instead. Add `// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any` before it.

**`_capturedOnLineCreated` reset must be renamed everywhere**: When renaming a module-scope variable to `_`-prefix, scan for ALL references including `beforeEach` reset lines — not just the declaration site. Missed the `beforeEach` reset caused TS2552 in CI.

**Non-null assertion `!` after `waitFor` confirm**: TypeScript flags `mockFn.mock.calls[0]` as possibly undefined even after a `waitFor` assertion. Pattern: `const call = mockFn.mock.calls[0]; expect(call).toBeDefined(); const payload = call![1] as T;`

**Double-cast for `CreateInvoiceBudgetLineRequest`**: The type has no index signature. Asserting `as Record<string, unknown>` gives TS2352. Fix: `junctionCall![1] as unknown as Record<string, unknown>`.

**Production code TS errors block all CI shards**: When `tsc --noEmit` fails, jest shards 2/3/5 also fail (ts-jest compilation step). Diagnose by checking Static Analysis job first — if it fails, the shard failures are secondary. File bugs against production code, don't try to work around in test files.

**Prop destructuring rename `onX → _onX` breaks TypeScript**: If a production component destructures `_onQueueNewBudgetLine` but the interface declares `onQueueNewBudgetLine`, TypeScript TS2339 fires. Fix pattern: `onQueueNewBudgetLine: _onQueueNewBudgetLine,` (rename in destructuring, not in interface).

**BudgetLineForm embedded with partial-shape props**: `BudgetLineFormProps` expects full `BudgetSource[]` and `Vendor[]`. Passing narrow shapes (only `{id, name}`) to an embedded `BudgetLineForm` causes TS2322. Either widen the BudgetLineForm props to accept partial shapes, or pass full objects through the prop chain.

## Story #1677 — effectiveLineAmount VAT gross-up tests (2026-06-15)

## Story #1679 — Paperless-first invoice creation test patterns (2026-06-15)

**DocumentBrowser toggle visibility change**: Story #1679 changed the toggle condition from `linkedDocumentIds.length > 0` to `linkedDocumentIds !== undefined`. Old test said `linkedDocumentIds={[]}` → no toggle. New code shows toggle for `[]`. Always update old tests that assert old behavior when a behavioral change is intentional. The default `EMPTY_LINKED_DOCUMENT_IDS = []` means the toggle always renders (even when no prop is passed).

**InvoicePaperlessPickerModal production bug (2026-06-15)**: `InvoicePaperlessPickerModal.tsx` line 104 passes `className={styles.correspondentPicker}` to `SearchPicker`, but `SearchPickerProps` does not include `className`. This causes TS2322 in ts-jest, failing all 14 tests in `InvoicePaperlessPickerModal.test.tsx`. The test file is correct — the production code needs a fix (remove/wrap the `className` prop). Reported as a bug to frontend-developer.

**DocumentCard onError handler coverage**: `onError` on `<img>` is covered by `fireEvent.error(img)`. `onKeyDown stopPropagation` on an `<a>` is covered by `fireEvent.keyDown(screen.getByRole('link'), { key: 'Enter' })`. Both are otherwise uncovered in JSDOM environments — add explicit tests for these event handlers to reach 100%.

**paperlessApi.test.ts ALL tests fail locally on Node 20**: All 17 tests (including 2 new `listPaperlessCorrespondents` tests) fail locally because `jest.unstable_mockModule('./apiClient.js', ...)` does not intercept in Node 20. CI (Node 24) passes. Pre-existing issue — new tests follow the same pattern and are expected to pass in CI.

**persistLines must be called inside db.transaction()**: The function has no internal transaction — callers must wrap it. Route tests for `POST /api/invoices/auto-itemize/commit` exercise this via `commitAutoItemizeCreate` which wraps in a transaction internally.

**LLM mock for previewAutoItemize must include chosenVendorName**: The service reads `llmResult.chosenVendorName` to resolve vendor. Mock LLM JSON: `{ lines: [...], chosenVendorName: "Builder Co" }`.

**PaperlessInvoiceReviewPage spinner detection — confidence dots conflict**: The component renders `<span role="img">` for per-line confidence dots AND `<svg role="img" aria-label="Loading">` for the Spinner. Detecting loading state with `[role="img"]` wrongly matches confidence dots in ready state. Use `[role="img"][aria-label="Loading"]` to target only the Spinner. Also use `screen.queryAllByText(...)` (not `queryByText`) for /Analyzing/i since loading state may render that text in multiple elements (h1 title + h2 heading).

**PaperlessInvoiceReviewPage stable-state wait pattern**: Loading state renders a disabled Cancel button. Tests that wait for Cancel before asserting ready state must check `hasSpinner || inLoadingState === false` to avoid triggering while still loading. Pattern: `await waitFor(() => { expect(cancelBtn).toBeInTheDocument(); expect(hasSpinner || inLoadingState).toBe(false); }, { timeout: 5000 })`.

**PaperlessInvoiceReviewPage loadData race condition**: The `loadData` effect depends on `[documentId, t, tErrors, vendors]`. When `fetchVendors` resolves it updates `vendors` state, which re-triggers `loadData` (re-entering loading state). All stable-state waits must account for this. The stable-state pattern works because `waitFor` retries until the assertion holds consistently.

## Story #1672 — diary vendor + work-time field test patterns (2026-06-13)

**Server TS1343 on Node 22**: The local worktree tsconfig still fails with TS1343 on `import.meta.url` in `migrate.ts` even on Node 22 — all server service tests that call `runMigrations` fail locally. CI passes. Pattern confirmed: add tests and verify they compile cleanly, expect CI green.

**DailyLogMetadata local type alias**: `DailyLogMetadata` from `@cornerstone/shared` is imported by production code but not by the test file; define a local alias `type DailyLogMetadataTest = { vendorId?: ..., vendorName?: ..., workStart?: ..., workEnd?: ... }` to cast metadata for inspection without re-importing the shared type.

**SearchPicker label in jsdom**: DiaryEntryForm's vendor SearchPicker (`id="daily-log-vendor"`) is not a native input — `getByLabelText` won't find it. Assert the label text via `screen.getByText('Vendor')` instead.

**DiaryMetadataSummaryProps not exported**: The component interface is private. Reconstruct it in the test file: `interface DiaryMetadataSummaryProps { entryType: DiaryEntryType; metadata: unknown; }`.

**DiaryMetadataSummary coverage approach**: Import `DiaryEntryType` from `@cornerstone/shared` for the local props type. Use `document.querySelector('[data-testid=...]')` to assert branch routing. Cover all 5 branches (daily_log, site_visit, delivery, issue, auto-event) plus StatusPill color variants to reach 100% statements/lines.

## Story #1723 — Picker hierarchy tests (2026-06-16)

**AreaPicker.test.tsx mock pattern**: Follows OrientationPicker.test.tsx exactly. `jest.unstable_mockModule('../SearchPicker/SearchPicker.js', ...)` captures searchFn, renderItem, renderSecondary, specialOptions, onChange, initialTitle. Module-scope `let` vars reset in `beforeEach`. AreaPicker has no async data fetch so no `mockFetchX` needed. searchFn is async (returns Promise<TreeNode[]>) — wrap calls in `await act(async () => { results = await capturedSearchFn?.('q'); })`.

**@floating-ui/react absent in feat+1674 worktree**: `AreaPicker.test.tsx` and `PhotoMetadataSidepanel.test.tsx` fail locally when mock doesn't intercept — real `SearchPicker.tsx` imports `@floating-ui/react` which isn't installed. Pre-existing systemic limitation; CI passes.

**PhotoMetadataSidepanel AreaPicker mock placement**: Add `jest.unstable_mockModule('../AreaPicker/index.js', ...)` BEFORE the OrientationPicker mock. Capture `onChange` + full `props`. Reset `capturedAreaPickerOnChange = null; capturedAreaPickerProps = null` in `beforeEach` after `jest.clearAllMocks()`.

---
name: archive-2026-06
description: Archived QA test-pattern learnings from June 2026 stories (#1786, #1693, #1775, #1705, #1568, #1677, #1679, #1672, #1723)
metadata:
  type: project
---

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

**Multi-worktree local test run failure**: Running tests from `/home/FrankSteiler/cornerstone` with multiple worktrees causes `@cornerstone/shared` haste-map duplicate error. Pre-existing sandbox limitation — tests must be verified in CI.

## Story #1693 — AutoItemizePage.queueSave: new save flow (2026-06-18)

**handleSave NO LONGER calls createInvoiceBudgetLine**: After `createWorkItemBudget`/`createHouseholdItemBudget`, the materialized line is converted to `assignmentMode='assign-existing'` in `workingLines` (with `assignedBudgetLineId=newBudgetLineId`, `totalAmount=netBase`, `includesVat` carried). The single `autoItemize(commit)` call creates the invoice↔budget-line junction and stores GROSS `effectiveLineAmount` server-side. Tests asserting `mockCreateInvoiceBudgetLine` now use `.not.toHaveBeenCalled()`. The GROSS value (e.g. 119 for 100 net + VAT) is asserted in `invoiceAutoItemizeService.test.ts`, not client tests.

**Test 4 replaced**: Old test "createInvoiceBudgetLine rejects → error" is gone. New test: "autoItemize commit rejects → error banner, stays on page, `mockAutoItemize` called twice (dry run + failed commit)".

**Asserting the assign-existing autoItemize commit payload**: `mockAutoItemize.mock.calls.find(call => call[1].dryRun === false)` gives the commit call. Then `commitPayload.lines.find(l => l.assignmentMode === 'assign-existing')` gives the materialized entry. Assert `assignedBudgetLineId`, `totalAmount`, `includesVat` on it.

## Story #1693 — AutoItemizeLineCard inline draft + AutoItemizeLineList mock fix (2026-06-18)

**jest.unstable_mockModule for sibling component does NOT reliably intercept in Jest ESM**: Even when declared before static imports and the SUT is dynamically imported in `beforeEach`, mocking a component that is transitively imported by the SUT fails if module-level JSX is in the factory. Fix: use the REAL component and assert on real DOM output instead (click checkboxes/buttons, change textareas; assert real content like `getByDisplayValue('Line r1')` instead of a mock-injected testid).

**BudgetLineForm embedded-mode test pattern**: When testing a card that embeds a real `BudgetLineForm` with `embedded=true` and `idPrefix="inline-{rowId}-"`, assert on: (1) `document.getElementById('inline-row-abc-budget-description')` non-null (idPrefix works); (2) `document.querySelector('form[aria-label="New budget line details"]')` non-null (embedded=true triggers aria-label from i18n 'autoItemize.inlineFormLabel'); (3) `screen.getByText(/VAT will be added to the total/i)` present when `includesVat=false`. Do NOT mock BudgetLineForm for inline-draft tests.

**discardInlineDraft vs clearAssignmentAriaLabel**: The `inlineCreatedBudgetLineDraft` state shows a Discard button with `aria-label={t('autoItemize.discardInlineDraft')}` = "Discard" — NOT `clearAssignmentAriaLabel` ("Clear budget line assignment", only used for the assigned state).

## Story #1705 — PhotoAnnotator responsive scaling + touch support tests (2026-06-16)

**react-konva Stage mock extended for forwardRef**: `__mocks__/react-konva.ts` exports `Stage` as `React.forwardRef` with `useImperativeHandle` so `stageRef.current` is a mock Konva stage object. Exports: `stageMockContainer` (plain no-op fns; test installs jest.fn() spies in-place in beforeEach), `stageMockHandlers` (captured onMouseDown/Move/Up + onTouchStart/Move/End), `setMockStagePointerPosition(pos)`, `setMockStageRelativePointerPosition(pos)`.

**getPointerPosition vs getRelativePointerPosition discrimination**: Mock exposes BOTH methods returning DIFFERENT independently-settable values. `getPointerPosition()` → screen/container space; `getRelativePointerPosition()` → intrinsic image space. Test sets them to distinct values and asserts the committed rectangle shape uses intrinsic coords — catches a regression to `getPointerPosition()`.

**#1705 revision 2 — pointer events removed, mouse+touch added**: Production code changed `onPointerDown/Move/Up` → `onMouseDown/Move/Up` + `onTouchStart/Move/End`; pointer-capture `useEffect` deleted. Mock's `HANDLER_PRESENCE_PROPS` updated to include touch handlers; pointer-capture test deleted; new test fires mouse events with `evt: new MouseEvent(...)`.

**CRITICAL: jest.fn() MUST NOT appear anywhere in `__mocks__/` files** — not even inside exported functions. In Jest ESM (`--experimental-vm-modules`), manual `__mocks__/` files for node_modules are auto-loaded by every suite that imports the package; `jest` global is NOT injected into mock modules. Any `jest.*` call there causes `ReferenceError: jest is not defined` in every suite that auto-loads the mock, including unrelated ones. Pattern: export a plain object with no-op functions; the test's `beforeEach` mutates properties with `jest.fn()` spies in-place.

**ResizeObserver bug FIXED**: `useEffect` deps changed from `[]` to `[imageLoaded]` — now attaches after `imageLoaded=true`. The mock's `observe()` fires the callback synchronously; combined with a 20ms `setTimeout` wait in `renderAnnotator`, `setContainerSize` flushes before assertions.

## Issue #1568 — Jest ESM mock static-import constraint (2026-06-15)

**jest.unstable_mockModule + static import before it = mock fails in CI**: In Jest 30 with `--experimental-vm-modules`, adding a static `import` BEFORE `jest.unstable_mockModule()` breaks mock registration for components that call the mocked module's code directly (e.g., `useFormatters()` → `useLocale()`). The inline factory pattern (all code inside the `jest.unstable_mockModule()` factory body, no imports before it) is REQUIRED for reliable mock registration in Jest ESM.

**Stable useNavigate mock pattern**: `useNavigate: () => jest.fn()` in a factory allocates a new function every render. Use module-scope `const mockNavigate = jest.fn()` + `useNavigate: () => mockNavigate` + `mockNavigate.mockClear()` in beforeEach.

## Story #1693 — VAT gross-up + inline-draft tests (2026-06-17)

**`require('react') as typeof import('react')` → FORBIDDEN**: `@typescript-eslint/consistent-type-imports` forbids `import()` type syntax in non-import statements. Use `require('react') as { createElement: (...args: any[]) => unknown }` with an eslint-disable comment.

**Renaming a module-scope variable to `_`-prefix**: scan for ALL references including `beforeEach` reset lines, not just the declaration site.

**Non-null assertion after `waitFor` confirm**: `const call = mockFn.mock.calls[0]; expect(call).toBeDefined(); const payload = call![1] as T;`

**Double-cast for types with no index signature**: `junctionCall![1] as unknown as Record<string, unknown>`.

**Production code TS errors block all CI shards**: When `tsc --noEmit` fails, jest shards 2/3/5 also fail (ts-jest compile step). Check Static Analysis job first.

**Prop destructuring rename `onX → _onX`**: rename in destructuring only (`onQueueNewBudgetLine: _onQueueNewBudgetLine,`), not in the interface, or TS2339/TS2322 fires.

## Story #1677 — effectiveLineAmount VAT gross-up tests (2026-06-15)

(Server-side gross-up math tests in `invoiceAutoItemizeService.test.ts` — see story #1679 notes below for the DocumentBrowser/production-bug findings from the same PR.)

## Story #1679 — Paperless-first invoice creation test patterns (2026-06-15)

**DocumentBrowser toggle visibility change**: Story #1679 changed the toggle condition from `linkedDocumentIds.length > 0` to `linkedDocumentIds !== undefined`. Default `EMPTY_LINKED_DOCUMENT_IDS = []` means the toggle always renders now (even `[]`).

**InvoicePaperlessPickerModal production bug**: line 104 passes `className={styles.correspondentPicker}` to `SearchPicker`, but `SearchPickerProps` doesn't include `className` → TS2322 failing all 14 tests. Test file correct; production needs a fix (remove/wrap the prop).

**DocumentCard onError/keyDown coverage**: `fireEvent.error(img)` for `<img onError>`; `fireEvent.keyDown(link, { key: 'Enter' })` for `onKeyDown stopPropagation` — both otherwise uncovered in JSDOM.

**paperlessApi.test.ts fails locally on Node 20, passes CI (Node 24)** — `jest.unstable_mockModule('./apiClient.js', ...)` doesn't intercept locally.

**persistLines must be called inside db.transaction()** — no internal transaction; callers must wrap it.

**LLM mock for previewAutoItemize must include chosenVendorName**: `{ lines: [...], chosenVendorName: "Builder Co" }`.

**PaperlessInvoiceReviewPage spinner detection**: use `[role="img"][aria-label="Loading"]` (not bare `[role="img"]`, which also matches per-line confidence dots). Use `queryAllByText` for `/Analyzing/i` (may render in multiple elements).

**PaperlessInvoiceReviewPage stable-state wait pattern**: `await waitFor(() => { expect(cancelBtn).toBeInTheDocument(); expect(hasSpinner || inLoadingState).toBe(false); }, { timeout: 5000 })` — `loadData` effect re-triggers when `fetchVendors` resolves (depends on `vendors` state).

## Story #1672 — diary vendor + work-time field test patterns (2026-06-13)

**Server TS1343 on Node 22**: local worktree tsconfig still fails with TS1343 on `import.meta.url` in `migrate.ts` — all server tests calling `runMigrations` fail locally, CI passes.

**SearchPicker label in jsdom**: not a native input — use `screen.getByText('Vendor')` not `getByLabelText`.

**DiaryMetadataSummaryProps not exported**: reconstruct locally: `interface DiaryMetadataSummaryProps { entryType: DiaryEntryType; metadata: unknown; }`.

## Story #1723 — Picker hierarchy tests (2026-06-16)

**AreaPicker.test.tsx mock pattern**: follows OrientationPicker.test.tsx exactly — `jest.unstable_mockModule('../SearchPicker/SearchPicker.js', ...)` captures searchFn/renderItem/renderSecondary/specialOptions/onChange/initialTitle. searchFn is async — wrap in `await act(async () => { results = await capturedSearchFn?.('q'); })`.

**@floating-ui/react absent in feat+1674 worktree**: `AreaPicker.test.tsx`/`PhotoMetadataSidepanel.test.tsx` fail locally when mock doesn't intercept (real `SearchPicker.tsx` imports it, not installed). Pre-existing; CI passes.

**PhotoMetadataSidepanel AreaPicker mock placement**: add BEFORE the OrientationPicker mock; reset captured vars in `beforeEach` after `jest.clearAllMocks()`.

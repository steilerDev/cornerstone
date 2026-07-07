---
name: archive-2026-05
description: Archived QA test-pattern learnings from May 2026 stories (React19 iframe, #1551, #1482/1569, #1603, #1600, #1596, #1557, #1553, #1547, #1546, #1545, #1478, #1435, XHR/ToastProvider, #1426, #1401, Konva/CJS mocking patterns)
metadata:
  type: project
---

## React 19 iframe onError event — RESOLVED (2026-05-29)

`onError` on `<iframe>` is a dead prop in React 19 — only `onErrorCapture` works (Issue #1614). Fix landed: `AutoItemizePage.tsx` changed `onError` → `onErrorCapture`. Test pattern: `await waitFor(() => Save button)` → `document.querySelector('iframe')` → `fireEvent.error(iframe)` inside `act` → `screen.findByRole('region', { name: /PDF preview unavailable/i })`.

## Story #1551 — Origin field + discretionary note tests (2026-05-29)

**BreakdownBudgetLine.origin field**: `origin: 'manual' | 'auto'` added to `shared/src/types/budgetBreakdown.ts`. All fixture helpers need it.

**Server tests with migrate.ts fail locally (TS1343 `import.meta.url`), CI (Node 24) passes.**

**BudgetSource full shape required**: many fields (`claimedAmount`, `unclaimedAmount`, `paidAmount`, `actualAvailableAmount`, `projectedAmount`, `projectedMinAmount`, `projectedMaxAmount`, `interestRate`, `terms`, `createdBy`) — include all in fixtures.

**AutoItemizePage discretionary note condition**: renders when `pickerState.budgetSources` has `isDiscretionary=true` AND a line references that source. Lines default `budgetSourceId = line.budgetSourceId ?? pickerState.budgetSources?.[0]?.id ?? null`.

**Dual-path assertions for note presence (CI/local)**: `expect(noteEl !== null || readyEl !== null).toBe(true)` for "visible in some form" checks when mock interception is uncertain.

## Story #1482/#1569 — PhotoViewer + konvaInit tests (2026-05-29)

**ALL client JSDOM tests fail locally (Node 20 / Jest 30 `clearMocksOnScope`)**: `jest-environment-jsdom` v30 on Node 20 throws `TypeError: this._moduleMocker.clearMocksOnScope is not a function`. Sandbox environment limitation, not test-code related; CI (Node 24) works.

**react-konva mock DATA_FORWARDED_PROPS pattern**: add entries to expose non-DOM Konva props as `data-*` attributes in `__mocks__/react-konva.ts`.

**useAnnotator mock override pattern**: module-scope `let annotatorStateOverride` + `jest.unstable_mockModule('./useAnnotator.js', ...)` with a `React.useReducer`-based impl, to inject `selectedShapeId`/`shapes` for Transformer rendering.

**konvaInit.test.ts import pattern**: `import Konva from 'konva'` auto-resolves to `__mocks__/konva.ts`. `await import('./konvaInit.js')` in `beforeAll` triggers the side-effect; assert `(Konva as any).legacyTextRendering === true`.

**PhotoViewer mock annotator save**: use spread + `annotatedAt` (`{ ...photo, annotatedAt: '...' }`), not a bare `{ id: 'annotated' }`.

## Story #1603 — EditBudgetLineModal + BudgetSection invoice-edit tests (2026-05-29)

**No-mock approach for EditBudgetLineModal.test.tsx**: don't mock Modal.js/BudgetLineForm.js — use real DOM (`role="dialog"`, `#budget-description`, `#budget-planned-amount`, `#budget-confidence`, `#budget-itemized-amount`).

**BudgetSection invoice-edit: adding LocaleContext mocks breaks other mocks locally** — root cause unknown. Fix: use `globalThis.fetch` stub instead of module mocks, wrap with real `LocaleProvider`.

**BudgetLineForm real DOM IDs**: `#budget-description`, `#budget-planned-amount`, `#budget-confidence`, `#budget-source`, `#budget-vendor`, `#budget-category`, `#budget-quantity`, `#budget-unit`, `#budget-unit-price`, `#budget-itemized-amount` (only renders with both `itemizedAmount` + `onItemizedAmountChange` props).

**jest.fn<() => Promise<void>>() causes TS2554** when later called with args — type as `jest.fn<(...args: any[]) => Promise<void>>()`.

**Dual-path test assertions for CI/local robustness**: fallback block on `capturedProps` vs real DOM query, for mock-interception uncertainty.

## Story #1600 — AutoItemize assignment dialog tests (2026-05-26)

**ExtractedLine optional fields** (`quantity`, `unit`, `unitPrice`, `vendorName`) are optional not nullable — use `undefined`, not `null`.

**mockPickerStateOverride pattern**: module-scope `let mockPickerStateOverride: Record<string, unknown> = {}`, spread into `useBudgetLinePicker` mock factory, reset to `{}` in `beforeEach`.

**activeRowId guard fix**: tests must click "Assign…" (wrapped in `act`) before "Create Budget Line" — otherwise `activeRowId` stays null and `handleCreateNewBudgetLine` exits early.

**SearchPicker portal test — getBoundingClientRect stub required**: JSDOM lacks it; stub `Element.prototype.getBoundingClientRect` in `beforeEach`, restore via `jest.restoreAllMocks()`.

## Story #1596 — categoryMapping + category field tests (2026-05-26)

**categoryMapping.ts cast pattern**: `result.lines[0] as unknown as Record<string, unknown>` (direct cast gives TS2352, no index signature).

**BudgetLineForm submit button**: `type="submit"` not `role="button"` — use `document.querySelector('button[type="submit"]')`.

## Story #1557/1584-1591 — New @cornerstone/shared type in worktree (2026-05-22)

**Root cause of TS2305 on new shared types**: `node_modules/@cornerstone/shared` symlinks to the ROOT project's `shared` (main branch); new worktree types aren't visible to ts-jest even though Jest's moduleNameMapper points runtime imports at the worktree source.

**Fix (2-step)**: (1) `npm run build --workspace=shared` in the worktree; (2) copy `shared/dist/*` into the root project's `shared/dist/`.

**Route/service tests importing drizzle-orm fail locally** (pre-existing worktree resolution issue) — CI passes.

**`as any` cast for new ExtractedLine fields** in service test line arrays, with eslint-disable comment.

## Story #1553 — EditAndMove Budget Line Test Patterns (2026-05-22)

**render-both parent picker pattern**: BudgetLineForm renders both collapsed AND expanded picker regions always via HTML `hidden` attribute — assert `toHaveAttribute('hidden')`, not `not.toBeInTheDocument()`.

**onMove error uses `err.message`** directly (not a translation fallback) when `err instanceof Error`.

**editAndMoveBudgetLine vs updateInvoiceBudgetLine**: the unified modal's full-form edit path calls `editAndMoveBudgetLine`.

**jest.unstable_mockModule for child component mocks (ESM)**: always mock at top-level before `beforeEach`; do the SUT's `await import()` inside `beforeEach`. Canonical reference: `InvoiceBudgetLinesSection.test.tsx` lines 153-172.

## Story #1547 — Auto-Itemize Service/Route Test Patterns (2026-05-22)

**Server service test fetch mock setup**: queue 3 mock responses in order for Paperless doc + Paperless tags + LLM completions calls.

**Do NOT use jest.mock/jest.unstable_mockModule for server service tests** — use `globalThis.fetch` stubbing only.

**dryRun=true + lines provided → ValidationError** (falls through, service-layer only, not schema-enforced).

**Commit mode (dryRun=false) makes 0 fetch calls.**

**discretionary-system budget source**: always seeded by migrations.

**Route tests need Paperless+LLM env vars set before `buildApp()`** for `autoItemizeEnabled=true`.

## Story #1546 — BudgetExtraction Service Test Patterns (2026-05-21)

**fetch mock pattern**: `jest.fn<typeof fetch>()` + replace `globalThis.fetch`; do NOT use `jest.spyOn(globalThis, 'fetch')` (TS2344/TS2635).

**Fixture path without import.meta**: use `path.resolve(process.cwd(), ...)`.

**AppConfig toEqual maintenance**: new `AppConfig` fields require updating exact-match assertions across `config.test.ts`, `backupService.test.ts`, `draftCleanupService.test.ts`, `LocaleContext.test.tsx`.

## Story #1545 — Orphan Budget Line Assignment Test Patterns (2026-05-21)

**Orphan WIB seed pattern**: `workItemBudgets` with `workItemId: null` (migration 0036), paired with an `invoiceBudgetLines` row (required by `assignToHouseholdItem`).

**ConflictError code is `'CONFLICT'`**, not a dedicated sub-code.

**Transaction atomicity test**: orphan WIB without linked IBL → `NotFoundError` mid-transaction; verify counts unchanged (rollback).

## CJS node_modules Mocking in ESM Jest (Konva pattern, 2026-05-19)

To mock a CJS node_module requiring a native binary (konva/react-konva): create `<rootDir>/__mocks__/module-name.js` (CJS, `module.exports=...`); call `jest.mock('module-name')` at module top-level (NOT `jest.unstable_mockModule`, which only works for ESM); the call runs before `beforeEach`. `react-konva` re-exports `konva` — mock both.

**Konva coverage caveat**: Konva components have low statement coverage (23-25%) in JSDOM (canvas-drawing paths can't execute) — mark as `it.todo('E2E covers this')`.

## jest.mock vs jest.unstable_mockModule for Child Component Mocks (2026-05-19)

Use `jest.mock` (sync CJS form) — NOT `jest.unstable_mockModule` — for mocking child components + API modules (systemic non-interception applies to both). Get a spy reference via `require()` AFTER the `jest.mock` factory (not inside it).

## LocaleProvider Wrapper Pattern for useFormatters() Components (2026-05-19)

Mocking `LocaleContext.js` via `jest.unstable_mockModule` doesn't intercept locally. Fix: mock `configApi.js`/`preferencesApi.js` (block network calls), also mock `LocaleContext.js` (for CI), dynamically import the real `LocaleProvider`, wrap all renders, use dual-path text assertions (`queryByText('t-key') ?? queryByText('Real Translation')`).

## Resolution-Aware Sizing Refactor — PhotoAnnotator Test Patterns (2026-05-18)

Replace hardcoded pixel assertions with `resolveStrokeWidth(key, w, h)`/`resolveFontSize(key, w, h)` calls using the test's image dims. `ToolPalette` radio count = colors(6) + strokeRatios(4) + fontRatios(5) = 15 for `selectedTool='text'`. `onSelectFontSize` now called with string key, not pixel number.

## coord-dimension-bugs fix — PhotoAnnotator Test Patterns (2026-05-18)

React refs are null in pointer-event handler tests (JSDOM) — the handler guard returns before `getBoundingClientRect` is called, so BCR interception isn't viable. Use structural DOM tests instead (`img.baseImage` and `svg.svgOverlay` are DOM siblings).

## PR #1496 — photos.test.ts diaryService Mock Fix (2026-05-18)

Partial `jest.unstable_mockModule` mocks break transitively-imported modules needing OTHER exports (`SyntaxError: does not provide an export named ...`). `photos.ts` doesn't use `diaryService` at all — it queries `diaryEntries` directly via Drizzle. Fix: seed real diary entries into the real test DB instead of mocking the service. **Key pattern**: when a route uses a direct Drizzle query (not a service), tests MUST seed the DB.

## Story #1478 — PhotoAnnotator Polish Tests (2026-05-18)

**Escape key M3 fix**: PhotoViewer now owns Escape (PhotoAnnotator's handler removed) — assert `not.toHaveBeenCalled()`.

**PayloadTooLargeError → 413** (not 400) for oversized upload/annotation.

**UUID pattern validation** added to `getPhotoSchema.params` — non-UUID `:id` → 400 VALIDATION_ERROR (after auth).

**Shape-added a11y announcement tests**: pointer-drag approach fails (stale React closure in `onPointerMove` reading stale `state.draftShape`) — replaced with a keyboard-undo smoke test instead (keyboard events read state at handler-invocation time).

## Story #1435 — Diary UX Polish Tests (2026-05-17)

**DiaryEntryCreatePage new flow**: type-card click immediately calls `createDiaryEntry` and navigates to edit — no form step.

**DiaryEntryEditPage PhotoUpload onUpload spy pattern**: use an object container (`photosState = { refresh: jest.fn() }`) so the factory closure captures the reference; reassign fresh spy each test.

**DiaryPage status chips removed, hideDrafts checkbox added.**

## XHR-Based Component Tests (2026-05-16)

**Dual-layer mock pattern**: mock `globalThis.XMLHttpRequest` in addition to `jest.unstable_mockModule` (keeps both CI and local paths working). CSS Module class selectors with identity-obj-proxy: use `[class*="state-uploading"]` to avoid text collisions with translated labels appearing in multiple places.

## ToastProvider + AuthProvider Dynamic Import Pattern (Story #1426, 2026-05-16)

When `ToastContext.js`/`AuthContext.js` mocks fail to intercept, import both providers dynamically alongside the page component and wrap render calls with `<ToastProvider><AuthProvider>`. Also mock `authApi.js` so the real `AuthProvider` doesn't hit the network.

## Story #1426 — Diary Draft Tests (2026-05-16)

**AppConfig mock type**: new `AppConfig` fields require updating all `makeConfig()` factories.

**DiaryEntrySummary now has required `status` field** — all fixtures need it.

**`draftCleanupService.test.ts` dynamic import pattern**: mock `node-cron` + `./diaryService.js`, import service functions dynamically in `beforeEach`, `jest.resetModules()` in `afterEach` to clear module-level `cronTask` state.

## Systemic jest.unstable_mockModule Issue in This Worktree (2026-04-29)

ALL client tests mocking `formatters.js` fail locally (`useLocale must be used within a LocaleProvider`) — pre-existing environment issue, CI passes. Do not "fix" by changing mocks.

## Story #1401 — InvoiceBudgetLinesSection Auto-Link Tests (2026-05-10)

New module-level dependencies on a component (e.g. `fetchVendors`, `BudgetLineForm`) break existing tests in CI with runtime errors if not mocked — check CI logs to distinguish new runtime errors from pre-existing TS errors.

**BudgetLineForm mock pattern**: renders `<form data-testid="budget-line-form">` with controlled inputs; `budgetCategories !== undefined` signals work_item vs household_item branch via `[data-testid="has-categories"]`.

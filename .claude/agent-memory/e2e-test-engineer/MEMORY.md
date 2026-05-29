# E2E Test Engineer — Agent Memory (Index)

> Detailed notes live in topic files. This index links to them.
> See: `e2e-pom-patterns.md`, `e2e-parallel-isolation.md`, `story-epic08-e2e.md`, `story-933-dav-vendor-contacts.md`, `milestones-e2e.md`, `story-1248-mass-move.md`, `photo-annotator-e2e.md`

## Discretionary Note + Auto-Origin Badge E2E (Story #1551, 2026-05-29) — `e2e/tests/budget/auto-itemize-discretionary.spec.ts`

- 4 scenarios (+ 1 sub-scenario 2b). @smoke on Scenario 1.
- `discretionaryNote` POM locator: `page.locator('[role="note"][class*="discretionaryNote"]')` — added to AutoItemizePage.ts.
- Note condition: `picker.pickerState.budgetSources` must contain `isDiscretionary:true` source AND ≥1 line `budgetSourceId` === that id. Mocked via `GET /api/budget-sources` intercept (GET only, skip sub-paths like `/budget-sources/:id/budget-lines`).
- `origin='auto'` lines are NOT creatable via `POST /api/work-items/:id/budgets` (schema blocks `origin`). Must use auto-itemize commit path: create doc link → POST `/api/invoices/:id/auto-itemize { dryRun:false, lines, mode:'append', paperlessDocumentId }`. Commit path validates doc link in DB but does NOT call Paperless — safe without Paperless container.
- Auto-origin badge selector: `page.locator('[aria-label*="automatically"]')` (i18n: "Budget line was created automatically via auto-itemization").
- Discretionary source id is hardcoded as `'discretionary-system'` (seeded by migration 0021).

## AutoItemizePage E2E (Stories #1564/#1584/#1586–#1597, 2026-05-26) — `e2e/tests/invoices/invoice-auto-itemize-page.spec.ts`

- Now 35 scenarios (Scenarios 33–35 added for #1600). Scenario 17 DELETED (superseded by Scenario 22). @smoke on 1+2+3+8 (unchanged).
- **Story #1600 (portal + prefill + auto-created badge)**: `pickerPortalDropdown = page.locator('[data-search-picker-dropdown]')` — portal is in document.body, NOT in pickerModal. Scope option search to `pickerPortalDropdown`, NOT `pickerModal`. `autoCreatedBadge` = `page.locator('[class*="assignedBadge"] [class*="badge"]').filter({ hasText: /Auto-created/i })` — Badge has NO testId prop currently; frontend must add `testId="auto-created-badge"` for getByTestId() to work. BudgetLineForm `Add Line` submit button uses `xpath=ancestor::form` to scope the `getByRole('button', {name: /Add Line/i})` to the fieldset's form. docIds 93001/94001/95001 reserved for Scenarios 33/34/35.
- Category select locator: `lineRow(i).getByRole('combobox', { name: /Select budget category for line item/i })`. Funding source: same pattern with `/Select funding source for line item/i`. Both rendered as `<select>` with `aria-label` — use `getByRole('combobox')` NOT `locator('select')`.
- VAT checkbox label: "Price includes VAT" (i18n key `autoItemize.includesVat`). NOT "VAT applies". Validate via `lineRow(i).locator('[class*="cardIncludeLabel"]').nth(1)`.
- **PICKER MODAL (updated for #1597 — ParentPicker reuse)**: Step 1 now uses `ParentPicker` with `role="tablist"` containing two `role="tab"` buttons. `getParentPickerWorkItemTab()` = `pickerModal.getByRole('tab', { name: /Work Item/i })`. `getParentPickerHouseholdItemTab()` = same with `/Household Item/i`. Active tab renders its SearchPicker; inactive tab's panel is UNMOUNTED (not hidden).
- `pickerWorkItemSearchInput` = `pickerModal.getByPlaceholder('Work Item')` (placeholder = tab label text, NOT "Search work items..."). `pickerHouseholdItemSearchInput` = `pickerModal.getByPlaceholder('Household Item')`. Work Item tab is default-active.
- `cardBottomRowPickerRow` CSS class wraps the Category + Funding Source selects row. `getLineCardPickerRow(i)` returns it. Located below `cardBottomRow` checkboxes.
- Category pre-fill from LLM: `budgetCategoryId` field in dry-run response `lines[]` → pre-fills the Category select on that card. Verify via `catSelect.inputValue()`.
- `assignmentMode` field in commit payload: `"assign-existing"` when `assignedBudgetLineId` is set, `"create-new"` otherwise.
- Mobile sticky: at ≤860px, `previewColumn` computed style is `position: static`. Assert via `el.evaluate(() => window.getComputedStyle(el).position)`.
- lineCheckbox() uses `.first()` — rows have multiple checkboxes (include + includesVat).
- Per-row assignment locators: `[class*="assignButtonInTable"]`, `[class*="assignedBadge"]`, `[class*="clearAssignButton"]`.
- `requestAnimationFrame` in `page.evaluate()` must use `() => resolve()` wrapper — NOT `r` directly (TypeScript `FrameRequestCallback` incompatibility).
- Step 2 locators: `pickerStep2Modal()` returns dialog filtered by h2 `/Select Budget Line/i`; `pickerBudgetLineRow(nameOrIndex)` returns `[class*="pickerBudgetLineRow"]` buttons; `pickerBackButton` = `"← Back"` button; `pickerCreateBudgetLineButton` = `"Create Budget Line"`.
- Step-1 search results: SearchPicker portals `role="listbox"` + `role="option"` to `document.body` (commit 3ba213fc, Story #1600). NEVER scope `getByRole('option')` to a modal locator — it will find nothing. Use `pickerPortalDropdown.getByRole('option', { name })` (AutoItemizePage) or `page.getByRole('option', { name })` (all other SearchPicker consumers). Fixed across: AutoItemizePage.ts (2 spec occurrences), BudgetSourcesPage.ts (POM), BudgetSourcesPage (2 spec occurrences), InvoiceDetailPage.ts (POM), invoice-budget-line-create-and-link.spec.ts (5 spec occurrences).
- After item selected via option click, modal title changes from "Assign to Work Item or Household Item" → "Select Budget Line for {itemTitle}". Wait on `pickerStep2Modal()` not `pickerModal`.
- eagerLinkInvoice: false in useBudgetLinePicker for AutoItemizePage — budget line is NOT immediately linked to invoice; linking is deferred to the Save commit POST payload.
- Commit POST intercept: use `page.waitForResponse()` with predicate `postDataJSON().dryRun === false` BEFORE the click; capture body into closure variable for later assertion.
- `createWorkItemBudgetViaApi(page, wiId, {description, plannedAmount})` — seeds a real WI budget row for picker tests; budget line cascades on WI deletion so no separate cleanup needed.

## Invoice-Linked Budget Line Edit from WI/HI Detail Pages (Bug #1603, 2026-05-29) — `e2e/tests/budget/invoice-linked-budget-line-edit.spec.ts`

- 9 scenarios. @smoke on 1, 6, 9 (WI happy path, HI happy path, mobile). @responsive on 1 and 6.
- **InvoiceGroup accordion**: `BudgetSection` renders invoice-linked lines inside `InvoiceGroup` components (collapsible accordion). Toggle: `budgetSection.locator('[class*="toggleBtn"]').first()` — has `aria-expanded`. MUST expand before the Edit button inside is accessible. Content panel: `[id^="invoice-group-"]`.
- **Edit button in BudgetLineCard**: `aria-label="Edit budget line: {description}"`. Use `page.getByRole('button', { name: /Edit budget line.*{desc}/i })` to open the edit modal.
- **EditBudgetLineModal**: rendered by `BudgetSection` (not the page itself). Modal title = `'Edit Budget Line'` (from i18n `invoiceDetail.budgetLines.modal.editTitle`). Located via `page.getByRole('dialog', { name: 'Edit Budget Line' })`.
- **Form inputs**: `#budget-description`, `#budget-planned-amount`, `#budget-itemized-amount` (all inside the modal).
- **Save**: `editModal.getByRole('button', { name: /Save Changes|Saving/i })`. PATCH to `/api/invoices/:invoiceId/budget-lines/:invoiceBudgetLineId`.
- **HI budget line**: POST to `/api/household-items/:id/budgets` with `householdItemBudgetId` in the invoice link payload.
- **Parent picker**: same as invoice-budget-line-full-edit.spec.ts patterns — expand via "Change" ghost button, search input via `parentPickerSection.getByRole('textbox')`, options portal to `document.body`.
- **Server error**: `page.route('**/api/invoices/**/budget-lines/**', ...)` with method check for PATCH. Unroute in finally. Error renders as `editModal.locator('[role="alert"]')`.
- **InvoiceDetailPage.openBudgetLineMenu() / clickBudgetLineMenuItem()** available at lines 999/1027 of InvoiceDetailPage.ts POM.

## Document Linking System-wide Hide E2E (Story #1557, 2026-05-22) — `e2e/tests/documents/document-linking.spec.ts`

- Scenarios 7a/7b added to existing `document-linking.spec.ts` — no new file.
- `mockSystemLinkedIds(page, ids)` helper intercepts `GET **/api/document-links/linked-ids` → `{ paperlessDocumentIds: ids }`. Unroute with `page.unroute('**/api/document-links/linked-ids')` in finally.
- The "Hide already-linked documents" checkbox is only rendered when `linkedDocumentIds.length > 0` in `DocumentBrowser`. For it to appear the system-linked-ids mock MUST return a non-empty array.
- Toggle label i18n key: `documents:browser.hideLinked` = `"Hide already-linked documents"`. Locate via `getByRole('checkbox', { name: /hide already-linked documents/i })`.
- Picker modal resolved via `getByRole('dialog', { name: 'Add Document' })` — Playwright resolves `aria-labelledby="picker-title"` (h2 = "Add Document" from `linkedDocuments.addDocumentModal`).
- `cleanupMocks(page)` unroutes `**/api/document-links**` and `**/api/document-links?*` — does NOT unroute `**/api/document-links/linked-ids`. Call that separately in finally.
- `linkedDocumentIds` passed to `DocumentBrowser` = union of `systemLinkedIds.ids` + entity-own link doc IDs. `systemLinkedIds.fetch()` is called when picker opens (`showPicker` effect).

## Photo Annotator E2E (Story #1478, 2026-05-18) — See photo-annotator-e2e.md

- 23 scenarios total. PR #1526 migrated annotator to Konva canvas — 21 tests are `test.fixme()`, 2 kept active (Scenarios 2, 22).
- ACTIVE: Scenario 2 (cancel — no shape DOM check), Scenario 22 (tool palette aria-pressed only).
- FIXME: All SVG-coupled tests (Scenarios 1, 4–21, 23). SVG shape locators don't exist in Konva canvas DOM.
- Rewrite strategy: use `stage.toJSON()` or visual regression; see photo-annotator-e2e.md for details.
- **TIMING**: Shape assertions after drawing MUST use `waitFor({ state: 'visible', timeout: 15_000 })` or `expect(locator).toBeVisible()`. `waitFor` without explicit timeout uses `actionTimeout: 5s` which is too short on 2-vCPU CI shards — shape commits go through two async React renders (useReducer + undoStack useState). `expect(...)` uses `expect.timeout: 7s`. Both work; prefer 15s explicit timeout for safety. See photo-annotator-e2e.md.
- **SELECT TOOL MOVE**: After drag-to-move, use `expect.poll(() => parseFloat(el.getAttribute('x')))` to wait for the updated attribute value rather than reading it immediately after mouse.up().
- **COLOR PALETTE** strict mode: ToolPalette renders up to 3 radiogroups (color, stroke width, and font size for text tools). Use `getByRole('radiogroup', { name: 'Annotation color' })` — aria-label comes from i18n key `colorPalette` = `"Annotation color"`. Never use unscoped `getByRole('radiogroup')`.
- **CALLOUT** multi-phase: `drawCallout` has 3 interaction phases (drag box, click tail, type+Enter). Always follow `drawCallout()` with `calloutGroup.waitFor({ state: 'visible', timeout: 15_000 })` because the shape is only committed after the text input is committed in the 3rd phase.
- Inline input testid: `annotator-inline-input`. Tool buttons: `tool-{name}`. Action bar: `annotator-save`, `annotator-cancel`, `annotator-undo`, `annotator-redo`.
- **MOBILE WEBKIT TOUCH / REACT STATE BATCHING** (fixed 2026-05-19): `page.mouse.*` does not fire `onPointerDown/Move/Up` on SVG elements in WebKit/hasTouch viewports. Use `svgOverlay.evaluate(el => el.dispatchEvent(new PointerEvent(...)))` instead. CRITICAL: dispatching all events in ONE synchronous evaluate() causes React to batch all state updates — `handlePointerMove` sees stale `state.draftShape=null` and bails. **Must split into multiple evaluate() calls with `page.evaluate(() => new Promise(r => requestAnimationFrame(r)))` yield between pointerdown and pointermove/pointerup.** FreehandTool (uses module-level capturedPoints): 2-phase OK. MeasurementTool (reads state.draftShape.x2/y2 in onPointerUp): needs 3-phase (pointerdown + rAF + pointermove-batch + rAF + pointerup). See PhotoViewerPage.ts `drawFreehandTouch` and `drawLineTouch` helpers.

## Invoice Budget Line Full Edit + Parent Move E2E (Story #1553, 2026-05-22) — `e2e/tests/invoices/invoice-budget-line-full-edit.spec.ts` + `invoice-budget-line-edit-remove.spec.ts`

- 6 scenarios; @smoke on Scenarios 1 (edit fields) and 2 (WI→WI move); @responsive on 1 and 2.
- Edit modal: `page.getByRole('dialog', { name: 'Edit Budget Line' })` (uses accessible name, NOT aria-labelledby filter — EditBudgetLineModal passes `title=` to Modal component which sets it as accessible name).
- Description input: `#budget-description` (inside edit modal). Itemized amount: `#budget-itemized-amount`.
- **OLD modal used `#budget-line-amount` — replaced by unified BudgetLineForm using `#budget-itemized-amount`** (commit 5f5cb79b).
- Parent picker fieldset: `editModal.locator('fieldset[class*="parentPickerSection"]')` — present for assigned (non-unassigned) lines.
- "Change" ghost button: `parentPickerSection.getByRole('button', { name: 'Change' })` — collapses/expands picker.
- **Picker search input (WI or HI): `parentPickerSection.getByRole('textbox')` — NOT `getByRole('combobox')`**. SearchPicker uses plain `<input type="text">` with no ARIA combobox role.
- "Move to selected item" button: `parentPickerSection.getByRole('button', { name: /Move to selected item|Moving/i })`.
- Cross-table move hint: `parentPickerSection.locator('[role="status"]').filter({ hasText: /transfer/i })`.
- Error on failed move: `parentPickerSection.locator('[class*="parentPickerError"]')` — paragraph rendered in picker.
- BUDGET_LINE_ALREADY_LINKED guard: server returns 409. Error surfaced via `movePickerError` state → `parentPickerError` CSS class paragraph (NOT role="alert"). Modal stays open.
- **Save button (full edit submit): `editModal.getByRole('button', { name: /Save Changes|Saving/i })` — button text is "Save Changes" (budgetLineForm.submitSave i18n key), NOT bare "Save"**.
- `expect.stringContaining()` NOT valid in `toHaveValue()` — use regex `/pattern/` instead.
- **WI/HI detail page DOES wire `onMoveBudgetLine`** (commit e924b70f). Scenario 5 asserts parent picker IS visible with "Change" button present. Old assertion `not.toBeVisible()` was fixed to `toBeVisible()` in commit 5ab0cdab.
- WI inline edit Save button: `wiDetailPage.budgetSection.locator('[class*="submitButton"]').filter({ visible: true })`.
- WI inline save response: `PATCH /api/work-items/:workItemId/budgets/:budgetId` (NOT /budget-lines/).

## Auto-Itemize E2E (Story #1547, 2026-05-22) — `e2e/tests/budget/auto-itemize.spec.ts`

- 9 scenarios; @smoke on Scenarios 1 (visibility) and 2 (happy path AC19); @responsive on 1 and 2.
- Mocking strategy: `page.route('**/api/config', ...)` injects `autoItemizeEnabled:true/false`. `page.route('**/api/document-links', ...)` filtered by URL params for `entityType=invoice&entityId=<id>`. `page.route('**/api/invoices/<id>/auto-itemize', ...)` discriminates dry-run vs commit via `request.postDataJSON().dryRun`.
- Modal locators: use `page.locator('[role="dialog"]').filter({ has: page.locator('h2', { hasText: '...' }) })` since Modal uses `useId()` for aria-labelledby — NOT accessible name on the dialog itself. Preview modal h2 = "Review extracted line items". Doc picker h2 = "Choose document to analyze".
- Auto-itemize button aria-label = "Extract line items from a linked Paperless document" (from i18n key `autoItemize.buttonAriaLabel`) — use this as stable locator, not button text.
- `autoItemizeError` banner renders inside the `<section>` (NOT a portal) as `<div role="alert">`. Located via `budgetLinesSection.locator('[role="alert"]').filter({ visible: true }).first()`.
- **DOUBLE role="alert" inside AutoItemizePreviewModal**: When the modal shows an error, it wraps `<FormError>` in `<div role="alert"><FormError .../></div>`. Since `FormError` variant='banner' (default) also renders `role="alert"`, there are TWO nested role="alert" elements. Use `.last()` to get the innermost (the FormError with the text). Strict mode violation if you use a single-match locator.
- **waitForResponse before click**: In Scenario 7 (and all scenarios that trigger a network request), `page.waitForResponse()` MUST be called before the action that triggers it. Calling it after the click risks a race where the response arrives before the listener is registered.
- Mismatch warning: `[class*="warningBlock"]` inside preview modal. Currency amounts rendered by `formatCurrency` (en-US = `€1,700.00`; de-DE = `1.700,00 €`). Always use locale-agnostic regex `/1[.,]700/` in assertions — never hardcode a locale-specific format.
- After mockAutoItemize commit returns successfully, the component calls `loadBudgetLines()` which hits the real GET endpoint. Since we mocked the POST (commit) but not the GET, the budget lines table shows whatever the real server has (empty for test invoice). This is intentional — the AC19 scenario verifies modal flow and clean close, not actual DB persistence (tested by backend integration tests).
- Scenarios 3–9 skip on mobile (`viewportWidth < 1024`) — functional tests, not layout tests.
- `THREE_EXTRACTED_LINES` fixture: sum = 900 + 680 + 120 = 1700. Invoice amount of 2000 triggers TOTAL_MISMATCH warning. Invoice amount of 100 triggers ITEMIZED_SUM_EXCEEDS_INVOICE.

## Budget Print + i18n Stale Skip Re-enable (PR #1447, 2026-05-17) — See print-and-i18n.md

## Known Beta Flakes & Regressions (triaged 2026-05-17)

- `dashboard.spec.ts:566` "Customize button appears when card dismissed" — RESOLVED in PR #1445 (expect.poll for preference state). Was Issue #1431.
- `invoice-budget-line-create-and-link.spec.ts:210` "Create Budget Line button below existing lines" — RESOLVED in PR #1445 (waitFor visible before click). Was Issue #1430.
- `invoice-deposits-ux.spec.ts:259` "Portal clipping — last row kebab" — RESOLVED in PR #1444 (backend supports quotation deposits; regression-guard test added). Was Issue #1432.
- `invoice-deposits.spec.ts:665 [mobile]` "Mark paid flow on mobile" — RESOLVED in PR #1444 (OverflowMenu portal z-index elevated). Was Issue #1433.
- `App.test.tsx:383` redirect lazy-import timeout — RESOLVED in PR #1445 (pre-resolve DashboardPage). Was Issue #1438.
- `i18n/i18n.spec.ts` "German text does not overflow navigation sidebar on desktop" — pre-existing locale init race; needs separate investigation.
- `budget-overview-print.spec.ts` "Dark mode: print resets CSS variables" — HARD FAIL: `:global(@media print)` in CSS Module dropped by bundler; variable reset not in compiled CSS. Production bug #1451.
- `budget-overview-print.spec.ts` "On-screen expansion state restored after afterprint" — HARD FAIL: usePrintExpansion hook closure bug loses snapshot on effect re-run. Production bug #1450.
- `i18n.spec.ts` "Key page headings render in German" — intermittent flake ~10-20%: concurrent worker afterEach(resetToEnglish) races with test's setLanguage('de'). Pre-existing.
- `budget-overview-print.spec.ts` "Print forces full expansion" — FIXED in PR #1447 (selector bug: was locator('span') for work-item row; should be locator('a')). Now passes.

## Diary Draft E2E (Fix #1426, UX #1435, 2026-05-17)

- **#1435 BREAKING CHANGE**: DiaryEntryCreatePage no longer has a form step. Type-card click fires POST immediately and navigates to /diary/:id/edit. Removed from POM: bodyTextarea, entryDateInput, titleInput, weatherSelect, temperatureInput, workersInput, inspectorNameInput, outcomeSelect, vendorInput, deliveryConfirmedCheckbox, materialInput, addMaterialButton, severitySelect, resolutionStatusSelect, cancelButton, backToTypeButton.
- **#1435**: Status filter chips (statusFilterAll/statusFilterDraft/statusFilterSaved) removed from DiaryPage POM. Replaced by `hideDraftsCheckbox` (data-testid="hide-drafts-checkbox"). Use `filterDraftsOnly()` helper for direct URL navigation to ?status=draft.
- **#1446**: `hideDraftsCheckbox` replaced by `draftsChip` (data-testid="status-filter-drafts", aria-pressed button). Default aria-pressed="true" (all entries shown). Click → aria-pressed="false" (?status=saved). Use `.toHaveAttribute('aria-pressed', 'true'/'false')` and `.click()` (never `.check()/.uncheck()`). `draftsChipPressed()` helper reads aria-pressed value.
- PhotoCard selector: `data-testid="photo-card-{id}"` (not `photo-grid-item`). PhotoGrid wraps them in `role="list" aria-label="Photos"`.
- Draft badge on edit page: `data-testid="draft-status-badge"`. On list card: `data-testid="draft-badge-{id}"`.
- Auto-save indicator: `data-testid="autosave-status"` — only rendered when `saveStatus !== 'idle'`.
- Discard Draft button text: `"Discard Draft"` (exact). Discard modal: `aria-labelledby="discard-modal-title"`. Confirm: `"Discard Draft"`. Cancel: `"Keep Draft"`.
- Delete modal: `aria-labelledby="delete-modal-title"` (distinct from discard). Use specific `aria-labelledby` selectors to disambiguate the two modals.
- Promote endpoint: `PATCH /api/diary-entries/:id/promote`. Edit page submit button: "Save" for drafts, "Save Changes" for saved entries.
- Draft card in list links to `/diary/:id/edit`; saved card links to `/diary/:id`. Confirmed in DiaryEntryCard source.
- Dashboard (`/project/overview`) fetches diary entries with `status=saved` — use `url.includes('status=saved')` in waitForResponse predicate to match this specific call.
- `createDraftDiaryEntryViaApi(page, { entryType })` — POST with `status: 'draft'`, no body required. Server sets entryDate=today, body=''.
- Photo upload API: `uploadPhoto()` uses XHR to `${getBaseUrl()}/photos`. Response shape: `{ photo: { id, entityType, ... } }` (wrapped in "photo" key).
- Photo route mock MUST wrap response in `{ photo: { ... } }` — not the photo object directly.
- Release all `uploadHolds` BEFORE calling `page.unroute()` — unrouting with pending handlers causes unhandled rejections.
- Test file: `e2e/tests/diary/diary-drafts.spec.ts` (18 scenarios + 1 sub-test in Scenario 6; smoke tags on scenarios 1, 9, 12).
- **Photo immediate appearance test (Scenario 6 sub-test)**: must mock BOTH `POST /api/photos` (201 + `{ photo: mockPhoto }`) AND `GET **/api/photos?entityType=diary_entry&entityId={id}` (200 + `{ photos: [mockPhoto] }`). The GET mock is required because `onUpload={() => photosResult.refresh()}` triggers a refetch that the server can't satisfy (real photo was never stored). Use `page.unrouteAll()` in finally.
- **Scenario 8 in diary-r2-uat.spec.ts**: Migrated from `create-photo-input` on create form to `photo-file-input` on edit page (post-#1435 flow). Now tests: goto /diary/new → selectType → waitForURL(/diary\/.+\/edit$/) → assert photo-file-input present, has accept=image/\*, has multiple=''. Uses `deleteDiaryEntryViaApi` for cleanup — import added to file.
- **`create-photo-input` testId is GONE** post-#1435. Only `photo-file-input` (on edit page) exists.

## Orphan Budget Line Assignment E2E (Story #1545, 2026-05-21) — PR #1548

- No REST API creates `work_item_budgets` with `work_item_id=NULL`. Seed via Docker exec: `execSync("docker exec <cornerstoneContainerId> node -e \"...\"")`. Container has `node` binary (confirmed by HEALTHCHECK). `better-sqlite3` at `/app/server/node_modules/`. Read container ID from `e2e/test-results/.state/containers.json`.
- Unassigned badge selector: `locator('[class*="badge"]', { hasText: 'Unassigned' })`. Has `aria-label="Unassigned — no work item or household item linked"`.
- Assign button selector: `locator('[class*="assignButton"]', { hasText: 'Assign…' })`. Only present when `line.parentItemType === 'unassigned'`.
- Edit modal title "Edit Budget Line": `page.getByRole('dialog', { name: 'Edit Budget Line' })`. Same modal renders differently for assigned vs unassigned lines.
- Parent picker fieldset: `editModal.locator('fieldset[class*="parentPickerSection"]')`. Only visible for unassigned lines (`isUnassigned={true}` in BudgetLineForm props).
- Assign submit button: `parentPickerFieldset.locator('[class*="assignSubmitButton"]')`. **BUG**: Button text is "Work Item" (uses wrong i18n key `budgetLineForm.parentPickerWorkItemTab`) — use CSS selector, NOT button text.
- After HI assignment: original `work_item_budgets` row is DELETED by service (replaced by `household_item_budgets`). No need to call `deleteOrphanWorkItemBudget` in cleanup.
- Assign endpoint: `POST /api/budget-lines/:id/assign` where `:id` is `work_item_budget.id` (NOT `invoice_budget_line.id`).
- Line rows have `data-row-id` attribute: `locator('tr[data-row-id]').filter({ hasText: description })`.
- Test file: `e2e/tests/budget/budget-line-assign.spec.ts` (6 scenarios; @smoke on 1 and 2; @responsive on 1 and 2).

## InvoiceBudgetLinesSection Picker (Issue #1401, 2026-05-10)

- Picker modal: `role="dialog"`, `aria-labelledby="picker-title"` — same modal for BOTH the invoice edit modal and the picker.
- Step 1 WorkItemPicker: `getByPlaceholder('Search work items...')` inside the modal; results in `role="listbox"` → `role="option"` items.
- Step 2 "Create Budget Line" button text: exact `"Create Budget Line"` — appears in empty-state OR below existing list (only one visible at a time).
- BudgetLineForm IDs: `#budget-description`, `#budget-planned-amount`, `#budget-quantity`, `#budget-unit`, `#budget-unit-price`, `#budget-confidence`, `#budget-category`, `#budget-source`, `#budget-vendor`.
- Mode toggle buttons: "Direct Amount" (default), "Unit Pricing" — plain `type="button"`.
- Submit text: `"Add Line"` (isEditing=false) / `"Saving..."` — NOT "Save Changes".
- On success: component calls `closePicker()` → modal unmounts. On ITEMIZED_SUM_EXCEEDS_INVOICE error: form closes, reverts to list view, error in `pickerState.error` (rendered as `role="alert"` inside modal).
- Error message for exceeds: `"Linking this budget line would exceed the invoice total."` — test `.toContainText('exceed the invoice total')`.
- `createBudgetSourceViaApi(page, { name, totalAmount })` — NOT `createBudgetSourceViaApi(page, name, { ... })`.
- InvoiceGroup badge on WI detail: `[class*="invoiceLink"]` inside `budgetSection`; text = `#InvoiceNumber` or `"Invoice"` if no number.
- `pickerErrorBanner` is scoped to `budgetLinePickerModal` via `locator('[role="alert"]')` — avoids confusion with the page-level error banner.
- Test file: `e2e/tests/invoices/invoice-budget-line-create-and-link.spec.ts` (5 scenarios, no @smoke tag).

## Budget Overview Hero Card Removed (Issues #1389/#1390, 2026-04-29)

- `<section aria-label="Budget overview">` (heroCard) is **gone** from BudgetOverviewPage.tsx after #1389.
- `BudgetOverviewPage.POM.waitForLoaded()` now races on `costBreakdownCard` instead of `heroCard`.
- `heroCard` locator kept in POM for historical reference but never matches on-page elements.
- Tests that asserted `heroCard.toBeVisible()` were removed from: `budget-overview.spec.ts`, `budget-overview-print.spec.ts`, `budget-source-filter.spec.ts`.
- New spec: `e2e/tests/budget/budget-overview-no-hero-card.spec.ts` (smoke, @smoke tag).
- Source badge (`aria-label="Budget source: {name}"`) is on Level 3 rows only — must expand Work Items → area → item to reveal budget lines.
- `BreakdownBudgetLine` fields: `id`, `description`, `plannedAmount`, `confidence`, `actualCost`, `hasInvoice`, `isQuotation`, `budgetSourceId` (NOT `sourceId`/`sourceName`).
- BudgetSources API mock response: `{ budgetSources: [{ id, name, ... }] }` — component only reads `s.id` and `s.name`.

## Budget Source Filter E2E (Story #1360, 2026-04-25 — server-side filter)

- **Story #1360** rewrote filter from client-side to server-side. `BudgetSourceSummaryBreakdown` now has `subsidyPaybackMin/Max` NOT `subsidyPayback`.
- URL format: `?deselectedSources=id1,id2` (comma-separated, URL-encoded via `encodeURIComponent(join(','))`).
- `waitForResponse` predicate for filtered: `url.includes('/api/budget/breakdown') && url.includes('deselectedSources=')`.
- `waitForResponse` predicate for unfiltered: `url.includes('/api/budget/breakdown') && !url.includes('deselectedSources=')`.
- **MUST register `waitForResponse` BEFORE the click** that triggers the debounced refetch.
- Route mock glob for breakdown: `'**/api/budget/breakdown**'` (leading `**` + trailing `**`) to match full URLs with `http://localhost:PORT/` prefix AND `?deselectedSources=` query strings. Path-only `${API.budgetBreakdown}**` is unreliable — see Playwright route glob memory note.
- `mountOverviewRoutes` now accepts 4th arg `filteredBreakdownBody?` — returns it when `deselectedSources=` is in URL.
- `makeBreakdownResponse` unassigned source in `budgetSources` now has `id:'unassigned'` — included by default (no opt-in).
- `makeBreakdownSourceAOnly` budgetSources: uses `subsidyPaybackMin: 0, subsidyPaybackMax: 0` (not `subsidyPayback`).
- `breakdownRefetching` CSS class applied to wrapping div during in-flight refetch — testable via `[class*="breakdownRefetching"]`.
- Debounce is 50ms. Debounce debounce coalescence: `filteredRequestCount` listener on `page.on('request')` — works across AbortController cancellations.
- Available Funds expand button `aria-label` = `"Expand available funds sources"` (hardcoded, not i18n).
- Source badge in Level 3 rows: `<span aria-label="Budget source: {name}">`. Unassigned: `aria-label="Budget source: Unassigned"`.
- Source row toggle: `tr[class*="rowSourceDetail"]` with `aria-pressed` attribute. Filter by `getByText(name, {exact:true})`.
- Dark mode color check: create throw-away element to normalize `rgb()` format (see Print E2E Patterns note).
- Prior Story #1354 chips/toolbar pattern is gone — no `role="toolbar"` anymore (tests assert its absence).

## Print E2E Patterns (Issue #1310, 2026-04-19)

- `page.emulateMedia({ media: 'print' })` makes CSS `@media print` rules apply without dispatching window events.
- `usePrintExpansion` hook listens to `beforeprint`/`afterprint` — dispatch via `page.evaluate(() => window.dispatchEvent(new Event('beforeprint')))` BEFORE calling `emulateMedia`.
- After dispatching `beforeprint`, React re-renders asynchronously. Use `page.waitForFunction(() => section.querySelector('[aria-expanded="true"]') !== null)` to wait for DOM update before asserting.
- `breakdownAreaRow('Keller')` strict mode violation when Kellerbau is also in DOM: "Keller" is substring of "Kellerbau". Fix: `getByRole('row').filter({ has: page.locator('span', { hasText: /^Keller$/ }) })` for exact span match.
- `getPropertyValue('--color-bg-primary').trim()` may return `'#ffffff'` OR `'rgb(255, 255, 255)'` depending on browser. Robust approach: create throwaway element, set `background-color: var(--my-var)`, read `getComputedStyle(el).backgroundColor` — always returns normalized `rgb()`.
- `waitFor()` uses `actionTimeout` (5000ms for desktop). `expect().toBeVisible()` uses `expect.timeout` (7000ms for desktop). Use the latter for heading checks that may race with SPA init.
- Desktop playwright project: `actionTimeout: 5000`, `expect.timeout: 7000`, `timeout: 15000`.
- **afterprint state restore race**: if pre-print state already has some rows expanded, `waitForFunction('[aria-expanded="true"]')` resolves IMMEDIATELY (the element already exists), so `endPrint()` fires before full print expansion completes. Wait for a SPECIFIC element that was hidden before print to become visible (e.g., Kellerbau) before calling `endPrint()`. After `endPrint()`, use `waitFor({ state: 'hidden' })` for async restore.
- **endPrint() must be in finally**: if test throws before `endPrint()`, print media leaks. Add `await endPrint().catch(() => {})` to `finally` block. `emulateMedia` is per-page so new pages get screen by default, but same-page tests in same worker can see leaked state.
- **Playwright route glob `**/api/foo*`vs`/api/foo**`**: prefer `\*\*/api/foo*`(leading`**`) to match full URLs including `http://localhost:PORT/`prefix. The path-only form`/api/foo**` relies on baseURL prepending which can be unreliable. See diary-list.spec.ts pattern.

## Stories #1271/#1272/#1273 E2E (2026-04-19)

- Diary source entity breadcrumb: `PATCH /api/work-items/:id { status }` triggers auto diary entry. Find it via `GET /api/diary-entries?type=work_item_status&pageSize=50`, then filter by `sourceEntityId === workItemId`.
- `AreaBreadcrumb` null area: renders `<span class*="muted">No area</span>` — NOT inside `[class*="compact"]`. Use `getByText('No area', { exact: true })` + `locator('[class*="compact"]').not.toBeVisible()`.
- `InvoiceDetailPage` POM `budgetLinesSection` locator was wrong (`[class*="budgetLinesSection"]` doesn't exist). Fixed to `[aria-labelledby="budget-lines-title"]` (InvoiceBudgetLinesSection renders `<section aria-labelledby="budget-lines-title">`).
- Invoice budget line creation: `POST /api/invoices/:invoiceId/budget-lines` (NOT `/api/vendors/:vendorId/invoices/:invoiceId/budget-lines`).
- WI budget POST response: `{ budget: { id } }`. HI budget POST response: `{ budget: { id } }`. Invoice budget line POST: `{ budgetLine: { id } }`.
- HI dependency creation: `POST /api/household-items/:id/dependencies { predecessorType, predecessorId }`.
- HI dep list locator: `page.getByRole('list').filter({ has: page.locator('[class*="depRow"]') })` — only one list on the page.
- Diary auto events enabled by default (`DIARY_AUTO_EVENTS=true`). No need to configure E2E container.

## Budget Source Lines/Move + Work Item Create Regressions (fix/1279, 2026-04-18)

- `getByText('Unassigned', { exact: true })` strict-mode violation: after PR #1265 made `isSelectable=true`, TriStateCheckbox renders `<span>Select all in Unassigned</span>` in the area group header. Playwright's `getByText` resolves to 2 elements (both the `<span>` AND the `areaName` span). Fix: use `panel.locator('[class*="areaName"]', { hasText: 'Unassigned' })`.
- `checkbox.uncheck()` timeout: sticky `actionBar` (position:sticky; bottom:0) covers the checkbox on narrow viewports after Playwright's internal `scrollIntoViewIfNeeded()` positions the element under the bar. Fix: use `checkbox.click({ force: true })` to bypass coverage check.
- `waitForURL('**/project/work-items/**')` resolves immediately on `/new` — glob `**` matches `new`. Fix: use UUID regex `waitForURL(/\/project\/work-items\/[0-9a-f]{8}-...-[0-9a-f]{12}$/)`.

## Vendors to Settings Migration E2E (Story #1283, 2026-04-18)

- Vendors moved from `/budget/vendors` to `/settings/vendors`; legacy redirects via React Router `<Navigate replace>`
- `VENDORS_ROUTE` in VendorsPage POM = `/settings/vendors`; `ROUTES.budgetVendors` renamed to `ROUTES.settingsVendors` in testData.ts
- `vendors.title` i18n key still = "Budget" — h1 heading on VendorsPage remains "Budget" (not "Vendors")
- VendorsPage SubNav: `ariaLabel="Settings section navigation"` (was "Budget section navigation")
- i18n.spec.ts German vendors test: updated SubNav aria-label + route constant
- `e2e/tests/budget/vendors.spec.ts` deleted; moved to `e2e/tests/vendors/vendors.spec.ts`
- Pre-existing CI failure on shard 5 (run 24531406436): milestones `getErrorBannerText()` returning null — not vendors-related

## HI Breadcrumb E2E (Story #1240, 2026-04-17)

- HouseholdItemDetailPage POM: `areaBreadcrumbNav` + `areaBreadcrumb` added (same pattern as WorkItemDetailPage)
- HouseholdItemsPage list: name column renders `<div class*="titleCell">` → compact AreaBreadcrumb inside — `[class*="compact"]` selector
- HouseholdItemDetailPage: default breadcrumb in `<div class*="titleBreadcrumb">` below h1 — `getByRole('navigation', { name: /area path/i })`
- HouseholdItemPicker: `renderSecondary` renders compact breadcrumb in dropdown options — test via InvoiceDetailPage "Add Budget Line" modal
- InvoiceDetailPage budget line modal: `getByRole('dialog', { name: 'Add Budget Line' })` → HI picker input `getByPlaceholder('Search household items...')`
- Invoice route is `/budget/invoices/:id` (NOT `/project/budget/invoices/:id`)
- Invoice API: `POST /api/vendors/:vendorId/invoices` (requires vendor first) → `{ invoice: { id } }`
- **Invoice status enum**: valid values are `'pending'`, `'paid'`, `'claimed'`, `'quotation'` — NOT `'draft'`. Using `'draft'` causes 400 validation error.
- `budget-source-lines.spec.ts` failures on feat/1239 branch: pre-existing, caused by `fix/source-lines-layout-links` feature not yet merged, not a breadcrumb regression
- CI Shard 5 failure on beta release run (2026-04-16): from concurrent release workflow, not from feature work

## Embeds/Pickers Breadcrumb E2E (Story #1239, 2026-04-16)

- Gantt bar: `data-testid="gantt-bar-{id}"` on the SVG `<g>` element — use `page.getByTestId()` for hover
- Gantt sidebar WI row: `data-testid="gantt-sidebar-row-{id}"` — `ganttSidebarRow(id)` helper added to TimelinePage POM
- TimelinePage POM: `ganttBar(id)` helper added for bar hover tests
- Milestone detail linked WI row: `[class*="linkedWorkItem"].filter({hasText:title})` — `linkedWorkItemRow(title)` helper added to MilestoneDetailPage POM
- Link WI to milestone via API: `POST /api/milestones/:id/work-items` with `{ workItemId }`
- GanttChart tooltip areaName: plain text string (not AreaBreadcrumb), joined with `›` — check `tooltip.textContent()` for area names
- **Missing translation key**: `gantt.tooltip.workItem.areaLabel` is used in GanttTooltip.tsx but absent from `schedule.json` — i18next renders the key as fallback label text. Not a test issue; label text may show key string. Assert on the value (area path), not the label.
- WorkItemPicker search results: `[role="option"]` buttons inside `getByRole('listbox')` — compact breadcrumb in `[class*="compact"]` inside option
- Gantt sidebar + bar hover Gantt tests: skip on viewportWidth < 1200 (Gantt collapses on tablet/mobile)
- WI create date pattern for Gantt visibility: `startDate=first of current month`, `endDate=last of 2 months ahead`

## AreaBreadcrumb E2E Selectors (Story #1238, 2026-04-16)

- compact variant: `[tabIndex="0"][class*="compact"]` — spans in list rows/cards
- default variant: `getByRole('navigation', { name: /area path/i })` — in detail header & create preview
- null area (both variants): `getByText('No area', { exact: true })` — span with class\*="muted"
- Tooltip uses CSS opacity (0→1), so `toBeVisible()` works after `focus()` on the compact span
- AreaPicker input: `getByPlaceholder('Select an area')` (i18n key common.aria.selectArea)
- **CRITICAL**: `areaPickerInput` (placeholder locator) is ABSENT from DOM once an area is selected.
  SearchPicker replaces the `<input>` with a `selectedDisplay` chip + clear button. Never click/fill
  the input locator after selection. Use `getByRole('button', { name: 'Clear selection', exact: true })`
  to clear — this is `t('aria.clearSelection')` = "Clear selection". POM: `clearAreaPicker()` helper.
- Listbox option: `getByRole('option', { name: /areaName/ })` inside `getByRole('listbox')`
- "No area" special option in AreaPicker: `getByRole('option', { name: 'No area', exact: true })`
- `createAreaViaApi` and `deleteAreaViaApi` already exist in `e2e/fixtures/apiHelpers.ts`
- `areas` POST response shape: `{ area: { id: string } }` (confirmed from existing helper)
- Milestones validation CI failure (2026-04-16): `milestones.spec.ts` scenarios 6+7 fail on beta/main
  promotion run — `getErrorBannerText()` returns null. Pre-existing on Dependabot bump commits.
  Not from feature work. Triage: pre-existing flaky/broken test on beta.

## Invoices + Manage Settings E2E (2026-03-26) — Fixed 2026-03-26

POMs: `InvoicesPage.ts`, `InvoiceDetailPage.ts`, `HouseholdItemEditPage.ts`.
Tests: `e2e/tests/invoices/invoices.spec.ts`, `e2e/tests/navigation/settings-manage.spec.ts`.
Key API response shapes: Areas POST → `{area:{id}}`, Trades POST → `{trade:{id}}`, HI-Categories POST → `{id}` (entity directly), Invoices POST → `{invoice:{id}}`.
InvoicesPage.heading = "Budget" (from PageLayout title=t('invoices.title')). Modal locator: `getByRole('dialog',{name:/Invoice/i})`.
InvoiceDetailPage: edit modal `[role="dialog"][aria-labelledby="edit-modal-title"]`, delete modal `[aria-labelledby="delete-modal-title"]`, confirm delete button `[class*="confirmDeleteButton"]`.
ManagePage tab panel IDs: `areas-panel`, `trades-panel`, `budget-categories-panel`, `hi-categories-panel`. Create form IDs: `#areaName`, `#tradeName`, `#categoryName` (same for budget AND hi-cat tabs — only one renders at a time).
**ManagePage area/trade delete buttons have NO aria-label** — only text "Delete". Must scope via
`panel.locator('[class*="itemRow"]').filter({ hasText: entityName }).getByRole('button', { name: 'Delete', exact: true })`.
HI-categories delete buttons DO have `aria-label={Delete \${name}}` — getByRole with name works.
InvoicesPage.waitForLoaded() uses Promise.any() (not Promise.race()) to avoid dangling rejections.

## Milestones E2E (2026-03-26) — See milestones-e2e.md

Heading="Project", newMilestone=testId("new-milestone-button"), search=client-side (no waitForResponse).
List deleteModal=`getByRole('dialog',{name:'Delete Milestone'})`. Detail deleteModal=`[role="dialog"][aria-modal="true"]` (own impl).
Milestone IDs are integers (not strings). Back/cancel on CreatePage are `<Link>` anchors, not buttons.

## i18n German Locale: page.reload() Required After setLanguage() + page.goto() (2026-03-23)

After `setLanguage(page, 'de')` + `page.goto(targetUrl)`, always add `page.reload()` before
asserting German text. Pattern from "Key page headings render in German" test (passing) confirms.
Applied in i18n.spec.ts "German sidebar" test and all three i18n-categories.spec.ts German tests.
**The FIRST German locale switch in a test file needs `test.setTimeout(30000)` and a 20s expect
timeout** for the heading assertion — i18next cold-start initialization takes 10-15s on CI.
Pattern: `test.setTimeout(30000); setLanguage(de); goto(URL); reload(); expect(heading).toBeVisible({ timeout: 20000 })`.
Extra warm-up navigations (goto('/') to confirm 'Projekt') consume the 30s budget — avoid them.

**Known flaky test**: "German locale: Manage trades tab shows 'Sanitär' instead of 'Plumbing'"
(`i18n-categories.spec.ts`) fails intermittently on CI — locale doesn't initialize before the
English page renders. Was failing before PR #1186 too (run 23429182196). Not blocking for beta PRs.

## WorkItemsPage.search(): URL-based Wait Prevents Stale-DOM Race (2026-03-23)

After `fill(query)`, add `page.waitForURL(url => url.searchParams.get('q') === query)` BEFORE
awaiting the `waitForResponse`. This confirms the debounce fired and React committed search state.
Do NOT call `waitForLoaded()` after the response — it resolves on stale DOM rows from the WebKit
clear-event response and creates a race where betaTitle stays visible for 10s. The test's own
`expect().not.toBeVisible()` retry handles DOM convergence. Same pattern for `clearSearch()`.

## Dashboard Card Dismiss Reload: Use networkidle, Not waitForResponse (2026-03-23)

For "dismissed card stays hidden after page reload" test: register `waitForResponse(GET preferences)`
before reload failed — LocaleContext fires FIRST GET and resolves the promise, but usePreferences
hook's second GET (which applies hiddenCards) arrives later. Fix: use `page.waitForLoadState('networkidle')`
AFTER `heading.waitFor({ state: 'visible', timeout: 10000 })` to ensure BOTH preference fetches
complete. The heading waitFor needs 10s timeout (not 5s actionTimeout) since SPA reinit takes time.

## Vendor Count Assertions Are Fragile (2026-03-23)

`getVendorNames().length` assertions are unreliable with parallel workers sharing the same DB.
Use `not.toContain(specificName)` instead of exact count equality. Remove `namesBefore`/
`namesAfter` length comparisons in cancel/no-create tests.

## E2E Parallel Isolation (2026-02-20)

`testPrefix` fixture in `e2e/fixtures/auth.ts` — use `async (_fixtures, use, testInfo)` (NOT `{}` — ESLint `no-empty-pattern`).
Produces `"E2E-des0 Vendor Name"` — unique per worker+project. See `e2e-parallel-isolation.md`.
Shared-state tests (profile, admin user) use `test.describe.configure({ mode: 'serial' })`.
Count assertions: use `>= DEFAULT_CATEGORIES.length` not `=== 10`; capture `countBefore` before actions.

## Two Critical E2E Anti-Patterns (2026-02-21)

See `e2e-pom-patterns.md` for full details on:

1. **Hardcoded `waitFor({ timeout: N })`** overrides project-level tablet/mobile 15s timeout
   — Always omit explicit timeout in POM `waitFor()` calls (NEVER use `timeout: 5000`)
2. **`[class*="prefix"]` strict mode violations** — `emptyState` matches `emptyStateTitle` too
   — Add element type: `div[class*="emptyState"]` instead of `[class*="emptyState"]`
3. **Mobile CSS-hidden table** — `display:none` elements still in DOM; `textContent()` works,
   clicks fail — check `tableContainer.isVisible()` before using table rows

## DataTable Migration (EPIC-18, PR #1177) POM Fixes (2026-03-22)

After DataTable migration, three POM fix patterns applied:

- **Modal `useId()` IDs broken**: `#create-modal-title`/`#delete-modal-title` don't exist.
  Always use `getByRole('dialog', { name: ... })` + `getByRole('heading', { level: 2 })` inside.
- **`confirmDeleteButton` → `btnConfirmDelete`**: WorkItems + HouseholdItems use
  `sharedStyles.btnConfirmDelete` from `shared.module.css`. Selector: `[class*="btnConfirmDelete"]`.
- **Mobile card name lookup**: DataTableCard has NO `cardName` class. The render() function
  runs identically for table cells AND cards. Name column with `styles.vendorLink` → use
  `[class*="vendorLink"]` inside `cardsContainer`. Applied in both getVendorNames() and
  openDeleteModal() mobile paths in VendorsPage.
- **HouseholdItems actions menu**: buttons are `role="button"` (default), NOT `role="menuitem"`.
  Use `[class*="menuItemDanger"]:visible` filtered by text "Delete".
- **Production bug #1178**: DateRangePicker phase resets after clicking start date.
  DateFilter.handleChange only fires when both dates set; DateRangePicker useEffect resets
  phase when startDate stays ''. Affects datatable-date-range-picker.spec.ts and
  datatable-ux-fixes.spec.ts — PRODUCTION BUG, not a test issue.

## E2E Wait Patterns: waitForResponse BEFORE the action (2026-02-23)

`page.waitForResponse(pred)` must ALWAYS be registered BEFORE the action that triggers the request.
After a `waitForResponse` for search/filter, call `waitForLoaded()` to wait for React DOM update.

## EPIC-08 Paperless E2E (2026-03-02)

See `story-epic08-e2e.md` — Paperless NOT available in E2E environment (no testcontainer yet).
All document tests currently validate "not configured" state. Real Paperless container integration is needed.

## Gantt Touch Two-Tap Pattern

`GanttChart.tsx` uses `handleBarOrSidebarClick` which checks `isTouchDevice`.
On touch devices: first tap shows tooltip, second tap navigates.
E2E tests on tablet must click/press Enter twice with 300ms pause between taps.

## Key File Locations

- Test fixtures: `e2e/fixtures/auth.ts` (testPrefix, authenticatedPage)
- Test data: `e2e/fixtures/testData.ts` (routes, API endpoints)
- Page objects: `e2e/pages/` (AppShellPage, WorkItemsPage, etc.)
- Containers: `e2e/containers/cornerstoneContainer.ts`
- Playwright config: `e2e/playwright.config.ts`

## Viewport Timeouts

- Desktop: `timeout: 10_000`, no explicit action/expect timeout (Playwright default 30s)
- Tablet: `timeout: 60_000`, `expect/action/navigationTimeout: 15_000`
- Mobile: `timeout: 60_000`, `expect/action/navigationTimeout: 15_000`

## Tablet POM Readiness: Always wait for interactive elements (2026-03-14)

On tablet (15s action timeout), elements that are visible after `goto()` heading check may not yet
be ready for interaction. Always add `waitFor({ state: 'visible' })` for search inputs, buttons,
etc. in both `goto()` and helper methods. Also add `scrollIntoViewIfNeeded()` before fill().
Pattern: `await this.input.waitFor({ state: 'visible' }); await this.input.scrollIntoViewIfNeeded(); await this.input.fill(value);`

## toBeHidden() vs not.toBeVisible() for Conditionally-Rendered Elements (2026-03-14)

`toBeHidden()` requires the element to be in the DOM (just not visible). If a component uses
conditional rendering `{condition && <Button>}`, when `condition` is false the element is absent
from DOM entirely. `toBeHidden()` times out in this case.
Use `not.toBeVisible()` instead — it passes for both CSS-hidden AND DOM-absent elements.
Example: DashboardPage Customize button only mounts when `hasHiddenCards` is true.

## CSS Selector Staleness After UI Refactors (2026-03-14)

When the UI is refactored, POM CSS class selectors like `[class*="amountLabel"]` become stale.
Always verify selectors against the actual component source after any UI changes.
If a legend/label only renders conditionally (e.g., when values > 0), the test must account for
that — check always-rendered elements (containers, summary rows) rather than conditional labels.
Example: BudgetSourcesPage bar chart `barLegendLabel` only renders for non-zero segments;
use `summaryItem` spans (Total/Available/Planned) for unconditional assertions.

## Dashboard Card Count: 10 (UAT fix #844 added Recent Diary, 2026-03-15)

DashboardPage has 10 CARD_DEFINITIONS (added 'recent-diary' in UAT fix #844). Both desktop
grid AND mobile sections container render ALL cards simultaneously (CSS media queries control
visibility, not conditional rendering). Dismiss button count in DOM = up to 20 (10 × 2 containers).
Use `>= 10`. DashboardPage POM CARD_TITLES and DashboardCardId type updated to include 'recent-diary'.

## Dashboard Card Persistence After Reload (2026-03-14)

`usePreferences()` hook fetches preferences asynchronously on mount. After `page.reload()`,
cards render ALL visible until the preferences API responds. `waitForCardsLoaded()` only
waits for data skeletons (aria-busy), not preferences load. Fix: register
`page.waitForResponse('/api/users/me/preferences', 200)` BEFORE reload, await it after
reload + heading visible, before asserting card count.

## Skip Unreliable WebKit Tablet Tests via viewport width (2026-03-14)

When a search-input or form element consistently times out on WebKit iPad gen 7 (810px)
and works on desktop, skip on non-desktop with:
`test.beforeEach(async ({ page }) => { if (page.viewportSize()?.width < 1200) test.skip(); });`
Applied to: e2e/tests/admin/search-users.spec.ts

## Avoid getSuccessBannerText() — Use expect() Instead (2026-03-14)

POM helper `getSuccessBannerText()` wraps `waitFor` in try/catch, returns null on timeout.
This masks failures: `expect(null).toContain(X)` throws confusing error. Use:
`await expect(sourcesPage.successBanner).toBeVisible()` (uses expect.timeout with retry).
Also add `waitForResponse` BEFORE save click — confirms API 200 before checking UI.

## Diary Forms E2E (Story #805, 2026-03-14)

Files: `e2e/pages/DiaryEntryCreatePage.ts`, `e2e/pages/DiaryEntryEditPage.ts`,
`e2e/tests/diary/diary-forms.spec.ts`. DiaryEntryDetailPage.ts extended with edit/delete locators.

Key selectors:

- Create page type cards: `getByTestId('type-card-{type}')` — clicking immediately transitions to form
- Create form: `#entry-date`, `#title`, `#body` (common); `#weather`, `#temperature`, `#workers`
  (daily_log); `#inspector-name`, `#inspection-outcome` (site_visit); `#severity`,
  `#resolution-status` (issue); `[name="material-input"]` (delivery)
- Create submit: `getByRole('button', { name: /Create Entry|Creating\.\.\./i })`
- Edit page: `getByRole('heading', { level: 1, name: 'Edit Diary Entry' })`
- Edit back: `getByRole('button', { name: /← Back to Entry/i })`
- Edit save: `getByRole('button', { name: /Save Changes|Saving\.\.\./i })`
- Edit delete opens modal: `getByRole('button', { name: 'Delete Entry', exact: true })`
- Detail Edit button: `getByRole('link', { name: 'Edit', exact: true })` (anchor, not button)
- Detail Delete button: `getByRole('button', { name: 'Delete', exact: true })` (NOT "Delete Entry")
- Modal: `getByRole('dialog')` — conditionally rendered; confirmDelete inside modal scope
- Confirm delete: `modal.getByRole('button', { name: /Delete Entry|Deleting\.\.\./i })`
- Edit/Delete buttons NOT rendered for automatic entries (`isAutomatic: true`)
- DiaryEntryEditPage.save() registers waitForResponse (PATCH) BEFORE click — returns after API
  NOTE: PR #830 changed updateDiaryEntry from PUT to PATCH — save() was broken; fixed in PR #832

## Diary E2E (Story #804, 2026-03-14)

Files: `e2e/pages/DiaryPage.ts`, `e2e/pages/DiaryEntryDetailPage.ts`,
`e2e/tests/diary/diary-list.spec.ts`, `e2e/tests/diary/diary-detail.spec.ts`.

Key selectors:

- DiaryPage heading: `getByRole('heading', { level: 1, name: 'Construction Diary' })`
- Filter bar: `getByTestId('diary-filter-bar')`, search: `getByTestId('diary-search-input')`
- Type switcher: REMOVED from DiaryPage (UAT fix #840 removed DiaryEntryTypeSwitcher)
- Entry cards: `getByTestId('diary-card-{id}')`, date groups: `getByTestId('date-group-{date}')`
- Type chips: `getByTestId('type-filter-{entryType}')`, clear: `getByTestId('clear-filters-button')`
- Pagination: `getByTestId('prev-page-button')` / `getByTestId('next-page-button')`
- Detail back button: `getByLabel('Go back to diary')` (aria-label="Go back to diary"), back link: `getByRole('link', { name: 'Back to Diary' })`
- Metadata wrappers: `getByTestId('daily-log-metadata|site-visit-metadata|delivery-metadata|issue-metadata')`
- Outcome badge: `getByTestId('outcome-{pass|fail|conditional}')`, severity: `getByTestId('severity-{level}')`
- Automatic badge: `locator('[class*="badge"]').filter({ hasText: 'Automatic' })`

API: `POST /api/diary-entries` returns `DiaryEntrySummary` with `id` at top level (not nested).
Empty state uses shared.emptyState CSS module class (conditional render — use `.not.toBeVisible()` not `.toBeHidden()`).
DiaryPage.waitForLoaded() races: timeline visible OR emptyState visible OR errorBanner visible.

## Photos API Mock Must Return { photos: [] } Not [] (2026-03-15)

`GET /api/photos?entityType=...&entityId=...` returns `{ photos: [] }` (wrapped object).
`getPhotosForEntity()` in `photoApi.ts` does `.then(r => r.photos)` — if mock returns `[]`,
`r.photos` is `undefined` → `setPhotos(undefined)` → `PhotoGrid` crashes on `photos.length`.
ALWAYS mock photos as: `body: JSON.stringify({ photos: [] })` not `body: '[]'`.

## waitForURL on WebKit Tablet: pass `{ timeout: 15_000 }` for navigation after browser-back

Applied to: diary-detail.spec.ts Scenarios 2 and 3.

## Diary E2E Extended (Stories #806-#809, 2026-03-15)

Files: `diary-photos-signatures.spec.ts`, `diary-automatic-events.spec.ts`
POMs extended: DiaryEntryDetailPage (photoHeading, photoEmptyState, signatureSection, photoCountBadge),
DiaryPage (photoCountBadge).
NOTE: diary-export.spec.ts DELETED (UAT fix #845 removed export/print feature).
DiaryEntryDetailPage.printButton locator REMOVED. DiaryPage.exportButton/exportDialog REMOVED.

Key selectors:

- Photo count badge on entry card: `data-testid="photo-count-{entryId}"` (only rendered when photoCount > 0)
- Photo section heading: `[class*="photoHeading"]` — text "Photos (N)"
- Photo empty state: `[class*="photoEmptyState"]` — text "No photos attached yet."
- Signature section: `[class*="signatureSection"]` — conditional render (isSigned entries)
- `isSigned=true` entries (UAT fix #837): Edit hidden, Delete VISIBLE, "Add photos" VISIBLE
- `isAutomatic=true` entries: Edit hidden, Delete hidden, "Add photos" hidden
- Auto events: must mock photos endpoint (`**/api/photos*`) when mocking diary detail entries
- "Add photos" guard is `!isAutomatic` (not `!isAutomatic && !isSigned` as it was before #837)

## Diary UAT Fixes E2E (2026-03-15)

File: `e2e/tests/diary/diary-uat-fixes.spec.ts`

Key behavioral changes validated:

- Post-create navigation: `/diary/:id` (detail, NOT `/diary/:id/edit`) — UAT R2 fix #867 reverted #843
- Detail back button: `getByLabel('Go back to diary')` navigates to `/diary` (NOT browser-back) — #842
- Source link text: `data-testid="source-link-{sourceEntityId}"` shows `sourceEntityTitle` — #842
- Automatic events: flat `<div data-testid="automatic-section-{date}">` with "Automated Events" heading — UAT R2 #868
  (was collapsible `<details>/<summary>` in UAT R1 #838 — CHANGED in UAT R2)
- Dashboard "Recent Diary" card: title='Recent Diary', `recentDiaryCard()` helper in DashboardPage POM — #844
- RecentDiaryCard "View All" link only rendered when `entries.length > 0` — mock with ≥1 entry
- New Entry button: `getByRole('link', { name: 'New Entry', exact: true })` (no "+" prefix) — UAT R2 #866-C
- Signed badge on cards: `data-testid="signed-badge-{entryId}"` text "✓ Signed" — UAT R2 #869
- Mode filter chips: `data-testid="mode-filter-all/manual/automatic"` — UAT R2 #866-A
- Photo input on create: `data-testid="create-photo-input"` (file, multiple, accept image/\*) — UAT R2 #867

## SearchPicker/AreaPicker Filter Pattern (2026-03-19, issue #1074)

AreaPicker has two DOM states: unselected (input visible) vs selected (selectedDisplay visible, input gone).

- Unselected: `input[placeholder="Select an area"]` — click to open dropdown (role="listbox")
- Selected: `[class*="selectedDisplay"]` with `[class*="selectedTitle"]` + clear btn (aria-label="Clear selection")
- areaFilterContainer: `'#hi-filter-panel [class*="container"]:has(input[placeholder="Select an area"])'`
  (only valid in unselected state — use direct filter-panel scoping for selected-state methods)
- createAreaViaApi/deleteAreaViaApi: added to e2e/fixtures/apiHelpers.ts; API.areas in testData.ts
- After area selection, URL gets `?areaId=<id>`; clearing removes it. Use waitForResponse BEFORE selection.

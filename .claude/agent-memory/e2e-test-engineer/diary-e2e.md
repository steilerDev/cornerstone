---
name: diary-e2e
description: Diary feature E2E patterns — POM selectors, API shapes, draft/photo/signature flows, mode-filter behavior, and story-by-story history. Consult before writing or fixing any e2e/tests/diary/*.spec.ts test.
metadata:
  type: project
---

## Diary default filter mode = 'manual' (fix/1781, 2026-06-22) — `diary-r2-uat.spec.ts`, `diary-list.spec.ts`

- Default mode chip changed from `all` → `manual`. Test renamed: `'"Manual" mode chip is aria-pressed=true by default (no filterMode URL param)'`. Assertions flipped: `allChip` → `false`, `manualChip` → `true`, `automaticChip` → `false`.
- New Scenario 12 `@smoke` in `diary-list.spec.ts`: navigates to `/diary`, asserts Manual pressed, captures initial API request and verifies `type` param includes `daily_log`.
- See known-flakes-and-regressions.md for the shard-3 flake this area still exhibits post-fix.

## Diary Mobile Filter Panel E2E (Bug #1688, 2026-06-15) — `diary-mobile-filters.spec.ts`

6 scenarios, all `@responsive`. Mobile-only (1–5): `if (viewportWidth > 767) test.skip()` (MOBILE_MAX_WIDTH=767 matches CSS). Desktop/tablet-only (6): inverse. POM reused: `DiaryPage.mobileFilterToggle`, `.searchInput`, `.openFiltersIfCollapsed()`. Mode chip test-ids: `mode-filter-all/manual/automatic`. No API mocking.

## Daily Log Time+Vendor E2E (Story #1672, 2026-06-13) — `diary-daily-log-time-vendor.spec.ts`

- `createVendorViaApi`/`deleteVendorViaApi` in `apiHelpers.ts` (POST/DELETE `/api/vendors`, `{vendor:{id}}`).
- DiaryEntryEditPage POM: `dailyLogVendorSearch` (`#daily-log-vendor`), `dailyLogVendorClearButton` (`Clear selection`), `workStartTimeInput`/`workEndTimeInput` (`#work-start-time`/`#work-end-time`), `workDurationDisplay` (`[role="status"][aria-atomic="true"]`, unique on page), `workTimeValidationError` (`#work-time-error`).
- Vendor SearchPicker: no `initialTitle` passed on this page — always shows the search input (never selectedDisplay), even with a pre-saved vendorId. Portal dropdown in `document.body`.
- Duration display stale-read race on WebKit: `await expect(workDurationDisplay).not.toHaveText('0.00 h')` BEFORE `textContent()` (async `useMemo`).
- Validation blocking save (Scenario 3, end ≤ start): click `submitButton` directly, NOT `editPage.save()` (which waits for a PATCH that never fires).

## Diary Scenario 14 flake — root-caused fix (2026-06-16) — `diary-drafts.spec.ts:846`

Root cause: `toBeVisible({timeout:15_000})` timed out when `GET /api/diary-entries/:id` exceeded 15s under CI load; `test.slow()` triples `expect.timeout` but the explicit `{timeout:15_000}` override defeated that. Fix: register `page.waitForResponse` BEFORE `entryCard.click()` (match `resp.url().endsWith('/api/diary-entries/${draftId}')`), await after `waitForURL`, then assert with `{timeout:45_000}`. Pattern: always register `waitForResponse` before the triggering click. **Recurred with a different signature on 2026-07-07** — see known-flakes-and-regressions.md.

## Photos API mock shape

`GET /api/photos?entityType=...&entityId=...` returns `{ photos: [] }` (wrapped), never a bare `[]` — `getPhotosForEntity()` does `.then(r => r.photos)`, so a bare-array mock produces `undefined` and crashes `PhotoGrid` on `.length`.

## Diary Draft E2E (Fix #1426, UX #1435/#1446, 2026-05-17) — `diary-drafts.spec.ts` (18 scenarios + 1 sub-test; smoke on 1,9,12)

- **#1435 BREAKING**: DiaryEntryCreatePage has no form step anymore — type-card click POSTs immediately and navigates to `/diary/:id/edit`. Removed from POM: bodyTextarea, entryDateInput, titleInput, weatherSelect, temperatureInput, workersInput, inspectorNameInput, outcomeSelect, vendorInput, deliveryConfirmedCheckbox, materialInput, addMaterialButton, severitySelect, resolutionStatusSelect, cancelButton, backToTypeButton.
- **#1446**: status filter → `draftsChip` (`data-testid="status-filter-drafts"`, `aria-pressed`). Default `true` (all shown); click → `false` (`?status=saved`). Use `toHaveAttribute('aria-pressed', ...)` + `.click()`, never `.check()/.uncheck()`.
- PhotoCard: `data-testid="photo-card-{id}"`, wrapped in `role="list" aria-label="Photos"`.
- Draft badges: `draft-status-badge` (edit page), `draft-badge-{id}` (list card). Autosave indicator: `autosave-status` (only when `saveStatus !== 'idle'`).
- Discard Draft button/modal: `"Discard Draft"` exact text; modal `aria-labelledby="discard-modal-title"`, confirm `"Discard Draft"`, cancel `"Keep Draft"`. Delete modal is separate: `aria-labelledby="delete-modal-title"`.
- Promote endpoint: `PATCH /api/diary-entries/:id/promote`. Submit button: "Save" (draft) / "Save Changes" (saved). Draft card → `/diary/:id/edit`; saved card → `/diary/:id`.
- Dashboard fetches diary with `status=saved` — match `url.includes('status=saved')`.
- `createDraftDiaryEntryViaApi(page, {entryType})` — POST `status:'draft'`, server defaults entryDate=today, body=''.
- Photo upload API: XHR to `${getBaseUrl()}/photos`, response `{ photo: {...} }` (wrapped). Release all `uploadHolds` BEFORE `page.unroute()` (unrouting with pending handlers → unhandled rejections).
- Photo-immediate-appearance sub-test (Scenario 6): must mock both `POST /api/photos` AND `GET **/api/photos?entityType=diary_entry&entityId={id}` (the `onUpload` refresh refetches). `page.unrouteAll()` in finally.
- `create-photo-input` testId is GONE post-#1435; only `photo-file-input` (edit page) exists now.

## Diary Forms E2E (Story #805, 2026-03-14) — `diary-forms.spec.ts`

- Create type cards: `type-card-{type}`. Create fields: `#entry-date`,`#title`,`#body` (common); `#weather`,`#temperature`,`#workers` (daily_log); `#inspector-name`,`#inspection-outcome` (site_visit); `#severity`,`#resolution-status` (issue); `[name="material-input"]` (delivery).
- Edit page h1 "Edit Diary Entry"; back button `/← Back to Entry/i`; save `/Save Changes|Saving\.\.\./i`; delete opens modal via `'Delete Entry'` exact.
- Detail page: Edit is an anchor `getByRole('link',{name:'Edit',exact:true})`; Delete is `getByRole('button',{name:'Delete',exact:true})` (NOT "Delete Entry"). Modal confirm: `/Delete Entry|Deleting\.\.\./i`.
- Edit/Delete hidden for automatic entries (`isAutomatic:true`).
- `updateDiaryEntry` is PATCH (not PUT, since PR #832) — `save()` POM registers `waitForResponse(PATCH)` before click.

## Diary E2E (Story #804, 2026-03-14) — `diary-list.spec.ts`, `diary-detail.spec.ts`

- Heading "Construction Diary". Filter bar `diary-filter-bar`, search `diary-search-input`. Type switcher REMOVED (UAT #840). Entry cards `diary-card-{id}`, date groups `date-group-{date}`. Type chips `type-filter-{entryType}`, clear `clear-filters-button`. Pagination `prev-page-button`/`next-page-button`.
- Detail back: `getByLabel('Go back to diary')` (aria-label). Metadata wrappers `{type}-metadata`. Outcome badge `outcome-{pass|fail|conditional}`, severity `severity-{level}`. Automatic badge: `[class*="badge"]` filtered by text "Automatic".
- `POST /api/diary-entries` → `DiaryEntrySummary` with `id` top-level. Empty state = shared CSS module class (conditional — use `.not.toBeVisible()`).

## Diary E2E Extended (Stories #806-#809, 2026-03-15)

- `diary-export.spec.ts` DELETED (UAT #845 removed export/print). `printButton`/`exportButton`/`exportDialog` locators removed from POMs.
- Photo count badge on card: `photo-count-{entryId}` (only when count > 0). Photo heading `[class*="photoHeading"]` "Photos (N)". Empty state `[class*="photoEmptyState"]`. Signature section `[class*="signatureSection"]` (conditional, isSigned).
- `isSigned=true`: Edit hidden, Delete visible, "Add photos" visible. `isAutomatic=true`: Edit/Delete/Add-photos all hidden. Auto events: must mock `**/api/photos*` alongside diary detail.

## Diary UAT Fixes E2E (2026-03-15) — `diary-uat-fixes.spec.ts`

- Post-create nav → `/diary/:id` detail (UAT R2 #867 reverted #843). Back button `getByLabel('Go back to diary')` → `/diary` (not browser-back, #842). Source link `source-link-{sourceEntityId}` shows `sourceEntityTitle`.
- Automatic events: flat `automatic-section-{date}` div "Automated Events" heading (UAT R2 #868, was collapsible `<details>` in R1 #838).
- Dashboard "Recent Diary" card (`recentDiaryCard()` POM helper, #844); "View All" link only when entries.length>0.
- New Entry button: `'New Entry'` exact (no "+" prefix, R2 #866-C). Signed badge `signed-badge-{entryId}` "✓ Signed" (#869). Mode chips `mode-filter-all/manual/automatic` (#866-A).

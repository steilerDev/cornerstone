---
name: document-linking-and-photos-e2e
description: E2E patterns for document-linking (Paperless), photo picker/upload/annotation flows, and orientations. Consolidated from dated notes 2026-05 through 2026-06.
metadata:
  type: project
---

See also `photo-annotator-e2e.md` for the Konva canvas annotator rewrite details.

## Photo Picker Hierarchy E2E (Issue #1723, 2026-06-16) — `photo-picker-hierarchy.spec.ts`, `PhotoViewerPage.ts`

- 8 scenarios, all `@responsive`, Scenario 1 also `@smoke`.
- AreaPicker `renderItem`: `{label: indent + area.name}`, indent = `'— '.repeat(depth)`. `renderSecondary`: `getAncestorPath(areas,id)` → `'FloorName › WingName'`; empty for top-level (POM converts `''`→`null`).
- OrientationPicker `renderSecondary`: `o.description ?? null`. Server search matches name OR description.
- AreaPicker `initialTitle` = bare selected area name (not the indented label) — selectedDisplay chip shows bare name.
- `selectedDisplay` scope: `label[for="photo-area"]` + `xpath=..` → parent `.section` div → `.areaPicker .selectedDisplay` (avoids brittle `.first()/.last()`).
- `createOrientationViaApi`/`deleteOrientationViaApi` exported from `apiHelpers.ts`.
- `uploadPhotoViaApi` returns `null` if photo storage not configured — tests `test.skip()` gracefully.
- `searchTree` (areaTreeUtils): empty query → full tree; non-empty → direct matches + all descendants; leaf-name search returns ALL leaves with that name across floors.

## SearchPicker mobile anchor regression (Issue #1708, 2026-06-16) — `responsive/search-picker-mobile.spec.ts`

- Scenario 1 (`@responsive`, mobile-only <500px): focuses AreaPicker on WorkItemCreate, asserts `[data-search-picker-dropdown]` visible, `Math.abs(dropdownBox.y - inputBottom) < 20`.
- Scenario 2: `test.skip(true)` — no lightweight modal+picker fixture; covered by SearchPicker.test.tsx unit test.
- AreaPicker `showItemsOnFocus={true}` → dropdown opens on `.click()`, no typing needed. Closes after option click (`not.toBeVisible()`). See `searchpicker-mobile-1708.md` for full context.

## Overlay Unlink Button E2E (fix/1680, 2026-06-15) — `documents/document-linking.spec.ts`

- `mockDocumentLinkDelete(page)`: registers `**/api/document-links/*`, DELETE-only, empties module-level `linkedDocumentIds` so GET refetch returns empty. Returns async cleanup `page.unroute(...)`.
- Pre-seed linked doc: `mockPaperlessForLinking(page,'work_item',id)` then set `linkedDocumentIds = [MOCK_DOCUMENT.id]` BEFORE navigation.
- Desktop hover: `card.hover()` THEN `expect(unlinkOverlayButton).toBeVisible()` (opacity:0 until hover). **CSS hover-only buttons need `click({force:true})`** — pointer-events actionability check races with CSS hover propagation on CI Linux runners.
- Unlink modal: `getByRole('dialog',{name:'Unlink Document?'})`, confirm `/^Unlink$/i`, cancel `/^Cancel$/i`. After confirm, the whole `linkedList` (`role="list" aria-label="Linked documents"`) hides (renders null at 0 links).
- Mobile scenario: tag on the TEST not the describe; button visible via `@media (hover:none)` CSS, no hover needed.
- Cleanup order: `cleanupDelete()` → `cleanupMocks(page)` → delete WI via API. `mockDocumentLinkDelete` must NOT unroute the GET route (owned by `mockPaperlessForLinking`).

## Document Linking System-wide Hide E2E (Story #1557, 2026-05-22) — `document-linking.spec.ts` Scenarios 7a/7b

- `mockSystemLinkedIds(page, ids)` intercepts `GET **/api/document-links/linked-ids` → `{paperlessDocumentIds: ids}`; unroute separately in finally.
- "Hide already-linked documents" checkbox only renders when `linkedDocumentIds.length > 0` — mock must return non-empty. Label: `getByRole('checkbox',{name:/hide already-linked documents/i})`.
- Picker modal: `getByRole('dialog',{name:'Add Document'})`. `cleanupMocks` does NOT unroute `linked-ids` — call separately.

## Orientations + Mobile Photo Capture E2E (Story #1674, 2026-06-15) — `orientations.spec.ts`, `photo-capture-flow.spec.ts`, `OrientationsPage.ts`

- `ManagePage` has 5 tabs (added Orientations). Panel id `orientations-panel`. Create h2 "Create orientation" (not "Create New Orientation" — unlike Areas/Trades/HI). Edit aria-label `"Edit {name}"`, delete `"Delete {name}"`.
- Orientations API: POST `{orientation:{id}}`, PATCH 200, DELETE 204 (no shared apiHelpers yet).
- PhotoUpload touch detection: `matchMedia('(hover: none)')`. iPhone/iPad Playwright devices → touch UI; desktop Chrome → hover UI. Use `viewportSize().width <= 1024` as touch-device proxy.
- Hidden file inputs (`photo-camera-input`,`photo-library-input`,`photo-file-input`) always in DOM regardless of viewport — `getByTestId().setInputFiles()` bypasses visible buttons.
- PhotoMetadataModal: accessible name "Add photo details". Description `#modal-photo-caption`. OrientationPicker placeholder "Select an orientation" (exact match, not `*=`).
- Bug #1675 FIXED: `emptyHint` now shows regardless of `specialOptions` (SearchPicker's emptyHint branch doesn't gate on it).
- **CRITICAL RACE**: `uploadSinglePhoto` removes the queue entry from state IMMEDIATELY after `onUpload()` resolves (not after 2s as a stale comment claimed). With an instant mock, the entry vanishes before Playwright can assert it — use a `mockUploadWithDelay` helper (400ms `setTimeout` on the mocked POST) to keep it in `'uploading'` state long enough.
- DiaryEntryDetailPage has NO h1 for titleless entries (`general_note` drafts) — wait for `role=heading level=2 name=/Photos/` instead.
- Photo upload mock response must include ALL `Photo` fields: `originalFilename` (not `filename`), `fileUrl` (not `url`), `width`,`height`,`takenAt`,`sortOrder`,`createdBy`,`updatedAt`,`annotatedAt`.
- `page.route((url: URL) => ...)` predicate takes a `URL` object directly — use `.pathname`/`.searchParams` without re-wrapping in `new URL()`.
- PhotoCard click target is a nested `<button aria-label="View photo: ...">` — click that, not the whole card div.
- `diary-drafts` `photo-upload-zone` testid only exists on non-touch (desktop) layout; touch devices render `mobileButtonPair` instead — branch assertions on `viewportWidth <= 1024`.
- **Shard 6 root cause (PR #1676)**: `route.fulfill: Route is already handled!` — the 400ms delayed `mockUploadWithDelay` setTimeout races `page.unrouteAll()` in cleanup. Fix: wrap `route.fulfill()`/`route.continue()` in `.catch(() => {})`.

## OrientationsTab E2E coverage (fix #1687, 2026-06-15)

Comprehensive 8-scenario spec already exists in `e2e/tests/orientations.spec.ts` (not under `navigation/`) — covers CRUD, dark mode, sort order, tab nav, empty state. `getOrientationRow()` uses `[class*="itemName"]` (stable regardless of row-level CSS class). `?tab=orientations` deep-link covered in `settings-manage.spec.ts`.

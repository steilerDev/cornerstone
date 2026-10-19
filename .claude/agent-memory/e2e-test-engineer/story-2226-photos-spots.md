---
name: story-2226-photos-spots
description: '#2226 Photos spots / No area group / viewer E2E: POM APIs, test ids, phone sheet rules, D-31 defects.json move, live-run traps.'
metadata:
  type: project
---

- POMs: `PhotosPage` (`noAreaToggle`, `selectionBar`, `setTagsButton`, `selectTile(id)` = `label[data-testid=no-area-photo-<id>]` (locked tile is a `div` with no checkbox), `bulkDialog` by role+name, `bulkPick(label, option)` clears the "Leave as is" chip first, `areaLink(id)` = `area-link-<id>`, `areaHeading()` tolerates the sr-only ", open in Areas"). `PhotoSpotViewerPage` (details testids are `spot-viewer-details-panel-*`, `openDetails()` / `openTagsEditor()` / `pickInEditor()`). `PhotoViewerPage` (entry page): sidepanel API removed -> `detailsPanel`, `detailsButton` (phones only), `openDetails()`, `openTagsEditor()`, `saveTags(photoId)`, `closeDetailsIfPhone()`, `pickInEditor()`.
- Phones (< 768px): the details panel (date, area, orientation, caption, diary link, history list, Edit tags) exists in the DOM ONLY while the Details sheet is open; call `openDetails()` before any panel assertion. `closeDetailsIfPhone()` before touching the stage again (spot viewer: Escape; entry viewer: Close button, see below).
- An area link's accessible name is "NAME , open in Areas" (a space before the comma: the hidden suffix is a separate element) -> match with `\s*`, never an exact string.
- `/photos/spot/none/none` = the No area group (D-31): N is global over the shared DB, never assert it; assert `historyItem(ourPhotoId)`. Every No-area cell links to the group, so the old "none/<o> is a spot" assertions are gone. While select mode is on, the No area row/section is replaced by the tile grid (no `spot-cell-none:*` then).
- SearchPicker with a chosen value shows a chip + "Clear selection" and NO input (also the bulk dialog's "Leave as is" chips): click Clear first, then the input.
- Signed photo fixture: draft with `metadata.signatures` + photo, then `PATCH /api/diary-entries/:id/promote`.
- `plan/restructure/defects.json`: D-31 moved from `later` to `defects` (story 2226, tests = PhotoSpotViewerPage.test.tsx + photo-browser.spec.ts; both files must contain the literal `D-31`).
- Live run: image `pwrun2224.sh` (playwright 1.64.1) after `docker build` from a node_modules-free copy; a production type error (`body.photoIds[0]` string|undefined in server/src/routes/photos.ts) broke the image build -> built a patched copy (`!`) in the ctx dir only.
- Phone chrome hiding is `opacity:0` + `pointer-events:none` (stays focusable by design), NOT visibility:hidden: assert `toHaveCSS('opacity', ...)`, never `toBeHidden()`.
- The phone Details sheet is modal: arrows behind it are not clickable until it is closed. Close it with its "Close dialog" button (`photo-viewer-details-sheet`), not Escape: Escape in the entry-page PhotoViewer sheet used to close the viewer too (fixed: shared useFocusTrap preventDefault; guard = photo-capture-flow AC2).
- A phone spot viewer has no shell bars: phase1-exit X3a (search button) special-cases `photoSpot` (Back, then the Photos top bar).
- Seen once, not reproducible (0/31 repeats): tablet WebKit Edit tags focus-return race (rAF before commit); WebKit `page.goto` interrupted/timeouts in full runs (E4 mobile, settings-manage tablet) are infra flakes.

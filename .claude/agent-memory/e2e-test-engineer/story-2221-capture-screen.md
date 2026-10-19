---
name: story-2221-capture-screen
description: #2221 capture screen POM/specs, tap counter, sandbox arm64 media crash + stubs, shutter cooldown, 3 live-run production defects
metadata:
  type: project
---

POM `e2e/pages/DiaryCapturePage.ts` (API listed at the top of the file); specs `e2e/tests/diary/capture-{screen,benchmark,camera,camera-chromium,persistence}.spec.ts`; fixtures `capturePhotos.ts` (zlib PNGs), `captureSeed.ts` (CaptureSeed cleanup, seedRecentTags, photosTagged), `fakeCamera.ts`.

- Tap counter: every intent goes through `tap()`; `chooseFromLibrary` = 2 taps (button + native confirm). Measured: library path 6, viewfinder path 11 (all three projects).
- **arm64 headless Chromium shell crashes ("Target crashed")** when a canvas `captureStream` track is stopped and as soon as `--use-fake-device-for-media-stream` plays (bare-page repro, no app code). The stub no-ops `track.stop`; the Chromium fake-device spec skips on non-x64 (CI x64 unverified). `launchOptions` via `test.use` must be file-level, so the Chromium spec is its own non-@responsive file.
- Shutter ignores presses within 150 ms: `shoot()` retries inside `toPass`.
- Chips only show the 4 recent areas / first orientations: seed `localStorage cornerstone.capture.recentAreas.<userId>` in an init script.
- Native camera input is single-file; Failed tile needs a non-retryable status (400); 5xx auto-retries 2/5/15 s.
- Error panel covers the top-bar Done: use the panel's own Done.
- Production defects found live: tag chip tapped during an in-flight upload is lost (engine reads tags at request start); "New area" creates the area but the chip is not shown/pressed (areas list stale); Keep editing returns focus to the tapped chip, not the pressed type chip.

## E2E-2 migration of the retired diary form (2026-10-19)

- `DiaryEntryCreatePage`/`DiaryEntryEditPage` deleted; ~16 specs moved onto `DiaryCapturePage` (diary-forms/drafts/photos-signatures/photo-metadata-persistence/uat-fixes/daily-log-time-vendor/r2-uat/automatic-events, company-create/pickers-search, confirm-dialog, status-menu, page-identity-*, dashboard, i18n, photo-capture-flow). Added to the POM: vendor-signature locators, `openCompanyPicker()`/`companyPicker`. `SearchPickerControl` now also takes an input Locator (picker without an id).
- New facts: draft creation on first character autosaves the rest ~a debounce later (reload tests must poll the server for the full text); "Other time" chips are action chips (`aria-expanded`, never `aria-pressed`) and the time inputs always exist in the DOM (assert `toHaveValue('')`, not count 0); Save is `aria-disabled` when empty (`click({ force: true })` to prove it does nothing); saved-entry edit has no ⋯ menu/Delete (Delete is on the entry page); entry-page h1 is `New entry · <weekday>, <date>` / `Edit entry · …` (year shown outside the current year), so page-identity-sweep rows use `h1Pattern`.
- Production defects found live (phone WebKit / photo sheet): (1) StickyActionBar never sticks on the compact shell: `.mainContent{overflow-y:auto}` is the sticky scrollport but the document scrolls, so the bar sits at the end of the form and, with `bottom: var(--shell-bottom-height)`, overlaps the last 28px of content (More details un-clickable, Save not in viewport) — mobile project only, tablet/desktop fine; (2) the photo sheet's orientation picker lost the "No orientations configured" hint (`photoViewer:noOrientationsHint` unused since PhotoMetadataModal was deleted; the OrientationPicker has no emptyHint).

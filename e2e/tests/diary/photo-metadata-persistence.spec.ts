/**
 * E2E regression tests for Photo Lightbox metadata persistence (Bug #1734).
 *
 * Bug: saving Area/Orientation/caption metadata in the Photo Lightbox, then
 * navigating to another photo via the arrow buttons, then navigating back
 * showed empty/stale fields. Only a page reload restored the saved values.
 *
 * Fix: `PhotoViewer.handlePhotoUpdated` calls `onPhotoChanged?.(updatedPhoto)`
 * which invokes `usePhotos.updatePhotoInList()` in the parent page, updating
 * the `photos` array state. The `useEffect([currentIndex, photos])` in
 * `PhotoViewer` then re-derives `currentPhoto` from the fresh array, so
 * navigation away and back reflects the saved values without a page reload.
 *
 * Scenarios:
 * 1. [smoke] caption persists across navigation — diary EDIT page
 * 2. caption persists across navigation — diary DETAIL page
 * 3. [regression guard] annotation save still propagates (fix didn't break annotator path)
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { test, expect } from '../../fixtures/auth.js';
import type { Page } from '@playwright/test';
import { PhotoViewerPage } from '../../pages/PhotoViewerPage.js';
import { DiaryEntryDetailPage } from '../../pages/DiaryEntryDetailPage.js';
import { DiaryEntryEditPage } from '../../pages/DiaryEntryEditPage.js';
import { createDiaryEntryViaApi, deleteDiaryEntryViaApi } from '../../fixtures/apiHelpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 100×100 pixel light-grey PNG fixture (same asset used by photoAnnotation.spec.ts).
 */
const TEST_PHOTO_PNG = readFileSync(
  fileURLToPath(new URL('../../fixtures/test-photo-100x100.png', import.meta.url)),
);

/**
 * Upload a real (tiny) PNG to a diary entry via the REST API.
 * Returns the photo object `{ id }`.
 *
 * Returns null if the server responds with a non-ok status, which happens when
 * photo storage is not configured (e.g. PHOTO_STORAGE_PATH unavailable in the
 * test environment). Callers must handle null by calling `test.skip()`.
 */
async function uploadTestPhotoViaApi(
  page: Page,
  diaryEntryId: string,
): Promise<{ id: string } | null> {
  const response = await page.request.fetch('/api/photos', {
    method: 'POST',
    multipart: {
      file: {
        name: 'test-photo.png',
        mimeType: 'image/png',
        buffer: TEST_PHOTO_PNG,
      },
      entityType: 'diary_entry',
      entityId: diaryEntryId,
    },
  });

  if (!response.ok()) {
    return null;
  }

  const body = (await response.json()) as { photo: { id: string } };
  return { id: body.photo.id };
}

/**
 * Delete a photo via the REST API. Safe to call in finally blocks.
 */
async function deletePhotoViaApi(page: Page, photoId: string): Promise<void> {
  await page.request.delete(`/api/photos/${photoId}`);
}

/**
 * Open the PhotoViewer by clicking the photo card with the given photo ID.
 * Clicks the inner "View photo" button (the clickable area inside the card div).
 * Waits for the viewer modal to become visible before returning.
 */
async function openPhotoViewer(
  page: Page,
  photoId: string,
  viewer: PhotoViewerPage,
): Promise<void> {
  const photoCard = page.getByTestId(`photo-card-${photoId}`);
  await expect(photoCard).toBeVisible();
  // Click the button inside the card — same approach as photoAnnotation.spec.ts
  await photoCard.click();
  await expect(viewer.modal).toBeVisible();
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1 — [smoke] caption persists across navigation (EDIT page)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scenario 1 — [smoke] Caption saved in the lightbox metadata sidepanel persists
 * when the user navigates to the next photo and back, without a page reload.
 *
 * Entry point: Diary EDIT page (DiaryEntryEditPage).
 *
 * Steps:
 * 1. Create a diary entry + upload 2 photos via API.
 * 2. Navigate to the diary EDIT page.
 * 3. Click photo 1 → PhotoViewer opens.
 * 4. Type "Test Caption" into the caption field → Save button appears.
 * 5. Register waitForResponse for PATCH /api/photos/:id (photo 1) BEFORE clicking save.
 * 6. Click Save → await the PATCH 200 response.
 * 7. Click the "next" arrow → photo 2 is displayed (nav buttons are present for multi-photo).
 * 8. Click the "prev" arrow → photo 1 is displayed again.
 * 9. Assert the caption field still shows "Test Caption" (NOT blank).
 *
 * This test MUST fail on the pre-fix code (caption reverts to empty on back-nav)
 * and pass on the post-fix code (photos array is updated by onPhotoChanged).
 */
test(
  '[smoke] Caption persists across lightbox navigation (edit page)',
  { tag: '@smoke' },
  async ({ page, testPrefix }: { page: Page; testPrefix: string }) => {
    let entryId: string | null = null;
    let photo1Id: string | null = null;
    let photo2Id: string | null = null;

    // Allow extra time for two photo uploads + PATCH round-trips.
    test.setTimeout(45_000);

    try {
      // ── Setup ──────────────────────────────────────────────────────────────
      entryId = await createDiaryEntryViaApi(page, {
        entryType: 'general_note',
        entryDate: '2026-05-17',
        body: `${testPrefix} caption persistence edit page`,
      });

      const upload1 = await uploadTestPhotoViaApi(page, entryId);
      if (!upload1) {
        test.skip(true, 'Photo storage not configured in this environment');
        return;
      }
      photo1Id = upload1.id;

      const upload2 = await uploadTestPhotoViaApi(page, entryId);
      if (!upload2) {
        test.skip(true, 'Photo storage not configured in this environment (photo 2)');
        return;
      }
      photo2Id = upload2.id;

      const editPage = new DiaryEntryEditPage(page);
      const viewer = new PhotoViewerPage(page);

      await editPage.goto(entryId);
      await expect(editPage.heading).toBeVisible();

      // ── Open PhotoViewer on photo 1 ────────────────────────────────────────
      await openPhotoViewer(page, photo1Id, viewer);

      // Multiple photos — nav buttons must be present
      await expect(viewer.nextButton).toBeVisible();
      await expect(viewer.prevButton).toBeVisible();

      // ── Save a caption on photo 1 ──────────────────────────────────────────
      const captionText = `${testPrefix} caption persistence`;
      await viewer.saveCaption(captionText, photo1Id);

      // After save, the Save button disappears (hasChanges resets to false) and
      // caption field retains the value.
      await expect(viewer.saveMetadataButton).not.toBeVisible();

      // ── Navigate to photo 2 ────────────────────────────────────────────────
      await viewer.nextButton.click();

      // Wait for the image to change — photo-card testid is not visible inside the
      // viewer, but we can wait for the photo counter text to change to "2 / 2".
      // The counter is plain text inside the viewer container; use a locator with
      // text matching.
      await expect(viewer.modal.getByText('2 / 2')).toBeVisible();

      // ── Navigate back to photo 1 ───────────────────────────────────────────
      await viewer.prevButton.click();
      await expect(viewer.modal.getByText('1 / 2')).toBeVisible();

      // ── Assert caption is still present (regression guard) ─────────────────
      // On the pre-fix code: useEffect([currentIndex, photos]) re-derives currentPhoto
      // from photos[0] which still has the OLD (null) caption — so the field would
      // reset to empty. On the post-fix code: onPhotoChanged updated the photos array
      // so photos[0] now has caption = captionText → field shows the saved value.
      await viewer.openSidepanelIfMobile();
      await expect(viewer.captionField).toHaveValue(captionText);
    } finally {
      // Cleanup in reverse order
      if (photo1Id) await deletePhotoViaApi(page, photo1Id).catch(() => {});
      if (photo2Id) await deletePhotoViaApi(page, photo2Id).catch(() => {});
      if (entryId) await deleteDiaryEntryViaApi(page, entryId).catch(() => {});
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2 — caption persists across navigation (DETAIL page)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scenario 2 — Caption persists across lightbox navigation from the diary DETAIL page.
 *
 * Same propagation flow as Scenario 1 but using the detail page entry point.
 * Both the detail page and the edit page use `photosResult.updatePhotoInList`
 * as the `onPhotoChanged` callback — this scenario confirms that the fix works
 * for both callers of `PhotoViewer`.
 */
test('Caption persists across lightbox navigation (detail page)', async ({
  page,
  testPrefix,
}: {
  page: Page;
  testPrefix: string;
}) => {
  let entryId: string | null = null;
  let photo1Id: string | null = null;
  let photo2Id: string | null = null;

  test.setTimeout(45_000);

  try {
    // ── Setup ──────────────────────────────────────────────────────────────
    entryId = await createDiaryEntryViaApi(page, {
      entryType: 'general_note',
      entryDate: '2026-05-17',
      body: `${testPrefix} caption persistence detail page`,
    });

    const upload1 = await uploadTestPhotoViaApi(page, entryId);
    if (!upload1) {
      test.skip(true, 'Photo storage not configured in this environment');
      return;
    }
    photo1Id = upload1.id;

    const upload2 = await uploadTestPhotoViaApi(page, entryId);
    if (!upload2) {
      test.skip(true, 'Photo storage not configured in this environment (photo 2)');
      return;
    }
    photo2Id = upload2.id;

    const detailPage = new DiaryEntryDetailPage(page);
    const viewer = new PhotoViewerPage(page);

    await detailPage.goto(entryId);
    await expect(detailPage.backButton).toBeVisible();

    // ── Open PhotoViewer on photo 1 ────────────────────────────────────────
    await openPhotoViewer(page, photo1Id, viewer);

    await expect(viewer.nextButton).toBeVisible();
    await expect(viewer.prevButton).toBeVisible();

    // ── Save a caption on photo 1 ──────────────────────────────────────────
    const captionText = `${testPrefix} detail caption persistence`;
    await viewer.saveCaption(captionText, photo1Id);
    await expect(viewer.saveMetadataButton).not.toBeVisible();

    // ── Navigate to photo 2 then back ──────────────────────────────────────
    await viewer.nextButton.click();
    await expect(viewer.modal.getByText('2 / 2')).toBeVisible();

    await viewer.prevButton.click();
    await expect(viewer.modal.getByText('1 / 2')).toBeVisible();

    // ── Assert caption is still present ───────────────────────────────────
    await viewer.openSidepanelIfMobile();
    await expect(viewer.captionField).toHaveValue(captionText);
  } finally {
    if (photo1Id) await deletePhotoViaApi(page, photo1Id).catch(() => {});
    if (photo2Id) await deletePhotoViaApi(page, photo2Id).catch(() => {});
    if (entryId) await deleteDiaryEntryViaApi(page, entryId).catch(() => {});
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3 — annotation save still propagates after the refactor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scenario 3 — [regression guard] The metadata-propagation refactor did not break
 * the annotation save path.
 *
 * After annotating photo 1 (via PUT /api/photos/:id/annotation), navigating to
 * photo 2 and back must still show the `viewOriginalButton` and
 * `clearAnnotationsButton` controls — meaning `annotatedAt` was propagated into
 * the photos array and the viewer correctly re-derives `currentPhoto` on back-nav.
 *
 * The annotation PUT is mocked (via page.route) to avoid the overhead of the
 * full canvas-bake + real PUT cycle. The mock returns a photo with annotatedAt
 * set, so `handlePhotoAnnotated` → `handlePhotoUpdated` → `onPhotoChanged` fires
 * exactly as in production — this is what we're testing.
 *
 * NOTE: Annotating requires entering annotation mode, which hides the nav buttons.
 * The flow is:
 *   open viewer → annotate → save (mock PUT) → exit annotation mode → nav buttons reappear
 *   → navigate next → navigate back → assert viewOriginalButton visible.
 */
test('Annotation save propagates through navigation (regression guard)', async ({
  page,
  testPrefix,
}: {
  page: Page;
  testPrefix: string;
}) => {
  let entryId: string | null = null;
  let photo1Id: string | null = null;
  let photo2Id: string | null = null;

  test.setTimeout(45_000);

  try {
    // ── Setup ──────────────────────────────────────────────────────────────
    entryId = await createDiaryEntryViaApi(page, {
      entryType: 'general_note',
      entryDate: '2026-05-17',
      body: `${testPrefix} annotation propagation guard`,
    });

    const upload1 = await uploadTestPhotoViaApi(page, entryId);
    if (!upload1) {
      test.skip(true, 'Photo storage not configured in this environment');
      return;
    }
    photo1Id = upload1.id;

    const upload2 = await uploadTestPhotoViaApi(page, entryId);
    if (!upload2) {
      test.skip(true, 'Photo storage not configured in this environment (photo 2)');
      return;
    }
    photo2Id = upload2.id;

    // ── Mock the annotation PUT endpoint ───────────────────────────────────
    // We intercept PUT /api/photos/:id/annotation so the test does not need to
    // perform actual canvas drawing. The response includes `annotatedAt` set to
    // a non-null timestamp, which triggers the "annotated" state in the viewer
    // (viewOriginalButton / clearAnnotationsButton become visible).
    const annotatedAt = new Date().toISOString();
    const annotationRoutePattern = `**/api/photos/${photo1Id}/annotation`;

    await page.route(annotationRoutePattern, async (route) => {
      if (route.request().method() === 'PUT') {
        await route
          .fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              photo: {
                id: photo1Id,
                annotatedAt,
                fileUrl: '/api/photos/placeholder.png',
                thumbnailUrl: '/api/photos/placeholder-thumb.png',
                width: 100,
                height: 100,
                caption: null,
                areaId: null,
                area: null,
                orientationId: null,
                orientation: null,
                originalFilename: 'test-photo.png',
                sortOrder: 0,
                createdBy: { id: 'user-1', displayName: 'E2E Admin' },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            }),
          })
          .catch(() => {});
      } else {
        await route.continue().catch(() => {});
      }
    });

    // ── Navigate to edit page and open viewer ──────────────────────────────
    const editPage = new DiaryEntryEditPage(page);
    const viewer = new PhotoViewerPage(page);

    await editPage.goto(entryId);
    await expect(editPage.heading).toBeVisible();

    await openPhotoViewer(page, photo1Id, viewer);

    // ── Enter annotation mode ──────────────────────────────────────────────
    await expect(viewer.annotateButton).toBeVisible();
    await viewer.annotateButton.click();
    await expect(viewer.toolPalette).toBeVisible();

    // ── Save annotation (mocked PUT) ───────────────────────────────────────
    // Register waitForResponse BEFORE clicking save.
    const putDone = page.waitForResponse(
      (resp) =>
        resp.url().endsWith(`/api/photos/${photo1Id}/annotation`) &&
        resp.request().method() === 'PUT' &&
        resp.status() === 200,
    );
    await viewer.saveButton.click();
    await putDone;

    // Annotator closed — back in viewer mode
    await expect(viewer.toolPalette).not.toBeVisible();
    await expect(viewer.annotateButton).toBeVisible();

    // viewOriginalButton and clearAnnotationsButton appear (annotatedAt propagated)
    await expect(viewer.viewOriginalButton).toBeVisible();
    await expect(viewer.clearAnnotationsButton).toBeVisible();

    // ── Navigate to photo 2 and back ───────────────────────────────────────
    // Nav buttons reappear now that annotation mode is closed.
    await expect(viewer.nextButton).toBeVisible();
    await viewer.nextButton.click();
    await expect(viewer.modal.getByText('2 / 2')).toBeVisible();

    await viewer.prevButton.click();
    await expect(viewer.modal.getByText('1 / 2')).toBeVisible();

    // ── Assert annotated controls still visible (regression guard) ─────────
    // Pre-fix: photos[0].annotatedAt was still null (array not updated), so
    // viewOriginalButton and clearAnnotationsButton disappeared on back-nav.
    // Post-fix: photos[0].annotatedAt = annotatedAt (set via onPhotoChanged),
    // so controls remain visible.
    await expect(viewer.viewOriginalButton).toBeVisible();
    await expect(viewer.clearAnnotationsButton).toBeVisible();
  } finally {
    // Clean up mock route
    await page.unroute(`**/api/photos/${photo1Id}/annotation`).catch(() => {});

    if (photo1Id) await deletePhotoViaApi(page, photo1Id).catch(() => {});
    if (photo2Id) await deletePhotoViaApi(page, photo2Id).catch(() => {});
    if (entryId) await deleteDiaryEntryViaApi(page, entryId).catch(() => {});
  }
});

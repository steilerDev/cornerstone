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
 * 1. [smoke] caption persists across navigation — capture screen (edit URL)
 * 2. caption persists across navigation — diary DETAIL page
 * 3. [regression guard] annotation save propagates through the photo sheet
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { test, expect } from '../../fixtures/auth.js';
import type { Page } from '@playwright/test';
import { PhotoViewerPage } from '../../pages/PhotoViewerPage.js';
import { DiaryEntryDetailPage } from '../../pages/DiaryEntryDetailPage.js';
import { DiaryCapturePage } from '../../pages/DiaryCapturePage.js';
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
 * Scenario 1 — [smoke] A caption typed in the capture screen's photo sheet persists when the
 * user moves to the next photo and back, without a page reload.
 *
 * Entry point: the capture screen on the edit URL (DiaryCapturePage). Tapping a photo tile opens
 * the photo sheet (caption, Area, Orientation, Annotate, Remove). The caption is committed when
 * the field loses focus or the user moves to another photo.
 *
 * Steps:
 * 1. Create a diary entry + upload 2 photos via API.
 * 2. Open the capture screen; wait for both tiles to show as uploaded.
 * 3. Open the sheet on photo 1, type a caption, register waitForResponse for PATCH
 *    /api/photos/:id (photo 1) and tap Next (commits the caption).
 * 4. The sheet shows photo 2 (empty caption); tap Previous.
 * 5. The caption field still shows the caption (NOT blank), and the server has it.
 */
test(
  '[smoke] Caption persists across photo-sheet navigation (edit page)',
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

      const capture = new DiaryCapturePage(page);
      await capture.gotoEdit(entryId);
      await capture.waitForUploaded(2);

      // ── Open the sheet on photo 1 ──────────────────────────────────────────
      await capture.sheet.open(0);
      await expect(capture.sheet.next).toBeVisible();
      await expect(capture.sheet.previous).toBeVisible();

      // ── Save a caption on photo 1 (committed by moving on) ──────────────────
      const captionText = `${testPrefix} caption persistence`;
      await capture.sheet.caption.fill(captionText);
      const saved = page.waitForResponse(
        (resp) =>
          resp.url().endsWith(`/api/photos/${photo1Id}`) &&
          resp.request().method() === 'PATCH' &&
          resp.ok(),
      );
      await capture.tap(capture.sheet.next);
      await saved;

      // ── Photo 2, then back to photo 1 ──────────────────────────────────────
      await expect(capture.sheet.dialog).toHaveAccessibleName('Photo 2 of 2');
      await expect(capture.sheet.caption).toHaveValue('');
      await capture.tap(capture.sheet.previous);
      await expect(capture.sheet.dialog).toHaveAccessibleName('Photo 1 of 2');

      // ── Assert the caption is still present (regression guard) ─────────────
      await expect(capture.sheet.caption).toHaveValue(captionText);
      const stored = await page.request.get(`/api/photos/${photo1Id}`);
      if (stored.ok()) {
        const body = (await stored.json()) as { photo?: { caption: string | null } };
        if (body.photo) expect(body.photo.caption).toBe(captionText);
      }
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
    await expect(detailPage.loaded).toBeVisible();

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
 * Scenario 3 — [regression guard] An annotation saved from the capture screen's photo sheet
 * is still marked after moving to another photo and back.
 *
 * Flow: open the sheet on photo 1 -> Annotate -> draw -> Save (real PUT
 * /api/photos/:id/annotation) -> the annotator closes and the sheet is back -> Next -> Previous
 * -> close the sheet -> the tile of photo 1 is labelled "annotated", photo 2's is not.
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

    // ── Open the capture screen and the sheet of photo 1 ────────────────────
    const capture = new DiaryCapturePage(page);
    await capture.gotoEdit(entryId);
    await capture.waitForUploaded(2);
    await capture.sheet.open(0);

    // ── Annotate: real drawing, saved through PUT /api/photos/:id/annotation ──
    await expect(capture.sheet.annotate).not.toHaveAttribute('aria-disabled', 'true');
    const putDone = page.waitForResponse(
      (resp) =>
        resp.url().endsWith(`/api/photos/${photo1Id}/annotation`) &&
        resp.request().method() === 'PUT' &&
        resp.ok(),
    );
    await capture.tap(capture.sheet.annotate);
    await expect(capture.annotator.dialog).toBeVisible();
    await capture.annotator.draw();
    await putDone;

    // The annotator is closed and the sheet is back
    await expect(capture.annotator.dialog).not.toBeVisible();
    await expect(capture.sheet.dialog).toBeVisible();

    // ── Navigate to photo 2 and back, then close the sheet ──────────────────
    await capture.tap(capture.sheet.next);
    await expect(capture.sheet.dialog).toHaveAccessibleName('Photo 2 of 2');
    await capture.tap(capture.sheet.previous);
    await expect(capture.sheet.dialog).toHaveAccessibleName('Photo 1 of 2');
    await capture.sheet.close();

    // ── Assert the annotation is still marked on the tile (regression guard) ─
    await expect(capture.tileOpen(0)).toHaveAttribute('aria-label', /annotated/);
    await expect(capture.tileOpen(1)).not.toHaveAttribute('aria-label', /annotated/);
  } finally {
    if (photo1Id) await deletePhotoViaApi(page, photo1Id).catch(() => {});
    if (photo2Id) await deletePhotoViaApi(page, photo2Id).catch(() => {});
    if (entryId) await deleteDiaryEntryViaApi(page, entryId).catch(() => {});
  }
});

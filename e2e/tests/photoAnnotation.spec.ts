/**
 * E2E tests for Photo Annotation lifecycle.
 *
 * Story #1473: Photo Annotator Foundation
 *
 * Scenarios covered:
 * 1.  [smoke] Full annotation lifecycle — open annotator, draw rectangle, save, view
 *             original toggle, clear annotations
 * 2.  Cancel annotation — discard without saving; no PUT emitted
 * 3.  Save failure — mock PUT 500 → error banner visible; annotator remains open
 *
 * Desktop / Chromium only for Story 1.
 * Multi-viewport coverage is Story 5 scope — no @responsive tag here.
 *
 * === Known limitation: Bug #1482 ===
 *
 * DiaryEntryDetailPage passes `photos={photosResult.photos}` to PhotoViewer
 * but does NOT pass `onPhotoAnnotated`. After a PUT /annotation save, the
 * `photos` prop is stale (annotatedAt still null), so "View Original" and
 * "Clear Annotations" buttons do not appear unless the parent refreshes.
 *
 * Workaround for Scenario 1 "View Original" flow: after Save, we intercept
 * GET /api/photos to inject the updated annotatedAt into the response, then
 * re-navigate to force the parent to pick up the updated photos. This simulates
 * what WILL happen once Bug #1482 is fixed (onPhotoAnnotated wired up).
 *
 * The "Clear Annotations" delete call IS handled internally in PhotoViewer via
 * the `handleClearAnnotation` which calls `onPhotoAnnotated?.(clearedPhoto)`,
 * updating the local photo state directly — so the Clear flow works without
 * this workaround once the viewer already shows an annotated photo.
 */

import type { Page, Route, Request } from '@playwright/test';
import { test, expect } from '../fixtures/auth.js';
import { PhotoViewerPage } from '../pages/PhotoViewerPage.js';
import { DiaryEntryDetailPage } from '../pages/DiaryEntryDetailPage.js';
import { createDiaryEntryViaApi, deleteDiaryEntryViaApi } from '../fixtures/apiHelpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Minimal 1×1 pixel black PNG (base64-encoded).
 * Sufficient for the annotator (needs photo.width + photo.height to be non-null).
 */
const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const TINY_PNG = Buffer.from(TINY_PNG_B64, 'base64');

/**
 * Upload a real (tiny) PNG to a diary entry via the REST API.
 * Returns the photo object with id, fileUrl, thumbnailUrl.
 *
 * Response shape: { photo: { id, width, height, annotatedAt, fileUrl, thumbnailUrl, ... } }
 */
async function uploadTestPhotoViaApi(
  page: Page,
  diaryEntryId: string,
): Promise<{ id: string; fileUrl: string; thumbnailUrl: string }> {
  const response = await page.request.fetch('/api/photos', {
    method: 'POST',
    multipart: {
      file: {
        name: 'test-photo.png',
        mimeType: 'image/png',
        buffer: TINY_PNG,
      },
      entityType: 'diary_entry',
      entityId: diaryEntryId,
    },
  });

  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`Failed to upload test photo: ${response.status()} — ${body}`);
  }

  const body = (await response.json()) as {
    photo: { id: string; fileUrl: string; thumbnailUrl: string };
  };
  return { id: body.photo.id, fileUrl: body.photo.fileUrl, thumbnailUrl: body.photo.thumbnailUrl };
}

/**
 * Delete a photo via the REST API. Safe to call in finally blocks.
 */
async function deletePhotoViaApi(page: Page, photoId: string): Promise<void> {
  await page.request.delete(`/api/photos/${photoId}`);
}

/**
 * Open the PhotoViewer by clicking the first photo card in the photos grid.
 * Waits for the viewer to be visible before returning.
 */
async function openPhotoViewer(
  page: Page,
  photoId: string,
  viewer: PhotoViewerPage,
): Promise<void> {
  const photoCard = page.getByTestId(`photo-card-${photoId}`);
  await expect(photoCard).toBeVisible();
  await photoCard.click();
  await expect(viewer.modal).toBeVisible();
  await expect(viewer.annotateButton).toBeVisible();
}

/**
 * Draw a rectangle on the SVG overlay by simulating pointer events.
 * Uses page.mouse to avoid touch-action issues.
 */
async function drawRectangleOnOverlay(
  page: Page,
  svgOverlay: import('@playwright/test').Locator,
): Promise<void> {
  const svgBox = await svgOverlay.boundingBox();
  expect(svgBox).not.toBeNull();

  const startX = svgBox!.x + svgBox!.width * 0.2;
  const startY = svgBox!.y + svgBox!.height * 0.2;
  const endX = svgBox!.x + svgBox!.width * 0.6;
  const endY = svgBox!.y + svgBox!.height * 0.6;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 5 });
  await page.mouse.up();
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: [smoke] Full annotation lifecycle
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scenario 1 — Full annotation lifecycle (smoke):
 *
 * 1. Create diary entry + upload real photo via API
 * 2. Navigate to diary entry detail page
 * 3. Click photo card → PhotoViewer opens
 * 4. Verify Annotate button visible and enabled
 * 5. Click Annotate → ToolPalette visible with Select/Rectangle/Highlight
 * 6. Select is aria-pressed="true" by default
 * 7. Switch to Rectangle tool (aria-pressed="true")
 * 8. Draw a rectangle drag on the SVG overlay
 * 9. <rect> shape appears in the SVG DOM
 * 10. Click Save → PUT /api/photos/:id/annotation → 200 + annotatedAt
 * 11. Annotator closes; viewer in normal view mode (ToolPalette gone)
 * 12. Mock GET /api/photos with annotatedAt set; re-navigate to detail page
 * 13. Re-open viewer → viewOriginalButton visible
 * 14. Toggle View Original → img src contains variant=original
 * 15. Toggle back → src no longer contains variant=original
 * 16. Clear Annotations → Modal appears → confirm → DELETE 204
 * 17. viewOriginalButton and clearAnnotationsButton hidden
 */
test(
  '[smoke] Photo annotation full lifecycle',
  { tag: '@smoke' },
  async ({ page, testPrefix }: { page: Page; testPrefix: string }) => {
    let entryId: string | null = null;
    let photoId: string | null = null;
    let photoFileUrl: string | null = null;
    let photoThumbnailUrl: string | null = null;

    // Canvas toBlob + PUT upload can take a few seconds
    test.setTimeout(30_000);

    try {
      // ── Setup ──────────────────────────────────────────────────────────────
      entryId = await createDiaryEntryViaApi(page, {
        entryType: 'general_note',
        entryDate: '2026-05-17',
        body: `${testPrefix} annotation lifecycle test`,
      });

      const uploadedPhoto = await uploadTestPhotoViaApi(page, entryId);
      photoId = uploadedPhoto.id;
      photoFileUrl = uploadedPhoto.fileUrl;
      photoThumbnailUrl = uploadedPhoto.thumbnailUrl;

      const detailPage = new DiaryEntryDetailPage(page);
      const viewer = new PhotoViewerPage(page);

      await detailPage.goto(entryId);
      await expect(detailPage.backButton).toBeVisible();

      // ── Open viewer ────────────────────────────────────────────────────────
      await openPhotoViewer(page, photoId, viewer);

      // The annotate button must be enabled (photo has width=1, height=1)
      await expect(viewer.annotateButton).toBeEnabled();

      // ── Open annotator ─────────────────────────────────────────────────────
      await viewer.annotateButton.click();

      // ToolPalette visible
      await expect(viewer.toolPalette).toBeVisible();

      // All three tool buttons present
      await expect(viewer.selectToolButton).toBeVisible();
      await expect(viewer.rectangleToolButton).toBeVisible();
      await expect(viewer.highlightToolButton).toBeVisible();

      // Select is active by default
      await expect(viewer.selectToolButton).toHaveAttribute('aria-pressed', 'true');
      await expect(viewer.rectangleToolButton).toHaveAttribute('aria-pressed', 'false');
      await expect(viewer.highlightToolButton).toHaveAttribute('aria-pressed', 'false');

      // Action buttons visible
      await expect(viewer.saveButton).toBeVisible();
      await expect(viewer.cancelButton).toBeVisible();

      // ── Switch to Rectangle tool ───────────────────────────────────────────
      await viewer.rectangleToolButton.click();
      await expect(viewer.rectangleToolButton).toHaveAttribute('aria-pressed', 'true');
      await expect(viewer.selectToolButton).toHaveAttribute('aria-pressed', 'false');

      // ── Draw a rectangle ───────────────────────────────────────────────────
      await expect(viewer.svgOverlay).toBeVisible();
      await drawRectangleOnOverlay(page, viewer.svgOverlay);

      // A <rect> should appear in the SVG (committed by pointerUp)
      await expect(viewer.svgOverlay.locator('rect').first()).toBeVisible();

      // ── Save annotation ────────────────────────────────────────────────────
      const [putResponse] = await Promise.all([
        page.waitForResponse(
          (resp) =>
            resp.url().includes(`/api/photos/${photoId}/annotation`) &&
            resp.request().method() === 'PUT',
        ),
        viewer.saveButton.click(),
      ]);

      expect(putResponse.status()).toBe(200);
      const putBody = (await putResponse.json()) as {
        photo: { id: string; annotatedAt: string | null };
      };
      expect(putBody.photo.annotatedAt).not.toBeNull();
      const savedAnnotatedAt = putBody.photo.annotatedAt!;

      // ── Annotator closed — viewer in normal mode ───────────────────────────
      await expect(viewer.toolPalette).not.toBeVisible();
      await expect(viewer.annotateButton).toBeVisible();

      // Close the viewer
      await viewer.closeButton.click();
      await expect(viewer.modal).not.toBeVisible();

      // ── Inject annotatedAt via GET /api/photos mock (Bug #1482 workaround) ─
      // DiaryEntryDetailPage does not wire onPhotoAnnotated → photos prop is stale
      // after save. Mock the GET to return the updated photo so the parent refreshes.
      const photosApiGlob = `**/api/photos?entityType=diary_entry&entityId=${entryId}`;
      await page.route(photosApiGlob, async (route: Route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              photos: [
                {
                  id: photoId,
                  entityType: 'diary_entry',
                  entityId: entryId,
                  originalFilename: 'test-photo.png',
                  mimeType: 'image/png',
                  fileSize: TINY_PNG.length,
                  width: 1,
                  height: 1,
                  takenAt: null,
                  caption: null,
                  sortOrder: 0,
                  createdBy: null,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  annotatedAt: savedAnnotatedAt,
                  fileUrl: photoFileUrl,
                  thumbnailUrl: photoThumbnailUrl,
                },
              ],
            }),
          });
        } else {
          await route.continue();
        }
      });

      // Re-navigate to reload photos from the mock
      await detailPage.goto(entryId);
      await expect(detailPage.backButton).toBeVisible();

      // ── Re-open viewer with annotated photo ────────────────────────────────
      await openPhotoViewer(page, photoId, viewer);

      // viewOriginalButton and clearAnnotationsButton present (annotatedAt is set)
      await expect(viewer.viewOriginalButton).toBeVisible();
      await expect(viewer.clearAnnotationsButton).toBeVisible();

      // ── Toggle View Original ───────────────────────────────────────────────
      // Initially showing annotated (aria-pressed="false" = not viewing original)
      await expect(viewer.viewOriginalButton).toHaveAttribute('aria-pressed', 'false');

      await viewer.viewOriginalButton.click();
      await expect(viewer.viewOriginalButton).toHaveAttribute('aria-pressed', 'true');

      // img src should contain variant=original
      const originalSrc = await viewer.photoImage.getAttribute('src');
      expect(originalSrc).toContain('variant=original');

      // Toggle back — returns to annotated view
      await viewer.viewOriginalButton.click();
      await expect(viewer.viewOriginalButton).toHaveAttribute('aria-pressed', 'false');

      const annotatedSrc = await viewer.photoImage.getAttribute('src');
      expect(annotatedSrc).not.toContain('variant=original');

      // ── Clear Annotations ──────────────────────────────────────────────────
      await viewer.clearAnnotationsButton.click();

      // Confirmation Modal appears
      const clearModal = page.getByRole('dialog');
      await expect(clearModal).toBeVisible();

      // Remove the photos mock BEFORE confirming, so the real DELETE can proceed
      // and any subsequent GET returns real server data (annotatedAt=null).
      await page.unroute(photosApiGlob);

      // Register waitForResponse BEFORE clicking confirm (race-condition safety)
      const [deleteResponse] = await Promise.all([
        page.waitForResponse(
          (resp) =>
            resp.url().includes(`/api/photos/${photoId}/annotation`) &&
            resp.request().method() === 'DELETE',
        ),
        // The Modal footer's last button is the danger confirm action
        clearModal.getByRole('button').last().click(),
      ]);

      expect(deleteResponse.status()).toBe(204);

      // PhotoViewer calls onPhotoAnnotated?.(clearedPhoto) internally after DELETE,
      // updating its local copy so annotatedAt=null. The conditional buttons hide.
      await expect(viewer.viewOriginalButton).not.toBeVisible();
      await expect(viewer.clearAnnotationsButton).not.toBeVisible();
    } finally {
      // Clean up any route mocks
      await page.unrouteAll({ behavior: 'ignoreErrors' });

      if (photoId) await deletePhotoViaApi(page, photoId).catch(() => {});
      if (entryId) await deleteDiaryEntryViaApi(page, entryId).catch(() => {});
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Cancel annotation discards changes without saving
// ─────────────────────────────────────────────────────────────────────────────

test(
  'Cancel annotation discards without saving',
  async ({ page, testPrefix }: { page: Page; testPrefix: string }) => {
    let entryId: string | null = null;
    let photoId: string | null = null;

    test.setTimeout(20_000);

    try {
      entryId = await createDiaryEntryViaApi(page, {
        entryType: 'general_note',
        entryDate: '2026-05-17',
        body: `${testPrefix} cancel annotation test`,
      });

      const photo = await uploadTestPhotoViaApi(page, entryId);
      photoId = photo.id;

      const detailPage = new DiaryEntryDetailPage(page);
      const viewer = new PhotoViewerPage(page);

      await detailPage.goto(entryId);
      await expect(detailPage.backButton).toBeVisible();
      await openPhotoViewer(page, photoId, viewer);

      // Open annotator
      await viewer.annotateButton.click();
      await expect(viewer.toolPalette).toBeVisible();

      // Switch to Rectangle and draw a shape
      await viewer.rectangleToolButton.click();
      await drawRectangleOnOverlay(page, viewer.svgOverlay);

      // Track whether any PUT fires
      let putFired = false;
      page.on('request', (req: Request) => {
        if (
          req.url().includes(`/api/photos/${photoId}/annotation`) &&
          req.method() === 'PUT'
        ) {
          putFired = true;
        }
      });

      // Click Cancel
      await viewer.cancelButton.click();

      // Annotator must be gone; viewer in normal mode
      await expect(viewer.toolPalette).not.toBeVisible();
      await expect(viewer.annotateButton).toBeVisible();

      // No PUT should have fired
      expect(putFired).toBe(false);

      // View Original and Clear hidden (annotatedAt is still null)
      await expect(viewer.viewOriginalButton).not.toBeVisible();
      await expect(viewer.clearAnnotationsButton).not.toBeVisible();
    } finally {
      if (photoId) await deletePhotoViaApi(page, photoId).catch(() => {});
      if (entryId) await deleteDiaryEntryViaApi(page, entryId).catch(() => {});
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Save failure shows error banner and keeps annotator open
// ─────────────────────────────────────────────────────────────────────────────

test(
  'Save failure shows error banner and keeps annotator open',
  async ({ page, testPrefix }: { page: Page; testPrefix: string }) => {
    let entryId: string | null = null;
    let photoId: string | null = null;

    test.setTimeout(20_000);

    try {
      entryId = await createDiaryEntryViaApi(page, {
        entryType: 'general_note',
        entryDate: '2026-05-17',
        body: `${testPrefix} save error test`,
      });

      const photo = await uploadTestPhotoViaApi(page, entryId);
      photoId = photo.id;

      const detailPage = new DiaryEntryDetailPage(page);
      const viewer = new PhotoViewerPage(page);

      await detailPage.goto(entryId);
      await expect(detailPage.backButton).toBeVisible();

      // Intercept PUT /annotation to return 500 before opening the annotator
      const annotationGlob = `**/api/photos/${photoId}/annotation`;
      await page.route(annotationGlob, async (route: Route) => {
        if (route.request().method() === 'PUT') {
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({
              error: { code: 'INTERNAL_ERROR', message: 'Simulated server error' },
            }),
          });
        } else {
          await route.continue();
        }
      });

      await openPhotoViewer(page, photoId, viewer);

      // Open annotator and draw a rectangle
      await viewer.annotateButton.click();
      await expect(viewer.toolPalette).toBeVisible();

      await viewer.rectangleToolButton.click();
      await drawRectangleOnOverlay(page, viewer.svgOverlay);

      // Click Save — the mocked PUT returns 500
      const [putResponse] = await Promise.all([
        page.waitForResponse(
          (resp) =>
            resp.url().includes(`/api/photos/${photoId}/annotation`) &&
            resp.request().method() === 'PUT',
        ),
        viewer.saveButton.click(),
      ]);

      expect(putResponse.status()).toBe(500);

      // Annotator must still be open
      await expect(viewer.toolPalette).toBeVisible();

      // Error banner (FormError variant="banner" renders role="alert")
      await expect(page.getByRole('alert')).toBeVisible();

      // Save button still accessible
      await expect(viewer.saveButton).toBeVisible();
    } finally {
      // Unroute the 500 mock before cleanup so DELETE photo can go through
      if (photoId) {
        await page.unroute(`**/api/photos/${photoId}/annotation`).catch(() => {});
      }
      if (photoId) await deletePhotoViaApi(page, photoId).catch(() => {});
      if (entryId) await deleteDiaryEntryViaApi(page, entryId).catch(() => {});
    }
  },
);

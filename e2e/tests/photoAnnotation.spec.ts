/**
 * E2E tests for Photo Annotation lifecycle.
 *
 * Story #1473: Photo Annotator Foundation (Scenarios 1–3)
 * Story #1478: Photo Annotator Polish — full tool coverage (Scenarios 4–22)
 *
 * Scenarios covered:
 *
 * Foundation (from Story #1473):
 * 1.  [smoke] Full annotation lifecycle — open annotator, draw rectangle, save, view
 *             original toggle, clear annotations
 * 2.  Cancel annotation — discard without saving; no PUT emitted
 * 3.  Save failure — mock PUT 500 → error banner visible; annotator remains open
 *
 * Tool draw + save (Story #1478):
 * 4.  Highlight tool — drag → semi-transparent <rect> committed; save succeeds
 * 5.  Arrow tool — drag → <line> with marker-end committed; save succeeds
 * 6.  Line tool — drag → plain <line> committed; save succeeds
 * 7.  Line tool with Shift-snap — dragging at ~5° with Shift → line snaps to 0°
 * 8.  Ellipse tool — drag → <ellipse> committed; save succeeds
 * 9.  Ellipse with Shift-snap — dragging unequal axes with Shift → rx === ry (circle)
 * 10. Text tool — click → inline input → Enter → <text> committed; save succeeds
 * 11. Text tool — Escape discards draft; no shape committed
 * 12. [smoke] Callout tool — drag box, click tail, type text, Enter → <g> committed
 * 13. Measurement tool — drag → inline input → Enter with label → <g> with <text>
 * 14. Measurement tool — Escape commits with empty label (no <text> child)
 * 15. Freehand tool — drag stroke → <polyline> committed; save succeeds
 * 16. [smoke] @responsive Freehand tool on mobile — pointer drag → <polyline>
 * 17. @responsive Measurement tool on mobile/tablet — inline input appears at midpoint
 *
 * Undo/Redo (Story #1478):
 * 18. Undo removes the last committed shape; Redo restores it
 *
 * Select tool (Story #1478):
 * 19. Select tool moves a committed rectangle; Save persists the moved position
 * 20. Select tool deletes a shape with the Delete key
 *
 * Multi-tool lifecycle (Story #1478):
 * 21. [smoke] @responsive Full lifecycle on all viewports — draw 3 shapes with
 *     different tools, save, verify View Original / Clear
 *
 * Tool palette UI state (Story #1478):
 * 22. All 10 tool buttons are visible in the palette; switching tool updates
 *     aria-pressed correctly
 *
 * Color palette (Story #1478):
 * 23. Selecting a different color swatch changes the active color for new shapes
 *
 * === Known limitation: Bug #1482 ===
 *
 * DiaryEntryDetailPage passes `photos={photosResult.photos}` to PhotoViewer
 * but does NOT pass `onPhotoAnnotated`. After a PUT /annotation save, the
 * `photos` prop is stale (annotatedAt still null), so "View Original" and
 * "Clear Annotations" buttons do not appear unless the parent refreshes.
 *
 * Workaround for Scenario 1 "View Original" flow and others that need annotatedAt:
 * after Save, we intercept GET /api/photos to inject the updated annotatedAt into
 * the response, then re-navigate to force the parent to pick up the updated photos.
 * This simulates what WILL happen once Bug #1482 is fixed (onPhotoAnnotated wired up).
 *
 * The "Clear Annotations" delete call IS handled internally in PhotoViewer via
 * the `handleClearAnnotation` which calls `onPhotoAnnotated?.(clearedPhoto)`,
 * updating the local photo state directly — so the Clear flow works without
 * this workaround once the viewer already shows an annotated photo.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import type { Page, Route, Request } from '@playwright/test';
import { test, expect } from '../fixtures/auth.js';
import { PhotoViewerPage } from '../pages/PhotoViewerPage.js';
import { DiaryEntryDetailPage } from '../pages/DiaryEntryDetailPage.js';
import { createDiaryEntryViaApi, deleteDiaryEntryViaApi } from '../fixtures/apiHelpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 100×100 pixel light-grey PNG fixture.
 * Must be ≥ 10×10 so that RectangleTool's 2×2 image-coordinate minimum-size
 * guard is satisfied: a drag spanning 20–60% of the SVG maps to ≥ 40 image
 * pixels in each axis, well above the 2px threshold.
 */
const TEST_PHOTO_PNG = readFileSync(
  fileURLToPath(new URL('../fixtures/test-photo-100x100.png', import.meta.url)),
);

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
        buffer: TEST_PHOTO_PNG,
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
 * Open annotator: click Annotate button, wait for ToolPalette visibility.
 */
async function openAnnotator(viewer: PhotoViewerPage): Promise<void> {
  await viewer.annotateButton.click();
  await expect(viewer.toolPalette).toBeVisible();
}

/**
 * Build a mock GET /api/photos response for use with Bug #1482 workaround.
 * Returns a route handler body string.
 */
function buildAnnotatedPhotosMockBody(
  photoId: string | null,
  entryId: string | null,
  annotatedAt: string,
  fileUrl: string | null,
  thumbnailUrl: string | null,
): string {
  return JSON.stringify({
    photos: [
      {
        id: photoId,
        entityType: 'diary_entry',
        entityId: entryId,
        originalFilename: 'test-photo.png',
        mimeType: 'image/png',
        fileSize: TEST_PHOTO_PNG.length,
        width: 100,
        height: 100,
        takenAt: null,
        caption: null,
        sortOrder: 0,
        createdBy: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        annotatedAt,
        fileUrl,
        thumbnailUrl,
      },
    ],
  });
}

/**
 * Re-open the photo viewer after a successful save (Bug #1482 workaround):
 * - Install GET /api/photos mock with annotatedAt set
 * - Re-navigate to the diary entry detail page
 * - Re-open the photo viewer
 */
async function reopenViewerWithAnnotatedPhoto(
  page: Page,
  detailPage: DiaryEntryDetailPage,
  viewer: PhotoViewerPage,
  entryId: string,
  photoId: string,
  annotatedAt: string,
  fileUrl: string,
  thumbnailUrl: string,
): Promise<string> {
  const photosApiGlob = `**/api/photos?entityType=diary_entry&entityId=${entryId}`;
  await page.route(photosApiGlob, async (route: Route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: buildAnnotatedPhotosMockBody(photoId, entryId, annotatedAt, fileUrl, thumbnailUrl),
      });
    } else {
      await route.continue();
    }
  });

  await detailPage.goto(entryId);
  await expect(detailPage.backButton).toBeVisible();
  await openPhotoViewer(page, photoId, viewer);

  return photosApiGlob;
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
 * 5. Click Annotate → ToolPalette visible with all tools
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
    let photosApiGlob: string | null = null;

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
      await openAnnotator(viewer);

      // All ten tool buttons present
      await expect(viewer.selectToolButton).toBeVisible();
      await expect(viewer.rectangleToolButton).toBeVisible();
      await expect(viewer.highlightToolButton).toBeVisible();
      await expect(viewer.arrowToolButton).toBeVisible();
      await expect(viewer.lineToolButton).toBeVisible();
      await expect(viewer.ellipseToolButton).toBeVisible();
      await expect(viewer.textToolButton).toBeVisible();
      await expect(viewer.calloutToolButton).toBeVisible();
      await expect(viewer.measurementToolButton).toBeVisible();
      await expect(viewer.freehandToolButton).toBeVisible();

      // Select is active by default
      await expect(viewer.selectToolButton).toHaveAttribute('aria-pressed', 'true');
      await expect(viewer.rectangleToolButton).toHaveAttribute('aria-pressed', 'false');

      // Action buttons visible
      await expect(viewer.saveButton).toBeVisible();
      await expect(viewer.cancelButton).toBeVisible();

      // ── Switch to Rectangle tool and draw ─────────────────────────────────
      await viewer.activateTool('rectangle');
      await expect(viewer.rectangleToolButton).toHaveAttribute('aria-pressed', 'true');
      await expect(viewer.selectToolButton).toHaveAttribute('aria-pressed', 'false');

      await expect(viewer.svgOverlay).toBeVisible();
      await viewer.drawRectangle();

      // A <rect> should appear in the SVG (committed by pointerUp)
      await expect(viewer.svgOverlay.locator('rect[data-shapeid]').first()).toBeVisible();

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
      photosApiGlob = await reopenViewerWithAnnotatedPhoto(
        page,
        detailPage,
        viewer,
        entryId,
        photoId,
        savedAnnotatedAt,
        photoFileUrl!,
        photoThumbnailUrl!,
      );

      // viewOriginalButton and clearAnnotationsButton present (annotatedAt is set)
      await expect(viewer.viewOriginalButton).toBeVisible();
      await expect(viewer.clearAnnotationsButton).toBeVisible();

      // ── Toggle View Original ───────────────────────────────────────────────
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

      // Remove the photos mock BEFORE confirming so the real DELETE can proceed
      await page.unroute(photosApiGlob);
      photosApiGlob = null;

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

      // After DELETE, viewer updates annotatedAt=null → conditional buttons hide
      await expect(viewer.viewOriginalButton).not.toBeVisible();
      await expect(viewer.clearAnnotationsButton).not.toBeVisible();
    } finally {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      if (photoId) await deletePhotoViaApi(page, photoId).catch(() => {});
      if (entryId) await deleteDiaryEntryViaApi(page, entryId).catch(() => {});
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Cancel annotation discards changes without saving
// ─────────────────────────────────────────────────────────────────────────────

test('Cancel annotation discards without saving', async ({
  page,
  testPrefix,
}: {
  page: Page;
  testPrefix: string;
}) => {
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

    await openAnnotator(viewer);

    // Switch to Rectangle and draw a shape
    await viewer.activateTool('rectangle');
    await viewer.drawRectangle();

    // Track whether any PUT fires
    let putFired = false;
    page.on('request', (req: Request) => {
      if (req.url().includes(`/api/photos/${photoId}/annotation`) && req.method() === 'PUT') {
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
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Save failure shows error banner and keeps annotator open
// ─────────────────────────────────────────────────────────────────────────────

test('Save failure shows error banner and keeps annotator open', async ({
  page,
  testPrefix,
}: {
  page: Page;
  testPrefix: string;
}) => {
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
    await openAnnotator(viewer);

    await viewer.activateTool('rectangle');
    await viewer.drawRectangle();

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
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Highlight tool draw and save
// ─────────────────────────────────────────────────────────────────────────────

test('Highlight tool — draw highlight and save', async ({
  page,
  testPrefix,
}: {
  page: Page;
  testPrefix: string;
}) => {
  let entryId: string | null = null;
  let photoId: string | null = null;

  test.setTimeout(25_000);

  try {
    entryId = await createDiaryEntryViaApi(page, {
      entryType: 'general_note',
      entryDate: '2026-05-17',
      body: `${testPrefix} highlight tool test`,
    });
    const photo = await uploadTestPhotoViaApi(page, entryId);
    photoId = photo.id;

    const detailPage = new DiaryEntryDetailPage(page);
    const viewer = new PhotoViewerPage(page);

    await detailPage.goto(entryId);
    await expect(detailPage.backButton).toBeVisible();
    await openPhotoViewer(page, photoId, viewer);
    await openAnnotator(viewer);

    await viewer.activateTool('highlight');
    await expect(viewer.highlightToolButton).toHaveAttribute('aria-pressed', 'true');

    await viewer.drawRectangle(0.2, 0.2, 0.7, 0.5);

    // A <rect data-shapeid> should appear (highlight renders as rect)
    await expect(viewer.svgOverlay.locator('rect[data-shapeid]').first()).toBeVisible();

    // Save and verify
    const [putResponse] = await Promise.all([
      page.waitForResponse(
        (resp) =>
          resp.url().includes(`/api/photos/${photoId}/annotation`) &&
          resp.request().method() === 'PUT',
      ),
      viewer.saveButton.click(),
    ]);
    expect(putResponse.status()).toBe(200);

    await expect(viewer.toolPalette).not.toBeVisible();
  } finally {
    if (photoId) await deletePhotoViaApi(page, photoId).catch(() => {});
    if (entryId) await deleteDiaryEntryViaApi(page, entryId).catch(() => {});
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Arrow tool draw and save
// ─────────────────────────────────────────────────────────────────────────────

test('Arrow tool — draw arrow and save', async ({
  page,
  testPrefix,
}: {
  page: Page;
  testPrefix: string;
}) => {
  let entryId: string | null = null;
  let photoId: string | null = null;

  test.setTimeout(25_000);

  try {
    entryId = await createDiaryEntryViaApi(page, {
      entryType: 'general_note',
      entryDate: '2026-05-17',
      body: `${testPrefix} arrow tool test`,
    });
    const photo = await uploadTestPhotoViaApi(page, entryId);
    photoId = photo.id;

    const detailPage = new DiaryEntryDetailPage(page);
    const viewer = new PhotoViewerPage(page);

    await detailPage.goto(entryId);
    await expect(detailPage.backButton).toBeVisible();
    await openPhotoViewer(page, photoId, viewer);
    await openAnnotator(viewer);

    await viewer.activateTool('arrow');
    await expect(viewer.arrowToolButton).toHaveAttribute('aria-pressed', 'true');

    await viewer.drawLine(0.2, 0.5, 0.7, 0.3);

    // A <line data-shapeid> with marker-end=url(#arrowhead) should appear
    const arrowLine = viewer.svgOverlay.locator('line[data-shapeid]').first();
    await expect(arrowLine).toBeVisible();
    const markerEnd = await arrowLine.getAttribute('marker-end');
    expect(markerEnd).toContain('arrowhead');

    // Save and verify
    const [putResponse] = await Promise.all([
      page.waitForResponse(
        (resp) =>
          resp.url().includes(`/api/photos/${photoId}/annotation`) &&
          resp.request().method() === 'PUT',
      ),
      viewer.saveButton.click(),
    ]);
    expect(putResponse.status()).toBe(200);
    await expect(viewer.toolPalette).not.toBeVisible();
  } finally {
    if (photoId) await deletePhotoViaApi(page, photoId).catch(() => {});
    if (entryId) await deleteDiaryEntryViaApi(page, entryId).catch(() => {});
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Line tool draw and save
// ─────────────────────────────────────────────────────────────────────────────

test('Line tool — draw line and save', async ({
  page,
  testPrefix,
}: {
  page: Page;
  testPrefix: string;
}) => {
  let entryId: string | null = null;
  let photoId: string | null = null;

  test.setTimeout(25_000);

  try {
    entryId = await createDiaryEntryViaApi(page, {
      entryType: 'general_note',
      entryDate: '2026-05-17',
      body: `${testPrefix} line tool test`,
    });
    const photo = await uploadTestPhotoViaApi(page, entryId);
    photoId = photo.id;

    const detailPage = new DiaryEntryDetailPage(page);
    const viewer = new PhotoViewerPage(page);

    await detailPage.goto(entryId);
    await expect(detailPage.backButton).toBeVisible();
    await openPhotoViewer(page, photoId, viewer);
    await openAnnotator(viewer);

    await viewer.activateTool('line');
    await expect(viewer.lineToolButton).toHaveAttribute('aria-pressed', 'true');

    await viewer.drawLine(0.2, 0.5, 0.7, 0.5);

    // A <line data-shapeid> should appear (no marker-end for plain line).
    // Use waitFor to allow React state to propagate after the pointer-up event.
    const lineEl = viewer.svgOverlay.locator('line[data-shapeid]').first();
    await lineEl.waitFor({ state: 'visible' });
    // Arrow has marker-end; plain line has marker-end="none" or absent
    const markerEnd = await lineEl.getAttribute('marker-end');
    expect(markerEnd === null || markerEnd === 'none').toBe(true);

    // Save and verify
    const [putResponse] = await Promise.all([
      page.waitForResponse(
        (resp) =>
          resp.url().includes(`/api/photos/${photoId}/annotation`) &&
          resp.request().method() === 'PUT',
      ),
      viewer.saveButton.click(),
    ]);
    expect(putResponse.status()).toBe(200);
    await expect(viewer.toolPalette).not.toBeVisible();
  } finally {
    if (photoId) await deletePhotoViaApi(page, photoId).catch(() => {});
    if (entryId) await deleteDiaryEntryViaApi(page, entryId).catch(() => {});
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: Line tool — Shift-snap to 45°
// ─────────────────────────────────────────────────────────────────────────────

test('Line tool — Shift-snap constrains angle to 45° increments', async ({
  page,
  testPrefix,
}: {
  page: Page;
  testPrefix: string;
}) => {
  let entryId: string | null = null;
  let photoId: string | null = null;

  test.setTimeout(20_000);

  try {
    entryId = await createDiaryEntryViaApi(page, {
      entryType: 'general_note',
      entryDate: '2026-05-17',
      body: `${testPrefix} line shift-snap test`,
    });
    const photo = await uploadTestPhotoViaApi(page, entryId);
    photoId = photo.id;

    const detailPage = new DiaryEntryDetailPage(page);
    const viewer = new PhotoViewerPage(page);

    await detailPage.goto(entryId);
    await expect(detailPage.backButton).toBeVisible();
    await openPhotoViewer(page, photoId, viewer);
    await openAnnotator(viewer);

    await viewer.activateTool('line');

    // Draw with Shift held: drag roughly horizontal (startY ~= endY) → should
    // snap to exactly horizontal (0°). We drag at a ~5° angle but expect snap.
    const svgBox = await viewer.svgOverlay.boundingBox();
    expect(svgBox).not.toBeNull();

    const startX = svgBox!.x + svgBox!.width * 0.2;
    const startY = svgBox!.y + svgBox!.height * 0.5;
    // End is slightly below horizontal (5° angle) — should snap to 0°
    const endX = svgBox!.x + svgBox!.width * 0.7;
    const endY = startY + svgBox!.height * 0.05;

    await page.keyboard.down('Shift');
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.up('Shift');

    // The committed line should have y1 ≈ y2 (horizontal snap).
    // Use waitFor to allow React state to propagate after the pointer-up event.
    const lineEl = viewer.svgOverlay.locator('line[data-shapeid]').first();
    await lineEl.waitFor({ state: 'visible' });

    const y1 = parseFloat((await lineEl.getAttribute('y1')) ?? '0');
    const y2 = parseFloat((await lineEl.getAttribute('y2')) ?? '0');
    // Allow ≤1px tolerance in image-space (SVG viewBox is 100px)
    expect(Math.abs(y1 - y2)).toBeLessThan(2);
  } finally {
    if (photoId) await deletePhotoViaApi(page, photoId).catch(() => {});
    if (entryId) await deleteDiaryEntryViaApi(page, entryId).catch(() => {});
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8: Ellipse tool draw and save
// ─────────────────────────────────────────────────────────────────────────────

test('Ellipse tool — draw ellipse and save', async ({
  page,
  testPrefix,
}: {
  page: Page;
  testPrefix: string;
}) => {
  let entryId: string | null = null;
  let photoId: string | null = null;

  test.setTimeout(25_000);

  try {
    entryId = await createDiaryEntryViaApi(page, {
      entryType: 'general_note',
      entryDate: '2026-05-17',
      body: `${testPrefix} ellipse tool test`,
    });
    const photo = await uploadTestPhotoViaApi(page, entryId);
    photoId = photo.id;

    const detailPage = new DiaryEntryDetailPage(page);
    const viewer = new PhotoViewerPage(page);

    await detailPage.goto(entryId);
    await expect(detailPage.backButton).toBeVisible();
    await openPhotoViewer(page, photoId, viewer);
    await openAnnotator(viewer);

    await viewer.activateTool('ellipse');
    await expect(viewer.ellipseToolButton).toHaveAttribute('aria-pressed', 'true');

    await viewer.drawEllipse(0.2, 0.2, 0.7, 0.6);

    // An <ellipse data-shapeid> should appear
    await expect(viewer.svgOverlay.locator('ellipse[data-shapeid]').first()).toBeVisible();

    // Save and verify
    const [putResponse] = await Promise.all([
      page.waitForResponse(
        (resp) =>
          resp.url().includes(`/api/photos/${photoId}/annotation`) &&
          resp.request().method() === 'PUT',
      ),
      viewer.saveButton.click(),
    ]);
    expect(putResponse.status()).toBe(200);
    await expect(viewer.toolPalette).not.toBeVisible();
  } finally {
    if (photoId) await deletePhotoViaApi(page, photoId).catch(() => {});
    if (entryId) await deleteDiaryEntryViaApi(page, entryId).catch(() => {});
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 9: Ellipse — Shift-snap to circle
// ─────────────────────────────────────────────────────────────────────────────

test('Ellipse tool — Shift-snap produces circle (rx === ry)', async ({
  page,
  testPrefix,
}: {
  page: Page;
  testPrefix: string;
}) => {
  let entryId: string | null = null;
  let photoId: string | null = null;

  test.setTimeout(20_000);

  try {
    entryId = await createDiaryEntryViaApi(page, {
      entryType: 'general_note',
      entryDate: '2026-05-17',
      body: `${testPrefix} ellipse circle snap test`,
    });
    const photo = await uploadTestPhotoViaApi(page, entryId);
    photoId = photo.id;

    const detailPage = new DiaryEntryDetailPage(page);
    const viewer = new PhotoViewerPage(page);

    await detailPage.goto(entryId);
    await expect(detailPage.backButton).toBeVisible();
    await openPhotoViewer(page, photoId, viewer);
    await openAnnotator(viewer);

    await viewer.activateTool('ellipse');

    // Draw with Shift: wide horizontal drag → should snap to circle
    const svgBox = await viewer.svgOverlay.boundingBox();
    expect(svgBox).not.toBeNull();

    const startX = svgBox!.x + svgBox!.width * 0.2;
    const startY = svgBox!.y + svgBox!.height * 0.2;
    // Drag much wider than tall → without Shift: rx >> ry; with Shift: rx = ry
    const endX = svgBox!.x + svgBox!.width * 0.7;
    const endY = svgBox!.y + svgBox!.height * 0.35;

    await page.keyboard.down('Shift');
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.up('Shift');

    const ellipseEl = viewer.svgOverlay.locator('ellipse[data-shapeid]').first();
    await expect(ellipseEl).toBeVisible();

    const rx = parseFloat((await ellipseEl.getAttribute('rx')) ?? '0');
    const ry = parseFloat((await ellipseEl.getAttribute('ry')) ?? '0');
    // Both radii should be equal (circle constraint)
    expect(Math.abs(rx - ry)).toBeLessThan(1);
  } finally {
    if (photoId) await deletePhotoViaApi(page, photoId).catch(() => {});
    if (entryId) await deleteDiaryEntryViaApi(page, entryId).catch(() => {});
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 10: Text tool — click, type, Enter commits shape
// ─────────────────────────────────────────────────────────────────────────────

test('Text tool — tap to place, type text, Enter commits shape', async ({
  page,
  testPrefix,
}: {
  page: Page;
  testPrefix: string;
}) => {
  let entryId: string | null = null;
  let photoId: string | null = null;

  test.setTimeout(25_000);

  try {
    entryId = await createDiaryEntryViaApi(page, {
      entryType: 'general_note',
      entryDate: '2026-05-17',
      body: `${testPrefix} text tool test`,
    });
    const photo = await uploadTestPhotoViaApi(page, entryId);
    photoId = photo.id;

    const detailPage = new DiaryEntryDetailPage(page);
    const viewer = new PhotoViewerPage(page);

    await detailPage.goto(entryId);
    await expect(detailPage.backButton).toBeVisible();
    await openPhotoViewer(page, photoId, viewer);
    await openAnnotator(viewer);

    await viewer.activateTool('text');
    await expect(viewer.textToolButton).toHaveAttribute('aria-pressed', 'true');

    // Click the SVG to open the inline input
    const svgBox = await viewer.svgOverlay.boundingBox();
    expect(svgBox).not.toBeNull();
    await page.mouse.click(
      svgBox!.x + svgBox!.width * 0.3,
      svgBox!.y + svgBox!.height * 0.3,
    );

    // Inline input should open
    await expect(viewer.inlineInput).toBeVisible();

    // Type text and commit with Enter
    await viewer.inlineInput.fill('Inspection point');
    await page.keyboard.press('Enter');

    // Inline input closes
    await expect(viewer.inlineInput).not.toBeVisible();

    // A <text data-shapeid> should appear in the SVG
    const textEl = viewer.svgOverlay.locator('text[data-shapeid]').first();
    await expect(textEl).toBeVisible();
    expect(await textEl.textContent()).toBe('Inspection point');

    // Save and verify
    const [putResponse] = await Promise.all([
      page.waitForResponse(
        (resp) =>
          resp.url().includes(`/api/photos/${photoId}/annotation`) &&
          resp.request().method() === 'PUT',
      ),
      viewer.saveButton.click(),
    ]);
    expect(putResponse.status()).toBe(200);
    await expect(viewer.toolPalette).not.toBeVisible();
  } finally {
    if (photoId) await deletePhotoViaApi(page, photoId).catch(() => {});
    if (entryId) await deleteDiaryEntryViaApi(page, entryId).catch(() => {});
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 11: Text tool — Escape discards draft
// ─────────────────────────────────────────────────────────────────────────────

test('Text tool — Escape discards the draft without adding a shape', async ({
  page,
  testPrefix,
}: {
  page: Page;
  testPrefix: string;
}) => {
  let entryId: string | null = null;
  let photoId: string | null = null;

  test.setTimeout(20_000);

  try {
    entryId = await createDiaryEntryViaApi(page, {
      entryType: 'general_note',
      entryDate: '2026-05-17',
      body: `${testPrefix} text escape test`,
    });
    const photo = await uploadTestPhotoViaApi(page, entryId);
    photoId = photo.id;

    const detailPage = new DiaryEntryDetailPage(page);
    const viewer = new PhotoViewerPage(page);

    await detailPage.goto(entryId);
    await expect(detailPage.backButton).toBeVisible();
    await openPhotoViewer(page, photoId, viewer);
    await openAnnotator(viewer);

    await viewer.activateTool('text');

    // Click to open inline input
    const svgBox = await viewer.svgOverlay.boundingBox();
    expect(svgBox).not.toBeNull();
    await page.mouse.click(
      svgBox!.x + svgBox!.width * 0.4,
      svgBox!.y + svgBox!.height * 0.4,
    );

    await expect(viewer.inlineInput).toBeVisible();

    // Type something then press Escape
    await viewer.inlineInput.fill('should be discarded');
    await page.keyboard.press('Escape');

    // Inline input closes
    await expect(viewer.inlineInput).not.toBeVisible();

    // No text shape should have been committed
    await expect(viewer.svgOverlay.locator('text[data-shapeid]')).toHaveCount(0);
  } finally {
    if (photoId) await deletePhotoViaApi(page, photoId).catch(() => {});
    if (entryId) await deleteDiaryEntryViaApi(page, entryId).catch(() => {});
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 12: [smoke] Callout tool — two-phase drag + text
// ─────────────────────────────────────────────────────────────────────────────

test(
  '[smoke] Callout tool — draw box, place tail, type text, commits callout shape',
  { tag: '@smoke' },
  async ({ page, testPrefix }: { page: Page; testPrefix: string }) => {
    let entryId: string | null = null;
    let photoId: string | null = null;

    test.setTimeout(30_000);

    try {
      entryId = await createDiaryEntryViaApi(page, {
        entryType: 'general_note',
        entryDate: '2026-05-17',
        body: `${testPrefix} callout tool test`,
      });
      const photo = await uploadTestPhotoViaApi(page, entryId);
      photoId = photo.id;

      const detailPage = new DiaryEntryDetailPage(page);
      const viewer = new PhotoViewerPage(page);

      await detailPage.goto(entryId);
      await expect(detailPage.backButton).toBeVisible();
      await openPhotoViewer(page, photoId, viewer);
      await openAnnotator(viewer);

      await viewer.activateTool('callout');
      await expect(viewer.calloutToolButton).toHaveAttribute('aria-pressed', 'true');

      // Draw callout: box at top-left, tail pointing to center-right
      await viewer.drawCallout(0.05, 0.05, 0.45, 0.35, 0.7, 0.6, 'Defect found');

      // A <g data-shapeid> containing <rect>, <line>, <text> should appear.
      // The callout has 3 interaction phases (drag box, click tail, type text + Enter);
      // use waitFor to give React time to commit the shape after the last phase.
      const calloutGroup = viewer.svgOverlay.locator('g[data-shapeid]').first();
      await calloutGroup.waitFor({ state: 'visible' });

      // The text content should be "Defect found"
      const calloutText = calloutGroup.locator('text').first();
      await expect(calloutText).toBeVisible();
      expect(await calloutText.textContent()).toBe('Defect found');

      // Save and verify
      const [putResponse] = await Promise.all([
        page.waitForResponse(
          (resp) =>
            resp.url().includes(`/api/photos/${photoId}/annotation`) &&
            resp.request().method() === 'PUT',
        ),
        viewer.saveButton.click(),
      ]);
      expect(putResponse.status()).toBe(200);
      await expect(viewer.toolPalette).not.toBeVisible();
    } finally {
      if (photoId) await deletePhotoViaApi(page, photoId).catch(() => {});
      if (entryId) await deleteDiaryEntryViaApi(page, entryId).catch(() => {});
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 13: Measurement tool — drag, type label, Enter commits with label
// ─────────────────────────────────────────────────────────────────────────────

test('Measurement tool — drag, type label, Enter commits with label text', async ({
  page,
  testPrefix,
}: {
  page: Page;
  testPrefix: string;
}) => {
  let entryId: string | null = null;
  let photoId: string | null = null;

  test.setTimeout(25_000);

  try {
    entryId = await createDiaryEntryViaApi(page, {
      entryType: 'general_note',
      entryDate: '2026-05-17',
      body: `${testPrefix} measurement label test`,
    });
    const photo = await uploadTestPhotoViaApi(page, entryId);
    photoId = photo.id;

    const detailPage = new DiaryEntryDetailPage(page);
    const viewer = new PhotoViewerPage(page);

    await detailPage.goto(entryId);
    await expect(detailPage.backButton).toBeVisible();
    await openPhotoViewer(page, photoId, viewer);
    await openAnnotator(viewer);

    await viewer.activateTool('measurement');
    await expect(viewer.measurementToolButton).toHaveAttribute('aria-pressed', 'true');

    // Draw measurement and enter label
    await viewer.drawMeasurement(0.1, 0.5, 0.8, 0.5, '3.5m');

    // A <g data-shapeid> should appear containing lines + text.
    // Use waitFor to handle async React state propagation after inline input commit.
    const measureGroup = viewer.svgOverlay.locator('g[data-shapeid]').first();
    await measureGroup.waitFor({ state: 'visible' });

    // Text label should be present and contain our label
    const labelText = measureGroup.locator('text').first();
    await expect(labelText).toBeVisible();
    expect(await labelText.textContent()).toBe('3.5m');

    // Save and verify
    const [putResponse] = await Promise.all([
      page.waitForResponse(
        (resp) =>
          resp.url().includes(`/api/photos/${photoId}/annotation`) &&
          resp.request().method() === 'PUT',
      ),
      viewer.saveButton.click(),
    ]);
    expect(putResponse.status()).toBe(200);
    await expect(viewer.toolPalette).not.toBeVisible();
  } finally {
    if (photoId) await deletePhotoViaApi(page, photoId).catch(() => {});
    if (entryId) await deleteDiaryEntryViaApi(page, entryId).catch(() => {});
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 14: Measurement tool — Escape commits with empty label
// ─────────────────────────────────────────────────────────────────────────────

test('Measurement tool — Escape commits line with empty label', async ({
  page,
  testPrefix,
}: {
  page: Page;
  testPrefix: string;
}) => {
  let entryId: string | null = null;
  let photoId: string | null = null;

  test.setTimeout(20_000);

  try {
    entryId = await createDiaryEntryViaApi(page, {
      entryType: 'general_note',
      entryDate: '2026-05-17',
      body: `${testPrefix} measurement escape test`,
    });
    const photo = await uploadTestPhotoViaApi(page, entryId);
    photoId = photo.id;

    const detailPage = new DiaryEntryDetailPage(page);
    const viewer = new PhotoViewerPage(page);

    await detailPage.goto(entryId);
    await expect(detailPage.backButton).toBeVisible();
    await openPhotoViewer(page, photoId, viewer);
    await openAnnotator(viewer);

    await viewer.activateTool('measurement');

    // Drag measurement line
    const svgBox = await viewer.svgOverlay.boundingBox();
    expect(svgBox).not.toBeNull();
    await page.mouse.move(svgBox!.x + svgBox!.width * 0.2, svgBox!.y + svgBox!.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(svgBox!.x + svgBox!.width * 0.7, svgBox!.y + svgBox!.height * 0.5, {
      steps: 5,
    });
    await page.mouse.up();

    // Inline input appears — press Escape without typing
    await expect(viewer.inlineInput).toBeVisible();
    await page.keyboard.press('Escape');

    // For measurement, Escape commits with whatever is in the field (empty)
    await expect(viewer.inlineInput).not.toBeVisible();

    // The <g data-shapeid> should exist (line committed) ...
    // Use waitFor to handle async state propagation after Escape-commit.
    const measureGroup = viewer.svgOverlay.locator('g[data-shapeid]').first();
    await measureGroup.waitFor({ state: 'visible' });

    // ... but should NOT contain a visible <text> child (empty label → display:none)
    // The text element exists in DOM but has display:none when label is empty.
    // We verify no text content is visible.
    const textEls = measureGroup.locator('text');
    const textCount = await textEls.count();
    if (textCount > 0) {
      // If a text element exists, it should be hidden or have empty content
      const displayAttr = await textEls.first().getAttribute('display');
      const textContent = await textEls.first().textContent();
      expect(displayAttr === 'none' || textContent === '').toBe(true);
    }
  } finally {
    if (photoId) await deletePhotoViaApi(page, photoId).catch(() => {});
    if (entryId) await deleteDiaryEntryViaApi(page, entryId).catch(() => {});
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 15: Freehand tool — drag stroke, commits polyline
// ─────────────────────────────────────────────────────────────────────────────

test('Freehand tool — drag stroke commits polyline shape', async ({
  page,
  testPrefix,
}: {
  page: Page;
  testPrefix: string;
}) => {
  let entryId: string | null = null;
  let photoId: string | null = null;

  test.setTimeout(25_000);

  try {
    entryId = await createDiaryEntryViaApi(page, {
      entryType: 'general_note',
      entryDate: '2026-05-17',
      body: `${testPrefix} freehand tool test`,
    });
    const photo = await uploadTestPhotoViaApi(page, entryId);
    photoId = photo.id;

    const detailPage = new DiaryEntryDetailPage(page);
    const viewer = new PhotoViewerPage(page);

    await detailPage.goto(entryId);
    await expect(detailPage.backButton).toBeVisible();
    await openPhotoViewer(page, photoId, viewer);
    await openAnnotator(viewer);

    await viewer.activateTool('freehand');
    await expect(viewer.freehandToolButton).toHaveAttribute('aria-pressed', 'true');

    await viewer.drawFreehand(0.1, 0.5, [
      [0.25, 0.35],
      [0.4, 0.55],
      [0.55, 0.35],
      [0.7, 0.5],
    ]);

    // A <polyline data-shapeid> should appear
    await expect(viewer.svgOverlay.locator('polyline[data-shapeid]').first()).toBeVisible();

    // Verify the polyline has points attribute with multiple coordinates
    const polylineEl = viewer.svgOverlay.locator('polyline[data-shapeid]').first();
    const pointsAttr = await polylineEl.getAttribute('points');
    expect(pointsAttr).not.toBeNull();
    // Should have at least 2 coordinate pairs
    const pairCount = (pointsAttr ?? '').trim().split(/\s+/).length;
    expect(pairCount).toBeGreaterThanOrEqual(2);

    // Save and verify
    const [putResponse] = await Promise.all([
      page.waitForResponse(
        (resp) =>
          resp.url().includes(`/api/photos/${photoId}/annotation`) &&
          resp.request().method() === 'PUT',
      ),
      viewer.saveButton.click(),
    ]);
    expect(putResponse.status()).toBe(200);
    await expect(viewer.toolPalette).not.toBeVisible();
  } finally {
    if (photoId) await deletePhotoViaApi(page, photoId).catch(() => {});
    if (entryId) await deleteDiaryEntryViaApi(page, entryId).catch(() => {});
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 16: [smoke] @responsive Freehand on mobile — pointer drag → polyline
// ─────────────────────────────────────────────────────────────────────────────

test(
  '[smoke] @responsive Freehand tool on mobile — pointer drag captures stroke',
  { tag: ['@smoke', '@responsive'] },
  async ({ page, testPrefix }: { page: Page; testPrefix: string }) => {
    let entryId: string | null = null;
    let photoId: string | null = null;

    test.setTimeout(40_000);

    try {
      entryId = await createDiaryEntryViaApi(page, {
        entryType: 'general_note',
        entryDate: '2026-05-17',
        body: `${testPrefix} freehand mobile test`,
      });
      const photo = await uploadTestPhotoViaApi(page, entryId);
      photoId = photo.id;

      const detailPage = new DiaryEntryDetailPage(page);
      const viewer = new PhotoViewerPage(page);

      await detailPage.goto(entryId);
      await expect(detailPage.backButton).toBeVisible();
      await openPhotoViewer(page, photoId, viewer);
      await openAnnotator(viewer);

      await viewer.activateTool('freehand');
      await expect(viewer.freehandToolButton).toHaveAttribute('aria-pressed', 'true');

      // On mobile/tablet, use touch-compatible pointer events via drawFreehandTouch
      await viewer.drawFreehandTouch(0.1, 0.4, [
        [0.3, 0.3],
        [0.5, 0.6],
        [0.7, 0.3],
      ]);

      // A <polyline data-shapeid> should appear.
      // Use waitFor with explicit state to handle async React state propagation
      // after pointer-up — mobile/touch events can be slower to flush.
      const polylineEl = viewer.svgOverlay.locator('polyline[data-shapeid]').first();
      await polylineEl.waitFor({ state: 'visible' });

      // Save and verify
      const [putResponse] = await Promise.all([
        page.waitForResponse(
          (resp) =>
            resp.url().includes(`/api/photos/${photoId}/annotation`) &&
            resp.request().method() === 'PUT',
        ),
        viewer.saveButton.click(),
      ]);
      expect(putResponse.status()).toBe(200);
      await expect(viewer.toolPalette).not.toBeVisible();
    } finally {
      if (photoId) await deletePhotoViaApi(page, photoId).catch(() => {});
      if (entryId) await deleteDiaryEntryViaApi(page, entryId).catch(() => {});
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 17: @responsive Measurement tool on tablet/mobile — inline input
// ─────────────────────────────────────────────────────────────────────────────

test(
  '@responsive Measurement tool — inline input appears after drag on mobile/tablet',
  { tag: '@responsive' },
  async ({ page, testPrefix }: { page: Page; testPrefix: string }) => {
    let entryId: string | null = null;
    let photoId: string | null = null;

    test.setTimeout(40_000);

    try {
      entryId = await createDiaryEntryViaApi(page, {
        entryType: 'general_note',
        entryDate: '2026-05-17',
        body: `${testPrefix} measurement mobile test`,
      });
      const photo = await uploadTestPhotoViaApi(page, entryId);
      photoId = photo.id;

      const detailPage = new DiaryEntryDetailPage(page);
      const viewer = new PhotoViewerPage(page);

      await detailPage.goto(entryId);
      await expect(detailPage.backButton).toBeVisible();
      await openPhotoViewer(page, photoId, viewer);
      await openAnnotator(viewer);

      await viewer.activateTool('measurement');

      // Draw measurement line using pointer events (works on mobile WebKit too)
      const svgBox = await viewer.svgOverlay.boundingBox();
      expect(svgBox).not.toBeNull();
      await page.mouse.move(svgBox!.x + svgBox!.width * 0.15, svgBox!.y + svgBox!.height * 0.5);
      await page.mouse.down();
      await page.mouse.move(svgBox!.x + svgBox!.width * 0.75, svgBox!.y + svgBox!.height * 0.5, {
        steps: 5,
      });
      await page.mouse.up();

      // Inline input should appear at the midpoint
      await expect(viewer.inlineInput).toBeVisible();

      // Type a label and commit
      await viewer.inlineInput.fill('2.5m');
      await page.keyboard.press('Enter');
      await expect(viewer.inlineInput).not.toBeVisible();

      // Measurement group committed — use waitFor to handle async state propagation.
      const measureGroup = viewer.svgOverlay.locator('g[data-shapeid]').first();
      await measureGroup.waitFor({ state: 'visible' });
    } finally {
      if (photoId) await deletePhotoViaApi(page, photoId).catch(() => {});
      if (entryId) await deleteDiaryEntryViaApi(page, entryId).catch(() => {});
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 18: Undo removes the last shape; Redo restores it
// ─────────────────────────────────────────────────────────────────────────────

test('Undo removes last committed shape; Redo restores it', async ({
  page,
  testPrefix,
}: {
  page: Page;
  testPrefix: string;
}) => {
  let entryId: string | null = null;
  let photoId: string | null = null;

  test.setTimeout(20_000);

  try {
    entryId = await createDiaryEntryViaApi(page, {
      entryType: 'general_note',
      entryDate: '2026-05-17',
      body: `${testPrefix} undo redo test`,
    });
    const photo = await uploadTestPhotoViaApi(page, entryId);
    photoId = photo.id;

    const detailPage = new DiaryEntryDetailPage(page);
    const viewer = new PhotoViewerPage(page);

    await detailPage.goto(entryId);
    await expect(detailPage.backButton).toBeVisible();
    await openPhotoViewer(page, photoId, viewer);
    await openAnnotator(viewer);

    // Draw a rectangle
    await viewer.activateTool('rectangle');
    await viewer.drawRectangle();
    await expect(viewer.svgOverlay.locator('rect[data-shapeid]').first()).toBeVisible();

    // Undo button should now be enabled
    await expect(viewer.undoButton).not.toBeDisabled();

    // Click Undo → shape disappears
    await viewer.undoButton.click();
    await expect(viewer.svgOverlay.locator('rect[data-shapeid]')).toHaveCount(0);

    // Redo button should now be enabled
    await expect(viewer.redoButton).not.toBeDisabled();

    // Click Redo → shape reappears
    await viewer.redoButton.click();
    await expect(viewer.svgOverlay.locator('rect[data-shapeid]').first()).toBeVisible();
  } finally {
    if (photoId) await deletePhotoViaApi(page, photoId).catch(() => {});
    if (entryId) await deleteDiaryEntryViaApi(page, entryId).catch(() => {});
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 19: Select tool moves a committed rectangle
// ─────────────────────────────────────────────────────────────────────────────

test('Select tool — drag moves a committed rectangle', async ({
  page,
  testPrefix,
}: {
  page: Page;
  testPrefix: string;
}) => {
  let entryId: string | null = null;
  let photoId: string | null = null;

  test.setTimeout(25_000);

  try {
    entryId = await createDiaryEntryViaApi(page, {
      entryType: 'general_note',
      entryDate: '2026-05-17',
      body: `${testPrefix} select move test`,
    });
    const photo = await uploadTestPhotoViaApi(page, entryId);
    photoId = photo.id;

    const detailPage = new DiaryEntryDetailPage(page);
    const viewer = new PhotoViewerPage(page);

    await detailPage.goto(entryId);
    await expect(detailPage.backButton).toBeVisible();
    await openPhotoViewer(page, photoId, viewer);
    await openAnnotator(viewer);

    // Draw a rectangle in the center
    await viewer.activateTool('rectangle');
    await viewer.drawRectangle(0.3, 0.3, 0.6, 0.6);

    const rectEl = viewer.svgOverlay.locator('rect[data-shapeid]').first();
    await expect(rectEl).toBeVisible();

    // Capture original position
    const originalX = parseFloat((await rectEl.getAttribute('x')) ?? '0');

    // Switch to Select tool and drag the rectangle to the right
    await viewer.activateTool('select');

    const svgBox = await viewer.svgOverlay.boundingBox();
    expect(svgBox).not.toBeNull();

    // Center of the rectangle in screen coords (~0.45, 0.45 of SVG)
    const centerX = svgBox!.x + svgBox!.width * 0.45;
    const centerY = svgBox!.y + svgBox!.height * 0.45;
    const targetX = centerX + svgBox!.width * 0.2;
    const targetY = centerY;

    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await page.mouse.move(targetX, targetY, { steps: 5 });
    await page.mouse.up();

    // Poll until the x attribute changes from originalX to account for the
    // async React state propagation after handlePointerUp fires COMMIT_DRAFT.
    await expect.poll(async () => {
      const xStr = await rectEl.getAttribute('x');
      return parseFloat(xStr ?? '0');
    }).toBeGreaterThan(originalX);
  } finally {
    if (photoId) await deletePhotoViaApi(page, photoId).catch(() => {});
    if (entryId) await deleteDiaryEntryViaApi(page, entryId).catch(() => {});
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 20: Select tool — Delete key removes selected shape
// ─────────────────────────────────────────────────────────────────────────────

test('Select tool — Delete key removes the selected shape', async ({
  page,
  testPrefix,
}: {
  page: Page;
  testPrefix: string;
}) => {
  let entryId: string | null = null;
  let photoId: string | null = null;

  test.setTimeout(20_000);

  try {
    entryId = await createDiaryEntryViaApi(page, {
      entryType: 'general_note',
      entryDate: '2026-05-17',
      body: `${testPrefix} delete shape test`,
    });
    const photo = await uploadTestPhotoViaApi(page, entryId);
    photoId = photo.id;

    const detailPage = new DiaryEntryDetailPage(page);
    const viewer = new PhotoViewerPage(page);

    await detailPage.goto(entryId);
    await expect(detailPage.backButton).toBeVisible();
    await openPhotoViewer(page, photoId, viewer);
    await openAnnotator(viewer);

    // Draw a rectangle
    await viewer.activateTool('rectangle');
    await viewer.drawRectangle(0.3, 0.3, 0.6, 0.6);
    await expect(viewer.svgOverlay.locator('rect[data-shapeid]').first()).toBeVisible();

    // Switch to Select and click the rectangle to select it
    await viewer.activateTool('select');

    const svgBox = await viewer.svgOverlay.boundingBox();
    expect(svgBox).not.toBeNull();

    // Click the center of the drawn rectangle
    await page.mouse.click(
      svgBox!.x + svgBox!.width * 0.45,
      svgBox!.y + svgBox!.height * 0.45,
    );

    // Press Delete key
    await page.keyboard.press('Delete');

    // The rect should be gone
    await expect(viewer.svgOverlay.locator('rect[data-shapeid]')).toHaveCount(0);
  } finally {
    if (photoId) await deletePhotoViaApi(page, photoId).catch(() => {});
    if (entryId) await deleteDiaryEntryViaApi(page, entryId).catch(() => {});
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 21: [smoke] @responsive Full lifecycle on all viewports
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scenario 21 — Multi-tool lifecycle across all viewports:
 *
 * 1. Draw rectangle, ellipse, and freehand stroke
 * 2. Save → PUT returns 200
 * 3. Verify View Original toggle and Clear Annotations flow
 */
test(
  '[smoke] @responsive Multi-tool lifecycle — draw 3 shapes, save, view original, clear',
  { tag: ['@smoke', '@responsive'] },
  async ({ page, testPrefix }: { page: Page; testPrefix: string }) => {
    let entryId: string | null = null;
    let photoId: string | null = null;
    let photoFileUrl: string | null = null;
    let photoThumbnailUrl: string | null = null;
    let photosApiGlob: string | null = null;

    test.setTimeout(60_000);

    try {
      entryId = await createDiaryEntryViaApi(page, {
        entryType: 'general_note',
        entryDate: '2026-05-17',
        body: `${testPrefix} multi-tool lifecycle`,
      });
      const uploadedPhoto = await uploadTestPhotoViaApi(page, entryId);
      photoId = uploadedPhoto.id;
      photoFileUrl = uploadedPhoto.fileUrl;
      photoThumbnailUrl = uploadedPhoto.thumbnailUrl;

      const detailPage = new DiaryEntryDetailPage(page);
      const viewer = new PhotoViewerPage(page);

      await detailPage.goto(entryId);
      await expect(detailPage.backButton).toBeVisible();
      await openPhotoViewer(page, photoId, viewer);
      await openAnnotator(viewer);

      // Draw Rectangle
      await viewer.activateTool('rectangle');
      await viewer.drawRectangle(0.1, 0.1, 0.4, 0.4);
      await expect(viewer.svgOverlay.locator('rect[data-shapeid]').first()).toBeVisible();

      // Draw Ellipse
      await viewer.activateTool('ellipse');
      await viewer.drawEllipse(0.5, 0.1, 0.9, 0.4);
      await expect(viewer.svgOverlay.locator('ellipse[data-shapeid]').first()).toBeVisible();

      // Draw Freehand
      await viewer.activateTool('freehand');
      await viewer.drawFreehand(0.1, 0.7, [
        [0.3, 0.6],
        [0.5, 0.8],
        [0.7, 0.6],
      ]);
      await expect(viewer.svgOverlay.locator('polyline[data-shapeid]').first()).toBeVisible();

      // Save
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
        photo: { annotatedAt: string | null };
      };
      expect(putBody.photo.annotatedAt).not.toBeNull();
      const savedAnnotatedAt = putBody.photo.annotatedAt!;

      await expect(viewer.toolPalette).not.toBeVisible();
      await viewer.closeButton.click();

      // Bug #1482 workaround: re-navigate with mock
      photosApiGlob = await reopenViewerWithAnnotatedPhoto(
        page,
        detailPage,
        viewer,
        entryId,
        photoId,
        savedAnnotatedAt,
        photoFileUrl!,
        photoThumbnailUrl!,
      );

      await expect(viewer.viewOriginalButton).toBeVisible();
      await expect(viewer.clearAnnotationsButton).toBeVisible();

      // Toggle View Original
      await viewer.viewOriginalButton.click();
      await expect(viewer.viewOriginalButton).toHaveAttribute('aria-pressed', 'true');
      await viewer.viewOriginalButton.click();
      await expect(viewer.viewOriginalButton).toHaveAttribute('aria-pressed', 'false');

      // Clear Annotations
      await viewer.clearAnnotationsButton.click();
      const clearModal = page.getByRole('dialog');
      await expect(clearModal).toBeVisible();

      await page.unroute(photosApiGlob);
      photosApiGlob = null;

      const [deleteResponse] = await Promise.all([
        page.waitForResponse(
          (resp) =>
            resp.url().includes(`/api/photos/${photoId}/annotation`) &&
            resp.request().method() === 'DELETE',
        ),
        clearModal.getByRole('button').last().click(),
      ]);
      expect(deleteResponse.status()).toBe(204);

      await expect(viewer.viewOriginalButton).not.toBeVisible();
      await expect(viewer.clearAnnotationsButton).not.toBeVisible();
    } finally {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      if (photoId) await deletePhotoViaApi(page, photoId).catch(() => {});
      if (entryId) await deleteDiaryEntryViaApi(page, entryId).catch(() => {});
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 22: All 10 tool buttons visible; switching updates aria-pressed
// ─────────────────────────────────────────────────────────────────────────────

test('Tool palette — all 10 tools visible; switching tool updates aria-pressed', async ({
  page,
  testPrefix,
}: {
  page: Page;
  testPrefix: string;
}) => {
  let entryId: string | null = null;
  let photoId: string | null = null;

  test.setTimeout(20_000);

  try {
    entryId = await createDiaryEntryViaApi(page, {
      entryType: 'general_note',
      entryDate: '2026-05-17',
      body: `${testPrefix} tool palette test`,
    });
    const photo = await uploadTestPhotoViaApi(page, entryId);
    photoId = photo.id;

    const detailPage = new DiaryEntryDetailPage(page);
    const viewer = new PhotoViewerPage(page);

    await detailPage.goto(entryId);
    await expect(detailPage.backButton).toBeVisible();
    await openPhotoViewer(page, photoId, viewer);
    await openAnnotator(viewer);

    // Verify all 10 tool buttons are visible
    await expect(viewer.selectToolButton).toBeVisible();
    await expect(viewer.rectangleToolButton).toBeVisible();
    await expect(viewer.highlightToolButton).toBeVisible();
    await expect(viewer.arrowToolButton).toBeVisible();
    await expect(viewer.lineToolButton).toBeVisible();
    await expect(viewer.ellipseToolButton).toBeVisible();
    await expect(viewer.textToolButton).toBeVisible();
    await expect(viewer.calloutToolButton).toBeVisible();
    await expect(viewer.measurementToolButton).toBeVisible();
    await expect(viewer.freehandToolButton).toBeVisible();

    // Default: Select is pressed, all others are not
    await expect(viewer.selectToolButton).toHaveAttribute('aria-pressed', 'true');

    const allOtherTools: Array<{ button: typeof viewer.rectangleToolButton; name: string }> = [
      { button: viewer.rectangleToolButton, name: 'rectangle' },
      { button: viewer.highlightToolButton, name: 'highlight' },
      { button: viewer.arrowToolButton, name: 'arrow' },
      { button: viewer.lineToolButton, name: 'line' },
      { button: viewer.ellipseToolButton, name: 'ellipse' },
      { button: viewer.textToolButton, name: 'text' },
      { button: viewer.calloutToolButton, name: 'callout' },
      { button: viewer.measurementToolButton, name: 'measurement' },
      { button: viewer.freehandToolButton, name: 'freehand' },
    ];

    for (const { button } of allOtherTools) {
      await expect(button).toHaveAttribute('aria-pressed', 'false');
    }

    // Switch through each tool and verify only that tool is pressed
    for (const { button } of allOtherTools) {
      await button.click();
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      await expect(viewer.selectToolButton).toHaveAttribute('aria-pressed', 'false');
    }

    // Switching back to Select deactivates the last tool
    await viewer.selectToolButton.click();
    await expect(viewer.selectToolButton).toHaveAttribute('aria-pressed', 'true');
    for (const { button } of allOtherTools) {
      await expect(button).toHaveAttribute('aria-pressed', 'false');
    }
  } finally {
    if (photoId) await deletePhotoViaApi(page, photoId).catch(() => {});
    if (entryId) await deleteDiaryEntryViaApi(page, entryId).catch(() => {});
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 23: Color palette — selecting a color swatch changes active color
// ─────────────────────────────────────────────────────────────────────────────

test('Color palette — selecting a swatch marks it aria-checked and new shapes use that color', async ({
  page,
  testPrefix,
}: {
  page: Page;
  testPrefix: string;
}) => {
  let entryId: string | null = null;
  let photoId: string | null = null;

  test.setTimeout(20_000);

  try {
    entryId = await createDiaryEntryViaApi(page, {
      entryType: 'general_note',
      entryDate: '2026-05-17',
      body: `${testPrefix} color palette test`,
    });
    const photo = await uploadTestPhotoViaApi(page, entryId);
    photoId = photo.id;

    const detailPage = new DiaryEntryDetailPage(page);
    const viewer = new PhotoViewerPage(page);

    await detailPage.goto(entryId);
    await expect(detailPage.backButton).toBeVisible();
    await openPhotoViewer(page, photoId, viewer);
    await openAnnotator(viewer);

    // Find the color radio group by its translated aria-label ("Annotation color").
    // The ToolPalette renders three radiogroups (color, stroke width, font size for
    // text tools) so we must scope by name to avoid a strict-mode violation.
    const colorGroup = page.getByRole('radiogroup', { name: 'Annotation color' });
    await expect(colorGroup).toBeVisible();

    // The default color is red — find the red swatch (aria-checked="true")
    const defaultChecked = colorGroup.locator('[aria-checked="true"]').first();
    await expect(defaultChecked).toBeVisible();
    const defaultBgColor = await defaultChecked.evaluate(
      (el) => (el as HTMLElement).style.backgroundColor,
    );
    // Default color is #dc2626 (red) — browser may normalize to rgb format
    expect(defaultBgColor).toBeTruthy();

    // Click the blue swatch (index 3 = blue = #3b82f6)
    const swatches = colorGroup.locator('[role="radio"]');
    // Colors order: red, yellow, green, blue, black, white
    const blueSwatch = swatches.nth(3);
    await blueSwatch.click();
    await expect(blueSwatch).toHaveAttribute('aria-checked', 'true');
    await expect(defaultChecked).toHaveAttribute('aria-checked', 'false');

    // Draw a rectangle — it should have stroke matching the blue color
    await viewer.activateTool('rectangle');
    await viewer.drawRectangle(0.2, 0.2, 0.6, 0.6);

    const rectEl = viewer.svgOverlay.locator('rect[data-shapeid]').first();
    await expect(rectEl).toBeVisible();

    // The stroke attribute of the rect should be blue
    const strokeAttr = await rectEl.getAttribute('stroke');
    expect(strokeAttr).toBe('#3b82f6');
  } finally {
    if (photoId) await deletePhotoViaApi(page, photoId).catch(() => {});
    if (entryId) await deleteDiaryEntryViaApi(page, entryId).catch(() => {});
  }
});

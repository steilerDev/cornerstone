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
 */

import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'url';
import type { Page, Route, Request } from '@playwright/test';
import { test, expect } from '../fixtures/auth.js';
import { PhotoViewerPage } from '../pages/PhotoViewerPage.js';
import type { AnnotationShape, RectangleShape, EllipseShape, ArrowShape, LineShape, FreehandShape, TextShape, MeasurementShape } from '../pages/PhotoViewerPage.js';
import { DiaryEntryDetailPage } from '../pages/DiaryEntryDetailPage.js';
import { createDiaryEntryViaApi, deleteDiaryEntryViaApi } from '../fixtures/apiHelpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// HAR capture for flake diagnosis (Playwright 1.60.0 tracing.startHar)
// ─────────────────────────────────────────────────────────────────────────────
test.beforeEach(async ({ page }, testInfo) => {
  mkdirSync('playwright-output/hars', { recursive: true });
  const harPath = `playwright-output/hars/${testInfo.project.name}_${testInfo.workerIndex}_${testInfo.title.replace(/[^a-z0-9]/gi, '_')}.har`;
  await page.context().tracing.startHar(harPath, { content: 'omit' });
});

test.afterEach(async ({ page }) => {
  await page.context().tracing.stopHar();
});

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
 *    (Note: Konva renders to <canvas> — no rect[data-shapeid] in DOM; shape draw
 *     still triggers the correct PUT payload on save)
 * 9. Click Save → PUT /api/photos/:id/annotation → 200 + annotatedAt
 * 10. Annotator closes; viewer in normal view mode (ToolPalette gone)
 * 11. viewOriginalButton and clearAnnotationsButton appear in-place (no re-navigate)
 * 12. Toggle View Original → img src contains variant=original
 * 13. Toggle back → src no longer contains variant=original
 * 14. Clear Annotations → Modal appears → confirm → DELETE 204
 * 15. viewOriginalButton and clearAnnotationsButton disappear in-place
 */
// Shape state is exposed via data-annotator-shapes attribute on [role="application"].
test(
  '[smoke] Photo annotation full lifecycle',
  { tag: '@smoke' },
  async ({ page, testPrefix }: { page: Page; testPrefix: string }) => {
    let entryId: string | null = null;
    let photoId: string | null = null;

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

      const detailPage = new DiaryEntryDetailPage(page);
      const viewer = new PhotoViewerPage(page);

      await detailPage.goto(entryId);
      await expect(detailPage.backButton).toBeVisible();

      // ── Open viewer ────────────────────────────────────────────────────────
      await openPhotoViewer(page, photoId, viewer);

      // The annotate button must be enabled
      await expect(viewer.annotateButton).toBeEnabled();

      // ── Open annotator ─────────────────────────────────────────────────────
      await openAnnotator(viewer);

      // All nine tool buttons present (callout was removed)
      await expect(viewer.selectToolButton).toBeVisible();
      await expect(viewer.rectangleToolButton).toBeVisible();
      await expect(viewer.highlightToolButton).toBeVisible();
      await expect(viewer.arrowToolButton).toBeVisible();
      await expect(viewer.lineToolButton).toBeVisible();
      await expect(viewer.ellipseToolButton).toBeVisible();
      await expect(viewer.textToolButton).toBeVisible();
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

      // Poll until rectangle shape appears in the annotator state model
      await expect.poll(async () => {
        const shapes = await viewer.getAnnotatorShapes();
        return shapes.some(s => s.type === 'rectangle');
      }, { timeout: 15_000 }).toBe(true);

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

      // ── Annotator closed — viewer in normal mode ───────────────────────────
      await expect(viewer.toolPalette).not.toBeVisible();
      await expect(viewer.annotateButton).toBeVisible();

      // ── View Original and Clear Annotations appear in-place (Bug #1482 fixed) ─
      // PhotoViewer now calls onPhotoAnnotated which updates currentPhoto immediately,
      // so these buttons appear without any page reload or re-navigation.
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

      // After DELETE, PhotoViewer updates currentPhoto (annotatedAt=null) in-place
      // → conditional buttons disappear without re-navigation
      await expect(viewer.viewOriginalButton).not.toBeVisible();
      await expect(viewer.clearAnnotationsButton).not.toBeVisible();
    } finally {
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

// Shape state is exposed via data-annotator-shapes attribute on [role="application"].
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

    // Poll until highlight shape appears in the annotator state model
    await expect.poll(async () => {
      const shapes = await viewer.getAnnotatorShapes();
      return shapes.some(s => s.type === 'highlight');
    }, { timeout: 15_000 }).toBe(true);

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

// Shape state is exposed via data-annotator-shapes attribute on [role="application"].
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

    // Poll until arrow shape appears in the annotator state model
    await expect.poll(async () => {
      const shapes = await viewer.getAnnotatorShapes();
      return shapes.some(s => s.type === 'arrow');
    }, { timeout: 15_000 }).toBe(true);

    // Optionally verify geometry fields are numbers
    const shapes5 = await viewer.getAnnotatorShapes();
    const arrow = shapes5.find(s => s.type === 'arrow') as ArrowShape | undefined;
    if (arrow) {
      expect(typeof arrow.x1).toBe('number');
      expect(typeof arrow.y1).toBe('number');
      expect(typeof arrow.x2).toBe('number');
      expect(typeof arrow.y2).toBe('number');
    }

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

// Shape state is exposed via data-annotator-shapes attribute on [role="application"].
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

    // Poll until line shape appears in the annotator state model
    await expect.poll(async () => {
      const shapes = await viewer.getAnnotatorShapes();
      return shapes.some(s => s.type === 'line');
    }, { timeout: 15_000 }).toBe(true);

    // Verify geometry fields are numbers
    const shapes6 = await viewer.getAnnotatorShapes();
    const line6 = shapes6.find(s => s.type === 'line') as LineShape | undefined;
    if (line6) {
      expect(typeof line6.x1).toBe('number');
      expect(typeof line6.y1).toBe('number');
      expect(typeof line6.x2).toBe('number');
      expect(typeof line6.y2).toBe('number');
    }

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

// Shape state is exposed via data-annotator-shapes attribute on [role="application"].
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

    // Poll until line shape appears in the annotator state model
    await expect.poll(async () => {
      const shapes = await viewer.getAnnotatorShapes();
      return shapes.some(s => s.type === 'line');
    }, { timeout: 15_000 }).toBe(true);

    // Verify horizontal snap: y1 ≈ y2 (within 2px tolerance in image-space)
    const shapes7 = await viewer.getAnnotatorShapes();
    const line7 = shapes7.find(s => s.type === 'line') as LineShape | undefined;
    expect(line7).toBeDefined();
    if (line7) {
      expect(Math.abs(line7.y1 - line7.y2)).toBeLessThan(2);
    }
  } finally {
    if (photoId) await deletePhotoViaApi(page, photoId).catch(() => {});
    if (entryId) await deleteDiaryEntryViaApi(page, entryId).catch(() => {});
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8: Ellipse tool draw and save
// ─────────────────────────────────────────────────────────────────────────────

// Shape state is exposed via data-annotator-shapes attribute on [role="application"].
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

    // Poll until ellipse shape appears in the annotator state model
    await expect.poll(async () => {
      const shapes = await viewer.getAnnotatorShapes();
      return shapes.some(s => s.type === 'ellipse');
    }, { timeout: 15_000 }).toBe(true);

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

// Shape state is exposed via data-annotator-shapes attribute on [role="application"].
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

    // Poll until ellipse shape appears in the annotator state model
    await expect.poll(async () => {
      const shapes = await viewer.getAnnotatorShapes();
      return shapes.some(s => s.type === 'ellipse');
    }, { timeout: 15_000 }).toBe(true);

    // Verify circle snap: rx === ry (within 1px tolerance)
    const shapes9 = await viewer.getAnnotatorShapes();
    const ellipse9 = shapes9.find(s => s.type === 'ellipse') as EllipseShape | undefined;
    expect(ellipse9).toBeDefined();
    if (ellipse9) {
      expect(Math.abs(ellipse9.rx - ellipse9.ry)).toBeLessThan(1);
    }
  } finally {
    if (photoId) await deletePhotoViaApi(page, photoId).catch(() => {});
    if (entryId) await deleteDiaryEntryViaApi(page, entryId).catch(() => {});
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 10: Text tool — click, type, Enter commits shape
// ─────────────────────────────────────────────────────────────────────────────

// Shape state is exposed via data-annotator-shapes attribute on [role="application"].
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
    await page.mouse.click(svgBox!.x + svgBox!.width * 0.3, svgBox!.y + svgBox!.height * 0.3);

    // Inline input should open
    await expect(viewer.inlineInput).toBeVisible();

    // Type text and commit with Enter
    await viewer.inlineInput.fill('Inspection point');
    await page.keyboard.press('Enter');

    // Inline input closes
    await expect(viewer.inlineInput).not.toBeVisible();

    // Poll until text shape appears in the annotator state model with the expected text
    await expect.poll(async () => {
      const shapes = await viewer.getAnnotatorShapes();
      return shapes.some(s => s.type === 'text' && (s as TextShape).text === 'Inspection point');
    }, { timeout: 15_000 }).toBe(true);

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

// Shape state is exposed via data-annotator-shapes attribute on [role="application"].
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
    await page.mouse.click(svgBox!.x + svgBox!.width * 0.4, svgBox!.y + svgBox!.height * 0.4);

    await expect(viewer.inlineInput).toBeVisible();

    // Type something then press Escape
    await viewer.inlineInput.fill('should be discarded');
    await page.keyboard.press('Escape');

    // Inline input closes
    await expect(viewer.inlineInput).not.toBeVisible();

    // No text shape should have been committed — verify via state model
    await expect.poll(async () => {
      const shapes = await viewer.getAnnotatorShapes();
      return shapes.length;
    }, { timeout: 15_000 }).toBe(0);
  } finally {
    if (photoId) await deletePhotoViaApi(page, photoId).catch(() => {});
    if (entryId) await deleteDiaryEntryViaApi(page, entryId).catch(() => {});
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 12 (Callout tool) removed — Callout tool was deleted in favour of
// the simpler Text + Rectangle composition.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 13: Measurement tool — drag, type label, Enter commits with label
// ─────────────────────────────────────────────────────────────────────────────

// Shape state is exposed via data-annotator-shapes attribute on [role="application"].
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

    // Poll until measurement shape appears with the expected label
    await expect.poll(async () => {
      const shapes = await viewer.getAnnotatorShapes();
      return shapes.some(s => s.type === 'measurement' && (s as MeasurementShape).label === '3.5m');
    }, { timeout: 15_000 }).toBe(true);

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

// Shape state is exposed via data-annotator-shapes attribute on [role="application"].
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

    // Poll until measurement shape is committed with empty label
    await expect.poll(async () => {
      const shapes = await viewer.getAnnotatorShapes();
      return shapes.some(s => s.type === 'measurement' && (s as MeasurementShape).label === '');
    }, { timeout: 15_000 }).toBe(true);
  } finally {
    if (photoId) await deletePhotoViaApi(page, photoId).catch(() => {});
    if (entryId) await deleteDiaryEntryViaApi(page, entryId).catch(() => {});
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 15: Freehand tool — drag stroke, commits polyline
// ─────────────────────────────────────────────────────────────────────────────

// Shape state is exposed via data-annotator-shapes attribute on [role="application"].
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

    // Poll until freehand shape appears in the annotator state model
    await expect.poll(async () => {
      const shapes = await viewer.getAnnotatorShapes();
      return shapes.some(s => s.type === 'freehand');
    }, { timeout: 15_000 }).toBe(true);

    // Verify the freehand shape has at least 2 points
    const shapes15 = await viewer.getAnnotatorShapes();
    const freehand15 = shapes15.find(s => s.type === 'freehand') as FreehandShape | undefined;
    expect(freehand15).toBeDefined();
    if (freehand15) {
      expect(freehand15.points.length).toBeGreaterThanOrEqual(2);
    }

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

// Shape state is exposed via data-annotator-shapes attribute on [role="application"].
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

      // Poll until freehand shape appears in the annotator state model
      // (mobile/touch events can be slower to flush on CI)
      await expect.poll(async () => {
        const shapes = await viewer.getAnnotatorShapes();
        return shapes.some(s => s.type === 'freehand');
      }, { timeout: 15_000 }).toBe(true);

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

// Shape state is exposed via data-annotator-shapes attribute on [role="application"].
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

      // Draw measurement line using synthetic touch PointerEvents via drawLineTouch.
      // On WebKit/hasTouch viewports page.mouse.* does not reliably fire
      // onPointerDown/Move/Up on the SVG element — use the synthetic helper instead.
      await viewer.drawLineTouch(0.15, 0.5, 0.75, 0.5);

      // Inline input should appear at the midpoint
      await expect(viewer.inlineInput).toBeVisible();

      // Type a label and commit
      await viewer.inlineInput.fill('2.5m');
      await page.keyboard.press('Enter');
      await expect(viewer.inlineInput).not.toBeVisible();

      // Poll until measurement shape appears in the annotator state model with the typed label
      await expect.poll(async () => {
        const shapes = await viewer.getAnnotatorShapes();
        return shapes.some(s => s.type === 'measurement' && (s as MeasurementShape).label === '2.5m');
      }, { timeout: 15_000 }).toBe(true);
    } finally {
      if (photoId) await deletePhotoViaApi(page, photoId).catch(() => {});
      if (entryId) await deleteDiaryEntryViaApi(page, entryId).catch(() => {});
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 18: Undo removes the last shape; Redo restores it
// ─────────────────────────────────────────────────────────────────────────────

// Shape state is exposed via data-annotator-shapes attribute on [role="application"].
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

    // Poll until 1 shape appears in the state model
    await expect.poll(async () => {
      const shapes = await viewer.getAnnotatorShapes();
      return shapes.length;
    }, { timeout: 15_000 }).toBe(1);

    // Undo button should now be enabled
    await expect(viewer.undoButton).not.toBeDisabled();

    // Click Undo → shape count goes to 0
    await viewer.undoButton.click();
    await expect.poll(async () => {
      const shapes = await viewer.getAnnotatorShapes();
      return shapes.length;
    }, { timeout: 15_000 }).toBe(0);

    // Redo button should now be enabled
    await expect(viewer.redoButton).not.toBeDisabled();

    // Click Redo → shape reappears
    await viewer.redoButton.click();
    await expect.poll(async () => {
      const shapes = await viewer.getAnnotatorShapes();
      return shapes.length === 1 && shapes[0]?.type === 'rectangle';
    }, { timeout: 15_000 }).toBe(true);
  } finally {
    if (photoId) await deletePhotoViaApi(page, photoId).catch(() => {});
    if (entryId) await deleteDiaryEntryViaApi(page, entryId).catch(() => {});
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 19: Select tool moves a committed rectangle
// ─────────────────────────────────────────────────────────────────────────────

// Shape state is exposed via data-annotator-shapes attribute on [role="application"].
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

    // Poll until rectangle shape appears in the state model
    await expect.poll(async () => {
      const shapes = await viewer.getAnnotatorShapes();
      return shapes.some(s => s.type === 'rectangle');
    }, { timeout: 15_000 }).toBe(true);

    // Capture original x position from state model
    const initialShapes19 = await viewer.getAnnotatorShapes();
    const initialRect19 = initialShapes19.find(s => s.type === 'rectangle') as RectangleShape | undefined;
    expect(initialRect19).toBeDefined();
    const initialX19 = initialRect19!.x;

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

    // Poll until the x coordinate in the state model increases (shape moved right)
    await expect.poll(async () => {
      const shapes = await viewer.getAnnotatorShapes();
      const rect = shapes.find(s => s.type === 'rectangle') as RectangleShape | undefined;
      return rect ? rect.x : initialX19;
    }, { timeout: 15_000 }).toBeGreaterThan(initialX19);
  } finally {
    if (photoId) await deletePhotoViaApi(page, photoId).catch(() => {});
    if (entryId) await deleteDiaryEntryViaApi(page, entryId).catch(() => {});
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 20: Select tool — Delete key removes selected shape
// ─────────────────────────────────────────────────────────────────────────────

// Shape state is exposed via data-annotator-shapes attribute on [role="application"].
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

    // Poll until 1 shape appears in the state model
    await expect.poll(async () => {
      const shapes = await viewer.getAnnotatorShapes();
      return shapes.length;
    }, { timeout: 15_000 }).toBe(1);

    // Switch to Select and click the rectangle to select it
    await viewer.activateTool('select');

    const svgBox = await viewer.svgOverlay.boundingBox();
    expect(svgBox).not.toBeNull();

    // Click the center of the drawn rectangle
    await page.mouse.click(svgBox!.x + svgBox!.width * 0.45, svgBox!.y + svgBox!.height * 0.45);

    // Press Delete key
    await page.keyboard.press('Delete');

    // Poll until shape count goes to 0
    await expect.poll(async () => {
      const shapes = await viewer.getAnnotatorShapes();
      return shapes.length;
    }, { timeout: 15_000 }).toBe(0);
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
 *    (Note: Konva renders to <canvas> — shape DOM assertions are skipped;
 *     drawFreehandTouch is still used for reliable cross-viewport pointer handling)
 * 2. Save → PUT returns 200 + annotatedAt
 * 3. viewOriginalButton and clearAnnotationsButton appear in-place (Bug #1482 fixed)
 * 4. Toggle View Original (aria-pressed)
 * 5. Clear Annotations → DELETE 204 → buttons disappear in-place
 */
// Shape state is exposed via data-annotator-shapes attribute on [role="application"].
test(
  '[smoke] @responsive Multi-tool lifecycle — draw 3 shapes, save, view original, clear',
  { tag: ['@smoke', '@responsive'] },
  async ({ page, testPrefix }: { page: Page; testPrefix: string }) => {
    let entryId: string | null = null;
    let photoId: string | null = null;

    test.setTimeout(60_000);

    try {
      entryId = await createDiaryEntryViaApi(page, {
        entryType: 'general_note',
        entryDate: '2026-05-17',
        body: `${testPrefix} multi-tool lifecycle`,
      });
      const uploadedPhoto = await uploadTestPhotoViaApi(page, entryId);
      photoId = uploadedPhoto.id;

      const detailPage = new DiaryEntryDetailPage(page);
      const viewer = new PhotoViewerPage(page);

      await detailPage.goto(entryId);
      await expect(detailPage.backButton).toBeVisible();
      await openPhotoViewer(page, photoId, viewer);
      await openAnnotator(viewer);

      // Draw Rectangle (Konva canvas — no rect[data-shapeid] assertion)
      await viewer.activateTool('rectangle');
      await viewer.drawRectangle(0.1, 0.1, 0.4, 0.4);
      // Poll until rectangle shape appears in the state model
      await expect.poll(async () => {
        const shapes = await viewer.getAnnotatorShapes();
        return shapes.some(s => s.type === 'rectangle');
      }, { timeout: 15_000 }).toBe(true);

      // Draw Ellipse (Konva canvas — no ellipse[data-shapeid] assertion)
      await viewer.activateTool('ellipse');
      await viewer.drawEllipse(0.5, 0.1, 0.9, 0.4);
      // Poll until ellipse shape appears in the state model
      await expect.poll(async () => {
        const shapes = await viewer.getAnnotatorShapes();
        return shapes.some(s => s.type === 'ellipse');
      }, { timeout: 15_000 }).toBe(true);

      // Draw Freehand using drawFreehandTouch (synthetic PointerEvents) so this
      // step works on mobile WebKit (hasTouch=true) where page.mouse.* does not
      // reliably fire the onPointerDown/Move/Up handlers on the SVG element.
      // The helper is safe to call on desktop viewports too.
      // (Konva canvas — no polyline[data-shapeid] assertion)
      await viewer.activateTool('freehand');
      await viewer.drawFreehandTouch(0.1, 0.7, [
        [0.3, 0.6],
        [0.5, 0.8],
        [0.7, 0.6],
      ]);
      // Poll until freehand shape appears in the state model
      await expect.poll(async () => {
        const shapes = await viewer.getAnnotatorShapes();
        return shapes.some(s => s.type === 'freehand');
      }, { timeout: 15_000 }).toBe(true);

      // Verify all 3 shapes are present
      await expect.poll(async () => {
        const shapes = await viewer.getAnnotatorShapes();
        return shapes.length;
      }, { timeout: 15_000 }).toBe(3);

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

      // ── Annotator closed — viewer in normal mode ───────────────────────────
      await expect(viewer.toolPalette).not.toBeVisible();

      // ── View Original and Clear Annotations appear in-place (Bug #1482 fixed) ─
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

      const [deleteResponse] = await Promise.all([
        page.waitForResponse(
          (resp) =>
            resp.url().includes(`/api/photos/${photoId}/annotation`) &&
            resp.request().method() === 'DELETE',
        ),
        clearModal.getByRole('button').last().click(),
      ]);
      expect(deleteResponse.status()).toBe(204);

      // After DELETE, buttons disappear in-place
      await expect(viewer.viewOriginalButton).not.toBeVisible();
      await expect(viewer.clearAnnotationsButton).not.toBeVisible();
    } finally {
      if (photoId) await deletePhotoViaApi(page, photoId).catch(() => {});
      if (entryId) await deleteDiaryEntryViaApi(page, entryId).catch(() => {});
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 22: All 9 tool buttons visible; switching updates aria-pressed
// ─────────────────────────────────────────────────────────────────────────────

test('Tool palette — all 9 tools visible; switching tool updates aria-pressed', async ({
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

    // Verify all 9 tool buttons are visible (callout was removed)
    await expect(viewer.selectToolButton).toBeVisible();
    await expect(viewer.rectangleToolButton).toBeVisible();
    await expect(viewer.highlightToolButton).toBeVisible();
    await expect(viewer.arrowToolButton).toBeVisible();
    await expect(viewer.lineToolButton).toBeVisible();
    await expect(viewer.ellipseToolButton).toBeVisible();
    await expect(viewer.textToolButton).toBeVisible();
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

// Shape state is exposed via data-annotator-shapes attribute on [role="application"].
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

    // The default color is red — red is the first swatch (index 0).
    // We pin the red swatch by position so the reference stays stable after
    // clicking a different color (a live '[aria-checked="true"]' locator would
    // follow the newly-checked swatch instead of staying on red).
    const swatches = colorGroup.locator('[role="radio"]');
    // Colors order: red, yellow, green, blue, black, white
    const redSwatch = swatches.nth(0);
    await expect(redSwatch).toBeVisible();
    await expect(redSwatch).toHaveAttribute('aria-checked', 'true');
    const defaultBgColor = await redSwatch.evaluate(
      (el) => (el as HTMLElement).style.backgroundColor,
    );
    // Default color is #dc2626 (red) — browser may normalize to rgb format
    expect(defaultBgColor).toBeTruthy();

    // Click the blue swatch (index 3 = blue = #3b82f6)
    const blueSwatch = swatches.nth(3);
    await blueSwatch.click();
    await expect(blueSwatch).toHaveAttribute('aria-checked', 'true');
    // The red swatch (pinned by index) should now be unchecked
    await expect(redSwatch).toHaveAttribute('aria-checked', 'false');

    // Draw a rectangle — it should have the blue color in the state model
    await viewer.activateTool('rectangle');
    await viewer.drawRectangle(0.2, 0.2, 0.6, 0.6);

    // Poll until rectangle shape appears in the state model
    await expect.poll(async () => {
      const shapes = await viewer.getAnnotatorShapes();
      return shapes.some(s => s.type === 'rectangle');
    }, { timeout: 15_000 }).toBe(true);

    // Verify the rectangle uses the blue color (#3b82f6)
    // RectangleShape uses the 'color' field for stroke
    const shapes23 = await viewer.getAnnotatorShapes();
    const rect23 = shapes23.find(s => s.type === 'rectangle') as RectangleShape | undefined;
    expect(rect23).toBeDefined();
    if (rect23) {
      expect(rect23.color).toBe('#3b82f6');
    }
  } finally {
    if (photoId) await deletePhotoViaApi(page, photoId).catch(() => {});
    if (entryId) await deleteDiaryEntryViaApi(page, entryId).catch(() => {});
  }
});

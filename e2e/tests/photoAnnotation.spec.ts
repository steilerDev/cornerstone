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

// Konva renders to <canvas>; shape locators (rect[data-shapeid]) have no DOM representation.
test.fixme('TODO: rewrite for Konva canvas — Highlight tool — draw highlight and save', async ({
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

// Konva renders to <canvas>; shape locators (line[data-shapeid]) have no DOM representation.
test.fixme('TODO: rewrite for Konva canvas — Arrow tool — draw arrow and save', async ({
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

    // Arrow rendering contract: a <g data-shapeid> group containing a <line>
    // shaft and a <polygon> arrowhead (no marker-end — the arrowhead is an
    // explicit polygon child, not an SVG marker).
    const arrowGroup = viewer.svgOverlay.locator('g[data-shapeid]').first();
    await expect(arrowGroup).toBeAttached({ timeout: 15_000 });

    // The group must contain exactly one line (shaft) and one polygon (arrowhead)
    await expect(arrowGroup.locator('line')).toHaveCount(1);
    await expect(arrowGroup.locator('polygon')).toHaveCount(1);

    // The polygon's points attribute should encode a triangle (three coordinate pairs)
    const arrowPolygon = arrowGroup.locator('polygon');
    const points = await arrowPolygon.getAttribute('points');
    expect(points).not.toBeNull();
    // A triangle arrowhead has exactly 3 coordinate pairs (6 numbers)
    const coordPairs = (points ?? '').trim().split(/\s+/);
    expect(coordPairs).toHaveLength(3);

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

// Konva renders to <canvas>; shape locators (line[data-shapeid]) have no DOM representation.
test.fixme('TODO: rewrite for Konva canvas — Line tool — draw line and save', async ({
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
    // Use state:'attached' rather than state:'visible': an SVG <line> with
    // y1 === y2 has a zero-height bounding box, so Playwright's visibility
    // check fails even though the stroke renders correctly to the user.
    const lineEl = viewer.svgOverlay.locator('line[data-shapeid]').first();
    try {
      await lineEl.waitFor({ state: 'attached', timeout: 15_000 });
    } catch (e) {
      const svgHtml = await page
        .evaluate(() => document.querySelector('[role="application"]')?.innerHTML ?? '(not found)')
        .catch(() => '(eval failed)');
      console.error('[DEBUG] Line shape not attached after drawLine. SVG innerHTML:', svgHtml);
      throw e;
    }

    // Verify rendered geometry: horizontal line (y1 ≈ y2), expected stroke color and width
    await expect(lineEl).toHaveAttribute('x1', /\d/);
    await expect(lineEl).toHaveAttribute('x2', /\d/);
    await expect(lineEl).toHaveAttribute('y1', /\d/);
    await expect(lineEl).toHaveAttribute('y2', /\d/);
    await expect(lineEl).toHaveAttribute('stroke-width', '1');
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

// Konva renders to <canvas>; line[data-shapeid] + getAttribute('y1'/'y2') have no DOM representation.
test.fixme('TODO: rewrite for Konva canvas — Line tool — Shift-snap constrains angle to 45° increments', async ({
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
    // Use state:'attached' rather than state:'visible': a horizontal SVG <line>
    // (y1 === y2) has a zero-height bounding box, which causes Playwright's
    // visibility check to fail even though the stroke is visually correct.
    // The 15 s explicit timeout gives CI shards comfortable headroom beyond the
    // default actionTimeout (5 s) for two async React state updates.
    const lineEl = viewer.svgOverlay.locator('line[data-shapeid]').first();
    try {
      await lineEl.waitFor({ state: 'attached', timeout: 15_000 });
    } catch (e) {
      const svgHtml = await page
        .evaluate(() => document.querySelector('[role="application"]')?.innerHTML ?? '(not found)')
        .catch(() => '(eval failed)');
      console.error(
        '[DEBUG] Shift-snap: line shape not attached after Shift+drag. SVG innerHTML:',
        svgHtml,
      );
      throw e;
    }

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

// Konva renders to <canvas>; shape locators (ellipse[data-shapeid]) have no DOM representation.
test.fixme('TODO: rewrite for Konva canvas — Ellipse tool — draw ellipse and save', async ({
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

// Konva renders to <canvas>; ellipse[data-shapeid] + getAttribute('rx'/'ry') have no DOM representation.
test.fixme('TODO: rewrite for Konva canvas — Ellipse tool — Shift-snap produces circle (rx === ry)', async ({
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

// Konva renders to <canvas>; shape locators (text[data-shapeid]) have no DOM representation.
test.fixme('TODO: rewrite for Konva canvas — Text tool — tap to place, type text, Enter commits shape', async ({
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

// Konva renders to <canvas>; shape locators (text[data-shapeid]) have no DOM representation.
test.fixme('TODO: rewrite for Konva canvas — Text tool — Escape discards the draft without adding a shape', async ({
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

    // No text shape should have been committed
    await expect(viewer.svgOverlay.locator('text[data-shapeid]')).toHaveCount(0);
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

// Konva renders to <canvas>; shape locators (g[data-shapeid], text) have no DOM representation.
test.fixme('TODO: rewrite for Konva canvas — Measurement tool — drag, type label, Enter commits with label text', async ({
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
    // Use waitFor with explicit timeout — actionTimeout (5 s) is too tight on CI;
    // measurement commits via undoStack.commit() which requires an extra re-render.
    const measureGroup = viewer.svgOverlay.locator('g[data-shapeid]').first();
    await measureGroup.waitFor({ state: 'visible', timeout: 15_000 });

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

// Konva renders to <canvas>; shape locators (g[data-shapeid], text + getAttribute) have no DOM representation.
test.fixme('TODO: rewrite for Konva canvas — Measurement tool — Escape commits line with empty label', async ({
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
    // Use waitFor with explicit timeout — same async commit path as Scenario 13.
    const measureGroup = viewer.svgOverlay.locator('g[data-shapeid]').first();
    await measureGroup.waitFor({ state: 'visible', timeout: 15_000 });

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

// Konva renders to <canvas>; shape locators (polyline[data-shapeid] + getAttribute('points')) have no DOM representation.
test.fixme('TODO: rewrite for Konva canvas — Freehand tool — drag stroke commits polyline shape', async ({
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

// Konva renders to <canvas>; shape locators (polyline[data-shapeid]) have no DOM representation.
test.fixme(
  'TODO: rewrite for Konva canvas — [smoke] @responsive Freehand tool on mobile — pointer drag captures stroke',
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
      // Use waitFor with explicit timeout — mobile/touch events can be slower to
      // flush on a 2-vCPU CI shard; freehand uses COMMIT_DRAFT → two async renders.
      const polylineEl = viewer.svgOverlay.locator('polyline[data-shapeid]').first();
      await polylineEl.waitFor({ state: 'visible', timeout: 15_000 });

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

// Konva renders to <canvas>; shape locators (g[data-shapeid]) have no DOM representation.
test.fixme(
  'TODO: rewrite for Konva canvas — @responsive Measurement tool — inline input appears after drag on mobile/tablet',
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

      // Measurement group committed — use waitFor with explicit timeout to handle
      // async state propagation (same undoStack.commit() path as Scenarios 13/14).
      const measureGroup = viewer.svgOverlay.locator('g[data-shapeid]').first();
      await measureGroup.waitFor({ state: 'visible', timeout: 15_000 });
    } finally {
      if (photoId) await deletePhotoViaApi(page, photoId).catch(() => {});
      if (entryId) await deleteDiaryEntryViaApi(page, entryId).catch(() => {});
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 18: Undo removes the last shape; Redo restores it
// ─────────────────────────────────────────────────────────────────────────────

// Konva renders to <canvas>; shape locators (rect[data-shapeid] count assertions) have no DOM representation.
test.fixme('TODO: rewrite for Konva canvas — Undo removes last committed shape; Redo restores it', async ({
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

// Konva renders to <canvas>; rect[data-shapeid] + getAttribute('x') have no DOM representation.
test.fixme('TODO: rewrite for Konva canvas — Select tool — drag moves a committed rectangle', async ({
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
    await expect
      .poll(async () => {
        const xStr = await rectEl.getAttribute('x');
        return parseFloat(xStr ?? '0');
      })
      .toBeGreaterThan(originalX);
  } finally {
    if (photoId) await deletePhotoViaApi(page, photoId).catch(() => {});
    if (entryId) await deleteDiaryEntryViaApi(page, entryId).catch(() => {});
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 20: Select tool — Delete key removes selected shape
// ─────────────────────────────────────────────────────────────────────────────

// Konva renders to <canvas>; shape locators (rect[data-shapeid] count assertions) have no DOM representation.
test.fixme('TODO: rewrite for Konva canvas — Select tool — Delete key removes the selected shape', async ({
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
    await page.mouse.click(svgBox!.x + svgBox!.width * 0.45, svgBox!.y + svgBox!.height * 0.45);

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
 *    (Note: Konva renders to <canvas> — shape DOM assertions are skipped;
 *     drawFreehandTouch is still used for reliable cross-viewport pointer handling)
 * 2. Save → PUT returns 200 + annotatedAt
 * 3. viewOriginalButton and clearAnnotationsButton appear in-place (Bug #1482 fixed)
 * 4. Toggle View Original (aria-pressed)
 * 5. Clear Annotations → DELETE 204 → buttons disappear in-place
 */
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

      // Draw Ellipse (Konva canvas — no ellipse[data-shapeid] assertion)
      await viewer.activateTool('ellipse');
      await viewer.drawEllipse(0.5, 0.1, 0.9, 0.4);

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

// Konva renders to <canvas>; rect[data-shapeid] + getAttribute('stroke') have no DOM representation.
test.fixme('TODO: rewrite for Konva canvas — Color palette — selecting a swatch marks it aria-checked and new shapes use that color', async ({
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

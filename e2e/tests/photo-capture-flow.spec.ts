/**
 * E2E tests for the mobile photo capture → upload flow on the capture screen
 * (Story #1674: Mobile photo upload optimization; Story #2221: the capture screen).
 *
 * What this tests:
 * 1. On touch viewports: "Take photos" and "Choose from library" buttons are visible.
 *    The drop-zone hint ("or drop photos here") is not offered to touch users.
 * 2. On desktop viewports: the drop zone IS visible; no "Take photos" button without a camera.
 * 3. After selecting a file (via `setInputFiles` on the library input) a tile appears in the
 *    photo strip and uploads at once: there is no details dialog any more.
 * 4. A photo's sheet: orientation picker lists name + description (secondary text).
 * 5. An upload in flight shows an "uploading" tile that ends up "uploaded".
 * 6. Removing a photo takes its tile away and the photo is gone from the server.
 * 7. Multiple files: both tiles appear and upload.
 * 8. Multiple files: removing the first leaves the second.
 * 9. PhotoMetadataSidepanel orientation field (diary detail page viewer): select → save →
 *    reload → persists.
 * 10. Take photos input: has data-testid="capture-camera-input", capture="environment",
 *     accept="image/*" — verifiable without actual camera.
 * 11. Orientation picker with no orientations configured: shows hint text.
 * 12. Photo preview: the tile shows the picked photo at once (a blob: preview while uploading).
 *
 * Important constraints:
 * - Real camera capture is NOT automatable in headless CI. Scenario 10 only asserts
 *   input attributes; the live viewfinder is covered in capture-camera*.spec.ts.
 * - The tablet and mobile Playwright projects use devices (iPad, iPhone) that set
 *   hasTouch=true and hover:none; desktop (Chrome) has hover:hover. Tests that assert
 *   touch-specific UI are tagged @responsive so they run across desktop/tablet/mobile, then use
 *   viewport-width checks to condition the assertion.
 * - Host entity for the photos: a diary entry (general_note draft) on /diary/:id/edit.
 * - Uploads are slowed with a route that waits before passing the request on, so the
 *   "uploading" state stays visible long enough to assert.
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/auth.js';
import { createDraftDiaryEntryViaApi, deleteDiaryEntryViaApi } from '../fixtures/apiHelpers.js';
import { capturePhotos } from '../fixtures/capturePhotos.js';
import { listEntryPhotos } from '../fixtures/captureSeed.js';
import { DiaryCapturePage } from '../pages/DiaryCapturePage.js';

/**
 * Slow every photo upload down by `delayMs` before it goes on to the real server, so the
 * "uploading" state is on screen long enough to assert. Returns the function that removes it.
 */
async function slowUploads(page: Page, delayMs: number): Promise<() => Promise<void>> {
  await page.route('**/api/photos', async (route) => {
    if (route.request().method() === 'POST') {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    // If the test's cleanup removed the routes while the delay was pending, the request was
    // already handled: ignore the error.
    await route.continue().catch(() => {});
  });
  return async () => page.unroute('**/api/photos');
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1 & 2: Mobile vs desktop layout — button/drop zone visibility
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Photo upload layout — mobile vs desktop (Scenarios 1 & 2)',
  { tag: '@responsive' },
  () => {
    test('Mobile viewport: Take photos + Choose from library buttons visible, drop hint hidden', async ({
      page,
    }) => {
      // This assertion is only meaningful when the device is a touch device,
      // which occurs on tablet and mobile projects (hover: none).
      // On desktop this test still runs but we condition the strict
      // assertion on the viewport width as a proxy.
      const viewportWidth = page.viewportSize()?.width ?? 1920;
      const isMobileOrTablet = viewportWidth <= 1024;

      let draftId: string | null = null;
      try {
        draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });
        const capture = new DiaryCapturePage(page);
        await capture.gotoEdit(draftId);

        if (isMobileOrTablet) {
          // Mobile/tablet: both buttons must be visible
          await expect(capture.takePhotosButton).toBeVisible();
          await expect(capture.chooseButton).toBeVisible();

          // The drop hint is for pointer users only
          await expect(page.getByText('or drop photos here')).not.toBeVisible();
        } else {
          // Desktop: the drop zone is visible with its hint
          await expect(capture.dropZone).toBeVisible();
          await expect(page.getByText('or drop photos here')).toBeVisible();
        }
      } finally {
        if (draftId) await deleteDiaryEntryViaApi(page, draftId);
      }
    });

    test('Desktop viewport: drop zone visible, no Take photos button shown', async ({ page }) => {
      const viewportWidth = page.viewportSize()?.width ?? 1920;
      const isDesktop = viewportWidth > 1024;

      let draftId: string | null = null;
      try {
        draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });
        const capture = new DiaryCapturePage(page);
        await capture.gotoEdit(draftId);

        if (isDesktop) {
          await expect(capture.dropZone).toBeVisible();
          // Desktop: no "Take photos" button because there is no camera for a fine pointer
          await expect(capture.takePhotosButton).not.toBeVisible();
        }
      } finally {
        if (draftId) await deleteDiaryEntryViaApi(page, draftId);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Selecting a file starts the upload (no details dialog)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Selecting a file starts the upload (Scenario 3)', () => {
  test(
    '[smoke] Selecting a file via the library input adds a tile and uploads it; no dialog opens',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      let draftId: string | null = null;
      try {
        draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });
        const capture = new DiaryCapturePage(page);
        await capture.gotoEdit(draftId);

        // The hidden input is always in the DOM regardless of the device
        await capture.addFiles(capturePhotos(1, `${testPrefix}-s3`));

        // A tile appears and uploads; the old "Add photo details" dialog is gone
        await expect(capture.tiles).toHaveCount(1);
        await capture.waitForUploaded(1);
        await expect(page.getByRole('dialog', { name: 'Add photo details' })).toHaveCount(0);
        await expect.poll(async () => (await listEntryPhotos(page, draftId!)).length).toBe(1);
      } finally {
        if (draftId) await deleteDiaryEntryViaApi(page, draftId);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: The photo sheet's orientation picker (name with secondary text)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Photo sheet — fill fields (Scenario 4)', () => {
  test('Select an orientation in the sheet — the dropdown shows name + description on a second line', async ({
    page,
    testPrefix,
  }) => {
    // Seed: create an orientation that has a description so we can verify
    // the secondary text appears in the dropdown.
    const orientationName = `${testPrefix} Ost`;
    const orientationDesc = 'Garden-facing';
    let orientationId = '';
    let draftId: string | null = null;

    try {
      // Create orientation via API
      const orientResp = await page.request.post('/api/orientations', {
        data: { name: orientationName, description: orientationDesc },
      });
      expect(orientResp.ok()).toBeTruthy();
      const orientBody = (await orientResp.json()) as { orientation: { id: string } };
      orientationId = orientBody.orientation.id;

      draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });
      const capture = new DiaryCapturePage(page);
      await capture.gotoEdit(draftId);
      await capture.addFiles(capturePhotos(1, `${testPrefix}-s4`));
      await capture.waitForUploaded(1);
      await capture.sheet.open(0);

      // Fill the caption
      await capture.sheet.caption.fill('Garden view from east');

      // Open the orientation picker — SearchPicker input inside the sheet
      const orientationInput = capture.sheet.orientationInput;
      await orientationInput.click();
      await orientationInput.fill(orientationName);

      // SearchPicker portals the dropdown to document.body as [data-search-picker-dropdown]
      const dropdown = page.locator('[data-search-picker-dropdown]');
      await dropdown.waitFor({ state: 'visible' });

      // The option should show the orientation name
      const option = dropdown.getByRole('option', { name: new RegExp(orientationName, 'i') });
      await expect(option).toBeVisible();

      // The secondary text (description) should also appear in the option
      await expect(option).toContainText(orientationDesc);

      // Select the option
      await option.click();

      // Dropdown closes and the choice is saved on the photo
      await expect(dropdown).not.toBeVisible();
      await expect
        .poll(async () => (await listEntryPhotos(page, draftId!))[0]?.orientationId)
        .toBe(orientationId);
    } finally {
      if (draftId) await deleteDiaryEntryViaApi(page, draftId);
      if (orientationId) {
        await page.request.delete(`/api/orientations/${orientationId}`).catch(() => {});
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: An upload in flight shows an uploading tile
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Upload in flight (Scenario 5)', () => {
  test('A picked file shows an uploading tile that ends up uploaded', async ({
    page,
    testPrefix,
  }) => {
    let draftId: string | null = null;
    let cleanupRoutes: (() => Promise<void>) | null = null;

    try {
      draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });

      // Slow the upload so the tile is seen uploading before it settles
      cleanupRoutes = await slowUploads(page, 1500);

      const capture = new DiaryCapturePage(page);
      await capture.gotoEdit(draftId);
      await capture.chooseFromLibrary(capturePhotos(1, `${testPrefix}-s5`));

      await expect(capture.tiles).toHaveCount(1);
      await expect(capture.tile(0)).toHaveAttribute('data-state', 'uploading');
      await capture.waitForUploaded(1);
    } finally {
      if (cleanupRoutes) await cleanupRoutes().catch(() => {});
      if (draftId) await deleteDiaryEntryViaApi(page, draftId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Removing a photo discards it
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Remove discards the photo (Scenario 6)', () => {
  test('Remove takes the tile away and the photo is gone from the server', async ({
    page,
    testPrefix,
  }) => {
    let draftId: string | null = null;

    try {
      draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });
      const capture = new DiaryCapturePage(page);
      await capture.gotoEdit(draftId);

      await capture.addFiles(capturePhotos(1, `${testPrefix}-s6`));
      await capture.waitForUploaded(1);
      await expect.poll(async () => (await listEntryPhotos(page, draftId!)).length).toBe(1);

      await capture.removeTile(0);

      // No tile is left, and the server no longer lists the photo
      await expect(capture.tiles).toHaveCount(0);
      await expect.poll(async () => (await listEntryPhotos(page, draftId!)).length).toBe(0);
    } finally {
      if (draftId) await deleteDiaryEntryViaApi(page, draftId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: Multiple files
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Multiple files upload together (Scenario 7)', () => {
  test('Select 2 files: both tiles appear and both upload', async ({ page, testPrefix }) => {
    let draftId: string | null = null;
    let cleanupRoutes: (() => Promise<void>) | null = null;

    try {
      draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });

      // Both files need to be in flight for the simultaneous assertion
      cleanupRoutes = await slowUploads(page, 1500);

      const capture = new DiaryCapturePage(page);
      await capture.gotoEdit(draftId);
      await capture.addFiles(capturePhotos(2, `${testPrefix}-s7`));

      await expect(capture.tiles).toHaveCount(2);
      await expect(capture.tile(0)).toHaveAttribute('data-state', /uploading|waiting/);
      await expect(capture.tile(1)).toHaveAttribute('data-state', /uploading|waiting/);
      await capture.waitForUploaded(2);
      await expect.poll(async () => (await listEntryPhotos(page, draftId!)).length).toBe(2);
    } finally {
      if (cleanupRoutes) await cleanupRoutes().catch(() => {});
      if (draftId) await deleteDiaryEntryViaApi(page, draftId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8: Multiple files — remove the first, the second stays
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Multiple files — remove the first (Scenario 8)', () => {
  test('Select 2 files: removing the first leaves the second', async ({ page, testPrefix }) => {
    let draftId: string | null = null;

    try {
      draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });

      const capture = new DiaryCapturePage(page);
      await capture.gotoEdit(draftId);
      await capture.addFiles(capturePhotos(2, `${testPrefix}-s8`));
      await capture.waitForUploaded(2);

      await capture.removeTile(0);

      // One tile is left ("Photo 1 of 1") and the server keeps exactly one photo
      await expect(capture.tiles).toHaveCount(1);
      await expect(capture.tileOpen(0)).toHaveAttribute('aria-label', /^Photo 1 of 1/);
      await expect.poll(async () => (await listEntryPhotos(page, draftId!)).length).toBe(1);
    } finally {
      if (draftId) await deleteDiaryEntryViaApi(page, draftId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 9: PhotoMetadataSidepanel orientation field persists
// ─────────────────────────────────────────────────────────────────────────────

test.describe('PhotoMetadataSidepanel — orientation persists across reload (Scenario 9)', () => {
  test('Select orientation in sidepanel, save, reload — orientation persists', async ({
    page,
    testPrefix,
  }) => {
    const orientationName = `${testPrefix} West`;
    let orientationId = '';
    let draftId: string | null = null;
    let photoId: string | null = null;

    try {
      // Seed orientation
      const orientResp = await page.request.post('/api/orientations', {
        data: { name: orientationName },
      });
      expect(orientResp.ok()).toBeTruthy();
      const orientBody = (await orientResp.json()) as { orientation: { id: string } };
      orientationId = orientBody.orientation.id;

      // Seed a diary entry (draft)
      draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });

      // Upload a real photo via API so the PhotoViewer can open it.
      // This uses a 1×1 px PNG to minimize test overhead.
      const photoBuffer = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64',
      );
      const photoResp = await page.request.post('/api/photos', {
        multipart: {
          entityType: 'diary_entry',
          entityId: draftId,
          file: {
            name: `sidepanel-${testPrefix}.png`,
            mimeType: 'image/png',
            buffer: photoBuffer,
          },
        },
      });
      if (!photoResp.ok()) {
        // Photo upload may fail if file storage is not configured in the E2E environment.
        // Skip gracefully rather than fail with an unrelated error.
        test.skip();
        return;
      }
      const photoBody = (await photoResp.json()) as { photo: { id: string } };
      photoId = photoBody.photo.id;

      // Navigate to the diary entry detail page (/diary/:id — NOT /diary/:id/edit)
      // and wait for the Photos section to load (which confirms the page is ready)
      await page.goto(`/diary/${draftId}`);
      // Wait for the photos section heading (h2: "Photos (N)") to appear.
      // The detail page h1 only renders for entries with a title; general_note
      // drafts have no title, so there is no h1. Wait for the photo section instead.
      await expect(page.getByRole('heading', { level: 2, name: /Photos/ })).toBeVisible();

      // Click the photo card to open the PhotoViewer
      const photoCard = page.getByTestId(`photo-card-${photoId}`);
      await photoCard.waitFor({ state: 'visible' });
      // Use the inner button (click area) which triggers the onClick handler
      await photoCard.getByRole('button', { name: /View photo/i }).click();

      // PhotoViewer opens — it portals to document.body
      const viewer = page.getByTestId('photo-viewer');
      await viewer.waitFor({ state: 'visible' });

      // Locate the sidepanel — it's inside the viewer container
      const sidepanel = page.locator('#photo-metadata-sidepanel');
      await sidepanel.waitFor({ state: 'attached' });

      // On narrow viewports (≤768px) toggle the sidepanel open first
      const viewportWidth = page.viewportSize()?.width ?? 1920;
      if (viewportWidth <= 768) {
        await page.getByTestId('photo-metadata-toggle').click();
        // Wait for the sidepanel to be open
        await expect(page.getByTestId('photo-metadata-toggle')).toHaveAttribute(
          'aria-expanded',
          'true',
        );
      }

      // Locate the Orientation picker input — SearchPicker with placeholder "Select an orientation"
      const orientationInput = sidepanel.locator('input[placeholder="Select an orientation"]');
      await orientationInput.click();
      await orientationInput.fill(orientationName);

      // Select from the portal dropdown
      const dropdown = page.locator('[data-search-picker-dropdown]');
      await dropdown.waitFor({ state: 'visible' });
      await dropdown.getByRole('option', { name: new RegExp(orientationName, 'i') }).click();
      await expect(dropdown).not.toBeVisible();

      // "Save" button should appear (hasChanges=true)
      const saveButton = sidepanel.getByRole('button', { name: 'Save', exact: true });
      await expect(saveButton).toBeVisible();

      // Register PATCH response listener BEFORE clicking save
      const patchResponse = page.waitForResponse(
        (resp) =>
          resp.url().includes(`/api/photos/${photoId}`) &&
          resp.request().method() === 'PATCH' &&
          resp.status() === 200,
      );
      await saveButton.click();
      const savedResp = await patchResponse;
      const savedBody = (await savedResp.json()) as { photo: { orientationId: string | null } };
      expect(savedBody.photo.orientationId).toBe(orientationId);

      // Close the PhotoViewer
      await page.getByTestId('photo-viewer-close').click();
      await expect(viewer).not.toBeVisible();

      // Reload the detail page
      await page.reload();
      await expect(page.getByRole('heading', { level: 2, name: /Photos/ })).toBeVisible();

      // Click the photo card again to reopen the viewer
      await photoCard.waitFor({ state: 'visible' });
      await photoCard.getByRole('button', { name: /View photo/i }).click();

      const viewerAfter = page.getByTestId('photo-viewer');
      await viewerAfter.waitFor({ state: 'visible' });

      // After reload, the sidepanel OrientationPicker receives `initialOrientationName`
      // from `photo.orientation?.name` (the saved value). SearchPicker with initialTitle
      // set shows the selected value in a `selectedDisplay` span (not an input).
      const sidepanelAfter = page.locator('#photo-metadata-sidepanel');
      await sidepanelAfter.waitFor({ state: 'attached' });

      if (viewportWidth <= 768) {
        await page.getByTestId('photo-metadata-toggle').click();
        await expect(page.getByTestId('photo-metadata-toggle')).toHaveAttribute(
          'aria-expanded',
          'true',
        );
      }

      // The picker shows the selected orientation name — either as a selected display
      // chip (class*="selectedDisplay") or as the input value if initial title is wired via value
      await expect(sidepanelAfter.locator('[class*="selectedDisplay"]').first()).toContainText(
        orientationName,
      );
    } finally {
      // Cleanup in dependency order: photo first, then entry, then orientation
      if (photoId) await page.request.delete(`/api/photos/${photoId}`).catch(() => {});
      if (draftId) await deleteDiaryEntryViaApi(page, draftId);
      if (orientationId)
        await page.request.delete(`/api/orientations/${orientationId}`).catch(() => {});
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 10: Take photos input attributes
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Take photos input — capture attribute verification (Scenario 10)',
  { tag: '@responsive' },
  () => {
    test('data-testid="capture-camera-input" has capture="environment" and accept="image/*"', async ({
      page,
    }) => {
      let draftId: string | null = null;
      try {
        draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });
        const capture = new DiaryCapturePage(page);
        await capture.gotoEdit(draftId);

        // The camera input is always in the DOM (even on desktop) but aria-hidden.
        // We check it's attached (not necessarily visible).
        await expect(capture.cameraInput).toBeAttached();
        await expect(capture.cameraInput).toHaveAttribute('capture', 'environment');
        await expect(capture.cameraInput).toHaveAttribute('accept', 'image/*');
      } finally {
        if (draftId) await deleteDiaryEntryViaApi(page, draftId);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 11: Orientation picker when no orientations configured
//
// English copy: "No orientations configured. Add them in Settings → Orientations."
// Rendered as: [data-search-picker-dropdown] div[class*="stateMessage"]
// ─────────────────────────────────────────────────────────────────────────────

test.describe('OrientationPicker in the photo sheet — no orientations (Scenario 11)', () => {
  test('When no orientations are configured, picker dropdown shows "No orientations configured" hint', async ({
    page,
    testPrefix,
  }) => {
    let draftId: string | null = null;

    try {
      // Mock GET /api/orientations to return empty list (ensures test is independent
      // of real orientations in the E2E database)
      await page.route('**/api/orientations*', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ orientations: [] }),
          });
        } else {
          await route.continue();
        }
      });

      draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });
      const capture = new DiaryCapturePage(page);
      await capture.gotoEdit(draftId);
      await capture.addFiles(capturePhotos(1, `${testPrefix}-s11`));
      await capture.waitForUploaded(1);
      await capture.sheet.open(0);

      // Click the orientation picker input to open the dropdown
      await capture.sheet.orientationInput.click();

      const dropdown = page.locator('[data-search-picker-dropdown]');
      await dropdown.waitFor({ state: 'visible' });

      // Expected (per spec): "No orientations configured. Add them in Settings → Orientations."
      await expect(dropdown).toContainText(/No orientations configured/i);
    } finally {
      if (draftId) await deleteDiaryEntryViaApi(page, draftId);
      await page.unroute('**/api/orientations*').catch(() => {});
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenarios 12–16 (Fix #1706): Mobile metadata toggle repositioning
//
// Before the fix (issue #1706), the toggle button stayed fixed at the
// bottom-right corner regardless of whether the sidepanel was open, causing it
// to overlap the panel's form inputs on mobile.
//
// After the fix:
//   Panel CLOSED on mobile: toggle is a floating bottom-right launcher,
//     rendered OUTSIDE #photo-metadata-sidepanel.
//   Panel OPEN on mobile:   toggle renders INSIDE the panel header
//     (#photo-metadata-sidepanel > .header), so it no longer overlaps inputs.
//   Desktop/tablet (≥768px): toggle is hidden (display:none),
//     sidepanel is always inline-visible.
//
// These tests use a fixed 375×667 mobile viewport for mobile scenarios (AC1-4)
// and a fixed 1280×800 viewport for the desktop check (AC6).  Both are forced
// via `page.setViewportSize()` inside the test rather than relying on the
// Playwright project's configured viewport, so the scenarios work correctly
// when run across desktop/tablet/mobile projects.
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'PhotoViewer metadata toggle repositioning on mobile (Fix #1706)',
  { tag: '@responsive' },
  () => {
    /** Shared photo buffer — 1×1 px PNG, minimal overhead */
    const PHOTO_BUFFER = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );

    /**
     * Shared setup: create a diary entry draft and upload a photo via API so
     * the PhotoViewer can be opened.  Returns a cleanup function (to be called
     * in `finally`).
     *
     * Returns `null` if the photo upload endpoint is not available (e.g. file
     * storage not configured) — callers must check for null and call
     * `test.skip()` if so.
     */
    async function setupDiaryWithPhoto(
      page: Page,
      testPrefix: string,
    ): Promise<{ draftId: string; photoId: string; cleanup: () => Promise<void> } | null> {
      const draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });

      const photoResp = await page.request.post('/api/photos', {
        multipart: {
          entityType: 'diary_entry',
          entityId: draftId,
          file: {
            name: `lightbox-toggle-${testPrefix}.png`,
            mimeType: 'image/png',
            buffer: PHOTO_BUFFER,
          },
        },
      });

      if (!photoResp.ok()) {
        // Photo storage not configured in this E2E environment — skip gracefully.
        await page.request.delete(`/api/diary-entries/${draftId}`).catch(() => {});
        return null;
      }

      const photoBody = (await photoResp.json()) as { photo: { id: string } };
      const photoId = photoBody.photo.id;

      const cleanup = async () => {
        await page.request.delete(`/api/photos/${photoId}`).catch(() => {});
        await deleteDiaryEntryViaApi(page, draftId);
      };

      return { draftId, photoId, cleanup };
    }

    /**
     * Navigate to the diary detail page and open the PhotoViewer for the given
     * photo.  Waits for the viewer to be fully visible before returning.
     */
    async function openPhotoViewer(page: Page, draftId: string, photoId: string): Promise<void> {
      await page.goto(`/diary/${draftId}`);
      // The detail page for a general_note draft with no title has no h1.
      // Wait for the Photos section heading instead.
      await expect(page.getByRole('heading', { level: 2, name: /Photos/ })).toBeVisible();

      const photoCard = page.getByTestId(`photo-card-${photoId}`);
      await photoCard.waitFor({ state: 'visible' });
      await photoCard.getByRole('button', { name: /View photo/i }).click();

      await page.getByTestId('photo-viewer').waitFor({ state: 'visible' });
    }

    // ─── AC1: Mobile, panel closed → toggle visible, aria-expanded="false", panel NOT visible ───

    test('AC1: Mobile panel closed — toggle visible outside panel, aria-expanded false, sidepanel hidden', async ({
      page,
      testPrefix,
    }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      const setup = await setupDiaryWithPhoto(page, testPrefix);
      if (!setup) {
        test.skip();
        return;
      }
      const { draftId, photoId, cleanup } = setup;

      try {
        await openPhotoViewer(page, draftId, photoId);

        const toggle = page.getByTestId('photo-metadata-toggle');
        const sidepanel = page.locator('#photo-metadata-sidepanel');

        // Toggle should be visible (mobile CSS shows it)
        await expect(toggle).toBeVisible();

        // aria-expanded must be "false" (panel is closed)
        await expect(toggle).toHaveAttribute('aria-expanded', 'false');

        // Toggle must NOT be inside the panel header (it is the floating launcher)
        const toggleInHeader = page
          .locator('#photo-metadata-sidepanel [class*="header"]')
          .getByTestId('photo-metadata-toggle');
        await expect(toggleInHeader).not.toBeAttached();

        // Sidepanel is not visible (display: none on mobile when closed)
        await expect(sidepanel).not.toBeVisible();
      } finally {
        await cleanup();
      }
    });

    // ─── AC2: Tap toggle → aria-expanded="true", panel visible, toggle now in panel header ──────

    test('AC2: Mobile — tapping toggle opens panel, aria-expanded becomes true, toggle moves into header', async ({
      page,
      testPrefix,
    }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      const setup = await setupDiaryWithPhoto(page, testPrefix);
      if (!setup) {
        test.skip();
        return;
      }
      const { draftId, photoId, cleanup } = setup;

      try {
        await openPhotoViewer(page, draftId, photoId);

        const toggle = page.getByTestId('photo-metadata-toggle');
        await toggle.click();

        // aria-expanded must now be "true"
        await expect(toggle).toHaveAttribute('aria-expanded', 'true');

        // Sidepanel is now visible
        const sidepanel = page.locator('#photo-metadata-sidepanel');
        await expect(sidepanel).toBeVisible();

        // Toggle must now be a descendant of the panel header
        const toggleInHeader = page
          .locator('#photo-metadata-sidepanel [class*="header"]')
          .getByTestId('photo-metadata-toggle');
        await expect(toggleInHeader).toBeVisible();
      } finally {
        await cleanup();
      }
    });

    // ─── AC3: Panel open → form inputs visible / not overlapped ──────────────────────────────────

    test('AC3: Mobile panel open — caption textarea is visible and its bounding box does not overlap the toggle', async ({
      page,
      testPrefix,
    }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      const setup = await setupDiaryWithPhoto(page, testPrefix);
      if (!setup) {
        test.skip();
        return;
      }
      const { draftId, photoId, cleanup } = setup;

      try {
        await openPhotoViewer(page, draftId, photoId);

        // Open panel
        const toggle = page.getByTestId('photo-metadata-toggle');
        await toggle.click();
        await expect(toggle).toHaveAttribute('aria-expanded', 'true');

        // Caption textarea must be visible and interactable
        const captionTextarea = page.locator('#photo-caption');
        await expect(captionTextarea).toBeVisible();

        // The in-header toggle must not overlap the textarea (regression check).
        // We verify that the toggle's bounding box does NOT intersect the textarea's.
        const toggleBox = await toggle.boundingBox();
        const textareaBox = await captionTextarea.boundingBox();
        expect(toggleBox).not.toBeNull();
        expect(textareaBox).not.toBeNull();

        // Intersection check: two boxes overlap when they share area on both axes.
        const overlapsX =
          toggleBox!.x < textareaBox!.x + textareaBox!.width &&
          toggleBox!.x + toggleBox!.width > textareaBox!.x;
        const overlapsY =
          toggleBox!.y < textareaBox!.y + textareaBox!.height &&
          toggleBox!.y + toggleBox!.height > textareaBox!.y;
        expect(
          overlapsX && overlapsY,
          'Toggle button must not overlap the caption textarea when panel is open',
        ).toBe(false);
      } finally {
        await cleanup();
      }
    });

    // ─── AC4: Tap in-header toggle → panel closes, toggle back to floating launcher ─────────────

    test('AC4: Mobile — tapping in-header toggle closes panel, aria-expanded becomes false, toggle back to floating launcher', async ({
      page,
      testPrefix,
    }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      const setup = await setupDiaryWithPhoto(page, testPrefix);
      if (!setup) {
        test.skip();
        return;
      }
      const { draftId, photoId, cleanup } = setup;

      try {
        await openPhotoViewer(page, draftId, photoId);

        // Open panel first
        const toggle = page.getByTestId('photo-metadata-toggle');
        await toggle.click();
        await expect(toggle).toHaveAttribute('aria-expanded', 'true');

        // Tap the in-header toggle to close
        const toggleInHeader = page
          .locator('#photo-metadata-sidepanel [class*="header"]')
          .getByTestId('photo-metadata-toggle');
        await expect(toggleInHeader).toBeVisible();
        await toggleInHeader.click();

        // aria-expanded must be "false" again
        await expect(toggle).toHaveAttribute('aria-expanded', 'false');

        // Sidepanel no longer visible
        const sidepanel = page.locator('#photo-metadata-sidepanel');
        await expect(sidepanel).not.toBeVisible();

        // Toggle is back to being the floating launcher (not in header)
        await expect(toggleInHeader).not.toBeAttached();
      } finally {
        await cleanup();
      }
    });

    // ─── AC6: Desktop viewport → toggle NOT visible, sidepanel always visible ────────────────────

    test('AC6: Desktop — toggle hidden (display:none), sidepanel always visible', async ({
      page,
      testPrefix,
    }) => {
      await page.setViewportSize({ width: 1280, height: 800 });

      const setup = await setupDiaryWithPhoto(page, testPrefix);
      if (!setup) {
        test.skip();
        return;
      }
      const { draftId, photoId, cleanup } = setup;

      try {
        await openPhotoViewer(page, draftId, photoId);

        // On desktop the toggle button has CSS display:none — not visible
        const toggle = page.getByTestId('photo-metadata-toggle');
        await expect(toggle).not.toBeVisible();

        // Sidepanel is always visible on desktop (no hide/show mechanism)
        const sidepanel = page.locator('#photo-metadata-sidepanel');
        await expect(sidepanel).toBeVisible();
      } finally {
        await cleanup();
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 12: Photo preview (Story #1722)
//
// The strip tile shows the picked photo at once: while the upload runs the img's src is a
// blob: object URL created from the File object.
//
// Scenario 12 (@smoke): default viewport — the tile image is visible and a blob: preview.
// Scenario 12b (@responsive): mobile viewport (375×667) — same assertions.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Photo preview in the strip (Scenario 12)', () => {
  test(
    'Photo preview visible on the tile after file selection (Scenario 12)',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      let draftId: string | null = null;
      let cleanupRoutes: (() => Promise<void>) | null = null;
      try {
        draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });
        cleanupRoutes = await slowUploads(page, 1500);
        const capture = new DiaryCapturePage(page);
        await capture.gotoEdit(draftId);

        await capture.addFiles(capturePhotos(1, `${testPrefix}-s12`));

        // The tile holds a preview image of the selected file while it uploads
        const previewImg = capture.tile(0).locator('img');
        await expect(previewImg).toBeVisible();
        await expect(previewImg).toHaveAttribute('src', /^blob:/);
        await capture.waitForUploaded(1);
      } finally {
        if (cleanupRoutes) await cleanupRoutes().catch(() => {});
        if (draftId) await deleteDiaryEntryViaApi(page, draftId);
      }
    },
  );

  test(
    'Preview present on mobile viewport (Scenario 12b)',
    { tag: '@responsive' },
    async ({ page, testPrefix }) => {
      // Force mobile viewport to verify the preview is not hidden at small screen sizes.
      await page.setViewportSize({ width: 375, height: 667 });

      let draftId: string | null = null;
      let cleanupRoutes: (() => Promise<void>) | null = null;
      try {
        draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });
        cleanupRoutes = await slowUploads(page, 1500);
        const capture = new DiaryCapturePage(page);
        await capture.gotoEdit(draftId);

        await capture.addFiles(capturePhotos(1, `${testPrefix}-s12b`));

        const previewImg = capture.tile(0).locator('img');
        await expect(previewImg).toBeVisible();
        await expect(previewImg).toHaveAttribute('src', /^blob:/);
        await capture.waitForUploaded(1);
      } finally {
        if (cleanupRoutes) await cleanupRoutes().catch(() => {});
        if (draftId) await deleteDiaryEntryViaApi(page, draftId);
      }
    },
  );
});

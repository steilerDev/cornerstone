/**
 * E2E tests for mobile photo capture → metadata modal → background upload flow
 * (Story #1674: Mobile photo upload optimization).
 *
 * What this tests:
 * 1. On mobile viewports: "Take photo" and "Upload Photos" buttons are visible.
 *    Drop zone is NOT shown because PhotoUpload detects `hover: none` (isTouchDevice).
 * 2. On desktop viewports: drop zone IS visible; no "Take photo" button.
 * 3. After selecting a file (via `setInputFiles` on the library input), the
 *    PhotoMetadataModal opens with title "Add photo details".
 * 4. Modal: fill description and select orientation (with secondary text visible in dropdown).
 * 5. "Save & upload" enqueues upload — file appears in the upload queue.
 * 6. "Cancel" discards file — nothing queued.
 * 7. Multiple files: sequential modals — save first → second opens, cancel second → done.
 * 8. Multiple files: cancel first → second modal opens (first file discarded).
 * 9. PhotoMetadataSidepanel orientation field: select → save → reload → persists.
 * 10. Take photo input: has data-testid="photo-camera-input", capture="environment",
 *     accept="image/*" — verifiable without actual camera.
 * 11. Orientation picker with no orientations configured: shows hint text.
 *
 * Important constraints:
 * - Real camera capture is NOT automatable in headless CI. Scenario 10 only asserts
 *   input attributes; it does NOT attempt to open the camera.
 * - The PhotoUpload component uses `window.matchMedia('(hover: none)')` to detect
 *   touch devices. The tablet and mobile Playwright projects use devices (iPad, iPhone)
 *   that set hasTouch=true and hover:none, so isTouchDevice will be true in those
 *   projects. Desktop (Chrome) has hover:hover, so isTouchDevice will be false.
 *   Tests that assert touch-specific UI are tagged @responsive so they run across
 *   desktop/tablet/mobile, then use viewport-width checks to condition the assertion.
 * - Host entity for the photo uploader: a diary entry (general_note draft).
 *   We navigate to /diary/:id/edit which renders PhotoUpload.
 * - Upload API calls are mocked with a deliberate delay so the queue entry remains
 *   visible during the assertion window before the upload completes.
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/auth.js';
import { createDraftDiaryEntryViaApi, deleteDiaryEntryViaApi } from '../fixtures/apiHelpers.js';

// Minimal in-memory JPEG bytes for setInputFiles (avoids disk path dependency on CI)
const MINIMAL_JPEG = {
  name: 'test-capture.jpg',
  mimeType: 'image/jpeg' as const,
  buffer: Buffer.from(
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFgABAQEAAAAAAAAAAAAAAAAABgUEA/8QAHxAAAQQCAwEAAAAAAAAAAAAAAQACAxESITFBUf/aAAgBAQAA/wBZkNBrSHb3L2oqXQgqUSRhqX',
    'base64',
  ),
};

const MINIMAL_JPEG_2 = { ...MINIMAL_JPEG, name: 'test-capture-2.jpg' };

/** Create a valid mock photo response matching the Photo type shape expected by uploadPhoto(). */
function mockPhotoResponse(id: string, entityId: string) {
  return {
    photo: {
      id,
      entityType: 'diary_entry',
      entityId,
      originalFilename: `${id}.jpg`,
      mimeType: 'image/jpeg',
      fileSize: 1024,
      width: null,
      height: null,
      takenAt: null,
      caption: null,
      areaId: null,
      orientationId: null,
      orientation: null,
      sortOrder: 0,
      createdBy: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      annotatedAt: null,
      fileUrl: `/api/photos/${id}/file`,
      thumbnailUrl: `/api/photos/${id}/thumbnail`,
    },
  };
}

/**
 * Mock the photo upload POST endpoint with a deliberate 300ms delay so the queue
 * entry has time to be visible during the assertion window before it disappears.
 * The PhotoUpload component removes entries from the queue immediately after a
 * successful upload, so a delay is needed to keep the entry visible long enough
 * for Playwright to assert it.
 */
async function mockUploadWithDelay(
  page: Page,
  draftId: string,
  photoIdPrefix: string,
): Promise<() => Promise<void>> {
  let uploadCount = 0;

  await page.route('**/api/photos', async (route) => {
    if (route.request().method() === 'POST') {
      uploadCount++;
      // Delay 400ms so the queue entry stays visible during assertion.
      // The PhotoUpload component removes queue entries immediately after a
      // successful upload, so a delay is needed to keep the entry visible.
      await new Promise((resolve) => setTimeout(resolve, 400));
      // Wrap in try-catch: if the test's finally block called page.unrouteAll()
      // while the 400ms delay was pending, Playwright aborts the request and
      // route.fulfill() throws "Route is already handled!". Suppress it so the
      // cleanup doesn't produce a test-level error.
      await route
        .fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(mockPhotoResponse(`${photoIdPrefix}-${uploadCount}`, draftId)),
        })
        .catch(() => {
          // Route was already handled (e.g., unrouteAll was called during cleanup) — ignore.
        });
    } else {
      await route.continue().catch(() => {});
    }
  });

  // Mock the GET refresh call that fires after upload.
  // Use a URL predicate function to reliably match query parameters regardless
  // of parameter ordering (plain glob patterns can't match query strings).
  await page.route(
    (url: URL) =>
      url.pathname.endsWith('/photos') &&
      url.searchParams.get('entityType') === 'diary_entry' &&
      url.searchParams.get('entityId') === draftId,
    async (route) => {
      if (route.request().method() === 'GET') {
        await route
          .fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ photos: [] }),
          })
          .catch(() => {});
      } else {
        await route.continue().catch(() => {});
      }
    },
  );

  return async () => page.unrouteAll();
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1 & 2: Mobile vs desktop layout — button/drop zone visibility
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Photo upload layout — mobile vs desktop (Scenarios 1 & 2)',
  { tag: '@responsive' },
  () => {
    test('Mobile viewport: Take photo + Upload Photos buttons visible, drop zone hidden', async ({
      page,
    }) => {
      // This assertion is only meaningful when isTouchDevice is true,
      // which occurs on tablet and mobile projects (hover: none).
      // On desktop this test still runs but we condition the strict
      // assertion on the viewport width as a proxy.
      const viewportWidth = page.viewportSize()?.width ?? 1920;
      const isMobileOrTablet = viewportWidth <= 1024;

      let draftId: string | null = null;
      try {
        draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });
        await page.goto(`/diary/${draftId}/edit`);
        await page
          .getByRole('heading', { level: 1, name: 'Edit Diary Entry' })
          .waitFor({ state: 'visible' });

        if (isMobileOrTablet) {
          // Mobile/tablet: two-button pair must be visible
          const takePhotoBtn = page.getByRole('button', { name: /Take Photo/i });
          const uploadBtn = page.getByRole('button', { name: /Upload Photos/i });
          await expect(takePhotoBtn).toBeVisible();
          await expect(uploadBtn).toBeVisible();

          // Drop zone must NOT be visible
          const dropZone = page.getByTestId('photo-upload-zone');
          await expect(dropZone).not.toBeVisible();
        } else {
          // Desktop: drop zone must be visible
          const dropZone = page.getByTestId('photo-upload-zone');
          await expect(dropZone).toBeVisible();
        }
      } finally {
        if (draftId) await deleteDiaryEntryViaApi(page, draftId);
      }
    });

    test('Desktop viewport: drop zone visible, no Take photo button shown', async ({ page }) => {
      const viewportWidth = page.viewportSize()?.width ?? 1920;
      const isDesktop = viewportWidth > 1024;

      let draftId: string | null = null;
      try {
        draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });
        await page.goto(`/diary/${draftId}/edit`);
        await page
          .getByRole('heading', { level: 1, name: 'Edit Diary Entry' })
          .waitFor({ state: 'visible' });

        if (isDesktop) {
          await expect(page.getByTestId('photo-upload-zone')).toBeVisible();
          // Desktop: no "Take photo" button because isTouchDevice is false
          await expect(page.getByRole('button', { name: /Take Photo/i })).not.toBeVisible();
        }
      } finally {
        if (draftId) await deleteDiaryEntryViaApi(page, draftId);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Selecting a file opens PhotoMetadataModal
// ─────────────────────────────────────────────────────────────────────────────

test.describe('PhotoMetadataModal opens after file selection (Scenario 3)', () => {
  test(
    '[smoke] Selecting a file via photo-library-input opens modal with title "Add photo details"',
    { tag: '@smoke' },
    async ({ page }) => {
      let draftId: string | null = null;
      try {
        draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });
        await page.goto(`/diary/${draftId}/edit`);
        await page
          .getByRole('heading', { level: 1, name: 'Edit Diary Entry' })
          .waitFor({ state: 'visible' });

        // Trigger the library input (works on both mobile and desktop because the
        // hidden input is always in the DOM regardless of isTouchDevice)
        const libraryInput = page.getByTestId('photo-library-input');
        await libraryInput.setInputFiles([MINIMAL_JPEG]);

        // PhotoMetadataModal opens — uses Modal component with title="Add photo details"
        const modal = page.getByRole('dialog', { name: 'Add photo details' });
        await modal.waitFor({ state: 'visible' });
        await expect(modal.getByRole('heading', { name: 'Add photo details' })).toBeVisible();
      } finally {
        if (draftId) await deleteDiaryEntryViaApi(page, draftId);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Fill modal fields (description, orientation with secondary text)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('PhotoMetadataModal — fill fields (Scenario 4)', () => {
  test('Fill description and select orientation — orientation dropdown shows name + description on second line', async ({
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
      await page.goto(`/diary/${draftId}/edit`);
      await page
        .getByRole('heading', { level: 1, name: 'Edit Diary Entry' })
        .waitFor({ state: 'visible' });

      const libraryInput = page.getByTestId('photo-library-input');
      await libraryInput.setInputFiles([MINIMAL_JPEG]);

      const modal = page.getByRole('dialog', { name: 'Add photo details' });
      await modal.waitFor({ state: 'visible' });

      // Fill description
      const descriptionField = modal.locator('#modal-photo-caption');
      await descriptionField.fill('Garden view from east');

      // Open the orientation picker — SearchPicker input inside the modal
      // Placeholder is "Select an orientation" (t('aria.selectOrientation'))
      const orientationInput = modal.locator('input[placeholder="Select an orientation"]');
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

      // Dropdown closes
      await expect(dropdown).not.toBeVisible();
    } finally {
      if (draftId) await deleteDiaryEntryViaApi(page, draftId);
      if (orientationId) {
        await page.request.delete(`/api/orientations/${orientationId}`).catch(() => {});
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: "Save & upload" enqueues file
// ─────────────────────────────────────────────────────────────────────────────

test.describe('PhotoMetadataModal — Save & upload (Scenario 5)', () => {
  test('"Save & upload" closes modal and file appears in upload queue', async ({
    page,
    testPrefix,
  }) => {
    let draftId: string | null = null;
    let cleanupRoutes: (() => Promise<void>) | null = null;

    try {
      draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });

      // Mock the upload with a delay so the queue entry is visible during assertion.
      // Without the delay the upload completes before the assertion can run since
      // PhotoUpload removes queue entries immediately after a successful upload.
      cleanupRoutes = await mockUploadWithDelay(page, draftId, `photo-s5-${testPrefix}`);

      await page.goto(`/diary/${draftId}/edit`);
      await page
        .getByRole('heading', { level: 1, name: 'Edit Diary Entry' })
        .waitFor({ state: 'visible' });

      // Set file on library input to open modal
      const libraryInput = page.getByTestId('photo-library-input');
      await libraryInput.setInputFiles([MINIMAL_JPEG]);

      const modal = page.getByRole('dialog', { name: 'Add photo details' });
      await modal.waitFor({ state: 'visible' });

      // Click "Save & upload"
      await modal.getByRole('button', { name: 'Save & upload', exact: true }).click();

      // Modal closes
      await expect(modal).not.toBeVisible();

      // File enters the upload queue while the mocked upload is in-flight (delayed 400ms).
      // The queue container has aria-label="Photo upload queue" and shows the filename.
      const queue = page.locator('[aria-label="Photo upload queue"]');
      await expect(queue).toBeVisible();
      await expect(queue).toContainText(MINIMAL_JPEG.name);
    } finally {
      if (cleanupRoutes) await cleanupRoutes().catch(() => {});
      if (draftId) await deleteDiaryEntryViaApi(page, draftId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: "Cancel" discards file (nothing queued)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('PhotoMetadataModal — Cancel discards file (Scenario 6)', () => {
  test('Cancel closes modal; file is NOT enqueued', async ({ page }) => {
    let draftId: string | null = null;

    try {
      draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });
      await page.goto(`/diary/${draftId}/edit`);
      await page
        .getByRole('heading', { level: 1, name: 'Edit Diary Entry' })
        .waitFor({ state: 'visible' });

      const libraryInput = page.getByTestId('photo-library-input');
      await libraryInput.setInputFiles([MINIMAL_JPEG]);

      const modal = page.getByRole('dialog', { name: 'Add photo details' });
      await modal.waitFor({ state: 'visible' });

      // Click Cancel
      await modal.getByRole('button', { name: 'Cancel', exact: true }).click();

      // Modal closes
      await expect(modal).not.toBeVisible();

      // No upload queue appears (the file was discarded)
      const queue = page.locator('[aria-label="Photo upload queue"]');
      await expect(queue).not.toBeVisible();
    } finally {
      if (draftId) await deleteDiaryEntryViaApi(page, draftId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: Multiple files — sequential modals (save both)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('PhotoMetadataModal — multiple files, save all (Scenario 7)', () => {
  test('Select 2 files: first modal opens → save → second modal opens → save → both queued', async ({
    page,
    testPrefix,
  }) => {
    let draftId: string | null = null;
    let cleanupRoutes: (() => Promise<void>) | null = null;

    try {
      draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });

      // Mock upload with delay — both files need to be in-flight for simultaneous assertion
      cleanupRoutes = await mockUploadWithDelay(page, draftId, `photo-s7-${testPrefix}`);

      await page.goto(`/diary/${draftId}/edit`);
      await page
        .getByRole('heading', { level: 1, name: 'Edit Diary Entry' })
        .waitFor({ state: 'visible' });

      // Set 2 files at once on the library input
      const libraryInput = page.getByTestId('photo-library-input');
      await libraryInput.setInputFiles([MINIMAL_JPEG, MINIMAL_JPEG_2]);

      const modal = page.getByRole('dialog', { name: 'Add photo details' });

      // First modal — save.
      // After saving file 1, the modal immediately re-renders showing file 2 (does NOT close
      // between sequential files). Only assert not-visible AFTER the LAST file is processed.
      await modal.waitFor({ state: 'visible' });
      await modal.getByRole('button', { name: 'Save & upload', exact: true }).click();

      // Second modal — save (modal was still visible, now showing file 2)
      await modal.waitFor({ state: 'visible' });
      await modal.getByRole('button', { name: 'Save & upload', exact: true }).click();
      // Modal closes only after the last file is processed
      await expect(modal).not.toBeVisible();

      // Both files should appear in the queue while the uploads are in-flight (delayed 400ms).
      // Both entries are added before the delayed upload completes.
      const queue = page.locator('[aria-label="Photo upload queue"]');
      await expect(queue).toBeVisible();
      await expect(queue).toContainText(MINIMAL_JPEG.name);
      await expect(queue).toContainText(MINIMAL_JPEG_2.name);
    } finally {
      if (cleanupRoutes) await cleanupRoutes().catch(() => {});
      if (draftId) await deleteDiaryEntryViaApi(page, draftId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8: Multiple files — cancel first, second modal opens
// ─────────────────────────────────────────────────────────────────────────────

test.describe('PhotoMetadataModal — multiple files, cancel first (Scenario 8)', () => {
  test('Select 2 files: cancel first modal → second modal opens → first file discarded', async ({
    page,
    testPrefix,
  }) => {
    let draftId: string | null = null;
    let cleanupRoutes: (() => Promise<void>) | null = null;

    try {
      draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });

      // Mock upload with delay for the second file (first was cancelled so no upload fires)
      cleanupRoutes = await mockUploadWithDelay(page, draftId, `photo-s8-${testPrefix}`);

      await page.goto(`/diary/${draftId}/edit`);
      await page
        .getByRole('heading', { level: 1, name: 'Edit Diary Entry' })
        .waitFor({ state: 'visible' });

      const libraryInput = page.getByTestId('photo-library-input');
      await libraryInput.setInputFiles([MINIMAL_JPEG, MINIMAL_JPEG_2]);

      const modal = page.getByRole('dialog', { name: 'Add photo details' });

      // First modal — cancel (discard first file).
      // After cancelling file 1, the modal immediately re-renders showing file 2 (does NOT close
      // between sequential files). Only assert not-visible AFTER the LAST file is processed.
      await modal.waitFor({ state: 'visible' });
      await modal.getByRole('button', { name: 'Cancel', exact: true }).click();

      // Second modal — save (modal was still visible, now showing file 2)
      await modal.waitFor({ state: 'visible' });
      await modal.getByRole('button', { name: 'Save & upload', exact: true }).click();
      // Modal closes only after the last file is processed
      await expect(modal).not.toBeVisible();

      // Queue shows only the second file (first was cancelled) while upload is in-flight
      const queue = page.locator('[aria-label="Photo upload queue"]');
      await expect(queue).toBeVisible();
      await expect(queue).toContainText(MINIMAL_JPEG_2.name);
      await expect(queue).not.toContainText(MINIMAL_JPEG.name);
    } finally {
      if (cleanupRoutes) await cleanupRoutes().catch(() => {});
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
// Scenario 10: Take photo input attributes
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Take photo input — capture attribute verification (Scenario 10)',
  { tag: '@responsive' },
  () => {
    test('data-testid="photo-camera-input" has capture="environment" and accept="image/*"', async ({
      page,
    }) => {
      let draftId: string | null = null;
      try {
        draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });
        await page.goto(`/diary/${draftId}/edit`);
        await page
          .getByRole('heading', { level: 1, name: 'Edit Diary Entry' })
          .waitFor({ state: 'visible' });

        // The camera input is always in the DOM (even on desktop) but aria-hidden.
        // We check it's attached (not necessarily visible).
        const cameraInput = page.getByTestId('photo-camera-input');
        await expect(cameraInput).toBeAttached();
        await expect(cameraInput).toHaveAttribute('capture', 'environment');
        await expect(cameraInput).toHaveAttribute('accept', 'image/*');
      } finally {
        if (draftId) await deleteDiaryEntryViaApi(page, draftId);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 11: Orientation picker when no orientations configured
//
// Bug #1675 is now fixed:
//   - PhotoMetadataModal.tsx passes emptyHint={t('photoMetadataModal.noOrientationsHint')}
//     to OrientationPicker.
//   - SearchPicker renders an explicitly-provided emptyHint even when specialOptions
//     (the nullable "No orientation" option) is present — the emptyHint branch at
//     line 409 does not gate on specialOptions.
//
// English copy: "No orientations configured. Add them in Settings → Orientations."
// Rendered as: [data-search-picker-dropdown] div[class*="stateMessage"]
// ─────────────────────────────────────────────────────────────────────────────

test.describe('OrientationPicker in modal — no orientations (Scenario 11)', () => {
  test('When no orientations are configured, picker dropdown shows "No orientations configured" hint', async ({
    page,
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
      await page.goto(`/diary/${draftId}/edit`);
      await page
        .getByRole('heading', { level: 1, name: 'Edit Diary Entry' })
        .waitFor({ state: 'visible' });

      const libraryInput = page.getByTestId('photo-library-input');
      await libraryInput.setInputFiles([MINIMAL_JPEG]);

      const modal = page.getByRole('dialog', { name: 'Add photo details' });
      await modal.waitFor({ state: 'visible' });

      // Click the orientation picker input to open the dropdown
      const orientationInput = modal.locator('input[placeholder="Select an orientation"]');
      await orientationInput.click();

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

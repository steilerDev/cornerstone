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
 * 4. Modal: fill description, area, orientation (with secondary text visible in dropdown).
 * 5. "Save & upload" enqueues upload — file enters the queue.
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
 * - Upload API calls are mocked to avoid depending on file storage.
 */

import { test, expect } from '../fixtures/auth.js';
import {
  createDraftDiaryEntryViaApi,
  deleteDiaryEntryViaApi,
} from '../fixtures/apiHelpers.js';

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

/** Create a mock photo response matching the shape expected by uploadPhoto(). */
function mockPhotoResponse(id: string, entityId: string) {
  return {
    photo: {
      id,
      entityType: 'diary_entry',
      entityId,
      filename: `${id}.jpg`,
      mimeType: 'image/jpeg',
      fileSize: 1024,
      url: `/api/photos/${id}/file`,
      thumbnailUrl: `/api/photos/${id}/thumbnail`,
      caption: null,
      areaId: null,
      orientationId: null,
      orientation: null,
      createdAt: new Date().toISOString(),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1 & 2: Mobile vs desktop layout — button/drop zone visibility
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Photo upload layout — mobile vs desktop (Scenarios 1 & 2)',
  { tag: '@responsive' },
  () => {
    test(
      'Mobile viewport: Take photo + Upload Photos buttons visible, drop zone hidden',
      async ({ page, testPrefix }) => {
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
          await page.getByRole('heading', { level: 1, name: 'Edit Diary Entry' }).waitFor({
            state: 'visible',
          });

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
      },
    );

    test(
      'Desktop viewport: drop zone visible, no Take photo button shown',
      async ({ page, testPrefix }) => {
        const viewportWidth = page.viewportSize()?.width ?? 1920;
        const isDesktop = viewportWidth > 1024;

        let draftId: string | null = null;
        try {
          draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });
          await page.goto(`/diary/${draftId}/edit`);
          await page.getByRole('heading', { level: 1, name: 'Edit Diary Entry' }).waitFor({
            state: 'visible',
          });

          if (isDesktop) {
            await expect(page.getByTestId('photo-upload-zone')).toBeVisible();
            // Desktop: no "Take photo" button because isTouchDevice is false
            await expect(page.getByRole('button', { name: /Take Photo/i })).not.toBeVisible();
          }
        } finally {
          if (draftId) await deleteDiaryEntryViaApi(page, draftId);
        }
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Selecting a file opens PhotoMetadataModal
// ─────────────────────────────────────────────────────────────────────────────

test.describe('PhotoMetadataModal opens after file selection (Scenario 3)', () => {
  test(
    '[smoke] Selecting a file via photo-library-input opens modal with title "Add photo details"',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      let draftId: string | null = null;
      try {
        draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });
        await page.goto(`/diary/${draftId}/edit`);
        await page.getByRole('heading', { level: 1, name: 'Edit Diary Entry' }).waitFor({
          state: 'visible',
        });

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
// Scenario 4: Fill modal fields (description, area, orientation with secondary text)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('PhotoMetadataModal — fill fields (Scenario 4)', () => {
  test(
    'Fill description and select orientation — orientation dropdown shows name + description on second line',
    async ({ page, testPrefix }) => {
      // Seed: create an orientation that has a description so we can verify
      // the secondary text appears in the dropdown.
      const orientationName = `${testPrefix} Ost`;
      const orientationDesc = 'Garden-facing';
      let orientationId = '';
      let draftId: string | null = null;

      try {
        // Create orientation
        const orientResp = await page.request.post('/api/orientations', {
          data: { name: orientationName, description: orientationDesc },
        });
        expect(orientResp.ok()).toBeTruthy();
        const orientBody = (await orientResp.json()) as { orientation: { id: string } };
        orientationId = orientBody.orientation.id;

        draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });
        await page.goto(`/diary/${draftId}/edit`);
        await page.getByRole('heading', { level: 1, name: 'Edit Diary Entry' }).waitFor({
          state: 'visible',
        });

        const libraryInput = page.getByTestId('photo-library-input');
        await libraryInput.setInputFiles([MINIMAL_JPEG]);

        const modal = page.getByRole('dialog', { name: 'Add photo details' });
        await modal.waitFor({ state: 'visible' });

        // Fill description
        const descriptionField = modal.locator('#modal-photo-caption');
        await descriptionField.fill('Garden view from east');

        // Open the orientation picker — click/focus the SearchPicker input
        const orientationInput = modal.locator('[placeholder*="orientation"]');
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
          await page.request.delete(`/api/orientations/${orientationId}`);
        }
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: "Save & upload" enqueues file
// ─────────────────────────────────────────────────────────────────────────────

test.describe('PhotoMetadataModal — Save & upload (Scenario 5)', () => {
  test(
    '"Save & upload" closes modal and file enters upload queue',
    async ({ page, testPrefix }) => {
      let draftId: string | null = null;

      try {
        draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });

        // Mock the upload to avoid real file storage
        await page.route('**/api/photos', async (route) => {
          if (route.request().method() === 'POST') {
            await route.fulfill({
              status: 201,
              contentType: 'application/json',
              body: JSON.stringify(mockPhotoResponse(`photo-${testPrefix}`, draftId!)),
            });
          } else {
            await route.continue();
          }
        });
        // Also mock the GET for photo refresh after upload
        await page.route(
          `**/api/photos?entityType=diary_entry&entityId=${draftId}`,
          async (route) => {
            if (route.request().method() === 'GET') {
              await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ photos: [] }),
              });
            } else {
              await route.continue();
            }
          },
        );

        await page.goto(`/diary/${draftId}/edit`);
        await page.getByRole('heading', { level: 1, name: 'Edit Diary Entry' }).waitFor({
          state: 'visible',
        });

        // Set file on library input to open modal
        const libraryInput = page.getByTestId('photo-library-input');
        await libraryInput.setInputFiles([MINIMAL_JPEG]);

        const modal = page.getByRole('dialog', { name: 'Add photo details' });
        await modal.waitFor({ state: 'visible' });

        // Click "Save & upload"
        await modal.getByRole('button', { name: 'Save & upload', exact: true }).click();

        // Modal closes
        await expect(modal).not.toBeVisible();

        // File enters the upload queue — the queue container appears with the filename
        const queue = page.locator('[aria-label="Photo upload queue"]');
        await expect(queue).toBeVisible();
        await expect(queue).toContainText(MINIMAL_JPEG.name);
      } finally {
        if (draftId) await deleteDiaryEntryViaApi(page, draftId);
        await page.unrouteAll();
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: "Cancel" discards file (nothing queued)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('PhotoMetadataModal — Cancel discards file (Scenario 6)', () => {
  test(
    'Cancel closes modal; file is NOT enqueued',
    async ({ page, testPrefix }) => {
      let draftId: string | null = null;

      try {
        draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });
        await page.goto(`/diary/${draftId}/edit`);
        await page.getByRole('heading', { level: 1, name: 'Edit Diary Entry' }).waitFor({
          state: 'visible',
        });

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
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: Multiple files — sequential modals (save both)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('PhotoMetadataModal — multiple files, save all (Scenario 7)', () => {
  test(
    'Select 2 files: first modal opens → save → second modal opens → save → both queued',
    async ({ page, testPrefix }) => {
      let draftId: string | null = null;

      try {
        draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });

        // Mock upload for both files
        let uploadCount = 0;
        await page.route('**/api/photos', async (route) => {
          if (route.request().method() === 'POST') {
            uploadCount++;
            await route.fulfill({
              status: 201,
              contentType: 'application/json',
              body: JSON.stringify(
                mockPhotoResponse(`photo-multi-${testPrefix}-${uploadCount}`, draftId!),
              ),
            });
          } else {
            await route.continue();
          }
        });
        await page.route(
          `**/api/photos?entityType=diary_entry&entityId=${draftId}`,
          async (route) => {
            if (route.request().method() === 'GET') {
              await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ photos: [] }),
              });
            } else {
              await route.continue();
            }
          },
        );

        await page.goto(`/diary/${draftId}/edit`);
        await page.getByRole('heading', { level: 1, name: 'Edit Diary Entry' }).waitFor({
          state: 'visible',
        });

        // Set 2 files at once on the library input
        const libraryInput = page.getByTestId('photo-library-input');
        await libraryInput.setInputFiles([MINIMAL_JPEG, MINIMAL_JPEG_2]);

        const modal = page.getByRole('dialog', { name: 'Add photo details' });

        // First modal — save
        await modal.waitFor({ state: 'visible' });
        await modal.getByRole('button', { name: 'Save & upload', exact: true }).click();
        await expect(modal).not.toBeVisible();

        // Second modal — save
        await modal.waitFor({ state: 'visible' });
        await modal.getByRole('button', { name: 'Save & upload', exact: true }).click();
        await expect(modal).not.toBeVisible();

        // Both files in queue
        const queue = page.locator('[aria-label="Photo upload queue"]');
        await expect(queue).toBeVisible();
        await expect(queue).toContainText(MINIMAL_JPEG.name);
        await expect(queue).toContainText(MINIMAL_JPEG_2.name);
      } finally {
        if (draftId) await deleteDiaryEntryViaApi(page, draftId);
        await page.unrouteAll();
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8: Multiple files — cancel first, second modal opens
// ─────────────────────────────────────────────────────────────────────────────

test.describe('PhotoMetadataModal — multiple files, cancel first (Scenario 8)', () => {
  test(
    'Select 2 files: cancel first modal → second modal opens → first file discarded',
    async ({ page, testPrefix }) => {
      let draftId: string | null = null;

      try {
        draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });

        // Mock upload for the second file (first was cancelled)
        await page.route('**/api/photos', async (route) => {
          if (route.request().method() === 'POST') {
            await route.fulfill({
              status: 201,
              contentType: 'application/json',
              body: JSON.stringify(
                mockPhotoResponse(`photo-cancel-${testPrefix}`, draftId!),
              ),
            });
          } else {
            await route.continue();
          }
        });
        await page.route(
          `**/api/photos?entityType=diary_entry&entityId=${draftId}`,
          async (route) => {
            if (route.request().method() === 'GET') {
              await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ photos: [] }),
              });
            } else {
              await route.continue();
            }
          },
        );

        await page.goto(`/diary/${draftId}/edit`);
        await page.getByRole('heading', { level: 1, name: 'Edit Diary Entry' }).waitFor({
          state: 'visible',
        });

        const libraryInput = page.getByTestId('photo-library-input');
        await libraryInput.setInputFiles([MINIMAL_JPEG, MINIMAL_JPEG_2]);

        const modal = page.getByRole('dialog', { name: 'Add photo details' });

        // First modal — cancel (discard first file)
        await modal.waitFor({ state: 'visible' });
        await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
        await expect(modal).not.toBeVisible();

        // Second modal must appear (for the second file)
        await modal.waitFor({ state: 'visible' });
        // Save the second file
        await modal.getByRole('button', { name: 'Save & upload', exact: true }).click();
        await expect(modal).not.toBeVisible();

        // Queue shows only the second file (first was cancelled)
        const queue = page.locator('[aria-label="Photo upload queue"]');
        await expect(queue).toBeVisible();
        await expect(queue).toContainText(MINIMAL_JPEG_2.name);
        await expect(queue).not.toContainText(MINIMAL_JPEG.name);
      } finally {
        if (draftId) await deleteDiaryEntryViaApi(page, draftId);
        await page.unrouteAll();
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 9: PhotoMetadataSidepanel orientation field persists
// ─────────────────────────────────────────────────────────────────────────────

test.describe('PhotoMetadataSidepanel — orientation persists across reload (Scenario 9)', () => {
  test(
    'Select orientation in sidepanel, save, reload — orientation persists',
    async ({ page, testPrefix }) => {
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

        // Seed a diary entry
        draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });

        // Upload a real photo via API so the PhotoViewer can open
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
          // If photo upload fails (e.g. storage not configured), skip this test
          test.skip();
          return;
        }
        const photoBody = (await photoResp.json()) as { photo: { id: string } };
        photoId = photoBody.photo.id;

        // Navigate to the diary entry detail and open the photo
        await page.goto(`/diary/${draftId}`);
        await page.getByRole('heading', { level: 1, name: 'Diary Entry' }).waitFor({
          state: 'visible',
        }).catch(() => {
          // Detail page heading may vary; wait for the photos section
        });

        // Click the photo to open the PhotoViewer
        const photoCard = page.getByTestId(`photo-card-${photoId}`);
        await photoCard.waitFor({ state: 'visible' });
        await photoCard.click();

        // PhotoViewer opens — sidepanel is visible (desktop) or accessible via toggle
        const sidepanel = page.locator('#photo-metadata-sidepanel');
        await sidepanel.waitFor({ state: 'attached' });

        // On mobile, toggle the sidepanel open first
        const viewportWidth = page.viewportSize()?.width ?? 1920;
        if (viewportWidth <= 768) {
          const toggleBtn = page.getByTestId('photo-metadata-toggle');
          await toggleBtn.click();
        }

        // Locate the Orientation picker inside the sidepanel
        const orientationSection = sidepanel.locator('#photo-orientation').locator('..');
        const orientationInput = sidepanel.locator('[placeholder*="orientation"]');
        await orientationInput.click();
        await orientationInput.fill(orientationName);

        // Select from dropdown
        const dropdown = page.locator('[data-search-picker-dropdown]');
        await dropdown.waitFor({ state: 'visible' });
        await dropdown
          .getByRole('option', { name: new RegExp(orientationName, 'i') })
          .click();
        await expect(dropdown).not.toBeVisible();

        // "Save" button should appear (hasChanges=true)
        const saveButton = sidepanel.getByRole('button', { name: 'Save', exact: true });
        await expect(saveButton).toBeVisible();

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

        // Close PhotoViewer, reload, reopen — orientation persists
        await page.getByTestId('photo-viewer-close').click();
        await page.reload();
        await photoCard.waitFor({ state: 'visible' });
        await photoCard.click();

        // After reload the sidepanel shows the saved orientation
        const sidepanelAfter = page.locator('#photo-metadata-sidepanel');
        await sidepanelAfter.waitFor({ state: 'attached' });
        if (viewportWidth <= 768) {
          const toggleBtn = page.getByTestId('photo-metadata-toggle');
          await toggleBtn.click();
        }
        // The picker shows the selected orientation name as its current value
        const selectedDisplay = sidepanelAfter.locator(
          '[class*="selectedDisplay"], [class*="inputWrapper"] input',
        ).first();
        await expect(selectedDisplay).toContainText(orientationName);
      } finally {
        // Delete photo first (before entry), then entry, then orientation
        if (photoId) await page.request.delete(`/api/photos/${photoId}`).catch(() => {});
        if (draftId) await deleteDiaryEntryViaApi(page, draftId);
        if (orientationId) await page.request.delete(`/api/orientations/${orientationId}`).catch(() => {});
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 10: Take photo input attributes
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Take photo input — capture attribute verification (Scenario 10)',
  { tag: '@responsive' },
  () => {
    test(
      'data-testid="photo-camera-input" has capture="environment" and accept="image/*"',
      async ({ page, testPrefix }) => {
        let draftId: string | null = null;
        try {
          draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });
          await page.goto(`/diary/${draftId}/edit`);
          await page.getByRole('heading', { level: 1, name: 'Edit Diary Entry' }).waitFor({
            state: 'visible',
          });

          // The camera input is always in the DOM (even on desktop) but aria-hidden.
          // We check it's attached (not necessarily visible).
          const cameraInput = page.getByTestId('photo-camera-input');
          await expect(cameraInput).toBeAttached();
          await expect(cameraInput).toHaveAttribute('capture', 'environment');
          await expect(cameraInput).toHaveAttribute('accept', 'image/*');
        } finally {
          if (draftId) await deleteDiaryEntryViaApi(page, draftId);
        }
      },
    );
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

test.describe(
  'OrientationPicker in modal — no orientations (Scenario 11)',
  () => {
    test(
      'When no orientations are configured, picker dropdown shows "No orientations configured" hint',
      async ({ page, testPrefix }) => {
        let draftId: string | null = null;

        try {
          // Mock GET /api/orientations to return empty list
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
          await page.getByRole('heading', { level: 1, name: 'Edit Diary Entry' }).waitFor({
            state: 'visible',
          });

          const libraryInput = page.getByTestId('photo-library-input');
          await libraryInput.setInputFiles([MINIMAL_JPEG]);

          const modal = page.getByRole('dialog', { name: 'Add photo details' });
          await modal.waitFor({ state: 'visible' });

          const orientationInput = modal.locator('[placeholder*="orientation"]');
          await orientationInput.click();

          const dropdown = page.locator('[data-search-picker-dropdown]');
          await dropdown.waitFor({ state: 'visible' });

          // Expected (per spec): "No orientations configured. Add them in Settings → Orientations."
          await expect(dropdown).toContainText(/No orientations configured/i);
        } finally {
          if (draftId) await deleteDiaryEntryViaApi(page, draftId);
          await page.unroute('**/api/orientations*');
        }
      },
    );
  },
);

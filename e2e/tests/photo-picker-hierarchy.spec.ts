/**
 * E2E tests for the photo lightbox picker hierarchy feature (Issue #1723).
 *
 * What this covers:
 * 1. Nested area option rows show the full path (#2236): muted ancestors, then the last level;
 *    the accessible name joins the levels with ", ". Top-level areas show no ancestors.
 * 2. Searching by parent name returns the parent AND all descendants.
 * 3. Searching a shared leaf name (same name on two floors) returns two results,
 *    each disambiguated by a DIFFERENT secondary line (ancestor path showing floor).
 * 4. Clearing the search restores the full tree.
 * 5. Edit tags in the details panel: select an area → Save tags → reload → persists; chip shows bare name
 *    (no em-dash prefix on the selected chip).
 * 6. Orientation: search by description-only text → matching orientation appears.
 *    Search by name → still appears (no regression).
 * 7. Mobile viewport: open the Details sheet, Edit tags, open area picker, two-line rows visible;
 *    option row height meets 44px touch target minimum.
 *
 * Test environment:
 * - All API calls are real (no mocking), except for the photo upload which may be skipped
 *   gracefully if photo storage is not configured.
 * - Area and orientation data is created via API in test setup and deleted in teardown.
 * - Photo data created via API for tests that need to open the PhotoViewer.
 *
 * Viewport handling:
 * - All tests tagged @responsive run across desktop, tablet, and mobile Playwright projects.
 * - Scenario 7 (mobile touch target) uses runtime viewport checks so it can validate
 *   the 44px requirement on mobile while still running (and being trivially valid) on
 *   desktop where the details panel is always visible.
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/auth.js';
import {
  createAreaViaApi,
  deleteAreaViaApi,
  createOrientationViaApi,
  deleteOrientationViaApi,
  createDraftDiaryEntryViaApi,
  deleteDiaryEntryViaApi,
} from '../fixtures/apiHelpers.js';
import { PhotoViewerPage } from '../pages/PhotoViewerPage.js';

// ─────────────────────────────────────────────────────────────────────────────
// Shared test utilities
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal 1×1 px PNG buffer — minimal test overhead for photo upload */
const PHOTO_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * Upload a real photo via the REST API and return its id.
 * Returns null if photo storage is not configured (non-OK response).
 * Callers must check for null and call `test.skip()` if so.
 */
async function uploadPhotoViaApi(
  page: Page,
  entityId: string,
  filename: string,
): Promise<string | null> {
  const resp = await page.request.post('/api/photos', {
    multipart: {
      entityType: 'diary_entry',
      entityId,
      file: { name: filename, mimeType: 'image/png', buffer: PHOTO_BUFFER },
    },
  });
  if (!resp.ok()) return null;
  const body = (await resp.json()) as { photo: { id: string } };
  return body.photo.id;
}

/**
 * Navigate to a diary entry detail page and open the PhotoViewer for a given photo.
 * Returns after the viewer is fully visible.
 */
async function openPhotoViewer(page: Page, draftId: string, photoId: string): Promise<void> {
  await page.goto(`/diary/${draftId}`);
  // A general_note draft has no title → no h1. Wait for the Photos section heading.
  await expect(page.getByRole('heading', { level: 2, name: /Photos/ })).toBeVisible();
  const photoCard = page.getByTestId(`photo-card-${photoId}`);
  await photoCard.waitFor({ state: 'visible' });
  await photoCard.getByRole('button', { name: /View photo/i }).click();
  await page.getByTestId('photo-viewer').waitFor({ state: 'visible' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Nested area row shows em-dash label + ancestor-path secondary;
//             top-level area shows NO secondary
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Area picker hierarchy display — full path with muted ancestors (Scenario 1)',
  { tag: '@responsive' },
  () => {
    test(
      '[smoke] Nested area shows its full path with muted ancestors; top-level shows no ancestors',
      { tag: '@smoke' },
      async ({ page, testPrefix }) => {
        // Seed a two-level area tree: Floor → Room
        const floorName = `${testPrefix} Floor1`;
        const roomName = `${testPrefix} Room1`;
        let floorId = '';
        let roomId = '';
        let draftId: string | null = null;
        let photoId: string | null = null;

        try {
          floorId = await createAreaViaApi(page, { name: floorName });
          roomId = await createAreaViaApi(page, { name: roomName, parentId: floorId });

          draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });
          photoId = await uploadPhotoViaApi(page, draftId, `hier-s1-${testPrefix}.png`);
          if (!photoId) {
            test.skip();
            return;
          }

          await openPhotoViewer(page, draftId, photoId);
          const viewer = new PhotoViewerPage(page);
          await viewer.openTagsEditor();

          // Open the area picker
          await viewer.openAreaPicker();

          const options = await viewer.getDropdownOptions();

          // Find the floor option (top-level, depth=0)
          const floorOption = options.find(
            (o) => o.label === floorName || o.label.endsWith(floorName),
          );
          expect(floorOption, `Floor option "${floorName}" should be in the dropdown`).toBeTruthy();
          // Top-level: no secondary line
          expect(
            floorOption!.secondary,
            'Top-level area should have no ancestor-path secondary line',
          ).toBeNull();

          // Find the room option (depth=1): its last level is the room, the floor is the muted
          // ancestor above it (the EntityPicker path, #2236)
          const roomOption = options.find((o) => o.label === roomName);
          expect(roomOption, `Room option "${roomName}" should be in the dropdown`).toBeTruthy();
          expect(
            roomOption!.secondary,
            'Nested area should show its ancestor path (the floor name)',
          ).toBe(floorName);
          // The accessible name is the path levels joined with commas
          await expect(
            viewer.pickerDropdown.getByRole('option', {
              name: `${floorName}, ${roomName}`,
              exact: true,
            }),
          ).toBeVisible();
        } finally {
          if (photoId) await page.request.delete(`/api/photos/${photoId}`).catch(() => {});
          if (draftId) await deleteDiaryEntryViaApi(page, draftId);
          if (roomId) await deleteAreaViaApi(page, roomId);
          if (floorId) await deleteAreaViaApi(page, floorId);
        }
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Search by parent name → parent + descendants appear
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Area picker hierarchy-aware search — parent search returns descendants (Scenario 2)',
  { tag: '@responsive' },
  () => {
    test('Searching a parent name returns the parent (server area search, #2236)', async ({
      page,
      testPrefix,
    }) => {
      // Seed: Floor2 → Room2A, Room2B
      const floorName = `${testPrefix} SearchFloor`;
      const room2aName = `${testPrefix} SearchRoom2A`;
      const room2bName = `${testPrefix} SearchRoom2B`;
      let floorId = '';
      let room2aId = '';
      let room2bId = '';
      let draftId: string | null = null;
      let photoId: string | null = null;

      try {
        floorId = await createAreaViaApi(page, { name: floorName });
        room2aId = await createAreaViaApi(page, { name: room2aName, parentId: floorId });
        room2bId = await createAreaViaApi(page, { name: room2bName, parentId: floorId });

        draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });
        photoId = await uploadPhotoViaApi(page, draftId, `hier-s2-${testPrefix}.png`);
        if (!photoId) {
          test.skip();
          return;
        }

        await openPhotoViewer(page, draftId, photoId);
        const viewer = new PhotoViewerPage(page);
        await viewer.openTagsEditor();

        // Open area picker and search by part of the floor name
        await viewer.openAreaPicker();
        // Use "SearchFloor" as the search term — matches the floor name
        await viewer.searchAreaPicker('SearchFloor');

        const options = await viewer.getDropdownOptions();
        const labels = options.map((o) => o.label);

        // Floor must be present
        expect(
          labels.some((l) => l.includes(floorName)),
          `Search results must include the floor "${floorName}"`,
        ).toBe(true);
      } finally {
        if (photoId) await page.request.delete(`/api/photos/${photoId}`).catch(() => {});
        if (draftId) await deleteDiaryEntryViaApi(page, draftId);
        if (room2aId) await deleteAreaViaApi(page, room2aId);
        if (room2bId) await deleteAreaViaApi(page, room2bId);
        if (floorId) await deleteAreaViaApi(page, floorId);
      }
    });

    test('Searching a parent name also returns its descendants', async ({ page, testPrefix }) => {
      // Seed: Floor2 → Room2A, Room2B
      const floorName = `${testPrefix} SearchFloor`;
      const room2aName = `${testPrefix} SearchRoom2A`;
      const room2bName = `${testPrefix} SearchRoom2B`;
      let floorId = '';
      let room2aId = '';
      let room2bId = '';
      let draftId: string | null = null;
      let photoId: string | null = null;

      try {
        floorId = await createAreaViaApi(page, { name: floorName });
        room2aId = await createAreaViaApi(page, { name: room2aName, parentId: floorId });
        room2bId = await createAreaViaApi(page, { name: room2bName, parentId: floorId });

        draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });
        photoId = await uploadPhotoViaApi(page, draftId, `hier-s2-${testPrefix}.png`);
        if (!photoId) {
          test.skip();
          return;
        }

        await openPhotoViewer(page, draftId, photoId);
        const viewer = new PhotoViewerPage(page);
        await viewer.openTagsEditor();

        // Open area picker and search by part of the floor name
        await viewer.openAreaPicker();
        // Use "SearchFloor" as the search term — matches the floor name
        await viewer.searchAreaPicker('SearchFloor');

        const options = await viewer.getDropdownOptions();
        const labels = options.map((o) => o.label);

        // Floor must be present
        expect(
          labels.some((l) => l.includes(floorName)),
          `Search results must include the floor "${floorName}"`,
        ).toBe(true);
        // Room2A must be present (descendant of the matched floor)
        expect(
          labels.some((l) => l.includes(room2aName)),
          `Search results must include descendant "${room2aName}"`,
        ).toBe(true);
        // Room2B must be present (also a descendant)
        expect(
          labels.some((l) => l.includes(room2bName)),
          `Search results must include descendant "${room2bName}"`,
        ).toBe(true);
      } finally {
        if (photoId) await page.request.delete(`/api/photos/${photoId}`).catch(() => {});
        if (draftId) await deleteDiaryEntryViaApi(page, draftId);
        if (room2aId) await deleteAreaViaApi(page, room2aId);
        if (room2bId) await deleteAreaViaApi(page, room2bId);
        if (floorId) await deleteAreaViaApi(page, floorId);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Shared leaf name across two floors → two results with DIFFERENT
//             secondary lines
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Area picker hierarchy-aware search — shared leaf name disambiguated by ancestor path (Scenario 3)',
  { tag: '@responsive' },
  () => {
    test('Searching a shared leaf name returns all matches, each with a different secondary (floor context)', async ({
      page,
      testPrefix,
    }) => {
      // Seed: FloorA → Bathroom (shared name), FloorB → Bathroom (shared name)
      const floorAName = `${testPrefix} FloorAlpha`;
      const floorBName = `${testPrefix} FloorBeta`;
      // Use a UNIQUE shared leaf name to avoid collisions with other tests' areas
      const sharedLeafName = `${testPrefix} SharedBath`;

      let floorAId = '';
      let floorBId = '';
      let bathAId = '';
      let bathBId = '';
      let draftId: string | null = null;
      let photoId: string | null = null;

      try {
        floorAId = await createAreaViaApi(page, { name: floorAName });
        floorBId = await createAreaViaApi(page, { name: floorBName });
        bathAId = await createAreaViaApi(page, { name: sharedLeafName, parentId: floorAId });
        bathBId = await createAreaViaApi(page, { name: sharedLeafName, parentId: floorBId });

        draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });
        photoId = await uploadPhotoViaApi(page, draftId, `hier-s3-${testPrefix}.png`);
        if (!photoId) {
          test.skip();
          return;
        }

        await openPhotoViewer(page, draftId, photoId);
        const viewer = new PhotoViewerPage(page);
        await viewer.openTagsEditor();

        // Search by the shared leaf name (use part unique enough to match only these two)
        await viewer.openAreaPicker();
        await viewer.searchAreaPicker('SharedBath');

        const options = await viewer.getDropdownOptions();

        // Filter to only the shared-leaf options (there must be at least 2)
        const leafOptions = options.filter((o) => o.label.includes(sharedLeafName));
        expect(
          leafOptions.length,
          `There should be at least 2 results for "${sharedLeafName}" (one per floor)`,
        ).toBeGreaterThanOrEqual(2);

        // Each must have a non-null secondary line (ancestor path)
        for (const opt of leafOptions) {
          expect(
            opt.secondary,
            `Each "${sharedLeafName}" result must have an ancestor-path secondary line`,
          ).toBeTruthy();
        }

        // The secondary lines must be DIFFERENT (different floors)
        const secondaries = leafOptions.map((o) => o.secondary);
        const uniqueSecondaries = new Set(secondaries);
        expect(
          uniqueSecondaries.size,
          'Each shared-leaf result must show a DIFFERENT secondary (floor context)',
        ).toBeGreaterThan(1);

        // The floor names should appear in the secondary lines
        const secondaryTexts = leafOptions.map((o) => o.secondary ?? '');
        expect(
          secondaryTexts.some((s) => s.includes(floorAName)),
          `One secondary should contain "${floorAName}"`,
        ).toBe(true);
        expect(
          secondaryTexts.some((s) => s.includes(floorBName)),
          `One secondary should contain "${floorBName}"`,
        ).toBe(true);
      } finally {
        if (photoId) await page.request.delete(`/api/photos/${photoId}`).catch(() => {});
        if (draftId) await deleteDiaryEntryViaApi(page, draftId);
        if (bathAId) await deleteAreaViaApi(page, bathAId);
        if (bathBId) await deleteAreaViaApi(page, bathBId);
        if (floorAId) await deleteAreaViaApi(page, floorAId);
        if (floorBId) await deleteAreaViaApi(page, floorBId);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Clear search → full tree restored
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Area picker hierarchy-aware search — clear search restores full tree (Scenario 4)',
  { tag: '@responsive' },
  () => {
    test('After searching, clearing the search input restores all areas in the dropdown', async ({
      page,
      testPrefix,
    }) => {
      // Seed: two top-level areas — only one matches a search term
      const matchingFloor = `${testPrefix} ClearFloorMatch`;
      const otherFloor = `${testPrefix} ClearFloorOther`;
      let matchingId = '';
      let otherId = '';
      let draftId: string | null = null;
      let photoId: string | null = null;

      try {
        matchingId = await createAreaViaApi(page, { name: matchingFloor });
        otherId = await createAreaViaApi(page, { name: otherFloor });

        draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });
        photoId = await uploadPhotoViaApi(page, draftId, `hier-s4-${testPrefix}.png`);
        if (!photoId) {
          test.skip();
          return;
        }

        await openPhotoViewer(page, draftId, photoId);
        const viewer = new PhotoViewerPage(page);
        await viewer.openTagsEditor();

        // 1. Open picker and verify both areas are in the full list
        await viewer.openAreaPicker();
        const initialOptions = await viewer.getDropdownOptions();
        const initialLabels = initialOptions.map((o) => o.label);
        expect(
          initialLabels.some((l) => l.includes(matchingFloor)),
          `Full list should include "${matchingFloor}"`,
        ).toBe(true);
        expect(
          initialLabels.some((l) => l.includes(otherFloor)),
          `Full list should include "${otherFloor}"`,
        ).toBe(true);

        // 2. Search for something that only matches one of them
        await viewer.searchAreaPicker('ClearFloorMatch');
        const filteredOptions = await viewer.getDropdownOptions();
        const filteredLabels = filteredOptions.map((o) => o.label);
        expect(
          filteredLabels.some((l) => l.includes(otherFloor)),
          `"${otherFloor}" should NOT appear in filtered results`,
        ).toBe(false);

        // 3. Clear the search
        await viewer.clearAreaPickerSearch();

        // 4. Full tree restored — both areas visible again
        const restoredOptions = await viewer.getDropdownOptions();
        const restoredLabels = restoredOptions.map((o) => o.label);
        expect(
          restoredLabels.some((l) => l.includes(matchingFloor)),
          `After clearing search, "${matchingFloor}" should reappear`,
        ).toBe(true);
        expect(
          restoredLabels.some((l) => l.includes(otherFloor)),
          `After clearing search, "${otherFloor}" should reappear`,
        ).toBe(true);
      } finally {
        if (photoId) await page.request.delete(`/api/photos/${photoId}`).catch(() => {});
        if (draftId) await deleteDiaryEntryViaApi(page, draftId);
        if (matchingId) await deleteAreaViaApi(page, matchingId);
        if (otherId) await deleteAreaViaApi(page, otherId);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Edit tags: select area → Save tags → reload → persists;
//             chip shows bare name (no em-dash)
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Area picker — select area, save, reload, verify persistence and bare chip name (Scenario 5)',
  { tag: '@responsive' },
  () => {
    test('Select a nested area, Save, reload photo — area persists and chip shows bare name without em-dash', async ({
      page,
      testPrefix,
    }) => {
      const floorName = `${testPrefix} PersistFloor`;
      const roomName = `${testPrefix} PersistRoom`;
      let floorId = '';
      let roomId = '';
      let draftId: string | null = null;
      let photoId: string | null = null;

      try {
        floorId = await createAreaViaApi(page, { name: floorName });
        roomId = await createAreaViaApi(page, { name: roomName, parentId: floorId });

        draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });
        photoId = await uploadPhotoViaApi(page, draftId, `hier-s5-${testPrefix}.png`);
        if (!photoId) {
          test.skip();
          return;
        }

        await openPhotoViewer(page, draftId, photoId);
        const viewer = new PhotoViewerPage(page);
        await viewer.openTagsEditor();

        // Open area picker and select the nested room
        await viewer.openAreaPicker();
        await viewer.selectDropdownOption(roomName);

        // Dropdown closes
        await expect(viewer.pickerDropdown).not.toBeVisible();

        // Chip shows the BARE room name (no em-dash prefix on the selected chip)
        const chipText = await viewer.getAreaSelectedDisplayText();
        expect(chipText, 'Selected area chip should show the bare area name').toBeTruthy();
        expect(chipText, `Chip text should be "${roomName}" without em-dash prefix`).toContain(
          roomName,
        );
        // Explicitly assert the chip does NOT start with an em-dash
        expect(chipText, 'Selected area chip must NOT start with an em-dash prefix').not.toMatch(
          /^—/,
        );

        // Save
        const patchResponse = page.waitForResponse(
          (resp) =>
            resp.url().includes(`/api/photos/${photoId}`) &&
            resp.request().method() === 'PATCH' &&
            resp.status() === 200,
        );
        await viewer.saveTagsButton.click();
        const savedResp = await patchResponse;
        const savedBody = (await savedResp.json()) as { photo: { areaId: string | null } };
        expect(savedBody.photo.areaId, 'Saved photo should have the correct areaId').toBe(roomId);

        // Close viewer and reload (phones: the Details sheet first)
        await viewer.closeDetailsIfPhone();
        await page.getByTestId('photo-viewer-close').click();
        await expect(page.getByTestId('photo-viewer')).not.toBeVisible();
        await page.reload();
        await expect(page.getByRole('heading', { level: 2, name: /Photos/ })).toBeVisible();

        // Reopen viewer
        await page.getByTestId(`photo-card-${photoId}`).waitFor({ state: 'visible' });
        await page
          .getByTestId(`photo-card-${photoId}`)
          .getByRole('button', { name: /View photo/i })
          .click();
        await page.getByTestId('photo-viewer').waitFor({ state: 'visible' });
        const viewerAfter = new PhotoViewerPage(page);
        await viewerAfter.openDetails();

        // Read mode names the saved area by its path (bare names inside the path, no em-dash)
        await expect(viewerAfter.detailsPanel.getByTestId('photo-details-area')).toContainText(
          roomName,
        );

        // After reload, the editor's AreaPicker shows the selectedDisplay chip with the bare name.
        await viewerAfter.openTagsEditor();
        await expect
          .poll(() => viewerAfter.getAreaSelectedDisplayText(), {
            message: 'After reload, area chip should still show the bare area name',
          })
          .toContain(roomName);
        const chipTextAfter = await viewerAfter.getAreaSelectedDisplayText();
        expect(
          chipTextAfter,
          'After reload, area chip must NOT start with em-dash prefix',
        ).not.toMatch(/^—/);
      } finally {
        if (photoId) await page.request.delete(`/api/photos/${photoId}`).catch(() => {});
        if (draftId) await deleteDiaryEntryViaApi(page, draftId);
        if (roomId) await deleteAreaViaApi(page, roomId);
        if (floorId) await deleteAreaViaApi(page, floorId);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Orientation picker — search by description text; name search still works
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Orientation picker — description-aware search (Scenario 6)',
  { tag: '@responsive' },
  () => {
    test('Search by description-only text returns the matching orientation', async ({
      page,
      testPrefix,
    }) => {
      // Create an orientation where description is unique and different from the name
      const orientName = `${testPrefix} SouthPicker`;
      const orientDesc = `${testPrefix} StreetFacing`;
      let orientId = '';
      let draftId: string | null = null;
      let photoId: string | null = null;

      try {
        orientId = await createOrientationViaApi(page, {
          name: orientName,
          description: orientDesc,
        });

        draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });
        photoId = await uploadPhotoViaApi(page, draftId, `hier-s6-${testPrefix}.png`);
        if (!photoId) {
          test.skip();
          return;
        }

        await openPhotoViewer(page, draftId, photoId);
        const viewer = new PhotoViewerPage(page);
        await viewer.openTagsEditor();

        // Open orientation picker — search by the description text (not the name)
        await viewer.openOrientationPicker();
        // Use "StreetFacing" — part of the description, NOT part of the name
        await viewer.searchOrientationPicker('StreetFacing');

        const dropdown = viewer.pickerDropdown;
        await expect(dropdown).toBeVisible();

        // The orientation option should appear, showing name as primary
        const option = dropdown.locator('[role="option"]').filter({ hasText: orientName });
        await expect(
          option,
          `Orientation "${orientName}" should appear when searching by description text`,
        ).toBeVisible();

        // The secondary line should show the description
        const secondarySpan = option.locator('[class*="resultSecondary"]');
        await expect(secondarySpan).toBeVisible();
        await expect(secondarySpan).toContainText(orientDesc);
      } finally {
        if (photoId) await page.request.delete(`/api/photos/${photoId}`).catch(() => {});
        if (draftId) await deleteDiaryEntryViaApi(page, draftId);
        if (orientId) await deleteOrientationViaApi(page, orientId);
      }
    });

    test('Search by orientation name still returns results (no regression to name matching)', async ({
      page,
      testPrefix,
    }) => {
      const orientName = `${testPrefix} NorthPicker`;
      const orientDesc = `${testPrefix} BackyardFacing`;
      let orientId = '';
      let draftId: string | null = null;
      let photoId: string | null = null;

      try {
        orientId = await createOrientationViaApi(page, {
          name: orientName,
          description: orientDesc,
        });

        draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });
        photoId = await uploadPhotoViaApi(page, draftId, `hier-s6b-${testPrefix}.png`);
        if (!photoId) {
          test.skip();
          return;
        }

        await openPhotoViewer(page, draftId, photoId);
        const viewer = new PhotoViewerPage(page);
        await viewer.openTagsEditor();

        // Search by name (not description) — must still work
        await viewer.openOrientationPicker();
        await viewer.searchOrientationPicker('NorthPicker');

        const option = viewer.pickerDropdown
          .locator('[role="option"]')
          .filter({ hasText: orientName });
        await expect(
          option,
          `Orientation "${orientName}" should appear when searching by name`,
        ).toBeVisible();
      } finally {
        if (photoId) await page.request.delete(`/api/photos/${photoId}`).catch(() => {});
        if (draftId) await deleteDiaryEntryViaApi(page, draftId);
        if (orientId) await deleteOrientationViaApi(page, orientId);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: Mobile — open the Details sheet, two-line rows visible,
//             option row height ≥ 44px touch target
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Area picker on mobile — Details opens the panel, two-line rows visible, touch target ≥ 44px (Scenario 7)',
  { tag: '@responsive' },
  () => {
    test('Mobile: open the Details sheet, area picker shows two-line rows with touch-target height', async ({
      page,
      testPrefix,
    }) => {
      const viewportWidth = page.viewportSize()?.width ?? 1920;
      // Mobile-only: skip on desktop (viewport > 767px).
      // Tablet (768px) and above show the details panel without a Details button.
      // We still run on tablet/desktop but skip the mobile-specific toggle assertion.
      const isMobile = viewportWidth < 768;

      const floorName = `${testPrefix} MobileFloor`;
      const roomName = `${testPrefix} MobileRoom`;
      let floorId = '';
      let roomId = '';
      let draftId: string | null = null;
      let photoId: string | null = null;

      try {
        floorId = await createAreaViaApi(page, { name: floorName });
        roomId = await createAreaViaApi(page, { name: roomName, parentId: floorId });

        draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });
        photoId = await uploadPhotoViaApi(page, draftId, `hier-s7-${testPrefix}.png`);
        if (!photoId) {
          test.skip();
          return;
        }

        await openPhotoViewer(page, draftId, photoId);
        const viewer = new PhotoViewerPage(page);

        if (isMobile) {
          // On mobile: the details panel lives in a sheet behind the Details button.
          await expect(viewer.detailsButton, 'Mobile Details button must be visible').toBeVisible();
          await expect(viewer.detailsPanel, 'Panel starts closed on mobile').toHaveCount(0);
          await viewer.detailsButton.click();
          await expect(
            viewer.detailsPanel,
            'Details panel must be visible after Details',
          ).toBeVisible();
        } else {
          // Desktop/tablet: the panel is always visible, there is no Details button
          await expect(
            viewer.detailsPanel,
            'Details panel must always be visible on desktop/tablet',
          ).toBeVisible();
          await expect(viewer.detailsButton).toHaveCount(0);
        }

        // Enter the editor
        await viewer.openTagsEditor();

        // Open area picker
        await viewer.openAreaPicker();

        const options = await viewer.getDropdownOptions();
        const roomOption = options.find((o) => o.label.includes(roomName));
        expect(
          roomOption,
          `Room option "${roomName}" must be visible in the dropdown`,
        ).toBeTruthy();

        // Verify two-line display: secondary line must be present for the nested room
        expect(
          roomOption!.secondary,
          'Nested area option must show a secondary ancestor-path line',
        ).toBeTruthy();
        expect(roomOption!.secondary).toContain(floorName);

        // Touch target height: verify the option row element is at least 44px tall.
        // This is the WCAG 2.5.5 / Apple HIG minimum for touch targets.
        if (isMobile) {
          const optionLocator = viewer.pickerDropdown
            .locator('[role="option"]')
            .filter({ hasText: roomName })
            .first();
          const box = await optionLocator.boundingBox();
          expect(box, 'Option bounding box must be non-null').not.toBeNull();
          expect(
            box!.height,
            `Touch target height ${box!.height}px must be ≥ 44px`,
          ).toBeGreaterThanOrEqual(44);
        }
      } finally {
        if (photoId) await page.request.delete(`/api/photos/${photoId}`).catch(() => {});
        if (draftId) await deleteDiaryEntryViaApi(page, draftId);
        if (roomId) await deleteAreaViaApi(page, roomId);
        if (floorId) await deleteAreaViaApi(page, floorId);
      }
    });
  },
);

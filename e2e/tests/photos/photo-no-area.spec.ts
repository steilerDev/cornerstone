/**
 * E2E tests for tagging photos that have no area (Story #2226, EPIC-21 P2.7): bulk "Set tags"
 * inside the 'No area' group of the Photos page, and "Edit tags" in the two photo viewers.
 *
 * Scenarios:
 *  N1  AC3  Select photos -> tiles; a signed entry's photo is not selectable; Select all skips it;
 *           Clear empties the selection (bar goes away)
 *  N2  AC3  Select 2 -> bar "2 photos selected" -> Set tags -> Area only -> Save: toast
 *           "2 photos moved to ‹area path›", tiles gone, the area's cell counts up, Done leaves
 *  N3  AC3  The same move, then Undo: photos back in 'No area', the area's cell is empty again
 *  N4  AC3  Bulk dialog: Save is disabled with a visible hint until something is chosen
 *  N5  AC3  A failing save (500 intercepted) shows an error in the dialog and keeps the selection;
 *           N5b: Cancel afterwards keeps both photos selected
 *  N6  AC6  Spot viewer: Details -> Edit tags -> set an area -> "Photo moved to ..." toast, next
 *           photo shown; Undo brings the photo back
 *  N7  AC6  Spot viewer: caption-only edit -> "Tags saved", photo stays, persisted after reload
 *  N8  AC6  Entry-page viewer: Edit tags -> caption and orientation -> "Tags saved"; reload ->
 *           persisted
 *  N9  AC6  Spot viewer: Edit tags is aria-disabled with a reason on a signed entry's photo
 *
 * Tablet is skipped for the bulk flow (N1-N5), as the spec asks for desktop and phone. Each test
 * seeds its own uniquely named areas/orientations/entries (synthetic data) and addresses tiles
 * and cells by id: the E2E database is shared by 8 parallel workers, so counts are never asserted
 * for groups other tests also write to.
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/auth.js';
import {
  createAreaViaApi,
  deleteAreaViaApi,
  createOrientationViaApi,
  deleteOrientationViaApi,
  createDiaryEntryViaApi,
  createDraftDiaryEntryViaApi,
  deleteDiaryEntryViaApi,
  uploadDiaryPhotoViaApi,
} from '../../fixtures/apiHelpers.js';
import { PhotosPage } from '../../pages/PhotosPage.js';
import { PhotoSpotViewerPage } from '../../pages/PhotoSpotViewerPage.js';
import { PhotoViewerPage } from '../../pages/PhotoViewerPage.js';
import { DiaryEntryDetailPage } from '../../pages/DiaryEntryDetailPage.js';
import { ToastRegion } from '../../pages/components/ToastRegion.js';

const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==';

interface Cleanup {
  entries: string[];
  areas: string[];
  orientations: string[];
}

async function runCleanup(page: Page, c: Cleanup): Promise<void> {
  for (const id of c.entries) await deleteDiaryEntryViaApi(page, id).catch(() => undefined);
  for (const id of [...c.areas].reverse()) await deleteAreaViaApi(page, id).catch(() => undefined);
  for (const id of c.orientations) await deleteOrientationViaApi(page, id).catch(() => undefined);
}

interface Seed {
  wingId: string;
  roomAId: string;
  roomBId: string;
  wingName: string;
  roomAName: string;
  roomBName: string;
  o1Id: string;
  o2Id: string;
  o1Name: string;
  o2Name: string;
  /** Two unlocked no-area photos (orientation o1), newest first */
  photoIds: [string, string];
  entryIds: [string, string];
  /** A no-area photo of a signed (locked) entry */
  signedPhotoId: string;
  signedEntryId: string;
}

/** Invented area/orientation names plus saved entries with no-area photos (and one signed). */
async function seed(page: Page, tag: string, c: Cleanup): Promise<Seed> {
  const wingName = `Wing-${tag}`;
  const roomAName = `RoomA-${tag}`;
  const roomBName = `RoomB-${tag}`;
  const o1Name = `Nord-${tag}`;
  const o2Name = `Floor-${tag}`;

  const wingId = await createAreaViaApi(page, { name: wingName });
  c.areas.push(wingId);
  const roomAId = await createAreaViaApi(page, { name: roomAName, parentId: wingId });
  c.areas.push(roomAId);
  const roomBId = await createAreaViaApi(page, { name: roomBName, parentId: wingId });
  c.areas.push(roomBId);
  const o1Id = await createOrientationViaApi(page, { name: o1Name });
  c.orientations.push(o1Id);
  const o2Id = await createOrientationViaApi(page, { name: o2Name });
  c.orientations.push(o2Id);

  const entryIds: string[] = [];
  const photoIds: string[] = [];
  for (const [i, date] of ['2026-06-12', '2026-06-11'].entries()) {
    const entryId = await createDiaryEntryViaApi(page, {
      entryType: 'general_note',
      entryDate: date,
      title: `Note${i + 1}-${tag}`,
      body: 'Photo without an area',
    });
    c.entries.push(entryId);
    entryIds.push(entryId);
    photoIds.push(await uploadDiaryPhotoViaApi(page, entryId, { orientationId: o1Id }));
  }

  // A signed entry takes no new photos: attach to the signed draft, then promote (locks it)
  const signedEntryId = await createDraftDiaryEntryViaApi(page, {
    entryType: 'daily_log',
    entryDate: '2026-06-10',
    metadata: {
      signatures: [
        { signerName: 'E2E Signer', signerType: 'self', signatureDataUrl: TINY_PNG_DATA_URL },
      ],
    },
  });
  c.entries.push(signedEntryId);
  const signedPhotoId = await uploadDiaryPhotoViaApi(page, signedEntryId, { orientationId: o1Id });
  const promoted = await page.request.patch(`/api/diary-entries/${signedEntryId}/promote`, {
    data: { title: `Signed-${tag}`, body: 'Signed entry with a photo.' },
  });
  expect(promoted.ok(), `promote signed draft: ${promoted.status()}`).toBeTruthy();

  return {
    wingId,
    roomAId,
    roomBId,
    wingName,
    roomAName,
    roomBName,
    o1Id,
    o2Id,
    o1Name,
    o2Name,
    photoIds: photoIds as [string, string],
    entryIds: entryIds as [string, string],
    signedPhotoId,
    signedEntryId,
  };
}

test.describe('Photos with no area: bulk tags and Edit tags', { tag: '@responsive' }, () => {
  let cleanup: Cleanup;

  test.beforeEach(() => {
    cleanup = { entries: [], areas: [], orientations: [] };
  });

  test.afterEach(async ({ page }) => {
    await runCleanup(page, cleanup);
  });

  const tagOf = (testPrefix: string, testInfo: { testId: string }): string =>
    `${testPrefix}-${testInfo.testId}`.slice(0, 36);

  /** Open the Photos page, enter select mode and pick the two unlocked seed photos. */
  async function selectTwo(page: Page, s: Seed): Promise<PhotosPage> {
    const photos = new PhotosPage(page);
    await photos.goto();
    await photos.startSelecting();
    await photos.selectPhotos([...s.photoIds]);
    await expect(photos.selectionBar).toContainText('2 photos selected');
    return photos;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // N1: select mode, signed photo not selectable, Select all, Clear
  // ───────────────────────────────────────────────────────────────────────────
  test('N1: Select photos shows tiles; a signed photo is not selectable and Select all skips it', async ({
    page,
    testPrefix,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'tablet', 'Bulk flow runs on desktop and phone');
    const s = await seed(page, tagOf(testPrefix, testInfo), cleanup);
    const photos = new PhotosPage(page);
    await photos.goto();

    await expect(photos.noAreaToggle).toHaveText('Select photos');
    await photos.startSelecting();

    for (const id of [...s.photoIds, s.signedPhotoId]) {
      await expect(photos.selectTile(id)).toBeVisible();
    }
    // The unlocked tiles are checkboxes; the signed one is a plain tile with a muted label
    await expect(photos.selectCheckbox(s.photoIds[0])).not.toBeChecked();
    await expect(photos.selectCheckbox(s.signedPhotoId)).toHaveCount(0);
    await expect(photos.selectTile(s.signedPhotoId)).toContainText('Signed entry');
    // Nothing selected: no bar yet
    await expect(photos.selectionBar).toHaveCount(0);

    // One tile selected -> the bar appears
    await photos.selectPhotos([s.photoIds[0]]);
    await expect(photos.selectionBar).toContainText('1 photo selected');

    // Select all picks every unlocked tile (other tests' photos too) and never the signed one
    await photos.selectAllButton.click();
    await expect(photos.selectCheckbox(s.photoIds[1])).toBeChecked();
    await expect(photos.selectCheckbox(s.signedPhotoId)).toHaveCount(0);
    const checkedCount = await photos.selectGroup.getByRole('checkbox', { checked: true }).count();
    expect(checkedCount).toBeGreaterThanOrEqual(2);
    await expect(photos.selectionBar).toContainText(`${checkedCount} photos selected`);

    // Clear empties the selection and the bar goes away
    await photos.clearButton.click();
    await expect(photos.selectionBar).toHaveCount(0);
    await expect(photos.selectGroup.getByRole('checkbox', { checked: true })).toHaveCount(0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // N2: move two photos to an area, Done
  // ───────────────────────────────────────────────────────────────────────────
  test('N2: Set tags moves the selected photos to the chosen area and Done leaves select mode', async ({
    page,
    testPrefix,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'tablet', 'Bulk flow runs on desktop and phone');
    const s = await seed(page, tagOf(testPrefix, testInfo), cleanup);
    const photos = await selectTwo(page, s);
    const toasts = new ToastRegion(page);

    await photos.setTagsButton.click();
    await expect(photos.bulkDialog).toBeVisible();
    await expect(photos.bulkDialog).toContainText('Set tags for 2 photos');
    await photos.bulkPick('Area', s.roomAName);
    // Orientation stays "Leave as is": the photos keep their orientation
    await expect(photos.bulkSaveButton).toBeEnabled();
    await photos.bulkSaveButton.click();

    await expect(photos.bulkDialog).toHaveCount(0);
    await expect(
      toasts.undoToastWith(`2 photos moved to ${s.wingName} › ${s.roomAName}`),
    ).toBeVisible();

    // The two tiles are gone; the signed photo stays (it was never selectable)
    for (const id of s.photoIds) await expect(photos.selectTile(id)).toHaveCount(0);
    await expect(photos.selectTile(s.signedPhotoId)).toBeVisible();
    await expect(photos.selectionBar).toHaveCount(0);

    // The area's cell now counts the two photos (their orientation was kept)
    await expect(photos.spotLink(s.roomAId, s.o1Id)).toHaveAttribute(
      'aria-label',
      /2 photos, latest/,
    );

    // Done leaves the mode: the toggle reads "Select photos" again, the tile grid is gone
    await photos.noAreaToggle.click();
    await expect(photos.noAreaToggle).toHaveText('Select photos');
    await expect(photos.selectGroup).toHaveCount(0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // N3: Undo
  // ───────────────────────────────────────────────────────────────────────────
  test('N3: Undo puts the moved photos back into the No area group', async ({
    page,
    testPrefix,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'tablet', 'Bulk flow runs on desktop and phone');
    const s = await seed(page, tagOf(testPrefix, testInfo), cleanup);
    const photos = await selectTwo(page, s);
    const toasts = new ToastRegion(page);

    await photos.setTagsButton.click();
    await photos.bulkPick('Area', s.roomAName);
    await photos.bulkSaveButton.click();
    await expect(toasts.undoToastWith('2 photos moved to')).toBeVisible();
    // Undo toasts show for 6 s: act at once
    await toasts.undoViaButton();

    for (const id of s.photoIds) await expect(photos.selectTile(id)).toBeVisible();
    await expect(photos.spotLink(s.roomAId, s.o1Id)).toContainText('No photos');
    // Leaving select mode brings the No area cell of the orientation back (it opens the group)
    await photos.noAreaToggle.click();
    await expect(photos.spotLink('none', s.o1Id)).toBeVisible();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // N4: the dialog never has a silent disabled Save
  // ───────────────────────────────────────────────────────────────────────────
  test('N4: Save stays disabled with a visible hint until an area or orientation is chosen', async ({
    page,
    testPrefix,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'tablet', 'Bulk flow runs on desktop and phone');
    const s = await seed(page, tagOf(testPrefix, testInfo), cleanup);
    const photos = await selectTwo(page, s);

    await photos.setTagsButton.click();
    await expect(photos.bulkDialog).toBeVisible();
    await expect(photos.bulkSaveButton).toBeDisabled();
    await expect(
      photos.bulkDialog.getByText('Choose an area, an orientation, or both.', { exact: false }),
    ).toBeVisible();
    // Both fields start on "Leave as is"
    await expect(photos.bulkField('Area')).toContainText('Leave as is');
    await expect(photos.bulkField('Orientation')).toContainText('Leave as is');

    // Choosing only an orientation is enough
    await photos.bulkPick('Orientation', s.o2Name);
    await expect(photos.bulkSaveButton).toBeEnabled();

    // Cancel keeps the selection and returns focus to Set tags
    await photos.bulkCancelButton.click();
    await expect(photos.bulkDialog).toHaveCount(0);
    await expect(photos.selectionBar).toContainText('2 photos selected');
    await expect(photos.setTagsButton).toBeFocused();
    for (const id of s.photoIds) await expect(photos.selectCheckbox(id)).toBeChecked();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // N5: error keeps the selection and the dialog values
  // ───────────────────────────────────────────────────────────────────────────
  test('N5: a failing save shows an error in the dialog and keeps the selection; retry works', async ({
    page,
    testPrefix,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'tablet', 'Bulk flow runs on desktop and phone');
    const s = await seed(page, tagOf(testPrefix, testInfo), cleanup);
    const photos = await selectTwo(page, s);
    const toasts = new ToastRegion(page);

    await page.route('**/api/photos/tags', (route) =>
      route.request().method() === 'PATCH'
        ? route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'boom' } }),
          })
        : route.continue(),
    );

    await photos.setTagsButton.click();
    await photos.bulkPick('Area', s.roomAName);
    await photos.bulkSaveButton.click();

    // The error sits in the dialog, the dialog stays, Save can be pressed again
    await expect(photos.bulkError).toContainText('An unexpected error occurred');
    await expect(photos.bulkDialog).toBeVisible();
    await expect(photos.bulkSaveButton).toBeEnabled();
    await expect(photos.bulkField('Area')).toContainText(s.roomAName);

    // Retry once the server answers
    await page.unroute('**/api/photos/tags');
    await photos.bulkSaveButton.click();
    await expect(photos.bulkDialog).toHaveCount(0);
    await expect(toasts.undoToastWith('2 photos moved to')).toBeVisible();
    for (const id of s.photoIds) await expect(photos.selectTile(id)).toHaveCount(0);
  });

  test('N5b: Cancel after a failed save keeps both photos selected', async ({
    page,
    testPrefix,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'tablet', 'Bulk flow runs on desktop and phone');
    const s = await seed(page, tagOf(testPrefix, testInfo), cleanup);
    const photos = await selectTwo(page, s);

    await page.route('**/api/photos/tags', (route) =>
      route.request().method() === 'PATCH'
        ? route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'boom' } }),
          })
        : route.continue(),
    );
    await photos.setTagsButton.click();
    await photos.bulkPick('Area', s.roomAName);
    await photos.bulkSaveButton.click();
    await expect(photos.bulkError).toBeVisible();
    await photos.bulkCancelButton.click();

    await expect(photos.bulkDialog).toHaveCount(0);
    await expect(photos.selectionBar).toContainText('2 photos selected');
    for (const id of s.photoIds) await expect(photos.selectCheckbox(id)).toBeChecked();
    await page.unroute('**/api/photos/tags');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // N6: spot viewer Edit tags moves a photo, Undo brings it back
  // ───────────────────────────────────────────────────────────────────────────
  test('N6: Edit tags in the spot viewer moves the photo, shows the next one, and Undo restores it', async ({
    page,
    testPrefix,
  }, testInfo) => {
    const s = await seed(page, tagOf(testPrefix, testInfo), cleanup);
    // Two photos on the spot "Room A · Nord": newest 2026-06-12, older 2026-06-11
    const p0 = await uploadDiaryPhotoViaApi(page, s.entryIds[0], {
      areaId: s.roomAId,
      orientationId: s.o1Id,
    });
    const p1 = await uploadDiaryPhotoViaApi(page, s.entryIds[1], {
      areaId: s.roomAId,
      orientationId: s.o1Id,
    });
    const viewer = new PhotoSpotViewerPage(page);
    const toasts = new ToastRegion(page);
    await viewer.goto(s.roomAId, s.o1Id, p0);

    await expect(viewer.position).toHaveText('1 of 2');
    await expect(viewer.title).toHaveText(`${s.wingName} › ${s.roomAName} · ${s.o1Name}`);
    await viewer.openTagsEditor();
    await viewer.pickInEditor('Area', s.roomBName);
    await viewer.saveTagsButton.click();

    // The photo left the spot: the next one (the older) is shown, with a move toast and Undo
    await expect(
      toasts.undoToastWith(`Photo moved to ${s.wingName} › ${s.roomBName} · ${s.o1Name}`),
    ).toBeVisible();
    await expect(viewer.position).toHaveText('1 of 1');
    await expect(page).toHaveURL((u) => u.searchParams.get('photo') === p1);
    await viewer.openDetails();
    await expect(viewer.date).toHaveText('June 11, 2026');

    await toasts.undoViaButton();
    await expect(viewer.position).toHaveText('1 of 2');
    await expect(page).toHaveURL((u) => u.searchParams.get('photo') === p0);
    await viewer.openDetails();
    await expect(viewer.area).toContainText(`${s.wingName} › ${s.roomAName}`);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // N7: caption-only edit stays on the photo
  // ───────────────────────────────────────────────────────────────────────────
  test('N7: a caption-only edit says "Tags saved", keeps the photo, and persists', async ({
    page,
    testPrefix,
  }, testInfo) => {
    const s = await seed(page, tagOf(testPrefix, testInfo), cleanup);
    const p0 = await uploadDiaryPhotoViaApi(page, s.entryIds[0], {
      areaId: s.roomAId,
      orientationId: s.o1Id,
    });
    const viewer = new PhotoSpotViewerPage(page);
    const toasts = new ToastRegion(page);
    const caption = `Caption-${tagOf(testPrefix, testInfo)}`;
    await viewer.goto(s.roomAId, s.o1Id, p0);

    await viewer.openTagsEditor();
    await viewer.captionField.fill(caption);
    await viewer.saveTagsButton.click();

    await expect(viewer.tagsSavedNote).toHaveText('Tags saved');
    await expect(viewer.caption).toHaveText(caption);
    await expect(viewer.detailsForm).toHaveCount(0);
    await expect(viewer.position).toHaveText('1 of 1');
    // No tag changed: no move toast
    await expect(toasts.undoToast).toHaveCount(0);
    // Focus returns to Edit tags
    await expect(viewer.editTagsButton).toBeFocused();

    await page.reload();
    await viewer.openDetails();
    await expect(viewer.caption).toHaveText(caption);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // N8: entry-page viewer Edit tags
  // ───────────────────────────────────────────────────────────────────────────
  test('N8: Edit tags in the entry-page photo viewer changes caption and orientation and persists', async ({
    page,
    testPrefix,
  }, testInfo) => {
    const s = await seed(page, tagOf(testPrefix, testInfo), cleanup);
    const entry = new DiaryEntryDetailPage(page);
    const viewer = new PhotoViewerPage(page);
    const caption = `Entry caption ${tagOf(testPrefix, testInfo)}`;
    const photoId = s.photoIds[0];

    const open = async (): Promise<void> => {
      await entry.goto(s.entryIds[0]);
      await expect(entry.loaded).toBeVisible();
      const card = page.getByTestId(`photo-card-${photoId}`);
      await expect(card).toBeVisible();
      await card.click();
      await expect(viewer.modal).toBeVisible();
    };

    await open();
    await viewer.openTagsEditor();
    await viewer.captionField.fill(caption);
    await viewer.pickInEditor('Orientation', s.o2Name);
    await viewer.saveTags(photoId);
    await expect(viewer.tagsSavedNote).toHaveText('Tags saved');
    await expect(viewer.captionValue).toHaveText(caption);

    await page.reload();
    await open();
    await viewer.openDetails();
    await expect(viewer.captionValue).toHaveText(caption);
    await expect(viewer.detailsPanel.getByTestId('photo-details-orientation')).toHaveText(s.o2Name);
    // The diary date replaces the retired "Upload date"
    await expect(viewer.detailsPanel.getByTestId('photo-details-date')).toHaveText('June 12, 2026');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // N9: signed photo: Edit tags disabled with a reason
  // ───────────────────────────────────────────────────────────────────────────
  test("N9: on a signed entry's photo Edit tags is aria-disabled and says why", async ({
    page,
    testPrefix,
  }, testInfo) => {
    const s = await seed(page, tagOf(testPrefix, testInfo), cleanup);
    const viewer = new PhotoSpotViewerPage(page);
    await viewer.goto('none', 'none', s.signedPhotoId);
    await expect(viewer.title).toHaveText('No area');

    await viewer.openDetails();
    await expect(viewer.editTagsButton).toHaveAttribute('aria-disabled', 'true');
    await expect(viewer.detailsPanel).toContainText(/Signed entries can.t be changed/);
    const reasonId = await viewer.editTagsButton.getAttribute('aria-describedby');
    expect(reasonId).toBeTruthy();
    // A click does nothing (a dispatched click: Playwright treats aria-disabled as not enabled,
    // and a forced click can fall outside the phone sheet's scroll area)
    await viewer.editTagsButton.dispatchEvent('click');
    await expect(viewer.detailsForm).toHaveCount(0);
  });
});

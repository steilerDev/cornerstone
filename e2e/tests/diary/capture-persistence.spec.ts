/**
 * E2E: on-device persistence of capture photos (#2221, R-M13, Decision 14).
 *
 * Photos are written to IndexedDB (`cornerstone-capture`, store `shots`) before any network call
 * and uploaded by an app-wide provider. IndexedDB survives `page.reload()` in the same context.
 *
 * Scenarios
 * 1. Resume after reload: uploads are held, 3 photos are picked, the page reloads on the same
 *    draft URL: "3 photos waiting to upload" shows, then the uploads finish (3 photos stored).
 * 2. Orphans: the draft request is aborted while 2 photos are picked, so they have no draft;
 *    `/diary/new` after a reload offers "2 photos from your last session are waiting." and
 *    Continue creates a draft and uploads them.
 * 3. Orphans: Discard deletes them (the store is empty), with no dialog.
 * 4. Purge: the draft is deleted on the server while photos wait on the device; after a reload
 *    an info toast says they were removed and the store is empty.
 * 5. Leave and continue: with photos waiting, the sidebar leaves the screen with no dialog, the
 *    uploads finish in the background, and the draft shows them when it is opened again.
 *
 * Desktop only (no @responsive tag): the persistence path does not depend on the viewport.
 */

import type { Page, Route } from '@playwright/test';
import { test, expect } from '../../fixtures/auth.js';
import { deleteDiaryEntryViaApi } from '../../fixtures/apiHelpers.js';
import { capturePhotos } from '../../fixtures/capturePhotos.js';
import { CaptureSeed, listEntryPhotos } from '../../fixtures/captureSeed.js';
import { DiaryCapturePage } from '../../pages/DiaryCapturePage.js';

/** Holds every `POST /api/photos` until `release()`; later requests pass straight through. */
async function holdUploads(page: Page): Promise<{ release: () => void }> {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/photos', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    await gate;
    // The request may have been abandoned by a reload while it waited.
    await route.continue().catch(() => undefined);
  });
  return { release };
}

/** Number of records in the capture store of the current page. */
async function storedShots(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('cornerstone-capture');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('shots')) {
            db.close();
            resolve(0);
            return;
          }
          const count = db.transaction('shots', 'readonly').objectStore('shots').count();
          count.onsuccess = () => {
            db.close();
            resolve(count.result);
          };
          count.onerror = () => reject(count.error);
        };
      }),
  );
}

/** Aborts `POST /api/diary-entries` so photos picked meanwhile stay without a draft. */
async function breakDraftCreation(page: Page): Promise<() => Promise<void>> {
  const handler = async (route: Route) => {
    if (route.request().method() === 'POST') await route.abort();
    else await route.continue();
  };
  await page.route('**/api/diary-entries', handler);
  return () => page.unroute('**/api/diary-entries', handler);
}

test.describe('Capture photo persistence', () => {
  test('1. waiting photos survive a reload and finish uploading', async ({ page, testPrefix }) => {
    const seed = new CaptureSeed(page, testPrefix);
    try {
      const { release } = await holdUploads(page);
      const capture = new DiaryCapturePage(page);
      await capture.goto();
      await capture.chooseFromLibrary(capturePhotos(3, `${testPrefix}-resume`));
      const id = await capture.waitForDraft();
      seed.trackEntry(id);
      await expect(capture.tiles).toHaveCount(3);
      await expect.poll(() => storedShots(page)).toBe(3);

      await page.reload();
      await capture.waitForForm();
      await expect(page).toHaveURL(new RegExp(`/diary/${id}/edit$`));
      await expect(capture.waitingCount).toHaveText('3 photos waiting to upload');
      await expect(capture.tiles).toHaveCount(3);

      release();
      await capture.waitForUploaded(3);
      await expect.poll(async () => (await listEntryPhotos(page, id)).length).toBe(3);
      await expect.poll(() => storedShots(page)).toBe(0);
      await expect(capture.waitingNotice).toHaveCount(0);
    } finally {
      await seed.cleanup();
    }
  });

  test('2. photos without a draft are offered on /diary/new and Continue uploads them', async ({
    page,
    testPrefix,
  }) => {
    const seed = new CaptureSeed(page, testPrefix);
    try {
      const restore = await breakDraftCreation(page);
      const capture = new DiaryCapturePage(page);
      await capture.goto();
      await capture.chooseFromLibrary(capturePhotos(2, `${testPrefix}-orphan`));
      await expect.poll(() => storedShots(page)).toBe(2);
      await expect(page).toHaveURL(/\/diary\/new$/);
      await restore();

      await capture.goto();
      await expect(capture.orphans).toContainText('2 photos from your last session are waiting.');
      await capture.tap(capture.orphansContinue);
      const id = await capture.waitForDraft();
      seed.trackEntry(id);
      await capture.waitForUploaded(2);
      await expect.poll(async () => (await listEntryPhotos(page, id)).length).toBe(2);
      await expect.poll(() => storedShots(page)).toBe(0);
    } finally {
      await seed.cleanup();
    }
  });

  test('3. Discard removes the orphaned photos without a dialog', async ({ page, testPrefix }) => {
    const seed = new CaptureSeed(page, testPrefix);
    try {
      const restore = await breakDraftCreation(page);
      const capture = new DiaryCapturePage(page);
      await capture.goto();
      await capture.chooseFromLibrary(capturePhotos(2, `${testPrefix}-drop`));
      await expect.poll(() => storedShots(page)).toBe(2);
      await restore();

      await capture.goto();
      await expect(capture.orphans).toBeVisible();
      await capture.tap(capture.orphansDiscard);
      await expect(capture.orphans).toHaveCount(0);
      await expect(page.getByRole('alertdialog')).toHaveCount(0);
      await expect.poll(() => storedShots(page)).toBe(0);
      await expect(page).toHaveURL(/\/diary\/new$/);
    } finally {
      await seed.cleanup();
    }
  });

  test('4. waiting photos of a draft that is gone are purged with a notice', async ({
    page,
    testPrefix,
  }) => {
    const seed = new CaptureSeed(page, testPrefix);
    try {
      const { release } = await holdUploads(page);
      const capture = new DiaryCapturePage(page);
      await capture.goto();
      await capture.chooseFromLibrary(capturePhotos(2, `${testPrefix}-purge`));
      const id = await capture.waitForDraft();
      await expect(capture.tiles).toHaveCount(2);
      await expect.poll(() => storedShots(page)).toBe(2);

      // Another device discards the entry while these photos still wait on this one.
      await deleteDiaryEntryViaApi(page, id);
      await page.reload();
      release();

      await expect(
        capture.toasts.infoToast.filter({
          hasText: 'Some waiting photos were removed because their entry no longer exists.',
        }),
      ).toBeVisible();
      await expect.poll(() => storedShots(page)).toBe(0);
    } finally {
      await seed.cleanup();
    }
  });

  test('5. leaving with photos waiting asks nothing; uploads finish in the background', async ({
    page,
    testPrefix,
  }) => {
    const seed = new CaptureSeed(page, testPrefix);
    try {
      const { release } = await holdUploads(page);
      const capture = new DiaryCapturePage(page);
      await capture.goto();
      await capture.chooseFromLibrary(capturePhotos(3, `${testPrefix}-leave`));
      const id = await capture.waitForDraft();
      seed.trackEntry(id);
      await expect(capture.waitingCount).toHaveText('3 photos waiting to upload');

      // In-app navigation never blocks: nothing is lost, the provider keeps the photos.
      await capture.tap(page.getByTestId('sidebar-section-diary'));
      await expect(page).toHaveURL(/\/diary$/);
      await expect(page.getByRole('alertdialog')).toHaveCount(0);

      release();
      await expect.poll(async () => (await listEntryPhotos(page, id)).length).toBe(3);

      // Coming back to the draft shows the finished photos.
      await page.goBack();
      await capture.waitForForm();
      await capture.waitForUploaded(3);
      await expect(capture.waitingNotice).toHaveCount(0);
    } finally {
      await seed.cleanup();
    }
  });
});

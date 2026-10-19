/**
 * E2E: the viewfinder with Chromium's fake media device (#2221, JRN-041, Decision 15).
 *
 * Own file because `launchOptions` must be set at file level and the WebKit projects (tablet,
 * mobile) cannot take Chromium flags; nothing here is tagged @responsive, so only `desktop` runs
 * it. Launch flags: `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`.
 *
 * Take photos is visible on a fine pointer because the device reports a videoinput; the camera
 * dialog opens with focus on the shutter; Enter takes a photo; shots are tagged with the live
 * chips; Remove last photo; Done returns focus to Take photos and leaves no dialog open.
 */

import { test, expect } from '../../fixtures/auth.js';
import {
  CaptureSeed,
  currentUserId,
  listEntryPhotos,
  seedRecentTags,
} from '../../fixtures/captureSeed.js';
import { DiaryCapturePage } from '../../pages/DiaryCapturePage.js';

test.use({
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
  permissions: ['camera'],
});

test.describe('Viewfinder with the Chromium fake device', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Chromium-only launch flags');
  // The headless Chromium shell on arm64 (local container runs on Apple silicon / arm64 hosts)
  // crashes the page as soon as the fake device plays ("Target crashed", reproducible with a
  // bare video element and no app code). CI runs on x64.
  test.skip(process.arch !== 'x64', 'fake media device crashes headless Chromium on arm64');

  test('shoots with the keyboard, tags shots live, removes the last and returns focus', async ({
    page,
    testPrefix,
  }) => {
    const seed = new CaptureSeed(page, testPrefix);
    try {
      const area = await seed.area('Hall');
      const orientation = await seed.orientation('South wall');
      await seedRecentTags(page, await currentUserId(page), {
        areaIds: [area.id],
        orientationIds: [orientation.id],
      });
      const capture = new DiaryCapturePage(page);
      await capture.goto();

      // A fine pointer shows Take photos only because the device list has a videoinput.
      await expect(capture.takePhotosButton).toBeVisible();
      await capture.openCamera();
      await expect(capture.camera.shutter).toBeFocused();

      await capture.camera.setArea(area.name);
      await capture.camera.setOrientation(orientation.name);

      await capture.camera.shutter.focus();
      await page.keyboard.press('Enter');
      await expect(capture.camera.counter).toHaveText('1 photo');
      await capture.shoot(2);
      await expect(capture.camera.counter).toHaveText('3 photos');

      await capture.tap(capture.camera.removeLast);
      await expect(capture.camera.counter).toHaveText('2 photos');

      await capture.closeCamera();
      await expect(capture.camera.dialog).toHaveCount(0);
      await expect(capture.takePhotosButton).toBeFocused();
      await expect(page.getByRole('dialog')).toHaveCount(0);

      // Two tiles remain, each tagged with the live chip values.
      await expect(capture.tiles).toHaveCount(2);
      for (let i = 0; i < 2; i++) {
        await expect(capture.tileOpen(i)).toHaveAttribute(
          'aria-label',
          new RegExp(`${area.name}.*${orientation.name}`),
        );
      }
      const id = await capture.waitForDraft();
      seed.trackEntry(id);
      await capture.waitForUploaded(2);
      const photos = await listEntryPhotos(page, id);
      expect(photos).toHaveLength(2);
      expect(photos.every((p) => p.areaId === area.id && p.orientationId === orientation.id)).toBe(
        true,
      );
    } finally {
      await seed.cleanup();
    }
  });
});

/**
 * E2E: the viewfinder with Chromium's fake media device (#2221, JRN-041, Decision 15).
 *
 * Own file because `launchOptions` must be set at file level and the WebKit projects (tablet,
 * mobile) cannot take Chromium flags; nothing here is tagged @responsive, so only `desktop` runs
 * it. Launch flags: `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`.
 *
 * Take photos is visible on a fine pointer because the device reports a videoinput; the camera
 * dialog opens with focus on the shutter; Enter takes a photo; shots are tagged with the live
 * chips; Remove last photo; the exit ("Review (n)") returns focus to Take photos and leaves no
 * dialog open.
 *
 * #2227 K2: the median entry (5 photos at 4 spots from the ＋ sheet) walked on the REAL fake
 * device at a phone viewport (390x844, touch, mobile emulation): exactly 15 taps, tags per photo
 * in capture order, orientation staying pressed across area changes. No HTTPS and no real camera
 * are involved (localhost is a secure context).
 */

import { test, expect } from '../../fixtures/auth.js';
import {
  medianExpected,
  seedMedianScenario,
  walkMedianWithCamera,
} from '../../fixtures/captureMedian.js';
import {
  CaptureSeed,
  photosTaggedInOrder,
  currentUserId,
  listEntryPhotos,
  seedRecentTags,
} from '../../fixtures/captureSeed.js';
import { ROUTES } from '../../fixtures/testData.js';
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

      await expect(capture.camera.exit).toHaveText('Close');
      await capture.camera.setArea(area.name);
      await capture.camera.setOrientation(orientation.name);

      await capture.camera.shutter.focus();
      await page.keyboard.press('Enter');
      await expect(capture.camera.exit).toHaveText('Review (1)');
      await capture.shoot(2);
      await expect(capture.camera.exit).toHaveText('Review (3)');

      await capture.removeLastShot();
      await expect(capture.camera.exit).toHaveText('Review (2)');

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

test.describe('Median entry on the Chromium fake device at a phone viewport (K2, #2227)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Chromium-only launch flags');
  test.skip(process.arch !== 'x64', 'fake media device crashes headless Chromium on arm64');
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('K2: 5 photos at 4 spots from the plus sheet take exactly 15 taps', async ({
    page,
    testPrefix,
  }, testInfo) => {
    test.slow();
    const seed = new CaptureSeed(page, testPrefix);
    try {
      const s = await seedMedianScenario(page, seed, testPrefix, 'Real camera');
      const capture = new DiaryCapturePage(page);
      await page.goto(ROUTES.home);
      capture.resetTaps();

      const entryId = await walkMedianWithCamera(capture, s);
      seed.trackEntry(entryId);

      testInfo.annotations.push({
        type: 'taps',
        description: `${testInfo.project.name} K2: ${capture.taps}`,
      });
      expect(capture.taps).toBeLessThanOrEqual(15);
      expect(capture.taps).toBe(15);

      await expect.poll(() => photosTaggedInOrder(page, entryId, medianExpected(s))).toBe('ok');
    } finally {
      await seed.cleanup();
    }
  });
});

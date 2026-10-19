/**
 * E2E: capture screen tap budget (#2221, AC11).
 *
 * @responsive: the flow runs on desktop, tablet and mobile; the budget is asserted everywhere and
 * is recorded for the phone project (iPhone 13, WebKit).
 *
 * 1. Library path: 5 library photos + Area + Orientation + a title chip + Save entry = exactly 6
 *    taps (Choose from library 1, native picker confirm 1, Area 1, Orientation 1, Title chip 1,
 *    Save 1). The ceiling is 12; `=== 6` is asserted so a regression shows.
 * 2. Viewfinder path: Take photos, Area, Orientation, shutter x5, Done, Title chip, Save entry =
 *    11 taps (ceiling 12). WebKit has no fake-device flag, so `navigator.mediaDevices` is stubbed.
 *
 * Taps are counted by `DiaryCapturePage.tap()`; the native picker confirm counts as one tap.
 * Seeds: one saved entry whose title is the title chip, plus a recent Area and Orientation.
 */

import { test, expect } from '../../fixtures/auth.js';
import { capturePhotos } from '../../fixtures/capturePhotos.js';
import { installFakeCamera } from '../../fixtures/fakeCamera.js';
import {
  CaptureSeed,
  currentUserId,
  photosTagged,
  seedRecentTags,
  todayIso,
  uniqueName,
} from '../../fixtures/captureSeed.js';
import { createDiaryEntryViaApi } from '../../fixtures/apiHelpers.js';
import { DiaryCapturePage } from '../../pages/DiaryCapturePage.js';

const TAP_BUDGET = 12;

test.describe('Capture tap budget (AC11) @responsive', () => {
  test('library path: 5 photos, tags and a title chip take 6 taps', async ({
    page,
    testPrefix,
  }, testInfo) => {
    const seed = new CaptureSeed(page, testPrefix);
    try {
      const area = await seed.area('Kitchen');
      const orientation = await seed.orientation('North wall');
      const title = uniqueName(testPrefix, 'Tiling');
      seed.trackEntry(
        await createDiaryEntryViaApi(page, {
          entryType: 'general_note',
          entryDate: todayIso(),
          body: 'Seeded title for the chip',
          title,
          status: 'saved',
        }),
      );
      await seedRecentTags(page, await currentUserId(page), {
        areaIds: [area.id],
        orientationIds: [orientation.id],
      });

      const capture = new DiaryCapturePage(page);
      await capture.goto();
      capture.resetTaps();

      await capture.chooseFromLibrary(capturePhotos(5, `${testPrefix}-lib`));
      await expect(capture.tiles).toHaveCount(5);
      await capture.setArea(area.name);
      await capture.setOrientation(orientation.name);
      await capture.setTitleChip(title);
      await capture.saveEntry();
      const entryId = capture.entryIdFromUrl();
      seed.trackEntry(entryId);

      testInfo.annotations.push({
        type: 'taps',
        description: `${testInfo.project.name}: ${capture.taps}`,
      });
      expect(capture.taps).toBeLessThanOrEqual(TAP_BUDGET);
      expect(capture.taps).toBe(6);

      // Uploads continue in the background after Save: wait for all five, all tagged.
      await expect
        .poll(() =>
          photosTagged(page, entryId, 5, { areaId: area.id, orientationId: orientation.id }),
        )
        .toBe('ok');
    } finally {
      await seed.cleanup();
    }
  });

  test('viewfinder path: 5 shots, tags and a title chip take 11 taps', async ({
    page,
    testPrefix,
  }, testInfo) => {
    const seed = new CaptureSeed(page, testPrefix);
    try {
      const area = await seed.area('Bathroom');
      const orientation = await seed.orientation('East wall');
      const title = uniqueName(testPrefix, 'Grouting');
      seed.trackEntry(
        await createDiaryEntryViaApi(page, {
          entryType: 'general_note',
          entryDate: todayIso(),
          body: 'Seeded title for the chip',
          title,
          status: 'saved',
        }),
      );
      await seedRecentTags(page, await currentUserId(page), {
        areaIds: [area.id],
        orientationIds: [orientation.id],
      });
      await installFakeCamera(page);

      const capture = new DiaryCapturePage(page);
      await capture.goto();
      capture.resetTaps();

      await capture.openCamera();
      await capture.camera.setArea(area.name);
      await capture.camera.setOrientation(orientation.name);
      await capture.shoot(5);
      await capture.closeCamera();
      await expect(capture.tiles).toHaveCount(5);
      await capture.setTitleChip(title);
      await capture.saveEntry();
      const entryId = capture.entryIdFromUrl();
      seed.trackEntry(entryId);

      testInfo.annotations.push({
        type: 'taps',
        description: `${testInfo.project.name}: ${capture.taps}`,
      });
      expect(capture.taps).toBeLessThanOrEqual(TAP_BUDGET);
      expect(capture.taps).toBe(11);

      await expect
        .poll(() =>
          photosTagged(page, entryId, 5, { areaId: area.id, orientationId: orientation.id }),
        )
        .toBe('ok');
    } finally {
      await seed.cleanup();
    }
  });
});

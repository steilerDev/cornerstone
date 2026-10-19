/**
 * E2E: capture tap budget (#2221 AC11, #2227 AC6 with owner decision A).
 *
 * @responsive, phone/tablet only: the ＋ sheet exists below 1024px, so every test skips from
 * 1024px. Counting starts on Home after `page.goto()` + `resetTaps()` (a goto is never counted).
 *
 * Tap definition (every intent goes through `DiaryCapturePage.tap()`): ＋, a tile, a sheet row, a
 * chip, a button, a thumbnail and the shutter are 1 each; typing, waits and assertions are 0; the
 * native file picker is files + 1 (one tap per picked photo plus Add). Both the budget and the
 * exact number are asserted, so a regression in either direction shows.
 *
 * B1  5 photos at one spot, camera: ＋ 1 · Photo tile 1 · A 1 · N 1 · shutter 5 · Review 1 ·
 *     title chip 1 · Save 1 = 12 (budget 12)
 * B2  Median entry, camera: 5 photos at 4 spots ((A,N)x2 (A,E) (B,E) (C,E), one chip per move)
 *     = 15 (budget 15); orientation E stays pressed across the area changes
 * B3  Median entry, library, best tagging order (majority tags first, then re-tag subsets) =
 *     20 (budget 20)
 * B4  A second trade the same day: B1 + its suggested company chip = 13 (exit test: at most +2)
 *
 * The back-dated exit test (at most 2 extra taps) is capture-screen.spec.ts test 5.
 * The WebKit projects stub `getUserMedia` (`installFakeCamera`); the real Chromium fake device
 * walks the same median in capture-camera-chromium.spec.ts (K2).
 *
 * Seeds are synthetic: areas A B C, orientations N E, one entry saved dated far in the future (`titleSeedDate`: the 6 newest titles are chips, parallel tests would evict a date of yesterday) whose title is the
 * title chip (a same-day title would offer "Add to that entry instead").
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/auth.js';
import { capturePhotos } from '../../fixtures/capturePhotos.js';
import { installFakeCamera } from '../../fixtures/fakeCamera.js';
import {
  CaptureSeed,
  currentUserId,
  photosTagged,
  photosTaggedInOrder,
  seedRecentTags,
  titleSeedDate,
  uniqueName,
} from '../../fixtures/captureSeed.js';
import {
  medianExpected,
  seedMedianScenario,
  walkMedianWithCamera,
} from '../../fixtures/captureMedian.js';
import {
  createDiaryEntryViaApi,
  createVendorViaApi,
  deleteVendorViaApi,
} from '../../fixtures/apiHelpers.js';
import { ROUTES } from '../../fixtures/testData.js';
import { DiaryCapturePage } from '../../pages/DiaryCapturePage.js';
import { DiaryEntryDetailPage } from '../../pages/DiaryEntryDetailPage.js';

function skipFromDesktop(page: Page): void {
  test.skip(
    (page.viewportSize()?.width ?? 0) >= 1024,
    'the ＋ sheet and its Log now tiles exist below 1024px only',
  );
}

async function recordTaps(
  testInfo: {
    annotations: Array<{ type: string; description?: string }>;
    project: { name: string };
  },
  label: string,
  taps: number,
): Promise<void> {
  testInfo.annotations.push({
    type: 'taps',
    description: `${testInfo.project.name} ${label}: ${taps}`,
  });
}

test.describe('Capture tap budget (AC6) @responsive', () => {
  test('B1: 5 photos at one spot with the camera take 12 taps', async ({
    page,
    testPrefix,
  }, testInfo) => {
    skipFromDesktop(page);
    const seed = new CaptureSeed(page, testPrefix);
    try {
      const s = await seedMedianScenario(page, seed, testPrefix, 'Tiling');
      await installFakeCamera(page);
      const capture = new DiaryCapturePage(page);
      await page.goto(ROUTES.home);
      capture.resetTaps();

      await capture.startFromPlus('photo');
      await capture.camera.setArea(s.A.name);
      await capture.camera.setOrientation(s.N.name);
      await capture.shoot(5);
      await capture.closeCamera();
      await expect(capture.tiles).toHaveCount(5);
      await capture.setTitleChip(s.title);
      await capture.saveEntry();
      const entryId = capture.entryIdFromUrl();
      seed.trackEntry(entryId);

      await recordTaps(testInfo, 'B1', capture.taps);
      expect(capture.taps).toBeLessThanOrEqual(12);
      expect(capture.taps).toBe(12);

      await expect
        .poll(() => photosTagged(page, entryId, 5, { areaId: s.A.id, orientationId: s.N.id }))
        .toBe('ok');
    } finally {
      await seed.cleanup();
    }
  });

  test('B2: the median entry (5 photos at 4 spots) with the camera takes 15 taps', async ({
    page,
    testPrefix,
  }, testInfo) => {
    skipFromDesktop(page);
    test.slow();
    const seed = new CaptureSeed(page, testPrefix);
    try {
      const s = await seedMedianScenario(page, seed, testPrefix);
      await installFakeCamera(page);
      const capture = new DiaryCapturePage(page);
      await page.goto(ROUTES.home);
      capture.resetTaps();

      const entryId = await walkMedianWithCamera(capture, s);
      seed.trackEntry(entryId);

      await recordTaps(testInfo, 'B2', capture.taps);
      expect(capture.taps).toBeLessThanOrEqual(15);
      expect(capture.taps).toBe(15);

      await expect.poll(() => photosTaggedInOrder(page, entryId, medianExpected(s))).toBe('ok');
    } finally {
      await seed.cleanup();
    }
  });

  test('B3: the median entry from the library takes 20 taps with the best tagging order', async ({
    page,
    testPrefix,
  }, testInfo) => {
    skipFromDesktop(page);
    test.slow();
    const seed = new CaptureSeed(page, testPrefix);
    try {
      const s = await seedMedianScenario(page, seed, testPrefix);
      const capture = new DiaryCapturePage(page);
      await page.goto(ROUTES.home);
      capture.resetTaps();

      await capture.startFromPlus('diaryEntry');
      await capture.chooseFromLibrary(capturePhotos(5, `${testPrefix}-med`));
      await expect(capture.tiles).toHaveCount(5);
      // Majority tags first: with nothing selected a chip tags every photo.
      await capture.setArea(s.A.name);
      await capture.setOrientation(s.E.name);
      // Then re-tag the subsets: photos 1-2 get North, photo 4 area B, photo 5 area C.
      await capture.selectTile(0);
      await capture.selectTile(1);
      await capture.setOrientation(s.N.name);
      await capture.selectTile(3);
      await capture.setArea(s.B.name);
      await capture.selectTile(4);
      await capture.setArea(s.C.name);
      await capture.setTitleChip(s.title);
      await capture.saveEntry();
      const entryId = capture.entryIdFromUrl();
      seed.trackEntry(entryId);

      await recordTaps(testInfo, 'B3', capture.taps);
      expect(capture.taps).toBeLessThanOrEqual(20);
      expect(capture.taps).toBe(20);

      await expect.poll(() => photosTaggedInOrder(page, entryId, medianExpected(s))).toBe('ok');
    } finally {
      await seed.cleanup();
    }
  });

  test('B4: a second trade the same day takes one more tap (the company chip)', async ({
    page,
    testPrefix,
  }, testInfo) => {
    skipFromDesktop(page);
    test.slow();
    const seed = new CaptureSeed(page, testPrefix);
    const vendors: string[] = [];
    try {
      const s = await seedMedianScenario(page, seed, testPrefix, 'First trade');
      const vendorName = uniqueName(testPrefix, 'Second Plaster');
      const vendorId = await createVendorViaApi(page, { name: vendorName });
      vendors.push(vendorId);
      const title2 = uniqueName(testPrefix, 'Second trade');
      seed.trackEntry(
        await createDiaryEntryViaApi(page, {
          entryType: 'daily_log',
          entryDate: titleSeedDate(),
          body: 'Seeded: the second trade',
          title: title2,
          status: 'saved',
          metadata: { vendorId },
        }),
      );
      await seedRecentTags(page, await currentUserId(page), {
        areaIds: [s.A.id],
        orientationIds: [s.N.id],
      });
      await installFakeCamera(page);
      const capture = new DiaryCapturePage(page);

      // Trade one: the 12-tap flow of B1.
      await page.goto(ROUTES.home);
      capture.resetTaps();
      await capture.startFromPlus('photo');
      await capture.camera.setArea(s.A.name);
      await capture.camera.setOrientation(s.N.name);
      await capture.shoot(5);
      await capture.closeCamera();
      await capture.setTitleChip(s.title);
      await capture.saveEntry();
      seed.trackEntry(capture.entryIdFromUrl());
      const firstEntry = capture.entryIdFromUrl();
      // Save navigates to the entry page a moment later (until then the URL is still /edit): wait
      // for it, and for the uploads, before leaving.
      await page.waitForURL(/\/diary\/[^/]+$/);
      await new DiaryEntryDetailPage(page).loaded.waitFor({ state: 'visible' });
      await expect
        .poll(() => photosTagged(page, firstEntry, 5, { areaId: s.A.id, orientationId: s.N.id }))
        .toBe('ok');
      const first = capture.taps;
      expect(first).toBe(12);

      // Trade two, the same day: the same flow plus the suggested company chip. It runs in a
      // fresh page of the same session: a second WebKit canvas camera in one tab sometimes never
      // delivers a frame (the shutter then adds no shot).
      const page2 = await page.context().newPage();
      await seedRecentTags(page2, await currentUserId(page), {
        areaIds: [s.A.id],
        orientationIds: [s.N.id],
      });
      await installFakeCamera(page2);
      await page2.goto(ROUTES.home);
      const capture2 = new DiaryCapturePage(page2);
      capture2.resetTaps();
      await capture2.startFromPlus('photo');
      await capture2.camera.setArea(s.A.name);
      await capture2.camera.setOrientation(s.N.name);
      await capture2.shoot(5);
      await capture2.closeCamera();
      await capture2.setTitleChip(title2);
      await capture2.tap(capture2.companyChip(vendorName));
      await expect(capture2.companyChip(vendorName)).toHaveAttribute('aria-pressed', 'true');
      await capture2.saveEntry();
      const secondEntry = capture2.entryIdFromUrl();
      seed.trackEntry(secondEntry);

      await recordTaps(testInfo, 'B4', capture2.taps);
      expect(capture2.taps - first).toBeLessThanOrEqual(2);
      expect(capture2.taps).toBe(first + 1);
      expect(capture2.taps).toBe(13);
    } finally {
      await seed.cleanup();
      for (const id of vendors) await deleteVendorViaApi(page, id).catch(() => {});
    }
  });
});

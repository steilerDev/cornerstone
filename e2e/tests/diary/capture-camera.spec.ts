/**
 * E2E: the rapid-capture viewfinder on the capture screen (#2221, JRN-041, Decision 1/15).
 *
 * Scenarios
 * (Chromium's fake media device is exercised in capture-camera-chromium.spec.ts.)
 * 1. @responsive Stubbed `getUserMedia` (WebKit has no fake-device flag): the shot flow; on a
 *    phone the viewfinder is a full-screen sheet and the chip rows scroll sideways.
 * 2. @responsive Camera denied (`NotAllowedError`): the "Camera access is off" panel offers
 *    "Use camera app" (opens the native file chooser); a second Take photos in the same session
 *    opens the native input directly, with no viewfinder.
 * 3. @responsive No `mediaDevices` (plain-http installs): Take photos opens the file chooser directly.
 *    (touch projects only: a fine pointer without a device list has no Take photos button)
 *
 * Synthetic data only; every test removes the entries, areas and orientations it created.
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/auth.js';
import { capturePhotos } from '../../fixtures/capturePhotos.js';
import {
  installDeniedCamera,
  installFakeCamera,
  removeMediaDevices,
} from '../../fixtures/fakeCamera.js';
import {
  CaptureSeed,
  currentUserId,
  listEntryPhotos,
  seedRecentTags,
} from '../../fixtures/captureSeed.js';
import { DiaryCapturePage } from '../../pages/DiaryCapturePage.js';

async function seedTags(page: Page, seed: CaptureSeed) {
  const area = await seed.area('Hall');
  const orientation = await seed.orientation('South wall');
  await seedRecentTags(page, await currentUserId(page), {
    areaIds: [area.id],
    orientationIds: [orientation.id],
  });
  return { area, orientation };
}

test.describe('Viewfinder with a stubbed camera @responsive', () => {
  test('takes shots at the current width; a phone gets a full-screen sheet and sideways chips', async ({
    page,
    testPrefix,
  }) => {
    const seed = new CaptureSeed(page, testPrefix);
    try {
      const { area, orientation } = await seedTags(page, seed);
      await installFakeCamera(page);
      const capture = new DiaryCapturePage(page);
      await capture.goto();

      await capture.openCamera();
      const viewport = page.viewportSize();
      if (viewport && viewport.width < 768) {
        const box = await capture.camera.dialog.boundingBox();
        expect(box?.width).toBeGreaterThanOrEqual(viewport.width - 1);
        expect(box?.height).toBeGreaterThanOrEqual(viewport.height - 1);
        const overflowX = await capture.camera.chips
          .getByRole('group', { name: 'Area', exact: true })
          .evaluate((el) => getComputedStyle(el).overflowX);
        expect(['auto', 'scroll']).toContain(overflowX);
      }

      await capture.camera.setArea(area.name);
      await capture.camera.setOrientation(orientation.name);
      await capture.shoot(3);
      await expect(capture.camera.status).toContainText('Photo 3 taken.');
      await capture.closeCamera();

      await expect(capture.tiles).toHaveCount(3);
      const id = await capture.waitForDraft();
      seed.trackEntry(id);
      await capture.waitForUploaded(3);
      const photos = await listEntryPhotos(page, id);
      expect(photos.every((p) => p.areaId === area.id && p.orientationId === orientation.id)).toBe(
        true,
      );
    } finally {
      await seed.cleanup();
    }
  });

  test('a refused camera shows the fallback panel, then Take photos opens the native input', async ({
    page,
    testPrefix,
  }) => {
    const seed = new CaptureSeed(page, testPrefix);
    try {
      await installDeniedCamera(page);
      const capture = new DiaryCapturePage(page);
      await capture.goto();

      await capture.tap(capture.takePhotosButton);
      await expect(capture.camera.errorPanel).toBeVisible();
      await expect(capture.camera.errorPanel).toContainText('Camera access is off');

      // "Use camera app" is a fresh tap and opens the native picker; its photo joins the strip.
      const chooser = page.waitForEvent('filechooser');
      await capture.tap(capture.camera.errorUseApp);
      await (await chooser).setFiles(capturePhotos(1, `${testPrefix}-app`));
      await expect(capture.tiles).toHaveCount(1);
      seed.trackEntry(await capture.waitForDraft());

      await capture.closeCamera();
      await expect(capture.camera.dialog).toHaveCount(0);

      // The refusal is remembered for the session: no sheet this time, the native input at once.
      const second = page.waitForEvent('filechooser');
      await capture.tap(capture.takePhotosButton);
      await second;
      await expect(capture.camera.dialog).toHaveCount(0);
    } finally {
      await seed.cleanup();
    }
  });
});

test.describe('No camera API @responsive', () => {
  test('Take photos opens the file chooser directly when mediaDevices is missing', async ({
    page,
    testPrefix,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === 'desktop',
      'A fine pointer shows Take photos only when a video input is listed',
    );
    const seed = new CaptureSeed(page, testPrefix);
    try {
      await removeMediaDevices(page);
      const capture = new DiaryCapturePage(page);
      await capture.goto();

      await capture.takePhotosViaApp(capturePhotos(1, `${testPrefix}-nomd`));
      await expect(capture.camera.dialog).toHaveCount(0);
      await expect(capture.tiles).toHaveCount(1);
      seed.trackEntry(await capture.waitForDraft());
    } finally {
      await seed.cleanup();
    }
  });
});

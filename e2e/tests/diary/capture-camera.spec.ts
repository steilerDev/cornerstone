/**
 * E2E: the rapid-capture viewfinder on the capture screen (#2221, JRN-041, Decision 1/15; #2227).
 *
 * Scenarios
 * (Chromium's fake media device is exercised in capture-camera-chromium.spec.ts.)
 * 1. @responsive Stubbed `getUserMedia` (WebKit has no fake-device flag): the shot flow; on a
 *    phone the viewfinder is a full-screen sheet and the chip rows scroll sideways.
 * 2. @responsive Camera denied (`NotAllowedError`): the "Camera access is off" panel offers
 *    "Use camera app" (opens the native file chooser) and its own "Close" (C5, #2227); a second
 *    Take photos in the same session opens the native input directly, with no viewfinder.
 * 3. @responsive No `mediaDevices` (plain-http installs): Take photos opens the file chooser directly.
 *    (touch projects only: a fine pointer without a device list has no Take photos button)
 *
 * #2227 (stubbed camera, @responsive)
 * C1  Exit label: "Close" with no shots, "Review (n)" after, Remove last lowers n, never "Done";
 *     Review returns focus to Take photos.
 * C2  Waiting line: uploads held with `page.route` -> "1 photo / 2 photos waiting to upload",
 *     gone once released; the camera stays open throughout.
 * C3  Low-resolution hint (the 640x480 stub): shown after the first shot, the shutter still works,
 *     "Not now" hides it and focuses the shutter, a reopen in the same session shows none.
 * C3b The hint's "Use camera app" opens the file chooser.
 * C4  Top bar at 360px (mobile only): "Use camera app" and the exit share one row, in English and
 *     in German (test ids only), and the bar stays under two touch targets high.
 * C6  "Saving photos…": Review waits for a shot still being encoded (the stub's `toBlob` is
 *     delayed), shows the label meanwhile, then closes with the photo in the strip.
 * C8  The shutter is aria-disabled right after the camera opens and enabled at the first frame.
 * C7  The allow hint under "Starting the camera…" while access is pending.
 *
 * Synthetic data only; every test removes the entries, areas and orientations it created.
 */

import type { Page, Route } from '@playwright/test';
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
      await expect(capture.camera.errorPanel).toContainText('full size');
      await expect(capture.camera.errorClose).toHaveText('Close');

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

test.describe('Exit label, waiting line and resolution hint (#2227) @responsive', () => {
  test('C1: Close with no shots, Review (n) after, never Done', async ({ page, testPrefix }) => {
    const seed = new CaptureSeed(page, testPrefix);
    try {
      await installFakeCamera(page);
      const capture = new DiaryCapturePage(page);
      await capture.goto();
      await capture.openCamera();

      await expect(capture.camera.exit).toHaveText('Close');
      await capture.shoot(1);
      await expect(capture.camera.exit).toHaveText('Review (1)');
      await capture.shoot(2);
      await expect(capture.camera.exit).toHaveText('Review (3)');
      await capture.tap(capture.camera.removeLast);
      await expect(capture.camera.exit).toHaveText('Review (2)');
      await expect(capture.camera.stage.getByText('Done', { exact: true })).toHaveCount(0);

      await capture.closeCamera();
      await expect(capture.takePhotosButton).toBeFocused();
      await expect(capture.tiles).toHaveCount(2);
      seed.trackEntry(await capture.waitForDraft());
    } finally {
      await seed.cleanup();
    }
  });

  test('C8: the shutter is aria-disabled when the camera opens and enabled once frames arrive', async ({
    page,
    testPrefix,
  }) => {
    const seed = new CaptureSeed(page, testPrefix);
    try {
      // The stream arrives 1.5 s after the camera opens: a wide, deterministic window in which
      // no frame exists, so the shutter must be aria-disabled.
      await installFakeCamera(page, { startDelayMs: 1500 });
      const capture = new DiaryCapturePage(page);
      await capture.goto();
      await capture.tap(capture.takePhotosButton);
      await capture.camera.dialog.waitFor({ state: 'visible' });
      await expect(capture.camera.shutter).toHaveAttribute('aria-disabled', 'true');
      await capture.camera.waitForLive();
      await capture.shoot(1);
      await expect(capture.camera.exit).toHaveText('Review (1)');
      await capture.closeCamera();
      seed.trackEntry(await capture.waitForDraft());
    } finally {
      await seed.cleanup();
    }
  });

  test('C2: the waiting line counts photos not yet uploaded and clears when they are', async ({
    page,
    testPrefix,
  }) => {
    const seed = new CaptureSeed(page, testPrefix);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      await installFakeCamera(page);
      // Hold every photo upload (POST only; the draft itself is created normally).
      await page.route('**/api/photos', async (route: Route) => {
        if (route.request().method() !== 'POST') {
          await route.fallback();
          return;
        }
        await gate;
        await route.continue();
      });
      const capture = new DiaryCapturePage(page);
      await capture.goto();
      await capture.openCamera();

      await capture.shoot(1);
      await expect(capture.camera.waiting).toHaveText('1 photo waiting to upload');
      await capture.shoot(1);
      await expect(capture.camera.waiting).toHaveText('2 photos waiting to upload');
      await expect(capture.camera.dialog).toBeVisible();
      seed.trackEntry(await capture.waitForDraft());

      release();
      await expect(capture.camera.waiting).toHaveCount(0);
      await expect(capture.camera.dialog).toBeVisible();
      await capture.closeCamera();
      await capture.waitForUploaded(2);
    } finally {
      release();
      await seed.cleanup();
    }
  });

  test('C3: the low-resolution hint appears after the first shot and can be dismissed', async ({
    page,
    testPrefix,
  }) => {
    const seed = new CaptureSeed(page, testPrefix);
    try {
      await installFakeCamera(page);
      const capture = new DiaryCapturePage(page);
      await capture.goto();
      await capture.openCamera();

      await capture.shoot(1);
      await expect(capture.camera.lowResHint).toBeVisible();
      await expect(capture.camera.lowResHint).toContainText('use the camera app');
      // The hint never blocks the shutter.
      await capture.shoot(1);
      await expect(capture.camera.exit).toHaveText('Review (2)');

      await capture.tap(capture.camera.lowResDismiss);
      await expect(capture.camera.lowResHint).toHaveCount(0);
      await expect(capture.camera.shutter).toBeFocused();

      // Remembered for the browser session: a reopen shows no hint, even after a shot.
      await capture.closeCamera();
      seed.trackEntry(await capture.waitForDraft());
      await capture.openCamera();
      await capture.shoot(1);
      await expect(capture.camera.exit).toHaveText('Review (1)');
      await expect(capture.camera.lowResHint).toHaveCount(0);
      await capture.closeCamera();
    } finally {
      await seed.cleanup();
    }
  });

  test('C3b: the hint offers the camera app, which opens the file chooser', async ({
    page,
    testPrefix,
  }) => {
    const seed = new CaptureSeed(page, testPrefix);
    try {
      await installFakeCamera(page);
      const capture = new DiaryCapturePage(page);
      await capture.goto();
      await capture.openCamera();
      await capture.shoot(1);
      await expect(capture.camera.lowResHint).toBeVisible();

      const chooser = page.waitForEvent('filechooser');
      await capture.tap(capture.camera.lowResUseApp);
      await (await chooser).setFiles(capturePhotos(1, `${testPrefix}-lowres`));
      seed.trackEntry(await capture.waitForDraft());
    } finally {
      await seed.cleanup();
    }
  });

  test('C6: Review shows "Saving photos…" while a shot is still being encoded', async ({
    page,
    testPrefix,
  }) => {
    const seed = new CaptureSeed(page, testPrefix);
    try {
      await installFakeCamera(page);
      // Delay the stub frame's JPEG encoding so the shot is "saving" for a moment (the stub
      // stream is 640x480; the app's own canvases have other sizes).
      await page.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.toBlob;
        HTMLCanvasElement.prototype.toBlob = function (
          this: HTMLCanvasElement,
          ...args: Parameters<typeof original>
        ) {
          if (this.width === 640 && this.height === 480) {
            window.setTimeout(() => original.apply(this, args), 1500);
            return;
          }
          original.apply(this, args);
        };
      });
      const capture = new DiaryCapturePage(page);
      await capture.goto();
      await capture.openCamera();
      await capture.shoot(1);

      await capture.camera.exit.click();
      await expect(capture.camera.exit).toHaveText('Saving photos…');
      await capture.camera.dialog.waitFor({ state: 'hidden' });
      await expect(capture.tiles).toHaveCount(1);
      seed.trackEntry(await capture.waitForDraft());
    } finally {
      await seed.cleanup();
    }
  });
});

test.describe('Top bar at 360px (#2227) @responsive', () => {
  async function expectOneRow(capture: DiaryCapturePage): Promise<void> {
    const useApp = await capture.camera.useCameraApp.boundingBox();
    const exit = await capture.camera.exit.boundingBox();
    const bar = await capture.camera.topBar.boundingBox();
    expect(useApp).not.toBeNull();
    expect(exit).not.toBeNull();
    expect(Math.abs((useApp?.y ?? 0) - (exit?.y ?? 99))).toBeLessThanOrEqual(1);
    expect(bar?.height ?? 999).toBeLessThan(88);
    // Nothing runs off the right edge.
    expect((exit?.x ?? 0) + (exit?.width ?? 0)).toBeLessThanOrEqual(360);
  }

  test('C4: "Use camera app" and Review (1) share one row', async ({
    page,
    testPrefix,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'the 360px width is a phone check');
    const seed = new CaptureSeed(page, testPrefix);
    try {
      await page.setViewportSize({ width: 360, height: 740 });
      await installFakeCamera(page);
      const capture = new DiaryCapturePage(page);
      await capture.goto();
      await capture.openCamera();
      await capture.shoot(1);
      await expect(capture.camera.exit).toHaveText('Review (1)');
      await expectOneRow(capture);
      seed.trackEntry(await capture.waitForDraft());
    } finally {
      await seed.cleanup();
    }
  });

  test.describe('German', () => {
    test.use({ locale: 'de-DE' });

    test('C4: the German labels stay on one row (test ids only)', async ({
      page,
      testPrefix,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile', 'the 360px width is a phone check');
      const seed = new CaptureSeed(page, testPrefix);
      try {
        await page.setViewportSize({ width: 360, height: 740 });
        await installFakeCamera(page);
        const capture = new DiaryCapturePage(page);
        await capture.goto();
        await capture.openCamera();
        await capture.shoot(1);
        await expect(capture.camera.exit).not.toHaveText('Review (1)');
        await expect(capture.camera.exit).toContainText('(1)');
        await expectOneRow(capture);
        seed.trackEntry(await capture.waitForDraft());
      } finally {
        await seed.cleanup();
      }
    });
  });
});

test.describe('Allow hint (#2227) @responsive', () => {
  test('C7: "Starting the camera…" carries the allow hint while access is pending', async ({
    page,
  }) => {
    // getUserMedia never settles: the starting panel stays up with its hint.
    await page.addInitScript(() => {
      const mediaDevices = {
        getUserMedia: () => new Promise(() => undefined),
        enumerateDevices: async () => [
          { kind: 'videoinput', deviceId: 'fake-camera', label: 'Fake camera', groupId: 'fake' },
        ],
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      };
      Object.defineProperty(navigator, 'mediaDevices', { value: mediaDevices, configurable: true });
    });
    const capture = new DiaryCapturePage(page);
    await capture.goto();
    await capture.tap(capture.takePhotosButton);
    await expect(capture.camera.allowHint).toBeVisible();
    await expect(capture.camera.allowHint).toHaveText('If your browser asks, choose Allow.');
    await expect(capture.camera.shutter).toHaveAttribute('aria-disabled', 'true');
    await expect(capture.camera.exit).toHaveText('Close');
  });
});

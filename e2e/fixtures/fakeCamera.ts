/**
 * Camera stand-ins for the capture-screen specs (#2221).
 *
 * Chromium (the `desktop` project) uses its own fake device: launch with
 * `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream` and grant `camera`.
 * WebKit (`tablet`, `mobile`) has no such flag, so `installFakeCamera` stubs
 * `navigator.mediaDevices` with a canvas animated by `requestAnimationFrame` and
 * `canvas.captureStream()`. WebKit has no `ImageCapture`, so shots also exercise the app's
 * canvas `captureFrame` fallback.
 *
 * All helpers add init scripts: call them before `page.goto()`.
 */

import type { Page } from '@playwright/test';

/** One `videoinput`; `getUserMedia` resolves with an animated canvas stream. */
export async function installFakeCamera(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const context = canvas.getContext('2d');
    let frame = 0;
    const draw = () => {
      if (context) {
        context.fillStyle = `hsl(${(frame * 4) % 360}, 60%, 50%)`;
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = '#fff';
        context.fillRect((frame * 7) % 600, 200, 40, 40);
      }
      frame += 1;
      requestAnimationFrame(draw);
    };
    draw();
    const mediaDevices = {
      getUserMedia: async () => {
        const stream = canvas.captureStream(30);
        // Stopping a canvas capture track crashes the arm64 headless Chromium shell used for local
        // container runs ("Target crashed"); the shared canvas never needs stopping.
        stream.getTracks().forEach((track) => {
          track.stop = () => undefined;
        });
        return stream;
      },
      enumerateDevices: async () => [
        { kind: 'videoinput', deviceId: 'fake-camera', label: 'Fake camera', groupId: 'fake' },
      ],
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    };
    Object.defineProperty(navigator, 'mediaDevices', { value: mediaDevices, configurable: true });
  });
}

/** One `videoinput` is listed, but `getUserMedia` rejects with `NotAllowedError`. */
export async function installDeniedCamera(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const mediaDevices = {
      getUserMedia: async () => {
        throw new DOMException('Permission denied', 'NotAllowedError');
      },
      enumerateDevices: async () => [
        { kind: 'videoinput', deviceId: 'fake-camera', label: 'Fake camera', groupId: 'fake' },
      ],
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    };
    Object.defineProperty(navigator, 'mediaDevices', { value: mediaDevices, configurable: true });
  });
}

/** `navigator.mediaDevices` is undefined (plain-http installs): the app falls back to the native input. */
export async function removeMediaDevices(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
  });
}

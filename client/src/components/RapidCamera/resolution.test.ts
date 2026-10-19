import { describe, it, expect, afterEach, jest } from '@jest/globals';
import {
  FULL_RESOLUTION_MIN_PIXELS,
  LOW_RES_DISMISSED_SESSION_KEY,
  hasImageCapture,
  imagePixels,
  isBelowFullResolution,
  isLowResDismissed,
  rememberLowResDismissed,
  trackPixels,
} from './resolution.js';

const track = (settings: MediaTrackSettings) =>
  ({ getSettings: () => settings }) as unknown as MediaStreamTrack;

const g = globalThis as unknown as { createImageBitmap?: unknown };
const originalBitmap = g.createImageBitmap;

afterEach(() => {
  jest.restoreAllMocks();
  window.sessionStorage.clear();
  delete (window as unknown as { ImageCapture?: unknown }).ImageCapture;
  if (originalBitmap === undefined) delete g.createImageBitmap;
  else g.createImageBitmap = originalBitmap;
});

describe('FULL_RESOLUTION_MIN_PIXELS', () => {
  it('is 8 MP (3264 x 2448)', () => {
    expect(FULL_RESOLUTION_MIN_PIXELS).toBe(7_990_272);
  });
});

describe('isBelowFullResolution', () => {
  it('is below one pixel under the threshold', () => {
    expect(isBelowFullResolution(FULL_RESOLUTION_MIN_PIXELS - 1)).toBe(true);
  });
  it('is not below at exactly the threshold or above it', () => {
    expect(isBelowFullResolution(FULL_RESOLUTION_MIN_PIXELS)).toBe(false);
    expect(isBelowFullResolution(FULL_RESOLUTION_MIN_PIXELS + 1)).toBe(false);
  });
  it('treats an unknown size (0 or negative) as not below', () => {
    expect(isBelowFullResolution(0)).toBe(false);
    expect(isBelowFullResolution(-5)).toBe(false);
  });
  it('flags a 640x480 still', () => {
    expect(isBelowFullResolution(640 * 480)).toBe(true);
  });
});

describe('trackPixels', () => {
  it('multiplies width by height', () => {
    expect(trackPixels(track({ width: 1920, height: 1080 }))).toBe(1920 * 1080);
  });
  it('is null for a null track', () => {
    expect(trackPixels(null)).toBeNull();
  });
  it.each([
    ['width missing', { height: 1080 }],
    ['height missing', { width: 1920 }],
    ['both missing', {}],
    ['width zero', { width: 0, height: 1080 }],
  ])('is null when %s', (_name, settings) => {
    expect(trackPixels(track(settings))).toBeNull();
  });
});

describe('imagePixels', () => {
  it('is null when createImageBitmap is unsupported', async () => {
    delete g.createImageBitmap;
    expect(await imagePixels(new Blob(['x']))).toBeNull();
  });
  it('returns width x height and closes the bitmap', async () => {
    const close = jest.fn();
    g.createImageBitmap = jest.fn(async () => ({ width: 4000, height: 3000, close }));
    expect(await imagePixels(new Blob(['x']))).toBe(12_000_000);
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('works for a bitmap without close()', async () => {
    g.createImageBitmap = jest.fn(async () => ({ width: 10, height: 10 }));
    expect(await imagePixels(new Blob(['x']))).toBe(100);
  });
  it('is null for an empty bitmap', async () => {
    g.createImageBitmap = jest.fn(async () => ({ width: 0, height: 0, close: jest.fn() }));
    expect(await imagePixels(new Blob(['x']))).toBeNull();
  });
  it('is null when decoding rejects', async () => {
    g.createImageBitmap = jest.fn(async () => {
      throw new Error('bad image');
    });
    expect(await imagePixels(new Blob(['x']))).toBeNull();
  });
});

describe('hasImageCapture', () => {
  it('is false without window.ImageCapture', () => {
    expect(hasImageCapture()).toBe(false);
  });
  it('is true when ImageCapture is a constructor function', () => {
    (window as unknown as { ImageCapture: unknown }).ImageCapture = function ImageCapture() {};
    expect(hasImageCapture()).toBe(true);
  });
  it('is false when ImageCapture is not a function', () => {
    (window as unknown as { ImageCapture: unknown }).ImageCapture = {};
    expect(hasImageCapture()).toBe(false);
  });
});

describe('low-resolution dismissal', () => {
  it('round-trips through sessionStorage', () => {
    expect(isLowResDismissed()).toBe(false);
    rememberLowResDismissed();
    expect(window.sessionStorage.getItem(LOW_RES_DISMISSED_SESSION_KEY)).not.toBeNull();
    expect(isLowResDismissed()).toBe(true);
  });
  it('reads as not dismissed when storage throws', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(isLowResDismissed()).toBe(false);
  });
  it('remembering is a silent no-op when storage throws', () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => rememberLowResDismissed()).not.toThrow();
  });
});

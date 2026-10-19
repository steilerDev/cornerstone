/** 8 MP (3264 × 2448). A still below this is "weaker than the phone's own camera". Confirmed on a real phone in the owner's check. */
export const FULL_RESOLUTION_MIN_PIXELS = 3264 * 2448;

/** sessionStorage flag set when the user dismissed the low-resolution hint ("Not now"). */
export const LOW_RES_DISMISSED_SESSION_KEY = 'cornerstone.capture.lowResDismissed';

export function isBelowFullResolution(pixels: number): boolean {
  return pixels > 0 && pixels < FULL_RESOLUTION_MIN_PIXELS;
}

/** width × height from `track.getSettings()`; null when the track or either value is missing. */
export function trackPixels(track: MediaStreamTrack | null): number | null {
  if (!track) return null;
  const { width, height } = track.getSettings();
  if (!width || !height) return null;
  return width * height;
}

/** Pixel count of an image blob; null when `createImageBitmap` is unsupported or fails. */
export async function imagePixels(blob: Blob): Promise<number | null> {
  if (typeof createImageBitmap !== 'function') return null;
  try {
    const bitmap = await createImageBitmap(blob);
    const pixels = bitmap.width * bitmap.height;
    bitmap.close?.();
    return pixels > 0 ? pixels : null;
  } catch {
    return null;
  }
}

/** ImageCapture takes full-sensor stills whatever the stream size, so the track check is skipped. */
export function hasImageCapture(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as unknown as { ImageCapture?: unknown }).ImageCapture === 'function'
  );
}

export function isLowResDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(LOW_RES_DISMISSED_SESSION_KEY) !== null;
  } catch {
    return false;
  }
}

export function rememberLowResDismissed(): void {
  try {
    window.sessionStorage.setItem(LOW_RES_DISMISSED_SESSION_KEY, '1');
  } catch {
    // Storage can be unavailable (private windows); the hint may show again.
  }
}

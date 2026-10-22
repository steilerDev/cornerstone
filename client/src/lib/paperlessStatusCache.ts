import type { PaperlessStatusResponse } from '@cornerstone/shared';
import { getPaperlessStatus } from './paperlessApi.js';

/** How long a successful status answer is reused (one page load shows many Documents hosts). */
export const PAPERLESS_STATUS_TTL_MS = 10_000;

let inFlight: Promise<PaperlessStatusResponse> | null = null;
let settled: { readonly value: PaperlessStatusResponse; readonly at: number } | null = null;

/**
 * The Paperless status, shared by every Documents host on the page: concurrent callers share one
 * request and a successful answer is reused for `PAPERLESS_STATUS_TTL_MS`. Failures are never
 * cached. `force` skips the cache (the "Try again" of a failed status).
 */
export function getSharedPaperlessStatus(force = false): Promise<PaperlessStatusResponse> {
  if (!force) {
    if (settled && Date.now() - settled.at < PAPERLESS_STATUS_TTL_MS) {
      return Promise.resolve(settled.value);
    }
    if (inFlight) return inFlight;
  }
  const request = getPaperlessStatus().then(
    (value) => {
      settled = { value, at: Date.now() };
      return value;
    },
    (error: unknown) => {
      settled = null;
      throw error;
    },
  );
  inFlight = request;
  const clear = () => {
    if (inFlight === request) inFlight = null;
  };
  request.then(clear, clear);
  return request;
}

/** Drops the cached answer and any in-flight request (tests, and after a settings change). */
export function resetPaperlessStatusCache(): void {
  inFlight = null;
  settled = null;
}

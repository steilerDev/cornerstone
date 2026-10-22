/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import type { PaperlessStatusResponse } from '@cornerstone/shared';
import type * as CacheModule from './paperlessStatusCache.js';

const mockGetPaperlessStatus = jest.fn<() => Promise<PaperlessStatusResponse>>();
jest.unstable_mockModule('./paperlessApi.js', () => ({
  getPaperlessStatus: mockGetPaperlessStatus,
}));

let cache: typeof CacheModule;

const status = (configured: boolean): PaperlessStatusResponse =>
  ({ configured, reachable: configured, error: null }) as PaperlessStatusResponse;

beforeEach(async () => {
  cache = await import('./paperlessStatusCache.js');
  cache.resetPaperlessStatusCache();
  mockGetPaperlessStatus.mockReset();
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  jest.setSystemTime(new Date('2026-10-22T10:00:00Z'));
});

afterEach(() => {
  jest.useRealTimers();
});

describe('getSharedPaperlessStatus', () => {
  it('shares one request between concurrent callers', async () => {
    mockGetPaperlessStatus.mockResolvedValue(status(true));
    const [a, b, c] = await Promise.all([
      cache.getSharedPaperlessStatus(),
      cache.getSharedPaperlessStatus(),
      cache.getSharedPaperlessStatus(),
    ]);
    expect(mockGetPaperlessStatus).toHaveBeenCalledTimes(1);
    expect(a).toEqual(status(true));
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it('reuses a successful answer for ten seconds, then asks again', async () => {
    mockGetPaperlessStatus.mockResolvedValueOnce(status(true)).mockResolvedValueOnce(status(false));
    await cache.getSharedPaperlessStatus();

    jest.advanceTimersByTime(cache.PAPERLESS_STATUS_TTL_MS - 1);
    await expect(cache.getSharedPaperlessStatus()).resolves.toEqual(status(true));
    expect(mockGetPaperlessStatus).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1);
    await expect(cache.getSharedPaperlessStatus()).resolves.toEqual(status(false));
    expect(mockGetPaperlessStatus).toHaveBeenCalledTimes(2);
  });

  it('does not cache a failure: the next caller asks again', async () => {
    mockGetPaperlessStatus
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce(status(true));
    await expect(cache.getSharedPaperlessStatus()).rejects.toThrow('down');
    await expect(cache.getSharedPaperlessStatus()).resolves.toEqual(status(true));
    expect(mockGetPaperlessStatus).toHaveBeenCalledTimes(2);
  });

  it('a forced request that fails drops a previously cached success', async () => {
    mockGetPaperlessStatus
      .mockResolvedValueOnce(status(true))
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce(status(false));
    await cache.getSharedPaperlessStatus();
    await expect(cache.getSharedPaperlessStatus(true)).rejects.toThrow('down');
    await expect(cache.getSharedPaperlessStatus()).resolves.toEqual(status(false));
    expect(mockGetPaperlessStatus).toHaveBeenCalledTimes(3);
  });

  it('force bypasses a fresh cached answer and refreshes it', async () => {
    mockGetPaperlessStatus.mockResolvedValueOnce(status(true)).mockResolvedValueOnce(status(false));
    await cache.getSharedPaperlessStatus();
    await expect(cache.getSharedPaperlessStatus(true)).resolves.toEqual(status(false));
    await expect(cache.getSharedPaperlessStatus()).resolves.toEqual(status(false));
    expect(mockGetPaperlessStatus).toHaveBeenCalledTimes(2);
  });

  it('force bypasses an in-flight request', async () => {
    let release: (value: PaperlessStatusResponse) => void = () => {};
    mockGetPaperlessStatus
      .mockImplementationOnce(() => new Promise((resolve) => (release = resolve)))
      .mockResolvedValueOnce(status(false));
    const first = cache.getSharedPaperlessStatus();
    const forced = cache.getSharedPaperlessStatus(true);
    await expect(forced).resolves.toEqual(status(false));
    release(status(true));
    await first;
    expect(mockGetPaperlessStatus).toHaveBeenCalledTimes(2);
  });

  it('resetPaperlessStatusCache drops the cached answer and the in-flight request', async () => {
    mockGetPaperlessStatus.mockResolvedValueOnce(status(true)).mockResolvedValueOnce(status(false));
    await cache.getSharedPaperlessStatus();
    cache.resetPaperlessStatusCache();
    await expect(cache.getSharedPaperlessStatus()).resolves.toEqual(status(false));
    expect(mockGetPaperlessStatus).toHaveBeenCalledTimes(2);
  });
});

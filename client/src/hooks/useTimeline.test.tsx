/**
 * @jest-environment jsdom
 *
 * useTimeline (D19): stale-while-revalidate. Only the first load is a loading state; a refetch
 * keeps the data; a failure is data (`failure`), never a translated message, and a locale change
 * never refetches.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { renderHook, waitFor, act } from '@testing-library/react';
import type * as TimelineApiModule from '../lib/timelineApi.js';
import { makeTask, makeTimeline } from '../test/scheduleFixtures.js';

const mockGetTimeline = jest.fn<typeof TimelineApiModule.getTimeline>();

jest.unstable_mockModule('../lib/timelineApi.js', () => ({
  getTimeline: mockGetTimeline,
}));

const { useTimeline } = await import('./useTimeline.js');
const { ApiClientError, NetworkError } = await import('../lib/apiClient.js');

const FIRST = makeTimeline({ workItems: [makeTask('a')] });
const SECOND = makeTimeline({ workItems: [makeTask('a'), makeTask('b')] });

describe('useTimeline', () => {
  beforeEach(() => {
    mockGetTimeline.mockReset();
  });

  it('starts loading with no data and no failure', async () => {
    mockGetTimeline.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useTimeline());
    expect(result.current).toMatchObject({ data: null, isLoading: true, failure: null });
  });

  it('loads the data and stops loading', async () => {
    mockGetTimeline.mockResolvedValue(FIRST);
    const { result } = renderHook(() => useTimeline());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual(FIRST);
    expect(result.current.failure).toBeNull();
  });

  it('keeps the data and never shows loading again while a refetch runs', async () => {
    mockGetTimeline.mockResolvedValueOnce(FIRST);
    const { result } = renderHook(() => useTimeline());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let resolveSecond!: (value: typeof SECOND) => void;
    mockGetTimeline.mockReturnValueOnce(new Promise((resolve) => (resolveSecond = resolve)));
    act(() => result.current.refetch());
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toEqual(FIRST);

    await act(async () => resolveSecond(SECOND));
    expect(result.current.data).toEqual(SECOND);
    expect(mockGetTimeline).toHaveBeenCalledTimes(2);
  });

  it('describes an API failure as data: code and notFound, never the server text', async () => {
    mockGetTimeline.mockRejectedValue(
      new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'server words' }),
    );
    const { result } = renderHook(() => useTimeline());
    await waitFor(() => expect(result.current.failure).not.toBeNull());
    expect(result.current.failure).toEqual({
      kind: 'api',
      code: 'INTERNAL_ERROR',
      notFound: false,
    });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeNull();
  });

  it('marks a 404 as notFound', async () => {
    mockGetTimeline.mockRejectedValue(
      new ApiClientError(404, { code: 'NOT_FOUND', message: 'gone' }),
    );
    const { result } = renderHook(() => useTimeline());
    await waitFor(() => expect(result.current.failure).not.toBeNull());
    expect(result.current.failure).toMatchObject({ kind: 'api', notFound: true });
  });

  it('describes any other error as kind other', async () => {
    mockGetTimeline.mockRejectedValue(new NetworkError('offline', undefined));
    const { result } = renderHook(() => useTimeline());
    await waitFor(() => expect(result.current.failure).not.toBeNull());
    expect(result.current.failure).toEqual({ kind: 'other' });
  });

  it('a failed refetch keeps the data and reports the failure; the next success clears it', async () => {
    mockGetTimeline.mockResolvedValueOnce(FIRST);
    const { result } = renderHook(() => useTimeline());
    await waitFor(() => expect(result.current.data).toEqual(FIRST));

    mockGetTimeline.mockRejectedValueOnce(new NetworkError('offline', undefined));
    act(() => result.current.refetch());
    await waitFor(() => expect(result.current.failure).toEqual({ kind: 'other' }));
    expect(result.current.data).toEqual(FIRST);

    mockGetTimeline.mockResolvedValueOnce(SECOND);
    act(() => result.current.refetch());
    await waitFor(() => expect(result.current.data).toEqual(SECOND));
    expect(result.current.failure).toBeNull();
  });

  it('ignores a response that arrives after unmount', async () => {
    let resolve!: (value: typeof FIRST) => void;
    mockGetTimeline.mockReturnValue(new Promise((r) => (resolve = r)));
    const { result, unmount } = renderHook(() => useTimeline());
    unmount();
    await act(async () => resolve(FIRST));
    expect(result.current.data).toBeNull();
  });

  it('ignores a failure that arrives after unmount', async () => {
    let reject!: (reason: Error) => void;
    mockGetTimeline.mockReturnValue(new Promise((_, r) => (reject = r)));
    const { result, unmount } = renderHook(() => useTimeline());
    unmount();
    await act(async () => reject(new NetworkError('late', undefined)));
    expect(result.current.failure).toBeNull();
  });
});

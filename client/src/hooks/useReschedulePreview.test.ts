import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { renderHook, act } from '@testing-library/react';
import type { ScheduleImpact, SchedulePreviewResponse } from '@cornerstone/shared';
import type * as ScheduleApiTypes from '../lib/scheduleApi.js';

const mockPreview = jest.fn<typeof ScheduleApiTypes.previewSchedule>();

jest.unstable_mockModule('../lib/scheduleApi.js', () => ({ previewSchedule: mockPreview }));

const { useReschedulePreview, RESCHEDULE_PREVIEW_DEBOUNCE_MS } =
  await import('./useReschedulePreview.js');

const impact = (count: number): ScheduleImpact => ({
  movedItems: [],
  milestones: [],
  projectEnd: { previousDate: null, newDate: null },
  holdsUp: { count, startingWithin14Days: 0 },
});

function response(count: number): SchedulePreviewResponse {
  return { scheduledItems: [], criticalPath: [], warnings: [], impact: impact(count) };
}

async function settle(ms = RESCHEDULE_PREVIEW_DEBOUNCE_MS) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

describe('useReschedulePreview', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockPreview.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('is idle and asks nothing while durationDays is null', async () => {
    const { result } = renderHook(() => useReschedulePreview('a', null));
    await settle(1000);
    expect(result.current).toMatchObject({ status: 'idle', impact: null });
    expect(mockPreview).not.toHaveBeenCalled();
  });

  it('debounces, then asks for a cascade preview of one override', async () => {
    mockPreview.mockResolvedValue(response(2));
    const { result } = renderHook(() => useReschedulePreview('a', 5));
    expect(result.current.status).toBe('loading');
    await settle(RESCHEDULE_PREVIEW_DEBOUNCE_MS - 1);
    expect(mockPreview).not.toHaveBeenCalled();
    await settle(1);
    expect(mockPreview).toHaveBeenCalledTimes(1);
    expect(mockPreview.mock.calls[0]![0]).toEqual({
      mode: 'cascade',
      anchorWorkItemId: 'a',
      overrides: [{ workItemId: 'a', durationDays: 5 }],
    });
    expect(result.current.status).toBe('ready');
    expect(result.current.impact?.holdsUp.count).toBe(2);
  });

  it('only the last of several quick changes is sent', async () => {
    mockPreview.mockResolvedValue(response(1));
    const { rerender } = renderHook(({ d }) => useReschedulePreview('a', d), {
      initialProps: { d: 1 },
    });
    await settle(100);
    rerender({ d: 2 });
    await settle(100);
    rerender({ d: 3 });
    await settle(RESCHEDULE_PREVIEW_DEBOUNCE_MS);
    expect(mockPreview).toHaveBeenCalledTimes(1);
    expect(mockPreview.mock.calls[0]![0].overrides[0]!.durationDays).toBe(3);
  });

  it('goes back to loading (not showing the old impact) when the duration changes', async () => {
    mockPreview.mockResolvedValue(response(1));
    const { result, rerender } = renderHook(({ d }) => useReschedulePreview('a', d), {
      initialProps: { d: 1 },
    });
    await settle();
    expect(result.current.status).toBe('ready');
    rerender({ d: 2 });
    expect(result.current).toMatchObject({ status: 'loading', impact: null });
  });

  it('drops the response of an older request', async () => {
    let resolveFirst!: (value: SchedulePreviewResponse) => void;
    mockPreview.mockImplementationOnce(
      () => new Promise<SchedulePreviewResponse>((resolve) => (resolveFirst = resolve)),
    );
    mockPreview.mockResolvedValueOnce(response(7));
    const { result, rerender } = renderHook(({ d }) => useReschedulePreview('a', d), {
      initialProps: { d: 1 },
    });
    await settle();
    rerender({ d: 2 });
    await settle();
    expect(result.current.impact?.holdsUp.count).toBe(7);
    await act(async () => {
      resolveFirst(response(1));
    });
    expect(result.current.impact?.holdsUp.count).toBe(7);
  });

  it('aborts the request in flight when the duration changes', async () => {
    mockPreview.mockImplementation(() => new Promise(() => {}));
    const { rerender } = renderHook(({ d }) => useReschedulePreview('a', d), {
      initialProps: { d: 1 },
    });
    await settle();
    const signal = mockPreview.mock.calls[0]![1]!.signal!;
    expect(signal.aborted).toBe(false);
    rerender({ d: 2 });
    expect(signal.aborted).toBe(true);
  });

  it('drops the failure of an older (aborted) request', async () => {
    let rejectFirst!: (reason: Error) => void;
    mockPreview.mockImplementationOnce(
      () => new Promise<SchedulePreviewResponse>((_, reject) => (rejectFirst = reject)),
    );
    mockPreview.mockResolvedValueOnce(response(4));
    const { result, rerender } = renderHook(({ d }) => useReschedulePreview('a', d), {
      initialProps: { d: 1 },
    });
    await settle();
    rerender({ d: 2 });
    await settle();
    await act(async () => {
      rejectFirst(new Error('aborted'));
    });
    expect(result.current.status).toBe('ready');
    expect(result.current.impact?.holdsUp.count).toBe(4);
  });

  it('reports an error, and retry asks again', async () => {
    mockPreview.mockRejectedValueOnce(new Error('boom'));
    mockPreview.mockResolvedValueOnce(response(3));
    const { result } = renderHook(() => useReschedulePreview('a', 4));
    await settle();
    expect(result.current).toMatchObject({ status: 'error', impact: null });
    act(() => result.current.retry());
    expect(result.current.status).toBe('loading');
    await settle();
    expect(mockPreview).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('ready');
  });

  it('goes idle again when durationDays becomes null', async () => {
    mockPreview.mockResolvedValue(response(1));
    const { result, rerender } = renderHook(
      ({ d }: { d: number | null }) => useReschedulePreview('a', d),
      { initialProps: { d: 1 as number | null } },
    );
    await settle();
    rerender({ d: null });
    expect(result.current.status).toBe('idle');
  });

  it('clears its timer on unmount so nothing is sent', async () => {
    const { unmount } = renderHook(() => useReschedulePreview('a', 2));
    unmount();
    await settle(1000);
    expect(mockPreview).not.toHaveBeenCalled();
  });
});

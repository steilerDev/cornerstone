import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { SchedulePreviewResponse } from '@cornerstone/shared';
import { previewSchedule } from './scheduleApi.js';

const RESPONSE: SchedulePreviewResponse = {
  scheduledItems: [],
  criticalPath: [],
  warnings: [],
  impact: {
    movedItems: [],
    milestones: [],
    projectEnd: { previousDate: null, newDate: null },
    holdsUp: { count: 0, startingWithin14Days: 0 },
  },
};

describe('scheduleApi.previewSchedule', () => {
  let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

  beforeEach(() => {
    mockFetch = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('POSTs the mode and overrides to /api/schedule and returns the impact response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => RESPONSE,
    } as Response);
    const body = {
      mode: 'full' as const,
      overrides: [{ workItemId: 'a', durationDays: 4 }],
    };

    await expect(previewSchedule(body)).resolves.toEqual(RESPONSE);

    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe('/api/schedule');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual(body);
  });

  it('passes the abort signal through', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => RESPONSE,
    } as Response);
    const controller = new AbortController();
    await previewSchedule(
      { mode: 'full', overrides: [{ workItemId: 'a', durationDays: 1 }] },
      { signal: controller.signal },
    );
    expect(mockFetch.mock.calls[0]![1]?.signal).toBe(controller.signal);
  });

  it('rejects when the server answers an error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ error: { code: 'CIRCULAR_DEPENDENCY', message: 'cycle' } }),
    } as Response);
    await expect(
      previewSchedule({ mode: 'full', overrides: [{ workItemId: 'a', durationDays: 1 }] }),
    ).rejects.toMatchObject({ message: expect.any(String) });
  });
});

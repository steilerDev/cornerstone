/**
 * @jest-environment node
 *
 * Unit tests for scheduleApi.ts — API client function for the scheduling endpoint.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { runSchedule } from './scheduleApi.js';
import type { ScheduleRequest, ScheduleResponse } from '@cornerstone/shared';

describe('scheduleApi', () => {
  let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

  beforeEach(() => {
    mockFetch = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // runSchedule
  // ---------------------------------------------------------------------------

  describe('runSchedule', () => {
    const MOCK_RESPONSE: ScheduleResponse = {
      scheduledItems: [
        {
          workItemId: 'wi-1',
          previousStartDate: null,
          previousEndDate: null,
          scheduledStartDate: '2024-06-01',
          scheduledEndDate: '2024-06-15',
          latestStartDate: '2024-06-01',
          latestFinishDate: '2024-06-15',
          totalFloat: 0,
          isCritical: true,
        },
      ],
      criticalPath: ['wi-1'],
      warnings: [],
    };

    it('sends POST request to /api/schedule', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => MOCK_RESPONSE,
      } as Response);

      const request: ScheduleRequest = { mode: 'full' };
      await runSchedule(request);

      expect(mockFetch).toHaveBeenCalledWith('/api/schedule', expect.any(Object));
    });

    it('uses HTTP POST method', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => MOCK_RESPONSE,
      } as Response);

      const request: ScheduleRequest = { mode: 'full' };
      await runSchedule(request);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/schedule',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('sends the request body as JSON', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => MOCK_RESPONSE,
      } as Response);

      const request: ScheduleRequest = { mode: 'full' };
      await runSchedule(request);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/schedule',
        expect.objectContaining({ body: JSON.stringify(request) }),
      );
    });

    it('sends Content-Type application/json header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => MOCK_RESPONSE,
      } as Response);

      const request: ScheduleRequest = { mode: 'full' };
      await runSchedule(request);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/schedule',
        expect.objectContaining({
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        }),
      );
    });

    it('returns the schedule response on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => MOCK_RESPONSE,
      } as Response);

      const request: ScheduleRequest = { mode: 'full' };
      const result = await runSchedule(request);

      expect(result).toEqual(MOCK_RESPONSE);
    });

    it('returns scheduledItems array in the response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => MOCK_RESPONSE,
      } as Response);

      const result = await runSchedule({ mode: 'full' });

      expect(result.scheduledItems).toHaveLength(1);
      expect(result.scheduledItems[0].workItemId).toBe('wi-1');
      expect(result.scheduledItems[0].isCritical).toBe(true);
    });

    it('returns criticalPath array in the response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => MOCK_RESPONSE,
      } as Response);

      const result = await runSchedule({ mode: 'full' });

      expect(result.criticalPath).toEqual(['wi-1']);
    });

    it('returns warnings array in the response', async () => {
      const responseWithWarnings: ScheduleResponse = {
        scheduledItems: [],
        criticalPath: [],
        warnings: [
          {
            workItemId: 'wi-2',
            type: 'no_duration',
            message: 'Work item wi-2 has no duration set',
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => responseWithWarnings,
      } as Response);

      const result = await runSchedule({ mode: 'full' });

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].type).toBe('no_duration');
    });

    it('sends cascade mode with anchorWorkItemId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => MOCK_RESPONSE,
      } as Response);

      const request: ScheduleRequest = {
        mode: 'cascade',
        anchorWorkItemId: 'wi-anchor',
      };
      await runSchedule(request);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/schedule',
        expect.objectContaining({
          body: JSON.stringify(request),
        }),
      );
    });

    it('sends cascade mode with null anchorWorkItemId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => MOCK_RESPONSE,
      } as Response);

      const request: ScheduleRequest = {
        mode: 'cascade',
        anchorWorkItemId: null,
      };
      await runSchedule(request);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/schedule',
        expect.objectContaining({
          body: JSON.stringify(request),
        }),
      );
    });

    it('handles response with multiple scheduled items and critical path', async () => {
      const complexResponse: ScheduleResponse = {
        scheduledItems: [
          {
            workItemId: 'wi-1',
            previousStartDate: '2024-05-01',
            previousEndDate: '2024-05-15',
            scheduledStartDate: '2024-06-01',
            scheduledEndDate: '2024-06-15',
            latestStartDate: '2024-06-01',
            latestFinishDate: '2024-06-15',
            totalFloat: 0,
            isCritical: true,
          },
          {
            workItemId: 'wi-2',
            previousStartDate: null,
            previousEndDate: null,
            scheduledStartDate: '2024-06-16',
            scheduledEndDate: '2024-07-01',
            latestStartDate: '2024-06-20',
            latestFinishDate: '2024-07-05',
            totalFloat: 4,
            isCritical: false,
          },
        ],
        criticalPath: ['wi-1'],
        warnings: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => complexResponse,
      } as Response);

      const result = await runSchedule({ mode: 'full' });

      expect(result.scheduledItems).toHaveLength(2);
      expect(result.criticalPath).toEqual(['wi-1']);
      expect(result.scheduledItems[1].totalFloat).toBe(4);
      expect(result.scheduledItems[1].isCritical).toBe(false);
    });

    it('handles empty scheduledItems and criticalPath', async () => {
      const emptyResponse: ScheduleResponse = {
        scheduledItems: [],
        criticalPath: [],
        warnings: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => emptyResponse,
      } as Response);

      const result = await runSchedule({ mode: 'full' });

      expect(result.scheduledItems).toHaveLength(0);
      expect(result.criticalPath).toHaveLength(0);
    });

    it('throws ApiClientError when server returns 400 (bad request)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid schedule request' },
        }),
      } as Response);

      await expect(runSchedule({ mode: 'full' })).rejects.toThrow('Invalid schedule request');
    });

    it('throws ApiClientError when server returns 500', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({
          error: { code: 'INTERNAL_ERROR', message: 'Scheduling engine failed' },
        }),
      } as Response);

      await expect(runSchedule({ mode: 'full' })).rejects.toThrow();
    });

    it('throws NetworkError when fetch fails due to network issue', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await expect(runSchedule({ mode: 'full' })).rejects.toThrow('Network request failed');
    });

    it('throws NetworkError when fetch times out', async () => {
      mockFetch.mockRejectedValueOnce(new DOMException('The operation was aborted', 'AbortError'));

      await expect(runSchedule({ mode: 'full' })).rejects.toThrow('Network request failed');
    });
  });
});

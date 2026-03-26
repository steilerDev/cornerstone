import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { getTimeline } from './timelineApi.js';
import type { TimelineResponse } from '@cornerstone/shared';

const makeTimelineResponse = (overrides?: Partial<TimelineResponse>): TimelineResponse => ({
  workItems: [],
  dependencies: [],
  milestones: [],
  householdItems: [],
  criticalPath: [],
  dateRange: null,
  ...overrides,
});

describe('timelineApi', () => {
  let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

  beforeEach(() => {
    mockFetch = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getTimeline', () => {
    it('sends GET request to /api/timeline', async () => {
      const mockResponse = makeTimelineResponse();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await getTimeline();

      expect(mockFetch).toHaveBeenCalledWith('/api/timeline', expect.any(Object));
    });

    it('returns an empty timeline when no items exist', async () => {
      const mockResponse = makeTimelineResponse();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await getTimeline();

      expect(result.workItems).toEqual([]);
      expect(result.dependencies).toEqual([]);
      expect(result.milestones).toEqual([]);
      expect(result.householdItems).toEqual([]);
      expect(result.criticalPath).toEqual([]);
      expect(result.dateRange).toBeNull();
    });

    it('returns timeline with work items and date range', async () => {
      const mockResponse = makeTimelineResponse({
        workItems: [
          {
            id: 'wi-1',
            title: 'Install plumbing',
            status: 'in_progress',
            startDate: '2026-01-01',
            endDate: '2026-01-15',
            actualStartDate: null,
            actualEndDate: null,
            durationDays: 14,
            startAfter: null,
            startBefore: null,
            assignedUser: null,
            assignedVendor: null,
            area: null,
          },
        ],
        dateRange: {
          earliest: '2026-01-01',
          latest: '2026-01-15',
        },
        criticalPath: ['wi-1'],
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await getTimeline();

      expect(result.workItems).toHaveLength(1);
      expect(result.workItems[0].id).toBe('wi-1');
      expect(result.workItems[0].title).toBe('Install plumbing');
      expect(result.dateRange).not.toBeNull();
      expect(result.dateRange?.earliest).toBe('2026-01-01');
      expect(result.criticalPath).toContain('wi-1');
    });

    it('returns timeline with milestones', async () => {
      const mockResponse = makeTimelineResponse({
        milestones: [
          {
            id: 1,
            title: 'Foundation complete',
            targetDate: '2026-02-01',
            isCompleted: false,
            completedAt: null,
            color: '#ff0000',
            workItemIds: ['wi-1', 'wi-2'],
            projectedDate: '2026-02-05',
            isCritical: true,
          },
        ],
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await getTimeline();

      expect(result.milestones).toHaveLength(1);
      expect(result.milestones[0].title).toBe('Foundation complete');
      expect(result.milestones[0].isCritical).toBe(true);
    });

    it('returns timeline with dependencies', async () => {
      const mockResponse = makeTimelineResponse({
        dependencies: [
          {
            predecessorId: 'wi-1',
            successorId: 'wi-2',
            dependencyType: 'finish_to_start',
            leadLagDays: 0,
          },
        ],
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await getTimeline();

      expect(result.dependencies).toHaveLength(1);
      expect(result.dependencies[0].predecessorId).toBe('wi-1');
      expect(result.dependencies[0].successorId).toBe('wi-2');
      expect(result.dependencies[0].dependencyType).toBe('finish_to_start');
    });

    it('throws error when response is not OK (500)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Server error' } }),
      } as Response);

      await expect(getTimeline()).rejects.toThrow();
    });

    it('throws error when not authenticated (401)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }),
      } as Response);

      await expect(getTimeline()).rejects.toThrow();
    });
  });
});

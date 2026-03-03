import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  fetchLinkedWorkItems,
  linkWorkItemToHouseholdItem,
  unlinkWorkItemFromHouseholdItem,
  fetchLinkedHouseholdItems,
} from './householdItemWorkItemsApi.js';
import type { WorkItemSummary, WorkItemLinkedHouseholdItemSummary } from '@cornerstone/shared';

describe('householdItemWorkItemsApi', () => {
  let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

  // Helper to create complete WorkItemSummary fixtures
  function makeWorkItem(overrides: Partial<WorkItemSummary> = {}): WorkItemSummary {
    return {
      id: 'wi-1',
      title: 'Work Item',
      status: 'not_started' as const,
      startDate: null,
      endDate: null,
      actualStartDate: null,
      actualEndDate: null,
      durationDays: null,
      assignedUser: null,
      tags: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      ...overrides,
    };
  }

  beforeEach(() => {
    mockFetch = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─── fetchLinkedWorkItems ─────────────────────────────────────────────────

  describe('fetchLinkedWorkItems', () => {
    it('sends GET request to /api/household-items/:householdItemId/work-items', async () => {
      const mockResponse = {
        workItems: [] as WorkItemSummary[],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await fetchLinkedWorkItems('hi-123');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/household-items/hi-123/work-items',
        expect.any(Object),
      );
    });

    it('returns an array of work items', async () => {
      const mockWorkItem = makeWorkItem({
        title: 'Install HVAC',
        status: 'in_progress' as const,
        startDate: '2026-04-01T00:00:00.000Z',
        endDate: '2026-04-15T00:00:00.000Z',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ workItems: [mockWorkItem] }),
      } as Response);

      const result = await fetchLinkedWorkItems('hi-123');

      expect(result).toEqual([mockWorkItem]);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('wi-1');
      expect(result[0].title).toBe('Install HVAC');
      expect(result[0].startDate).toBe('2026-04-01T00:00:00.000Z');
    });

    it('returns empty array when no work items are linked', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ workItems: [] }),
      } as Response);

      const result = await fetchLinkedWorkItems('hi-123');

      expect(result).toEqual([]);
    });

    it('returns multiple work items', async () => {
      const workItems: WorkItemSummary[] = [
        makeWorkItem({ id: 'wi-1', title: 'Task 1', status: 'not_started' as const }),
        makeWorkItem({
          id: 'wi-2',
          title: 'Task 2',
          status: 'in_progress' as const,
          startDate: '2026-04-01T00:00:00.000Z',
        }),
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ workItems }),
      } as Response);

      const result = await fetchLinkedWorkItems('hi-123');

      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('Task 1');
      expect(result[1].title).toBe('Task 2');
    });

    it('throws error when response is not OK', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Household item not found' } }),
      } as Response);

      await expect(fetchLinkedWorkItems('nonexistent')).rejects.toThrow();
    });

    it('throws error when response is 500', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Server error' } }),
      } as Response);

      await expect(fetchLinkedWorkItems('hi-123')).rejects.toThrow();
    });
  });

  // ─── linkWorkItemToHouseholdItem ──────────────────────────────────────────

  describe('linkWorkItemToHouseholdItem', () => {
    it('sends POST request with correct URL and body', async () => {
      const mockWorkItem = makeWorkItem({
        title: 'Test Task',
        status: 'not_started' as const,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ workItem: mockWorkItem }),
      } as Response);

      await linkWorkItemToHouseholdItem('hi-123', 'wi-1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/household-items/hi-123/work-items',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ workItemId: 'wi-1' }),
        }),
      );
    });

    it('returns linked work item', async () => {
      const mockWorkItem = makeWorkItem({
        title: 'Install Kitchen Cabinets',
        status: 'not_started' as const,
        startDate: '2026-05-01T00:00:00.000Z',
        endDate: '2026-05-10T00:00:00.000Z',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ workItem: mockWorkItem }),
      } as Response);

      const result = await linkWorkItemToHouseholdItem('hi-123', 'wi-1');

      expect(result).toEqual(mockWorkItem);
      expect(result.id).toBe('wi-1');
      expect(result.title).toBe('Install Kitchen Cabinets');
      expect(result.startDate).toBe('2026-05-01T00:00:00.000Z');
    });

    it('throws error when work item not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: { code: 'NOT_FOUND', message: 'Work item not found' },
        }),
      } as Response);

      await expect(linkWorkItemToHouseholdItem('hi-123', 'nonexistent')).rejects.toThrow();
    });

    it('throws error when household item not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: { code: 'NOT_FOUND', message: 'Household item not found' },
        }),
      } as Response);

      await expect(linkWorkItemToHouseholdItem('nonexistent', 'wi-1')).rejects.toThrow();
    });

    it('throws error on duplicate link (409 conflict)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          error: { code: 'CONFLICT', message: 'Work item already linked' },
        }),
      } as Response);

      await expect(linkWorkItemToHouseholdItem('hi-123', 'wi-1')).rejects.toThrow();
    });
  });

  // ─── unlinkWorkItemFromHouseholdItem ──────────────────────────────────────

  describe('unlinkWorkItemFromHouseholdItem', () => {
    it('sends DELETE request to correct URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      } as Response);

      await unlinkWorkItemFromHouseholdItem('hi-123', 'wi-1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/household-items/hi-123/work-items/wi-1',
        expect.objectContaining({
          method: 'DELETE',
        }),
      );
    });

    it('returns void on successful unlink', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      } as Response);

      const result = await unlinkWorkItemFromHouseholdItem('hi-123', 'wi-1');

      expect(result).toBeUndefined();
    });

    it('throws error when work item link not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: { code: 'NOT_FOUND', message: 'Work item link not found' },
        }),
      } as Response);

      await expect(unlinkWorkItemFromHouseholdItem('hi-123', 'nonexistent')).rejects.toThrow();
    });

    it('throws error when household item not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: { code: 'NOT_FOUND', message: 'Household item not found' },
        }),
      } as Response);

      await expect(unlinkWorkItemFromHouseholdItem('nonexistent', 'wi-1')).rejects.toThrow();
    });

    it('throws error when delete fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Delete failed' } }),
      } as Response);

      await expect(unlinkWorkItemFromHouseholdItem('hi-123', 'wi-1')).rejects.toThrow();
    });
  });

  // ─── fetchLinkedHouseholdItems ────────────────────────────────────────────

  describe('fetchLinkedHouseholdItems', () => {
    it('sends GET request to /api/work-items/:workItemId/household-items', async () => {
      const mockResponse = {
        householdItems: [] as WorkItemLinkedHouseholdItemSummary[],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await fetchLinkedHouseholdItems('wi-123');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/work-items/wi-123/household-items',
        expect.any(Object),
      );
    });

    it('returns an array of household items', async () => {
      const mockItem: WorkItemLinkedHouseholdItemSummary = {
        id: 'hi-1',
        name: 'HVAC System',
        category: 'appliances',
        status: 'in_transit',
        expectedDeliveryDate: '2026-05-01T00:00:00.000Z',
        earliestDeliveryDate: '2026-05-01',
        latestDeliveryDate: '2026-05-10',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ householdItems: [mockItem] }),
      } as Response);

      const result = await fetchLinkedHouseholdItems('wi-123');

      expect(result).toEqual([mockItem]);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('hi-1');
      expect(result[0].name).toBe('HVAC System');
      expect(result[0].category).toBe('appliances');
    });

    it('returns empty array when no household items are linked', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ householdItems: [] }),
      } as Response);

      const result = await fetchLinkedHouseholdItems('wi-123');

      expect(result).toEqual([]);
    });

    it('returns multiple household items', async () => {
      const items: WorkItemLinkedHouseholdItemSummary[] = [
        {
          id: 'hi-1',
          name: 'Item 1',
          category: 'appliances',
          status: 'not_ordered',
          expectedDeliveryDate: null,
          earliestDeliveryDate: null,
          latestDeliveryDate: null,
        },
        {
          id: 'hi-2',
          name: 'Item 2',
          category: 'fixtures',
          status: 'ordered',
          expectedDeliveryDate: '2026-05-15T00:00:00.000Z',
          earliestDeliveryDate: '2026-05-15',
          latestDeliveryDate: '2026-05-20',
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ householdItems: items }),
      } as Response);

      const result = await fetchLinkedHouseholdItems('wi-123');

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Item 1');
      expect(result[1].name).toBe('Item 2');
    });

    it('throws error when response is not OK', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Work item not found' } }),
      } as Response);

      await expect(fetchLinkedHouseholdItems('nonexistent')).rejects.toThrow();
    });

    it('throws error when response is 500', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Server error' } }),
      } as Response);

      await expect(fetchLinkedHouseholdItems('wi-123')).rejects.toThrow();
    });
  });
});

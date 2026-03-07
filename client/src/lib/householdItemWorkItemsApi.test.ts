import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { fetchLinkedHouseholdItems } from './householdItemWorkItemsApi.js';
import type { WorkItemLinkedHouseholdItemSummary } from '@cornerstone/shared';

describe('householdItemWorkItemsApi', () => {
  let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

  beforeEach(() => {
    mockFetch = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─── fetchLinkedHouseholdItems ────────────────────────────────────────────

  describe('fetchLinkedHouseholdItems', () => {
    it('sends GET request to /api/work-items/:workItemId/dependent-household-items', async () => {
      const mockResponse = {
        householdItems: [] as WorkItemLinkedHouseholdItemSummary[],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await fetchLinkedHouseholdItems('wi-123');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/work-items/wi-123/dependent-household-items',
        expect.any(Object),
      );
    });

    it('returns an array of household items', async () => {
      const mockItem: WorkItemLinkedHouseholdItemSummary = {
        id: 'hi-1',
        name: 'HVAC System',
        category: 'appliances',
        status: 'scheduled',
        targetDeliveryDate: '2026-05-01T00:00:00.000Z',
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
          status: 'planned',
          targetDeliveryDate: null,
          earliestDeliveryDate: null,
          latestDeliveryDate: null,
        },
        {
          id: 'hi-2',
          name: 'Item 2',
          category: 'fixtures',
          status: 'purchased',
          targetDeliveryDate: '2026-05-15T00:00:00.000Z',
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

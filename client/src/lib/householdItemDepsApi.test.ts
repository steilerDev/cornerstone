import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  fetchHouseholdItemDeps,
  createHouseholdItemDep,
  deleteHouseholdItemDep,
} from './householdItemDepsApi.js';
import type { HouseholdItemDepDetail } from '@cornerstone/shared';

describe('householdItemDepsApi', () => {
  let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

  beforeEach(() => {
    mockFetch = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── fetchHouseholdItemDeps ────────────────────────────────────────────────

  describe('fetchHouseholdItemDeps', () => {
    it('sends GET request to /api/household-items/:id/dependencies', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ dependencies: [] }),
      } as Response);

      await fetchHouseholdItemDeps('hi-123');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/household-items/hi-123/dependencies',
        expect.any(Object),
      );
    });

    it('returns empty array when no dependencies exist', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ dependencies: [] }),
      } as Response);

      const result = await fetchHouseholdItemDeps('hi-123');

      expect(result).toEqual([]);
    });

    it('returns array of HouseholdItemDepDetail objects', async () => {
      const mockDep: HouseholdItemDepDetail = {
        householdItemId: 'hi-123',
        predecessorType: 'work_item',
        predecessorId: 'wi-456',
        predecessor: {
          id: 'wi-456',
          title: 'Foundation Work',
          status: 'in_progress',
          endDate: '2026-05-15',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ dependencies: [mockDep] }),
      } as Response);

      const result = await fetchHouseholdItemDeps('hi-123');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(mockDep);
      expect(result[0].predecessorType).toBe('work_item');
      expect(result[0].predecessor.title).toBe('Foundation Work');
    });

    it('returns milestone dependency with correct shape', async () => {
      const mockDep: HouseholdItemDepDetail = {
        householdItemId: 'hi-123',
        predecessorType: 'milestone',
        predecessorId: '42',
        predecessor: {
          id: '42',
          title: 'Frame Complete',
          status: null, // milestones have null status
          endDate: '2026-04-30',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ dependencies: [mockDep] }),
      } as Response);

      const result = await fetchHouseholdItemDeps('hi-123');

      expect(result).toHaveLength(1);
      expect(result[0].predecessorType).toBe('milestone');
      expect(result[0].predecessor.status).toBeNull();
    });

    it('returns multiple dependencies', async () => {
      const mockDeps: HouseholdItemDepDetail[] = [
        {
          householdItemId: 'hi-123',
          predecessorType: 'work_item',
          predecessorId: 'wi-1',
          predecessor: { id: 'wi-1', title: 'Work A', status: 'not_started', endDate: null },
        },
        {
          householdItemId: 'hi-123',
          predecessorType: 'milestone',
          predecessorId: '10',
          predecessor: { id: '10', title: 'Phase 1 Done', status: null, endDate: '2026-03-31' },
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ dependencies: mockDeps }),
      } as Response);

      const result = await fetchHouseholdItemDeps('hi-123');

      expect(result).toHaveLength(2);
      expect(result[0].predecessorType).toBe('work_item');
      expect(result[1].predecessorType).toBe('milestone');
    });

    it('throws error when household item not found (404)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Household item not found' } }),
      } as Response);

      await expect(fetchHouseholdItemDeps('nonexistent')).rejects.toThrow();
    });

    it('throws error on server error (500)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Server error' } }),
      } as Response);

      await expect(fetchHouseholdItemDeps('hi-123')).rejects.toThrow();
    });
  });

  // ── createHouseholdItemDep ────────────────────────────────────────────────

  describe('createHouseholdItemDep', () => {
    it('sends POST request to /api/household-items/:id/dependencies', async () => {
      const mockDep: HouseholdItemDepDetail = {
        householdItemId: 'hi-123',
        predecessorType: 'work_item',
        predecessorId: 'wi-456',
        predecessor: { id: 'wi-456', title: 'Foundation', status: 'not_started', endDate: null },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ dependency: mockDep }),
      } as Response);

      await createHouseholdItemDep('hi-123', {
        predecessorType: 'work_item',
        predecessorId: 'wi-456',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/household-items/hi-123/dependencies',
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });

    it('sends correct request body for work_item dependency', async () => {
      const mockDep: HouseholdItemDepDetail = {
        householdItemId: 'hi-123',
        predecessorType: 'work_item',
        predecessorId: 'wi-456',
        predecessor: { id: 'wi-456', title: 'Foundation', status: 'not_started', endDate: null },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ dependency: mockDep }),
      } as Response);

      const requestData = {
        predecessorType: 'work_item' as const,
        predecessorId: 'wi-456',
      };

      await createHouseholdItemDep('hi-123', requestData);

      const callArgs = mockFetch.mock.calls[0];
      const bodyStr = callArgs[1]?.body as string;
      const body = JSON.parse(bodyStr);

      expect(body.predecessorType).toBe('work_item');
      expect(body.predecessorId).toBe('wi-456');
    });

    it('sends correct request body for milestone dependency', async () => {
      const mockDep: HouseholdItemDepDetail = {
        householdItemId: 'hi-456',
        predecessorType: 'milestone',
        predecessorId: '42',
        predecessor: { id: '42', title: 'Frame Done', status: null, endDate: '2026-04-15' },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ dependency: mockDep }),
      } as Response);

      await createHouseholdItemDep('hi-456', {
        predecessorType: 'milestone',
        predecessorId: '42',
      });

      const callArgs = mockFetch.mock.calls[0];
      const bodyStr = callArgs[1]?.body as string;
      const body = JSON.parse(bodyStr);

      expect(body.predecessorType).toBe('milestone');
      expect(body.predecessorId).toBe('42');
    });

    it('returns the created HouseholdItemDepDetail', async () => {
      const mockDep: HouseholdItemDepDetail = {
        householdItemId: 'hi-123',
        predecessorType: 'work_item',
        predecessorId: 'wi-789',
        predecessor: {
          id: 'wi-789',
          title: 'Flooring',
          status: 'in_progress',
          endDate: '2026-06-30',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ dependency: mockDep }),
      } as Response);

      const result = await createHouseholdItemDep('hi-123', {
        predecessorType: 'work_item',
        predecessorId: 'wi-789',
      });

      expect(result).toEqual(mockDep);
      expect(result.predecessor.endDate).toBe('2026-06-30');
    });

    it('throws error on 409 conflict (DUPLICATE_DEPENDENCY)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          error: { code: 'DUPLICATE_DEPENDENCY', message: 'Dependency already exists' },
        }),
      } as Response);

      await expect(
        createHouseholdItemDep('hi-123', {
          predecessorType: 'work_item',
          predecessorId: 'wi-456',
        }),
      ).rejects.toThrow();
    });

    it('throws error on 409 conflict (CIRCULAR_DEPENDENCY)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          error: { code: 'CIRCULAR_DEPENDENCY', message: 'Circular dependency detected' },
        }),
      } as Response);

      await expect(
        createHouseholdItemDep('hi-123', {
          predecessorType: 'work_item',
          predecessorId: 'wi-456',
        }),
      ).rejects.toThrow();
    });

    it('throws error on 400 validation error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: { code: 'VALIDATION_ERROR', message: 'predecessorType is required' },
        }),
      } as Response);

      await expect(
        createHouseholdItemDep('hi-123', {
          predecessorType: 'work_item',
          predecessorId: '',
        }),
      ).rejects.toThrow();
    });

    it('throws error when household item not found (404)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Household item not found' } }),
      } as Response);

      await expect(
        createHouseholdItemDep('nonexistent', {
          predecessorType: 'work_item',
          predecessorId: 'wi-456',
        }),
      ).rejects.toThrow();
    });

    it('throws error when predecessor not found (404)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Work item not found' } }),
      } as Response);

      await expect(
        createHouseholdItemDep('hi-123', {
          predecessorType: 'work_item',
          predecessorId: 'nonexistent-wi',
        }),
      ).rejects.toThrow();
    });
  });

  // ── deleteHouseholdItemDep ────────────────────────────────────────────────

  describe('deleteHouseholdItemDep', () => {
    it('sends DELETE request to /api/household-items/:id/dependencies/:type/:predId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      } as Response);

      await deleteHouseholdItemDep('hi-123', 'work_item', 'wi-456');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/household-items/hi-123/dependencies/work_item/wi-456',
        expect.objectContaining({
          method: 'DELETE',
        }),
      );
    });

    it('sends DELETE request with correct URL for milestone type', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      } as Response);

      await deleteHouseholdItemDep('hi-456', 'milestone', '42');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/household-items/hi-456/dependencies/milestone/42',
        expect.objectContaining({
          method: 'DELETE',
        }),
      );
    });

    it('returns void on successful delete (204)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      } as Response);

      const result = await deleteHouseholdItemDep('hi-123', 'work_item', 'wi-456');

      expect(result).toBeUndefined();
    });

    it('throws error when dependency not found (404)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Dependency not found' } }),
      } as Response);

      await expect(deleteHouseholdItemDep('hi-123', 'work_item', 'nonexistent')).rejects.toThrow();
    });

    it('throws error when household item not found (404)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Household item not found' } }),
      } as Response);

      await expect(deleteHouseholdItemDep('nonexistent', 'work_item', 'wi-456')).rejects.toThrow();
    });

    it('throws error on server error (500)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Delete failed' } }),
      } as Response);

      await expect(deleteHouseholdItemDep('hi-123', 'work_item', 'wi-456')).rejects.toThrow();
    });
  });
});

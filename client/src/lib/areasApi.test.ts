import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  fetchAreas,
  fetchArea,
  createArea,
  updateArea,
  deleteArea,
  fetchAreasWithCounts,
  reorderAreas,
} from './areasApi.js';
import type {
  AreaListResponse,
  AreaListWithCountsResponse,
  AreaSingleResponse,
  AreaResponse,
  AreaWithCounts,
  DeleteAreaResponse,
} from '@cornerstone/shared';

const makeArea = (overrides?: Partial<AreaResponse>): AreaResponse => ({
  id: 'area-1',
  name: 'Kitchen',
  parentId: null,
  color: '#ff0000',
  description: null,
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('areasApi', () => {
  let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

  beforeEach(() => {
    mockFetch = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('fetchAreas', () => {
    it('sends GET request to /api/areas without query params when no params provided', async () => {
      const mockResponse: AreaListResponse = { areas: [] };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await fetchAreas();

      expect(mockFetch).toHaveBeenCalledWith('/api/areas', expect.any(Object));
    });

    it('includes search query param when provided', async () => {
      const mockResponse: AreaListResponse = { areas: [] };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await fetchAreas({ search: 'kitchen' });

      expect(mockFetch).toHaveBeenCalledWith('/api/areas?search=kitchen', expect.any(Object));
    });

    it('omits search param when search is empty string', async () => {
      const mockResponse: AreaListResponse = { areas: [] };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await fetchAreas({ search: '' });

      expect(mockFetch).toHaveBeenCalledWith('/api/areas', expect.any(Object));
    });

    it('returns the areas list from the response', async () => {
      const area = makeArea();
      const mockResponse: AreaListResponse = { areas: [area] };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await fetchAreas();

      expect(result.areas).toHaveLength(1);
      expect(result.areas[0]!.id).toBe('area-1');
      expect(result.areas[0]!.name).toBe('Kitchen');
    });

    it('returns empty areas array when no areas exist', async () => {
      const mockResponse: AreaListResponse = { areas: [] };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await fetchAreas();

      expect(result.areas).toEqual([]);
    });

    it('throws error when response is not OK', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Server error' } }),
      } as Response);

      await expect(fetchAreas()).rejects.toThrow();
    });
  });

  describe('fetchArea', () => {
    it('sends GET request to /api/areas/:id', async () => {
      const area = makeArea({ id: 'area-42' });
      const mockResponse: AreaSingleResponse = { area };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await fetchArea('area-42');

      expect(mockFetch).toHaveBeenCalledWith('/api/areas/area-42', expect.any(Object));
    });

    it('returns the area from the response envelope', async () => {
      const area = makeArea({ name: 'Bathroom', color: '#0000ff' });
      const mockResponse: AreaSingleResponse = { area };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await fetchArea('area-1');

      expect(result).toEqual(area);
      expect(result.name).toBe('Bathroom');
    });

    it('throws error when area not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Area not found' } }),
      } as Response);

      await expect(fetchArea('nonexistent')).rejects.toThrow();
    });
  });

  describe('createArea', () => {
    it('sends POST request to /api/areas with the request data', async () => {
      const area = makeArea({ name: 'Living Room' });
      const mockResponse: AreaSingleResponse = { area };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => mockResponse,
      } as Response);

      const requestData = { name: 'Living Room', color: '#00ff00' };
      await createArea(requestData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/areas',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(requestData),
        }),
      );
    });

    it('returns the created area from the response envelope', async () => {
      const area = makeArea({ id: 'area-new', name: 'Garage' });
      const mockResponse: AreaSingleResponse = { area };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => mockResponse,
      } as Response);

      const result = await createArea({ name: 'Garage' });

      expect(result).toEqual(area);
      expect(result.id).toBe('area-new');
    });

    it('creates a child area with a parentId', async () => {
      const childArea = makeArea({ id: 'area-child', name: 'Upper Cabinets', parentId: 'area-1' });
      const mockResponse: AreaSingleResponse = { area: childArea };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => mockResponse,
      } as Response);

      const requestData = { name: 'Upper Cabinets', parentId: 'area-1' };
      await createArea(requestData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/areas',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(requestData),
        }),
      );
    });

    it('throws error when validation fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: { code: 'VALIDATION_ERROR', message: 'Name is required' } }),
      } as Response);

      await expect(createArea({ name: '' })).rejects.toThrow();
    });

    it('throws error when area name conflicts (409)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          error: { code: 'CONFLICT', message: 'Area name already exists at this level' },
        }),
      } as Response);

      await expect(createArea({ name: 'Kitchen' })).rejects.toThrow();
    });
  });

  describe('updateArea', () => {
    it('sends PATCH request to /api/areas/:id with the update data', async () => {
      const area = makeArea({ name: 'Updated Kitchen' });
      const mockResponse: AreaSingleResponse = { area };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const updateData = { name: 'Updated Kitchen' };
      await updateArea('area-1', updateData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/areas/area-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(updateData),
        }),
      );
    });

    it('returns the updated area from the response envelope', async () => {
      const area = makeArea({ name: 'Renovated Kitchen', color: '#aabbcc' });
      const mockResponse: AreaSingleResponse = { area };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await updateArea('area-1', { color: '#aabbcc' });

      expect(result).toEqual(area);
      expect(result.color).toBe('#aabbcc');
    });

    it('throws error when area not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Area not found' } }),
      } as Response);

      await expect(updateArea('nonexistent', { name: 'New name' })).rejects.toThrow();
    });

    it('throws error when update causes circular reference (400)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: { code: 'VALIDATION_ERROR', message: 'circular reference detected' },
        }),
      } as Response);

      await expect(updateArea('area-1', { parentId: 'area-child-1' })).rejects.toThrow();
    });
  });

  describe('deleteArea', () => {
    it('sends DELETE request to /api/areas/:id', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ undo: { token: 't', expiresAt: '2026-01-01T00:00:00.000Z' } }),
      } as Response);

      await deleteArea('area-1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/areas/area-1',
        expect.objectContaining({
          method: 'DELETE',
        }),
      );
    });

    it('returns the Undo token of the delete', async () => {
      const response: DeleteAreaResponse = {
        undo: { token: 'undo-token-1', expiresAt: '2026-01-01T00:00:30.000Z' },
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => response,
      } as Response);

      const result = await deleteArea('area-1');

      expect(result).toEqual(response);
    });

    it('throws error when area not found (404)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Area not found' } }),
      } as Response);

      await expect(deleteArea('nonexistent')).rejects.toThrow();
    });

    it('throws error when area is in use (409)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          error: { code: 'AREA_IN_USE', message: 'Area is referenced by work items' },
        }),
      } as Response);

      await expect(deleteArea('area-1')).rejects.toThrow();
    });
  });
  describe('fetchAreasWithCounts', () => {
    it('requests /api/areas?include=counts and unwraps the areas', async () => {
      const area: AreaWithCounts = {
        ...makeArea(),
        counts: {
          workItems: { total: 3, open: 1 },
          householdItems: { total: 0, open: 0 },
          photos: { total: 2, latestDate: '2026-03-01' },
        },
      };
      const body: AreaListWithCountsResponse = { areas: [area] };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => body,
      } as Response);

      const result = await fetchAreasWithCounts();

      expect(mockFetch).toHaveBeenCalledWith('/api/areas?include=counts', expect.any(Object));
      expect(result).toEqual([area]);
    });

    it('throws when the request fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'x' } }),
      } as Response);

      await expect(fetchAreasWithCounts()).rejects.toThrow();
    });
  });

  describe('reorderAreas', () => {
    it('sends PATCH /api/areas/reorder with the parent and the ids and returns the areas', async () => {
      const reordered = [makeArea({ id: 'b', sortOrder: 0 }), makeArea({ id: 'a', sortOrder: 1 })];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ areas: reordered }),
      } as Response);

      const result = await reorderAreas({ parentId: 'p1', ids: ['b', 'a'] });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/areas/reorder',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ parentId: 'p1', ids: ['b', 'a'] }),
        }),
      );
      expect(result).toEqual(reordered);
    });

    it('sends a null parent for the top level', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ areas: [] }),
      } as Response);

      await reorderAreas({ parentId: null, ids: ['a'] });

      const init = mockFetch.mock.calls[0]![1] as RequestInit;
      expect(JSON.parse(init.body as string)).toEqual({ parentId: null, ids: ['a'] });
    });

    it('rejects with the ApiClientError of a stale set (409)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ error: { code: 'REORDER_SET_MISMATCH', message: 'stale' } }),
      } as Response);

      await expect(reorderAreas({ parentId: null, ids: ['a'] })).rejects.toMatchObject({
        statusCode: 409,
        error: { code: 'REORDER_SET_MISMATCH' },
      });
    });
  });
});

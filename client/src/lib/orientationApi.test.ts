import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  fetchOrientations,
  fetchOrientation,
  createOrientation,
  updateOrientation,
  deleteOrientation,
} from './orientationApi.js';
import type { OrientationListResponse, OrientationSingleResponse, OrientationResponse } from '@cornerstone/shared';

const makeOrientation = (overrides?: Partial<OrientationResponse>): OrientationResponse => ({
  id: 'orient-1',
  name: 'South',
  description: 'Street-facing',
  sortOrder: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('orientationApi', () => {
  let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

  beforeEach(() => {
    mockFetch = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('fetchOrientations', () => {
    it('sends GET request to /api/orientations without query params when no params provided', async () => {
      const mockResponse: OrientationListResponse = { orientations: [] };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await fetchOrientations();

      expect(mockFetch).toHaveBeenCalledWith('/api/orientations', expect.any(Object));
    });

    it('includes search query param when provided', async () => {
      const mockResponse: OrientationListResponse = { orientations: [] };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await fetchOrientations({ search: 'north' });

      expect(mockFetch).toHaveBeenCalledWith('/api/orientations?search=north', expect.any(Object));
    });

    it('omits search param when search is empty string', async () => {
      const mockResponse: OrientationListResponse = { orientations: [] };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await fetchOrientations({ search: '' });

      expect(mockFetch).toHaveBeenCalledWith('/api/orientations', expect.any(Object));
    });

    it('returns the OrientationListResponse from the response', async () => {
      const orientation = makeOrientation();
      const mockResponse: OrientationListResponse = { orientations: [orientation] };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await fetchOrientations();

      expect(result.orientations).toHaveLength(1);
      expect(result.orientations[0]!.id).toBe('orient-1');
      expect(result.orientations[0]!.name).toBe('South');
    });
  });

  describe('fetchOrientation', () => {
    it('sends GET request to /api/orientations/:id and returns r.orientation', async () => {
      const orientation = makeOrientation({ id: 'id-1' });
      const mockResponse: OrientationSingleResponse = { orientation };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await fetchOrientation('id-1');

      expect(mockFetch).toHaveBeenCalledWith('/api/orientations/id-1', expect.any(Object));
      expect(result).toEqual(orientation);
    });
  });

  describe('createOrientation', () => {
    it('sends POST request to /api/orientations and returns r.orientation', async () => {
      const orientation = makeOrientation({ name: 'South' });
      const mockResponse: OrientationSingleResponse = { orientation };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => mockResponse,
      } as Response);

      const requestData = { name: 'South' };
      const result = await createOrientation(requestData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/orientations',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(requestData),
        }),
      );
      expect(result).toEqual(orientation);
    });
  });

  describe('updateOrientation', () => {
    it('sends PATCH request to /api/orientations/:id and returns r.orientation', async () => {
      const orientation = makeOrientation({ id: 'id-1', name: 'North' });
      const mockResponse: OrientationSingleResponse = { orientation };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const updateData = { name: 'North' };
      const result = await updateOrientation('id-1', updateData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/orientations/id-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(updateData),
        }),
      );
      expect(result).toEqual(orientation);
    });
  });

  describe('deleteOrientation', () => {
    it('sends DELETE request to /api/orientations/:id', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      } as Response);

      await deleteOrientation('id-1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/orientations/id-1',
        expect.objectContaining({
          method: 'DELETE',
        }),
      );
    });
  });
});

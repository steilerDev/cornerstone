import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  fetchHouseholdItemCategories,
  createHouseholdItemCategory,
  updateHouseholdItemCategory,
  deleteHouseholdItemCategory,
} from './householdItemCategoriesApi.js';
import type { HouseholdItemCategoryEntity } from '@cornerstone/shared';

describe('householdItemCategoriesApi', () => {
  let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

  beforeEach(() => {
    mockFetch = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─── fetchHouseholdItemCategories ─────────────────────────────────────────

  describe('fetchHouseholdItemCategories', () => {
    it('sends GET request to /api/household-item-categories', async () => {
      const mockResponse = { categories: [] };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await fetchHouseholdItemCategories();

      expect(mockFetch).toHaveBeenCalledWith('/api/household-item-categories', expect.any(Object));
    });

    it('returns parsed response with empty categories array', async () => {
      const mockResponse = { categories: [] };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await fetchHouseholdItemCategories();

      expect(result).toEqual(mockResponse);
      expect(result.categories).toEqual([]);
    });

    it('returns parsed response with categories list', async () => {
      const categories: HouseholdItemCategoryEntity[] = [
        {
          id: 'hic-furniture',
          name: 'Furniture',
          color: '#8B5CF6',
          translationKey: null,
          sortOrder: 0,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'hic-appliances',
          name: 'Appliances',
          color: '#3B82F6',
          translationKey: null,
          sortOrder: 1,
          createdAt: '2026-01-02T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
      ];
      const mockResponse = { categories };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await fetchHouseholdItemCategories();

      expect(result.categories).toHaveLength(2);
      expect(result.categories[0].name).toBe('Furniture');
      expect(result.categories[1].name).toBe('Appliances');
    });

    it('throws ApiClientError when server returns error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }),
      } as Response);

      await expect(fetchHouseholdItemCategories()).rejects.toThrow();
    });
  });

  // ─── createHouseholdItemCategory ──────────────────────────────────────────

  describe('createHouseholdItemCategory', () => {
    it('sends POST request to /api/household-item-categories with body', async () => {
      const mockResponse: HouseholdItemCategoryEntity = {
        id: 'hic-new',
        name: 'Custom Category',
        color: null,
        translationKey: null,
        sortOrder: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => mockResponse,
      } as Response);

      const requestData = { name: 'Custom Category' };
      await createHouseholdItemCategory(requestData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/household-item-categories',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(requestData),
        }),
      );
    });

    it('returns the created household item category', async () => {
      const mockResponse: HouseholdItemCategoryEntity = {
        id: 'hic-new',
        name: 'Garden',
        color: '#22C55E',
        translationKey: null,
        sortOrder: 5,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => mockResponse,
      } as Response);

      const result = await createHouseholdItemCategory({
        name: 'Garden',
        color: '#22C55E',
        sortOrder: 5,
      });

      expect(result).toEqual(mockResponse);
      expect(result.id).toBe('hic-new');
      expect(result.name).toBe('Garden');
    });

    it('sends all optional fields when provided', async () => {
      const mockResponse: HouseholdItemCategoryEntity = {
        id: 'hic-full',
        name: 'Pool',
        color: '#06B6D4',
        translationKey: null,
        sortOrder: 3,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => mockResponse,
      } as Response);

      const requestData = { name: 'Pool', color: '#06B6D4', sortOrder: 3 };
      await createHouseholdItemCategory(requestData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/household-item-categories',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(requestData),
        }),
      );
    });

    it('throws ApiClientError for 409 CONFLICT (duplicate name)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          error: {
            code: 'CONFLICT',
            message: 'A household item category with this name already exists',
          },
        }),
      } as Response);

      await expect(createHouseholdItemCategory({ name: 'Furniture' })).rejects.toThrow();
    });

    it('throws ApiClientError for 400 VALIDATION_ERROR', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: { code: 'VALIDATION_ERROR', message: 'name is required' },
        }),
      } as Response);

      await expect(createHouseholdItemCategory({ name: '' })).rejects.toThrow();
    });
  });

  // ─── updateHouseholdItemCategory ──────────────────────────────────────────

  describe('updateHouseholdItemCategory', () => {
    it('sends PATCH request to /api/household-item-categories/:id with body', async () => {
      const mockResponse: HouseholdItemCategoryEntity = {
        id: 'hic-1',
        name: 'Updated Furniture',
        color: '#FF0000',
        translationKey: null,
        sortOrder: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const updateData = { name: 'Updated Furniture' };
      await updateHouseholdItemCategory('hic-1', updateData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/household-item-categories/hic-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(updateData),
        }),
      );
    });

    it('returns the updated household item category', async () => {
      const mockResponse: HouseholdItemCategoryEntity = {
        id: 'hic-1',
        name: 'New Name',
        color: '#00FF00',
        translationKey: null,
        sortOrder: 10,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await updateHouseholdItemCategory('hic-1', {
        name: 'New Name',
        color: '#00FF00',
        sortOrder: 10,
      });

      expect(result).toEqual(mockResponse);
      expect(result.name).toBe('New Name');
    });

    it('handles partial update (only color)', async () => {
      const mockResponse: HouseholdItemCategoryEntity = {
        id: 'hic-1',
        name: 'Furniture',
        color: '#AABBCC',
        translationKey: null,
        sortOrder: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const updateData = { color: '#AABBCC' };
      await updateHouseholdItemCategory('hic-1', updateData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/household-item-categories/hic-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(updateData),
        }),
      );
    });

    it('throws ApiClientError for 404 NOT_FOUND', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: { code: 'NOT_FOUND', message: 'Household item category not found' },
        }),
      } as Response);

      await expect(
        updateHouseholdItemCategory('nonexistent', { name: 'Updated' }),
      ).rejects.toThrow();
    });

    it('throws ApiClientError for 409 CONFLICT on name update', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          error: {
            code: 'CONFLICT',
            message: 'A household item category with this name already exists',
          },
        }),
      } as Response);

      await expect(
        updateHouseholdItemCategory('hic-1', { name: 'Existing Name' }),
      ).rejects.toThrow();
    });
  });

  // ─── deleteHouseholdItemCategory ──────────────────────────────────────────

  describe('deleteHouseholdItemCategory', () => {
    it('sends DELETE request to /api/household-item-categories/:id', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      } as Response);

      await deleteHouseholdItemCategory('hic-1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/household-item-categories/hic-1',
        expect.objectContaining({
          method: 'DELETE',
        }),
      );
    });

    it('returns void on successful deletion', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      } as Response);

      const result = await deleteHouseholdItemCategory('hic-1');

      expect(result).toBeUndefined();
    });

    it('throws ApiClientError for 404 NOT_FOUND', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: { code: 'NOT_FOUND', message: 'Household item category not found' },
        }),
      } as Response);

      await expect(deleteHouseholdItemCategory('nonexistent')).rejects.toThrow();
    });

    it('throws ApiClientError for 409 CATEGORY_IN_USE', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          error: {
            code: 'CATEGORY_IN_USE',
            message: 'Household item category is in use and cannot be deleted',
            details: { householdItemCount: 3 },
          },
        }),
      } as Response);

      await expect(deleteHouseholdItemCategory('hic-in-use')).rejects.toThrow();
    });
  });
});

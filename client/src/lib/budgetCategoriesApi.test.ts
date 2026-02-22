import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  fetchBudgetCategories,
  createBudgetCategory,
  updateBudgetCategory,
  deleteBudgetCategory,
} from './budgetCategoriesApi.js';
import type { BudgetCategory, BudgetCategoryListResponse } from '@cornerstone/shared';

describe('budgetCategoriesApi', () => {
  let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

  beforeEach(() => {
    mockFetch = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─── fetchBudgetCategories ─────────────────────────────────────────────────

  describe('fetchBudgetCategories', () => {
    it('sends GET request to /api/budget-categories', async () => {
      const mockResponse: BudgetCategoryListResponse = {
        categories: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await fetchBudgetCategories();

      expect(mockFetch).toHaveBeenCalledWith('/api/budget-categories', expect.any(Object));
    });

    it('returns parsed response with empty categories array', async () => {
      const mockResponse: BudgetCategoryListResponse = {
        categories: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await fetchBudgetCategories();

      expect(result).toEqual(mockResponse);
      expect(result.categories).toEqual([]);
    });

    it('returns parsed response with categories list', async () => {
      const mockResponse: BudgetCategoryListResponse = {
        categories: [
          {
            id: 'cat-1',
            name: 'Materials',
            description: 'Building materials',
            color: '#FF5733',
            sortOrder: 1,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
          {
            id: 'cat-2',
            name: 'Labor',
            description: null,
            color: '#3B82F6',
            sortOrder: 2,
            createdAt: '2026-01-02T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await fetchBudgetCategories();

      expect(result.categories).toHaveLength(2);
      expect(result.categories[0].name).toBe('Materials');
      expect(result.categories[1].name).toBe('Labor');
    });

    it('throws ApiClientError when server returns error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }),
      } as Response);

      await expect(fetchBudgetCategories()).rejects.toThrow();
    });
  });

  // ─── createBudgetCategory ──────────────────────────────────────────────────

  describe('createBudgetCategory', () => {
    it('sends POST request to /api/budget-categories with body', async () => {
      const mockResponse: BudgetCategory = {
        id: 'cat-new',
        name: 'Materials',
        description: null,
        color: null,
        sortOrder: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => mockResponse,
      } as Response);

      const requestData = { name: 'Materials' };
      await createBudgetCategory(requestData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget-categories',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(requestData),
        }),
      );
    });

    it('returns the created budget category', async () => {
      const mockResponse: BudgetCategory = {
        id: 'cat-new',
        name: 'Labor',
        description: 'Construction labor',
        color: '#3B82F6',
        sortOrder: 5,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => mockResponse,
      } as Response);

      const result = await createBudgetCategory({
        name: 'Labor',
        description: 'Construction labor',
        color: '#3B82F6',
        sortOrder: 5,
      });

      expect(result).toEqual(mockResponse);
      expect(result.id).toBe('cat-new');
      expect(result.name).toBe('Labor');
    });

    it('sends all optional fields when provided', async () => {
      const mockResponse: BudgetCategory = {
        id: 'cat-full',
        name: 'Permits',
        description: 'Permit costs',
        color: '#10B981',
        sortOrder: 3,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => mockResponse,
      } as Response);

      const requestData = {
        name: 'Permits',
        description: 'Permit costs',
        color: '#10B981',
        sortOrder: 3,
      };

      await createBudgetCategory(requestData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget-categories',
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
            message: 'A budget category with this name already exists',
          },
        }),
      } as Response);

      await expect(createBudgetCategory({ name: 'Materials' })).rejects.toThrow();
    });

    it('throws ApiClientError for 400 VALIDATION_ERROR', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: { code: 'VALIDATION_ERROR', message: 'name is required' },
        }),
      } as Response);

      await expect(createBudgetCategory({ name: '' })).rejects.toThrow();
    });
  });

  // ─── updateBudgetCategory ──────────────────────────────────────────────────

  describe('updateBudgetCategory', () => {
    it('sends PATCH request to /api/budget-categories/:id with body', async () => {
      const mockResponse: BudgetCategory = {
        id: 'cat-1',
        name: 'Updated Materials',
        description: null,
        color: '#FF0000',
        sortOrder: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const updateData = { name: 'Updated Materials' };
      await updateBudgetCategory('cat-1', updateData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget-categories/cat-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(updateData),
        }),
      );
    });

    it('returns the updated budget category', async () => {
      const mockResponse: BudgetCategory = {
        id: 'cat-1',
        name: 'New Name',
        description: 'New description',
        color: '#00FF00',
        sortOrder: 10,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await updateBudgetCategory('cat-1', {
        name: 'New Name',
        description: 'New description',
        color: '#00FF00',
        sortOrder: 10,
      });

      expect(result).toEqual(mockResponse);
      expect(result.name).toBe('New Name');
    });

    it('handles partial update (only color)', async () => {
      const mockResponse: BudgetCategory = {
        id: 'cat-1',
        name: 'Materials',
        description: null,
        color: '#AABBCC',
        sortOrder: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const updateData = { color: '#AABBCC' };
      await updateBudgetCategory('cat-1', updateData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget-categories/cat-1',
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
          error: { code: 'NOT_FOUND', message: 'Budget category not found' },
        }),
      } as Response);

      await expect(updateBudgetCategory('nonexistent', { name: 'Updated' })).rejects.toThrow();
    });

    it('throws ApiClientError for 409 CONFLICT on name update', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          error: {
            code: 'CONFLICT',
            message: 'A budget category with this name already exists',
          },
        }),
      } as Response);

      await expect(updateBudgetCategory('cat-1', { name: 'Existing Name' })).rejects.toThrow();
    });
  });

  // ─── deleteBudgetCategory ──────────────────────────────────────────────────

  describe('deleteBudgetCategory', () => {
    it('sends DELETE request to /api/budget-categories/:id', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        // 204 returns undefined via the apiClient's special-case handling
      } as Response);

      await deleteBudgetCategory('cat-1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget-categories/cat-1',
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

      const result = await deleteBudgetCategory('cat-1');

      expect(result).toBeUndefined();
    });

    it('throws ApiClientError for 404 NOT_FOUND', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: { code: 'NOT_FOUND', message: 'Budget category not found' },
        }),
      } as Response);

      await expect(deleteBudgetCategory('nonexistent')).rejects.toThrow();
    });

    it('throws ApiClientError for 409 CATEGORY_IN_USE', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          error: {
            code: 'CATEGORY_IN_USE',
            message: 'Budget category is in use and cannot be deleted',
            details: { subsidyProgramCount: 1, workItemCount: 0 },
          },
        }),
      } as Response);

      await expect(deleteBudgetCategory('cat-in-use')).rejects.toThrow();
    });
  });
});

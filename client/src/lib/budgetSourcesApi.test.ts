import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  fetchBudgetSources,
  fetchBudgetSource,
  createBudgetSource,
  updateBudgetSource,
  deleteBudgetSource,
} from './budgetSourcesApi.js';
import type {
  BudgetSource,
  BudgetSourceListResponse,
  BudgetSourceResponse,
} from '@cornerstone/shared';

describe('budgetSourcesApi', () => {
  let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

  const sampleSource: BudgetSource = {
    id: 'src-1',
    name: 'Home Loan',
    sourceType: 'bank_loan',
    totalAmount: 200000,
    usedAmount: 0,
    availableAmount: 200000,
    claimedAmount: 0,
    actualAvailableAmount: 200000,
    interestRate: 3.5,
    terms: '30-year fixed',
    notes: 'Primary financing',
    status: 'active',
    createdBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    mockFetch = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─── fetchBudgetSources ────────────────────────────────────────────────────

  describe('fetchBudgetSources', () => {
    it('sends GET request to /api/budget-sources', async () => {
      const mockResponse: BudgetSourceListResponse = { budgetSources: [] };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await fetchBudgetSources();

      expect(mockFetch).toHaveBeenCalledWith('/api/budget-sources', expect.any(Object));
    });

    it('returns parsed response with empty budgetSources array', async () => {
      const mockResponse: BudgetSourceListResponse = { budgetSources: [] };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await fetchBudgetSources();

      expect(result).toEqual(mockResponse);
      expect(result.budgetSources).toEqual([]);
    });

    it('returns parsed response with sources list', async () => {
      const mockResponse: BudgetSourceListResponse = {
        budgetSources: [
          sampleSource,
          {
            id: 'src-2',
            name: 'Savings',
            sourceType: 'savings',
            totalAmount: 50000,
            usedAmount: 0,
            availableAmount: 50000,
            claimedAmount: 0,
            actualAvailableAmount: 50000,
            interestRate: null,
            terms: null,
            notes: null,
            status: 'active',
            createdBy: null,
            createdAt: '2026-01-02T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await fetchBudgetSources();

      expect(result.budgetSources).toHaveLength(2);
      expect(result.budgetSources[0].name).toBe('Home Loan');
      expect(result.budgetSources[1].name).toBe('Savings');
    });

    it('throws ApiClientError when server returns error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }),
      } as Response);

      await expect(fetchBudgetSources()).rejects.toThrow();
    });
  });

  // ─── fetchBudgetSource ─────────────────────────────────────────────────────

  describe('fetchBudgetSource', () => {
    it('sends GET request to /api/budget-sources/:id', async () => {
      const mockResponse: BudgetSourceResponse = { budgetSource: sampleSource };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await fetchBudgetSource('src-1');

      expect(mockFetch).toHaveBeenCalledWith('/api/budget-sources/src-1', expect.any(Object));
    });

    it('returns the budget source response', async () => {
      const mockResponse: BudgetSourceResponse = { budgetSource: sampleSource };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await fetchBudgetSource('src-1');

      expect(result).toEqual(mockResponse);
      expect(result.budgetSource.name).toBe('Home Loan');
    });

    it('includes correct ID in request path', async () => {
      const mockResponse: BudgetSourceResponse = {
        budgetSource: { ...sampleSource, id: 'special-id-999' },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await fetchBudgetSource('special-id-999');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget-sources/special-id-999',
        expect.any(Object),
      );
    });

    it('throws ApiClientError for 404 NOT_FOUND', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: { code: 'NOT_FOUND', message: 'Budget source not found' },
        }),
      } as Response);

      await expect(fetchBudgetSource('nonexistent')).rejects.toThrow();
    });
  });

  // ─── createBudgetSource ────────────────────────────────────────────────────

  describe('createBudgetSource', () => {
    it('sends POST request to /api/budget-sources with body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ budgetSource: sampleSource }),
      } as Response);

      const requestData = {
        name: 'Home Loan',
        sourceType: 'bank_loan' as const,
        totalAmount: 200000,
      };
      await createBudgetSource(requestData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget-sources',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(requestData),
        }),
      );
    });

    it('returns the created budget source', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ budgetSource: sampleSource }),
      } as Response);

      const result = await createBudgetSource({
        name: 'Home Loan',
        sourceType: 'bank_loan',
        totalAmount: 200000,
        interestRate: 3.5,
        terms: '30-year fixed',
        notes: 'Primary financing',
        status: 'active',
      });

      expect(result).toEqual(sampleSource);
      expect(result.id).toBe('src-1');
      expect(result.name).toBe('Home Loan');
    });

    it('sends all optional fields when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ budgetSource: sampleSource }),
      } as Response);

      const requestData = {
        name: 'Credit Line',
        sourceType: 'credit_line' as const,
        totalAmount: 50000,
        interestRate: 5.0,
        terms: '5-year revolving',
        notes: 'From Bank XYZ',
        status: 'active' as const,
      };

      await createBudgetSource(requestData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget-sources',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(requestData),
        }),
      );
    });

    it('throws ApiClientError for 400 VALIDATION_ERROR', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: { code: 'VALIDATION_ERROR', message: 'name is required' },
        }),
      } as Response);

      await expect(
        createBudgetSource({ name: '', sourceType: 'bank_loan', totalAmount: 1000 }),
      ).rejects.toThrow();
    });

    it('throws ApiClientError for 401 UNAUTHORIZED', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
        }),
      } as Response);

      await expect(
        createBudgetSource({ name: 'Test', sourceType: 'savings', totalAmount: 1000 }),
      ).rejects.toThrow();
    });
  });

  // ─── updateBudgetSource ────────────────────────────────────────────────────

  describe('updateBudgetSource', () => {
    it('sends PATCH request to /api/budget-sources/:id with body', async () => {
      const updatedSource: BudgetSource = { ...sampleSource, name: 'Updated Loan' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ budgetSource: updatedSource }),
      } as Response);

      const updateData = { name: 'Updated Loan' };
      await updateBudgetSource('src-1', updateData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget-sources/src-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(updateData),
        }),
      );
    });

    it('returns the updated budget source', async () => {
      const updatedSource: BudgetSource = {
        ...sampleSource,
        name: 'New Name',
        interestRate: 4.5,
        status: 'exhausted',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ budgetSource: updatedSource }),
      } as Response);

      const result = await updateBudgetSource('src-1', {
        name: 'New Name',
        interestRate: 4.5,
        status: 'exhausted',
      });

      expect(result).toEqual(updatedSource);
      expect(result.name).toBe('New Name');
      expect(result.interestRate).toBe(4.5);
    });

    it('handles partial update (only status)', async () => {
      const updatedSource: BudgetSource = { ...sampleSource, status: 'closed' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ budgetSource: updatedSource }),
      } as Response);

      const updateData = { status: 'closed' as const };
      await updateBudgetSource('src-1', updateData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget-sources/src-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(updateData),
        }),
      );
    });

    it('handles setting interestRate to null', async () => {
      const updatedSource: BudgetSource = { ...sampleSource, interestRate: null };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ budgetSource: updatedSource }),
      } as Response);

      const updateData = { interestRate: null };
      await updateBudgetSource('src-1', updateData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget-sources/src-1',
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
          error: { code: 'NOT_FOUND', message: 'Budget source not found' },
        }),
      } as Response);

      await expect(updateBudgetSource('nonexistent', { name: 'Updated' })).rejects.toThrow();
    });

    it('throws ApiClientError for 400 VALIDATION_ERROR', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: { code: 'VALIDATION_ERROR', message: 'Total amount must be positive' },
        }),
      } as Response);

      await expect(updateBudgetSource('src-1', { totalAmount: -100 })).rejects.toThrow();
    });

    it('includes correct ID in request path', async () => {
      const updatedSource: BudgetSource = { ...sampleSource, id: 'custom-id' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ budgetSource: updatedSource }),
      } as Response);

      await updateBudgetSource('custom-id', { name: 'Updated' });

      expect(mockFetch).toHaveBeenCalledWith('/api/budget-sources/custom-id', expect.any(Object));
    });
  });

  // ─── deleteBudgetSource ────────────────────────────────────────────────────

  describe('deleteBudgetSource', () => {
    it('sends DELETE request to /api/budget-sources/:id', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      } as Response);

      await deleteBudgetSource('src-1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget-sources/src-1',
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

      const result = await deleteBudgetSource('src-1');

      expect(result).toBeUndefined();
    });

    it('includes correct ID in request path', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      } as Response);

      await deleteBudgetSource('specific-id-456');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget-sources/specific-id-456',
        expect.any(Object),
      );
    });

    it('throws ApiClientError for 404 NOT_FOUND', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: { code: 'NOT_FOUND', message: 'Budget source not found' },
        }),
      } as Response);

      await expect(deleteBudgetSource('nonexistent')).rejects.toThrow();
    });

    it('throws ApiClientError for 409 BUDGET_SOURCE_IN_USE', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          error: {
            code: 'BUDGET_SOURCE_IN_USE',
            message: 'Budget source is in use and cannot be deleted',
            details: { workItemCount: 3 },
          },
        }),
      } as Response);

      await expect(deleteBudgetSource('src-in-use')).rejects.toThrow();
    });

    it('throws ApiClientError for 401 UNAUTHORIZED', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
        }),
      } as Response);

      await expect(deleteBudgetSource('src-1')).rejects.toThrow();
    });
  });
});

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { fetchBudgetOverview } from './budgetOverviewApi.js';
import type { BudgetOverview, BudgetOverviewResponse } from '@cornerstone/shared';

describe('budgetOverviewApi', () => {
  let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

  const sampleOverview: BudgetOverview = {
    totalPlannedBudget: 100000,
    totalActualCost: 80000,
    totalVariance: 20000,
    categorySummaries: [
      {
        categoryId: 'cat-1',
        categoryName: 'Materials',
        categoryColor: '#FF5733',
        plannedBudget: 50000,
        actualCost: 45000,
        variance: 5000,
        workItemCount: 3,
      },
      {
        categoryId: 'cat-2',
        categoryName: 'Labor',
        categoryColor: null,
        plannedBudget: 50000,
        actualCost: 35000,
        variance: 15000,
        workItemCount: 2,
      },
    ],
    financingSummary: {
      totalAvailable: 200000,
      totalUsed: 80000,
      totalRemaining: 120000,
      sourceCount: 2,
    },
    vendorSummary: {
      totalPaid: 75000,
      totalOutstanding: 5000,
      vendorCount: 3,
    },
    subsidySummary: {
      totalReductions: 10000,
      activeSubsidyCount: 2,
    },
  };

  beforeEach(() => {
    mockFetch = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─── fetchBudgetOverview ───────────────────────────────────────────────────

  describe('fetchBudgetOverview', () => {
    it('sends GET request to /api/budget/overview', async () => {
      const mockResponse: BudgetOverviewResponse = { overview: sampleOverview };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await fetchBudgetOverview();

      expect(mockFetch).toHaveBeenCalledWith('/api/budget/overview', expect.any(Object));
    });

    it('returns the overview object from the response', async () => {
      const mockResponse: BudgetOverviewResponse = { overview: sampleOverview };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await fetchBudgetOverview();

      expect(result).toEqual(sampleOverview);
    });

    it('returns overview with all top-level numeric fields', async () => {
      const mockResponse: BudgetOverviewResponse = { overview: sampleOverview };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await fetchBudgetOverview();

      expect(result.totalPlannedBudget).toBe(100000);
      expect(result.totalActualCost).toBe(80000);
      expect(result.totalVariance).toBe(20000);
    });

    it('returns overview with categorySummaries array', async () => {
      const mockResponse: BudgetOverviewResponse = { overview: sampleOverview };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await fetchBudgetOverview();

      expect(result.categorySummaries).toHaveLength(2);
      expect(result.categorySummaries[0].categoryName).toBe('Materials');
      expect(result.categorySummaries[1].categoryName).toBe('Labor');
    });

    it('returns overview with financingSummary fields', async () => {
      const mockResponse: BudgetOverviewResponse = { overview: sampleOverview };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await fetchBudgetOverview();

      expect(result.financingSummary.totalAvailable).toBe(200000);
      expect(result.financingSummary.totalUsed).toBe(80000);
      expect(result.financingSummary.totalRemaining).toBe(120000);
      expect(result.financingSummary.sourceCount).toBe(2);
    });

    it('returns overview with vendorSummary fields', async () => {
      const mockResponse: BudgetOverviewResponse = { overview: sampleOverview };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await fetchBudgetOverview();

      expect(result.vendorSummary.totalPaid).toBe(75000);
      expect(result.vendorSummary.totalOutstanding).toBe(5000);
      expect(result.vendorSummary.vendorCount).toBe(3);
    });

    it('returns overview with subsidySummary fields', async () => {
      const mockResponse: BudgetOverviewResponse = { overview: sampleOverview };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await fetchBudgetOverview();

      expect(result.subsidySummary.totalReductions).toBe(10000);
      expect(result.subsidySummary.activeSubsidyCount).toBe(2);
    });

    it('handles an overview with empty categorySummaries array', async () => {
      const emptyOverview: BudgetOverview = {
        ...sampleOverview,
        categorySummaries: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ overview: emptyOverview }),
      } as Response);

      const result = await fetchBudgetOverview();

      expect(result.categorySummaries).toEqual([]);
    });

    it('handles an all-zero overview (empty project)', async () => {
      const zeroOverview: BudgetOverview = {
        totalPlannedBudget: 0,
        totalActualCost: 0,
        totalVariance: 0,
        categorySummaries: [],
        financingSummary: {
          totalAvailable: 0,
          totalUsed: 0,
          totalRemaining: 0,
          sourceCount: 0,
        },
        vendorSummary: {
          totalPaid: 0,
          totalOutstanding: 0,
          vendorCount: 0,
        },
        subsidySummary: {
          totalReductions: 0,
          activeSubsidyCount: 0,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ overview: zeroOverview }),
      } as Response);

      const result = await fetchBudgetOverview();

      expect(result.totalPlannedBudget).toBe(0);
      expect(result.financingSummary.sourceCount).toBe(0);
    });

    it('throws ApiClientError when server returns 401', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }),
      } as Response);

      await expect(fetchBudgetOverview()).rejects.toThrow();
    });

    it('throws ApiClientError when server returns 500', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({
          error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal Server Error' },
        }),
      } as Response);

      await expect(fetchBudgetOverview()).rejects.toThrow();
    });
  });
});

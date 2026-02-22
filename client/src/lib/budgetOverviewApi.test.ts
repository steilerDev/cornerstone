import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { fetchBudgetOverview } from './budgetOverviewApi.js';
import type { BudgetOverview, BudgetOverviewResponse } from '@cornerstone/shared';

describe('budgetOverviewApi', () => {
  let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

  const sampleOverview: BudgetOverview = {
    availableFunds: 200000,
    sourceCount: 2,
    minPlanned: 90000,
    maxPlanned: 110000,
    projectedMin: 95000,
    projectedMax: 105000,
    actualCost: 80000,
    actualCostPaid: 75000,
    remainingVsMinPlanned: 110000,
    remainingVsMaxPlanned: 90000,
    remainingVsProjectedMin: 105000,
    remainingVsProjectedMax: 95000,
    remainingVsActualCost: 120000,
    remainingVsActualPaid: 125000,
    categorySummaries: [
      {
        categoryId: 'cat-1',
        categoryName: 'Materials',
        categoryColor: '#FF5733',
        minPlanned: 45000,
        maxPlanned: 55000,
        projectedMin: 47000,
        projectedMax: 53000,
        actualCost: 45000,
        actualCostPaid: 45000,
        budgetLineCount: 3,
      },
      {
        categoryId: 'cat-2',
        categoryName: 'Labor',
        categoryColor: null,
        minPlanned: 45000,
        maxPlanned: 55000,
        projectedMin: 48000,
        projectedMax: 52000,
        actualCost: 35000,
        actualCostPaid: 30000,
        budgetLineCount: 2,
      },
    ],
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

    it('returns overview with all top-level numeric fields (Story 5.11 shape)', async () => {
      const mockResponse: BudgetOverviewResponse = { overview: sampleOverview };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await fetchBudgetOverview();

      expect(result.availableFunds).toBe(200000);
      expect(result.sourceCount).toBe(2);
      expect(result.minPlanned).toBe(90000);
      expect(result.maxPlanned).toBe(110000);
      expect(result.actualCost).toBe(80000);
      expect(result.actualCostPaid).toBe(75000);
    });

    it('returns overview with four remaining perspectives', async () => {
      const mockResponse: BudgetOverviewResponse = { overview: sampleOverview };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await fetchBudgetOverview();

      expect(result.remainingVsMinPlanned).toBe(110000);
      expect(result.remainingVsMaxPlanned).toBe(90000);
      expect(result.remainingVsActualCost).toBe(120000);
      expect(result.remainingVsActualPaid).toBe(125000);
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
        availableFunds: 0,
        sourceCount: 0,
        minPlanned: 0,
        maxPlanned: 0,
        projectedMin: 0,
        projectedMax: 0,
        actualCost: 0,
        actualCostPaid: 0,
        remainingVsMinPlanned: 0,
        remainingVsMaxPlanned: 0,
        remainingVsProjectedMin: 0,
        remainingVsProjectedMax: 0,
        remainingVsActualCost: 0,
        remainingVsActualPaid: 0,
        categorySummaries: [],
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

      expect(result.minPlanned).toBe(0);
      expect(result.sourceCount).toBe(0);
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

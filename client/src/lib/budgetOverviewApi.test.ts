import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { fetchBudgetOverview, fetchBudgetBreakdown } from './budgetOverviewApi.js';
import type {
  BudgetOverview,
  BudgetOverviewResponse,
  BudgetBreakdownResponse,
} from '@cornerstone/shared';

describe('budgetOverviewApi', () => {
  let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

  const sampleOverview: BudgetOverview = {
    availableFunds: 200000,
    sourceCount: 2,
    minPlanned: 90000,
    maxPlanned: 110000,
    actualCost: 80000,
    actualCostPaid: 75000,
    actualCostClaimed: 50000,
    remainingVsMinPlanned: 110000,
    remainingVsMaxPlanned: 90000,
    remainingVsActualCost: 120000,
    remainingVsActualPaid: 125000,
    remainingVsActualClaimed: 150000,
    remainingVsMinPlannedWithPayback: 110000,
    remainingVsMaxPlannedWithPayback: 90000,
    subsidySummary: {
      totalReductions: 10000,
      activeSubsidyCount: 2,
      minTotalPayback: 0,
      maxTotalPayback: 0,
      oversubscribedSubsidies: [],
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

    it('handles an all-zero overview (empty project)', async () => {
      const zeroOverview: BudgetOverview = {
        availableFunds: 0,
        sourceCount: 0,
        minPlanned: 0,
        maxPlanned: 0,
        actualCost: 0,
        actualCostPaid: 0,
        actualCostClaimed: 0,
        remainingVsMinPlanned: 0,
        remainingVsMaxPlanned: 0,
        remainingVsActualCost: 0,
        remainingVsActualPaid: 0,
        remainingVsActualClaimed: 0,
        remainingVsMinPlannedWithPayback: 0,
        remainingVsMaxPlannedWithPayback: 0,
        subsidySummary: {
          totalReductions: 0,
          activeSubsidyCount: 0,
          minTotalPayback: 0,
          maxTotalPayback: 0,
          oversubscribedSubsidies: [],
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

  // ─── fetchBudgetBreakdown — query param encoding (Scenarios 16–19) ─────────

  describe('fetchBudgetBreakdown', () => {
    const stubBreakdownResponse: BudgetBreakdownResponse = {
      breakdown: {
        workItems: {
          areas: [],
          totals: {
            projectedMin: 0,
            projectedMax: 0,
            actualCost: 0,
            subsidyPayback: 0,
            rawProjectedMin: 0,
            rawProjectedMax: 0,
            minSubsidyPayback: 0,
          },
        },
        householdItems: {
          areas: [],
          totals: {
            projectedMin: 0,
            projectedMax: 0,
            actualCost: 0,
            subsidyPayback: 0,
            rawProjectedMin: 0,
            rawProjectedMax: 0,
            minSubsidyPayback: 0,
          },
        },
        subsidyAdjustments: [],
        budgetSources: [],
      },
    };

    function mockSuccessResponse() {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => stubBreakdownResponse,
      } as Response);
    }

    // Scenario 16: No args → no query string
    it('calls fetch with /api/budget/breakdown (no query string) when called with no args (Scenario 16)', async () => {
      mockSuccessResponse();

      await fetchBudgetBreakdown();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const url = (mockFetch.mock.calls[0] as [string, RequestInit])[0];
      expect(url).toBe('/api/budget/breakdown');
    });

    // Scenario 17: Empty array → no query string
    it('calls fetch with /api/budget/breakdown (no query string) when called with an empty array (Scenario 17)', async () => {
      mockSuccessResponse();

      await fetchBudgetBreakdown([]);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const url = (mockFetch.mock.calls[0] as [string, RequestInit])[0];
      expect(url).toBe('/api/budget/breakdown');
    });

    // Scenario 18: Single source → correct query string
    it('calls fetch with ?deselectedSources=src-a for a single source (Scenario 18)', async () => {
      mockSuccessResponse();

      await fetchBudgetBreakdown(['src-a']);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const url = (mockFetch.mock.calls[0] as [string, RequestInit])[0];
      expect(url).toContain('/api/budget/breakdown?deselectedSources=');
      // Decoded or encoded: src-a has no special chars, so the URL may contain 'src-a' directly
      expect(decodeURIComponent(url)).toContain('src-a');
    });

    // Scenario 19: Multiple sources → comma-separated (URI-encoded) in query string
    it('encodes multiple sources as comma-separated list in ?deselectedSources (Scenario 19)', async () => {
      mockSuccessResponse();

      await fetchBudgetBreakdown(['src-a', 'src-b']);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const url = (mockFetch.mock.calls[0] as [string, RequestInit])[0];
      expect(url).toContain('/api/budget/breakdown?deselectedSources=');
      // The implementation uses encodeURIComponent('src-a,src-b') = 'src-a%2Csrc-b'
      const decodedUrl = decodeURIComponent(url);
      expect(decodedUrl).toContain('src-a');
      expect(decodedUrl).toContain('src-b');
      // Both IDs must be in the same query param value (comma-joined)
      const qsStart = url.indexOf('?deselectedSources=') + '?deselectedSources='.length;
      const rawQsValue = url.slice(qsStart);
      const decodedQsValue = decodeURIComponent(rawQsValue);
      expect(decodedQsValue).toContain('src-a');
      expect(decodedQsValue).toContain('src-b');
    });
  });
});

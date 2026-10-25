import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type {
  BudgetOverview,
  BudgetOverviewResponse,
  BudgetBreakdownResponse,
} from '@cornerstone/shared';
import {
  fetchBudgetOverview,
  fetchBudgetOverviewResponse,
  fetchBudgetBreakdown,
} from './budgetOverviewApi.js';
import { makeBreakdown, makeMoney } from '../test/breakdownFixtures.js';

describe('budgetOverviewApi', () => {
  let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

  /** The trimmed overview (#2237): only the grant-derived summary is left. */
  const sampleOverview: BudgetOverview = {
    subsidySummary: {
      totalReductions: 10000,
      activeSubsidyCount: 2,
      minTotalPayback: 0,
      maxTotalPayback: 0,
      oversubscribedSubsidies: [],
    },
  };

  const respond = (body: unknown) =>
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => body } as Response);

  beforeEach(() => {
    mockFetch = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('fetchBudgetOverview', () => {
    it('sends GET request to /api/budget/overview', async () => {
      respond({ money: makeMoney(), overview: sampleOverview } satisfies BudgetOverviewResponse);

      await fetchBudgetOverview();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith('/api/budget/overview', expect.any(Object));
    });

    it('returns the overview object from the response, which holds only subsidySummary', async () => {
      respond({ money: makeMoney(), overview: sampleOverview } satisfies BudgetOverviewResponse);

      const result = await fetchBudgetOverview();

      expect(result).toEqual(sampleOverview);
      expect(Object.keys(result)).toEqual(['subsidySummary']);
      expect(result.subsidySummary.totalReductions).toBe(10000);
      expect(result.subsidySummary.activeSubsidyCount).toBe(2);
    });

    it('keeps oversubscribed subsidies for the Subsidy programs page', async () => {
      const overview: BudgetOverview = {
        subsidySummary: {
          ...sampleOverview.subsidySummary,
          oversubscribedSubsidies: [
            {
              subsidyProgramId: 'sub-1',
              name: 'Sample grant',
              maximumAmount: 1000,
              maxPayout: 1000,
              uncappedMinPayback: 1200,
              uncappedMaxPayback: 1500,
              minExcess: 200,
              maxExcess: 500,
            },
          ],
        },
      };
      respond({ money: makeMoney(), overview });

      const result = await fetchBudgetOverview();

      expect(result.subsidySummary.oversubscribedSubsidies).toHaveLength(1);
    });

    it('rejects when the server returns 401', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }),
      } as Response);

      await expect(fetchBudgetOverview()).rejects.toThrow();
    });

    it('rejects when the server returns 500', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({
          error: { code: 'INTERNAL_ERROR', message: 'Internal Server Error' },
        }),
      } as Response);

      await expect(fetchBudgetOverview()).rejects.toThrow();
    });
  });

  describe('fetchBudgetOverviewResponse', () => {
    it('returns the full response with the money summary next to the overview', async () => {
      const money = makeMoney({
        leftToSpend: { expected: 1200, best: 1500, worst: 900, verdict: 'on_budget' },
      });
      respond({ money, overview: sampleOverview } satisfies BudgetOverviewResponse);

      const result = await fetchBudgetOverviewResponse();

      expect(mockFetch).toHaveBeenCalledWith('/api/budget/overview', expect.any(Object));
      expect(result.overview).toEqual(sampleOverview);
      expect(result.money.leftToSpend).toEqual({
        expected: 1200,
        best: 1500,
        worst: 900,
        verdict: 'on_budget',
      });
      expect(result.money.sources).toHaveLength(2);
    });

    it('fetchBudgetOverview resolves to just the overview via the same single request', async () => {
      respond({ money: makeMoney(), overview: sampleOverview } satisfies BudgetOverviewResponse);

      expect(await fetchBudgetOverview()).toEqual(sampleOverview);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('fetchBudgetBreakdown', () => {
    const response: BudgetBreakdownResponse = { breakdown: makeBreakdown() };

    const requestedUrl = () => (mockFetch.mock.calls[0] as [string, RequestInit])[0];

    it('returns the breakdown object out of the response', async () => {
      respond(response);

      const result = await fetchBudgetBreakdown();

      expect(result).toEqual(response.breakdown);
      expect(result.lines).toHaveLength(5);
      expect(result.total.expectedCost.expected).toBe(2900);
    });

    it('calls /api/budget/breakdown without a query string when called with no args', async () => {
      respond(response);

      await fetchBudgetBreakdown();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(requestedUrl()).toBe('/api/budget/breakdown');
    });

    it('calls /api/budget/breakdown without a query string for an empty list', async () => {
      respond(response);

      await fetchBudgetBreakdown([]);

      expect(requestedUrl()).toBe('/api/budget/breakdown');
    });

    it('sends ?deselectedSources=bs-a for a single source', async () => {
      respond(response);

      await fetchBudgetBreakdown(['bs-a']);

      expect(requestedUrl()).toBe('/api/budget/breakdown?deselectedSources=bs-a');
    });

    it('sends several sources comma-joined and URI-encoded in one param', async () => {
      respond(response);

      await fetchBudgetBreakdown(['bs-a', 'bs-b', 'unassigned']);

      const url = requestedUrl();
      expect(url).toBe('/api/budget/breakdown?deselectedSources=bs-a%2Cbs-b%2Cunassigned');
      expect(new URL(url, 'http://localhost').searchParams.get('deselectedSources')).toBe(
        'bs-a,bs-b,unassigned',
      );
    });

    it('rejects on a server error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Boom' } }),
      } as Response);

      await expect(fetchBudgetBreakdown()).rejects.toThrow();
    });
  });
});

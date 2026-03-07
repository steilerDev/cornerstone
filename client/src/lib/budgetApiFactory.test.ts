import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createBudgetApi } from './budgetApiFactory.js';
import type { BaseBudgetLine } from '@cornerstone/shared';

// Minimal concrete type for testing: just BaseBudgetLine with no extras
type TestBudgetLine = BaseBudgetLine;

/**
 * Helper to build a minimal TestBudgetLine for response mocks.
 */
const makeLine = (overrides: Partial<TestBudgetLine> = {}): TestBudgetLine => ({
  id: 'bl-1',
  description: null,
  plannedAmount: 1000,
  confidence: 'own_estimate',
  confidenceMargin: 0.2,
  budgetCategory: null,
  budgetSource: null,
  vendor: null,
  actualCost: 0,
  actualCostPaid: 0,
  invoiceCount: 0,
  createdBy: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('createBudgetApi', () => {
  let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

  // Factory under test, using 'work-items' as the entity prefix
  const api = createBudgetApi<TestBudgetLine>('work-items');

  beforeEach(() => {
    mockFetch = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─── fetchBudgets ─────────────────────────────────────────────────────────

  describe('fetchBudgets', () => {
    it('sends GET request to /api/{entityPrefix}/{entityId}/budgets', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ budgets: [] }),
      } as Response);

      await api.fetchBudgets('wi-123');

      expect(mockFetch).toHaveBeenCalledWith('/api/work-items/wi-123/budgets', expect.any(Object));
    });

    it('returns the budgets array from the response', async () => {
      const lines = [makeLine({ id: 'bl-1' }), makeLine({ id: 'bl-2', plannedAmount: 500 })];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ budgets: lines }),
      } as Response);

      const result = await api.fetchBudgets('wi-123');

      expect(result).toEqual(lines);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('bl-1');
      expect(result[1].id).toBe('bl-2');
    });

    it('returns empty array when no budgets exist', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ budgets: [] }),
      } as Response);

      const result = await api.fetchBudgets('wi-999');

      expect(result).toEqual([]);
    });

    it('uses the entityPrefix provided to the factory', async () => {
      const hiApi = createBudgetApi<TestBudgetLine>('household-items');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ budgets: [] }),
      } as Response);

      await hiApi.fetchBudgets('hi-456');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/household-items/hi-456/budgets',
        expect.any(Object),
      );
    });

    it('throws when the server returns a non-OK response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Work item not found' } }),
      } as Response);

      await expect(api.fetchBudgets('nonexistent')).rejects.toThrow();
    });

    it('throws on server error (500)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Server error' } }),
      } as Response);

      await expect(api.fetchBudgets('wi-123')).rejects.toThrow();
    });
  });

  // ─── createBudget ─────────────────────────────────────────────────────────

  describe('createBudget', () => {
    it('sends POST request to /api/{entityPrefix}/{entityId}/budgets', async () => {
      const newLine = makeLine({ id: 'bl-new' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ budget: newLine }),
      } as Response);

      const requestData = { plannedAmount: 1000, confidence: 'own_estimate' as const };
      await api.createBudget('wi-123', requestData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/work-items/wi-123/budgets',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(requestData),
        }),
      );
    });

    it('returns the created budget line from response.budget', async () => {
      const newLine = makeLine({
        id: 'bl-new',
        plannedAmount: 2500,
        confidence: 'professional_estimate',
        confidenceMargin: 0.1,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ budget: newLine }),
      } as Response);

      const result = await api.createBudget('wi-123', {
        plannedAmount: 2500,
        confidence: 'professional_estimate',
      });

      expect(result).toEqual(newLine);
      expect(result.id).toBe('bl-new');
      expect(result.plannedAmount).toBe(2500);
    });

    it('sends all optional fields when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ budget: makeLine() }),
      } as Response);

      const requestData = {
        description: 'Full budget line',
        plannedAmount: 3000,
        confidence: 'quote' as const,
        budgetCategoryId: 'cat-1',
        budgetSourceId: 'src-1',
        vendorId: 'vendor-1',
      };

      await api.createBudget('wi-123', requestData);

      const bodyStr = mockFetch.mock.calls[0][1]?.body as string;
      const body = JSON.parse(bodyStr) as typeof requestData;

      expect(body.description).toBe('Full budget line');
      expect(body.plannedAmount).toBe(3000);
      expect(body.confidence).toBe('quote');
      expect(body.budgetCategoryId).toBe('cat-1');
      expect(body.budgetSourceId).toBe('src-1');
      expect(body.vendorId).toBe('vendor-1');
    });

    it('throws on validation error (400)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: { code: 'VALIDATION_ERROR', message: 'plannedAmount is required' },
        }),
      } as Response);

      await expect(api.createBudget('wi-123', { plannedAmount: -1 })).rejects.toThrow();
    });
  });

  // ─── updateBudget ─────────────────────────────────────────────────────────

  describe('updateBudget', () => {
    it('sends PATCH to /api/{entityPrefix}/{entityId}/budgets/{budgetId}', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ budget: makeLine() }),
      } as Response);

      const updateData = { plannedAmount: 1500 };
      await api.updateBudget('wi-123', 'bl-1', updateData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/work-items/wi-123/budgets/bl-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(updateData),
        }),
      );
    });

    it('returns the updated budget line from response.budget', async () => {
      const updated = makeLine({ id: 'bl-1', plannedAmount: 1500, description: 'Updated' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ budget: updated }),
      } as Response);

      const result = await api.updateBudget('wi-123', 'bl-1', {
        plannedAmount: 1500,
        description: 'Updated',
      });

      expect(result).toEqual(updated);
      expect(result.plannedAmount).toBe(1500);
      expect(result.description).toBe('Updated');
    });

    it('supports partial updates (only confidence)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ budget: makeLine() }),
      } as Response);

      await api.updateBudget('wi-123', 'bl-1', { confidence: 'invoice' });

      const bodyStr = mockFetch.mock.calls[0][1]?.body as string;
      const body = JSON.parse(bodyStr) as Record<string, unknown>;

      expect(body.confidence).toBe('invoice');
      expect(body.plannedAmount).toBeUndefined();
    });

    it('throws on not found (404)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Budget line not found' } }),
      } as Response);

      await expect(api.updateBudget('wi-123', 'nonexistent', { plannedAmount: 100 })).rejects.toThrow();
    });
  });

  // ─── deleteBudget ─────────────────────────────────────────────────────────

  describe('deleteBudget', () => {
    it('sends DELETE to /api/{entityPrefix}/{entityId}/budgets/{budgetId}', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      } as Response);

      await api.deleteBudget('wi-123', 'bl-1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/work-items/wi-123/budgets/bl-1',
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

      const result = await api.deleteBudget('wi-123', 'bl-1');

      expect(result).toBeUndefined();
    });

    it('throws on not found (404)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Budget line not found' } }),
      } as Response);

      await expect(api.deleteBudget('wi-123', 'nonexistent')).rejects.toThrow();
    });

    it('throws on conflict (409)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          error: { code: 'CONFLICT', message: 'Budget line is in use by an invoice' },
        }),
      } as Response);

      await expect(api.deleteBudget('wi-123', 'bl-1')).rejects.toThrow();
    });

    it('throws on server error (500)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Delete failed' } }),
      } as Response);

      await expect(api.deleteBudget('wi-123', 'bl-1')).rejects.toThrow();
    });
  });

  // ─── Factory isolation ────────────────────────────────────────────────────

  describe('factory isolation', () => {
    it('two APIs created with different prefixes target different URLs', async () => {
      const wiApi = createBudgetApi<TestBudgetLine>('work-items');
      const hiApi = createBudgetApi<TestBudgetLine>('household-items');

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ budgets: [] }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ budgets: [] }),
        } as Response);

      await wiApi.fetchBudgets('wi-1');
      await hiApi.fetchBudgets('hi-2');

      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        '/api/work-items/wi-1/budgets',
        expect.any(Object),
      );
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        '/api/household-items/hi-2/budgets',
        expect.any(Object),
      );
    });
  });
});

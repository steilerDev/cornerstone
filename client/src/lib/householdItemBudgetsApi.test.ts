import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  fetchHouseholdItemBudgets,
  createHouseholdItemBudget,
  updateHouseholdItemBudget,
  deleteHouseholdItemBudget,
} from './householdItemBudgetsApi.js';
import type { HouseholdItemBudgetLine } from '@cornerstone/shared';

describe('householdItemBudgetsApi', () => {
  let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

  beforeEach(() => {
    mockFetch = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('fetchHouseholdItemBudgets', () => {
    it('sends GET request to /api/household-items/:householdItemId/budgets', async () => {
      const mockResponse = {
        budgets: [] as HouseholdItemBudgetLine[],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await fetchHouseholdItemBudgets('hi-123');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/household-items/hi-123/budgets',
        expect.any(Object),
      );
    });

    it('returns an array of budget lines', async () => {
      const mockBudget: HouseholdItemBudgetLine = {
        id: 'budget-1',
        householdItemId: 'hi-123',
        description: 'Wood flooring',
        plannedAmount: 1500,
        confidence: 'professional_estimate',
        confidenceMargin: 0.1,
        budgetCategory: null,
        budgetSource: null,
        vendor: null,
        actualCost: 0,
        actualCostPaid: 0,
        invoiceCount: 0,
        invoiceLink: null,
        createdBy: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        quantity: null,
        unit: null,
        unitPrice: null,
        includesVat: null,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ budgets: [mockBudget] }),
      } as Response);

      const result = await fetchHouseholdItemBudgets('hi-123');

      expect(result).toEqual([mockBudget]);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('budget-1');
    });

    it('returns empty array when no budgets exist', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ budgets: [] }),
      } as Response);

      const result = await fetchHouseholdItemBudgets('hi-123');

      expect(result).toEqual([]);
    });

    it('throws error when response is not OK', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Household item not found' } }),
      } as Response);

      await expect(fetchHouseholdItemBudgets('nonexistent')).rejects.toThrow();
    });

    it('throws error when response is 500', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Server error' } }),
      } as Response);

      await expect(fetchHouseholdItemBudgets('hi-123')).rejects.toThrow();
    });
  });

  describe('createHouseholdItemBudget', () => {
    it('sends POST request with correct URL and body', async () => {
      const mockResponse: HouseholdItemBudgetLine = {
        id: 'budget-new',
        householdItemId: 'hi-123',
        description: 'Initial estimate',
        plannedAmount: 500,
        confidence: 'own_estimate',
        confidenceMargin: 0.2,
        budgetCategory: null,
        budgetSource: null,
        vendor: null,
        actualCost: 0,
        actualCostPaid: 0,
        invoiceCount: 0,
        invoiceLink: null,
        createdBy: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        quantity: null,
        unit: null,
        unitPrice: null,
        includesVat: null,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ budget: mockResponse }),
      } as Response);

      const requestData = {
        description: 'Initial estimate',
        plannedAmount: 500,
        confidence: 'own_estimate' as const,
      };

      await createHouseholdItemBudget('hi-123', requestData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/household-items/hi-123/budgets',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(requestData),
        }),
      );
    });

    it('returns created budget line', async () => {
      const mockResponse: HouseholdItemBudgetLine = {
        id: 'budget-new',
        householdItemId: 'hi-123',
        description: 'Carpet',
        plannedAmount: 2000,
        confidence: 'professional_estimate',
        confidenceMargin: 0.1,
        budgetCategory: {
          id: 'cat-1',
          name: 'Materials',
          color: '#3b82f6',
          description: null,
          translationKey: null,
          sortOrder: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        budgetSource: { id: 'src-1', name: 'Savings', sourceType: 'savings' },
        vendor: { id: 'vendor-1', name: 'Home Depot', trade: null },
        actualCost: 0,
        actualCostPaid: 0,
        invoiceCount: 0,
        invoiceLink: null,
        createdBy: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        quantity: null,
        unit: null,
        unitPrice: null,
        includesVat: null,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ budget: mockResponse }),
      } as Response);

      const result = await createHouseholdItemBudget('hi-123', {
        description: 'Carpet',
        plannedAmount: 2000,
        confidence: 'professional_estimate',
        budgetCategoryId: 'cat-1',
        budgetSourceId: 'src-1',
        vendorId: 'vendor-1',
      });

      expect(result).toEqual(mockResponse);
      expect(result.id).toBe('budget-new');
      expect(result.plannedAmount).toBe(2000);
    });

    it('includes all optional fields in request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ budget: {} }),
      } as Response);

      const requestData = {
        description: 'Full budget',
        plannedAmount: 3000,
        confidence: 'quote' as const,
        budgetCategoryId: 'cat-1',
        budgetSourceId: 'src-1',
        vendorId: 'vendor-1',
      };

      await createHouseholdItemBudget('hi-123', requestData);

      const callArgs = mockFetch.mock.calls[0];
      const bodyStr = callArgs[1]?.body as string;
      const body = JSON.parse(bodyStr);

      expect(body.description).toBe('Full budget');
      expect(body.plannedAmount).toBe(3000);
      expect(body.confidence).toBe('quote');
      expect(body.budgetCategoryId).toBe('cat-1');
      expect(body.budgetSourceId).toBe('src-1');
      expect(body.vendorId).toBe('vendor-1');
    });

    it('throws error when validation fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid planned amount' },
        }),
      } as Response);

      await expect(createHouseholdItemBudget('hi-123', { plannedAmount: -100 })).rejects.toThrow();
    });
  });

  describe('updateHouseholdItemBudget', () => {
    it('sends PATCH request with correct URL and body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ budget: {} }),
      } as Response);

      const updateData = { description: 'Updated description' };

      await updateHouseholdItemBudget('hi-123', 'budget-1', updateData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/household-items/hi-123/budgets/budget-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(updateData),
        }),
      );
    });

    it('returns updated budget line', async () => {
      const mockResponse: HouseholdItemBudgetLine = {
        id: 'budget-1',
        householdItemId: 'hi-123',
        description: 'Updated description',
        plannedAmount: 1200,
        confidence: 'professional_estimate',
        confidenceMargin: 0.1,
        budgetCategory: null,
        budgetSource: null,
        vendor: null,
        actualCost: 0,
        actualCostPaid: 0,
        invoiceCount: 0,
        invoiceLink: null,
        createdBy: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
        quantity: null,
        unit: null,
        unitPrice: null,
        includesVat: null,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ budget: mockResponse }),
      } as Response);

      const result = await updateHouseholdItemBudget('hi-123', 'budget-1', {
        description: 'Updated description',
        plannedAmount: 1200,
      });

      expect(result).toEqual(mockResponse);
      expect(result.description).toBe('Updated description');
      expect(result.plannedAmount).toBe(1200);
    });

    it('supports partial updates', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ budget: {} }),
      } as Response);

      await updateHouseholdItemBudget('hi-123', 'budget-1', {
        plannedAmount: 5000,
      });

      const callArgs = mockFetch.mock.calls[0];
      const bodyStr = callArgs[1]?.body as string;
      const body = JSON.parse(bodyStr);

      expect(body).toEqual({ plannedAmount: 5000 });
      expect(body.description).toBeUndefined();
    });

    it('supports updating confidence level', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ budget: {} }),
      } as Response);

      await updateHouseholdItemBudget('hi-123', 'budget-1', {
        confidence: 'invoice',
      });

      const callArgs = mockFetch.mock.calls[0];
      const bodyStr = callArgs[1]?.body as string;
      const body = JSON.parse(bodyStr);

      expect(body.confidence).toBe('invoice');
    });

    it('throws error when household item not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: { code: 'NOT_FOUND', message: 'Household item not found' },
        }),
      } as Response);

      await expect(
        updateHouseholdItemBudget('nonexistent', 'budget-1', { plannedAmount: 1000 }),
      ).rejects.toThrow();
    });
  });

  describe('deleteHouseholdItemBudget', () => {
    it('sends DELETE request to correct URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      } as Response);

      await deleteHouseholdItemBudget('hi-123', 'budget-1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/household-items/hi-123/budgets/budget-1',
        expect.objectContaining({
          method: 'DELETE',
        }),
      );
    });

    it('returns void on successful delete', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      } as Response);

      const result = await deleteHouseholdItemBudget('hi-123', 'budget-1');

      expect(result).toBeUndefined();
    });

    it('throws error when budget line not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Budget line not found' } }),
      } as Response);

      await expect(deleteHouseholdItemBudget('hi-123', 'nonexistent')).rejects.toThrow();
    });

    it('throws error when household item not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: { code: 'NOT_FOUND', message: 'Household item not found' },
        }),
      } as Response);

      await expect(deleteHouseholdItemBudget('nonexistent', 'budget-1')).rejects.toThrow();
    });

    it('throws error when delete fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Delete failed' } }),
      } as Response);

      await expect(deleteHouseholdItemBudget('hi-123', 'budget-1')).rejects.toThrow();
    });
  });
});

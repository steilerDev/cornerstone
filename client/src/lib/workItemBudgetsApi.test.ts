import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  fetchWorkItemBudgets,
  createWorkItemBudget,
  updateWorkItemBudget,
  deleteWorkItemBudget,
} from './workItemBudgetsApi.js';
import type { WorkItemBudgetLine } from '@cornerstone/shared';

describe('workItemBudgetsApi', () => {
  let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

  beforeEach(() => {
    mockFetch = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const mockBudgetLine: WorkItemBudgetLine = {
    id: 'budget-1',
    workItemId: 'work-item-1',
    description: null,
    plannedAmount: 5000,
    confidence: 'own_estimate',
    confidenceMargin: 1.2,
    budgetCategory: null,
    budgetSource: null,
    vendor: null,
    actualCost: 4500,
    actualCostPaid: 4500,
    invoiceCount: 0,
    invoiceLink: null,
    quantity: null,
    unit: null,
    unitPrice: null,
    includesVat: null,
    createdBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  // ─── fetchWorkItemBudgets ────────────────────────────────────────────────

  describe('fetchWorkItemBudgets', () => {
    it('sends GET request to /api/work-items/:workItemId/budgets', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ budgets: [mockBudgetLine] }),
      } as Response);

      await fetchWorkItemBudgets('work-item-1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/work-items/work-item-1/budgets',
        expect.any(Object),
      );
    });

    it('returns the budgets array from the response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ budgets: [mockBudgetLine] }),
      } as Response);

      const result = await fetchWorkItemBudgets('work-item-1');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('budget-1');
      expect(result[0].plannedAmount).toBe(5000);
    });

    it('returns empty array when no budgets exist for work item', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ budgets: [] }),
      } as Response);

      const result = await fetchWorkItemBudgets('work-item-1');

      expect(result).toEqual([]);
    });

    it('returns multiple budget lines', async () => {
      const secondBudget: WorkItemBudgetLine = {
        ...mockBudgetLine,
        id: 'budget-2',
        plannedAmount: 2000,
        actualCost: 1800,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ budgets: [mockBudgetLine, secondBudget] }),
      } as Response);

      const result = await fetchWorkItemBudgets('work-item-1');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('budget-1');
      expect(result[1].id).toBe('budget-2');
    });

    it('throws error when work item not found (404)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Work item not found' } }),
      } as Response);

      await expect(fetchWorkItemBudgets('nonexistent')).rejects.toThrow();
    });

    it('throws error on server error (500)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Server error' } }),
      } as Response);

      await expect(fetchWorkItemBudgets('work-item-1')).rejects.toThrow();
    });
  });

  // ─── createWorkItemBudget ─────────────────────────────────────────────────

  describe('createWorkItemBudget', () => {
    it('sends POST request to /api/work-items/:workItemId/budgets with data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ budget: mockBudgetLine }),
      } as Response);

      const requestData = {
        budgetSourceId: 'source-1',
        budgetCategoryId: 'cat-1',
        plannedAmount: 5000,
        description: null,
      };

      await createWorkItemBudget('work-item-1', requestData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/work-items/work-item-1/budgets',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(requestData),
        }),
      );
    });

    it('returns the created budget line from response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ budget: mockBudgetLine }),
      } as Response);

      const result = await createWorkItemBudget('work-item-1', {
        budgetSourceId: 'source-1',
        budgetCategoryId: 'cat-1',
        plannedAmount: 5000,
        description: null,
      });

      expect(result.id).toBe('budget-1');
      expect(result.plannedAmount).toBe(5000);
    });

    it('throws error when validation fails (400)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: { code: 'VALIDATION_ERROR', message: 'plannedAmount is required' },
        }),
      } as Response);

      // plannedAmount is required per CreateBudgetLineRequest — pass a partial to trigger validation
      await expect(
        createWorkItemBudget('work-item-1', {} as { plannedAmount: number }),
      ).rejects.toThrow();
    });

    it('throws error when work item not found (404)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Work item not found' } }),
      } as Response);

      await expect(
        createWorkItemBudget('nonexistent', {
          budgetSourceId: 'source-1',
          budgetCategoryId: 'cat-1',
          plannedAmount: 5000,
          description: null,
        }),
      ).rejects.toThrow();
    });
  });

  // ─── updateWorkItemBudget ─────────────────────────────────────────────────

  describe('updateWorkItemBudget', () => {
    it('sends PATCH request to /api/work-items/:workItemId/budgets/:budgetId with data', async () => {
      const updatedBudget = { ...mockBudgetLine, plannedAmount: 6000 };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ budget: updatedBudget }),
      } as Response);

      const updateData = { plannedAmount: 6000 };

      await updateWorkItemBudget('work-item-1', 'budget-1', updateData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/work-items/work-item-1/budgets/budget-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(updateData),
        }),
      );
    });

    it('returns the updated budget line from response', async () => {
      const updatedBudget = {
        ...mockBudgetLine,
        plannedAmount: 7500,
        description: 'Updated notes',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ budget: updatedBudget }),
      } as Response);

      const result = await updateWorkItemBudget('work-item-1', 'budget-1', {
        plannedAmount: 7500,
        description: 'Updated notes',
      });

      expect(result.plannedAmount).toBe(7500);
      expect(result.description).toBe('Updated notes');
    });

    it('throws error when budget line not found (404)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Budget line not found' } }),
      } as Response);

      await expect(
        updateWorkItemBudget('work-item-1', 'nonexistent-budget', { plannedAmount: 5000 }),
      ).rejects.toThrow();
    });

    it('throws error when validation fails (400)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: { code: 'VALIDATION_ERROR', message: 'plannedAmount must be positive' },
        }),
      } as Response);

      await expect(
        updateWorkItemBudget('work-item-1', 'budget-1', { plannedAmount: -100 as number }),
      ).rejects.toThrow();
    });
  });

  // ─── deleteWorkItemBudget ─────────────────────────────────────────────────

  describe('deleteWorkItemBudget', () => {
    it('sends DELETE request to /api/work-items/:workItemId/budgets/:budgetId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      } as Response);

      await deleteWorkItemBudget('work-item-1', 'budget-1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/work-items/work-item-1/budgets/budget-1',
        expect.objectContaining({
          method: 'DELETE',
        }),
      );
    });

    it('returns void on successful deletion', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      } as Response);

      const result = await deleteWorkItemBudget('work-item-1', 'budget-1');

      expect(result).toBeUndefined();
    });

    it('throws error when budget line not found (404)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Budget line not found' } }),
      } as Response);

      await expect(deleteWorkItemBudget('work-item-1', 'nonexistent-budget')).rejects.toThrow();
    });

    it('throws error when delete fails (500)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Delete failed' } }),
      } as Response);

      await expect(deleteWorkItemBudget('work-item-1', 'budget-1')).rejects.toThrow();
    });
  });
});

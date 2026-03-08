import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  fetchInvoiceBudgetLines,
  createInvoiceBudgetLine,
  updateInvoiceBudgetLine,
  deleteInvoiceBudgetLine,
} from './invoiceBudgetLinesApi.js';
import type {
  InvoiceBudgetLineListDetailResponse,
  InvoiceBudgetLineCreateResponse,
  InvoiceBudgetLineDetailResponse,
} from '@cornerstone/shared';

describe('invoiceBudgetLinesApi', () => {
  let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

  beforeEach(() => {
    mockFetch = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─── Fixtures ──────────────────────────────────────────────────────────────

  const sampleDetailLine: InvoiceBudgetLineDetailResponse = {
    id: 'ibl-001',
    invoiceId: 'inv-001',
    workItemBudgetId: 'wib-001',
    householdItemBudgetId: null,
    itemizedAmount: 500.0,
    budgetLineDescription: 'Foundation work',
    plannedAmount: 1000.0,
    confidence: 'quote',
    categoryId: 'bc-construction',
    categoryName: 'Construction',
    categoryColor: '#ff0000',
    parentItemId: 'wi-001',
    parentItemTitle: 'Foundation',
    parentItemType: 'work_item',
    createdAt: '2026-01-15T10:00:00Z',
    updatedAt: '2026-01-15T10:00:00Z',
  };

  const sampleListResponse: InvoiceBudgetLineListDetailResponse = {
    budgetLines: [sampleDetailLine],
    remainingAmount: 1000.0,
  };

  const sampleCreateResponse: InvoiceBudgetLineCreateResponse = {
    budgetLine: sampleDetailLine,
    remainingAmount: 1000.0,
  };

  // ─── fetchInvoiceBudgetLines ───────────────────────────────────────────────

  describe('fetchInvoiceBudgetLines', () => {
    it('sends GET request to /api/invoices/:invoiceId/budget-lines', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => sampleListResponse,
      } as Response);

      await fetchInvoiceBudgetLines('inv-001');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/invoices/inv-001/budget-lines',
        expect.any(Object),
      );
    });

    it('uses the correct invoiceId in the URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => sampleListResponse,
      } as Response);

      await fetchInvoiceBudgetLines('inv-abc-999');

      const call = mockFetch.mock.calls[0];
      expect(call[0]).toBe('/api/invoices/inv-abc-999/budget-lines');
    });

    it('returns the full InvoiceBudgetLineListDetailResponse', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => sampleListResponse,
      } as Response);

      const result = await fetchInvoiceBudgetLines('inv-001');

      expect(result.budgetLines).toHaveLength(1);
      expect(result.budgetLines[0]).toEqual(sampleDetailLine);
      expect(result.remainingAmount).toBe(1000.0);
    });

    it('returns empty budgetLines array when no lines exist', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ budgetLines: [], remainingAmount: 1500.0 }),
      } as Response);

      const result = await fetchInvoiceBudgetLines('inv-001');

      expect(result.budgetLines).toHaveLength(0);
      expect(result.remainingAmount).toBe(1500.0);
    });

    it('throws when server returns 401 UNAUTHORIZED', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }),
      } as Response);

      await expect(fetchInvoiceBudgetLines('inv-001')).rejects.toThrow();
    });

    it('throws when server returns 404 NOT_FOUND', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Invoice not found' } }),
      } as Response);

      await expect(fetchInvoiceBudgetLines('non-existent-invoice')).rejects.toThrow();
    });

    it('throws when server returns 500 INTERNAL_ERROR', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Server error' } }),
      } as Response);

      await expect(fetchInvoiceBudgetLines('inv-001')).rejects.toThrow();
    });
  });

  // ─── createInvoiceBudgetLine ───────────────────────────────────────────────

  describe('createInvoiceBudgetLine', () => {
    it('sends POST request to /api/invoices/:invoiceId/budget-lines', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => sampleCreateResponse,
      } as Response);

      const data = {
        invoiceId: 'inv-001',
        workItemBudgetId: 'wib-001',
        itemizedAmount: 500.0,
      };
      await createInvoiceBudgetLine('inv-001', data);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/invoices/inv-001/budget-lines',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(data),
        }),
      );
    });

    it('uses the correct invoiceId in the URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => sampleCreateResponse,
      } as Response);

      await createInvoiceBudgetLine('inv-xyz', {
        invoiceId: 'inv-xyz',
        workItemBudgetId: 'wib-001',
        itemizedAmount: 100.0,
      });

      const call = mockFetch.mock.calls[0];
      expect(call[0]).toBe('/api/invoices/inv-xyz/budget-lines');
    });

    it('returns the InvoiceBudgetLineCreateResponse with budgetLine and remainingAmount', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => sampleCreateResponse,
      } as Response);

      const result = await createInvoiceBudgetLine('inv-001', {
        invoiceId: 'inv-001',
        workItemBudgetId: 'wib-001',
        itemizedAmount: 500.0,
      });

      expect(result.budgetLine).toEqual(sampleDetailLine);
      expect(result.remainingAmount).toBe(1000.0);
    });

    it('sends household item budget line with householdItemBudgetId', async () => {
      const hiResponse: InvoiceBudgetLineCreateResponse = {
        budgetLine: {
          ...sampleDetailLine,
          workItemBudgetId: null,
          householdItemBudgetId: 'hib-001',
          parentItemType: 'household_item',
        },
        remainingAmount: 800.0,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => hiResponse,
      } as Response);

      const data = {
        invoiceId: 'inv-001',
        householdItemBudgetId: 'hib-001',
        itemizedAmount: 200.0,
      };
      await createInvoiceBudgetLine('inv-001', data);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/invoices/inv-001/budget-lines',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(data),
        }),
      );
    });

    it('throws for 409 BUDGET_LINE_ALREADY_LINKED', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          error: {
            code: 'BUDGET_LINE_ALREADY_LINKED',
            message: 'This budget line is already linked to another invoice.',
          },
        }),
      } as Response);

      await expect(
        createInvoiceBudgetLine('inv-001', {
          invoiceId: 'inv-001',
          workItemBudgetId: 'wib-001',
          itemizedAmount: 500.0,
        }),
      ).rejects.toThrow();
    });

    it('throws for 400 ITEMIZED_SUM_EXCEEDS_INVOICE', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            code: 'ITEMIZED_SUM_EXCEEDS_INVOICE',
            message: 'Linking this budget line would exceed the invoice total.',
          },
        }),
      } as Response);

      await expect(
        createInvoiceBudgetLine('inv-001', {
          invoiceId: 'inv-001',
          workItemBudgetId: 'wib-001',
          itemizedAmount: 99999.0,
        }),
      ).rejects.toThrow();
    });

    it('throws for 401 UNAUTHORIZED', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }),
      } as Response);

      await expect(
        createInvoiceBudgetLine('inv-001', {
          invoiceId: 'inv-001',
          workItemBudgetId: 'wib-001',
          itemizedAmount: 100,
        }),
      ).rejects.toThrow();
    });
  });

  // ─── updateInvoiceBudgetLine ───────────────────────────────────────────────

  describe('updateInvoiceBudgetLine', () => {
    it('sends PUT request to /api/invoices/:invoiceId/budget-lines/:lineId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => sampleCreateResponse,
      } as Response);

      const data = { itemizedAmount: 750.0 };
      await updateInvoiceBudgetLine('inv-001', 'ibl-001', data);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/invoices/inv-001/budget-lines/ibl-001',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(data),
        }),
      );
    });

    it('uses the correct invoiceId and lineId in the URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => sampleCreateResponse,
      } as Response);

      await updateInvoiceBudgetLine('inv-xyz', 'ibl-abc', { itemizedAmount: 300 });

      const call = mockFetch.mock.calls[0];
      expect(call[0]).toBe('/api/invoices/inv-xyz/budget-lines/ibl-abc');
    });

    it('returns the InvoiceBudgetLineCreateResponse with updated budgetLine and remainingAmount', async () => {
      const updatedResponse: InvoiceBudgetLineCreateResponse = {
        budgetLine: { ...sampleDetailLine, itemizedAmount: 750.0 },
        remainingAmount: 750.0,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => updatedResponse,
      } as Response);

      const result = await updateInvoiceBudgetLine('inv-001', 'ibl-001', { itemizedAmount: 750.0 });

      expect(result.budgetLine.itemizedAmount).toBe(750.0);
      expect(result.remainingAmount).toBe(750.0);
    });

    it('throws for 400 ITEMIZED_SUM_EXCEEDS_INVOICE', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            code: 'ITEMIZED_SUM_EXCEEDS_INVOICE',
            message: 'The new amount would exceed the invoice total.',
          },
        }),
      } as Response);

      await expect(
        updateInvoiceBudgetLine('inv-001', 'ibl-001', { itemizedAmount: 99999 }),
      ).rejects.toThrow();
    });

    it('throws for 404 NOT_FOUND (invoice budget line)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Budget line not found' } }),
      } as Response);

      await expect(
        updateInvoiceBudgetLine('inv-001', 'non-existent-line', { itemizedAmount: 100 }),
      ).rejects.toThrow();
    });

    it('throws for 401 UNAUTHORIZED', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }),
      } as Response);

      await expect(
        updateInvoiceBudgetLine('inv-001', 'ibl-001', { itemizedAmount: 500 }),
      ).rejects.toThrow();
    });
  });

  // ─── deleteInvoiceBudgetLine ───────────────────────────────────────────────

  describe('deleteInvoiceBudgetLine', () => {
    it('sends DELETE request to /api/invoices/:invoiceId/budget-lines/:lineId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      } as Response);

      await deleteInvoiceBudgetLine('inv-001', 'ibl-001');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/invoices/inv-001/budget-lines/ibl-001',
        expect.objectContaining({
          method: 'DELETE',
        }),
      );
    });

    it('uses the correct invoiceId and lineId in the URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      } as Response);

      await deleteInvoiceBudgetLine('inv-abc', 'ibl-xyz');

      const call = mockFetch.mock.calls[0];
      expect(call[0]).toBe('/api/invoices/inv-abc/budget-lines/ibl-xyz');
    });

    it('returns void on successful deletion', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      } as Response);

      const result = await deleteInvoiceBudgetLine('inv-001', 'ibl-001');

      expect(result).toBeUndefined();
    });

    it('throws for 404 NOT_FOUND (invoice budget line)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: { code: 'NOT_FOUND', message: 'Invoice budget line not found' },
        }),
      } as Response);

      await expect(deleteInvoiceBudgetLine('inv-001', 'non-existent-line')).rejects.toThrow();
    });

    it('throws for 404 NOT_FOUND (invoice)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Invoice not found' } }),
      } as Response);

      await expect(deleteInvoiceBudgetLine('non-existent-invoice', 'ibl-001')).rejects.toThrow();
    });

    it('throws for 401 UNAUTHORIZED', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }),
      } as Response);

      await expect(deleteInvoiceBudgetLine('inv-001', 'ibl-001')).rejects.toThrow();
    });
  });
});

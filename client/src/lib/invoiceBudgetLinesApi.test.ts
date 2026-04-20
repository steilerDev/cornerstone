import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  fetchInvoiceBudgetLines,
  createInvoiceBudgetLine,
  updateInvoiceBudgetLine,
  deleteInvoiceBudgetLine,
} from './invoiceBudgetLinesApi.js';
import type {
  InvoiceBudgetLineDetailResponse,
  InvoiceBudgetLineCreateResponse,
  InvoiceBudgetLineListDetailResponse,
} from '@cornerstone/shared';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeDetailLine = (
  overrides: Partial<InvoiceBudgetLineDetailResponse> = {},
): InvoiceBudgetLineDetailResponse => ({
  id: 'ibl-1',
  invoiceId: 'inv-100',
  workItemBudgetId: 'wib-1',
  householdItemBudgetId: null,
  itemizedAmount: 500,
  budgetLineDescription: 'Electrical rough-in',
  plannedAmount: 2000,
  confidence: 'own_estimate',
  categoryId: 'cat-1',
  categoryName: 'Electrical',
  categoryColor: '#ffcc00',
  categoryTranslationKey: 'electrical',
  parentItemId: 'wi-1',
  parentItemTitle: 'Electrical Work',
  parentItemType: 'work_item',
  parentItemArea: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const makeListResponse = (
  lines: InvoiceBudgetLineDetailResponse[] = [],
  remainingAmount = 1500,
): InvoiceBudgetLineListDetailResponse => ({
  budgetLines: lines,
  remainingAmount,
});

const makeCreateResponse = (
  line: InvoiceBudgetLineDetailResponse = makeDetailLine(),
  remainingAmount = 1000,
): InvoiceBudgetLineCreateResponse => ({
  budgetLine: line,
  remainingAmount,
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('invoiceBudgetLinesApi', () => {
  let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

  beforeEach(() => {
    mockFetch = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─── fetchInvoiceBudgetLines ───────────────────────────────────────────────

  describe('fetchInvoiceBudgetLines', () => {
    it('sends GET request to /api/invoices/:invoiceId/budget-lines', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => makeListResponse(),
      } as Response);

      await fetchInvoiceBudgetLines('inv-100');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/invoices/inv-100/budget-lines',
        expect.any(Object),
      );
    });

    it('uses GET HTTP method', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => makeListResponse(),
      } as Response);

      await fetchInvoiceBudgetLines('inv-100');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('interpolates the invoiceId correctly into the URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => makeListResponse(),
      } as Response);

      await fetchInvoiceBudgetLines('inv-ABCDEF-999');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/invoices/inv-ABCDEF-999/budget-lines',
        expect.any(Object),
      );
    });

    it('returns budgetLines array and remainingAmount from response', async () => {
      const line = makeDetailLine();
      const mockResponse = makeListResponse([line], 750);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await fetchInvoiceBudgetLines('inv-100');

      expect(result).toEqual(mockResponse);
      expect(result.budgetLines).toHaveLength(1);
      expect(result.budgetLines[0]!.id).toBe('ibl-1');
      expect(result.remainingAmount).toBe(750);
    });

    it('returns empty budgetLines array when no lines are linked', async () => {
      const mockResponse = makeListResponse([], 2000);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await fetchInvoiceBudgetLines('inv-100');

      expect(result.budgetLines).toEqual([]);
      expect(result.remainingAmount).toBe(2000);
    });

    it('returns multiple budget lines with correct shapes', async () => {
      const line1 = makeDetailLine({
        id: 'ibl-1',
        workItemBudgetId: 'wib-1',
        householdItemBudgetId: null,
      });
      const line2 = makeDetailLine({
        id: 'ibl-2',
        workItemBudgetId: null,
        householdItemBudgetId: 'hib-1',
        parentItemType: 'household_item',
        parentItemTitle: 'Kitchen Table',
        itemizedAmount: 300,
      });
      const mockResponse = makeListResponse([line1, line2], 200);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await fetchInvoiceBudgetLines('inv-100');

      expect(result.budgetLines).toHaveLength(2);
      expect(result.budgetLines[0]!.parentItemType).toBe('work_item');
      expect(result.budgetLines[1]!.parentItemType).toBe('household_item');
    });

    it('throws error when invoice not found (404)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Invoice not found' } }),
      } as Response);

      await expect(fetchInvoiceBudgetLines('nonexistent')).rejects.toThrow();
    });

    it('throws error on server error (500)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Server error' } }),
      } as Response);

      await expect(fetchInvoiceBudgetLines('inv-100')).rejects.toThrow();
    });
  });

  // ─── createInvoiceBudgetLine ───────────────────────────────────────────────

  describe('createInvoiceBudgetLine', () => {
    it('sends POST request to /api/invoices/:invoiceId/budget-lines', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => makeCreateResponse(),
      } as Response);

      await createInvoiceBudgetLine('inv-100', {
        invoiceId: 'inv-100',
        workItemBudgetId: 'wib-1',
        itemizedAmount: 500,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/invoices/inv-100/budget-lines',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('interpolates the invoiceId correctly into the POST URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => makeCreateResponse(),
      } as Response);

      await createInvoiceBudgetLine('inv-XYZ-777', {
        invoiceId: 'inv-XYZ-777',
        workItemBudgetId: 'wib-1',
        itemizedAmount: 100,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/invoices/inv-XYZ-777/budget-lines',
        expect.any(Object),
      );
    });

    it('sends request body as JSON with workItemBudgetId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => makeCreateResponse(),
      } as Response);

      const requestData = {
        invoiceId: 'inv-100',
        workItemBudgetId: 'wib-1',
        householdItemBudgetId: null as string | null | undefined,
        itemizedAmount: 500,
      };

      await createInvoiceBudgetLine('inv-100', requestData);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify(requestData),
        }),
      );
    });

    it('sends request body as JSON with householdItemBudgetId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => makeCreateResponse(),
      } as Response);

      const requestData = {
        invoiceId: 'inv-100',
        workItemBudgetId: null as string | null | undefined,
        householdItemBudgetId: 'hib-1',
        itemizedAmount: 300,
      };

      await createInvoiceBudgetLine('inv-100', requestData);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify(requestData),
        }),
      );
    });

    it('returns the created budgetLine and remainingAmount', async () => {
      const line = makeDetailLine({ itemizedAmount: 500 });
      const mockResponse = makeCreateResponse(line, 1000);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => mockResponse,
      } as Response);

      const result = await createInvoiceBudgetLine('inv-100', {
        invoiceId: 'inv-100',
        workItemBudgetId: 'wib-1',
        itemizedAmount: 500,
      });

      expect(result).toEqual(mockResponse);
      expect(result.budgetLine.itemizedAmount).toBe(500);
      expect(result.remainingAmount).toBe(1000);
    });

    it('returns household_item type in budgetLine when linking to a household item budget', async () => {
      const line = makeDetailLine({
        workItemBudgetId: null,
        householdItemBudgetId: 'hib-1',
        parentItemType: 'household_item',
        parentItemTitle: 'Kitchen Appliances',
      });
      const mockResponse = makeCreateResponse(line, 700);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => mockResponse,
      } as Response);

      const result = await createInvoiceBudgetLine('inv-100', {
        invoiceId: 'inv-100',
        householdItemBudgetId: 'hib-1',
        itemizedAmount: 300,
      });

      expect(result.budgetLine.parentItemType).toBe('household_item');
      expect(result.budgetLine.householdItemBudgetId).toBe('hib-1');
      expect(result.budgetLine.workItemBudgetId).toBeNull();
    });

    it('throws error when invoice not found (404)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Invoice not found' } }),
      } as Response);

      await expect(
        createInvoiceBudgetLine('nonexistent', {
          invoiceId: 'nonexistent',
          workItemBudgetId: 'wib-1',
          itemizedAmount: 100,
        }),
      ).rejects.toThrow();
    });

    it('throws error when budget line already linked to another invoice (409)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          error: {
            code: 'BUDGET_LINE_ALREADY_LINKED',
            message: 'This budget line is already linked to another invoice',
          },
        }),
      } as Response);

      await expect(
        createInvoiceBudgetLine('inv-100', {
          invoiceId: 'inv-100',
          workItemBudgetId: 'wib-1',
          itemizedAmount: 100,
        }),
      ).rejects.toThrow();
    });

    it('throws error when itemized sum exceeds invoice total (400)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            code: 'ITEMIZED_SUM_EXCEEDS_INVOICE',
            message: 'The sum of itemized amounts exceeds the invoice total',
          },
        }),
      } as Response);

      await expect(
        createInvoiceBudgetLine('inv-100', {
          invoiceId: 'inv-100',
          workItemBudgetId: 'wib-1',
          itemizedAmount: 99999,
        }),
      ).rejects.toThrow();
    });

    it('throws error on validation failure (400)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: { code: 'VALIDATION_ERROR', message: 'itemizedAmount must be positive' },
        }),
      } as Response);

      await expect(
        createInvoiceBudgetLine('inv-100', { invoiceId: 'inv-100', itemizedAmount: -1 }),
      ).rejects.toThrow();
    });
  });

  // ─── updateInvoiceBudgetLine ───────────────────────────────────────────────

  describe('updateInvoiceBudgetLine', () => {
    it('sends PATCH request to /api/invoices/:invoiceId/budget-lines/:lineId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => makeCreateResponse(),
      } as Response);

      await updateInvoiceBudgetLine('inv-100', 'ibl-1', { itemizedAmount: 750 });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/invoices/inv-100/budget-lines/ibl-1',
        expect.objectContaining({ method: 'PATCH' }),
      );
    });

    it('interpolates both invoiceId and lineId correctly into the PATCH URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => makeCreateResponse(),
      } as Response);

      await updateInvoiceBudgetLine('inv-XYZ', 'ibl-ABC', { itemizedAmount: 100 });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/invoices/inv-XYZ/budget-lines/ibl-ABC',
        expect.any(Object),
      );
    });

    it('sends request body as JSON with itemizedAmount', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => makeCreateResponse(),
      } as Response);

      const updateData = { itemizedAmount: 750 };
      await updateInvoiceBudgetLine('inv-100', 'ibl-1', updateData);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify(updateData),
        }),
      );
    });

    it('sends empty update body when no fields provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => makeCreateResponse(),
      } as Response);

      const updateData = {};
      await updateInvoiceBudgetLine('inv-100', 'ibl-1', updateData);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify(updateData),
        }),
      );
    });

    it('returns the updated budgetLine and remainingAmount', async () => {
      const updatedLine = makeDetailLine({ itemizedAmount: 750 });
      const mockResponse = makeCreateResponse(updatedLine, 750);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await updateInvoiceBudgetLine('inv-100', 'ibl-1', { itemizedAmount: 750 });

      expect(result).toEqual(mockResponse);
      expect(result.budgetLine.itemizedAmount).toBe(750);
      expect(result.remainingAmount).toBe(750);
    });

    it('returns remainingAmount of zero when invoice is fully allocated', async () => {
      const updatedLine = makeDetailLine({ itemizedAmount: 2000 });
      const mockResponse = makeCreateResponse(updatedLine, 0);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await updateInvoiceBudgetLine('inv-100', 'ibl-1', { itemizedAmount: 2000 });

      expect(result.remainingAmount).toBe(0);
    });

    it('throws error when invoice budget line not found (404)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: { code: 'NOT_FOUND', message: 'Invoice budget line not found' },
        }),
      } as Response);

      await expect(
        updateInvoiceBudgetLine('inv-100', 'nonexistent', { itemizedAmount: 100 }),
      ).rejects.toThrow();
    });

    it('throws error when itemized sum exceeds invoice total after update (400)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            code: 'ITEMIZED_SUM_EXCEEDS_INVOICE',
            message: 'The sum of itemized amounts exceeds the invoice total',
          },
        }),
      } as Response);

      await expect(
        updateInvoiceBudgetLine('inv-100', 'ibl-1', { itemizedAmount: 99999 }),
      ).rejects.toThrow();
    });

    it('throws error on server error (500)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Server error' } }),
      } as Response);

      await expect(
        updateInvoiceBudgetLine('inv-100', 'ibl-1', { itemizedAmount: 100 }),
      ).rejects.toThrow();
    });
  });

  // ─── deleteInvoiceBudgetLine ───────────────────────────────────────────────

  describe('deleteInvoiceBudgetLine', () => {
    it('sends DELETE request to /api/invoices/:invoiceId/budget-lines/:lineId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      } as Response);

      await deleteInvoiceBudgetLine('inv-100', 'ibl-1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/invoices/inv-100/budget-lines/ibl-1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('interpolates both invoiceId and lineId correctly into the DELETE URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      } as Response);

      await deleteInvoiceBudgetLine('inv-XYZ', 'ibl-ABC');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/invoices/inv-XYZ/budget-lines/ibl-ABC',
        expect.any(Object),
      );
    });

    it('returns void on successful delete (204)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      } as Response);

      const result = await deleteInvoiceBudgetLine('inv-100', 'ibl-1');

      expect(result).toBeUndefined();
    });

    it('throws error when invoice budget line not found (404)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: { code: 'NOT_FOUND', message: 'Invoice budget line not found' },
        }),
      } as Response);

      await expect(deleteInvoiceBudgetLine('inv-100', 'nonexistent')).rejects.toThrow();
    });

    it('throws error when invoice not found (404)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: { code: 'NOT_FOUND', message: 'Invoice not found' },
        }),
      } as Response);

      await expect(deleteInvoiceBudgetLine('nonexistent-inv', 'ibl-1')).rejects.toThrow();
    });

    it('throws error on server error (500)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Delete failed' } }),
      } as Response);

      await expect(deleteInvoiceBudgetLine('inv-100', 'ibl-1')).rejects.toThrow();
    });
  });
});

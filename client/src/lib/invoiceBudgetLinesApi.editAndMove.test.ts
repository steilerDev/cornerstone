import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { editAndMoveBudgetLine } from './invoiceBudgetLinesApi.js';
import type {
  InvoiceBudgetLineDetailResponse,
  InvoiceBudgetLineCreateResponse,
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
  quantity: null,
  unit: null,
  unitPrice: null,
  includesVat: true,
  vendorId: null,
  budgetSourceId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const makeCreateResponse = (
  line: InvoiceBudgetLineDetailResponse = makeDetailLine(),
  remainingAmount = 500,
): InvoiceBudgetLineCreateResponse => ({
  budgetLine: line,
  remainingAmount,
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('editAndMoveBudgetLine()', () => {
  let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

  beforeEach(() => {
    mockFetch = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends PATCH request to /api/invoices/:invoiceId/budget-lines/:lineId', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => makeCreateResponse(),
    } as Response);

    await editAndMoveBudgetLine('inv-100', 'ibl-1', { description: 'Updated' });

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

    await editAndMoveBudgetLine('inv-XYZ', 'ibl-ABC', { itemizedAmount: 200 });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/invoices/inv-XYZ/budget-lines/ibl-ABC',
      expect.any(Object),
    );
  });

  it('sends description and itemizedAmount in request body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => makeCreateResponse(),
    } as Response);

    const payload = { description: 'Updated desc', itemizedAmount: 300 };
    await editAndMoveBudgetLine('inv-100', 'ibl-1', payload);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ body: JSON.stringify(payload) }),
    );
  });

  it('sends newWorkItemId in request body for same-table WI move', async () => {
    const movedLine = makeDetailLine({ parentItemId: 'wi-2', parentItemTitle: 'Plumbing' });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => makeCreateResponse(movedLine),
    } as Response);

    const payload = { newWorkItemId: 'wi-2' };
    await editAndMoveBudgetLine('inv-100', 'ibl-1', payload);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ body: JSON.stringify(payload) }),
    );
  });

  it('sends newHouseholdItemId in request body for cross-table WI→HI move', async () => {
    const movedLine = makeDetailLine({
      workItemBudgetId: null,
      householdItemBudgetId: 'hib-new',
      parentItemId: 'hi-1',
      parentItemTitle: 'Sofa',
      parentItemType: 'household_item',
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => makeCreateResponse(movedLine),
    } as Response);

    const payload = { newHouseholdItemId: 'hi-1' };
    await editAndMoveBudgetLine('inv-100', 'ibl-1', payload);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ body: JSON.stringify(payload) }),
    );
  });

  it('returns budgetLine with updated parentItemTitle and remainingAmount after WI move', async () => {
    const movedLine = makeDetailLine({ parentItemId: 'wi-2', parentItemTitle: 'Plumbing' });
    const mockResponse = makeCreateResponse(movedLine, 700);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await editAndMoveBudgetLine('inv-100', 'ibl-1', { newWorkItemId: 'wi-2' });

    expect(result.budgetLine.parentItemTitle).toBe('Plumbing');
    expect(result.budgetLine.parentItemType).toBe('work_item');
    expect(result.remainingAmount).toBe(700);
  });

  it('returns budgetLine with household_item type after cross-table WI→HI move', async () => {
    const movedLine = makeDetailLine({
      workItemBudgetId: null,
      householdItemBudgetId: 'hib-new',
      parentItemId: 'hi-1',
      parentItemTitle: 'Kitchen Table',
      parentItemType: 'household_item',
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => makeCreateResponse(movedLine),
    } as Response);

    const result = await editAndMoveBudgetLine('inv-100', 'ibl-1', { newHouseholdItemId: 'hi-1' });

    expect(result.budgetLine.parentItemType).toBe('household_item');
    expect(result.budgetLine.householdItemBudgetId).toBe('hib-new');
    expect(result.budgetLine.workItemBudgetId).toBeNull();
  });

  it('throws error when budget line already linked to same invoice (409)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({
        error: {
          code: 'BUDGET_LINE_ALREADY_LINKED',
          message: 'Target already linked',
        },
      }),
    } as Response);

    await expect(
      editAndMoveBudgetLine('inv-100', 'ibl-1', { newWorkItemId: 'wi-2' }),
    ).rejects.toThrow();
  });

  it('throws error when invoice or line not found (404)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: { code: 'NOT_FOUND', message: 'Not found' } }),
    } as Response);

    await expect(
      editAndMoveBudgetLine('nonexistent', 'ibl-1', { description: 'test' }),
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
      editAndMoveBudgetLine('inv-100', 'ibl-1', { itemizedAmount: 0 }),
    ).rejects.toThrow();
  });

  it('throws error on server error (500)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Server error' } }),
    } as Response);

    await expect(
      editAndMoveBudgetLine('inv-100', 'ibl-1', { description: 'test' }),
    ).rejects.toThrow();
  });
});

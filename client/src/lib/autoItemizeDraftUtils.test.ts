/**
 * @jest-environment node
 *
 * Unit tests for materializeInlineDrafts.
 *
 * Key invariant: financial fields (includesVat, quantity, unit, unitPrice,
 * plannedAmount) are taken from the LIVE line state, not the draft snapshot.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ─── Mocks ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockCreateWorkItem = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockCreateHouseholdItem = jest.fn<any>();

jest.unstable_mockModule('./errorTranslation.js', () => ({
  translateApiError: (_code: string) => 'Translated error',
}));

// ApiClientError mock — has .error.code
class MockApiClientError extends Error {
  statusCode = 500;
  error = { code: 'SERVER_ERROR', message: 'Server error' };
}

jest.unstable_mockModule('./apiClient.js', () => ({
  get: jest.fn(),
  post: jest.fn(),
  patch: jest.fn(),
  del: jest.fn(),
  put: jest.fn(),
  setBaseUrl: jest.fn(),
  getBaseUrl: jest.fn().mockReturnValue('/api'),
  ApiClientError: MockApiClientError,
  NetworkError: class MockNetworkError extends Error {},
}));

// ─── Test helpers ────────────────────────────────────────────────────────────

const i18n = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (key: string) => key as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tErrors: (key: string) => key as any,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeLine(overrides: Record<string, any> = {}): any {
  return {
    rowId: 'row-1',
    description: 'Tile work',
    totalAmount: 300,
    includesVat: true,
    confidence: 0.9,
    quantity: null,
    unit: null,
    unitPrice: null,
    vatRate: null,
    vendorName: null,
    included: true,
    budgetCategoryId: 'cat-1',
    budgetSourceId: 'src-1',
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeDraftLine(overrides: Record<string, any> = {}): any {
  return makeLine({
    assignedItemId: 'wi-1',
    assignedItemType: 'work_item',
    inlineCreatedBudgetLineDraft: {
      description: 'Draft desc',
      plannedAmount: '300',
      confidence: 'invoice',
      budgetCategoryId: 'cat-1',
      budgetSourceId: 'src-1',
      vendorId: 'v-1',
      pricingMode: 'direct',
      quantity: '',
      unit: '',
      unitPrice: '',
      includesVat: true,
    },
    ...overrides,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeCreatedBudgetLine(id: string): any {
  return {
    id,
    workItemId: 'wi-1',
    description: 'Created',
    plannedAmount: 300,
    confidence: 'invoice',
    includesVat: true,
    quantity: null,
    unit: null,
    unitPrice: null,
    budgetCategory: null,
    budgetSource: null,
    vendor: null,
    actualCost: 0,
    actualCostPaid: 0,
    confidenceMargin: 0,
    invoiceLink: null,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('materializeInlineDrafts', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let materializeInlineDrafts: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCreateWorkItem.mockResolvedValue(makeCreatedBudgetLine('new-wib-1'));
    mockCreateHouseholdItem.mockResolvedValue(makeCreatedBudgetLine('new-hib-1'));
    ({ materializeInlineDrafts } = await import('./autoItemizeDraftUtils.js'));
  });

  it('passes through lines without a draft unchanged', async () => {
    const line = makeLine();
    const result = await materializeInlineDrafts(
      [line],
      { workItem: mockCreateWorkItem, householdItem: mockCreateHouseholdItem },
      i18n,
    );
    expect(result).toEqual({ ok: true, lines: [line] });
    expect(mockCreateWorkItem).not.toHaveBeenCalled();
  });

  it('materialises a draft: calls createWorkItemBudget and converts to assign-existing', async () => {
    const line = makeDraftLine();
    const result = await materializeInlineDrafts(
      [line],
      { workItem: mockCreateWorkItem, householdItem: mockCreateHouseholdItem },
      i18n,
    );

    expect(result.ok).toBe(true);
    expect(mockCreateWorkItem).toHaveBeenCalledWith(
      'wi-1',
      expect.objectContaining({ plannedAmount: 300 }),
    );
    expect(result.lines[0]).toMatchObject({
      assignedBudgetLineId: 'new-wib-1',
      assignedBudgetLineType: 'work_item',
      inlineCreatedBudgetLineDraft: undefined,
    });
  });

  it('routes household_item to createHouseholdItemBudget', async () => {
    const line = makeDraftLine({ assignedItemId: 'hi-1', assignedItemType: 'household_item' });
    const result = await materializeInlineDrafts(
      [line],
      { workItem: mockCreateWorkItem, householdItem: mockCreateHouseholdItem },
      i18n,
    );
    expect(result.ok).toBe(true);
    expect(mockCreateHouseholdItem).toHaveBeenCalled();
    expect(mockCreateWorkItem).not.toHaveBeenCalled();
  });

  // ─── VAT / amount sync fix ──────────────────────────────────────────────────

  it('uses live line.includesVat (not stale draft.includesVat) — VAT sync fix', async () => {
    const line = makeDraftLine({
      includesVat: false, // live value changed after "New budget line" clicked
      inlineCreatedBudgetLineDraft: {
        description: 'desc',
        plannedAmount: '300',
        confidence: 'invoice',
        budgetCategoryId: 'cat-1',
        budgetSourceId: 'src-1',
        vendorId: '',
        pricingMode: 'direct',
        quantity: '',
        unit: '',
        unitPrice: '',
        includesVat: true, // stale snapshot
      },
    });

    const result = await materializeInlineDrafts(
      [line],
      { workItem: mockCreateWorkItem, householdItem: mockCreateHouseholdItem },
      i18n,
    );
    expect(result.ok).toBe(true);

    // API payload uses live value
    expect(mockCreateWorkItem).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ includesVat: false }),
    );
    // Converted line uses live value
    expect(result.lines[0].includesVat).toBe(false);
  });

  it('uses live line.totalAmount as plannedAmount in direct mode', async () => {
    const line = makeDraftLine({
      totalAmount: 450, // user edited line amount after queuing draft
      inlineCreatedBudgetLineDraft: {
        description: 'desc',
        plannedAmount: '300', // stale
        confidence: 'invoice',
        budgetCategoryId: 'cat-1',
        budgetSourceId: 'src-1',
        vendorId: '',
        pricingMode: 'direct',
        quantity: '',
        unit: '',
        unitPrice: '',
        includesVat: true,
      },
    });

    const result = await materializeInlineDrafts(
      [line],
      { workItem: mockCreateWorkItem, householdItem: mockCreateHouseholdItem },
      i18n,
    );
    expect(result.ok).toBe(true);
    expect(mockCreateWorkItem).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ plannedAmount: 450 }),
    );
    expect(result.lines[0].totalAmount).toBe(450);
  });

  it('computes plannedAmount from live quantity × unitPrice when both are set', async () => {
    const line = makeDraftLine({
      quantity: 5,
      unitPrice: 80,
      inlineCreatedBudgetLineDraft: {
        description: 'desc',
        plannedAmount: '300', // stale
        confidence: 'invoice',
        budgetCategoryId: 'cat-1',
        budgetSourceId: 'src-1',
        vendorId: '',
        pricingMode: 'unit',
        quantity: '3', // stale
        unit: 'm²',
        unitPrice: '100', // stale
        includesVat: true,
      },
    });

    const result = await materializeInlineDrafts(
      [line],
      { workItem: mockCreateWorkItem, householdItem: mockCreateHouseholdItem },
      i18n,
    );
    expect(result.ok).toBe(true);
    // 5 × 80 = 400, not 3 × 100 = 300
    expect(mockCreateWorkItem).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ plannedAmount: 400, quantity: 5, unitPrice: 80 }),
    );
  });

  // ─── Error paths ───────────────────────────────────────────────────────────

  it('returns { ok: false } when createWorkItemBudget rejects', async () => {
    mockCreateWorkItem.mockRejectedValue(new Error('Network failure'));
    const result = await materializeInlineDrafts(
      [makeDraftLine()],
      { workItem: mockCreateWorkItem, householdItem: mockCreateHouseholdItem },
      i18n,
    );
    expect(result.ok).toBe(false);
    expect(typeof (result as { ok: false; error: string }).error).toBe('string');
  });

  it('processes mixed lines: only materialises the draft line', async () => {
    const assignedLine = makeLine({ rowId: 'a', assignedBudgetLineId: 'existing' });
    const draftLine = makeDraftLine({ rowId: 'b' });
    const plainLine = makeLine({ rowId: 'c' });

    const result = await materializeInlineDrafts(
      [assignedLine, draftLine, plainLine],
      { workItem: mockCreateWorkItem, householdItem: mockCreateHouseholdItem },
      i18n,
    );
    expect(result.ok).toBe(true);
    expect(mockCreateWorkItem).toHaveBeenCalledTimes(1);
    expect(result.lines[0].rowId).toBe('a');
    expect(result.lines[1].assignedBudgetLineId).toBe('new-wib-1');
    expect(result.lines[2].rowId).toBe('c');
  });
});

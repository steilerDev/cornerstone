/**
 * @jest-environment node
 *
 * Unit tests for the Split with AI row helpers: extraction -> grid row, commit payload and
 * creating the cost lines of rows that belong to a task or purchase.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type {
  CreateBudgetLineRequest,
  ExtractedLine,
  HouseholdItemBudgetLine,
  WorkItemBudgetLine,
} from '@cornerstone/shared';
import type { AiRowDataMap } from '../components/autoItemize/types.js';
import type { CostLineGridRow } from '../components/CostLineForm/types.js';
import type { CostLineTarget } from '../components/CostLineTable/types.js';

type CreateFn = (
  itemId: string,
  data: CreateBudgetLineRequest,
) => Promise<WorkItemBudgetLine | HouseholdItemBudgetLine>;

const mockCreateWorkItem = jest.fn<CreateFn>();
const mockCreateHouseholdItem = jest.fn<CreateFn>();
const mockSearchCompanies = jest.fn<(q: string) => Promise<{ id: string; name: string }[]>>();

jest.unstable_mockModule('./errorTranslation.js', () => ({
  translateApiError: (code: string) => `translated:${code}`,
}));

class MockApiClientError extends Error {
  statusCode = 400;
  error = { code: 'VALIDATION_ERROR', message: 'bad' };
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

jest.unstable_mockModule('./vendorsApi.js', () => ({
  searchCompanies: mockSearchCompanies,
}));

const {
  rowFromExtractedLine,
  effectiveRowAmount,
  isNewBudgetLineRow,
  applyBudgetSourceToNewLines,
  rowTarget,
  basisFor,
  buildCommitLines,
  mergeMaterializedRows,
  materializeNewRows,
} = await import('./autoItemizeDraftUtils.js');
const { blankGridRow } = await import('../components/CostLineForm/costLineGridModel.js');

const i18n = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: ((key: string) => key) as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tErrors: ((key: string) => key) as any,
};

const WORK_ITEM: CostLineTarget = { type: 'work_item', id: 'wi-1', label: 'Task one' };
const PURCHASE: CostLineTarget = { type: 'household_item', id: 'hi-1', label: 'Purchase one' };

function extracted(overrides: Partial<ExtractedLine> = {}): ExtractedLine {
  return {
    description: 'Oak boards',
    totalAmount: 100,
    includesVat: false,
    confidence: 0.9,
    ...overrides,
  } as ExtractedLine;
}

function row(overrides: Partial<CostLineGridRow> = {}): CostLineGridRow {
  return {
    ...blankGridRow('r1'),
    description: 'Oak boards',
    unitPrice: '100',
    ...overrides,
  };
}

const context = {
  assignAll: null as CostLineTarget | null,
  locale: 'en' as const,
  vatRate: 0.19,
  documentType: null as string | null | undefined,
  defaultBudgetSourceId: null as string | null,
  discretionarySourceId: null as string | null,
};

function createdLine(id: string, description: string | null = 'Oak boards'): WorkItemBudgetLine {
  return { id, description } as WorkItemBudgetLine;
}

describe('rowFromExtractedLine', () => {
  it('maps a unit-priced line to quantity, unit and unit price', () => {
    const result = rowFromExtractedLine(
      extracted({ quantity: 2.5, unit: 'm', unitPrice: 40, totalAmount: 100 }),
      'x',
      'de',
    );
    expect(result).toMatchObject({
      rowId: 'x',
      description: 'Oak boards',
      quantity: '2,5',
      unit: 'm',
      unitPrice: '40',
      includesVat: false,
      aiCertainty: 0.9,
      budgetCategoryId: null,
      budgetSourceId: null,
    });
  });

  it('uses the total as the single amount without quantity or unit price', () => {
    const result = rowFromExtractedLine(extracted({ totalAmount: 99.5 }), 'x', 'en');
    expect(result).toMatchObject({ quantity: '', unit: '', unitPrice: '99.5' });
  });

  it('keeps an empty unit and treats missing includesVat as gross', () => {
    const result = rowFromExtractedLine(
      extracted({
        quantity: 1,
        unitPrice: 5,
        includesVat: undefined,
        budgetCategoryId: 'cat-1',
        budgetSourceId: 'src-1',
      }),
      'x',
      'en',
    );
    expect(result).toMatchObject({
      unit: '',
      includesVat: true,
      budgetCategoryId: 'cat-1',
      budgetSourceId: 'src-1',
    });
  });
});

describe('effectiveRowAmount', () => {
  it('grosses a net row up at the configured rate', () => {
    expect(effectiveRowAmount(row(), 0.19, 'en')).toBe(119);
    expect(effectiveRowAmount(row(), 0.2, 'en')).toBe(120);
  });

  it('is 0 while the row is incomplete', () => {
    expect(effectiveRowAmount(row({ unitPrice: 'abc' }), 0.19, 'en')).toBe(0);
  });
});

describe('isNewBudgetLineRow', () => {
  it('is true for a typed row without an existing line', () => {
    expect(isNewBudgetLineRow(row())).toBe(true);
  });

  it('is false for a blank row', () => {
    expect(isNewBudgetLineRow(blankGridRow('b'))).toBe(false);
  });

  it('is false for a row linked to an existing line', () => {
    const linked = row({
      existingLine: { id: 'l1', type: 'work_item', description: null, gross: 5 },
    });
    expect(isNewBudgetLineRow(linked)).toBe(false);
  });
});

describe('applyBudgetSourceToNewLines', () => {
  it('sets the source on rows without an existing line and keeps linked rows by reference', () => {
    const linked = row({
      rowId: 'l',
      existingLine: { id: 'l1', type: 'work_item', description: null, gross: 5 },
    });
    const plain = row({ rowId: 'p' });
    const result = applyBudgetSourceToNewLines([plain, linked], 'src-9');
    expect(result[0]!.budgetSourceId).toBe('src-9');
    expect(result[1]).toBe(linked);
    expect(plain.budgetSourceId).toBeNull();
  });

  it('returns an empty array for no rows', () => {
    expect(applyBudgetSourceToNewLines([], 'src')).toEqual([]);
  });
});

describe('rowTarget', () => {
  it('prefers the row target, else Assign all to, else null', () => {
    expect(rowTarget(row({ target: WORK_ITEM }), PURCHASE)).toBe(WORK_ITEM);
    expect(rowTarget(row(), PURCHASE)).toBe(PURCHASE);
    expect(rowTarget(row(), null)).toBeNull();
  });
});

describe('basisFor', () => {
  it('lets the document type win', () => {
    expect(basisFor('Invoice', 0.1)).toBe('invoice');
    expect(basisFor('Quotation', 0.99)).toBe('quote');
  });

  it.each([
    [0.85, 'invoice'],
    [0.6, 'quote'],
    [0.3, 'professional_estimate'],
    [0.29, 'own_estimate'],
  ])('maps certainty %s to %s without a known document type', (certainty, expected) => {
    expect(basisFor(undefined, certainty)).toBe(expected);
    expect(basisFor('Other', certainty)).toBe(expected);
  });
});

describe('buildCommitLines', () => {
  it('maps a unit-priced new row with the extraction side data', () => {
    const data: AiRowDataMap = new Map([
      ['r1', { extracted: extracted({ vendorName: 'Acme', category: 'Wood', confidence: 0.7 }) }],
    ]);
    const [line] = buildCommitLines(
      [
        row({
          quantity: '2',
          unit: ' m ',
          unitPrice: '50',
          budgetCategoryId: 'cat-1',
          budgetSourceId: 'src-1',
        }),
      ],
      data,
      context,
    );
    expect(line).toMatchObject({
      description: 'Oak boards',
      quantity: 2,
      unit: 'm',
      unitPrice: 50,
      totalAmount: 100,
      includesVat: false,
      vendorName: 'Acme',
      confidence: 0.7,
      category: 'Wood',
      budgetCategoryId: 'cat-1',
      budgetSourceId: 'src-1',
      assignmentMode: 'create-new',
    });
  });

  it('sends a single-amount row without quantity, unit or unit price', () => {
    const [line] = buildCommitLines([row({ unit: 'x', budgetSourceId: '' })], new Map(), context);
    expect(line).toMatchObject({
      quantity: undefined,
      unit: undefined,
      unitPrice: undefined,
      totalAmount: 100,
      budgetSourceId: undefined,
      confidence: 1,
    });
  });

  it('omits a blank unit and falls back to the row certainty and a 0 price', () => {
    const [line] = buildCommitLines(
      [row({ quantity: '3', unit: '  ', unitPrice: '', aiCertainty: 0.5 })],
      new Map(),
      context,
    );
    expect(line).toMatchObject({ quantity: 3, unit: undefined, unitPrice: 0, confidence: 0.5 });
  });

  it('sends an unparsable quantity as undefined', () => {
    const [line] = buildCommitLines([row({ quantity: 'x' })], new Map(), context);
    expect(line!.quantity).toBeUndefined();
  });

  it('commits a linked row as assign-existing with its gross and no category or source', () => {
    const linked = row({
      unitPrice: '119',
      budgetCategoryId: 'cat-1',
      budgetSourceId: 'src-1',
      existingLine: { id: 'bl-1', type: 'household_item', description: 'Existing', gross: 119 },
    });
    const [line] = buildCommitLines([linked], new Map(), context);
    expect(line).toMatchObject({
      assignmentMode: 'assign-existing',
      assignedBudgetLineId: 'bl-1',
      assignedBudgetLineType: 'household_item',
      totalAmount: 119,
      includesVat: true,
      budgetCategoryId: undefined,
      budgetSourceId: undefined,
      quantity: undefined,
      unit: undefined,
      unitPrice: undefined,
      description: 'Oak boards',
    });
  });

  it('falls back to the linked line description, then an em dash, for an empty description', () => {
    const base = {
      description: ' ',
      existingLine: { id: 'bl-1', type: 'work_item' as const, description: ' Kept ', gross: 5 },
    };
    const [a] = buildCommitLines([row(base)], new Map(), context);
    expect(a!.description).toBe('Kept');
    const [b] = buildCommitLines(
      [row({ ...base, existingLine: { ...base.existingLine, description: null } })],
      new Map(),
      context,
    );
    expect(b!.description).toBe('—');
  });
});

describe('mergeMaterializedRows', () => {
  it('replaces rows by id, keeps the others and the order', () => {
    const a = row({ rowId: 'a' });
    const b = row({ rowId: 'b' });
    const c = row({ rowId: 'c' });
    const b2 = { ...b, description: 'changed' };
    const result = mergeMaterializedRows([a, b, c], [b2]);
    expect(result).toEqual([a, b2, c]);
    expect(result[0]).toBe(a);
  });

  it('returns an equal array when nothing was materialized', () => {
    const a = row({ rowId: 'a' });
    expect(mergeMaterializedRows([a], [])).toEqual([a]);
  });
});

describe('materializeNewRows', () => {
  const create = { workItem: mockCreateWorkItem, householdItem: mockCreateHouseholdItem };

  beforeEach(() => {
    jest.resetAllMocks();
    mockSearchCompanies.mockResolvedValue([]);
  });

  it('skips rows with an existing line or no target', async () => {
    const linked = row({
      rowId: 'l',
      target: WORK_ITEM,
      existingLine: { id: 'x', type: 'work_item', description: null, gross: 1 },
    });
    const orphan = row({ rowId: 'o' });
    const result = await materializeNewRows([linked, orphan], context, new Map(), create, i18n);
    expect(result).toEqual({ ok: true, rows: [linked, orphan] });
    expect(mockCreateWorkItem).not.toHaveBeenCalled();
  });

  it('creates the line on the work item from the live row and turns the row into a link', async () => {
    mockCreateWorkItem.mockResolvedValue(createdLine('bl-new', 'Created'));
    const data: AiRowDataMap = new Map([
      ['r1', { extracted: extracted({ vendorName: 'Acme', confidence: 0.9 }) }],
    ]);
    mockSearchCompanies.mockResolvedValue([
      { id: 'c-other', name: 'Other' },
      { id: 'c-1', name: 'ACME' },
    ]);
    const result = await materializeNewRows(
      [
        row({
          target: WORK_ITEM,
          quantity: '2',
          unit: 'm',
          unitPrice: '50',
          budgetCategoryId: 'cat-1',
          budgetSourceId: 'src-1',
        }),
      ],
      { ...context, documentType: 'Invoice' },
      data,
      create,
      i18n,
    );
    expect(mockCreateWorkItem).toHaveBeenCalledWith('wi-1', {
      description: 'Oak boards',
      plannedAmount: 100,
      confidence: 'invoice',
      budgetCategoryId: 'cat-1',
      budgetSourceId: 'src-1',
      vendorId: 'c-1',
      quantity: 2,
      unit: 'm',
      unitPrice: 50,
      includesVat: false,
    });
    expect(result.ok).toBe(true);
    const out = result.rows[0]!;
    expect(out.existingLine).toEqual({
      id: 'bl-new',
      type: 'work_item',
      description: 'Created',
      gross: 119,
    });
    expect(out).toMatchObject({ quantity: '', unit: '', unitPrice: '119', target: WORK_ITEM });
  });

  it('uses Assign all to, the household create call, no category, and the default source', async () => {
    mockCreateHouseholdItem.mockResolvedValue(createdLine('bl-h'));
    await materializeNewRows(
      [row({ budgetCategoryId: 'cat-1', description: '  ' })],
      { ...context, assignAll: PURCHASE, defaultBudgetSourceId: 'def' },
      new Map(),
      create,
      i18n,
    );
    expect(mockCreateHouseholdItem).toHaveBeenCalledWith(
      'hi-1',
      expect.objectContaining({
        description: null,
        budgetCategoryId: null,
        budgetSourceId: 'def',
        vendorId: null,
        quantity: null,
        unit: null,
        unitPrice: null,
        confidence: 'invoice',
      }),
    );
  });

  it('falls back to the discretionary source, then null', async () => {
    mockCreateWorkItem.mockResolvedValue(createdLine('bl'));
    await materializeNewRows(
      [row({ target: WORK_ITEM })],
      { ...context, discretionarySourceId: 'disc' },
      new Map(),
      create,
      i18n,
    );
    expect(mockCreateWorkItem.mock.calls[0]![1].budgetSourceId).toBe('disc');
    await materializeNewRows([row({ target: WORK_ITEM })], context, new Map(), create, i18n);
    expect(mockCreateWorkItem.mock.calls[1]![1].budgetSourceId).toBeNull();
  });

  it('sends a unit-priced row with a blank unit as a null unit', async () => {
    mockCreateWorkItem.mockResolvedValue(createdLine('bl'));
    await materializeNewRows(
      [row({ target: WORK_ITEM, quantity: '2', unit: ' ' })],
      context,
      new Map(),
      create,
      i18n,
    );
    expect(mockCreateWorkItem.mock.calls[0]![1].unit).toBeNull();
  });

  it('looks up each company name once and tolerates a failed lookup', async () => {
    mockCreateWorkItem.mockResolvedValue(createdLine('bl'));
    mockSearchCompanies.mockRejectedValueOnce(new Error('down'));
    const data: AiRowDataMap = new Map([
      ['a', { extracted: extracted({ vendorName: 'Acme' }) }],
      ['b', { extracted: extracted({ vendorName: 'Acme' }) }],
    ]);
    await materializeNewRows(
      [row({ rowId: 'a', target: WORK_ITEM }), row({ rowId: 'b', target: WORK_ITEM })],
      context,
      data,
      create,
      i18n,
    );
    expect(mockSearchCompanies).toHaveBeenCalledTimes(1);
    expect(mockCreateWorkItem.mock.calls[0]![1].vendorId).toBeNull();
    expect(mockCreateWorkItem.mock.calls[1]![1].vendorId).toBeNull();
  });

  it('stops with the invalid message on a non-finite amount and returns the earlier rows', async () => {
    mockCreateWorkItem.mockResolvedValue(createdLine('bl-1'));
    const rows = [
      row({ rowId: 'a', target: WORK_ITEM }),
      row({ rowId: 'b', target: WORK_ITEM, unitPrice: 'abc' }),
    ];
    const result = await materializeNewRows(rows, context, new Map(), create, i18n);
    expect(result).toMatchObject({ ok: false, error: 'autoItemize.inlineDraftInvalid' });
    expect(result.rows[0]!.existingLine?.id).toBe('bl-1');
    expect(result.rows[1]).toBe(rows[1]);
  });

  it('rejects a negative amount', async () => {
    const result = await materializeNewRows(
      [row({ target: WORK_ITEM, unitPrice: '-5' })],
      context,
      new Map(),
      create,
      i18n,
    );
    expect(result).toMatchObject({ ok: false, error: 'autoItemize.inlineDraftInvalid' });
  });

  it('translates an API error and keeps the rows created so far', async () => {
    mockCreateWorkItem
      .mockResolvedValueOnce(createdLine('bl-1'))
      .mockRejectedValueOnce(new MockApiClientError('x'));
    const result = await materializeNewRows(
      [row({ rowId: 'a', target: WORK_ITEM }), row({ rowId: 'b', target: WORK_ITEM })],
      context,
      new Map(),
      create,
      i18n,
    );
    expect(result).toMatchObject({ ok: false, error: 'translated:VALIDATION_ERROR' });
    expect(result.rows[0]!.existingLine?.id).toBe('bl-1');
    expect(result.rows[1]!.existingLine).toBeNull();
  });

  it('uses the generic message for a non-API failure', async () => {
    mockCreateWorkItem.mockRejectedValue(new Error('boom'));
    const result = await materializeNewRows(
      [row({ target: WORK_ITEM })],
      context,
      new Map(),
      create,
      i18n,
    );
    expect(result).toMatchObject({ ok: false, error: 'autoItemize.inlineDraftCreateFailed' });
  });
});

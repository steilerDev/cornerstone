/**
 * @jest-environment node
 *
 * Unit tests for materializeInlineDrafts.
 *
 * Key invariant: financial fields (includesVat, quantity, unit, unitPrice,
 * plannedAmount) are taken from the LIVE line state, not the draft snapshot.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type {
  CreateBudgetLineRequest,
  WorkItemBudgetLine,
  HouseholdItemBudgetLine,
} from '@cornerstone/shared';

// ─── Mocks ──────────────────────────────────────────────────────────────────

// Mirrors the (unexported) CreateFn type in autoItemizeDraftUtils.ts.
type CreateFn = (
  itemId: string,
  data: CreateBudgetLineRequest,
) => Promise<WorkItemBudgetLine | HouseholdItemBudgetLine>;

const mockCreateWorkItem = jest.fn<CreateFn>();
const mockCreateHouseholdItem = jest.fn<CreateFn>();

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
    const line = makeDraftLine();
    const result = await materializeInlineDrafts(
      [line],
      { workItem: mockCreateWorkItem, householdItem: mockCreateHouseholdItem },
      i18n,
    );
    expect(result.ok).toBe(false);
    expect(typeof (result as { ok: false; error: string }).error).toBe('string');
    // Retry-safety (#1833): the single failed line is returned unchanged so a
    // caller can safely write it back into page state without side effects.
    expect(result.lines).toEqual([line]);
  });

  // ─── Retry safety (#1833): MaterializeErr.lines partial-materialization ────

  it('returns partially-materialized lines when a later draft create call rejects', async () => {
    const assignedLine = makeLine({ rowId: 'a', assignedBudgetLineId: 'existing' });
    const draftLineB = makeDraftLine({ rowId: 'b' });
    const draftLineC = makeDraftLine({ rowId: 'c' });

    mockCreateWorkItem
      .mockResolvedValueOnce(makeCreatedBudgetLine('new-wib-b'))
      .mockRejectedValueOnce(new Error('Network failure'));

    const result = await materializeInlineDrafts(
      [assignedLine, draftLineB, draftLineC],
      { workItem: mockCreateWorkItem, householdItem: mockCreateHouseholdItem },
      i18n,
    );

    expect(result.ok).toBe(false);
    expect(result.lines).toHaveLength(3);
    // Line without a draft is untouched
    expect(result.lines[0]).toEqual(assignedLine);
    // First draft materialized before the failure — retry must not recreate it
    expect(result.lines[1]).toMatchObject({
      rowId: 'b',
      assignedBudgetLineId: 'new-wib-b',
      assignedBudgetLineType: 'work_item',
      inlineCreatedBudgetLineDraft: undefined,
    });
    // The failing draft is left untouched (still a draft) so a retry re-attempts only this one
    expect(result.lines[2].rowId).toBe('c');
    expect(result.lines[2].assignedBudgetLineId).toBeUndefined();
    expect(result.lines[2].inlineCreatedBudgetLineDraft).toBeDefined();
    expect(mockCreateWorkItem).toHaveBeenCalledTimes(2);
  });

  it('returns partially-materialized lines when a later draft has an invalid netBase amount', async () => {
    const draftLineA = makeDraftLine({ rowId: 'a' });
    const draftLineB = makeDraftLine({ rowId: 'b', totalAmount: -1 });

    const result = await materializeInlineDrafts(
      [draftLineA, draftLineB],
      { workItem: mockCreateWorkItem, householdItem: mockCreateHouseholdItem },
      i18n,
    );

    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toBe('autoItemize.inlineDraftInvalid');
    expect(result.lines).toHaveLength(2);
    // First draft materialized before the invalid-amount line was reached
    expect(result.lines[0]).toMatchObject({
      rowId: 'a',
      assignedBudgetLineId: 'new-wib-1',
      inlineCreatedBudgetLineDraft: undefined,
    });
    // Invalid-amount draft is untouched — no create call was attempted for it
    expect(result.lines[1].rowId).toBe('b');
    expect(result.lines[1].assignedBudgetLineId).toBeUndefined();
    expect(result.lines[1].inlineCreatedBudgetLineDraft).toBeDefined();
    expect(mockCreateWorkItem).toHaveBeenCalledTimes(1);
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

// ─── mergeMaterializedLines (#1833) ────────────────────────────────────────────
//
// Merges a (possibly partial) subset of materialized lines back into the full
// lines array by rowId. Used by AutoItemizePage/PaperlessInvoiceReviewPage to
// write back partially- or fully-materialized state after a save attempt so a
// retry does not re-create budget lines that already exist server-side.

describe('mergeMaterializedLines', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mergeMaterializedLines: any;

  beforeEach(async () => {
    ({ mergeMaterializedLines } = await import('./autoItemizeDraftUtils.js'));
  });

  it('merges materialized rows back into the full array by rowId', () => {
    const allLines = [makeLine({ rowId: 'a' }), makeLine({ rowId: 'b' }), makeLine({ rowId: 'c' })];
    const materialized = [
      { ...allLines[0], assignedBudgetLineId: 'new-a' },
      { ...allLines[2], assignedBudgetLineId: 'new-c' },
    ];

    const result = mergeMaterializedLines(allLines, materialized);

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ rowId: 'a', assignedBudgetLineId: 'new-a' });
    expect(result[2]).toMatchObject({ rowId: 'c', assignedBudgetLineId: 'new-c' });
  });

  it('preserves rows not present in the materialized subset unchanged (e.g. excluded rows)', () => {
    const excludedRow = makeLine({ rowId: 'b', included: false });
    const allLines = [makeLine({ rowId: 'a' }), excludedRow, makeLine({ rowId: 'c' })];
    const materialized = [
      { ...allLines[0], assignedBudgetLineId: 'new-a' },
      { ...allLines[2], assignedBudgetLineId: 'new-c' },
    ];

    const result = mergeMaterializedLines(allLines, materialized);

    // The excluded row (absent from the materialized subset) is the exact same
    // object reference — proving it was passed through untouched.
    expect(result[1]).toBe(excludedRow);
  });

  it('preserves the original array order', () => {
    const allLines = [makeLine({ rowId: 'a' }), makeLine({ rowId: 'b' }), makeLine({ rowId: 'c' })];
    const materialized = [{ ...allLines[1], assignedBudgetLineId: 'new-b' }];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = mergeMaterializedLines(allLines, materialized) as any[];

    expect(result.map((l) => l.rowId)).toEqual(['a', 'b', 'c']);
  });

  it('returns an array equal to the original when materializedIncluded is empty', () => {
    const allLines = [makeLine({ rowId: 'a' }), makeLine({ rowId: 'b' })];

    const result = mergeMaterializedLines(allLines, []);

    expect(result).toEqual(allLines);
  });
});

// ─── #2149 — linked (assign-existing) rows ──────────────────────────────────

describe('materializeInlineDrafts — linked snapshot (#2149)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let materializeInlineDrafts: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    ({ materializeInlineDrafts } = await import('./autoItemizeDraftUtils.js'));
  });

  it('stores the created line as the snapshot and carries its description', async () => {
    mockCreateWorkItem.mockResolvedValue({
      ...makeCreatedBudgetLine('new-wib-1'),
      description: 'Created desc',
      plannedAmount: 777,
      includesVat: false,
      budgetCategory: { id: 'cat-9', name: 'Cat 9', translationKey: 'k9', extra: 'dropped' },
      budgetSource: { id: 'src-9', name: 'Src 9', extra: 'dropped' },
    });

    const result = await materializeInlineDrafts(
      [makeDraftLine()],
      { workItem: mockCreateWorkItem, householdItem: mockCreateHouseholdItem },
      i18n,
    );

    expect(result.lines[0].assignedBudgetLineDescription).toBe('Created desc');
    expect(result.lines[0].assignedBudgetLineSnapshot).toEqual({
      plannedAmount: 777,
      includesVat: false,
      budgetCategory: { id: 'cat-9', name: 'Cat 9', translationKey: 'k9' },
      budgetSource: { id: 'src-9', name: 'Src 9' },
    });
  });

  it('falls back to a null description when the created line has none', async () => {
    mockCreateWorkItem.mockResolvedValue({
      ...makeCreatedBudgetLine('new-wib-1'),
      description: undefined,
    });

    const result = await materializeInlineDrafts(
      [makeDraftLine()],
      { workItem: mockCreateWorkItem, householdItem: mockCreateHouseholdItem },
      i18n,
    );

    expect(result.lines[0].assignedBudgetLineDescription).toBeNull();
  });
});

describe('toAssignedBudgetLineSnapshot (#2149)', () => {
  it('maps nullable category/source to null', async () => {
    const { toAssignedBudgetLineSnapshot } = await import('./autoItemizeDraftUtils.js');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const line: any = {
      ...makeCreatedBudgetLine('x'),
      plannedAmount: 12,
      budgetCategory: null,
      budgetSource: null,
    };
    expect(toAssignedBudgetLineSnapshot(line)).toEqual({
      plannedAmount: 12,
      includesVat: true,
      budgetCategory: null,
      budgetSource: null,
    });
  });
});

describe('effectiveRowAmount (#2149)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let effectiveRowAmount: any;

  beforeEach(async () => {
    ({ effectiveRowAmount } = await import('./autoItemizeDraftUtils.js'));
  });

  it('linked row uses linkedItemizedAmount verbatim (0 is respected)', () => {
    expect(
      effectiveRowAmount(
        makeLine({ assignedBudgetLineId: 'b1', linkedItemizedAmount: 1100, totalAmount: 100 }),
        0.19,
      ),
    ).toBe(1100);
    expect(
      effectiveRowAmount(
        makeLine({ assignedBudgetLineId: 'b1', linkedItemizedAmount: 0, totalAmount: 100 }),
        0.19,
      ),
    ).toBe(0);
  });

  it('linked row without linkedItemizedAmount falls back to the VAT-effective extracted amount', () => {
    expect(
      effectiveRowAmount(
        makeLine({ assignedBudgetLineId: 'b1', totalAmount: 100, includesVat: false }),
        0.19,
      ),
    ).toBe(119);
  });

  it('unlinked row ignores a stray linkedItemizedAmount and uses the VAT-effective amount', () => {
    expect(effectiveRowAmount(makeLine({ linkedItemizedAmount: 5, totalAmount: 300 }), 0.19)).toBe(
      300,
    );
    expect(effectiveRowAmount(makeLine({ totalAmount: 100, includesVat: false }), 0.19)).toBe(119);
  });

  it('treats a missing totalAmount as 0', () => {
    expect(effectiveRowAmount(makeLine({ totalAmount: undefined }), 0.19)).toBe(0);
  });
});

describe('buildCommitLines (#2149)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let buildCommitLines: any;

  beforeEach(async () => {
    ({ buildCommitLines } = await import('./autoItemizeDraftUtils.js'));
  });

  const ALLOWED_KEYS = [
    'assignedBudgetLineId',
    'assignedBudgetLineType',
    'assignmentMode',
    'budgetCategoryId',
    'budgetSourceId',
    'confidence',
    'description',
    'includesVat',
    'quantity',
    'totalAmount',
    'unit',
    'unitPrice',
    'vendorName',
  ];

  it('maps a create-new row with the extracted values as before', () => {
    const [out] = buildCommitLines(
      [
        makeLine({
          quantity: 2,
          unit: 'h',
          unitPrice: 150,
          vendorName: 'ACME',
          includesVat: false,
        }),
      ],
      0.19,
    );

    expect(out).toEqual({
      description: 'Tile work',
      quantity: 2,
      unit: 'h',
      unitPrice: 150,
      totalAmount: 300,
      includesVat: false,
      vendorName: 'ACME',
      confidence: 0.9,
      budgetCategoryId: 'cat-1',
      budgetSourceId: 'src-1',
      assignmentMode: 'create-new',
    });
  });

  it('coerces an empty budgetSourceId on create-new to undefined', () => {
    const [out] = buildCommitLines([makeLine({ budgetSourceId: '' })], 0.19);
    expect(out.budgetSourceId).toBeUndefined();
  });

  it('linked row with linkedItemizedAmount commits it verbatim as gross, includesVat true', () => {
    const [out] = buildCommitLines(
      [
        makeLine({
          assignedBudgetLineId: 'wib-1',
          assignedBudgetLineType: 'work_item',
          linkedItemizedAmount: 1100,
          totalAmount: 100,
          includesVat: false,
        }),
      ],
      0.19,
    );

    expect(out).toMatchObject({
      totalAmount: 1100,
      includesVat: true,
      assignmentMode: 'assign-existing',
      assignedBudgetLineId: 'wib-1',
      assignedBudgetLineType: 'work_item',
    });
  });

  it('linked row without linkedItemizedAmount grosses up a net extracted amount (100 net -> 119)', () => {
    const [out] = buildCommitLines(
      [
        makeLine({
          assignedBudgetLineId: 'hib-1',
          assignedBudgetLineType: 'household_item',
          totalAmount: 100,
          includesVat: false,
        }),
      ],
      0.19,
    );

    expect(out.totalAmount).toBe(119);
    expect(out.includesVat).toBe(true);
    expect(out.assignedBudgetLineType).toBe('household_item');
  });

  it('empty extracted description falls back to the assigned line description, then to an em dash', () => {
    const base = { assignedBudgetLineId: 'wib-1', assignedBudgetLineType: 'work_item' };
    const [fromAssigned, fromNothing, fromBlankAssigned] = buildCommitLines(
      [
        makeLine({ ...base, description: '  ', assignedBudgetLineDescription: ' Stored desc ' }),
        makeLine({ ...base, description: '' }),
        makeLine({ ...base, description: '', assignedBudgetLineDescription: '   ' }),
      ],
      0.19,
    );

    expect(fromAssigned.description).toBe('Stored desc');
    expect(fromNothing.description).toBe('—');
    expect(fromBlankAssigned.description).toBe('—');
  });

  it('keeps a non-empty extracted description on a linked row', () => {
    const [out] = buildCommitLines(
      [
        makeLine({
          assignedBudgetLineId: 'wib-1',
          assignedBudgetLineType: 'work_item',
          assignedBudgetLineDescription: 'Stored',
        }),
      ],
      0.19,
    );
    expect(out.description).toBe('Tile work');
  });

  it('emits only schema-allowed keys (no rowId/included/snapshot/etc.) for both modes', () => {
    const out = buildCommitLines(
      [
        makeLine(),
        makeLine({
          assignedBudgetLineId: 'wib-1',
          assignedBudgetLineType: 'work_item',
          assignedBudgetLineSnapshot: { plannedAmount: 1 },
          assignedBudgetLineDescription: 'x',
          linkedItemizedAmount: 5,
          createdFromExtraction: true,
        }),
      ],
      0.19,
    );

    for (const row of out) {
      for (const key of Object.keys(row)) {
        expect(ALLOWED_KEYS).toContain(key);
      }
    }
  });

  it.each(['work_item', 'household_item'])(
    'linked %s row commits no budgetSourceId or budgetCategoryId even when the row has both',
    (type) => {
      const [out] = buildCommitLines(
        [
          makeLine({
            budgetSourceId: 'src-row',
            budgetCategoryId: 'cat-row',
            assignedBudgetLineId: 'bl-1',
            assignedBudgetLineType: type,
          }),
        ],
        0.19,
      );

      expect(out.assignmentMode).toBe('assign-existing');
      expect(out.budgetSourceId).toBeUndefined();
      expect(out.budgetCategoryId).toBeUndefined();
    },
  );

  it('a row with an id but no type is treated as create-new', () => {
    const [out] = buildCommitLines([makeLine({ assignedBudgetLineId: 'wib-1' })], 0.19);
    expect(out.assignmentMode).toBe('create-new');
    expect(out.assignedBudgetLineId).toBeUndefined();
  });
});

// ─── Issue #2158: materialized rows mirror the created line's source/category ──

describe('materializeInlineDrafts — source/category mirroring (#2158)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let materializeInlineDrafts: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCreateWorkItem.mockResolvedValue(makeCreatedBudgetLine('new-wib-1'));
    ({ materializeInlineDrafts } = await import('./autoItemizeDraftUtils.js'));
  });

  it("keeps the row's own source and category on the converted row (not the draft's or the created line's)", async () => {
    const line = makeDraftLine({ budgetSourceId: 'src-row', budgetCategoryId: 'cat-row' });
    line.inlineCreatedBudgetLineDraft.budgetSourceId = 'src-draft';
    line.inlineCreatedBudgetLineDraft.budgetCategoryId = 'cat-draft';
    mockCreateWorkItem.mockResolvedValue({
      ...makeCreatedBudgetLine('new-wib-1'),
      budgetSource: { id: 'src-created', name: 'Created source' },
      budgetCategory: { id: 'cat-created', name: 'Created category', translationKey: null },
    });

    const result = await materializeInlineDrafts(
      [line],
      { workItem: mockCreateWorkItem, householdItem: mockCreateHouseholdItem },
      i18n,
    );

    expect(result.ok).toBe(true);
    expect(result.lines[0].assignedBudgetLineId).toBe('new-wib-1');
    expect(result.lines[0].budgetSourceId).toBe('src-row');
    expect(result.lines[0].budgetCategoryId).toBe('cat-row');
  });

  it('household item: the converted row keeps its own category, not the server-assigned one', async () => {
    const line = makeDraftLine({
      assignedItemId: 'hi-1',
      assignedItemType: 'household_item',
      budgetSourceId: 'src-row',
      budgetCategoryId: 'cat-row',
    });
    line.inlineCreatedBudgetLineDraft.budgetCategoryId = '';
    mockCreateHouseholdItem.mockResolvedValue({
      ...makeCreatedBudgetLine('new-hib-1'),
      budgetCategory: { id: 'bc-household-items', name: 'Household Items', translationKey: null },
    });

    const result = await materializeInlineDrafts(
      [line],
      { workItem: mockCreateWorkItem, householdItem: mockCreateHouseholdItem },
      i18n,
    );

    expect(result.ok).toBe(true);
    expect(result.lines[0].assignedBudgetLineId).toBe('new-hib-1');
    expect(result.lines[0].budgetSourceId).toBe('src-row');
    expect(result.lines[0].budgetCategoryId).toBe('cat-row');
  });
});

// ─── isNewBudgetLineRow / applyBudgetSourceToNewLines (#2158) ──────────────────

describe('isNewBudgetLineRow', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let isNewBudgetLineRow: any;

  beforeEach(async () => {
    ({ isNewBudgetLineRow } = await import('./autoItemizeDraftUtils.js'));
  });

  it('is true for a row without an assigned budget line', () => {
    expect(isNewBudgetLineRow(makeLine())).toBe(true);
  });

  it('is true for a row with only an inline draft queued', () => {
    expect(isNewBudgetLineRow(makeDraftLine())).toBe(true);
  });

  it('is false for a row linked to an existing budget line', () => {
    expect(isNewBudgetLineRow(makeLine({ assignedBudgetLineId: 'bl-1' }))).toBe(false);
  });
});

describe('applyBudgetSourceToNewLines', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let applyBudgetSourceToNewLines: any;

  beforeEach(async () => {
    ({ applyBudgetSourceToNewLines } = await import('./autoItemizeDraftUtils.js'));
  });

  it('returns linked rows by reference and updates all other rows, including excluded ones', () => {
    const linked = makeLine({
      rowId: 'linked',
      assignedBudgetLineId: 'bl-1',
      budgetSourceId: 'src-x',
    });
    const excluded = makeLine({ rowId: 'excluded', included: false, budgetSourceId: 'src-a' });
    const plain = makeLine({ rowId: 'plain', budgetSourceId: 'src-b' });

    const result = applyBudgetSourceToNewLines([linked, excluded, plain], 'src-new');

    expect(result[0]).toBe(linked);
    expect(result[0].budgetSourceId).toBe('src-x');
    expect(result[1].budgetSourceId).toBe('src-new');
    expect(result[1].included).toBe(false);
    expect(result[2].budgetSourceId).toBe('src-new');
  });

  it('updates the queued inline draft source alongside the row source', () => {
    const drafted = makeDraftLine({ rowId: 'drafted', budgetSourceId: 'src-a' });

    const result = applyBudgetSourceToNewLines([drafted], 'src-new');

    expect(result[0].budgetSourceId).toBe('src-new');
    expect(result[0].inlineCreatedBudgetLineDraft.budgetSourceId).toBe('src-new');
    expect(result[0].inlineCreatedBudgetLineDraft.description).toBe('Draft desc');
  });

  it('updates nested merge source lines that are new rows and keeps linked ones untouched', () => {
    const nestedNew = makeLine({ rowId: 'n1', budgetSourceId: 'src-a' });
    const nestedLinked = makeLine({
      rowId: 'n2',
      assignedBudgetLineId: 'bl-2',
      budgetSourceId: 'src-y',
    });
    const merged = makeLine({
      rowId: 'merged',
      mergeStatus: 'error',
      mergeSourceLines: [nestedNew, nestedLinked],
    });

    const result = applyBudgetSourceToNewLines([merged], 'src-new');

    expect(result[0].budgetSourceId).toBe('src-new');
    expect(result[0].mergeSourceLines[0].budgetSourceId).toBe('src-new');
    expect(result[0].mergeSourceLines[1]).toBe(nestedLinked);
  });

  it('does not mutate the input rows, drafts or nested merge lines', () => {
    const drafted = makeDraftLine({ rowId: 'drafted', budgetSourceId: 'src-a' });
    const nested = makeLine({ rowId: 'n1', budgetSourceId: 'src-a' });
    const merged = makeLine({ rowId: 'merged', mergeSourceLines: [nested] });
    const input = [drafted, merged];
    const snapshot = JSON.parse(JSON.stringify(input));

    const result = applyBudgetSourceToNewLines(input, 'src-new');

    expect(result).not.toBe(input);
    expect(JSON.parse(JSON.stringify(input))).toEqual(snapshot);
  });

  it('returns an empty array for no rows', () => {
    expect(applyBudgetSourceToNewLines([], 'src-new')).toEqual([]);
  });
});

describe('effectiveRowAmount / buildCommitLines — configured VAT rate (vatRate=0.2)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let effectiveRowAmount: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let buildCommitLines: any;

  beforeEach(async () => {
    ({ effectiveRowAmount, buildCommitLines } = await import('./autoItemizeDraftUtils.js'));
  });

  it('effectiveRowAmount grosses a net row up to 120 at vatRate=0.2', () => {
    expect(effectiveRowAmount(makeLine({ totalAmount: 100, includesVat: false }), 0.2)).toBe(120);
  });

  it('effectiveRowAmount grosses up a linked row without linkedItemizedAmount at vatRate=0.2', () => {
    expect(
      effectiveRowAmount(
        makeLine({ assignedBudgetLineId: 'b1', totalAmount: 100, includesVat: false }),
        0.2,
      ),
    ).toBe(120);
  });

  it('effectiveRowAmount still prefers linkedItemizedAmount verbatim regardless of rate', () => {
    expect(
      effectiveRowAmount(
        makeLine({ assignedBudgetLineId: 'b1', linkedItemizedAmount: 77, totalAmount: 100 }),
        0.2,
      ),
    ).toBe(77);
  });

  it('buildCommitLines commits a linked net row as gross 120 with includesVat=true', () => {
    const [out] = buildCommitLines(
      [
        makeLine({
          assignedBudgetLineId: 'wib-1',
          assignedBudgetLineType: 'work_item',
          totalAmount: 100,
          includesVat: false,
        }),
      ],
      0.2,
    );

    expect(out.totalAmount).toBe(120);
    expect(out.includesVat).toBe(true);
    expect(out.assignmentMode).toBe('assign-existing');
  });

  it('buildCommitLines leaves a create-new net row amount as extracted (server grosses it up)', () => {
    const [out] = buildCommitLines([makeLine({ totalAmount: 100, includesVat: false })], 0.2);

    expect(out.totalAmount).toBe(100);
    expect(out.includesVat).toBe(false);
    expect(out.assignmentMode).toBe('create-new');
  });
});

import { describe, it, expect } from '@jest/globals';
import type { BaseBudgetLine, InvoiceBudgetLineDetailResponse } from '@cornerstone/shared';
import {
  costLineGross,
  costLineNet,
  groupForDocument,
  groupForItem,
  invoiceLineKey,
  remainingState,
  rowFromBudgetLine,
  rowFromInvoiceLine,
} from './costLineRows.js';
import type { CostLineRow } from './types.js';

const VAT = 0.19;
const TARGET = { type: 'work_item' as const, id: 'w1', label: 'Tile the hallway' };

function budgetLine(overrides: Partial<BaseBudgetLine> = {}): BaseBudgetLine {
  return {
    id: 'b1',
    description: 'Hallway tiles',
    plannedAmount: 100,
    confidence: 'own_estimate',
    confidenceMargin: 0.2,
    budgetCategory: null,
    budgetSource: null,
    vendor: null,
    actualCost: 0,
    actualCostPaid: 0,
    invoiceCount: 0,
    invoiceLink: null,
    quantity: null,
    unit: null,
    unitPrice: null,
    includesVat: false,
    createdBy: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function link(overrides: Partial<NonNullable<BaseBudgetLine['invoiceLink']>> = {}) {
  return {
    invoiceBudgetLineId: 'ibl1',
    invoiceId: 'i1',
    invoiceNumber: 'INV-1',
    invoiceDate: '2026-03-01',
    invoiceStatus: 'pending' as const,
    itemizedAmount: 500,
    vendorId: 'v1',
    vendorName: 'Example Plumbing Co',
    ...overrides,
  };
}

function invoiceLine(
  overrides: Partial<InvoiceBudgetLineDetailResponse> = {},
): InvoiceBudgetLineDetailResponse {
  return {
    id: 'ibl1',
    invoiceId: 'i1',
    workItemBudgetId: 'wb1',
    householdItemBudgetId: null,
    itemizedAmount: 119,
    budgetLineDescription: 'Pipes',
    plannedAmount: 100,
    confidence: 'quote',
    categoryId: 'c1',
    categoryName: 'Plumbing',
    categoryColor: null,
    categoryTranslationKey: null,
    parentItemId: 'w1',
    parentItemTitle: 'Bathroom',
    parentItemType: 'work_item',
    parentItemArea: null,
    quantity: 2,
    unit: 'pcs',
    unitPrice: 50,
    includesVat: false,
    vendorId: 'v1',
    budgetSourceId: 's1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const DOC = {
  id: 'i1',
  status: 'pending' as const,
  invoiceNumber: 'INV-1',
  date: '2026-03-01',
  vendorName: 'Example Plumbing Co',
};

describe('costLineGross / costLineNet', () => {
  it('adds VAT to a net line and rounds to cents', () => {
    expect(costLineGross({ plannedAmount: 100, includesVat: false }, VAT)).toBe(119);
    expect(costLineGross({ plannedAmount: 100.01, includesVat: false }, VAT)).toBe(119.01);
  });

  it('leaves a gross line (or unknown VAT) as entered', () => {
    expect(costLineGross({ plannedAmount: 100, includesVat: true }, VAT)).toBe(100);
    expect(costLineGross({ plannedAmount: 100, includesVat: null }, VAT)).toBe(100);
  });

  it('keeps the stored net while the gross still describes the line', () => {
    expect(
      costLineNet(119, { plannedAmount: 100, includesVat: false, estimateDiffers: false }, VAT),
    ).toBe(100);
  });

  it('derives net from gross for gross lines and differing face values', () => {
    expect(
      costLineNet(119, { plannedAmount: 119, includesVat: true, estimateDiffers: false }, VAT),
    ).toBe(100);
    expect(
      costLineNet(238, { plannedAmount: 100, includesVat: false, estimateDiffers: true }, VAT),
    ).toBe(200);
  });
});

describe('rowFromBudgetLine', () => {
  it('unlinked net line 100 shows gross 119 and net 100 as an estimate with its margin', () => {
    const row = rowFromBudgetLine(budgetLine(), 'work_item', TARGET, VAT);
    expect(row).toMatchObject({
      gross: 119,
      net: 100,
      plannedGross: 119,
      estimateDiffers: false,
      state: 'estimate',
      basis: 'own_estimate',
      margin: 0.2,
      invoiceId: null,
      invoiceBudgetLineId: null,
      target: TARGET,
    });
  });

  it('a linked line takes its itemized face value, no margin, and flags the differing estimate', () => {
    const row = rowFromBudgetLine(
      budgetLine({ plannedAmount: 450, includesVat: true, invoiceLink: link() }),
      'household_item',
      TARGET,
      VAT,
    );
    expect(row).toMatchObject({
      gross: 500,
      plannedGross: 450,
      estimateDiffers: true,
      margin: 0,
      state: 'invoiced',
      lineType: 'household_item',
      invoiceId: 'i1',
      invoiceNumber: 'INV-1',
      invoiceVendorName: 'Example Plumbing Co',
      invoiceBudgetLineId: 'ibl1',
    });
  });

  it('a linked line equal to its estimate does not differ', () => {
    const row = rowFromBudgetLine(
      budgetLine({ plannedAmount: 500, includesVat: true, invoiceLink: link() }),
      'work_item',
      TARGET,
      VAT,
    );
    expect(row.estimateDiffers).toBe(false);
  });

  it('the state follows the link and never the confidence', () => {
    const a = rowFromBudgetLine(budgetLine({ confidence: 'invoice' }), 'work_item', TARGET, VAT);
    const b = rowFromBudgetLine(
      budgetLine({ confidence: 'own_estimate' }),
      'work_item',
      TARGET,
      VAT,
    );
    expect(a.state).toBe('estimate');
    expect(b.state).toBe('estimate');
    expect(a.margin).toBe(0);
  });

  it('carries category, source and company facts and null-fills the absent ones', () => {
    const row = rowFromBudgetLine(
      budgetLine({
        budgetCategory: {
          id: 'c1',
          name: 'Materials',
          description: null,
          color: null,
          translationKey: 'materials',
          sortOrder: 0,
          createdAt: '',
          updatedAt: '',
        },
        budgetSource: { id: 's1', name: 'Savings', sourceType: 'savings' },
        vendor: { id: 'v1', name: 'Example Tiles Ltd', trade: null },
        quantity: 3,
        unit: 'm2',
        unitPrice: 10,
      }),
      'work_item',
      TARGET,
      VAT,
    );
    expect(row).toMatchObject({
      categoryId: 'c1',
      categoryName: 'Materials',
      categoryTranslationKey: 'materials',
      budgetSourceId: 's1',
      budgetSourceName: 'Savings',
      vendorId: 'v1',
      vendorName: 'Example Tiles Ltd',
      quantity: 3,
      unit: 'm2',
      unitPrice: 10,
    });
    const bare = rowFromBudgetLine(budgetLine(), 'work_item', TARGET, VAT);
    expect(bare).toMatchObject({
      categoryId: null,
      categoryName: null,
      budgetSourceId: null,
      budgetSourceName: null,
      vendorId: null,
      vendorName: null,
    });
  });
});

describe('rowFromInvoiceLine', () => {
  const sources = new Map([['s1', 'Savings']]);

  it('uses the itemized amount as gross and maps the parent to the target', () => {
    const area = { id: 'a1', name: 'Kitchen', parentId: null, color: null, ancestors: [] };
    const row = rowFromInvoiceLine(
      invoiceLine({ parentItemArea: area as never }),
      DOC,
      VAT,
      sources,
    );
    expect(row).toMatchObject({
      id: 'wb1',
      lineType: 'work_item',
      gross: 119,
      net: 100,
      state: 'invoiced',
      margin: 0,
      basis: 'quote',
      description: 'Pipes',
      budgetSourceName: 'Savings',
      vendorName: null,
      invoiceId: 'i1',
      invoiceBudgetLineId: 'ibl1',
      target: { type: 'work_item', id: 'w1', label: 'Bathroom', area },
    });
  });

  it('household lines use the household budget id and type', () => {
    const row = rowFromInvoiceLine(
      invoiceLine({
        workItemBudgetId: null,
        householdItemBudgetId: 'hb1',
        parentItemType: 'household_item',
      }),
      DOC,
      VAT,
      sources,
    );
    expect(row.id).toBe('hb1');
    expect(row.lineType).toBe('household_item');
    expect(row.target?.type).toBe('household_item');
  });

  it('an orphan line has no target and falls back to its own id', () => {
    const row = rowFromInvoiceLine(
      invoiceLine({
        workItemBudgetId: null,
        parentItemType: 'unassigned',
        parentItemId: null,
        parentItemTitle: null,
      }),
      DOC,
      VAT,
      sources,
    );
    expect(row.target).toBeNull();
    expect(row.id).toBe('ibl1');
  });

  it('an unknown parent title becomes empty and an unknown source stays null', () => {
    const row = rowFromInvoiceLine(
      invoiceLine({ parentItemTitle: null, budgetSourceId: 'missing' }),
      DOC,
      VAT,
      sources,
    );
    expect(row.target?.label).toBe('');
    expect(row.budgetSourceName).toBeNull();
    const none = rowFromInvoiceLine(invoiceLine({ budgetSourceId: null }), DOC, VAT, sources);
    expect(none.budgetSourceName).toBeNull();
  });
});

function row(overrides: Partial<CostLineRow>): CostLineRow {
  return {
    ...rowFromBudgetLine(budgetLine(), 'work_item', TARGET, VAT),
    ...overrides,
  };
}

describe('groupForItem', () => {
  it('puts Estimates first, then documents by date and number, with totals', () => {
    const rows = [
      row({
        id: 'r1',
        invoiceId: 'i2',
        invoiceNumber: 'B',
        invoiceDate: '2026-02-01',
        gross: 20,
        plannedGross: 10,
        invoiceStatus: 'paid',
      }),
      row({
        id: 'r2',
        invoiceId: 'i1',
        invoiceNumber: 'A',
        invoiceDate: '2026-03-01',
        gross: 30,
        plannedGross: 30,
        invoiceStatus: 'pending',
      }),
      row({ id: 'r3', gross: 5.1, plannedGross: 5.1 }),
      row({ id: 'r4', gross: 4.2, plannedGross: 4.2 }),
      row({
        id: 'r5',
        invoiceId: 'i2',
        invoiceNumber: 'B',
        invoiceDate: '2026-02-01',
        gross: 1,
        plannedGross: 1,
        invoiceStatus: 'paid',
      }),
      row({
        id: 'r6',
        invoiceId: 'i3',
        invoiceNumber: 'C',
        invoiceDate: '2026-02-01',
        gross: 2,
        plannedGross: 2,
        invoiceStatus: 'paid',
      }),
    ];
    const groups = groupForItem(rows);
    expect(groups.map((g) => g.id)).toEqual([
      'estimates',
      'document-i2',
      'document-i3',
      'document-i1',
    ]);
    expect(groups[0]).toMatchObject({ heading: { kind: 'estimates' }, total: 9.3 });
    expect(groups[1]).toMatchObject({ total: 21, plannedTotal: 11 });
    expect(groups[1]?.rows.map((r) => r.id)).toEqual(['r1', 'r5']);
    expect(groups[3]?.heading).toMatchObject({
      kind: 'document',
      invoiceId: 'i1',
      invoiceNumber: 'A',
      invoiceStatus: 'pending',
    });
  });

  it('omits the Estimates group when every line is linked and sorts missing dates first', () => {
    const groups = groupForItem([
      row({
        id: 'r1',
        invoiceId: 'i1',
        invoiceDate: '2026-01-01',
        invoiceNumber: null,
        invoiceStatus: 'paid',
      }),
      row({
        id: 'r2',
        invoiceId: 'i2',
        invoiceDate: null,
        invoiceNumber: null,
        invoiceStatus: 'paid',
      }),
    ]);
    expect(groups.map((g) => g.id)).toEqual(['document-i2', 'document-i1']);
  });

  it('orders documents of the same date by invoice number, missing numbers first', () => {
    const groups = groupForItem([
      row({ id: 'r1', invoiceId: 'i1', invoiceDate: '2026-01-01', invoiceNumber: 'B' }),
      row({ id: 'r2', invoiceId: 'i2', invoiceDate: '2026-01-01', invoiceNumber: 'A' }),
      row({ id: 'r3', invoiceId: 'i3', invoiceDate: '2026-01-01', invoiceNumber: null }),
    ]);
    expect(groups.map((g) => g.id)).toEqual(['document-i3', 'document-i2', 'document-i1']);
  });

  it('sorts the same pairs whichever order they arrive in', () => {
    const rows = [
      row({ id: 'r1', invoiceId: 'i1', invoiceDate: null, invoiceNumber: 'B' }),
      row({ id: 'r2', invoiceId: 'i2', invoiceDate: '2026-01-01', invoiceNumber: null }),
      row({ id: 'r3', invoiceId: 'i3', invoiceDate: null, invoiceNumber: null }),
      row({ id: 'r4', invoiceId: 'i4', invoiceDate: '2026-01-01', invoiceNumber: 'A' }),
    ];
    const forward = groupForItem(rows).map((g) => g.id);
    const backward = groupForItem([...rows].reverse()).map((g) => g.id);
    expect(forward).toEqual(['document-i3', 'document-i1', 'document-i2', 'document-i4']);
    expect(backward).toEqual(forward);
  });

  it('is empty without rows', () => {
    expect(groupForItem([])).toEqual([]);
  });
});

describe('groupForDocument', () => {
  const T1 = { type: 'work_item' as const, id: 'w1', label: 'Tile the hallway' };
  const T2 = { type: 'household_item' as const, id: 'h1', label: 'Bathroom tiles' };

  it('S9: groups by task or purchase in order of first appearance, with totals', () => {
    const rows = [
      row({ id: 'a', target: T2, gross: 10, plannedGross: 8 }),
      row({ id: 'b', target: T1, gross: 5, plannedGross: 5 }),
      row({ id: 'c', target: T2, gross: 7, plannedGross: 6 }),
    ];
    const groups = groupForDocument(rows);
    expect(groups.map((g) => g.id)).toEqual(['target-household_item-h1', 'target-work_item-w1']);
    expect(groups[0]).toMatchObject({
      heading: { kind: 'target', target: T2 },
      total: 17,
      plannedTotal: 14,
    });
    expect(groups[0]?.rows.map((r) => r.id)).toEqual(['a', 'c']);
    expect(groups[1]).toMatchObject({ total: 5, plannedTotal: 5 });
  });

  it('keeps a work item and a purchase with the same id in separate groups', () => {
    const groups = groupForDocument([
      row({ id: 'a', target: { type: 'work_item', id: 'x', label: 'Task X' } }),
      row({ id: 'b', target: { type: 'household_item', id: 'x', label: 'Purchase X' } }),
    ]);
    expect(groups.map((g) => g.id)).toEqual(['target-work_item-x', 'target-household_item-x']);
  });

  it('puts lines without a task or purchase in a last "unassigned" group, even when they come first', () => {
    const groups = groupForDocument([
      row({ id: 'a', target: null, gross: 3, plannedGross: 2 }),
      row({ id: 'b', target: T1, gross: 5 }),
      row({ id: 'c', target: null, gross: 4, plannedGross: 4 }),
    ]);
    expect(groups.map((g) => g.id)).toEqual(['target-work_item-w1', 'unassigned']);
    expect(groups[1]).toMatchObject({
      heading: { kind: 'target', target: null },
      total: 7,
      plannedTotal: 6,
    });
    expect(groups[1]?.rows.map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('returns only the unassigned group when no line has a target', () => {
    const groups = groupForDocument([row({ id: 'a', target: null })]);
    expect(groups.map((g) => g.id)).toEqual(['unassigned']);
  });

  it('returns no group for no rows', () => {
    expect(groupForDocument([])).toEqual([]);
  });
});

describe('invoiceLineKey (#2240, D4)', () => {
  it('is the invoice budget line id of a document row, not the task budget id', () => {
    const row = rowFromInvoiceLine(
      invoiceLine({ id: 'ibl-9', workItemBudgetId: 'wb-9' }),
      DOC,
      VAT,
      new Map(),
    );
    expect(row.id).toBe('wb-9');
    expect(invoiceLineKey(row)).toBe('ibl-9');
  });
});

describe('remainingState', () => {
  it('0.99 is none, 1.00 is notYetSplit, -0.01 is over', () => {
    expect(remainingState(0.99)).toBe('none');
    expect(remainingState(1)).toBe('notYetSplit');
    expect(remainingState(250)).toBe('notYetSplit');
    expect(remainingState(0)).toBe('none');
    expect(remainingState(-0.004)).toBe('none');
    expect(remainingState(-0.01)).toBe('over');
    expect(remainingState(-40)).toBe('over');
  });
});

describe('defect regressions', () => {
  it('D-19: an invoice line planned amount shows gross, the same as on the item page', () => {
    const fromInvoice = rowFromInvoiceLine(
      invoiceLine({ plannedAmount: 100, includesVat: false, itemizedAmount: 119 }),
      DOC,
      VAT,
      new Map(),
    );
    const fromItem = rowFromBudgetLine(
      budgetLine({ plannedAmount: 100, includesVat: false }),
      'work_item',
      TARGET,
      VAT,
    );
    expect(fromInvoice.plannedGross).toBe(119);
    expect(fromItem.plannedGross).toBe(119);
    expect(fromInvoice.plannedGross).toBe(fromItem.plannedGross);
    expect(fromInvoice.estimateDiffers).toBe(false);
  });

  it('D-20: remaining subtracts lines already linked', () => {
    const lines = [
      rowFromInvoiceLine(invoiceLine({ id: 'a', itemizedAmount: 60 }), DOC, VAT, new Map()),
      rowFromInvoiceLine(invoiceLine({ id: 'b', itemizedAmount: 39.01 }), DOC, VAT, new Map()),
    ];
    const [group] = groupForDocument(lines);
    expect(group?.total).toBe(99.01);
    expect(remainingState(100 - group!.total)).toBe('none'); // 0.99 left
    expect(remainingState(101.01 - group!.total)).toBe('notYetSplit'); // 2.00 left
    expect(remainingState(100.01 - group!.total)).toBe('notYetSplit'); // 1.00 left
    expect(remainingState(99 - group!.total)).toBe('over'); // -0.01
  });

  it('D-27: a fully split invoice is neutral, never over/red', () => {
    expect(remainingState(0)).toBe('none');
    expect(remainingState(0.004)).toBe('none');
    expect(remainingState(-0.004)).toBe('none');
    const [group] = groupForDocument([
      rowFromInvoiceLine(invoiceLine({ itemizedAmount: 0.1 }), DOC, VAT, new Map()),
      rowFromInvoiceLine(invoiceLine({ id: 'b', itemizedAmount: 0.2 }), DOC, VAT, new Map()),
    ]);
    // 0.1 + 0.2 must not leave a float residue that reads as over.
    expect(remainingState(0.3 - group!.total)).toBe('none');
  });
});

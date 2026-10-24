import { describe, it, expect } from '@jest/globals';
import type { ApiClientError } from '../../lib/apiClient.js';
import {
  blankGridRow,
  buildBatch,
  duplicateRow,
  gridRowGross,
  isBlankRow,
  mapServerErrors,
  nextRowId,
  rowPlannedAmount,
  rowsToSave,
  validateGridRows,
  withTrailingBlank,
} from './costLineGridModel.js';
import type { BatchContext } from './costLineGridModel.js';
import type { CostLineGridOptions, CostLineGridRow } from './types.js';

const TASK = { type: 'work_item' as const, id: 'w1', label: 'Tiling' };
const row = (patch: Partial<CostLineGridRow> = {}): CostLineGridRow => ({
  ...blankGridRow(patch.rowId ?? 'r1'),
  ...patch,
});
const messages = {
  description: 'D',
  quantity: 'Q',
  unitPrice: 'P',
  number: 'N',
  amountPositive: 'A',
  belongsTo: 'B',
};
const ctx = { locale: 'en' as const, vatRate: 0.19 };
const options: CostLineGridOptions = { targets: true, requireTarget: true, positiveGross: true };

describe('row basics', () => {
  it('creates unique ids and blank rows with defaults', () => {
    expect(nextRowId()).not.toBe(nextRowId());
    expect(blankGridRow('x')).toMatchObject({ includesVat: false, target: null, included: true });
    expect(
      blankGridRow('x', {
        includesVat: true,
        target: TASK,
        budgetCategoryId: 'c',
        budgetSourceId: 's',
      }),
    ).toMatchObject({
      includesVat: true,
      target: TASK,
      budgetCategoryId: 'c',
      budgetSourceId: 's',
    });
  });

  it('treats a row with only a target as blank but not one with a notice, link or certainty', () => {
    expect(isBlankRow(row({ target: TASK }))).toBe(true);
    expect(isBlankRow(row({ description: 'a' }))).toBe(false);
    expect(isBlankRow(row({ unit: 'm' }))).toBe(false);
    expect(isBlankRow(row({ notice: { tone: 'busy', text: 't' } }))).toBe(false);
    expect(isBlankRow(row({ aiCertainty: 0.5 }))).toBe(false);
    expect(
      isBlankRow(
        row({ existingLine: { id: 'e', type: 'work_item', description: null, gross: 1 } }),
      ),
    ).toBe(false);
  });

  it('keeps exactly one trailing blank row', () => {
    let n = 0;
    const make = () => `n${++n}`;
    expect(withTrailingBlank([], make)).toHaveLength(1);
    expect(withTrailingBlank([row({ description: 'a' })], make)).toHaveLength(2);
    expect(withTrailingBlank([row({ description: 'a' }), row({ rowId: 'b' })], make)).toHaveLength(
      2,
    );
    expect(
      withTrailingBlank(
        [row({ description: 'a' }), row({ rowId: 'b' }), row({ rowId: 'c' })],
        make,
      ),
    ).toHaveLength(2);
  });

  it('drops blank and excluded rows on save', () => {
    const rows = [
      row({ rowId: 'a', description: 'x' }),
      row({ rowId: 'b', description: 'y', included: false }),
      row({ rowId: 'c' }),
    ];
    expect(rowsToSave(rows, {}).map((r) => r.rowId)).toEqual(['a', 'b']);
    expect(rowsToSave(rows, { include: true }).map((r) => r.rowId)).toEqual(['a']);
  });

  it('duplicates without the existing link, notice or AI data', () => {
    const copy = duplicateRow(
      row({
        description: 'x',
        included: false,
        aiCertainty: 0.9,
        notice: { tone: 'error', text: 't' },
        existingLine: { id: 'e', type: 'work_item', description: null, gross: 1 },
      }),
      'new',
    );
    expect(copy).toMatchObject({
      rowId: 'new',
      description: 'x',
      existingLine: null,
      notice: undefined,
      aiCertainty: undefined,
      included: true,
    });
  });
});

describe('amounts', () => {
  it('multiplies quantity by price and grosses up net rows', () => {
    const r = row({ quantity: '2', unitPrice: '10' });
    expect(rowPlannedAmount(r, 'en')).toBe(20);
    expect(gridRowGross(r, 0.19, 'en')).toBe(23.8);
    expect(gridRowGross({ ...r, includesVat: true }, 0.19, 'en')).toBe(20);
  });

  it('uses the unit price as the single amount for a blank quantity or existing line', () => {
    expect(rowPlannedAmount(row({ unitPrice: '5' }), 'en')).toBe(5);
    const linked = row({
      quantity: '3',
      unitPrice: '119',
      existingLine: { id: 'e', type: 'work_item', description: null, gross: 119 },
    });
    expect(gridRowGross(linked, 0.19, 'en')).toBe(119);
  });

  it('is NaN while incomplete', () => {
    expect(gridRowGross(row({ quantity: '2' }), 0.19, 'en')).toBeNaN();
  });
});

describe('validateGridRows', () => {
  it('skips blank, excluded and notice rows', () => {
    const rows = [
      row({ rowId: 'a' }),
      row({ rowId: 'b', description: 'x', included: false }),
      row({ rowId: 'c', description: 'x', notice: { tone: 'busy', text: 't' } }),
    ];
    expect(validateGridRows(rows, { ...options, include: true }, null, ctx, messages).size).toBe(0);
  });

  it('reports each field problem', () => {
    const cases: [Partial<CostLineGridRow>, Record<string, string>][] = [
      [
        { description: ' ', unitPrice: '1', unit: 'x' },
        { description: 'D', target: 'B' },
      ],
      [{ description: 'a'.repeat(501), unitPrice: '1', target: TASK }, { description: 'D' }],
      [{ description: 'a', quantity: 'zz', unitPrice: '1', target: TASK }, { quantity: 'N' }],
      [{ description: 'a', quantity: '0', unitPrice: '1', target: TASK }, { quantity: 'Q' }],
      [{ description: 'a', unitPrice: '', target: TASK }, { unitPrice: 'P' }],
      [{ description: 'a', unitPrice: 'zz', target: TASK }, { unitPrice: 'N' }],
      [{ description: 'a', unitPrice: '-1', target: TASK }, { unitPrice: 'P' }],
      [{ description: 'a', unitPrice: '0', target: TASK }, { unitPrice: 'A' }],
    ];
    for (const [patch, expected] of cases) {
      const map = validateGridRows([row(patch)], options, null, ctx, messages);
      expect(map.get('r1')).toMatchObject(expected);
    }
  });

  it('accepts valid rows, Assign all to and linked rows', () => {
    expect(
      validateGridRows([row({ description: 'a', unitPrice: '1' })], options, TASK, ctx, messages)
        .size,
    ).toBe(0);
    const linked = row({
      unitPrice: '5',
      existingLine: { id: 'e', type: 'work_item', description: 'x', gross: 5 },
    });
    expect(validateGridRows([linked], options, null, ctx, messages).size).toBe(0);
    expect(
      validateGridRows(
        [row({ description: 'a', unitPrice: '0' })],
        { targets: false, requireTarget: false, positiveGross: false },
        null,
        ctx,
        messages,
      ).size,
    ).toBe(0);
  });
});

describe('buildBatch', () => {
  const base: BatchContext = {
    assignAll: null,
    fallbackTarget: null,
    documentStatus: null,
    discretionarySourceId: 'disc',
    locale: 'en',
    vatRate: 0.19,
  };

  it('builds create entries with unit pricing and the discretionary source fallback', () => {
    const r = row({
      description: ' Tile ',
      quantity: '2',
      unit: ' m2 ',
      unitPrice: '10',
      target: TASK,
      budgetCategoryId: 'cat',
    });
    const { lines, rowIds } = buildBatch([r], base);
    expect(rowIds).toEqual(['r1']);
    expect(lines[0]).toMatchObject({
      kind: 'create',
      targetType: 'work_item',
      targetId: 'w1',
      description: 'Tile',
      plannedAmount: 20,
      quantity: 2,
      unit: 'm2',
      unitPrice: 10,
      includesVat: false,
      confidence: 'own_estimate',
      budgetCategoryId: 'cat',
      budgetSourceId: 'disc',
    });
  });

  it('builds a direct-amount entry, document confidence and own source', () => {
    const r = row({ description: 'a', unitPrice: '50', budgetSourceId: 'own' });
    const quote = buildBatch([r], { ...base, fallbackTarget: TASK, documentStatus: 'quotation' });
    expect(quote.lines[0]).toMatchObject({
      quantity: null,
      unit: null,
      unitPrice: null,
      plannedAmount: 50,
      confidence: 'quote',
      budgetSourceId: 'own',
    });
    const inv = buildBatch([r], { ...base, assignAll: TASK, documentStatus: 'paid' });
    expect(inv.lines[0]).toMatchObject({ confidence: 'invoice' });
    const noUnit = buildBatch([{ ...r, quantity: '1' }], { ...base, assignAll: TASK });
    expect(noUnit.lines[0]).toMatchObject({ unit: null });
    expect(
      buildBatch([{ ...r, budgetSourceId: null }], {
        ...base,
        assignAll: TASK,
        discretionarySourceId: null,
      }).lines[0],
    ).toMatchObject({ budgetSourceId: '' });
  });

  it('links existing lines and skips rows without a target', () => {
    const linked = row({
      rowId: 'l',
      unitPrice: '119',
      existingLine: { id: 'e1', type: 'household_item', description: 'x', gross: 119 },
    });
    const orphan = row({ rowId: 'o', description: 'a', unitPrice: '1' });
    const { lines, rowIds } = buildBatch([linked, orphan], base);
    expect(lines).toEqual([
      { kind: 'link', budgetLineType: 'household_item', budgetLineId: 'e1', itemizedAmount: 119 },
    ]);
    expect(rowIds).toEqual(['l']);
  });
});

describe('mapServerErrors', () => {
  const msgs = {
    description: 'D',
    quantity: 'Q',
    unitPrice: 'P',
    belongsTo: 'B',
    overInvoice: 'O',
    alreadyLinked: 'L',
  };
  const err = (code: string, details?: Record<string, unknown>) =>
    ({ error: { code, message: 'm', details } }) as unknown as ApiClientError;

  it('maps field paths to cells', () => {
    const { errors, unmapped } = mapServerErrors(
      err('VALIDATION_ERROR', {
        fields: [
          { path: '/lines/0/description' },
          { path: '/lines/0/quantity' },
          { path: '/lines/1/plannedAmount' },
          { path: '/lines/1/targetId' },
        ],
      }),
      ['a', 'b'],
      msgs,
    );
    expect(unmapped).toBe(false);
    expect(errors.get('a')).toEqual({ description: 'D', quantity: 'Q' });
    expect(errors.get('b')).toEqual({ unitPrice: 'P', target: 'B' });
  });

  it('marks unplaceable entries as unmapped', () => {
    const { errors, unmapped } = mapServerErrors(
      err('VALIDATION_ERROR', {
        fields: [
          { path: '/lines/9/description' },
          { path: '/lines/0' },
          'junk',
          { path: '/lines/0/zzz' },
        ],
      }),
      ['a'],
      msgs,
    );
    expect(unmapped).toBe(true);
    expect(errors.size).toBe(0);
  });

  it('maps details.index by error code', () => {
    const run = (code: string) => mapServerErrors(err(code, { index: 1 }), ['a', 'b'], msgs);
    expect(run('ITEMIZED_SUM_EXCEEDS_INVOICE').errors.get('b')).toEqual({ unitPrice: 'O' });
    expect(run('BUDGET_LINE_ALREADY_LINKED').errors.get('b')).toEqual({ unitPrice: 'L' });
    expect(run('NOT_FOUND').errors.get('b')).toEqual({ target: 'B' });
    expect(run('VALIDATION_ERROR').unmapped).toBe(true);
  });

  it('is unmapped without details', () => {
    expect(mapServerErrors(err('INTERNAL_ERROR'), ['a'], msgs).unmapped).toBe(true);
  });
});

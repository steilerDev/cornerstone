/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { renderHook } from '@testing-library/react';
import { makeCostLineRow, makeLinkedRow } from '../../test/costLineFixtures.js';
import type { CostLineHost } from '../CostLineTable/types.js';
import type { ObjectFormRenderContext, ObjectFormSchema } from '../ObjectForm/types.js';
import type * as AssignTypes from '../../lib/budgetLineAssignApi.js';
import type * as BatchTypes from '../../lib/budgetLinesBatchApi.js';
import type * as WorkTypes from '../../lib/workItemBudgetsApi.js';
import type * as HouseholdTypes from '../../lib/householdItemBudgetsApi.js';
import type * as InvoiceLinesTypes from '../../lib/invoiceBudgetLinesApi.js';
import type * as SchemaTypes from './costLineSchema.js';
import type { CostLineFormProps } from './types.js';
import type { CostLineOptions } from './useCostLineOptions.js';

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => ({
  useLocale: () => ({
    locale: 'en',
    resolvedLocale: 'en',
    currency: 'EUR',
    vatRate: 0.19,
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  }),
  RESOLVED_LOCALES: ['en', 'de'],
  LocaleProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.unstable_mockModule('../../hooks/useTrades.js', () => ({
  useTrades: () => ({ trades: [], isLoading: false, isInitialLoading: false, error: null }),
}));
const mockAssign = jest.fn<typeof AssignTypes.assignBudgetLine>();
jest.unstable_mockModule('../../lib/budgetLineAssignApi.js', () => ({
  assignBudgetLine: mockAssign,
}));
const mockBatch = jest.fn<typeof BatchTypes.createBudgetLinesBatch>();
jest.unstable_mockModule('../../lib/budgetLinesBatchApi.js', () => ({
  createBudgetLinesBatch: mockBatch,
}));
const mockCreateWork = jest.fn<typeof WorkTypes.createWorkItemBudget>();
const mockUpdateWork = jest.fn<typeof WorkTypes.updateWorkItemBudget>();
jest.unstable_mockModule('../../lib/workItemBudgetsApi.js', () => ({
  createWorkItemBudget: mockCreateWork,
  updateWorkItemBudget: mockUpdateWork,
  fetchWorkItemBudgets: jest.fn(),
  deleteWorkItemBudget: jest.fn(),
}));
const mockUpdateHousehold = jest.fn<typeof HouseholdTypes.updateHouseholdItemBudget>();
jest.unstable_mockModule('../../lib/householdItemBudgetsApi.js', () => ({
  createHouseholdItemBudget: jest.fn(),
  updateHouseholdItemBudget: mockUpdateHousehold,
  fetchHouseholdItemBudgets: jest.fn(),
  deleteHouseholdItemBudget: jest.fn(),
}));
const mockEditAndMove = jest.fn<typeof InvoiceLinesTypes.editAndMoveBudgetLine>();
jest.unstable_mockModule('../../lib/invoiceBudgetLinesApi.js', () => ({
  fetchInvoiceBudgetLines: jest.fn(),
  createInvoiceBudgetLine: jest.fn(),
  editAndMoveBudgetLine: mockEditAndMove,
  deleteInvoiceBudgetLine: jest.fn(),
}));

const TASK: CostLineHost = { kind: 'work_item', id: 'wi-1', label: 'Lay floors' };
const INVOICE: CostLineHost = {
  kind: 'invoice',
  id: 'inv-1',
  label: 'Acme · 1',
  status: 'pending',
  amount: 100,
  vendorId: 'v1',
};

const OPTIONS: CostLineOptions = {
  categories: [],
  sources: [],
  categoryOptions: [],
  sourceOptions: [],
  discretionarySourceId: null,
  loading: false,
  failed: false,
};

describe('useCostLineSchema (direct)', () => {
  let Schema: typeof SchemaTypes;
  const onSaved = jest.fn<() => void>();

  beforeEach(async () => {
    for (const mock of [
      mockAssign,
      mockBatch,
      mockCreateWork,
      mockUpdateWork,
      mockUpdateHousehold,
      mockEditAndMove,
      onSaved,
    ]) {
      (mock as jest.Mock).mockReset();
    }
    mockBatch.mockResolvedValue({ lines: [], remainingAmount: null } as never);
    mockAssign.mockResolvedValue({} as never);
    mockEditAndMove.mockResolvedValue({} as never);
    mockUpdateHousehold.mockResolvedValue({} as never);
    if (!Schema) Schema = await import('./costLineSchema.js');
  });

  function build(
    props: Partial<CostLineFormProps> = {},
    options: CostLineOptions = OPTIONS,
  ): ObjectFormSchema {
    const { result } = renderHook(() =>
      Schema.useCostLineSchema(
        {
          host: TASK,
          mode: { kind: 'create' },
          onSaved,
          onClose: () => {},
          ...props,
        },
        options,
      ),
    );
    return result.current;
  }

  const ctxWith = (values: Record<string, unknown>): ObjectFormRenderContext => ({
    id: 'f',
    value: values.existingLineId ?? null,
    setValue: () => {},
    busy: false,
    invalid: false,
    describedBy: undefined,
    createChild: () => {},
    values,
  });

  it('adds the target field first on a document and none on a task create', () => {
    expect(build().fields.map((f) => f.name)).not.toContain('target');
    const names = build({ host: INVOICE }).fields.map((f) => f.name);
    expect(names.slice(0, 3)).toEqual(['description', 'target', 'existingLineId']);
    expect(names).not.toContain('confidence');
  });

  it('keeps the target under More details on an edit', () => {
    const fields = build({ mode: { kind: 'edit', row: makeCostLineRow() } }).fields;
    const target = fields.find((f) => f.name === 'target')!;
    expect(target.essential).toBe(false);
    expect(target.required).toBe(false);
    expect(fields.map((f) => f.name)).toContain('confidence');
  });

  it('titles the form by mode and offers Add another on create only', () => {
    expect(build().title).toBe('New cost line');
    expect(build().addAnother).toBe(true);
    const edit = build({ mode: { kind: 'edit', row: makeCostLineRow() } });
    expect(edit.title).toBe('Edit cost line');
    expect(edit.addAnother).toBe(false);
    expect(build({ host: INVOICE, mode: { kind: 'assign', row: makeLinkedRow() } }).title).toBe(
      'Assign cost line',
    );
    expect(build().addedMessage?.({ id: '1', href: '', label: 'x' })).toBe(
      'Saved. Add the next line.',
    );
  });

  it('shows a loading source and category list as empty options', () => {
    const fields = build({}, { ...OPTIONS, loading: true }).fields;
    expect(fields.find((f) => f.name === 'budgetCategoryId')!.options).toEqual([]);
    expect(fields.find((f) => f.name === 'budgetSourceId')!.options).toEqual([]);
    expect(fields.find((f) => f.name === 'budgetSourceId')!.optionsLoading).toBe(true);
  });

  it('only picks the first source as the default on create', () => {
    const edit = build({ mode: { kind: 'edit', row: makeCostLineRow() } });
    expect(
      edit.fields.find((f) => f.name === 'budgetSourceId')!.defaultFromOptions,
    ).toBeUndefined();
    expect(build().fields.find((f) => f.name === 'budgetSourceId')!.defaultFromOptions).toBe(
      'first',
    );
  });

  it('shows the existing-line field only while a target is picked', () => {
    const field = build({ host: INVOICE }).fields.find((f) => f.name === 'existingLineId')!;
    expect(field.visibleWhen!({ target: null })).toBe(false);
    expect(field.visibleWhen!({ target: { type: 'work_item', id: 'x', label: 'x' } })).toBe(true);
    expect(field.render!(ctxWith({ target: null }))).toBeNull();
  });

  it('hides the price fields behind the right pricing and existing-line state', () => {
    const fields = build().fields;
    const get = (name: string) => fields.find((f) => f.name === name)!;
    expect(get('quantity').visibleWhen!({ pricing: 'unit' })).toBe(true);
    expect(get('quantity').visibleWhen!({ pricing: 'direct' })).toBe(false);
    expect(get('amount').visibleWhen!({ pricing: 'direct' })).toBe(true);
    expect(get('amount').visibleWhen!({ pricing: 'unit' })).toBe(false);
    const existing = { id: 'x', type: 'work_item', description: null, gross: 1 };
    expect(get('amount').visibleWhen!({ pricing: 'unit', existingLineId: existing })).toBe(true);
    expect(get('quantity').visibleWhen!({ existingLineId: existing })).toBe(false);
    expect(get('includesVat').visibleWhen!({ existingLineId: existing })).toBe(false);
    expect(get('pricing').visibleWhen!({ existingLineId: existing })).toBe(false);
  });

  it('throws when a document line is submitted without a target', async () => {
    const schema = build({ host: INVOICE });
    await expect(schema.submit({ description: 'Tiles' })).rejects.toThrow(
      'A document cost line needs a target',
    );
    expect(mockBatch).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('throws when the batch answers without an entry for the line sent', async () => {
    const schema = build({ host: INVOICE });
    await expect(
      schema.submit({
        description: 'Tiles',
        target: { type: 'work_item', id: 'wi-1', label: 'x' },
        quantity: '1',
        unitPrice: '5',
      }),
    ).rejects.toThrow('The batch response has no entry for the line sent');
    expect(mockBatch).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('returns the created budget line id from the first batch entry', async () => {
    mockBatch.mockResolvedValue({
      lines: [{ index: 0, budgetLineId: 'bl-new' }],
      remainingAmount: null,
    } as never);
    const schema = build({ host: INVOICE });
    const result = await schema.submit({
      description: 'Tiles',
      target: { type: 'work_item', id: 'wi-1', label: 'x' },
      quantity: '1',
      unitPrice: '5',
    });
    expect(result.id).toBe('bl-new');
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('does not assign without a target', async () => {
    const row = makeLinkedRow({ target: null });
    const schema = build({ host: INVOICE, mode: { kind: 'assign', row } });
    const result = await schema.submit({ description: 'Oak flooring' });
    expect(result.id).toBe('bl-1');
    expect(mockAssign).not.toHaveBeenCalled();
  });

  it('assigns with no category when the line has none', async () => {
    const row = makeLinkedRow({ target: null, categoryId: null });
    const schema = build({ host: INVOICE, mode: { kind: 'assign', row } });
    await schema.submit({
      ...schema.initialValues,
      target: { type: 'work_item', id: 'wi-1', label: 'x' },
    });
    expect(mockAssign).toHaveBeenCalledWith('bl-1', {
      targetType: 'work_item',
      targetId: 'wi-1',
      budgetCategoryId: null,
    });
    expect(mockEditAndMove).not.toHaveBeenCalled();
  });

  it('falls back to the host for the parent of an unlinked purchase line', async () => {
    const row = makeCostLineRow({ lineType: 'household_item', target: null });
    const schema = build({
      host: { kind: 'household_item', id: 'hi-7', label: 'Sofa' },
      mode: { kind: 'edit', row },
    });
    await schema.submit({ ...schema.initialValues, description: 'Changed' });
    expect(mockUpdateHousehold).toHaveBeenCalledWith('hi-7', 'bl-1', { description: 'Changed' });
  });

  it('maps no code other than the over-invoice and already-linked ones', () => {
    const schema = build({ host: INVOICE });
    expect(schema.mapError!('SOMETHING_ELSE', {})).toBeNull();
    expect(schema.mapError!('BUDGET_LINE_ALREADY_LINKED', {})).toEqual({
      existingLineId: 'This line is already linked to an offer or invoice.',
    });
  });
});

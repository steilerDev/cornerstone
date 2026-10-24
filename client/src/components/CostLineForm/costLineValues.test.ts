import { describe, it, expect } from '@jest/globals';
import { makeCostLineRow, makeLinkedRow } from '../../test/costLineFixtures.js';
import type { CostLineHost } from '../CostLineTable/types.js';
import {
  computeGross,
  computeNet,
  confidenceFor,
  hostTarget,
  initialValues,
  isEmptyPayload,
  readValues,
  toBatchCreate,
  toCreatePayload,
  toEditPayload,
  validateValues,
} from './costLineValues.js';
import type { CostLineValues, ValidateContext } from './costLineValues.js';

const VAT = 0.19;
const TASK: CostLineHost = { kind: 'work_item', id: 'wi-1', label: 'Lay floors' };
const PURCHASE: CostLineHost = { kind: 'household_item', id: 'hi-1', label: 'Sofa' };
const INVOICE: CostLineHost = {
  kind: 'invoice',
  id: 'inv-1',
  label: 'Acme · 1',
  status: 'pending',
  amount: 1000,
  vendorId: 'v-1',
};
const OFFER: CostLineHost = { ...INVOICE, status: 'quotation' };

const messages = {
  description: 'E-description',
  quantity: 'E-quantity',
  unitPrice: 'E-unitPrice',
  amount: 'E-amount',
  amountPositive: 'E-amountPositive',
  belongsTo: 'E-belongsTo',
  moveType: 'E-moveType',
};

function values(over: Partial<CostLineValues> = {}): CostLineValues {
  return {
    description: 'Tiles',
    target: null,
    existingLineId: null,
    pricing: 'unit',
    quantity: '10',
    unit: 'm2',
    unitPrice: '50',
    amount: '',
    includesVat: false,
    budgetCategoryId: '',
    budgetSourceId: '',
    vendorId: '',
    confidence: 'own_estimate',
    ...over,
  };
}

const ctx = (over: Partial<ValidateContext> = {}): ValidateContext => ({
  host: TASK,
  mode: { kind: 'create' },
  messages,
  ...over,
});

describe('readValues', () => {
  it('falls back to defaults for an empty map', () => {
    expect(readValues({})).toEqual({
      description: '',
      target: null,
      existingLineId: null,
      pricing: 'unit',
      quantity: '',
      unit: '',
      unitPrice: '',
      amount: '',
      includesVat: false,
      budgetCategoryId: '',
      budgetSourceId: '',
      vendorId: '',
      confidence: 'own_estimate',
    });
  });

  it('reads typed values and ignores non-string text fields', () => {
    const target = { type: 'work_item' as const, id: 'wi-2', label: 'Paint' };
    const read = readValues({
      description: 'Paint',
      target,
      pricing: 'direct',
      amount: 12,
      includesVat: true,
      confidence: 'quote',
    });
    expect(read.description).toBe('Paint');
    expect(read.target).toBe(target);
    expect(read.pricing).toBe('direct');
    expect(read.amount).toBe('');
    expect(read.includesVat).toBe(true);
    expect(read.confidence).toBe('quote');
  });
});

describe('hostTarget', () => {
  it('is the host itself for a task or purchase and null for an invoice', () => {
    expect(hostTarget(TASK)).toEqual({
      type: 'work_item',
      id: 'wi-1',
      label: 'Lay floors',
      area: null,
    });
    expect(hostTarget(PURCHASE)?.type).toBe('household_item');
    expect(hostTarget(INVOICE)).toBeNull();
  });
});

describe('initialValues', () => {
  it('starts a new line with unit pricing, Net and the discretionary source', () => {
    const initial = initialValues(TASK, { kind: 'create' }, undefined, 'src-d');
    expect(initial).toMatchObject({
      pricing: 'unit',
      includesVat: false,
      confidence: 'own_estimate',
      budgetSourceId: 'src-d',
      description: '',
    });
    expect((initial.target as { id: string }).id).toBe('wi-1');
  });

  it('leaves the source empty without a discretionary source and the target empty on a document', () => {
    const initial = initialValues(INVOICE, { kind: 'create' }, undefined, null);
    expect(initial.budgetSourceId).toBe('');
    expect(initial.target).toBeNull();
  });

  it('prefills a unit-priced edit from the row', () => {
    const row = makeCostLineRow({ vendorId: 'v-9', description: null, unit: null });
    const initial = initialValues(TASK, { kind: 'edit', row }, undefined, 'src-d');
    expect(initial).toMatchObject({
      description: '',
      pricing: 'unit',
      quantity: '10',
      unit: '',
      unitPrice: '50',
      includesVat: false,
      budgetCategoryId: 'cat-1',
      budgetSourceId: 'src-1',
      vendorId: 'v-9',
      confidence: 'own_estimate',
    });
    expect(initial.target).toBe(row.target);
  });

  it('keeps the discretionary source when the row has none', () => {
    const row = makeCostLineRow({ budgetSourceId: null, categoryId: null });
    const initial = initialValues(TASK, { kind: 'edit', row }, undefined, 'src-d');
    expect(initial.budgetSourceId).toBe('src-d');
    expect(initial.budgetCategoryId).toBe('');
  });

  it('opens a direct-priced line as a direct amount as stored', () => {
    const row = makeCostLineRow({
      quantity: null,
      unitPrice: null,
      plannedAmount: 300,
      includesVat: true,
    });
    const initial = initialValues(TASK, { kind: 'edit', row }, undefined, null);
    expect(initial).toMatchObject({ pricing: 'direct', amount: '300', includesVat: true });
  });

  it('opens a linked line whose estimate differs as one gross direct amount (D5)', () => {
    const row = makeLinkedRow({ estimateDiffers: true, gross: 700 });
    const initial = initialValues(TASK, { kind: 'edit', row }, undefined, null);
    expect(initial).toMatchObject({ pricing: 'direct', amount: '700', includesVat: true });
  });

  it('copies a row on create but keeps the host as the target', () => {
    const row = makeCostLineRow({ description: 'Copy me' });
    const initial = initialValues(PURCHASE, { kind: 'create' }, row, null);
    expect(initial.description).toBe('Copy me');
    expect((initial.target as { id: string }).id).toBe('hi-1');
  });

  it('prefills assign mode from the (orphan) row with its own null target', () => {
    const row = makeCostLineRow({ target: null });
    const initial = initialValues(INVOICE, { kind: 'assign', row }, undefined, null);
    expect(initial.target).toBeNull();
    expect(initial.description).toBe('Oak flooring');
  });
});

describe('computeGross / computeNet', () => {
  it('grosses up a net unit-priced line with VAT (AC5 default)', () => {
    const v = values();
    expect(computeGross(v, VAT)).toBe(595);
    expect(computeNet(v, VAT)).toBe(500);
  });

  it('keeps a gross entry as is and derives the net', () => {
    const v = values({ includesVat: true });
    expect(computeGross(v, VAT)).toBe(500);
    expect(computeNet(v, VAT)).toBe(420.17);
  });

  it('uses the direct amount for direct pricing', () => {
    const v = values({ pricing: 'direct', amount: '100' });
    expect(computeGross(v, VAT)).toBe(119);
  });

  it('returns NaN while incomplete', () => {
    expect(computeGross(values({ quantity: '' }), VAT)).toBeNaN();
    expect(computeNet(values({ quantity: '' }), VAT)).toBeNaN();
  });

  it('uses the typed amount of an existing line, else its own gross', () => {
    const existing = { id: 'bl-9', type: 'work_item' as const, description: 'x', gross: 238 };
    expect(computeGross(values({ existingLineId: existing, amount: '119' }), VAT)).toBe(119);
    expect(computeNet(values({ existingLineId: existing, amount: '119' }), VAT)).toBe(100);
    expect(computeGross(values({ existingLineId: existing }), VAT)).toBe(238);
  });
});

describe('validateValues', () => {
  it('accepts a complete unit-priced line', () => {
    expect(validateValues(values() as never, ctx())).toEqual({});
  });

  it('requires a trimmed description of at most 500 characters', () => {
    expect(validateValues({ ...values(), description: '   ' }, ctx()).description).toBe(
      messages.description,
    );
    expect(validateValues({ ...values(), description: 'x'.repeat(501) }, ctx()).description).toBe(
      messages.description,
    );
    expect(
      validateValues({ ...values(), description: 'x'.repeat(500) }, ctx()).description,
    ).toBeUndefined();
  });

  it('requires a quantity above 0 and a unit price of 0 or more for unit pricing', () => {
    const errors = validateValues({ ...values(), quantity: '0', unitPrice: '-1' }, ctx());
    expect(errors.quantity).toBe(messages.quantity);
    expect(errors.unitPrice).toBe(messages.unitPrice);
    expect(validateValues({ ...values(), unitPrice: '0' }, ctx()).unitPrice).toBeUndefined();
    expect(validateValues({ ...values(), quantity: '', unitPrice: '' }, ctx())).toMatchObject({
      quantity: messages.quantity,
      unitPrice: messages.unitPrice,
    });
  });

  it('allows a direct amount of 0 on an item but not on a document or a linked line', () => {
    const direct = { ...values(), pricing: 'direct', amount: '0' };
    expect(validateValues(direct, ctx()).amount).toBeUndefined();
    expect(validateValues({ ...direct, amount: '-2' }, ctx()).amount).toBe(messages.amount);
    expect(validateValues({ ...direct, amount: '' }, ctx()).amount).toBe(messages.amount);
    const onDoc = validateValues(
      { ...direct, target: { type: 'work_item', id: 'wi-1', label: 'x' } },
      ctx({ host: INVOICE }),
    );
    expect(onDoc.amount).toBe(messages.amountPositive);
    const linked = validateValues(direct, ctx({ mode: { kind: 'edit', row: makeLinkedRow() } }));
    expect(linked.amount).toBe(messages.amountPositive);
  });

  it('requires a target on a document create and on assign', () => {
    expect(validateValues({ ...values() }, ctx({ host: INVOICE })).target).toBe(messages.belongsTo);
    const row = makeCostLineRow({ target: null });
    expect(
      validateValues({ ...values() }, ctx({ host: TASK, mode: { kind: 'assign', row } })).target,
    ).toBe(messages.belongsTo);
    expect(
      validateValues({ ...values() }, ctx({ host: INVOICE, mode: { kind: 'edit', row } })).target,
    ).toBeUndefined();
  });

  it('rejects moving an unlinked line to the other kind of item (server rule)', () => {
    const row = makeCostLineRow();
    const target = { type: 'household_item', id: 'hi-1', label: 'Sofa' };
    expect(
      validateValues({ ...values(), target }, ctx({ mode: { kind: 'edit', row } })).target,
    ).toBe(messages.moveType);
    expect(
      validateValues(
        { ...values(), target: { type: 'work_item', id: 'wi-2', label: 'x' } },
        ctx({ mode: { kind: 'edit', row } }),
      ).target,
    ).toBeUndefined();
  });

  it('allows moving a linked line to the other kind of item', () => {
    const row = makeLinkedRow();
    const target = { type: 'household_item', id: 'hi-1', label: 'Sofa' };
    expect(
      validateValues({ ...values(), target }, ctx({ mode: { kind: 'edit', row } })).target,
    ).toBeUndefined();
  });

  it('lets a picked existing line leave the amount empty but not zero or negative', () => {
    const existing = { id: 'bl-9', type: 'work_item', description: 'x', gross: 10 };
    const base = {
      ...values(),
      existingLineId: existing,
      target: { type: 'work_item', id: 'wi-1', label: 'x' },
    };
    expect(validateValues({ ...base, amount: '' }, ctx({ host: INVOICE }))).toEqual({});
    expect(validateValues({ ...base, amount: '5' }, ctx({ host: INVOICE }))).toEqual({});
    expect(validateValues({ ...base, amount: '0' }, ctx({ host: INVOICE })).amount).toBe(
      messages.amountPositive,
    );
  });
});

describe('confidenceFor', () => {
  it('keeps the chosen Basis on an item', () => {
    expect(confidenceFor(TASK, values({ confidence: 'professional_estimate' }))).toBe(
      'professional_estimate',
    );
  });

  it('is quote on an offer and invoice on an invoice (D6)', () => {
    expect(confidenceFor(OFFER, values())).toBe('quote');
    expect(confidenceFor(INVOICE, values())).toBe('invoice');
  });
});

describe('payload builders', () => {
  it('builds a unit-priced create payload', () => {
    const payload = toCreatePayload(
      values({ description: ' Tiles ', unit: ' ', budgetSourceId: 'src-1', vendorId: 'v-1' }),
      TASK,
    );
    expect(payload).toEqual({
      description: 'Tiles',
      plannedAmount: 500,
      quantity: 10,
      unit: null,
      unitPrice: 50,
      includesVat: false,
      confidence: 'own_estimate',
      budgetCategoryId: null,
      budgetSourceId: 'src-1',
      vendorId: 'v-1',
    });
  });

  it('builds a direct create payload without a source key when none is set', () => {
    const payload = toCreatePayload(values({ pricing: 'direct', amount: '75', unit: 'x' }), TASK);
    expect(payload).toMatchObject({
      plannedAmount: 75,
      quantity: null,
      unit: null,
      unitPrice: null,
      budgetCategoryId: null,
      vendorId: null,
    });
    expect(payload).not.toHaveProperty('budgetSourceId');
  });

  it('builds a batch create entry with kind, target and the fallback source', () => {
    const target = { type: 'household_item' as const, id: 'hi-1', label: 'Sofa' };
    const entry = toBatchCreate(values(), INVOICE, target, 'src-d');
    expect(entry).toMatchObject({
      kind: 'create',
      targetType: 'household_item',
      targetId: 'hi-1',
      budgetSourceId: 'src-d',
      confidence: 'invoice',
    });
    expect(
      toBatchCreate(values({ budgetSourceId: 'src-2' }), OFFER, target, 'src-d'),
    ).toMatchObject({
      budgetSourceId: 'src-2',
      confidence: 'quote',
    });
    expect(toBatchCreate(values(), INVOICE, target, null).budgetSourceId).toBe('');
  });
});

describe('toEditPayload', () => {
  const row = makeCostLineRow();
  const initial = initialValues(TASK, { kind: 'edit', row }, undefined, null);

  it('is empty when nothing changed', () => {
    expect(isEmptyPayload(toEditPayload(initial, initial, row, VAT))).toBe(true);
  });

  it('sends only the dirty simple fields', () => {
    const payload = toEditPayload(
      {
        ...initial,
        description: ' New ',
        budgetCategoryId: '',
        budgetSourceId: 'src-2',
        vendorId: 'v-2',
        confidence: 'professional_estimate',
      },
      initial,
      row,
      VAT,
    );
    expect(payload).toEqual({
      description: 'New',
      budgetCategoryId: null,
      budgetSourceId: 'src-2',
      vendorId: 'v-2',
      confidence: 'professional_estimate',
    });
  });

  it('does not send an emptied funding source', () => {
    const payload = toEditPayload({ ...initial, budgetSourceId: '' }, initial, row, VAT);
    expect(payload).not.toHaveProperty('budgetSourceId');
  });

  it('sends the whole amount group together when one amount field changes', () => {
    const payload = toEditPayload({ ...initial, unitPrice: '60' }, initial, row, VAT);
    expect(payload).toEqual({
      plannedAmount: 600,
      quantity: 10,
      unit: 'm2',
      unitPrice: 60,
      includesVat: false,
    });
  });

  it('sends a direct amount group as nulls for the unit fields', () => {
    const payload = toEditPayload(
      { ...initial, pricing: 'direct', amount: '99' },
      initial,
      row,
      VAT,
    );
    expect(payload).toMatchObject({
      plannedAmount: 99,
      quantity: null,
      unit: null,
      unitPrice: null,
    });
  });

  it('adds the itemized amount (gross) and never the Basis for a linked line', () => {
    const linked = makeLinkedRow();
    const start = initialValues(TASK, { kind: 'edit', row: linked }, undefined, null);
    const payload = toEditPayload(
      { ...start, unitPrice: '100', confidence: 'professional_estimate' },
      start,
      linked,
      VAT,
    );
    expect(payload.itemizedAmount).toBe(1190);
    expect(payload).not.toHaveProperty('confidence');
  });

  it('moves a line to another task or purchase through newWorkItemId / newHouseholdItemId', () => {
    const toTask = toEditPayload(
      { ...initial, target: { type: 'work_item', id: 'wi-2', label: 'Paint' } },
      initial,
      row,
      VAT,
    );
    expect(toTask).toEqual({ newWorkItemId: 'wi-2' });
    const linked = makeLinkedRow({ target: null });
    const start = initialValues(INVOICE, { kind: 'edit', row: linked }, undefined, null);
    const toPurchase = toEditPayload(
      { ...start, target: { type: 'household_item', id: 'hi-2', label: 'Sofa' } },
      start,
      linked,
      VAT,
    );
    expect(toPurchase.newHouseholdItemId).toBe('hi-2');
  });

  it('does not move when the target is cleared or unchanged', () => {
    expect(toEditPayload({ ...initial, target: null }, initial, row, VAT)).toEqual({});
  });
});

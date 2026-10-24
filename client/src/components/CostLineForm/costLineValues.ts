import type {
  BatchBudgetLineCreate,
  ConfidenceLevel,
  CreateBudgetLineRequest,
  EditAndMoveBudgetLineRequest,
} from '@cornerstone/shared';
import { effectivePlannedAmount } from '@cornerstone/shared';
import { roundMoney } from '../../lib/money.js';
import type { CostLineHost, CostLineRow, CostLineTarget } from '../CostLineTable/types.js';
import type { ObjectFormErrors, ObjectFormValues } from '../ObjectForm/types.js';
import type { CostLineExistingRef, CostLineFormMode } from './types.js';

/** Server limits mirrored on the client (createBudgetSchema). */
export const DESCRIPTION_MAX_LENGTH = 500;
export const UNIT_MAX_LENGTH = 100;

export type CostLinePricing = 'unit' | 'direct';

/** Typed view of the ObjectForm value map; the field names equal the API body keys where one exists. */
export interface CostLineValues {
  readonly description: string;
  /** Form only: the task or purchase the line belongs to. */
  readonly target: CostLineTarget | null;
  /** Form only: an existing, unlinked line picked instead of a new one. */
  readonly existingLineId: CostLineExistingRef | null;
  readonly pricing: CostLinePricing;
  readonly quantity: string;
  readonly unit: string;
  readonly unitPrice: string;
  /** Direct amount, or the amount of an existing line (gross); text. */
  readonly amount: string;
  /** false = entered net (default). */
  readonly includesVat: boolean;
  readonly budgetCategoryId: string;
  readonly budgetSourceId: string;
  readonly vendorId: string;
  readonly confidence: ConfidenceLevel;
}

/** The fields that make up the amount; they are sent together when any of them changes (D8). */
const AMOUNT_FIELDS = [
  'pricing',
  'quantity',
  'unit',
  'unitPrice',
  'amount',
  'includesVat',
] as const;

export interface CostLineValueMessages {
  readonly description: string;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly amount: string;
  readonly amountPositive: string;
  readonly belongsTo: string;
  readonly moveType: string;
}

/** Reads the form's value map; every field has a default so a partial map never throws. */
export function readValues(values: ObjectFormValues): CostLineValues {
  const text = (key: string): string => {
    const value = values[key];
    return typeof value === 'string' ? value : '';
  };
  return {
    description: text('description'),
    target: (values.target as CostLineTarget | null | undefined) ?? null,
    existingLineId: (values.existingLineId as CostLineExistingRef | null | undefined) ?? null,
    pricing: values.pricing === 'direct' ? 'direct' : 'unit',
    quantity: text('quantity'),
    unit: text('unit'),
    unitPrice: text('unitPrice'),
    amount: text('amount'),
    includesVat: values.includesVat === true,
    budgetCategoryId: text('budgetCategoryId'),
    budgetSourceId: text('budgetSourceId'),
    vendorId: text('vendorId'),
    confidence: (text('confidence') || 'own_estimate') as ConfidenceLevel,
  };
}

/** The host itself as a target (item hosts only). */
export function hostTarget(host: CostLineHost): CostLineTarget | null {
  return host.kind === 'invoice'
    ? null
    : { type: host.kind, id: host.id, label: host.label, area: null };
}

function numberText(value: number | null): string {
  return value === null ? '' : String(value);
}

/** The values a new form starts from (AC5: unit pricing, Net). */
export function initialValues(
  host: CostLineHost,
  mode: CostLineFormMode,
  copyFrom: CostLineRow | undefined,
  discretionarySourceId: string | null,
): ObjectFormValues {
  return { ...startingValues(host, mode, copyFrom, discretionarySourceId) };
}

function startingValues(
  host: CostLineHost,
  mode: CostLineFormMode,
  copyFrom: CostLineRow | undefined,
  discretionarySourceId: string | null,
): CostLineValues {
  const base: CostLineValues = {
    description: '',
    target: hostTarget(host),
    existingLineId: null,
    pricing: 'unit',
    quantity: '',
    unit: '',
    unitPrice: '',
    amount: '',
    includesVat: false,
    budgetCategoryId: '',
    budgetSourceId: discretionarySourceId ?? '',
    vendorId: '',
    confidence: 'own_estimate',
  };
  const row = mode.kind === 'create' ? copyFrom : mode.row;
  if (!row) return base;
  const fromRow: CostLineValues = {
    ...base,
    description: row.description ?? '',
    target: mode.kind === 'create' ? base.target : row.target,
    budgetCategoryId: row.categoryId ?? '',
    budgetSourceId: row.budgetSourceId ?? base.budgetSourceId,
    vendorId: row.vendorId ?? '',
    confidence: row.basis,
  };
  if (row.estimateDiffers) {
    // D5: the planned amount describes the estimate, not the linked amount. One gross figure.
    return { ...fromRow, pricing: 'direct', amount: String(row.gross), includesVat: true };
  }
  if (row.quantity !== null && row.unitPrice !== null) {
    return {
      ...fromRow,
      pricing: 'unit',
      quantity: numberText(row.quantity),
      unit: row.unit ?? '',
      unitPrice: numberText(row.unitPrice),
      includesVat: row.includesVat,
    };
  }
  return {
    ...fromRow,
    pricing: 'direct',
    amount: String(row.plannedAmount),
    includesVat: row.includesVat,
  };
}

function parse(text: string): number {
  return text.trim() === '' ? Number.NaN : Number(text);
}

/** Amount stored on the line: quantity × unit price or the direct amount, as entered. */
function enteredAmount(values: CostLineValues): number {
  return values.pricing === 'unit'
    ? roundMoney(parse(values.quantity) * parse(values.unitPrice))
    : parse(values.amount);
}

/** Gross of the line as it is entered (NaN while incomplete). A picked existing line keeps its gross. */
export function computeGross(values: CostLineValues, vatRate: number): number {
  if (values.existingLineId) {
    const typed = parse(values.amount);
    return Number.isFinite(typed) ? roundMoney(typed) : values.existingLineId.gross;
  }
  return roundMoney(
    effectivePlannedAmount(
      { plannedAmount: enteredAmount(values), includesVat: values.includesVat },
      vatRate,
    ),
  );
}

/** Net of the line as it is entered (NaN while incomplete). */
export function computeNet(values: CostLineValues, vatRate: number): number {
  const gross = computeGross(values, vatRate);
  if (values.existingLineId || values.includesVat) return roundMoney(gross / (1 + vatRate));
  return enteredAmount(values);
}

export interface ValidateContext {
  readonly host: CostLineHost;
  readonly mode: CostLineFormMode;
  readonly messages: CostLineValueMessages;
}

/** Cross-field validation; hidden fields (see the schema's `visibleWhen`) are never reported. */
export function validateValues(
  rawValues: ObjectFormValues,
  { host, mode, messages }: ValidateContext,
): ObjectFormErrors {
  const values = readValues(rawValues);
  const errors: Record<string, string> = {};
  if (values.description.trim() === '' || values.description.length > DESCRIPTION_MAX_LENGTH) {
    errors.description = messages.description;
  }
  const row = mode.kind === 'create' ? null : mode.row;
  const linked = row !== null && row.invoiceId !== null;
  const needsTarget = host.kind === 'invoice' && mode.kind !== 'edit';
  if ((needsTarget || mode.kind === 'assign') && values.target === null) {
    errors.target = messages.belongsTo;
  } else if (
    row !== null &&
    row.invoiceId === null &&
    values.target !== null &&
    values.target.type !== row.lineType
  ) {
    errors.target = messages.moveType;
  }
  // A pick of an existing line may leave the amount empty (the line's own gross is used).
  if (values.existingLineId) {
    if (values.amount.trim() !== '' && !(parse(values.amount) > 0)) {
      errors.amount = messages.amountPositive;
    }
  } else if (values.pricing === 'unit') {
    if (!(parse(values.quantity) > 0)) errors.quantity = messages.quantity;
    if (!(parse(values.unitPrice) >= 0)) errors.unitPrice = messages.unitPrice;
  } else {
    const amount = parse(values.amount);
    const mustBePositive = linked || host.kind === 'invoice';
    if (mustBePositive ? !(amount > 0) : !(amount >= 0)) {
      errors.amount = mustBePositive ? messages.amountPositive : messages.amount;
    }
  }
  return errors;
}

function nullIfBlank(text: string): string | null {
  const trimmed = text.trim();
  return trimmed === '' ? null : trimmed;
}

/** The price fields of the line body, shared by create and edit payloads. */
function pricingBody(values: CostLineValues): {
  plannedAmount: number;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  includesVat: boolean;
} {
  if (values.pricing === 'unit') {
    return {
      plannedAmount: enteredAmount(values),
      quantity: parse(values.quantity),
      unit: nullIfBlank(values.unit),
      unitPrice: parse(values.unitPrice),
      includesVat: values.includesVat,
    };
  }
  return {
    plannedAmount: parse(values.amount),
    quantity: null,
    unit: null,
    unitPrice: null,
    includesVat: values.includesVat,
  };
}

/** D6: lines created on an offer or invoice carry that document as their Basis. */
export function confidenceFor(host: CostLineHost, values: CostLineValues): ConfidenceLevel {
  if (host.kind !== 'invoice') return values.confidence;
  return host.status === 'quotation' ? 'quote' : 'invoice';
}

/** Body of POST /api/work-items/:id/budgets and /api/household-items/:id/budgets. */
export function toCreatePayload(
  values: CostLineValues,
  host: CostLineHost,
): CreateBudgetLineRequest {
  return {
    description: values.description.trim(),
    ...pricingBody(values),
    confidence: confidenceFor(host, values),
    budgetCategoryId: values.budgetCategoryId || null,
    ...(values.budgetSourceId ? { budgetSourceId: values.budgetSourceId } : {}),
    vendorId: values.vendorId || null,
  };
}

/** One `create` entry of the batch endpoint; the source is required (no server fallback). */
export function toBatchCreate(
  values: CostLineValues,
  host: CostLineHost,
  target: CostLineTarget,
  discretionarySourceId: string | null,
): BatchBudgetLineCreate {
  return {
    kind: 'create',
    targetType: target.type,
    targetId: target.id,
    ...toCreatePayload(values, host),
    budgetSourceId: values.budgetSourceId || discretionarySourceId || '',
  };
}

function changed(values: ObjectFormValues, initial: ObjectFormValues, name: string): boolean {
  return JSON.stringify(values[name]) !== JSON.stringify(initial[name]);
}

/**
 * D8: only fields that changed are sent. The amount fields travel together; a linked line also sends
 * its itemized amount (= gross) and never its Basis.
 */
export function toEditPayload(
  rawValues: ObjectFormValues,
  initial: ObjectFormValues,
  row: CostLineRow,
  vatRate: number,
): EditAndMoveBudgetLineRequest {
  const values = readValues(rawValues);
  const linked = row.invoiceId !== null;
  const payload: EditAndMoveBudgetLineRequest = {};
  if (changed(rawValues, initial, 'description')) payload.description = values.description.trim();
  if (AMOUNT_FIELDS.some((name) => changed(rawValues, initial, name))) {
    Object.assign(payload, pricingBody(values));
    if (linked) payload.itemizedAmount = computeGross(values, vatRate);
  }
  if (changed(rawValues, initial, 'budgetCategoryId')) {
    payload.budgetCategoryId = values.budgetCategoryId || null;
  }
  if (changed(rawValues, initial, 'budgetSourceId') && values.budgetSourceId) {
    payload.budgetSourceId = values.budgetSourceId;
  }
  if (changed(rawValues, initial, 'vendorId')) payload.vendorId = values.vendorId || null;
  if (!linked && changed(rawValues, initial, 'confidence')) payload.confidence = values.confidence;
  const initialTarget = (initial.target as CostLineTarget | null | undefined) ?? null;
  if (values.target && values.target.id !== initialTarget?.id) {
    if (values.target.type === 'work_item') payload.newWorkItemId = values.target.id;
    else payload.newHouseholdItemId = values.target.id;
  }
  return payload;
}

/** True when the edit payload has nothing to send. */
export function isEmptyPayload(payload: EditAndMoveBudgetLineRequest): boolean {
  return Object.keys(payload).length === 0;
}

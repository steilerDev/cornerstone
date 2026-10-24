import type { CostLineRow } from '../components/CostLineTable/types.js';

/** A synthetic, unlinked cost line (an estimate) on a task. */
export function makeCostLineRow(over: Partial<CostLineRow> = {}): CostLineRow {
  return {
    id: 'bl-1',
    lineType: 'work_item',
    invoiceBudgetLineId: null,
    invoiceId: null,
    invoiceStatus: null,
    invoiceNumber: null,
    invoiceDate: null,
    invoiceVendorName: null,
    state: 'estimate',
    basis: 'own_estimate',
    margin: 0.2,
    description: 'Oak flooring',
    quantity: 10,
    unit: 'm2',
    unitPrice: 50,
    includesVat: false,
    plannedAmount: 500,
    plannedGross: 595,
    gross: 595,
    net: 500,
    estimateDiffers: false,
    target: { type: 'work_item', id: 'wi-1', label: 'Lay floors', area: null },
    categoryId: 'cat-1',
    categoryName: 'Materials',
    categoryTranslationKey: null,
    budgetSourceId: 'src-1',
    budgetSourceName: 'Savings',
    vendorId: null,
    vendorName: null,
    ...over,
  };
}

/** A synthetic cost line linked to an invoice. */
export function makeLinkedRow(over: Partial<CostLineRow> = {}): CostLineRow {
  return makeCostLineRow({
    invoiceBudgetLineId: 'ibl-1',
    invoiceId: 'inv-1',
    invoiceStatus: 'pending',
    state: 'invoiced',
    basis: 'invoice',
    margin: 0,
    ...over,
  });
}

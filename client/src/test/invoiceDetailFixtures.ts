import type {
  BudgetSource,
  InvoiceBudgetLineDetailResponse,
  InvoiceDeposit,
  InvoiceDetail,
} from '@cornerstone/shared';

/** Synthetic fixtures for the offer and invoice page tests (invented names and round amounts). */

export function makePayment(overrides: Partial<InvoiceDeposit> = {}): InvoiceDeposit {
  return {
    id: 'pay-1',
    invoiceId: 'inv-1',
    amount: 200,
    dueDate: '2026-07-20',
    paidDate: null,
    claimedDate: null,
    description: null,
    status: 'pending',
    entryType: 'deposit',
    budgetSourceId: null,
    createdBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function makeInvoiceDetail(overrides: Partial<InvoiceDetail> = {}): InvoiceDetail {
  return {
    id: 'inv-1',
    vendorId: 'v-1',
    vendorName: 'Example Roofing Ltd',
    invoiceNumber: 'INV-T-001',
    amount: 1000,
    date: '2026-05-01',
    dueDate: '2026-08-01',
    status: 'pending',
    notes: null,
    budgetLines: [],
    remainingAmount: 0,
    deposits: [],
    finalPaymentAmount: 1000,
    openAmount: 1000,
    paid: 0,
    remainingOnOffer: null,
    notYetSplit: false,
    createdBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function makeCostLine(
  overrides: Partial<InvoiceBudgetLineDetailResponse> = {},
): InvoiceBudgetLineDetailResponse {
  return {
    id: 'ibl-1',
    invoiceId: 'inv-1',
    workItemBudgetId: 'wb-1',
    householdItemBudgetId: null,
    itemizedAmount: 400,
    budgetLineDescription: 'Fit the sink',
    plannedAmount: 400,
    confidence: 'own_estimate',
    categoryId: null,
    categoryName: null,
    categoryColor: null,
    categoryTranslationKey: null,
    parentItemId: 'w1',
    parentItemTitle: 'Renovate the kitchen',
    parentItemType: 'work_item',
    parentItemArea: null,
    quantity: null,
    unit: null,
    unitPrice: null,
    includesVat: true,
    vendorId: null,
    budgetSourceId: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  } as InvoiceBudgetLineDetailResponse;
}

export function makeBudgetSource(overrides: Partial<BudgetSource> = {}): BudgetSource {
  return { id: 's1', name: 'Loan Alpha', ...overrides } as BudgetSource;
}

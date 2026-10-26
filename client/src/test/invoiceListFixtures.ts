import type {
  InvoiceChipCounts,
  InvoiceDeposit,
  InvoiceListPaginatedResponse,
  InvoiceListRow,
  InvoiceStatusBreakdown,
} from '@cornerstone/shared';
import type { InvoiceListMeta } from '../pages/InvoicesPage/useInvoicesList.js';

/** Synthetic fixtures for the Invoices list tests (no real names, numbers or amounts). */

export const TODAY_FIXTURE = '2026-06-15';

export function makeDeposit(overrides: Partial<InvoiceDeposit> = {}): InvoiceDeposit {
  return {
    id: 'dep-1',
    invoiceId: 'inv-1',
    amount: 400,
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

export function makeRow(overrides: Partial<InvoiceListRow> = {}): InvoiceListRow {
  return {
    id: 'inv-1',
    vendorId: 'v-1',
    vendorName: 'Example Roofing Ltd',
    invoiceNumber: 'INV-T-001',
    amount: 1234.5,
    date: '2026-05-01',
    dueDate: '2026-08-30',
    status: 'pending',
    notes: null,
    budgetLines: [],
    remainingAmount: 1234.5,
    deposits: [],
    finalPaymentAmount: 1234.5,
    createdBy: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    openAmount: 1234.5,
    paid: 0,
    remainingOnOffer: null,
    notYetSplit: false,
    ...overrides,
  };
}

const ZERO = { count: 0, totalAmount: 0 };

export function makeSummary(
  overrides: Partial<InvoiceStatusBreakdown> = {},
): InvoiceStatusBreakdown {
  return {
    pending: ZERO,
    paid: ZERO,
    claimed: ZERO,
    quotation: ZERO,
    overdue: ZERO,
    claimable: ZERO,
    quotationCoveredByDeposits: 0,
    openPayable: ZERO,
    refundsDue: ZERO,
    ...overrides,
  };
}

export function makeChipCounts(overrides: Partial<InvoiceChipCounts> = {}): InvoiceChipCounts {
  return {
    matching: { toPay: 3, offers: 2, paid: 4, submitted: 1, all: 10 },
    outsideToPay: { offers: 2, paid: 4, submitted: 1, all: 7 },
    totals: { toPay: 3, offers: 2, paid: 4, submitted: 1, all: 10 },
    ...overrides,
  };
}

export function makeMeta(overrides: Partial<InvoiceListMeta> = {}): InvoiceListMeta {
  return {
    summary: makeSummary(),
    chipCounts: makeChipCounts(),
    listTotals: {
      openPayable: { count: 3, totalAmount: 4200.5 },
      offers: { count: 2, amount: 9000, paid: 1500, stillToPay: 0, remainingOnOffer: 7500 },
    },
    ...overrides,
  };
}

export function makeResponse(
  invoices: InvoiceListRow[],
  overrides: Partial<InvoiceListPaginatedResponse> = {},
): InvoiceListPaginatedResponse {
  const meta = makeMeta();
  return {
    invoices,
    pagination: { page: 1, pageSize: 100, totalItems: invoices.length, totalPages: 1 },
    summary: meta.summary,
    chipCounts: meta.chipCounts,
    listTotals: meta.listTotals,
    ...overrides,
  };
}

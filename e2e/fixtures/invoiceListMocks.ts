/**
 * Synthetic `GET /api/invoices` response of the Invoices list (#2238), for specs that mock the
 * list. The page reads `chipCounts` and `listTotals` as well as `invoices`, so a mock that serves
 * only `invoices` and `summary` leaves the chips without counts and the footer without a figure.
 * Invented amounts only.
 */

import type {
  InvoiceChipCounts,
  InvoiceChipTally,
  InvoiceListPaginatedResponse,
  InvoiceStatusBreakdown,
} from '@cornerstone/shared';

const ZERO = { count: 0, totalAmount: 0 };
const ZERO_TALLY: InvoiceChipTally = { toPay: 0, offers: 0, paid: 0, submitted: 0, all: 0 };

export function mockInvoiceSummary(
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

export function mockInvoiceChipCounts(
  totals: Partial<InvoiceChipTally> = {},
  matching: Partial<InvoiceChipTally> = totals,
): InvoiceChipCounts {
  return {
    matching: { ...ZERO_TALLY, ...matching },
    outsideToPay: { offers: 0, paid: 0, submitted: 0, all: 0 },
    totals: { ...ZERO_TALLY, ...totals },
  };
}

/** A well-formed list response with no rows and all-zero figures. */
export function emptyInvoiceListResponse(): InvoiceListPaginatedResponse {
  return {
    invoices: [],
    pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
    summary: mockInvoiceSummary(),
    chipCounts: mockInvoiceChipCounts(),
    listTotals: {
      openPayable: ZERO,
      offers: { count: 0, amount: 0, paid: 0, stillToPay: 0, remainingOnOffer: 0 },
    },
  };
}

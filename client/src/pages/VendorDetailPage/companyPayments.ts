import type { InvoiceDeposit, InvoiceListRow, InvoiceStatus } from '@cornerstone/shared';

/** A progress payment of one of the company's records, with the record it belongs to. */
export interface CompanyProgressPayment {
  readonly deposit: InvoiceDeposit;
  readonly parent: { readonly id: string; readonly invoiceNumber: string | null };
}

export interface CompanyPaymentGroups {
  readonly invoices: readonly InvoiceListRow[];
  readonly offers: readonly InvoiceListRow[];
  readonly progressPayments: readonly CompanyProgressPayment[];
}

const INVOICE_RANK: Readonly<Record<InvoiceStatus, number>> = {
  pending: 0,
  claimed: 1,
  paid: 2,
  quotation: 3,
};

function compareText(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/** Pending first (soonest due, no due date last), then submitted, then paid; ties by date, id. */
function compareInvoices(a: InvoiceListRow, b: InvoiceListRow): number {
  const byRank = INVOICE_RANK[a.status] - INVOICE_RANK[b.status];
  if (byRank !== 0) return byRank;
  if (a.status === 'pending') {
    if (a.dueDate !== b.dueDate) {
      if (a.dueDate === null) return 1;
      if (b.dueDate === null) return -1;
      return compareText(a.dueDate, b.dueDate);
    }
  }
  return compareText(a.date, b.date) || compareText(a.id, b.id);
}

/** Newest first; ties by id. */
function compareOffers(a: InvoiceListRow, b: InvoiceListRow): number {
  return compareText(b.date, a.date) || compareText(a.id, b.id);
}

function compareProgressPayments(a: CompanyProgressPayment, b: CompanyProgressPayment): number {
  return (
    compareText(b.deposit.dueDate, a.deposit.dueDate) || compareText(a.deposit.id, b.deposit.id)
  );
}

/** Splits the company's records into its Invoices, Offers and Progress payments lists. */
export function groupCompanyPayments(rows: readonly InvoiceListRow[]): CompanyPaymentGroups {
  const invoices = rows.filter((row) => row.status !== 'quotation').sort(compareInvoices);
  const offers = rows.filter((row) => row.status === 'quotation').sort(compareOffers);
  const progressPayments = rows
    .flatMap((row) =>
      row.deposits.map((deposit) => ({
        deposit,
        parent: { id: row.id, invoiceNumber: row.invoiceNumber },
      })),
    )
    .sort(compareProgressPayments);
  return { invoices, offers, progressPayments };
}

/** How many of the invoices are submitted (claimed): Still to pay does not count them. */
export function countSubmitted(invoices: readonly InvoiceListRow[]): number {
  return invoices.filter((row) => row.status === 'claimed').length;
}

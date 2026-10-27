import type { ReactNode } from 'react';
import { routeUrl } from '@cornerstone/shared';
import type { InvoiceDeposit, InvoiceDetail } from '@cornerstone/shared';
import { Badge } from '../../components/Badge/Badge.js';
import type { RelatedListRow } from '../../components/RelatedList/types.js';
import type { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';

export const FINAL_PAYMENT_ROW_ID = 'final-payment';

type Translate = (key: string, options?: Record<string, unknown>) => string;

export interface PaymentRowContext {
  readonly invoice: InvoiceDetail;
  readonly t: Translate;
  readonly formatCurrency: (amount: number) => string;
  readonly formatDate: (date: string) => string;
  readonly variants: ReturnType<typeof useStatusBadgeVariants>;
  /** The StatusMenu chip of one entry; `title` is its name in the Undo toast. */
  readonly renderStatus: (deposit: InvoiceDeposit, title: string) => ReactNode;
}

export interface PaymentRows {
  readonly progress: readonly RelatedListRow[];
  readonly refunds: readonly RelatedListRow[];
  /** Progress payments only; the final-payment row is not one. */
  readonly progressCount: number;
}

/** The date a payment row shows: when it is due, was paid or was submitted. */
function dateText(deposit: InvoiceDeposit, ctx: PaymentRowContext): string {
  const { t, formatDate } = ctx;
  if (deposit.status === 'paid') {
    return t('invoicePage.payments.paid', {
      date: formatDate(deposit.paidDate ?? deposit.dueDate),
    });
  }
  if (deposit.status === 'claimed') {
    return t('invoicePage.payments.submitted', {
      date: formatDate(deposit.claimedDate ?? deposit.dueDate),
    });
  }
  return t('invoicePage.payments.due', { date: formatDate(deposit.dueDate) });
}

function rowFor(deposit: InvoiceDeposit, ordinal: number, ctx: PaymentRowContext): RelatedListRow {
  const { t, formatCurrency, variants, invoice } = ctx;
  const isRefund = deposit.entryType === 'refund';
  const title =
    deposit.description ??
    t(isRefund ? 'invoicePage.payments.refundRow' : 'invoicePage.payments.progressRow', {
      n: ordinal,
    });
  return {
    id: deposit.id,
    title,
    to: routeUrl('invoice', { id: invoice.id }, { tab: 'payments', payment: deposit.id }),
    badges: isRefund ? <Badge variants={variants.refund} value="refund" /> : undefined,
    facts: (
      <>
        {ctx.renderStatus(deposit, title)}
        <span>{dateText(deposit, ctx)}</span>
      </>
    ),
    amount: formatCurrency(isRefund ? -deposit.amount : deposit.amount),
  };
}

/**
 * Rows of the two Payments lists. Ordinals count per list in the API's order (due date, then
 * creation). The final-payment row closes the progress list once it has at least one payment.
 */
export function buildPaymentRows(ctx: PaymentRowContext): PaymentRows {
  const { invoice, t, formatCurrency, formatDate, variants } = ctx;
  const progress: RelatedListRow[] = [];
  const refunds: RelatedListRow[] = [];
  for (const deposit of invoice.deposits) {
    if (deposit.entryType === 'refund') refunds.push(rowFor(deposit, refunds.length + 1, ctx));
    else progress.push(rowFor(deposit, progress.length + 1, ctx));
  }
  const progressCount = progress.length;
  if (progressCount > 0) {
    progress.push({
      id: FINAL_PAYMENT_ROW_ID,
      title: t('invoiceDetail.deposits.finalPayment'),
      badges: <Badge variants={variants.invoice} value={invoice.status} />,
      facts: invoice.dueDate
        ? t('invoicePage.payments.due', { date: formatDate(invoice.dueDate) })
        : undefined,
      amount: formatCurrency(invoice.finalPaymentAmount),
      removable: false,
      editable: false,
    });
  }
  return { progress, refunds, progressCount };
}

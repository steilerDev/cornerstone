import type { InvoiceStatus } from '@cornerstone/shared';

export type InvoiceHeaderAction =
  'convert' | 'markPaid' | 'prepareBankReport' | 'addProgressPayment';

export interface InvoiceHeaderActions {
  readonly primary: InvoiceHeaderAction;
  readonly secondary: 'addProgressPayment' | null;
}

/**
 * The header's one primary and at most one secondary per invoice state. The secondary is never
 * the same action as the primary. Offers (`quotation`) lead with Convert and have no secondary.
 */
export const INVOICE_HEADER_ACTIONS: Readonly<Record<InvoiceStatus, InvoiceHeaderActions>> = {
  quotation: { primary: 'convert', secondary: null },
  pending: { primary: 'markPaid', secondary: 'addProgressPayment' },
  paid: { primary: 'prepareBankReport', secondary: 'addProgressPayment' },
  claimed: { primary: 'addProgressPayment', secondary: null },
};

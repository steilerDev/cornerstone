import type { InvoiceStatus } from '@cornerstone/shared';

export type InvoiceHeaderAction =
  'convert' | 'markPaid' | 'prepareBankReport' | 'addProgressPayment';

export interface InvoiceHeaderActions {
  /** Convert is only ever a secondary (an offer leads with Add progress payment); it is a link to the Convert page. */
  readonly primary: Exclude<InvoiceHeaderAction, 'convert'>;
  readonly secondary: 'convert' | 'addProgressPayment' | null;
}

/**
 * The header's one primary and at most one secondary per invoice state. The secondary is never
 * the same action as the primary. Offers (`quotation`) lead with Add progress payment and keep Convert as the secondary.
 */
export const INVOICE_HEADER_ACTIONS: Readonly<Record<InvoiceStatus, InvoiceHeaderActions>> = {
  quotation: { primary: 'addProgressPayment', secondary: 'convert' },
  pending: { primary: 'markPaid', secondary: 'addProgressPayment' },
  paid: { primary: 'prepareBankReport', secondary: 'addProgressPayment' },
  claimed: { primary: 'addProgressPayment', secondary: null },
};

import { describe, it, expect } from '@jest/globals';
import { INVOICE_STATUSES } from '@cornerstone/shared';
import type { InvoiceStatus } from '@cornerstone/shared';
import { INVOICE_HEADER_ACTIONS } from './invoiceHeaderActions.js';

describe('INVOICE_HEADER_ACTIONS (S10)', () => {
  it('defines an entry for every invoice status', () => {
    expect(Object.keys(INVOICE_HEADER_ACTIONS).sort()).toEqual([...INVOICE_STATUSES].sort());
  });

  it.each<[InvoiceStatus, string, string | null]>([
    ['quotation', 'convert', null],
    ['pending', 'markPaid', 'addProgressPayment'],
    ['paid', 'prepareBankReport', 'addProgressPayment'],
    ['claimed', 'addProgressPayment', null],
  ])('%s: primary %s, secondary %s', (status, primary, secondary) => {
    expect(INVOICE_HEADER_ACTIONS[status]).toEqual({ primary, secondary });
  });

  it('never repeats the primary action as the secondary', () => {
    for (const status of INVOICE_STATUSES) {
      const { primary, secondary } = INVOICE_HEADER_ACTIONS[status];
      expect(secondary).not.toBe(primary);
    }
  });

  it('offers Convert only on an offer', () => {
    const withConvert = INVOICE_STATUSES.filter(
      (s) => INVOICE_HEADER_ACTIONS[s].primary === 'convert',
    );
    expect(withConvert).toEqual(['quotation']);
  });
});

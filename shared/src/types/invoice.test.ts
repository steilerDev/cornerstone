import { describe, it, expect } from '@jest/globals';
import { INVOICE_DEPOSIT_ENTRY_TYPES, INVOICE_STATUSES } from './invoice.js';

describe('invoice tuples', () => {
  it('INVOICE_STATUSES lists every invoice status in order', () => {
    expect([...INVOICE_STATUSES]).toEqual(['pending', 'paid', 'claimed', 'quotation']);
  });

  it('INVOICE_DEPOSIT_ENTRY_TYPES lists deposit then refund', () => {
    expect([...INVOICE_DEPOSIT_ENTRY_TYPES]).toEqual(['deposit', 'refund']);
  });
});

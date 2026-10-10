import { describe, it, expect } from '@jest/globals';
import { TITLE_SEPARATOR } from '../navigation/pageIdentity.js';
import { invoiceDisplayTitle } from './invoiceTitle.js';

const nouns = { invoice: 'Invoice', offer: 'Offer' };

describe('invoiceDisplayTitle', () => {
  it('joins company and number', () => {
    expect(
      invoiceDisplayTitle(
        { vendorName: 'Synthetic Builders', invoiceNumber: 'SB-7', status: 'pending' },
        nouns,
      ),
    ).toBe('Synthetic Builders · SB-7');
  });

  it('uses exactly U+00B7 with a space each side as the separator', () => {
    expect(TITLE_SEPARATOR).toBe(' · ');
    expect(
      invoiceDisplayTitle(
        { vendorName: 'Synthetic Builders', invoiceNumber: 'SB-7', status: 'paid' },
        nouns,
      ),
    ).toBe(`Synthetic Builders${TITLE_SEPARATOR}SB-7`);
  });

  it('falls back to the invoice noun when there is no number', () => {
    expect(
      invoiceDisplayTitle(
        { vendorName: 'Synthetic Builders', invoiceNumber: null, status: 'pending' },
        nouns,
      ),
    ).toBe('Synthetic Builders · Invoice');
  });

  it('falls back to the offer noun for a quotation without a number', () => {
    expect(
      invoiceDisplayTitle({ vendorName: 'Synthetic Builders', status: 'quotation' }, nouns),
    ).toBe('Synthetic Builders · Offer');
  });

  it('keeps a quotation number as is', () => {
    expect(
      invoiceDisplayTitle(
        { vendorName: 'Synthetic Builders', invoiceNumber: 'Q-1', status: 'quotation' },
        nouns,
      ),
    ).toBe('Synthetic Builders · Q-1');
  });

  it('shows only the number for a blank company', () => {
    expect(
      invoiceDisplayTitle({ vendorName: '   ', invoiceNumber: 'SB-7', status: 'pending' }, nouns),
    ).toBe('SB-7');
  });

  it('shows only the noun when there is neither company nor number', () => {
    expect(
      invoiceDisplayTitle({ vendorName: null, invoiceNumber: '  ', status: 'pending' }, nouns),
    ).toBe('Invoice');
    expect(invoiceDisplayTitle({ status: 'quotation' }, nouns)).toBe('Offer');
  });

  it('does not strip or add a hash sign', () => {
    expect(
      invoiceDisplayTitle(
        { vendorName: 'Synthetic Builders', invoiceNumber: '#12', status: 'pending' },
        nouns,
      ),
    ).toBe('Synthetic Builders · #12');
    expect(invoiceDisplayTitle({ invoiceNumber: '12', status: 'pending' }, nouns)).toBe('12');
  });

  it('trims surrounding whitespace of both parts', () => {
    expect(
      invoiceDisplayTitle(
        { vendorName: ' Synthetic Builders ', invoiceNumber: ' SB-7 ', status: 'pending' },
        nouns,
      ),
    ).toBe('Synthetic Builders · SB-7');
  });
});

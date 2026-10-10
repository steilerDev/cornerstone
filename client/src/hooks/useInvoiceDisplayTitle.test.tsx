/**
 * @jest-environment jsdom
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import { act, cleanup, renderHook } from '@testing-library/react';
import i18n from '../i18n/index.js';
import type { InvoiceTitleSource } from '../lib/invoiceTitle.js';
import { useInvoiceDisplayTitle } from './useInvoiceDisplayTitle.js';

describe('useInvoiceDisplayTitle', () => {
  afterEach(async () => {
    cleanup();
    await i18n.changeLanguage('en');
  });

  it('returns null while the source is not loaded', () => {
    expect(renderHook(() => useInvoiceDisplayTitle(null)).result.current).toBeNull();
    expect(renderHook(() => useInvoiceDisplayTitle(undefined)).result.current).toBeNull();
  });

  it('joins company and number', () => {
    const src: InvoiceTitleSource = {
      vendorName: 'Synthetic Builders',
      invoiceNumber: 'SB-7',
      status: 'pending',
    };
    const { result } = renderHook(() => useInvoiceDisplayTitle(src));
    expect(result.current).toBe('Synthetic Builders · SB-7');
  });

  it('uses the English invoice and offer nouns', () => {
    const invoice = renderHook(() =>
      useInvoiceDisplayTitle({ vendorName: 'Synthetic Builders', status: 'pending' }),
    );
    const offer = renderHook(() =>
      useInvoiceDisplayTitle({ vendorName: 'Synthetic Builders', status: 'quotation' }),
    );
    expect(invoice.result.current).toBe('Synthetic Builders · Invoice');
    expect(offer.result.current).toBe('Synthetic Builders · Offer');
  });

  it('re-renders the nouns when the language changes', async () => {
    const { result } = renderHook(() =>
      useInvoiceDisplayTitle({ vendorName: 'Synthetic Builders', status: 'pending' }),
    );
    expect(result.current).toBe('Synthetic Builders · Invoice');

    await act(async () => {
      await i18n.changeLanguage('de');
    });

    expect(result.current).toBe('Synthetic Builders · Rechnung');
  });

  it('keeps the same string while the inputs are unchanged', () => {
    const { result, rerender } = renderHook(() =>
      useInvoiceDisplayTitle({
        vendorName: 'Synthetic Builders',
        invoiceNumber: 'SB-7',
        status: 'paid',
      }),
    );
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});

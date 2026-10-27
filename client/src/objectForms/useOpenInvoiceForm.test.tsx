/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest } from '@jest/globals';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { INVOICE_FORM_KINDS, InvoiceCreateContext } from './invoiceCreateContext.js';
import type { OpenInvoiceForm } from './invoiceCreateContext.js';
import { useOpenInvoiceForm } from './useOpenInvoiceForm.js';

describe('useOpenInvoiceForm', () => {
  it('is null outside an InvoiceCreateProvider', () => {
    const { result } = renderHook(() => useOpenInvoiceForm());
    expect(result.current).toBeNull();
  });

  it('returns the function the provider supplies', () => {
    const open = jest.fn<OpenInvoiceForm>();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <InvoiceCreateContext value={open}>{children}</InvoiceCreateContext>
    );
    const { result } = renderHook(() => useOpenInvoiceForm(), { wrapper });

    expect(result.current).toBe(open);
    result.current!({ kind: 'offer' });
    expect(open).toHaveBeenCalledWith({ kind: 'offer' });
  });

  it('lists the invoice and the offer kind, in that order', () => {
    expect([...INVOICE_FORM_KINDS]).toEqual(['invoice', 'offer']);
  });
});

import { use } from 'react';
import { InvoiceCreateContext } from './invoiceCreateContext.js';
import type { OpenInvoiceForm } from './invoiceCreateContext.js';

/**
 * Opens the New invoice / New offer form in place through `InvoiceCreateProvider`; null outside
 * the provider (unit tests). This module never imports ObjectForm.
 */
export function useOpenInvoiceForm(): OpenInvoiceForm | null {
  return use(InvoiceCreateContext);
}

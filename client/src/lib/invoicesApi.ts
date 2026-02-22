import { get, post, patch, del } from './apiClient.js';
import type { Invoice, CreateInvoiceRequest, UpdateInvoiceRequest } from '@cornerstone/shared';

/**
 * Fetches all invoices for a given vendor.
 */
export function fetchInvoices(vendorId: string): Promise<Invoice[]> {
  return get<{ invoices: Invoice[] }>(`/vendors/${vendorId}/invoices`).then((r) => r.invoices);
}

/**
 * Creates a new invoice for a vendor.
 */
export function createInvoice(vendorId: string, data: CreateInvoiceRequest): Promise<Invoice> {
  return post<{ invoice: Invoice }>(`/vendors/${vendorId}/invoices`, data).then((r) => r.invoice);
}

/**
 * Updates an existing invoice.
 */
export function updateInvoice(
  vendorId: string,
  invoiceId: string,
  data: UpdateInvoiceRequest,
): Promise<Invoice> {
  return patch<{ invoice: Invoice }>(`/vendors/${vendorId}/invoices/${invoiceId}`, data).then(
    (r) => r.invoice,
  );
}

/**
 * Deletes an invoice.
 */
export function deleteInvoice(vendorId: string, invoiceId: string): Promise<void> {
  return del<void>(`/vendors/${vendorId}/invoices/${invoiceId}`);
}

import { get, post, patch, del } from './apiClient.js';
import type {
  Invoice,
  InvoiceListPaginatedResponse,
  CreateInvoiceRequest,
  UpdateInvoiceRequest,
} from '@cornerstone/shared';

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

/**
 * Fetches all invoices across all vendors (paginated, filterable).
 */
export function fetchAllInvoices(params?: {
  page?: number;
  pageSize?: number;
  q?: string;
  status?: 'pending' | 'paid' | 'claimed';
  vendorId?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}): Promise<InvoiceListPaginatedResponse> {
  const queryParams = new URLSearchParams();
  if (params?.page !== undefined) queryParams.set('page', params.page.toString());
  if (params?.pageSize !== undefined) queryParams.set('pageSize', params.pageSize.toString());
  if (params?.q) queryParams.set('q', params.q);
  if (params?.status) queryParams.set('status', params.status);
  if (params?.vendorId) queryParams.set('vendorId', params.vendorId);
  if (params?.sortBy) queryParams.set('sortBy', params.sortBy);
  if (params?.sortOrder) queryParams.set('sortOrder', params.sortOrder);
  const queryString = queryParams.toString();
  const path = queryString ? `/invoices?${queryString}` : '/invoices';
  return get<InvoiceListPaginatedResponse>(path);
}

/**
 * Fetches a single invoice by ID (cross-vendor).
 */
export function fetchInvoiceById(invoiceId: string): Promise<Invoice> {
  return get<{ invoice: Invoice }>(`/invoices/${invoiceId}`).then((r) => r.invoice);
}

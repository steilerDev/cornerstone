import { get, post, patch, del } from './apiClient.js';
import type { RequestOptions } from './apiClient.js';
import type {
  Invoice,
  InvoiceDetail,
  InvoiceDetailResponse,
  InvoiceListPaginatedResponse,
  InvoiceListSort,
  CreateVendorInvoiceRequest,
  UpdateInvoiceRequest,
  ConvertQuotationRequest,
} from '@cornerstone/shared';

/**
 * Creates a new invoice for a vendor; an optional cost line and linked document are written in
 * the same request.
 */
export function createInvoice(
  vendorId: string,
  data: CreateVendorInvoiceRequest,
): Promise<Invoice> {
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
 * Query of GET /api/invoices. Only the names the server accepts: it strips unknown params, so a
 * raw `amount` / `date` / `dueDate` filter would silently do nothing.
 */
export interface InvoiceListParams {
  page?: number;
  pageSize?: number;
  q?: string;
  status?: 'pending' | 'paid' | 'claimed' | 'quotation';
  openOnly?: boolean;
  vendorId?: string;
  amountMin?: number;
  amountMax?: number;
  dateFrom?: string;
  dateTo?: string;
  dueDateFrom?: string;
  dueDateTo?: string;
  notYetSplit?: boolean;
  withoutDocument?: boolean;
  refundsDue?: boolean;
  due?: boolean;
  /** Only these rows (at most 100): fresh rows after a change, without a reload. */
  ids?: readonly string[];
  sortBy?: InvoiceListSort;
  sortOrder?: 'asc' | 'desc';
}

const INVOICE_LIST_STRING_PARAMS = [
  'q',
  'status',
  'vendorId',
  'dateFrom',
  'dateTo',
  'dueDateFrom',
  'dueDateTo',
  'sortBy',
  'sortOrder',
] as const;
const INVOICE_LIST_NUMBER_PARAMS = ['page', 'pageSize', 'amountMin', 'amountMax'] as const;
// Fastify/AJV coerces "true"/"false" to boolean but "1" does not: send the literal 'true', only when true.
const INVOICE_LIST_FLAG_PARAMS = [
  'openOnly',
  'notYetSplit',
  'withoutDocument',
  'refundsDue',
  'due',
] as const;

/**
 * Fetches all invoices across all vendors (paginated, filterable).
 */
export function fetchAllInvoices(
  params?: InvoiceListParams,
  options?: RequestOptions,
): Promise<InvoiceListPaginatedResponse> {
  const queryParams = new URLSearchParams();
  for (const key of INVOICE_LIST_NUMBER_PARAMS) {
    const value = params?.[key];
    if (value !== undefined) queryParams.set(key, String(value));
  }
  for (const key of INVOICE_LIST_STRING_PARAMS) {
    const value = params?.[key];
    if (value) queryParams.set(key, value);
  }
  for (const key of INVOICE_LIST_FLAG_PARAMS) {
    if (params?.[key]) queryParams.set(key, 'true');
  }
  if (params?.ids && params.ids.length > 0) queryParams.set('ids', params.ids.join(','));
  const queryString = queryParams.toString();
  const path = queryString ? `/invoices?${queryString}` : '/invoices';
  return get<InvoiceListPaginatedResponse>(path, options);
}

/**
 * Fetches a single invoice by ID (cross-vendor), with the money service's per-record figures.
 */
export function fetchInvoiceById(invoiceId: string): Promise<InvoiceDetail> {
  return get<InvoiceDetailResponse>(`/invoices/${invoiceId}`).then((r) => r.invoice);
}

/**
 * Story #2107: converts a quotation into the final invoice, atomically.
 */
export function convertQuotation(
  invoiceId: string,
  body: ConvertQuotationRequest,
): Promise<Invoice> {
  return post<{ invoice: Invoice }>(`/invoices/${invoiceId}/convert-quotation`, body).then(
    (r) => r.invoice,
  );
}

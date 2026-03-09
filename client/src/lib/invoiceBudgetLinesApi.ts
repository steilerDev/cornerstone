import { get, post, patch, del } from './apiClient.js';
import type {
  InvoiceBudgetLineDetailResponse,
  InvoiceBudgetLineCreateResponse,
  InvoiceBudgetLineListDetailResponse,
  CreateInvoiceBudgetLineRequest,
  UpdateInvoiceBudgetLineRequest,
} from '@cornerstone/shared';

/**
 * Fetches all budget lines linked to an invoice.
 * Returns the list and the remaining unallocated amount.
 */
export function fetchInvoiceBudgetLines(
  invoiceId: string,
): Promise<InvoiceBudgetLineListDetailResponse> {
  return get<InvoiceBudgetLineListDetailResponse>(`/invoices/${invoiceId}/budget-lines`);
}

/**
 * Creates a new invoice budget line (links a budget line to the invoice).
 */
export function createInvoiceBudgetLine(
  invoiceId: string,
  data: CreateInvoiceBudgetLineRequest,
): Promise<InvoiceBudgetLineCreateResponse> {
  return post<InvoiceBudgetLineCreateResponse>(`/invoices/${invoiceId}/budget-lines`, data);
}

/**
 * Updates an existing invoice budget line (e.g., change itemized amount).
 */
export function updateInvoiceBudgetLine(
  invoiceId: string,
  lineId: string,
  data: UpdateInvoiceBudgetLineRequest,
): Promise<InvoiceBudgetLineCreateResponse> {
  return patch<InvoiceBudgetLineCreateResponse>(
    `/invoices/${invoiceId}/budget-lines/${lineId}`,
    data,
  );
}

/**
 * Deletes an invoice budget line (unlinks the budget line from the invoice).
 */
export function deleteInvoiceBudgetLine(invoiceId: string, lineId: string): Promise<void> {
  return del<void>(`/invoices/${invoiceId}/budget-lines/${lineId}`);
}

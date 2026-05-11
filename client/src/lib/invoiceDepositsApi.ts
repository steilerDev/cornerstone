import { get, post, patch, del } from './apiClient.js';
import type {
  InvoiceDeposit,
  CreateDepositRequest,
  UpdateDepositRequest,
} from '@cornerstone/shared';

/**
 * Fetches all deposits for a given invoice.
 */
export function fetchDeposits(invoiceId: string): Promise<{ deposits: InvoiceDeposit[] }> {
  return get<{ deposits: InvoiceDeposit[] }>(`/invoices/${invoiceId}/deposits`);
}

/**
 * Creates a new deposit for an invoice.
 */
export function createDeposit(
  invoiceId: string,
  data: CreateDepositRequest,
): Promise<{ deposit: InvoiceDeposit }> {
  return post<{ deposit: InvoiceDeposit }>(`/invoices/${invoiceId}/deposits`, data);
}

/**
 * Updates an existing deposit.
 */
export function updateDeposit(
  invoiceId: string,
  depositId: string,
  data: UpdateDepositRequest,
): Promise<{ deposit: InvoiceDeposit }> {
  return patch<{ deposit: InvoiceDeposit }>(
    `/invoices/${invoiceId}/deposits/${depositId}`,
    data,
  );
}

/**
 * Deletes a deposit.
 */
export function deleteDeposit(invoiceId: string, depositId: string): Promise<void> {
  return del<void>(`/invoices/${invoiceId}/deposits/${depositId}`);
}

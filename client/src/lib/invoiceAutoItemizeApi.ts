import { post } from './apiClient.js';
import type {
  AutoItemizeRequest,
  AutoItemizeDryRunResponse,
  InvoiceBudgetLineListDetailResponse,
} from '@cornerstone/shared';

/**
 * Calls the auto-itemize endpoint for an invoice.
 *
 * Supports both dry-run (preview) and commit (apply) modes.
 * Returns extracted lines and warnings in dry-run mode,
 * or the full updated budget lines list when committing.
 */
export function autoItemize(
  invoiceId: string,
  body: AutoItemizeRequest,
): Promise<AutoItemizeDryRunResponse | InvoiceBudgetLineListDetailResponse> {
  return post<AutoItemizeDryRunResponse | InvoiceBudgetLineListDetailResponse>(
    `/invoices/${invoiceId}/auto-itemize`,
    body,
  );
}

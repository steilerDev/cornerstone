import { post } from './apiClient.js';
import type {
  AutoItemizeRequest,
  AutoItemizeDryRunResponse,
  InvoiceBudgetLineListDetailResponse,
  AutoItemizePreviewRequest,
  AutoItemizePreviewResponse,
  AutoItemizeCommitRequest,
  AutoItemizeCommitResponse,
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

/**
 * Preview auto-itemization for a new invoice from a Paperless document.
 * Returns extracted lines and metadata suggestions without creating an invoice.
 */
export function previewAutoItemize(
  body: AutoItemizePreviewRequest,
): Promise<AutoItemizePreviewResponse> {
  return post<AutoItemizePreviewResponse>('/invoices/auto-itemize/preview', body);
}

/**
 * Commit auto-itemization to create a new invoice from a Paperless document.
 * Creates the invoice and all associated budget lines in an atomic transaction.
 */
export function commitAutoItemizeCreate(
  body: AutoItemizeCommitRequest,
): Promise<AutoItemizeCommitResponse> {
  return post<AutoItemizeCommitResponse>('/invoices/auto-itemize/commit', body);
}

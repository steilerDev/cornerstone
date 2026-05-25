/**
 * Invoice auto-itemize types.
 *
 * EPIC-16 Story #1547: Automatic line item extraction from Paperless-ngx OCR via LLM.
 */

import type { ExtractedLine, ExtractionHints, ExtractionResult } from './budgetExtraction.js';
import type { InvoiceStatus } from './invoice.js';

/**
 * Optional invoice metadata patch for auto-itemize commit.
 * Applied transactionally with budget line creation.
 * Mirrors UpdateInvoiceRequest minus `vendorId`.
 */
export interface InvoicePatchForAutoItemize {
  invoiceNumber?: string | null;
  amount?: number; // exclusiveMinimum: 0
  date?: string; // YYYY-MM-DD
  dueDate?: string | null; // YYYY-MM-DD
  notes?: string | null;
  /** Invoice payment status. When set, triggers the same diary event as the standalone PATCH endpoint. */
  status?: InvoiceStatus;
}

export interface AutoItemizeRequest {
  paperlessDocumentId: number;
  mode: 'append' | 'replace';
  dryRun: boolean;
  lines?: ExtractedLine[];
  /**
   * Optional invoice metadata patch. Only honored when dryRun: false.
   * Must contain at least one property when present.
   * Ignored on dry-run.
   */
  invoicePatch?: InvoicePatchForAutoItemize;
}

export interface AutoItemizeWarning {
  code: 'TOTAL_MISMATCH';
  extractedTotal: number;
  invoiceTotal: number;
}

export interface AutoItemizeDryRunResponse {
  lines: ExtractedLine[];
  warnings: AutoItemizeWarning[];
  /** ISO 8601 date extracted by the LLM from the document header, if available. */
  extractedInvoiceDate?: string;
  /** ISO 8601 due date extracted by the LLM, if available. */
  extractedDueDate?: string;
}

// Commit response re-uses InvoiceBudgetLineListDetailResponse from invoiceBudgetLine
export type { InvoiceBudgetLineListDetailResponse } from './invoiceBudgetLine.js';

// Re-export extraction types for client convenience
export type { ExtractedLine, ExtractionHints, ExtractionResult };

/**
 * Invoice auto-itemize types.
 *
 * EPIC-16 Story #1547: Automatic line item extraction from Paperless-ngx OCR via LLM.
 */

import type { ExtractedLine, ExtractionHints } from './budgetExtraction.js';

/**
 * Optional invoice metadata patch for auto-itemize commit.
 * Applied transactionally with budget line creation.
 * Mirrors UpdateInvoiceRequest minus `status` and `vendorId`.
 */
export interface InvoicePatchForAutoItemize {
  invoiceNumber?: string | null;
  amount?: number; // exclusiveMinimum: 0
  date?: string; // YYYY-MM-DD
  dueDate?: string | null; // YYYY-MM-DD
  notes?: string | null;
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
}

// Commit response re-uses InvoiceBudgetLineListDetailResponse from invoiceBudgetLine
export type { InvoiceBudgetLineListDetailResponse } from './invoiceBudgetLine.js';

// Re-export extraction types for client convenience
export type { ExtractedLine, ExtractionHints };

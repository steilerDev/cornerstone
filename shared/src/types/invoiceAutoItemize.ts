/**
 * Invoice auto-itemize types.
 *
 * EPIC-16 Story #1547: Automatic line item extraction from Paperless-ngx OCR via LLM.
 */

import type { ExtractedLine, ExtractionHints } from './budgetExtraction.js';

export interface AutoItemizeRequest {
  paperlessDocumentId: number;
  mode: 'append' | 'replace';
  dryRun: boolean;
  lines?: ExtractedLine[];
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

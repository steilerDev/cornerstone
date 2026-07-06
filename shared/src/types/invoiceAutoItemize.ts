/**
 * Invoice auto-itemize types.
 *
 * EPIC-16 Story #1547: Automatic line item extraction from Paperless-ngx OCR via LLM.
 */

import type { ExtractedLine, ExtractionHints, ExtractionResult } from './budgetExtraction.js';
import type { InvoiceStatus, CreateInvoiceRequest, Invoice } from './invoice.js';
import type { InvoiceBudgetLineDetailResponse } from './invoiceBudgetLine.js';

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
  /** Vendor's invoice identifier extracted by the LLM, if available. */
  extractedInvoiceNumber?: string;
  /** One-sentence summary extracted by the LLM, if available. */
  extractedNotes?: string;
}

// Commit response re-uses InvoiceBudgetLineListDetailResponse from invoiceBudgetLine
export type { InvoiceBudgetLineListDetailResponse } from './invoiceBudgetLine.js';

// Re-export extraction types for client convenience
export type { ExtractedLine, ExtractionHints, ExtractionResult };

/**
 * EPIC-18 Story #1679: Preview auto-itemize before committing to database.
 * Stateless LLM extraction with no DB writes.
 */
export interface AutoItemizePreviewRequest {
  paperlessDocumentId: number;
  locale?: string;
}

export interface AutoItemizePreviewResponse {
  lines: ExtractedLine[];
  /** The app vendor id the LLM matched. null when no exact match. */
  suggestedVendorId: string | null;
  extractedInvoiceNumber?: string;
  extractedInvoiceDate?: string;
  extractedDueDate?: string;
  extractedNotes?: string;
}

/**
 * EPIC-18 Story #1679: Create invoice and itemize in a single atomic transaction.
 */
export interface AutoItemizeCommitRequest {
  paperlessDocumentId: number;
  vendorId: string;
  invoice: CreateInvoiceRequest;
  lines: ExtractedLine[];
}

export interface AutoItemizeCommitResponse {
  invoice: Invoice;
  budgetLines: InvoiceBudgetLineDetailResponse[];
  remainingAmount: number;
}

/**
 * EPIC-19 Story #1797: Merge multiple extracted line items into one.
 * Stateless — the LLM only summarizes text (description + category); all numeric
 * fields are aggregated client-side in code and never sent here.
 */
export interface MergeLinesRequest {
  /** Descriptions of the 2+ selected source lines. No numeric values included. */
  descriptions: string[];
  /** Overall quote/document summary for context. */
  documentSummary?: string | null;
  /** Distinct category names already present in the extraction (or project categories as fallback), for the LLM to choose from. */
  availableCategories: string[];
}

export interface MergeLinesResponse {
  /** LLM-synthesized unified description for the merged line. */
  description: string;
  /** Raw category name chosen by the LLM, verbatim from availableCategories, or null. */
  category: string | null;
  /** Server-mapped budget category ID (via mapCategoryNameToId), or null if no match/none chosen. */
  budgetCategoryId: string | null;
}

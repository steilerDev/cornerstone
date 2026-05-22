/**
 * Budget extraction types.
 *
 * EPIC-16 Story #1546 & #1547: LLM-powered line item extraction from invoices.
 * These types represent the extracted line items returned by the LLM provider
 * and are used in both dry-run and commit workflows.
 */

export interface ExtractedLine {
  description: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  totalAmount: number;
  includesVat?: boolean;
  vatRate?: number;
  vendorName?: string;
  confidence: number; // 0..1
}

export interface ExtractionHints {
  vendorName?: string;
  invoiceTotal?: number;
  invoiceDate?: string; // ISO 8601 date
  locale?: string; // e.g., 'de-DE'
}

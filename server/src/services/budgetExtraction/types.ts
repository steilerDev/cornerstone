/**
 * Types for budget extraction from OCR text using an LLM provider.
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

export interface BudgetExtractionProvider {
  extract(ocrText: string, hints: ExtractionHints): Promise<ExtractedLine[]>;
}

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  requestTimeoutMs: number;
}

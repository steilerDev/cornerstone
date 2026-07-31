/**
 * Types for budget extraction from OCR text using an LLM provider.
 *
 * ExtractedLine, ExtractionHints, and ExtractionResult are re-exported from @cornerstone/shared.
 * BudgetExtractionProvider and LlmConfig are server-only internal types.
 */

export type { ExtractedLine, ExtractionHints, ExtractionResult } from '@cornerstone/shared';
export type { LlmProvider } from './providerProfiles.js';

import type { ExtractionHints, ExtractionResult } from '@cornerstone/shared';
import type { LlmProvider } from './providerProfiles.js';

export interface MergeLinesLlmResult {
  description: string;
  category: string | null;
}

export interface GenerateReportContentLlmInvoiceLine {
  description: string;
  linkedItemName: string;
  linkedItemDescription: string | null;
}

export interface GenerateReportContentLlmInvoice {
  invoiceId: string;
  vendorName: string;
  invoiceNumber: string | null;
  date: string;
  amount: number;
  notes: string | null;
  budgetLines: GenerateReportContentLlmInvoiceLine[];
}

export interface GenerateReportContentLlmInput {
  language: 'en' | 'de';
  reportType: string; // SourceReportType
  sourceName: string;
  sourceType: string; // BudgetSourceType
  totalAmount: number;
  currency: string;
  invoices: GenerateReportContentLlmInvoice[];
}

export interface GenerateReportContentLlmResult {
  letterSubject: string;
  letterBody: string;
  descriptions: Record<string, string>;
}

export interface BudgetExtractionProvider {
  extract(ocrText: string, hints: ExtractionHints): Promise<ExtractionResult>;
  summarizeMerge(input: {
    descriptions: string[];
    documentSummary?: string | null;
    availableCategories: string[];
  }): Promise<MergeLinesLlmResult>;
  generateReportContent(
    input: GenerateReportContentLlmInput,
  ): Promise<GenerateReportContentLlmResult>;
}

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  requestTimeoutMs: number;
  /**
   * Maximum output tokens per call. Forwarded as `max_tokens` on the request.
   * Operator-configurable via `LLM_MAX_TOKENS` env var.
   */
  maxTokens: number;
  /**
   * Which provider profile shapes the outbound request body.
   * See `providerProfiles.ts` for the differences.
   */
  provider: LlmProvider;
}

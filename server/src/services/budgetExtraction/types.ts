/**
 * Types for budget extraction from OCR text using an LLM provider.
 *
 * ExtractedLine and ExtractionHints are re-exported from @cornerstone/shared.
 * BudgetExtractionProvider and LlmConfig are server-only internal types.
 */

import type { ExtractedLine, ExtractionHints } from '@cornerstone/shared';
import type { LlmProvider } from './providerProfiles.js';

export type { ExtractedLine, ExtractionHints } from '@cornerstone/shared';
export type { LlmProvider } from './providerProfiles.js';

export interface BudgetExtractionProvider {
  extract(ocrText: string, hints: ExtractionHints): Promise<ExtractedLine[]>;
}

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  requestTimeoutMs: number;
  /**
   * Which provider profile shapes the outbound request body.
   * See `providerProfiles.ts` for the differences.
   */
  provider: LlmProvider;
}

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

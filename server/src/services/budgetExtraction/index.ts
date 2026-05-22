/**
 * Budget extraction service — orchestrates OCR text to line item extraction via LLM.
 */

import { createOpenAICompatibleProvider } from './openAICompatibleProvider.js';
import type { AppConfig } from '../../plugins/config.js';
import type { BudgetExtractionProvider } from './types.js';
import { LlmNotConfiguredError } from '../../errors/AppError.js';

/**
 * Gets the configured budget extraction provider.
 * Throws LlmNotConfiguredError if LLM gateway is not configured.
 *
 * @param config - Application configuration
 * @returns BudgetExtractionProvider instance
 * @throws LlmNotConfiguredError if autoItemizeEnabled is false
 */
export function getProvider(config: AppConfig): BudgetExtractionProvider {
  if (!config.autoItemizeEnabled) {
    throw new LlmNotConfiguredError('LLM gateway is not configured');
  }
  return createOpenAICompatibleProvider({
    baseUrl: config.llmBaseUrl!,
    apiKey: config.llmApiKey!,
    model: config.llmModel!,
    requestTimeoutMs: config.llmRequestTimeoutMs,
  });
}

// Re-export public types
export type { ExtractedLine, ExtractionHints, BudgetExtractionProvider } from './types.js';
export { validateExtractedLines, createOpenAICompatibleProvider } from './openAICompatibleProvider.js';

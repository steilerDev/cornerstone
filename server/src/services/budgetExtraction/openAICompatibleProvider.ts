/**
 * OpenAI-compatible LLM provider for budget extraction.
 *
 * This provider implements the BudgetExtractionProvider interface using
 * any OpenAI-compatible API (OpenAI, Gemini, Anthropic, OpenRouter, Ollama, etc.).
 */

import { SYSTEM_PROMPT, buildUserPrompt } from './prompts.js';
import { buildRequestBody } from './providerProfiles.js';
import type {
  BudgetExtractionProvider,
  ExtractedLine,
  ExtractionHints,
  LlmConfig,
} from './types.js';
import {
  LlmUnreachableError,
  LlmInvalidResponseError,
  LlmUpstreamError,
} from '../../errors/AppError.js';

/**
 * Validates that an unknown value conforms to ExtractedLine schema.
 * Throws LlmInvalidResponseError on any structural mismatch.
 *
 * @param body - Unknown value to validate
 * @returns Array of validated ExtractedLine objects
 * @throws LlmInvalidResponseError if validation fails
 */
export function validateExtractedLines(body: unknown): ExtractedLine[] {
  // Validate top-level structure
  if (!body || typeof body !== 'object') {
    throw new LlmInvalidResponseError('LLM response must be a JSON object');
  }

  const obj = body as Record<string, unknown>;

  if (!Array.isArray(obj.lines)) {
    throw new LlmInvalidResponseError('LLM response must have a "lines" array');
  }

  const lines: ExtractedLine[] = [];

  for (let i = 0; i < obj.lines.length; i++) {
    const item = obj.lines[i];

    if (!item || typeof item !== 'object') {
      throw new LlmInvalidResponseError(`Line item at index ${i} is not an object`);
    }

    const line = item as Record<string, unknown>;

    // Validate required fields
    if (typeof line.description !== 'string' || line.description.trim() === '') {
      throw new LlmInvalidResponseError(
        `Line item at index ${i} has missing or invalid "description"`,
      );
    }

    if (typeof line.totalAmount !== 'number' || !isFinite(line.totalAmount)) {
      throw new LlmInvalidResponseError(
        `Line item at index ${i} has missing or invalid "totalAmount"`,
      );
    }

    if (typeof line.confidence !== 'number' || line.confidence < 0 || line.confidence > 1) {
      throw new LlmInvalidResponseError(
        `Line item at index ${i} has missing or invalid "confidence" (must be 0-1)`,
      );
    }

    // Validate optional fields with coercion
    let quantity: number | undefined;
    if (line.quantity !== null && line.quantity !== undefined) {
      if (typeof line.quantity !== 'number' || !isFinite(line.quantity)) {
        throw new LlmInvalidResponseError(
          `Line item at index ${i} has invalid "quantity" (must be a number)`,
        );
      }
      quantity = line.quantity;
    }

    let unit: string | undefined;
    if (line.unit !== null && line.unit !== undefined) {
      if (typeof line.unit !== 'string') {
        throw new LlmInvalidResponseError(
          `Line item at index ${i} has invalid "unit" (must be a string)`,
        );
      }
      unit = line.unit || undefined; // Treat empty string as undefined
    }

    let unitPrice: number | undefined;
    if (line.unitPrice !== null && line.unitPrice !== undefined) {
      if (typeof line.unitPrice !== 'number' || !isFinite(line.unitPrice)) {
        throw new LlmInvalidResponseError(
          `Line item at index ${i} has invalid "unitPrice" (must be a number)`,
        );
      }
      unitPrice = line.unitPrice;
    }

    let includesVat: boolean | undefined;
    if (line.includesVat !== null && line.includesVat !== undefined) {
      if (typeof line.includesVat !== 'boolean') {
        throw new LlmInvalidResponseError(
          `Line item at index ${i} has invalid "includesVat" (must be a boolean)`,
        );
      }
      includesVat = line.includesVat;
    }

    let vatRate: number | undefined;
    if (line.vatRate !== null && line.vatRate !== undefined) {
      if (typeof line.vatRate !== 'number' || !isFinite(line.vatRate)) {
        throw new LlmInvalidResponseError(
          `Line item at index ${i} has invalid "vatRate" (must be a number)`,
        );
      }
      vatRate = line.vatRate;
    }

    let vendorName: string | undefined;
    if (line.vendorName !== null && line.vendorName !== undefined) {
      if (typeof line.vendorName !== 'string') {
        throw new LlmInvalidResponseError(
          `Line item at index ${i} has invalid "vendorName" (must be a string)`,
        );
      }
      vendorName = line.vendorName || undefined; // Treat empty string as undefined
    }

    lines.push({
      description: line.description,
      quantity,
      unit,
      unitPrice,
      totalAmount: line.totalAmount,
      includesVat,
      vatRate,
      vendorName,
      confidence: line.confidence,
    });
  }

  return lines;
}

/**
 * Creates an OpenAI-compatible budget extraction provider.
 *
 * @param config - LLM configuration (baseUrl, apiKey, model, requestTimeoutMs)
 * @returns BudgetExtractionProvider instance
 */
export function createOpenAICompatibleProvider(config: LlmConfig): BudgetExtractionProvider {
  return {
    async extract(ocrText, hints) {
      const url = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.requestTimeoutMs);

      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify(
            buildRequestBody({
              provider: config.provider,
              model: config.model,
              systemPrompt: SYSTEM_PROMPT,
              userPrompt: buildUserPrompt(ocrText, hints),
            }),
          ),
          signal: controller.signal,
        });
      } catch (err) {
        // AbortError (timeout) or network error → treat as unreachable
        clearTimeout(timeoutId);
        throw new LlmUnreachableError('LLM provider is unreachable');
      }

      clearTimeout(timeoutId);

      if (!response.ok) {
        // Do NOT include response body — it may echo the prompt (vendor names, amounts, etc.)
        // Only include status code and method for diagnostic purposes.
        throw new LlmUpstreamError(`LLM upstream returned ${response.status}`, {
          status: response.status,
        });
      }

      let body: unknown;
      try {
        const json = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = json.choices?.[0]?.message?.content;
        if (typeof content !== 'string') {
          throw new LlmInvalidResponseError('LLM response missing choices[0].message.content');
        }
        body = JSON.parse(content);
      } catch (err) {
        if (err instanceof LlmInvalidResponseError) throw err;
        throw new LlmInvalidResponseError('LLM response is not valid JSON');
      }

      return validateExtractedLines(body);
    },
  };
}

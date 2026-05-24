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

    let assignedBudgetLineId: string | undefined;
    if (line.assignedBudgetLineId !== null && line.assignedBudgetLineId !== undefined) {
      if (typeof line.assignedBudgetLineId !== 'string') {
        throw new LlmInvalidResponseError(
          `Line item at index ${i} has invalid "assignedBudgetLineId" (must be a string)`,
        );
      }
      assignedBudgetLineId = line.assignedBudgetLineId || undefined; // Treat empty string as undefined
    }

    let assignedBudgetLineType: 'work_item' | 'household_item' | undefined;
    if (line.assignedBudgetLineType !== null && line.assignedBudgetLineType !== undefined) {
      if (
        line.assignedBudgetLineType !== 'work_item' &&
        line.assignedBudgetLineType !== 'household_item'
      ) {
        throw new LlmInvalidResponseError(
          `Line item at index ${i} has invalid "assignedBudgetLineType" (must be 'work_item' or 'household_item')`,
        );
      }
      assignedBudgetLineType = line.assignedBudgetLineType;
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
      assignedBudgetLineId,
      assignedBudgetLineType,
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
              maxTokens: config.maxTokens,
            }),
          ),
          signal: controller.signal,
        });
      } catch (err) {
        // AbortError (timeout) or network error → treat as unreachable.
        // Include the underlying error so the server log shows DNS / TLS /
        // refused / AbortError context. `LlmUnreachableError` suppresses
        // details from the API response.
        clearTimeout(timeoutId);
        const e = err as { name?: string; message?: string; code?: string; cause?: unknown };
        throw new LlmUnreachableError('LLM provider is unreachable', {
          provider: config.provider,
          url,
          cause: {
            name: e?.name,
            message: e?.message,
            code: e?.code,
            // Node's fetch nests the underlying ECONNREFUSED/ENOTFOUND in cause
            innerCause:
              e?.cause && typeof e.cause === 'object'
                ? {
                    name: (e.cause as { name?: string }).name,
                    message: (e.cause as { message?: string }).message,
                    code: (e.cause as { code?: string }).code,
                  }
                : undefined,
          },
        });
      }

      clearTimeout(timeoutId);

      if (!response.ok) {
        // Read the body so ops can debug from the server log. `LlmUpstreamError`
        // suppresses `details` from the API response so the body (which may
        // echo prompt content) never leaves the host.
        const bodyText = await response.text().catch(() => '<failed to read response body>');
        throw new LlmUpstreamError(`LLM upstream returned ${response.status}`, {
          provider: config.provider,
          url,
          status: response.status,
          statusText: response.statusText,
          // Cap body at 8KB so a runaway response doesn't flood the log.
          body: bodyText.length > 8000 ? `${bodyText.slice(0, 8000)}…[truncated]` : bodyText,
        });
      }

      let body: unknown;
      try {
        const json = (await response.json()) as {
          choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
        };
        const choice = json.choices?.[0];
        const content = choice?.message?.content;
        const finishReason = choice?.finish_reason;
        if (typeof content !== 'string') {
          throw new LlmInvalidResponseError('LLM response missing choices[0].message.content', {
            provider: config.provider,
            url,
            envelope: json,
          });
        }
        // Detect upstream truncation explicitly. `finish_reason: 'length'` means
        // the LLM hit our `max_tokens` cap mid-stream and the JSON will be
        // unterminated. Surface a distinct, actionable error instead of a
        // confusing "Unterminated string in JSON" parse failure.
        if (finishReason === 'length') {
          throw new LlmInvalidResponseError(
            'LLM response was truncated (hit max_tokens). Increase LLM max_tokens or shorten the invoice OCR.',
            {
              provider: config.provider,
              url,
              finishReason,
              contentLength: content.length,
            },
          );
        }
        try {
          body = JSON.parse(content);
        } catch (parseErr) {
          throw new LlmInvalidResponseError('LLM content is not valid JSON', {
            provider: config.provider,
            url,
            parseError: (parseErr as Error).message,
            finishReason,
            content: content.length > 8000 ? `${content.slice(0, 8000)}…[truncated]` : content,
          });
        }
      } catch (err) {
        if (err instanceof LlmInvalidResponseError) throw err;
        throw new LlmInvalidResponseError('LLM response envelope is not valid JSON', {
          provider: config.provider,
          url,
          parseError: (err as Error).message,
        });
      }

      return validateExtractedLines(body);
    },
  };
}

/**
 * OpenAI-compatible LLM provider for budget extraction.
 *
 * This provider implements the BudgetExtractionProvider interface using
 * any OpenAI-compatible API (OpenAI, Gemini, Anthropic, OpenRouter, Ollama, etc.).
 */

import {
  SYSTEM_PROMPT,
  buildUserPrompt,
  MERGE_SYSTEM_PROMPT,
  buildMergeUserPrompt,
  REPORT_CONTENT_SYSTEM_PROMPT,
  buildReportContentUserPrompt,
} from './prompts.js';
import {
  buildRequestBody,
  EXTRACTED_LINES_SCHEMA,
  MERGE_RESULT_SCHEMA,
  REPORT_CONTENT_SCHEMA,
} from './providerProfiles.js';
import type {
  BudgetExtractionProvider,
  ExtractedLine,
  ExtractionResult,
  LlmConfig,
  MergeLinesLlmResult,
} from './types.js';
import {
  LlmUnreachableError,
  LlmInvalidResponseError,
  LlmUpstreamError,
} from '../../errors/AppError.js';

/**
 * Validates that an unknown value conforms to ExtractionResult schema.
 * Throws LlmInvalidResponseError on any structural mismatch.
 *
 * Handles backward-compat: if the LLM returns a bare array `[...]` or `{ lines: [...] }`
 * without top-level date fields, returns `{ lines: [...] }` (no dates).
 *
 * @param body - Unknown value to validate
 * @returns ExtractionResult with validated ExtractedLine objects and optional date fields
 * @throws LlmInvalidResponseError if validation fails
 */
export function validateExtractedLines(body: unknown): ExtractionResult {
  // Validate top-level structure
  if (!body || typeof body !== 'object') {
    throw new LlmInvalidResponseError('LLM response must be a JSON object');
  }

  const obj = body as Record<string, unknown>;

  if (!Array.isArray(obj.lines)) {
    throw new LlmInvalidResponseError('LLM response must have a "lines" array');
  }

  // Validate and strip top-level date fields (ISO 8601 YYYY-MM-DD only)
  const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  let invoiceDate: string | undefined;
  if (typeof obj.invoiceDate === 'string' && ISO_DATE_RE.test(obj.invoiceDate)) {
    invoiceDate = obj.invoiceDate;
  }
  let dueDate: string | undefined;
  if (typeof obj.dueDate === 'string' && ISO_DATE_RE.test(obj.dueDate)) {
    dueDate = obj.dueDate;
  }

  let invoiceNumber: string | undefined;
  if (typeof obj.invoiceNumber === 'string' && obj.invoiceNumber.trim() !== '') {
    const trimmed = obj.invoiceNumber.trim();
    invoiceNumber = trimmed.length <= 255 ? trimmed : trimmed.slice(0, 255);
  }

  let notes: string | undefined;
  if (typeof obj.notes === 'string' && obj.notes.trim() !== '') {
    const trimmed = obj.notes.trim();
    notes = trimmed.length > 1000 ? trimmed.slice(0, 1000) : trimmed;
  }

  let chosenVendorName: string | null | undefined;
  if (obj.chosenVendorName !== undefined) {
    if (obj.chosenVendorName === null) {
      chosenVendorName = null;
    } else if (typeof obj.chosenVendorName === 'string' && obj.chosenVendorName.trim() !== '') {
      chosenVendorName = obj.chosenVendorName.trim();
    } else {
      chosenVendorName = null;
    }
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

    // Backward-compat: vatRate may still be present from in-flight responses, silently accept it
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

    let assignmentMode: 'create-new' | 'assign-existing' | undefined;
    if (line.assignmentMode !== null && line.assignmentMode !== undefined) {
      if (line.assignmentMode !== 'create-new' && line.assignmentMode !== 'assign-existing') {
        throw new LlmInvalidResponseError(
          `Line item at index ${i} has invalid "assignmentMode" (must be 'create-new' or 'assign-existing')`,
        );
      }
      assignmentMode = line.assignmentMode;
    }

    let budgetCategoryId: string | null | undefined;
    if (line.budgetCategoryId !== undefined) {
      if (line.budgetCategoryId !== null && typeof line.budgetCategoryId !== 'string') {
        throw new LlmInvalidResponseError(
          `Line item at index ${i} has invalid "budgetCategoryId" (must be a string or null)`,
        );
      }
      budgetCategoryId = line.budgetCategoryId;
    }

    let budgetSourceId: string | null | undefined;
    if (line.budgetSourceId !== undefined) {
      if (line.budgetSourceId !== null && typeof line.budgetSourceId !== 'string') {
        throw new LlmInvalidResponseError(
          `Line item at index ${i} has invalid "budgetSourceId" (must be a string or null)`,
        );
      }
      budgetSourceId = line.budgetSourceId;
    }

    let category: string | null | undefined;
    if (line.category !== null && line.category !== undefined) {
      if (typeof line.category === 'string') {
        const trimmed = line.category.trim();
        category = trimmed.length > 0 ? trimmed.slice(0, 30) : null;
      } else {
        // Non-fatal: ignore invalid types
        category = undefined;
      }
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
      assignmentMode,
      budgetCategoryId,
      category,
      budgetSourceId,
    });
  }

  return { invoiceDate, dueDate, invoiceNumber, notes, chosenVendorName, lines };
}

/**
 * Validates that an unknown value conforms to MergeLinesLlmResult schema.
 * Throws LlmInvalidResponseError on any structural mismatch.
 *
 * @param body - Unknown value to validate
 * @returns MergeLinesLlmResult with validated description and category
 * @throws LlmInvalidResponseError if validation fails
 */
export function validateMergeResult(body: unknown): MergeLinesLlmResult {
  if (!body || typeof body !== 'object') {
    throw new LlmInvalidResponseError('LLM response must be a JSON object');
  }
  const obj = body as Record<string, unknown>;
  if (typeof obj.description !== 'string' || obj.description.trim() === '') {
    throw new LlmInvalidResponseError('LLM response missing or invalid "description"');
  }
  let category: string | null = null;
  if (obj.category !== null && obj.category !== undefined) {
    if (typeof obj.category !== 'string') {
      throw new LlmInvalidResponseError(
        'LLM response has invalid "category" (must be a string or null)',
      );
    }
    const trimmed = obj.category.trim();
    category = trimmed.length > 0 ? trimmed.slice(0, 30) : null;
  }
  const trimmedDescription = obj.description.trim();
  return {
    description:
      trimmedDescription.length > 500 ? trimmedDescription.slice(0, 500) : trimmedDescription,
    category,
  };
}

/**
 * Validates that an unknown value conforms to GenerateReportContentLlmResult schema.
 * Validates structure, length caps, and presence of all requested invoice IDs.
 * Converts descriptions array to Record<string, string> (invoice ID → description).
 * Throws LlmInvalidResponseError on any structural mismatch or missing invoices.
 *
 * @param body - Unknown value to validate
 * @param requestedInvoiceIds - Invoice IDs that must all appear in the response
 * @returns Object with letterSubject, letterBody, and descriptions as Record
 * @throws LlmInvalidResponseError if validation fails
 */
export function validateGenerateReportContentResult(
  body: unknown,
  requestedInvoiceIds: string[],
): { letterSubject: string; letterBody: string; descriptions: Record<string, string> } {
  if (!body || typeof body !== 'object') {
    throw new LlmInvalidResponseError('LLM response must be a JSON object');
  }

  const obj = body as Record<string, unknown>;

  // Validate letterSubject (non-empty string, max 200 chars)
  if (typeof obj.letterSubject !== 'string' || obj.letterSubject.trim() === '') {
    throw new LlmInvalidResponseError('LLM response missing or invalid "letterSubject"');
  }
  const trimmedSubject = obj.letterSubject.trim();
  const letterSubject = trimmedSubject.length > 200 ? trimmedSubject.slice(0, 200) : trimmedSubject;

  // Validate letterBody (non-empty string, max 3000 chars)
  if (typeof obj.letterBody !== 'string' || obj.letterBody.trim() === '') {
    throw new LlmInvalidResponseError('LLM response missing or invalid "letterBody"');
  }
  const trimmedBody = obj.letterBody.trim();
  const letterBody = trimmedBody.length > 3000 ? trimmedBody.slice(0, 3000) : trimmedBody;

  // Validate descriptions (array of {invoiceId, description})
  if (!Array.isArray(obj.descriptions)) {
    throw new LlmInvalidResponseError('LLM response "descriptions" must be an array');
  }

  const descriptions: Record<string, string> = {};
  const foundInvoiceIds = new Set<string>();

  for (let i = 0; i < obj.descriptions.length; i++) {
    const item = obj.descriptions[i];
    if (!item || typeof item !== 'object') {
      throw new LlmInvalidResponseError(`LLM response descriptions[${i}] is not an object`);
    }

    const entry = item as Record<string, unknown>;
    if (typeof entry.invoiceId !== 'string' || entry.invoiceId.trim() === '') {
      throw new LlmInvalidResponseError(
        `LLM response descriptions[${i}] missing or invalid "invoiceId"`,
      );
    }
    if (typeof entry.description !== 'string' || entry.description.trim() === '') {
      throw new LlmInvalidResponseError(
        `LLM response descriptions[${i}] missing or invalid "description"`,
      );
    }

    const invoiceId = entry.invoiceId.trim();
    const trimmedDesc = entry.description.trim();
    const cappedDesc = trimmedDesc.length > 300 ? trimmedDesc.slice(0, 300) : trimmedDesc;
    descriptions[invoiceId] = cappedDesc;
    foundInvoiceIds.add(invoiceId);
  }

  // Check that all requested invoices are present
  const missingInvoiceIds = requestedInvoiceIds.filter((id) => !foundInvoiceIds.has(id));
  if (missingInvoiceIds.length > 0) {
    throw new LlmInvalidResponseError(
      `LLM response missing descriptions for ${missingInvoiceIds.length} invoice(s)`,
      { missingCount: missingInvoiceIds.length },
    );
  }

  return { letterSubject, letterBody, descriptions };
}

/**
 * Shared fetch/timeout/JSON-parsing logic for calling the LLM chat completions endpoint.
 * Reusable by extract, summarizeMerge, and generateReportContent methods.
 *
 * @param config - LLM configuration
 * @param systemPrompt - System prompt for the LLM
 * @param userPrompt - User prompt for the LLM
 * @param responseSchema - JSON schema for structured output validation
 * @returns Parsed JSON body from the LLM response
 * @throws LlmUnreachableError, LlmUpstreamError, or LlmInvalidResponseError
 */
async function callChatCompletion(
  config: LlmConfig,
  systemPrompt: string,
  userPrompt: string,
  responseSchema: Record<string, unknown>,
): Promise<unknown> {
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
          systemPrompt,
          userPrompt,
          maxTokens: config.maxTokens,
          responseSchema,
        }),
      ),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    const e = err as { name?: string; message?: string; code?: string; cause?: unknown };
    throw new LlmUnreachableError('LLM provider is unreachable', {
      provider: config.provider,
      url,
      cause: {
        name: e?.name,
        message: e?.message,
        code: e?.code,
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
    const bodyText = await response.text().catch(() => '<failed to read response body>');
    throw new LlmUpstreamError(`LLM upstream returned ${response.status}`, {
      provider: config.provider,
      url,
      status: response.status,
      statusText: response.statusText,
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

  return body;
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
      const body = await callChatCompletion(
        config,
        SYSTEM_PROMPT,
        buildUserPrompt(ocrText, hints),
        EXTRACTED_LINES_SCHEMA,
      );
      return validateExtractedLines(body);
    },

    async summarizeMerge(input) {
      const body = await callChatCompletion(
        config,
        MERGE_SYSTEM_PROMPT,
        buildMergeUserPrompt(input.descriptions, input.documentSummary, input.availableCategories),
        MERGE_RESULT_SCHEMA,
      );
      return validateMergeResult(body);
    },

    async generateReportContent(input) {
      const body = await callChatCompletion(
        config,
        REPORT_CONTENT_SYSTEM_PROMPT,
        buildReportContentUserPrompt(input),
        REPORT_CONTENT_SCHEMA,
      );
      return validateGenerateReportContentResult(
        body,
        input.invoices.map((inv) => inv.invoiceId),
      );
    },
  };
}

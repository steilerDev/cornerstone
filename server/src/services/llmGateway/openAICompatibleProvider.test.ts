/**
 * Unit tests for openAICompatibleProvider.ts
 *
 * Tests cover:
 * - createOpenAICompatibleProvider happy path (correct HTTP call, response parsing)
 * - Trailing slash normalization on baseUrl
 * - Network/timeout failure modes (LlmUnreachableError)
 * - Non-2xx HTTP status failure modes (LlmUpstreamError)
 * - Malformed JSON / missing fields failure modes (LlmInvalidResponseError)
 * - validateExtractedLines edge cases (required fields, optional fields, confidence range)
 *
 * Strategy: jest.spyOn(global, 'fetch') to intercept the fetch call without
 * modifying global state permanently. Each test resets the spy in afterEach.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  createOpenAICompatibleProvider,
  validateExtractedLines,
  validateMergeResult,
  validateGenerateReportContentResult,
  stripMarkup,
} from './openAICompatibleProvider.js';
import {
  LlmUnreachableError,
  LlmInvalidResponseError,
  LlmUpstreamError,
} from '../../errors/AppError.js';
import { REPORT_CONTENT_LIMITS } from './contentLimits.js';
import type { LlmConfig } from './types.js';
import type { GenerateReportContentLlmInput } from './types.js';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

// Fixtures directory resolved from project root (process.cwd() = project root when jest runs)
const FIXTURES_DIR = resolve(process.cwd(), 'server/src/services/llmGateway/fixtures');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BASE_CONFIG: LlmConfig = {
  baseUrl: 'https://api.example.com',
  apiKey: 'test-api-key',
  model: 'gpt-4o',
  requestTimeoutMs: 5000,
  maxTokens: 16384,
  provider: 'openai',
};

/**
 * Builds a mock Response where response.json() returns the given choices wrapper.
 */
function makeOkResponse(content: string, status = 200): Response {
  const body = {
    choices: [{ message: { content } }],
  };
  const bodyText = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(bodyText),
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

/**
 * Builds a mock Response with ok=false for a given status.
 */
function makeErrorResponse(status: number): Response {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({ error: 'something went wrong' }),
    text: () => Promise.resolve('error body'),
  } as unknown as Response;
}

/**
 * Builds a valid lines array content string for mock responses.
 */
function buildValidLinesContent(
  lines: Array<{
    description: string;
    totalAmount: number;
    confidence: number;
    [key: string]: unknown;
  }>,
): string {
  return JSON.stringify({ lines });
}

// ─── Mock fetch setup ─────────────────────────────────────────────────────────
// Uses the same pattern as paperlessService.test.ts: replace global.fetch with
// a jest.fn and restore the original in afterEach.

const mockFetch = jest.fn<typeof fetch>();
let originalFetch: typeof fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch as unknown as typeof fetch;
  mockFetch.mockReset();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.useRealTimers();
});

// Convenience alias matching the name used throughout tests
const fetchSpy = mockFetch;

// ─── createOpenAICompatibleProvider happy path ────────────────────────────────

describe('createOpenAICompatibleProvider — happy path', () => {
  it('calls ${baseUrl}/chat/completions with correct URL', async () => {
    const content = buildValidLinesContent([
      { description: 'Item A', totalAmount: 99.99, confidence: 0.9 },
    ]);
    fetchSpy.mockResolvedValueOnce(makeOkResponse(content));

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);
    await provider.extract('ocr text', {});

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.com/chat/completions');
  });

  it('sends Authorization: Bearer <apiKey> header', async () => {
    const content = buildValidLinesContent([
      { description: 'Item A', totalAmount: 50.0, confidence: 1.0 },
    ]);
    fetchSpy.mockResolvedValueOnce(makeOkResponse(content));

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);
    await provider.extract('ocr text', {});

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer test-api-key');
  });

  it('sends the configured model in the request body', async () => {
    const content = buildValidLinesContent([
      { description: 'Item A', totalAmount: 50.0, confidence: 1.0 },
    ]);
    fetchSpy.mockResolvedValueOnce(makeOkResponse(content));

    const provider = createOpenAICompatibleProvider({ ...BASE_CONFIG, model: 'claude-3-haiku' });
    await provider.extract('ocr text', {});

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { model: string };
    expect(body.model).toBe('claude-3-haiku');
  });

  it('sends response_format: { type: "json_object" }', async () => {
    const content = buildValidLinesContent([]);
    fetchSpy.mockResolvedValueOnce(makeOkResponse(content));

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);
    await provider.extract('ocr text', {});

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { response_format: { type: string } };
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('sends temperature: 0', async () => {
    const content = buildValidLinesContent([]);
    fetchSpy.mockResolvedValueOnce(makeOkResponse(content));

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);
    await provider.extract('ocr text', {});

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { temperature: number };
    expect(body.temperature).toBe(0);
  });

  it('sends both system and user messages', async () => {
    const content = buildValidLinesContent([]);
    fetchSpy.mockResolvedValueOnce(makeOkResponse(content));

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);
    await provider.extract('ocr text', {});

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0]!.role).toBe('system');
    expect(body.messages[1]!.role).toBe('user');
  });

  it('returns ExtractionResult with parsed lines from choices[0].message.content', async () => {
    const expected = [
      { description: 'Rigipsplatten', totalAmount: 62.5, confidence: 0.95 },
      { description: 'Trockenbauschrauben', totalAmount: 17.98, confidence: 0.9 },
    ];
    const content = buildValidLinesContent(expected);
    fetchSpy.mockResolvedValueOnce(makeOkResponse(content));

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);
    const result = await provider.extract('ocr text', {});

    // extract() now returns ExtractionResult, not a bare array
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]!.description).toBe('Rigipsplatten');
    expect(result.lines[0]!.totalAmount).toBe(62.5);
    expect(result.lines[0]!.confidence).toBe(0.95);
    expect(result.lines[1]!.description).toBe('Trockenbauschrauben');
    expect(result.lines[1]!.totalAmount).toBe(17.98);
  });

  it('returns ExtractionResult with empty lines array when lines is []', async () => {
    const content = buildValidLinesContent([]);
    fetchSpy.mockResolvedValueOnce(makeOkResponse(content));

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);
    const result = await provider.extract('ocr text', {});

    // extract() returns ExtractionResult; lines is an empty array
    expect(result.lines).toEqual([]);
  });

  it('normalizes trailing slash on baseUrl (no double slashes in URL)', async () => {
    const content = buildValidLinesContent([]);
    fetchSpy.mockResolvedValueOnce(makeOkResponse(content));

    const provider = createOpenAICompatibleProvider({
      ...BASE_CONFIG,
      baseUrl: 'https://api.example.com/',
    });
    await provider.extract('ocr text', {});

    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.com/chat/completions');
    expect(url).not.toContain('//chat');
  });

  it('normalizes a single trailing slash on baseUrl (only last slash is stripped)', async () => {
    // The implementation uses .replace(/\/$/, '') which strips exactly one trailing slash.
    // baseUrl without any trailing slash also produces a clean URL.
    const content = buildValidLinesContent([]);
    fetchSpy.mockResolvedValueOnce(makeOkResponse(content));

    const provider = createOpenAICompatibleProvider({
      ...BASE_CONFIG,
      baseUrl: 'https://api.example.com',
    });
    await provider.extract('ocr text', {});

    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.com/chat/completions');
  });

  it('sends the OCR text in the user message content', async () => {
    const ocrText = 'Unique OCR content ABCDEF';
    const content = buildValidLinesContent([]);
    fetchSpy.mockResolvedValueOnce(makeOkResponse(content));

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);
    await provider.extract(ocrText, {});

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      messages: Array<{ role: string; content: string }>;
    };
    const userMessage = body.messages.find((m) => m.role === 'user');
    expect(userMessage?.content).toContain(ocrText);
  });

  it('preserves optional line fields (quantity, unit, unitPrice, includesVat, vatRate, vendorName)', async () => {
    const lines = [
      {
        description: 'Wandfliesen',
        quantity: 8,
        unit: 'm²',
        unitPrice: 28.5,
        totalAmount: 228.0,
        includesVat: false,
        vatRate: 0.19,
        vendorName: 'Fliesen König',
        confidence: 0.95,
      },
    ];
    const content = buildValidLinesContent(lines);
    fetchSpy.mockResolvedValueOnce(makeOkResponse(content));

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);
    const result = await provider.extract('ocr text', {});

    expect(result.lines[0]!.quantity).toBe(8);
    expect(result.lines[0]!.unit).toBe('m²');
    expect(result.lines[0]!.unitPrice).toBe(28.5);
    expect(result.lines[0]!.includesVat).toBe(false);
    expect(result.lines[0]!.vatRate).toBe(0.19);
    expect(result.lines[0]!.vendorName).toBe('Fliesen König');
  });
});

// ─── Failure modes ────────────────────────────────────────────────────────────

describe('createOpenAICompatibleProvider — failure modes', () => {
  it('fetch rejects (network error) → throws LlmUnreachableError with code LLM_UNREACHABLE', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);

    let thrown: unknown;
    try {
      await provider.extract('ocr text', {});
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(LlmUnreachableError);
    expect((thrown as LlmUnreachableError).code).toBe('LLM_UNREACHABLE');
    expect((thrown as LlmUnreachableError).statusCode).toBe(502);
  });

  it('AbortController fires (timeout) → throws LlmUnreachableError', async () => {
    // Simulate an AbortError (what fetch throws when signal.abort() is called)
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    fetchSpy.mockRejectedValueOnce(abortError);

    const provider = createOpenAICompatibleProvider({ ...BASE_CONFIG, requestTimeoutMs: 1 });

    await expect(provider.extract('ocr text', {})).rejects.toThrow(LlmUnreachableError);
  });

  it('response status 500 → throws LlmUpstreamError with code LLM_UPSTREAM_ERROR', async () => {
    fetchSpy.mockResolvedValueOnce(makeErrorResponse(500));

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);

    let thrown: unknown;
    try {
      await provider.extract('ocr text', {});
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(LlmUpstreamError);
    expect((thrown as LlmUpstreamError).code).toBe('LLM_UPSTREAM_ERROR');
    expect((thrown as LlmUpstreamError).statusCode).toBe(502);
  });

  it('response status 500 error does NOT include the response body verbatim', async () => {
    // The body may echo prompt contents (vendor names, amounts, API keys in headers)
    // — must NOT be forwarded to the application error
    fetchSpy.mockResolvedValueOnce(makeErrorResponse(500));

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);

    let thrown: unknown;
    try {
      await provider.extract('ocr text', {});
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(LlmUpstreamError);
    // The error message may include the status code but must not include raw response body
    expect((thrown as LlmUpstreamError).message).not.toContain('something went wrong');
  });

  it('response status 401 → throws LlmUpstreamError with status detail', async () => {
    fetchSpy.mockResolvedValueOnce(makeErrorResponse(401));

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);

    let thrown: unknown;
    try {
      await provider.extract('ocr text', {});
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(LlmUpstreamError);
    expect((thrown as LlmUpstreamError).code).toBe('LLM_UPSTREAM_ERROR');
    // Details may include the status code for diagnostics
    expect((thrown as LlmUpstreamError).details?.status).toBe(401);
  });

  it('response status 401 error does NOT include response body', async () => {
    fetchSpy.mockResolvedValueOnce(makeErrorResponse(401));

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);

    let thrown: unknown;
    try {
      await provider.extract('ocr text', {});
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(LlmUpstreamError);
    expect((thrown as LlmUpstreamError).message).not.toContain('something went wrong');
  });

  it('response body is not valid JSON → throws LlmInvalidResponseError', async () => {
    const badResponse = {
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
    } as unknown as Response;
    fetchSpy.mockResolvedValueOnce(badResponse);

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);

    let thrown: unknown;
    try {
      await provider.extract('ocr text', {});
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(LlmInvalidResponseError);
    expect((thrown as LlmInvalidResponseError).code).toBe('LLM_INVALID_RESPONSE');
  });

  it('finish_reason: "length" → throws LlmInvalidResponseError with truncation message', async () => {
    // Simulate Anthropic/OpenAI hitting max_tokens mid-stream: the JSON content
    // would be cut off, but rather than producing a confusing "Unterminated
    // string in JSON" we surface a distinct truncation error.
    const truncatedResponse = {
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: { content: '{"lines":[{"description":"item' },
              finish_reason: 'length',
            },
          ],
        }),
    } as unknown as Response;
    fetchSpy.mockResolvedValueOnce(truncatedResponse);

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);

    let thrown: unknown;
    try {
      await provider.extract('ocr text', {});
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(LlmInvalidResponseError);
    const err = thrown as LlmInvalidResponseError;
    expect(err.code).toBe('LLM_INVALID_RESPONSE');
    // Message must reference max_tokens for ops debugging.
    expect(err.message.toLowerCase()).toContain('max_tokens');
    // Details must carry finishReason for log diagnostics.
    expect(err.details?.finishReason).toBe('length');
  });

  it('response body { choices: [] } (no message) → throws LlmInvalidResponseError', async () => {
    const emptyChoices = {
      ok: true,
      status: 200,
      json: () => Promise.resolve({ choices: [] }),
    } as unknown as Response;
    fetchSpy.mockResolvedValueOnce(emptyChoices);

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);

    await expect(provider.extract('ocr text', {})).rejects.toThrow(LlmInvalidResponseError);
  });

  it('choices[0] present but has no message key → throws LlmInvalidResponseError', async () => {
    const noMessage = {
      ok: true,
      status: 200,
      json: () => Promise.resolve({ choices: [{}] }),
    } as unknown as Response;
    fetchSpy.mockResolvedValueOnce(noMessage);

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);

    await expect(provider.extract('ocr text', {})).rejects.toThrow(LlmInvalidResponseError);
  });

  it('choices[0].message.content is not a string → throws LlmInvalidResponseError', async () => {
    const nonStringContent = {
      ok: true,
      status: 200,
      json: () => Promise.resolve({ choices: [{ message: { content: 42 } }] }),
    } as unknown as Response;
    fetchSpy.mockResolvedValueOnce(nonStringContent);

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);

    await expect(provider.extract('ocr text', {})).rejects.toThrow(LlmInvalidResponseError);
  });

  it('choices[0].message.content is a valid JSON string but missing "lines" → throws LlmInvalidResponseError', async () => {
    const noLines = {
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: JSON.stringify({ items: [] }) } }],
        }),
    } as unknown as Response;
    fetchSpy.mockResolvedValueOnce(noLines);

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);

    await expect(provider.extract('ocr text', {})).rejects.toThrow(LlmInvalidResponseError);
  });

  it('choices[0].message.content is not JSON → throws LlmInvalidResponseError', async () => {
    const nonJsonContent = {
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: 'not json at all!!!' } }],
        }),
    } as unknown as Response;
    fetchSpy.mockResolvedValueOnce(nonJsonContent);

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);

    await expect(provider.extract('ocr text', {})).rejects.toThrow(LlmInvalidResponseError);
  });

  it('choices[0].message.content is markdown-wrapped JSON → throws LlmInvalidResponseError', async () => {
    // Some LLMs ignore the json_object format instruction and wrap output in markdown code fences
    const markdownJson = {
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                content: '```json\n{"lines": []}\n```',
              },
            },
          ],
        }),
    } as unknown as Response;
    fetchSpy.mockResolvedValueOnce(markdownJson);

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);

    await expect(provider.extract('ocr text', {})).rejects.toThrow(LlmInvalidResponseError);
  });
});

// ─── validateExtractedLines ───────────────────────────────────────────────────

describe('validateExtractedLines()', () => {
  describe('valid inputs — returns ExtractionResult', () => {
    it('validates a minimal valid line (only required fields)', () => {
      const result = validateExtractedLines({
        lines: [{ description: 'Item A', totalAmount: 100, confidence: 0.9 }],
      });

      // validateExtractedLines now returns ExtractionResult { lines, invoiceDate?, dueDate? }
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0]!.description).toBe('Item A');
      expect(result.lines[0]!.totalAmount).toBe(100);
      expect(result.lines[0]!.confidence).toBe(0.9);
    });

    it('validates an empty lines array — returns ExtractionResult with empty lines', () => {
      const result = validateExtractedLines({ lines: [] });
      expect(result.lines).toEqual([]);
      expect(result.invoiceDate).toBeUndefined();
      expect(result.dueDate).toBeUndefined();
    });

    it('validates multiple lines', () => {
      const result = validateExtractedLines({
        lines: [
          { description: 'Item A', totalAmount: 100, confidence: 0.9 },
          { description: 'Item B', totalAmount: 200, confidence: 0.5 },
        ],
      });
      expect(result.lines).toHaveLength(2);
    });

    it('accepts confidence = 0 (boundary)', () => {
      const result = validateExtractedLines({
        lines: [{ description: 'Item A', totalAmount: 50, confidence: 0 }],
      });
      expect(result.lines[0]!.confidence).toBe(0);
    });

    it('accepts confidence = 1 (boundary)', () => {
      const result = validateExtractedLines({
        lines: [{ description: 'Item A', totalAmount: 50, confidence: 1 }],
      });
      expect(result.lines[0]!.confidence).toBe(1);
    });

    it('accepts a line with all optional fields set', () => {
      const result = validateExtractedLines({
        lines: [
          {
            description: 'Wandfliesen Keramik',
            quantity: 8,
            unit: 'm²',
            unitPrice: 28.5,
            totalAmount: 228.0,
            includesVat: false,
            vatRate: 0.19,
            vendorName: 'Fliesen König',
            confidence: 0.95,
          },
        ],
      });

      expect(result.lines[0]!.quantity).toBe(8);
      expect(result.lines[0]!.unit).toBe('m²');
      expect(result.lines[0]!.unitPrice).toBe(28.5);
      expect(result.lines[0]!.includesVat).toBe(false);
      expect(result.lines[0]!.vatRate).toBe(0.19);
      expect(result.lines[0]!.vendorName).toBe('Fliesen König');
    });

    it('treats null optional fields as undefined (strips them)', () => {
      const result = validateExtractedLines({
        lines: [
          {
            description: 'Item A',
            quantity: null,
            unit: null,
            unitPrice: null,
            includesVat: null,
            vatRate: null,
            vendorName: null,
            totalAmount: 100,
            confidence: 0.9,
          },
        ],
      });

      expect(result.lines[0]!.quantity).toBeUndefined();
      expect(result.lines[0]!.unit).toBeUndefined();
      expect(result.lines[0]!.unitPrice).toBeUndefined();
      expect(result.lines[0]!.includesVat).toBeUndefined();
      expect(result.lines[0]!.vatRate).toBeUndefined();
      expect(result.lines[0]!.vendorName).toBeUndefined();
    });

    it('treats empty string unit as undefined', () => {
      const result = validateExtractedLines({
        lines: [{ description: 'Item A', unit: '', totalAmount: 100, confidence: 0.9 }],
      });
      expect(result.lines[0]!.unit).toBeUndefined();
    });

    it('treats empty string vendorName as undefined', () => {
      const result = validateExtractedLines({
        lines: [{ description: 'Item A', vendorName: '', totalAmount: 100, confidence: 0.9 }],
      });
      expect(result.lines[0]!.vendorName).toBeUndefined();
    });

    it('accepts extra unknown fields on a line without throwing (forward-compatibility)', () => {
      // The implementation uses a Record<string, unknown> cast and only reads known fields.
      // Extra fields should be silently ignored.
      expect(() =>
        validateExtractedLines({
          lines: [
            {
              description: 'Item A',
              totalAmount: 100,
              confidence: 0.9,
              unknownFutureField: 'value',
              anotherNewField: 42,
            },
          ],
        }),
      ).not.toThrow();
    });

    it('accepts totalAmount = 0', () => {
      const result = validateExtractedLines({
        lines: [{ description: 'Free item', totalAmount: 0, confidence: 0.9 }],
      });
      expect(result.lines[0]!.totalAmount).toBe(0);
    });

    it('accepts negative totalAmount (credit notes)', () => {
      const result = validateExtractedLines({
        lines: [{ description: 'Credit', totalAmount: -50.0, confidence: 0.7 }],
      });
      expect(result.lines[0]!.totalAmount).toBe(-50.0);
    });
  });

  describe('required field validation', () => {
    it('non-object body → throws LlmInvalidResponseError', () => {
      expect(() => validateExtractedLines(null)).toThrow(LlmInvalidResponseError);
      expect(() => validateExtractedLines(undefined)).toThrow(LlmInvalidResponseError);
      expect(() => validateExtractedLines('string')).toThrow(LlmInvalidResponseError);
      expect(() => validateExtractedLines(42)).toThrow(LlmInvalidResponseError);
    });

    it('missing "lines" field → throws LlmInvalidResponseError', () => {
      expect(() => validateExtractedLines({})).toThrow(LlmInvalidResponseError);
    });

    it('non-array "lines" value → throws LlmInvalidResponseError', () => {
      expect(() => validateExtractedLines({ lines: 'not an array' })).toThrow(
        LlmInvalidResponseError,
      );
      expect(() => validateExtractedLines({ lines: {} })).toThrow(LlmInvalidResponseError);
      expect(() => validateExtractedLines({ lines: 42 })).toThrow(LlmInvalidResponseError);
    });

    it('line missing "description" → throws LlmInvalidResponseError', () => {
      expect(() =>
        validateExtractedLines({
          lines: [{ totalAmount: 100, confidence: 0.9 }],
        }),
      ).toThrow(LlmInvalidResponseError);
    });

    it('line with empty string "description" → throws LlmInvalidResponseError', () => {
      expect(() =>
        validateExtractedLines({
          lines: [{ description: '', totalAmount: 100, confidence: 0.9 }],
        }),
      ).toThrow(LlmInvalidResponseError);
    });

    it('line with whitespace-only "description" → throws LlmInvalidResponseError', () => {
      expect(() =>
        validateExtractedLines({
          lines: [{ description: '   ', totalAmount: 100, confidence: 0.9 }],
        }),
      ).toThrow(LlmInvalidResponseError);
    });

    it('line missing "totalAmount" → throws LlmInvalidResponseError', () => {
      expect(() =>
        validateExtractedLines({
          lines: [{ description: 'Item A', confidence: 0.9 }],
        }),
      ).toThrow(LlmInvalidResponseError);
    });

    it('line with non-numeric "totalAmount" → throws LlmInvalidResponseError', () => {
      expect(() =>
        validateExtractedLines({
          lines: [{ description: 'Item A', totalAmount: 'not a number', confidence: 0.9 }],
        }),
      ).toThrow(LlmInvalidResponseError);
    });

    it('line with Infinity "totalAmount" → throws LlmInvalidResponseError', () => {
      expect(() =>
        validateExtractedLines({
          lines: [{ description: 'Item A', totalAmount: Infinity, confidence: 0.9 }],
        }),
      ).toThrow(LlmInvalidResponseError);
    });

    it('line with NaN "totalAmount" → throws LlmInvalidResponseError', () => {
      expect(() =>
        validateExtractedLines({
          lines: [{ description: 'Item A', totalAmount: NaN, confidence: 0.9 }],
        }),
      ).toThrow(LlmInvalidResponseError);
    });

    it('line missing "confidence" → throws LlmInvalidResponseError', () => {
      expect(() =>
        validateExtractedLines({
          lines: [{ description: 'Item A', totalAmount: 100 }],
        }),
      ).toThrow(LlmInvalidResponseError);
    });

    it('confidence < 0 → throws LlmInvalidResponseError', () => {
      expect(() =>
        validateExtractedLines({
          lines: [{ description: 'Item A', totalAmount: 100, confidence: -0.1 }],
        }),
      ).toThrow(LlmInvalidResponseError);
    });

    it('confidence > 1 → throws LlmInvalidResponseError', () => {
      expect(() =>
        validateExtractedLines({
          lines: [{ description: 'Item A', totalAmount: 100, confidence: 1.1 }],
        }),
      ).toThrow(LlmInvalidResponseError);
    });

    it('line item itself is not an object → throws LlmInvalidResponseError', () => {
      expect(() =>
        validateExtractedLines({
          lines: ['not an object'],
        }),
      ).toThrow(LlmInvalidResponseError);
    });

    it('line item is null → throws LlmInvalidResponseError', () => {
      expect(() =>
        validateExtractedLines({
          lines: [null],
        }),
      ).toThrow(LlmInvalidResponseError);
    });
  });

  describe('optional field type validation', () => {
    it('non-numeric "quantity" → throws LlmInvalidResponseError', () => {
      expect(() =>
        validateExtractedLines({
          lines: [{ description: 'Item A', quantity: 'five', totalAmount: 100, confidence: 0.9 }],
        }),
      ).toThrow(LlmInvalidResponseError);
    });

    it('non-string "unit" → throws LlmInvalidResponseError', () => {
      expect(() =>
        validateExtractedLines({
          lines: [{ description: 'Item A', unit: 42, totalAmount: 100, confidence: 0.9 }],
        }),
      ).toThrow(LlmInvalidResponseError);
    });

    it('non-numeric "unitPrice" → throws LlmInvalidResponseError', () => {
      expect(() =>
        validateExtractedLines({
          lines: [{ description: 'Item A', unitPrice: 'cheap', totalAmount: 100, confidence: 0.9 }],
        }),
      ).toThrow(LlmInvalidResponseError);
    });

    it('non-boolean "includesVat" → throws LlmInvalidResponseError', () => {
      expect(() =>
        validateExtractedLines({
          lines: [
            { description: 'Item A', includesVat: 'true', totalAmount: 100, confidence: 0.9 },
          ],
        }),
      ).toThrow(LlmInvalidResponseError);
    });

    it('non-numeric "vatRate" → throws LlmInvalidResponseError', () => {
      expect(() =>
        validateExtractedLines({
          lines: [{ description: 'Item A', vatRate: '19%', totalAmount: 100, confidence: 0.9 }],
        }),
      ).toThrow(LlmInvalidResponseError);
    });

    it('non-string "vendorName" → throws LlmInvalidResponseError', () => {
      expect(() =>
        validateExtractedLines({
          lines: [{ description: 'Item A', vendorName: 99, totalAmount: 100, confidence: 0.9 }],
        }),
      ).toThrow(LlmInvalidResponseError);
    });

    it('non-string "assignedBudgetLineId" → throws LlmInvalidResponseError', () => {
      // Lines 151-156: type guard for assignedBudgetLineId must be string
      expect(() =>
        validateExtractedLines({
          lines: [
            {
              description: 'Item A',
              totalAmount: 100,
              confidence: 0.9,
              assignedBudgetLineId: 42,
            },
          ],
        }),
      ).toThrow(LlmInvalidResponseError);
    });

    it('invalid "assignedBudgetLineType" value → throws LlmInvalidResponseError', () => {
      // Lines 161-169: type guard for assignedBudgetLineType enum
      expect(() =>
        validateExtractedLines({
          lines: [
            {
              description: 'Item A',
              totalAmount: 100,
              confidence: 0.9,
              assignedBudgetLineType: 'invalid_type',
            },
          ],
        }),
      ).toThrow(LlmInvalidResponseError);
    });
  });

  // ─── Story #1576 — ExtractionResult date fields ──────────────────────────────

  describe('date fields on ExtractionResult (Story #1576)', () => {
    it('passes through valid invoiceDate and dueDate in ISO 8601 YYYY-MM-DD format', () => {
      const result = validateExtractedLines({
        invoiceDate: '2024-03-15',
        dueDate: '2024-04-15',
        lines: [{ description: 'Item A', totalAmount: 100, confidence: 0.9 }],
      });

      expect(result.invoiceDate).toBe('2024-03-15');
      expect(result.dueDate).toBe('2024-04-15');
      expect(result.lines).toHaveLength(1);
    });

    it('strips malformed invoiceDate "15/03/2024" (non-ISO format)', () => {
      const result = validateExtractedLines({
        invoiceDate: '15/03/2024',
        lines: [{ description: 'Item A', totalAmount: 100, confidence: 0.9 }],
      });

      expect(result.invoiceDate).toBeUndefined();
      // Malformed date is stripped; rest of the result is valid
      expect(result.lines).toHaveLength(1);
    });

    it('strips malformed invoiceDate "15.01.2024" (German dot notation)', () => {
      const result = validateExtractedLines({
        invoiceDate: '15.01.2024',
        lines: [],
      });

      expect(result.invoiceDate).toBeUndefined();
    });

    it('strips malformed invoiceDate "2024/01/15" (slash separator)', () => {
      const result = validateExtractedLines({
        invoiceDate: '2024/01/15',
        lines: [],
      });

      expect(result.invoiceDate).toBeUndefined();
    });

    it('strips invoiceDate: null silently', () => {
      const result = validateExtractedLines({
        invoiceDate: null,
        lines: [],
      });

      expect(result.invoiceDate).toBeUndefined();
    });

    it('strips dueDate: "not-a-date" silently', () => {
      const result = validateExtractedLines({
        dueDate: 'not-a-date',
        lines: [],
      });

      expect(result.dueDate).toBeUndefined();
    });

    it('strips dueDate: null silently', () => {
      const result = validateExtractedLines({
        dueDate: null,
        lines: [],
      });

      expect(result.dueDate).toBeUndefined();
    });

    it('returns invoiceDate=undefined and dueDate=undefined when no date fields provided', () => {
      const result = validateExtractedLines({
        lines: [{ description: 'Item A', totalAmount: 50, confidence: 1 }],
      });

      expect(result.invoiceDate).toBeUndefined();
      expect(result.dueDate).toBeUndefined();
    });

    it('accepts { lines: [...] } without top-level date fields — backward compat', () => {
      // A response with only the lines key (no invoiceDate/dueDate) must still pass
      expect(() =>
        validateExtractedLines({
          lines: [{ description: 'Item A', totalAmount: 100, confidence: 0.9 }],
        }),
      ).not.toThrow();
    });

    it('accepts a valid line containing vatRate: 0.19 (backward compat)', () => {
      // vatRate is still accepted in the line shape even though the UI drops it from payloads
      const result = validateExtractedLines({
        lines: [
          {
            description: 'Service',
            totalAmount: 119,
            confidence: 0.95,
            vatRate: 0.19,
          },
        ],
      });

      expect(result.lines[0]!.vatRate).toBe(0.19);
    });

    it('result always has a lines property that is an array', () => {
      const result = validateExtractedLines({
        invoiceDate: '2024-01-01',
        lines: [],
      });

      expect(Array.isArray(result.lines)).toBe(true);
    });

    it('validates a full extraction with all date + line fields populated', () => {
      const result = validateExtractedLines({
        invoiceDate: '2024-06-30',
        dueDate: '2024-07-30',
        lines: [
          { description: 'Labor', totalAmount: 500, confidence: 0.9 },
          { description: 'Materials', totalAmount: 250, confidence: 0.85 },
        ],
      });

      expect(result.invoiceDate).toBe('2024-06-30');
      expect(result.dueDate).toBe('2024-07-30');
      expect(result.lines).toHaveLength(2);
    });
  });

  // ─── Story #1581 — invoiceNumber and notes on ExtractionResult ───────────────

  describe('invoiceNumber and notes fields on ExtractionResult (Story #1581)', () => {
    it('returns invoiceNumber when present as non-empty string', () => {
      const result = validateExtractedLines({
        invoiceNumber: 'RE-2024-001',
        lines: [],
      });

      expect(result.invoiceNumber).toBe('RE-2024-001');
    });

    it('strips invoiceNumber: null → undefined', () => {
      const result = validateExtractedLines({
        invoiceNumber: null,
        lines: [],
      });

      expect(result.invoiceNumber).toBeUndefined();
    });

    it('strips invoiceNumber with only whitespace → undefined', () => {
      const result = validateExtractedLines({
        invoiceNumber: '   ',
        lines: [],
      });

      expect(result.invoiceNumber).toBeUndefined();
    });

    it('truncates invoiceNumber longer than 255 chars to exactly 255', () => {
      const longInvoiceNumber = 'A'.repeat(300);
      const result = validateExtractedLines({
        invoiceNumber: longInvoiceNumber,
        lines: [],
      });

      expect(result.invoiceNumber).toHaveLength(255);
      expect(result.invoiceNumber).toBe('A'.repeat(255));
    });

    it('returns notes when present as non-empty string', () => {
      const result = validateExtractedLines({
        notes: 'This invoice covers labor for the kitchen renovation.',
        lines: [],
      });

      expect(result.notes).toBe('This invoice covers labor for the kitchen renovation.');
    });

    it('strips notes: null → undefined', () => {
      const result = validateExtractedLines({
        notes: null,
        lines: [],
      });

      expect(result.notes).toBeUndefined();
    });

    it('truncates notes longer than 1000 chars to exactly 1000', () => {
      const longNotes = 'B'.repeat(1200);
      const result = validateExtractedLines({
        notes: longNotes,
        lines: [],
      });

      expect(result.notes).toHaveLength(1000);
      expect(result.notes).toBe('B'.repeat(1000));
    });

    it('backward compat: response with only { lines: [...] } returns invoiceNumber and notes as undefined', () => {
      const result = validateExtractedLines({
        lines: [{ description: 'Item A', totalAmount: 100, confidence: 0.9 }],
      });

      expect(result.invoiceNumber).toBeUndefined();
      expect(result.notes).toBeUndefined();
      // Core fields still work
      expect(result.lines).toHaveLength(1);
    });
  });
});

// ─── Fixture-driven validate tests ───────────────────────────────────────────

describe('fixture-driven mock extract tests', () => {
  const fixtureDir = FIXTURES_DIR;

  const fixtures = [
    {
      name: 'obi-baumarkt',
      vendorName: 'OBI',
      invoiceTotal: 123.17,
      expectedLines: [
        { description: 'Rigipsplatten RB 12,5 mm', totalAmount: 62.5, confidence: 0.95 },
        { description: 'Trockenbauschrauben', totalAmount: 17.98, confidence: 0.9 },
      ],
    },
    {
      name: 'elektriker-rechnung',
      vendorName: 'Elektro Schmidt GmbH',
      invoiceTotal: 1165.61,
      expectedLines: [
        { description: 'Installationen und Arbeitsleistung', totalAmount: 680.0, confidence: 0.9 },
        { description: 'NYM Kabel 3x2,5 mm²', totalAmount: 35.0, confidence: 0.9 },
      ],
    },
    {
      name: 'dachdecker',
      vendorName: 'Dachdeckerei Weber',
      invoiceTotal: 15950.46,
      expectedLines: [
        { description: 'Dachziegel Krempeldächer', totalAmount: 4812.5, confidence: 0.95 },
      ],
    },
    {
      name: 'installateur-pauschale',
      vendorName: 'Installationen Bergmann',
      invoiceTotal: 7937.3,
      expectedLines: [
        { description: 'Pauschalleistung Abbruch', totalAmount: 3500.0, confidence: 0.7 },
      ],
    },
    {
      name: 'fliesenleger',
      vendorName: 'Fliesen König',
      invoiceTotal: 2663.22,
      expectedLines: [
        { description: 'Fliesenlegen Küchenrückwand', totalAmount: 520.0, confidence: 0.95 },
      ],
    },
  ] as const;

  for (const fixture of fixtures) {
    it(`mocked extract with ${fixture.name} fixture returns valid ExtractedLine[]`, async () => {
      const ocrText = readFileSync(join(fixtureDir, `${fixture.name}.txt`), 'utf8');

      // Build a response that contains the first expected line
      const firstLine = fixture.expectedLines[0];
      const mockLines = [
        {
          description: firstLine.description,
          totalAmount: firstLine.totalAmount,
          confidence: firstLine.confidence,
        },
      ];
      const content = buildValidLinesContent(mockLines);

      fetchSpy.mockResolvedValueOnce(makeOkResponse(content));

      const provider = createOpenAICompatibleProvider(BASE_CONFIG);
      const result = await provider.extract(ocrText, {
        vendorName: fixture.vendorName,
        invoiceTotal: fixture.invoiceTotal,
      });

      // Verify result shape — extract() now returns ExtractionResult
      expect(Array.isArray(result.lines)).toBe(true);
      expect(result.lines.length).toBeGreaterThan(0);
      result.lines.forEach((line) => {
        expect(typeof line.description).toBe('string');
        expect(line.description.length).toBeGreaterThan(0);
        expect(typeof line.totalAmount).toBe('number');
        expect(isFinite(line.totalAmount)).toBe(true);
        expect(typeof line.confidence).toBe('number');
        expect(line.confidence).toBeGreaterThanOrEqual(0);
        expect(line.confidence).toBeLessThanOrEqual(1);
      });
    });
  }
});

// ─── validateExtractedLines — category field (#1596) ─────────────────────────

describe('validateExtractedLines — category field parsing', () => {
  it('parses a string category value and includes it in the returned line', async () => {
    const content = JSON.stringify({
      lines: [
        {
          description: 'Tile work',
          totalAmount: 200,
          confidence: 0.9,
          category: 'Materials',
        },
      ],
    });
    fetchSpy.mockResolvedValueOnce(makeOkResponse(content));

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);
    const result = await provider.extract('ocr text', {});

    expect(result.lines).toHaveLength(1);
    const line = result.lines[0] as unknown as Record<string, unknown>;
    expect(line['category']).toBe('Materials');
  });

  it('trims leading and trailing whitespace from category', async () => {
    const content = JSON.stringify({
      lines: [
        {
          description: 'Labor',
          totalAmount: 100,
          confidence: 0.8,
          category: '  Labor  ',
        },
      ],
    });
    fetchSpy.mockResolvedValueOnce(makeOkResponse(content));

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);
    const result = await provider.extract('ocr text', {});

    const line = result.lines[0] as unknown as Record<string, unknown>;
    expect(line['category']).toBe('Labor');
  });

  it('caps category at 30 characters', async () => {
    const longCategory = 'A'.repeat(50);
    const content = JSON.stringify({
      lines: [
        {
          description: 'Item',
          totalAmount: 50,
          confidence: 0.7,
          category: longCategory,
        },
      ],
    });
    fetchSpy.mockResolvedValueOnce(makeOkResponse(content));

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);
    const result = await provider.extract('ocr text', {});

    const line = result.lines[0] as unknown as Record<string, unknown>;
    const cat = line['category'] as string;
    expect(cat).toBeDefined();
    expect(cat.length).toBeLessThanOrEqual(30);
    expect(cat).toBe('A'.repeat(30));
  });

  it('returns category=null when category is an empty string (after trim)', async () => {
    const content = JSON.stringify({
      lines: [
        {
          description: 'Item',
          totalAmount: 50,
          confidence: 0.7,
          category: '   ',
        },
      ],
    });
    fetchSpy.mockResolvedValueOnce(makeOkResponse(content));

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);
    const result = await provider.extract('ocr text', {});

    const line = result.lines[0] as unknown as Record<string, unknown>;
    // Whitespace-only → trimmed to empty → treated as null
    expect(line['category']).toBeNull();
  });

  it('returns category=undefined when category field is absent from the line', async () => {
    const content = JSON.stringify({
      lines: [
        {
          description: 'Item',
          totalAmount: 50,
          confidence: 0.7,
          // no category key
        },
      ],
    });
    fetchSpy.mockResolvedValueOnce(makeOkResponse(content));

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);
    const result = await provider.extract('ocr text', {});

    const line = result.lines[0] as unknown as Record<string, unknown>;
    expect(line['category']).toBeUndefined();
  });

  it('ignores invalid (non-string) category types non-fatally — returns undefined', async () => {
    const content = JSON.stringify({
      lines: [
        {
          description: 'Item',
          totalAmount: 50,
          confidence: 0.7,
          category: 12345, // number, not a string
        },
      ],
    });
    fetchSpy.mockResolvedValueOnce(makeOkResponse(content));

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);
    // Should NOT throw — non-string category is silently ignored
    const result = await provider.extract('ocr text', {});

    const line = result.lines[0] as unknown as Record<string, unknown>;
    // Non-fatal: undefined (not null, not string)
    expect(line['category']).toBeUndefined();
  });
});

// ─── Story #1797: provider.summarizeMerge() ──────────────────────────────────

function buildMergeContent(description: string, category: string | null): string {
  return JSON.stringify({ description, category });
}

describe('createOpenAICompatibleProvider — summarizeMerge() happy path', () => {
  it('calls ${baseUrl}/chat/completions (same endpoint as extract)', async () => {
    fetchSpy.mockResolvedValueOnce(makeOkResponse(buildMergeContent('Tile and grout', null)));

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);
    await provider.summarizeMerge({ descriptions: ['A', 'B'], availableCategories: [] });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.com/chat/completions');
  });

  it('sends the MERGE_SYSTEM_PROMPT as the system message', async () => {
    fetchSpy.mockResolvedValueOnce(makeOkResponse(buildMergeContent('Tile and grout', null)));

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);
    await provider.summarizeMerge({ descriptions: ['A', 'B'], availableCategories: [] });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      messages: Array<{ role: string; content: string }>;
    };
    const systemMessage = body.messages.find((m) => m.role === 'system');
    expect(systemMessage?.content).toContain('summarizing German construction-invoice line items');
  });

  it('sends a user message built from buildMergeUserPrompt (descriptions + categories)', async () => {
    fetchSpy.mockResolvedValueOnce(makeOkResponse(buildMergeContent('Tile and grout', null)));

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);
    await provider.summarizeMerge({
      descriptions: ['Tile work', 'Grout'],
      documentSummary: 'Bathroom quote',
      availableCategories: ['Materials'],
    });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      messages: Array<{ role: string; content: string }>;
    };
    const userMessage = body.messages.find((m) => m.role === 'user');
    expect(userMessage?.content).toContain('1. Tile work');
    expect(userMessage?.content).toContain('2. Grout');
    expect(userMessage?.content).toContain('Bathroom quote');
    expect(userMessage?.content).toContain('- Materials');
  });

  it('returns { description, category } parsed from choices[0].message.content', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeOkResponse(buildMergeContent('Tile work and grout', 'Materials')),
    );

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);
    const result = await provider.summarizeMerge({
      descriptions: ['Tile work', 'Grout'],
      availableCategories: ['Materials'],
    });

    expect(result.description).toBe('Tile work and grout');
    expect(result.category).toBe('Materials');
  });

  it('returns category: null when the LLM returns category: null', async () => {
    fetchSpy.mockResolvedValueOnce(makeOkResponse(buildMergeContent('Consolidated line', null)));

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);
    const result = await provider.summarizeMerge({
      descriptions: ['A', 'B'],
      availableCategories: [],
    });

    expect(result.category).toBeNull();
  });

  it('sends response_format: json_object and temperature: 0 (shared callChatCompletion path)', async () => {
    fetchSpy.mockResolvedValueOnce(makeOkResponse(buildMergeContent('X', null)));

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);
    await provider.summarizeMerge({ descriptions: ['A', 'B'], availableCategories: [] });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      response_format: { type: string };
      temperature: number;
    };
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.temperature).toBe(0);
  });
});

describe('createOpenAICompatibleProvider — summarizeMerge() failure modes', () => {
  it('fetch rejects (network error) → throws LlmUnreachableError', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);

    await expect(
      provider.summarizeMerge({ descriptions: ['A', 'B'], availableCategories: [] }),
    ).rejects.toThrow(LlmUnreachableError);
  });

  it('response status 500 → throws LlmUpstreamError', async () => {
    fetchSpy.mockResolvedValueOnce(makeErrorResponse(500));

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);

    await expect(
      provider.summarizeMerge({ descriptions: ['A', 'B'], availableCategories: [] }),
    ).rejects.toThrow(LlmUpstreamError);
  });

  it('choices[0].message.content is not valid JSON → throws LlmInvalidResponseError', async () => {
    const badResponse = {
      ok: true,
      status: 200,
      json: () => Promise.resolve({ choices: [{ message: { content: 'not json at all!!!' } }] }),
    } as unknown as Response;
    fetchSpy.mockResolvedValueOnce(badResponse);

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);

    await expect(
      provider.summarizeMerge({ descriptions: ['A', 'B'], availableCategories: [] }),
    ).rejects.toThrow(LlmInvalidResponseError);
  });

  it('content missing "description" → throws LlmInvalidResponseError', async () => {
    fetchSpy.mockResolvedValueOnce(makeOkResponse(JSON.stringify({ category: 'Materials' })));

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);

    await expect(
      provider.summarizeMerge({ descriptions: ['A', 'B'], availableCategories: [] }),
    ).rejects.toThrow(LlmInvalidResponseError);
  });

  it('content with empty-string "description" → throws LlmInvalidResponseError', async () => {
    fetchSpy.mockResolvedValueOnce(makeOkResponse(buildMergeContent('', null)));

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);

    await expect(
      provider.summarizeMerge({ descriptions: ['A', 'B'], availableCategories: [] }),
    ).rejects.toThrow(LlmInvalidResponseError);
  });

  it('finish_reason: "length" → throws LlmInvalidResponseError with truncation message', async () => {
    const truncatedResponse = {
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: '{"description":"Tile' }, finish_reason: 'length' }],
        }),
    } as unknown as Response;
    fetchSpy.mockResolvedValueOnce(truncatedResponse);

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);

    await expect(
      provider.summarizeMerge({ descriptions: ['A', 'B'], availableCategories: [] }),
    ).rejects.toThrow(LlmInvalidResponseError);
  });
});

// ─── Story #1797: validateMergeResult() ──────────────────────────────────────

describe('validateMergeResult()', () => {
  describe('valid inputs', () => {
    it('validates a minimal valid result (description + category)', () => {
      const result = validateMergeResult({ description: 'Tile and grout', category: 'Materials' });
      expect(result.description).toBe('Tile and grout');
      expect(result.category).toBe('Materials');
    });

    it('validates category: null', () => {
      const result = validateMergeResult({ description: 'Consolidated', category: null });
      expect(result.category).toBeNull();
    });

    it('defaults category to null when the field is absent entirely', () => {
      const result = validateMergeResult({ description: 'Consolidated' });
      expect(result.category).toBeNull();
    });

    it('trims leading/trailing whitespace from description', () => {
      const result = validateMergeResult({ description: '  Tile work  ', category: null });
      expect(result.description).toBe('Tile work');
    });

    it('truncates description longer than 500 chars to exactly 500', () => {
      const longDescription = 'A'.repeat(600);
      const result = validateMergeResult({ description: longDescription, category: null });
      expect(result.description).toHaveLength(500);
      expect(result.description).toBe('A'.repeat(500));
    });

    it('trims whitespace from category and caps it at 30 characters', () => {
      const result = validateMergeResult({
        description: 'X',
        category: `  ${'B'.repeat(50)}  `,
      });
      expect(result.category).toHaveLength(30);
      expect(result.category).toBe('B'.repeat(30));
    });

    it('treats whitespace-only category as null', () => {
      const result = validateMergeResult({ description: 'X', category: '   ' });
      expect(result.category).toBeNull();
    });
  });

  describe('required field validation', () => {
    it('non-object body → throws LlmInvalidResponseError', () => {
      expect(() => validateMergeResult(null)).toThrow(LlmInvalidResponseError);
      expect(() => validateMergeResult(undefined)).toThrow(LlmInvalidResponseError);
      expect(() => validateMergeResult('a string')).toThrow(LlmInvalidResponseError);
      expect(() => validateMergeResult(42)).toThrow(LlmInvalidResponseError);
    });

    it('missing "description" → throws LlmInvalidResponseError', () => {
      expect(() => validateMergeResult({ category: 'Materials' })).toThrow(LlmInvalidResponseError);
    });

    it('non-string "description" → throws LlmInvalidResponseError', () => {
      expect(() => validateMergeResult({ description: 42, category: null })).toThrow(
        LlmInvalidResponseError,
      );
    });

    it('empty-string "description" → throws LlmInvalidResponseError', () => {
      expect(() => validateMergeResult({ description: '', category: null })).toThrow(
        LlmInvalidResponseError,
      );
    });

    it('whitespace-only "description" → throws LlmInvalidResponseError', () => {
      expect(() => validateMergeResult({ description: '   ', category: null })).toThrow(
        LlmInvalidResponseError,
      );
    });

    it('non-string, non-null "category" → throws LlmInvalidResponseError', () => {
      expect(() => validateMergeResult({ description: 'X', category: 42 })).toThrow(
        LlmInvalidResponseError,
      );
    });
  });
});

// ─── Story #1901: provider.generateReportContent() ───────────────────────────

function buildReportContentInput(
  overrides: Partial<GenerateReportContentLlmInput> = {},
): GenerateReportContentLlmInput {
  return {
    language: 'en',
    reportType: 'claim',
    sourceName: 'Home Loan',
    sourceType: 'bank_loan',
    totalAmount: 100000,
    currency: 'EUR',
    invoices: [
      {
        invoiceId: 'inv-1',
        vendorName: 'ACME Builders',
        invoiceNumber: 'INV-001',
        date: '2026-01-15',
        amount: 100000,
        notes: null,
        budgetLines: [],
      },
    ],
    ...overrides,
  };
}

function buildReportContentContent(
  letterSubject: string,
  letterBody: string,
  descriptions: Array<{ invoiceId: string; description: string }>,
): string {
  return JSON.stringify({ letterSubject, letterBody, descriptions });
}

describe('createOpenAICompatibleProvider — generateReportContent() happy path', () => {
  it('calls ${baseUrl}/chat/completions (same endpoint as extract/summarizeMerge)', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeOkResponse(
        buildReportContentContent('Subject', 'Body', [
          { invoiceId: 'inv-1', description: 'Foundation work' },
        ]),
      ),
    );

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);
    await provider.generateReportContent(buildReportContentInput());

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.com/chat/completions');
  });

  it('sends the REPORT_CONTENT_SYSTEM_PROMPT as the system message', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeOkResponse(
        buildReportContentContent('Subject', 'Body', [
          { invoiceId: 'inv-1', description: 'Foundation work' },
        ]),
      ),
    );

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);
    await provider.generateReportContent(buildReportContentInput());

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      messages: Array<{ role: string; content: string }>;
    };
    const systemMessage = body.messages.find((m) => m.role === 'system');
    expect(systemMessage?.content).toContain('professional bank-report content writer');
  });

  it('sends a user message built from buildReportContentUserPrompt (language, source, invoices)', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeOkResponse(
        buildReportContentContent('Subject', 'Body', [
          { invoiceId: 'inv-1', description: 'Foundation work' },
        ]),
      ),
    );

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);
    await provider.generateReportContent(
      buildReportContentInput({ language: 'de', sourceName: 'Bausparvertrag' }),
    );

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      messages: Array<{ role: string; content: string }>;
    };
    const userMessage = body.messages.find((m) => m.role === 'user');
    expect(userMessage?.content).toContain('Language: German');
    expect(userMessage?.content).toContain('Bausparvertrag');
    expect(userMessage?.content).toContain('Invoice ID: inv-1');
  });

  it('sends response_format: { type: "json_object" } (openai profile)', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeOkResponse(
        buildReportContentContent('Subject', 'Body', [
          { invoiceId: 'inv-1', description: 'Foundation work' },
        ]),
      ),
    );

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);
    await provider.generateReportContent(buildReportContentInput());

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { response_format: { type: string } };
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('anthropic profile sends the REPORT_CONTENT_SCHEMA (not EXTRACTED_LINES_SCHEMA — bug-fix regression guard)', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeOkResponse(
        buildReportContentContent('Subject', 'Body', [
          { invoiceId: 'inv-1', description: 'Foundation work' },
        ]),
      ),
    );

    const provider = createOpenAICompatibleProvider({ ...BASE_CONFIG, provider: 'anthropic' });
    await provider.generateReportContent(buildReportContentInput());

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      response_format: { json_schema: { name: string } };
    };
    expect(body.response_format.json_schema.name).toBe('report_content');
  });

  it('converts the wire-format descriptions array into a Record<invoiceId, description>', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeOkResponse(
        buildReportContentContent('Subject', 'Body', [
          { invoiceId: 'inv-1', description: 'Foundation work' },
          { invoiceId: 'inv-2', description: 'Roofing' },
        ]),
      ),
    );

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);
    const result = await provider.generateReportContent(
      buildReportContentInput({
        invoices: [
          { ...buildReportContentInput().invoices[0]!, invoiceId: 'inv-1' },
          { ...buildReportContentInput().invoices[0]!, invoiceId: 'inv-2' },
        ],
      }),
    );

    expect(result.descriptions).toEqual({
      'inv-1': 'Foundation work',
      'inv-2': 'Roofing',
    });
  });

  it('returns letterSubject and letterBody parsed from the response', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeOkResponse(
        buildReportContentContent('Financial Report 2026', 'Dear Sir or Madam,', [
          { invoiceId: 'inv-1', description: 'Foundation work' },
        ]),
      ),
    );

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);
    const result = await provider.generateReportContent(buildReportContentInput());

    expect(result.letterSubject).toBe('Financial Report 2026');
    expect(result.letterBody).toBe('Dear Sir or Madam,');
  });
});

describe('createOpenAICompatibleProvider — generateReportContent() failure modes', () => {
  it('fetch rejects (network error) → throws LlmUnreachableError', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);

    await expect(provider.generateReportContent(buildReportContentInput())).rejects.toThrow(
      LlmUnreachableError,
    );
  });

  it('response status 500 → throws LlmUpstreamError', async () => {
    fetchSpy.mockResolvedValueOnce(makeErrorResponse(500));

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);

    await expect(provider.generateReportContent(buildReportContentInput())).rejects.toThrow(
      LlmUpstreamError,
    );
  });

  it('content is not valid JSON → throws LlmInvalidResponseError', async () => {
    fetchSpy.mockResolvedValueOnce(makeOkResponse('not valid json {{{'));

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);

    await expect(provider.generateReportContent(buildReportContentInput())).rejects.toThrow(
      LlmInvalidResponseError,
    );
  });

  it("missing a requested invoice's description → throws LlmInvalidResponseError", async () => {
    fetchSpy.mockResolvedValueOnce(
      makeOkResponse(buildReportContentContent('Subject', 'Body', [])),
    );

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);

    await expect(provider.generateReportContent(buildReportContentInput())).rejects.toThrow(
      LlmInvalidResponseError,
    );
  });

  it('finish_reason: "length" → throws LlmInvalidResponseError with truncation message', async () => {
    const truncatedResponse = {
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: '{"letterSubject":"Su' }, finish_reason: 'length' }],
        }),
    } as unknown as Response;
    fetchSpy.mockResolvedValueOnce(truncatedResponse);

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);

    let thrown: unknown;
    try {
      await provider.generateReportContent(buildReportContentInput());
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(LlmInvalidResponseError);
    expect((thrown as LlmInvalidResponseError).message.toLowerCase()).toContain('max_tokens');
  });
});

// ─── Story #1901: validateGenerateReportContentResult() ─────────────────────

describe('validateGenerateReportContentResult()', () => {
  // ─── Story #1952: markup stripping integration ────────────────────────────
  // These tests verify that stripMarkup is applied inside validateGenerateReportContentResult
  // before length capping and before the result is returned.
  describe('markup stripping — Story #1952', () => {
    it('strips **bold** from letterSubject before returning', () => {
      const result = validateGenerateReportContentResult(
        {
          letterSubject: '**Construction** Project Report',
          letterBody: 'Body',
          descriptions: [{ invoiceId: 'inv-1', description: 'Desc' }],
        },
        ['inv-1'],
      );
      expect(result.letterSubject).toBe('Construction Project Report');
    });

    it('strips bullet list from letterBody before returning', () => {
      const result = validateGenerateReportContentResult(
        {
          letterSubject: 'Subject',
          letterBody: '- Point A\n- Point B',
          descriptions: [{ invoiceId: 'inv-1', description: 'Desc' }],
        },
        ['inv-1'],
      );
      expect(result.letterBody).toBe('Point A\nPoint B');
    });

    it('strips HTML from descriptions[].description before returning', () => {
      const result = validateGenerateReportContentResult(
        {
          letterSubject: 'Subject',
          letterBody: 'Body',
          descriptions: [{ invoiceId: 'inv-1', description: '<b>Foundation</b> work completed' }],
        },
        ['inv-1'],
      );
      expect(result.descriptions['inv-1']).toBe('Foundation work completed');
    });

    it('markup is stripped before truncation — stripped length determines the cap', () => {
      // Input letterSubject is '**' + 'S'.repeat(limit) + '**', which is limit+4 chars.
      // After stripping the bold markers the inner text is exactly `limit` chars (at the boundary).
      // If truncation were applied to the raw (pre-strip) string, it would cut into the markers and
      // the result would be shorter than the limit.  If strip happens first, result === 'S'.repeat(limit).
      const result = validateGenerateReportContentResult(
        {
          letterSubject: '**' + 'S'.repeat(REPORT_CONTENT_LIMITS.letterSubject) + '**',
          letterBody: 'Body',
          descriptions: [{ invoiceId: 'inv-1', description: 'Desc' }],
        },
        ['inv-1'],
      );
      expect(result.letterSubject).toHaveLength(REPORT_CONTENT_LIMITS.letterSubject);
      expect(result.letterSubject).toBe('S'.repeat(REPORT_CONTENT_LIMITS.letterSubject));
    });

    it('fallback: letterBody preserved when stripping yields whitespace-only', () => {
      // '** **' strips to ' ' (whitespace-only) → stripMarkup returns original '** **'
      const result = validateGenerateReportContentResult(
        {
          letterSubject: 'Subject',
          letterBody: '** **',
          descriptions: [{ invoiceId: 'inv-1', description: 'Desc' }],
        },
        ['inv-1'],
      );
      expect(result.letterBody).toBe('** **');
    });
  });

  describe('valid inputs', () => {
    it('validates a minimal valid result', () => {
      const result = validateGenerateReportContentResult(
        {
          letterSubject: 'Subject',
          letterBody: 'Body',
          descriptions: [{ invoiceId: 'inv-1', description: 'Desc' }],
        },
        ['inv-1'],
      );
      expect(result.letterSubject).toBe('Subject');
      expect(result.letterBody).toBe('Body');
      expect(result.descriptions).toEqual({ 'inv-1': 'Desc' });
    });

    it('trims whitespace from letterSubject and letterBody', () => {
      const result = validateGenerateReportContentResult(
        {
          letterSubject: '  Subject  ',
          letterBody: '  Body  ',
          descriptions: [{ invoiceId: 'inv-1', description: 'Desc' }],
        },
        ['inv-1'],
      );
      expect(result.letterSubject).toBe('Subject');
      expect(result.letterBody).toBe('Body');
    });

    it('trims whitespace from each description', () => {
      const result = validateGenerateReportContentResult(
        {
          letterSubject: 'Subject',
          letterBody: 'Body',
          descriptions: [{ invoiceId: 'inv-1', description: '  Desc  ' }],
        },
        ['inv-1'],
      );
      expect(result.descriptions['inv-1']).toBe('Desc');
    });

    // ─── #1931: caps now derive from REPORT_CONTENT_LIMITS (150 / 2000 / 200) ────
    // Previously the validator truncated at 200/3000/300 — a wider limit than the prompt
    // instructed (150/2000/200), so overlong-but-under-the-old-cap output passed through
    // unclipped. AC 4.1/4.2/4.3: exactly one definition for each cap, and the response is
    // capped (never rejected) at that same value.

    it(`truncates letterSubject longer than ${REPORT_CONTENT_LIMITS.letterSubject} chars to exactly ${REPORT_CONTENT_LIMITS.letterSubject}`, () => {
      const result = validateGenerateReportContentResult(
        {
          letterSubject: 'S'.repeat(REPORT_CONTENT_LIMITS.letterSubject + 100),
          letterBody: 'Body',
          descriptions: [{ invoiceId: 'inv-1', description: 'Desc' }],
        },
        ['inv-1'],
      );
      expect(result.letterSubject).toHaveLength(REPORT_CONTENT_LIMITS.letterSubject);
      expect(result.letterSubject).toBe('S'.repeat(REPORT_CONTENT_LIMITS.letterSubject));
    });

    it('does not truncate a letterSubject one character UNDER the limit', () => {
      const underLimit = 'S'.repeat(REPORT_CONTENT_LIMITS.letterSubject - 1);
      const result = validateGenerateReportContentResult(
        {
          letterSubject: underLimit,
          letterBody: 'Body',
          descriptions: [{ invoiceId: 'inv-1', description: 'Desc' }],
        },
        ['inv-1'],
      );
      expect(result.letterSubject).toHaveLength(REPORT_CONTENT_LIMITS.letterSubject - 1);
      expect(result.letterSubject).toBe(underLimit);
    });

    it('does not truncate a letterSubject at exactly the limit (boundary)', () => {
      const atLimit = 'S'.repeat(REPORT_CONTENT_LIMITS.letterSubject);
      const result = validateGenerateReportContentResult(
        {
          letterSubject: atLimit,
          letterBody: 'Body',
          descriptions: [{ invoiceId: 'inv-1', description: 'Desc' }],
        },
        ['inv-1'],
      );
      expect(result.letterSubject).toHaveLength(REPORT_CONTENT_LIMITS.letterSubject);
      expect(result.letterSubject).toBe(atLimit);
    });

    it(`truncates letterBody longer than ${REPORT_CONTENT_LIMITS.letterBody} chars to exactly ${REPORT_CONTENT_LIMITS.letterBody}`, () => {
      const result = validateGenerateReportContentResult(
        {
          letterSubject: 'Subject',
          letterBody: 'B'.repeat(REPORT_CONTENT_LIMITS.letterBody + 500),
          descriptions: [{ invoiceId: 'inv-1', description: 'Desc' }],
        },
        ['inv-1'],
      );
      expect(result.letterBody).toHaveLength(REPORT_CONTENT_LIMITS.letterBody);
      expect(result.letterBody).toBe('B'.repeat(REPORT_CONTENT_LIMITS.letterBody));
    });

    it('does not truncate a letterBody one character UNDER the limit', () => {
      const underLimit = 'B'.repeat(REPORT_CONTENT_LIMITS.letterBody - 1);
      const result = validateGenerateReportContentResult(
        {
          letterSubject: 'Subject',
          letterBody: underLimit,
          descriptions: [{ invoiceId: 'inv-1', description: 'Desc' }],
        },
        ['inv-1'],
      );
      expect(result.letterBody).toHaveLength(REPORT_CONTENT_LIMITS.letterBody - 1);
      expect(result.letterBody).toBe(underLimit);
    });

    it('does not truncate a letterBody at exactly the limit (boundary)', () => {
      const atLimit = 'B'.repeat(REPORT_CONTENT_LIMITS.letterBody);
      const result = validateGenerateReportContentResult(
        {
          letterSubject: 'Subject',
          letterBody: atLimit,
          descriptions: [{ invoiceId: 'inv-1', description: 'Desc' }],
        },
        ['inv-1'],
      );
      expect(result.letterBody).toHaveLength(REPORT_CONTENT_LIMITS.letterBody);
      expect(result.letterBody).toBe(atLimit);
    });

    it(`truncates a description longer than ${REPORT_CONTENT_LIMITS.description} chars to exactly ${REPORT_CONTENT_LIMITS.description}`, () => {
      const result = validateGenerateReportContentResult(
        {
          letterSubject: 'Subject',
          letterBody: 'Body',
          descriptions: [
            {
              invoiceId: 'inv-1',
              description: 'D'.repeat(REPORT_CONTENT_LIMITS.description + 100),
            },
          ],
        },
        ['inv-1'],
      );
      expect(result.descriptions['inv-1']).toHaveLength(REPORT_CONTENT_LIMITS.description);
      expect(result.descriptions['inv-1']).toBe('D'.repeat(REPORT_CONTENT_LIMITS.description));
    });

    it('does not truncate a description one character UNDER the limit', () => {
      const underLimit = 'D'.repeat(REPORT_CONTENT_LIMITS.description - 1);
      const result = validateGenerateReportContentResult(
        {
          letterSubject: 'Subject',
          letterBody: 'Body',
          descriptions: [{ invoiceId: 'inv-1', description: underLimit }],
        },
        ['inv-1'],
      );
      expect(result.descriptions['inv-1']).toHaveLength(REPORT_CONTENT_LIMITS.description - 1);
      expect(result.descriptions['inv-1']).toBe(underLimit);
    });

    it('does not truncate a description at exactly the limit (boundary)', () => {
      const atLimit = 'D'.repeat(REPORT_CONTENT_LIMITS.description);
      const result = validateGenerateReportContentResult(
        {
          letterSubject: 'Subject',
          letterBody: 'Body',
          descriptions: [{ invoiceId: 'inv-1', description: atLimit }],
        },
        ['inv-1'],
      );
      expect(result.descriptions['inv-1']).toHaveLength(REPORT_CONTENT_LIMITS.description);
      expect(result.descriptions['inv-1']).toBe(atLimit);
    });

    it('converts the descriptions array into a Record keyed by invoiceId', () => {
      const result = validateGenerateReportContentResult(
        {
          letterSubject: 'Subject',
          letterBody: 'Body',
          descriptions: [
            { invoiceId: 'inv-1', description: 'A' },
            { invoiceId: 'inv-2', description: 'B' },
          ],
        },
        ['inv-1', 'inv-2'],
      );
      expect(result.descriptions).toEqual({ 'inv-1': 'A', 'inv-2': 'B' });
    });

    it('does not throw when the descriptions array contains an ID beyond the requested set (extra-id stripping happens at the service layer, not here)', () => {
      const result = validateGenerateReportContentResult(
        {
          letterSubject: 'Subject',
          letterBody: 'Body',
          descriptions: [
            { invoiceId: 'inv-1', description: 'A' },
            { invoiceId: 'unexpected-extra-id', description: 'Hallucinated' },
          ],
        },
        ['inv-1'],
      );
      // The validator itself does not filter extras — it only ensures all REQUESTED ids are
      // present. Defense-in-depth stripping of unrequested ids is reportContentGenerationService's
      // job (see reportContentGenerationService.test.ts scenario 10).
      expect(result.descriptions).toEqual({ 'inv-1': 'A', 'unexpected-extra-id': 'Hallucinated' });
    });

    it('accepts an empty requestedInvoiceIds array (nothing required to be present)', () => {
      const result = validateGenerateReportContentResult(
        { letterSubject: 'Subject', letterBody: 'Body', descriptions: [] },
        [],
      );
      expect(result.descriptions).toEqual({});
    });
  });

  describe('required field validation', () => {
    it('non-object body → throws LlmInvalidResponseError', () => {
      expect(() => validateGenerateReportContentResult(null, [])).toThrow(LlmInvalidResponseError);
      expect(() => validateGenerateReportContentResult(undefined, [])).toThrow(
        LlmInvalidResponseError,
      );
      expect(() => validateGenerateReportContentResult('a string', [])).toThrow(
        LlmInvalidResponseError,
      );
      expect(() => validateGenerateReportContentResult(42, [])).toThrow(LlmInvalidResponseError);
    });

    it('missing "letterSubject" → throws LlmInvalidResponseError', () => {
      expect(() =>
        validateGenerateReportContentResult({ letterBody: 'Body', descriptions: [] }, []),
      ).toThrow(LlmInvalidResponseError);
    });

    it('empty-string "letterSubject" → throws LlmInvalidResponseError', () => {
      expect(() =>
        validateGenerateReportContentResult(
          { letterSubject: '', letterBody: 'Body', descriptions: [] },
          [],
        ),
      ).toThrow(LlmInvalidResponseError);
    });

    it('missing "letterBody" → throws LlmInvalidResponseError', () => {
      expect(() =>
        validateGenerateReportContentResult({ letterSubject: 'Subject', descriptions: [] }, []),
      ).toThrow(LlmInvalidResponseError);
    });

    it('empty-string "letterBody" → throws LlmInvalidResponseError', () => {
      expect(() =>
        validateGenerateReportContentResult(
          { letterSubject: 'Subject', letterBody: '', descriptions: [] },
          [],
        ),
      ).toThrow(LlmInvalidResponseError);
    });

    it('non-array "descriptions" → throws LlmInvalidResponseError', () => {
      expect(() =>
        validateGenerateReportContentResult(
          { letterSubject: 'Subject', letterBody: 'Body', descriptions: 'not an array' },
          [],
        ),
      ).toThrow(LlmInvalidResponseError);
    });

    it('a descriptions[] item that is not an object → throws LlmInvalidResponseError', () => {
      expect(() =>
        validateGenerateReportContentResult(
          { letterSubject: 'Subject', letterBody: 'Body', descriptions: ['not an object'] },
          [],
        ),
      ).toThrow(LlmInvalidResponseError);
    });

    it('a descriptions[] item missing "invoiceId" → throws LlmInvalidResponseError', () => {
      expect(() =>
        validateGenerateReportContentResult(
          {
            letterSubject: 'Subject',
            letterBody: 'Body',
            descriptions: [{ description: 'Desc' }],
          },
          [],
        ),
      ).toThrow(LlmInvalidResponseError);
    });

    it('a descriptions[] item with empty-string "invoiceId" → throws LlmInvalidResponseError', () => {
      expect(() =>
        validateGenerateReportContentResult(
          {
            letterSubject: 'Subject',
            letterBody: 'Body',
            descriptions: [{ invoiceId: '', description: 'Desc' }],
          },
          [],
        ),
      ).toThrow(LlmInvalidResponseError);
    });

    it('a descriptions[] item missing "description" → throws LlmInvalidResponseError', () => {
      expect(() =>
        validateGenerateReportContentResult(
          {
            letterSubject: 'Subject',
            letterBody: 'Body',
            descriptions: [{ invoiceId: 'inv-1' }],
          },
          [],
        ),
      ).toThrow(LlmInvalidResponseError);
    });

    it('a descriptions[] item with empty-string "description" → throws LlmInvalidResponseError', () => {
      expect(() =>
        validateGenerateReportContentResult(
          {
            letterSubject: 'Subject',
            letterBody: 'Body',
            descriptions: [{ invoiceId: 'inv-1', description: '' }],
          },
          [],
        ),
      ).toThrow(LlmInvalidResponseError);
    });

    it('missing a requested invoiceId in descriptions → throws LlmInvalidResponseError with missingCount detail', () => {
      let thrown: unknown;
      try {
        validateGenerateReportContentResult(
          { letterSubject: 'Subject', letterBody: 'Body', descriptions: [] },
          ['inv-1', 'inv-2'],
        );
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(LlmInvalidResponseError);
      expect((thrown as LlmInvalidResponseError).details?.missingCount).toBe(2);
    });

    it('one requested invoiceId present, one missing → throws with missingCount 1', () => {
      let thrown: unknown;
      try {
        validateGenerateReportContentResult(
          {
            letterSubject: 'Subject',
            letterBody: 'Body',
            descriptions: [{ invoiceId: 'inv-1', description: 'Desc' }],
          },
          ['inv-1', 'inv-2'],
        );
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(LlmInvalidResponseError);
      expect((thrown as LlmInvalidResponseError).details?.missingCount).toBe(1);
    });
  });
});

// ─── Story #1952: stripMarkup() — markup sanitization ────────────────────────

describe('stripMarkup() — markup sanitization (Story #1952)', () => {
  // ── Happy path: markup is removed ─────────────────────────────────────────

  it('returns plain text unchanged — no markup chars', () => {
    const input = 'Dear Bank Officer,\n\nPlease find our report.';
    expect(stripMarkup(input)).toBe(input);
  });

  it('strips **bold** markers', () => {
    expect(stripMarkup('The **key** figure is 5000 EUR.')).toBe('The key figure is 5000 EUR.');
  });

  it('strips __bold__ markers', () => {
    expect(stripMarkup('This __matters__.')).toBe('This matters.');
  });

  it('strips *italic* markers', () => {
    expect(stripMarkup('Amount *increased* significantly.')).toBe(
      'Amount increased significantly.',
    );
  });

  it('strips _italic_ markers', () => {
    expect(stripMarkup('Amount _decreased_ slightly.')).toBe('Amount decreased slightly.');
  });

  it('strips # ATX heading at line start', () => {
    expect(stripMarkup('# Project Report\nBody text.')).toBe('Project Report\nBody text.');
  });

  it('strips ## through ###### ATX headings at line start', () => {
    expect(stripMarkup('## Section\n### Sub-section')).toBe('Section\nSub-section');
  });

  it('strips leading - list marker — does not merge lines', () => {
    expect(stripMarkup('- First item\n- Second item')).toBe('First item\nSecond item');
  });

  it('strips leading * list marker at line start', () => {
    expect(stripMarkup('* Item one\n* Item two')).toBe('Item one\nItem two');
  });

  it('strips leading + list marker at line start', () => {
    expect(stripMarkup('+ Line A')).toBe('Line A');
  });

  it('strips leading numbered list marker with period (N.)', () => {
    expect(stripMarkup('1. First\n2. Second')).toBe('First\nSecond');
  });

  it('strips leading numbered list marker with parenthesis (N))', () => {
    expect(stripMarkup('1) First\n2) Second')).toBe('First\nSecond');
  });

  it('strips <b> and </b> HTML tags — keeps inner text', () => {
    expect(stripMarkup('<b>bold</b> content')).toBe('bold content');
  });

  it('strips <br/> self-closing HTML tag', () => {
    expect(stripMarkup('line1<br/>line2')).toBe('line1line2');
  });

  it('strips <p> and </p> HTML tags', () => {
    expect(stripMarkup('<p>paragraph text</p>')).toBe('paragraph text');
  });

  it('strips nested HTML tags — processes all matches', () => {
    expect(stripMarkup('<b>Important</b> and <i>noted</i>')).toBe('Important and noted');
  });

  it('bold + italic combination both stripped', () => {
    expect(stripMarkup('**bold** and *italic* text')).toBe('bold and italic text');
  });

  it('heading + list combo — both stripped, line structure preserved', () => {
    expect(stripMarkup('# Summary\n- Point A\n- Point B')).toBe('Summary\nPoint A\nPoint B');
  });

  // ── False-positive guards: must NOT strip ─────────────────────────────────

  it('preserves mid-line hyphen (Pos. 3 - Dachstuhl)', () => {
    const input = 'Pos. 3 - Dachstuhl';
    expect(stripMarkup(input)).toBe(input);
  });

  it('preserves date-string hyphens (2024-117)', () => {
    const input = 'Rechnung 2024-117 liegt vor.';
    expect(stripMarkup(input)).toBe(input);
  });

  it('preserves Mo-Fr abbreviation', () => {
    const input = 'Arbeitszeit Mo-Fr 08:00-17:00';
    expect(stripMarkup(input)).toBe(input);
  });

  it('preserves # inside a line (not at line start)', () => {
    const input = 'Rechnung #2024-117';
    expect(stripMarkup(input)).toBe(input);
  });

  it('preserves lone * with no matching partner', () => {
    const input = 'Price: 5 EUR* (VAT incl.)';
    expect(stripMarkup(input)).toBe(input);
  });

  it('preserves lone _ with no matching partner', () => {
    const input = 'value_field without close';
    expect(stripMarkup(input)).toBe(input);
  });

  it('preserves < not opening a well-formed tag (Beträge < 500 EUR)', () => {
    const input = 'Beträge < 500 EUR';
    expect(stripMarkup(input)).toBe(input);
  });

  it('passes \\n and \\n\\n paragraph breaks through unchanged', () => {
    const input = 'Paragraph 1.\n\nParagraph 2.\nContinued.';
    expect(stripMarkup(input)).toBe(input);
  });

  it('passes German umlauts, ß, and € through unchanged', () => {
    const input = 'Über die Maßnahmen: Straße kostet 5.000 €.';
    expect(stripMarkup(input)).toBe(input);
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────

  it('returns original when stripping leaves empty string', () => {
    // '* ' matches the list-marker regex and strips to ''; fallback returns original
    expect(stripMarkup('* ')).toBe('* ');
  });

  it('returns original when stripping leaves whitespace-only', () => {
    // '** **' bold-wraps a space; stripped inner is ' '; fallback returns original
    expect(stripMarkup('** **')).toBe('** **');
  });

  it('empty string input returns empty string', () => {
    // '' trims to '' which equals ''; fallback returns original ''
    expect(stripMarkup('')).toBe('');
  });

  it('multi-line body with mixed markup — strips all, preserves line breaks', () => {
    expect(stripMarkup('## Report\n\n- Item 1\n- Item 2\n\n<b>Total</b>: 5000 EUR')).toBe(
      'Report\n\nItem 1\nItem 2\n\nTotal: 5000 EUR',
    );
  });

  // ── AC 3.2: markup and legitimate punctuation on the same line ─────────────

  it('strips only the leading bullet and preserves the mid-line hyphen (AC 3.2)', () => {
    expect(stripMarkup('- Pos. 3 - Dachstuhl')).toBe('Pos. 3 - Dachstuhl');
  });

  // ── Intraword underscores are not emphasis (CommonMark) ───────────────────

  it('preserves snake_case identifiers with two or more underscores', () => {
    const input = 'Feld budget_line_id wurde geprüft';
    expect(stripMarkup(input)).toBe(input);
  });

  it('preserves underscore-separated reference numbers (RE_2024_117)', () => {
    const input = 'Rechnung RE_2024_117 vom 3. Mai';
    expect(stripMarkup(input)).toBe(input);
  });

  it('preserves underscores in an e-mail local part', () => {
    const input = 'E-Mail: max_mustermann_bau@example.com';
    expect(stripMarkup(input)).toBe(input);
  });

  it('preserves underscores between digits (4_5 … 6_7)', () => {
    const input = 'Rate: 4_5 Prozent und 6_7 Prozent';
    expect(stripMarkup(input)).toBe(input);
  });

  // ── Whitespace-flanked / unpaired asterisks are not emphasis ──────────────

  it('preserves two footnote asterisks on one line', () => {
    const input = 'Preis 5 EUR* zzgl. MwSt, Rabatt 10%* auf Position 4';
    expect(stripMarkup(input)).toBe(input);
  });

  it('preserves asterisks used as multiplication signs', () => {
    const input = 'Die Kosten für Position 3 * 2 Einheiten * 5 EUR ergeben 30 EUR';
    expect(stripMarkup(input)).toBe(input);
  });

  it('preserves spaced asterisks in arithmetic prose', () => {
    const input = '2024 * 12 = Monate, 5 * 3 = 15';
    expect(stripMarkup(input)).toBe(input);
  });

  // ── German ordinals and dates are prose, not lists ────────────────────────

  it('preserves a German date opening a line (15. Mai 2026)', () => {
    const input = '15. Mai 2026 wurde die Rechnung gestellt.';
    expect(stripMarkup(input)).toBe(input);
  });

  it('preserves a German ordinal opening a line (2. Rate)', () => {
    const input = '2. Rate in Höhe von 12.000 EUR ist fällig.';
    expect(stripMarkup(input)).toBe(input);
  });

  it('preserves a lone ordinal opening a paragraph after a blank line', () => {
    const input = 'Sehr geehrte Damen und Herren,\n\n1. Bauabschnitt ist fertig.';
    expect(stripMarkup(input)).toBe(input);
  });

  it('preserves a lone ordinal mid-body (3. Bauabschnitt)', () => {
    const input = 'Die Rechnung ging ein.\n\n3. Bauabschnitt: Dachstuhl abgeschlossen.';
    expect(stripMarkup(input)).toBe(input);
  });

  it('still strips a genuine numbered run of three lines', () => {
    expect(stripMarkup('1. Erster Punkt\n2. Zweiter Punkt\n3. Dritter Punkt')).toBe(
      'Erster Punkt\nZweiter Punkt\nDritter Punkt',
    );
  });

  // ── No trailing whitespace left behind by tag removal ─────────────────────

  it('leaves no trailing whitespace after removing a trailing tag', () => {
    expect(stripMarkup('Text <br/>')).toBe('Text');
    expect(stripMarkup('Bericht <b>fertig</b>  ')).toBe('Bericht fertig');
  });
});

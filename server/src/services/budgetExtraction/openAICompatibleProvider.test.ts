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
} from './openAICompatibleProvider.js';
import {
  LlmUnreachableError,
  LlmInvalidResponseError,
  LlmUpstreamError,
} from '../../errors/AppError.js';
import type { LlmConfig } from './types.js';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

// Fixtures directory resolved from project root (process.cwd() = project root when jest runs)
const FIXTURES_DIR = resolve(process.cwd(), 'server/src/services/budgetExtraction/fixtures');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BASE_CONFIG: LlmConfig = {
  baseUrl: 'https://api.example.com',
  apiKey: 'test-api-key',
  model: 'gpt-4o',
  requestTimeoutMs: 5000,
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

  it('returns parsed ExtractedLine[] from choices[0].message.content', async () => {
    const expected = [
      { description: 'Rigipsplatten', totalAmount: 62.5, confidence: 0.95 },
      { description: 'Trockenbauschrauben', totalAmount: 17.98, confidence: 0.9 },
    ];
    const content = buildValidLinesContent(expected);
    fetchSpy.mockResolvedValueOnce(makeOkResponse(content));

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);
    const result = await provider.extract('ocr text', {});

    expect(result).toHaveLength(2);
    expect(result[0]!.description).toBe('Rigipsplatten');
    expect(result[0]!.totalAmount).toBe(62.5);
    expect(result[0]!.confidence).toBe(0.95);
    expect(result[1]!.description).toBe('Trockenbauschrauben');
    expect(result[1]!.totalAmount).toBe(17.98);
  });

  it('returns empty array when lines is []', async () => {
    const content = buildValidLinesContent([]);
    fetchSpy.mockResolvedValueOnce(makeOkResponse(content));

    const provider = createOpenAICompatibleProvider(BASE_CONFIG);
    const result = await provider.extract('ocr text', {});

    expect(result).toEqual([]);
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

    expect(result[0]!.quantity).toBe(8);
    expect(result[0]!.unit).toBe('m²');
    expect(result[0]!.unitPrice).toBe(28.5);
    expect(result[0]!.includesVat).toBe(false);
    expect(result[0]!.vatRate).toBe(0.19);
    expect(result[0]!.vendorName).toBe('Fliesen König');
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
  describe('valid inputs', () => {
    it('validates a minimal valid line (only required fields)', () => {
      const result = validateExtractedLines({
        lines: [{ description: 'Item A', totalAmount: 100, confidence: 0.9 }],
      });

      expect(result).toHaveLength(1);
      expect(result[0]!.description).toBe('Item A');
      expect(result[0]!.totalAmount).toBe(100);
      expect(result[0]!.confidence).toBe(0.9);
    });

    it('validates an empty lines array', () => {
      const result = validateExtractedLines({ lines: [] });
      expect(result).toEqual([]);
    });

    it('validates multiple lines', () => {
      const result = validateExtractedLines({
        lines: [
          { description: 'Item A', totalAmount: 100, confidence: 0.9 },
          { description: 'Item B', totalAmount: 200, confidence: 0.5 },
        ],
      });
      expect(result).toHaveLength(2);
    });

    it('accepts confidence = 0 (boundary)', () => {
      const result = validateExtractedLines({
        lines: [{ description: 'Item A', totalAmount: 50, confidence: 0 }],
      });
      expect(result[0]!.confidence).toBe(0);
    });

    it('accepts confidence = 1 (boundary)', () => {
      const result = validateExtractedLines({
        lines: [{ description: 'Item A', totalAmount: 50, confidence: 1 }],
      });
      expect(result[0]!.confidence).toBe(1);
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

      expect(result[0]!.quantity).toBe(8);
      expect(result[0]!.unit).toBe('m²');
      expect(result[0]!.unitPrice).toBe(28.5);
      expect(result[0]!.includesVat).toBe(false);
      expect(result[0]!.vatRate).toBe(0.19);
      expect(result[0]!.vendorName).toBe('Fliesen König');
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

      expect(result[0]!.quantity).toBeUndefined();
      expect(result[0]!.unit).toBeUndefined();
      expect(result[0]!.unitPrice).toBeUndefined();
      expect(result[0]!.includesVat).toBeUndefined();
      expect(result[0]!.vatRate).toBeUndefined();
      expect(result[0]!.vendorName).toBeUndefined();
    });

    it('treats empty string unit as undefined', () => {
      const result = validateExtractedLines({
        lines: [{ description: 'Item A', unit: '', totalAmount: 100, confidence: 0.9 }],
      });
      expect(result[0]!.unit).toBeUndefined();
    });

    it('treats empty string vendorName as undefined', () => {
      const result = validateExtractedLines({
        lines: [{ description: 'Item A', vendorName: '', totalAmount: 100, confidence: 0.9 }],
      });
      expect(result[0]!.vendorName).toBeUndefined();
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
      expect(result[0]!.totalAmount).toBe(0);
    });

    it('accepts negative totalAmount (credit notes)', () => {
      const result = validateExtractedLines({
        lines: [{ description: 'Credit', totalAmount: -50.0, confidence: 0.7 }],
      });
      expect(result[0]!.totalAmount).toBe(-50.0);
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

      // Verify result shape
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      result.forEach((line) => {
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

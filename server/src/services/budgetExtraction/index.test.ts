/**
 * Unit and integration tests for budgetExtraction/index.ts
 *
 * Tests cover:
 * - getProvider() with autoItemizeEnabled: true returns a BudgetExtractionProvider
 * - getProvider() with autoItemizeEnabled: false throws LlmNotConfiguredError
 * - The returned provider's extract() method calls fetch end-to-end (smoke test)
 * - Re-exports are available (validateExtractedLines, createOpenAICompatibleProvider)
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { getProvider, validateExtractedLines, createOpenAICompatibleProvider } from './index.js';
import { LlmNotConfiguredError } from '../../errors/AppError.js';
import type { AppConfig } from '../../plugins/config.js';

// ─── Minimal AppConfig factory ────────────────────────────────────────────────

function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 3000,
    host: '0.0.0.0',
    databaseUrl: '/app/data/cornerstone.db',
    logLevel: 'info',
    nodeEnv: 'test',
    sessionDuration: 604800,
    secureCookies: false,
    trustProxy: false,
    oidcEnabled: false,
    paperlessEnabled: false,
    photoStoragePath: '/app/data/photos',
    photoMaxFileSizeMb: 20,
    diaryAutoEvents: true,
    diaryDraftRetentionDays: 30,
    currency: 'EUR',
    backupDir: '/backups',
    backupEnabled: true,
    // LLM defaults (disabled)
    llmBaseUrl: undefined,
    llmApiKey: undefined,
    llmModel: undefined,
    llmRequestTimeoutMs: 30000,
    llmMaxTokens: 16384,
    llmProvider: 'generic',
    autoItemizeEnabled: false,
    ...overrides,
  };
}

function makeLlmConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return makeConfig({
    llmBaseUrl: 'https://api.example.com',
    llmApiKey: 'test-key',
    llmModel: 'gpt-4o',
    llmRequestTimeoutMs: 5000,
    llmMaxTokens: 16384,
    llmProvider: 'generic',
    autoItemizeEnabled: true,
    ...overrides,
  });
}

// ─── fetch mock setup ─────────────────────────────────────────────────────────
// Same pattern as paperlessService.test.ts and openAICompatibleProvider.test.ts

const mockFetch = jest.fn<typeof fetch>();
let originalFetch: typeof fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch as unknown as typeof fetch;
  mockFetch.mockReset();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const fetchSpy = mockFetch;

// ─── getProvider() ────────────────────────────────────────────────────────────

describe('getProvider()', () => {
  it('throws LlmNotConfiguredError when autoItemizeEnabled is false', () => {
    const config = makeConfig({ autoItemizeEnabled: false });

    expect(() => getProvider(config)).toThrow(LlmNotConfiguredError);
  });

  it('LlmNotConfiguredError has code LLM_NOT_CONFIGURED', () => {
    const config = makeConfig({ autoItemizeEnabled: false });

    try {
      getProvider(config);
      throw new Error('should have thrown');
    } catch (err) {
      expect((err as LlmNotConfiguredError).code).toBe('LLM_NOT_CONFIGURED');
    }
  });

  it('LlmNotConfiguredError has statusCode 503', () => {
    const config = makeConfig({ autoItemizeEnabled: false });

    try {
      getProvider(config);
      throw new Error('should have thrown');
    } catch (err) {
      expect((err as LlmNotConfiguredError).statusCode).toBe(503);
    }
  });

  it('returns a provider object when autoItemizeEnabled is true', () => {
    const config = makeLlmConfig();
    const provider = getProvider(config);

    expect(provider).toBeDefined();
    expect(typeof provider.extract).toBe('function');
  });

  it('returns a provider with an extract function that returns a Promise', () => {
    const config = makeLlmConfig();
    const provider = getProvider(config);

    // Mock fetch so extract() does not make a real HTTP call
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ choices: [{ message: { content: JSON.stringify({ lines: [] }) } }] }),
    } as unknown as Response);

    const result = provider.extract('some ocr', {});
    expect(result).toBeInstanceOf(Promise);
  });

  it('provider smoke test: extract() returns ExtractedLine[] via mocked fetch', async () => {
    const config = makeLlmConfig();
    const provider = getProvider(config);

    const lines = [{ description: 'Rohrarbeiten', totalAmount: 350.0, confidence: 0.9 }];
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: JSON.stringify({ lines }) } }],
        }),
    } as unknown as Response);

    const result = await provider.extract('ocr text here', { vendorName: 'Installateur' });

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]!.description).toBe('Rohrarbeiten');
    expect(result.lines[0]!.totalAmount).toBe(350.0);
    expect(result.lines[0]!.confidence).toBe(0.9);
  });

  it('provider passes the configured baseUrl/apiKey/model from AppConfig to the fetch call', async () => {
    const config = makeLlmConfig({
      llmBaseUrl: 'https://my-gateway.example.com',
      llmApiKey: 'my-secret-key',
      llmModel: 'claude-haiku',
    });
    const provider = getProvider(config);

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: JSON.stringify({ lines: [] }) } }],
        }),
    } as unknown as Response);

    await provider.extract('ocr', {});

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('my-gateway.example.com');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer my-secret-key');
    const body = JSON.parse(init.body as string) as { model: string };
    expect(body.model).toBe('claude-haiku');
  });
});

// ─── Re-exports ───────────────────────────────────────────────────────────────

describe('index re-exports', () => {
  it('exports validateExtractedLines', () => {
    expect(typeof validateExtractedLines).toBe('function');
  });

  it('exports createOpenAICompatibleProvider', () => {
    expect(typeof createOpenAICompatibleProvider).toBe('function');
  });

  it('validateExtractedLines works when imported from index', () => {
    const result = validateExtractedLines({
      lines: [{ description: 'Re-export test', totalAmount: 100, confidence: 0.9 }],
    });
    expect(result.lines[0]!.description).toBe('Re-export test');
  });
});

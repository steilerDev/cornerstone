/**
 * Unit tests for invoiceAutoItemizeService.mergeLines() — Story #1797.
 *
 * mergeLines() is stateless (no DB writes) except a read of budget_categories to
 * resolve the LLM-chosen category name to a budgetCategoryId via mapCategoryNameToId.
 *
 * Follows the same in-memory SQLite DB pattern as invoiceAutoItemizeService.patch.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { mergeLines } from './invoiceAutoItemizeService.js';
import {
  LlmNotConfiguredError,
  LlmUnreachableError,
  LlmUpstreamError,
  LlmInvalidResponseError,
} from '../errors/AppError.js';
import type { AppConfig } from '../plugins/config.js';
import type { MergeLinesRequest } from '@cornerstone/shared';

type DbType = BetterSQLite3Database<typeof schema>;

function createTestDb(): { sqlite: Database.Database; db: DbType } {
  const sqlite = new Database(':memory:');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  runMigrations(sqlite);
  return { sqlite, db: drizzle(sqlite, { schema }) };
}

function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 3000,
    host: '0.0.0.0',
    databaseUrl: ':memory:',
    logLevel: 'error',
    nodeEnv: 'test',
    sessionDuration: 3600,
    secureCookies: false,
    trustProxy: false,
    oidcEnabled: false,
    paperlessUrl: 'http://paperless.test.local',
    paperlessExternalUrl: undefined,
    paperlessApiToken: 'test-paperless-token',
    paperlessFilterTag: undefined,
    paperlessEnabled: true,
    externalUrl: undefined,
    photoStoragePath: '/tmp/photos',
    photoMaxFileSizeMb: 20,
    diaryAutoEvents: false,
    diaryDraftRetentionDays: 30,
    currency: 'EUR',
    vatRate: 0.19,
    backupDir: '/backups',
    backupEnabled: false,
    llmBaseUrl: 'http://llm.test.local',
    llmApiKey: 'llm-key',
    llmModel: 'gpt-4o',
    llmRequestTimeoutMs: 5000,
    llmMaxTokens: 16384,
    llmProvider: 'openai',
    autoItemizeEnabled: true,
    ...overrides,
  };
}

const mockFetch = jest.fn<typeof fetch>();
let originalFetch: typeof fetch;

function makeOkFetchResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

function makeMergeLlmResponse(description: string, category: string | null): unknown {
  return {
    choices: [{ message: { content: JSON.stringify({ description, category }) } }],
  };
}

const DEFAULT_REQUEST: MergeLinesRequest = {
  descriptions: ['Tile work', 'Grout'],
  documentSummary: 'Bathroom renovation',
  availableCategories: ['Materials'],
};

describe('invoiceAutoItemizeService.mergeLines()', () => {
  let sqlite: Database.Database;
  let db: DbType;

  beforeEach(() => {
    const testDb = createTestDb();
    sqlite = testDb.sqlite;
    db = testDb.db;

    originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    mockFetch.mockReset();
  });

  afterEach(() => {
    sqlite.close();
    globalThis.fetch = originalFetch;
  });

  // ─── Success ─────────────────────────────────────────────────────────────────

  describe('success', () => {
    it('returns the LLM-synthesized description', async () => {
      mockFetch.mockResolvedValueOnce(
        makeOkFetchResponse(makeMergeLlmResponse('Tile work and grout', 'Materials')),
      );

      const result = await mergeLines(db, makeConfig(), DEFAULT_REQUEST);

      expect(result.description).toBe('Tile work and grout');
    });

    it('maps a recognized category name to its real budgetCategoryId (case-insensitive exact match)', async () => {
      mockFetch.mockResolvedValueOnce(
        makeOkFetchResponse(makeMergeLlmResponse('Tile work and grout', 'Materials')),
      );

      const result = await mergeLines(db, makeConfig(), DEFAULT_REQUEST);

      expect(result.category).toBe('Materials');
      expect(result.budgetCategoryId).toBe('bc-materials');
    });

    it('maps category via a known synonym (e.g. "Labor" trade alias)', async () => {
      mockFetch.mockResolvedValueOnce(
        makeOkFetchResponse(makeMergeLlmResponse('Installation labor', 'Labor')),
      );

      const result = await mergeLines(db, makeConfig(), {
        ...DEFAULT_REQUEST,
        availableCategories: ['Labor'],
      });

      expect(result.budgetCategoryId).toBe('bc-labor');
    });

    it('returns budgetCategoryId: null for an unrecognized category name, but still returns the raw category string', async () => {
      mockFetch.mockResolvedValueOnce(
        makeOkFetchResponse(makeMergeLlmResponse('Consolidated line', 'Unicorn Category')),
      );

      const result = await mergeLines(db, makeConfig(), {
        ...DEFAULT_REQUEST,
        availableCategories: ['Unicorn Category'],
      });

      expect(result.category).toBe('Unicorn Category');
      expect(result.budgetCategoryId).toBeNull();
    });

    it('returns budgetCategoryId: null when the LLM returns category: null', async () => {
      mockFetch.mockResolvedValueOnce(
        makeOkFetchResponse(makeMergeLlmResponse('Consolidated line', null)),
      );

      const result = await mergeLines(db, makeConfig(), {
        ...DEFAULT_REQUEST,
        availableCategories: [],
      });

      expect(result.category).toBeNull();
      expect(result.budgetCategoryId).toBeNull();
    });

    it('passes descriptions, documentSummary, and availableCategories through to provider.summarizeMerge', async () => {
      mockFetch.mockResolvedValueOnce(
        makeOkFetchResponse(makeMergeLlmResponse('Consolidated', 'Materials')),
      );

      await mergeLines(db, makeConfig(), {
        descriptions: ['Line A', 'Line B', 'Line C'],
        documentSummary: 'Kitchen quote',
        availableCategories: ['Materials', 'Labor'],
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string) as {
        messages: Array<{ role: string; content: string }>;
      };
      const userMessage = body.messages.find((m) => m.role === 'user');
      expect(userMessage?.content).toContain('1. Line A');
      expect(userMessage?.content).toContain('2. Line B');
      expect(userMessage?.content).toContain('3. Line C');
      expect(userMessage?.content).toContain('Kitchen quote');
      expect(userMessage?.content).toContain('- Materials');
      expect(userMessage?.content).toContain('- Labor');
    });

    it('does not write any DB rows (stateless summarization)', async () => {
      mockFetch.mockResolvedValueOnce(
        makeOkFetchResponse(makeMergeLlmResponse('Consolidated', 'Materials')),
      );

      const wibCountBefore = db.select().from(schema.workItemBudgets).all().length;
      const hibCountBefore = db.select().from(schema.householdItemBudgets).all().length;
      const iblCountBefore = db.select().from(schema.invoiceBudgetLines).all().length;

      await mergeLines(db, makeConfig(), DEFAULT_REQUEST);

      expect(db.select().from(schema.workItemBudgets).all().length).toBe(wibCountBefore);
      expect(db.select().from(schema.householdItemBudgets).all().length).toBe(hibCountBefore);
      expect(db.select().from(schema.invoiceBudgetLines).all().length).toBe(iblCountBefore);
    });

    it('handles documentSummary: undefined without throwing', async () => {
      mockFetch.mockResolvedValueOnce(
        makeOkFetchResponse(makeMergeLlmResponse('Consolidated', null)),
      );

      await expect(
        mergeLines(db, makeConfig(), {
          descriptions: ['A', 'B'],
          availableCategories: [],
        }),
      ).resolves.toBeDefined();
    });

    it('handles an empty availableCategories array without throwing', async () => {
      mockFetch.mockResolvedValueOnce(
        makeOkFetchResponse(makeMergeLlmResponse('Consolidated', null)),
      );

      const result = await mergeLines(db, makeConfig(), {
        descriptions: ['A', 'B'],
        availableCategories: [],
      });

      expect(result.category).toBeNull();
      expect(result.budgetCategoryId).toBeNull();
    });
  });

  // ─── Error propagation ────────────────────────────────────────────────────────

  describe('error propagation', () => {
    it('throws LlmNotConfiguredError when autoItemizeEnabled is false', async () => {
      await expect(
        mergeLines(db, makeConfig({ autoItemizeEnabled: false }), DEFAULT_REQUEST),
      ).rejects.toThrow(LlmNotConfiguredError);

      // No fetch call should have been made
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('propagates LlmUnreachableError when the LLM fetch throws a network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      await expect(mergeLines(db, makeConfig(), DEFAULT_REQUEST)).rejects.toThrow(
        LlmUnreachableError,
      );
    });

    it('propagates LlmUpstreamError when the LLM responds with a non-2xx status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'boom' }),
        text: () => Promise.resolve('boom'),
      } as unknown as Response);

      await expect(mergeLines(db, makeConfig(), DEFAULT_REQUEST)).rejects.toThrow(LlmUpstreamError);
    });

    it('propagates LlmInvalidResponseError when the LLM content is not valid JSON', async () => {
      mockFetch.mockResolvedValueOnce(
        makeOkFetchResponse({ choices: [{ message: { content: 'not json!!!' } }] }),
      );

      await expect(mergeLines(db, makeConfig(), DEFAULT_REQUEST)).rejects.toThrow(
        LlmInvalidResponseError,
      );
    });

    it('propagates LlmInvalidResponseError when the LLM omits "description"', async () => {
      mockFetch.mockResolvedValueOnce(
        makeOkFetchResponse({
          choices: [{ message: { content: JSON.stringify({ category: 'Materials' }) } }],
        }),
      );

      await expect(mergeLines(db, makeConfig(), DEFAULT_REQUEST)).rejects.toThrow(
        LlmInvalidResponseError,
      );
    });
  });
});

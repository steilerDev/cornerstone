/**
 * Integration tests for GET /api/search (#2210, contract 6).
 * Security focus: session required, input bounds, type whitelist, Paperless isolation.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import { _resetFilterTagCache } from '../services/paperlessService.js';
import { SEARCH_RESULT_TYPES } from '@cornerstone/shared';
import type { FastifyInstance } from 'fastify';
import type { ApiErrorResponse, SearchResponse } from '@cornerstone/shared';
import { trades, vendors, workItems } from '../db/schema.js';

const mockFetch = jest.fn<typeof fetch>();
const TOKEN = 'route-secret-token';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Server Error',
    json: () => Promise.resolve(body),
    headers: { get: () => null },
  } as unknown as Response;
}

describe('Search Routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;
  let originalFetch: typeof fetch;
  let cookie: string;
  let userSeq = 0;

  async function start(env: Record<string, string> = {}): Promise<void> {
    if (app) await app.close();
    for (const [k, v] of Object.entries(env)) process.env[k] = v;
    app = await buildApp();
    const user = await userService.createLocalUser(
      app.db,
      `member${++userSeq}@example.com`,
      'Member',
      'password-1234',
      'member',
    );
    cookie = `cornerstone_session=${sessionService.createSession(app.db, user.id, 3600)}`;
  }

  beforeEach(async () => {
    originalFetch = global.fetch;
    global.fetch = mockFetch as unknown as typeof fetch;
    mockFetch.mockReset();
    _resetFilterTagCache();
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-search-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';
    delete process.env.PAPERLESS_URL;
    delete process.env.PAPERLESS_API_TOKEN;
    delete process.env.PAPERLESS_FILTER_TAG;
    // reset so the first start() does not try to close a stale app from a previous test
    app = undefined as unknown as FastifyInstance;
    await start();
  });

  afterEach(async () => {
    global.fetch = originalFetch;
    if (app) await app.close();
    process.env = originalEnv;
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  function get(url: string, withCookie = true) {
    return app.inject({ method: 'GET', url, headers: withCookie ? { cookie } : {} });
  }

  function seed(): void {
    const now = new Date().toISOString();
    app.db
      .insert(workItems)
      .values({
        id: 'w1',
        title: 'Roof tiles',
        status: 'not_started',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    app.db
      .insert(vendors)
      .values({ id: 'v1', name: 'Mueller Roof', createdAt: now, updatedAt: now })
      .run();
  }

  describe('auth', () => {
    it('returns 401 UNAUTHORIZED without a session', async () => {
      const res = await get('/api/search?q=roof', false);
      expect(res.statusCode).toBe(401);
      expect(res.json<ApiErrorResponse>().error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 for an invalid session cookie and never reaches the database', async () => {
      seed();
      const res = await app.inject({
        method: 'GET',
        url: '/api/search?q=roof',
        headers: { cookie: 'cornerstone_session=not-a-session' },
      });
      expect(res.statusCode).toBe(401);
      expect(res.body).not.toContain('Roof tiles');
    });

    it('allows both members and admins', async () => {
      const admin = await userService.createLocalUser(
        app.db,
        'admin@example.com',
        'Admin',
        'password-1234',
        'admin',
      );
      const adminCookie = `cornerstone_session=${sessionService.createSession(app.db, admin.id, 3600)}`;
      const res = await app.inject({
        method: 'GET',
        url: '/api/search?q=roof',
        headers: { cookie: adminCookie },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('validation', () => {
    it('rejects a missing q with 400 VALIDATION_ERROR', async () => {
      const res = await get('/api/search');
      expect(res.statusCode).toBe(400);
      expect(res.json<ApiErrorResponse>().error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a 1 character q', async () => {
      const res = await get('/api/search?q=a');
      expect(res.statusCode).toBe(400);
      expect(res.json<ApiErrorResponse>().error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a q that is only 1 character after trimming', async () => {
      const res = await get('/api/search?q=%20%20a%20%20');
      expect(res.statusCode).toBe(400);
    });

    it('rejects an empty q', async () => {
      expect((await get('/api/search?q=')).statusCode).toBe(400);
      expect((await get('/api/search?q=%20%20%20')).statusCode).toBe(400);
    });

    it('accepts a q of exactly 2 and exactly 100 characters', async () => {
      expect((await get('/api/search?q=ab')).statusCode).toBe(200);
      expect((await get(`/api/search?q=${'a'.repeat(100)}`)).statusCode).toBe(200);
    });

    it('rejects a q of 101 characters', async () => {
      const res = await get(`/api/search?q=${'a'.repeat(101)}`);
      expect(res.statusCode).toBe(400);
      expect(res.json<ApiErrorResponse>().error.code).toBe('VALIDATION_ERROR');
    });

    it('measures the 100 character limit after trimming', async () => {
      const res = await get(`/api/search?q=%20${'a'.repeat(100)}%20`);
      expect(res.statusCode).toBe(200);
    });

    it('rejects a q over the schema bound of 500', async () => {
      expect((await get(`/api/search?q=${'a'.repeat(501)}`)).statusCode).toBe(400);
    });

    it('rejects unknown types and lists them in details.unknownTypes', async () => {
      const res = await get('/api/search?q=roof&types=work_item,foo,foo,bar');
      expect(res.statusCode).toBe(400);
      const body = res.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details).toEqual({ unknownTypes: ['foo', 'bar'] });
    });

    it('rejects a type with different casing', async () => {
      expect((await get('/api/search?q=roof&types=Work_Item')).statusCode).toBe(400);
    });

    it.each(['0', '21', '-1', '1.5', 'abc'])('rejects limit=%s', async (limit) => {
      const res = await get(`/api/search?q=roof&limit=${limit}`);
      expect(res.statusCode).toBe(400);
      expect(res.json<ApiErrorResponse>().error.code).toBe('VALIDATION_ERROR');
    });

    it.each(['1', '20'])('accepts limit=%s', async (limit) => {
      expect((await get(`/api/search?q=roof&limit=${limit}`)).statusCode).toBe(200);
    });

    it('silently drops unknown query parameters', async () => {
      expect((await get('/api/search?q=roof&nope=1')).statusCode).toBe(200);
    });
  });

  describe('tradeIds (#2213)', () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `t${i}`).join(',');

    function seedTradedVendor(): string {
      const now = new Date().toISOString();
      app.db
        .insert(trades)
        .values({ id: 'trade-tile', name: 'Fliesen', sortOrder: 0, createdAt: now, updatedAt: now })
        .run();
      app.db
        .insert(vendors)
        .values({
          id: 'v-tile',
          name: 'Alpha GmbH',
          tradeId: 'trade-tile',
          createdAt: now,
          updatedAt: now,
        })
        .run();
      return 'v-tile';
    }

    it('widens the vendor group with the listed trade ids', async () => {
      const id = seedTradedVendor();

      const without = (await get('/api/search?q=tile&types=vendor')).json<SearchResponse>();
      expect(without.groups.find((g) => g.type === 'vendor')?.total).toBe(0);

      const res = await get('/api/search?q=tile&types=vendor&tradeIds=trade-tile,unknown');
      expect(res.statusCode).toBe(200);
      const group = res.json<SearchResponse>().groups.find((g) => g.type === 'vendor');
      expect(group?.items.map((i) => i.id)).toEqual([id]);
      expect(group?.items[0]?.matchedField).toBe('tradeName');
    });

    it('accepts exactly 50 ids and an id of exactly 64 characters', async () => {
      expect((await get(`/api/search?q=roof&tradeIds=${ids(50)}`)).statusCode).toBe(200);
      expect((await get(`/api/search?q=roof&tradeIds=${'x'.repeat(64)}`)).statusCode).toBe(200);
    });

    it('rejects more than 50 ids with details.tradeIds', async () => {
      const res = await get(`/api/search?q=roof&tradeIds=${ids(51)}`);
      expect(res.statusCode).toBe(400);
      const body = res.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details).toHaveProperty('tradeIds');
    });

    it('rejects an id longer than 64 characters with details.tradeIds', async () => {
      const res = await get(`/api/search?q=roof&tradeIds=${'x'.repeat(65)}`);
      expect(res.statusCode).toBe(400);
      expect(res.json<ApiErrorResponse>().error.details).toHaveProperty('tradeIds');
    });

    it('de-duplicates before counting', async () => {
      const raw = `${ids(50)},${ids(10)}`;
      expect((await get(`/api/search?q=roof&tradeIds=${raw}`)).statusCode).toBe(200);
    });

    it('treats an empty tradeIds as none', async () => {
      seed();
      expect((await get('/api/search?q=roof&tradeIds=')).statusCode).toBe(200);
    });
  });

  describe('response', () => {
    it('echoes the trimmed query and returns every database group in tuple order', async () => {
      seed();
      const res = await get('/api/search?q=%20%20roof%20');
      expect(res.statusCode).toBe(200);
      const body = res.json<SearchResponse>();
      expect(body.query).toBe('roof');
      expect(body.groups.map((g) => g.type)).toEqual(
        SEARCH_RESULT_TYPES.filter((t) => t !== 'paperless_document'),
      );
      expect(body.groups.find((g) => g.type === 'work_item')).toMatchObject({
        total: 1,
        status: 'ok',
        items: [{ id: 'w1', label: 'Roof tiles', matchedField: 'title' }],
      });
      expect(body.groups.find((g) => g.type === 'vendor')?.total).toBe(1);
      expect(body.groups.find((g) => g.type === 'milestone')).toEqual({
        type: 'milestone',
        total: 0,
        status: 'ok',
        items: [],
      });
    });

    it('finds umlaut and digraph spellings through the route', async () => {
      seed();
      const now = new Date().toISOString();
      app.db
        .insert(vendors)
        .values({ id: 'v2', name: 'Müller Dach', createdAt: now, updatedAt: now })
        .run();
      const body = (await get('/api/search?q=muller&types=vendor')).json<SearchResponse>();
      expect(body.groups[0]!.total).toBe(2);
    });

    it('finds Fussboden and Fußboden titles alike through the route', async () => {
      const now = new Date().toISOString();
      const insert = (id: string, title: string) =>
        app.db
          .insert(workItems)
          .values({ id, title, status: 'not_started', createdAt: now, updatedAt: now })
          .run();
      insert('f1', 'Fußboden zq7token');
      insert('f2', 'Fussboden zq7token');
      for (const q of ['fussboden', 'fußboden', 'Fußboden', 'FUSSBODEN']) {
        const body = (
          await get(`/api/search?q=${encodeURIComponent(q)}&types=work_item`)
        ).json<SearchResponse>();
        const ids = body.groups[0]!.items.map((i) => i.id).sort();
        expect(ids).toEqual(['f1', 'f2']);
      }
    });

    it('applies the default limit of 5 and the explicit limit', async () => {
      const now = new Date().toISOString();
      for (let i = 0; i < 8; i++) {
        app.db
          .insert(workItems)
          .values({
            id: `b${i}`,
            title: `Brick ${i}`,
            status: 'not_started',
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }
      const def = (await get('/api/search?q=brick&types=work_item')).json<SearchResponse>();
      expect(def.groups[0]!.items).toHaveLength(5);
      expect(def.groups[0]!.total).toBe(8);
      const two = (await get('/api/search?q=brick&types=work_item&limit=2')).json<SearchResponse>();
      expect(two.groups[0]!.items).toHaveLength(2);
      expect(two.groups[0]!.total).toBe(8);
    });

    it('filters by types, de-duplicates them and orders by the tuple', async () => {
      seed();
      const body = (
        await get('/api/search?q=roof&types=vendor,%20work_item,vendor,')
      ).json<SearchResponse>();
      expect(body.groups.map((g) => g.type)).toEqual(['work_item', 'vendor']);
    });

    it('treats an empty types parameter as all types', async () => {
      const body = (await get('/api/search?q=roof&types=')).json<SearchResponse>();
      expect(body.groups).toHaveLength(8);
    });

    it('requesting only paperless_document without Paperless returns no groups', async () => {
      const body = (
        await get('/api/search?q=roof&types=paperless_document')
      ).json<SearchResponse>();
      expect(body.groups).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('does not write to the database', async () => {
      seed();
      const before = app.db.$client.prepare('SELECT COUNT(*) AS n FROM work_items').get();
      await get('/api/search?q=roof');
      expect(app.db.$client.prepare('SELECT COUNT(*) AS n FROM work_items').get()).toEqual(before);
    });
  });

  describe('Paperless', () => {
    const configured = { PAPERLESS_URL: 'http://paperless:8000', PAPERLESS_API_TOKEN: TOKEN };

    it('never calls Paperless and omits the group when it is not configured', async () => {
      const body = (await get('/api/search?q=roof')).json<SearchResponse>();
      expect(mockFetch).not.toHaveBeenCalled();
      expect(body.groups.map((g) => g.type)).not.toContain('paperless_document');
    });

    it('adds the Paperless group last when configured', async () => {
      await start(configured);
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          count: 2,
          results: [{ id: 9, title: 'Roof permit', created: '2026-03-04' }],
        }),
      );
      const res = await get('/api/search?q=roof&limit=3');
      expect(res.statusCode).toBe(200);
      const body = res.json<SearchResponse>();
      const last = body.groups[body.groups.length - 1];
      expect(last).toMatchObject({
        type: 'paperless_document',
        status: 'ok',
        total: 2,
        items: [{ id: '9', label: 'Roof permit', matchedField: 'fullText', date: '2026-03-04' }],
      });
      const url = new URL(String(mockFetch.mock.calls[0]![0]));
      expect(url.searchParams.get('query')).toBe('roof');
      expect(url.searchParams.get('page_size')).toBe('3');
    });

    it('applies PAPERLESS_FILTER_TAG', async () => {
      await start({ ...configured, PAPERLESS_FILTER_TAG: 'house' });
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ count: 1, results: [{ id: 6, name: 'house' }] }))
        .mockResolvedValueOnce(jsonResponse({ count: 0, results: [] }));
      await get('/api/search?q=roof');
      expect(new URL(String(mockFetch.mock.calls[1]![0])).searchParams.get('tags__id__all')).toBe(
        '6',
      );
    });

    it('returns 200 with the group unavailable on an upstream 500, without the token', async () => {
      await start(configured);
      seed();
      mockFetch.mockResolvedValueOnce(jsonResponse({ detail: 'internal upstream detail' }, 500));
      const res = await get('/api/search?q=roof');
      expect(res.statusCode).toBe(200);
      const body = res.json<SearchResponse>();
      expect(body.groups.find((g) => g.type === 'paperless_document')).toEqual({
        type: 'paperless_document',
        total: 0,
        status: 'unavailable',
        items: [],
      });
      expect(body.groups.find((g) => g.type === 'work_item')?.total).toBe(1);
      expect(res.body).not.toContain(TOKEN);
      expect(res.body).not.toContain('internal upstream detail');
      expect(res.body).not.toContain('paperless:8000');
    });

    it('returns 200 with the group unavailable when the connection fails', async () => {
      await start(configured);
      mockFetch.mockRejectedValueOnce(new Error(`ECONNREFUSED ${TOKEN}`));
      const res = await get('/api/search?q=roof');
      expect(res.statusCode).toBe(200);
      expect(res.body).not.toContain(TOKEN);
      const last = res.json<SearchResponse>().groups.at(-1);
      expect(last?.status).toBe('unavailable');
    });

    it('does not call Paperless when types excludes it', async () => {
      await start(configured);
      await get('/api/search?q=roof&types=work_item');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('does not call Paperless for an unauthenticated request', async () => {
      await start(configured);
      await get('/api/search?q=roof', false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('does not call Paperless for an invalid request', async () => {
      await start(configured);
      await get('/api/search?q=a');
      await get('/api/search?q=roof&types=bogus');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});

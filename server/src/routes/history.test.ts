/**
 * Route tests for GET /api/history (contract 17, #2224): validation, auth, admin-only raw mode,
 * and the response shape. All data is synthetic.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import { diaryEntries } from '../db/schema.js';
import type { ApiErrorResponse, HistoryListResponse } from '@cornerstone/shared';

describe('GET /api/history', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;
  let memberCookie: string;
  let adminCookie: string;
  let seq = 0;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-history-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';
    process.env.PHOTO_STORAGE_PATH = join(tempDir, 'photos');
    app = await buildApp();
    seq = 0;
    const member = await userService.createLocalUser(
      app.db,
      'member@example.test',
      'Member',
      'password',
      'member',
    );
    memberCookie = `cornerstone_session=${sessionService.createSession(app.db, member.id, 3600)}`;
    const admin = await userService.createLocalUser(
      app.db,
      'admin@example.test',
      'Admin',
      'password',
      'admin',
    );
    adminCookie = `cornerstone_session=${sessionService.createSession(app.db, admin.id, 3600)}`;
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = originalEnv;
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  function insertAuto(overrides: Partial<typeof diaryEntries.$inferInsert> = {}): string {
    seq += 1;
    const id = `hist-route-${seq}`;
    const now = new Date(Date.UTC(2026, 2, 10, 10, 0, seq)).toISOString();
    app.db
      .insert(diaryEntries)
      .values({
        id,
        entryType: 'invoice_status',
        entryDate: '2026-03-10',
        title: null,
        body: '',
        metadata: JSON.stringify({
          v: 1,
          event: 'status_changed',
          from: 'pending',
          to: 'paid',
          subjectLabel: `T-${seq}`,
        }),
        status: 'saved',
        isAutomatic: true,
        sourceEntityType: 'invoice',
        sourceEntityId: `inv-${seq}`,
        createdAt: now,
        updatedAt: now,
        ...overrides,
      })
      .run();
    return id;
  }

  function get(query: string, cookie: string | null = memberCookie) {
    return app.inject({
      method: 'GET',
      url: `/api/history${query}`,
      headers: cookie ? { cookie } : {},
    });
  }

  it('returns 401 without a session', async () => {
    const res = await get('', null);
    expect(res.statusCode).toBe(401);
  });

  it('returns an empty feed with the default pagination', async () => {
    const res = await get('');
    expect(res.statusCode).toBe(200);
    const body = res.json<HistoryListResponse>();
    expect(body).toEqual({
      items: [],
      pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 },
      hiddenCount: 0,
      object: null,
    });
  });

  it('lists system events newest first', async () => {
    const first = insertAuto();
    const second = insertAuto();
    const body = (await get('')).json<HistoryListResponse>();
    expect(body.items.map((i) => i.id)).toEqual([second, first]);
    expect(body.items[0]!.isAutomatic).toBe(true);
  });

  it('honours page and pageSize (coerced from the query string)', async () => {
    for (let i = 0; i < 3; i++) insertAuto();
    const body = (await get('?page=2&pageSize=2')).json<HistoryListResponse>();
    expect(body.items).toHaveLength(1);
    expect(body.pagination).toEqual({ page: 2, pageSize: 2, totalItems: 3, totalPages: 2 });
  });

  it.each(['pageSize=0', 'pageSize=101', 'page=0', 'page=abc'])(
    'rejects %s with 400',
    async (q) => {
      const res = await get(`?${q}`);
      expect(res.statusCode).toBe(400);
      expect(res.json<ApiErrorResponse>().error.code).toBe('VALIDATION_ERROR');
    },
  );

  it('filters by a type list', async () => {
    insertAuto({ entryType: 'budget_breach', metadata: null, title: 'Over budget', body: 'x' });
    insertAuto();
    const one = (await get('?type=budget_breach')).json<HistoryListResponse>();
    expect(one.items).toHaveLength(1);
    expect(one.items[0]!.entryType).toBe('budget_breach');
    const both = (await get('?type=budget_breach,payment')).json<HistoryListResponse>();
    expect(both.items).toHaveLength(2);
    const spaced = (await get('?type=budget_breach, payment ,payment')).json<HistoryListResponse>();
    expect(spaced.items).toHaveLength(2);
  });

  it('treats an empty type as no filter', async () => {
    insertAuto();
    const body = (await get('?type=')).json<HistoryListResponse>();
    expect(body.items).toHaveLength(1);
  });

  it('rejects an unknown type with details.unknownTypes', async () => {
    const res = await get('?type=payment,nope,nope,other');
    expect(res.statusCode).toBe(400);
    const err = res.json<ApiErrorResponse>().error;
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.details).toEqual({ unknownTypes: ['nope', 'other'] });
  });

  it('requires entityType and entityId together', async () => {
    for (const q of ['?entityType=invoice', '?entityId=inv-1']) {
      const res = await get(q);
      expect(res.statusCode).toBe(400);
      expect(res.json<ApiErrorResponse>().error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('accepts entityType=budget_source (the funding source History tab, #2242)', async () => {
    const res = await get('?entityType=budget_source&entityId=src-1');
    expect(res.statusCode).toBe(200);
    expect(res.json<HistoryListResponse>().object).toMatchObject({
      entityType: 'budget_source',
      entityId: 'src-1',
      exists: false,
    });
  });

  it('rejects an unknown entityType', async () => {
    const res = await get('?entityType=budget_sourcez&entityId=src-1');
    expect(res.statusCode).toBe(400);
  });

  it('filters by object and echoes it', async () => {
    const id = insertAuto({ sourceEntityId: 'inv-keep' });
    insertAuto();
    const body = (await get('?entityType=invoice&entityId=inv-keep')).json<HistoryListResponse>();
    expect(body.items.map((i) => i.id)).toEqual([id]);
    expect(body.object).toEqual({
      entityType: 'invoice',
      entityId: 'inv-keep',
      title: null,
      exists: false,
    });
  });

  it.each(['dateFrom=2026-3-1', 'dateTo=yesterday', 'dateFrom=2026-03-01T00:00'])(
    'rejects malformed date %s',
    async (q) => {
      const res = await get(`?${q}`);
      expect(res.statusCode).toBe(400);
    },
  );

  it('applies date bounds, q and batchId', async () => {
    insertAuto({ entryDate: '2026-03-01' });
    const keep = insertAuto({
      entryDate: '2026-03-10',
      metadata: JSON.stringify({
        v: 1,
        event: 'status_changed',
        from: 'pending',
        to: 'claimed',
        subjectLabel: 'ZQ-77',
        batchId: 'batch-9',
      }),
    });
    expect(
      (await get('?dateFrom=2026-03-05&dateTo=2026-03-10')).json<HistoryListResponse>().items,
    ).toHaveLength(1);
    expect((await get('?q=zq-77')).json<HistoryListResponse>().items[0]!.id).toBe(keep);
    expect((await get('?batchId=batch-9')).json<HistoryListResponse>().items[0]!.id).toBe(keep);
  });

  it('includeDiary adds saved manual entries', async () => {
    insertAuto();
    const manualId = insertAuto({
      entryType: 'daily_log',
      isAutomatic: false,
      metadata: null,
      title: 'Roof visit',
      body: 'text',
      sourceEntityType: null,
      sourceEntityId: null,
    });
    expect((await get('')).json<HistoryListResponse>().items).toHaveLength(1);
    const body = (await get('?includeDiary=true')).json<HistoryListResponse>();
    expect(body.items.map((i) => i.id)).toContain(manualId);
  });

  it('showHidden is allowed for members; hiddenCount is always present', async () => {
    const res = await get('?showHidden=true');
    expect(res.statusCode).toBe(200);
    expect(res.json<HistoryListResponse>().hiddenCount).toBe(0);
  });

  it('includeHidden is forbidden for a member', async () => {
    const res = await get('?includeHidden=true');
    expect(res.statusCode).toBe(403);
    expect(res.json<ApiErrorResponse>().error.code).toBe('FORBIDDEN');
  });

  it('includeHidden=false is fine for a member', async () => {
    const res = await get('?includeHidden=false');
    expect(res.statusCode).toBe(200);
  });

  it('includeHidden by an admin returns raw rows (identical repeats are not collapsed)', async () => {
    const meta = JSON.stringify({
      v: 1,
      event: 'status_changed',
      from: 'pending',
      to: 'paid',
      subjectLabel: 'T-1',
    });
    insertAuto({ sourceEntityId: 'inv-same', metadata: meta });
    insertAuto({ sourceEntityId: 'inv-same', metadata: meta });
    const collapsed = (await get('')).json<HistoryListResponse>();
    expect(collapsed.items).toHaveLength(1);
    expect(collapsed.items[0]!.repeat?.count).toBe(2);
    const raw = (await get('?includeHidden=true', adminCookie)).json<HistoryListResponse>();
    expect(raw.items).toHaveLength(2);
    expect(raw.items.every((i) => i.repeat === undefined)).toBe(true);
  });

  it('strips unknown query keys (Fastify AJV removeAdditional) instead of rejecting them', async () => {
    insertAuto();
    const res = await get('?bogus=1');
    expect(res.statusCode).toBe(200);
    expect(res.json<HistoryListResponse>().items).toHaveLength(1);
  });

  it('rejects a q that is too long', async () => {
    const res = await get(`?q=${'a'.repeat(2000)}`);
    expect(res.statusCode).toBe(400);
  });
});

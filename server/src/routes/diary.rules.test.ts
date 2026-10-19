/**
 * Route tests for the diary rules of story #2220 (EPIC-21, contract 5):
 * lookup endpoint, type change on drafts, undo skip, content rule, author and auth.
 * All data is synthetic.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import { diaryEntries, photos } from '../db/schema.js';
import type {
  ApiErrorResponse,
  DiaryEntrySummary,
  DiaryEntryLookupResponse,
} from '@cornerstone/shared';

describe('Diary rules routes (#2220)', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;
  let seq = 0;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-diary-rules-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';
    process.env.PHOTO_STORAGE_PATH = join(tempDir, 'photos');
    app = await buildApp();
    seq = 0;
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

  async function member(email: string, name: string): Promise<{ userId: string; cookie: string }> {
    const user = await userService.createLocalUser(app.db, email, name, 'password', 'member');
    const token = sessionService.createSession(app.db, user.id, 3600);
    return { userId: user.id, cookie: `cornerstone_session=${token}` };
  }

  function insertEntry(overrides: Partial<typeof diaryEntries.$inferInsert> = {}): string {
    seq += 1;
    const id = `rules-route-${seq}`;
    const now = new Date(Date.now() + seq).toISOString();
    app.db
      .insert(diaryEntries)
      .values({
        id,
        entryType: 'daily_log',
        entryDate: '2026-03-14',
        title: 'Formwork check',
        body: 'Some text',
        metadata: null,
        status: 'draft',
        isAutomatic: false,
        createdBy: null,
        createdAt: now,
        updatedAt: now,
        ...overrides,
      })
      .run();
    return id;
  }

  function insertPhoto(entryId: string): void {
    seq += 1;
    const now = '2026-03-14T08:00:00.000Z';
    app.db
      .insert(photos)
      .values({
        id: `rules-route-photo-${seq}`,
        entityType: 'diary_entry',
        entityId: entryId,
        filename: 'x.jpg',
        originalFilename: 'x.jpg',
        mimeType: 'image/jpeg',
        fileSize: 1,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  const lookupUrl = (title: string, extra = '') =>
    `/api/diary-entries/lookup?entryDate=2026-03-14&title=${encodeURIComponent(title)}${extra}`;

  // ─── Authentication ────────────────────────────────────────────────────────

  describe('authentication', () => {
    it('lookup without a session -> 401 UNAUTHORIZED', async () => {
      const res = await app.inject({ method: 'GET', url: lookupUrl('Formwork check') });
      expect(res.statusCode).toBe(401);
      expect(res.json<ApiErrorResponse>().error.code).toBe('UNAUTHORIZED');
    });

    it('PATCH with entryType without a session -> 401 UNAUTHORIZED', async () => {
      const id = insertEntry();
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/diary-entries/${id}`,
        payload: { entryType: 'issue' },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json<ApiErrorResponse>().error.code).toBe('UNAUTHORIZED');
    });
  });

  // ─── Lookup ────────────────────────────────────────────────────────────────

  describe('GET /api/diary-entries/lookup', () => {
    it('returns the matches for the same date and title', async () => {
      const { cookie } = await member('a@test.example', 'Test Member A');
      const id = insertEntry({ title: 'Screed day 2', status: 'saved' });
      insertPhoto(id);
      const res = await app.inject({
        method: 'GET',
        url: lookupUrl('screed DAY 2'),
        headers: { cookie },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json<DiaryEntryLookupResponse>()).toEqual({
        matches: [
          { id, entryType: 'daily_log', title: 'Screed day 2', status: 'saved', photoCount: 1 },
        ],
      });
    });

    it('is not shadowed by GET /:id', async () => {
      const { cookie } = await member('a@test.example', 'Test Member A');
      const res = await app.inject({
        method: 'GET',
        url: lookupUrl('Nothing here'),
        headers: { cookie },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json<DiaryEntryLookupResponse>()).toEqual({ matches: [] });
    });

    it('folds umlauts through the real app connection', async () => {
      const { cookie } = await member('a@test.example', 'Test Member A');
      const id = insertEntry({ title: 'Ölwechsel Bagger' });
      const res = await app.inject({
        method: 'GET',
        url: lookupUrl('oelwechsel bagger'),
        headers: { cookie },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json<DiaryEntryLookupResponse>().matches.map((m) => m.id)).toEqual([id]);
    });

    it('honours excludeId', async () => {
      const { cookie } = await member('a@test.example', 'Test Member A');
      const a = insertEntry({ title: 'Screed day 2' });
      const b = insertEntry({ title: 'Screed day 2' });
      const res = await app.inject({
        method: 'GET',
        url: lookupUrl('Screed day 2', `&excludeId=${a}`),
        headers: { cookie },
      });
      expect(res.json<DiaryEntryLookupResponse>().matches.map((m) => m.id)).toEqual([b]);
    });

    it.each([
      ['missing title', '/api/diary-entries/lookup?entryDate=2026-03-14'],
      ['missing entryDate', '/api/diary-entries/lookup?title=Formwork'],
      [
        'title over 1000 characters',
        `/api/diary-entries/lookup?entryDate=2026-03-14&title=${'x'.repeat(1001)}`,
      ],
    ])('%s -> 400 VALIDATION_ERROR', async (_label, url) => {
      const { cookie } = await member('a@test.example', 'Test Member A');
      const res = await app.inject({ method: 'GET', url, headers: { cookie } });
      expect(res.statusCode).toBe(400);
      expect(res.json<ApiErrorResponse>().error.code).toBe('VALIDATION_ERROR');
    });

    it('an invalid entryDate -> 400 with details.field entryDate', async () => {
      const { cookie } = await member('a@test.example', 'Test Member A');
      const res = await app.inject({
        method: 'GET',
        url: '/api/diary-entries/lookup?entryDate=2026-02-30&title=Formwork',
        headers: { cookie },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json<ApiErrorResponse>().error.details).toEqual({ field: 'entryDate' });
    });
  });

  // ─── Author ────────────────────────────────────────────────────────────────

  describe('author', () => {
    it('comes from the session; a client-sent createdBy is stripped', async () => {
      const a = await member('a@test.example', 'Test Member A');
      const b = await member('b@test.example', 'Test Member B');
      const res = await app.inject({
        method: 'POST',
        url: '/api/diary-entries',
        headers: { cookie: a.cookie },
        payload: {
          entryType: 'general_note',
          entryDate: '2026-03-14',
          title: 'Screed day 2',
          createdBy: b.userId,
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json<DiaryEntrySummary>().createdBy?.id).toBe(a.userId);
    });

    it('another member can change the type of a draft, and the author stays', async () => {
      const a = await member('a@test.example', 'Test Member A');
      const b = await member('b@test.example', 'Test Member B');
      const id = insertEntry({ createdBy: a.userId });
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/diary-entries/${id}`,
        headers: { cookie: b.cookie },
        payload: { entryType: 'general_note' },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<DiaryEntrySummary>();
      expect(body.entryType).toBe('general_note');
      expect(body.createdBy?.id).toBe(a.userId);
    });
  });

  // ─── Type change over HTTP ─────────────────────────────────────────────────

  describe('PATCH entryType', () => {
    it('an automatic type -> 400 VALIDATION_ERROR (schema enum)', async () => {
      const { cookie } = await member('a@test.example', 'Test Member A');
      const id = insertEntry();
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/diary-entries/${id}`,
        headers: { cookie },
        payload: { entryType: 'work_item_status' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json<ApiErrorResponse>().error.code).toBe('VALIDATION_ERROR');
    });

    it('on a saved entry -> 400 with details.field entryType', async () => {
      const { cookie } = await member('a@test.example', 'Test Member A');
      const id = insertEntry({ status: 'saved' });
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/diary-entries/${id}`,
        headers: { cookie },
        payload: { entryType: 'issue' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json<ApiErrorResponse>().error.details).toEqual({ field: 'entryType' });
    });

    it('on an automatic entry -> 403 IMMUTABLE_ENTRY', async () => {
      const { cookie } = await member('a@test.example', 'Test Member A');
      const id = insertEntry({
        isAutomatic: true,
        entryType: 'work_item_status',
        status: 'saved',
      });
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/diary-entries/${id}`,
        headers: { cookie },
        payload: { entryType: 'issue' },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json<ApiErrorResponse>().error.code).toBe('IMMUTABLE_ENTRY');
    });

    it('a status change on a saved issue still returns an undo token (regression guard)', async () => {
      const { cookie } = await member('a@test.example', 'Test Member A');
      const id = insertEntry({
        status: 'saved',
        entryType: 'issue',
        metadata: JSON.stringify({ severity: 'high', resolutionStatus: 'open' }),
      });
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/diary-entries/${id}`,
        headers: { cookie },
        payload: { metadata: { severity: 'high', resolutionStatus: 'resolved' } },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json<Record<string, unknown>>().undo).toBeDefined();
    });

    it('a type change returns no undo key', async () => {
      const { cookie } = await member('a@test.example', 'Test Member A');
      const id = insertEntry({
        entryType: 'issue',
        metadata: JSON.stringify({ severity: 'high', resolutionStatus: 'open' }),
      });
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/diary-entries/${id}`,
        headers: { cookie },
        payload: { entryType: 'daily_log' },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<Record<string, unknown>>();
      expect(body.entryType).toBe('daily_log');
      expect('undo' in body).toBe(false);
    });
  });

  // ─── Content rule over HTTP ────────────────────────────────────────────────

  describe('content rule', () => {
    it('POST saved with a title only -> 201 with an empty body', async () => {
      const { cookie } = await member('a@test.example', 'Test Member A');
      const res = await app.inject({
        method: 'POST',
        url: '/api/diary-entries',
        headers: { cookie },
        payload: { entryType: 'general_note', entryDate: '2026-03-14', title: 'Screed day 2' },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json<DiaryEntrySummary>().body).toBe('');
    });

    it('promote of a body-less draft with a photo -> 200 saved', async () => {
      const { cookie } = await member('a@test.example', 'Test Member A');
      const id = insertEntry({ entryType: 'general_note', title: null, body: '' });
      insertPhoto(id);
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/diary-entries/${id}/promote`,
        headers: { cookie },
        payload: {},
      });
      expect(res.statusCode).toBe(200);
      expect(res.json<DiaryEntrySummary>().status).toBe('saved');
    });

    it('promote of an empty draft -> 400 naming title, body and photos', async () => {
      const { cookie } = await member('a@test.example', 'Test Member A');
      const id = insertEntry({ entryType: 'general_note', title: null, body: '' });
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/diary-entries/${id}/promote`,
        headers: { cookie },
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      expect(res.json<ApiErrorResponse>().error.details).toEqual({
        fields: ['title', 'body', 'photos'],
      });
    });
  });
});

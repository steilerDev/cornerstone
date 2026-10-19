/**
 * Route tests for story #2225 (EPIC-21): `areaId` / `vendorId` list params, the
 * `thumbnails` / `photoAreas` summary fields and GET /api/diary-entries/filter-options.
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
import { areas, diaryEntries, photos, vendors } from '../db/schema.js';
import type {
  ApiErrorResponse,
  DiaryEntryListResponse,
  DiaryEntrySummary,
  DiaryFilterOptions,
} from '@cornerstone/shared';

const NOW = '2026-03-14T08:00:00.000Z';

describe('Diary list filters and filter options routes (#2225)', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;
  let cookie: string;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-diary-filters-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';
    process.env.PHOTO_STORAGE_PATH = join(tempDir, 'photos');
    app = await buildApp();
    const user = await userService.createLocalUser(
      app.db,
      'member-a@test.example',
      'Test Member A',
      'password',
      'member',
    );
    cookie = `cornerstone_session=${sessionService.createSession(app.db, user.id, 3600)}`;
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

  function entry(id: string, o: Partial<typeof diaryEntries.$inferInsert> = {}): string {
    app.db
      .insert(diaryEntries)
      .values({
        id,
        entryType: 'daily_log',
        entryDate: '2026-03-14',
        title: `Entry ${id}`,
        body: 'Some text',
        metadata: null,
        status: 'saved',
        isAutomatic: false,
        createdBy: null,
        createdAt: NOW,
        updatedAt: NOW,
        ...o,
      })
      .run();
    return id;
  }

  function area(id: string, name: string, parentId: string | null = null): void {
    app.db
      .insert(areas)
      .values({ id, name, parentId, sortOrder: 0, createdAt: NOW, updatedAt: NOW })
      .run();
  }

  function photo(id: string, entryId: string, areaId: string | null = null): void {
    app.db
      .insert(photos)
      .values({
        id,
        entityType: 'diary_entry',
        entityId: entryId,
        filename: `${id}.jpg`,
        originalFilename: `${id}.jpg`,
        mimeType: 'image/jpeg',
        fileSize: 1,
        areaId,
        sortOrder: 0,
        createdAt: NOW,
        updatedAt: NOW,
      })
      .run();
  }

  function vendor(id: string, name: string): void {
    app.db.insert(vendors).values({ id, name, createdAt: NOW, updatedAt: NOW }).run();
  }

  async function get(url: string, withCookie = true) {
    return app.inject({
      method: 'GET',
      url,
      headers: withCookie ? { cookie } : {},
    });
  }

  // ─── List params ───────────────────────────────────────────────────────────

  describe('GET /api/diary-entries with areaId', () => {
    it('matches entries with a photo in the area or a descendant', async () => {
      area('a-root', 'Area A');
      area('a-child', 'Room 1', 'a-root');
      entry('e-child');
      photo('p-1', 'e-child', 'a-child');
      entry('e-none');
      const res = await get('/api/diary-entries?areaId=a-root');
      expect(res.statusCode).toBe(200);
      expect(res.json<DiaryEntryListResponse>().items.map((i) => i.id)).toEqual(['e-child']);
    });

    it('an unknown area id gives 200 and an empty list', async () => {
      entry('e-1');
      const res = await get('/api/diary-entries?areaId=nope');
      expect(res.statusCode).toBe(200);
      const body = res.json<DiaryEntryListResponse>();
      expect(body.items).toEqual([]);
      expect(body.pagination.totalItems).toBe(0);
    });

    it('rejects an empty areaId with 400', async () => {
      const res = await get('/api/diary-entries?areaId=');
      expect(res.statusCode).toBe(400);
      expect(res.json<ApiErrorResponse>().error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects an areaId longer than 64 characters with 400', async () => {
      const res = await get(`/api/diary-entries?areaId=${'x'.repeat(65)}`);
      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/diary-entries with vendorId', () => {
    it('matches a daily log by id and a delivery by name in another case', async () => {
      vendor('v-1', 'Müller Bau');
      entry('log-1', { metadata: JSON.stringify({ vendorId: 'v-1' }) });
      entry('del-1', {
        entryType: 'delivery',
        metadata: JSON.stringify({ vendor: 'MUELLER BAU' }),
      });
      entry('other');
      const res = await get('/api/diary-entries?vendorId=v-1');
      expect(res.statusCode).toBe(200);
      expect(
        res
          .json<DiaryEntryListResponse>()
          .items.map((i) => i.id)
          .sort(),
      ).toEqual(['del-1', 'log-1']);
    });

    it('an unknown company id gives 200 and an empty list', async () => {
      entry('e-1');
      const res = await get('/api/diary-entries?vendorId=nope');
      expect(res.statusCode).toBe(200);
      expect(res.json<DiaryEntryListResponse>().items).toEqual([]);
    });

    it('rejects an empty vendorId with 400', async () => {
      const res = await get('/api/diary-entries?vendorId=');
      expect(res.statusCode).toBe(400);
    });

    it('combines areaId and vendorId and keeps paging', async () => {
      vendor('v-1', 'Company A');
      area('a-1', 'Area A');
      entry('e-both', { metadata: JSON.stringify({ vendorId: 'v-1' }) });
      photo('p-1', 'e-both', 'a-1');
      entry('e-vendor-only', { metadata: JSON.stringify({ vendorId: 'v-1' }) });
      const res = await get('/api/diary-entries?areaId=a-1&vendorId=v-1&pageSize=1');
      const body = res.json<DiaryEntryListResponse>();
      expect(body.items.map((i) => i.id)).toEqual(['e-both']);
      expect(body.pagination.totalItems).toBe(1);
    });
  });

  // ─── Summary fields ────────────────────────────────────────────────────────

  describe('thumbnails and photoAreas', () => {
    it('are sent on list, detail and update responses', async () => {
      area('a-root', 'Area A');
      area('a-child', 'Room 1', 'a-root');
      entry('e-1');
      photo('p-1', 'e-1', 'a-child');

      const list = await get('/api/diary-entries');
      const row = list.json<DiaryEntryListResponse>().items.find((i) => i.id === 'e-1')!;
      expect(row.thumbnails).toEqual([
        { id: 'p-1', thumbnailUrl: `/api/photos/p-1/thumbnail?v=${encodeURIComponent(NOW)}` },
      ]);
      expect(row.photoAreas![0]!.id).toBe('a-child');
      expect(row.photoAreas![0]!.ancestors!.map((a) => a.name)).toEqual(['Area A']);

      const detail = await get('/api/diary-entries/e-1');
      expect(detail.json<DiaryEntrySummary>().thumbnails).toHaveLength(1);

      const patch = await app.inject({
        method: 'PATCH',
        url: '/api/diary-entries/e-1',
        headers: { cookie },
        payload: { title: 'Renamed' },
      });
      expect(patch.statusCode).toBe(200);
      expect(patch.json<DiaryEntrySummary>().photoAreas!.map((a) => a.id)).toEqual(['a-child']);
    });

    it('are empty arrays for an entry without photos', async () => {
      entry('e-1');
      const res = await get('/api/diary-entries/e-1');
      const body = res.json<DiaryEntrySummary>();
      expect(body.thumbnails).toEqual([]);
      expect(body.photoAreas).toEqual([]);
    });
  });

  // ─── GET /filter-options ───────────────────────────────────────────────────

  describe('GET /api/diary-entries/filter-options', () => {
    it('without a session -> 401 UNAUTHORIZED', async () => {
      const res = await get('/api/diary-entries/filter-options', false);
      expect(res.statusCode).toBe(401);
      expect(res.json<ApiErrorResponse>().error.code).toBe('UNAUTHORIZED');
    });

    it('is not caught by /:id and is empty without data', async () => {
      const res = await get('/api/diary-entries/filter-options');
      expect(res.statusCode).toBe(200);
      expect(res.json<DiaryFilterOptions>()).toEqual({ types: [], areas: [], companies: [] });
    });

    it('returns types, areas and companies of saved manual entries only', async () => {
      area('a-root', 'Area A');
      area('a-child', 'Room 1', 'a-root');
      area('a-draft', 'Draft Area');
      vendor('v-b', 'Company B');
      vendor('v-a', 'Company A');
      vendor('v-draft', 'Draft Company');
      entry('e-issue', { entryType: 'issue' });
      entry('e-log', {
        metadata: JSON.stringify({ vendorId: 'v-b' }),
      });
      entry('e-del', {
        entryType: 'delivery',
        metadata: JSON.stringify({ vendor: 'company a' }),
      });
      photo('p-1', 'e-log', 'a-child');
      entry('e-draft', {
        status: 'draft',
        entryType: 'site_visit',
        metadata: JSON.stringify({ vendorId: 'v-draft' }),
      });
      photo('p-2', 'e-draft', 'a-draft');

      const res = await get('/api/diary-entries/filter-options');
      expect(res.statusCode).toBe(200);
      const body = res.json<DiaryFilterOptions>();
      expect(body.types).toEqual(['daily_log', 'delivery', 'issue']);
      expect(body.areas.map((a) => a.id)).toEqual(['a-child']);
      expect(body.areas[0]!.ancestors!.map((a) => a.name)).toEqual(['Area A']);
      expect(body.companies).toEqual([
        { id: 'v-a', name: 'Company A' },
        { id: 'v-b', name: 'Company B' },
      ]);
    });

    it('ignores unknown query parameters (AJV removeAdditional)', async () => {
      const res = await get('/api/diary-entries/filter-options?foo=bar');
      expect(res.statusCode).toBe(200);
      expect(res.json<DiaryFilterOptions>()).toEqual({ types: [], areas: [], companies: [] });
    });

    it('does not shadow GET /:id for a real entry', async () => {
      entry('e-1');
      const res = await get('/api/diary-entries/e-1');
      expect(res.statusCode).toBe(200);
      expect(res.json<DiaryEntrySummary>().id).toBe('e-1');
    });
  });
});

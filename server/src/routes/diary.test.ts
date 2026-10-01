/**
 * Integration tests for /api/diary-entries route handlers.
 *
 * EPIC-13: Construction Diary — Story #803
 * Tests all 5 diary endpoints: GET list, POST create, GET by ID, PATCH update, DELETE.
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
import type {
  DiaryEntrySummary,
  DiaryEntryDetail,
  DiarySignatureEntry,
  ApiErrorResponse,
  CreateDiaryEntryRequest,
  PromoteDiaryEntryRequest,
} from '@cornerstone/shared';

describe('Diary Routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;
  let entryTimestampOffset = 0;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-diary-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';
    process.env.PHOTO_STORAGE_PATH = join(tempDir, 'photos');

    app = await buildApp();
    entryTimestampOffset = 0;
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    process.env = originalEnv;
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  // ─── Helpers ─────────────────────────────────────────────────────────────

  /**
   * Create a user in the DB and return a session cookie.
   */
  async function createUserWithSession(
    email: string,
    displayName: string,
    password: string,
    role: 'admin' | 'member' = 'member',
  ): Promise<{ userId: string; cookie: string }> {
    const user = await userService.createLocalUser(app.db, email, displayName, password, role);
    const sessionToken = sessionService.createSession(app.db, user.id, 3600);
    return {
      userId: user.id,
      cookie: `cornerstone_session=${sessionToken}`,
    };
  }

  /**
   * Insert a diary entry directly via the database (for testing automatic entries, etc.).
   */
  function insertDiaryEntry(overrides: Partial<typeof diaryEntries.$inferInsert> = {}): string {
    entryTimestampOffset += 1;
    const id = `diary-test-${Date.now()}-${entryTimestampOffset}`;
    const now = new Date(Date.now() + entryTimestampOffset).toISOString();
    app.db
      .insert(diaryEntries)
      .values({
        id,
        entryType: 'daily_log',
        entryDate: '2026-03-14',
        title: 'Test Entry',
        body: 'Test body content',
        metadata: null,
        isAutomatic: false,
        sourceEntityType: null,
        sourceEntityId: null,
        createdBy: null,
        createdAt: now,
        updatedAt: now,
        ...overrides,
      })
      .run();
    return id;
  }

  // ─── GET /api/diary-entries ────────────────────────────────────────────────

  describe('GET /api/diary-entries', () => {
    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/diary-entries',
      });
      expect(response.statusCode).toBe(401);
      const error = response.json<ApiErrorResponse>();
      expect(error.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 200 with empty list when no entries exist', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'GET',
        url: '/api/diary-entries',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ items: DiaryEntrySummary[]; pagination: unknown }>();
      expect(body.items).toEqual([]);
      expect(body.pagination).toMatchObject({
        page: 1,
        pageSize: 50,
        totalItems: 0,
        totalPages: 0,
      });
    });

    it('filters by type=daily_log', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'Test User', 'password');
      insertDiaryEntry({ entryType: 'daily_log' });
      insertDiaryEntry({ entryType: 'site_visit' });

      const response = await app.inject({
        method: 'GET',
        url: '/api/diary-entries?type=daily_log',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ items: DiaryEntrySummary[] }>();
      expect(body.items).toHaveLength(1);
      expect(body.items[0]!.entryType).toBe('daily_log');
    });

    it('filters by automatic=true', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'Test User', 'password');
      insertDiaryEntry({ isAutomatic: false });
      insertDiaryEntry({
        isAutomatic: true,
        entryType: 'work_item_status',
        createdBy: null,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/diary-entries?automatic=true',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ items: DiaryEntrySummary[] }>();
      expect(body.items).toHaveLength(1);
      expect(body.items[0]!.isAutomatic).toBe(true);
    });

    it('performs full-text search with q parameter', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'Test User', 'password');
      insertDiaryEntry({ title: 'Concrete pouring', body: 'Foundation work done' });
      insertDiaryEntry({ title: 'Site visit', body: 'Inspector approved plans' });

      const response = await app.inject({
        method: 'GET',
        url: '/api/diary-entries?q=concrete',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ items: DiaryEntrySummary[] }>();
      expect(body.items).toHaveLength(1);
      expect(body.items[0]!.title).toBe('Concrete pouring');
    });

    it('filters by dateFrom and dateTo range', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'Test User', 'password');
      insertDiaryEntry({ entryDate: '2025-12-31' });
      insertDiaryEntry({ entryDate: '2026-01-15' });
      insertDiaryEntry({ entryDate: '2026-02-28' });

      const response = await app.inject({
        method: 'GET',
        url: '/api/diary-entries?dateFrom=2026-01-01&dateTo=2026-01-31',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ items: DiaryEntrySummary[] }>();
      expect(body.items).toHaveLength(1);
      expect(body.items[0]!.entryDate).toBe('2026-01-15');
    });

    it('returns correct pagination metadata for page 2', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'Test User', 'password');
      insertDiaryEntry({ entryDate: '2026-01-01' });
      insertDiaryEntry({ entryDate: '2026-01-02' });
      insertDiaryEntry({ entryDate: '2026-01-03' });

      const response = await app.inject({
        method: 'GET',
        url: '/api/diary-entries?page=2&pageSize=2',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{
        items: DiaryEntrySummary[];
        pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
      }>();
      expect(body.items).toHaveLength(1);
      expect(body.pagination.page).toBe(2);
      expect(body.pagination.pageSize).toBe(2);
      expect(body.pagination.totalItems).toBe(3);
      expect(body.pagination.totalPages).toBe(2);
    });
  });

  // ─── POST /api/diary-entries ───────────────────────────────────────────────

  describe('POST /api/diary-entries', () => {
    it('returns 401 without authentication', async () => {
      const payload: CreateDiaryEntryRequest = {
        entryType: 'daily_log',
        entryDate: '2026-03-14',
        body: 'Content',
      };
      const response = await app.inject({
        method: 'POST',
        url: '/api/diary-entries',
        payload,
      });
      expect(response.statusCode).toBe(401);
      const error = response.json<ApiErrorResponse>();
      expect(error.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 201 with valid daily_log body', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@test.com',
        'Test User',
        'password',
      );
      const payload: CreateDiaryEntryRequest = {
        entryType: 'daily_log',
        entryDate: '2026-03-14',
        title: 'Day one',
        body: 'Poured concrete for the foundation today.',
        metadata: { weather: 'sunny', workersOnSite: 6 },
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/diary-entries',
        headers: { cookie },
        payload,
      });

      expect(response.statusCode).toBe(201);
      const result = response.json<DiaryEntrySummary>();
      expect(result.id).toBeDefined();
      expect(result.entryType).toBe('daily_log');
      expect(result.entryDate).toBe('2026-03-14');
      expect(result.title).toBe('Day one');
      expect(result.body).toBe('Poured concrete for the foundation today.');
      expect(result.isAutomatic).toBe(false);
      expect(result.photoCount).toBe(0);
      expect(result.createdBy?.id).toBe(userId);
      expect(result.metadata).toEqual({ weather: 'sunny', workersOnSite: 6 });
    });

    it('returns 400 when entryDate is missing', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/diary-entries',
        headers: { cookie },
        payload: {
          entryType: 'daily_log',
          body: 'Missing entry date',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 with INVALID_ENTRY_TYPE when entryType is work_item_status', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'Test User', 'password');

      // Note: the route schema restricts entryType to manual types only via enum,
      // so work_item_status is rejected at schema validation with a 400.
      const response = await app.inject({
        method: 'POST',
        url: '/api/diary-entries',
        headers: { cookie },
        payload: {
          entryType: 'work_item_status',
          entryDate: '2026-03-14',
          body: 'System generated',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 with INVALID_METADATA for invalid weather value', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/diary-entries',
        headers: { cookie },
        payload: {
          entryType: 'daily_log',
          entryDate: '2026-03-14',
          body: 'Bad weather',
          metadata: { weather: 'hurricane' },
        },
      });

      expect(response.statusCode).toBe(400);
      const error = response.json<ApiErrorResponse>();
      expect(error.error.code).toBe('INVALID_METADATA');
    });
  });

  // ─── GET /api/diary-entries/:id ───────────────────────────────────────────

  describe('GET /api/diary-entries/:id', () => {
    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/diary-entries/some-id',
      });
      expect(response.statusCode).toBe(401);
      const error = response.json<ApiErrorResponse>();
      expect(error.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 200 with valid ID and photoCount=0', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'Test User', 'password');
      const id = insertDiaryEntry({
        title: 'My diary entry',
        body: 'Something happened today',
        entryDate: '2026-03-14',
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/diary-entries/${id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json<DiaryEntryDetail>();
      expect(result.id).toBe(id);
      expect(result.title).toBe('My diary entry');
      expect(result.body).toBe('Something happened today');
      expect(result.photoCount).toBe(0);
    });

    it('returns 404 for unknown ID', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'GET',
        url: '/api/diary-entries/nonexistent-entry-id',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const error = response.json<ApiErrorResponse>();
      expect(error.error.code).toBe('NOT_FOUND');
    });
  });

  // ─── PATCH /api/diary-entries/:id ─────────────────────────────────────────

  describe('PATCH /api/diary-entries/:id', () => {
    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/diary-entries/some-id',
        payload: { body: 'Updated body' },
      });
      expect(response.statusCode).toBe(401);
      const error = response.json<ApiErrorResponse>();
      expect(error.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 200 and updates title and body', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'Test User', 'password');
      const id = insertDiaryEntry({ title: 'Original Title', body: 'Original body' });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/diary-entries/${id}`,
        headers: { cookie },
        payload: { title: 'Updated Title', body: 'Updated body content' },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json<DiaryEntrySummary>();
      expect(result.title).toBe('Updated Title');
      expect(result.body).toBe('Updated body content');
    });

    it('returns 404 for unknown ID', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/diary-entries/nonexistent-entry-id',
        headers: { cookie },
        payload: { body: 'Updated' },
      });

      expect(response.statusCode).toBe(404);
      const error = response.json<ApiErrorResponse>();
      expect(error.error.code).toBe('NOT_FOUND');
    });

    it('returns 403 IMMUTABLE_ENTRY when updating an automatic entry', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'Test User', 'password');
      const id = insertDiaryEntry({
        isAutomatic: true,
        entryType: 'work_item_status',
        createdBy: null,
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/diary-entries/${id}`,
        headers: { cookie },
        payload: { body: 'Should not update' },
      });

      // ImmutableEntryError has statusCode 403 (Story #808)
      expect(response.statusCode).toBe(403);
      const error = response.json<ApiErrorResponse>();
      expect(error.error.code).toBe('IMMUTABLE_ENTRY');
    });

    it('old PUT method returns 404 (route no longer registered)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'Test User', 'password');
      const id = insertDiaryEntry({ title: 'Some Entry', body: 'Some body' });

      const response = await app.inject({
        method: 'PUT',
        url: `/api/diary-entries/${id}`,
        headers: { cookie },
        payload: { title: 'Will not update', body: 'Will not update' },
      });

      // Fastify returns 404 for unregistered routes
      expect(response.statusCode).toBe(404);
    });
  });

  // ─── GET /api/diary-entries/export — removed endpoint ─────────────────────

  describe('GET /api/diary-entries/export', () => {
    it('returns 404 because the export endpoint no longer exists', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'GET',
        url: '/api/diary-entries/export',
        headers: { cookie },
      });

      // The /export route was removed in UAT fixes.
      // Fastify interprets "export" as the :id param for GET /api/diary-entries/:id,
      // so we get a 404 NOT_FOUND from the service (no entry with id "export").
      expect(response.statusCode).toBe(404);
    });
  });

  // ─── DELETE /api/diary-entries/:id ────────────────────────────────────────

  describe('DELETE /api/diary-entries/:id', () => {
    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/diary-entries/some-id',
      });
      expect(response.statusCode).toBe(401);
      const error = response.json<ApiErrorResponse>();
      expect(error.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 204 and entry is gone afterwards', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'Test User', 'password');
      const id = insertDiaryEntry();

      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: `/api/diary-entries/${id}`,
        headers: { cookie },
      });
      expect(deleteResponse.statusCode).toBe(204);
      expect(deleteResponse.body).toBe('');

      // Verify entry no longer exists
      const getResponse = await app.inject({
        method: 'GET',
        url: `/api/diary-entries/${id}`,
        headers: { cookie },
      });
      expect(getResponse.statusCode).toBe(404);
    });

    it('returns 404 for unknown ID', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/diary-entries/nonexistent-entry-id',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const error = response.json<ApiErrorResponse>();
      expect(error.error.code).toBe('NOT_FOUND');
    });

    it('returns 204 when deleting an automatic entry (automatic entries can be deleted)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'Test User', 'password');
      const id = insertDiaryEntry({
        isAutomatic: true,
        entryType: 'milestone_delay',
        createdBy: null,
      });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/diary-entries/${id}`,
        headers: { cookie },
      });

      // Story #808: automatic entries can now be deleted
      expect(response.statusCode).toBe(204);
      expect(response.body).toBe('');

      // Verify entry is gone
      const getResponse = await app.inject({
        method: 'GET',
        url: `/api/diary-entries/${id}`,
        headers: { cookie },
      });
      expect(getResponse.statusCode).toBe(404);
    });
  });

  // ─── Story #1426: Draft lifecycle and promote endpoint ─────────────────────

  describe('POST /api/diary-entries (draft mode, Story #1426)', () => {
    it('Scenario 19: POST with status=draft → 201 with status=draft (no body/entryDate required)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/diary-entries',
        headers: { cookie },
        payload: {
          entryType: 'general_note',
          status: 'draft',
        },
      });

      expect(response.statusCode).toBe(201);
      const result = response.json<DiaryEntrySummary>();
      expect(result.id).toBeDefined();
      expect(result.status).toBe('draft');
      expect(result.entryType).toBe('general_note');
    });

    it('Scenario 20: POST without body and without status → 400 VALIDATION_ERROR (saved entries require body)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/diary-entries',
        headers: { cookie },
        payload: {
          entryType: 'general_note',
          // No body, no status — should fail because saved mode requires body
        },
      });

      expect(response.statusCode).toBe(400);
      const error = response.json<ApiErrorResponse>();
      expect(error.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PATCH /api/diary-entries/:id/promote (Story #1426)', () => {
    it('Scenario 21: PATCH /:id/promote on valid general_note draft → 200 status=saved', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'Test User', 'password');
      const id = insertDiaryEntry({
        status: 'draft',
        entryType: 'general_note',
        body: 'My draft note',
        entryDate: '2026-03-14',
      });

      const payload: PromoteDiaryEntryRequest = {};
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/diary-entries/${id}/promote`,
        headers: { cookie },
        payload,
      });

      expect(response.statusCode).toBe(200);
      const result = response.json<DiaryEntrySummary>();
      expect(result.id).toBe(id);
      expect(result.status).toBe('saved');
    });

    it('Scenario 22: PATCH /:id/promote on site_visit draft missing inspectorName → 400 VALIDATION_ERROR, entry stays draft', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'Test User', 'password');
      const id = insertDiaryEntry({
        status: 'draft',
        entryType: 'site_visit',
        body: 'Site inspection',
        entryDate: '2026-03-14',
        // metadata is null — missing inspectorName
        metadata: null,
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/diary-entries/${id}/promote`,
        headers: { cookie },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const error = response.json<ApiErrorResponse>();
      expect(error.error.code).toBe('VALIDATION_ERROR');

      // Entry must still be draft (not promoted)
      const getResponse = await app.inject({
        method: 'GET',
        url: `/api/diary-entries/${id}`,
        headers: { cookie },
      });
      expect(getResponse.statusCode).toBe(200);
      const entry = getResponse.json<DiaryEntrySummary>();
      expect(entry.status).toBe('draft');
    });

    it('Scenario 23: PATCH /:id/promote on already-saved entry → 400 ALREADY_SAVED', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'Test User', 'password');
      const id = insertDiaryEntry({
        status: 'saved',
        entryType: 'general_note',
        body: 'Already saved',
        entryDate: '2026-03-14',
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/diary-entries/${id}/promote`,
        headers: { cookie },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const error = response.json<ApiErrorResponse>();
      expect(error.error.code).toBe('ALREADY_SAVED');
    });

    it('Scenario 24: PATCH /:id/promote on non-existent ID → 404 NOT_FOUND', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/diary-entries/does-not-exist/promote',
        headers: { cookie },
        payload: {},
      });

      expect(response.statusCode).toBe(404);
      const error = response.json<ApiErrorResponse>();
      expect(error.error.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /api/diary-entries status filter (Story #1426)', () => {
    it('Scenario 25: GET /?status=draft → only returns draft entries', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'Test User', 'password');
      insertDiaryEntry({
        status: 'draft',
        entryType: 'general_note',
        body: 'draft content',
        entryDate: '2026-03-14',
      });
      insertDiaryEntry({ status: 'saved', body: 'Saved content' });

      const response = await app.inject({
        method: 'GET',
        url: '/api/diary-entries?status=draft',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ items: DiaryEntrySummary[] }>();
      expect(body.items.length).toBeGreaterThanOrEqual(1);
      expect(body.items.every((e) => e.status === 'draft')).toBe(true);
    });

    it('Scenario 26: GET /?status=saved → only returns saved entries', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'Test User', 'password');
      insertDiaryEntry({
        status: 'draft',
        entryType: 'general_note',
        body: 'draft content',
        entryDate: '2026-03-14',
      });
      insertDiaryEntry({ status: 'saved', body: 'Saved content' });

      const response = await app.inject({
        method: 'GET',
        url: '/api/diary-entries?status=saved',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ items: DiaryEntrySummary[] }>();
      expect(body.items.length).toBeGreaterThanOrEqual(1);
      expect(body.items.every((e) => e.status === 'saved')).toBe(true);
    });
  });

  describe('PATCH /api/diary-entries/:id additionalProperties (Story #1426)', () => {
    it('Scenario 27: PATCH /:id with only status field in body → 200 (status silently stripped, entry unchanged — status only changes via promote)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'Test User', 'password');
      const id = insertDiaryEntry({ status: 'saved', body: 'Saved content' });

      // Fastify strips unknown props (removeAdditional:true), so sending only
      // { status: 'saved' } leaves an empty body {}. Ajv 8 with removeAdditional:true
      // does NOT re-evaluate minProperties against the stripped object — validation passes.
      // The service receives {} (all fields undefined) and performs a no-op update.
      // Status is never written by updateDiaryEntry — it only changes via promote.
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/diary-entries/${id}`,
        headers: { cookie },
        payload: { status: 'saved' },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json<{ status: string; body: string }>();
      // Entry is unchanged — status and body are unmodified
      expect(result.status).toBe('saved');
      expect(result.body).toBe('Saved content');
    });

    it('Scenario 28: PATCH /:id/promote route does not conflict with PATCH /:id', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'Test User', 'password');
      const id = insertDiaryEntry({ status: 'saved', body: 'saved', entryDate: '2026-03-14' });

      // PATCH /:id (update) and PATCH /:id/promote (promote) are separate routes
      // Updating by /:id with valid fields works
      const updateResponse = await app.inject({
        method: 'PATCH',
        url: `/api/diary-entries/${id}`,
        headers: { cookie },
        payload: { title: 'Updated title' },
      });
      expect(updateResponse.statusCode).toBe(200);

      // Promote route is also reachable separately
      const promoteResponse = await app.inject({
        method: 'PATCH',
        url: `/api/diary-entries/${id}/promote`,
        headers: { cookie },
        payload: {},
      });
      // Entry is already saved → ALREADY_SAVED (confirms promote route was hit, not update route)
      expect(promoteResponse.statusCode).toBe(400);
      const err = promoteResponse.json<ApiErrorResponse>();
      expect(err.error.code).toBe('ALREADY_SAVED');
    });
  });

  // ─── Signature lock (#2124) and issue signatures (#2125) ───────────────────

  describe('signature lock and issue signatures (#2124, #2125)', () => {
    const sig = {
      signerName: 'Alice',
      signerType: 'self',
      signatureDataUrl: 'data:image/png;base64,AAAA',
      signedAt: '2026-03-14T10:00:00.000Z',
    };
    const signedMeta = JSON.stringify({ signatures: [sig] });

    it('PATCH on a signed draft returns 200 (mutation: lock ignores status)', async () => {
      const { cookie } = await createUserWithSession('lock1@test.com', 'Lock One', 'password');
      const id = insertDiaryEntry({ status: 'draft', metadata: signedMeta });
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/diary-entries/${id}`,
        headers: { cookie },
        payload: { body: 'edited' },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json<{ body: string; isSigned: boolean }>().body).toBe('edited');
    });

    it('PATCH on a signed saved entry returns 403 IMMUTABLE_ENTRY', async () => {
      const { cookie } = await createUserWithSession('lock2@test.com', 'Lock Two', 'password');
      const id = insertDiaryEntry({ status: 'saved', metadata: signedMeta });
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/diary-entries/${id}`,
        headers: { cookie },
        payload: { body: 'edited' },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json<ApiErrorResponse>().error.code).toBe('IMMUTABLE_ENTRY');
    });

    it('promoting a signed draft locks it: subsequent PATCH is 403', async () => {
      const { cookie } = await createUserWithSession('lock3@test.com', 'Lock Three', 'password');
      const id = insertDiaryEntry({ status: 'draft', metadata: signedMeta });
      const promote = await app.inject({
        method: 'PATCH',
        url: `/api/diary-entries/${id}/promote`,
        headers: { cookie },
        payload: {},
      });
      expect(promote.statusCode).toBe(200);
      const patch = await app.inject({
        method: 'PATCH',
        url: `/api/diary-entries/${id}`,
        headers: { cookie },
        payload: { body: 'late edit' },
      });
      expect(patch.statusCode).toBe(403);
    });

    it('POST an issue draft with signatures returns 201 with isSigned true', async () => {
      const { cookie } = await createUserWithSession('iss1@test.com', 'Issue One', 'password');
      const response = await app.inject({
        method: 'POST',
        url: '/api/diary-entries',
        headers: { cookie },
        payload: { entryType: 'issue', status: 'draft', metadata: { signatures: [sig] } },
      });
      expect(response.statusCode).toBe(201);
      expect(response.json<{ isSigned: boolean }>().isSigned).toBe(true);
    });

    it('POST an issue with an invalid signature returns 400 INVALID_METADATA', async () => {
      const { cookie } = await createUserWithSession('iss2@test.com', 'Issue Two', 'password');
      const response = await app.inject({
        method: 'POST',
        url: '/api/diary-entries',
        headers: { cookie },
        payload: {
          entryType: 'issue',
          status: 'draft',
          metadata: { signatures: [{ ...sig, signerName: '' }] },
        },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json<ApiErrorResponse>().error.code).toBe('INVALID_METADATA');
    });

    it.each(['issue', 'daily_log', 'site_visit'] as const)(
      'POST %s with a null signature element returns 400 INVALID_METADATA, not 500',
      async (entryType) => {
        const { cookie } = await createUserWithSession(
          `null-${entryType}@test.com`,
          'Null Sig',
          'password',
        );
        const response = await app.inject({
          method: 'POST',
          url: '/api/diary-entries',
          headers: { cookie },
          payload: { entryType, status: 'draft', metadata: { signatures: [null] } },
        });
        expect(response.statusCode).toBe(400);
        expect(response.json<ApiErrorResponse>().error.code).toBe('INVALID_METADATA');
      },
    );

    it('DELETE of a signed saved entry still returns 204', async () => {
      const { cookie } = await createUserWithSession('lock4@test.com', 'Lock Four', 'password');
      const id = insertDiaryEntry({ status: 'saved', metadata: signedMeta });
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/diary-entries/${id}`,
        headers: { cookie },
      });
      expect(response.statusCode).toBe(204);
    });
  });

  describe('signature hardening over HTTP', () => {
    const PNG = 'data:image/png;base64,iVBORw0KGgo=';
    const sig = {
      signerName: 'Alice',
      signerType: 'self',
      signatureDataUrl: PNG,
      signedAt: '2026-03-14T10:00:00.000Z',
    };
    const types = [
      ['daily_log', { weather: 'sunny' }],
      ['site_visit', {}],
      ['issue', { severity: 'high', resolutionStatus: 'open' }],
    ] as const;
    const bads: Array<[string, Record<string, unknown>]> = [
      ['https URL', { signatureDataUrl: 'https://example.com/s.png' }],
      ['javascript: URL', { signatureDataUrl: 'javascript:alert(1)' }],
      ['text/html data URL', { signatureDataUrl: 'data:text/html;base64,PGh0bWw+' }],
      [
        'oversized data URL',
        { signatureDataUrl: 'data:image/png;base64,' + 'A'.repeat(512 * 1024) },
      ],
      ['301-char signerName', { signerName: 'a'.repeat(301) }],
      ['bad signedAt', { signedAt: 'nope' }],
      ['signedAt with trailing junk', { signedAt: '2026-01-01T10:00:00.000Zjunk' }],
      ['date-only signedAt', { signedAt: '2026-01-01' }],
      ['impossible calendar signedAt (Feb 30)', { signedAt: '2026-02-30T00:00Z' }],
      ['hour-24 signedAt', { signedAt: '2026-01-01T24:00Z' }],
      [
        'signedAt with a long trailing suffix',
        { signedAt: `2026-01-01T10:00:00.000Z${' '.repeat(60)}` },
      ],
    ];

    describe.each(types)('%s', (entryType, extra) => {
      it.each(bads)('rejects %s with 400 INVALID_METADATA', async (_l, override) => {
        const { cookie } = await createUserWithSession(
          `h-${entryType}-${Math.random()}@test.com`,
          'Hard',
          'password',
        );
        const response = await app.inject({
          method: 'POST',
          url: '/api/diary-entries',
          headers: { cookie },
          payload: {
            entryType,
            status: 'draft',
            metadata: { ...extra, signatures: [{ ...sig, ...override }] },
          },
        });
        expect(response.statusCode).toBe(400);
        expect(response.json<ApiErrorResponse>().error.code).toBe('INVALID_METADATA');
      });

      it('accepts an offset signedAt and stores the signerName trimmed', async () => {
        const { cookie } = await createUserWithSession(
          `t-${entryType}-${Math.random()}@test.com`,
          'Trim',
          'password',
        );
        const response = await app.inject({
          method: 'POST',
          url: '/api/diary-entries',
          headers: { cookie },
          payload: {
            entryType,
            status: 'draft',
            metadata: {
              ...extra,
              signatures: [{ ...sig, signerName: '  Alice  ', signedAt: '2026-01-01T10:00+02:00' }],
            },
          },
        });
        expect(response.statusCode).toBe(201);
        const body = response.json<DiaryEntryDetail>();
        const signatures = (body.metadata as { signatures: DiarySignatureEntry[] }).signatures;
        expect(signatures[0].signerName).toBe('Alice');
        expect(signatures[0].signedAt).toBe('2026-01-01T10:00+02:00');
      });

      it('rejects 11 signatures and accepts 10', async () => {
        const { cookie } = await createUserWithSession(
          `c-${entryType}-${Math.random()}@test.com`,
          'Count',
          'password',
        );
        const post = (n: number) =>
          app.inject({
            method: 'POST',
            url: '/api/diary-entries',
            headers: { cookie },
            payload: {
              entryType,
              status: 'draft',
              metadata: { ...extra, signatures: Array.from({ length: n }, () => sig) },
            },
          });
        const over = await post(11);
        expect(over.statusCode).toBe(400);
        expect(over.json<ApiErrorResponse>().error.code).toBe('INVALID_METADATA');
        expect((await post(10)).statusCode).toBe(201);
      });
    });
  });
});

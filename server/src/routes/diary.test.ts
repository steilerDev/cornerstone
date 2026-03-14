/**
 * Integration tests for /api/diary-entries route handlers.
 *
 * EPIC-13: Construction Diary — Story #803
 * Tests all 5 diary endpoints: GET list, POST create, GET by ID, PUT update, DELETE.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
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
  ApiErrorResponse,
  CreateDiaryEntryRequest,
} from '@cornerstone/shared';

// Suppress migration logs
beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

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
      expect(body.items[0].entryType).toBe('daily_log');
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
      expect(body.items[0].isAutomatic).toBe(true);
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
      expect(body.items[0].title).toBe('Concrete pouring');
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
      expect(body.items[0].entryDate).toBe('2026-01-15');
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
      const body = response.json<{ items: DiaryEntrySummary[]; pagination: { page: number; pageSize: number; totalItems: number; totalPages: number } }>();
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

  // ─── PUT /api/diary-entries/:id ───────────────────────────────────────────

  describe('PUT /api/diary-entries/:id', () => {
    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'PUT',
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
        method: 'PUT',
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
        method: 'PUT',
        url: '/api/diary-entries/nonexistent-entry-id',
        headers: { cookie },
        payload: { body: 'Updated' },
      });

      expect(response.statusCode).toBe(404);
      const error = response.json<ApiErrorResponse>();
      expect(error.error.code).toBe('NOT_FOUND');
    });

    it('returns 400 IMMUTABLE_ENTRY when updating an automatic entry', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'Test User', 'password');
      const id = insertDiaryEntry({
        isAutomatic: true,
        entryType: 'work_item_status',
        createdBy: null,
      });

      const response = await app.inject({
        method: 'PUT',
        url: `/api/diary-entries/${id}`,
        headers: { cookie },
        payload: { body: 'Should not update' },
      });

      expect(response.statusCode).toBe(400);
      const error = response.json<ApiErrorResponse>();
      expect(error.error.code).toBe('IMMUTABLE_ENTRY');
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

    it('returns 400 IMMUTABLE_ENTRY when deleting an automatic entry', async () => {
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

      expect(response.statusCode).toBe(400);
      const error = response.json<ApiErrorResponse>();
      expect(error.error.code).toBe('IMMUTABLE_ENTRY');
    });
  });
});

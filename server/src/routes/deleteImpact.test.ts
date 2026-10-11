/**
 * Integration tests for GET /api/delete-impact/:entityType/:id (#2209, contract 19).
 * Security focus: entityType whitelist, parameter bounds, auth, read-only behaviour.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import { DELETE_IMPACT_ENTITY_TYPES } from '@cornerstone/shared';
import type { FastifyInstance } from 'fastify';
import type { ApiErrorResponse, DeleteImpactResponse } from '@cornerstone/shared';
import { areas, photos, workItems, milestones } from '../db/schema.js';

describe('Delete Impact Routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;
  let cookie: string;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-delete-impact-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';
    app = await buildApp();
    const user = await userService.createLocalUser(
      app.db,
      'a@example.com',
      'A',
      'password-1234',
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
      // ignore
    }
  });

  function get(url: string, withCookie = true) {
    return app.inject({ method: 'GET', url, headers: withCookie ? { cookie } : {} });
  }

  function seedArea(): string {
    const now = new Date().toISOString();
    app.db
      .insert(areas)
      .values({ id: 'area-1', name: 'Kitchen', createdAt: now, updatedAt: now })
      .run();
    app.db
      .insert(areas)
      .values({ id: 'area-2', name: 'Pantry', parentId: 'area-1', createdAt: now, updatedAt: now })
      .run();
    for (const [i, areaId] of ['area-1', 'area-2'].entries()) {
      app.db
        .insert(photos)
        .values({
          id: `ph-${i}`,
          entityType: 'diary_entry',
          entityId: 'x',
          filename: `f${i}.jpg`,
          originalFilename: 'f.jpg',
          mimeType: 'image/jpeg',
          fileSize: 1,
          areaId,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }
    return 'area-1';
  }

  describe('200', () => {
    it('returns entityType, id and the ordered non-zero effects', async () => {
      const id = seedArea();
      const res = await get(`/api/delete-impact/area/${id}`);
      expect(res.statusCode).toBe(200);
      expect(res.json<DeleteImpactResponse>()).toEqual({
        entityType: 'area',
        id,
        effects: [
          { kind: 'childAreas', count: 1 },
          { kind: 'photosLoseArea', count: 2 },
        ],
      });
    });

    it('returns an empty effects array when nothing else would change', async () => {
      const now = new Date().toISOString();
      app.db
        .insert(workItems)
        .values({ id: 'wi-1', title: 'T', status: 'not_started', createdAt: now, updatedAt: now })
        .run();
      const res = await get('/api/delete-impact/work_item/wi-1');
      expect(res.statusCode).toBe(200);
      expect(res.json<DeleteImpactResponse>().effects).toEqual([]);
    });

    it('handles the integer milestone id given as a path string', async () => {
      const now = new Date().toISOString();
      const m = app.db
        .insert(milestones)
        .values({
          title: 'Roof',
          targetDate: '2026-09-01',
          isCompleted: false,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
      const res = await get(`/api/delete-impact/milestone/${m.id}`);
      expect(res.statusCode).toBe(200);
      expect(res.json<DeleteImpactResponse>()).toEqual({
        entityType: 'milestone',
        id: String(m.id),
        effects: [],
      });
    });

    it('is read-only: the entity is still there afterwards', async () => {
      const id = seedArea();
      await get(`/api/delete-impact/area/${id}`);
      expect(app.db.select().from(areas).all()).toHaveLength(2);
      expect(app.db.select().from(photos).all()).toHaveLength(2);
    });

    it.each([...DELETE_IMPACT_ENTITY_TYPES])(
      'accepts the whitelisted type %s (404 for a missing id)',
      async (type) => {
        const res = await get(`/api/delete-impact/${type}/does-not-exist`);
        expect(res.statusCode).toBe(404);
        expect(res.json<ApiErrorResponse>().error.code).toBe('NOT_FOUND');
      },
    );
  });

  describe('entityType whitelist (security)', () => {
    it.each([
      ['an unknown type', 'user'],
      ['a table name', 'sessions'],
      ['a wrong case', 'Area'],
      ['a kebab-case spelling', 'work-item'],
      ['an SQL fragment', encodeURIComponent("area';DROP TABLE areas;--")],
      ['a path traversal', encodeURIComponent('../areas')],
    ])('returns 400 VALIDATION_ERROR for %s', async (_label, type) => {
      const res = await get(`/api/delete-impact/${type}/abc`);
      expect(res.statusCode).toBe(400);
      expect(res.json<ApiErrorResponse>().error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects an unknown type before reading the database (404 would mean it was looked up)', async () => {
      const res = await get('/api/delete-impact/sessions/does-not-exist');
      expect(res.statusCode).toBe(400);
    });
  });

  describe('id handling', () => {
    it('404 for a milestone id that is not an integer', async () => {
      const res = await get('/api/delete-impact/milestone/abc');
      expect(res.statusCode).toBe(404);
    });

    it('400 for an id longer than 64 characters', async () => {
      const res = await get(`/api/delete-impact/area/${'a'.repeat(65)}`);
      expect(res.statusCode).toBe(400);
      expect(res.json<ApiErrorResponse>().error.code).toBe('VALIDATION_ERROR');
    });

    it('accepts an id of exactly 64 characters (404 because it does not exist)', async () => {
      const res = await get(`/api/delete-impact/area/${'a'.repeat(64)}`);
      expect(res.statusCode).toBe(404);
    });

    it('treats an id containing SQL syntax as plain data (404, tables intact)', async () => {
      const id = seedArea();
      const res = await get(`/api/delete-impact/area/${encodeURIComponent("x' OR '1'='1")}`);
      expect(res.statusCode).toBe(404);
      expect(app.db.select().from(areas).all()).toHaveLength(2);
      expect(id).toBe('area-1');
    });
  });

  describe('auth', () => {
    it('401 UNAUTHORIZED without a session', async () => {
      const id = seedArea();
      const res = await get(`/api/delete-impact/area/${id}`, false);
      expect(res.statusCode).toBe(401);
      expect(res.json<ApiErrorResponse>().error.code).toBe('UNAUTHORIZED');
    });

    it('401 without a session for an existing and a missing entity alike (no existence leak)', async () => {
      const id = seedArea();
      const existing = await get(`/api/delete-impact/area/${id}`, false);
      const missing = await get('/api/delete-impact/area/nope', false);
      expect(existing.statusCode).toBe(401);
      expect(missing.json()).toEqual(existing.json());
    });

    it('401 for an invalid session cookie', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/delete-impact/area/area-1',
        headers: { cookie: 'cornerstone_session=bogus' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('is not reachable with POST (read-only route)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/delete-impact/area/area-1',
        headers: { cookie },
      });
      expect(res.statusCode).toBe(404);
    });
  });
});

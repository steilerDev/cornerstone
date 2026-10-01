/**
 * Integration tests for GET /api/photos/spots and GET /api/photos/spots/photos
 * (Story #2162: Photo browser). Real app, real DB, real photoService.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import * as schema from '../db/schema.js';
import type { FastifyInstance } from 'fastify';
import type {
  ApiErrorResponse,
  PhotoSpotsResponse,
  PhotoSpotPhotosResponse,
} from '@cornerstone/shared';

describe('Photo spot routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;
  let cookie: string;
  let counter = 0;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-photo-spots-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';
    process.env.PHOTO_STORAGE_PATH = join(tempDir, 'photos');
    counter = 0;

    app = await buildApp();
    const user = await userService.createLocalUser(
      app.db,
      'spots@example.com',
      'Spots User',
      'password-123456',
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

  function nextId(prefix: string): string {
    counter += 1;
    return `${prefix}-${String(counter).padStart(4, '0')}`;
  }

  function insertArea(name: string): string {
    const id = nextId('area');
    const now = new Date().toISOString();
    app.db
      .insert(schema.areas)
      .values({ id, name, color: null, sortOrder: 0, createdAt: now, updatedAt: now })
      .run();
    return id;
  }

  function insertOrientation(name: string): string {
    const id = nextId('orient');
    const now = new Date().toISOString();
    app.db
      .insert(schema.orientations)
      .values({ id, name, description: null, sortOrder: 0, createdAt: now, updatedAt: now })
      .run();
    return id;
  }

  function insertEntry(status: 'draft' | 'saved', entryDate: string): string {
    const id = nextId('entry');
    const now = new Date().toISOString();
    app.db
      .insert(schema.diaryEntries)
      .values({
        id,
        entryType: 'daily_log',
        entryDate,
        title: 'T',
        body: 'b',
        status,
        isAutomatic: false,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function insertPhoto(
    entityId: string,
    areaId: string | null,
    orientationId: string | null,
  ): string {
    const id = nextId('photo');
    const now = new Date().toISOString();
    app.db
      .insert(schema.photos)
      .values({
        id,
        entityType: 'diary_entry',
        entityId,
        filename: `${id}.jpg`,
        originalFilename: 'o.jpg',
        mimeType: 'image/jpeg',
        fileSize: 1,
        areaId,
        orientationId,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  async function getSpots(headers: Record<string, string> = { cookie }) {
    return app.inject({ method: 'GET', url: '/api/photos/spots', headers });
  }

  async function getSpotPhotos(query: string, headers: Record<string, string> = { cookie }) {
    return app.inject({ method: 'GET', url: `/api/photos/spots/photos${query}`, headers });
  }

  describe('GET /api/photos/spots', () => {
    it('returns 401 without a session', async () => {
      const res = await getSpots({});
      expect(res.statusCode).toBe(401);
      expect(res.json<ApiErrorResponse>().error.code).toBe('UNAUTHORIZED');
    });

    it('returns 200 with empty spots when no diary photos exist', async () => {
      const res = await getSpots();
      expect(res.statusCode).toBe(200);
      expect(res.json<PhotoSpotsResponse>()).toEqual({ spots: [], areas: [], orientations: [] });
    });

    it('is not swallowed by the /:id route (200, not a validation error)', async () => {
      const res = await getSpots();
      expect(res.statusCode).not.toBe(400);
      expect(res.statusCode).toBe(200);
    });

    it('aggregates saved-entry photos and excludes drafts', async () => {
      const area = insertArea('Kitchen');
      const o = insertOrientation('North');
      const saved = insertEntry('saved', '2026-09-11');
      const draft = insertEntry('draft', '2026-09-12');
      const photoId = insertPhoto(saved, area, o);
      insertPhoto(draft, area, o);

      const body = (await getSpots()).json<PhotoSpotsResponse>();

      expect(body.spots).toHaveLength(1);
      expect(body.spots[0]).toMatchObject({
        areaId: area,
        orientationId: o,
        photoCount: 1,
        latestEntryDate: '2026-09-11',
        latestPhotoId: photoId,
      });
      expect(body.areas.map((a) => a.id)).toEqual([area]);
      expect(body.orientations.map((x) => x.id)).toEqual([o]);
    });
  });

  describe('GET /api/photos/spots/photos', () => {
    it('returns 401 without a session', async () => {
      const res = await getSpotPhotos('?areaId=a&orientationId=o', {});
      expect(res.statusCode).toBe(401);
    });

    it.each([
      ['missing areaId', '?orientationId=o'],
      ['missing orientationId', '?areaId=a'],
      ['empty areaId', '?areaId=&orientationId=o'],
      ['empty orientationId', '?areaId=a&orientationId='],
      ['areaId over 36 chars', `?areaId=${'x'.repeat(37)}&orientationId=o`],
      ['orientationId over 36 chars', `?areaId=a&orientationId=${'x'.repeat(37)}`],
    ])('returns 400 VALIDATION_ERROR for %s', async (_label, query) => {
      const res = await getSpotPhotos(query);
      expect(res.statusCode).toBe(400);
      expect(res.json<ApiErrorResponse>().error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 "Area not found" for an unknown area, and the area wins when both are unknown', async () => {
      const res = await getSpotPhotos('?areaId=missing-area&orientationId=missing-orientation');
      expect(res.statusCode).toBe(404);
      const body = res.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toBe('Area not found');
    });

    it('returns 404 "Orientation not found" for an unknown orientation with a valid area', async () => {
      const area = insertArea('Kitchen');
      const res = await getSpotPhotos(`?areaId=${area}&orientationId=missing`);
      expect(res.statusCode).toBe(404);
      expect(res.json<ApiErrorResponse>().error.message).toBe('Orientation not found');
    });

    it('returns 200 with an empty list for an existing spot without photos', async () => {
      const area = insertArea('Kitchen');
      const o = insertOrientation('North');
      const res = await getSpotPhotos(`?areaId=${area}&orientationId=${o}`);
      expect(res.statusCode).toBe(200);
      const body = res.json<PhotoSpotPhotosResponse>();
      expect(body.photos).toEqual([]);
      expect(body.area?.id).toBe(area);
      expect(body.orientation?.id).toBe(o);
    });

    it('maps the __none__ sentinel to the NULL spot', async () => {
      const entry = insertEntry('saved', '2026-09-11');
      const area = insertArea('Kitchen');
      const none = insertPhoto(entry, null, null);
      insertPhoto(entry, area, null);

      const res = await getSpotPhotos('?areaId=__none__&orientationId=__none__');

      expect(res.statusCode).toBe(200);
      const body = res.json<PhotoSpotPhotosResponse>();
      expect(body.area).toBeNull();
      expect(body.orientation).toBeNull();
      expect(body.photos.map((p) => p.id)).toEqual([none]);
    });

    it('mixes a real area with the __none__ orientation sentinel', async () => {
      const entry = insertEntry('saved', '2026-09-11');
      const area = insertArea('Kitchen');
      const o = insertOrientation('North');
      insertPhoto(entry, area, o);
      const target = insertPhoto(entry, area, null);

      const body = (
        await getSpotPhotos(`?areaId=${area}&orientationId=__none__`)
      ).json<PhotoSpotPhotosResponse>();

      expect(body.photos.map((p) => p.id)).toEqual([target]);
      expect(body.photos[0]!.diaryEntry.id).toBe(entry);
    });
  });

  describe('regression: GET /api/photos list endpoint', () => {
    it('still returns 400 when entityType is missing', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/photos', headers: { cookie } });
      expect(res.statusCode).toBe(400);
    });
  });
});

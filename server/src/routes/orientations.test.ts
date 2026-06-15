import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import type { FastifyInstance } from 'fastify';
import type {
  OrientationListResponse,
  OrientationSingleResponse,
  ApiErrorResponse,
} from '@cornerstone/shared';
import { orientations, photos } from '../db/schema.js';

describe('Orientation Routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };

    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-orientation-routes-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';

    app = await buildApp();
    // Ensure clean state
    app.db.delete(orientations).run();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }

    process.env = originalEnv;

    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  /**
   * Helper: Create a user and return a session cookie.
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

  let orientationTimestampOffset = 0;

  /**
   * Helper: Insert an orientation directly into the database.
   */
  function createTestOrientation(
    name: string,
    options: {
      description?: string | null;
      sortOrder?: number;
    } = {},
  ) {
    const id = `orientation-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const timestamp = new Date(Date.now() + orientationTimestampOffset).toISOString();
    orientationTimestampOffset += 1;

    app.db
      .insert(orientations)
      .values({
        id,
        name,
        description: options.description ?? null,
        sortOrder: options.sortOrder ?? 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();

    return { id, name, ...options, createdAt: timestamp, updatedAt: timestamp };
  }

  /**
   * Helper: Insert a photo referencing an orientation directly into the database.
   */
  function createTestPhotoWithOrientation(orientationId: string, userId: string | null = null) {
    const id = `photo-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const now = new Date().toISOString();
    app.db
      .insert(photos)
      .values({
        id,
        entityType: 'work_item',
        entityId: 'wi-test-123',
        filename: 'original.jpg',
        originalFilename: 'test.jpg',
        mimeType: 'image/jpeg',
        fileSize: 1024,
        width: 800,
        height: 600,
        takenAt: null,
        caption: null,
        areaId: null,
        orientationId,
        sortOrder: 0,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
        annotatedAt: null,
      })
      .run();
    return id;
  }

  // ─── GET /api/orientations ─────────────────────────────────────────────────

  describe('GET /api/orientations', () => {
    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/orientations',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 200 with empty list when no orientations exist', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'GET',
        url: '/api/orientations',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<OrientationListResponse>();
      expect(body.orientations).toHaveLength(0);
    });

    it('returns 200 with list of orientations after creating one', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      createTestOrientation('South');

      const response = await app.inject({
        method: 'GET',
        url: '/api/orientations',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<OrientationListResponse>();
      expect(body.orientations).toHaveLength(1);
      expect(body.orientations[0]!.name).toBe('South');
    });

    it('filters orientations by search query (case-insensitive)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      createTestOrientation('South');
      createTestOrientation('North');
      createTestOrientation('South-West');

      const response = await app.inject({
        method: 'GET',
        url: '/api/orientations?search=sou',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<OrientationListResponse>();
      expect(body.orientations).toHaveLength(2);
      expect(
        body.orientations.every((o: { name: string }) => o.name.toLowerCase().includes('sou')),
      ).toBe(true);
    });

    it('returns empty list when search matches nothing', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      createTestOrientation('South');

      const response = await app.inject({
        method: 'GET',
        url: '/api/orientations?search=nonexistent',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<OrientationListResponse>();
      expect(body.orientations).toHaveLength(0);
    });
  });

  // ─── POST /api/orientations ────────────────────────────────────────────────

  describe('POST /api/orientations', () => {
    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/orientations',
        payload: { name: 'South' },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('creates an orientation with name only (201)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/orientations',
        headers: { cookie },
        payload: { name: 'South' },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<OrientationSingleResponse>();
      expect(body.orientation.id).toBeDefined();
      expect(body.orientation.name).toBe('South');
      expect(body.orientation.description).toBeNull();
      expect(body.orientation.sortOrder).toBe(0);
      expect(body.orientation.createdAt).toBeDefined();
      expect(body.orientation.updatedAt).toBeDefined();
    });

    it('returns 409 CONFLICT for duplicate name (same case)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      createTestOrientation('South');

      const response = await app.inject({
        method: 'POST',
        url: '/api/orientations',
        headers: { cookie },
        payload: { name: 'South' },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('CONFLICT');
    });

    it('returns 409 CONFLICT for duplicate name (case-insensitive)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      createTestOrientation('South');

      const response = await app.inject({
        method: 'POST',
        url: '/api/orientations',
        headers: { cookie },
        payload: { name: 'SOUTH' },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('CONFLICT');
    });

    it('returns 400 VALIDATION_ERROR for missing name', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/orientations',
        headers: { cookie },
        payload: { description: 'No name provided' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 VALIDATION_ERROR for empty name', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/orientations',
        headers: { cookie },
        payload: { name: '' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('strips unknown properties (additionalProperties: false)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/orientations',
        headers: { cookie },
        payload: { name: 'East', unknownField: 'should be stripped' },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<OrientationSingleResponse>();
      expect(body.orientation.name).toBe('East');
    });
  });

  // ─── GET /api/orientations/:id ─────────────────────────────────────────────

  describe('GET /api/orientations/:id', () => {
    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/orientations/some-id',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 200 with orientation by ID', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const orientation = createTestOrientation('North', {
        description: 'Rear-facing',
        sortOrder: 2,
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/orientations/${orientation.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<OrientationSingleResponse>();
      expect(body.orientation.id).toBe(orientation.id);
      expect(body.orientation.name).toBe('North');
      expect(body.orientation.description).toBe('Rear-facing');
      expect(body.orientation.sortOrder).toBe(2);
    });

    it('returns 404 NOT_FOUND for non-existent orientation', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'GET',
        url: '/api/orientations/non-existent-id',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });

  // ─── PATCH /api/orientations/:id ───────────────────────────────────────────

  describe('PATCH /api/orientations/:id', () => {
    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/orientations/some-id',
        payload: { name: 'Updated' },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('updates orientation name (200)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const orientation = createTestOrientation('South', { description: 'Street-facing' });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/orientations/${orientation.id}`,
        headers: { cookie },
        payload: { name: 'North' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<OrientationSingleResponse>();
      expect(body.orientation.id).toBe(orientation.id);
      expect(body.orientation.name).toBe('North');
      expect(body.orientation.description).toBe('Street-facing'); // Unchanged
    });

    it('returns 400 VALIDATION_ERROR for empty body (minProperties constraint)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const orientation = createTestOrientation('East');

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/orientations/${orientation.id}`,
        headers: { cookie },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 409 CONFLICT when name conflicts with another orientation', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      createTestOrientation('South');
      const orientation = createTestOrientation('North');

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/orientations/${orientation.id}`,
        headers: { cookie },
        payload: { name: 'South' },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('CONFLICT');
    });

    it('allows updating name to the same value (no conflict, 200)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const orientation = createTestOrientation('West');

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/orientations/${orientation.id}`,
        headers: { cookie },
        payload: { name: 'West' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<OrientationSingleResponse>();
      expect(body.orientation.name).toBe('West');
    });

    it('returns 404 NOT_FOUND for non-existent orientation', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/orientations/non-existent-id',
        headers: { cookie },
        payload: { name: 'Updated' },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });

  // ─── DELETE /api/orientations/:id ──────────────────────────────────────────

  describe('DELETE /api/orientations/:id', () => {
    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/orientations/some-id',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('deletes an orientation successfully (204)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const orientation = createTestOrientation('South');

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/orientations/${orientation.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe('');
    });

    it('orientation no longer accessible after deletion', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const orientation = createTestOrientation('South');

      await app.inject({
        method: 'DELETE',
        url: `/api/orientations/${orientation.id}`,
        headers: { cookie },
      });

      const getResponse = await app.inject({
        method: 'GET',
        url: `/api/orientations/${orientation.id}`,
        headers: { cookie },
      });

      expect(getResponse.statusCode).toBe(404);
    });

    it('returns 204 when orientation is referenced by a photo (SET NULL, not 409)', async () => {
      const { cookie, userId } = await createUserWithSession('user@test.com', 'User', 'password');
      const orientation = createTestOrientation('South');
      // Seed a photo that references this orientation
      const photoId = createTestPhotoWithOrientation(orientation.id, userId);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/orientations/${orientation.id}`,
        headers: { cookie },
      });

      // Must return 204, not 409 — FK is SET NULL
      expect(response.statusCode).toBe(204);
      expect(response.body).toBe('');

      // Photo must still exist with orientationId set to null
      const updatedPhoto = app.db.select().from(photos).where(eq(photos.id, photoId)).get();
      expect(updatedPhoto).toBeDefined();
      expect(updatedPhoto!.orientationId).toBeNull();
    });

    it('returns 404 NOT_FOUND for non-existent orientation', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/orientations/non-existent-id',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });
});

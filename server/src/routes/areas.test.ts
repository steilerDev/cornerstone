import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import type { FastifyInstance } from 'fastify';
import type {
  AreaResponse,
  AreaListResponse,
  AreaSingleResponse,
  ApiErrorResponse,
} from '@cornerstone/shared';
import { areas, workItems, householdItems } from '../db/schema.js';

describe('Area Routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };

    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-area-routes-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';

    app = await buildApp();
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

  let areaTimestampOffset = 0;

  /**
   * Helper: Insert an area directly into the database.
   */
  function createTestArea(
    name: string,
    options: {
      parentId?: string | null;
      description?: string | null;
      color?: string | null;
      sortOrder?: number;
    } = {},
  ) {
    const id = `area-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const timestamp = new Date(Date.now() + areaTimestampOffset).toISOString();
    areaTimestampOffset += 1;

    app.db
      .insert(areas)
      .values({
        id,
        name,
        parentId: options.parentId ?? null,
        description: options.description ?? null,
        color: options.color ?? null,
        sortOrder: options.sortOrder ?? 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();

    return { id, name, ...options, createdAt: timestamp, updatedAt: timestamp };
  }

  /**
   * Helper: Insert a work item referencing an area.
   */
  function createTestWorkItem(areaId: string) {
    const id = `wi-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const now = new Date().toISOString();
    app.db
      .insert(workItems)
      .values({
        id,
        title: 'Test Work Item',
        status: 'not_started',
        areaId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  /**
   * Helper: Insert a household item referencing an area.
   */
  function createTestHouseholdItem(areaId: string) {
    const id = `hi-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const now = new Date().toISOString();
    app.db
      .insert(householdItems)
      .values({
        id,
        name: 'Test HI',
        categoryId: 'hic-furniture',
        areaId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  // ─── GET /api/areas ────────────────────────────────────────────────────────

  describe('GET /api/areas', () => {
    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/areas',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 200 with empty list when no areas exist', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'GET',
        url: '/api/areas',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<AreaListResponse>();
      expect(body.areas).toHaveLength(0);
    });

    it('returns 200 with list of areas', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      createTestArea('Kitchen');
      createTestArea('Bathroom');

      const response = await app.inject({
        method: 'GET',
        url: '/api/areas',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<AreaListResponse>();
      expect(body.areas).toHaveLength(2);
    });

    it('returns all area fields in list', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const area = createTestArea('Master Bedroom', {
        description: 'Main sleeping area',
        color: '#3B82F6',
        sortOrder: 5,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/areas',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<AreaListResponse>();
      const found = body.areas.find((a) => a.id === area.id);
      expect(found).toBeDefined();
      expect(found!.name).toBe('Master Bedroom');
      expect(found!.description).toBe('Main sleeping area');
      expect(found!.color).toBe('#3B82F6');
      expect(found!.sortOrder).toBe(5);
      expect(found!.parentId).toBeNull();
    });

    it('filters areas by search query (case-insensitive)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      createTestArea('Kitchen');
      createTestArea('Bathroom');
      createTestArea('Kitchen Cabinets');

      const response = await app.inject({
        method: 'GET',
        url: '/api/areas?search=kitchen',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<AreaListResponse>();
      expect(body.areas).toHaveLength(2);
      expect(body.areas.every((a) => a.name.toLowerCase().includes('kitchen'))).toBe(true);
    });

    it('returns empty list when search matches nothing', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      createTestArea('Kitchen');

      const response = await app.inject({
        method: 'GET',
        url: '/api/areas?search=nonexistent',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<AreaListResponse>();
      expect(body.areas).toHaveLength(0);
    });

    it('allows member user to list areas', async () => {
      const { cookie } = await createUserWithSession(
        'member@test.com',
        'Member',
        'password',
        'member',
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/areas',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // ─── POST /api/areas ───────────────────────────────────────────────────────

  describe('POST /api/areas', () => {
    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/areas',
        payload: { name: 'Test Area' },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('creates a top-level area with name only (201)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/areas',
        headers: { cookie },
        payload: { name: 'Living Room' },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<AreaSingleResponse>();
      expect(body.area.id).toBeDefined();
      expect(body.area.name).toBe('Living Room');
      expect(body.area.parentId).toBeNull();
      expect(body.area.description).toBeNull();
      expect(body.area.color).toBeNull();
      expect(body.area.sortOrder).toBe(0);
      expect(body.area.createdAt).toBeDefined();
      expect(body.area.updatedAt).toBeDefined();
    });

    it('creates area with all fields (201)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/areas',
        headers: { cookie },
        payload: {
          name: 'Master Bedroom',
          description: 'Main sleeping area',
          color: '#3B82F6',
          sortOrder: 5,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<AreaSingleResponse>();
      expect(body.area.name).toBe('Master Bedroom');
      expect(body.area.description).toBe('Main sleeping area');
      expect(body.area.color).toBe('#3B82F6');
      expect(body.area.sortOrder).toBe(5);
    });

    it('creates child area with valid parentId (201)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const parent = createTestArea('Floor 1');

      const response = await app.inject({
        method: 'POST',
        url: '/api/areas',
        headers: { cookie },
        payload: { name: 'Bedroom 1', parentId: parent.id },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<AreaSingleResponse>();
      expect(body.area.parentId).toBe(parent.id);
      expect(body.area.name).toBe('Bedroom 1');
    });

    it('returns 400 VALIDATION_ERROR for missing name', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/areas',
        headers: { cookie },
        payload: { description: 'No name provided' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 VALIDATION_ERROR for empty name string', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/areas',
        headers: { cookie },
        payload: { name: '' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 VALIDATION_ERROR for invalid color format', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/areas',
        headers: { cookie },
        payload: { name: 'Test Area', color: 'blue' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 VALIDATION_ERROR for non-existent parentId', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/areas',
        headers: { cookie },
        payload: { name: 'Test Area', parentId: 'non-existent-parent' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 409 CONFLICT for duplicate name at same level', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      createTestArea('Kitchen');

      const response = await app.inject({
        method: 'POST',
        url: '/api/areas',
        headers: { cookie },
        payload: { name: 'Kitchen' },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('CONFLICT');
      expect(body.error.message).toContain('already exists');
    });

    it('returns 409 CONFLICT for case-insensitive duplicate at same level', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      createTestArea('Kitchen');

      const response = await app.inject({
        method: 'POST',
        url: '/api/areas',
        headers: { cookie },
        payload: { name: 'KITCHEN' },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('CONFLICT');
    });

    it('allows same name under different parents (201)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const parent1 = createTestArea('Floor 1');
      const parent2 = createTestArea('Floor 2');
      createTestArea('Bedroom', { parentId: parent1.id });

      const response = await app.inject({
        method: 'POST',
        url: '/api/areas',
        headers: { cookie },
        payload: { name: 'Bedroom', parentId: parent2.id },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<AreaSingleResponse>();
      expect(body.area.parentId).toBe(parent2.id);
    });

    it('strips unknown properties (additionalProperties: false)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/areas',
        headers: { cookie },
        payload: { name: 'Test Area', unknownField: 'should be stripped' },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<AreaSingleResponse>();
      expect(body.area.name).toBe('Test Area');
    });

    it('allows member user to create an area', async () => {
      const { cookie } = await createUserWithSession(
        'member@test.com',
        'Member',
        'password',
        'member',
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/areas',
        headers: { cookie },
        payload: { name: 'Member Created Area' },
      });

      expect(response.statusCode).toBe(201);
    });
  });

  // ─── GET /api/areas/:id ────────────────────────────────────────────────────

  describe('GET /api/areas/:id', () => {
    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/areas/some-id',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 200 with area by ID', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const area = createTestArea('Test Kitchen', { color: '#FF5733', sortOrder: 3 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/areas/${area.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<AreaSingleResponse>();
      expect(body.area.id).toBe(area.id);
      expect(body.area.name).toBe('Test Kitchen');
      expect(body.area.color).toBe('#FF5733');
      expect(body.area.sortOrder).toBe(3);
    });

    it('returns area with parentId for child areas', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const parent = createTestArea('Parent Area');
      const child = createTestArea('Child Area', { parentId: parent.id });

      const response = await app.inject({
        method: 'GET',
        url: `/api/areas/${child.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<AreaSingleResponse>();
      expect(body.area.parentId).toBe(parent.id);
    });

    it('returns 404 NOT_FOUND for non-existent area', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'GET',
        url: '/api/areas/non-existent-id',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('allows member user to get area by ID', async () => {
      const { cookie } = await createUserWithSession(
        'member@test.com',
        'Member',
        'password',
        'member',
      );
      const area = createTestArea('Member View Area');

      const response = await app.inject({
        method: 'GET',
        url: `/api/areas/${area.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // ─── PATCH /api/areas/:id ──────────────────────────────────────────────────

  describe('PATCH /api/areas/:id', () => {
    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/areas/some-id',
        payload: { name: 'Updated' },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('updates area name (200)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const area = createTestArea('Old Name', { color: '#FF0000' });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/areas/${area.id}`,
        headers: { cookie },
        payload: { name: 'New Name' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<AreaSingleResponse>();
      expect(body.area.id).toBe(area.id);
      expect(body.area.name).toBe('New Name');
      expect(body.area.color).toBe('#FF0000'); // Unchanged
    });

    it('updates parentId to link as child (200)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const parent = createTestArea('New Parent');
      const area = createTestArea('Orphan Area');

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/areas/${area.id}`,
        headers: { cookie },
        payload: { parentId: parent.id },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<AreaSingleResponse>();
      expect(body.area.parentId).toBe(parent.id);
    });

    it('clears parentId to null (200)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const parent = createTestArea('Parent');
      const child = createTestArea('Child', { parentId: parent.id });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/areas/${child.id}`,
        headers: { cookie },
        payload: { parentId: null },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<AreaSingleResponse>();
      expect(body.area.parentId).toBeNull();
    });

    it('updates description only (partial update, 200)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const area = createTestArea('Kitchen');

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/areas/${area.id}`,
        headers: { cookie },
        payload: { description: 'Updated description' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<AreaSingleResponse>();
      expect(body.area.description).toBe('Updated description');
      expect(body.area.name).toBe('Kitchen'); // Unchanged
    });

    it('allows updating name to the same value (no conflict, 200)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const area = createTestArea('Same Name Area');

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/areas/${area.id}`,
        headers: { cookie },
        payload: { name: 'Same Name Area' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<AreaSingleResponse>();
      expect(body.area.name).toBe('Same Name Area');
    });

    it('returns 400 VALIDATION_ERROR for self-circular reference', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const area = createTestArea('Circular Area');

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/areas/${area.id}`,
        headers: { cookie },
        payload: { parentId: area.id },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 VALIDATION_ERROR for descendant circular reference', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const grandparent = createTestArea('Grandparent');
      const parent = createTestArea('Parent', { parentId: grandparent.id });
      const child = createTestArea('Child', { parentId: parent.id });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/areas/${grandparent.id}`,
        headers: { cookie },
        payload: { parentId: child.id },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 VALIDATION_ERROR for empty payload (minProperties constraint)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const area = createTestArea('Test Area');

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/areas/${area.id}`,
        headers: { cookie },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for invalid color in PATCH', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const area = createTestArea('Color Test Area');

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/areas/${area.id}`,
        headers: { cookie },
        payload: { color: 'not-valid' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 NOT_FOUND for non-existent area', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/areas/non-existent-id',
        headers: { cookie },
        payload: { name: 'Updated' },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 409 CONFLICT when name conflicts with sibling area', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      createTestArea('Kitchen');
      const area = createTestArea('Study');

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/areas/${area.id}`,
        headers: { cookie },
        payload: { name: 'Kitchen' },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('CONFLICT');
    });

    it('allows member user to update an area', async () => {
      const { cookie } = await createUserWithSession(
        'member@test.com',
        'Member',
        'password',
        'member',
      );
      const area = createTestArea('Member Update Area');

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/areas/${area.id}`,
        headers: { cookie },
        payload: { name: 'Member Updated Area' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<AreaSingleResponse>();
      expect(body.area.name).toBe('Member Updated Area');
    });
  });

  // ─── DELETE /api/areas/:id ─────────────────────────────────────────────────

  describe('DELETE /api/areas/:id', () => {
    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/areas/some-id',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('deletes an area successfully (204)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const area = createTestArea('Delete Me Area');

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/areas/${area.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe('');
    });

    it('area no longer accessible after deletion', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const area = createTestArea('Gone Area');

      await app.inject({
        method: 'DELETE',
        url: `/api/areas/${area.id}`,
        headers: { cookie },
      });

      const getResponse = await app.inject({
        method: 'GET',
        url: `/api/areas/${area.id}`,
        headers: { cookie },
      });

      expect(getResponse.statusCode).toBe(404);
    });

    it('returns 404 NOT_FOUND for non-existent area', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/areas/non-existent-id',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 409 AREA_IN_USE when area is referenced by a work item', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const area = createTestArea('WI Referenced Area');
      createTestWorkItem(area.id);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/areas/${area.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('AREA_IN_USE');
    });

    it('returns 409 AREA_IN_USE when area is referenced by a household item', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const area = createTestArea('HI Referenced Area');
      createTestHouseholdItem(area.id);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/areas/${area.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('AREA_IN_USE');
    });

    it('suppresses details in 409 AREA_IN_USE response (suppressDetails=true)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const area = createTestArea('Details Suppressed Area');
      createTestWorkItem(area.id);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/areas/${area.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('AREA_IN_USE');
      expect(body.error.details).toBeUndefined();
    });

    it('returns 409 AREA_IN_USE when descendant is referenced', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const parent = createTestArea('Parent Area');
      const child = createTestArea('Child Area', { parentId: parent.id });
      createTestWorkItem(child.id);

      // Deleting parent should fail because a descendant is in use
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/areas/${parent.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('AREA_IN_USE');
    });

    it('allows member user to delete an area', async () => {
      const { cookie } = await createUserWithSession(
        'member@test.com',
        'Member',
        'password',
        'member',
      );
      const area = createTestArea('Member Delete Area');

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/areas/${area.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(204);
    });
  });
});

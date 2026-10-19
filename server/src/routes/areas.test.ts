import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import type { FastifyInstance } from 'fastify';
import { UNDO_WINDOW_MS } from '@cornerstone/shared';
import type {
  AreaListResponse,
  AreaListWithCountsResponse,
  AreaSingleResponse,
  ApiErrorResponse,
  DeleteAreaResponse,
  UndoResponse,
} from '@cornerstone/shared';
import { eq } from 'drizzle-orm';
import { undoStore } from '../services/undoService.js';
import { areas, workItems, householdItems, photos, diaryEntries } from '../db/schema.js';

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
    describe('include=counts', () => {
      function addDiaryEntry(entryDate: string, status: 'draft' | 'saved' = 'saved'): string {
        const id = `de-${Math.random().toString(36).substring(7)}`;
        const now = new Date().toISOString();
        app.db
          .insert(diaryEntries)
          .values({
            id,
            entryType: 'daily_log',
            entryDate,
            body: 'Note',
            status,
            createdAt: now,
            updatedAt: now,
          })
          .run();
        return id;
      }

      function addPhoto(areaId: string, entityId: string): void {
        const id = `ph-${Math.random().toString(36).substring(7)}`;
        const now = new Date().toISOString();
        app.db
          .insert(photos)
          .values({
            id,
            entityType: 'diary_entry',
            entityId,
            filename: `${id}.jpg`,
            originalFilename: 'p.jpg',
            mimeType: 'image/jpeg',
            fileSize: 10,
            areaId,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }

      it('returns 401 without authentication', async () => {
        const response = await app.inject({ method: 'GET', url: '/api/areas?include=counts' });

        expect(response.statusCode).toBe(401);
      });

      it('adds direct counts to every area', async () => {
        const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
        const kitchen = createTestArea('Kitchen');
        const empty = createTestArea('Empty');
        createTestWorkItem(kitchen.id);
        createTestWorkItem(kitchen.id);
        createTestHouseholdItem(kitchen.id);
        addPhoto(kitchen.id, addDiaryEntry('2026-02-02'));
        addPhoto(kitchen.id, addDiaryEntry('2026-04-04'));
        addPhoto(kitchen.id, addDiaryEntry('2026-12-12', 'draft'));

        const response = await app.inject({
          method: 'GET',
          url: '/api/areas?include=counts',
          headers: { cookie },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json<AreaListWithCountsResponse>();
        const byId = new Map(body.areas.map((a) => [a.id, a.counts]));
        expect(byId.get(kitchen.id)).toEqual({
          workItems: { total: 2, open: 2 },
          householdItems: { total: 1, open: 1 },
          photos: { total: 2, latestDate: '2026-04-04' },
        });
        expect(byId.get(empty.id)).toEqual({
          workItems: { total: 0, open: 0 },
          householdItems: { total: 0, open: 0 },
          photos: { total: 0, latestDate: null },
        });
      });

      it('can be combined with search', async () => {
        const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
        const kitchen = createTestArea('Kitchen');
        createTestArea('Bathroom');
        createTestWorkItem(kitchen.id);

        const response = await app.inject({
          method: 'GET',
          url: '/api/areas?include=counts&search=kitch',
          headers: { cookie },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json<AreaListWithCountsResponse>();
        expect(body.areas.map((a) => a.name)).toEqual(['Kitchen']);
        expect(body.areas[0]!.counts.workItems.total).toBe(1);
      });

      it('returns no counts key without the include parameter', async () => {
        const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
        createTestArea('Kitchen');

        const response = await app.inject({
          method: 'GET',
          url: '/api/areas',
          headers: { cookie },
        });

        expect(response.json<AreaListResponse>().areas[0]).not.toHaveProperty('counts');
      });

      it.each(['subtree', 'COUNTS', 'counts,more', ''])(
        'returns 400 VALIDATION_ERROR for include=%j',
        async (value) => {
          const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

          const response = await app.inject({
            method: 'GET',
            url: `/api/areas?include=${encodeURIComponent(value)}`,
            headers: { cookie },
          });

          expect(response.statusCode).toBe(400);
          expect(response.json<ApiErrorResponse>().error.code).toBe('VALIDATION_ERROR');
        },
      );
    });

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

  // ─── PATCH /api/areas/reorder ──────────────────────────────────────────────

  describe('PATCH /api/areas/reorder', () => {
    function reorder(cookie: string | undefined, payload: unknown) {
      return app.inject({
        method: 'PATCH',
        url: '/api/areas/reorder',
        headers: cookie ? { cookie } : {},
        payload: payload as Record<string, unknown>,
      });
    }

    it('returns 401 without authentication', async () => {
      const response = await reorder(undefined, { parentId: null, ids: ['a'] });

      expect(response.statusCode).toBe(401);
      expect(response.json<ApiErrorResponse>().error.code).toBe('UNAUTHORIZED');
    });

    it('reorders the top level and returns the full list in the new order (200)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const a = createTestArea('A', { sortOrder: 0 });
      const b = createTestArea('B', { sortOrder: 1 });
      const c = createTestArea('C', { sortOrder: 2 });

      const response = await reorder(cookie, { parentId: null, ids: [c.id, a.id, b.id] });

      expect(response.statusCode).toBe(200);
      const body = response.json<AreaListResponse>();
      expect(body.areas.map((x) => x.id)).toEqual([c.id, a.id, b.id]);
      expect(body.areas.map((x) => x.sortOrder)).toEqual([0, 1, 2]);
      expect(body.areas[0]).not.toHaveProperty('counts');
    });

    it('is not shadowed by /:id and persists the order for GET', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const parent = createTestArea('Parent');
      const x = createTestArea('X', { parentId: parent.id, sortOrder: 0 });
      const y = createTestArea('Y', { parentId: parent.id, sortOrder: 1 });

      const response = await reorder(cookie, { parentId: parent.id, ids: [y.id, x.id] });

      expect(response.statusCode).toBe(200);
      const got = await app.inject({
        method: 'GET',
        url: `/api/areas/${y.id}`,
        headers: { cookie },
      });
      expect(got.json<AreaSingleResponse>().area.sortOrder).toBe(0);
    });

    it('returns 400 VALIDATION_ERROR "Parent area does not exist" for an unknown parent', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await reorder(cookie, { parentId: 'nope', ids: ['a'] });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toBe('Parent area does not exist');
    });

    it('returns 409 REORDER_SET_MISMATCH with missingIds and unknownIds', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const a = createTestArea('A');
      const b = createTestArea('B');

      const response = await reorder(cookie, { parentId: null, ids: [a.id, 'ghost'] });

      expect(response.statusCode).toBe(409);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('REORDER_SET_MISMATCH');
      expect(body.error.details).toEqual({ missingIds: [b.id], unknownIds: ['ghost'] });
    });

    it('returns 409 when the ids belong to a different level', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const top = createTestArea('Top');
      const parent = createTestArea('Parent');
      const child = createTestArea('Child', { parentId: parent.id });

      const response = await reorder(cookie, { parentId: parent.id, ids: [child.id, top.id] });

      expect(response.statusCode).toBe(409);
      expect(response.json<ApiErrorResponse>().error.code).toBe('REORDER_SET_MISMATCH');
    });

    it.each([
      ['parentId missing', { ids: ['a'] }],
      ['parentId a number', { parentId: 5, ids: ['a'] }],
      ['parentId longer than 64 characters', { parentId: 'p'.repeat(65), ids: ['a'] }],
      ['ids missing', { parentId: null }],
      ['ids empty', { parentId: null, ids: [] }],
      ['ids duplicated', { parentId: null, ids: ['a', 'a'] }],
      ['an id empty', { parentId: null, ids: [''] }],
      ['an id longer than 64 characters', { parentId: null, ids: ['x'.repeat(65)] }],
    ])('returns 400 VALIDATION_ERROR when %s', async (_label, payload) => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await reorder(cookie, payload);

      expect(response.statusCode).toBe(400);
      expect(response.json<ApiErrorResponse>().error.code).toBe('VALIDATION_ERROR');
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

  describe('append and move (#2218)', () => {
    it('POST without sortOrder appends after the highest sibling', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      createTestArea('First', { sortOrder: 0 });
      createTestArea('Second', { sortOrder: 5 });

      const response = await app.inject({
        method: 'POST',
        url: '/api/areas',
        headers: { cookie },
        payload: { name: 'Third' },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json<AreaSingleResponse>().area.sortOrder).toBe(6);
    });

    it('PATCH of only parentId appends to the new siblings', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const target = createTestArea('Target');
      createTestArea('Existing', { parentId: target.id, sortOrder: 2 });
      const moving = createTestArea('Moving');

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/areas/${moving.id}`,
        headers: { cookie },
        payload: { parentId: target.id },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json<AreaSingleResponse>().area.sortOrder).toBe(3);
    });

    it('PATCH of only parentId onto a same-named sibling is 409 CONFLICT, not a 500', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const target = createTestArea('Target');
      createTestArea('Kitchen', { parentId: target.id });
      const moving = createTestArea('Kitchen');

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/areas/${moving.id}`,
        headers: { cookie },
        payload: { parentId: target.id },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json<ApiErrorResponse>().error.code).toBe('CONFLICT');
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

    it('deletes an area successfully (200 with an undo token)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const area = createTestArea('Delete Me Area');

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/areas/${area.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      expect(Object.keys(response.json<DeleteAreaResponse>())).toEqual(['undo']);
      expect(app.db.select().from(areas).where(eq(areas.id, area.id)).get()).toBeUndefined();
    });

    it('returns an undo token whose expiry is 30 s ahead', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const area = createTestArea('Tokened');

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/areas/${area.id}`,
        headers: { cookie },
      });

      const { undo } = response.json<DeleteAreaResponse>();
      expect(undo.token).toMatch(/^u_[0-9a-f]{32}$/);
      const ttl = new Date(undo.expiresAt).getTime() - Date.now();
      expect(ttl).toBeGreaterThan(UNDO_WINDOW_MS - 5000);
      expect(ttl).toBeLessThanOrEqual(UNDO_WINDOW_MS);
    });

    it('does not issue a token when the delete is blocked (409 AREA_IN_USE)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const area = createTestArea('Busy');
      createTestWorkItem(area.id);
      const before = undoStore.snapshots.size;

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/areas/${area.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json<ApiErrorResponse>().error.code).toBe('AREA_IN_USE');
      expect(response.json<ApiErrorResponse>().error.details).toBeUndefined();
      expect(undoStore.snapshots.size).toBe(before);
    });

    it('Undo (POST /api/undo/:token) brings back the subtree and its photos', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const parent = createTestArea('Ground floor');
      const child = createTestArea('Kitchen', { parentId: parent.id, sortOrder: 3 });
      const photoId = `ph-${Math.random().toString(36).substring(7)}`;
      const now = new Date().toISOString();
      app.db
        .insert(photos)
        .values({
          id: photoId,
          entityType: 'diary_entry',
          entityId: 'e1',
          filename: 'p.jpg',
          originalFilename: 'p.jpg',
          mimeType: 'image/jpeg',
          fileSize: 1,
          areaId: child.id,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      const del = await app.inject({
        method: 'DELETE',
        url: `/api/areas/${parent.id}`,
        headers: { cookie },
      });
      const { undo } = del.json<DeleteAreaResponse>();

      const res = await app.inject({
        method: 'POST',
        url: `/api/undo/${undo.token}`,
        headers: { cookie },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json<UndoResponse>()).toEqual({
        restored: [{ type: 'area', id: parent.id }],
        retractedEventIds: [],
      });
      const list = await app.inject({ method: 'GET', url: '/api/areas', headers: { cookie } });
      const restored = list.json<AreaListResponse>().areas;
      expect(restored.map((a) => a.id).sort()).toEqual([parent.id, child.id].sort());
      expect(restored.find((a) => a.id === child.id)!.sortOrder).toBe(3);
      expect(app.db.select().from(photos).where(eq(photos.id, photoId)).get()!.areaId).toBe(
        child.id,
      );
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

      expect(response.statusCode).toBe(200);
      expect(response.json<DeleteAreaResponse>().undo.token).toMatch(/^u_/);
    });
  });
});

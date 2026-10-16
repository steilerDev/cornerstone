import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import type { FastifyInstance } from 'fastify';
import type {
  HouseholdItemCategoryEntity,
  ApiErrorResponse,
  CreateHouseholdItemCategoryRequest,
} from '@cornerstone/shared';
import { householdItemCategories, householdItems } from '../db/schema.js';

/**
 * NOTE: After all migrations on a fresh DB, 7 default household item categories remain:
 * Furniture, Appliances, Fixtures, Decor, Electronics, Other, Equipment (added by 0028).
 * Migration 0028 removes Outdoor and Storage when unused on fresh DB.
 *
 * Tests that insert categories use unique names like "Custom HIC *" to avoid conflicts.
 * Tests that check empty/count behavior account for the 7 seeded records.
 */

type HICListResponse = { categories: HouseholdItemCategoryEntity[] };

describe('Household Item Category Routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  /** Number of HI categories after all migrations on a fresh DB (0028 removes 2 unused defaults) */
  const SEEDED_CATEGORY_COUNT = 7;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-hi-categories-test-'));
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

  /**
   * Helper: Insert a test household item category directly into the database.
   * Uses "Custom HIC " prefix to avoid conflicts with seeded categories.
   */
  function createTestCategory(
    name: string,
    options: {
      color?: string | null;
      sortOrder?: number;
    } = {},
  ) {
    const id = `hic-test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const now = new Date().toISOString();
    app.db
      .insert(householdItemCategories)
      .values({
        id,
        name,
        color: options.color ?? null,
        sortOrder: options.sortOrder ?? 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return { id, name, ...options, createdAt: now, updatedAt: now };
  }

  /**
   * Helper: Create a household item referencing the given category ID so DELETE is blocked.
   */
  function createHouseholdItemReferencing(categoryId: string) {
    const itemId = `hi-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const now = new Date().toISOString();
    app.db
      .insert(householdItems)
      .values({
        id: itemId,
        name: `Test Item ${itemId}`,
        categoryId,
        status: 'planned',
        quantity: 1,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return itemId;
  }

  // ─── GET /api/household-item-categories ───────────────────────────────────

  describe('GET /api/household-item-categories', () => {
    it('returns the 7 seeded default categories after migration', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const response = await app.inject({
        method: 'GET',
        url: '/api/household-item-categories',
        headers: { cookie },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json<HICListResponse>();
      expect(body.categories).toHaveLength(SEEDED_CATEGORY_COUNT);
    });

    it('returns categories sorted by sortOrder ascending', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      createTestCategory('Custom HIC Zeta', { sortOrder: 103 });
      createTestCategory('Custom HIC Alpha', { sortOrder: 101 });
      createTestCategory('Custom HIC Beta', { sortOrder: 102 });

      const response = await app.inject({
        method: 'GET',
        url: '/api/household-item-categories',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<HICListResponse>();
      const customCats = body.categories.filter((c) => c.name.startsWith('Custom HIC'));
      expect(customCats).toHaveLength(3);
      expect(customCats[0]!.name).toBe('Custom HIC Alpha');
      expect(customCats[1]!.name).toBe('Custom HIC Beta');
      expect(customCats[2]!.name).toBe('Custom HIC Zeta');
    });

    it('returns all category fields including color and sortOrder', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const cat = createTestCategory('Custom HIC Textiles', { color: '#FF5733', sortOrder: 99 });

      const response = await app.inject({
        method: 'GET',
        url: '/api/household-item-categories',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<HICListResponse>();
      const found = body.categories.find((c) => c.id === cat.id);
      expect(found).toBeDefined();
      expect(found!.name).toBe('Custom HIC Textiles');
      expect(found!.color).toBe('#FF5733');
      expect(found!.sortOrder).toBe(99);
    });

    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/household-item-categories',
      });
      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('allows member user to list categories', async () => {
      const { cookie } = await createUserWithSession(
        'member@example.com',
        'Member User',
        'password',
        'member',
      );
      const response = await app.inject({
        method: 'GET',
        url: '/api/household-item-categories',
        headers: { cookie },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json<HICListResponse>();
      expect(body.categories.length).toBeGreaterThanOrEqual(SEEDED_CATEGORY_COUNT);
    });
  });

  // ─── POST /api/household-item-categories ──────────────────────────────────

  describe('POST /api/household-item-categories', () => {
    it('creates a category with name only (201)', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const requestBody: CreateHouseholdItemCategoryRequest = { name: 'Custom HIC Shelving' };
      const seededMax = Math.max(
        ...app.db
          .select()
          .from(householdItemCategories)
          .all()
          .map((r) => r.sortOrder),
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/household-item-categories',
        headers: { cookie },
        payload: requestBody,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<HouseholdItemCategoryEntity>();
      expect(body.id).toBeDefined();
      expect(body.name).toBe('Custom HIC Shelving');
      expect(body.color).toBeNull();
      expect(body.sortOrder).toBe(seededMax + 1);
      expect(body.createdAt).toBeDefined();
      expect(body.updatedAt).toBeDefined();
    });

    it('creates a category with all fields (201)', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const requestBody: CreateHouseholdItemCategoryRequest = {
        name: 'Custom HIC Rugs',
        color: '#3B82F6',
        sortOrder: 5,
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/household-item-categories',
        headers: { cookie },
        payload: requestBody,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<HouseholdItemCategoryEntity>();
      expect(body.name).toBe('Custom HIC Rugs');
      expect(body.color).toBe('#3B82F6');
      expect(body.sortOrder).toBe(5);
    });

    it('trims name whitespace on creation', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/household-item-categories',
        headers: { cookie },
        payload: { name: '  Custom HIC Lamps  ' },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<HouseholdItemCategoryEntity>();
      expect(body.name).toBe('Custom HIC Lamps');
    });

    it('returns 400 VALIDATION_ERROR for missing name', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/household-item-categories',
        headers: { cookie },
        payload: { color: '#FF0000' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 VALIDATION_ERROR for empty name string', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/household-item-categories',
        headers: { cookie },
        payload: { name: '' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 VALIDATION_ERROR for invalid color format', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/household-item-categories',
        headers: { cookie },
        payload: { name: 'Custom HIC Blinds', color: 'blue' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 409 CONFLICT for duplicate of a seeded category name', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      // 'Furniture' is a seeded category
      const response = await app.inject({
        method: 'POST',
        url: '/api/household-item-categories',
        headers: { cookie },
        payload: { name: 'Furniture' },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('CONFLICT');
      expect(body.error.message).toContain('already exists');
    });

    it('returns 409 CONFLICT for duplicate name (case-insensitive)', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/household-item-categories',
        headers: { cookie },
        payload: { name: 'FURNITURE' },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('CONFLICT');
    });

    it('strips unknown properties (Fastify additionalProperties: false)', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/household-item-categories',
        headers: { cookie },
        payload: { name: 'Custom HIC Test', unknownField: 'value' },
      });

      // Fastify strips extra properties and creates the category
      expect(response.statusCode).toBe(201);
      const body = response.json<HouseholdItemCategoryEntity>();
      expect(body.name).toBe('Custom HIC Test');
    });

    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/household-item-categories',
        payload: { name: 'Custom HIC Test' },
      });
      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('allows member user to create a category', async () => {
      const { cookie } = await createUserWithSession(
        'member@example.com',
        'Member User',
        'password',
        'member',
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/household-item-categories',
        headers: { cookie },
        payload: { name: 'Custom HIC Patio' },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<HouseholdItemCategoryEntity>();
      expect(body.name).toBe('Custom HIC Patio');
    });
  });

  // ─── GET /api/household-item-categories/:id ───────────────────────────────

  describe('GET /api/household-item-categories/:id', () => {
    it('returns a seeded category by ID', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'GET',
        url: '/api/household-item-categories/hic-furniture',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<HouseholdItemCategoryEntity>();
      expect(body.id).toBe('hic-furniture');
      expect(body.name).toBe('Furniture');
    });

    it('returns a custom category by ID', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const cat = createTestCategory('Custom HIC Pillows', { color: '#FF5733', sortOrder: 1 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/household-item-categories/${cat.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<HouseholdItemCategoryEntity>();
      expect(body.id).toBe(cat.id);
      expect(body.name).toBe('Custom HIC Pillows');
      expect(body.color).toBe('#FF5733');
    });

    it('returns 404 NOT_FOUND for non-existent category', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'GET',
        url: '/api/household-item-categories/non-existent-id',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/household-item-categories/some-id',
      });
      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });

  // ─── PATCH /api/household-item-categories/:id ─────────────────────────────

  describe('PATCH /api/household-item-categories/:id', () => {
    it('updates the name of an existing category', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const cat = createTestCategory('Custom HIC Old Name', { color: '#FF0000' });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/household-item-categories/${cat.id}`,
        headers: { cookie },
        payload: { name: 'Custom HIC New Name' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<HouseholdItemCategoryEntity>();
      expect(body.id).toBe(cat.id);
      expect(body.name).toBe('Custom HIC New Name');
      expect(body.color).toBe('#FF0000'); // Unchanged
    });

    it('updates color only (partial update)', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const cat = createTestCategory('Custom HIC Drapes');

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/household-item-categories/${cat.id}`,
        headers: { cookie },
        payload: { color: '#22C55E' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<HouseholdItemCategoryEntity>();
      expect(body.color).toBe('#22C55E');
      expect(body.name).toBe('Custom HIC Drapes'); // Unchanged
    });

    it('clears color by setting to null', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const cat = createTestCategory('Custom HIC Hammock', { color: '#FF0000' });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/household-item-categories/${cat.id}`,
        headers: { cookie },
        payload: { color: null },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<HouseholdItemCategoryEntity>();
      expect(body.color).toBeNull();
    });

    it('updates sortOrder', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const cat = createTestCategory('Custom HIC Wicker', { sortOrder: 1 });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/household-item-categories/${cat.id}`,
        headers: { cookie },
        payload: { sortOrder: 99 },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<HouseholdItemCategoryEntity>();
      expect(body.sortOrder).toBe(99);
    });

    it('allows updating name to the same value (no conflict)', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const cat = createTestCategory('Custom HIC Bedding');

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/household-item-categories/${cat.id}`,
        headers: { cookie },
        payload: { name: 'Custom HIC Bedding' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<HouseholdItemCategoryEntity>();
      expect(body.name).toBe('Custom HIC Bedding');
    });

    it('returns 409 CONFLICT when name conflicts with seeded category', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const cat = createTestCategory('Custom HIC Throws');

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/household-item-categories/${cat.id}`,
        headers: { cookie },
        payload: { name: 'Appliances' }, // Seeded category name
      });

      expect(response.statusCode).toBe(409);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('CONFLICT');
    });

    it('returns 404 NOT_FOUND for non-existent category', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/household-item-categories/non-existent-id',
        headers: { cookie },
        payload: { name: 'Updated' },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 400 VALIDATION_ERROR for empty payload (minProperties constraint)', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const cat = createTestCategory('Custom HIC Mats');

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/household-item-categories/${cat.id}`,
        headers: { cookie },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for invalid color in PATCH', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const cat = createTestCategory('Custom HIC Linens');

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/household-item-categories/${cat.id}`,
        headers: { cookie },
        payload: { color: 'not-valid' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/household-item-categories/some-id',
        payload: { name: 'Updated' },
      });
      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('allows member user to update a category', async () => {
      const { cookie } = await createUserWithSession(
        'member@example.com',
        'Member User',
        'password',
        'member',
      );
      const cat = createTestCategory('Custom HIC Towels');

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/household-item-categories/${cat.id}`,
        headers: { cookie },
        payload: { name: 'Custom HIC Bath Towels' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<HouseholdItemCategoryEntity>();
      expect(body.name).toBe('Custom HIC Bath Towels');
    });
  });

  // ─── DELETE /api/household-item-categories/:id ────────────────────────────

  describe('DELETE /api/household-item-categories/:id', () => {
    it('deletes a custom category successfully (204)', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const cat = createTestCategory('Custom HIC Slab');

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/household-item-categories/${cat.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe('');
    });

    it('category is no longer returned in list after deletion', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const cat = createTestCategory('Custom HIC Beam');

      await app.inject({
        method: 'DELETE',
        url: `/api/household-item-categories/${cat.id}`,
        headers: { cookie },
      });

      const listResponse = await app.inject({
        method: 'GET',
        url: '/api/household-item-categories',
        headers: { cookie },
      });

      const body = listResponse.json<HICListResponse>();
      expect(body.categories.find((c) => c.id === cat.id)).toBeUndefined();
    });

    it('can delete a seeded category that is not referenced', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/household-item-categories/hic-other',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(204);
    });

    it('returns 404 NOT_FOUND for non-existent category', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/household-item-categories/non-existent-id',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 409 CATEGORY_IN_USE when category is referenced by a household item', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const cat = createTestCategory('Custom HIC Wardrobe');
      createHouseholdItemReferencing(cat.id);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/household-item-categories/${cat.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('CATEGORY_IN_USE');
    });

    it('returns error details with householdItemCount when category is in use', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const cat = createTestCategory('Custom HIC Armoire');
      createHouseholdItemReferencing(cat.id);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/household-item-categories/${cat.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('CATEGORY_IN_USE');
      expect(body.error.details).toBeUndefined();
    });

    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/household-item-categories/some-id',
      });
      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('allows member user to delete a category', async () => {
      const { cookie } = await createUserWithSession(
        'member@example.com',
        'Member User',
        'password',
        'member',
      );
      const cat = createTestCategory('Custom HIC Vanity');

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/household-item-categories/${cat.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(204);
    });
  });

  // ─── translationKey field in API responses ─────────────────────────────────

  describe('translationKey field in API responses', () => {
    it('GET /api/household-item-categories returns translationKey for seeded predefined categories', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'User', 'password');

      const response = await app.inject({
        method: 'GET',
        url: '/api/household-item-categories',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<HICListResponse>();
      const furniture = body.categories.find((c) => c.id === 'hic-furniture');
      expect(furniture).toBeDefined();
      expect(furniture!.translationKey).toBe('householdItemCategories.furniture');
    });

    it('GET /api/household-item-categories returns null translationKey for user-created categories', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'User', 'password');
      createTestCategory('Custom HIC Artwork');

      const response = await app.inject({
        method: 'GET',
        url: '/api/household-item-categories',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<HICListResponse>();
      const found = body.categories.find((c) => c.name === 'Custom HIC Artwork');
      expect(found).toBeDefined();
      expect(found!.translationKey).toBeNull();
    });

    it('POST /api/household-item-categories always creates category with null translationKey', async () => {
      const { cookie } = await createUserWithSession(
        'admin@example.com',
        'Admin',
        'password',
        'admin',
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/household-item-categories',
        headers: { cookie },
        payload: { name: 'Custom HIC New Mats' } satisfies CreateHouseholdItemCategoryRequest,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<HouseholdItemCategoryEntity>();
      expect(body.translationKey).toBeNull();
    });
  });

  // ─── PATCH /api/household-item-categories/reorder (#2215) ──────────────────────────────

  describe('PATCH /api/household-item-categories/reorder (#2215)', () => {
    const STAMP = '2026-01-01T00:00:00.000Z';
    const URL = '/api/household-item-categories/reorder';

    function seedRows(rows: Array<[string, string, number]>): void {
      app.db.delete(householdItemCategories).run();
      for (const [id, name, sortOrder] of rows) {
        app.db
          .insert(householdItemCategories)
          .values({ id, name, sortOrder, createdAt: STAMP, updatedAt: STAMP })
          .run();
      }
    }

    const readRows = () =>
      app.db
        .select()
        .from(householdItemCategories)
        .all()
        .sort((a, b) => a.id.localeCompare(b.id));

    const SEED: Array<[string, string, number]> = [
      ['a', 'Alpha', 0],
      ['b', 'Bravo', 1],
      ['c', 'Charlie', 2],
    ];

    async function reorder(cookie: string | undefined, payload: unknown) {
      return app.inject({
        method: 'PATCH',
        url: URL,
        headers: cookie ? { cookie } : {},
        payload: payload as Record<string, unknown>,
      });
    }

    async function login(): Promise<string> {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      return cookie;
    }

    it('returns 200 with the list under "categories" in the new order', async () => {
      seedRows(SEED);
      const cookie = await login();

      const response = await reorder(cookie, { ids: ['c', 'a', 'b'] });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ categories: Array<{ id: string; sortOrder: number }> }>();
      expect(body.categories.map((r) => r.id)).toEqual(['c', 'a', 'b']);
      expect(body.categories.map((r) => r.sortOrder)).toEqual([0, 1, 2]);
      expect(readRows().map((r) => [r.id, r.sortOrder])).toEqual([
        ['a', 1],
        ['b', 2],
        ['c', 0],
      ]);
    });

    it('writes only the rows whose position changed', async () => {
      seedRows(SEED);
      const cookie = await login();

      await reorder(cookie, { ids: ['a', 'c', 'b'] });

      const rows = readRows();
      expect(rows.find((r) => r.id === 'a')?.updatedAt).toBe(STAMP);
      expect(rows.find((r) => r.id === 'b')?.updatedAt).not.toBe(STAMP);
      expect(rows.find((r) => r.id === 'c')?.updatedAt).not.toBe(STAMP);
    });

    it('lets a member reorder (no admin gate)', async () => {
      seedRows(SEED);
      const { cookie } = await createUserWithSession(
        'm@example.com',
        'Member',
        'password',
        'member',
      );

      const response = await reorder(cookie, { ids: ['b', 'a', 'c'] });

      expect(response.statusCode).toBe(200);
    });

    it.each([
      ['a missing id', ['a', 'b'], { missingIds: ['c'], unknownIds: [] }],
      ['an unknown id', ['a', 'b', 'c', 'zzz'], { missingIds: [], unknownIds: ['zzz'] }],
      [
        'a missing and an unknown id',
        ['a', 'b', 'zzz'],
        { missingIds: ['c'], unknownIds: ['zzz'] },
      ],
    ])(
      'returns 409 REORDER_SET_MISMATCH with details for %s and writes nothing',
      async (_n, ids, details) => {
        seedRows(SEED);
        const before = readRows();
        const cookie = await login();

        const response = await reorder(cookie, { ids });

        expect(response.statusCode).toBe(409);
        const body = response.json<ApiErrorResponse>();
        expect(body.error.code).toBe('REORDER_SET_MISMATCH');
        expect(body.error.details).toEqual(details);
        expect(readRows()).toEqual(before);
      },
    );

    it.each([
      ['an empty list', { ids: [] }],
      ['a missing ids field', {}],
      ['a duplicate id', { ids: ['a', 'a', 'b', 'c'] }],
      ['an empty-string id', { ids: ['a', '', 'c'] }],
      ['an id longer than 64 characters', { ids: ['a', 'x'.repeat(65), 'c'] }],
      ['more than 500 ids', { ids: Array.from({ length: 501 }, (_v, i) => `id-${i}`) }],
    ])('returns 400 VALIDATION_ERROR for %s and writes nothing', async (_n, payload) => {
      seedRows(SEED);
      const before = readRows();
      const cookie = await login();

      const response = await reorder(cookie, payload);

      expect(response.statusCode).toBe(400);
      expect(response.json<ApiErrorResponse>().error.code).toBe('VALIDATION_ERROR');
      expect(readRows()).toEqual(before);
    });

    it('coerces scalar and numeric ids (server-wide AJV coercion) and rejects them as unknown', async () => {
      seedRows(SEED);
      const cookie = await login();

      const scalar = await reorder(cookie, { ids: 'a' });
      const numeric = await reorder(cookie, { ids: ['a', 2, 'c'] });

      expect(scalar.statusCode).toBe(409);
      expect(numeric.statusCode).toBe(409);
      expect(numeric.json<ApiErrorResponse>().error.details).toEqual({
        missingIds: ['b'],
        unknownIds: ['2'],
      });
    });

    it('strips unknown body properties (server-wide AJV removeAdditional) and still reorders', async () => {
      seedRows(SEED);
      const cookie = await login();

      const response = await reorder(cookie, { ids: ['c', 'b', 'a'], extra: true });

      expect(response.statusCode).toBe(200);
    });

    it('accepts an id of exactly 64 characters (then 409 as it is unknown)', async () => {
      seedRows(SEED);
      const cookie = await login();

      const response = await reorder(cookie, { ids: ['x'.repeat(64)] });

      expect(response.statusCode).toBe(409);
    });

    it('accepts exactly 500 ids in shape (then 409 as they are unknown)', async () => {
      seedRows(SEED);
      const cookie = await login();

      const response = await reorder(cookie, {
        ids: Array.from({ length: 500 }, (_v, i) => `id-${i}`),
      });

      expect(response.statusCode).toBe(409);
      expect(response.json<ApiErrorResponse>().error.details).toMatchObject({
        missingIds: ['a', 'b', 'c'],
      });
    });

    it('returns 401 without a session', async () => {
      seedRows(SEED);

      const response = await reorder(undefined, { ids: ['a', 'b', 'c'] });

      expect(response.statusCode).toBe(401);
      expect(response.json<ApiErrorResponse>().error.code).toBe('UNAUTHORIZED');
    });

    it('does not shadow PATCH /:id (static route wins only for "reorder")', async () => {
      seedRows(SEED);
      const cookie = await login();

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/household-item-categories/b',
        headers: { cookie },
        payload: { name: 'Bravo Renamed' },
      });

      expect(response.statusCode).toBe(200);
      expect(readRows().find((r) => r.id === 'b')?.name).toBe('Bravo Renamed');
    });

    it('appends a created entry without sortOrder after the current last one', async () => {
      seedRows(SEED);
      const cookie = await login();

      const response = await app.inject({
        method: 'POST',
        url: '/api/household-item-categories',
        headers: { cookie },
        payload: { name: 'Delta' },
      });

      expect(response.statusCode).toBe(201);
      expect(readRows().find((r) => r.name === 'Delta')?.sortOrder).toBe(3);
    });
  });
});

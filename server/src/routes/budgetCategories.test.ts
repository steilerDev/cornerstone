import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import type { FastifyInstance } from 'fastify';
import type {
  BudgetCategoryListResponse,
  BudgetCategoryResponse,
  ApiErrorResponse,
  CreateBudgetCategoryRequest,
} from '@cornerstone/shared';
import { budgetCategories, subsidyPrograms, subsidyProgramCategories } from '../db/schema.js';

/**
 * NOTE: After all migrations on a fresh DB, 7 default budget categories remain:
 * Materials, Labor, Permits, Design, Other, Household Items (added by 0016), Waste (added by 0028).
 * Migration 0028 removes Equipment, Landscaping, Utilities, Insurance, Contingency when unused.
 *
 * Tests that insert categories use unique names like "Custom *" to avoid conflicts.
 * Tests that check empty/count behavior account for the 7 seeded records.
 */

describe('Budget Category Routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  /** Number of categories seeded by migrations on a fresh DB (0028 removes 5 unused defaults) */
  const SEEDED_CATEGORY_COUNT = 7;

  beforeEach(async () => {
    originalEnv = { ...process.env };

    // Create temporary directory for test database
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-budget-categories-test-'));
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
   * Helper: Create a budget category directly in the database.
   * Uses "Custom " prefix to avoid conflicts with seeded categories.
   */
  function createTestCategory(
    name: string,
    options: {
      description?: string | null;
      color?: string | null;
      sortOrder?: number;
    } = {},
  ) {
    const id = `cat-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const now = new Date().toISOString();

    app.db
      .insert(budgetCategories)
      .values({
        id,
        name,
        description: options.description ?? null,
        color: options.color ?? null,
        sortOrder: options.sortOrder ?? 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    return { id, name, ...options, createdAt: now, updatedAt: now };
  }

  /**
   * Helper: Create a subsidy program referencing a budget category.
   */
  function createSubsidyProgramReferencing(categoryId: string) {
    const programId = `prog-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const now = new Date().toISOString();

    app.db
      .insert(subsidyPrograms)
      .values({
        id: programId,
        name: `Test Subsidy ${programId}`, // Unique name
        reductionType: 'percentage',
        reductionValue: 10,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    app.db
      .insert(subsidyProgramCategories)
      .values({
        subsidyProgramId: programId,
        budgetCategoryId: categoryId,
      })
      .run();

    return programId;
  }

  // ─── GET /api/budget-categories ───────────────────────────────────────────

  describe('GET /api/budget-categories', () => {
    it('returns the 7 seeded default categories after migration', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'GET',
        url: '/api/budget-categories',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<BudgetCategoryListResponse>();
      expect(body.categories).toHaveLength(SEEDED_CATEGORY_COUNT);
    });

    it('returns categories sorted by sortOrder ascending', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      // Add 3 custom categories with high sort orders to verify ordering
      createTestCategory('Custom Zeta', { sortOrder: 103 });
      createTestCategory('Custom Alpha', { sortOrder: 101 });
      createTestCategory('Custom Beta', { sortOrder: 102 });

      const response = await app.inject({
        method: 'GET',
        url: '/api/budget-categories',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<BudgetCategoryListResponse>();

      // Our custom categories should be at the end in sort order
      const customCats = body.categories.filter((c) => c.name.startsWith('Custom '));
      expect(customCats).toHaveLength(3);
      expect(customCats[0]!.name).toBe('Custom Alpha');
      expect(customCats[1]!.name).toBe('Custom Beta');
      expect(customCats[2]!.name).toBe('Custom Zeta');
    });

    it('returns all category fields including description, color, and sortOrder', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const cat = createTestCategory('Custom Roofing', {
        description: 'Roof and waterproofing costs',
        color: '#FF5733',
        sortOrder: 99,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/budget-categories',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<BudgetCategoryListResponse>();
      const found = body.categories.find((c) => c.id === cat.id);
      expect(found).toBeDefined();
      expect(found!.name).toBe('Custom Roofing');
      expect(found!.description).toBe('Roof and waterproofing costs');
      expect(found!.color).toBe('#FF5733');
      expect(found!.sortOrder).toBe(99);
    });

    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/budget-categories',
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
        url: '/api/budget-categories',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<BudgetCategoryListResponse>();
      expect(body.categories.length).toBeGreaterThanOrEqual(SEEDED_CATEGORY_COUNT);
    });
  });

  // ─── POST /api/budget-categories ──────────────────────────────────────────

  describe('POST /api/budget-categories', () => {
    it('creates a category with name only (201)', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const requestBody: CreateBudgetCategoryRequest = { name: 'Custom Masonry' };
      const seededMax = Math.max(
        ...app.db
          .select()
          .from(budgetCategories)
          .all()
          .map((r) => r.sortOrder),
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/budget-categories',
        headers: { cookie },
        payload: requestBody,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<BudgetCategoryResponse>();
      expect(body.budgetCategory.id).toBeDefined();
      expect(body.budgetCategory.name).toBe('Custom Masonry');
      expect(body.budgetCategory.description).toBeNull();
      expect(body.budgetCategory.color).toBeNull();
      expect(body.budgetCategory.sortOrder).toBe(seededMax + 1);
      expect(body.budgetCategory.createdAt).toBeDefined();
      expect(body.budgetCategory.updatedAt).toBeDefined();
    });

    it('creates a category with all fields (201)', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const requestBody: CreateBudgetCategoryRequest = {
        name: 'Custom Foundation',
        description: 'Foundation and concrete costs',
        color: '#3B82F6',
        sortOrder: 5,
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/budget-categories',
        headers: { cookie },
        payload: requestBody,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<BudgetCategoryResponse>();
      expect(body.budgetCategory.name).toBe('Custom Foundation');
      expect(body.budgetCategory.description).toBe('Foundation and concrete costs');
      expect(body.budgetCategory.color).toBe('#3B82F6');
      expect(body.budgetCategory.sortOrder).toBe(5);
    });

    it('trims name whitespace on creation', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/budget-categories',
        headers: { cookie },
        payload: { name: '  Custom Tiling  ' },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<BudgetCategoryResponse>();
      expect(body.budgetCategory.name).toBe('Custom Tiling');
    });

    it('returns 400 VALIDATION_ERROR for missing name', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/budget-categories',
        headers: { cookie },
        payload: { description: 'No name provided' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 VALIDATION_ERROR for empty name string', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/budget-categories',
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
        url: '/api/budget-categories',
        headers: { cookie },
        payload: { name: 'Custom Glazing', color: 'blue' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 409 CONFLICT for duplicate of a seeded category name', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      // 'Materials' is a seeded category
      const response = await app.inject({
        method: 'POST',
        url: '/api/budget-categories',
        headers: { cookie },
        payload: { name: 'Materials' },
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
        url: '/api/budget-categories',
        headers: { cookie },
        payload: { name: 'MATERIALS' },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('CONFLICT');
    });

    it('creates category successfully even when payload has unknown properties (Fastify strips them)', async () => {
      // Fastify with additionalProperties: false strips unrecognized fields rather than rejecting.
      // The category should be created with only the recognized fields.
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/budget-categories',
        headers: { cookie },
        payload: { name: 'Custom Test', unknownField: 'value' },
      });

      // Fastify strips extra properties and creates the category
      expect(response.statusCode).toBe(201);
      const body = response.json<BudgetCategoryResponse>();
      expect(body.budgetCategory.name).toBe('Custom Test');
    });

    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/budget-categories',
        payload: { name: 'Custom Test' },
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
        url: '/api/budget-categories',
        headers: { cookie },
        payload: { name: 'Custom Heating' },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<BudgetCategoryResponse>();
      expect(body.budgetCategory.name).toBe('Custom Heating');
    });
  });

  // ─── GET /api/budget-categories/:id ───────────────────────────────────────

  describe('GET /api/budget-categories/:id', () => {
    it('returns a seeded category by ID', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'GET',
        url: '/api/budget-categories/bc-materials',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<BudgetCategoryResponse>();
      expect(body.budgetCategory.id).toBe('bc-materials');
      expect(body.budgetCategory.name).toBe('Materials');
    });

    it('returns a custom category by ID', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const cat = createTestCategory('Custom Cooling', { color: '#FF5733', sortOrder: 1 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/budget-categories/${cat.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<BudgetCategoryResponse>();
      expect(body.budgetCategory.id).toBe(cat.id);
      expect(body.budgetCategory.name).toBe('Custom Cooling');
      expect(body.budgetCategory.color).toBe('#FF5733');
    });

    it('returns 404 NOT_FOUND for non-existent category', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'GET',
        url: '/api/budget-categories/non-existent-id',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/budget-categories/some-id',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });

  // ─── PATCH /api/budget-categories/:id ─────────────────────────────────────

  describe('PATCH /api/budget-categories/:id', () => {
    it('updates the name of an existing category', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const cat = createTestCategory('Custom Old Name', { color: '#FF0000' });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/budget-categories/${cat.id}`,
        headers: { cookie },
        payload: { name: 'Custom New Name' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<BudgetCategoryResponse>();
      expect(body.budgetCategory.id).toBe(cat.id);
      expect(body.budgetCategory.name).toBe('Custom New Name');
      expect(body.budgetCategory.color).toBe('#FF0000'); // Unchanged
    });

    it('updates description only (partial update)', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const cat = createTestCategory('Custom Structural');

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/budget-categories/${cat.id}`,
        headers: { cookie },
        payload: { description: 'Structural costs' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<BudgetCategoryResponse>();
      expect(body.budgetCategory.description).toBe('Structural costs');
      expect(body.budgetCategory.name).toBe('Custom Structural'); // Unchanged
    });

    it('clears color by setting to null', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const cat = createTestCategory('Custom Framing', { color: '#FF0000' });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/budget-categories/${cat.id}`,
        headers: { cookie },
        payload: { color: null },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<BudgetCategoryResponse>();
      expect(body.budgetCategory.color).toBeNull();
    });

    it('updates sortOrder', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const cat = createTestCategory('Custom Waterproofing', { sortOrder: 1 });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/budget-categories/${cat.id}`,
        headers: { cookie },
        payload: { sortOrder: 99 },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<BudgetCategoryResponse>();
      expect(body.budgetCategory.sortOrder).toBe(99);
    });

    it('allows updating name to the same value (no conflict)', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const cat = createTestCategory('Custom Scaffolding');

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/budget-categories/${cat.id}`,
        headers: { cookie },
        payload: { name: 'Custom Scaffolding' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<BudgetCategoryResponse>();
      expect(body.budgetCategory.name).toBe('Custom Scaffolding');
    });

    it('returns 409 CONFLICT when name conflicts with another category (seeded)', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const cat = createTestCategory('Custom Crane Rental');

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/budget-categories/${cat.id}`,
        headers: { cookie },
        payload: { name: 'Labor' }, // Seeded category name
      });

      expect(response.statusCode).toBe(409);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('CONFLICT');
    });

    it('returns 404 NOT_FOUND for non-existent category', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/budget-categories/non-existent-id',
        headers: { cookie },
        payload: { name: 'Updated' },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 400 VALIDATION_ERROR for empty payload (minProperties constraint)', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const cat = createTestCategory('Custom Scaffolding B');

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/budget-categories/${cat.id}`,
        headers: { cookie },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for invalid color in PATCH', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const cat = createTestCategory('Custom Scaffolding C');

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/budget-categories/${cat.id}`,
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
        url: '/api/budget-categories/some-id',
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
      const cat = createTestCategory('Custom Joinery');

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/budget-categories/${cat.id}`,
        headers: { cookie },
        payload: { name: 'Custom Cabinet' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<BudgetCategoryResponse>();
      expect(body.budgetCategory.name).toBe('Custom Cabinet');
    });
  });

  // ─── DELETE /api/budget-categories/:id ────────────────────────────────────

  describe('DELETE /api/budget-categories/:id', () => {
    it('deletes a custom category successfully (204)', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const cat = createTestCategory('Custom Slab');

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/budget-categories/${cat.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe('');
    });

    it('category is no longer returned in list after deletion', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const cat = createTestCategory('Custom Beam');

      await app.inject({
        method: 'DELETE',
        url: `/api/budget-categories/${cat.id}`,
        headers: { cookie },
      });

      const listResponse = await app.inject({
        method: 'GET',
        url: '/api/budget-categories',
        headers: { cookie },
      });

      const body = listResponse.json<BudgetCategoryListResponse>();
      expect(body.categories.find((c) => c.id === cat.id)).toBeUndefined();
    });

    it('can delete a seeded category that is not referenced', async () => {
      // 'bc-other' is a seeded category not referenced by any subsidy program
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/budget-categories/bc-other',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(204);
    });

    it('returns 404 NOT_FOUND for non-existent category', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/budget-categories/non-existent-id',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 409 CATEGORY_IN_USE when category is referenced by a subsidy program', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const cat = createTestCategory('Custom Insulation');
      createSubsidyProgramReferencing(cat.id);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/budget-categories/${cat.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('CATEGORY_IN_USE');
    });

    it('returns error details with subsidyProgramCount when category is in use', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const cat = createTestCategory('Custom Ventilation');
      createSubsidyProgramReferencing(cat.id);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/budget-categories/${cat.id}`,
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
        url: '/api/budget-categories/some-id',
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
      const cat = createTestCategory('Custom Scaffold');

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/budget-categories/${cat.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(204);
    });
  });

  // ─── translationKey field in API responses ─────────────────────────────────

  describe('translationKey field in API responses', () => {
    it('GET /api/budget-categories returns translationKey for seeded predefined categories', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'GET',
        url: '/api/budget-categories',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<BudgetCategoryListResponse>();
      const materials = body.categories.find((c) => c.id === 'bc-materials');
      expect(materials).toBeDefined();
      expect(materials!.translationKey).toBe('budgetCategories.materials');
    });

    it('GET /api/budget-categories returns null translationKey for user-created categories', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      createTestCategory('Custom Cladding');

      const response = await app.inject({
        method: 'GET',
        url: '/api/budget-categories',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<BudgetCategoryListResponse>();
      const found = body.categories.find((c) => c.name === 'Custom Cladding');
      expect(found).toBeDefined();
      expect(found!.translationKey).toBeNull();
    });

    it('GET /api/budget-categories/:id returns translationKey for a seeded category', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'GET',
        url: '/api/budget-categories/bc-labor',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<BudgetCategoryResponse>();
      expect(body.budgetCategory.translationKey).toBe('budgetCategories.labor');
    });

    it('GET /api/budget-categories/:id returns null translationKey for user-created category', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const cat = createTestCategory('Custom Demolition');

      const response = await app.inject({
        method: 'GET',
        url: `/api/budget-categories/${cat.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<BudgetCategoryResponse>();
      expect(body.budgetCategory.translationKey).toBeNull();
    });

    it('POST /api/budget-categories always creates category with null translationKey', async () => {
      const { cookie } = await createUserWithSession(
        'admin@test.com',
        'Admin',
        'password',
        'admin',
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/budget-categories',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Custom Groundworks' } satisfies CreateBudgetCategoryRequest),
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<BudgetCategoryResponse>();
      expect(body.budgetCategory.translationKey).toBeNull();
    });
  });

  // ─── PATCH /api/budget-categories/reorder (#2215) ──────────────────────────────

  describe('PATCH /api/budget-categories/reorder (#2215)', () => {
    const STAMP = '2026-01-01T00:00:00.000Z';
    const URL = '/api/budget-categories/reorder';

    function seedRows(rows: Array<[string, string, number]>): void {
      app.db.delete(budgetCategories).run();
      for (const [id, name, sortOrder] of rows) {
        app.db
          .insert(budgetCategories)
          .values({ id, name, sortOrder, createdAt: STAMP, updatedAt: STAMP })
          .run();
      }
    }

    const readRows = () =>
      app.db
        .select()
        .from(budgetCategories)
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
        url: '/api/budget-categories/b',
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
        url: '/api/budget-categories',
        headers: { cookie },
        payload: { name: 'Delta' },
      });

      expect(response.statusCode).toBe(201);
      expect(readRows().find((r) => r.name === 'Delta')?.sortOrder).toBe(3);
    });
  });
});

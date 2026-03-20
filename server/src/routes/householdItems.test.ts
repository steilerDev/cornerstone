import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import * as householdItemService from '../services/householdItemService.js';
import * as milestoneService from '../services/milestoneService.js';
import * as workItemService from '../services/workItemService.js';
import * as schema from '../db/schema.js';
import type { FastifyInstance } from 'fastify';
import type { ApiErrorResponse } from '@cornerstone/shared';

describe('Household Item Routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    // Save original environment
    originalEnv = { ...process.env };

    // Create temporary directory for test database
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-household-items-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';

    // Build app (runs migrations)
    app = await buildApp();
  });

  afterEach(async () => {
    // Close the app
    if (app) {
      await app.close();
    }

    // Restore original environment
    process.env = originalEnv;

    // Clean up temporary directory
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  /**
   * Helper: Create a user and return a session cookie string.
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
   * Helper: Insert a test area directly into the app DB.
   */
  function insertTestArea(name: string, color: string | null = null): string {
    const now = new Date().toISOString();
    const areaId = `area-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    app.db
      .insert(schema.areas)
      .values({
        id: areaId,
        name,
        parentId: null,
        color,
        description: null,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return areaId;
  }

  // ---------------------------------------------------------------------------
  // POST /api/household-items
  // ---------------------------------------------------------------------------

  describe('POST /api/household-items', () => {
    it('creates item with minimum required name field and returns 201', async () => {
      // Given: Authenticated member user
      const { userId, cookie } = await createUserWithSession(
        'member@example.com',
        'Member User',
        'password',
        'member',
      );

      const body = { name: 'Living Room Sofa' };

      // When: Creating household item
      const response = await app.inject({
        method: 'POST',
        url: '/api/household-items',
        headers: { cookie },
        payload: body,
      });

      // Then: Returns 201 with created item
      expect(response.statusCode).toBe(201);
      const parsed = JSON.parse(response.body) as { householdItem: Record<string, unknown> };
      const item = parsed.householdItem;

      expect(item.id).toBeDefined();
      expect(item.name).toBe('Living Room Sofa');
      expect(item.description).toBeNull();
      expect(item.category).toBe('hic-other');
      expect(item.status).toBe('planned');
      expect(item.quantity).toBe(1);
      expect(item.vendor).toBeNull();
      expect(item.area).toBeNull();
      expect(item.url).toBeNull();
      expect(item.orderDate).toBeNull();
      expect(item.targetDeliveryDate).toBeNull();
      expect(item.actualDeliveryDate).toBeNull();
      expect(item.dependencies).toEqual([]);
      expect(item.subsidies).toEqual([]);
      expect(item.budgetLineCount).toBe(0);
      expect(item.totalPlannedAmount).toBe(0);
      expect((item.createdBy as Record<string, unknown>)?.id).toBe(userId);
      expect(item.createdAt).toBeDefined();
      expect(item.updatedAt).toBeDefined();
    });

    it('creates item with all optional fields and returns 201', async () => {
      // Given: Authenticated user
      const { cookie } = await createUserWithSession(
        'admin@example.com',
        'Admin',
        'password',
        'admin',
      );

      const body = {
        name: 'King Bed Frame',
        description: 'Solid oak king bed frame',
        category: 'hic-furniture',
        status: 'purchased',
        url: 'https://ikea.com/bed',
        quantity: 1,
        orderDate: '2026-03-01',
        earliestDeliveryDate: '2026-04-01',
        latestDeliveryDate: '2026-04-30',
      };

      // When: Creating with all fields
      const response = await app.inject({
        method: 'POST',
        url: '/api/household-items',
        headers: { cookie },
        payload: body,
      });

      // Then: Returns 201 with all fields populated
      expect(response.statusCode).toBe(201);
      const parsed = JSON.parse(response.body) as { householdItem: Record<string, unknown> };
      const item = parsed.householdItem;

      expect(item.name).toBe('King Bed Frame');
      expect(item.description).toBe('Solid oak king bed frame');
      expect(item.category).toBe('hic-furniture');
      expect(item.status).toBe('purchased');
      expect(item.url).toBe('https://ikea.com/bed');
      expect(item.area).toBeNull();
      expect(item.quantity).toBe(1);
      expect(item.orderDate).toBe('2026-03-01');
      expect(item.earliestDeliveryDate).toBe('2026-04-01');
      expect(item.latestDeliveryDate).toBe('2026-04-30');
    });

    it('returns 400 when name is missing', async () => {
      // Given: Authenticated user
      const { cookie } = await createUserWithSession('user@example.com', 'User', 'password');

      // When: Creating without name
      const response = await app.inject({
        method: 'POST',
        url: '/api/household-items',
        headers: { cookie },
        payload: { description: 'No name provided' },
      });

      // Then: Returns 400 VALIDATION_ERROR
      expect(response.statusCode).toBe(400);
      const error = JSON.parse(response.body) as ApiErrorResponse;
      expect(error.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when name is empty string (minLength violation)', async () => {
      // Given: Authenticated user
      const { cookie } = await createUserWithSession('user@example.com', 'User', 'password');

      // When: Creating with empty name
      const response = await app.inject({
        method: 'POST',
        url: '/api/household-items',
        headers: { cookie },
        payload: { name: '' },
      });

      // Then: Returns 400 VALIDATION_ERROR
      expect(response.statusCode).toBe(400);
      const error = JSON.parse(response.body) as ApiErrorResponse;
      expect(error.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when category is invalid enum value', async () => {
      // Given: Authenticated user
      const { cookie } = await createUserWithSession('user@example.com', 'User', 'password');

      // When: Creating with invalid category
      const response = await app.inject({
        method: 'POST',
        url: '/api/household-items',
        headers: { cookie },
        payload: { name: 'Test Item', category: 'invalid_category' },
      });

      // Then: Returns 400 VALIDATION_ERROR
      expect(response.statusCode).toBe(400);
      const error = JSON.parse(response.body) as ApiErrorResponse;
      expect(error.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when status is invalid enum value', async () => {
      // Given: Authenticated user
      const { cookie } = await createUserWithSession('user@example.com', 'User', 'password');

      // When: Creating with invalid status
      const response = await app.inject({
        method: 'POST',
        url: '/api/household-items',
        headers: { cookie },
        payload: { name: 'Test Item', status: 'invalid_status' },
      });

      // Then: Returns 400 VALIDATION_ERROR
      expect(response.statusCode).toBe(400);
      const error = JSON.parse(response.body) as ApiErrorResponse;
      expect(error.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when vendorId does not exist', async () => {
      // Given: Authenticated user
      const { cookie } = await createUserWithSession('user@example.com', 'User', 'password');

      // When: Creating with non-existent vendor
      const response = await app.inject({
        method: 'POST',
        url: '/api/household-items',
        headers: { cookie },
        payload: { name: 'Test Item', vendorId: 'non-existent-vendor-id' },
      });

      // Then: Returns 400 VALIDATION_ERROR
      expect(response.statusCode).toBe(400);
      const error = JSON.parse(response.body) as ApiErrorResponse;
      expect(error.error.code).toBe('VALIDATION_ERROR');
      expect(error.error.message).toContain('Vendor not found');
    });

    it('returns 400 when areaId does not exist', async () => {
      // Given: Authenticated user
      const { cookie } = await createUserWithSession('user@example.com', 'User', 'password');

      // When: Creating with non-existent area
      const response = await app.inject({
        method: 'POST',
        url: '/api/household-items',
        headers: { cookie },
        payload: { name: 'Test Item', areaId: 'non-existent-area-id' },
      });

      // Then: Returns 400 VALIDATION_ERROR
      expect(response.statusCode).toBe(400);
      const error = JSON.parse(response.body) as ApiErrorResponse;
      expect(error.error.code).toBe('VALIDATION_ERROR');
      expect(error.error.message).toContain('Area not found');
    });

    it('returns 400 when quantity is less than 1', async () => {
      // Given: Authenticated user
      const { cookie } = await createUserWithSession('user@example.com', 'User', 'password');

      // When: Creating with quantity 0
      const response = await app.inject({
        method: 'POST',
        url: '/api/household-items',
        headers: { cookie },
        payload: { name: 'Test Item', quantity: 0 },
      });

      // Then: Returns 400 VALIDATION_ERROR
      expect(response.statusCode).toBe(400);
      const error = JSON.parse(response.body) as ApiErrorResponse;
      expect(error.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when orderDate format is invalid', async () => {
      // Given: Authenticated user
      const { cookie } = await createUserWithSession('user@example.com', 'User', 'password');

      // When: Creating with invalid date format
      const response = await app.inject({
        method: 'POST',
        url: '/api/household-items',
        headers: { cookie },
        payload: { name: 'Test Item', orderDate: '03/01/2026' },
      });

      // Then: Returns 400 VALIDATION_ERROR
      expect(response.statusCode).toBe(400);
      const error = JSON.parse(response.body) as ApiErrorResponse;
      expect(error.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 401 when not authenticated', async () => {
      // Given: No authentication
      const body = { name: 'Test Item' };

      // When: Creating without session
      const response = await app.inject({
        method: 'POST',
        url: '/api/household-items',
        payload: body,
      });

      // Then: Returns 401 UNAUTHORIZED
      expect(response.statusCode).toBe(401);
      const error = JSON.parse(response.body) as ApiErrorResponse;
      expect(error.error.code).toBe('UNAUTHORIZED');
    });

    it('allows member users to create household items', async () => {
      // Given: Member user (not admin)
      const { cookie } = await createUserWithSession(
        'member@example.com',
        'Member',
        'password',
        'member',
      );

      // When: Creating household item
      const response = await app.inject({
        method: 'POST',
        url: '/api/household-items',
        headers: { cookie },
        payload: { name: 'Member Item' },
      });

      // Then: Returns 201 (member can create)
      expect(response.statusCode).toBe(201);
    });

    it('response body is nested under householdItem key', async () => {
      // Given: Authenticated user
      const { cookie } = await createUserWithSession('user@example.com', 'User', 'password');

      // When: Creating item
      const response = await app.inject({
        method: 'POST',
        url: '/api/household-items',
        headers: { cookie },
        payload: { name: 'Test Item' },
      });

      // Then: Response is wrapped in householdItem key
      expect(response.statusCode).toBe(201);
      const parsed = JSON.parse(response.body) as Record<string, unknown>;
      expect(parsed).toHaveProperty('householdItem');
      const item = parsed.householdItem as Record<string, unknown>;
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('name');
      expect(item).toHaveProperty('area');
      expect(item).toHaveProperty('dependencies');
      expect(item).toHaveProperty('subsidies');
    });

    it('returns camelCase property names', async () => {
      // Given: Authenticated user
      const { cookie } = await createUserWithSession('user@example.com', 'User', 'password');

      // When: Creating item
      const response = await app.inject({
        method: 'POST',
        url: '/api/household-items',
        headers: { cookie },
        payload: {
          name: 'Test Item',
          orderDate: '2026-03-01',
          earliestDeliveryDate: '2026-04-01',
        },
      });

      // Then: Properties are camelCase
      expect(response.statusCode).toBe(201);
      const item = (JSON.parse(response.body) as { householdItem: Record<string, unknown> })
        .householdItem;
      expect(item).toHaveProperty('orderDate');
      expect(item).toHaveProperty('earliestDeliveryDate');
      expect(item).toHaveProperty('latestDeliveryDate');
      expect(item).toHaveProperty('targetDeliveryDate');
      expect(item).toHaveProperty('actualDeliveryDate');
      expect(item).toHaveProperty('budgetLineCount');
      expect(item).toHaveProperty('totalPlannedAmount');
      expect(item).toHaveProperty('createdAt');
      expect(item).toHaveProperty('updatedAt');
      expect(item).toHaveProperty('createdBy');
      // Ensure no snake_case properties
      expect(item).not.toHaveProperty('order_date');
      expect(item).not.toHaveProperty('expected_delivery_date');
      expect(item).not.toHaveProperty('actual_delivery_date');
      expect(item).not.toHaveProperty('budget_line_count');
      expect(item).not.toHaveProperty('created_at');
      expect(item).not.toHaveProperty('updated_at');
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/household-items
  // ---------------------------------------------------------------------------

  describe('GET /api/household-items', () => {
    it('returns paginated list with defaults and returns 200', async () => {
      // Given: Authenticated user and 3 items
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      for (let i = 1; i <= 3; i++) {
        householdItemService.createHouseholdItem(app.db, userId, { name: `Item ${i}` });
      }

      // When: Listing household items
      const response = await app.inject({
        method: 'GET',
        url: '/api/household-items',
        headers: { cookie },
      });

      // Then: Returns 200 with pagination
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as {
        items: unknown[];
        pagination: {
          page: number;
          pageSize: number;
          totalItems: number;
          totalPages: number;
        };
      };

      expect(body.items).toHaveLength(3);
      expect(body.pagination).toBeDefined();
      expect(body.pagination.page).toBe(1);
      expect(body.pagination.pageSize).toBe(25);
      expect(body.pagination.totalItems).toBe(3);
      expect(body.pagination.totalPages).toBe(1);
    });

    it('returns empty list when no items exist', async () => {
      // Given: Authenticated user, no items
      const { cookie } = await createUserWithSession('user@example.com', 'User', 'password');

      // When: Listing
      const response = await app.inject({
        method: 'GET',
        url: '/api/household-items',
        headers: { cookie },
      });

      // Then: Returns 200 with empty list
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as {
        items: unknown[];
        pagination: { totalItems: number };
      };
      expect(body.items).toHaveLength(0);
      expect(body.pagination.totalItems).toBe(0);
    });

    it('supports pagination via page and pageSize query params', async () => {
      // Given: 10 items
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      for (let i = 1; i <= 10; i++) {
        householdItemService.createHouseholdItem(app.db, userId, { name: `Item ${i}` });
      }

      // When: Requesting page 2 with pageSize 4
      const response = await app.inject({
        method: 'GET',
        url: '/api/household-items?page=2&pageSize=4',
        headers: { cookie },
      });

      // Then: Correct pagination
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as {
        items: unknown[];
        pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
      };
      expect(body.items).toHaveLength(4);
      expect(body.pagination.page).toBe(2);
      expect(body.pagination.pageSize).toBe(4);
      expect(body.pagination.totalItems).toBe(10);
      expect(body.pagination.totalPages).toBe(3);
    });

    it('filters by category query param', async () => {
      // Given: Items with different categories
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      householdItemService.createHouseholdItem(app.db, userId, {
        name: 'Sofa',
        category: 'hic-furniture',
      });
      householdItemService.createHouseholdItem(app.db, userId, {
        name: 'Dishwasher',
        category: 'hic-appliances',
      });

      // When: Filtering by category
      const response = await app.inject({
        method: 'GET',
        url: '/api/household-items?category=hic-appliances',
        headers: { cookie },
      });

      // Then: Only appliances returned
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as { items: Array<{ name: string }> };
      expect(body.items).toHaveLength(1);
      expect(body.items[0].name).toBe('Dishwasher');
    });

    it('filters by status query param', async () => {
      // Given: Items with different statuses
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      householdItemService.createHouseholdItem(app.db, userId, {
        name: 'Item A',
        status: 'planned',
      });
      householdItemService.createHouseholdItem(app.db, userId, {
        name: 'Item B',
        status: 'arrived',
      });

      // When: Filtering by arrived
      const response = await app.inject({
        method: 'GET',
        url: '/api/household-items?status=arrived',
        headers: { cookie },
      });

      // Then: Only delivered items
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as { items: Array<{ name: string }> };
      expect(body.items).toHaveLength(1);
      expect(body.items[0].name).toBe('Item B');
    });

    it('supports full-text search via q query param', async () => {
      // Given: Items with different names
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      householdItemService.createHouseholdItem(app.db, userId, { name: 'Coffee Table' });
      householdItemService.createHouseholdItem(app.db, userId, { name: 'Dining Chair' });

      // When: Searching
      const response = await app.inject({
        method: 'GET',
        url: '/api/household-items?q=coffee',
        headers: { cookie },
      });

      // Then: Only matching items
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as { items: Array<{ name: string }> };
      expect(body.items).toHaveLength(1);
      expect(body.items[0].name).toBe('Coffee Table');
    });

    it('returns 200 with empty list when category query param is unknown (no enum validation)', async () => {
      // Given: Authenticated user
      const { cookie } = await createUserWithSession('user@example.com', 'User', 'password');

      // When: Using a non-existent category ID
      // After migration 0016, category is a free-form string validated against the DB.
      // An unknown category ID simply returns an empty list rather than a 400.
      const response = await app.inject({
        method: 'GET',
        url: '/api/household-items?category=invalid_category',
        headers: { cookie },
      });

      // Then: Returns 200 with empty results (no items match this unknown category ID)
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as { items: unknown[] };
      expect(body.items).toHaveLength(0);
    });

    it('returns 400 when sortBy is invalid', async () => {
      // Given: Authenticated user
      const { cookie } = await createUserWithSession('user@example.com', 'User', 'password');

      // When: Using invalid sortBy
      const response = await app.inject({
        method: 'GET',
        url: '/api/household-items?sortBy=invalid_field',
        headers: { cookie },
      });

      // Then: Returns 400
      expect(response.statusCode).toBe(400);
      const error = JSON.parse(response.body) as ApiErrorResponse;
      expect(error.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 401 when not authenticated', async () => {
      // Given: No authentication
      const response = await app.inject({
        method: 'GET',
        url: '/api/household-items',
      });

      // Then: Returns 401 UNAUTHORIZED
      expect(response.statusCode).toBe(401);
      const error = JSON.parse(response.body) as ApiErrorResponse;
      expect(error.error.code).toBe('UNAUTHORIZED');
    });

    it('supports sorting by name asc', async () => {
      // Given: Items with different names
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      householdItemService.createHouseholdItem(app.db, userId, { name: 'Zebra Chair' });
      householdItemService.createHouseholdItem(app.db, userId, { name: 'Apple Lamp' });

      // When: Sorting by name asc
      const response = await app.inject({
        method: 'GET',
        url: '/api/household-items?sortBy=name&sortOrder=asc',
        headers: { cookie },
      });

      // Then: Items are sorted
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as { items: Array<{ name: string }> };
      expect(body.items[0].name).toBe('Apple Lamp');
      expect(body.items[1].name).toBe('Zebra Chair');
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/household-items/:id
  // ---------------------------------------------------------------------------

  describe('GET /api/household-items/:id', () => {
    it('returns household item detail with 200', async () => {
      // Given: An existing item
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      const created = householdItemService.createHouseholdItem(app.db, userId, {
        name: 'Bookshelf',
        category: 'hic-furniture',
      });

      // When: Getting by ID
      const response = await app.inject({
        method: 'GET',
        url: `/api/household-items/${created.id}`,
        headers: { cookie },
      });

      // Then: Returns 200 with full detail
      expect(response.statusCode).toBe(200);
      const parsed = JSON.parse(response.body) as { householdItem: Record<string, unknown> };
      const item = parsed.householdItem;
      expect(item.id).toBe(created.id);
      expect(item.name).toBe('Bookshelf');
      expect(item.category).toBe('hic-furniture');
      // tags table was dropped in migration 0028 — tags field no longer present
      expect(item).not.toHaveProperty('tags');
      expect(item).toHaveProperty('dependencies');
      expect(item).toHaveProperty('subsidies');
    });

    it('returns 404 for non-existent ID', async () => {
      // Given: Authenticated user
      const { cookie } = await createUserWithSession('user@example.com', 'User', 'password');

      // When: Getting by non-existent ID
      const response = await app.inject({
        method: 'GET',
        url: '/api/household-items/non-existent-id',
        headers: { cookie },
      });

      // Then: Returns 404 NOT_FOUND
      expect(response.statusCode).toBe(404);
      const error = JSON.parse(response.body) as ApiErrorResponse;
      expect(error.error.code).toBe('NOT_FOUND');
      expect(error.error.message).toContain('Household item not found');
    });

    it('returns 401 when not authenticated', async () => {
      // Given: No authentication
      const response = await app.inject({
        method: 'GET',
        url: '/api/household-items/some-id',
      });

      // Then: Returns 401 UNAUTHORIZED
      expect(response.statusCode).toBe(401);
      const error = JSON.parse(response.body) as ApiErrorResponse;
      expect(error.error.code).toBe('UNAUTHORIZED');
    });

    it('response is nested under householdItem key', async () => {
      // Given: An existing item
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      const created = householdItemService.createHouseholdItem(app.db, userId, {
        name: 'Test Item',
      });

      // When: Getting by ID
      const response = await app.inject({
        method: 'GET',
        url: `/api/household-items/${created.id}`,
        headers: { cookie },
      });

      // Then: Response is wrapped
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as Record<string, unknown>;
      expect(body).toHaveProperty('householdItem');
    });

    it('includes area in detail response', async () => {
      // Given: An item
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      const created = householdItemService.createHouseholdItem(app.db, userId, {
        name: 'Dresser',
      });

      // When: Getting by ID
      const response = await app.inject({
        method: 'GET',
        url: `/api/household-items/${created.id}`,
        headers: { cookie },
      });

      // Then: Area field is present (null when not set)
      expect(response.statusCode).toBe(200);
      const item = (JSON.parse(response.body) as { householdItem: Record<string, unknown> })
        .householdItem;
      expect(item).toHaveProperty('area');
      expect(item.area).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // PATCH /api/household-items/:id
  // ---------------------------------------------------------------------------

  describe('PATCH /api/household-items/:id', () => {
    it('updates household item and returns 200', async () => {
      // Given: An existing item
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      const created = householdItemService.createHouseholdItem(app.db, userId, {
        name: 'Original Name',
        status: 'planned',
      });

      // When: Updating status
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/household-items/${created.id}`,
        headers: { cookie },
        payload: { status: 'purchased' },
      });

      // Then: Returns 200 with updated item
      expect(response.statusCode).toBe(200);
      const item = (JSON.parse(response.body) as { householdItem: Record<string, unknown> })
        .householdItem;
      expect(item.status).toBe('purchased');
      expect(item.name).toBe('Original Name');
    });

    it('updates name field', async () => {
      // Given: An existing item
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      const created = householdItemService.createHouseholdItem(app.db, userId, {
        name: 'Old Name',
      });

      // When: Updating name
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/household-items/${created.id}`,
        headers: { cookie },
        payload: { name: 'New Name' },
      });

      // Then: Returns 200 with new name
      expect(response.statusCode).toBe(200);
      const item = (JSON.parse(response.body) as { householdItem: Record<string, unknown> })
        .householdItem;
      expect(item.name).toBe('New Name');
    });

    it('updates areaId to null (clears area)', async () => {
      // Given: An item with an area assigned
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      const areaId = insertTestArea('Living Room');
      const created = householdItemService.createHouseholdItem(app.db, userId, {
        name: 'Lamp',
        areaId,
      });
      expect(created.area?.id).toBe(areaId);

      // When: Clearing the area
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/household-items/${created.id}`,
        headers: { cookie },
        payload: { areaId: null },
      });

      // Then: Returns 200 with area cleared
      expect(response.statusCode).toBe(200);
      const item = (JSON.parse(response.body) as { householdItem: Record<string, unknown> })
        .householdItem;
      expect(item.area).toBeNull();
    });

    it('returns 404 for non-existent ID', async () => {
      // Given: Authenticated user
      const { cookie } = await createUserWithSession('user@example.com', 'User', 'password');

      // When: Updating non-existent item
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/household-items/non-existent-id',
        headers: { cookie },
        payload: { status: 'purchased' },
      });

      // Then: Returns 404 NOT_FOUND
      expect(response.statusCode).toBe(404);
      const error = JSON.parse(response.body) as ApiErrorResponse;
      expect(error.error.code).toBe('NOT_FOUND');
    });

    it('returns 400 when body is empty (minProperties violation)', async () => {
      // Given: An existing item
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      const created = householdItemService.createHouseholdItem(app.db, userId, { name: 'Chair' });

      // When: Sending empty body
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/household-items/${created.id}`,
        headers: { cookie },
        payload: {},
      });

      // Then: Returns 400 VALIDATION_ERROR
      expect(response.statusCode).toBe(400);
      const error = JSON.parse(response.body) as ApiErrorResponse;
      expect(error.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when category is invalid enum value', async () => {
      // Given: An existing item
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      const created = householdItemService.createHouseholdItem(app.db, userId, { name: 'Lamp' });

      // When: Setting invalid category
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/household-items/${created.id}`,
        headers: { cookie },
        payload: { category: 'not_valid' },
      });

      // Then: Returns 400
      expect(response.statusCode).toBe(400);
      const error = JSON.parse(response.body) as ApiErrorResponse;
      expect(error.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when vendorId does not exist', async () => {
      // Given: An existing item
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      const created = householdItemService.createHouseholdItem(app.db, userId, {
        name: 'Fridge',
      });

      // When: Setting non-existent vendor
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/household-items/${created.id}`,
        headers: { cookie },
        payload: { vendorId: 'non-existent-vendor-id' },
      });

      // Then: Returns 400
      expect(response.statusCode).toBe(400);
      const error = JSON.parse(response.body) as ApiErrorResponse;
      expect(error.error.code).toBe('VALIDATION_ERROR');
      expect(error.error.message).toContain('Vendor not found');
    });

    it('returns 401 when not authenticated', async () => {
      // Given: No authentication
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/household-items/some-id',
        payload: { status: 'purchased' },
      });

      // Then: Returns 401 UNAUTHORIZED
      expect(response.statusCode).toBe(401);
      const error = JSON.parse(response.body) as ApiErrorResponse;
      expect(error.error.code).toBe('UNAUTHORIZED');
    });

    it('response is nested under householdItem key', async () => {
      // Given: An existing item
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      const created = householdItemService.createHouseholdItem(app.db, userId, {
        name: 'Lamp',
      });

      // When: Updating
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/household-items/${created.id}`,
        headers: { cookie },
        payload: { name: 'Updated Lamp' },
      });

      // Then: Response is wrapped
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as Record<string, unknown>;
      expect(body).toHaveProperty('householdItem');
    });
  });

  // ---------------------------------------------------------------------------
  // PATCH /api/household-items/:id — auto-set actualDeliveryDate
  // ---------------------------------------------------------------------------

  describe('PATCH /api/household-items/:id — auto-set actualDeliveryDate', () => {
    it('auto-sets actualDeliveryDate to today when status changes to arrived and date is null', async () => {
      // Given: An existing item with no actualDeliveryDate
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      const created = householdItemService.createHouseholdItem(app.db, userId, {
        name: 'Dining Table',
        status: 'planned',
      });
      expect(created.actualDeliveryDate).toBeNull();

      // When: Updating status to 'arrived'
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/household-items/${created.id}`,
        headers: { cookie },
        payload: { status: 'arrived' },
      });

      // Then: Returns 200 and actualDeliveryDate is set to today's date
      expect(response.statusCode).toBe(200);
      const item = (JSON.parse(response.body) as { householdItem: Record<string, unknown> })
        .householdItem;
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      expect(item.actualDeliveryDate).toBe(today);
    });

    it('does not overwrite existing actualDeliveryDate when status changes to arrived', async () => {
      // Given: An existing item with an actualDeliveryDate already set
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      const created = householdItemService.createHouseholdItem(app.db, userId, {
        name: 'Kitchen Table',
        status: 'purchased',
      });
      // PATCH to set actualDeliveryDate
      await app.inject({
        method: 'PATCH',
        url: `/api/household-items/${created.id}`,
        headers: { cookie },
        payload: { actualDeliveryDate: '2026-01-01' },
      });

      // When: Updating status to 'arrived' without providing actualDeliveryDate
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/household-items/${created.id}`,
        headers: { cookie },
        payload: { status: 'arrived' },
      });

      // Then: Returns 200 and actualDeliveryDate remains '2026-01-01'
      expect(response.statusCode).toBe(200);
      const item = (JSON.parse(response.body) as { householdItem: Record<string, unknown> })
        .householdItem;
      expect(item.actualDeliveryDate).toBe('2026-01-01');
    });

    it('uses explicit actualDeliveryDate from body even when status is arrived', async () => {
      // Given: An existing item with no actualDeliveryDate
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      const created = householdItemService.createHouseholdItem(app.db, userId, {
        name: 'Office Desk',
        status: 'purchased',
      });

      // When: Updating with status 'arrived' and explicit actualDeliveryDate
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/household-items/${created.id}`,
        headers: { cookie },
        payload: { status: 'arrived', actualDeliveryDate: '2025-06-15' },
      });

      // Then: Returns 200 and actualDeliveryDate is '2025-06-15'
      expect(response.statusCode).toBe(200);
      const item = (JSON.parse(response.body) as { householdItem: Record<string, unknown> })
        .householdItem;
      expect(item.actualDeliveryDate).toBe('2025-06-15');
    });

    it('does not touch actualDeliveryDate when status changes to non-arrived state', async () => {
      // Given: An existing item with no actualDeliveryDate
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      const created = householdItemService.createHouseholdItem(app.db, userId, {
        name: 'Bookshelf',
        status: 'planned',
      });
      expect(created.actualDeliveryDate).toBeNull();

      // When: Updating status to 'purchased' (not 'arrived')
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/household-items/${created.id}`,
        headers: { cookie },
        payload: { status: 'purchased' },
      });

      // Then: Returns 200 and actualDeliveryDate remains null
      expect(response.statusCode).toBe(200);
      const item = (JSON.parse(response.body) as { householdItem: Record<string, unknown> })
        .householdItem;
      expect(item.actualDeliveryDate).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE /api/household-items/:id
  // ---------------------------------------------------------------------------

  describe('DELETE /api/household-items/:id', () => {
    it('deletes household item and returns 204', async () => {
      // Given: An existing item
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      const created = householdItemService.createHouseholdItem(app.db, userId, {
        name: 'Old Couch',
      });

      // When: Deleting it
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/household-items/${created.id}`,
        headers: { cookie },
      });

      // Then: Returns 204 with no body
      expect(response.statusCode).toBe(204);
      expect(response.body).toBe('');
    });

    it('verifies item is gone after deletion', async () => {
      // Given: An existing item
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      const created = householdItemService.createHouseholdItem(app.db, userId, {
        name: 'Deletable Lamp',
      });

      // When: Deleting then trying to get it
      await app.inject({
        method: 'DELETE',
        url: `/api/household-items/${created.id}`,
        headers: { cookie },
      });

      const getResponse = await app.inject({
        method: 'GET',
        url: `/api/household-items/${created.id}`,
        headers: { cookie },
      });

      // Then: Item no longer exists
      expect(getResponse.statusCode).toBe(404);
    });

    it('returns 404 for non-existent ID', async () => {
      // Given: Authenticated user
      const { cookie } = await createUserWithSession('user@example.com', 'User', 'password');

      // When: Deleting non-existent item
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/household-items/non-existent-id',
        headers: { cookie },
      });

      // Then: Returns 404 NOT_FOUND
      expect(response.statusCode).toBe(404);
      const error = JSON.parse(response.body) as ApiErrorResponse;
      expect(error.error.code).toBe('NOT_FOUND');
      expect(error.error.message).toContain('Household item not found');
    });

    it('returns 401 when not authenticated', async () => {
      // Given: No authentication
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/household-items/some-id',
      });

      // Then: Returns 401 UNAUTHORIZED
      expect(response.statusCode).toBe(401);
      const error = JSON.parse(response.body) as ApiErrorResponse;
      expect(error.error.code).toBe('UNAUTHORIZED');
    });

    it('allows any authenticated user to delete', async () => {
      // Given: Member user (not admin) creates and deletes an item
      const { userId, cookie } = await createUserWithSession(
        'member@example.com',
        'Member',
        'password',
        'member',
      );
      const created = householdItemService.createHouseholdItem(app.db, userId, {
        name: 'Member Item',
      });

      // When: Member deletes their item
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/household-items/${created.id}`,
        headers: { cookie },
      });

      // Then: Returns 204
      expect(response.statusCode).toBe(204);
    });

    it('also removes item from list after deletion', async () => {
      // Given: Two items
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      const item1 = householdItemService.createHouseholdItem(app.db, userId, {
        name: 'Keep This',
      });
      const item2 = householdItemService.createHouseholdItem(app.db, userId, {
        name: 'Delete This',
      });

      // When: Deleting item2 and listing
      await app.inject({
        method: 'DELETE',
        url: `/api/household-items/${item2.id}`,
        headers: { cookie },
      });

      const listResponse = await app.inject({
        method: 'GET',
        url: '/api/household-items',
        headers: { cookie },
      });

      // Then: Only item1 remains
      const body = JSON.parse(listResponse.body) as {
        items: Array<{ id: string }>;
        pagination: { totalItems: number };
      };
      expect(body.pagination.totalItems).toBe(1);
      expect(body.items[0].id).toBe(item1.id);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/household-items/:id/dependencies
  // ---------------------------------------------------------------------------

  describe('GET /api/household-items/:id/dependencies', () => {
    it('returns 200 with empty dependencies array for item with no deps', async () => {
      // Given: An authenticated user and a household item with no dependencies
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      const item = householdItemService.createHouseholdItem(app.db, userId, {
        name: 'Standalone Item',
      });

      // When: Fetching dependencies
      const response = await app.inject({
        method: 'GET',
        url: `/api/household-items/${item.id}/dependencies`,
        headers: { cookie },
      });

      // Then: Returns 200 with empty array
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as { dependencies: unknown[] };
      expect(body.dependencies).toEqual([]);
    });

    it('returns 404 when household item does not exist', async () => {
      // Given: An authenticated user
      const { cookie } = await createUserWithSession('user@example.com', 'User', 'password');

      // When: Fetching dependencies for non-existent item
      const response = await app.inject({
        method: 'GET',
        url: '/api/household-items/nonexistent-id/dependencies',
        headers: { cookie },
      });

      // Then: Returns 404
      expect(response.statusCode).toBe(404);
      const error = JSON.parse(response.body) as ApiErrorResponse;
      expect(error.error.code).toBe('NOT_FOUND');
    });

    it('returns 200 with dependencies array when deps exist', async () => {
      // Given: An authenticated user, a work item, and a household item with a dep
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      const workItem = workItemService.createWorkItem(app.db, userId, {
        title: 'Foundation Work',
      });
      const item = householdItemService.createHouseholdItem(app.db, userId, { name: 'Sofa' });

      // Create a dependency via POST
      await app.inject({
        method: 'POST',
        url: `/api/household-items/${item.id}/dependencies`,
        headers: { cookie },
        payload: {
          predecessorType: 'work_item',
          predecessorId: workItem.id,
        },
      });

      // When: Fetching dependencies
      const response = await app.inject({
        method: 'GET',
        url: `/api/household-items/${item.id}/dependencies`,
        headers: { cookie },
      });

      // Then: Returns 200 with the dependency
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as {
        dependencies: Array<{
          householdItemId: string;
          predecessorType: string;
          predecessorId: string;
          predecessor: { id: string; title: string };
        }>;
      };
      expect(body.dependencies).toHaveLength(1);
      expect(body.dependencies[0].predecessorType).toBe('work_item');
      expect(body.dependencies[0].predecessorId).toBe(workItem.id);
      expect(body.dependencies[0].predecessor.title).toBe('Foundation Work');
    });

    it('returns 401 when not authenticated', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/household-items/some-id/dependencies',
      });
      expect(response.statusCode).toBe(401);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/household-items/:id/dependencies
  // ---------------------------------------------------------------------------

  describe('POST /api/household-items/:id/dependencies', () => {
    it('returns 201 with created work_item dependency', async () => {
      // Given: Authenticated user, work item, and household item
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      const workItem = workItemService.createWorkItem(app.db, userId, {
        title: 'Framing Work',
      });
      const item = householdItemService.createHouseholdItem(app.db, userId, {
        name: 'Living Room Set',
      });

      // When: Creating a dependency
      const response = await app.inject({
        method: 'POST',
        url: `/api/household-items/${item.id}/dependencies`,
        headers: { cookie },
        payload: {
          predecessorType: 'work_item',
          predecessorId: workItem.id,
        },
      });

      // Then: Returns 201 with the created dependency
      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body) as {
        dependency: {
          householdItemId: string;
          predecessorType: string;
          predecessorId: string;
          predecessor: { id: string; title: string };
        };
      };
      expect(body.dependency.householdItemId).toBe(item.id);
      expect(body.dependency.predecessorType).toBe('work_item');
      expect(body.dependency.predecessorId).toBe(workItem.id);
      expect(body.dependency.predecessor.id).toBe(workItem.id);
      expect(body.dependency.predecessor.title).toBe('Framing Work');
    });

    it('returns 201 with created milestone dependency', async () => {
      // Given: Authenticated user, milestone, and household item
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      const milestone = milestoneService.createMilestone(
        app.db,
        { title: 'Framing Complete', targetDate: '2026-07-01' },
        userId,
      );
      const item = householdItemService.createHouseholdItem(app.db, userId, { name: 'Bookcase' });

      // When: Creating a milestone dependency
      const response = await app.inject({
        method: 'POST',
        url: `/api/household-items/${item.id}/dependencies`,
        headers: { cookie },
        payload: {
          predecessorType: 'milestone',
          predecessorId: milestone.id.toString(),
        },
      });

      // Then: Returns 201
      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body) as {
        dependency: {
          predecessorType: string;
          predecessorId: string;
          predecessor: { title: string };
        };
      };
      expect(body.dependency.predecessorType).toBe('milestone');
      expect(body.dependency.predecessorId).toBe(milestone.id.toString());
      expect(body.dependency.predecessor.title).toBe('Framing Complete');
    });

    it('returns 201 and silently ignores dependencyType and leadLagDays if sent', async () => {
      // Given: Authenticated user, work item, and household item
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      const workItem = workItemService.createWorkItem(app.db, userId, { title: 'Electrical' });
      const item = householdItemService.createHouseholdItem(app.db, userId, { name: 'Chandelier' });

      // When: Creating a dependency with extra fields (backwards compat)
      const response = await app.inject({
        method: 'POST',
        url: `/api/household-items/${item.id}/dependencies`,
        headers: { cookie },
        payload: {
          predecessorType: 'work_item',
          predecessorId: workItem.id,
          dependencyType: 'start_to_start',
          leadLagDays: 14,
        },
      });

      // Then: Returns 201 — extra fields are silently ignored
      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body) as {
        dependency: { predecessorType: string; predecessorId: string };
      };
      expect(body.dependency.predecessorType).toBe('work_item');
      expect(body.dependency.predecessorId).toBe(workItem.id);
    });

    it('returns 400 for missing required fields (predecessorType)', async () => {
      // Given: Authenticated user and household item
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      const item = householdItemService.createHouseholdItem(app.db, userId, { name: 'Lamp' });

      // When: Creating dependency without predecessorType
      const response = await app.inject({
        method: 'POST',
        url: `/api/household-items/${item.id}/dependencies`,
        headers: { cookie },
        payload: { predecessorId: 'some-id' }, // missing predecessorType
      });

      // Then: Returns 400
      expect(response.statusCode).toBe(400);
    });

    it('returns 400 for missing required fields (predecessorId)', async () => {
      // Given: Authenticated user and household item
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      const item = householdItemService.createHouseholdItem(app.db, userId, { name: 'Lamp' });

      // When: Creating dependency without predecessorId
      const response = await app.inject({
        method: 'POST',
        url: `/api/household-items/${item.id}/dependencies`,
        headers: { cookie },
        payload: { predecessorType: 'work_item' }, // missing predecessorId
      });

      // Then: Returns 400
      expect(response.statusCode).toBe(400);
    });

    it('returns 404 when household item does not exist', async () => {
      // Given: Authenticated user and a work item
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      const workItem = workItemService.createWorkItem(app.db, userId, { title: 'Test WI' });

      // When: Creating dependency for non-existent HI
      const response = await app.inject({
        method: 'POST',
        url: '/api/household-items/nonexistent-hi/dependencies',
        headers: { cookie },
        payload: { predecessorType: 'work_item', predecessorId: workItem.id },
      });

      // Then: Returns 404
      expect(response.statusCode).toBe(404);
      const error = JSON.parse(response.body) as ApiErrorResponse;
      expect(error.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 when predecessor work item does not exist', async () => {
      // Given: Authenticated user and household item
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      const item = householdItemService.createHouseholdItem(app.db, userId, { name: 'Rug' });

      // When: Creating dependency for non-existent work item
      const response = await app.inject({
        method: 'POST',
        url: `/api/household-items/${item.id}/dependencies`,
        headers: { cookie },
        payload: { predecessorType: 'work_item', predecessorId: 'nonexistent-wi' },
      });

      // Then: Returns 404
      expect(response.statusCode).toBe(404);
      const error = JSON.parse(response.body) as ApiErrorResponse;
      expect(error.error.code).toBe('NOT_FOUND');
    });

    it('returns 409 for duplicate dependency', async () => {
      // Given: Authenticated user, work item, and household item with existing dep
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      const workItem = workItemService.createWorkItem(app.db, userId, { title: 'Foundation' });
      const item = householdItemService.createHouseholdItem(app.db, userId, { name: 'Cabinet' });

      const payload = { predecessorType: 'work_item', predecessorId: workItem.id };

      // First create succeeds
      const first = await app.inject({
        method: 'POST',
        url: `/api/household-items/${item.id}/dependencies`,
        headers: { cookie },
        payload,
      });
      expect(first.statusCode).toBe(201);

      // Second create returns 409
      const second = await app.inject({
        method: 'POST',
        url: `/api/household-items/${item.id}/dependencies`,
        headers: { cookie },
        payload,
      });

      expect(second.statusCode).toBe(409);
      const error = JSON.parse(second.body) as ApiErrorResponse;
      // ConflictError uses 'CONFLICT' as the API error code (details carry 'DUPLICATE_DEPENDENCY')
      expect(error.error.code).toBe('CONFLICT');
    });

    it('returns 401 when not authenticated', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/household-items/some-id/dependencies',
        payload: { predecessorType: 'work_item', predecessorId: 'wi-id' },
      });
      expect(response.statusCode).toBe(401);
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE /api/household-items/:id/dependencies/:predecessorType/:predecessorId
  // ---------------------------------------------------------------------------

  describe('DELETE /api/household-items/:id/dependencies/:predecessorType/:predecessorId', () => {
    it('returns 204 when dependency is successfully deleted', async () => {
      // Given: An authenticated user, work item, and HI with a dependency
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      const workItem = workItemService.createWorkItem(app.db, userId, { title: 'Plumbing' });
      const item = householdItemService.createHouseholdItem(app.db, userId, { name: 'Bathtub' });

      // Create the dependency first
      await app.inject({
        method: 'POST',
        url: `/api/household-items/${item.id}/dependencies`,
        headers: { cookie },
        payload: { predecessorType: 'work_item', predecessorId: workItem.id },
      });

      // When: Deleting the dependency
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/household-items/${item.id}/dependencies/work_item/${workItem.id}`,
        headers: { cookie },
      });

      // Then: Returns 204
      expect(response.statusCode).toBe(204);

      // Verify: The dep is gone
      const depsResponse = await app.inject({
        method: 'GET',
        url: `/api/household-items/${item.id}/dependencies`,
        headers: { cookie },
      });
      const body = JSON.parse(depsResponse.body) as { dependencies: unknown[] };
      expect(body.dependencies).toHaveLength(0);
    });

    it('returns 404 when dependency does not exist', async () => {
      // Given: Authenticated user and household item (no deps)
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      const workItem = workItemService.createWorkItem(app.db, userId, { title: 'Work' });
      const item = householdItemService.createHouseholdItem(app.db, userId, { name: 'Sink' });

      // When: Trying to delete a non-existent dep
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/household-items/${item.id}/dependencies/work_item/${workItem.id}`,
        headers: { cookie },
      });

      // Then: Returns 404
      expect(response.statusCode).toBe(404);
      const error = JSON.parse(response.body) as ApiErrorResponse;
      expect(error.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 when household item does not exist', async () => {
      // Given: Authenticated user
      const { cookie } = await createUserWithSession('user@example.com', 'User', 'password');

      // When: Deleting dep for non-existent HI
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/household-items/nonexistent-hi/dependencies/work_item/some-wi',
        headers: { cookie },
      });

      // Then: Returns 404
      expect(response.statusCode).toBe(404);
    });

    it('returns 401 when not authenticated', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/household-items/some-id/dependencies/work_item/some-wi',
      });
      expect(response.statusCode).toBe(401);
    });
  });

  // ---------------------------------------------------------------------------
  // Old work-items junction endpoints should NOT exist (routes removed in 0012)
  // ---------------------------------------------------------------------------

  describe('old /work-items junction endpoints (removed)', () => {
    it('GET /api/household-items/:id/work-items returns 404 (route removed)', async () => {
      // Given: Authenticated user and household item
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      const item = householdItemService.createHouseholdItem(app.db, userId, { name: 'Dresser' });

      // When: Calling the old work-items endpoint
      const response = await app.inject({
        method: 'GET',
        url: `/api/household-items/${item.id}/work-items`,
        headers: { cookie },
      });

      // Then: Returns 404 (route does not exist)
      expect(response.statusCode).toBe(404);
    });

    it('POST /api/household-items/:id/work-items returns 404 (route removed)', async () => {
      // Given: Authenticated user and household item
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      const item = householdItemService.createHouseholdItem(app.db, userId, { name: 'Nightstand' });

      // When: Calling the old POST work-items endpoint
      const response = await app.inject({
        method: 'POST',
        url: `/api/household-items/${item.id}/work-items`,
        headers: { cookie },
        payload: { workItemId: 'some-wi' },
      });

      // Then: Returns 404 (route does not exist)
      expect(response.statusCode).toBe(404);
    });
  });
});

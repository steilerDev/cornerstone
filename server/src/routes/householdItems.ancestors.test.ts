/**
 * Integration tests for area ancestor chain in household item API responses.
 *
 * Verifies that GET /api/household-items and GET /api/household-items/:id return
 * the `area.ancestors` field correctly populated with root-first ancestor chains.
 *
 * Scenarios covered:
 * - AC3: 5-level deep chain on detail endpoint returns 4-ancestor chain
 * - List endpoint: 2-level chain returns correct ancestors
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import * as householdItemService from '../services/householdItemService.js';
import * as schema from '../db/schema.js';
import type { FastifyInstance } from 'fastify';
import type { AreaSummary } from '@cornerstone/shared';

describe('Household Item Routes — area ancestors', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };

    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-hi-ancestors-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';

    app = await buildApp();
  });

  afterEach(async () => {
    jest.restoreAllMocks();

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
   * Supports parentId for hierarchy tests.
   */
  function insertTestArea(
    name: string,
    options: { parentId?: string | null; color?: string | null } = {},
  ): string {
    const now = new Date().toISOString();
    const areaId = `area-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    app.db
      .insert(schema.areas)
      .values({
        id: areaId,
        name,
        parentId: options.parentId ?? null,
        color: options.color ?? null,
        description: null,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return areaId;
  }

  // ---------------------------------------------------------------------------
  // GET /api/household-items/:id — detail endpoint
  // ---------------------------------------------------------------------------

  describe('GET /api/household-items/:id', () => {
    it('AC3 — 5-level deep chain: returns area with 4-ancestor chain root-first', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );

      // Property → House → Floor 1 → Kitchen Area → Pantry (5 levels)
      const propertyId = insertTestArea('Property');
      const houseId = insertTestArea('House', { parentId: propertyId });
      const floor1Id = insertTestArea('Floor 1', { parentId: houseId });
      const kitchenId = insertTestArea('Kitchen Area', { parentId: floor1Id });
      const pantryId = insertTestArea('Pantry', { parentId: kitchenId });

      const created = householdItemService.createHouseholdItem(app.db, userId, {
        name: 'Pantry Shelf',
        areaId: pantryId,
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/household-items/${created.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const parsed = JSON.parse(response.body) as { householdItem: Record<string, unknown> };
      const item = parsed.householdItem;

      expect(item.area).not.toBeNull();
      const area = item.area as AreaSummary;
      expect(area.id).toBe(pantryId);
      expect(area.ancestors).toHaveLength(4);

      // Root-first order
      expect(area.ancestors[0].name).toBe('Property');
      expect(area.ancestors[0].id).toBe(propertyId);
      expect(area.ancestors[1].name).toBe('House');
      expect(area.ancestors[1].id).toBe(houseId);
      expect(area.ancestors[2].name).toBe('Floor 1');
      expect(area.ancestors[2].id).toBe(floor1Id);
      expect(area.ancestors[3].name).toBe('Kitchen Area');
      expect(area.ancestors[3].id).toBe(kitchenId);

      // Pantry itself must NOT appear in the ancestors array
      const pantryInAncestors = area.ancestors.some((a) => a.id === pantryId);
      expect(pantryInAncestors).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/household-items — list endpoint
  // ---------------------------------------------------------------------------

  describe('GET /api/household-items', () => {
    it('2-level chain: list endpoint returns correct ancestors on matching item', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );

      const rootId = insertTestArea('House');
      const childId = insertTestArea('Living Room', { parentId: rootId });

      const created = householdItemService.createHouseholdItem(app.db, userId, {
        name: 'Couch',
        areaId: childId,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/household-items',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as {
        items: Array<Record<string, unknown>>;
        pagination: unknown;
      };

      const matchingItem = body.items.find((hi) => hi.id === created.id);
      expect(matchingItem).toBeDefined();

      expect(matchingItem!.area).not.toBeNull();
      const area = matchingItem!.area as AreaSummary;
      expect(area.id).toBe(childId);
      expect(area.ancestors).toHaveLength(1);
      expect(area.ancestors[0].id).toBe(rootId);
      expect(area.ancestors[0].name).toBe('House');
    });

    it('household item without area returns area === null in list', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );

      const created = householdItemService.createHouseholdItem(app.db, userId, {
        name: 'No Area Item',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/household-items',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as {
        items: Array<Record<string, unknown>>;
        pagination: unknown;
      };

      const matchingItem = body.items.find((hi) => hi.id === created.id);
      expect(matchingItem).toBeDefined();
      expect(matchingItem!.area).toBeNull();
    });
  });
});

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import * as householdItemService from '../services/householdItemService.js';
import * as schema from '../db/schema.js';
import type { FastifyInstance } from 'fastify';
import type {
  ApiErrorResponse,
  WorkItemLinkedHouseholdItemSummary,
  HouseholdItemCategory,
  HouseholdItemStatus,
} from '@cornerstone/shared';

describe('Work Item Household Items Routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };

    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-wi-hi-routes-test-'));
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
  ): Promise<{ userId: string; cookie: string }> {
    const user = await userService.createLocalUser(app.db, email, displayName, password, 'member');
    const sessionToken = sessionService.createSession(app.db, user.id, 3600);
    return {
      userId: user.id,
      cookie: `cornerstone_session=${sessionToken}`,
    };
  }

  let entityCounter = 0;

  /**
   * Helper: Create a household item directly via the service.
   */
  function createTestHouseholdItem(
    name: string,
    userId: string,
    opts?: { category?: HouseholdItemCategory; expectedDeliveryDate?: string | null },
  ): { id: string; name: string; category: HouseholdItemCategory } {
    const householdItem = householdItemService.createHouseholdItem(app.db, userId, {
      name,
      category: opts?.category,
      expectedDeliveryDate: opts?.expectedDeliveryDate,
    });
    return {
      id: householdItem.id,
      name: householdItem.name,
      category: householdItem.category as HouseholdItemCategory,
    };
  }

  /**
   * Helper: Create a work item directly in the database.
   */
  function createTestWorkItem(
    title: string,
    userId: string,
    opts?: { startDate?: string | null; endDate?: string | null },
  ): { id: string; title: string } {
    const id = `wi-test-${++entityCounter}`;
    const timestamp = new Date(Date.now() + entityCounter).toISOString();

    app.db
      .insert(schema.workItems)
      .values({
        id,
        title,
        status: 'not_started',
        startDate: opts?.startDate ?? null,
        endDate: opts?.endDate ?? null,
        createdBy: userId,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();

    return { id, title };
  }

  // ─── GET /api/work-items/:id/household-items ──────────────────────────────

  describe('GET /api/work-items/:id/household-items', () => {
    it('returns 401 when not authenticated', async () => {
      const { userId } = await createUserWithSession(
        'auth-test@example.com',
        'Auth Test',
        'password123',
      );
      const workItem = createTestWorkItem('Test Task', userId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/work-items/${workItem.id}/household-items`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 200 with empty array when no household items are linked', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItem = createTestWorkItem('Empty Task', userId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/work-items/${workItem.id}/household-items`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ householdItems: WorkItemLinkedHouseholdItemSummary[] }>();
      expect(body.householdItems).toEqual([]);
    });

    it('returns 200 with linked household items including category, status, expectedDeliveryDate', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItem = createTestWorkItem('Installation Task', userId);
      const deliveryDate = '2026-05-01T00:00:00.000Z';
      const householdItem = createTestHouseholdItem('HVAC Unit', userId, {
        category: 'appliances',
        expectedDeliveryDate: deliveryDate,
      });

      // Link the household item
      app.db
        .insert(schema.householdItemWorkItems)
        .values({ householdItemId: householdItem.id, workItemId: workItem.id })
        .run();

      const response = await app.inject({
        method: 'GET',
        url: `/api/work-items/${workItem.id}/household-items`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ householdItems: WorkItemLinkedHouseholdItemSummary[] }>();
      expect(body.householdItems).toHaveLength(1);
      expect(body.householdItems[0]).toMatchObject({
        id: householdItem.id,
        name: 'HVAC Unit',
        category: 'appliances',
        status: 'not_ordered',
        expectedDeliveryDate: deliveryDate,
      });
    });

    it('returns 200 with multiple linked household items', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItem = createTestWorkItem('Multi-Item Task', userId);
      const item1 = createTestHouseholdItem('Item 1', userId, { category: 'appliances' });
      const item2 = createTestHouseholdItem('Item 2', userId, { category: 'fixtures' });

      // Link both items
      app.db
        .insert(schema.householdItemWorkItems)
        .values([
          { householdItemId: item1.id, workItemId: workItem.id },
          { householdItemId: item2.id, workItemId: workItem.id },
        ])
        .run();

      const response = await app.inject({
        method: 'GET',
        url: `/api/work-items/${workItem.id}/household-items`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ householdItems: WorkItemLinkedHouseholdItemSummary[] }>();
      expect(body.householdItems).toHaveLength(2);
      expect(body.householdItems[0].name).toBe('Item 1');
      expect(body.householdItems[1].name).toBe('Item 2');
    });

    it('returns 404 when work item does not exist', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/work-items/non-existent-wi/household-items',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });
});

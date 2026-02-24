import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import type { FastifyInstance } from 'fastify';
import type { ScheduleResponse, ApiErrorResponse, ScheduleRequest } from '@cornerstone/shared';
import { workItems, workItemDependencies } from '../db/schema.js';

describe('Schedule Routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    // Save original environment
    originalEnv = { ...process.env };

    // Create temporary directory for test database
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-schedule-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';

    // Build app (runs migrations)
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

  // ─── Test helpers ───────────────────────────────────────────────────────────

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
   * Helper: Create a work item directly in the database and return its ID.
   */
  function createTestWorkItem(
    userId: string,
    title: string,
    overrides: Partial<{
      status: string;
      durationDays: number | null;
      startDate: string | null;
      endDate: string | null;
      startAfter: string | null;
      startBefore: string | null;
    }> = {},
  ): string {
    const now = new Date().toISOString();
    const workItemId = `work-item-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    app.db
      .insert(workItems)
      .values({
        id: workItemId,
        title,
        status:
          (overrides.status as 'not_started' | 'in_progress' | 'completed' | 'blocked') ??
          'not_started',
        durationDays: overrides.durationDays !== undefined ? overrides.durationDays : 5,
        startDate: overrides.startDate ?? null,
        endDate: overrides.endDate ?? null,
        startAfter: overrides.startAfter ?? null,
        startBefore: overrides.startBefore ?? null,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return workItemId;
  }

  /**
   * Helper: Create a dependency between two work items in the database.
   */
  function createTestDependency(
    predecessorId: string,
    successorId: string,
    dependencyType:
      | 'finish_to_start'
      | 'start_to_start'
      | 'finish_to_finish'
      | 'start_to_finish' = 'finish_to_start',
    leadLagDays = 0,
  ): void {
    app.db
      .insert(workItemDependencies)
      .values({ predecessorId, successorId, dependencyType, leadLagDays })
      .run();
  }

  // ─── POST /api/schedule — Authentication ────────────────────────────────────

  describe('authentication', () => {
    it('should return 401 when request is unauthenticated', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/schedule',
        payload: { mode: 'full' } satisfies ScheduleRequest,
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 with malformed session cookie', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/schedule',
        headers: { cookie: 'cornerstone_session=invalid-token' },
        payload: { mode: 'full' } satisfies ScheduleRequest,
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ─── POST /api/schedule — Input validation ──────────────────────────────────

  describe('input validation', () => {
    it('should return 400 when mode field is missing', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/schedule',
        headers: { cookie },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        payload: {} as any,
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 when mode is an invalid value', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/schedule',
        headers: { cookie },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        payload: { mode: 'invalid_mode' } as any,
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 when mode is "cascade" but anchorWorkItemId is missing', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/schedule',
        headers: { cookie },
        payload: { mode: 'cascade' } satisfies ScheduleRequest,
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when mode is "cascade" and anchorWorkItemId is null', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/schedule',
        headers: { cookie },
        payload: { mode: 'cascade', anchorWorkItemId: null } satisfies ScheduleRequest,
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject unknown body properties', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/schedule',
        headers: { cookie },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        payload: { mode: 'full', unknownField: 'value' } as any,
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // ─── POST /api/schedule — Full mode ─────────────────────────────────────────

  describe('full mode', () => {
    it('should return 200 with empty schedule when no work items exist', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/schedule',
        headers: { cookie },
        payload: { mode: 'full' } satisfies ScheduleRequest,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<ScheduleResponse>();
      expect(body.scheduledItems).toEqual([]);
      expect(body.criticalPath).toEqual([]);
      expect(body.warnings).toEqual([]);
    });

    it('should schedule a single work item in full mode', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const wiId = createTestWorkItem(userId, 'Foundation Work', { durationDays: 10 });

      const response = await app.inject({
        method: 'POST',
        url: '/api/schedule',
        headers: { cookie },
        payload: { mode: 'full' } satisfies ScheduleRequest,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<ScheduleResponse>();
      expect(body.scheduledItems).toHaveLength(1);
      expect(body.scheduledItems[0].workItemId).toBe(wiId);
      expect(body.scheduledItems[0].totalFloat).toBe(0);
      expect(body.scheduledItems[0].isCritical).toBe(true);
    });

    it('should schedule multiple work items with FS dependency in full mode', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const wiA = createTestWorkItem(userId, 'Foundation', { durationDays: 5 });
      const wiB = createTestWorkItem(userId, 'Framing', { durationDays: 8 });
      createTestDependency(wiA, wiB, 'finish_to_start');

      const response = await app.inject({
        method: 'POST',
        url: '/api/schedule',
        headers: { cookie },
        payload: { mode: 'full' } satisfies ScheduleRequest,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<ScheduleResponse>();
      expect(body.scheduledItems).toHaveLength(2);

      const byId = Object.fromEntries(body.scheduledItems.map((si) => [si.workItemId, si]));

      // B must start on or after A's scheduled end date
      expect(byId[wiB].scheduledStartDate >= byId[wiA].scheduledEndDate).toBe(true);

      // Both should be on the critical path
      expect(body.criticalPath).toContain(wiA);
      expect(body.criticalPath).toContain(wiB);
    });

    it('should return all ScheduledItem fields in the response', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      createTestWorkItem(userId, 'Work Item', {
        durationDays: 5,
        startDate: '2026-01-01',
        endDate: '2026-01-06',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/schedule',
        headers: { cookie },
        payload: { mode: 'full' } satisfies ScheduleRequest,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<ScheduleResponse>();
      expect(body.scheduledItems).toHaveLength(1);

      const si = body.scheduledItems[0];
      expect(si).toHaveProperty('workItemId');
      expect(si).toHaveProperty('previousStartDate');
      expect(si).toHaveProperty('previousEndDate');
      expect(si).toHaveProperty('scheduledStartDate');
      expect(si).toHaveProperty('scheduledEndDate');
      expect(si).toHaveProperty('latestStartDate');
      expect(si).toHaveProperty('latestFinishDate');
      expect(si).toHaveProperty('totalFloat');
      expect(si).toHaveProperty('isCritical');

      // previousStartDate should reflect the stored value
      expect(si.previousStartDate).toBe('2026-01-01');
      expect(si.previousEndDate).toBe('2026-01-06');
    });

    it('should include warning when work item has no durationDays', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      createTestWorkItem(userId, 'No Duration Item', { durationDays: null });

      const response = await app.inject({
        method: 'POST',
        url: '/api/schedule',
        headers: { cookie },
        payload: { mode: 'full' } satisfies ScheduleRequest,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<ScheduleResponse>();
      const noDurationWarnings = body.warnings.filter((w) => w.type === 'no_duration');
      expect(noDurationWarnings).toHaveLength(1);
    });

    it('should emit start_before_violated warning when constraint cannot be met', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      // A takes 10 days; B has a startBefore that can't be met after A completes
      const wiA = createTestWorkItem(userId, 'Long Task', { durationDays: 10 });
      const wiB = createTestWorkItem(userId, 'Constrained Task', {
        durationDays: 3,
        startBefore: '2026-01-05', // will be violated since wiA takes 10 days
      });
      createTestDependency(wiA, wiB, 'finish_to_start');

      const response = await app.inject({
        method: 'POST',
        url: '/api/schedule',
        headers: { cookie },
        payload: { mode: 'full' } satisfies ScheduleRequest,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<ScheduleResponse>();
      const violations = body.warnings.filter(
        (w) => w.workItemId === wiB && w.type === 'start_before_violated',
      );
      expect(violations).toHaveLength(1);
    });
  });

  // ─── POST /api/schedule — Cascade mode ──────────────────────────────────────

  describe('cascade mode', () => {
    it('should return 200 with schedule for anchor and its successors', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      // X -> A -> B (cascade from A)
      const wiX = createTestWorkItem(userId, 'Upstream Task X', { durationDays: 3 });
      const wiA = createTestWorkItem(userId, 'Anchor Task A', { durationDays: 5 });
      const wiB = createTestWorkItem(userId, 'Downstream Task B', { durationDays: 4 });
      createTestDependency(wiX, wiA, 'finish_to_start');
      createTestDependency(wiA, wiB, 'finish_to_start');

      const response = await app.inject({
        method: 'POST',
        url: '/api/schedule',
        headers: { cookie },
        payload: { mode: 'cascade', anchorWorkItemId: wiA } satisfies ScheduleRequest,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<ScheduleResponse>();
      const scheduledIds = body.scheduledItems.map((si) => si.workItemId);

      // Anchor and its successor should be scheduled
      expect(scheduledIds).toContain(wiA);
      expect(scheduledIds).toContain(wiB);

      // Upstream item X should NOT be in the cascade result
      expect(scheduledIds).not.toContain(wiX);
    });

    it('should return 404 when cascade anchor work item does not exist', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/schedule',
        headers: { cookie },
        payload: {
          mode: 'cascade',
          anchorWorkItemId: 'nonexistent-work-item-id',
        } satisfies ScheduleRequest,
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('should return 200 with only the anchor when it has no successors', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const wiA = createTestWorkItem(userId, 'Leaf Task', { durationDays: 5 });

      const response = await app.inject({
        method: 'POST',
        url: '/api/schedule',
        headers: { cookie },
        payload: { mode: 'cascade', anchorWorkItemId: wiA } satisfies ScheduleRequest,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<ScheduleResponse>();
      expect(body.scheduledItems).toHaveLength(1);
      expect(body.scheduledItems[0].workItemId).toBe(wiA);
    });
  });

  // ─── POST /api/schedule — Circular dependency ────────────────────────────────

  describe('circular dependency detection', () => {
    it('should return 409 with CIRCULAR_DEPENDENCY code when cycle exists', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const wiA = createTestWorkItem(userId, 'Task A', { durationDays: 5 });
      const wiB = createTestWorkItem(userId, 'Task B', { durationDays: 3 });
      // Create circular dependency: A -> B -> A
      createTestDependency(wiA, wiB, 'finish_to_start');
      createTestDependency(wiB, wiA, 'finish_to_start');

      const response = await app.inject({
        method: 'POST',
        url: '/api/schedule',
        headers: { cookie },
        payload: { mode: 'full' } satisfies ScheduleRequest,
      });

      expect(response.statusCode).toBe(409);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('CIRCULAR_DEPENDENCY');
    });

    it('should return 409 with cycle details in error details', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const wiA = createTestWorkItem(userId, 'Task A', { durationDays: 5 });
      const wiB = createTestWorkItem(userId, 'Task B', { durationDays: 3 });
      const wiC = createTestWorkItem(userId, 'Task C', { durationDays: 4 });
      // 3-node cycle: A -> B -> C -> A
      createTestDependency(wiA, wiB, 'finish_to_start');
      createTestDependency(wiB, wiC, 'finish_to_start');
      createTestDependency(wiC, wiA, 'finish_to_start');

      const response = await app.inject({
        method: 'POST',
        url: '/api/schedule',
        headers: { cookie },
        payload: { mode: 'full' } satisfies ScheduleRequest,
      });

      expect(response.statusCode).toBe(409);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('CIRCULAR_DEPENDENCY');
      // Error details should contain cycle node IDs
      expect(body.error.details).toBeDefined();
    });
  });

  // ─── POST /api/schedule — Read-only verification ─────────────────────────────

  describe('read-only behavior', () => {
    it('should NOT modify work item start/end dates in the database', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      // Create work item with existing dates
      const existingStart = '2025-06-01';
      const existingEnd = '2025-06-06';
      const wiId = createTestWorkItem(userId, 'Existing Dated Task', {
        durationDays: 5,
        startDate: existingStart,
        endDate: existingEnd,
      });

      // Run schedule
      const response = await app.inject({
        method: 'POST',
        url: '/api/schedule',
        headers: { cookie },
        payload: { mode: 'full' } satisfies ScheduleRequest,
      });

      expect(response.statusCode).toBe(200);

      // Verify the database still has the original dates
      const dbItem = app.db
        .select({ startDate: workItems.startDate, endDate: workItems.endDate })
        .from(workItems)
        .all()
        .find((wi) => wi.startDate === existingStart);

      expect(dbItem).toBeDefined();
      expect(dbItem!.startDate).toBe(existingStart);
      expect(dbItem!.endDate).toBe(existingEnd);

      // The scheduled dates in the response reflect CPM computation
      const body = response.json<ScheduleResponse>();
      const si = body.scheduledItems.find((si) => si.workItemId === wiId);
      expect(si).toBeDefined();
      // previousStartDate should reflect the stored (original) value
      expect(si!.previousStartDate).toBe(existingStart);
      expect(si!.previousEndDate).toBe(existingEnd);
    });

    it('should return 200 on repeated calls without side effects', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      createTestWorkItem(userId, 'Task', { durationDays: 5 });

      const firstResponse = await app.inject({
        method: 'POST',
        url: '/api/schedule',
        headers: { cookie },
        payload: { mode: 'full' } satisfies ScheduleRequest,
      });
      const secondResponse = await app.inject({
        method: 'POST',
        url: '/api/schedule',
        headers: { cookie },
        payload: { mode: 'full' } satisfies ScheduleRequest,
      });

      expect(firstResponse.statusCode).toBe(200);
      expect(secondResponse.statusCode).toBe(200);

      // Both responses should be identical since the DB was not changed
      const firstBody = firstResponse.json<ScheduleResponse>();
      const secondBody = secondResponse.json<ScheduleResponse>();
      expect(firstBody.scheduledItems).toEqual(secondBody.scheduledItems);
      expect(firstBody.criticalPath).toEqual(secondBody.criticalPath);
    });
  });

  // ─── POST /api/schedule — All 4 dependency types ────────────────────────────

  describe('dependency type handling', () => {
    it('should correctly handle start_to_start dependency', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const wiA = createTestWorkItem(userId, 'Task A', { durationDays: 5 });
      const wiB = createTestWorkItem(userId, 'Task B', { durationDays: 3 });
      createTestDependency(wiA, wiB, 'start_to_start');

      const response = await app.inject({
        method: 'POST',
        url: '/api/schedule',
        headers: { cookie },
        payload: { mode: 'full' } satisfies ScheduleRequest,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<ScheduleResponse>();
      expect(body.scheduledItems).toHaveLength(2);

      const byId = Object.fromEntries(body.scheduledItems.map((si) => [si.workItemId, si]));
      // SS: B should start same time or after A
      expect(byId[wiB].scheduledStartDate >= byId[wiA].scheduledStartDate).toBe(true);
    });

    it('should correctly handle finish_to_finish dependency', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const wiA = createTestWorkItem(userId, 'Task A', { durationDays: 5 });
      const wiB = createTestWorkItem(userId, 'Task B', { durationDays: 3 });
      createTestDependency(wiA, wiB, 'finish_to_finish');

      const response = await app.inject({
        method: 'POST',
        url: '/api/schedule',
        headers: { cookie },
        payload: { mode: 'full' } satisfies ScheduleRequest,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<ScheduleResponse>();
      const byId = Object.fromEntries(body.scheduledItems.map((si) => [si.workItemId, si]));
      // FF: B should finish same time or after A
      expect(byId[wiB].scheduledEndDate >= byId[wiA].scheduledEndDate).toBe(true);
    });

    it('should correctly handle start_to_finish dependency', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const wiA = createTestWorkItem(userId, 'Task A', { durationDays: 5 });
      const wiB = createTestWorkItem(userId, 'Task B', { durationDays: 3 });
      createTestDependency(wiA, wiB, 'start_to_finish');

      const response = await app.inject({
        method: 'POST',
        url: '/api/schedule',
        headers: { cookie },
        payload: { mode: 'full' } satisfies ScheduleRequest,
      });

      // SF dependency is valid — should return 200
      expect(response.statusCode).toBe(200);
      const body = response.json<ScheduleResponse>();
      expect(body.scheduledItems).toHaveLength(2);
    });

    it('should correctly handle dependency with positive lead/lag days', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const wiA = createTestWorkItem(userId, 'Task A', { durationDays: 5 });
      const wiB = createTestWorkItem(userId, 'Task B', { durationDays: 3 });
      createTestDependency(wiA, wiB, 'finish_to_start', 5); // 5-day lag

      const response = await app.inject({
        method: 'POST',
        url: '/api/schedule',
        headers: { cookie },
        payload: { mode: 'full' } satisfies ScheduleRequest,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<ScheduleResponse>();
      const byId = Object.fromEntries(body.scheduledItems.map((si) => [si.workItemId, si]));

      // B should start 5 days after A's end (lag = 5)
      const aEndDate = new Date(byId[wiA].scheduledEndDate + 'T00:00:00Z');
      aEndDate.setUTCDate(aEndDate.getUTCDate() + 5);
      const expectedStart = aEndDate.toISOString().slice(0, 10);
      expect(byId[wiB].scheduledStartDate).toBe(expectedStart);
    });

    it('should correctly handle dependency with negative lead days (overlap)', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const wiA = createTestWorkItem(userId, 'Task A', { durationDays: 10 });
      const wiB = createTestWorkItem(userId, 'Task B', { durationDays: 3 });
      createTestDependency(wiA, wiB, 'finish_to_start', -3); // 3-day lead (overlap)

      const response = await app.inject({
        method: 'POST',
        url: '/api/schedule',
        headers: { cookie },
        payload: { mode: 'full' } satisfies ScheduleRequest,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<ScheduleResponse>();
      const byId = Object.fromEntries(body.scheduledItems.map((si) => [si.workItemId, si]));

      // B starts 3 days before A's scheduled end (lead = -3)
      const aEndDate = new Date(byId[wiA].scheduledEndDate + 'T00:00:00Z');
      aEndDate.setUTCDate(aEndDate.getUTCDate() - 3);
      const expectedStart = aEndDate.toISOString().slice(0, 10);
      expect(byId[wiB].scheduledStartDate).toBe(expectedStart);
    });
  });

  // ─── POST /api/schedule — Scheduling constraints ─────────────────────────────

  describe('scheduling constraints', () => {
    it('should apply startAfter hard constraint when scheduling', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const futureDate = '2027-06-01';
      const wiId = createTestWorkItem(userId, 'Future Task', {
        durationDays: 5,
        startAfter: futureDate,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/schedule',
        headers: { cookie },
        payload: { mode: 'full' } satisfies ScheduleRequest,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<ScheduleResponse>();
      const si = body.scheduledItems.find((si) => si.workItemId === wiId);
      expect(si).toBeDefined();
      // Must start on or after the startAfter date
      expect(si!.scheduledStartDate >= futureDate).toBe(true);
      expect(si!.scheduledStartDate).toBe(futureDate);
    });
  });

  // ─── POST /api/schedule — Warnings for completed items ─────────────────────

  describe('completed item warnings', () => {
    it('should emit already_completed warning when completed item dates would change', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      // Item completed long ago — CPM would put it in the future
      const wiA = createTestWorkItem(userId, 'Long Task', { durationDays: 10 });
      const wiB = createTestWorkItem(userId, 'Completed Task', {
        durationDays: 5,
        status: 'completed',
        startDate: '2025-01-01',
        endDate: '2025-01-06',
      });
      createTestDependency(wiA, wiB, 'finish_to_start');

      const response = await app.inject({
        method: 'POST',
        url: '/api/schedule',
        headers: { cookie },
        payload: { mode: 'full' } satisfies ScheduleRequest,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<ScheduleResponse>();
      const completedWarnings = body.warnings.filter((w) => w.type === 'already_completed');
      expect(completedWarnings.length).toBeGreaterThan(0);
      expect(completedWarnings[0].workItemId).toBe(wiB);
    });
  });
});

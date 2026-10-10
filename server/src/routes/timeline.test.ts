/**
 * Integration tests for GET /api/timeline.
 *
 * Tests the full request/response cycle using Fastify's app.inject().
 * The real scheduling engine is used (not mocked) since this is an integration test.
 *
 * EPIC-06 Story 6.3 — Timeline Data API
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import type { FastifyInstance } from 'fastify';
import type {
  TimelineResponse,
  ApiErrorResponse,
  WorkItemSummary,
  WorkItemDetail,
} from '@cornerstone/shared';
import {
  workItems,
  workItemDependencies,
  milestones,
  milestoneWorkItems,
  areas,
  householdItems,
} from '../db/schema.js';

describe('Timeline Routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-timeline-test-'));
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

  // ─── Test helpers ─────────────────────────────────────────────────────────

  async function createUserWithSession(
    email: string,
    displayName: string,
    password: string,
    role: 'admin' | 'member' = 'member',
  ): Promise<{ userId: string; cookie: string }> {
    const user = await userService.createLocalUser(app.db, email, displayName, password, role);
    const sessionToken = sessionService.createSession(app.db, user.id, 3600);
    return { userId: user.id, cookie: `cornerstone_session=${sessionToken}` };
  }

  function createTestWorkItem(
    userId: string,
    title: string,
    overrides: Partial<{
      status: 'not_started' | 'in_progress' | 'completed';
      durationDays: number | null;
      startDate: string | null;
      endDate: string | null;
      startAfter: string | null;
      startBefore: string | null;
      assignedUserId: string | null;
    }> = {},
  ): string {
    const now = new Date().toISOString();
    const workItemId = `wi-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    app.db
      .insert(workItems)
      .values({
        id: workItemId,
        title,
        status: overrides.status ?? 'not_started',
        durationDays: overrides.durationDays !== undefined ? overrides.durationDays : null,
        startDate: overrides.startDate ?? null,
        endDate: overrides.endDate ?? null,
        startAfter: overrides.startAfter ?? null,
        startBefore: overrides.startBefore ?? null,
        assignedUserId: overrides.assignedUserId ?? null,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return workItemId;
  }

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

  function createTestMilestone(
    userId: string,
    title: string,
    targetDate: string,
    overrides: Partial<{
      isCompleted: boolean;
      completedAt: string | null;
      color: string | null;
    }> = {},
  ): number {
    const now = new Date().toISOString();
    const result = app.db
      .insert(milestones)
      .values({
        title,
        targetDate,
        isCompleted: overrides.isCompleted ?? false,
        completedAt: overrides.completedAt ?? null,
        color: overrides.color ?? null,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: milestones.id })
      .get();
    return result!.id;
  }

  function linkMilestoneToWorkItem(milestoneId: number, workItemId: string): void {
    app.db.insert(milestoneWorkItems).values({ milestoneId, workItemId }).run();
  }

  /**
   * Returns a YYYY-MM-DD date string `daysFromNow` days after the current real date.
   *
   * Used instead of hardcoded absolute calendar literals for not_started work item
   * fixtures: not_started items get an implicit "today floor" CPM override applied
   * by the scheduling engine (their start date cannot be in the past — see
   * timelineService.ts), so a fixture date that is comfortably in the future never
   * triggers that override and stays immune to calendar drift as real time advances.
   */
  function futureDateStr(daysFromNow: number): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + daysFromNow);
    return d.toISOString().slice(0, 10);
  }

  // ─── Authentication ────────────────────────────────────────────────────────

  describe('authentication', () => {
    it('returns 401 when request is unauthenticated', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/timeline',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 with malformed session cookie', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/timeline',
        headers: { cookie: 'cornerstone_session=not-a-valid-token' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('allows access for member role', async () => {
      const { cookie } = await createUserWithSession(
        'member@example.com',
        'Member User',
        'password123',
        'member',
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/timeline',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
    });

    it('allows access for admin role', async () => {
      const { cookie } = await createUserWithSession(
        'admin@example.com',
        'Admin User',
        'password123',
        'admin',
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/timeline',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // ─── GET /api/timeline — Empty project ──────────────────────────────────────

  describe('empty project', () => {
    it('returns 200 with empty arrays and null dateRange when no data exists', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/timeline',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<TimelineResponse>();
      expect(body.workItems).toEqual([]);
      expect(body.dependencies).toEqual([]);
      expect(body.milestones).toEqual([]);
      expect(body.criticalPath).toEqual([]);
      expect(body.dateRange).toBeNull();
    });
  });

  // ─── GET /api/timeline — Response shape ─────────────────────────────────────

  describe('response shape validation', () => {
    it('returns 200 with all required top-level fields', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/timeline',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<TimelineResponse>();
      expect(body).toHaveProperty('workItems');
      expect(body).toHaveProperty('dependencies');
      expect(body).toHaveProperty('milestones');
      expect(body).toHaveProperty('criticalPath');
      expect(body).toHaveProperty('dateRange');
      expect(Array.isArray(body.workItems)).toBe(true);
      expect(Array.isArray(body.dependencies)).toBe(true);
      expect(Array.isArray(body.milestones)).toBe(true);
      expect(Array.isArray(body.criticalPath)).toBe(true);
    });

    it('returns a TimelineWorkItem with all required fields', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      createTestWorkItem(userId, 'Foundation Work', {
        status: 'in_progress',
        startDate: '2026-03-01',
        endDate: '2026-04-15',
        durationDays: 45,
        startAfter: '2026-02-15',
        startBefore: '2026-05-01',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/timeline',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<TimelineResponse>();
      expect(body.workItems).toHaveLength(1);

      const wi = body.workItems[0]!;
      expect(wi).toHaveProperty('id');
      expect(wi).toHaveProperty('title');
      expect(wi).toHaveProperty('status');
      expect(wi).toHaveProperty('startDate');
      expect(wi).toHaveProperty('endDate');
      expect(wi).toHaveProperty('durationDays');
      expect(wi).toHaveProperty('startAfter');
      expect(wi).toHaveProperty('startBefore');
      expect(wi).toHaveProperty('assignedUser');
      expect(wi).toHaveProperty('area');
      expect(wi).toHaveProperty('assignedVendor');

      expect(wi.title).toBe('Foundation Work');
      expect(wi.status).toBe('in_progress');
      expect(wi.startDate).toBe('2026-03-01');
      expect(wi.endDate).toBe('2026-04-15');
      expect(wi.durationDays).toBe(45);
      expect(wi.startAfter).toBe('2026-02-15');
      expect(wi.startBefore).toBe('2026-05-01');
      expect(wi.assignedUser).toBeNull();
      expect(wi.area).toBeNull();
      expect(wi.assignedVendor).toBeNull();
    });

    it('returns a TimelineDependency with all required fields', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const wiA = createTestWorkItem(userId, 'Task A', { startDate: '2026-03-01' });
      const wiB = createTestWorkItem(userId, 'Task B', { startDate: '2026-04-01' });
      createTestDependency(wiA, wiB, 'finish_to_start', 3);

      const response = await app.inject({
        method: 'GET',
        url: '/api/timeline',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<TimelineResponse>();
      expect(body.dependencies).toHaveLength(1);

      const dep = body.dependencies[0]!;
      expect(dep).toHaveProperty('predecessorId');
      expect(dep).toHaveProperty('successorId');
      expect(dep).toHaveProperty('dependencyType');
      expect(dep).toHaveProperty('leadLagDays');

      expect(dep.predecessorId).toBe(wiA);
      expect(dep.successorId).toBe(wiB);
      expect(dep.dependencyType).toBe('finish_to_start');
      expect(dep.leadLagDays).toBe(3);
    });

    it('returns a TimelineMilestone with all required fields', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const msId = createTestMilestone(userId, 'Foundation Complete', '2026-06-01', {
        color: '#3B82F6',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/timeline',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<TimelineResponse>();
      expect(body.milestones).toHaveLength(1);

      const ms = body.milestones[0]!;
      expect(ms).toHaveProperty('id');
      expect(ms).toHaveProperty('title');
      expect(ms).toHaveProperty('targetDate');
      expect(ms).toHaveProperty('isCompleted');
      expect(ms).toHaveProperty('completedAt');
      expect(ms).toHaveProperty('color');
      expect(ms).toHaveProperty('workItemIds');

      expect(ms.id).toBe(msId);
      expect(ms.title).toBe('Foundation Complete');
      expect(ms.targetDate).toBe('2026-06-01');
      expect(ms.isCompleted).toBe(false);
      expect(ms.completedAt).toBeNull();
      expect(ms.color).toBe('#3B82F6');
      expect(ms.workItemIds).toEqual([]);
    });

    it('returns projectedDate field on TimelineMilestone objects', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const msId = createTestMilestone(userId, 'Foundation Complete', '2026-06-01');

      const response = await app.inject({
        method: 'GET',
        url: '/api/timeline',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<TimelineResponse>();
      const ms = body.milestones.find((m) => m.id === msId);
      expect(ms).toBeDefined();
      // projectedDate must be present (even if null)
      expect(ms).toHaveProperty('projectedDate');
    });

    it('returns projectedDate: null when milestone has no linked work items', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const msId = createTestMilestone(userId, 'Standalone Milestone', '2026-06-01');

      const response = await app.inject({
        method: 'GET',
        url: '/api/timeline',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<TimelineResponse>();
      const ms = body.milestones.find((m) => m.id === msId);
      expect(ms!.projectedDate).toBeNull();
    });

    it('returns projectedDate equal to the max endDate of linked work items', async () => {
      // These fixtures are not_started work items. timelineService applies an
      // implicit "today floor" CPM override to not_started items (their start
      // date cannot be in the past — see timelineService.ts), so hardcoded
      // absolute calendar literals would eventually fall into the past and this
      // assertion would expire. Using dates comfortably in the future (relative
      // to whenever the test actually runs) keeps the fixture permanently immune
      // to that drift.
      //
      // Note: freezing the clock (jest.useFakeTimers/setSystemTime) was tried
      // here first and rejected — it pollutes the shared module-level
      // `lastRescheduleDate` gate in schedulingEngine.ts (used by
      // ensureDailyReschedule), which then causes the *next* test in this file
      // to unexpectedly trigger a real autoReschedule pass against its own
      // database. Relative-date fixtures avoid touching the clock entirely.
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const wiAEndDate = futureDateStr(75);
      const wiBEndDate = futureDateStr(150);
      const wiA = createTestWorkItem(userId, 'Task A', {
        startDate: futureDateStr(30),
        endDate: wiAEndDate,
      });
      const wiB = createTestWorkItem(userId, 'Task B', {
        startDate: futureDateStr(90),
        endDate: wiBEndDate,
      });
      const msId = createTestMilestone(userId, 'Phase 1 Done', futureDateStr(180));
      linkMilestoneToWorkItem(msId, wiA);
      linkMilestoneToWorkItem(msId, wiB);

      const response = await app.inject({
        method: 'GET',
        url: '/api/timeline',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<TimelineResponse>();
      const ms = body.milestones.find((m) => m.id === msId);
      expect(ms).toBeDefined();
      // projectedDate = max endDate = wiB's endDate (both fixture start dates are
      // safely in the future, so the CPM today-floor never overrides them).
      expect(ms!.projectedDate).toBe(wiBEndDate);
    });

    it('falls back to the forecast end (start, zero duration) when linked work items have no endDate', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      // Far-future start so the today floor never applies; no endDate and no duration.
      const wiA = createTestWorkItem(userId, 'Task A', {
        startDate: '2099-03-01',
      });
      const msId = createTestMilestone(userId, 'Phase 1 Done', '2099-06-01');
      linkMilestoneToWorkItem(msId, wiA);

      const response = await app.inject({
        method: 'GET',
        url: '/api/timeline',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<TimelineResponse>();
      const ms = body.milestones.find((m) => m.id === msId);
      expect(ms!.projectedDate).toBe('2099-03-01');
      expect(ms!.isEarly).toBe(true);
    });
  });

  // ─── GET /api/timeline — Work item filtering ─────────────────────────────────

  describe('work item date filtering', () => {
    it('keeps a task without stored dates on the timeline at its forecast dates (A5)', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const wiId = createTestWorkItem(userId, 'Undated Work Item');
      const before = new Date().toISOString().slice(0, 10);

      const response = await app.inject({
        method: 'GET',
        url: '/api/timeline',
        headers: { cookie },
      });
      const after = new Date().toISOString().slice(0, 10);

      expect(response.statusCode).toBe(200);
      const body = response.json<TimelineResponse>();
      expect(body.workItems).toHaveLength(1);
      const item = body.workItems[0]!;
      expect(item.id).toBe(wiId);
      expect(item.startDate).toBeNull();
      expect([before, after]).toContain(item.projectedStartDate);
      expect(item.isLate).toBe(false);
      expect(item.lateDays).toBeNull();
      expect(item.isHeldUp).toBe(false);
    });

    it('includes work items with only startDate set', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const wiId = createTestWorkItem(userId, 'Has Start', { startDate: '2026-03-01' });

      const response = await app.inject({
        method: 'GET',
        url: '/api/timeline',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<TimelineResponse>();
      expect(body.workItems).toHaveLength(1);
      expect(body.workItems[0]!.id).toBe(wiId);
    });

    it('includes work items with only endDate set', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const wiId = createTestWorkItem(userId, 'Has End', { endDate: '2026-06-30' });

      const response = await app.inject({
        method: 'GET',
        url: '/api/timeline',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<TimelineResponse>();
      expect(body.workItems).toHaveLength(1);
      expect(body.workItems[0]!.id).toBe(wiId);
    });

    it('returns dated and undated work items together', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const dated1 = createTestWorkItem(userId, 'Dated 1', { startDate: '2026-03-01' });
      const dated2 = createTestWorkItem(userId, 'Dated 2', { endDate: '2026-07-01' });
      createTestWorkItem(userId, 'Undated 1');
      createTestWorkItem(userId, 'Undated 2');

      const response = await app.inject({
        method: 'GET',
        url: '/api/timeline',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<TimelineResponse>();
      expect(body.workItems).toHaveLength(4);
      const ids = body.workItems.map((w) => w.id);
      expect(ids).toContain(dated1);
      expect(ids).toContain(dated2);
    });
  });

  // ─── GET /api/timeline — Dependencies ────────────────────────────────────────

  describe('dependencies', () => {
    it('returns all dependencies regardless of whether work items have dates', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const wiA = createTestWorkItem(userId, 'Task A');
      const wiB = createTestWorkItem(userId, 'Task B');
      createTestDependency(wiA, wiB, 'finish_to_start');

      const response = await app.inject({
        method: 'GET',
        url: '/api/timeline',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<TimelineResponse>();
      // Undated tasks stay on the timeline through their forecast dates
      expect(body.workItems).toHaveLength(2);
      // But the dependency is still included
      expect(body.dependencies).toHaveLength(1);
      expect(body.dependencies[0]!.predecessorId).toBe(wiA);
      expect(body.dependencies[0]!.successorId).toBe(wiB);
    });

    it('returns multiple dependencies with correct shapes', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const wiA = createTestWorkItem(userId, 'A', { startDate: '2026-03-01' });
      const wiB = createTestWorkItem(userId, 'B', { startDate: '2026-04-01' });
      const wiC = createTestWorkItem(userId, 'C', { startDate: '2026-05-01' });
      createTestDependency(wiA, wiB, 'finish_to_start', 0);
      createTestDependency(wiB, wiC, 'start_to_start', -2);

      const response = await app.inject({
        method: 'GET',
        url: '/api/timeline',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<TimelineResponse>();
      expect(body.dependencies).toHaveLength(2);

      const aBdep = body.dependencies.find((d) => d.predecessorId === wiA && d.successorId === wiB);
      const bCdep = body.dependencies.find((d) => d.predecessorId === wiB && d.successorId === wiC);
      expect(aBdep).toBeDefined();
      expect(aBdep!.dependencyType).toBe('finish_to_start');
      expect(aBdep!.leadLagDays).toBe(0);
      expect(bCdep).toBeDefined();
      expect(bCdep!.dependencyType).toBe('start_to_start');
      expect(bCdep!.leadLagDays).toBe(-2);
    });
  });

  // ─── GET /api/timeline — Milestones ──────────────────────────────────────────

  describe('milestones', () => {
    it('returns milestones with linked work item IDs', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const wiA = createTestWorkItem(userId, 'Task A', { startDate: '2026-03-01' });
      const wiB = createTestWorkItem(userId, 'Task B', { startDate: '2026-04-01' });
      const msId = createTestMilestone(userId, 'Phase 1 Complete', '2026-05-01');
      linkMilestoneToWorkItem(msId, wiA);
      linkMilestoneToWorkItem(msId, wiB);

      const response = await app.inject({
        method: 'GET',
        url: '/api/timeline',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<TimelineResponse>();
      expect(body.milestones).toHaveLength(1);
      expect(body.milestones[0]!.id).toBe(msId);
      expect(body.milestones[0]!.workItemIds).toHaveLength(2);
      expect(body.milestones[0]!.workItemIds).toContain(wiA);
      expect(body.milestones[0]!.workItemIds).toContain(wiB);
    });

    it('returns completedAt and isCompleted on completed milestones', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const completedAt = new Date().toISOString();
      createTestMilestone(userId, 'Done Milestone', '2026-03-01', {
        isCompleted: true,
        completedAt,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/timeline',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<TimelineResponse>();
      expect(body.milestones[0]!.isCompleted).toBe(true);
      expect(body.milestones[0]!.completedAt).toBe(completedAt);
    });

    it('returns empty workItemIds when milestone has no linked work items', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      createTestMilestone(userId, 'Standalone Milestone', '2026-06-01');

      const response = await app.inject({
        method: 'GET',
        url: '/api/timeline',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<TimelineResponse>();
      expect(body.milestones[0]!.workItemIds).toEqual([]);
    });

    it('includes milestones linked to undated work items (link persists even if WI excluded from workItems)', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const wiUndated = createTestWorkItem(userId, 'Undated WI');
      const msId = createTestMilestone(userId, 'Milestone with undated WI', '2026-06-01');
      linkMilestoneToWorkItem(msId, wiUndated);

      const response = await app.inject({
        method: 'GET',
        url: '/api/timeline',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<TimelineResponse>();
      expect(body.workItems).toHaveLength(1); // undated WI stays through its forecast dates
      expect(body.milestones[0]!.workItemIds).toContain(wiUndated); // link still present
    });
  });

  // ─── GET /api/timeline — Critical path ───────────────────────────────────────

  describe('critical path', () => {
    it('returns criticalPath as array of work item IDs', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const wiA = createTestWorkItem(userId, 'Task A', {
        durationDays: 5,
        startDate: '2026-03-01',
      });
      const wiB = createTestWorkItem(userId, 'Task B', {
        durationDays: 3,
        startDate: '2026-04-01',
      });
      createTestDependency(wiA, wiB, 'finish_to_start');

      const response = await app.inject({
        method: 'GET',
        url: '/api/timeline',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<TimelineResponse>();
      // With a FS dependency A→B, both should appear on the critical path
      expect(Array.isArray(body.criticalPath)).toBe(true);
      expect(body.criticalPath).toContain(wiA);
      expect(body.criticalPath).toContain(wiB);
    });

    it('returns empty criticalPath when no work items exist', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/timeline',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<TimelineResponse>();
      expect(body.criticalPath).toEqual([]);
    });

    it('returns empty criticalPath (not 409) when circular dependency exists', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const wiA = createTestWorkItem(userId, 'Task A', {
        durationDays: 5,
        startDate: '2026-03-01',
      });
      const wiB = createTestWorkItem(userId, 'Task B', {
        durationDays: 3,
        startDate: '2026-04-01',
      });
      // Circular: A → B → A
      createTestDependency(wiA, wiB, 'finish_to_start');
      createTestDependency(wiB, wiA, 'finish_to_start');

      const response = await app.inject({
        method: 'GET',
        url: '/api/timeline',
        headers: { cookie },
      });

      // Timeline degrades gracefully on circular dependencies
      // (schedule endpoint returns 409; timeline returns 200 with empty criticalPath)
      expect(response.statusCode).toBe(200);
      const body = response.json<TimelineResponse>();
      expect(body.criticalPath).toEqual([]);
      // Work items are still returned in the timeline even if critical path is empty
      expect(body.workItems).toHaveLength(2);
    });
  });

  // ─── GET /api/timeline — Date range ──────────────────────────────────────────

  describe('dateRange', () => {
    it('computes dateRange from dated work items', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      // Far-future dates so the today floor never moves them.
      createTestWorkItem(userId, 'WI 1', { startDate: '2099-03-01', endDate: '2099-05-15' });
      createTestWorkItem(userId, 'WI 2', { startDate: '2099-01-01', endDate: '2099-08-31' });

      const response = await app.inject({
        method: 'GET',
        url: '/api/timeline',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<TimelineResponse>();
      expect(body.dateRange).not.toBeNull();
      expect(body.dateRange!.earliest).toBe('2099-01-01');
      expect(body.dateRange!.latest).toBe('2099-08-31');
    });

    it('spans today (the forecast) when all work items lack dates', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      createTestWorkItem(userId, 'Undated A');
      createTestWorkItem(userId, 'Undated B');
      const before = new Date().toISOString().slice(0, 10);

      const response = await app.inject({
        method: 'GET',
        url: '/api/timeline',
        headers: { cookie },
      });
      const after = new Date().toISOString().slice(0, 10);

      expect(response.statusCode).toBe(200);
      const body = response.json<TimelineResponse>();
      expect(body.dateRange).not.toBeNull();
      expect([before, after]).toContain(body.dateRange!.earliest);
      expect(body.dateRange!.latest).toBe(body.dateRange!.earliest);
    });

    it('returns non-null dateRange when only startDates are present across work items', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      // Far-future dates so the today floor never moves them.
      createTestWorkItem(userId, 'WI A', { startDate: '2099-06-01' });
      createTestWorkItem(userId, 'WI B', { startDate: '2099-02-15' });

      const response = await app.inject({
        method: 'GET',
        url: '/api/timeline',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<TimelineResponse>();
      expect(body.dateRange).not.toBeNull();
      // earliest = minimum start; with no durations each forecast end equals its start
      expect(body.dateRange!.earliest).toBe('2099-02-15');
      expect(body.dateRange!.latest).toBe('2099-06-01');
    });
  });

  // ─── GET /api/timeline — Assigned user in work items ─────────────────────────

  describe('assignedUser in work items', () => {
    it('returns assignedUser with UserSummary shape when user is assigned', async () => {
      const { userId, cookie } = await createUserWithSession(
        'jane@example.com',
        'Jane Doe',
        'password123',
      );
      createTestWorkItem(userId, 'Task with assignee', {
        startDate: '2026-03-01',
        assignedUserId: userId,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/timeline',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<TimelineResponse>();
      const wi = body.workItems[0]!;
      expect(wi.assignedUser).not.toBeNull();
      expect(wi.assignedUser!.id).toBe(userId);
      expect(wi.assignedUser!.displayName).toBe('Jane Doe');
      expect(wi.assignedUser!.email).toBe('jane@example.com');
    });

    it('returns null assignedUser when work item is unassigned', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      createTestWorkItem(userId, 'Unassigned Task', {
        startDate: '2026-03-01',
        assignedUserId: null,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/timeline',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<TimelineResponse>();
      expect(body.workItems[0]!.assignedUser).toBeNull();
    });
  });

  // ─── GET /api/timeline — Read-only behaviour ──────────────────────────────────

  // ─── Purchase area (#2198) ─────────────────────────────────────────────────

  describe('householdItems[].area', () => {
    function insertAreaRow(id: string, name: string, parentId: string | null) {
      const now = new Date().toISOString();
      app.db
        .insert(areas)
        .values({
          id,
          name,
          parentId,
          color: null,
          description: null,
          sortOrder: 0,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }

    function insertPurchase(id: string, areaId: string | null) {
      const now = new Date().toISOString();
      app.db
        .insert(householdItems)
        .values({
          id,
          name: `Purchase ${id}`,
          categoryId: 'hic-furniture',
          status: 'planned',
          targetDeliveryDate: '2026-05-20',
          areaId,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }

    it('includes area: null for a purchase without an area and the area chain for one with', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      insertAreaRow('area-test-house', 'Test House', null);
      insertAreaRow('area-test-kitchen', 'Test Kitchen', 'area-test-house');
      insertPurchase('hi-no-area', null);
      insertPurchase('hi-in-kitchen', 'area-test-kitchen');

      const response = await app.inject({
        method: 'GET',
        url: '/api/timeline',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<TimelineResponse>();
      const without = body.householdItems.find((h) => h.id === 'hi-no-area')!;
      const within = body.householdItems.find((h) => h.id === 'hi-in-kitchen')!;
      expect(without).toHaveProperty('area');
      expect(without.area).toBeNull();
      expect(within.area).toMatchObject({
        id: 'area-test-kitchen',
        name: 'Test Kitchen',
        ancestors: [{ id: 'area-test-house', name: 'Test House' }],
      });
    });
  });

  describe('read-only behaviour', () => {
    it('does not modify work item dates when called', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      createTestWorkItem(userId, 'Fixed Task', {
        startDate: '2026-03-01',
        endDate: '2026-04-15',
        durationDays: 45,
      });

      await app.inject({
        method: 'GET',
        url: '/api/timeline',
        headers: { cookie },
      });

      // Fetch the work item from DB directly to verify no mutation occurred
      const dbItem = app.db.select().from(workItems).all()[0]!;
      expect(dbItem.startDate).toBe('2026-03-01');
      expect(dbItem.endDate).toBe('2026-04-15');
    });

    it('returns identical responses on repeated calls (idempotent)', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      createTestWorkItem(userId, 'Task', { startDate: '2026-03-01', durationDays: 7 });

      const first = await app.inject({
        method: 'GET',
        url: '/api/timeline',
        headers: { cookie },
      });
      const second = await app.inject({
        method: 'GET',
        url: '/api/timeline',
        headers: { cookie },
      });

      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);
      expect(first.json()).toEqual(second.json());
    });
  });

  // ─── Scheduler truth (contract 4, #2199) ─────────────────────────────────────

  describe('scheduler truth', () => {
    function pastDateStr(daysAgo: number): string {
      return futureDateStr(-daysAgo);
    }

    function todayStr(): string {
      return futureDateStr(0);
    }

    it('reports a late task with planned dates, forecast dates and lateDays (scenario 16)', async () => {
      const { userId, cookie } = await createUserWithSession('u@example.com', 'U', 'password123');
      const planned = pastDateStr(5);
      const wiId = createTestWorkItem(userId, 'Late task', {
        startDate: planned,
        endDate: futureDateStr(-2),
        durationDays: 3,
      });
      const msId = createTestMilestone(userId, 'Late MS', futureDateStr(1));
      linkMilestoneToWorkItem(msId, wiId);

      const response = await app.inject({
        method: 'GET',
        url: '/api/timeline',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<TimelineResponse>();
      const item = body.workItems.find((w) => w.id === wiId)!;
      expect(item.startDate).toBe(planned);
      expect(item.projectedStartDate).toBe(todayStr());
      expect(item.projectedEndDate).toBe(futureDateStr(3));
      expect(item.isLate).toBe(true);
      expect(item.lateDays).toBe(5);

      const ms = body.milestones.find((m) => m.id === msId)!;
      expect(ms.projectedDate).toBe(futureDateStr(3));
      expect(ms.isLate).toBe(true);
      expect(ms.lateDays).toBe(2);
      expect(ms.isEarly).toBe(false);
      expect(ms.earlyDays).toBeNull();

      const maxProjected = Math.max(...body.workItems.map((w) => Date.parse(w.projectedEndDate!)));
      expect(Date.parse(body.dateRange!.latest)).toBeGreaterThanOrEqual(maxProjected);
    });

    it('keeps the critical path unchanged against a pinned fixture', async () => {
      const { userId, cookie } = await createUserWithSession('u@example.com', 'U', 'password123');
      const a = createTestWorkItem(userId, 'A', { startDate: futureDateStr(10), durationDays: 10 });
      const b = createTestWorkItem(userId, 'B', { durationDays: 5 });
      const c = createTestWorkItem(userId, 'C', { startDate: futureDateStr(10), durationDays: 2 });
      createTestDependency(a, b);

      const response = await app.inject({
        method: 'GET',
        url: '/api/timeline',
        headers: { cookie },
      });

      const body = response.json<TimelineResponse>();
      expect(body.criticalPath).toEqual([a, b]);
      expect(body.criticalPath).not.toContain(c);
    });

    it('serves one date source for a not-started task on every endpoint (AC2, scenario 17)', async () => {
      const { userId, cookie } = await createUserWithSession('u@example.com', 'U', 'password123');
      const a = createTestWorkItem(userId, 'Late A', {
        startDate: pastDateStr(5),
        endDate: futureDateStr(-2),
        durationDays: 3,
      });
      const b = createTestWorkItem(userId, 'Held B', {
        startDate: futureDateStr(-2),
        endDate: futureDateStr(2),
        durationDays: 4,
      });
      const onTime = createTestWorkItem(userId, 'On time', {
        startDate: futureDateStr(20),
        endDate: futureDateStr(23),
        durationDays: 3,
      });
      createTestDependency(a, b);
      const msId = createTestMilestone(userId, 'MS', futureDateStr(30));
      linkMilestoneToWorkItem(msId, a);

      const get = async (url: string) => {
        const r = await app.inject({ method: 'GET', url, headers: { cookie } });
        expect(r.statusCode).toBe(200);
        return r.json();
      };

      const timeline = (await get('/api/timeline')) as TimelineResponse;
      const list = (await get('/api/work-items?pageSize=100')) as {
        items: Array<WorkItemSummary>;
      };
      const detail = (await get(`/api/work-items/${a}`)) as WorkItemDetail;
      const deps = (await get(`/api/work-items/${b}/dependencies`)) as {
        predecessors: Array<{ workItem: WorkItemSummary }>;
      };
      const milestone = (await get(`/api/milestones/${msId}`)) as {
        workItems: WorkItemSummary[];
      };

      const pick = (
        w: WorkItemSummary | WorkItemDetail | TimelineResponse['workItems'][number],
      ) => ({
        startDate: w.startDate,
        endDate: w.endDate,
        projectedStartDate: w.projectedStartDate,
        projectedEndDate: w.projectedEndDate,
        isLate: w.isLate,
        lateDays: w.lateDays,
        isHeldUp: w.isHeldUp,
      });

      const fromTimeline = pick(timeline.workItems.find((w) => w.id === a)!);
      expect(pick(list.items.find((w) => w.id === a)!)).toEqual(fromTimeline);
      expect(pick(detail)).toEqual(fromTimeline);
      expect(pick(deps.predecessors[0]!.workItem)).toEqual(fromTimeline);
      expect(pick(milestone.workItems[0]!)).toEqual(fromTimeline);
      expect(fromTimeline.isLate).toBe(true);

      const onTimeFields = pick(timeline.workItems.find((w) => w.id === onTime)!);
      expect(onTimeFields.projectedStartDate).toBe(onTimeFields.startDate);
      expect(onTimeFields.projectedEndDate).toBe(onTimeFields.endDate);
      expect(onTimeFields.isLate).toBe(false);
    });

    it('returns the schedule fields computed after the reschedule on PATCH (scenario 18)', async () => {
      const { userId, cookie } = await createUserWithSession('u@example.com', 'U', 'password123');
      const wiId = createTestWorkItem(userId, 'Late task', {
        startDate: pastDateStr(5),
        endDate: futureDateStr(-2),
        durationDays: 3,
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/work-items/${wiId}`,
        headers: { cookie },
        payload: { durationDays: 6 },
      });

      expect(response.statusCode).toBe(200);
      const detail = response.json<WorkItemDetail>();
      expect(detail.startDate).toBe(pastDateStr(5));
      expect(detail.endDate).toBe(futureDateStr(1));
      expect(detail.projectedEndDate).toBe(futureDateStr(6));
      expect(detail.isLate).toBe(true);
    });

    it('writes exactly one milestone-delay diary entry across repeated reschedules and none once completed (scenario 15)', async () => {
      const { userId, cookie } = await createUserWithSession('u@example.com', 'U', 'password123');
      const wiId = createTestWorkItem(userId, 'Late task', {
        startDate: pastDateStr(5),
        endDate: futureDateStr(-2),
        durationDays: 3,
      });
      const msId = createTestMilestone(userId, 'Overdue MS', pastDateStr(10));
      linkMilestoneToWorkItem(msId, wiId);

      const patch = () =>
        app.inject({
          method: 'PATCH',
          url: `/api/work-items/${wiId}`,
          headers: { cookie },
          payload: { durationDays: 3 },
        });
      const delayEntries = async () => {
        const r = await app.inject({
          method: 'GET',
          url: '/api/diary-entries?type=milestone_delay&automatic=true',
          headers: { cookie },
        });
        expect(r.statusCode).toBe(200);
        return r.json<{ items: Array<{ sourceEntityId: string | null }> }>().items;
      };

      expect((await patch()).statusCode).toBe(200);
      expect((await patch()).statusCode).toBe(200);
      const entries = await delayEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0]!.sourceEntityId).toBe(String(msId));

      const complete = await app.inject({
        method: 'PATCH',
        url: `/api/milestones/${msId}`,
        headers: { cookie },
        payload: { isCompleted: true },
      });
      expect(complete.statusCode).toBe(200);
      expect((await patch()).statusCode).toBe(200);
      expect(await delayEntries()).toHaveLength(1);
    });
  });
});

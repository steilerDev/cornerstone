import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import type { FastifyInstance } from 'fastify';
import type {
  MilestoneListResponse,
  MilestoneDetail,
  MilestoneWorkItemLinkResponse,
  ApiErrorResponse,
  CreateMilestoneRequest,
  UpdateMilestoneRequest,
} from '@cornerstone/shared';
import { workItems } from '../db/schema.js';

describe('Milestone Routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    // Save original environment
    originalEnv = { ...process.env };

    // Create temporary directory for test database
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-milestones-test-'));
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
   * Helper: Create a user and return a session cookie string
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
   * Helper: Create a work item directly in the database
   */
  function createTestWorkItem(userId: string, title: string): string {
    const now = new Date().toISOString();
    const workItemId = `work-item-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    app.db
      .insert(workItems)
      .values({
        id: workItemId,
        title,
        status: 'not_started',
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return workItemId;
  }

  /**
   * Helper: Create a milestone via the API and return the detail
   */
  async function createTestMilestone(
    cookie: string,
    data: CreateMilestoneRequest,
  ): Promise<MilestoneDetail> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/milestones',
      headers: { cookie },
      payload: data,
    });
    expect(response.statusCode).toBe(201);
    return response.json<MilestoneDetail>();
  }

  // ─── GET /api/milestones ─────────────────────────────────────────────────────

  describe('GET /api/milestones', () => {
    it('should return 200 with empty milestones list', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/milestones',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<MilestoneListResponse>();
      expect(body.milestones).toEqual([]);
    });

    it('should return all milestones sorted by target_date ascending', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );

      await createTestMilestone(cookie, { title: 'Milestone B', targetDate: '2026-06-01' });
      await createTestMilestone(cookie, { title: 'Milestone A', targetDate: '2026-04-01' });
      await createTestMilestone(cookie, { title: 'Milestone C', targetDate: '2026-08-01' });

      const response = await app.inject({
        method: 'GET',
        url: '/api/milestones',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<MilestoneListResponse>();
      expect(body.milestones).toHaveLength(3);
      expect(body.milestones[0].title).toBe('Milestone A');
      expect(body.milestones[1].title).toBe('Milestone B');
      expect(body.milestones[2].title).toBe('Milestone C');
    });

    it('should include workItemCount in list response', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItemA = createTestWorkItem(userId, 'Work Item A');
      const workItemB = createTestWorkItem(userId, 'Work Item B');

      const milestone = await createTestMilestone(cookie, {
        title: 'Milestone',
        targetDate: '2026-04-15',
      });

      // Link two work items
      await app.inject({
        method: 'POST',
        url: `/api/milestones/${milestone.id}/work-items`,
        headers: { cookie },
        payload: { workItemId: workItemA },
      });
      await app.inject({
        method: 'POST',
        url: `/api/milestones/${milestone.id}/work-items`,
        headers: { cookie },
        payload: { workItemId: workItemB },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/milestones',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<MilestoneListResponse>();
      expect(body.milestones[0].workItemCount).toBe(2);
    });

    it('should return 401 when unauthenticated', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/milestones',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });

  // ─── POST /api/milestones ────────────────────────────────────────────────────

  describe('POST /api/milestones', () => {
    it('should create a milestone with 201 status', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const payload: CreateMilestoneRequest = {
        title: 'Foundation Complete',
        targetDate: '2026-04-15',
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/milestones',
        headers: { cookie },
        payload,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<MilestoneDetail>();
      expect(body.id).toBeDefined();
      expect(body.title).toBe('Foundation Complete');
      expect(body.targetDate).toBe('2026-04-15');
      expect(body.isCompleted).toBe(false);
      expect(body.completedAt).toBeNull();
      expect(body.workItems).toEqual([]);
    });

    it('should create a milestone with all optional fields', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const payload: CreateMilestoneRequest = {
        title: 'Framing Complete',
        targetDate: '2026-06-01',
        description: 'All framing work done',
        color: '#EF4444',
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/milestones',
        headers: { cookie },
        payload,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<MilestoneDetail>();
      expect(body.description).toBe('All framing work done');
      expect(body.color).toBe('#EF4444');
    });

    it('should set createdBy to the authenticated user', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/milestones',
        headers: { cookie },
        payload: { title: 'Milestone', targetDate: '2026-04-15' },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<MilestoneDetail>();
      expect(body.createdBy).not.toBeNull();
      expect(body.createdBy!.id).toBe(userId);
    });

    it('should return 400 when title is missing', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/milestones',
        headers: { cookie },
        payload: { targetDate: '2026-04-15' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when targetDate is missing', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/milestones',
        headers: { cookie },
        payload: { title: 'Milestone' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when targetDate is not a valid date format', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/milestones',
        headers: { cookie },
        payload: { title: 'Milestone', targetDate: 'not-a-date' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should strip and ignore extra unknown properties (Fastify default)', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );

      // Fastify with additionalProperties: false strips unknown fields rather than rejecting
      const response = await app.inject({
        method: 'POST',
        url: '/api/milestones',
        headers: { cookie },
        payload: { title: 'Milestone', targetDate: '2026-04-15', unknown: 'extra' },
      });

      // Unknown properties are stripped; the request succeeds with the valid fields
      expect(response.statusCode).toBe(201);
      const body = response.json<MilestoneDetail>();
      expect(body.title).toBe('Milestone');
      expect(body).not.toHaveProperty('unknown');
    });

    it('should return 401 when unauthenticated', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/milestones',
        payload: { title: 'Milestone', targetDate: '2026-04-15' },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });

  // ─── GET /api/milestones/:id ─────────────────────────────────────────────────

  describe('GET /api/milestones/:id', () => {
    it('should return milestone detail with 200 status', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const created = await createTestMilestone(cookie, {
        title: 'Foundation Complete',
        targetDate: '2026-04-15',
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/milestones/${created.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<MilestoneDetail>();
      expect(body.id).toBe(created.id);
      expect(body.title).toBe('Foundation Complete');
      expect(body.targetDate).toBe('2026-04-15');
      expect(body.workItems).toEqual([]);
    });

    it('should include linked work items in detail response', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItemA = createTestWorkItem(userId, 'Pour Foundation');
      const workItemB = createTestWorkItem(userId, 'Install Rebar');

      const milestone = await createTestMilestone(cookie, {
        title: 'Foundation Complete',
        targetDate: '2026-04-15',
      });

      await app.inject({
        method: 'POST',
        url: `/api/milestones/${milestone.id}/work-items`,
        headers: { cookie },
        payload: { workItemId: workItemA },
      });
      await app.inject({
        method: 'POST',
        url: `/api/milestones/${milestone.id}/work-items`,
        headers: { cookie },
        payload: { workItemId: workItemB },
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/milestones/${milestone.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<MilestoneDetail>();
      expect(body.workItems).toHaveLength(2);
      const ids = body.workItems.map((w) => w.id);
      expect(ids).toContain(workItemA);
      expect(ids).toContain(workItemB);
    });

    it('should return 404 when milestone does not exist', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/milestones/99999',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toContain('Milestone not found');
    });

    it('should return 401 when unauthenticated', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/milestones/1',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });

  // ─── PATCH /api/milestones/:id ───────────────────────────────────────────────

  describe('PATCH /api/milestones/:id', () => {
    it('should update a milestone with 200 status', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const created = await createTestMilestone(cookie, {
        title: 'Old Title',
        targetDate: '2026-04-15',
      });

      const payload: UpdateMilestoneRequest = { title: 'New Title' };

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/milestones/${created.id}`,
        headers: { cookie },
        payload,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<MilestoneDetail>();
      expect(body.title).toBe('New Title');
    });

    it('should auto-set completedAt when isCompleted becomes true', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const created = await createTestMilestone(cookie, {
        title: 'Milestone',
        targetDate: '2026-04-15',
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/milestones/${created.id}`,
        headers: { cookie },
        payload: { isCompleted: true },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<MilestoneDetail>();
      expect(body.isCompleted).toBe(true);
      expect(body.completedAt).not.toBeNull();
    });

    it('should auto-clear completedAt when isCompleted becomes false', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const created = await createTestMilestone(cookie, {
        title: 'Milestone',
        targetDate: '2026-04-15',
      });

      // Mark as completed first
      await app.inject({
        method: 'PATCH',
        url: `/api/milestones/${created.id}`,
        headers: { cookie },
        payload: { isCompleted: true },
      });

      // Mark as incomplete
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/milestones/${created.id}`,
        headers: { cookie },
        payload: { isCompleted: false },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<MilestoneDetail>();
      expect(body.isCompleted).toBe(false);
      expect(body.completedAt).toBeNull();
    });

    it('should return 404 when milestone does not exist', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/milestones/99999',
        headers: { cookie },
        payload: { title: 'New Title' },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('should return 400 when no fields provided', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const created = await createTestMilestone(cookie, {
        title: 'Milestone',
        targetDate: '2026-04-15',
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/milestones/${created.id}`,
        headers: { cookie },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 when targetDate format is invalid', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const created = await createTestMilestone(cookie, {
        title: 'Milestone',
        targetDate: '2026-04-15',
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/milestones/${created.id}`,
        headers: { cookie },
        payload: { targetDate: 'invalid-date' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should strip and ignore extra unknown properties (Fastify default)', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const created = await createTestMilestone(cookie, {
        title: 'Milestone',
        targetDate: '2026-04-15',
      });

      // Fastify with additionalProperties: false strips unknown fields rather than rejecting
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/milestones/${created.id}`,
        headers: { cookie },
        payload: { title: 'New Title', unknownField: 'value' },
      });

      // Unknown properties are stripped; the request succeeds with the valid fields
      expect(response.statusCode).toBe(200);
      const body = response.json<MilestoneDetail>();
      expect(body.title).toBe('New Title');
      expect(body).not.toHaveProperty('unknownField');
    });

    it('should return 401 when unauthenticated', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/milestones/1',
        payload: { title: 'New Title' },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });

  // ─── DELETE /api/milestones/:id ──────────────────────────────────────────────

  describe('DELETE /api/milestones/:id', () => {
    it('should delete a milestone with 204 status', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const created = await createTestMilestone(cookie, {
        title: 'Milestone',
        targetDate: '2026-04-15',
      });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/milestones/${created.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe('');
    });

    it('should no longer appear in list after deletion', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const created = await createTestMilestone(cookie, {
        title: 'To Be Deleted',
        targetDate: '2026-04-15',
      });

      await app.inject({
        method: 'DELETE',
        url: `/api/milestones/${created.id}`,
        headers: { cookie },
      });

      const listResponse = await app.inject({
        method: 'GET',
        url: '/api/milestones',
        headers: { cookie },
      });
      const body = listResponse.json<MilestoneListResponse>();
      expect(body.milestones).toHaveLength(0);
    });

    it('should cascade-delete work item links but preserve work items themselves', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItemA = createTestWorkItem(userId, 'Work Item A');
      const workItemB = createTestWorkItem(userId, 'Work Item B');

      const milestone = await createTestMilestone(cookie, {
        title: 'Milestone With Items',
        targetDate: '2026-04-15',
      });

      // Link work items
      await app.inject({
        method: 'POST',
        url: `/api/milestones/${milestone.id}/work-items`,
        headers: { cookie },
        payload: { workItemId: workItemA },
      });
      await app.inject({
        method: 'POST',
        url: `/api/milestones/${milestone.id}/work-items`,
        headers: { cookie },
        payload: { workItemId: workItemB },
      });

      // Delete milestone
      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: `/api/milestones/${milestone.id}`,
        headers: { cookie },
      });
      expect(deleteResponse.statusCode).toBe(204);

      // Milestone is gone
      const getResponse = await app.inject({
        method: 'GET',
        url: `/api/milestones/${milestone.id}`,
        headers: { cookie },
      });
      expect(getResponse.statusCode).toBe(404);

      // Create another milestone and link the same work items — if work items were deleted
      // the link would return 404
      const newMilestone = await createTestMilestone(cookie, {
        title: 'New Milestone',
        targetDate: '2026-06-01',
      });
      const linkA = await app.inject({
        method: 'POST',
        url: `/api/milestones/${newMilestone.id}/work-items`,
        headers: { cookie },
        payload: { workItemId: workItemA },
      });
      expect(linkA.statusCode).toBe(201);

      const linkB = await app.inject({
        method: 'POST',
        url: `/api/milestones/${newMilestone.id}/work-items`,
        headers: { cookie },
        payload: { workItemId: workItemB },
      });
      expect(linkB.statusCode).toBe(201);
    });

    it('should return 404 when milestone does not exist', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/milestones/99999',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toContain('Milestone not found');
    });

    it('should return 401 when unauthenticated', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/milestones/1',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });

  // ─── POST /api/milestones/:id/work-items ─────────────────────────────────────

  describe('POST /api/milestones/:id/work-items', () => {
    it('should link a work item with 201 status', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItem = createTestWorkItem(userId, 'Pour Foundation');
      const milestone = await createTestMilestone(cookie, {
        title: 'Foundation Complete',
        targetDate: '2026-04-15',
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/milestones/${milestone.id}/work-items`,
        headers: { cookie },
        payload: { workItemId: workItem },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<MilestoneWorkItemLinkResponse>();
      expect(body.milestoneId).toBe(milestone.id);
      expect(body.workItemId).toBe(workItem);
    });

    it('should make the work item appear in GET /api/milestones/:id', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItem = createTestWorkItem(userId, 'Pour Foundation');
      const milestone = await createTestMilestone(cookie, {
        title: 'Foundation Complete',
        targetDate: '2026-04-15',
      });

      await app.inject({
        method: 'POST',
        url: `/api/milestones/${milestone.id}/work-items`,
        headers: { cookie },
        payload: { workItemId: workItem },
      });

      const getResponse = await app.inject({
        method: 'GET',
        url: `/api/milestones/${milestone.id}`,
        headers: { cookie },
      });
      const detail = getResponse.json<MilestoneDetail>();
      expect(detail.workItems).toHaveLength(1);
      expect(detail.workItems[0].id).toBe(workItem);
      expect(detail.workItems[0].title).toBe('Pour Foundation');
    });

    it('should return 409 when work item is already linked to this milestone', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItem = createTestWorkItem(userId, 'Pour Foundation');
      const milestone = await createTestMilestone(cookie, {
        title: 'Foundation Complete',
        targetDate: '2026-04-15',
      });

      // First link — should succeed
      await app.inject({
        method: 'POST',
        url: `/api/milestones/${milestone.id}/work-items`,
        headers: { cookie },
        payload: { workItemId: workItem },
      });

      // Second link — should conflict
      const response = await app.inject({
        method: 'POST',
        url: `/api/milestones/${milestone.id}/work-items`,
        headers: { cookie },
        payload: { workItemId: workItem },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('CONFLICT');
      expect(body.error.message).toContain('already linked');
    });

    it('should return 404 when milestone does not exist', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItem = createTestWorkItem(userId, 'Work Item');

      const response = await app.inject({
        method: 'POST',
        url: '/api/milestones/99999/work-items',
        headers: { cookie },
        payload: { workItemId: workItem },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toContain('Milestone not found');
    });

    it('should return 404 when work item does not exist', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const milestone = await createTestMilestone(cookie, {
        title: 'Milestone',
        targetDate: '2026-04-15',
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/milestones/${milestone.id}/work-items`,
        headers: { cookie },
        payload: { workItemId: 'nonexistent-work-item' },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toContain('Work item not found');
    });

    it('should return 400 when workItemId is missing', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const milestone = await createTestMilestone(cookie, {
        title: 'Milestone',
        targetDate: '2026-04-15',
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/milestones/${milestone.id}/work-items`,
        headers: { cookie },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 401 when unauthenticated', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/milestones/1/work-items',
        payload: { workItemId: 'some-id' },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });

  // ─── DELETE /api/milestones/:id/work-items/:workItemId ───────────────────────

  describe('DELETE /api/milestones/:id/work-items/:workItemId', () => {
    it('should unlink a work item with 204 status', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItem = createTestWorkItem(userId, 'Pour Foundation');
      const milestone = await createTestMilestone(cookie, {
        title: 'Foundation Complete',
        targetDate: '2026-04-15',
      });

      // Link first
      await app.inject({
        method: 'POST',
        url: `/api/milestones/${milestone.id}/work-items`,
        headers: { cookie },
        payload: { workItemId: workItem },
      });

      // Unlink
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/milestones/${milestone.id}/work-items/${workItem}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe('');
    });

    it('should remove the work item from milestone detail after unlinking', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItemA = createTestWorkItem(userId, 'Work Item A');
      const workItemB = createTestWorkItem(userId, 'Work Item B');
      const milestone = await createTestMilestone(cookie, {
        title: 'Milestone',
        targetDate: '2026-04-15',
      });

      // Link both
      await app.inject({
        method: 'POST',
        url: `/api/milestones/${milestone.id}/work-items`,
        headers: { cookie },
        payload: { workItemId: workItemA },
      });
      await app.inject({
        method: 'POST',
        url: `/api/milestones/${milestone.id}/work-items`,
        headers: { cookie },
        payload: { workItemId: workItemB },
      });

      // Unlink A
      await app.inject({
        method: 'DELETE',
        url: `/api/milestones/${milestone.id}/work-items/${workItemA}`,
        headers: { cookie },
      });

      // Verify only B remains
      const getResponse = await app.inject({
        method: 'GET',
        url: `/api/milestones/${milestone.id}`,
        headers: { cookie },
      });
      const detail = getResponse.json<MilestoneDetail>();
      expect(detail.workItems).toHaveLength(1);
      expect(detail.workItems[0].id).toBe(workItemB);
    });

    it('should return 404 when milestone does not exist', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItem = createTestWorkItem(userId, 'Work Item');

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/milestones/99999/work-items/${workItem}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('should return 404 when work item does not exist', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const milestone = await createTestMilestone(cookie, {
        title: 'Milestone',
        targetDate: '2026-04-15',
      });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/milestones/${milestone.id}/work-items/nonexistent-id`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('should return 404 when work item is not linked to this milestone', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItem = createTestWorkItem(userId, 'Unlinked Work Item');
      const milestone = await createTestMilestone(cookie, {
        title: 'Milestone',
        targetDate: '2026-04-15',
      });

      // Never linked — should return 404
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/milestones/${milestone.id}/work-items/${workItem}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('should return 401 when unauthenticated', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/milestones/1/work-items/some-id',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });
});

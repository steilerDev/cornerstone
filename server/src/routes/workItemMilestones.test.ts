/**
 * Integration tests for the work item milestones route handler.
 *
 * Routes tested (mounted under /api/work-items/:workItemId/milestones):
 * - GET    /                          — list required + linked milestones for a work item
 * - POST   /required/:milestoneId     — add a required milestone dependency
 * - DELETE /required/:milestoneId     — remove a required milestone dependency
 * - POST   /linked/:milestoneId       — link a work item as contributor to a milestone
 * - DELETE /linked/:milestoneId       — unlink a work item from a milestone
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import * as schema from '../db/schema.js';
import type { FastifyInstance } from 'fastify';
import type { WorkItemMilestones, ApiErrorResponse } from '@cornerstone/shared';

describe('Work Item Milestone Routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    // Save original environment
    originalEnv = { ...process.env };

    // Create a temporary directory for the test database
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-wi-milestones-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';

    // Build app (runs migrations automatically)
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
   * Helper: Insert a work item directly into the app database.
   */
  function createTestWorkItem(userId: string, title: string): string {
    const now = new Date().toISOString();
    const workItemId = `wi-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    app.db
      .insert(schema.workItems)
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
   * Helper: Create a milestone via the API and return its integer ID.
   */
  async function createTestMilestone(cookie: string, title: string, targetDate = '2026-06-01'): Promise<number> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/milestones',
      headers: { cookie },
      payload: { title, targetDate },
    });
    expect(response.statusCode).toBe(201);
    return response.json<{ id: number }>().id;
  }

  // ─── GET /api/work-items/:workItemId/milestones ───────────────────────────

  describe('GET /api/work-items/:workItemId/milestones', () => {
    it('returns 200 with empty required and linked arrays for a work item with no milestone links', async () => {
      // Given: An authenticated user and a work item with no milestone relationships
      const { userId, cookie } = await createUserWithSession('user@example.com', 'User', 'pw');
      const workItemId = createTestWorkItem(userId, 'Install panels');

      // When: Getting milestones for the work item
      const response = await app.inject({
        method: 'GET',
        url: `/api/work-items/${workItemId}/milestones`,
        headers: { cookie },
      });

      // Then: 200 with empty arrays
      expect(response.statusCode).toBe(200);
      const body = response.json<WorkItemMilestones>();
      expect(body.required).toEqual([]);
      expect(body.linked).toEqual([]);
    });

    it('returns 200 with required milestones after linking', async () => {
      // Given: A work item and a milestone with a required dependency
      const { userId, cookie } = await createUserWithSession('user@example.com', 'User', 'pw');
      const workItemId = createTestWorkItem(userId, 'Pour concrete');
      const milestoneId = await createTestMilestone(cookie, 'Permits Approved');

      // Add the required milestone link
      await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemId}/milestones/required/${milestoneId}`,
        headers: { cookie },
      });

      // When: Getting milestones
      const response = await app.inject({
        method: 'GET',
        url: `/api/work-items/${workItemId}/milestones`,
        headers: { cookie },
      });

      // Then: Required array has the milestone
      expect(response.statusCode).toBe(200);
      const body = response.json<WorkItemMilestones>();
      expect(body.required).toHaveLength(1);
      expect(body.required[0].id).toBe(milestoneId);
      expect(body.required[0].name).toBe('Permits Approved');
      expect(body.required[0].targetDate).toBe('2026-06-01');
      expect(body.linked).toEqual([]);
    });

    it('returns 200 with linked milestones after linking', async () => {
      // Given: A work item linked as contributor to a milestone
      const { userId, cookie } = await createUserWithSession('user@example.com', 'User', 'pw');
      const workItemId = createTestWorkItem(userId, 'Frame walls');
      const milestoneId = await createTestMilestone(cookie, 'Framing Phase Complete');

      // Add the linked milestone
      await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemId}/milestones/linked/${milestoneId}`,
        headers: { cookie },
      });

      // When: Getting milestones
      const response = await app.inject({
        method: 'GET',
        url: `/api/work-items/${workItemId}/milestones`,
        headers: { cookie },
      });

      // Then: Linked array has the milestone
      expect(response.statusCode).toBe(200);
      const body = response.json<WorkItemMilestones>();
      expect(body.linked).toHaveLength(1);
      expect(body.linked[0].id).toBe(milestoneId);
      expect(body.linked[0].name).toBe('Framing Phase Complete');
      expect(body.required).toEqual([]);
    });

    it('returns 404 when the work item does not exist', async () => {
      // Given: An authenticated user
      const { cookie } = await createUserWithSession('user@example.com', 'User', 'pw');

      // When: Getting milestones for a non-existent work item
      const response = await app.inject({
        method: 'GET',
        url: '/api/work-items/nonexistent-work-item-id/milestones',
        headers: { cookie },
      });

      // Then: 404 NOT_FOUND
      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 401 when unauthenticated', async () => {
      // Given: No auth cookie
      // When: Getting milestones without authentication
      const response = await app.inject({
        method: 'GET',
        url: '/api/work-items/some-work-item-id/milestones',
      });

      // Then: 401 UNAUTHORIZED
      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });

  // ─── POST /api/work-items/:workItemId/milestones/required/:milestoneId ────

  describe('POST /api/work-items/:workItemId/milestones/required/:milestoneId', () => {
    it('returns 201 with updated WorkItemMilestones when adding a required milestone', async () => {
      // Given: An authenticated user, a work item, and a milestone
      const { userId, cookie } = await createUserWithSession('user@example.com', 'User', 'pw');
      const workItemId = createTestWorkItem(userId, 'Lay flooring');
      const milestoneId = await createTestMilestone(cookie, 'Subfloor Approved');

      // When: Adding the required milestone dependency
      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemId}/milestones/required/${milestoneId}`,
        headers: { cookie },
      });

      // Then: 201 with the new required milestone in the response
      expect(response.statusCode).toBe(201);
      const body = response.json<WorkItemMilestones>();
      expect(body.required).toHaveLength(1);
      expect(body.required[0].id).toBe(milestoneId);
      expect(body.required[0].name).toBe('Subfloor Approved');
      expect(body.linked).toEqual([]);
    });

    it('returns 201 and can add multiple required milestones to the same work item', async () => {
      // Given: A work item and two milestones
      const { userId, cookie } = await createUserWithSession('user@example.com', 'User', 'pw');
      const workItemId = createTestWorkItem(userId, 'Final walk-through');
      const milestone1Id = await createTestMilestone(cookie, 'Electric Signed Off', '2026-04-01');
      const milestone2Id = await createTestMilestone(cookie, 'Plumbing Signed Off', '2026-04-15');

      // When: Adding both required milestones
      await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemId}/milestones/required/${milestone1Id}`,
        headers: { cookie },
      });
      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemId}/milestones/required/${milestone2Id}`,
        headers: { cookie },
      });

      // Then: 201 and both required milestones are present
      expect(response.statusCode).toBe(201);
      const body = response.json<WorkItemMilestones>();
      expect(body.required).toHaveLength(2);
      const ids = body.required.map((m) => m.id);
      expect(ids).toContain(milestone1Id);
      expect(ids).toContain(milestone2Id);
    });

    it('returns 404 when the work item does not exist', async () => {
      // Given: A real milestone but non-existent work item
      const { cookie } = await createUserWithSession('user@example.com', 'User', 'pw');
      const milestoneId = await createTestMilestone(cookie, 'Some Milestone');

      // When: Posting to a non-existent work item
      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/nonexistent-wi-id/milestones/required/${milestoneId}`,
        headers: { cookie },
      });

      // Then: 404 NOT_FOUND
      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 when the milestone does not exist', async () => {
      // Given: A real work item but non-existent milestone
      const { userId, cookie } = await createUserWithSession('user@example.com', 'User', 'pw');
      const workItemId = createTestWorkItem(userId, 'Grout tiles');

      // When: Adding a non-existent milestone as required
      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemId}/milestones/required/99999`,
        headers: { cookie },
      });

      // Then: 404 NOT_FOUND
      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 409 when the required dependency already exists (duplicate)', async () => {
      // Given: A required milestone dependency already in place
      const { userId, cookie } = await createUserWithSession('user@example.com', 'User', 'pw');
      const workItemId = createTestWorkItem(userId, 'Hang drywall');
      const milestoneId = await createTestMilestone(cookie, 'Frame Inspection');

      // Add the dependency once
      await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemId}/milestones/required/${milestoneId}`,
        headers: { cookie },
      });

      // When: Adding the same dependency again
      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemId}/milestones/required/${milestoneId}`,
        headers: { cookie },
      });

      // Then: 409 CONFLICT
      expect(response.statusCode).toBe(409);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('CONFLICT');
    });

    it('returns 409 when cross-linking: work item already contributes to this milestone', async () => {
      // Given: A work item already linked as contributor to the milestone
      const { userId, cookie } = await createUserWithSession('user@example.com', 'User', 'pw');
      const workItemId = createTestWorkItem(userId, 'Paint exterior');
      const milestoneId = await createTestMilestone(cookie, 'Exterior Complete');

      // Link as contributor first
      await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemId}/milestones/linked/${milestoneId}`,
        headers: { cookie },
      });

      // When: Also trying to add as a required dependency (cross-link)
      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemId}/milestones/required/${milestoneId}`,
        headers: { cookie },
      });

      // Then: 409 CONFLICT
      expect(response.statusCode).toBe(409);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('CONFLICT');
    });

    it('returns 400 when milestoneId is not an integer', async () => {
      // Given: An authenticated user
      const { userId, cookie } = await createUserWithSession('user@example.com', 'User', 'pw');
      const workItemId = createTestWorkItem(userId, 'Miscellaneous');

      // When: Sending a non-integer milestoneId
      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemId}/milestones/required/not-an-integer`,
        headers: { cookie },
      });

      // Then: 400 validation error
      expect(response.statusCode).toBe(400);
    });

    it('returns 401 when unauthenticated', async () => {
      // When: Adding a required milestone without authentication
      const response = await app.inject({
        method: 'POST',
        url: '/api/work-items/some-id/milestones/required/1',
      });

      // Then: 401 UNAUTHORIZED
      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });

  // ─── DELETE /api/work-items/:workItemId/milestones/required/:milestoneId ──

  describe('DELETE /api/work-items/:workItemId/milestones/required/:milestoneId', () => {
    it('returns 204 when successfully removing a required milestone dependency', async () => {
      // Given: A required milestone dependency in place
      const { userId, cookie } = await createUserWithSession('user@example.com', 'User', 'pw');
      const workItemId = createTestWorkItem(userId, 'Install trim');
      const milestoneId = await createTestMilestone(cookie, 'Painting Complete');

      await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemId}/milestones/required/${milestoneId}`,
        headers: { cookie },
      });

      // When: Removing the dependency
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/work-items/${workItemId}/milestones/required/${milestoneId}`,
        headers: { cookie },
      });

      // Then: 204 No Content
      expect(response.statusCode).toBe(204);
    });

    it('removes the dependency so that GET returns an empty required array', async () => {
      // Given: A required milestone dependency, then it is deleted
      const { userId, cookie } = await createUserWithSession('user@example.com', 'User', 'pw');
      const workItemId = createTestWorkItem(userId, 'Stain deck');
      const milestoneId = await createTestMilestone(cookie, 'Deck Milestone');

      await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemId}/milestones/required/${milestoneId}`,
        headers: { cookie },
      });
      await app.inject({
        method: 'DELETE',
        url: `/api/work-items/${workItemId}/milestones/required/${milestoneId}`,
        headers: { cookie },
      });

      // When: Getting milestones after deletion
      const response = await app.inject({
        method: 'GET',
        url: `/api/work-items/${workItemId}/milestones`,
        headers: { cookie },
      });

      // Then: Required array is empty
      expect(response.statusCode).toBe(200);
      const body = response.json<WorkItemMilestones>();
      expect(body.required).toEqual([]);
    });

    it('returns 404 when the work item does not exist', async () => {
      // Given: A real milestone but non-existent work item
      const { cookie } = await createUserWithSession('user@example.com', 'User', 'pw');
      const milestoneId = await createTestMilestone(cookie, 'Some Milestone');

      // When: Deleting from a non-existent work item
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/work-items/nonexistent-wi/milestones/required/${milestoneId}`,
        headers: { cookie },
      });

      // Then: 404 NOT_FOUND
      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 when the milestone does not exist', async () => {
      // Given: A real work item but non-existent milestone
      const { userId, cookie } = await createUserWithSession('user@example.com', 'User', 'pw');
      const workItemId = createTestWorkItem(userId, 'Install siding');

      // When: Deleting a non-existent milestone
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/work-items/${workItemId}/milestones/required/99999`,
        headers: { cookie },
      });

      // Then: 404 NOT_FOUND
      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 when the dependency does not exist (both exist but not linked)', async () => {
      // Given: Both a work item and milestone exist, but no required link between them
      const { userId, cookie } = await createUserWithSession('user@example.com', 'User', 'pw');
      const workItemId = createTestWorkItem(userId, 'Replace windows');
      const milestoneId = await createTestMilestone(cookie, 'Window Milestone');

      // When: Deleting a dependency that was never created
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/work-items/${workItemId}/milestones/required/${milestoneId}`,
        headers: { cookie },
      });

      // Then: 404 NOT_FOUND
      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 401 when unauthenticated', async () => {
      // When: Deleting without authentication
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/work-items/some-id/milestones/required/1',
      });

      // Then: 401 UNAUTHORIZED
      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });

  // ─── POST /api/work-items/:workItemId/milestones/linked/:milestoneId ─────

  describe('POST /api/work-items/:workItemId/milestones/linked/:milestoneId', () => {
    it('returns 201 with updated WorkItemMilestones when linking a work item to a milestone', async () => {
      // Given: An authenticated user, a work item, and a milestone
      const { userId, cookie } = await createUserWithSession('user@example.com', 'User', 'pw');
      const workItemId = createTestWorkItem(userId, 'Install solar panels');
      const milestoneId = await createTestMilestone(cookie, 'Renewable Energy Phase');

      // When: Linking the work item to the milestone
      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemId}/milestones/linked/${milestoneId}`,
        headers: { cookie },
      });

      // Then: 201 with the linked milestone in the response
      expect(response.statusCode).toBe(201);
      const body = response.json<WorkItemMilestones>();
      expect(body.linked).toHaveLength(1);
      expect(body.linked[0].id).toBe(milestoneId);
      expect(body.linked[0].name).toBe('Renewable Energy Phase');
      expect(body.required).toEqual([]);
    });

    it('returns 201 and can link a work item to multiple milestones', async () => {
      // Given: A work item and two milestones
      const { userId, cookie } = await createUserWithSession('user@example.com', 'User', 'pw');
      const workItemId = createTestWorkItem(userId, 'Grade site');
      const milestone1Id = await createTestMilestone(cookie, 'Site Phase 1', '2026-04-01');
      const milestone2Id = await createTestMilestone(cookie, 'Site Phase 2', '2026-05-01');

      // When: Linking the work item to both milestones
      await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemId}/milestones/linked/${milestone1Id}`,
        headers: { cookie },
      });
      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemId}/milestones/linked/${milestone2Id}`,
        headers: { cookie },
      });

      // Then: 201 and both linked milestones are present
      expect(response.statusCode).toBe(201);
      const body = response.json<WorkItemMilestones>();
      expect(body.linked).toHaveLength(2);
      const ids = body.linked.map((m) => m.id);
      expect(ids).toContain(milestone1Id);
      expect(ids).toContain(milestone2Id);
    });

    it('returns 404 when the work item does not exist', async () => {
      // Given: A real milestone but non-existent work item
      const { cookie } = await createUserWithSession('user@example.com', 'User', 'pw');
      const milestoneId = await createTestMilestone(cookie, 'Some Milestone');

      // When: Linking a non-existent work item
      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/nonexistent-wi/milestones/linked/${milestoneId}`,
        headers: { cookie },
      });

      // Then: 404 NOT_FOUND
      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 when the milestone does not exist', async () => {
      // Given: A real work item but non-existent milestone
      const { userId, cookie } = await createUserWithSession('user@example.com', 'User', 'pw');
      const workItemId = createTestWorkItem(userId, 'Build pergola');

      // When: Linking to a non-existent milestone
      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemId}/milestones/linked/99999`,
        headers: { cookie },
      });

      // Then: 404 NOT_FOUND
      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 409 when the link already exists (duplicate)', async () => {
      // Given: A link already in place
      const { userId, cookie } = await createUserWithSession('user@example.com', 'User', 'pw');
      const workItemId = createTestWorkItem(userId, 'Install fence');
      const milestoneId = await createTestMilestone(cookie, 'Yard Phase');

      // Link once
      await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemId}/milestones/linked/${milestoneId}`,
        headers: { cookie },
      });

      // When: Linking the same pair again
      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemId}/milestones/linked/${milestoneId}`,
        headers: { cookie },
      });

      // Then: 409 CONFLICT
      expect(response.statusCode).toBe(409);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('CONFLICT');
    });

    it('returns 409 when cross-linking: work item already depends on this milestone as required', async () => {
      // Given: A work item that already has the milestone as a required dependency
      const { userId, cookie } = await createUserWithSession('user@example.com', 'User', 'pw');
      const workItemId = createTestWorkItem(userId, 'Landscape rear yard');
      const milestoneId = await createTestMilestone(cookie, 'Grade Approval');

      // Add as required first
      await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemId}/milestones/required/${milestoneId}`,
        headers: { cookie },
      });

      // When: Also trying to add as linked (cross-link)
      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemId}/milestones/linked/${milestoneId}`,
        headers: { cookie },
      });

      // Then: 409 CONFLICT
      expect(response.statusCode).toBe(409);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('CONFLICT');
    });

    it('returns 400 when milestoneId is not an integer', async () => {
      // Given: An authenticated user
      const { userId, cookie } = await createUserWithSession('user@example.com', 'User', 'pw');
      const workItemId = createTestWorkItem(userId, 'Some work item');

      // When: Sending a non-integer milestoneId
      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemId}/milestones/linked/not-an-integer`,
        headers: { cookie },
      });

      // Then: 400 validation error
      expect(response.statusCode).toBe(400);
    });

    it('returns 401 when unauthenticated', async () => {
      // When: Linking without authentication
      const response = await app.inject({
        method: 'POST',
        url: '/api/work-items/some-id/milestones/linked/1',
      });

      // Then: 401 UNAUTHORIZED
      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });

  // ─── DELETE /api/work-items/:workItemId/milestones/linked/:milestoneId ───

  describe('DELETE /api/work-items/:workItemId/milestones/linked/:milestoneId', () => {
    it('returns 204 when successfully unlinking a work item from a milestone', async () => {
      // Given: A work item linked to a milestone
      const { userId, cookie } = await createUserWithSession('user@example.com', 'User', 'pw');
      const workItemId = createTestWorkItem(userId, 'Clean construction debris');
      const milestoneId = await createTestMilestone(cookie, 'Cleanup Phase');

      await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemId}/milestones/linked/${milestoneId}`,
        headers: { cookie },
      });

      // When: Unlinking the work item
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/work-items/${workItemId}/milestones/linked/${milestoneId}`,
        headers: { cookie },
      });

      // Then: 204 No Content
      expect(response.statusCode).toBe(204);
    });

    it('removes the link so that GET returns an empty linked array', async () => {
      // Given: A linked milestone, then unlinked
      const { userId, cookie } = await createUserWithSession('user@example.com', 'User', 'pw');
      const workItemId = createTestWorkItem(userId, 'Pour foundation');
      const milestoneId = await createTestMilestone(cookie, 'Foundation Phase');

      await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemId}/milestones/linked/${milestoneId}`,
        headers: { cookie },
      });
      await app.inject({
        method: 'DELETE',
        url: `/api/work-items/${workItemId}/milestones/linked/${milestoneId}`,
        headers: { cookie },
      });

      // When: Getting milestones after unlink
      const response = await app.inject({
        method: 'GET',
        url: `/api/work-items/${workItemId}/milestones`,
        headers: { cookie },
      });

      // Then: Linked array is empty
      expect(response.statusCode).toBe(200);
      const body = response.json<WorkItemMilestones>();
      expect(body.linked).toEqual([]);
    });

    it('returns 404 when the work item does not exist', async () => {
      // Given: A real milestone but non-existent work item
      const { cookie } = await createUserWithSession('user@example.com', 'User', 'pw');
      const milestoneId = await createTestMilestone(cookie, 'Some Milestone');

      // When: Deleting a link on a non-existent work item
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/work-items/nonexistent-wi/milestones/linked/${milestoneId}`,
        headers: { cookie },
      });

      // Then: 404 NOT_FOUND
      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 when the milestone does not exist', async () => {
      // Given: A real work item but non-existent milestone
      const { userId, cookie } = await createUserWithSession('user@example.com', 'User', 'pw');
      const workItemId = createTestWorkItem(userId, 'Install lighting');

      // When: Unlinking a non-existent milestone
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/work-items/${workItemId}/milestones/linked/99999`,
        headers: { cookie },
      });

      // Then: 404 NOT_FOUND
      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 when the link does not exist (both exist but never linked)', async () => {
      // Given: Both a work item and milestone exist, but no link between them
      const { userId, cookie } = await createUserWithSession('user@example.com', 'User', 'pw');
      const workItemId = createTestWorkItem(userId, 'Apply waterproofing');
      const milestoneId = await createTestMilestone(cookie, 'Waterproofing Milestone');

      // When: Deleting a link that was never created
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/work-items/${workItemId}/milestones/linked/${milestoneId}`,
        headers: { cookie },
      });

      // Then: 404 NOT_FOUND
      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 401 when unauthenticated', async () => {
      // When: Unlinking without authentication
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/work-items/some-id/milestones/linked/1',
      });

      // Then: 401 UNAUTHORIZED
      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });

  // ─── Cross-cutting concerns ───────────────────────────────────────────────

  describe('Cross-cutting: member and admin role access', () => {
    it('allows member role to add a required milestone dependency', async () => {
      // Given: A member user
      const { userId, cookie } = await createUserWithSession(
        'member@example.com',
        'Member',
        'pw',
        'member',
      );
      const workItemId = createTestWorkItem(userId, 'Install fixtures');
      const milestoneId = await createTestMilestone(cookie, 'Milestone');

      // When: Member adds a required milestone
      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemId}/milestones/required/${milestoneId}`,
        headers: { cookie },
      });

      // Then: Succeeds with 201
      expect(response.statusCode).toBe(201);
    });

    it('allows admin role to add a linked milestone', async () => {
      // Given: An admin user
      const { userId, cookie } = await createUserWithSession(
        'admin@example.com',
        'Admin',
        'pw',
        'admin',
      );
      const workItemId = createTestWorkItem(userId, 'Inspect foundation');
      const milestoneId = await createTestMilestone(cookie, 'Milestone');

      // When: Admin adds a linked milestone
      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemId}/milestones/linked/${milestoneId}`,
        headers: { cookie },
      });

      // Then: Succeeds with 201
      expect(response.statusCode).toBe(201);
    });
  });
});

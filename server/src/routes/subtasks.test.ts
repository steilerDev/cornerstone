import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import type { FastifyInstance } from 'fastify';
import type {
  SubtaskResponse,
  ApiErrorResponse,
  CreateSubtaskRequest,
  ReorderSubtasksRequest,
} from '@cornerstone/shared';
import { workItems, workItemSubtasks } from '../db/schema.js';

describe('Subtask Routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    // Save original environment
    originalEnv = { ...process.env };

    // Create temporary directory for test database
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-subtasks-test-'));
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
   * Helper: Create a subtask directly in the database
   */
  function createTestSubtask(
    workItemId: string,
    title: string,
    sortOrder: number,
    isCompleted: boolean = false,
  ): string {
    const now = new Date().toISOString();
    const subtaskId = `subtask-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    app.db
      .insert(workItemSubtasks)
      .values({
        id: subtaskId,
        workItemId,
        title,
        isCompleted,
        sortOrder,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return subtaskId;
  }

  describe('POST /api/work-items/:workItemId/subtasks', () => {
    it('creates a subtask with explicit sortOrder (UAT-3.4-18)', async () => {
      // Given: Authenticated user and work item
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password',
      );
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      const body: CreateSubtaskRequest = { title: 'First subtask', sortOrder: 0 };

      // When: Creating a subtask
      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemId}/subtasks`,
        headers: { cookie },
        payload: body,
      });

      // Then: 201 with subtask response
      expect(response.statusCode).toBe(201);
      const result = response.json<SubtaskResponse>();
      expect(result.id).toBeDefined();
      expect(result.title).toBe('First subtask');
      expect(result.isCompleted).toBe(false);
      expect(result.sortOrder).toBe(0);
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });

    it('creates a subtask without sortOrder (auto-appends) (UAT-3.4-19)', async () => {
      // Given: Work item with existing subtasks
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password',
      );
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      createTestSubtask(workItemId, 'Existing subtask 1', 0);
      createTestSubtask(workItemId, 'Existing subtask 2', 1);

      const body: CreateSubtaskRequest = { title: 'New subtask' };

      // When: Creating a subtask without sortOrder
      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemId}/subtasks`,
        headers: { cookie },
        payload: body,
      });

      // Then: 201 with subtask appended to end
      expect(response.statusCode).toBe(201);
      const result = response.json<SubtaskResponse>();
      expect(result.sortOrder).toBe(2);
      expect(result.title).toBe('New subtask');
    });

    it('returns 401 if user is not authenticated', async () => {
      // Given: Work item exists but user is not authenticated
      const { userId } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      const body: CreateSubtaskRequest = { title: 'Subtask without auth' };

      // When: Creating a subtask without auth
      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemId}/subtasks`,
        payload: body,
      });

      // Then: 401 Unauthorized
      expect(response.statusCode).toBe(401);
      const error = response.json<ApiErrorResponse>();
      expect(error.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 404 if work item does not exist (UAT-3.4-20)', async () => {
      // Given: Authenticated user, no work item
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const body: CreateSubtaskRequest = { title: 'Subtask on missing work item' };

      // When: Creating a subtask on non-existent work item
      const response = await app.inject({
        method: 'POST',
        url: '/api/work-items/nonexistent-work-item/subtasks',
        headers: { cookie },
        payload: body,
      });

      // Then: 404 Not Found
      expect(response.statusCode).toBe(404);
      const error = response.json<ApiErrorResponse>();
      expect(error.error.code).toBe('NOT_FOUND');
      expect(error.error.message).toContain('Work item not found');
    });

    it('returns 400 if title is missing', async () => {
      // Given: Authenticated user and work item
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password',
      );
      const workItemId = createTestWorkItem(userId, 'Test Work Item');

      // When: Creating a subtask without title
      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemId}/subtasks`,
        headers: { cookie },
        payload: {},
      });

      // Then: 400 Validation Error
      expect(response.statusCode).toBe(400);
      const error = response.json<ApiErrorResponse>();
      expect(error.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 if title is empty string (UAT-3.4-21)', async () => {
      // Given: Authenticated user and work item
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password',
      );
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      const body: CreateSubtaskRequest = { title: '   ' };

      // When: Creating a subtask with empty title
      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemId}/subtasks`,
        headers: { cookie },
        payload: body,
      });

      // Then: 400 Validation Error
      expect(response.statusCode).toBe(400);
      const error = response.json<ApiErrorResponse>();
      expect(error.error.code).toBe('VALIDATION_ERROR');
      expect(error.error.message).toContain('Subtask title cannot be empty');
    });
  });

  describe('GET /api/work-items/:workItemId/subtasks', () => {
    it('returns subtasks sorted by sort_order ASC (UAT-3.4-22)', async () => {
      // Given: Authenticated user and work item with multiple subtasks
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password',
      );
      const workItemId = createTestWorkItem(userId, 'Test Work Item');

      const subtask2Id = createTestSubtask(workItemId, 'Second subtask', 2);
      const subtask0Id = createTestSubtask(workItemId, 'First subtask', 0);
      const subtask1Id = createTestSubtask(workItemId, 'Middle subtask', 1);

      // When: Getting subtasks
      const response = await app.inject({
        method: 'GET',
        url: `/api/work-items/${workItemId}/subtasks`,
        headers: { cookie },
      });

      // Then: 200 with subtasks sorted by sortOrder
      expect(response.statusCode).toBe(200);
      const body = response.json<{ subtasks: SubtaskResponse[] }>();
      expect(body.subtasks).toHaveLength(3);
      expect(body.subtasks[0].id).toBe(subtask0Id);
      expect(body.subtasks[1].id).toBe(subtask1Id);
      expect(body.subtasks[2].id).toBe(subtask2Id);
    });

    it('returns empty array when no subtasks exist (UAT-3.4-23)', async () => {
      // Given: Authenticated user and work item with no subtasks
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password',
      );
      const workItemId = createTestWorkItem(userId, 'Test Work Item');

      // When: Getting subtasks
      const response = await app.inject({
        method: 'GET',
        url: `/api/work-items/${workItemId}/subtasks`,
        headers: { cookie },
      });

      // Then: 200 with empty array
      expect(response.statusCode).toBe(200);
      const body = response.json<{ subtasks: SubtaskResponse[] }>();
      expect(body.subtasks).toEqual([]);
    });

    it('returns 401 if user is not authenticated', async () => {
      // Given: Work item exists but user is not authenticated
      const { userId } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const workItemId = createTestWorkItem(userId, 'Test Work Item');

      // When: Getting subtasks without auth
      const response = await app.inject({
        method: 'GET',
        url: `/api/work-items/${workItemId}/subtasks`,
      });

      // Then: 401 Unauthorized
      expect(response.statusCode).toBe(401);
      const error = response.json<ApiErrorResponse>();
      expect(error.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 404 if work item does not exist', async () => {
      // Given: Authenticated user, no work item
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      // When: Getting subtasks for non-existent work item
      const response = await app.inject({
        method: 'GET',
        url: '/api/work-items/nonexistent-work-item/subtasks',
        headers: { cookie },
      });

      // Then: 404 Not Found
      expect(response.statusCode).toBe(404);
      const error = response.json<ApiErrorResponse>();
      expect(error.error.code).toBe('NOT_FOUND');
      expect(error.error.message).toContain('Work item not found');
    });
  });

  describe('PATCH /api/work-items/:workItemId/subtasks/:subtaskId', () => {
    it('updates subtask title only (UAT-3.4-24)', async () => {
      // Given: Subtask exists
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password',
      );
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      const subtaskId = createTestSubtask(workItemId, 'Original title', 0);

      // When: Updating title
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/work-items/${workItemId}/subtasks/${subtaskId}`,
        headers: { cookie },
        payload: { title: 'Updated title' },
      });

      // Then: 200 with updated subtask
      expect(response.statusCode).toBe(200);
      const result = response.json<SubtaskResponse>();
      expect(result.title).toBe('Updated title');
      expect(result.id).toBe(subtaskId);
    });

    it('updates subtask isCompleted only (UAT-3.4-25)', async () => {
      // Given: Subtask exists with isCompleted=false
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password',
      );
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      const subtaskId = createTestSubtask(workItemId, 'Test subtask', 0, false);

      // When: Updating isCompleted
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/work-items/${workItemId}/subtasks/${subtaskId}`,
        headers: { cookie },
        payload: { isCompleted: true },
      });

      // Then: 200 with updated isCompleted
      expect(response.statusCode).toBe(200);
      const result = response.json<SubtaskResponse>();
      expect(result.isCompleted).toBe(true);
      expect(result.title).toBe('Test subtask'); // Unchanged
    });

    it('updates subtask sortOrder only (UAT-3.4-26)', async () => {
      // Given: Subtask exists
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password',
      );
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      const subtaskId = createTestSubtask(workItemId, 'Test subtask', 0);

      // When: Updating sortOrder
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/work-items/${workItemId}/subtasks/${subtaskId}`,
        headers: { cookie },
        payload: { sortOrder: 5 },
      });

      // Then: 200 with updated sortOrder
      expect(response.statusCode).toBe(200);
      const result = response.json<SubtaskResponse>();
      expect(result.sortOrder).toBe(5);
      expect(result.title).toBe('Test subtask'); // Unchanged
    });

    it('returns 400 if no fields provided (UAT-3.4-27)', async () => {
      // Given: Subtask exists
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password',
      );
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      const subtaskId = createTestSubtask(workItemId, 'Test subtask', 0);

      // When: Updating with no fields
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/work-items/${workItemId}/subtasks/${subtaskId}`,
        headers: { cookie },
        payload: {},
      });

      // Then: 400 Validation Error
      expect(response.statusCode).toBe(400);
      const error = response.json<ApiErrorResponse>();
      expect(error.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 if subtask does not exist (UAT-3.4-28)', async () => {
      // Given: Authenticated user and work item
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password',
      );
      const workItemId = createTestWorkItem(userId, 'Test Work Item');

      // When: Updating non-existent subtask
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/work-items/${workItemId}/subtasks/nonexistent-subtask`,
        headers: { cookie },
        payload: { title: 'Update' },
      });

      // Then: 404 Not Found
      expect(response.statusCode).toBe(404);
      const error = response.json<ApiErrorResponse>();
      expect(error.error.code).toBe('NOT_FOUND');
      expect(error.error.message).toContain('Subtask not found');
    });

    it('returns 401 if user is not authenticated', async () => {
      // Given: A subtask exists
      const { userId } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      const subtaskId = createTestSubtask(workItemId, 'Test subtask', 0);

      // When: Updating without auth
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/work-items/${workItemId}/subtasks/${subtaskId}`,
        payload: { title: 'Update' },
      });

      // Then: 401 Unauthorized
      expect(response.statusCode).toBe(401);
      const error = response.json<ApiErrorResponse>();
      expect(error.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('PATCH /api/work-items/:workItemId/subtasks/reorder', () => {
    it('reorders subtasks to match provided array order (UAT-3.4-31)', async () => {
      // Given: Work item with 3 subtasks
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password',
      );
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      const subtask0Id = createTestSubtask(workItemId, 'First', 0);
      const subtask1Id = createTestSubtask(workItemId, 'Second', 1);
      const subtask2Id = createTestSubtask(workItemId, 'Third', 2);

      // When: Reordering to reverse order
      const body: ReorderSubtasksRequest = {
        subtaskIds: [subtask2Id, subtask1Id, subtask0Id],
      };
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/work-items/${workItemId}/subtasks/reorder`,
        headers: { cookie },
        payload: body,
      });

      // Then: 200 with reordered subtasks
      expect(response.statusCode).toBe(200);
      const result = response.json<{ subtasks: SubtaskResponse[] }>();
      expect(result.subtasks).toHaveLength(3);
      expect(result.subtasks[0].id).toBe(subtask2Id);
      expect(result.subtasks[0].sortOrder).toBe(0);
      expect(result.subtasks[1].id).toBe(subtask1Id);
      expect(result.subtasks[1].sortOrder).toBe(1);
      expect(result.subtasks[2].id).toBe(subtask0Id);
      expect(result.subtasks[2].sortOrder).toBe(2);
    });

    it('returns 400 if subtaskIds array is empty (UAT-3.4-32)', async () => {
      // Given: Work item exists
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password',
      );
      const workItemId = createTestWorkItem(userId, 'Test Work Item');

      // When: Reordering with empty array
      const body: ReorderSubtasksRequest = { subtaskIds: [] };
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/work-items/${workItemId}/subtasks/reorder`,
        headers: { cookie },
        payload: body,
      });

      // Then: 400 Validation Error
      expect(response.statusCode).toBe(400);
      const error = response.json<ApiErrorResponse>();
      expect(error.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 if subtaskIds contains invalid ID (UAT-3.4-33)', async () => {
      // Given: Work item with two subtasks
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password',
      );
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      const subtask0Id = createTestSubtask(workItemId, 'Valid subtask 1', 0);
      createTestSubtask(workItemId, 'Valid subtask 2', 1);

      // When: Reordering with invalid ID (but correct count)
      const body: ReorderSubtasksRequest = {
        subtaskIds: [subtask0Id, 'invalid-subtask-id'],
      };
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/work-items/${workItemId}/subtasks/reorder`,
        headers: { cookie },
        payload: body,
      });

      // Then: 400 Validation Error
      expect(response.statusCode).toBe(400);
      const error = response.json<ApiErrorResponse>();
      expect(error.error.code).toBe('VALIDATION_ERROR');
      expect(error.error.message).toContain('Some subtask IDs do not belong to this work item');
    });

    it('returns 401 if user is not authenticated', async () => {
      // Given: Work item with subtasks exists
      const { userId } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      const subtaskId = createTestSubtask(workItemId, 'Test subtask', 0);

      // When: Reordering without auth
      const body: ReorderSubtasksRequest = { subtaskIds: [subtaskId] };
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/work-items/${workItemId}/subtasks/reorder`,
        payload: body,
      });

      // Then: 401 Unauthorized
      expect(response.statusCode).toBe(401);
      const error = response.json<ApiErrorResponse>();
      expect(error.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 400 if partial reorder is attempted (not all IDs provided)', async () => {
      // Given: Work item with 3 subtasks
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password',
      );
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      const subtask0Id = createTestSubtask(workItemId, 'First', 0);
      const subtask1Id = createTestSubtask(workItemId, 'Second', 1);
      createTestSubtask(workItemId, 'Third', 2);

      // When: Reordering only 2 out of 3 subtasks
      const body: ReorderSubtasksRequest = { subtaskIds: [subtask1Id, subtask0Id] };
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/work-items/${workItemId}/subtasks/reorder`,
        headers: { cookie },
        payload: body,
      });

      // Then: 400 Validation Error (API contract requires all IDs)
      expect(response.statusCode).toBe(400);
      const error = response.json<ApiErrorResponse>();
      expect(error.error.code).toBe('VALIDATION_ERROR');
      expect(error.error.message).toContain('All subtask IDs must be provided for reorder');
    });
  });

  describe('DELETE /api/work-items/:workItemId/subtasks/:subtaskId', () => {
    it('deletes a subtask successfully (UAT-3.4-29)', async () => {
      // Given: Subtask exists
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password',
      );
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      const subtaskId = createTestSubtask(workItemId, 'Subtask to delete', 0);

      // When: Deleting the subtask
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/work-items/${workItemId}/subtasks/${subtaskId}`,
        headers: { cookie },
      });

      // Then: 204 No Content
      expect(response.statusCode).toBe(204);
      expect(response.body).toBe('');
    });

    it('returns 404 if subtask does not exist (UAT-3.4-30)', async () => {
      // Given: Authenticated user and work item
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password',
      );
      const workItemId = createTestWorkItem(userId, 'Test Work Item');

      // When: Deleting non-existent subtask
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/work-items/${workItemId}/subtasks/nonexistent-subtask`,
        headers: { cookie },
      });

      // Then: 404 Not Found
      expect(response.statusCode).toBe(404);
      const error = response.json<ApiErrorResponse>();
      expect(error.error.code).toBe('NOT_FOUND');
      expect(error.error.message).toContain('Subtask not found');
    });

    it('returns 401 if user is not authenticated', async () => {
      // Given: A subtask exists
      const { userId } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      const subtaskId = createTestSubtask(workItemId, 'Test subtask', 0);

      // When: Deleting without auth
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/work-items/${workItemId}/subtasks/${subtaskId}`,
      });

      // Then: 401 Unauthorized
      expect(response.statusCode).toBe(401);
      const error = response.json<ApiErrorResponse>();
      expect(error.error.code).toBe('UNAUTHORIZED');
    });
  });
});

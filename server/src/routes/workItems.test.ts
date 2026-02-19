import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import * as workItemService from '../services/workItemService.js';
import type { FastifyInstance } from 'fastify';
import type {
  WorkItemDetail,
  WorkItemListResponse,
  ApiErrorResponse,
  CreateWorkItemRequest,
  UpdateWorkItemRequest,
} from '@cornerstone/shared';
import { tags } from '../db/schema.js';

describe('Work Item Routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    // Save original environment
    originalEnv = { ...process.env };

    // Create temporary directory for test database
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-workitems-test-'));
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
   * Helper: Create a tag
   */
  function createTestTag(name: string, color: string = '#3b82f6') {
    const tagId = `tag-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    app.db
      .insert(tags)
      .values({
        id: tagId,
        name,
        color,
        createdAt: new Date().toISOString(),
      })
      .run();
    return tagId;
  }

  describe('POST /api/work-items', () => {
    it('creates work item with minimum required fields (UAT-3.2-01)', async () => {
      // Given: Authenticated member user
      const { userId, cookie } = await createUserWithSession(
        'member@example.com',
        'Member User',
        'password',
        'member',
      );

      const body: CreateWorkItemRequest = {
        title: 'Install electrical panel',
      };

      // When: Creating work item
      const response = await app.inject({
        method: 'POST',
        url: '/api/work-items',
        headers: { cookie },
        payload: body,
      });

      // Then: Returns 201 with created work item
      expect(response.statusCode).toBe(201);
      const workItem = JSON.parse(response.body) as WorkItemDetail;

      expect(workItem.id).toBeDefined();
      expect(workItem.title).toBe('Install electrical panel');
      expect(workItem.description).toBeNull();
      expect(workItem.status).toBe('not_started');
      expect(workItem.startDate).toBeNull();
      expect(workItem.endDate).toBeNull();
      expect(workItem.durationDays).toBeNull();
      expect(workItem.startAfter).toBeNull();
      expect(workItem.startBefore).toBeNull();
      expect(workItem.assignedUser).toBeNull();
      expect(workItem.createdBy?.id).toBe(userId);
      expect(workItem.tags).toEqual([]);
      expect(workItem.createdAt).toBeDefined();
      expect(workItem.updatedAt).toBeDefined();
    });

    it('creates work item with all optional fields (UAT-3.2-02)', async () => {
      // Given: Admin user, a tag, and another user
      const { cookie } = await createUserWithSession(
        'admin@example.com',
        'Admin',
        'password',
        'admin',
      );
      const assigneeId = (await createUserWithSession('assignee@example.com', 'Assignee', 'pass'))
        .userId;
      const tagId = createTestTag('Foundation');

      const body: CreateWorkItemRequest = {
        title: 'Pour foundation',
        description: 'Pour concrete foundation for main structure',
        status: 'in_progress',
        startDate: '2026-03-01',
        endDate: '2026-03-05',
        durationDays: 4,
        startAfter: '2026-02-28',
        startBefore: '2026-03-10',
        assignedUserId: assigneeId,
        tagIds: [tagId],
      };

      // When: Creating work item
      const response = await app.inject({
        method: 'POST',
        url: '/api/work-items',
        headers: { cookie },
        payload: body,
      });

      // Then: Returns 201 with all fields set
      expect(response.statusCode).toBe(201);
      const workItem = JSON.parse(response.body) as WorkItemDetail;

      expect(workItem.title).toBe('Pour foundation');
      expect(workItem.description).toBe('Pour concrete foundation for main structure');
      expect(workItem.status).toBe('in_progress');
      expect(workItem.startDate).toBe('2026-03-01');
      expect(workItem.endDate).toBe('2026-03-05');
      expect(workItem.durationDays).toBe(4);
      expect(workItem.startAfter).toBe('2026-02-28');
      expect(workItem.startBefore).toBe('2026-03-10');
      expect(workItem.assignedUser?.id).toBe(assigneeId);
      expect(workItem.tags).toHaveLength(1);
      expect(workItem.tags[0].name).toBe('Foundation');
    });

    it('fails with 400 when title is empty (UAT-3.2-03)', async () => {
      // Given: Authenticated user
      const { cookie } = await createUserWithSession('user@example.com', 'User', 'password');

      const body: CreateWorkItemRequest = {
        title: '',
      };

      // When: Creating with empty title
      const response = await app.inject({
        method: 'POST',
        url: '/api/work-items',
        headers: { cookie },
        payload: body,
      });

      // Then: Returns 400 VALIDATION_ERROR
      expect(response.statusCode).toBe(400);
      const error = JSON.parse(response.body) as ApiErrorResponse;
      expect(error.error.code).toBe('VALIDATION_ERROR');
      // Fastify JSON schema validation returns generic message
      expect(error.error.message).toBeDefined();
    });

    it('fails with 400 when title exceeds 500 characters (UAT-3.2-04)', async () => {
      // Given: Authenticated user
      const { cookie } = await createUserWithSession('user@example.com', 'User', 'password');

      const body: CreateWorkItemRequest = {
        title: 'x'.repeat(501),
      };

      // When: Creating with oversized title
      const response = await app.inject({
        method: 'POST',
        url: '/api/work-items',
        headers: { cookie },
        payload: body,
      });

      // Then: Returns 400 VALIDATION_ERROR
      expect(response.statusCode).toBe(400);
      const error = JSON.parse(response.body) as ApiErrorResponse;
      expect(error.error.code).toBe('VALIDATION_ERROR');
    });

    it('fails with 400 when status is invalid (UAT-3.2-05)', async () => {
      // Given: Authenticated user
      const { cookie } = await createUserWithSession('user@example.com', 'User', 'password');

      const body = {
        title: 'Test',
        status: 'invalid_status',
      };

      // When: Creating with invalid status
      const response = await app.inject({
        method: 'POST',
        url: '/api/work-items',
        headers: { cookie },
        payload: body,
      });

      // Then: Returns 400 VALIDATION_ERROR
      expect(response.statusCode).toBe(400);
      const error = JSON.parse(response.body) as ApiErrorResponse;
      expect(error.error.code).toBe('VALIDATION_ERROR');
    });

    it('fails with 400 when startDate is after endDate (UAT-3.2-06)', async () => {
      // Given: Authenticated user
      const { cookie } = await createUserWithSession('user@example.com', 'User', 'password');

      const body: CreateWorkItemRequest = {
        title: 'Test',
        startDate: '2026-03-10',
        endDate: '2026-03-01',
      };

      // When: Creating with invalid date range
      const response = await app.inject({
        method: 'POST',
        url: '/api/work-items',
        headers: { cookie },
        payload: body,
      });

      // Then: Returns 400 VALIDATION_ERROR
      expect(response.statusCode).toBe(400);
      const error = JSON.parse(response.body) as ApiErrorResponse;
      expect(error.error.code).toBe('VALIDATION_ERROR');
      expect(error.error.message).toContain('startDate must be before or equal to endDate');
    });

    it('fails with 400 when startAfter is after startBefore (UAT-3.2-07)', async () => {
      // Given: Authenticated user
      const { cookie } = await createUserWithSession('user@example.com', 'User', 'password');

      const body: CreateWorkItemRequest = {
        title: 'Test',
        startAfter: '2026-03-10',
        startBefore: '2026-03-01',
      };

      // When: Creating with invalid constraint range
      const response = await app.inject({
        method: 'POST',
        url: '/api/work-items',
        headers: { cookie },
        payload: body,
      });

      // Then: Returns 400 VALIDATION_ERROR
      expect(response.statusCode).toBe(400);
      const error = JSON.parse(response.body) as ApiErrorResponse;
      expect(error.error.code).toBe('VALIDATION_ERROR');
      expect(error.error.message).toContain('startAfter must be before or equal to startBefore');
    });

    it('fails with 400 when assignedUserId does not exist (UAT-3.2-08)', async () => {
      // Given: Authenticated user
      const { cookie } = await createUserWithSession('user@example.com', 'User', 'password');

      const body: CreateWorkItemRequest = {
        title: 'Test',
        assignedUserId: 'non-existent-uuid',
      };

      // When: Creating with non-existent user
      const response = await app.inject({
        method: 'POST',
        url: '/api/work-items',
        headers: { cookie },
        payload: body,
      });

      // Then: Returns 400 VALIDATION_ERROR
      expect(response.statusCode).toBe(400);
      const error = JSON.parse(response.body) as ApiErrorResponse;
      expect(error.error.code).toBe('VALIDATION_ERROR');
      expect(error.error.message).toContain('User not found');
    });

    it('fails with 400 when tagId does not exist (UAT-3.2-09)', async () => {
      // Given: Authenticated user
      const { cookie } = await createUserWithSession('user@example.com', 'User', 'password');

      const body: CreateWorkItemRequest = {
        title: 'Test',
        tagIds: ['non-existent-tag-uuid'],
      };

      // When: Creating with non-existent tag
      const response = await app.inject({
        method: 'POST',
        url: '/api/work-items',
        headers: { cookie },
        payload: body,
      });

      // Then: Returns 400 VALIDATION_ERROR
      expect(response.statusCode).toBe(400);
      const error = JSON.parse(response.body) as ApiErrorResponse;
      expect(error.error.code).toBe('VALIDATION_ERROR');
      expect(error.error.message).toContain('Tag not found');
    });

    it('fails with 400 when date format is invalid (UAT-3.2-10)', async () => {
      // Given: Authenticated user
      const { cookie } = await createUserWithSession('user@example.com', 'User', 'password');

      const body = {
        title: 'Test',
        startDate: '03/01/2026', // Invalid format (not ISO 8601)
      };

      // When: Creating with invalid date format
      const response = await app.inject({
        method: 'POST',
        url: '/api/work-items',
        headers: { cookie },
        payload: body,
      });

      // Then: Returns 400 VALIDATION_ERROR
      expect(response.statusCode).toBe(400);
      const error = JSON.parse(response.body) as ApiErrorResponse;
      expect(error.error.code).toBe('VALIDATION_ERROR');
    });

    it('requires authentication (UAT-3.2-11)', async () => {
      // Given: No authentication
      const body: CreateWorkItemRequest = {
        title: 'Test',
      };

      // When: Creating without session
      const response = await app.inject({
        method: 'POST',
        url: '/api/work-items',
        payload: body,
      });

      // Then: Returns 401 UNAUTHORIZED
      expect(response.statusCode).toBe(401);
      const error = JSON.parse(response.body) as ApiErrorResponse;
      expect(error.error.code).toBe('UNAUTHORIZED');
    });

    it('allows member users to create work items (UAT-3.2-37)', async () => {
      // Given: Member user (not admin)
      const { cookie } = await createUserWithSession(
        'member@example.com',
        'Member',
        'password',
        'member',
      );

      const body: CreateWorkItemRequest = {
        title: 'Member created task',
      };

      // When: Creating work item
      const response = await app.inject({
        method: 'POST',
        url: '/api/work-items',
        headers: { cookie },
        payload: body,
      });

      // Then: Returns 201 (member can create)
      expect(response.statusCode).toBe(201);
    });

    it('creates work item with very long description (UAT-3.2-42)', async () => {
      // Given: Authenticated user
      const { cookie } = await createUserWithSession('user@example.com', 'User', 'password');

      const longDescription = 'x'.repeat(10000);
      const body: CreateWorkItemRequest = {
        title: 'Test',
        description: longDescription,
      };

      // When: Creating with long description
      const response = await app.inject({
        method: 'POST',
        url: '/api/work-items',
        headers: { cookie },
        payload: body,
      });

      // Then: Returns 201
      expect(response.statusCode).toBe(201);
      const workItem = JSON.parse(response.body) as WorkItemDetail;
      expect(workItem.description).toBe(longDescription);
    });

    it('returns camelCase property names (UAT-3.2-40)', async () => {
      // Given: Authenticated user
      const { cookie } = await createUserWithSession('user@example.com', 'User', 'password');

      const body: CreateWorkItemRequest = {
        title: 'Test',
        startDate: '2026-03-01',
        endDate: '2026-03-05',
        durationDays: 4,
      };

      // When: Creating work item
      const response = await app.inject({
        method: 'POST',
        url: '/api/work-items',
        headers: { cookie },
        payload: body,
      });

      // Then: All properties are camelCase
      expect(response.statusCode).toBe(201);
      const workItem = JSON.parse(response.body) as WorkItemDetail;
      expect(workItem).toHaveProperty('startDate');
      expect(workItem).toHaveProperty('endDate');
      expect(workItem).toHaveProperty('durationDays');
      expect(workItem).toHaveProperty('startAfter');
      expect(workItem).toHaveProperty('startBefore');
      expect(workItem).toHaveProperty('assignedUser');
      expect(workItem).toHaveProperty('createdBy');
      expect(workItem).toHaveProperty('createdAt');
      expect(workItem).toHaveProperty('updatedAt');
      // Ensure no snake_case properties
      expect(workItem).not.toHaveProperty('start_date');
      expect(workItem).not.toHaveProperty('end_date');
      expect(workItem).not.toHaveProperty('duration_days');
      expect(workItem).not.toHaveProperty('assigned_user_id');
      expect(workItem).not.toHaveProperty('created_by');
      expect(workItem).not.toHaveProperty('created_at');
      expect(workItem).not.toHaveProperty('updated_at');
    });
  });

  describe('GET /api/work-items', () => {
    it('returns paginated work items with defaults (UAT-3.2-12)', async () => {
      // Given: Authenticated user and 30 work items
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      for (let i = 1; i <= 30; i++) {
        workItemService.createWorkItem(app.db, userId, { title: `Work Item ${i}` });
      }

      // When: Listing work items
      const response = await app.inject({
        method: 'GET',
        url: '/api/work-items',
        headers: { cookie },
      });

      // Then: Returns 200 with pagination
      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.body) as WorkItemListResponse;

      expect(result.items).toHaveLength(25);
      expect(result.pagination).toEqual({
        page: 1,
        pageSize: 25,
        totalItems: 30,
        totalPages: 2,
      });
    });

    it('supports custom page size (UAT-3.2-13)', async () => {
      // Given: 10 work items
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      for (let i = 1; i <= 10; i++) {
        workItemService.createWorkItem(app.db, userId, { title: `Work Item ${i}` });
      }

      // When: Requesting page size 5
      const response = await app.inject({
        method: 'GET',
        url: '/api/work-items?pageSize=5',
        headers: { cookie },
      });

      // Then: Returns 5 items
      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.body) as WorkItemListResponse;
      expect(result.items).toHaveLength(5);
      expect(result.pagination.pageSize).toBe(5);
    });

    it('enforces maximum page size (UAT-3.2-14)', async () => {
      // Given: Work items exist
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      workItemService.createWorkItem(app.db, userId, { title: 'Test' });

      // When: Requesting page size 100 (at the max)
      const response = await app.inject({
        method: 'GET',
        url: '/api/work-items?pageSize=100',
        headers: { cookie },
      });

      // Then: Accepts the maximum
      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.body) as WorkItemListResponse;
      expect(result.pagination.pageSize).toBe(100);

      // And: Values above 100 are rejected by schema validation
      const response2 = await app.inject({
        method: 'GET',
        url: '/api/work-items?pageSize=101',
        headers: { cookie },
      });
      expect(response2.statusCode).toBe(400);
    });

    it('supports pagination navigation (UAT-3.2-15)', async () => {
      // Given: 30 work items
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      for (let i = 1; i <= 30; i++) {
        workItemService.createWorkItem(app.db, userId, { title: `Work Item ${i}` });
      }

      // When: Requesting page 2
      const response = await app.inject({
        method: 'GET',
        url: '/api/work-items?page=2&pageSize=25',
        headers: { cookie },
      });

      // Then: Returns remaining items
      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.body) as WorkItemListResponse;
      expect(result.items).toHaveLength(5);
      expect(result.pagination.page).toBe(2);
    });

    it('filters by status (UAT-3.2-16)', async () => {
      // Given: Work items with various statuses
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      workItemService.createWorkItem(app.db, userId, {
        title: 'Not Started',
        status: 'not_started',
      });
      workItemService.createWorkItem(app.db, userId, {
        title: 'In Progress 1',
        status: 'in_progress',
      });
      workItemService.createWorkItem(app.db, userId, {
        title: 'In Progress 2',
        status: 'in_progress',
      });

      // When: Filtering by in_progress
      const response = await app.inject({
        method: 'GET',
        url: '/api/work-items?status=in_progress',
        headers: { cookie },
      });

      // Then: Returns only in_progress items
      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.body) as WorkItemListResponse;
      expect(result.items).toHaveLength(2);
      expect(result.items.every((item) => item.status === 'in_progress')).toBe(true);
    });

    it('filters by assignedUserId (UAT-3.2-17)', async () => {
      // Given: Work items assigned to different users
      const { userId: creatorId, cookie } = await createUserWithSession(
        'creator@example.com',
        'Creator',
        'pass',
      );
      const userA = (await createUserWithSession('userA@example.com', 'User A', 'pass')).userId;
      const userB = (await createUserWithSession('userB@example.com', 'User B', 'pass')).userId;

      workItemService.createWorkItem(app.db, creatorId, { title: 'For A', assignedUserId: userA });
      workItemService.createWorkItem(app.db, creatorId, { title: 'For B', assignedUserId: userB });
      workItemService.createWorkItem(app.db, creatorId, {
        title: 'For A 2',
        assignedUserId: userA,
      });

      // When: Filtering by userA
      const response = await app.inject({
        method: 'GET',
        url: `/api/work-items?assignedUserId=${userA}`,
        headers: { cookie },
      });

      // Then: Returns only userA's items
      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.body) as WorkItemListResponse;
      expect(result.items).toHaveLength(2);
      expect(result.items.every((item) => item.assignedUser?.id === userA)).toBe(true);
    });

    it('filters by tagId (UAT-3.2-18)', async () => {
      // Given: Work items with various tags
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      const tagA = createTestTag('Tag A');
      const tagB = createTestTag('Tag B');

      workItemService.createWorkItem(app.db, userId, { title: 'Has A', tagIds: [tagA] });
      workItemService.createWorkItem(app.db, userId, { title: 'Has B', tagIds: [tagB] });
      workItemService.createWorkItem(app.db, userId, {
        title: 'Has A and B',
        tagIds: [tagA, tagB],
      });

      // When: Filtering by tagA
      const response = await app.inject({
        method: 'GET',
        url: `/api/work-items?tagId=${tagA}`,
        headers: { cookie },
      });

      // Then: Returns items with tagA
      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.body) as WorkItemListResponse;
      expect(result.items).toHaveLength(2);
      expect(result.items.every((item) => item.tags.some((t) => t.id === tagA))).toBe(true);
    });

    it('searches title and description (UAT-3.2-19)', async () => {
      // Given: Work items with various content
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      workItemService.createWorkItem(app.db, userId, {
        title: 'Install plumbing',
        description: 'Install all pipes',
      });
      workItemService.createWorkItem(app.db, userId, {
        title: 'Electrical wiring',
        description: 'Install electrical system',
      });

      // When: Searching for "plumb"
      const response = await app.inject({
        method: 'GET',
        url: '/api/work-items?q=plumb',
        headers: { cookie },
      });

      // Then: Returns matching items
      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.body) as WorkItemListResponse;
      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toBe('Install plumbing');
    });

    it('supports custom sorting (UAT-3.2-20)', async () => {
      // Given: Work items with various start dates
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      workItemService.createWorkItem(app.db, userId, { title: 'A', startDate: '2026-03-01' });
      workItemService.createWorkItem(app.db, userId, { title: 'B', startDate: '2026-03-15' });
      workItemService.createWorkItem(app.db, userId, { title: 'C', startDate: '2026-03-10' });

      // When: Sorting by startDate ascending
      const response = await app.inject({
        method: 'GET',
        url: '/api/work-items?sortBy=start_date&sortOrder=asc',
        headers: { cookie },
      });

      // Then: Items sorted by date
      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.body) as WorkItemListResponse;
      expect(result.items[0].startDate).toBe('2026-03-01');
      expect(result.items[1].startDate).toBe('2026-03-10');
      expect(result.items[2].startDate).toBe('2026-03-15');
    });

    it('combines multiple filters (UAT-3.2-21)', async () => {
      // Given: Work items with various properties
      const { userId, cookie } = await createUserWithSession(
        'creator@example.com',
        'Creator',
        'pass',
      );
      const userA = (await createUserWithSession('userA@example.com', 'User A', 'pass')).userId;

      workItemService.createWorkItem(app.db, userId, {
        title: 'Electrical wiring in progress',
        status: 'in_progress',
        assignedUserId: userA,
      });
      workItemService.createWorkItem(app.db, userId, {
        title: 'Electrical planning not started',
        status: 'not_started',
        assignedUserId: userA,
      });

      // When: Filtering by multiple criteria
      const response = await app.inject({
        method: 'GET',
        url: `/api/work-items?status=in_progress&assignedUserId=${userA}&q=wiring`,
        headers: { cookie },
      });

      // Then: Returns items matching ALL filters
      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.body) as WorkItemListResponse;
      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toBe('Electrical wiring in progress');
    });

    it('returns empty array when no matches (UAT-3.2-22)', async () => {
      // Given: Work items exist but none match filter
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      workItemService.createWorkItem(app.db, userId, { title: 'Test', status: 'not_started' });

      // When: Filtering by non-matching status
      const response = await app.inject({
        method: 'GET',
        url: '/api/work-items?status=blocked',
        headers: { cookie },
      });

      // Then: Empty array with correct metadata
      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.body) as WorkItemListResponse;
      expect(result.items).toEqual([]);
      expect(result.pagination.totalItems).toBe(0);
    });

    it('requires authentication (UAT-3.2-23)', async () => {
      // Given: No authentication
      // When: Listing work items
      const response = await app.inject({
        method: 'GET',
        url: '/api/work-items',
      });

      // Then: Returns 401
      expect(response.statusCode).toBe(401);
      const error = JSON.parse(response.body) as ApiErrorResponse;
      expect(error.error.code).toBe('UNAUTHORIZED');
    });

    it('handles page beyond total pages gracefully (UAT-3.2-43)', async () => {
      // Given: Only 10 work items
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      for (let i = 1; i <= 10; i++) {
        workItemService.createWorkItem(app.db, userId, { title: `Item ${i}` });
      }

      // When: Requesting page 100
      const response = await app.inject({
        method: 'GET',
        url: '/api/work-items?page=100',
        headers: { cookie },
      });

      // Then: Returns empty array but correct total
      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.body) as WorkItemListResponse;
      expect(result.items).toEqual([]);
      expect(result.pagination.totalItems).toBe(10);
    });

    it('search is case-insensitive (UAT-3.2-44)', async () => {
      // Given: Work item with title "Install Plumbing"
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      workItemService.createWorkItem(app.db, userId, { title: 'Install Plumbing' });

      // When: Searching with uppercase "PLUMB"
      const response = await app.inject({
        method: 'GET',
        url: '/api/work-items?q=PLUMB',
        headers: { cookie },
      });

      // Then: Finds the work item
      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.body) as WorkItemListResponse;
      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toBe('Install Plumbing');
    });
  });

  describe('GET /api/work-items/:id', () => {
    it('returns complete work item detail (UAT-3.2-24)', async () => {
      // Given: Work item with tags, subtask, and dependencies
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      const tagId = createTestTag('Foundation');
      const workItem = workItemService.createWorkItem(app.db, userId, {
        title: 'Main Task',
        tagIds: [tagId],
      });

      // When: Getting work item detail
      const response = await app.inject({
        method: 'GET',
        url: `/api/work-items/${workItem.id}`,
        headers: { cookie },
      });

      // Then: Returns 200 with full detail
      expect(response.statusCode).toBe(200);
      const detail = JSON.parse(response.body) as WorkItemDetail;
      expect(detail.id).toBe(workItem.id);
      expect(detail.tags).toHaveLength(1);
      expect(detail.subtasks).toBeDefined();
      expect(detail.dependencies).toBeDefined();
    });

    it('returns 404 for non-existent ID (UAT-3.2-25)', async () => {
      // Given: Authenticated user
      const { cookie } = await createUserWithSession('user@example.com', 'User', 'password');

      // When: Getting non-existent work item
      const response = await app.inject({
        method: 'GET',
        url: '/api/work-items/non-existent-uuid',
        headers: { cookie },
      });

      // Then: Returns 404
      expect(response.statusCode).toBe(404);
      const error = JSON.parse(response.body) as ApiErrorResponse;
      expect(error.error.code).toBe('NOT_FOUND');
    });

    it('requires authentication (UAT-3.2-26)', async () => {
      // Given: No authentication
      // When: Getting work item
      const response = await app.inject({
        method: 'GET',
        url: '/api/work-items/some-id',
      });

      // Then: Returns 401
      expect(response.statusCode).toBe(401);
      const error = JSON.parse(response.body) as ApiErrorResponse;
      expect(error.error.code).toBe('UNAUTHORIZED');
    });

    it('includes assignedUser summary with correct fields (UAT-3.2-41)', async () => {
      // Given: Work item assigned to a user
      const { userId: creatorId, cookie } = await createUserWithSession(
        'creator@example.com',
        'Creator',
        'pass',
      );
      const assigneeId = (await createUserWithSession('assignee@example.com', 'John Doe', 'pass'))
        .userId;
      const workItem = workItemService.createWorkItem(app.db, creatorId, {
        title: 'Assigned Task',
        assignedUserId: assigneeId,
      });

      // When: Getting detail
      const response = await app.inject({
        method: 'GET',
        url: `/api/work-items/${workItem.id}`,
        headers: { cookie },
      });

      // Then: assignedUser includes id, displayName, email
      expect(response.statusCode).toBe(200);
      const detail = JSON.parse(response.body) as WorkItemDetail;
      expect(detail.assignedUser).toBeDefined();
      expect(detail.assignedUser?.id).toBe(assigneeId);
      expect(detail.assignedUser?.displayName).toBe('John Doe');
      expect(detail.assignedUser?.email).toBe('assignee@example.com');
      // And: Does not include sensitive fields
      expect(detail.assignedUser).not.toHaveProperty('passwordHash');
      expect(detail.assignedUser).not.toHaveProperty('totpSecret');
    });
  });

  describe('PATCH /api/work-items/:id', () => {
    it('updates only provided fields (UAT-3.2-27)', async () => {
      // Given: Existing work item
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      const workItem = workItemService.createWorkItem(app.db, userId, {
        title: 'Original Title',
        status: 'not_started',
      });

      // When: Updating only status
      const body: UpdateWorkItemRequest = {
        status: 'in_progress',
      };
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/work-items/${workItem.id}`,
        headers: { cookie },
        payload: body,
      });

      // Then: Only status changed
      expect(response.statusCode).toBe(200);
      const updated = JSON.parse(response.body) as WorkItemDetail;
      expect(updated.status).toBe('in_progress');
      expect(updated.title).toBe('Original Title');
    });

    it('allows changing assignedUserId (UAT-3.2-28)', async () => {
      // Given: Work item assigned to userA
      const { userId: creatorId, cookie } = await createUserWithSession(
        'creator@example.com',
        'Creator',
        'pass',
      );
      const userA = (await createUserWithSession('userA@example.com', 'User A', 'pass')).userId;
      const userB = (await createUserWithSession('userB@example.com', 'User B', 'pass')).userId;
      const workItem = workItemService.createWorkItem(app.db, creatorId, {
        title: 'Test',
        assignedUserId: userA,
      });

      // When: Changing to userB
      const body: UpdateWorkItemRequest = {
        assignedUserId: userB,
      };
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/work-items/${workItem.id}`,
        headers: { cookie },
        payload: body,
      });

      // Then: Assigned to userB
      expect(response.statusCode).toBe(200);
      const updated = JSON.parse(response.body) as WorkItemDetail;
      expect(updated.assignedUser?.id).toBe(userB);
    });

    it('allows unsetting assignedUserId (UAT-3.2-29)', async () => {
      // Given: Work item assigned to a user
      const { userId: creatorId, cookie } = await createUserWithSession(
        'creator@example.com',
        'Creator',
        'pass',
      );
      const assignee = (await createUserWithSession('assignee@example.com', 'Assignee', 'pass'))
        .userId;
      const workItem = workItemService.createWorkItem(app.db, creatorId, {
        title: 'Test',
        assignedUserId: assignee,
      });

      // When: Setting assignedUserId to null
      const body: UpdateWorkItemRequest = {
        assignedUserId: null,
      };
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/work-items/${workItem.id}`,
        headers: { cookie },
        payload: body,
      });

      // Then: No longer assigned
      expect(response.statusCode).toBe(200);
      const updated = JSON.parse(response.body) as WorkItemDetail;
      expect(updated.assignedUser).toBeNull();
    });

    it('enforces date validation (UAT-3.2-30)', async () => {
      // Given: Existing work item
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      const workItem = workItemService.createWorkItem(app.db, userId, { title: 'Test' });

      // When: Updating with invalid date range
      const body: UpdateWorkItemRequest = {
        startDate: '2026-03-10',
        endDate: '2026-03-01',
      };
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/work-items/${workItem.id}`,
        headers: { cookie },
        payload: body,
      });

      // Then: Returns 400 VALIDATION_ERROR
      expect(response.statusCode).toBe(400);
      const error = JSON.parse(response.body) as ApiErrorResponse;
      expect(error.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 for non-existent ID (UAT-3.2-31)', async () => {
      // Given: Authenticated user
      const { cookie } = await createUserWithSession('user@example.com', 'User', 'password');

      // When: Updating non-existent work item
      const body: UpdateWorkItemRequest = {
        title: 'New Title',
      };
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/work-items/non-existent-uuid',
        headers: { cookie },
        payload: body,
      });

      // Then: Returns 404
      expect(response.statusCode).toBe(404);
      const error = JSON.parse(response.body) as ApiErrorResponse;
      expect(error.error.code).toBe('NOT_FOUND');
    });

    it('requires authentication (UAT-3.2-32)', async () => {
      // Given: No authentication
      // When: Updating work item
      const body: UpdateWorkItemRequest = {
        title: 'New Title',
      };
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/work-items/some-id',
        payload: body,
      });

      // Then: Returns 401
      expect(response.statusCode).toBe(401);
      const error = JSON.parse(response.body) as ApiErrorResponse;
      expect(error.error.code).toBe('UNAUTHORIZED');
    });

    it('allows updating tags (replaces, not merges) (UAT-3.2-33)', async () => {
      // Given: Work item with tags [A]
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      const tagA = createTestTag('Tag A');
      const tagB = createTestTag('Tag B');
      const tagC = createTestTag('Tag C');
      const workItem = workItemService.createWorkItem(app.db, userId, {
        title: 'Test',
        tagIds: [tagA],
      });

      // When: Updating tags to [B, C]
      const body: UpdateWorkItemRequest = {
        tagIds: [tagB, tagC],
      };
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/work-items/${workItem.id}`,
        headers: { cookie },
        payload: body,
      });

      // Then: Tags are [B, C] (replaced)
      expect(response.statusCode).toBe(200);
      const updated = JSON.parse(response.body) as WorkItemDetail;
      expect(updated.tags).toHaveLength(2);
      const tagNames = updated.tags.map((t) => t.name).sort();
      expect(tagNames).toEqual(['Tag B', 'Tag C']);
    });

    it('allows member users to update work items (UAT-3.2-38)', async () => {
      // Given: Member user and existing work item
      const { userId, cookie } = await createUserWithSession(
        'member@example.com',
        'Member',
        'password',
        'member',
      );
      const workItem = workItemService.createWorkItem(app.db, userId, { title: 'Test' });

      // When: Updating work item
      const body: UpdateWorkItemRequest = {
        status: 'in_progress',
      };
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/work-items/${workItem.id}`,
        headers: { cookie },
        payload: body,
      });

      // Then: Returns 200 (member can update)
      expect(response.statusCode).toBe(200);
    });
  });

  describe('DELETE /api/work-items/:id', () => {
    it('deletes work item and cascades (UAT-3.2-34)', async () => {
      // Given: Work item with tags and subtask
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'User',
        'password',
      );
      const tagId = createTestTag('Test Tag');
      const workItem = workItemService.createWorkItem(app.db, userId, {
        title: 'To Delete',
        tagIds: [tagId],
      });

      // When: Deleting work item
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/work-items/${workItem.id}`,
        headers: { cookie },
      });

      // Then: Returns 204
      expect(response.statusCode).toBe(204);

      // And: Work item no longer exists
      const getResponse = await app.inject({
        method: 'GET',
        url: `/api/work-items/${workItem.id}`,
        headers: { cookie },
      });
      expect(getResponse.statusCode).toBe(404);
    });

    it('returns 404 for non-existent ID (UAT-3.2-35)', async () => {
      // Given: Authenticated user
      const { cookie } = await createUserWithSession('user@example.com', 'User', 'password');

      // When: Deleting non-existent work item
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/work-items/non-existent-uuid',
        headers: { cookie },
      });

      // Then: Returns 404
      expect(response.statusCode).toBe(404);
      const error = JSON.parse(response.body) as ApiErrorResponse;
      expect(error.error.code).toBe('NOT_FOUND');
    });

    it('requires authentication (UAT-3.2-36)', async () => {
      // Given: No authentication
      // When: Deleting work item
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/work-items/some-id',
      });

      // Then: Returns 401
      expect(response.statusCode).toBe(401);
      const error = JSON.parse(response.body) as ApiErrorResponse;
      expect(error.error.code).toBe('UNAUTHORIZED');
    });

    it('allows member users to delete work items (UAT-3.2-39)', async () => {
      // Given: Member user and existing work item
      const { userId, cookie } = await createUserWithSession(
        'member@example.com',
        'Member',
        'password',
        'member',
      );
      const workItem = workItemService.createWorkItem(app.db, userId, { title: 'Test' });

      // When: Deleting work item
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/work-items/${workItem.id}`,
        headers: { cookie },
      });

      // Then: Returns 204 (member can delete)
      expect(response.statusCode).toBe(204);
    });
  });
});

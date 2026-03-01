import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import type { FastifyInstance } from 'fastify';
import type {
  DependencyCreatedResponse,
  ApiErrorResponse,
  CreateDependencyRequest,
  WorkItemDependenciesResponse,
  UpdateDependencyRequest,
} from '@cornerstone/shared';
import { workItems } from '../db/schema.js';

describe('Dependency Routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    // Save original environment
    originalEnv = { ...process.env };

    // Create temporary directory for test database
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-deps-test-'));
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

  describe('POST /api/work-items/:workItemId/dependencies', () => {
    it('should create a dependency with 201 status', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItemA = createTestWorkItem(userId, 'Work Item A');
      const workItemB = createTestWorkItem(userId, 'Work Item B');

      const payload: CreateDependencyRequest = {
        predecessorId: workItemA,
        dependencyType: 'finish_to_start',
      };

      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemB}/dependencies`,
        headers: { cookie },
        payload,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<DependencyCreatedResponse>();
      expect(body).toEqual({
        predecessorId: workItemA,
        successorId: workItemB,
        dependencyType: 'finish_to_start',
        leadLagDays: 0,
      });
    });

    it('should create a dependency with default type (finish_to_start)', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItemA = createTestWorkItem(userId, 'Work Item A');
      const workItemB = createTestWorkItem(userId, 'Work Item B');

      const payload: CreateDependencyRequest = {
        predecessorId: workItemA,
        // dependencyType omitted
      };

      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemB}/dependencies`,
        headers: { cookie },
        payload,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<DependencyCreatedResponse>();
      expect(body.dependencyType).toBe('finish_to_start');
    });

    it('should return 401 when unauthenticated', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/work-items/some-id/dependencies',
        payload: { predecessorId: 'other-id' },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 404 when successor work item not found', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItemA = createTestWorkItem(userId, 'Work Item A');

      const payload: CreateDependencyRequest = {
        predecessorId: workItemA,
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/work-items/nonexistent-id/dependencies',
        headers: { cookie },
        payload,
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toContain('Successor work item not found');
    });

    it('should return 404 when predecessor work item not found', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItemB = createTestWorkItem(userId, 'Work Item B');

      const payload: CreateDependencyRequest = {
        predecessorId: 'nonexistent-id',
      };

      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemB}/dependencies`,
        headers: { cookie },
        payload,
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toContain('Predecessor work item not found');
    });

    it('should return 400 when work item depends on itself (self-reference)', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItem = createTestWorkItem(userId, 'Work Item');

      const payload: CreateDependencyRequest = {
        predecessorId: workItem,
      };

      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItem}/dependencies`,
        headers: { cookie },
        payload,
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toContain('cannot depend on itself');
    });

    it('should return 409 with DUPLICATE_DEPENDENCY when dependency already exists', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItemA = createTestWorkItem(userId, 'Work Item A');
      const workItemB = createTestWorkItem(userId, 'Work Item B');

      const payload: CreateDependencyRequest = {
        predecessorId: workItemA,
      };

      // Create dependency first time
      await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemB}/dependencies`,
        headers: { cookie },
        payload,
      });

      // Try to create same dependency again
      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemB}/dependencies`,
        headers: { cookie },
        payload,
      });

      expect(response.statusCode).toBe(409);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('CONFLICT');
      expect(body.error.message).toContain('Dependency already exists');
      expect(body.error.details?.code).toBe('DUPLICATE_DEPENDENCY');
    });

    it('should return 409 with CIRCULAR_DEPENDENCY when circular dependency detected', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItemA = createTestWorkItem(userId, 'Work Item A');
      const workItemB = createTestWorkItem(userId, 'Work Item B');

      // Create A→B dependency
      await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemB}/dependencies`,
        headers: { cookie },
        payload: { predecessorId: workItemA },
      });

      // Try to create B→A dependency (circular)
      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemA}/dependencies`,
        headers: { cookie },
        payload: { predecessorId: workItemB },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('CONFLICT');
      expect(body.error.message).toContain('Circular dependency detected');
      expect(body.error.details?.code).toBe('CIRCULAR_DEPENDENCY');
      expect(body.error.details?.cycle).toBeDefined();
    });

    it('should return 400 when dependencyType is invalid', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItemA = createTestWorkItem(userId, 'Work Item A');
      const workItemB = createTestWorkItem(userId, 'Work Item B');

      const payload = {
        predecessorId: workItemA,
        dependencyType: 'invalid_type',
      };

      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemB}/dependencies`,
        headers: { cookie },
        payload,
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/work-items/:workItemId/dependencies', () => {
    it('should return 200 with predecessors and successors', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItemA = createTestWorkItem(userId, 'Work Item A');
      const workItemB = createTestWorkItem(userId, 'Work Item B');
      const workItemC = createTestWorkItem(userId, 'Work Item C');

      // Create: A→B, B→C
      await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemB}/dependencies`,
        headers: { cookie },
        payload: { predecessorId: workItemA },
      });
      await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemC}/dependencies`,
        headers: { cookie },
        payload: { predecessorId: workItemB },
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/work-items/${workItemB}/dependencies`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<WorkItemDependenciesResponse>();
      expect(body.predecessors).toHaveLength(1);
      expect(body.predecessors[0].workItem.id).toBe(workItemA);
      expect(body.predecessors[0].workItem.title).toBe('Work Item A');
      expect(body.predecessors[0].dependencyType).toBe('finish_to_start');

      expect(body.successors).toHaveLength(1);
      expect(body.successors[0].workItem.id).toBe(workItemC);
      expect(body.successors[0].workItem.title).toBe('Work Item C');
      expect(body.successors[0].dependencyType).toBe('finish_to_start');
    });

    it('should return 200 with empty arrays when no dependencies exist', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItem = createTestWorkItem(userId, 'Work Item');

      const response = await app.inject({
        method: 'GET',
        url: `/api/work-items/${workItem}/dependencies`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<WorkItemDependenciesResponse>();
      expect(body.predecessors).toEqual([]);
      expect(body.successors).toEqual([]);
    });

    it('should return 401 when unauthenticated', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/work-items/some-id/dependencies',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 404 when work item not found', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/work-items/nonexistent-id/dependencies',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toContain('Work item not found');
    });
  });

  describe('DELETE /api/work-items/:workItemId/dependencies/:predecessorId', () => {
    it('should delete a dependency with 204 status', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItemA = createTestWorkItem(userId, 'Work Item A');
      const workItemB = createTestWorkItem(userId, 'Work Item B');

      // Create dependency
      await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemB}/dependencies`,
        headers: { cookie },
        payload: { predecessorId: workItemA },
      });

      // Delete dependency
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/work-items/${workItemB}/dependencies/${workItemA}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe('');

      // Verify it's deleted by fetching dependencies
      const getResponse = await app.inject({
        method: 'GET',
        url: `/api/work-items/${workItemB}/dependencies`,
        headers: { cookie },
      });
      const body = getResponse.json<WorkItemDependenciesResponse>();
      expect(body.predecessors).toHaveLength(0);
    });

    it('should return 401 when unauthenticated', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/work-items/some-id/dependencies/other-id',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 404 when dependency not found', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItemA = createTestWorkItem(userId, 'Work Item A');
      const workItemB = createTestWorkItem(userId, 'Work Item B');

      // Try to delete non-existent dependency
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/work-items/${workItemB}/dependencies/${workItemA}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toContain('Dependency not found');
    });
  });

  // ─── POST with leadLagDays (EPIC-06 addition) ─────────────────────────────────

  describe('POST /api/work-items/:workItemId/dependencies with leadLagDays', () => {
    it('should create dependency with specified leadLagDays', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItemA = createTestWorkItem(userId, 'Work Item A');
      const workItemB = createTestWorkItem(userId, 'Work Item B');

      const payload: CreateDependencyRequest = {
        predecessorId: workItemA,
        dependencyType: 'finish_to_start',
        leadLagDays: 3,
      };

      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemB}/dependencies`,
        headers: { cookie },
        payload,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<DependencyCreatedResponse>();
      expect(body.leadLagDays).toBe(3);
    });

    it('should create dependency with negative leadLagDays (lead)', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItemA = createTestWorkItem(userId, 'Work Item A');
      const workItemB = createTestWorkItem(userId, 'Work Item B');

      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemB}/dependencies`,
        headers: { cookie },
        payload: { predecessorId: workItemA, leadLagDays: -2 },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<DependencyCreatedResponse>();
      expect(body.leadLagDays).toBe(-2);
    });

    it('should include leadLagDays in GET dependencies response', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItemA = createTestWorkItem(userId, 'Work Item A');
      const workItemB = createTestWorkItem(userId, 'Work Item B');

      await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemB}/dependencies`,
        headers: { cookie },
        payload: { predecessorId: workItemA, leadLagDays: 5 },
      });

      const getResponse = await app.inject({
        method: 'GET',
        url: `/api/work-items/${workItemB}/dependencies`,
        headers: { cookie },
      });

      expect(getResponse.statusCode).toBe(200);
      const body = getResponse.json<WorkItemDependenciesResponse>();
      expect(body.predecessors[0].leadLagDays).toBe(5);
    });
  });

  // ─── PATCH /api/work-items/:workItemId/dependencies/:predecessorId ─────────

  describe('PATCH /api/work-items/:workItemId/dependencies/:predecessorId', () => {
    it('should update dependencyType with 200 status', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItemA = createTestWorkItem(userId, 'Work Item A');
      const workItemB = createTestWorkItem(userId, 'Work Item B');

      // Create dependency
      await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemB}/dependencies`,
        headers: { cookie },
        payload: { predecessorId: workItemA, dependencyType: 'finish_to_start' },
      });

      const payload: UpdateDependencyRequest = { dependencyType: 'start_to_start' };

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/work-items/${workItemB}/dependencies/${workItemA}`,
        headers: { cookie },
        payload,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<DependencyCreatedResponse>();
      expect(body.dependencyType).toBe('start_to_start');
      expect(body.predecessorId).toBe(workItemA);
      expect(body.successorId).toBe(workItemB);
    });

    it('should update leadLagDays with 200 status', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItemA = createTestWorkItem(userId, 'Work Item A');
      const workItemB = createTestWorkItem(userId, 'Work Item B');

      // Create dependency with default leadLagDays (0)
      await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemB}/dependencies`,
        headers: { cookie },
        payload: { predecessorId: workItemA },
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/work-items/${workItemB}/dependencies/${workItemA}`,
        headers: { cookie },
        payload: { leadLagDays: 7 },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<DependencyCreatedResponse>();
      expect(body.leadLagDays).toBe(7);
    });

    it('should update both dependencyType and leadLagDays', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItemA = createTestWorkItem(userId, 'Work Item A');
      const workItemB = createTestWorkItem(userId, 'Work Item B');

      await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemB}/dependencies`,
        headers: { cookie },
        payload: { predecessorId: workItemA, dependencyType: 'finish_to_start', leadLagDays: 0 },
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/work-items/${workItemB}/dependencies/${workItemA}`,
        headers: { cookie },
        payload: { dependencyType: 'finish_to_finish', leadLagDays: 3 },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<DependencyCreatedResponse>();
      expect(body.dependencyType).toBe('finish_to_finish');
      expect(body.leadLagDays).toBe(3);
    });

    it('should return 404 when dependency does not exist', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItemA = createTestWorkItem(userId, 'Work Item A');
      const workItemB = createTestWorkItem(userId, 'Work Item B');

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/work-items/${workItemB}/dependencies/${workItemA}`,
        headers: { cookie },
        payload: { leadLagDays: 5 },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toContain('Dependency not found');
    });

    it('should return 400 when no fields provided (minProperties: 1)', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItemA = createTestWorkItem(userId, 'Work Item A');
      const workItemB = createTestWorkItem(userId, 'Work Item B');

      await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemB}/dependencies`,
        headers: { cookie },
        payload: { predecessorId: workItemA },
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/work-items/${workItemB}/dependencies/${workItemA}`,
        headers: { cookie },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 when dependencyType is invalid', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItemA = createTestWorkItem(userId, 'Work Item A');
      const workItemB = createTestWorkItem(userId, 'Work Item B');

      await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemB}/dependencies`,
        headers: { cookie },
        payload: { predecessorId: workItemA },
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/work-items/${workItemB}/dependencies/${workItemA}`,
        headers: { cookie },
        payload: { dependencyType: 'invalid_type' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 401 when unauthenticated', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/work-items/some-id/dependencies/other-id',
        payload: { leadLagDays: 3 },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should verify updated leadLagDays appears in GET dependencies', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItemA = createTestWorkItem(userId, 'Work Item A');
      const workItemB = createTestWorkItem(userId, 'Work Item B');

      await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemB}/dependencies`,
        headers: { cookie },
        payload: { predecessorId: workItemA, leadLagDays: 0 },
      });

      await app.inject({
        method: 'PATCH',
        url: `/api/work-items/${workItemB}/dependencies/${workItemA}`,
        headers: { cookie },
        payload: { leadLagDays: 10 },
      });

      const getResponse = await app.inject({
        method: 'GET',
        url: `/api/work-items/${workItemB}/dependencies`,
        headers: { cookie },
      });

      const body = getResponse.json<WorkItemDependenciesResponse>();
      expect(body.predecessors[0].leadLagDays).toBe(10);
    });
  });
});

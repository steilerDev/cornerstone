import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import type { FastifyInstance } from 'fastify';
import type { TagResponse, ApiErrorResponse, CreateTagRequest } from '@cornerstone/shared';
import { tags, workItems, workItemTags } from '../db/schema.js';

describe('Tag Routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    // Save original environment
    originalEnv = { ...process.env };

    // Create temporary directory for test database
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-tags-test-'));
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
   * Helper: Create a tag directly in the database
   */
  function createTestTag(name: string, color: string | null = '#3B82F6') {
    const tagId = `tag-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const now = new Date().toISOString();
    app.db
      .insert(tags)
      .values({
        id: tagId,
        name,
        color,
        createdAt: now,
      })
      .run();
    return { id: tagId, name, color, createdAt: now };
  }

  describe('GET /api/tags', () => {
    it('returns empty array when no tags exist (UAT-3.3-09)', async () => {
      // Given: Authenticated user, no tags
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      // When: Getting tags
      const response = await app.inject({
        method: 'GET',
        url: '/api/tags',
        headers: { cookie },
      });

      // Then: 200 with empty array
      expect(response.statusCode).toBe(200);
      const body = response.json<{ tags: TagResponse[] }>();
      expect(body.tags).toEqual([]);
    });

    it('returns all tags sorted alphabetically (UAT-3.3-08)', async () => {
      // Given: Authenticated user and multiple tags
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      createTestTag('Plumbing', '#3B82F6');
      createTestTag('Electrical', '#EF4444');
      createTestTag('Concrete', '#10B981');

      // When: Getting tags
      const response = await app.inject({
        method: 'GET',
        url: '/api/tags',
        headers: { cookie },
      });

      // Then: 200 with sorted tags
      expect(response.statusCode).toBe(200);
      const body = response.json<{ tags: TagResponse[] }>();
      expect(body.tags).toHaveLength(3);
      expect(body.tags[0].name).toBe('Concrete');
      expect(body.tags[1].name).toBe('Electrical');
      expect(body.tags[2].name).toBe('Plumbing');
    });

    it('returns all tags without pagination (UAT-3.3-10)', async () => {
      // Given: Authenticated user and 100 tags
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      for (let i = 0; i < 100; i++) {
        createTestTag(`Tag ${i.toString().padStart(3, '0')}`, '#3B82F6');
      }

      // When: Getting tags
      const response = await app.inject({
        method: 'GET',
        url: '/api/tags',
        headers: { cookie },
      });

      // Then: 200 with all 100 tags, no pagination metadata
      expect(response.statusCode).toBe(200);
      const body = response.json<{ tags: TagResponse[] }>();
      expect(body.tags).toHaveLength(100);
      expect(body).not.toHaveProperty('pagination');
    });

    it('returns 401 without authentication (UAT-3.3-11)', async () => {
      // Given: No authentication
      // When: Getting tags
      const response = await app.inject({
        method: 'GET',
        url: '/api/tags',
      });

      // Then: 401 UNAUTHORIZED
      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /api/tags', () => {
    it('creates tag with name only (UAT-3.3-01)', async () => {
      // Given: Authenticated user
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const requestBody: CreateTagRequest = {
        name: 'Electrical',
      };

      // When: Creating tag
      const response = await app.inject({
        method: 'POST',
        url: '/api/tags',
        headers: { cookie },
        payload: requestBody,
      });

      // Then: 201 with created tag
      expect(response.statusCode).toBe(201);
      const body = response.json<TagResponse>();
      expect(body.id).toBeDefined();
      expect(body.name).toBe('Electrical');
      expect(body.color).toBeNull();
      expect(body.createdAt).toBeDefined();
    });

    it('creates tag with name and color (UAT-3.3-02)', async () => {
      // Given: Authenticated user
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const requestBody: CreateTagRequest = {
        name: 'Plumbing',
        color: '#3B82F6',
      };

      // When: Creating tag
      const response = await app.inject({
        method: 'POST',
        url: '/api/tags',
        headers: { cookie },
        payload: requestBody,
      });

      // Then: 201 with created tag
      expect(response.statusCode).toBe(201);
      const body = response.json<TagResponse>();
      expect(body.name).toBe('Plumbing');
      expect(body.color).toBe('#3B82F6');
    });

    it('trims leading and trailing spaces from name (UAT-3.3-39)', async () => {
      // Given: Authenticated user
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const requestBody: CreateTagRequest = {
        name: '  Electrical  ',
      };

      // When: Creating tag
      const response = await app.inject({
        method: 'POST',
        url: '/api/tags',
        headers: { cookie },
        payload: requestBody,
      });

      // Then: 201 with trimmed name
      expect(response.statusCode).toBe(201);
      const body = response.json<TagResponse>();
      expect(body.name).toBe('Electrical');
    });

    it('returns 400 for empty name (UAT-3.3-03)', async () => {
      // Given: Authenticated user
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const requestBody = {
        name: '',
      };

      // When: Creating tag with empty name
      const response = await app.inject({
        method: 'POST',
        url: '/api/tags',
        headers: { cookie },
        payload: requestBody,
      });

      // Then: 400 VALIDATION_ERROR
      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for name exceeding 50 characters (UAT-3.3-04)', async () => {
      // Given: Authenticated user
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const requestBody = {
        name: 'a'.repeat(51),
      };

      // When: Creating tag with long name
      const response = await app.inject({
        method: 'POST',
        url: '/api/tags',
        headers: { cookie },
        payload: requestBody,
      });

      // Then: 400 VALIDATION_ERROR
      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for invalid color format - word (UAT-3.3-05)', async () => {
      // Given: Authenticated user
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const requestBody = {
        name: 'Test',
        color: 'blue',
      };

      // When: Creating tag with invalid color
      const response = await app.inject({
        method: 'POST',
        url: '/api/tags',
        headers: { cookie },
        payload: requestBody,
      });

      // Then: 400 VALIDATION_ERROR
      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for short hex code (UAT-3.3-41)', async () => {
      // Given: Authenticated user
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const requestBody = {
        name: 'Test',
        color: '#FFF',
      };

      // When: Creating tag with 3-digit hex
      const response = await app.inject({
        method: 'POST',
        url: '/api/tags',
        headers: { cookie },
        payload: requestBody,
      });

      // Then: 400 VALIDATION_ERROR
      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('accepts uppercase hex color (UAT-3.3-40)', async () => {
      // Given: Authenticated user
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const requestBody: CreateTagRequest = {
        name: 'Test',
        color: '#FF5733',
      };

      // When: Creating tag with uppercase hex
      const response = await app.inject({
        method: 'POST',
        url: '/api/tags',
        headers: { cookie },
        payload: requestBody,
      });

      // Then: 201 with created tag
      expect(response.statusCode).toBe(201);
      const body = response.json<TagResponse>();
      expect(body.color).toBe('#FF5733');
    });

    it('accepts lowercase hex color (UAT-3.3-40)', async () => {
      // Given: Authenticated user
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const requestBody: CreateTagRequest = {
        name: 'Test',
        color: '#ff5733',
      };

      // When: Creating tag with lowercase hex
      const response = await app.inject({
        method: 'POST',
        url: '/api/tags',
        headers: { cookie },
        payload: requestBody,
      });

      // Then: 201 with created tag
      expect(response.statusCode).toBe(201);
      const body = response.json<TagResponse>();
      expect(body.color).toBe('#ff5733');
    });

    it('returns 409 for duplicate name (UAT-3.3-06)', async () => {
      // Given: Authenticated user and existing tag
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      createTestTag('Electrical', '#3B82F6');

      const requestBody: CreateTagRequest = {
        name: 'Electrical',
      };

      // When: Creating tag with same name
      const response = await app.inject({
        method: 'POST',
        url: '/api/tags',
        headers: { cookie },
        payload: requestBody,
      });

      // Then: 409 CONFLICT
      expect(response.statusCode).toBe(409);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('CONFLICT');
      expect(body.error.message).toContain('already exists');
    });

    it('returns 409 for duplicate name case-insensitive (UAT-3.3-06)', async () => {
      // Given: Authenticated user and existing tag
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      createTestTag('Electrical', '#3B82F6');

      const requestBody: CreateTagRequest = {
        name: 'electrical',
      };

      // When: Creating tag with lowercase version
      const response = await app.inject({
        method: 'POST',
        url: '/api/tags',
        headers: { cookie },
        payload: requestBody,
      });

      // Then: 409 CONFLICT
      expect(response.statusCode).toBe(409);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('CONFLICT');
    });

    it('returns 401 without authentication (UAT-3.3-07)', async () => {
      // Given: No authentication
      const requestBody: CreateTagRequest = {
        name: 'Test',
      };

      // When: Creating tag
      const response = await app.inject({
        method: 'POST',
        url: '/api/tags',
        payload: requestBody,
      });

      // Then: 401 UNAUTHORIZED
      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('allows member user to create tag (UAT-3.3-35)', async () => {
      // Given: Authenticated member (not admin)
      const { cookie } = await createUserWithSession(
        'member@example.com',
        'Member User',
        'password',
        'member',
      );

      const requestBody: CreateTagRequest = {
        name: 'Test',
      };

      // When: Creating tag
      const response = await app.inject({
        method: 'POST',
        url: '/api/tags',
        headers: { cookie },
        payload: requestBody,
      });

      // Then: 201 with created tag
      expect(response.statusCode).toBe(201);
      const body = response.json<TagResponse>();
      expect(body.name).toBe('Test');
    });
  });

  describe('PATCH /api/tags/:id', () => {
    it('updates tag name (UAT-3.3-12)', async () => {
      // Given: Authenticated user and existing tag
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const tag = createTestTag('Electrical', '#3B82F6');

      const requestBody = {
        name: 'Electrical Work',
      };

      // When: Updating tag name
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/tags/${tag.id}`,
        headers: { cookie },
        payload: requestBody,
      });

      // Then: 200 with updated tag
      expect(response.statusCode).toBe(200);
      const body = response.json<TagResponse>();
      expect(body.name).toBe('Electrical Work');
      expect(body.color).toBe('#3B82F6'); // Color unchanged
    });

    it('updates tag color (UAT-3.3-13)', async () => {
      // Given: Authenticated user and existing tag
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const tag = createTestTag('Electrical', '#FF0000');

      const requestBody = {
        color: '#00FF00',
      };

      // When: Updating tag color
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/tags/${tag.id}`,
        headers: { cookie },
        payload: requestBody,
      });

      // Then: 200 with updated color
      expect(response.statusCode).toBe(200);
      const body = response.json<TagResponse>();
      expect(body.color).toBe('#00FF00');
      expect(body.name).toBe('Electrical'); // Name unchanged
    });

    it('removes color by setting to null (UAT-3.3-14)', async () => {
      // Given: Authenticated user and existing tag with color
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const tag = createTestTag('Electrical', '#FF0000');

      const requestBody = {
        color: null,
      };

      // When: Setting color to null
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/tags/${tag.id}`,
        headers: { cookie },
        payload: requestBody,
      });

      // Then: 200 with color removed
      expect(response.statusCode).toBe(200);
      const body = response.json<TagResponse>();
      expect(body.color).toBeNull();
    });

    it('allows updating tag name to same value (UAT-3.3-42)', async () => {
      // Given: Authenticated user and existing tag
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const tag = createTestTag('Electrical', '#3B82F6');

      const requestBody = {
        name: 'Electrical',
      };

      // When: Updating to same name
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/tags/${tag.id}`,
        headers: { cookie },
        payload: requestBody,
      });

      // Then: 200 (no conflict)
      expect(response.statusCode).toBe(200);
      const body = response.json<TagResponse>();
      expect(body.name).toBe('Electrical');
    });

    it('returns 409 for duplicate name (UAT-3.3-15)', async () => {
      // Given: Authenticated user and two existing tags
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const tag1 = createTestTag('Electrical', '#3B82F6');
      createTestTag('Plumbing', '#EF4444');

      const requestBody = {
        name: 'Plumbing',
      };

      // When: Updating tag1 name to match tag2
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/tags/${tag1.id}`,
        headers: { cookie },
        payload: requestBody,
      });

      // Then: 409 CONFLICT
      expect(response.statusCode).toBe(409);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('CONFLICT');
    });

    it('returns 404 for non-existent tag (UAT-3.3-16)', async () => {
      // Given: Authenticated user
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const requestBody = {
        name: 'Test',
      };

      // When: Updating non-existent tag
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/tags/non-existent-id',
        headers: { cookie },
        payload: requestBody,
      });

      // Then: 404 NOT_FOUND
      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 401 without authentication (UAT-3.3-17)', async () => {
      // Given: No authentication
      const requestBody = {
        name: 'Test',
      };

      // When: Updating tag
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/tags/some-id',
        payload: requestBody,
      });

      // Then: 401 UNAUTHORIZED
      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('allows member user to update tag (UAT-3.3-36)', async () => {
      // Given: Authenticated member and existing tag
      const { cookie } = await createUserWithSession(
        'member@example.com',
        'Member User',
        'password',
        'member',
      );
      const tag = createTestTag('Electrical', '#3B82F6');

      const requestBody = {
        name: 'Updated',
      };

      // When: Updating tag
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/tags/${tag.id}`,
        headers: { cookie },
        payload: requestBody,
      });

      // Then: 200 with updated tag
      expect(response.statusCode).toBe(200);
      const body = response.json<TagResponse>();
      expect(body.name).toBe('Updated');
    });

    it('returns 400 when no fields provided', async () => {
      // Given: Authenticated user and existing tag
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const tag = createTestTag('Electrical', '#3B82F6');

      const requestBody = {};

      // When: Updating with empty payload
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/tags/${tag.id}`,
        headers: { cookie },
        payload: requestBody,
      });

      // Then: 400 VALIDATION_ERROR
      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('DELETE /api/tags/:id', () => {
    it('deletes tag successfully', async () => {
      // Given: Authenticated user and existing tag
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const tag = createTestTag('Electrical', '#3B82F6');

      // When: Deleting tag
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/tags/${tag.id}`,
        headers: { cookie },
      });

      // Then: 204 No Content
      expect(response.statusCode).toBe(204);
      expect(response.body).toBe('');

      // Verify tag is deleted
      const getResponse = await app.inject({
        method: 'GET',
        url: '/api/tags',
        headers: { cookie },
      });
      const getTags = getResponse.json<{ tags: TagResponse[] }>();
      expect(getTags.tags.find((t) => t.id === tag.id)).toBeUndefined();
    });

    it('cascades delete to work_item_tags (UAT-3.3-18)', async () => {
      // Given: Authenticated user, tag, and work item
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const tag = createTestTag('Electrical', '#3B82F6');

      // Create work item and associate tag
      const workItemId = `wi-${Date.now()}`;
      const now = new Date().toISOString();
      app.db
        .insert(workItems)
        .values({
          id: workItemId,
          title: 'Test work item',
          status: 'not_started',
          createdAt: now,
          updatedAt: now,
        })
        .run();

      app.db
        .insert(workItemTags)
        .values({
          workItemId,
          tagId: tag.id,
        })
        .run();

      // When: Deleting tag
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/tags/${tag.id}`,
        headers: { cookie },
      });

      // Then: 204 and tag is deleted
      expect(response.statusCode).toBe(204);

      // Verify work_item_tags association is removed
      const associations = app.db.select().from(workItemTags).all();
      expect(associations).toHaveLength(0);

      // Verify work item still exists
      const allWorkItems = app.db.select().from(workItems).all();
      expect(allWorkItems).toHaveLength(1);
      expect(allWorkItems[0].id).toBe(workItemId);
    });

    it('returns 404 for non-existent tag (UAT-3.3-19)', async () => {
      // Given: Authenticated user
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      // When: Deleting non-existent tag
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/tags/non-existent-id',
        headers: { cookie },
      });

      // Then: 404 NOT_FOUND
      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 401 without authentication (UAT-3.3-20)', async () => {
      // Given: No authentication
      // When: Deleting tag
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/tags/some-id',
      });

      // Then: 401 UNAUTHORIZED
      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('allows member user to delete tag (UAT-3.3-37)', async () => {
      // Given: Authenticated member and existing tag
      const { cookie } = await createUserWithSession(
        'member@example.com',
        'Member User',
        'password',
        'member',
      );
      const tag = createTestTag('Electrical', '#3B82F6');

      // When: Deleting tag
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/tags/${tag.id}`,
        headers: { cookie },
      });

      // Then: 204 No Content
      expect(response.statusCode).toBe(204);
    });
  });
});

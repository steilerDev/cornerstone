import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import type { FastifyInstance } from 'fastify';
import type { NoteResponse, ApiErrorResponse, CreateNoteRequest } from '@cornerstone/shared';
import { workItems, workItemNotes } from '../db/schema.js';

describe('Note Routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    // Save original environment
    originalEnv = { ...process.env };

    // Create temporary directory for test database
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-notes-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';

    // Build app (runs migrations)
    app = await buildApp();

    // Reset timestamp offset for note creation
    noteTimestampOffset = 0;
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
   * Helper: Create a note directly in the database
   * Uses a timestamp offset to ensure unique created_at values for sorting tests
   */
  let noteTimestampOffset = 0;
  function createTestNote(workItemId: string, userId: string, content: string): string {
    // Add 1ms offset for each note to ensure unique timestamps
    const timestamp = new Date(Date.now() + noteTimestampOffset).toISOString();
    noteTimestampOffset += 1;

    const noteId = `note-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    app.db
      .insert(workItemNotes)
      .values({
        id: noteId,
        workItemId,
        content,
        createdBy: userId,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();
    return noteId;
  }

  describe('POST /api/work-items/:workItemId/notes', () => {
    it('creates a note successfully with 201 status (UAT-3.4-01)', async () => {
      // Given: Authenticated user and work item
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password',
      );
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      const body: CreateNoteRequest = { content: 'This is a test note' };

      // When: Creating a note
      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemId}/notes`,
        headers: { cookie },
        payload: body,
      });

      // Then: 201 with note response
      expect(response.statusCode).toBe(201);
      const result = response.json<NoteResponse>();
      expect(result.id).toBeDefined();
      expect(result.content).toBe('This is a test note');
      expect(result.createdBy?.id).toBe(userId);
      expect(result.createdBy?.displayName).toBe('Test User');
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });

    it('returns 401 if user is not authenticated (UAT-3.4-04)', async () => {
      // Given: Work item exists but user is not authenticated
      const { userId } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      const body: CreateNoteRequest = { content: 'Note without auth' };

      // When: Creating a note without auth
      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemId}/notes`,
        payload: body,
      });

      // Then: 401 Unauthorized
      expect(response.statusCode).toBe(401);
      const error = response.json<ApiErrorResponse>();
      expect(error.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 404 if work item does not exist (UAT-3.4-02)', async () => {
      // Given: Authenticated user, no work item
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const body: CreateNoteRequest = { content: 'Note on missing work item' };

      // When: Creating a note on non-existent work item
      const response = await app.inject({
        method: 'POST',
        url: '/api/work-items/nonexistent-work-item/notes',
        headers: { cookie },
        payload: body,
      });

      // Then: 404 Not Found
      expect(response.statusCode).toBe(404);
      const error = response.json<ApiErrorResponse>();
      expect(error.error.code).toBe('NOT_FOUND');
      expect(error.error.message).toContain('Work item not found');
    });

    it('returns 400 if content is missing (UAT-3.4-05)', async () => {
      // Given: Authenticated user and work item
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password',
      );
      const workItemId = createTestWorkItem(userId, 'Test Work Item');

      // When: Creating a note without content
      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemId}/notes`,
        headers: { cookie },
        payload: {},
      });

      // Then: 400 Validation Error
      expect(response.statusCode).toBe(400);
      const error = response.json<ApiErrorResponse>();
      expect(error.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 if content is empty string (UAT-3.4-03, UAT-3.4-06)', async () => {
      // Given: Authenticated user and work item
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password',
      );
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      const body: CreateNoteRequest = { content: '   ' };

      // When: Creating a note with empty content
      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItemId}/notes`,
        headers: { cookie },
        payload: body,
      });

      // Then: 400 Validation Error
      expect(response.statusCode).toBe(400);
      const error = response.json<ApiErrorResponse>();
      expect(error.error.code).toBe('VALIDATION_ERROR');
      expect(error.error.message).toContain('Note content cannot be empty');
    });
  });

  describe('GET /api/work-items/:workItemId/notes', () => {
    it('returns notes sorted by created_at DESC (UAT-3.4-07)', async () => {
      // Given: Authenticated user and work item with multiple notes
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password',
      );
      const workItemId = createTestWorkItem(userId, 'Test Work Item');

      const note1Id = createTestNote(workItemId, userId, 'First note');
      const note2Id = createTestNote(workItemId, userId, 'Second note');
      const note3Id = createTestNote(workItemId, userId, 'Third note');

      // When: Getting notes
      const response = await app.inject({
        method: 'GET',
        url: `/api/work-items/${workItemId}/notes`,
        headers: { cookie },
      });

      // Then: 200 with notes sorted newest first
      expect(response.statusCode).toBe(200);
      const body = response.json<{ notes: NoteResponse[] }>();
      expect(body.notes).toHaveLength(3);
      expect(body.notes[0].id).toBe(note3Id); // Most recent
      expect(body.notes[1].id).toBe(note2Id);
      expect(body.notes[2].id).toBe(note1Id); // Oldest
    });

    it('returns empty array when no notes exist (UAT-3.4-08)', async () => {
      // Given: Authenticated user and work item with no notes
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password',
      );
      const workItemId = createTestWorkItem(userId, 'Test Work Item');

      // When: Getting notes
      const response = await app.inject({
        method: 'GET',
        url: `/api/work-items/${workItemId}/notes`,
        headers: { cookie },
      });

      // Then: 200 with empty array
      expect(response.statusCode).toBe(200);
      const body = response.json<{ notes: NoteResponse[] }>();
      expect(body.notes).toEqual([]);
    });

    it('returns 401 if user is not authenticated', async () => {
      // Given: Work item exists but user is not authenticated
      const { userId } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const workItemId = createTestWorkItem(userId, 'Test Work Item');

      // When: Getting notes without auth
      const response = await app.inject({
        method: 'GET',
        url: `/api/work-items/${workItemId}/notes`,
      });

      // Then: 401 Unauthorized
      expect(response.statusCode).toBe(401);
      const error = response.json<ApiErrorResponse>();
      expect(error.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 404 if work item does not exist', async () => {
      // Given: Authenticated user, no work item
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      // When: Getting notes for non-existent work item
      const response = await app.inject({
        method: 'GET',
        url: '/api/work-items/nonexistent-work-item/notes',
        headers: { cookie },
      });

      // Then: 404 Not Found
      expect(response.statusCode).toBe(404);
      const error = response.json<ApiErrorResponse>();
      expect(error.error.code).toBe('NOT_FOUND');
      expect(error.error.message).toContain('Work item not found');
    });
  });

  describe('PATCH /api/work-items/:workItemId/notes/:noteId', () => {
    it('allows note author to update successfully (UAT-3.4-09)', async () => {
      // Given: User creates a note
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password',
      );
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      const noteId = createTestNote(workItemId, userId, 'Original content');

      // When: Author updates the note
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/work-items/${workItemId}/notes/${noteId}`,
        headers: { cookie },
        payload: { content: 'Updated content' },
      });

      // Then: 200 with updated note
      expect(response.statusCode).toBe(200);
      const result = response.json<NoteResponse>();
      expect(result.content).toBe('Updated content');
      expect(result.id).toBe(noteId);
    });

    it('allows admin to update any note (UAT-3.4-10)', async () => {
      // Given: Regular user creates a note, admin exists
      const { userId: regularUserId } = await createUserWithSession(
        'user@example.com',
        'Regular User',
        'password',
      );
      const { cookie: adminCookie } = await createUserWithSession(
        'admin@example.com',
        'Admin User',
        'password',
        'admin',
      );
      const workItemId = createTestWorkItem(regularUserId, 'Test Work Item');
      const noteId = createTestNote(workItemId, regularUserId, 'Original content');

      // When: Admin updates the note
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/work-items/${workItemId}/notes/${noteId}`,
        headers: { cookie: adminCookie },
        payload: { content: 'Updated by admin' },
      });

      // Then: 200 with updated note
      expect(response.statusCode).toBe(200);
      const result = response.json<NoteResponse>();
      expect(result.content).toBe('Updated by admin');
    });

    it('returns 403 if non-author non-admin tries to update (UAT-3.4-11)', async () => {
      // Given: Two regular users
      const { userId: authorId } = await createUserWithSession(
        'author@example.com',
        'Author',
        'password',
      );
      const { cookie: otherCookie } = await createUserWithSession(
        'other@example.com',
        'Other User',
        'password',
      );
      const workItemId = createTestWorkItem(authorId, 'Test Work Item');
      const noteId = createTestNote(workItemId, authorId, 'Original content');

      // When: Non-author tries to update
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/work-items/${workItemId}/notes/${noteId}`,
        headers: { cookie: otherCookie },
        payload: { content: 'Unauthorized update' },
      });

      // Then: 403 Forbidden
      expect(response.statusCode).toBe(403);
      const error = response.json<ApiErrorResponse>();
      expect(error.error.code).toBe('FORBIDDEN');
      expect(error.error.message).toContain(
        'Only the note author or an admin can update this note',
      );
    });

    it('returns 404 if note does not exist (UAT-3.4-12)', async () => {
      // Given: Authenticated user and work item
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password',
      );
      const workItemId = createTestWorkItem(userId, 'Test Work Item');

      // When: Updating non-existent note
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/work-items/${workItemId}/notes/nonexistent-note`,
        headers: { cookie },
        payload: { content: 'Update content' },
      });

      // Then: 404 Not Found
      expect(response.statusCode).toBe(404);
      const error = response.json<ApiErrorResponse>();
      expect(error.error.code).toBe('NOT_FOUND');
      expect(error.error.message).toContain('Note not found');
    });

    it('returns 400 if content is empty (UAT-3.4-13)', async () => {
      // Given: User creates a note
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password',
      );
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      const noteId = createTestNote(workItemId, userId, 'Original content');

      // When: Updating with empty content
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/work-items/${workItemId}/notes/${noteId}`,
        headers: { cookie },
        payload: { content: '   ' },
      });

      // Then: 400 Validation Error
      expect(response.statusCode).toBe(400);
      const error = response.json<ApiErrorResponse>();
      expect(error.error.code).toBe('VALIDATION_ERROR');
      expect(error.error.message).toContain('Note content cannot be empty');
    });

    it('returns 401 if user is not authenticated', async () => {
      // Given: A note exists
      const { userId } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      const noteId = createTestNote(workItemId, userId, 'Original content');

      // When: Updating without auth
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/work-items/${workItemId}/notes/${noteId}`,
        payload: { content: 'Update' },
      });

      // Then: 401 Unauthorized
      expect(response.statusCode).toBe(401);
      const error = response.json<ApiErrorResponse>();
      expect(error.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('DELETE /api/work-items/:workItemId/notes/:noteId', () => {
    it('allows note author to delete successfully (UAT-3.4-14)', async () => {
      // Given: User creates a note
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password',
      );
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      const noteId = createTestNote(workItemId, userId, 'Content to delete');

      // When: Author deletes the note
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/work-items/${workItemId}/notes/${noteId}`,
        headers: { cookie },
      });

      // Then: 204 No Content
      expect(response.statusCode).toBe(204);
      expect(response.body).toBe('');
    });

    it('allows admin to delete any note (UAT-3.4-15)', async () => {
      // Given: Regular user creates a note, admin exists
      const { userId: regularUserId } = await createUserWithSession(
        'user@example.com',
        'Regular User',
        'password',
      );
      const { cookie: adminCookie } = await createUserWithSession(
        'admin@example.com',
        'Admin User',
        'password',
        'admin',
      );
      const workItemId = createTestWorkItem(regularUserId, 'Test Work Item');
      const noteId = createTestNote(workItemId, regularUserId, 'Content to delete');

      // When: Admin deletes the note
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/work-items/${workItemId}/notes/${noteId}`,
        headers: { cookie: adminCookie },
      });

      // Then: 204 No Content
      expect(response.statusCode).toBe(204);
      expect(response.body).toBe('');
    });

    it('returns 403 if non-author non-admin tries to delete (UAT-3.4-16)', async () => {
      // Given: Two regular users
      const { userId: authorId } = await createUserWithSession(
        'author@example.com',
        'Author',
        'password',
      );
      const { cookie: otherCookie } = await createUserWithSession(
        'other@example.com',
        'Other User',
        'password',
      );
      const workItemId = createTestWorkItem(authorId, 'Test Work Item');
      const noteId = createTestNote(workItemId, authorId, 'Content');

      // When: Non-author tries to delete
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/work-items/${workItemId}/notes/${noteId}`,
        headers: { cookie: otherCookie },
      });

      // Then: 403 Forbidden
      expect(response.statusCode).toBe(403);
      const error = response.json<ApiErrorResponse>();
      expect(error.error.code).toBe('FORBIDDEN');
      expect(error.error.message).toContain(
        'Only the note author or an admin can delete this note',
      );
    });

    it('returns 404 if note does not exist (UAT-3.4-17)', async () => {
      // Given: Authenticated user and work item
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password',
      );
      const workItemId = createTestWorkItem(userId, 'Test Work Item');

      // When: Deleting non-existent note
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/work-items/${workItemId}/notes/nonexistent-note`,
        headers: { cookie },
      });

      // Then: 404 Not Found
      expect(response.statusCode).toBe(404);
      const error = response.json<ApiErrorResponse>();
      expect(error.error.code).toBe('NOT_FOUND');
      expect(error.error.message).toContain('Note not found');
    });

    it('returns 401 if user is not authenticated', async () => {
      // Given: A note exists
      const { userId } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const workItemId = createTestWorkItem(userId, 'Test Work Item');
      const noteId = createTestNote(workItemId, userId, 'Content');

      // When: Deleting without auth
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/work-items/${workItemId}/notes/${noteId}`,
      });

      // Then: 401 Unauthorized
      expect(response.statusCode).toBe(401);
      const error = response.json<ApiErrorResponse>();
      expect(error.error.code).toBe('UNAUTHORIZED');
    });
  });
});

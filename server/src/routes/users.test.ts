import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import { users } from '../db/schema.js';
import type { FastifyInstance } from 'fastify';
import type { UserResponse } from '@cornerstone/shared';

describe('User Routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    // Save original environment
    originalEnv = { ...process.env };

    // Create temporary directory for test database
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-users-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false'; // Disable secure cookies for testing

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
   * Helper: Create a local user and return a session cookie string
   */
  async function createUserWithSession(
    email: string,
    displayName: string,
    password: string,
    role: 'admin' | 'member' = 'admin',
  ): Promise<{ userId: string; cookie: string }> {
    const user = await userService.createLocalUser(app.db, email, displayName, password, role);
    const sessionToken = sessionService.createSession(
      app.db,
      user.id,
      3600, // 1 hour
    );
    return {
      userId: user.id,
      cookie: `cornerstone_session=${sessionToken}`,
    };
  }

  /**
   * Helper: Create an OIDC user directly in DB and return session cookie
   */
  function createOidcUserWithSession(
    email: string,
    displayName: string,
    oidcSubject: string,
  ): { userId: string; cookie: string } {
    const now = new Date().toISOString();
    const userId = `oidc-${Date.now()}`;

    app.db
      .insert(users)
      .values({
        id: userId,
        email,
        displayName,
        role: 'member',
        authProvider: 'oidc',
        oidcSubject,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const sessionToken = sessionService.createSession(app.db, userId, 3600);

    return {
      userId,
      cookie: `cornerstone_session=${sessionToken}`,
    };
  }

  describe('GET /api/users/me', () => {
    it('returns 401 when not authenticated', async () => {
      // Given: No session cookie
      // When: Requesting current user profile
      const response = await app.inject({
        method: 'GET',
        url: '/api/users/me',
      });

      // Then: Returns 401 Unauthorized
      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('UNAUTHORIZED');
      expect(body.error.message).toContain('Authentication required');
    });

    it('returns the current user profile when authenticated', async () => {
      // Given: Authenticated user
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123456',
        'member',
      );

      // When: Requesting profile
      const response = await app.inject({
        method: 'GET',
        url: '/api/users/me',
        headers: { cookie },
      });

      // Then: Returns 200 with user profile
      expect(response.statusCode).toBe(200);
      const user = JSON.parse(response.body) as UserResponse;

      // And: All expected fields are present
      expect(user).toMatchObject({
        id: userId,
        email: 'user@example.com',
        displayName: 'Test User',
        role: 'member',
        authProvider: 'local',
      });
      expect(user.createdAt).toBeDefined();
      expect(user.updatedAt).toBeDefined();
      expect(user.deactivatedAt).toBeNull();
    });

    it('does NOT return sensitive fields (passwordHash, oidcSubject)', async () => {
      // Given: Authenticated local user
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123456',
      );

      // When: Requesting profile
      const response = await app.inject({
        method: 'GET',
        url: '/api/users/me',
        headers: { cookie },
      });

      // Then: Response does not contain sensitive fields
      expect(response.statusCode).toBe(200);
      const user = JSON.parse(response.body);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((user as any).passwordHash).toBeUndefined();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((user as any).oidcSubject).toBeUndefined();
    });

    it('returns user directly (not wrapped in { user: ... })', async () => {
      // Given: Authenticated user
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123456',
      );

      // When: Requesting profile
      const response = await app.inject({
        method: 'GET',
        url: '/api/users/me',
        headers: { cookie },
      });

      // Then: Returns user object directly, not nested
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBeDefined();
      expect(body.email).toBeDefined();
      // Not wrapped: { user: { id, email, ... } }
      expect(body.user).toBeUndefined();
    });
  });

  describe('PATCH /api/users/me', () => {
    it('returns 401 when not authenticated', async () => {
      // Given: No session cookie
      // When: Attempting to update display name
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/users/me',
        payload: { displayName: 'New Name' },
      });

      // Then: Returns 401 Unauthorized
      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('updates displayName successfully', async () => {
      // Given: Authenticated user
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Old Name',
        'password123456',
      );
      const oldUser = app.db.select().from(users).where(eq(users.id, userId)).get()!;

      // When: Updating display name
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/users/me',
        headers: { cookie },
        payload: { displayName: 'New Name' },
      });

      // Then: Returns 200 with updated user
      expect(response.statusCode).toBe(200);
      const updatedUser = JSON.parse(response.body) as UserResponse;

      expect(updatedUser.displayName).toBe('New Name');
      expect(updatedUser.id).toBe(userId);

      // And: updatedAt timestamp is newer
      expect(new Date(updatedUser.updatedAt!).getTime()).toBeGreaterThan(
        new Date(oldUser.updatedAt!).getTime(),
      );
    });

    it('returns 400 for empty displayName', async () => {
      // Given: Authenticated user
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123456',
      );

      // When: Sending empty display name
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/users/me',
        headers: { cookie },
        payload: { displayName: '' },
      });

      // Then: Returns 400 Bad Request
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for displayName > 100 chars', async () => {
      // Given: Authenticated user
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123456',
      );

      // When: Sending display name longer than 100 characters
      const longName = 'A'.repeat(101);
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/users/me',
        headers: { cookie },
        payload: { displayName: longName },
      });

      // Then: Returns 400 Bad Request
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for missing displayName', async () => {
      // Given: Authenticated user
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123456',
      );

      // When: Sending request without displayName field
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/users/me',
        headers: { cookie },
        payload: {},
      });

      // Then: Returns 400 Bad Request
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('ignores additional properties (Fastify strips them)', async () => {
      // Given: Authenticated user
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123456',
      );

      // When: Sending request with extra fields
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/users/me',
        headers: { cookie },
        payload: { displayName: 'New Name', extraField: 'not allowed' },
      });

      // Then: Request succeeds (extra field is stripped by Fastify)
      // Note: Fastify's default behavior with additionalProperties:false is to strip extras, not reject
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.displayName).toBe('New Name');
    });

    it('persists the updated display name (GET returns updated name)', async () => {
      // Given: Authenticated user
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Old Name',
        'password123456',
      );

      // When: Updating display name
      await app.inject({
        method: 'PATCH',
        url: '/api/users/me',
        headers: { cookie },
        payload: { displayName: 'New Name' },
      });

      // And: Fetching profile again
      const getResponse = await app.inject({
        method: 'GET',
        url: '/api/users/me',
        headers: { cookie },
      });

      // Then: Updated name is persisted
      expect(getResponse.statusCode).toBe(200);
      const user = JSON.parse(getResponse.body) as UserResponse;
      expect(user.displayName).toBe('New Name');
    });
  });

  describe('POST /api/users/me/password', () => {
    it('returns 401 when not authenticated', async () => {
      // Given: No session cookie
      // When: Attempting to change password
      const response = await app.inject({
        method: 'POST',
        url: '/api/users/me/password',
        payload: {
          currentPassword: 'oldpassword123',
          newPassword: 'newpassword123',
        },
      });

      // Then: Returns 401 Unauthorized
      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('changes password successfully', async () => {
      // Given: Authenticated local user
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'oldpassword123',
      );

      // When: Changing password
      const response = await app.inject({
        method: 'POST',
        url: '/api/users/me/password',
        headers: { cookie },
        payload: {
          currentPassword: 'oldpassword123',
          newPassword: 'newpassword123',
        },
      });

      // Then: Returns 204 No Content
      expect(response.statusCode).toBe(204);
      expect(response.body).toBe('');

      // And: New password is persisted in database
      const user = app.db.select().from(users).where(eq(users.id, userId)).get()!;
      expect(user.passwordHash).toBeDefined();

      // And: New password can be verified
      const isValid = await argon2.verify(user.passwordHash!, 'newpassword123');
      expect(isValid).toBe(true);
    });

    it('allows login with new password after password change', async () => {
      // Given: User changed their password
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'oldpassword123',
      );

      await app.inject({
        method: 'POST',
        url: '/api/users/me/password',
        headers: { cookie },
        payload: {
          currentPassword: 'oldpassword123',
          newPassword: 'newpassword123',
        },
      });

      // When: Logging in with new password
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'user@example.com',
          password: 'newpassword123',
        },
      });

      // Then: Login succeeds
      expect(loginResponse.statusCode).toBe(200);
      const body = JSON.parse(loginResponse.body);
      expect(body.user).toBeDefined();
      expect(body.user.email).toBe('user@example.com');
    });

    it('returns 401 INVALID_CREDENTIALS for wrong current password', async () => {
      // Given: Authenticated user
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'correctpassword',
      );

      // When: Providing wrong current password
      const response = await app.inject({
        method: 'POST',
        url: '/api/users/me/password',
        headers: { cookie },
        payload: {
          currentPassword: 'wrongpassword',
          newPassword: 'newpassword123',
        },
      });

      // Then: Returns 401 with INVALID_CREDENTIALS
      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('INVALID_CREDENTIALS');
      expect(body.error.message).toContain('Current password is incorrect');
    });

    it('returns 403 FORBIDDEN for OIDC users', async () => {
      // Given: Authenticated OIDC user
      const { cookie } = createOidcUserWithSession('oidc@example.com', 'OIDC User', 'oidc-sub-123');

      // When: OIDC user attempts to change password
      const response = await app.inject({
        method: 'POST',
        url: '/api/users/me/password',
        headers: { cookie },
        payload: {
          currentPassword: 'anything',
          newPassword: 'newpassword123',
        },
      });

      // Then: Returns 403 Forbidden
      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('FORBIDDEN');
      expect(body.error.message).toContain('identity provider');
    });

    it('returns 400 for newPassword < 12 chars', async () => {
      // Given: Authenticated user
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123456',
      );

      // When: Providing new password shorter than 12 characters
      const response = await app.inject({
        method: 'POST',
        url: '/api/users/me/password',
        headers: { cookie },
        payload: {
          currentPassword: 'password123456',
          newPassword: 'short',
        },
      });

      // Then: Returns 400 Bad Request
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for missing currentPassword', async () => {
      // Given: Authenticated user
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123456',
      );

      // When: Not providing current password
      const response = await app.inject({
        method: 'POST',
        url: '/api/users/me/password',
        headers: { cookie },
        payload: {
          newPassword: 'newpassword123',
        },
      });

      // Then: Returns 400 Bad Request
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for missing newPassword', async () => {
      // Given: Authenticated user
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123456',
      );

      // When: Not providing new password
      const response = await app.inject({
        method: 'POST',
        url: '/api/users/me/password',
        headers: { cookie },
        payload: {
          currentPassword: 'password123456',
        },
      });

      // Then: Returns 400 Bad Request
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});

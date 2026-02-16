import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { buildApp } from '../app.js';
import { requireRole } from './auth.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import { users } from '../db/schema.js';
import type { FastifyInstance } from 'fastify';

describe('requireRole decorator', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    // Save original environment
    originalEnv = { ...process.env };

    // Create temporary directory for test database
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-rbac-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false'; // Disable secure cookies for testing

    // Build app (runs migrations)
    app = await buildApp();

    // Register test routes with requireRole
    app.get('/api/test-admin', { preHandler: [requireRole('admin')] }, async (request) => {
      return { user: request.user, message: 'Admin access granted' };
    });

    app.get(
      '/api/test-multi-role',
      { preHandler: [requireRole('admin', 'member')] },
      async (request) => {
        return { user: request.user, message: 'Access granted' };
      },
    );

    // Call ready to ensure routes are registered
    await app.ready();
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

  describe('admin-only route protection', () => {
    it('allows admin user to access admin-protected route', async () => {
      // Given: An admin user with active session
      const adminUser = await userService.createLocalUser(
        app.db,
        'admin@example.com',
        'Admin User',
        'password123456',
      );

      // Update user role to admin
      app.db.update(users).set({ role: 'admin' }).where(eq(users.id, adminUser.id)).run();

      const session = sessionService.createSession(app.db, adminUser.id, 3600);
      const sessionCookie = `cornerstone_session=${session}`;

      // When: Admin user accesses admin-protected route
      const response = await app.inject({
        method: 'GET',
        url: '/api/test-admin',
        headers: {
          cookie: sessionCookie,
        },
      });

      // Then: Access is granted with 200 OK
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Admin access granted');
      expect(body.user.email).toBe('admin@example.com');
      expect(body.user.role).toBe('admin');
    });

    it('returns 403 FORBIDDEN when member tries to access admin-protected route', async () => {
      // Given: A member user with active session
      const memberUser = await userService.createLocalUser(
        app.db,
        'member@example.com',
        'Member User',
        'password123456',
      );

      const session = sessionService.createSession(app.db, memberUser.id, 3600);
      const sessionCookie = `cornerstone_session=${session}`;

      // When: Member user tries to access admin-protected route
      const response = await app.inject({
        method: 'GET',
        url: '/api/test-admin',
        headers: {
          cookie: sessionCookie,
        },
      });

      // Then: Access is denied with 403 FORBIDDEN
      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('FORBIDDEN');
      expect(body.error.message).toBe('Insufficient permissions');
    });

    it('returns 401 UNAUTHORIZED when unauthenticated user tries to access admin-protected route', async () => {
      // Given: No session cookie

      // When: Unauthenticated user tries to access admin-protected route
      const response = await app.inject({
        method: 'GET',
        url: '/api/test-admin',
      });

      // Then: Auth check comes first, returns 401 (not 403)
      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('UNAUTHORIZED');
      expect(body.error.message).toBe('Authentication required');
    });
  });

  describe('multi-role route protection', () => {
    it('allows admin user to access multi-role route', async () => {
      // Given: An admin user with active session
      const adminUser = await userService.createLocalUser(
        app.db,
        'admin@example.com',
        'Admin User',
        'password123456',
      );

      // Update user role to admin
      app.db.update(users).set({ role: 'admin' }).where(eq(users.id, adminUser.id)).run();

      const session = sessionService.createSession(app.db, adminUser.id, 3600);
      const sessionCookie = `cornerstone_session=${session}`;

      // When: Admin user accesses multi-role route
      const response = await app.inject({
        method: 'GET',
        url: '/api/test-multi-role',
        headers: {
          cookie: sessionCookie,
        },
      });

      // Then: Access is granted
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Access granted');
      expect(body.user.role).toBe('admin');
    });

    it('allows member user to access multi-role route', async () => {
      // Given: A member user with active session
      const memberUser = await userService.createLocalUser(
        app.db,
        'member@example.com',
        'Member User',
        'password123456',
      );

      const session = sessionService.createSession(app.db, memberUser.id, 3600);
      const sessionCookie = `cornerstone_session=${session}`;

      // When: Member user accesses multi-role route
      const response = await app.inject({
        method: 'GET',
        url: '/api/test-multi-role',
        headers: {
          cookie: sessionCookie,
        },
      });

      // Then: Access is granted
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Access granted');
      expect(body.user.role).toBe('member');
    });
  });

  describe('role check ordering (auth before role)', () => {
    it('returns 401 for missing session before checking role', async () => {
      // Given: No session cookie (unauthenticated)

      // When: Trying to access admin-protected route
      const response = await app.inject({
        method: 'GET',
        url: '/api/test-admin',
      });

      // Then: Auth check fails first (401), not role check (403)
      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('role changes take effect immediately', () => {
    it('reflects role change on next request without re-login', async () => {
      // Given: A member user with active session
      const memberUser = await userService.createLocalUser(
        app.db,
        'user@example.com',
        'Test User',
        'password123456',
      );

      const session = sessionService.createSession(app.db, memberUser.id, 3600);
      const sessionCookie = `cornerstone_session=${session}`;

      // When: Member tries to access admin route (should fail)
      const response1 = await app.inject({
        method: 'GET',
        url: '/api/test-admin',
        headers: {
          cookie: sessionCookie,
        },
      });

      // Then: Access is denied (member role)
      expect(response1.statusCode).toBe(403);

      // When: User role is upgraded to admin in database
      app.db.update(users).set({ role: 'admin' }).where(eq(users.id, memberUser.id)).run();

      // And: Same session is used for next request
      const response2 = await app.inject({
        method: 'GET',
        url: '/api/test-admin',
        headers: {
          cookie: sessionCookie,
        },
      });

      // Then: Access is granted (role change took effect immediately)
      expect(response2.statusCode).toBe(200);
      const body = JSON.parse(response2.body);
      expect(body.user.role).toBe('admin');
      expect(body.message).toBe('Admin access granted');
    });
  });
});

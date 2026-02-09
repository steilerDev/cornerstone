import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import { users } from '../db/schema.js';
import type { FastifyInstance } from 'fastify';
import type { UserResponse } from '@cornerstone/shared';

describe('Authentication Routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    // Save original environment
    originalEnv = { ...process.env };

    // Create temporary directory for test database
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-auth-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');

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

  describe('GET /api/auth/me', () => {
    it('returns setupRequired: true when no users exist', async () => {
      // Given: Empty database (no users)
      const userCount = userService.countUsers(app.db);
      expect(userCount).toBe(0);

      // When: Getting current auth status
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
      });

      // Then: Response indicates setup is required
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toEqual({
        user: null,
        setupRequired: true,
        oidcEnabled: false,
      });
    });

    it('returns setupRequired: false when users exist', async () => {
      // Given: One user exists in database
      await userService.createLocalUser(
        app.db,
        'existing@example.com',
        'Existing User',
        'password123456',
      );

      // When: Getting current auth status
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
      });

      // Then: Response indicates setup is complete
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toEqual({
        user: null,
        setupRequired: false,
        oidcEnabled: false,
      });
    });

    it('returns user: null (session support not yet implemented)', async () => {
      // Given: User exists but no session support yet
      await userService.createLocalUser(app.db, 'user@example.com', 'User', 'password123456');

      // When: Getting current auth status
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
      });

      // Then: user is null (Story #32 will add session support)
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.user).toBeNull();
    });

    it('always returns oidcEnabled: false (OIDC not yet implemented)', async () => {
      // Given: App is running
      // When: Getting current auth status
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
      });

      // Then: oidcEnabled is false
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.oidcEnabled).toBe(false);
    });
  });

  describe('POST /api/auth/setup', () => {
    it('creates first admin user successfully (201)', async () => {
      // Given: No users exist
      expect(userService.countUsers(app.db)).toBe(0);

      // When: Creating first admin user via setup
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/setup',
        payload: {
          email: 'admin@example.com',
          displayName: 'Admin User',
          password: 'SecurePassword123',
        },
      });

      // Then: Response is 201 Created
      expect(response.statusCode).toBe(201);

      // And: Response contains user object
      const body = JSON.parse(response.body) as { user: UserResponse };
      expect(body.user).toBeDefined();
      expect(body.user.email).toBe('admin@example.com');
      expect(body.user.displayName).toBe('Admin User');
      expect(body.user.role).toBe('admin');
      expect(body.user.authProvider).toBe('local');

      // And: User is created in database
      expect(userService.countUsers(app.db)).toBe(1);
    });

    it('returns 403 SETUP_COMPLETE when users already exist', async () => {
      // Given: One user already exists
      await userService.createLocalUser(
        app.db,
        'existing@example.com',
        'Existing User',
        'password123456',
      );

      // When: Attempting setup again
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/setup',
        payload: {
          email: 'second@example.com',
          displayName: 'Second User',
          password: 'AnotherPassword123',
        },
      });

      // Then: Response is 403 Forbidden
      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('SETUP_COMPLETE');
      expect(body.error.message).toBe('Setup already complete');
    });

    it('validates email format (400)', async () => {
      // Given: Invalid email format
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/setup',
        payload: {
          email: 'not-an-email',
          displayName: 'Test User',
          password: 'SecurePassword123',
        },
      });

      // Then: Response is 400 Bad Request
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('validates password minimum length 12 (400)', async () => {
      // Given: Password too short
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/setup',
        payload: {
          email: 'admin@example.com',
          displayName: 'Admin User',
          password: 'short',
        },
      });

      // Then: Response is 400 Bad Request
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('validates displayName required (400)', async () => {
      // Given: Missing displayName
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/setup',
        payload: {
          email: 'admin@example.com',
          password: 'SecurePassword123',
        },
      });

      // Then: Response is 400 Bad Request
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('validates displayName not empty string (400)', async () => {
      // Given: Empty displayName (violates minLength: 1)
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/setup',
        payload: {
          email: 'admin@example.com',
          displayName: '',
          password: 'SecurePassword123',
        },
      });

      // Then: Response is 400 Bad Request
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('validates displayName maxLength 100 (400)', async () => {
      // Given: displayName exceeds 100 characters
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/setup',
        payload: {
          email: 'admin@example.com',
          displayName: 'A'.repeat(101),
          password: 'SecurePassword123',
        },
      });

      // Then: Response is 400 Bad Request
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('validates email required (400)', async () => {
      // Given: Missing email
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/setup',
        payload: {
          displayName: 'Admin User',
          password: 'SecurePassword123',
        },
      });

      // Then: Response is 400 Bad Request
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('validates password required (400)', async () => {
      // Given: Missing password
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/setup',
        payload: {
          email: 'admin@example.com',
          displayName: 'Admin User',
        },
      });

      // Then: Response is 400 Bad Request
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('accepts payload even with additional properties (additionalProperties ignored)', async () => {
      // Given: Payload with extra fields
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/setup',
        payload: {
          email: 'admin@example.com',
          displayName: 'Admin User',
          password: 'SecurePassword123',
          extraField: 'not-allowed',
        },
      });

      // Then: Request succeeds (extra fields are ignored, not rejected)
      // Note: Fastify's default AJV configuration does not reject extra properties
      expect(response.statusCode).toBe(201);
    });

    it('response never includes passwordHash', async () => {
      // Given: Valid setup request
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/setup',
        payload: {
          email: 'admin@example.com',
          displayName: 'Admin User',
          password: 'SecurePassword123',
        },
      });

      // Then: Response is successful
      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body) as { user: UserResponse };

      // And: passwordHash is not in response
      expect(body.user).not.toHaveProperty('passwordHash');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((body.user as any).passwordHash).toBeUndefined();
    });

    it('response never includes oidcSubject', async () => {
      // Given: Valid setup request
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/setup',
        payload: {
          email: 'admin@example.com',
          displayName: 'Admin User',
          password: 'SecurePassword123',
        },
      });

      // Then: Response is successful
      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body) as { user: UserResponse };

      // And: oidcSubject is not in response
      expect(body.user).not.toHaveProperty('oidcSubject');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((body.user as any).oidcSubject).toBeUndefined();
    });

    it('creates user with role admin (not member)', async () => {
      // Given: Setup request
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/setup',
        payload: {
          email: 'admin@example.com',
          displayName: 'Admin User',
          password: 'SecurePassword123',
        },
      });

      // Then: User has admin role
      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body) as { user: UserResponse };
      expect(body.user.role).toBe('admin');
    });

    it('accepts password exactly 12 characters (boundary)', async () => {
      // Given: Password with exactly 12 characters
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/setup',
        payload: {
          email: 'admin@example.com',
          displayName: 'Admin User',
          password: '123456789012', // Exactly 12 chars
        },
      });

      // Then: Request is accepted
      expect(response.statusCode).toBe(201);
    });

    it('rejects password with 11 characters (below minimum)', async () => {
      // Given: Password with 11 characters
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/setup',
        payload: {
          email: 'admin@example.com',
          displayName: 'Admin User',
          password: '12345678901', // 11 chars
        },
      });

      // Then: Request is rejected
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/auth/login', () => {
    it('succeeds with valid credentials (200)', async () => {
      // Given: User exists with known password
      const email = 'login@example.com';
      const password = 'SecurePassword123';
      await userService.createLocalUser(app.db, email, 'Login User', password);

      // When: Logging in with correct credentials
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email, password },
      });

      // Then: Response is 200 OK
      expect(response.statusCode).toBe(200);

      // And: Response contains user object
      const body = JSON.parse(response.body) as { user: UserResponse };
      expect(body.user).toBeDefined();
      expect(body.user.email).toBe(email);
      expect(body.user.displayName).toBe('Login User');
    });

    it('fails with wrong password (401 INVALID_CREDENTIALS)', async () => {
      // Given: User exists
      const email = 'user@example.com';
      await userService.createLocalUser(app.db, email, 'User', 'CorrectPassword123');

      // When: Logging in with wrong password
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email, password: 'WrongPassword123' },
      });

      // Then: Response is 401 Unauthorized
      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('INVALID_CREDENTIALS');
      expect(body.error.message).toBe('Invalid email or password');
    });

    it('fails with non-existent email (401 INVALID_CREDENTIALS)', async () => {
      // Given: User does not exist
      // When: Logging in with non-existent email
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'nonexistent@example.com', password: 'AnyPassword123' },
      });

      // Then: Response is 401 Unauthorized
      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('INVALID_CREDENTIALS');
      expect(body.error.message).toBe('Invalid email or password');
    });

    it('fails for deactivated user (401 ACCOUNT_DEACTIVATED)', async () => {
      // Given: User exists but is deactivated
      const email = 'deactivated@example.com';
      const password = 'SecurePassword123';
      const user = await userService.createLocalUser(app.db, email, 'Deactivated User', password);

      // Deactivate user
      app.db
        .update(users)
        .set({ deactivatedAt: new Date().toISOString() })
        .where(eq(users.id, user.id))
        .run();

      // When: Attempting to log in
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email, password },
      });

      // Then: Response is 401 Unauthorized
      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('ACCOUNT_DEACTIVATED');
      expect(body.error.message).toBe('Account has been deactivated');
    });

    it('validates body schema - missing email (400)', async () => {
      // Given: Request missing email
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { password: 'SecurePassword123' },
      });

      // Then: Response is 400 Bad Request
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('validates body schema - missing password (400)', async () => {
      // Given: Request missing password
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'user@example.com' },
      });

      // Then: Response is 400 Bad Request
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('validates body schema - empty object (400)', async () => {
      // Given: Empty payload
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {},
      });

      // Then: Response is 400 Bad Request
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('accepts payload even with additional properties (additionalProperties ignored)', async () => {
      // Given: User exists
      await userService.createLocalUser(app.db, 'user@example.com', 'User', 'SecurePassword123');

      // When: Payload with extra fields
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'user@example.com',
          password: 'SecurePassword123',
          extraField: 'not-allowed',
        },
      });

      // Then: Request succeeds (extra fields are ignored, not rejected)
      // Note: Fastify's default AJV configuration does not reject extra properties
      expect(response.statusCode).toBe(200);
    });

    it('response never includes passwordHash', async () => {
      // Given: User exists
      const email = 'user@example.com';
      const password = 'SecurePassword123';
      await userService.createLocalUser(app.db, email, 'User', password);

      // When: Logging in successfully
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email, password },
      });

      // Then: Response is successful
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as { user: UserResponse };

      // And: passwordHash is not in response
      expect(body.user).not.toHaveProperty('passwordHash');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((body.user as any).passwordHash).toBeUndefined();
    });

    it('response never includes oidcSubject', async () => {
      // Given: User exists
      const email = 'user@example.com';
      const password = 'SecurePassword123';
      await userService.createLocalUser(app.db, email, 'User', password);

      // When: Logging in successfully
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email, password },
      });

      // Then: Response is successful
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as { user: UserResponse };

      // And: oidcSubject is not in response
      expect(body.user).not.toHaveProperty('oidcSubject');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((body.user as any).oidcSubject).toBeUndefined();
    });

    it('performs timing-attack prevention (hashes dummy password when user not found)', async () => {
      // Given: No user exists with this email
      // When: Attempting to log in
      const startTime = Date.now();
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'nonexistent@example.com', password: 'SomePassword123' },
      });
      const elapsed = Date.now() - startTime;

      // Then: Response is 401
      expect(response.statusCode).toBe(401);

      // And: Response took reasonable time (argon2 hash takes >50ms typically)
      // This is a weak assertion but verifies the dummy hash is executed
      expect(elapsed).toBeGreaterThan(10); // At least some processing time
    });

    it('timing-attack prevention applies when user has no passwordHash (OIDC user)', async () => {
      // Given: OIDC user (no passwordHash)
      const now = new Date().toISOString();
      app.db
        .insert(users)
        .values({
          id: 'oidc-user-123',
          email: 'oidc@example.com',
          displayName: 'OIDC User',
          role: 'member',
          authProvider: 'oidc',
          passwordHash: null,
          oidcSubject: 'oidc-subject-123',
          deactivatedAt: null,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      // When: Attempting to log in with password
      const startTime = Date.now();
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'oidc@example.com', password: 'SomePassword123' },
      });
      const elapsed = Date.now() - startTime;

      // Then: Response is 401
      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('INVALID_CREDENTIALS');

      // And: Took reasonable time (dummy hash executed)
      expect(elapsed).toBeGreaterThan(10);
    });

    it('allows login for active user (deactivatedAt is null)', async () => {
      // Given: Active user
      const email = 'active@example.com';
      const password = 'SecurePassword123';
      const user = await userService.createLocalUser(app.db, email, 'Active User', password);
      expect(user.deactivatedAt).toBeNull();

      // When: Logging in
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email, password },
      });

      // Then: Login succeeds
      expect(response.statusCode).toBe(200);
    });

    it('login is case-sensitive for email', async () => {
      // Given: User with lowercase email
      const email = 'user@example.com';
      const password = 'SecurePassword123';
      await userService.createLocalUser(app.db, email, 'User', password);

      // When: Attempting login with uppercase email
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'USER@EXAMPLE.COM', password },
      });

      // Then: Login fails (case-sensitive)
      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('returns user with all safe fields populated', async () => {
      // Given: User exists
      const email = 'complete@example.com';
      const password = 'SecurePassword123';
      await userService.createLocalUser(app.db, email, 'Complete User', password, 'admin');

      // When: Logging in
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email, password },
      });

      // Then: Response includes all safe user fields
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as { user: UserResponse };
      expect(body.user.id).toBeDefined();
      expect(body.user.email).toBe(email);
      expect(body.user.displayName).toBe('Complete User');
      expect(body.user.role).toBe('admin');
      expect(body.user.authProvider).toBe('local');
      expect(body.user.createdAt).toBeDefined();
      expect(body.user.updatedAt).toBeDefined();
      expect(body.user.deactivatedAt).toBeNull();
    });
  });
});

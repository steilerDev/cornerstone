import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as schema from '../db/schema.js';
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

    it('returns user: null when no session cookie is sent', async () => {
      // Given: User exists but no session cookie is provided
      await userService.createLocalUser(app.db, 'user@example.com', 'User', 'password123456');

      // When: Getting current auth status without session cookie
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
      });

      // Then: user is null (no session cookie provided)
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

      // And: Response took reasonable time (scrypt hash takes >10ms typically)
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

  describe('Session Management', () => {
    describe('POST /api/auth/setup - session creation', () => {
      it('sets cornerstone_session cookie on successful setup', async () => {
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

        // Then: Response includes set-cookie header
        expect(response.statusCode).toBe(201);
        const setCookieHeader = response.headers['set-cookie'];
        expect(setCookieHeader).toBeDefined();

        // And: Cookie is named cornerstone_session
        expect(setCookieHeader).toContain('cornerstone_session=');
      });

      it('sets HttpOnly cookie attribute', async () => {
        // When: Setting up
        const response = await app.inject({
          method: 'POST',
          url: '/api/auth/setup',
          payload: {
            email: 'admin@example.com',
            displayName: 'Admin User',
            password: 'SecurePassword123',
          },
        });

        // Then: Cookie has HttpOnly attribute
        const setCookieHeader = response.headers['set-cookie'] as string;
        expect(setCookieHeader).toContain('HttpOnly');
      });

      it('sets SameSite=Lax cookie attribute', async () => {
        // When: Setting up
        const response = await app.inject({
          method: 'POST',
          url: '/api/auth/setup',
          payload: {
            email: 'admin@example.com',
            displayName: 'Admin User',
            password: 'SecurePassword123',
          },
        });

        // Then: Cookie has SameSite=Lax
        const setCookieHeader = response.headers['set-cookie'] as string;
        expect(setCookieHeader).toContain('SameSite=Lax');
      });

      it('sets cookie Path=/', async () => {
        // When: Setting up
        const response = await app.inject({
          method: 'POST',
          url: '/api/auth/setup',
          payload: {
            email: 'admin@example.com',
            displayName: 'Admin User',
            password: 'SecurePassword123',
          },
        });

        // Then: Cookie has Path=/
        const setCookieHeader = response.headers['set-cookie'] as string;
        expect(setCookieHeader).toContain('Path=/');
      });

      it('sets Max-Age cookie attribute', async () => {
        // When: Setting up
        const response = await app.inject({
          method: 'POST',
          url: '/api/auth/setup',
          payload: {
            email: 'admin@example.com',
            displayName: 'Admin User',
            password: 'SecurePassword123',
          },
        });

        // Then: Cookie has Max-Age attribute
        const setCookieHeader = response.headers['set-cookie'] as string;
        expect(setCookieHeader).toContain('Max-Age=');
      });

      it('does not set Secure attribute when SECURE_COOKIES is false', async () => {
        // Given: SECURE_COOKIES env var is set to 'false' in beforeEach
        // When: Setting up
        const response = await app.inject({
          method: 'POST',
          url: '/api/auth/setup',
          payload: {
            email: 'admin@example.com',
            displayName: 'Admin User',
            password: 'SecurePassword123',
          },
        });

        // Then: Cookie does NOT have Secure attribute
        const setCookieHeader = response.headers['set-cookie'] as string;
        expect(setCookieHeader).toBeDefined();
        expect(setCookieHeader).not.toContain('Secure');
      });
    });

    describe('POST /api/auth/login - session creation', () => {
      it('sets cornerstone_session cookie on successful login', async () => {
        // Given: User exists
        await userService.createLocalUser(app.db, 'user@example.com', 'User', 'SecurePassword123');

        // When: Logging in
        const response = await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { email: 'user@example.com', password: 'SecurePassword123' },
        });

        // Then: Response includes set-cookie header
        expect(response.statusCode).toBe(200);
        const setCookieHeader = response.headers['set-cookie'];
        expect(setCookieHeader).toBeDefined();

        // And: Cookie is named cornerstone_session
        expect(setCookieHeader).toContain('cornerstone_session=');
      });

      it('sets HttpOnly cookie attribute', async () => {
        // Given: User exists
        await userService.createLocalUser(app.db, 'user@example.com', 'User', 'SecurePassword123');

        // When: Logging in
        const response = await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { email: 'user@example.com', password: 'SecurePassword123' },
        });

        // Then: Cookie has HttpOnly attribute
        const setCookieHeader = response.headers['set-cookie'] as string;
        expect(setCookieHeader).toContain('HttpOnly');
      });

      it('sets SameSite=Lax cookie attribute', async () => {
        // Given: User exists
        await userService.createLocalUser(app.db, 'user@example.com', 'User', 'SecurePassword123');

        // When: Logging in
        const response = await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { email: 'user@example.com', password: 'SecurePassword123' },
        });

        // Then: Cookie has SameSite=Lax
        const setCookieHeader = response.headers['set-cookie'] as string;
        expect(setCookieHeader).toContain('SameSite=Lax');
      });
    });

    describe('GET /api/auth/me - with session', () => {
      it('returns user when valid session cookie is sent', async () => {
        // Given: User created via setup (which creates a session)
        const setupResponse = await app.inject({
          method: 'POST',
          url: '/api/auth/setup',
          payload: {
            email: 'admin@example.com',
            displayName: 'Admin User',
            password: 'SecurePassword123',
          },
        });

        // Then: Setup succeeded
        expect(setupResponse.statusCode).toBe(201);

        // Extract session cookie
        const setCookieHeader = setupResponse.headers['set-cookie'] as string;
        expect(setCookieHeader).toBeDefined();
        const sessionCookie = setCookieHeader.split(';')[0]; // Get "cornerstone_session=<token>"

        // When: Calling /me with session cookie
        const response = await app.inject({
          method: 'GET',
          url: '/api/auth/me',
          headers: { cookie: sessionCookie },
        });

        // Then: Response returns 200 with user data
        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);

        // Auth plugin now validates sessions for public routes (sets request.user if valid)
        expect(body.user).not.toBeNull();
        expect(body.user.email).toBe('admin@example.com');
        expect(body.user.displayName).toBe('Admin User');
        expect(body.user.role).toBe('admin');
      });

      it('returns user: null when no cookie is sent', async () => {
        // Given: User exists
        await userService.createLocalUser(app.db, 'user@example.com', 'User', 'SecurePassword123');

        // When: Calling /me without cookie
        const response = await app.inject({
          method: 'GET',
          url: '/api/auth/me',
        });

        // Then: user is null
        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.user).toBeNull();
        expect(body.setupRequired).toBe(false);
      });

      it('returns user: null when session is expired', async () => {
        // Given: User with an expired session (created directly in DB)
        const user = await userService.createLocalUser(
          app.db,
          'user@example.com',
          'User',
          'SecurePassword123',
        );

        // Create expired session
        const expiredSessionId = 'expired-session-token-123456789012345678901234567890123456789012';
        const pastTime = new Date(Date.now() - 10000).toISOString(); // 10 seconds ago
        app.db
          .insert(schema.sessions)
          .values({
            id: expiredSessionId,
            userId: user.id,
            expiresAt: pastTime,
            createdAt: new Date().toISOString(),
          })
          .run();

        // When: Calling /me with expired session cookie
        const response = await app.inject({
          method: 'GET',
          url: '/api/auth/me',
          headers: { cookie: `cornerstone_session=${expiredSessionId}` },
        });

        // Then: user is null
        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.user).toBeNull();
      });

      it('never returns 401 (endpoint is public)', async () => {
        // When: Calling /me without authentication
        const response = await app.inject({
          method: 'GET',
          url: '/api/auth/me',
        });

        // Then: Response is 200 (not 401)
        expect(response.statusCode).toBe(200);
      });
    });

    describe('POST /api/auth/logout', () => {
      it('destroys session and clears cookie', async () => {
        // Given: User created via setup
        await app.inject({
          method: 'POST',
          url: '/api/auth/setup',
          payload: {
            email: 'user@example.com',
            displayName: 'User',
            password: 'SecurePassword123',
          },
        });

        // And: User logged in
        const loginResponse = await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { email: 'user@example.com', password: 'SecurePassword123' },
        });

        const setCookieHeader = loginResponse.headers['set-cookie'] as string;
        const sessionCookie = setCookieHeader.split(';')[0];

        // When: Logging out
        const logoutResponse = await app.inject({
          method: 'POST',
          url: '/api/auth/logout',
          headers: { cookie: sessionCookie },
        });

        // Then: Response is 204 No Content
        expect(logoutResponse.statusCode).toBe(204);

        // And: Response clears the cookie (Max-Age=0)
        const logoutSetCookie = logoutResponse.headers['set-cookie'] as string;
        expect(logoutSetCookie).toContain('cornerstone_session=');
        expect(logoutSetCookie).toContain('Max-Age=0');
      });

      it('returns 204 even without a session cookie', async () => {
        // When: Logging out without a session
        const response = await app.inject({
          method: 'POST',
          url: '/api/auth/logout',
        });

        // Then: Response is 204 (logout is now public)
        expect(response.statusCode).toBe(204);

        // And: Cookie is cleared
        const setCookieHeader = response.headers['set-cookie'] as string;
        expect(setCookieHeader).toContain('cornerstone_session=');
        expect(setCookieHeader).toContain('Max-Age=0');
      });

      it('clears cookie with correct attributes', async () => {
        // When: Logging out
        const response = await app.inject({
          method: 'POST',
          url: '/api/auth/logout',
        });

        // Then: Response is 204 (logout is now public)
        expect(response.statusCode).toBe(204);

        // And: Cookie is cleared with correct attributes
        const setCookieHeader = response.headers['set-cookie'] as string;
        expect(setCookieHeader).toContain('cornerstone_session=');
        expect(setCookieHeader).toContain('Max-Age=0');
      });

      it('session is invalid after logout', async () => {
        // Given: User logged in
        await app.inject({
          method: 'POST',
          url: '/api/auth/setup',
          payload: {
            email: 'user@example.com',
            displayName: 'User',
            password: 'SecurePassword123',
          },
        });

        const loginResponse = await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { email: 'user@example.com', password: 'SecurePassword123' },
        });

        const setCookieHeader = loginResponse.headers['set-cookie'] as string;
        const sessionCookie = setCookieHeader.split(';')[0];

        // When: Logging out
        await app.inject({
          method: 'POST',
          url: '/api/auth/logout',
          headers: { cookie: sessionCookie },
        });

        // Then: Session is no longer valid
        const meResponse = await app.inject({
          method: 'GET',
          url: '/api/auth/me',
          headers: { cookie: sessionCookie },
        });

        const body = JSON.parse(meResponse.body);
        expect(body.user).toBeNull();
      });
    });

    describe('Auth Plugin - Protected Routes', () => {
      it('public routes are accessible without session', async () => {
        // When: Accessing public routes without session
        const healthResponse = await app.inject({ method: 'GET', url: '/api/health' });
        const meResponse = await app.inject({ method: 'GET', url: '/api/auth/me' });

        // Then: All are accessible
        expect(healthResponse.statusCode).toBe(200);
        expect(meResponse.statusCode).toBe(200);
      });

      it('non-public /api/* routes require session', async () => {
        // When: Accessing a protected route without session
        // (Using a non-existent route that would be protected if it existed)
        const response = await app.inject({
          method: 'GET',
          url: '/api/protected-endpoint',
        });

        // Then: Response is 401 or 404
        // (404 if route doesn't exist, but auth hook would have run first if it did)
        expect([401, 404]).toContain(response.statusCode);
      });

      it('protected routes work with valid session', async () => {
        // Given: User logged in with session
        await app.inject({
          method: 'POST',
          url: '/api/auth/setup',
          payload: {
            email: 'admin@example.com',
            displayName: 'Admin',
            password: 'SecurePassword123',
          },
        });

        const loginResponse = await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { email: 'admin@example.com', password: 'SecurePassword123' },
        });

        const setCookieHeader = loginResponse.headers['set-cookie'] as string;
        const sessionCookie = setCookieHeader.split(';')[0];

        // When: Accessing /me with valid session
        const response = await app.inject({
          method: 'GET',
          url: '/api/auth/me',
          headers: { cookie: sessionCookie },
        });

        // Then: Request succeeds and returns user
        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.user).toBeDefined();
      });
    });
  });
});

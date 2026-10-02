import type { FastifyInstance } from 'fastify';
import { AppError, AccountLockedError } from '../errors/AppError.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import { COOKIE_NAME } from '../constants.js';

// JSON schema for request validation (Fastify/AJV)
const setupSchema = {
  body: {
    type: 'object',
    required: ['email', 'displayName', 'password'],
    properties: {
      email: { type: 'string', format: 'email' },
      displayName: { type: 'string', minLength: 1, maxLength: 100 },
      password: { type: 'string', minLength: 12 },
    },
    additionalProperties: false,
  },
};

const loginSchema = {
  body: {
    type: 'object',
    required: ['email', 'password'],
    properties: {
      email: { type: 'string' },
      password: { type: 'string' },
    },
    additionalProperties: false,
  },
};

export default async function authRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/auth/me
   *
   * Returns the current authenticated user, or null if not authenticated.
   * Also indicates whether initial setup is required.
   * This endpoint is public (never returns 401).
   */
  fastify.get('/me', async (request, reply) => {
    const userCount = userService.countUsers(fastify.db);

    if (userCount === 0) {
      // Setup required
      return reply.status(200).send({
        user: null,
        setupRequired: true,
        oidcEnabled: fastify.config.oidcEnabled,
      });
    }

    // Check if user is authenticated via session
    if (request.user) {
      return reply.status(200).send({
        user: userService.toUserResponse(request.user),
        setupRequired: false,
        oidcEnabled: fastify.config.oidcEnabled,
      });
    }

    // Users exist but not authenticated
    return reply.status(200).send({
      user: null,
      setupRequired: false,
      oidcEnabled: fastify.config.oidcEnabled,
    });
  });

  /**
   * POST /api/auth/setup
   *
   * Creates the first admin user. Only works when no users exist.
   * After setup is complete, returns 403 SETUP_COMPLETE.
   */
  // Rate limit is intentionally hardcoded and not configurable: once any user
  // exists this route returns 403 unconditionally, so tuning the limit provides
  // no operational value (Issue #1970, AC6).
  fastify.post(
    '/setup',
    { schema: setupSchema, config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      const { email, displayName, password } = request.body as {
        email: string;
        displayName: string;
        password: string;
      };

      // Check if setup is already complete
      const userCount = userService.countUsers(fastify.db);
      if (userCount > 0) {
        throw new AppError('SETUP_COMPLETE', 403, 'Setup already complete');
      }

      try {
        // Create the first admin user
        request.log.info('Hashing password for new admin user');
        const user = await userService.createLocalUser(
          fastify.db,
          email,
          displayName,
          password,
          'admin',
        );
        request.log.info({ userId: user.id }, 'Admin user created');

        // Create session
        const sessionId = sessionService.createSession(
          fastify.db,
          user.id,
          fastify.config.sessionDuration,
        );
        request.log.info('Session created for new admin user');

        // Set session cookie
        reply.setCookie(COOKIE_NAME, sessionId, {
          httpOnly: true,
          secure: fastify.config.secureCookies,
          sameSite: 'lax',
          path: '/',
          maxAge: fastify.config.sessionDuration,
        });

        return reply.status(201).send({
          user: userService.toUserResponse(user),
        });
      } catch (err) {
        request.log.error({ err }, 'Failed during user setup');
        throw err;
      }
    },
  );

  /**
   * POST /api/auth/login
   *
   * Authenticates a local user with email and password.
   * Returns the user object on success and creates a session.
   */
  fastify.post(
    '/login',
    {
      schema: loginSchema,
      config: {
        rateLimit: {
          max: fastify.config.authRateLimitMax,
          timeWindow: fastify.config.authRateLimitWindow,
        },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body as {
        email: string;
        password: string;
      };

      // Find user by email
      const user = userService.findByEmail(fastify.db, email);

      // If no user is found, or the user has no local password (OIDC-provisioned or
      // admin-created SSO-only account), still hash a dummy password (timing attack
      // prevention) and return the same generic error.
      if (!user || !user.passwordHash) {
        // Verify against a dummy hash made with the current scrypt parameters so the
        // response time is the same whether the account exists or not.
        await userService.verifyDummyPassword(password);
        throw new AppError('INVALID_CREDENTIALS', 401, 'Invalid email or password');
      }

      // Check if user is deactivated
      if (user.deactivatedAt) {
        throw new AppError('ACCOUNT_DEACTIVATED', 401, 'Account has been deactivated');
      }

      // Check account lockout
      const lockedUntil = userService.getAccountLockStatus(user);
      if (lockedUntil) {
        throw new AccountLockedError(lockedUntil);
      }

      // Verify password
      let passwordValid: boolean;
      try {
        passwordValid = await userService.verifyPassword(user.passwordHash, password);
      } catch (err) {
        if (err instanceof AppError) throw err;
        request.log.error({ err }, 'Failed during password verification');
        throw err;
      }

      if (!passwordValid) {
        // Record the failure BEFORE the dummy verify: if the hashing queue is full the dummy
        // throws 429, and the attempt must still count toward the lockout.
        userService.recordFailedLogin(fastify.db, user.id);
        // A legacy-parameter hash verifies faster than the dummy used for unknown accounts;
        // pay the difference so a failure costs at least as much as for an unknown account.
        if (userService.passwordNeedsRehash(user.passwordHash)) {
          await userService.verifyDummyPassword(password);
        }
        throw new AppError('INVALID_CREDENTIALS', 401, 'Invalid email or password');
      }

      // Successful login — reset failed attempts
      userService.resetLoginAttempts(fastify.db, user.id);

      // Upgrade legacy hashes to the current scrypt parameters (best-effort)
      if (userService.passwordNeedsRehash(user.passwordHash)) {
        try {
          await userService.rehashPassword(fastify.db, user.id, user.passwordHash, password);
        } catch (err) {
          request.log.warn({ err, userId: user.id }, 'Failed to rehash password after login');
        }
      }

      // Create session
      const sessionId = sessionService.createSession(
        fastify.db,
        user.id,
        fastify.config.sessionDuration,
      );
      request.log.info({ userId: user.id }, 'User logged in');

      // Set session cookie
      reply.setCookie(COOKIE_NAME, sessionId, {
        httpOnly: true,
        secure: fastify.config.secureCookies,
        sameSite: 'lax',
        path: '/',
        maxAge: fastify.config.sessionDuration,
      });

      return reply.status(200).send({
        user: userService.toUserResponse(user),
      });
    },
  );

  /**
   * POST /api/auth/logout
   *
   * Destroys the current session and clears the session cookie.
   * Returns 204 No Content on success.
   */
  fastify.post('/logout', async (request, reply) => {
    const sessionId = request.cookies[COOKIE_NAME];

    if (sessionId) {
      // Destroy the session from the database
      sessionService.destroySession(fastify.db, sessionId);
    }

    // Clear the cookie (even if no session was found)
    reply.setCookie(COOKIE_NAME, '', {
      httpOnly: true,
      secure: fastify.config.secureCookies,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });

    return reply.status(204).send();
  });
}

import type { FastifyInstance } from 'fastify';
import { AppError } from '../errors/AppError.js';
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
  fastify.post('/setup', { schema: setupSchema }, async (request, reply) => {
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

    // Create the first admin user
    const user = await userService.createLocalUser(
      fastify.db,
      email,
      displayName,
      password,
      'admin',
    );

    // Create session
    const sessionId = sessionService.createSession(
      fastify.db,
      user.id,
      fastify.config.sessionDuration,
    );

    // Set session cookie
    reply.setCookie(COOKIE_NAME, sessionId, {
      httpOnly: true,
      secure: fastify.config.secureCookies,
      sameSite: 'strict',
      path: '/',
      maxAge: fastify.config.sessionDuration,
    });

    return reply.status(201).send({
      user: userService.toUserResponse(user),
    });
  });

  /**
   * POST /api/auth/login
   *
   * Authenticates a local user with email and password.
   * Returns the user object on success and creates a session.
   */
  fastify.post('/login', { schema: loginSchema }, async (request, reply) => {
    const { email, password } = request.body as {
      email: string;
      password: string;
    };

    // Find user by email
    const user = userService.findByEmail(fastify.db, email);

    // If no user found OR user is OIDC (no password_hash), still hash a dummy password
    // (timing attack prevention)
    if (!user || !user.passwordHash) {
      // Hardcoded dummy Argon2 hash to prevent timing attacks.
      // We hash the supplied password against this fixed hash to ensure constant-time
      // response whether the user exists or not. Generating at module load would require
      // top-level await, so we use a precomputed hash instead.
      await userService.verifyPassword(
        '$argon2id$v=19$m=65536,t=3,p=4$aGVsbG93b3JsZA$cZn5d+rFz8E4HMhH+3e6Ug',
        password,
      );
      throw new AppError('INVALID_CREDENTIALS', 401, 'Invalid email or password');
    }

    // Check if user is deactivated
    if (user.deactivatedAt) {
      throw new AppError('ACCOUNT_DEACTIVATED', 401, 'Account has been deactivated');
    }

    // Verify password
    const passwordValid = await userService.verifyPassword(user.passwordHash, password);
    if (!passwordValid) {
      throw new AppError('INVALID_CREDENTIALS', 401, 'Invalid email or password');
    }

    // Create session
    const sessionId = sessionService.createSession(
      fastify.db,
      user.id,
      fastify.config.sessionDuration,
    );

    // Set session cookie
    reply.setCookie(COOKIE_NAME, sessionId, {
      httpOnly: true,
      secure: fastify.config.secureCookies,
      sameSite: 'strict',
      path: '/',
      maxAge: fastify.config.sessionDuration,
    });

    return reply.status(200).send({
      user: userService.toUserResponse(user),
    });
  });

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
      sameSite: 'strict',
      path: '/',
      maxAge: 0,
    });

    return reply.status(204).send();
  });
}

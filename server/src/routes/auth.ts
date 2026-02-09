import type { FastifyInstance } from 'fastify';
import { AppError } from '../errors/AppError.js';
import * as userService from '../services/userService.js';

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
   */
  fastify.get('/me', async (request, reply) => {
    const userCount = userService.countUsers(fastify.db);

    if (userCount === 0) {
      // Setup required
      return reply.status(200).send({
        user: null,
        setupRequired: true,
        oidcEnabled: false,
      });
    }

    // Users exist but no session yet (session support added in Story #32)
    return reply.status(200).send({
      user: null,
      setupRequired: false,
      oidcEnabled: false,
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

    // NOTE: Session creation will be added in Story #32
    return reply.status(201).send({
      user: userService.toUserResponse(user),
    });
  });

  /**
   * POST /api/auth/login
   *
   * Authenticates a local user with email and password.
   * Returns the user object on success.
   * NOTE: Session creation will be added in Story #32.
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
      // Hash a dummy password to prevent timing attacks
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

    // NOTE: Session creation will be added in Story #32
    return reply.status(200).send({
      user: userService.toUserResponse(user),
    });
  });
}

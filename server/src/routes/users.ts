import type { FastifyInstance } from 'fastify';
import argon2 from 'argon2';
import { UnauthorizedError, ForbiddenError } from '../errors/AppError.js';
import * as userService from '../services/userService.js';

// JSON schema for PATCH /api/users/me (update display name)
const updateDisplayNameSchema = {
  body: {
    type: 'object',
    required: ['displayName'],
    properties: {
      displayName: { type: 'string', minLength: 1, maxLength: 100 },
    },
    additionalProperties: false,
  },
};

// JSON schema for POST /api/users/me/password (change password)
const changePasswordSchema = {
  body: {
    type: 'object',
    required: ['currentPassword', 'newPassword'],
    properties: {
      currentPassword: { type: 'string' },
      newPassword: { type: 'string', minLength: 12 },
    },
    additionalProperties: false,
  },
};

export default async function userRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/users/me
   *
   * Returns the full profile of the currently authenticated user.
   * Requires authentication.
   */
  fastify.get('/me', async (request, reply) => {
    if (!request.user) {
      throw new UnauthorizedError('Authentication required');
    }

    return reply.status(200).send({
      user: userService.toUserResponse(request.user),
    });
  });

  /**
   * PATCH /api/users/me
   *
   * Updates the current user's display name.
   * Requires authentication.
   */
  fastify.patch('/me', { schema: updateDisplayNameSchema }, async (request, reply) => {
    if (!request.user) {
      throw new UnauthorizedError('Authentication required');
    }

    const { displayName } = request.body as { displayName: string };

    const updatedUser = userService.updateDisplayName(fastify.db, request.user.id, displayName);

    return reply.status(200).send({
      user: userService.toUserResponse(updatedUser),
    });
  });

  /**
   * POST /api/users/me/password
   *
   * Changes the current user's password (local auth users only).
   * OIDC users receive 403 FORBIDDEN.
   * Requires authentication.
   */
  fastify.post('/me/password', { schema: changePasswordSchema }, async (request, reply) => {
    if (!request.user) {
      throw new UnauthorizedError('Authentication required');
    }

    // OIDC users cannot change password
    if (request.user.authProvider === 'oidc') {
      throw new ForbiddenError('OIDC users manage credentials through their identity provider');
    }

    const { currentPassword, newPassword } = request.body as {
      currentPassword: string;
      newPassword: string;
    };

    // Verify current password
    if (!request.user.passwordHash) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const passwordValid = await userService.verifyPassword(
      request.user.passwordHash,
      currentPassword,
    );

    if (!passwordValid) {
      throw new UnauthorizedError('Invalid credentials');
    }

    // Hash new password and update
    const newPasswordHash = await argon2.hash(newPassword);
    userService.updatePassword(fastify.db, request.user.id, newPasswordHash);

    return reply.status(204).send();
  });
}

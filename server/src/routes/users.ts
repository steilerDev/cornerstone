import type { FastifyInstance } from 'fastify';
import { AppError, UnauthorizedError, ForbiddenError, NotFoundError } from '../errors/AppError.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import { requireRole } from '../plugins/auth.js';

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

// JSON schema for GET /api/users (list users with optional search)
const listUsersSchema = {
  querystring: {
    type: 'object',
    properties: {
      q: { type: 'string' },
    },
    additionalProperties: false,
  },
};

// JSON schema for PATCH /api/users/:id (admin update user)
const adminUpdateUserSchema = {
  body: {
    type: 'object',
    properties: {
      displayName: { type: 'string', minLength: 1, maxLength: 100 },
      email: { type: 'string', format: 'email' },
      role: { type: 'string', enum: ['admin', 'member'] },
    },
    additionalProperties: false,
    minProperties: 1,
  },
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string' },
    },
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

    return reply.status(200).send(userService.toUserResponse(request.user));
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

    return reply.status(200).send(userService.toUserResponse(updatedUser));
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
      throw new AppError('INVALID_CREDENTIALS', 401, 'Current password is incorrect');
    }

    const passwordValid = await userService.verifyPassword(
      request.user.passwordHash,
      currentPassword,
    );

    if (!passwordValid) {
      throw new AppError('INVALID_CREDENTIALS', 401, 'Current password is incorrect');
    }

    // Hash new password and update
    const newPasswordHash = await userService.hashPassword(newPassword);
    userService.updatePassword(fastify.db, request.user.id, newPasswordHash);

    return reply.status(204).send();
  });

  /**
   * GET /api/users
   *
   * List all users (all authenticated users).
   * Supports optional ?q=search query parameter for case-insensitive search on email/displayName.
   */
  fastify.get('/', { schema: listUsersSchema }, async (request, reply) => {
    const { q } = request.query as { q?: string };

    const userRows = userService.listUsers(fastify.db, q);
    const users = userRows.map(userService.toUserResponse);

    return reply.status(200).send({ users });
  });

  /**
   * PATCH /api/users/:id
   *
   * Update a user's role, displayName, or email (admin only).
   * Enforces LAST_ADMIN check when changing role from admin to member.
   * Enforces email uniqueness.
   */
  fastify.patch(
    '/:id',
    { schema: adminUpdateUserSchema, preHandler: requireRole('admin') },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const updates = request.body as {
        displayName?: string;
        email?: string;
        role?: 'admin' | 'member';
      };

      // Find user first to check if it exists
      const user = userService.findById(fastify.db, id);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      // LAST_ADMIN check: if changing role from admin to member
      if (updates.role === 'member' && user.role === 'admin') {
        const activeAdminCount = userService.countActiveAdmins(fastify.db);
        if (activeAdminCount <= 1) {
          throw new AppError(
            'LAST_ADMIN',
            409,
            'Cannot change role: at least one admin must remain',
          );
        }
      }

      // Update the user (will throw ConflictError if email is taken)
      const updatedUser = userService.updateUserById(fastify.db, id, updates);

      return reply.status(200).send(userService.toUserResponse(updatedUser));
    },
  );

  /**
   * DELETE /api/users/:id
   *
   * Soft-delete (deactivate) a user account (admin only).
   * Admins cannot deactivate themselves.
   * Cannot deactivate the last remaining admin.
   * Invalidates all user sessions immediately.
   */
  fastify.delete('/:id', { preHandler: requireRole('admin') }, async (request, reply) => {
    if (!request.user) {
      throw new UnauthorizedError('Authentication required');
    }

    const { id } = request.params as { id: string };

    // Find user first to check if it exists
    const user = userService.findById(fastify.db, id);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // SELF_DEACTIVATION check: admin cannot deactivate themselves
    if (request.user.id === id) {
      throw new AppError('SELF_DEACTIVATION', 409, 'You cannot deactivate your own account');
    }

    // LAST_ADMIN check: cannot deactivate the last active admin
    if (user.role === 'admin' && !user.deactivatedAt) {
      const activeAdminCount = userService.countActiveAdmins(fastify.db);
      if (activeAdminCount <= 1) {
        throw new AppError('LAST_ADMIN', 409, 'Cannot deactivate the last remaining admin');
      }
    }

    // Deactivate the user
    userService.deactivateUser(fastify.db, id);

    // Invalidate all sessions for this user
    sessionService.destroyUserSessions(fastify.db, id);

    return reply.status(204).send();
  });
}

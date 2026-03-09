/**
 * User preferences route handlers.
 *
 * EPIC-09 Story #470: User Preferences Infrastructure
 *
 * Manages user preferences (theme, dashboard visibility, etc.).
 * All endpoints require authentication.
 */

import type { FastifyInstance } from 'fastify';
import { NotFoundError, UnauthorizedError } from '../errors/AppError.js';
import * as preferencesService from '../services/preferencesService.js';

// ─── JSON schemas ─────────────────────────────────────────────────────────────

const upsertPreferenceSchema = {
  body: {
    type: 'object',
    required: ['key', 'value'],
    properties: {
      key: { type: 'string', minLength: 1, maxLength: 100 },
      value: { type: 'string' },
    },
    additionalProperties: false,
  },
};

const deletePreferenceSchema = {
  params: {
    type: 'object',
    required: ['key'],
    properties: {
      key: { type: 'string' },
    },
    additionalProperties: false,
  },
};

// ─── Route plugin ─────────────────────────────────────────────────────────────

export default async function preferencesRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/users/me/preferences
   *
   * List all preferences for the current user.
   * Returns an empty array if the user has no preferences.
   *
   * Auth required: Yes
   */
  fastify.get('/', async (request, reply) => {
    if (!request.user) {
      throw new UnauthorizedError();
    }

    const preferences = preferencesService.listPreferences(fastify.db, request.user.id);
    return reply.status(200).send({ preferences });
  });

  /**
   * PATCH /api/users/me/preferences
   *
   * Insert or update a preference for the current user.
   * If the key already exists, updates the value.
   * If the key does not exist, creates a new preference.
   *
   * Auth required: Yes
   */
  fastify.patch<{ Body: { key: string; value: string } }>(
    '/',
    { schema: upsertPreferenceSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const { key, value } = request.body;
      const preference = preferencesService.upsertPreference(
        fastify.db,
        request.user.id,
        key,
        value,
      );

      return reply.status(200).send({ preference });
    },
  );

  /**
   * DELETE /api/users/me/preferences/:key
   *
   * Delete a preference by key for the current user.
   * Returns 204 on success, 404 if the preference does not exist.
   *
   * Auth required: Yes
   */
  fastify.delete<{ Params: { key: string } }>(
    '/:key',
    { schema: deletePreferenceSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const found = preferencesService.deletePreference(fastify.db, request.user.id, request.params.key);
      if (!found) {
        throw new NotFoundError('Preference not found');
      }

      return reply.status(204).send();
    },
  );
}

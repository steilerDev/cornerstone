/**
 * Application settings route handlers.
 *
 * Story #1877: Household metadata settings for Bank Report Wizard.
 *
 * Auth required: Yes (any authenticated user) on all endpoints.
 */

import type { FastifyInstance } from 'fastify';
import { UnauthorizedError } from '../errors/AppError.js';
import * as appSettingsService from '../services/appSettingsService.js';
import type {
  UpdateHouseholdSettingsRequest,
  HouseholdSettingsResponse,
} from '@cornerstone/shared';

// ─── JSON schemas ─────────────────────────────────────────────────────────────

const getSettingsSchema = {};

const updateSettingsSchema = {
  body: {
    type: 'object',
    properties: {
      householdName: { type: ['string', 'null'], maxLength: 200 },
      householdAddress: { type: ['string', 'null'], maxLength: 500 },
    },
    additionalProperties: false,
    minProperties: 1,
  },
};

// ─── Route plugin ─────────────────────────────────────────────────────────────

export default async function settingsRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/settings
   *
   * Retrieve current application settings (household name and address).
   * Returns nulls before any values have been set.
   *
   * Auth required: Yes
   */
  fastify.get<{ Reply: HouseholdSettingsResponse }>(
    '/',
    { schema: getSettingsSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const settings = appSettingsService.getHouseholdSettings(fastify.db);
      return reply.status(200).send({ settings });
    },
  );

  /**
   * PATCH /api/settings
   *
   * Update application settings (household name and/or address).
   * Fields omitted from the request are not modified (partial update).
   * Setting a field to null clears it.
   *
   * Auth required: Yes
   */
  fastify.patch<{ Body: UpdateHouseholdSettingsRequest; Reply: HouseholdSettingsResponse }>(
    '/',
    { schema: updateSettingsSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const settings = appSettingsService.updateHouseholdSettings(fastify.db, request.body);
      return reply.status(200).send({ settings });
    },
  );
}

/**
 * Application settings route handlers.
 *
 * Story #1877: Household metadata settings for Bank Report Wizard.
 *
 * Auth required: Yes. The household endpoints are open to any authenticated user;
 * GET /integrations is admin only.
 */

import type { FastifyInstance } from 'fastify';
import { UnauthorizedError } from '../errors/AppError.js';
import { requireRole } from '../plugins/auth.js';
import * as appSettingsService from '../services/appSettingsService.js';
import * as backupService from '../services/backupService.js';
import { buildIntegrationsStatus } from '../services/integrationsService.js';
import { requestOrigin } from '../services/publicAddress.js';
import { ENTRIES_LANGUAGES, LLM_PROVIDERS } from '@cornerstone/shared';
import type {
  IntegrationsStatusResponse,
  UpdateHouseholdSettingsRequest,
  HouseholdSettingsResponse,
} from '@cornerstone/shared';

// ─── JSON schemas ─────────────────────────────────────────────────────────────

const getSettingsSchema = {};

const nullableString = { type: ['string', 'null'] };

const envSchema = {
  type: 'object',
  required: ['required', 'optional'],
  properties: {
    required: { type: 'array', items: { type: 'string' } },
    optional: { type: 'array', items: { type: 'string' } },
  },
  additionalProperties: false,
};

/** Builds a card schema: every key required, no extra keys (strips anything not listed). */
function card(properties: Record<string, unknown>) {
  return {
    type: 'object',
    required: [...Object.keys(properties), 'env'],
    properties: { ...properties, env: envSchema },
    additionalProperties: false,
  };
}

const integrationsStatusSchema = {
  response: {
    200: {
      type: 'object',
      required: [
        'paperless',
        'ai',
        'singleSignOn',
        'calendarContacts',
        'backups',
        'diaryEvents',
        'money',
        'photos',
        'publicAddress',
      ],
      properties: {
        paperless: card({
          configured: { type: 'boolean' },
          host: nullableString,
          filterTag: nullableString,
        }),
        ai: card({
          configured: { type: 'boolean' },
          provider: { type: ['string', 'null'], enum: [...LLM_PROVIDERS, null] },
          model: nullableString,
          host: nullableString,
        }),
        singleSignOn: card({
          configured: { type: 'boolean' },
          issuerHost: nullableString,
          jitProvisioning: { type: 'boolean' },
          redirectUri: { type: 'string' },
        }),
        calendarContacts: card({ davUrl: { type: 'string' } }),
        backups: card({
          enabled: { type: 'boolean' },
          cadence: nullableString,
          retention: { type: ['integer', 'null'] },
          lastRun: {
            type: ['object', 'null'],
            required: ['timestamp', 'success'],
            properties: { timestamp: { type: 'string' }, success: { type: 'boolean' } },
            additionalProperties: false,
          },
          nextRun: nullableString,
        }),
        diaryEvents: card({ enabled: { type: 'boolean' } }),
        money: card({ currency: { type: 'string' }, vatRate: { type: 'number' } }),
        photos: card({ storagePath: { type: 'string' }, maxFileSizeBytes: { type: 'integer' } }),
        publicAddress: card({
          externalUrl: nullableString,
          trustProxy: { type: 'boolean' },
          secureCookies: { type: 'boolean' },
        }),
      },
      additionalProperties: false,
    },
  },
};

const updateSettingsSchema = {
  body: {
    type: 'object',
    properties: {
      householdName: { type: ['string', 'null'], maxLength: 200 },
      householdAddress: { type: ['string', 'null'], maxLength: 500 },
      entriesLanguage: { type: 'string', enum: [...ENTRIES_LANGUAGES] },
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
   * Retrieve current application settings (household name, address and entries language).
   * Household name and address are null until set; entriesLanguage is never null (stored value,
   * else the earliest user's locale if de|en, else en; resolved on read, never persisted).
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
   * Update application settings (household name, address and/or entries language).
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

  /**
   * GET /api/settings/integrations
   *
   * Read-only configuration status for Settings > Integrations. Config only: no network
   * call and no database query. Built field by field; secrets are never referenced.
   *
   * Auth required: Yes (admin only)
   */
  fastify.get<{ Reply: IntegrationsStatusResponse }>(
    '/integrations',
    { schema: integrationsStatusSchema, preHandler: requireRole('admin') },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      return reply.status(200).send(
        buildIntegrationsStatus({
          config: fastify.config,
          scheduler: backupService.getSchedulerStatus(),
          origin: requestOrigin(request),
        }),
      );
    },
  );
}

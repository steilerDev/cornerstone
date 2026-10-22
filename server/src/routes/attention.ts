/**
 * Attention routes (#2229, EPIC-21 contract 1).
 *
 * GET    /api/attention              rows, tidy-up chores, standing figures, critical line
 * POST   /api/attention/not-now      snooze a row key for the caller (7 days)
 * DELETE /api/attention/not-now/:key remove the caller's snooze (Undo)
 *
 * Auth required: Yes (member or admin). Rows are household-wide; only "Not now" is per user.
 */

import type { FastifyInstance } from 'fastify';
import { ATTENTION_ROW_KEY_PATTERN } from '@cornerstone/shared';
import type { AttentionNotNowRequest, AttentionQuery } from '@cornerstone/shared';
import { UnauthorizedError } from '../errors/AppError.js';
import { getAttention } from '../services/attentionService.js';
import { snooze, unsnooze } from '../services/attentionSnoozeService.js';
import { ensureDailyReschedule, todayUtc } from '../services/schedulingEngine.js';

const rowKeySchema = { type: 'string', pattern: ATTENTION_ROW_KEY_PATTERN, maxLength: 100 };

const getAttentionSchema = {
  querystring: {
    type: 'object',
    properties: { includeSnoozed: { type: 'boolean' } },
  },
};

const notNowSchema = {
  body: {
    type: 'object',
    required: ['key'],
    properties: { key: rowKeySchema },
    additionalProperties: false,
  },
};

const removeNotNowSchema = {
  params: {
    type: 'object',
    required: ['key'],
    properties: { key: rowKeySchema },
  },
};

export default async function attentionRoutes(fastify: FastifyInstance) {
  fastify.get<{ Querystring: AttentionQuery }>(
    '/',
    { schema: getAttentionSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }
      // The daily reschedule gives tasks and purchases that day's dates; N10 is date-based
      ensureDailyReschedule(fastify.db);
      return reply.status(200).send(
        getAttention(fastify.db, {
          userId: request.user.id,
          vatRate: fastify.config.vatRate,
          includeSnoozed: request.query.includeSnoozed === true,
        }),
      );
    },
  );

  fastify.post<{ Body: AttentionNotNowRequest }>(
    '/not-now',
    { schema: notNowSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }
      return reply
        .status(200)
        .send(snooze(fastify.db, request.user.id, request.body.key, todayUtc()));
    },
  );

  fastify.delete<{ Params: { key: string } }>(
    '/not-now/:key',
    { schema: removeNotNowSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }
      unsnooze(fastify.db, request.user.id, request.params.key, todayUtc());
      return reply.status(204).send();
    },
  );
}

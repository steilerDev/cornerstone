/**
 * History route handler (contract 17, ADR-040 §6, #2224).
 *
 * Auth required: Yes (session cookie). `includeHidden` is admin-only.
 */

import type { FastifyInstance } from 'fastify';
import { ForbiddenError, UnauthorizedError, ValidationError } from '../errors/AppError.js';
import { listHistory } from '../services/historyService.js';
import {
  HISTORY_EVENT_TYPES,
  HISTORY_OBJECT_TYPES,
  SEARCH_QUERY_RAW_MAX_LENGTH,
} from '@cornerstone/shared';
import type { HistoryEventType, HistoryQuery } from '@cornerstone/shared';

const listHistorySchema = {
  querystring: {
    type: 'object',
    properties: {
      page: { type: 'integer', minimum: 1 },
      pageSize: { type: 'integer', minimum: 1, maximum: 100 },
      type: { type: 'string', maxLength: 300 },
      entityType: { type: 'string', enum: [...HISTORY_OBJECT_TYPES] },
      entityId: { type: 'string', minLength: 1, maxLength: 64 },
      batchId: { type: 'string', minLength: 1, maxLength: 64 },
      dateFrom: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      dateTo: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      q: { type: 'string', maxLength: SEARCH_QUERY_RAW_MAX_LENGTH },
      includeDiary: { type: 'boolean' },
      showHidden: { type: 'boolean' },
      includeHidden: { type: 'boolean' },
    },
    additionalProperties: false,
  },
};

function parseTypes(raw: string | undefined): HistoryEventType[] {
  const requested = (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
  const known = HISTORY_EVENT_TYPES as readonly string[];
  const unknownTypes = [...new Set(requested.filter((s) => !known.includes(s)))];
  if (unknownTypes.length > 0) {
    throw new ValidationError('Unknown history type', { unknownTypes });
  }
  return [...new Set(requested)] as HistoryEventType[];
}

export default async function historyRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/history
   * System events newest first (optionally with people's saved diary entries).
   */
  fastify.get<{ Querystring: HistoryQuery }>(
    '/',
    { schema: listHistorySchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }
      const query = request.query;
      if (query.includeHidden === true && request.user.role !== 'admin') {
        throw new ForbiddenError('Admin access required');
      }
      if ((query.entityType === undefined) !== (query.entityId === undefined)) {
        throw new ValidationError('entityType and entityId go together');
      }
      const { type, ...rest } = query;
      return reply.status(200).send(listHistory(fastify.db, { ...rest, types: parseTypes(type) }));
    },
  );
}

import type { FastifyInstance } from 'fastify';
import {
  SEARCH_DEFAULT_LIMIT,
  SEARCH_MAX_LIMIT,
  SEARCH_QUERY_MAX_LENGTH,
  SEARCH_QUERY_RAW_MAX_LENGTH,
  SEARCH_QUERY_MIN_LENGTH,
  SEARCH_RESULT_TYPES,
} from '@cornerstone/shared';
import type { SearchQuery, SearchResultType } from '@cornerstone/shared';
import { UnauthorizedError, ValidationError } from '../errors/AppError.js';
import { search } from '../services/searchService.js';
import type { PaperlessSearchDeps } from '../services/searchService.js';
import { parseTradeIds } from '../services/shared/tradeIdsParam.js';

// JSON schema for GET /api/search. Unknown query parameters are stripped by ajv, not rejected.
const searchSchema = {
  querystring: {
    type: 'object',
    required: ['q'],
    properties: {
      // Generous upper bound here; the trimmed length is checked in the handler (2-100).
      q: { type: 'string', maxLength: SEARCH_QUERY_RAW_MAX_LENGTH },
      types: { type: 'string', maxLength: 300 },
      limit: { type: 'integer', minimum: 1, maximum: SEARCH_MAX_LIMIT },
      // Count and id length limits are enforced by parseTradeIds; this only caps the raw string.
      tradeIds: { type: 'string', maxLength: 8000 },
    },
  },
};

function parseTypes(raw: string | undefined): SearchResultType[] {
  const requested = (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
  if (requested.length === 0) return [...SEARCH_RESULT_TYPES];

  const unknown = [
    ...new Set(requested.filter((s) => !(SEARCH_RESULT_TYPES as readonly string[]).includes(s))),
  ];
  if (unknown.length > 0) {
    throw new ValidationError('Unknown search type', { unknownTypes: unknown });
  }
  const set = new Set(requested);
  return SEARCH_RESULT_TYPES.filter((t) => set.has(t));
}

export default async function searchRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/search?q=&types=&limit=
   * Grouped global search across the household's objects (and Paperless-ngx when configured).
   * Auth required: Yes (both admin and member)
   */
  fastify.get<{ Querystring: SearchQuery }>(
    '/',
    { schema: searchSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const q = request.query.q.trim();
      if (q.length < SEARCH_QUERY_MIN_LENGTH || q.length > SEARCH_QUERY_MAX_LENGTH) {
        throw new ValidationError(
          `q must be ${SEARCH_QUERY_MIN_LENGTH}-${SEARCH_QUERY_MAX_LENGTH} characters`,
          { q: `length must be ${SEARCH_QUERY_MIN_LENGTH}-${SEARCH_QUERY_MAX_LENGTH}` },
        );
      }

      const types = parseTypes(request.query.types);
      const limit = request.query.limit ?? SEARCH_DEFAULT_LIMIT;
      const tradeIds = parseTradeIds(request.query.tradeIds);

      const config = fastify.config;
      const paperless: PaperlessSearchDeps | null =
        config.paperlessEnabled && config.paperlessUrl && config.paperlessApiToken
          ? {
              baseUrl: config.paperlessUrl,
              token: config.paperlessApiToken,
              filterTag: config.paperlessFilterTag ?? null,
              log: request.log,
            }
          : null;

      const result = await search(fastify.db, { q, types, limit, tradeIds }, paperless);
      return reply.status(200).send(result);
    },
  );
}

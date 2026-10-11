import type { FastifyInstance } from 'fastify';
import { UnauthorizedError } from '../errors/AppError.js';
import * as tradeService from '../services/tradeService.js';
import type {
  CreateTradeRequest,
  UpdateTradeRequest,
  TradeMergeRequest,
} from '@cornerstone/shared';

// JSON schema for POST /api/trades (create trade)
const createTradeSchema = {
  body: {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 200 },
      description: { type: ['string', 'null'], maxLength: 2000 },
      color: { type: ['string', 'null'], pattern: '^#[0-9A-Fa-f]{6}$' },
      sortOrder: { type: 'integer', minimum: 0 },
    },
    additionalProperties: false,
  },
};

// JSON schema for PATCH /api/trades/:id (update trade)
const updateTradeSchema = {
  body: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 200 },
      description: { type: ['string', 'null'], maxLength: 2000 },
      color: { type: ['string', 'null'], pattern: '^#[0-9A-Fa-f]{6}$' },
      sortOrder: { type: 'integer', minimum: 0 },
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

// JSON schema for path parameter validation (GET by ID / DELETE)
const tradeIdSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string' },
    },
  },
};

// JSON schema for POST /api/trades/:id/merge
const mergeTradeSchema = {
  body: {
    type: 'object',
    required: ['targetTradeId'],
    properties: {
      targetTradeId: { type: 'string', minLength: 1, maxLength: 64 },
    },
    additionalProperties: false,
  },
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string' },
    },
  },
};

// JSON schema for GET /api/trades (list trades with optional search)
const listTradesSchema = {
  querystring: {
    type: 'object',
    properties: {
      search: { type: 'string' },
    },
    additionalProperties: false,
  },
};

export default async function tradeRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/trades
   * List all trades, sorted by sort_order ascending, then name ascending.
   * Auth required: Yes (both admin and member)
   */
  fastify.get('/', { schema: listTradesSchema }, async (request, reply) => {
    if (!request.user) {
      throw new UnauthorizedError();
    }

    const search = (request.query as { search?: string }).search;
    const trades = tradeService.listTrades(fastify.db, search);
    return reply.status(200).send({ trades });
  });

  /**
   * POST /api/trades
   * Create a new trade.
   * Auth required: Yes (both admin and member)
   */
  fastify.post<{ Body: CreateTradeRequest }>(
    '/',
    { schema: createTradeSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const trade = tradeService.createTrade(fastify.db, request.body);
      return reply.status(201).send({ trade });
    },
  );

  /**
   * GET /api/trades/:id
   * Get a single trade by ID.
   * Auth required: Yes (both admin and member)
   */
  fastify.get<{ Params: { id: string } }>(
    '/:id',
    { schema: tradeIdSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const trade = tradeService.getTradeById(fastify.db, request.params.id);
      return reply.status(200).send({ trade });
    },
  );

  /**
   * PATCH /api/trades/:id
   * Update a trade's name, description, color, and/or sort order.
   * Auth required: Yes (both admin and member)
   */
  fastify.patch<{ Params: { id: string }; Body: UpdateTradeRequest }>(
    '/:id',
    { schema: updateTradeSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const trade = tradeService.updateTrade(fastify.db, request.params.id, request.body);
      return reply.status(200).send({ trade });
    },
  );

  /**
   * POST /api/trades/:id/merge
   * Moves the companies of the trade to another trade, then deletes the trade (one transaction).
   * Auth required: Yes (both admin and member)
   */
  fastify.post<{ Params: { id: string }; Body: TradeMergeRequest }>(
    '/:id/merge',
    { schema: mergeTradeSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const result = tradeService.mergeTrade(
        fastify.db,
        request.params.id,
        request.body.targetTradeId,
      );
      return reply.status(200).send(result);
    },
  );

  /**
   * DELETE /api/trades/:id
   * Delete a trade.
   * Fails with 409 TRADE_IN_USE if referenced by vendors.
   * Auth required: Yes (both admin and member)
   */
  fastify.delete<{ Params: { id: string } }>(
    '/:id',
    { schema: tradeIdSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      tradeService.deleteTrade(fastify.db, request.params.id);
      return reply.status(204).send();
    },
  );
}

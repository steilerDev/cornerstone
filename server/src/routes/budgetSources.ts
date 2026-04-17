import type { FastifyInstance } from 'fastify';
import { UnauthorizedError } from '../errors/AppError.js';
import * as budgetSourceService from '../services/budgetSourceService.js';
import type {
  CreateBudgetSourceRequest,
  UpdateBudgetSourceRequest,
  MoveBudgetLinesRequest,
} from '@cornerstone/shared';

// JSON schema for POST /api/budget-sources (create source)
const createBudgetSourceSchema = {
  body: {
    type: 'object',
    required: ['name', 'sourceType', 'totalAmount'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 200 },
      sourceType: {
        type: 'string',
        enum: ['bank_loan', 'credit_line', 'savings', 'other'],
      },
      totalAmount: { type: 'number', exclusiveMinimum: 0 },
      interestRate: { type: ['number', 'null'], minimum: 0, maximum: 100 },
      terms: { type: ['string', 'null'] },
      notes: { type: ['string', 'null'] },
      status: {
        type: 'string',
        enum: ['active', 'exhausted', 'closed'],
      },
    },
    additionalProperties: false,
  },
};

// JSON schema for PATCH /api/budget-sources/:id (update source)
// Note: sourceType enum excludes 'discretionary' to prevent user assignment of system-managed type
const updateBudgetSourceSchema = {
  body: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 200 },
      sourceType: {
        type: 'string',
        enum: ['bank_loan', 'credit_line', 'savings', 'other'],
      },
      // minimum: 0 (not exclusiveMinimum: 0) to allow the discretionary source to be updated
      // with totalAmount: 0. The service layer enforces totalAmount > 0 for non-discretionary
      // sources via ValidationError, so the combined validation is still correct for both cases.
      totalAmount: { type: 'number', minimum: 0 },
      interestRate: { type: ['number', 'null'], minimum: 0, maximum: 100 },
      terms: { type: ['string', 'null'] },
      notes: { type: ['string', 'null'] },
      status: {
        type: 'string',
        enum: ['active', 'exhausted', 'closed'],
      },
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
const sourceIdSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string' },
    },
  },
};

// JSON schema for GET /:sourceId/budget-lines
const budgetLinesParamsSchema = {
  params: {
    type: 'object',
    required: ['sourceId'],
    properties: {
      sourceId: { type: 'string' },
    },
  },
};

// JSON schema for PATCH /:sourceId/budget-lines/move
const moveBudgetLinesSchema = {
  params: {
    type: 'object',
    required: ['sourceId'],
    properties: {
      sourceId: { type: 'string' },
    },
  },
  body: {
    type: 'object',
    required: ['workItemBudgetIds', 'householdItemBudgetIds', 'targetSourceId'],
    properties: {
      workItemBudgetIds: { type: 'array', items: { type: 'string' } },
      householdItemBudgetIds: { type: 'array', items: { type: 'string' } },
      targetSourceId: { type: 'string', minLength: 1 },
    },
    additionalProperties: false,
  },
};

export default async function budgetSourceRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/budget-sources
   * List all budget sources, sorted by name ascending.
   * Auth required: Yes (both admin and member)
   */
  fastify.get('/', async (request, reply) => {
    if (!request.user) {
      throw new UnauthorizedError();
    }

    const budgetSources = budgetSourceService.listBudgetSources(fastify.db);
    return reply.status(200).send({ budgetSources });
  });

  /**
   * POST /api/budget-sources
   * Create a new budget source.
   * Auth required: Yes (both admin and member)
   */
  fastify.post<{ Body: CreateBudgetSourceRequest }>(
    '/',
    { schema: createBudgetSourceSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const budgetSource = budgetSourceService.createBudgetSource(
        fastify.db,
        request.body,
        request.user.id,
      );
      return reply.status(201).send({ budgetSource });
    },
  );

  /**
   * GET /api/budget-sources/:id
   * Get a single budget source by ID.
   * Auth required: Yes (both admin and member)
   */
  fastify.get<{ Params: { id: string } }>(
    '/:id',
    { schema: sourceIdSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const budgetSource = budgetSourceService.getBudgetSourceById(fastify.db, request.params.id);
      return reply.status(200).send({ budgetSource });
    },
  );

  /**
   * PATCH /api/budget-sources/:id
   * Update a budget source's fields.
   * Auth required: Yes (both admin and member)
   */
  fastify.patch<{ Params: { id: string }; Body: UpdateBudgetSourceRequest }>(
    '/:id',
    { schema: updateBudgetSourceSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const budgetSource = budgetSourceService.updateBudgetSource(
        fastify.db,
        request.params.id,
        request.body,
      );
      return reply.status(200).send({ budgetSource });
    },
  );

  /**
   * DELETE /api/budget-sources/:id
   * Delete a budget source.
   * Fails with 409 BUDGET_SOURCE_IN_USE if referenced by work items.
   * Auth required: Yes (both admin and member)
   */
  fastify.delete<{ Params: { id: string } }>(
    '/:id',
    { schema: sourceIdSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      budgetSourceService.deleteBudgetSource(fastify.db, request.params.id);
      return reply.status(204).send();
    },
  );

  /**
   * GET /api/budget-sources/:sourceId/budget-lines
   * Get all budget lines for a budget source, grouped by parent entity type (work item vs household item).
   * Sorted by area name (nulls last), parent item name, and createdAt (all ascending).
   * Auth required: Yes (both admin and member)
   */
  fastify.get<{ Params: { sourceId: string } }>(
    '/:sourceId/budget-lines',
    { schema: budgetLinesParamsSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const result = budgetSourceService.getBudgetSourceBudgetLines(
        fastify.db,
        request.params.sourceId,
      );
      return reply.status(200).send(result);
    },
  );

  /**
   * PATCH /api/budget-sources/:sourceId/budget-lines/move
   * Move budget lines from the current source to a target source.
   * Auth required: Yes (both admin and member)
   */
  fastify.patch<{ Params: { sourceId: string }; Body: MoveBudgetLinesRequest }>(
    '/:sourceId/budget-lines/move',
    { schema: moveBudgetLinesSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const result = budgetSourceService.moveBudgetSourceBudgetLines(
        fastify.db,
        request.params.sourceId,
        request.body,
      );
      return reply.status(200).send(result);
    },
  );
}

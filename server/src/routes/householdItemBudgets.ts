import type { FastifyInstance } from 'fastify';
import { UnauthorizedError } from '../errors/AppError.js';
import * as householdItemBudgetService from '../services/householdItemBudgetService.js';
import type {
  CreateHouseholdItemBudgetRequest,
  UpdateHouseholdItemBudgetRequest,
} from '@cornerstone/shared';

// JSON schema for path params with householdItemId only
const householdItemParamsSchema = {
  params: {
    type: 'object',
    required: ['householdItemId'],
    properties: {
      householdItemId: { type: 'string' },
    },
  },
};

// JSON schema for path params with householdItemId + budgetId
const budgetParamsSchema = {
  params: {
    type: 'object',
    required: ['householdItemId', 'budgetId'],
    properties: {
      householdItemId: { type: 'string' },
      budgetId: { type: 'string' },
    },
  },
};

// JSON schema for POST /api/household-items/:householdItemId/budgets
const createBudgetSchema = {
  body: {
    type: 'object',
    required: ['plannedAmount'],
    properties: {
      description: { type: ['string', 'null'], maxLength: 500 },
      plannedAmount: { type: 'number', minimum: 0 },
      confidence: {
        type: 'string',
        enum: ['own_estimate', 'professional_estimate', 'quote', 'invoice'],
      },
      budgetCategoryId: { type: ['string', 'null'] },
      budgetSourceId: { type: ['string', 'null'] },
      vendorId: { type: ['string', 'null'] },
    },
    additionalProperties: false,
  },
  params: {
    type: 'object',
    required: ['householdItemId'],
    properties: {
      householdItemId: { type: 'string' },
    },
  },
};

// JSON schema for PATCH /api/household-items/:householdItemId/budgets/:budgetId
const updateBudgetSchema = {
  body: {
    type: 'object',
    minProperties: 1,
    properties: {
      description: { type: ['string', 'null'], maxLength: 500 },
      plannedAmount: { type: 'number', minimum: 0 },
      confidence: {
        type: 'string',
        enum: ['own_estimate', 'professional_estimate', 'quote', 'invoice'],
      },
      budgetCategoryId: { type: ['string', 'null'] },
      budgetSourceId: { type: ['string', 'null'] },
      vendorId: { type: ['string', 'null'] },
    },
    additionalProperties: false,
  },
  params: {
    type: 'object',
    required: ['householdItemId', 'budgetId'],
    properties: {
      householdItemId: { type: 'string' },
      budgetId: { type: 'string' },
    },
  },
};

export default async function householdItemBudgetRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/household-items/:householdItemId/budgets
   * List all budget lines for a household item.
   * Auth required: Yes (both admin and member)
   */
  fastify.get<{ Params: { householdItemId: string } }>(
    '/',
    { schema: householdItemParamsSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const budgets = householdItemBudgetService.listHouseholdItemBudgets(
        fastify.db,
        request.params.householdItemId,
      );
      return reply.status(200).send({ budgets });
    },
  );

  /**
   * POST /api/household-items/:householdItemId/budgets
   * Create a new budget line for a household item.
   * Auth required: Yes (both admin and member)
   */
  fastify.post<{ Params: { householdItemId: string }; Body: CreateHouseholdItemBudgetRequest }>(
    '/',
    { schema: createBudgetSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const budget = householdItemBudgetService.createHouseholdItemBudget(
        fastify.db,
        request.params.householdItemId,
        request.user.id,
        request.body,
      );
      return reply.status(201).send({ budget });
    },
  );

  /**
   * PATCH /api/household-items/:householdItemId/budgets/:budgetId
   * Update a budget line.
   * Auth required: Yes (both admin and member)
   */
  fastify.patch<{
    Params: { householdItemId: string; budgetId: string };
    Body: UpdateHouseholdItemBudgetRequest;
  }>('/:budgetId', { schema: updateBudgetSchema }, async (request, reply) => {
    if (!request.user) {
      throw new UnauthorizedError();
    }

    const budget = householdItemBudgetService.updateHouseholdItemBudget(
      fastify.db,
      request.params.householdItemId,
      request.params.budgetId,
      request.body,
    );
    return reply.status(200).send({ budget });
  });

  /**
   * DELETE /api/household-items/:householdItemId/budgets/:budgetId
   * Delete a budget line. Household items never have invoices, so always succeeds.
   * Auth required: Yes (both admin and member)
   */
  fastify.delete<{ Params: { householdItemId: string; budgetId: string } }>(
    '/:budgetId',
    { schema: budgetParamsSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      householdItemBudgetService.deleteHouseholdItemBudget(
        fastify.db,
        request.params.householdItemId,
        request.params.budgetId,
      );
      return reply.status(204).send();
    },
  );
}

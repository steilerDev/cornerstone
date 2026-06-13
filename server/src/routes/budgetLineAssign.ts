import type { FastifyInstance } from 'fastify';
import { UnauthorizedError } from '../errors/AppError.js';
import * as budgetLineAssignService from '../services/budgetLineAssignService.js';
import type { BudgetLineAssignRequest } from '@cornerstone/shared';

// JSON schema for POST /api/budget-lines/:id/assign
const assignBudgetLineSchema = {
  body: {
    type: 'object',
    required: ['targetType', 'targetId'],
    properties: {
      targetType: { type: 'string', enum: ['work_item', 'household_item'] },
      targetId: { type: 'string' },
      budgetCategoryId: { type: ['string', 'null'] },
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

/**
 * Budget line assignment route handler.
 * POST /api/budget-lines/:id/assign
 * Assigns an orphan work_item_budget to a parent item (work_item or household_item).
 */
export default async function budgetLineAssignRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/budget-lines/:id/assign
   * Assign an orphan budget line to a parent item.
   * Auth required: Yes (both admin and member)
   */
  fastify.post<{
    Params: { id: string };
    Body: BudgetLineAssignRequest;
  }>('/:id/assign', { schema: assignBudgetLineSchema }, async (request, reply) => {
    if (!request.user) {
      throw new UnauthorizedError();
    }

    const result = budgetLineAssignService.assignBudgetLine(
      fastify.db,
      request.params.id,
      request.body,
      request.user.id,
    );

    return reply.status(200).send(result);
  });
}

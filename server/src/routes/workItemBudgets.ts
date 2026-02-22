import type { FastifyInstance } from 'fastify';
import { UnauthorizedError } from '../errors/AppError.js';
import * as workItemBudgetService from '../services/workItemBudgetService.js';
import type { CreateWorkItemBudgetRequest, UpdateWorkItemBudgetRequest } from '@cornerstone/shared';

// JSON schema for path params with workItemId only
const workItemParamsSchema = {
  params: {
    type: 'object',
    required: ['workItemId'],
    properties: {
      workItemId: { type: 'string' },
    },
  },
};

// JSON schema for path params with workItemId + budgetId
const budgetParamsSchema = {
  params: {
    type: 'object',
    required: ['workItemId', 'budgetId'],
    properties: {
      workItemId: { type: 'string' },
      budgetId: { type: 'string' },
    },
  },
};

// JSON schema for POST /api/work-items/:workItemId/budgets
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
    required: ['workItemId'],
    properties: {
      workItemId: { type: 'string' },
    },
  },
};

// JSON schema for PATCH /api/work-items/:workItemId/budgets/:budgetId
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
    required: ['workItemId', 'budgetId'],
    properties: {
      workItemId: { type: 'string' },
      budgetId: { type: 'string' },
    },
  },
};

export default async function workItemBudgetRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/work-items/:workItemId/budgets
   * List all budget lines for a work item.
   * Auth required: Yes (both admin and member)
   */
  fastify.get<{ Params: { workItemId: string } }>(
    '/',
    { schema: workItemParamsSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const budgets = workItemBudgetService.listWorkItemBudgets(
        fastify.db,
        request.params.workItemId,
      );
      return reply.status(200).send({ budgets });
    },
  );

  /**
   * POST /api/work-items/:workItemId/budgets
   * Create a new budget line for a work item.
   * Auth required: Yes (both admin and member)
   */
  fastify.post<{ Params: { workItemId: string }; Body: CreateWorkItemBudgetRequest }>(
    '/',
    { schema: createBudgetSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const budget = workItemBudgetService.createWorkItemBudget(
        fastify.db,
        request.params.workItemId,
        request.user.id,
        request.body,
      );
      return reply.status(201).send({ budget });
    },
  );

  /**
   * PATCH /api/work-items/:workItemId/budgets/:budgetId
   * Update a budget line.
   * Auth required: Yes (both admin and member)
   */
  fastify.patch<{
    Params: { workItemId: string; budgetId: string };
    Body: UpdateWorkItemBudgetRequest;
  }>('/:budgetId', { schema: updateBudgetSchema }, async (request, reply) => {
    if (!request.user) {
      throw new UnauthorizedError();
    }

    const budget = workItemBudgetService.updateWorkItemBudget(
      fastify.db,
      request.params.workItemId,
      request.params.budgetId,
      request.body,
    );
    return reply.status(200).send({ budget });
  });

  /**
   * DELETE /api/work-items/:workItemId/budgets/:budgetId
   * Delete a budget line. Fails with 409 if linked invoices exist.
   * Auth required: Yes (both admin and member)
   */
  fastify.delete<{ Params: { workItemId: string; budgetId: string } }>(
    '/:budgetId',
    { schema: budgetParamsSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      workItemBudgetService.deleteWorkItemBudget(
        fastify.db,
        request.params.workItemId,
        request.params.budgetId,
      );
      return reply.status(204).send();
    },
  );
}

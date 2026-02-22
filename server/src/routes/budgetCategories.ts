import type { FastifyInstance } from 'fastify';
import { UnauthorizedError } from '../errors/AppError.js';
import * as budgetCategoryService from '../services/budgetCategoryService.js';
import type { CreateBudgetCategoryRequest, UpdateBudgetCategoryRequest } from '@cornerstone/shared';

// JSON schema for POST /api/budget-categories (create category)
const createBudgetCategorySchema = {
  body: {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 100 },
      description: { type: ['string', 'null'], maxLength: 500 },
      color: { type: ['string', 'null'], pattern: '^#[0-9A-Fa-f]{6}$' },
      sortOrder: { type: 'integer', minimum: 0 },
    },
    additionalProperties: false,
  },
};

// JSON schema for PATCH /api/budget-categories/:id (update category)
const updateBudgetCategorySchema = {
  body: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 100 },
      description: { type: ['string', 'null'], maxLength: 500 },
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
const categoryIdSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string' },
    },
  },
};

export default async function budgetCategoryRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/budget-categories
   * List all budget categories, sorted by sort_order ascending.
   * Auth required: Yes (both admin and member)
   */
  fastify.get('/', async (request, reply) => {
    if (!request.user) {
      throw new UnauthorizedError();
    }

    const categories = budgetCategoryService.listBudgetCategories(fastify.db);
    return reply.status(200).send({ categories });
  });

  /**
   * POST /api/budget-categories
   * Create a new budget category.
   * Auth required: Yes (both admin and member)
   */
  fastify.post<{ Body: CreateBudgetCategoryRequest }>(
    '/',
    { schema: createBudgetCategorySchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const category = budgetCategoryService.createBudgetCategory(fastify.db, request.body);
      return reply.status(201).send(category);
    },
  );

  /**
   * GET /api/budget-categories/:id
   * Get a single budget category by ID.
   * Auth required: Yes (both admin and member)
   */
  fastify.get<{ Params: { id: string } }>(
    '/:id',
    { schema: categoryIdSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const category = budgetCategoryService.getBudgetCategoryById(fastify.db, request.params.id);
      return reply.status(200).send(category);
    },
  );

  /**
   * PATCH /api/budget-categories/:id
   * Update a budget category's name, description, color, and/or sort order.
   * Auth required: Yes (both admin and member)
   */
  fastify.patch<{ Params: { id: string }; Body: UpdateBudgetCategoryRequest }>(
    '/:id',
    { schema: updateBudgetCategorySchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const category = budgetCategoryService.updateBudgetCategory(
        fastify.db,
        request.params.id,
        request.body,
      );
      return reply.status(200).send(category);
    },
  );

  /**
   * DELETE /api/budget-categories/:id
   * Delete a budget category.
   * Fails with 409 CATEGORY_IN_USE if referenced by work items or subsidy programs.
   * Auth required: Yes (both admin and member)
   */
  fastify.delete<{ Params: { id: string } }>(
    '/:id',
    { schema: categoryIdSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      budgetCategoryService.deleteBudgetCategory(fastify.db, request.params.id);
      return reply.status(204).send();
    },
  );
}

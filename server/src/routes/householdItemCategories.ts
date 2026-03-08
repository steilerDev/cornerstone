import type { FastifyInstance } from 'fastify';
import { UnauthorizedError } from '../errors/AppError.js';
import * as householdItemCategoryService from '../services/householdItemCategoryService.js';
import type {
  CreateHouseholdItemCategoryRequest,
  UpdateHouseholdItemCategoryRequest,
} from '@cornerstone/shared';

// JSON schema for POST /api/household-item-categories (create category)
const createHouseholdItemCategorySchema = {
  body: {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 100 },
      color: { type: ['string', 'null'], pattern: '^#[0-9A-Fa-f]{6}$' },
      sortOrder: { type: 'integer', minimum: 0 },
    },
    additionalProperties: false,
  },
};

// JSON schema for PATCH /api/household-item-categories/:id (update category)
const updateHouseholdItemCategorySchema = {
  body: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 100 },
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

export default async function householdItemCategoryRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/household-item-categories
   * List all household item categories, sorted by sort_order ascending.
   * Auth required: Yes (both admin and member)
   */
  fastify.get('/', async (request, reply) => {
    if (!request.user) {
      throw new UnauthorizedError();
    }

    const categories = householdItemCategoryService.listHouseholdItemCategories(fastify.db);
    return reply.status(200).send({ categories });
  });

  /**
   * POST /api/household-item-categories
   * Create a new household item category.
   * Auth required: Yes (both admin and member)
   */
  fastify.post<{ Body: CreateHouseholdItemCategoryRequest }>(
    '/',
    { schema: createHouseholdItemCategorySchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const category = householdItemCategoryService.createHouseholdItemCategory(
        fastify.db,
        request.body,
      );
      return reply.status(201).send(category);
    },
  );

  /**
   * GET /api/household-item-categories/:id
   * Get a single household item category by ID.
   * Auth required: Yes (both admin and member)
   */
  fastify.get<{ Params: { id: string } }>(
    '/:id',
    { schema: categoryIdSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const category = householdItemCategoryService.getHouseholdItemCategoryById(
        fastify.db,
        request.params.id,
      );
      return reply.status(200).send(category);
    },
  );

  /**
   * PATCH /api/household-item-categories/:id
   * Update a household item category's name, color, and/or sort order.
   * Auth required: Yes (both admin and member)
   */
  fastify.patch<{ Params: { id: string }; Body: UpdateHouseholdItemCategoryRequest }>(
    '/:id',
    { schema: updateHouseholdItemCategorySchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const category = householdItemCategoryService.updateHouseholdItemCategory(
        fastify.db,
        request.params.id,
        request.body,
      );
      return reply.status(200).send(category);
    },
  );

  /**
   * DELETE /api/household-item-categories/:id
   * Delete a household item category.
   * Fails with 409 CATEGORY_IN_USE if referenced by household items.
   * Auth required: Yes (both admin and member)
   */
  fastify.delete<{ Params: { id: string } }>(
    '/:id',
    { schema: categoryIdSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      householdItemCategoryService.deleteHouseholdItemCategory(fastify.db, request.params.id);
      return reply.status(204).send();
    },
  );
}

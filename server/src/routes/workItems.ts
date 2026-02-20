import type { FastifyInstance } from 'fastify';
import { UnauthorizedError } from '../errors/AppError.js';
import * as workItemService from '../services/workItemService.js';
import type {
  CreateWorkItemRequest,
  UpdateWorkItemRequest,
  WorkItemListQuery,
} from '@cornerstone/shared';

// JSON schema for POST /api/work-items (create work item)
const createWorkItemSchema = {
  body: {
    type: 'object',
    required: ['title'],
    properties: {
      title: { type: 'string', minLength: 1, maxLength: 500 },
      description: { type: ['string', 'null'], maxLength: 10000 },
      status: {
        type: 'string',
        enum: ['not_started', 'in_progress', 'completed', 'blocked'],
      },
      startDate: { type: ['string', 'null'], format: 'date' },
      endDate: { type: ['string', 'null'], format: 'date' },
      durationDays: { type: ['integer', 'null'], minimum: 0 },
      startAfter: { type: ['string', 'null'], format: 'date' },
      startBefore: { type: ['string', 'null'], format: 'date' },
      assignedUserId: { type: ['string', 'null'] },
      tagIds: {
        type: 'array',
        items: { type: 'string' },
        uniqueItems: true,
      },
      // EPIC-05: budget fields
      plannedBudget: { type: ['number', 'null'], minimum: 0 },
      actualCost: { type: ['number', 'null'], minimum: 0 },
      confidencePercent: { type: ['integer', 'null'], minimum: 0, maximum: 100 },
      budgetCategoryId: { type: ['string', 'null'] },
      budgetSourceId: { type: ['string', 'null'] },
    },
    additionalProperties: false,
  },
};

// JSON schema for GET /api/work-items (list work items with filters)
const listWorkItemsSchema = {
  querystring: {
    type: 'object',
    properties: {
      page: { type: 'integer', minimum: 1 },
      pageSize: { type: 'integer', minimum: 1, maximum: 100 },
      status: {
        type: 'string',
        enum: ['not_started', 'in_progress', 'completed', 'blocked'],
      },
      assignedUserId: { type: 'string' },
      tagId: { type: 'string' },
      q: { type: 'string' },
      sortBy: {
        type: 'string',
        enum: ['title', 'status', 'start_date', 'end_date', 'created_at', 'updated_at'],
      },
      sortOrder: { type: 'string', enum: ['asc', 'desc'] },
    },
    additionalProperties: false,
  },
};

// JSON schema for PATCH /api/work-items/:id (update work item)
const updateWorkItemSchema = {
  body: {
    type: 'object',
    properties: {
      title: { type: 'string', minLength: 1, maxLength: 500 },
      description: { type: ['string', 'null'], maxLength: 10000 },
      status: {
        type: 'string',
        enum: ['not_started', 'in_progress', 'completed', 'blocked'],
      },
      startDate: { type: ['string', 'null'], format: 'date' },
      endDate: { type: ['string', 'null'], format: 'date' },
      durationDays: { type: ['integer', 'null'], minimum: 0 },
      startAfter: { type: ['string', 'null'], format: 'date' },
      startBefore: { type: ['string', 'null'], format: 'date' },
      assignedUserId: { type: ['string', 'null'] },
      tagIds: {
        type: 'array',
        items: { type: 'string' },
        uniqueItems: true,
      },
      // EPIC-05: budget fields
      plannedBudget: { type: ['number', 'null'], minimum: 0 },
      actualCost: { type: ['number', 'null'], minimum: 0 },
      confidencePercent: { type: ['integer', 'null'], minimum: 0, maximum: 100 },
      budgetCategoryId: { type: ['string', 'null'] },
      budgetSourceId: { type: ['string', 'null'] },
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

// JSON schema for path parameter validation (GET/DELETE)
const workItemIdSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string' },
    },
  },
};

export default async function workItemRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/work-items
   *
   * Creates a new work item.
   * Requires authentication.
   */
  fastify.post('/', { schema: createWorkItemSchema }, async (request, reply) => {
    if (!request.user) {
      throw new UnauthorizedError('Authentication required');
    }

    const data = request.body as CreateWorkItemRequest;

    const workItem = workItemService.createWorkItem(fastify.db, request.user.id, data);

    return reply.status(201).send(workItem);
  });

  /**
   * GET /api/work-items
   *
   * Returns a paginated, filterable, sortable list of work items.
   * Requires authentication.
   */
  fastify.get('/', { schema: listWorkItemsSchema }, async (request, reply) => {
    if (!request.user) {
      throw new UnauthorizedError('Authentication required');
    }

    const query = request.query as WorkItemListQuery;

    const result = workItemService.listWorkItems(fastify.db, query);

    return reply.status(200).send(result);
  });

  /**
   * GET /api/work-items/:id
   *
   * Returns a single work item with full detail.
   * Requires authentication.
   */
  fastify.get('/:id', { schema: workItemIdSchema }, async (request, reply) => {
    if (!request.user) {
      throw new UnauthorizedError('Authentication required');
    }

    const { id } = request.params as { id: string };

    const workItem = workItemService.getWorkItemDetail(fastify.db, id);

    return reply.status(200).send(workItem);
  });

  /**
   * PATCH /api/work-items/:id
   *
   * Updates a work item.
   * Requires authentication.
   */
  fastify.patch('/:id', { schema: updateWorkItemSchema }, async (request, reply) => {
    if (!request.user) {
      throw new UnauthorizedError('Authentication required');
    }

    const { id } = request.params as { id: string };
    const data = request.body as UpdateWorkItemRequest;

    const workItem = workItemService.updateWorkItem(fastify.db, id, data);

    return reply.status(200).send(workItem);
  });

  /**
   * DELETE /api/work-items/:id
   *
   * Deletes a work item.
   * Requires authentication.
   */
  fastify.delete('/:id', { schema: workItemIdSchema }, async (request, reply) => {
    if (!request.user) {
      throw new UnauthorizedError('Authentication required');
    }

    const { id } = request.params as { id: string };

    workItemService.deleteWorkItem(fastify.db, id);

    return reply.status(204).send();
  });
}

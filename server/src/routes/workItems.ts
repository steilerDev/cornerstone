import type { FastifyInstance } from 'fastify';
import { UnauthorizedError } from '../errors/AppError.js';
import * as workItemService from '../services/workItemService.js';
import * as householdItemWorkItemService from '../services/householdItemWorkItemService.js';
import { autoReschedule, ensureDailyReschedule } from '../services/schedulingEngine.js';
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
        enum: ['not_started', 'in_progress', 'completed'],
      },
      startDate: { type: ['string', 'null'], format: 'date' },
      endDate: { type: ['string', 'null'], format: 'date' },
      actualStartDate: { type: ['string', 'null'], format: 'date' },
      actualEndDate: { type: ['string', 'null'], format: 'date' },
      durationDays: { type: ['integer', 'null'], minimum: 0 },
      startAfter: { type: ['string', 'null'], format: 'date' },
      startBefore: { type: ['string', 'null'], format: 'date' },
      assignedUserId: { type: ['string', 'null'] },
      areaId: { type: ['string', 'null'] },
      assignedVendorId: { type: ['string', 'null'] },
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
        enum: ['not_started', 'in_progress', 'completed'],
      },
      assignedUserId: { type: 'string' },
      areaId: { type: 'string' },
      assignedVendorId: { type: 'string' },
      q: { type: 'string' },
      budgetLinesMin: { type: 'number' },
      budgetLinesMax: { type: 'number' },
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
        enum: ['not_started', 'in_progress', 'completed'],
      },
      startDate: { type: ['string', 'null'], format: 'date' },
      endDate: { type: ['string', 'null'], format: 'date' },
      actualStartDate: { type: ['string', 'null'], format: 'date' },
      actualEndDate: { type: ['string', 'null'], format: 'date' },
      durationDays: { type: ['integer', 'null'], minimum: 0 },
      startAfter: { type: ['string', 'null'], format: 'date' },
      startBefore: { type: ['string', 'null'], format: 'date' },
      assignedUserId: { type: ['string', 'null'] },
      areaId: { type: ['string', 'null'] },
      assignedVendorId: { type: ['string', 'null'] },
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

// JSON schema for GET /api/work-items/:id/dependent-household-items
const getWorkItemDependentHouseholdItemsSchema = {
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

    // Schedule the newly created work item via CPM algorithm
    autoReschedule(fastify.db);

    // Re-fetch the work item to include any updated dates from scheduling
    const scheduled = workItemService.getWorkItemDetail(fastify.db, workItem.id);

    return reply.status(201).send(scheduled);
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

    ensureDailyReschedule(fastify.db);
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

    const workItem = workItemService.updateWorkItem(
      fastify.db,
      id,
      data,
      fastify.config.diaryAutoEvents,
    );

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

  /**
   * GET /api/work-items/:id/dependent-household-items
   *
   * Returns household items that depend on this work item.
   * Requires authentication.
   */
  fastify.get(
    '/:id/dependent-household-items',
    { schema: getWorkItemDependentHouseholdItemsSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const { id } = request.params as { id: string };

      const householdItems = householdItemWorkItemService.listDependentHouseholdItemsForWorkItem(
        fastify.db,
        id,
      );

      return reply.status(200).send({ householdItems });
    },
  );
}

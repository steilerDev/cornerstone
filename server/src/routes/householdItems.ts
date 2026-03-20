import type { FastifyInstance } from 'fastify';
import { UnauthorizedError } from '../errors/AppError.js';
import * as householdItemService from '../services/householdItemService.js';
import * as householdItemDepService from '../services/householdItemDepService.js';
import type {
  CreateHouseholdItemRequest,
  UpdateHouseholdItemRequest,
  HouseholdItemListQuery,
  CreateHouseholdItemDepRequest,
} from '@cornerstone/shared';

// JSON schema for POST /api/household-items (create household item)
const createHouseholdItemSchema = {
  body: {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 500 },
      description: { type: ['string', 'null'], maxLength: 5000 },
      category: { type: 'string', minLength: 1 },
      status: {
        type: 'string',
        enum: ['planned', 'purchased', 'scheduled', 'arrived'],
      },
      vendorId: { type: ['string', 'null'] },
      url: { type: ['string', 'null'], maxLength: 2000 },
      areaId: { type: ['string', 'null'] },
      quantity: { type: 'integer', minimum: 1 },
      orderDate: { type: ['string', 'null'], format: 'date' },
      earliestDeliveryDate: { type: ['string', 'null'], format: 'date' },
      latestDeliveryDate: { type: ['string', 'null'], format: 'date' },
      actualDeliveryDate: { type: ['string', 'null'], format: 'date' },
    },
    additionalProperties: false,
  },
};

// JSON schema for GET /api/household-items (list household items with filters)
const listHouseholdItemsSchema = {
  querystring: {
    type: 'object',
    properties: {
      page: { type: 'integer', minimum: 1 },
      pageSize: { type: 'integer', minimum: 1, maximum: 100 },
      category: { type: 'string' },
      status: {
        type: 'string',
        enum: ['planned', 'purchased', 'scheduled', 'arrived'],
      },
      vendorId: { type: 'string' },
      areaId: { type: 'string' },
      q: { type: 'string' },
      sortBy: {
        type: 'string',
        enum: [
          'name',
          'category',
          'status',
          'order_date',
          'target_delivery_date',
          'created_at',
          'updated_at',
        ],
      },
      sortOrder: { type: 'string', enum: ['asc', 'desc'] },
      noBudget: { type: 'boolean' },
    },
    additionalProperties: false,
  },
};

// JSON schema for PATCH /api/household-items/:id (update household item)
const updateHouseholdItemSchema = {
  body: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 500 },
      description: { type: ['string', 'null'], maxLength: 5000 },
      category: { type: 'string', minLength: 1 },
      status: {
        type: 'string',
        enum: ['planned', 'purchased', 'scheduled', 'arrived'],
      },
      vendorId: { type: ['string', 'null'] },
      url: { type: ['string', 'null'], maxLength: 2000 },
      areaId: { type: ['string', 'null'] },
      quantity: { type: 'integer', minimum: 1 },
      orderDate: { type: ['string', 'null'], format: 'date' },
      earliestDeliveryDate: { type: ['string', 'null'], format: 'date' },
      latestDeliveryDate: { type: ['string', 'null'], format: 'date' },
      actualDeliveryDate: { type: ['string', 'null'], format: 'date' },
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
const householdItemIdSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string' },
    },
  },
};

// JSON schema for POST /api/household-items/:id/dependencies (create dependency)
const createHouseholdItemDepSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string' },
    },
  },
  body: {
    type: 'object',
    required: ['predecessorType', 'predecessorId'],
    properties: {
      predecessorType: { type: 'string', enum: ['work_item', 'milestone'] },
      predecessorId: { type: 'string', minLength: 1 },
    },
    additionalProperties: true,
  },
};

// JSON schema for GET /api/household-items/:id/dependencies
const getHouseholdItemDepsSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string' },
    },
  },
};

// JSON schema for DELETE /api/household-items/:id/dependencies/:predecessorType/:predecessorId
const deleteHouseholdItemDepSchema = {
  params: {
    type: 'object',
    required: ['id', 'predecessorType', 'predecessorId'],
    properties: {
      id: { type: 'string' },
      predecessorType: { type: 'string', enum: ['work_item', 'milestone'] },
      predecessorId: { type: 'string' },
    },
  },
};

export default async function householdItemRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/household-items
   *
   * Creates a new household item.
   * Requires authentication.
   */
  fastify.post('/', { schema: createHouseholdItemSchema }, async (request, reply) => {
    if (!request.user) {
      throw new UnauthorizedError('Authentication required');
    }

    const data = request.body as CreateHouseholdItemRequest;

    const result = householdItemService.createHouseholdItem(fastify.db, request.user.id, data);

    return reply.status(201).send({ householdItem: result });
  });

  /**
   * GET /api/household-items
   *
   * Returns a paginated, filterable, sortable list of household items.
   * Requires authentication.
   */
  fastify.get('/', { schema: listHouseholdItemsSchema }, async (request, reply) => {
    if (!request.user) {
      throw new UnauthorizedError('Authentication required');
    }

    const query = request.query as HouseholdItemListQuery;

    const result = householdItemService.listHouseholdItems(fastify.db, query);

    return reply.status(200).send(result);
  });

  /**
   * GET /api/household-items/:id
   *
   * Returns a single household item with full detail.
   * Requires authentication.
   */
  fastify.get('/:id', { schema: householdItemIdSchema }, async (request, reply) => {
    if (!request.user) {
      throw new UnauthorizedError('Authentication required');
    }

    const { id } = request.params as { id: string };

    const householdItem = householdItemService.getHouseholdItemById(fastify.db, id);

    return reply.status(200).send({ householdItem });
  });

  /**
   * PATCH /api/household-items/:id
   *
   * Updates a household item.
   * Requires authentication.
   */
  fastify.patch('/:id', { schema: updateHouseholdItemSchema }, async (request, reply) => {
    if (!request.user) {
      throw new UnauthorizedError('Authentication required');
    }

    const { id } = request.params as { id: string };
    const data = request.body as UpdateHouseholdItemRequest;

    const householdItem = householdItemService.updateHouseholdItem(fastify.db, id, data);

    return reply.status(200).send({ householdItem });
  });

  /**
   * DELETE /api/household-items/:id
   *
   * Deletes a household item.
   * Requires authentication.
   */
  fastify.delete('/:id', { schema: householdItemIdSchema }, async (request, reply) => {
    if (!request.user) {
      throw new UnauthorizedError('Authentication required');
    }

    const { id } = request.params as { id: string };

    householdItemService.deleteHouseholdItem(fastify.db, id);

    return reply.status(204).send();
  });

  /**
   * GET /api/household-items/:id/dependencies
   *
   * Lists all dependencies for a household item.
   * Requires authentication.
   */
  fastify.get(
    '/:id/dependencies',
    { schema: getHouseholdItemDepsSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const { id } = request.params as { id: string };

      const dependencies = householdItemDepService.listDeps(fastify.db, id);

      return reply.status(200).send({ dependencies });
    },
  );

  /**
   * POST /api/household-items/:id/dependencies
   *
   * Creates a new dependency for a household item.
   * Requires authentication.
   */
  fastify.post(
    '/:id/dependencies',
    { schema: createHouseholdItemDepSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const { id } = request.params as { id: string };
      const data = request.body as CreateHouseholdItemDepRequest;

      const dependency = householdItemDepService.createDep(fastify.db, id, data);

      return reply.status(201).send({ dependency });
    },
  );

  /**
   * DELETE /api/household-items/:id/dependencies/:predecessorType/:predecessorId
   *
   * Deletes a dependency for a household item.
   * Requires authentication.
   */
  fastify.delete(
    '/:id/dependencies/:predecessorType/:predecessorId',
    { schema: deleteHouseholdItemDepSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const { id, predecessorType, predecessorId } = request.params as {
        id: string;
        predecessorType: string;
        predecessorId: string;
      };

      householdItemDepService.deleteDep(fastify.db, id, predecessorType, predecessorId);

      return reply.status(204).send();
    },
  );
}

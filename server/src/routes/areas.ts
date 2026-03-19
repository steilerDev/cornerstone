import type { FastifyInstance } from 'fastify';
import { UnauthorizedError } from '../errors/AppError.js';
import * as areaService from '../services/areaService.js';
import type { CreateAreaRequest, UpdateAreaRequest } from '@cornerstone/shared';

// JSON schema for POST /api/areas (create area)
const createAreaSchema = {
  body: {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 200 },
      parentId: { type: ['string', 'null'] },
      description: { type: ['string', 'null'], maxLength: 2000 },
      color: { type: ['string', 'null'], pattern: '^#[0-9A-Fa-f]{6}$' },
      sortOrder: { type: 'integer', minimum: 0 },
    },
    additionalProperties: false,
  },
};

// JSON schema for PATCH /api/areas/:id (update area)
const updateAreaSchema = {
  body: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 200 },
      parentId: { type: ['string', 'null'] },
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
const areaIdSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string' },
    },
  },
};

// JSON schema for GET /api/areas (list areas with optional search)
const listAreasSchema = {
  querystring: {
    type: 'object',
    properties: {
      search: { type: 'string' },
    },
    additionalProperties: false,
  },
};

export default async function areaRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/areas
   * List all areas, sorted by sort_order ascending, then name ascending.
   * Auth required: Yes (both admin and member)
   */
  fastify.get(
    '/',
    { schema: listAreasSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const search = (request.query as { search?: string }).search;
      const areas = areaService.listAreas(fastify.db, search);
      return reply.status(200).send({ areas });
    },
  );

  /**
   * POST /api/areas
   * Create a new area.
   * Auth required: Yes (both admin and member)
   */
  fastify.post<{ Body: CreateAreaRequest }>(
    '/',
    { schema: createAreaSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const area = areaService.createArea(fastify.db, request.body);
      return reply.status(201).send({ area });
    },
  );

  /**
   * GET /api/areas/:id
   * Get a single area by ID.
   * Auth required: Yes (both admin and member)
   */
  fastify.get<{ Params: { id: string } }>(
    '/:id',
    { schema: areaIdSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const area = areaService.getAreaById(fastify.db, request.params.id);
      return reply.status(200).send({ area });
    },
  );

  /**
   * PATCH /api/areas/:id
   * Update an area's name, parentId, description, color, and/or sort order.
   * Auth required: Yes (both admin and member)
   */
  fastify.patch<{ Params: { id: string }; Body: UpdateAreaRequest }>(
    '/:id',
    { schema: updateAreaSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const area = areaService.updateArea(
        fastify.db,
        request.params.id,
        request.body,
      );
      return reply.status(200).send({ area });
    },
  );

  /**
   * DELETE /api/areas/:id
   * Delete an area and all its descendants.
   * Fails with 409 AREA_IN_USE if referenced by work items or household items.
   * Auth required: Yes (both admin and member)
   */
  fastify.delete<{ Params: { id: string } }>(
    '/:id',
    { schema: areaIdSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      areaService.deleteArea(fastify.db, request.params.id);
      return reply.status(204).send();
    },
  );
}

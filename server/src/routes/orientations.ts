import type { FastifyInstance } from 'fastify';
import { UnauthorizedError } from '../errors/AppError.js';
import * as orientationService from '../services/orientationService.js';
import type { CreateOrientationRequest, UpdateOrientationRequest } from '@cornerstone/shared';

// JSON schema for POST /api/orientations (create orientation)
const createOrientationSchema = {
  body: {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 200 },
      description: { type: ['string', 'null'], maxLength: 2000 },
      sortOrder: { type: 'integer', minimum: 0 },
    },
    additionalProperties: false,
  },
};

// JSON schema for PATCH /api/orientations/:id (update orientation)
const updateOrientationSchema = {
  body: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 200 },
      description: { type: ['string', 'null'], maxLength: 2000 },
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
const orientationIdSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string' },
    },
  },
};

// JSON schema for GET /api/orientations (list orientations with optional search)
const listOrientationsSchema = {
  querystring: {
    type: 'object',
    properties: {
      search: { type: 'string' },
    },
    additionalProperties: false,
  },
};

export default async function orientationRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/orientations
   * List all orientations, sorted by sort_order ascending, then name ascending.
   * Auth required: Yes (both admin and member)
   */
  fastify.get('/', { schema: listOrientationsSchema }, async (request, reply) => {
    if (!request.user) {
      throw new UnauthorizedError();
    }

    const search = (request.query as { search?: string }).search;
    const orientations = orientationService.listOrientations(fastify.db, search);
    return reply.status(200).send({ orientations });
  });

  /**
   * POST /api/orientations
   * Create a new orientation.
   * Auth required: Yes (both admin and member)
   */
  fastify.post<{ Body: CreateOrientationRequest }>(
    '/',
    { schema: createOrientationSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const orientation = orientationService.createOrientation(fastify.db, request.body);
      return reply.status(201).send({ orientation });
    },
  );

  /**
   * GET /api/orientations/:id
   * Get a single orientation by ID.
   * Auth required: Yes (both admin and member)
   */
  fastify.get<{ Params: { id: string } }>(
    '/:id',
    { schema: orientationIdSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const orientation = orientationService.getOrientationById(fastify.db, request.params.id);
      return reply.status(200).send({ orientation });
    },
  );

  /**
   * PATCH /api/orientations/:id
   * Update an orientation's name, description, and/or sort order.
   * Auth required: Yes (both admin and member)
   */
  fastify.patch<{ Params: { id: string }; Body: UpdateOrientationRequest }>(
    '/:id',
    { schema: updateOrientationSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const orientation = orientationService.updateOrientation(
        fastify.db,
        request.params.id,
        request.body,
      );
      return reply.status(200).send({ orientation });
    },
  );

  /**
   * DELETE /api/orientations/:id
   * Delete an orientation.
   * Photos that reference this orientation will have their orientation_id set to NULL.
   * Auth required: Yes (both admin and member)
   */
  fastify.delete<{ Params: { id: string } }>(
    '/:id',
    { schema: orientationIdSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      orientationService.deleteOrientation(fastify.db, request.params.id);
      return reply.status(204).send();
    },
  );
}

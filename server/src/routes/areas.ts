import type { FastifyInstance } from 'fastify';
import { UnauthorizedError } from '../errors/AppError.js';
import * as areaService from '../services/areaService.js';
import * as areaCountsService from '../services/areaCountsService.js';
import { buildReorderSchema } from '../services/referenceListOrder.js';
import { issueRestoreToken, undoStore } from '../services/undoService.js';
import type {
  CreateAreaRequest,
  UpdateAreaRequest,
  ReorderAreasRequest,
} from '@cornerstone/shared';

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

// JSON schema for PATCH /api/areas/reorder: the shared reorder body plus the parent whose
// children are reordered (null = top level)
const reorderBase = buildReorderSchema();
const reorderAreasSchema = {
  body: {
    ...reorderBase.body,
    required: ['parentId', ...reorderBase.body.required],
    properties: {
      parentId: { type: ['string', 'null'], maxLength: 64 },
      ...reorderBase.body.properties,
    },
  },
};

// JSON schema for GET /api/areas (list areas with optional search)
const listAreasSchema = {
  querystring: {
    type: 'object',
    properties: {
      search: { type: 'string' },
      include: { type: 'string', enum: ['counts'] },
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
  fastify.get('/', { schema: listAreasSchema }, async (request, reply) => {
    if (!request.user) {
      throw new UnauthorizedError();
    }

    const { search, include } = request.query as { search?: string; include?: 'counts' };
    const areas =
      include === 'counts'
        ? areaCountsService.listAreasWithCounts(fastify.db, search)
        : areaService.listAreas(fastify.db, search);
    return reply.status(200).send({ areas });
  });

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
   * PATCH /api/areas/reorder
   * Reorder the children of `parentId` (null = top level). Registered before `/:id`.
   * 409 REORDER_SET_MISMATCH when `ids` are not exactly the current children.
   * Auth required: Yes (both admin and member)
   */
  fastify.patch<{ Body: ReorderAreasRequest }>(
    '/reorder',
    { schema: reorderAreasSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const areas = areaService.reorderAreas(fastify.db, request.body.parentId, request.body.ids);
      return reply.status(200).send({ areas });
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

      const area = areaService.updateArea(fastify.db, request.params.id, request.body);
      return reply.status(200).send({ area });
    },
  );

  /**
   * DELETE /api/areas/:id
   * Delete an area and all its descendants.
   * Fails with 409 AREA_IN_USE if referenced by work items or household items.
   * Responds 200 { undo }: the token restores the deleted subtree (contract 11).
   * Auth required: Yes (both admin and member)
   */
  fastify.delete<{ Params: { id: string } }>(
    '/:id',
    { schema: areaIdSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const { id } = request.params;
      const snapshot = areaService.deleteArea(fastify.db, id);
      const undo = issueRestoreToken(undoStore, {
        userId: request.user.id,
        subject: { type: 'area', id },
        restore: (tx) => areaService.restoreDeletedAreas(tx, snapshot),
      });
      return reply.status(200).send({ undo });
    },
  );
}

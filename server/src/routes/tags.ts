import type { FastifyInstance } from 'fastify';
import { UnauthorizedError } from '../errors/AppError.js';
import * as tagService from '../services/tagService.js';
import type { CreateTagRequest, UpdateTagRequest } from '@cornerstone/shared';

// JSON schema for POST /api/tags (create tag)
const createTagSchema = {
  body: {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 50 },
      color: { type: ['string', 'null'], pattern: '^#[0-9A-Fa-f]{6}$' },
    },
    additionalProperties: false,
  },
};

// JSON schema for PATCH /api/tags/:id (update tag)
const updateTagSchema = {
  body: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 50 },
      color: { type: ['string', 'null'], pattern: '^#[0-9A-Fa-f]{6}$' },
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
const tagIdSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string' },
    },
  },
};

export default async function tagRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/tags
   * List all tags, sorted alphabetically by name.
   * Auth required: Yes (both admin and member)
   */
  fastify.get('/', async (request, reply) => {
    if (!request.user) {
      throw new UnauthorizedError();
    }

    const tags = tagService.listTags(fastify.db);
    return reply.status(200).send({ tags });
  });

  /**
   * POST /api/tags
   * Create a new tag.
   * Auth required: Yes (both admin and member)
   */
  fastify.post<{ Body: CreateTagRequest }>(
    '/',
    { schema: createTagSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const tag = tagService.createTag(fastify.db, request.body);
      return reply.status(201).send(tag);
    },
  );

  /**
   * PATCH /api/tags/:id
   * Update a tag's name and/or color.
   * Auth required: Yes (both admin and member)
   */
  fastify.patch<{ Params: { id: string }; Body: UpdateTagRequest }>(
    '/:id',
    { schema: updateTagSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const tag = tagService.updateTag(fastify.db, request.params.id, request.body);
      return reply.status(200).send(tag);
    },
  );

  /**
   * DELETE /api/tags/:id
   * Delete a tag (cascade removes from all work items).
   * Auth required: Yes (both admin and member)
   */
  fastify.delete<{ Params: { id: string } }>(
    '/:id',
    { schema: tagIdSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      tagService.deleteTag(fastify.db, request.params.id);
      return reply.status(204).send();
    },
  );
}

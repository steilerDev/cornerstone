import type { FastifyInstance } from 'fastify';
import { UnauthorizedError } from '../errors/AppError.js';
import * as subtaskService from '../services/subtaskService.js';
import type {
  CreateSubtaskRequest,
  UpdateSubtaskRequest,
  ReorderSubtasksRequest,
} from '@cornerstone/shared';

// JSON schema for POST /api/work-items/:workItemId/subtasks (create subtask)
const createSubtaskSchema = {
  body: {
    type: 'object',
    required: ['title'],
    properties: {
      title: { type: 'string', minLength: 1, maxLength: 500 },
      sortOrder: { type: 'integer', minimum: 0 },
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

// JSON schema for PATCH /api/work-items/:workItemId/subtasks/:subtaskId (update subtask)
const updateSubtaskSchema = {
  body: {
    type: 'object',
    properties: {
      title: { type: 'string', minLength: 1, maxLength: 500 },
      isCompleted: { type: 'boolean' },
      sortOrder: { type: 'integer', minimum: 0 },
    },
    additionalProperties: false,
    minProperties: 1,
  },
  params: {
    type: 'object',
    required: ['workItemId', 'subtaskId'],
    properties: {
      workItemId: { type: 'string' },
      subtaskId: { type: 'string' },
    },
  },
};

// JSON schema for PATCH /api/work-items/:workItemId/subtasks/reorder (reorder subtasks)
const reorderSubtasksSchema = {
  body: {
    type: 'object',
    required: ['subtaskIds'],
    properties: {
      subtaskIds: {
        type: 'array',
        items: { type: 'string' },
        minItems: 1,
        maxItems: 1000,
      },
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

// JSON schema for path parameter validation (GET/DELETE)
const subtaskParamsSchema = {
  params: {
    type: 'object',
    required: ['workItemId'],
    properties: {
      workItemId: { type: 'string' },
    },
  },
};

const subtaskIdParamsSchema = {
  params: {
    type: 'object',
    required: ['workItemId', 'subtaskId'],
    properties: {
      workItemId: { type: 'string' },
      subtaskId: { type: 'string' },
    },
  },
};

export default async function subtaskRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/work-items/:workItemId/subtasks
   * Create a new subtask on a work item.
   * Auth required: Yes (both admin and member)
   */
  fastify.post<{ Params: { workItemId: string }; Body: CreateSubtaskRequest }>(
    '/',
    { schema: createSubtaskSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const subtask = subtaskService.createSubtask(
        fastify.db,
        request.params.workItemId,
        request.body,
      );
      return reply.status(201).send(subtask);
    },
  );

  /**
   * GET /api/work-items/:workItemId/subtasks
   * List all subtasks for a work item, sorted by sort_order ASC.
   * Auth required: Yes (both admin and member)
   */
  fastify.get<{ Params: { workItemId: string } }>(
    '/',
    { schema: subtaskParamsSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const subtasks = subtaskService.listSubtasks(fastify.db, request.params.workItemId);
      return reply.status(200).send({ subtasks });
    },
  );

  /**
   * PATCH /api/work-items/:workItemId/subtasks/reorder
   * Reorder subtasks by updating sort_order.
   * IMPORTANT: This route MUST be registered before /:subtaskId to avoid "reorder" being treated as an ID.
   * Auth required: Yes (both admin and member)
   */
  fastify.patch<{ Params: { workItemId: string }; Body: ReorderSubtasksRequest }>(
    '/reorder',
    { schema: reorderSubtasksSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const subtasks = subtaskService.reorderSubtasks(
        fastify.db,
        request.params.workItemId,
        request.body,
      );
      return reply.status(200).send({ subtasks });
    },
  );

  /**
   * PATCH /api/work-items/:workItemId/subtasks/:subtaskId
   * Update a subtask's title, isCompleted, and/or sortOrder.
   * Auth required: Yes (both admin and member)
   */
  fastify.patch<{ Params: { workItemId: string; subtaskId: string }; Body: UpdateSubtaskRequest }>(
    '/:subtaskId',
    { schema: updateSubtaskSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const subtask = subtaskService.updateSubtask(
        fastify.db,
        request.params.workItemId,
        request.params.subtaskId,
        request.body,
      );
      return reply.status(200).send(subtask);
    },
  );

  /**
   * DELETE /api/work-items/:workItemId/subtasks/:subtaskId
   * Delete a subtask.
   * Auth required: Yes (both admin and member)
   */
  fastify.delete<{ Params: { workItemId: string; subtaskId: string } }>(
    '/:subtaskId',
    { schema: subtaskIdParamsSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      subtaskService.deleteSubtask(fastify.db, request.params.workItemId, request.params.subtaskId);
      return reply.status(204).send();
    },
  );
}
